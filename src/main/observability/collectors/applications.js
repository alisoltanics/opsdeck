'use strict';

/**
 * Application / APM collector.
 *
 * OpsDeck does not invent application telemetry. This collector derives service
 * health only from spans that were actually received through OTLP or a
 * compatible trace backend. When no instrumentation is present it reports that
 * explicitly and returns no service metrics.
 */

const { metric, quantile } = require('../metrics');

function percentile(values, q) {
  return quantile(values, q);
}

class ApplicationCollector {
  constructor({ getSpans }) {
    this.name = 'applications';
    this.label = 'Application monitoring';
    this.source = 'application';
    this.getSpans = getSpans || (() => []);
    this.lastAt = 0;
    this.lastDetails = null;
    this.lastError = '';
  }

  async collect(now = Date.now()) {
    const started = now;
    const spans = (this.getSpans() || []).filter((span) => span && span.timestamp >= now - 3600e3);
    if (!spans.length) {
      this.lastAt = now;
      this.lastDetails = {
        at: new Date(now).toISOString(), available: false,
        reason: 'No application spans have been received. Instrument the application with OpenTelemetry and export OTLP/HTTP to the OpsDeck receiver.',
        services: [], instrumentation: instrumentationGuide(),
      };
      return { ok: true, metrics: [], details: this.lastDetails, errors: [], durationMs: 0, at: new Date(now).toISOString() };
    }

    const services = new Map();
    const metrics = [];
    for (const span of spans) {
      const service = span.service || 'unknown-service';
      let entry = services.get(service);
      if (!entry) {
        entry = {
          name: service, spans: 0, errors: 0, durations: [], operations: new Map(),
          statusCodes: {}, dependencies: new Map(), kinds: {}, lastSeen: 0, runtimes: new Set(),
        };
        services.set(service, entry);
      }
      entry.spans += 1;
      const isError = span.error === true || (span.statusCode && Number(span.statusCode) >= 500);
      if (isError) entry.errors += 1;
      if (Number.isFinite(Number(span.durationMs))) entry.durations.push(Number(span.durationMs));
      entry.lastSeen = Math.max(entry.lastSeen, span.timestamp || 0);
      if (span.kind) entry.kinds[span.kind] = (entry.kinds[span.kind] || 0) + 1;
      if (span.statusCode) entry.statusCodes[String(span.statusCode)] = (entry.statusCodes[String(span.statusCode)] || 0) + 1;
      if (span.operation) {
        const op = entry.operations.get(span.operation) || { count: 0, errors: 0, durations: [] };
        op.count += 1;
        if (isError) op.errors += 1;
        if (Number.isFinite(Number(span.durationMs))) op.durations.push(Number(span.durationMs));
        entry.operations.set(span.operation, op);
      }
      if (span.peerService || span.dependency) {
        const dep = span.peerService || span.dependency;
        entry.dependencies.set(dep, (entry.dependencies.get(dep) || 0) + 1);
      }
      if (span.runtime) entry.runtimes.add(span.runtime);
    }

    const windowMinutes = 60;
    const rows = [];
    for (const [name, entry] of services) {
      const p50 = percentile(entry.durations, 0.5);
      const p90 = percentile(entry.durations, 0.9);
      const p95 = percentile(entry.durations, 0.95);
      const p99 = percentile(entry.durations, 0.99);
      const avg = entry.durations.length ? entry.durations.reduce((sum, value) => sum + value, 0) / entry.durations.length : null;
      const errorRate = entry.spans ? (entry.errors / entry.spans) * 100 : 0;
      const resource = `app:${name}`;
      const labels = { service: name, runtime: [...entry.runtimes].join(',') };
      metrics.push(metric('application.requests', entry.spans, { unit: 'count', source: this.source, resource, labels, timestamp: now }));
      metrics.push(metric('application.requests.per_minute', entry.spans / windowMinutes, { unit: 'count', source: this.source, resource, labels, timestamp: now }));
      metrics.push(metric('application.errors', entry.errors, { unit: 'count', source: this.source, resource, labels, timestamp: now }));
      metrics.push(metric('application.error_rate', errorRate, { unit: 'percent', source: this.source, resource, labels, timestamp: now }));
      if (avg != null) {
        metrics.push(metric('application.response.avg_ms', avg, { unit: 'milliseconds', source: this.source, resource, labels, timestamp: now }));
        metrics.push(metric('application.response.p50_ms', p50, { unit: 'milliseconds', source: this.source, resource, labels, timestamp: now }));
        metrics.push(metric('application.response.p90_ms', p90, { unit: 'milliseconds', source: this.source, resource, labels, timestamp: now }));
        metrics.push(metric('application.response.p95_ms', p95, { unit: 'milliseconds', source: this.source, resource, labels, timestamp: now }));
        metrics.push(metric('application.response.p99_ms', p99, { unit: 'milliseconds', source: this.source, resource, labels, timestamp: now }));
      }
      rows.push({
        name,
        spans: entry.spans,
        errors: entry.errors,
        errorRate,
        requestsPerMinute: entry.spans / windowMinutes,
        avgMs: avg, p50Ms: p50, p90Ms: p90, p95Ms: p95, p99Ms: p99,
        statusCodes: entry.statusCodes,
        kinds: entry.kinds,
        dependencies: [...entry.dependencies.entries()].map(([dependency, count]) => ({ dependency, count })).sort((a, b) => b.count - a.count),
        operations: [...entry.operations.entries()].map(([operation, value]) => ({
          operation, count: value.count, errors: value.errors,
          p95Ms: percentile(value.durations, 0.95), avgMs: value.durations.length ? value.durations.reduce((sum, v) => sum + v, 0) / value.durations.length : null,
        })).sort((a, b) => b.p95Ms - a.p95Ms).slice(0, 20),
        lastSeen: entry.lastSeen ? new Date(entry.lastSeen).toISOString() : null,
        health: errorRate > 5 ? 'degraded' : 'healthy',
      });
    }

    this.lastAt = now;
    this.lastDetails = {
      at: new Date(now).toISOString(), available: true,
      services: rows.sort((a, b) => b.spans - a.spans),
      totalSpans: spans.length,
      instrumentation: null,
    };
    return { ok: true, metrics, details: this.lastDetails, errors: [], durationMs: Date.now() - started, at: new Date(now).toISOString() };
  }
}

function instrumentationGuide() {
  return {
    otlpHttp: 'OTEL_EXPORTER_OTLP_ENDPOINT=http://127.0.0.1:<port>',
    traces: 'OTEL_TRACES_EXPORTER=otlp',
    protocol: 'OTEL_EXPORTER_OTLP_PROTOCOL=http/json',
    note: 'Enable the OpsDeck ingest receiver in Integrations → Agents, then export OTLP/HTTP JSON (protobuf is rejected honestly until decoded).',
  };
}

module.exports = { ApplicationCollector, instrumentationGuide };
