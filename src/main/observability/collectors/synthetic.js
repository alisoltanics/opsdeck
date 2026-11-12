'use strict';

/**
 * Synthetic monitoring: HTTP(S), TCP and DNS checks.
 *
 * Checks run from the main process only, never expose response bodies or auth
 * headers to the renderer, and honour the target's timeout. A failed check is
 * recorded as a real failure — there is no simulated availability.
 */

const http = require('node:http');
const https = require('node:https');
const net = require('node:net');
const dns = require('node:dns');
const tls = require('node:tls');
const { metric } = require('../metrics');
const { sanitizeText } = require('../util');

const MAX_REDIRECTS = 4;
const MAX_BODY = 512 * 1024;

function requestOnce(url, options) {
  return new Promise((resolve) => {
    let settled = false;
    const started = Date.now();
    let parsed;
    try { parsed = new URL(url); } catch {
      resolve({ ok: false, error: 'The URL is not valid.', durationMs: 0, at: started });
      return;
    }
    const transport = parsed.protocol === 'https:' ? https : http;
    const headers = { 'user-agent': 'OpsDeck-Monitor/1.0', accept: '*/*', ...(options.headers || {}) };
    const request = transport.request(parsed, {
      method: options.method || 'GET',
      headers,
      timeout: options.timeoutMs || 10000,
      rejectUnauthorized: options.rejectUnauthorized !== false,
      servername: parsed.hostname,
    }, (response) => {
      const chunks = [];
      let size = 0;
      const location = response.headers.location;
      response.on('data', (chunk) => {
        size += chunk.length;
        if (size <= MAX_BODY) chunks.push(chunk);
      });
      response.on('end', () => {
        if (settled) return;
        settled = true;
        const body = Buffer.concat(chunks).toString('utf8');
        const cert = response.socket && 'getPeerCertificate' in response.socket ? response.socket.getPeerCertificate() : null;
        resolve({
          ok: true,
          status: response.statusCode || 0,
          statusText: response.statusMessage || '',
          headers: response.headers,
          body,
          location: location || null,
          durationMs: Date.now() - started,
          certificate: cert && cert.valid_to ? {
            subject: cert.subject?.CN || '',
            issuer: cert.issuer?.CN || '',
            validFrom: cert.valid_from ? Date.parse(cert.valid_from) : null,
            validTo: cert.valid_to ? Date.parse(cert.valid_to) : null,
          } : null,
          at: started,
        });
      });
    });
    request.on('timeout', () => {
      if (settled) return;
      settled = true;
      request.destroy();
      resolve({ ok: false, error: `Timed out after ${options.timeoutMs || 10000} ms.`, durationMs: Date.now() - started, at: started });
    });
    request.on('error', (error) => {
      if (settled) return;
      settled = true;
      resolve({ ok: false, error: sanitizeText(error.code || error.message, 300), durationMs: Date.now() - started, at: started });
    });
    if (options.body) request.write(String(options.body).slice(0, 256 * 1024));
    request.end();
  });
}

async function httpCheck(target, secret) {
  const headers = { ...(target.headers || {}) };
  if (secret?.headerValue && target.headerName) headers[target.headerName] = secret.headerValue;
  if (secret?.token) headers.authorization = `Bearer ${secret.token}`;
  let url = target.url;
  let result = await requestOnce(url, {
    method: target.method || 'GET',
    headers,
    body: target.body || '',
    timeoutMs: target.timeoutMs || 10000,
    rejectUnauthorized: target.rejectUnauthorized !== false,
  });
  let redirects = 0;
  const chain = [url];
  while (result.ok && result.status >= 300 && result.status < 400 && result.location && redirects < MAX_REDIRECTS) {
    try { url = new URL(result.location, url).toString(); } catch { break; }
    chain.push(url);
    redirects += 1;
    result = await requestOnce(url, {
      method: 'GET', headers, timeoutMs: target.timeoutMs || 10000,
      rejectUnauthorized: target.rejectUnauthorized !== false,
    });
  }
  const expected = Array.isArray(target.expectedStatus) && target.expectedStatus.length
    ? target.expectedStatus.map(Number)
    : [200];
  const statusOk = result.ok && (expected.includes(result.status) || (expected.length === 1 && expected[0] === 200 && result.status >= 200 && result.status < 300));
  let bodyOk = true;
  let bodyError = '';
  if (target.bodyMatch) {
    try {
      const re = new RegExp(String(target.bodyMatch).slice(0, 500), 'i');
      bodyOk = re.test(result.body || '');
      if (!bodyOk) bodyError = 'The response did not match the configured body pattern.';
    } catch {
      bodyOk = false;
      bodyError = 'The body pattern is not a valid regular expression.';
    }
  }
  const ok = Boolean(statusOk && bodyOk && result.ok);
  const certificate = result.certificate || null;
  let certificateDays = null;
  if (certificate?.validTo) certificateDays = Math.floor((certificate.validTo - Date.now()) / 86400e3);
  return {
    ok,
    kind: target.kind || 'http',
    status: result.status || null,
    durationMs: result.durationMs,
    error: result.ok ? (statusOk ? bodyError : `Unexpected HTTP status ${result.status}.`) : result.error,
    expectedStatus: expected,
    bodyMatched: bodyOk,
    certificate,
    certificateDays,
    redirects,
    finalUrl: target.includeFinalUrl ? url : undefined,
    at: Date.now(),
  };
}

function tcpCheck(target) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok, error) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve({ ok, kind: 'tcp', durationMs: Date.now() - started, error: error || '', at: Date.now() });
    };
    socket.setTimeout(target.timeoutMs || 8000);
    socket.once('connect', () => finish(true, ''));
    socket.once('timeout', () => finish(false, `TCP connection timed out after ${target.timeoutMs || 8000} ms.`));
    socket.once('error', (error) => finish(false, sanitizeText(error.code || error.message, 200)));
    socket.connect(Number(target.port) || 80, target.host, () => {});
  });
}

function dnsCheck(target) {
  return new Promise((resolve) => {
    const started = Date.now();
    const type = String(target.recordType || 'A').toUpperCase();
    const resolver = dns.promises;
    const method = type === 'AAAA' ? 'resolve6' : type === 'MX' ? 'resolveMx' : type === 'TXT' ? 'resolveTxt' : type === 'CNAME' ? 'resolveCname' : 'resolve4';
    const run = resolver[method] ? resolver[method](target.host) : Promise.reject(new Error(`Record type ${type} is not supported.`));
    run.then((records) => {
      resolve({
        ok: records.length > 0,
        kind: 'dns',
        durationMs: Date.now() - started,
        records: records.slice(0, 20),
        error: records.length ? '' : 'No records were returned.',
        at: Date.now(),
      });
    }).catch((error) => {
      resolve({ ok: false, kind: 'dns', durationMs: Date.now() - started, records: [], error: sanitizeText(error.code || error.message, 200), at: Date.now() });
    });
  });
}

function tlsCheck(target) {
  return new Promise((resolve) => {
    const started = Date.now();
    const host = target.host || new URL(target.url).hostname;
    const port = Number(target.port) || 443;
    const socket = tls.connect({ host, port, servername: host, rejectUnauthorized: target.rejectUnauthorized !== false, timeout: target.timeoutMs || 10000 }, () => {
      const cert = socket.getPeerCertificate();
      const validTo = cert?.valid_to ? Date.parse(cert.valid_to) : null;
      const days = validTo ? Math.floor((validTo - Date.now()) / 86400e3) : null;
      const protocol = socket.getProtocol ? socket.getProtocol() : '';
      socket.end();
      resolve({
        ok: socket.authorized !== false, kind: 'tls', durationMs: Date.now() - started,
        certificate: cert ? { subject: cert.subject?.CN || '', issuer: cert.issuer?.CN || '', validFrom: cert.valid_from ? Date.parse(cert.valid_from) : null, validTo, protocol, authorized: socket.authorized !== false } : null,
        certificateDays: days, error: socket.authorized === false ? sanitizeText(socket.authorizationError, 200) : '', at: Date.now(),
      });
    });
    socket.once('timeout', () => { socket.destroy(); resolve({ ok: false, kind: 'tls', durationMs: Date.now() - started, error: 'TLS handshake timed out.', at: Date.now() }); });
    socket.once('error', (error) => resolve({ ok: false, kind: 'tls', durationMs: Date.now() - started, error: sanitizeText(error.code || error.message, 200), at: Date.now() }));
  });
}

class SyntheticCollector {
  constructor({ config, targets = [] } = {}) {
    this.name = 'synthetic';
    this.label = 'Website & API monitoring';
    this.source = 'synthetic';
    this.config = config || null;
    this.targets = targets;
    this.last = new Map();
    this.lastAt = 0;
    this.lastError = '';
    this.inFlight = false;
  }

  setTargets(targets) {
    this.targets = Array.isArray(targets) ? targets : [];
  }

  async collect(now = Date.now()) {
    const started = now;
    const metrics = [];
    const rows = [];
    const errors = [];

    if (this.inFlight) {
      return {
        ok: true, metrics: [], details: { at: new Date(now).toISOString(), targets: [...this.last.values()], skipped: 'A previous synthetic round is still running.' },
        errors: [], durationMs: 0, at: new Date(now).toISOString(),
      };
    }
    this.inFlight = true;
    try {
      const enabled = (this.targets || []).filter((target) => target && target.enabled !== false);
      const results = await Promise.all(enabled.map(async (target) => {
        const result = await this.check(target);
        const labels = {
          target: target.name, kind: target.kind || 'http',
          group: target.group || '', environment: target.environment || '',
        };
        const resource = `synthetic:${target.id}`;
        metrics.push(metric('synthetic.up', result.ok ? 1 : 0, { unit: 'count', source: this.source, resource, labels, timestamp: now }));
        metrics.push(metric('synthetic.response.ms', result.durationMs, { unit: 'milliseconds', source: this.source, resource, labels, timestamp: now }));
        if (result.status != null) metrics.push(metric('synthetic.http.status', result.status, { unit: 'count', source: this.source, resource, labels, timestamp: now }));
        if (result.certificateDays != null) {
          metrics.push(metric('synthetic.certificate.days', result.certificateDays, { unit: 'count', source: this.source, resource, labels, timestamp: now }));
        }
        if (!result.ok) metricFailure(metrics, resource, labels, now, this.source, result.error);
        return { ...target, secret: undefined, ...result, checkedAt: new Date(result.at || now).toISOString() };
      }));
      const rowsOut = results.map((entry) => {
        const { headers, body, ...rest } = entry;
        void headers; void body;
        return rest;
      });
      for (const row of rowsOut) this.last.set(row.id, { ...this.last.get(row.id), ...row });
      rows.push(...rowsOut);
      // Keep disabled targets in the inventory, clearly marked as disabled.
      for (const target of this.targets || []) {
        if (target.enabled !== false) continue;
        rows.push({ ...target, secret: undefined, ok: null, skipped: true, error: 'Monitoring is disabled for this target.', checkedAt: null });
      }
      const up = rows.filter((row) => row.ok === true).length;
      const down = rows.filter((row) => row.ok === false).length;
      metrics.push(metric('synthetic.targets.total', rows.length, { unit: 'count', source: this.source, resource: 'synthetic', labels: { host: 'local' }, timestamp: now }));
      metrics.push(metric('synthetic.targets.up', up, { unit: 'count', source: this.source, resource: 'synthetic', labels: { host: 'local' }, timestamp: now }));
      metrics.push(metric('synthetic.targets.down', down, { unit: 'count', source: this.source, resource: 'synthetic', labels: { host: 'local' }, timestamp: now }));
      this.lastAt = now;
      this.lastError = errors.join('; ');
      return {
        ok: true,
        metrics,
        details: {
          at: new Date(now).toISOString(),
          targets: rows.sort((a, b) => String(a.name).localeCompare(String(b.name))),
          summary: { total: rows.length, up, down, disabled: rows.filter((row) => row.skipped).length },
          errors,
        },
        errors,
        durationMs: Date.now() - now,
        at: new Date(now).toISOString(),
      };
    } finally {
      this.inFlight = false;
    }
  }

  async check(target) {
    const kind = String(target.kind || 'http').toLowerCase();
    try {
      if (kind === 'tcp') return await tcpCheck(target);
      if (kind === 'dns') return await dnsCheck(target);
      if (kind === 'tls') return await tlsCheck(target);
      return await httpCheck(target, target.secret || {});
    } catch (error) {
      return { ok: false, kind, durationMs: 0, error: sanitizeText(error.message || String(error), 300), at: Date.now() };
    }
  }

  setSecret(id, secret) {
    const target = this.targets.find((entry) => entry.id === id);
    if (target) target.secret = secret || {};
  }
}

function metricFailure(metrics, resource, labels, timestamp, source, reason) {
  void reason;
  metrics.push(metric('synthetic.failures', 1, { unit: 'count', source, resource, labels, timestamp }));
}

module.exports = { SyntheticCollector, __test: { httpCheck, tcpCheck, dnsCheck, tlsCheck } };
