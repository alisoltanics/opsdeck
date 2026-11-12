'use strict';

/**
 * Monitoring agent manager and OTLP/HTTP ingest receiver.
 *
 * The receiver binds to localhost by default, requires a bearer token for agent
 * pushes, caps request size, and stores nothing beyond the bounded log, trace
 * and metric stores. Agents can be revoked at any time.
 */

const http = require('node:http');
const https = require('node:https');
const fs = require('node:fs');
const crypto = require('node:crypto');
const { metric } = require('./metrics');
const { normalizeRecord } = require('./logs');
const { attributesToObject, anyValue } = require('./logs');
const { sanitizeText } = require('./util');

const MAX_BODY = 16 * 1024 * 1024;

function hashToken(token) {
  return crypto.createHash('sha256').update(String(token || '')).digest('hex');
}

function otlpMetrics(json) {
  const out = [];
  for (const resourceMetric of json?.resourceMetrics || []) {
    const resource = attributesToObject(resourceMetric.resource?.attributes);
    for (const scopeMetric of resourceMetric.scopeMetrics || []) {
      const scope = scopeMetric.scope || {};
      for (const entry of scopeMetric.metrics || []) {
        const name = String(entry.name || '').slice(0, 180);
        if (!name) continue;
        const points = entry.gauge?.dataPoints || entry.sum?.dataPoints || entry.histogram?.dataPoints || [];
        for (const point of points) {
          const attrs = { ...resource, ...attributesToObject(point.attributes), 'otel.scope.name': scope.name || '' };
          const timeNano = Number(point.timeUnixNano || 0);
          const timestamp = timeNano ? Math.floor(timeNano / 1e6) : Date.now();
          const labels = Object.fromEntries(Object.entries(attrs).filter(([, value]) => value != null && typeof value !== 'object'));
          if (entry.gauge || entry.sum) {
            const value = point.asDouble ?? point.asInt ?? anyValue(point.value);
            if (Number.isFinite(Number(value))) out.push(metric(name, Number(value), { unit: unitFor(name, entry.unit), source: 'otlp', resource: String(labels['service.name'] || 'otlp'), labels, timestamp, method: 'push' }));
          } else if (entry.histogram) {
            const count = Number(point.count) || 0;
            const sum = Number(point.sum) || 0;
            if (count) out.push(metric(`${name}.count`, count, { unit: 'count', source: 'otlp', resource: String(labels['service.name'] || 'otlp'), labels, timestamp, method: 'push' }));
            if (Number.isFinite(sum)) out.push(metric(`${name}.sum`, sum, { unit: unitFor(name, entry.unit), source: 'otlp', resource: String(labels['service.name'] || 'otlp'), labels, timestamp, method: 'push' }));
            if (count && Number.isFinite(sum)) out.push(metric(`${name}.avg`, sum / count, { unit: unitFor(name, entry.unit), source: 'otlp', resource: String(labels['service.name'] || 'otlp'), labels, timestamp, method: 'push' }));
          }
        }
      }
    }
  }
  return out;
}

function unitFor(name, unit) {
  const text = String(unit || '').toLowerCase();
  if (text === 'ms') return 'milliseconds';
  if (text === 's') return 'seconds';
  if (text === 'by' || text === 'bytes') return 'bytes';
  if (text === '%') return 'percent';
  if (/_ms$|\.ms$/.test(name)) return 'milliseconds';
  if (/(_bytes|\.bytes)/.test(name)) return 'bytes';
  return 'count';
}

function readBody(request) {
  return new Promise((resolve, reject) => {
    let size = 0;
    const chunks = [];
    request.on('data', (chunk) => {
      size += chunk.length;
      if (size > MAX_BODY) { reject(new Error('Request body is too large.')); request.destroy(); return; }
      chunks.push(chunk);
    });
    request.on('end', () => resolve(Buffer.concat(chunks).toString('utf8')));
    request.on('error', reject);
  });
}

function send(response, status, body, type = 'application/json') {
  const payload = typeof body === 'string' ? body : JSON.stringify(body);
  response.writeHead(status, { 'content-type': type, 'cache-control': 'no-store' });
  response.end(payload);
}

class AgentManager {
  constructor({ config, onSnapshot, onMetrics, onLogs, onTraces, logManager, traceManager }) {
    this.config = config;
    this.onSnapshot = onSnapshot || (() => {});
    this.onMetrics = onMetrics || (() => {});
    this.onLogs = onLogs || (() => {});
    this.onTraces = onTraces || (() => {});
    this.logManager = logManager;
    this.traceManager = traceManager;
    this.server = null;
    this.boundPort = null;
    this.error = '';
    this.startedAt = null;
    this.snapshots = new Map();
    this.requests = 0;
  }

  items() {
    return (this.config.get().agents.items || []).map((agent) => this.config.publicAgent({
      ...agent,
      lastSeen: agent.lastSeen || null,
      online: agent.lastSeen ? Date.now() - Date.parse(agent.lastSeen) < 120000 : false,
    }));
  }

  create(input = {}) {
    const token = crypto.randomBytes(32).toString('hex');
    const agent = {
      id: `agent-${crypto.randomUUID()}`,
      name: String(input.name || 'Monitoring agent').slice(0, 160),
      platform: String(input.platform || '').slice(0, 40),
      version: '',
      host: '',
      tokenHash: hashToken(token),
      createdAt: new Date().toISOString(),
      lastSeen: null,
      revoked: false,
    };
    this.config.get().agents.items.push(agent);
    this.config.save();
    return { ok: true, agent: this.config.publicAgent(agent), token };
  }

  revoke(id) {
    const agent = (this.config.get().agents.items || []).find((entry) => entry.id === id);
    if (!agent) return { ok: false, error: 'That agent was not found.' };
    agent.revoked = true;
    agent.revokedAt = new Date().toISOString();
    this.snapshots.delete(id);
    this.config.save();
    return { ok: true, agent: this.config.publicAgent(agent) };
  }

  remove(id) {
    this.config.get().agents.items = (this.config.get().agents.items || []).filter((entry) => entry.id !== id);
    this.snapshots.delete(id);
    this.config.save();
    return { ok: true };
  }

  verify(token) {
    const hash = hashToken(token);
    return (this.config.get().agents.items || []).find((agent) => !agent.revoked && agent.tokenHash === hash) || null;
  }

  snapshotFor(server) {
    if (!server?.agentId) return null;
    return this.snapshots.get(server.agentId) || null;
  }

  status() {
    return {
      enabled: this.config.get().agents.enabled === true,
      running: Boolean(this.server),
      port: this.boundPort,
      bind: this.config.get().agents.bind,
      tls: this.config.get().agents.tls === true,
      error: this.error,
      startedAt: this.startedAt,
      requests: this.requests,
      agents: this.items(),
    };
  }

  async start() {
    const config = this.config.get().agents;
    if (!config.enabled) return this.status();
    if (this.server) return this.status();
    const port = Number(config.port) || 8787;
    const bind = String(config.bind || '127.0.0.1');
    if (!/^(127\.0\.0\.1|::1|localhost|0\.0\.0\.0|\[::\])$/.test(bind)) {
      this.error = 'The ingest receiver can only bind to localhost or 0.0.0.0.';
      return this.status();
    }
    const handler = (request, response) => this.handle(request, response).catch((error) => {
      this.error = sanitizeText(error.message || String(error), 300);
      try { send(response, 500, { ok: false, error: 'The ingest request failed.' }); } catch { /* ignore */ }
    });
    let server;
    if (config.tls === true) {
      try {
        const cert = fs.readFileSync(String(config.certFile || ''));
        const key = fs.readFileSync(String(config.keyFile || ''));
        server = https.createServer({ cert, key, minVersion: 'TLSv1.2' }, handler);
      } catch (error) {
        this.error = `TLS is enabled but the certificate or key could not be read: ${error.message}`;
        return this.status();
      }
    } else {
      server = http.createServer(handler);
    }
    server.keepAliveTimeout = 30000;
    server.requestTimeout = 30000;
    try {
      await new Promise((resolve, reject) => {
        server.once('error', reject);
        server.listen(port, bind, () => resolve());
      });
      this.server = server;
      this.boundPort = server.address().port;
      this.startedAt = new Date().toISOString();
      this.error = '';
    } catch (error) {
      this.error = error.code === 'EADDRINUSE' ? `Port ${port} is already in use.` : error.message;
      try { server.close(); } catch { /* ignore */ }
    }
    return this.status();
  }

  async stop() {
    if (!this.server) return this.status();
    await new Promise((resolve) => this.server.close(() => resolve()));
    this.server = null;
    this.boundPort = null;
    this.startedAt = null;
    return this.status();
  }

  async handle(request, response) {
    this.requests += 1;
    const url = new URL(request.url || '/', `http://${request.headers.host || 'localhost'}`);
    if (request.method === 'GET' && (url.pathname === '/v1/health' || url.pathname === '/health')) {
      return send(response, 200, { ok: true, service: 'opsdeck-observability', time: new Date().toISOString() });
    }
    if (request.method !== 'POST') return send(response, 405, { ok: false, error: 'Use POST for ingest endpoints.' });

    if (url.pathname === '/v1/agent/snapshot') {
      const authorization = String(request.headers.authorization || '');
      const token = authorization.startsWith('Bearer ') ? authorization.slice(7) : '';
      const agent = this.verify(token);
      if (!agent) return send(response, 401, { ok: false, error: 'Agent token is missing or revoked.' });
      const text = await readBody(request);
      let data;
      try { data = JSON.parse(text); } catch { return send(response, 400, { ok: false, error: 'The snapshot is not valid JSON.' }); }
      if (!data || typeof data !== 'object') return send(response, 400, { ok: false, error: 'The snapshot is empty.' });
      const snapshot = normalizeAgentSnapshot(data);
      snapshot.at = new Date().toISOString();
      this.snapshots.set(agent.id, snapshot);
      agent.lastSeen = snapshot.at;
      agent.version = String(data.version || '').slice(0, 40);
      agent.host = String(snapshot.info?.hostname || data.host || '').slice(0, 160);
      agent.platform = String(data.platform || snapshot.info?.platform || '').slice(0, 40);
      this.config.save();
      this.onSnapshot(agent, snapshot);
      if (Array.isArray(data.metrics)) this.onMetrics(data.metrics);
      return send(response, 200, { ok: true, receivedAt: snapshot.at });
    }

    if (url.pathname === '/v1/otlp/traces' || url.pathname === '/v1/otlp/v1/traces') {
      const text = await readBody(request);
      let data;
      try { data = JSON.parse(text); } catch { return send(response, 415, { ok: false, error: 'OTLP/HTTP JSON is required. Protobuf payloads are not decoded by this receiver.' }); }
      const count = this.traceManager?.ingestOtlp(data) || 0;
      this.onTraces(count);
      return send(response, 200, { ok: true, spans: count });
    }
    if (url.pathname === '/v1/otlp/logs' || url.pathname === '/v1/otlp/v1/logs') {
      const text = await readBody(request);
      let data;
      try { data = JSON.parse(text); } catch { return send(response, 415, { ok: false, error: 'OTLP/HTTP JSON is required.' }); }
      const count = this.logManager?.ingestOtlp(data) || 0;
      this.onLogs(count);
      return send(response, 200, { ok: true, logs: count });
    }
    if (url.pathname === '/v1/otlp/metrics' || url.pathname === '/v1/otlp/v1/metrics') {
      const text = await readBody(request);
      let data;
      try { data = JSON.parse(text); } catch { return send(response, 415, { ok: false, error: 'OTLP/HTTP JSON is required.' }); }
      const metrics = otlpMetrics(data);
      this.onMetrics(metrics);
      return send(response, 200, { ok: true, metrics: metrics.length });
    }
    if (url.pathname === '/v1/ingest/logs') {
      const text = await readBody(request);
      let data;
      try { data = JSON.parse(text); } catch { return send(response, 400, { ok: false, error: 'Logs must be JSON.' }); }
      const records = (Array.isArray(data) ? data : [data]).map(normalizeRecord);
      const count = this.logManager?.ingest(records) || 0;
      this.onLogs(count);
      return send(response, 200, { ok: true, logs: count });
    }
    if (url.pathname === '/v1/ingest/metrics') {
      const text = await readBody(request);
      let data;
      try { data = JSON.parse(text); } catch { return send(response, 400, { ok: false, error: 'Metrics must be JSON.' }); }
      const list = Array.isArray(data) ? data : (data.metrics || [data]);
      this.onMetrics(list);
      return send(response, 200, { ok: true, metrics: list.length });
    }
    return send(response, 404, { ok: false, error: 'Unknown ingest endpoint.' });
  }
}

function normalizeAgentSnapshot(data) {
  const memory = data.memory || {};
  const total = Number(memory.total) || 0;
  const free = Number(memory.free) || 0;
  const available = Number(memory.available ?? free) || 0;
  return {
    version: String(data.version || '').slice(0, 40),
    info: {
      hostname: String(data.host || data.info?.hostname || '').slice(0, 160),
      platform: String(data.platform || data.info?.platform || '').slice(0, 40),
      os: String(data.info?.os || '').slice(0, 160),
      version: String(data.info?.version || '').slice(0, 120),
      kernel: String(data.info?.kernel || '').slice(0, 120),
      arch: String(data.info?.arch || '').slice(0, 40),
    },
    cpu: { ...data.cpu, usage: Number(data.cpu?.usage ?? data.cpu?.percent) || 0 },
    memory: { total, free, available, used: Number(memory.used) || Math.max(0, total - available), usage: total ? ((total - available) / total) * 100 : 0, swapTotal: Number(memory.swapTotal) || 0, swapUsed: Number(memory.swapUsed) || 0 },
    disks: (data.disks || []).slice(0, 100).map((disk) => ({
      device: String(disk.device || '').slice(0, 160), mount: String(disk.mount || '').slice(0, 240),
      filesystem: String(disk.filesystem || '').slice(0, 60), total: Number(disk.total) || 0,
      used: Number(disk.used) || 0, free: Number(disk.free) || 0, percent: Number(disk.percent) || 0,
    })),
    network: {
      interfaces: (data.network?.interfaces || []).slice(0, 100).map((entry) => ({
        name: String(entry.name || '').slice(0, 80), rxBytes: Number(entry.rxBytes) || 0, txBytes: Number(entry.txBytes) || 0,
        rxPackets: entry.rxPackets ?? null, txPackets: entry.txPackets ?? null,
        rxErrors: entry.rxErrors ?? null, txErrors: entry.txErrors ?? null,
        rxDropped: entry.rxDropped ?? null, txDropped: entry.txDropped ?? null,
        rxBytesPerSecond: entry.rxBytesPerSecond ?? null, txBytesPerSecond: entry.txBytesPerSecond ?? null,
      })),
      rxBytesPerSecond: data.network?.rxBytesPerSecond ?? null,
      txBytesPerSecond: data.network?.txBytesPerSecond ?? null,
    },
    processes: (data.processes || []).slice(0, 100).map((entry) => ({
      pid: Number(entry.pid) || 0, name: String(entry.name || '').slice(0, 160),
      user: String(entry.user || '').slice(0, 80), cpuPercent: Number(entry.cpuPercent) || 0,
      memoryBytes: Number(entry.memoryBytes) || 0, state: String(entry.state || '').slice(0, 40),
      startedAt: entry.startedAt || null, exe: String(entry.exe || '').slice(0, 300),
    })),
    uptimeSeconds: Number(data.uptimeSeconds) || null,
    missing: [],
  };
}

module.exports = { AgentManager, otlpMetrics, normalizeAgentSnapshot, hashToken };
