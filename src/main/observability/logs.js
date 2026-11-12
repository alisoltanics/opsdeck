'use strict';

/**
 * Central log manager.
 *
 * Records arrive from OTLP/HTTP, on-demand collectors (local journal, Docker,
 * Kubernetes, remote SSH) or integration pulls. Storage is bounded by the
 * configured retention, and every query is paginated in the main process.
 */

const { RecordStore } = require('./storage');
const { sanitizeText, run, powershell, parseJsonLines, which } = require('./util');
const { randomUUID } = require('node:crypto');

const LEVELS = ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'];

function normalizeLevel(value) {
  const text = String(value == null ? 'INFO' : value).trim().toUpperCase();
  if (LEVELS.includes(text)) return text;
  if (text === 'WARNING') return 'WARN';
  if (text === 'ERR' || text === 'SEVERE') return 'ERROR';
  if (text === 'CRITICAL' || text === 'CRIT') return 'FATAL';
  if (text === 'NOTICE') return 'INFO';
  const n = Number(text);
  if (Number.isFinite(n)) {
    if (n >= 21) return 'FATAL';
    if (n >= 17) return 'ERROR';
    if (n >= 13) return 'WARN';
    if (n >= 9) return 'INFO';
    if (n >= 5) return 'DEBUG';
    return 'TRACE';
  }
  return 'INFO';
}

function normalizeRecord(input = {}) {
  const text = sanitizeText(input.text ?? input.message ?? input.body ?? '', 16000);
  return {
    id: input.id || randomUUID(),
    timestamp: Number(input.timestamp) || Date.now(),
    level: normalizeLevel(input.level ?? input.severity),
    source: String(input.source || 'application').slice(0, 80),
    service: String(input.service || '').slice(0, 160),
    host: String(input.host || '').slice(0, 160),
    container: String(input.container || '').slice(0, 160),
    namespace: String(input.namespace || '').slice(0, 160),
    pod: String(input.pod || '').slice(0, 160),
    traceId: String(input.traceId || '').slice(0, 64),
    spanId: String(input.spanId || '').slice(0, 32),
    text,
    fields: input.fields && typeof input.fields === 'object' ? input.fields : {},
  };
}

function otlpLogs(json) {
  const out = [];
  for (const resourceLog of json?.resourceLogs || []) {
    const resource = attributesToObject(resourceLog.resource?.attributes);
    const service = resource['service.name'] || resource['service.namespace'] || '';
    const host = resource['host.name'] || '';
    for (const scopeLog of resourceLog.scopeLogs || []) {
      for (const record of scopeLog.logRecords || []) {
        const attrs = attributesToObject(record.attributes);
        const timeNano = Number(record.timeUnixNano || record.observedTimeUnixNano || 0);
        out.push(normalizeRecord({
          timestamp: timeNano ? Math.floor(timeNano / 1e6) : Date.now(),
          level: normalizeLevel(record.severityText || record.severityNumber),
          source: attrs['log.source'] || attrs['service.name'] || service || 'otlp',
          service: attrs['service.name'] || service,
          host: attrs['host.name'] || host,
          container: attrs['container.name'] || '',
          namespace: attrs['k8s.namespace.name'] || '',
          pod: attrs['k8s.pod.name'] || '',
          traceId: record.traceId || '',
          spanId: record.spanId || '',
          text: typeof record.body?.stringValue === 'string' ? record.body.stringValue : JSON.stringify(record.body || ''),
          fields: { ...resource, ...attrs },
        }));
      }
    }
  }
  return out;
}

function attributesToObject(list) {
  const out = {};
  for (const entry of Array.isArray(list) ? list : []) {
    if (!entry?.key) continue;
    out[entry.key] = anyValue(entry.value);
  }
  return out;
}

function anyValue(value) {
  if (!value || typeof value !== 'object') return value;
  if ('stringValue' in value) return value.stringValue;
  if ('boolValue' in value) return value.boolValue;
  if ('intValue' in value) return Number(value.intValue);
  if ('doubleValue' in value) return Number(value.doubleValue);
  if ('arrayValue' in value) return (value.arrayValue?.values || []).map(anyValue);
  if ('kvlistValue' in value) return attributesToObject(value.kvlistValue?.values);
  if ('bytesValue' in value) return String(value.bytesValue).slice(0, 4000);
  return '';
}

class LogManager {
  constructor({ file, maxRecords = 20000, retentionDays = 7, docker = null, kubernetes = null, getServer = null }) {
    this.store = new RecordStore({ file, maxRecords, retentionDays, kind: 'log' });
    this.docker = docker;
    this.kubernetes = kubernetes;
    this.getServer = getServer || (() => null);
  }

  configure(options = {}) {
    this.store.configure(options);
  }

  ingest(list) {
    const records = (Array.isArray(list) ? list : [list]).map(normalizeRecord);
    return this.store.add(records);
  }

  ingestOtlp(json) {
    return this.ingest(otlpLogs(json));
  }

  query(options = {}) {
    return this.store.query(options);
  }

  stats() {
    return this.store.stats();
  }

  clear() {
    this.store.clear();
  }

  persist(force = false) {
    return this.store.persist(force);
  }

  exportRows(options = {}) {
    const result = this.query({ ...options, limit: 2000, offset: 0 });
    return result.rows;
  }

  async collectLocal({ limit = 300, sinceMinutes = 15 } = {}) {
    const count = Math.max(10, Math.min(2000, Number(limit) || 300));
    const since = Math.max(1, Math.min(1440, Number(sinceMinutes) || 15));
    if (process.platform === 'linux' && which('journalctl')) {
      const result = await run('journalctl', ['-o', 'json', '--no-pager', '--since', `-${since}min`, '-n', String(count)], { timeout: 15000, maxBuffer: 8 * 1024 * 1024 });
      if (!result.ok) return { ok: false, error: sanitizeText(result.stderr || result.error, 400), added: 0 };
      const records = [];
      for (const line of parseJsonLines(result.stdout)) {
        const message = line.MESSAGE;
        const text = typeof message === 'string' ? message : Buffer.from(message || []).toString('utf8');
        const priority = Number(line.PRIORITY);
        records.push(normalizeRecord({
          timestamp: line.__REALTIME_TIMESTAMP ? Math.floor(Number(line.__REALTIME_TIMESTAMP) / 1000) : Date.now(),
          level: normalizeLevel(priority),
          source: 'local',
          service: line.SYSLOG_IDENTIFIER || line._COMM || 'systemd',
          host: line._HOSTNAME || '',
          text,
          fields: { unit: line._SYSTEMD_UNIT || '', pid: line._PID || '', syslog: line.SYSLOG_IDENTIFIER || '' },
        }));
      }
      this.ingest(records);
      return { ok: true, added: records.length, source: 'journalctl' };
    }
    if (process.platform === 'win32') {
      const script = `Get-WinEvent -MaxEvents ${count} | Select-Object TimeCreated,LevelDisplayName,ProviderName,Message | ConvertTo-Json -Compress`;
      const result = await powershell(script, 20000);
      let parsed = [];
      try { parsed = result.stdout.trim() ? JSON.parse(result.stdout) : []; } catch { parsed = []; }
      const list = Array.isArray(parsed) ? parsed : [parsed];
      const records = list.map((entry) => normalizeRecord({
        timestamp: entry.TimeCreated ? Date.parse(entry.TimeCreated) : Date.now(),
        level: normalizeLevel(entry.LevelDisplayName),
        source: 'local', service: entry.ProviderName || 'Windows',
        text: entry.Message || '',
      }));
      this.ingest(records);
      return { ok: true, added: records.length, source: 'Windows Event Log' };
    }
    const result = await run('log', ['show', '--last', `${since}m`, '--style', 'json', '--info'], { timeout: 20000, maxBuffer: 8 * 1024 * 1024 });
    if (!result.ok) return { ok: false, error: sanitizeText(result.stderr || result.error, 400), added: 0 };
    const records = [];
    for (const line of parseJsonLines(result.stdout)) {
      records.push(normalizeRecord({
        timestamp: line.timestamp ? Date.parse(line.timestamp) : Date.now(),
        level: normalizeLevel(line.eventMessage || line.messageType),
        source: 'local', service: line.processImagePath || 'macOS',
        text: line.eventMessage || '',
      }));
    }
    this.ingest(records);
    return { ok: true, added: records.length, source: 'macOS unified log' };
  }

  async collectDocker(containerId, { tail = 300 } = {}) {
    if (!this.docker) return { ok: false, error: 'Docker is not available.', added: 0 };
    const inspect = await this.docker.inspectContainer(containerId);
    if (!inspect.ok) return { ok: false, error: inspect.error, added: 0 };
    const result = await this.docker.containerLogs(containerId, tail);
    if (!result.ok && !result.stdout) return { ok: false, error: result.stderr || 'Could not read container logs.', added: 0 };
    const records = [];
    for (const line of String(result.stdout || '').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const match = /^(\S+)\s+(.*)$/.exec(line);
      const timestamp = match && Number.isFinite(Date.parse(match[1])) ? Date.parse(match[1]) : Date.now();
      const text = match ? match[2] : line;
      records.push(normalizeRecord({
        timestamp, level: levelFromText(text), source: 'docker',
        service: inspect.item.name, container: inspect.item.name,
        text, fields: { image: inspect.item.image },
      }));
    }
    this.ingest(records);
    return { ok: true, added: records.length, source: `docker:${inspect.item.name}` };
  }

  async collectKubernetes({ pod, namespace, container = '', tail = 300 } = {}) {
    if (!this.kubernetes) return { ok: false, error: 'Kubernetes is not available.', added: 0 };
    if (!pod || !namespace) return { ok: false, error: 'A pod and namespace are required.', added: 0 };
    const result = await this.kubernetes.podLogs({ name: pod, namespace, container, tailLines: tail });
    if (!result.ok) return { ok: false, error: result.error || 'Could not read pod logs.', added: 0 };
    const records = [];
    for (const line of String(result.stdout || '').split(/\r?\n/)) {
      if (!line.trim()) continue;
      const match = /^(\S+)\s+(.*)$/.exec(line);
      const timestamp = match && Number.isFinite(Date.parse(match[1])) ? Date.parse(match[1]) : Date.now();
      const text = match ? match[2] : line;
      records.push(normalizeRecord({
        timestamp, level: levelFromText(text), source: 'kubernetes',
        service: pod, namespace, pod, container, text,
      }));
    }
    this.ingest(records);
    return { ok: true, added: records.length, source: `k8s:${namespace}/${pod}` };
  }

  async collectRemote(serverId, { unit = '', sinceMinutes = 15, limit = 300 } = {}) {
    const server = this.getServer(serverId);
    if (!server) return { ok: false, error: 'That server was not found.', added: 0 };
    if (server.method && server.method !== 'ssh') return { ok: false, error: 'Log collection from this server method is not supported; use an integration.', added: 0 };
    const host = String(server.host || '');
    if (!/^[A-Za-z0-9._:-]{1,253}$/.test(host)) return { ok: false, error: 'The server host is not valid.', added: 0 };
    const args = ['-o', 'BatchMode=yes', '-o', 'StrictHostKeyChecking=accept-new', '-o', 'ConnectTimeout=8', '-p', String(server.port || 22)];
    if (server.secret?.privateKey) {
      const fs = require('node:fs');
      const os = require('node:os');
      const path = require('node:path');
      const file = path.join(os.tmpdir(), `opsdeck-obs-log-${randomUUID()}.key`);
      fs.writeFileSync(file, server.secret.privateKey, { mode: 0o600 });
      args.push('-i', file, '-o', 'IdentitiesOnly=yes');
      this._remoteKey = file;
    }
    const command = unit
      ? `journalctl -u ${JSON.stringify(String(unit))} -o json --no-pager --since -${Math.max(1, Number(sinceMinutes) || 15)}min -n ${Math.max(10, Math.min(2000, Number(limit) || 300))}`
      : `journalctl -o json --no-pager --since -${Math.max(1, Number(sinceMinutes) || 15)}min -n ${Math.max(10, Math.min(2000, Number(limit) || 300))}`;
    args.push(`${server.username ? `${server.username}@` : ''}${host}`, 'sh', '-c', command);
    let result;
    try {
      result = await run('ssh', args, { timeout: 25000, maxBuffer: 8 * 1024 * 1024 });
    } finally {
      if (this._remoteKey) { try { require('node:fs').unlinkSync(this._remoteKey); } catch { /* ignore */ } this._remoteKey = ''; }
    }
    if (!result.ok && !result.stdout) return { ok: false, error: sanitizeText(result.stderr || result.error, 400), added: 0 };
    const records = [];
    for (const line of parseJsonLines(result.stdout)) {
      const message = line.MESSAGE;
      const text = typeof message === 'string' ? message : Buffer.from(message || []).toString('utf8');
      records.push(normalizeRecord({
        timestamp: line.__REALTIME_TIMESTAMP ? Math.floor(Number(line.__REALTIME_TIMESTAMP) / 1000) : Date.now(),
        level: normalizeLevel(Number(line.PRIORITY)),
        source: 'remote', host, service: line.SYSLOG_IDENTIFIER || line._COMM || 'systemd', text,
      }));
    }
    this.ingest(records);
    return { ok: true, added: records.length, source: `remote:${server.name}` };
  }
}

function levelFromText(text) {
  const source = String(text || '');
  if (/\b(FATAL|CRITICAL|panic)\b/i.test(source)) return 'FATAL';
  if (/\b(ERROR|ERR|exception|failed|failure)\b/i.test(source)) return 'ERROR';
  if (/\b(WARN|WARNING)\b/i.test(source)) return 'WARN';
  if (/\b(DEBUG)\b/i.test(source)) return 'DEBUG';
  if (/\b(TRACE)\b/i.test(source)) return 'TRACE';
  return 'INFO';
}

module.exports = {
  LogManager, normalizeRecord, normalizeLevel, otlpLogs, attributesToObject, anyValue, LEVELS,
  __test: { levelFromText },
};
