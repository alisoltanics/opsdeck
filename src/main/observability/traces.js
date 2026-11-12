'use strict';

/**
 * Distributed trace manager.
 *
 * Accepts OTLP/HTTP JSON spans (the format emitted by OpenTelemetry SDKs and
 * collectors) and keeps a bounded local trace buffer. No trace is fabricated:
 * a service with no spans is reported as not instrumented.
 */

const { RecordStore } = require('./storage');
const { randomUUID } = require('node:crypto');
const { attributesToObject, anyValue } = require('./logs');

function toMillis(nano) {
  const n = Number(nano);
  return Number.isFinite(n) && n > 0 ? Math.floor(n / 1e6) : Date.now();
}

function kindName(kind) {
  const value = typeof kind === 'string' ? kind : String(kind || '');
  if (/SPAN_KIND_SERVER|^2$/.test(value)) return 'server';
  if (/SPAN_KIND_CLIENT|^3$/.test(value)) return 'client';
  if (/SPAN_KIND_PRODUCER|^4$/.test(value)) return 'producer';
  if (/SPAN_KIND_CONSUMER|^5$/.test(value)) return 'consumer';
  if (/SPAN_KIND_INTERNAL|^1$/.test(value)) return 'internal';
  return 'unspecified';
}

function statusError(status) {
  if (!status) return false;
  const code = typeof status.code === 'string' ? status.code : String(status.code || '');
  return /STATUS_CODE_ERROR|^2$/.test(code) || Boolean(status.message);
}

function normalizeSpan(input, resource = {}) {
  const span = input || {};
  const attrs = { ...resource, ...attributesToObject(span.attributes) };
  const start = toMillis(span.startTimeUnixNano);
  const end = toMillis(span.endTimeUnixNano || span.startTimeUnixNano);
  const durationMs = Math.max(0, end - start);
  const operation = attrs['http.route'] || attrs['http.target'] || span.name || 'operation';
  const statusCode = attrs['http.status_code'] || attrs['http.response.status_code'] || attrs['rpc.grpc.status_code'] || null;
  return {
    id: span.spanId || randomUUID().slice(0, 16),
    traceId: span.traceId || randomUUID().replace(/-/g, ''),
    parentId: span.parentSpanId || '',
    name: String(span.name || 'span').slice(0, 300),
    operation: String(operation).slice(0, 300),
    service: String(attrs['service.name'] || attrs['service.namespace'] || 'unknown-service').slice(0, 160),
    serviceVersion: String(attrs['service.version'] || '').slice(0, 80),
    runtime: String(attrs['telemetry.sdk.language'] || attrs['process.runtime.name'] || '').slice(0, 80),
    host: String(attrs['host.name'] || '').slice(0, 160),
    kind: kindName(span.kind),
    timestamp: start,
    endTimestamp: end,
    durationMs,
    statusCode: statusCode == null ? null : Number(statusCode),
    statusMessage: String(span.status?.message || '').slice(0, 500),
    error: statusError(span.status) || (statusCode != null && Number(statusCode) >= 500) || attrs.error === true || attrs.error === 'true',
    peerService: String(attrs['peer.service'] || attrs['server.address'] || '').slice(0, 160),
    dependency: String(attrs['db.system'] || attrs['messaging.system'] || attrs['rpc.system'] || '').slice(0, 160),
    attributes: sanitizeAttributes(attrs),
  };
}

function sanitizeAttributes(attrs) {
  const out = {};
  for (const [key, value] of Object.entries(attrs || {})) {
    if (/password|secret|token|authorization|api[_-]?key|credential/i.test(key)) { out[key] = '••••'; continue; }
    if (value == null) continue;
    if (typeof value === 'object') out[key] = JSON.stringify(value).slice(0, 1000);
    else out[key] = String(value).slice(0, 1000);
  }
  return out;
}

function otlpSpans(json) {
  const out = [];
  for (const resourceSpan of json?.resourceSpans || []) {
    const resource = attributesToObject(resourceSpan.resource?.attributes);
    for (const scopeSpan of resourceSpan.scopeSpans || []) {
      const scope = scopeSpan.scope || {};
      for (const span of scopeSpan.spans || []) {
        const normalized = normalizeSpan(span, { ...resource, 'otel.scope.name': scope.name || '' });
        out.push(normalized);
      }
    }
  }
  return out;
}

class TraceManager {
  constructor({ file, maxRecords = 5000, retentionDays = 7, logManager = null }) {
    this.store = new RecordStore({ file, maxRecords, retentionDays, kind: 'trace' });
    this.logManager = logManager;
  }

  configure(options = {}) {
    this.store.configure(options);
  }

  ingest(list) {
    return this.store.add((Array.isArray(list) ? list : [list]).map((span) => normalizeSpan(span, {})));
  }

  ingestOtlp(json) {
    return this.ingest(otlpSpans(json));
  }

  persist(force = false) {
    return this.store.persist(force);
  }

  clear() {
    this.store.clear();
  }

  stats() {
    return this.store.stats();
  }

  all() {
    return this.store.items;
  }

  query(options = {}) {
    const now = Date.now();
    const to = Number(options.to) || now;
    const from = Number(options.from) || now - 3600e3;
    const service = String(options.service || '');
    const minDuration = Number(options.minDurationMs) || 0;
    const maxDuration = Number(options.maxDurationMs) || Infinity;
    const errorsOnly = options.errors === true;
    const search = String(options.search || '').toLowerCase();
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 50));
    const offset = Math.max(0, Number(options.offset) || 0);

    const byTrace = new Map();
    for (const span of this.store.items) {
      if (span.timestamp < from || span.timestamp > to) continue;
      if (service && span.service !== service) continue;
      if (errorsOnly && !span.error) continue;
      const entry = byTrace.get(span.traceId) || { traceId: span.traceId, spans: [], services: new Set(), errors: 0, root: null };
      entry.spans.push(span);
      entry.services.add(span.service);
      if (span.error) entry.errors += 1;
      if (!entry.root || (!span.parentId && span.timestamp < entry.root.timestamp)) entry.root = span;
      byTrace.set(span.traceId, entry);
    }
    const traces = [];
    for (const entry of byTrace.values()) {
      const root = entry.root || entry.spans[0];
      const start = Math.min(...entry.spans.map((span) => span.timestamp));
      const end = Math.max(...entry.spans.map((span) => span.endTimestamp || span.timestamp));
      const durationMs = Math.max(0, end - start);
      if (durationMs < minDuration || durationMs > maxDuration) continue;
      if (search) {
        const haystack = `${entry.traceId} ${root.name} ${[...entry.services].join(' ')}`.toLowerCase();
        if (!haystack.includes(search)) continue;
      }
      traces.push({
        traceId: entry.traceId,
        name: root.name,
        service: root.service,
        services: [...entry.services].sort(),
        timestamp: start,
        durationMs,
        spans: entry.spans.length,
        errors: entry.errors,
        status: entry.errors ? 'error' : 'ok',
        startTime: new Date(start).toISOString(),
      });
    }
    traces.sort((a, b) => b.timestamp - a.timestamp);
    return {
      ok: true, from, to,
      total: traces.length,
      rows: traces.slice(offset, offset + limit),
      offset, limit,
    };
  }

  get(traceId) {
    const id = String(traceId || '');
    const spans = this.store.items.filter((span) => span.traceId === id);
    if (!spans.length) return { ok: false, error: 'That trace is not in the local retention window.' };
    const start = Math.min(...spans.map((span) => span.timestamp));
    const byId = new Map(spans.map((span) => [span.id, span]));
    const roots = spans.filter((span) => !span.parentId || !byId.has(span.parentId));
    const children = new Map();
    for (const span of spans) {
      if (!span.parentId || !byId.has(span.parentId)) continue;
      if (!children.has(span.parentId)) children.set(span.parentId, []);
      children.get(span.parentId).push(span);
    }
    const rows = [];
    const visit = (span, depth) => {
      rows.push({
        ...span,
        depth,
        offsetMs: span.timestamp - start,
        endOffsetMs: (span.endTimestamp || span.timestamp) - start,
      });
      for (const child of (children.get(span.id) || []).sort((a, b) => a.timestamp - b.timestamp)) visit(child, depth + 1);
    };
    for (const root of roots.sort((a, b) => a.timestamp - b.timestamp)) visit(root, 0);
    const durationMs = Math.max(0, Math.max(...spans.map((span) => span.endTimestamp || span.timestamp)) - start);
    const errors = spans.filter((span) => span.error).length;
    const logs = this.logManager
      ? this.logManager.query({ search: id, limit: 200 }).rows
      : [];
    return {
      ok: true,
      trace: {
        traceId: id,
        startTime: new Date(start).toISOString(),
        durationMs,
        spanCount: spans.length,
        errors,
        services: [...new Set(spans.map((span) => span.service))].sort(),
      },
      spans: rows,
      logs,
    };
  }

  services() {
    const map = new Map();
    for (const span of this.store.items) {
      const entry = map.get(span.service) || { name: span.service, spans: 0, errors: 0, durations: [], lastSeen: 0 };
      entry.spans += 1;
      if (span.error) entry.errors += 1;
      if (Number.isFinite(span.durationMs)) entry.durations.push(span.durationMs);
      entry.lastSeen = Math.max(entry.lastSeen, span.timestamp);
      map.set(span.service, entry);
    }
    return [...map.values()].map((entry) => ({
      name: entry.name, spans: entry.spans, errors: entry.errors,
      errorRate: entry.spans ? (entry.errors / entry.spans) * 100 : 0,
      lastSeen: entry.lastSeen ? new Date(entry.lastSeen).toISOString() : null,
    })).sort((a, b) => b.spans - a.spans);
  }
}

module.exports = {
  TraceManager, normalizeSpan, otlpSpans, kindName, statusError, sanitizeAttributes,
};
