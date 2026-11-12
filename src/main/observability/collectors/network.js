'use strict';

/**
 * Network observability collector.
 *
 * Measures latency, packet loss, DNS resolution and TCP reachability from the
 * local machine, and optionally polls SNMP v2c devices. Directly measured
 * values are kept distinct from inferred fields (rates need two samples).
 */

const dgram = require('node:dgram');
const dns = require('node:dns');
const net = require('node:net');
const { metric } = require('../metrics');
const { run, sanitizeText } = require('../util');

function parsePing(text) {
  const source = String(text || '');
  let packetLoss = null;
  let avg = null;
  let min = null;
  let max = null;
  const lossMatch = /(\d+(?:\.\d+)?)%\s*(?:packet\s*)?loss/i.exec(source);
  if (lossMatch) packetLoss = Number(lossMatch[1]);
  const rtt = /(?:rtt|round-trip)\s+min\/avg\/max(?:\/(?:mdev|stddev))?\s*=\s*([\d.]+)\/([\d.]+)\/([\d.]+)/i.exec(source);
  if (rtt) { min = Number(rtt[1]); avg = Number(rtt[2]); max = Number(rtt[3]); }
  if (avg == null) {
    const timeMatch = /time[=<]\s*([\d.]+)\s*ms/i.exec(source);
    if (timeMatch) avg = Number(timeMatch[1]);
  }
  return { packetLoss, avg, min, max };
}

async function pingHost(host, count = 4, timeoutMs = 6000) {
  const platform = process.platform;
  const args = platform === 'win32'
    ? ['-n', String(count), '-w', '2000', host]
    : platform === 'darwin'
      ? ['-c', String(count), '-W', '2000', host]
      : ['-c', String(count), '-W', '2', host];
  const result = await run('ping', args, { timeout: timeoutMs });
  const parsed = parsePing(result.stdout);
  return {
    ok: result.ok && (parsed.packetLoss == null || parsed.packetLoss < 100),
    ...parsed,
    error: result.ok ? '' : sanitizeText(result.stderr || result.error || 'Ping failed.', 200),
  };
}

function tcpConnect(host, port, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const socket = new net.Socket();
    let settled = false;
    const finish = (ok, error) => {
      if (settled) return;
      settled = true;
      try { socket.destroy(); } catch { /* ignore */ }
      resolve({ ok, latencyMs: Date.now() - started, error: error || '' });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => finish(true, ''));
    socket.once('timeout', () => finish(false, `Timed out after ${timeoutMs} ms.`));
    socket.once('error', (error) => finish(false, sanitizeText(error.code || error.message, 200)));
    socket.connect(port, host);
  });
}

function dnsLookup(host, timeoutMs = 5000) {
  return new Promise((resolve) => {
    const started = Date.now();
    const timer = setTimeout(() => resolve({ ok: false, latencyMs: Date.now() - started, error: 'DNS lookup timed out.' }), timeoutMs);
    dns.lookup(host, { all: true }, (error, addresses) => {
      clearTimeout(timer);
      resolve({
        ok: !error,
        latencyMs: Date.now() - started,
        addresses: (addresses || []).map((entry) => entry.address).slice(0, 10),
        error: error ? sanitizeText(error.code || error.message, 200) : '',
      });
    });
  });
}

// ---------------------------------------------------------------- SNMP v2c

function encodeLength(length) {
  if (length < 128) return Buffer.from([length]);
  const bytes = [];
  let value = length;
  while (value > 0) { bytes.unshift(value & 0xff); value >>= 8; }
  return Buffer.from([0x80 | bytes.length, ...bytes]);
}

function encodeTlv(tag, value) {
  const body = Buffer.isBuffer(value) ? value : Buffer.from(value);
  return Buffer.concat([Buffer.from([tag]), encodeLength(body.length), body]);
}

function encodeInteger(value) {
  const bytes = [];
  let v = Math.trunc(Number(value) || 0);
  if (v === 0) bytes.push(0);
  while (v > 0) { bytes.unshift(v & 0xff); v = Math.floor(v / 256); }
  if (bytes[0] & 0x80) bytes.unshift(0);
  return encodeTlv(0x02, Buffer.from(bytes));
}

function encodeOid(oid) {
  const parts = String(oid).split('.').map(Number);
  const bytes = [parts[0] * 40 + parts[1]];
  for (const part of parts.slice(2)) {
    const stack = [part & 0x7f];
    let value = Math.floor(part / 128);
    while (value > 0) { stack.unshift((value & 0x7f) | 0x80); value = Math.floor(value / 128); }
    bytes.push(...stack);
  }
  return encodeTlv(0x06, Buffer.from(bytes));
}

function snmpRequest(host, community, oids, { port = 161, timeoutMs = 4000 } = {}) {
  return new Promise((resolve) => {
    const socket = dgram.createSocket('udp4');
    let settled = false;
    const finish = (result) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      try { socket.close(); } catch { /* ignore */ }
      resolve(result);
    };
    const timer = setTimeout(() => finish({ ok: false, error: `SNMP request timed out after ${timeoutMs} ms.` }), timeoutMs);
    socket.once('error', (error) => finish({ ok: false, error: sanitizeText(error.message, 200) }));
    socket.once('message', (message) => {
      try {
        finish({ ok: true, values: decodeSnmpResponse(message, oids) });
      } catch (error) {
        finish({ ok: false, error: `SNMP response could not be decoded: ${error.message}` });
      }
    });
    const varbinds = Buffer.concat(oids.map((oid) => encodeTlv(0x30, Buffer.concat([encodeOid(oid), encodeTlv(0x05, Buffer.alloc(0))]))));
    const pdu = encodeTlv(0xa0, Buffer.concat([
      encodeInteger(Math.floor(Math.random() * 0x7fffffff)),
      encodeInteger(0), encodeInteger(0),
      encodeTlv(0x30, varbinds),
    ]));
    const packet = encodeTlv(0x30, Buffer.concat([encodeInteger(1), encodeTlv(0x04, Buffer.from(String(community || 'public'))), pdu]));
    try { socket.send(packet, port, host); } catch (error) { finish({ ok: false, error: sanitizeText(error.message, 200) }); }
  });
}

function readTlv(buffer, offset) {
  const tag = buffer[offset];
  let length = buffer[offset + 1];
  let cursor = offset + 2;
  if (length & 0x80) {
    const count = length & 0x7f;
    length = 0;
    for (let i = 0; i < count; i += 1) length = (length << 8) | buffer[cursor + i];
    cursor += count;
  }
  return { tag, length, start: cursor, end: cursor + length, next: cursor + length };
}

function decodeSnmpResponse(buffer, oids) {
  const message = readTlv(buffer, 0);
  let cursor = message.start;
  const version = readTlv(buffer, cursor); cursor = version.next;
  const community = readTlv(buffer, cursor); cursor = community.next;
  const pdu = readTlv(buffer, cursor); cursor = pdu.start;
  const id = readTlv(buffer, cursor); cursor = id.next;
  const errStatus = readTlv(buffer, cursor); cursor = errStatus.next;
  const errIndex = readTlv(buffer, cursor); cursor = errIndex.next;
  const varbindList = readTlv(buffer, cursor);
  const values = [];
  let inner = varbindList.start;
  while (inner < varbindList.end) {
    const varbind = readTlv(buffer, inner);
    let vbCursor = varbind.start;
    const oid = readTlv(buffer, vbCursor); vbCursor = oid.next;
    const value = readTlv(buffer, vbCursor);
    const oidText = decodeOid(buffer.slice(oid.start, oid.end));
    const decoded = decodeSnmpValue(buffer.slice(value.start, value.end), value.tag);
    values.push({ oid: oidText, type: value.tag, value: decoded });
    inner = varbind.next;
  }
  const errorStatus = Number(errStatus.length ? buffer[errStatus.start] : 0);
  return { errorStatus, errorIndex: errIndex.length ? buffer[errIndex.start] : 0, values };
}

function decodeOid(buffer) {
  const first = buffer[0];
  const parts = [Math.floor(first / 40), first % 40];
  let value = 0;
  for (const byte of buffer.slice(1)) {
    value = value * 128 + (byte & 0x7f);
    if (!(byte & 0x80)) { parts.push(value); value = 0; }
  }
  return parts.join('.');
}

function decodeSnmpValue(buffer, tag) {
  if (tag === 0x04) return buffer.toString('utf8');
  if (tag === 0x02) {
    let value = 0;
    for (const byte of buffer) value = value * 256 + byte;
    return value;
  }
  if (tag === 0x41 || tag === 0x42 || tag === 0x43 || tag === 0x46) {
    let value = 0;
    for (const byte of buffer) value = value * 256 + byte;
    return tag === 0x43 ? value * 100 : value;
  }
  if (tag === 0x40) return buffer.toString('hex');
  return buffer.toString('hex');
}

const SNMP_OIDS = {
  sysUpTime: '1.3.6.1.2.1.1.3.0',
  sysName: '1.3.6.1.2.1.1.5.0',
  sysDescr: '1.3.6.1.2.1.1.1.0',
  ifNumber: '1.3.6.1.2.1.2.1.0',
};

class NetworkCollector {
  constructor({ getChecks, getDevices }) {
    this.name = 'network';
    this.label = 'Network';
    this.source = 'network';
    this.getChecks = getChecks || (() => []);
    this.getDevices = getDevices || (() => []);
    this.lastAt = 0;
    this.lastError = '';
    this.inFlight = false;
  }

  async collect(now = Date.now()) {
    const started = now;
    const metrics = [];
    const errors = [];
    const checks = [];
    if (this.inFlight) {
      return { ok: true, metrics: [], details: { at: new Date(now).toISOString(), checks: [], devices: [], skipped: 'A previous network round is still running.' }, errors: [], durationMs: 0, at: new Date(now).toISOString() };
    }
    this.inFlight = true;
    try {
      const configured = (this.getChecks() || []).filter((check) => check.enabled !== false);
      const results = await Promise.all(configured.map(async (check) => {
        const kind = String(check.kind || 'ping').toLowerCase();
        const resource = `network:${check.id}`;
        const labels = { check: check.name, kind, group: check.group || '', host: check.host || '' };
        let result;
        if (kind === 'tcp') result = await tcpConnect(check.host, Number(check.port) || 80, check.timeoutMs || 5000);
        else if (kind === 'dns') result = await dnsLookup(check.host, check.timeoutMs || 5000);
        else result = await pingHost(check.host, check.count || 4, check.timeoutMs || 6000);
        metrics.push(metric('network.check.up', result.ok ? 1 : 0, { unit: 'count', source: this.source, resource, labels, timestamp: now }));
        if (result.latencyMs != null) metrics.push(metric('network.check.latency_ms', result.latencyMs, { unit: 'milliseconds', source: this.source, resource, labels, timestamp: now }));
        if (result.avg != null) metrics.push(metric('network.check.latency_ms', result.avg, { unit: 'milliseconds', source: this.source, resource, labels, timestamp: now }));
        if (result.packetLoss != null) metrics.push(metric('network.check.packet_loss', result.packetLoss, { unit: 'percent', source: this.source, resource, labels, timestamp: now }));
        if (!result.ok) errors.push(`${check.name}: ${result.error || 'check failed'}`);
        return { ...check, ...result, checkedAt: new Date(now).toISOString(), at: undefined };
      }));
      checks.push(...results);

      const devices = [];
      for (const device of this.getDevices() || []) {
        if (!device || device.enabled === false) continue;
        const resource = `snmp:${device.id}`;
        const labels = { device: device.name, host: device.host, version: 'v2c' };
        const result = await snmpRequest(device.host, device.community || 'public', Object.values(SNMP_OIDS), { port: device.port || 161, timeoutMs: device.timeoutMs || 4000 });
        if (!result.ok) {
          errors.push(`${device.name}: ${result.error}`);
          metrics.push(metric('snmp.up', 0, { unit: 'count', source: this.source, resource, labels, timestamp: now }));
          devices.push({ ...device, community: undefined, ok: false, error: result.error });
          continue;
        }
        const get = (name) => result.values.values ? null : null;
        void get;
        const values = (result.values.values || []);
        const byOid = new Map(values.map((entry) => [entry.oid, entry.value]));
        const uptimeTicks = Number(byOid.get(SNMP_OIDS.sysUpTime)) || 0;
        metrics.push(metric('snmp.up', 1, { unit: 'count', source: this.source, resource, labels, timestamp: now }));
        metrics.push(metric('snmp.uptime.seconds', uptimeTicks / 100, { unit: 'seconds', source: this.source, resource, labels, timestamp: now }));
        if (byOid.get(SNMP_OIDS.ifNumber) != null) metrics.push(metric('snmp.interfaces', Number(byOid.get(SNMP_OIDS.ifNumber)), { unit: 'count', source: this.source, resource, labels, timestamp: now }));
        devices.push({
          ...device, community: undefined, ok: true,
          name: byOid.get(SNMP_OIDS.sysName) || device.name,
          description: byOid.get(SNMP_OIDS.sysDescr) || '',
          uptimeSeconds: uptimeTicks / 100,
          interfaces: Number(byOid.get(SNMP_OIDS.ifNumber)) || null,
          values,
        });
      }

      metrics.push(metric('network.checks.total', checks.length, { unit: 'count', source: this.source, resource: 'network', labels: { host: 'local' }, timestamp: now }));
      metrics.push(metric('network.checks.failed', checks.filter((check) => !check.ok).length, { unit: 'count', source: this.source, resource: 'network', labels: { host: 'local' }, timestamp: now }));
      metrics.push(metric('network.devices.total', devices.length, { unit: 'count', source: this.source, resource: 'network', labels: { host: 'local' }, timestamp: now }));
      this.lastAt = now;
      this.lastError = errors.join('; ');
      return {
        ok: true,
        metrics,
        details: {
          at: new Date(now).toISOString(), checks, devices, errors,
          note: 'Network rates are measured from interface counters; latency and loss are direct active probes.',
        },
        errors,
        durationMs: Date.now() - started,
        at: new Date(now).toISOString(),
      };
    } finally {
      this.inFlight = false;
    }
  }
}

module.exports = { NetworkCollector, __test: { parsePing, pingHost, tcpConnect, dnsLookup, snmpRequest, encodeOid, decodeOid } };
