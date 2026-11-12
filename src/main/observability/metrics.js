'use strict';

/**
 * Metric primitives shared by every observability collector.
 *
 * A sample is intentionally self-describing so it can be persisted, queried and
 * exported without knowing which collector produced it:
 *   { name, value, unit, timestamp, source, resource, labels, method }
 */

const MAX_LABEL_VALUE = 240;

function num(value) {
  if (value === null || value === undefined || value === '') return null;
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

function cleanLabel(value, max = MAX_LABEL_VALUE) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').slice(0, max);
}

function cleanLabels(labels = {}) {
  const out = {};
  if (!labels || typeof labels !== 'object') return out;
  for (const [rawKey, rawValue] of Object.entries(labels)) {
    const key = cleanLabel(rawKey, 80).replace(/[=]/g, '_').trim();
    if (!key) continue;
    const value = cleanLabel(rawValue);
    if (value === '') continue;
    out[key] = value;
  }
  return out;
}

function stableLabels(labels = {}) {
  return Object.fromEntries(Object.entries(cleanLabels(labels)).sort(([a], [b]) => a.localeCompare(b)));
}

function seriesKey(metric) {
  return `${metric.name}\u0001${metric.source}\u0001${metric.resource}\u0001${JSON.stringify(metric.labels || {})}`;
}

function normalizeMetric(input) {
  if (!input || typeof input !== 'object') return null;
  const name = cleanLabel(input.name, 180).trim();
  if (!name || !/^[a-zA-Z][a-zA-Z0-9_.:-]*$/.test(name)) return null;
  const value = num(input.value);
  if (value == null) return null;
  const timestamp = num(input.timestamp) ?? Date.now();
  return {
    name,
    value,
    unit: cleanLabel(input.unit || '', 30) || 'count',
    timestamp: Math.round(timestamp),
    source: cleanLabel(input.source || 'unknown', 80) || 'unknown',
    resource: cleanLabel(input.resource || 'local', 180) || 'local',
    labels: stableLabels(input.labels),
    method: cleanLabel(input.method || 'poll', 40) || 'poll',
  };
}

function normalizeMetrics(list) {
  if (!Array.isArray(list)) return [];
  const out = [];
  for (const entry of list) {
    const metric = normalizeMetric(entry);
    if (metric) out.push(metric);
  }
  return out;
}

/** Build a metric with a compact call signature used by collectors. */
function metric(name, value, opts = {}) {
  return normalizeMetric({
    name,
    value,
    unit: opts.unit || 'count',
    timestamp: opts.timestamp || Date.now(),
    source: opts.source || 'local',
    resource: opts.resource || 'local',
    labels: opts.labels || {},
    method: opts.method || 'poll',
  });
}

function percent(used, total) {
  const u = Number(used);
  const t = Number(total);
  if (!Number.isFinite(u) || !Number.isFinite(t) || t <= 0) return null;
  return Math.max(0, Math.min(100, (u / t) * 100));
}

function bytes(value) {
  const n = num(value);
  return n == null ? null : Math.max(0, n);
}

/** Aggregate values for alerting and dashboard queries. */
function aggregate(values, method = 'avg') {
  const list = (values || []).filter((v) => Number.isFinite(Number(v))).map(Number);
  if (!list.length) return null;
  switch (String(method || 'avg')) {
    case 'sum': return list.reduce((a, b) => a + b, 0);
    case 'min': return Math.min(...list);
    case 'max': return Math.max(...list);
    case 'last': return list[list.length - 1];
    case 'count': return list.length;
    case 'median': {
      const sorted = [...list].sort((a, b) => a - b);
      const mid = Math.floor(sorted.length / 2);
      return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
    }
    case 'p90': return quantile(list, 0.9);
    case 'p95': return quantile(list, 0.95);
    case 'p99': return quantile(list, 0.99);
    default: return list.reduce((a, b) => a + b, 0) / list.length;
  }
}

function quantile(values, q) {
  const list = (values || []).map(Number).filter(Number.isFinite).sort((a, b) => a - b);
  if (!list.length) return null;
  const pos = (list.length - 1) * Math.max(0, Math.min(1, q));
  const base = Math.floor(pos);
  const rest = pos - base;
  if (list[base + 1] !== undefined) return list[base] + rest * (list[base + 1] - list[base]);
  return list[base];
}

const UNITS = {
  percent: '%',
  bytes: 'bytes',
  bytes_per_second: 'B/s',
  seconds: 's',
  milliseconds: 'ms',
  count: '',
  celsius: '°C',
  mhz: 'MHz',
  ratio: '',
};

function formatMetricValue(value, unit) {
  const n = num(value);
  if (n == null) return '—';
  if (unit === 'percent') return `${n.toFixed(n >= 10 ? 1 : 2)}%`;
  if (unit === 'bytes' || unit === 'bytes_per_second') {
    const units = ['B', 'KB', 'MB', 'GB', 'TB'];
    let v = Math.max(0, n);
    let i = 0;
    while (v >= 1024 && i < units.length - 1) { v /= 1024; i += 1; }
    return `${v >= 100 || i === 0 ? Math.round(v) : v.toFixed(1)} ${units[i]}${unit === 'bytes_per_second' ? '/s' : ''}`;
  }
  if (unit === 'seconds') return n < 120 ? `${n.toFixed(2)}s` : `${(n / 60).toFixed(1)}m`;
  if (unit === 'milliseconds') return `${n.toFixed(n >= 10 ? 0 : 1)}ms`;
  if (unit === 'celsius') return `${n.toFixed(1)}°C`;
  if (unit === 'mhz') return `${Math.round(n)} MHz`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

module.exports = {
  num, cleanLabel, cleanLabels, stableLabels, seriesKey, normalizeMetric, normalizeMetrics,
  metric, percent, bytes, aggregate, quantile, UNITS, formatMetricValue,
};
