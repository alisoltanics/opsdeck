'use strict';

/**
 * Observability unit tests.
 *
 * These cover the metric primitives, the bounded stores, the dashboard schema
 * validation and the configuration/layering helpers. No Electron, Docker,
 * network or external service is involved.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  normalizeMetric,
  normalizeMetrics,
  cleanLabel,
  cleanLabels,
  stableLabels,
  aggregate,
  quantile,
  percent,
  formatMetricValue,
} = require('../src/main/observability/metrics');
const { MetricsStore, RecordStore } = require('../src/main/observability/storage');
const { validWidget, validDashboard, PREBUILT, WIDGET_TYPES } = require('../src/main/observability/dashboards');
const { ObservabilityConfig, mergeDefaults, boundedInt, clean, validId, validHttpUrl, normalizeId, OVERVIEW_WIDGETS } = require('../src/main/observability/config');
const { DatabaseCollector } = require('../src/main/observability/collectors/database');
const { __test: localHelpers } = require('../src/main/observability/collectors/local');
const { missingData, healthScore } = require('../src/main/observability');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opsdeck-obs-'));
}

function stubVault() {
  return {
    safeAvailable: () => true,
    backend: () => 'safeStorage',
    encrypt: (value) => `enc:${value}`,
    decrypt: (value) => String(value).replace(/^enc:/, ''),
  };
}

// ---------------------------------------------------------------- metrics

test('normalizeMetric rejects unusable samples and keeps the shape stable', () => {
  assert.equal(normalizeMetric(null), null);
  assert.equal(normalizeMetric({ value: 1 }), null);
  assert.equal(normalizeMetric({ name: '1bad', value: 1 }), null);
  assert.equal(normalizeMetric({ name: 'system.cpu.usage', value: Number.NaN }), null);

  const metric = normalizeMetric({
    name: ' system.cpu.usage ',
    value: '42.5',
    timestamp: 1700000000123.7,
    labels: { z: 'last', a: 'first', blank: '', 'bad=key': 'value' },
  });
  assert.equal(metric.name, 'system.cpu.usage');
  assert.equal(metric.value, 42.5);
  assert.equal(metric.timestamp, 1700000000124);
  assert.equal(metric.unit, 'count');
  assert.equal(metric.source, 'unknown');
  assert.equal(metric.resource, 'local');
  assert.equal(metric.method, 'poll');
  assert.deepEqual(metric.labels, { a: 'first', bad_key: 'value', z: 'last' });
});

test('normalizeMetrics filters the list and label helpers sanitize values', () => {
  const list = normalizeMetrics([
    { name: 'system.load.1', value: 0.7 },
    { name: 'bad name', value: 1 },
    { name: 'system.load.5', value: 'oops' },
    { name: 'system.load.15', value: 2 },
  ]);
  assert.equal(list.length, 2);
  assert.deepEqual(list.map((entry) => entry.name), ['system.load.1', 'system.load.15']);

  assert.equal(cleanLabel('a\u0000b\rc', 10), 'a b c');
  assert.equal(cleanLabel('abcdef', 3), 'abc');
  assert.deepEqual(cleanLabels({ 'key=one': 'v', empty: '', other: 'x' }), { key_one: 'v', other: 'x' });
  assert.deepEqual(Object.keys(stableLabels({ b: '2', a: '1' })), ['a', 'b']);
});

test('aggregate and quantile handle empty, single and mixed input', () => {
  assert.equal(aggregate([], 'avg'), null);
  assert.equal(aggregate([1, 2, 3, 4], 'avg'), 2.5);
  assert.equal(aggregate([1, 2, 3, 4], 'sum'), 10);
  assert.equal(aggregate([1, 2, 3, 4], 'min'), 1);
  assert.equal(aggregate([1, 2, 3, 4], 'max'), 4);
  assert.equal(aggregate([1, 2, 3, 4], 'last'), 4);
  assert.equal(aggregate([1, 2, 3, 4], 'count'), 4);
  assert.equal(aggregate([1, 2, 3, 4], 'median'), 2.5);
  assert.equal(aggregate(['1', '3'], 'avg'), 2);
  assert.equal(aggregate([5], 'p95'), 5);

  assert.equal(quantile([], 0.9), null);
  assert.equal(quantile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(quantile([1, 2, 3, 4], 0), 1);
  assert.equal(quantile([1, 2, 3, 4], 1), 4);
  assert.equal(quantile([10], 0.95), 10);
  assert.equal(quantile([1, 2, 3], 2), 3);
});

test('percent, formatting and bounded helpers never invent values', () => {
  assert.equal(percent(50, 200), 25);
  assert.equal(percent(300, 200), 100);
  assert.equal(percent(1, 0), null);
  assert.equal(percent(Number.NaN, 1), null);

  assert.equal(formatMetricValue(null, 'percent'), '—');
  assert.equal(formatMetricValue(42, 'percent'), '42.0%');
  assert.equal(formatMetricValue(2048, 'bytes'), '2.0 KB');
  assert.equal(formatMetricValue(150, 'seconds'), '2.5m');

  assert.equal(boundedInt(5, 1, 10, 3), 5);
  assert.equal(boundedInt(50, 1, 10, 3), 3);
  assert.equal(boundedInt(5.5, 1, 10, 3), 3);
  assert.equal(clean('  hi\u0000there  ', 20), 'hi there');
  assert.equal(validId('dashboard-1'), true);
  assert.equal(validId('no'), false);
  assert.equal(validHttpUrl('https://example.com/x'), true);
  assert.equal(validHttpUrl('file:///etc/passwd'), false);
  assert.match(normalizeId('', 'server'), /^server-/);
});

// ---------------------------------------------------------------- storage

test('MetricsStore records, queries and persists bounded series', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'metrics.db');
  const store = new MetricsStore({ file, retention: { maxSeries: 50 } });
  const base = Math.floor(Date.now() / 600000) * 600000 - 600000;

  const result = store.record([
    { name: 'system.cpu.usage', value: 10, timestamp: base, source: 'local', resource: 'host-1', unit: 'percent' },
    { name: 'system.cpu.usage', value: 30, timestamp: base + 30_000, source: 'local', resource: 'host-1', unit: 'percent' },
    { name: 'system.cpu.usage', value: -5, timestamp: base + 60_000, source: 'local', resource: 'other', unit: 'percent', labels: { core: '1' } },
    { name: 'invalid name', value: 1, timestamp: base },
  ]);
  assert.equal(result.recorded, 3);
  assert.equal(store.stats().series, 2);
  assert.equal(store.stats().raw, 3);

  const latest = store.latest('system.cpu.usage', { resource: 'host-1' });
  assert.equal(latest.value, 30);
  assert.equal(latest.unit, 'percent');
  assert.equal(latest.resource, 'host-1');

  const query = store.query({
    names: ['system.cpu.usage'],
    from: base,
    to: base + 60_000,
    step: 300_000,
    aggregation: 'avg',
  });
  assert.equal(query.ok, true);
  assert.equal(query.series.length, 2);
  const hostSeries = query.series.find((entry) => entry.resource === 'host-1');
  assert.equal(hostSeries.points.length, 1);
  assert.equal(hostSeries.points[0][1], 20);
  assert.equal(hostSeries.unit, 'percent');

  assert.equal(store.persist(), true);
  assert.equal(fs.existsSync(file), true);
  assert.equal(fs.statSync(file).mode & 0o777, 0o600);

  const reloaded = new MetricsStore({ file });
  reloaded.load();
  assert.equal(reloaded.stats().series, 2);
  assert.equal(reloaded.latest('system.cpu.usage', { resource: 'host-1' }).value, 30);
  assert.equal(reloaded.query({ names: ['system.cpu.usage'], from: base, to: base + 60_000 }).series.length, 2);

  fs.rmSync(dir, { recursive: true, force: true });
});

test('MetricsStore enforces the series cap instead of growing without bound', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'metrics.db');
  const store = new MetricsStore({ file, retention: { maxSeries: 1 } });
  store.record([{ name: 'system.load.1', value: 1, timestamp: Date.now() }]);
  const second = store.record([{ name: 'system.load.5', value: 2, timestamp: Date.now() }]);
  assert.equal(second.recorded, 0);
  assert.equal(second.rejected, 1);
  assert.equal(store.stats().series, 1);
  assert.equal(store.stats().rejected, 1);
  fs.rmSync(dir, { recursive: true, force: true });
});

test('RecordStore filters, prunes and persists records', () => {
  const dir = tmpDir();
  const file = path.join(dir, 'logs.db');
  const store = new RecordStore({ file, maxRecords: 3, retentionDays: 1, kind: 'log' });
  const now = Date.now();

  const added = store.add([
    { timestamp: now, level: 'error', source: 'local', text: 'connection refused' },
    { timestamp: now - 1000, level: 'info', source: 'docker', text: 'started' },
    { timestamp: now - 2000, level: 'error', source: 'docker', text: 'boom' },
    { timestamp: now - 10 * 86400_000, level: 'error', source: 'local', text: 'too old' },
  ]);
  assert.equal(added, 4);
  assert.equal(store.stats().records, 3);
  assert.equal(store.query({ levels: ['error'] }).total, 2);
  assert.equal(store.query({ sources: ['docker'] }).total, 2);
  assert.equal(store.query({ search: 'CONNECTION' }).total, 1);
  assert.equal(store.query({ limit: 1 }).rows.length, 1);
  assert.equal(store.query({ offset: 2, limit: 5 }).rows.length, 1);

  assert.equal(store.persist(), true);
  const reloaded = new RecordStore({ file, maxRecords: 3, retentionDays: 1, kind: 'log' });
  assert.equal(reloaded.stats().records, 3);
  assert.equal(reloaded.query({ search: 'started' }).total, 1);

  reloaded.clear();
  assert.equal(reloaded.stats().records, 0);
  fs.rmSync(dir, { recursive: true, force: true });
});

// ---------------------------------------------------------------- dashboards

test('validWidget keeps only supported widget shapes', () => {
  const widget = validWidget({ title: 'x'.repeat(200), type: 'not-a-type', metrics: Array.from({ length: 20 }, (_, i) => `m.${i}`), span: 99 });
  assert.equal(widget.type, 'timeseries');
  assert.equal(widget.title.length, 160);
  assert.equal(widget.metrics.length, 8);
  assert.ok(widget.span <= 12);
  assert.equal(WIDGET_TYPES.includes(widget.type), true);

  assert.equal(validWidget({ type: 'logs-recent' }).type, 'logs-recent');
  assert.match(validWidget({}).id, /^w-/);
  assert.equal(validWidget({ id: 'cpu-1' }).id, 'cpu-1');
});

test('validDashboard normalizes widgets and the prebuilt catalogue is valid', () => {
  const dashboard = validDashboard({ name: 'Mine', widgets: Array.from({ length: 100 }, () => ({ type: 'stat' })) });
  assert.match(dashboard.id, /^dashboard-/);
  assert.equal(dashboard.name, 'Mine');
  assert.equal(dashboard.builtin, false);
  assert.equal(dashboard.widgets.length, 80);
  assert.ok(dashboard.createdAt);

  assert.ok(Array.isArray(PREBUILT) && PREBUILT.length > 0);
  const ids = new Set();
  for (const entry of PREBUILT) {
    const normalized = validDashboard(entry);
    assert.equal(normalized.id, entry.id);
    assert.equal(ids.has(normalized.id), false, `duplicate prebuilt id ${normalized.id}`);
    ids.add(normalized.id);
    assert.ok(normalized.widgets.length > 0);
  }
});

// ---------------------------------------------------------------- config

test('mergeDefaults deep-merges objects and copies default arrays', () => {
  const defaults = { a: 1, nested: { x: 1, y: 2 }, list: ['a', 'b'], keep: { z: true } };
  const merged = mergeDefaults({ nested: { y: 9 }, list: ['custom'], extra: 'kept' }, defaults);
  assert.equal(merged.a, 1);
  assert.deepEqual(merged.nested, { x: 1, y: 9 });
  assert.deepEqual(merged.list, ['custom']);
  assert.deepEqual(merged.keep, { z: true });
  assert.equal(merged.extra, 'kept');

  merged.list.push('mutated');
  assert.deepEqual(defaults.list, ['a', 'b']);
});

test('ObservabilityConfig exposes a safe public shape', () => {
  const dir = tmpDir();
  const app = { getPath: () => dir };
  const config = new ObservabilityConfig(app, stubVault());
  config.setSecret('server', 'server-1', 'password', 'hunter2');

  const data = config.get();
  assert.equal(data.enabled, true);
  assert.ok(Array.isArray(data.alertRules));
  assert.ok(data.collectors && Object.keys(data.collectors).length > 0);
  assert.ok(OVERVIEW_WIDGETS.length > 0);

  const publicData = config.publicConfig();
  assert.equal(publicData.version, 1);
  assert.equal(publicData.vault.secureStorage, true);
  assert.equal(publicData.vault.backend, 'safeStorage');
  assert.equal('secrets' in publicData, false);
  assert.equal(JSON.stringify(publicData).includes('hunter2'), false);
  assert.equal(publicData.counts.dashboards, data.dashboards.length);

  const server = config.publicServer({
    id: 'server-1', name: 'db-1', method: 'ssh', host: '10.0.0.1', port: 22, tags: [], enabled: true,
  });
  assert.equal(server.hasPassword, true);
  assert.equal(config.getSecret('server', 'server-1', 'password'), 'hunter2');

  config.save();
  assert.equal(fs.existsSync(path.join(dir, 'observability.json')), true);
  const reloaded = new ObservabilityConfig(app, stubVault());
  assert.equal(reloaded.get().retention.maxSeries, data.retention.maxSeries);
  assert.equal(reloaded.publicConfig().counts.dashboards, data.dashboards.length);

  fs.rmSync(dir, { recursive: true, force: true });
});

// ------------------------------------------------------- collector + health helpers

test('DatabaseCollector derives ops/s only from real counter deltas', () => {
  const collector = new DatabaseCollector({ databases: null });
  // The first sample has no baseline, so no rate is invented.
  assert.equal(collector.opsRate('db-1', 1000, 'mysql', { queries: 100 }), null);
  // 60 queries over 10 seconds is a measured rate.
  assert.equal(collector.opsRate('db-1', 11000, 'mysql', { queries: 160 }), 6);
  // A counter reset must not produce a negative or absurd rate.
  assert.equal(collector.opsRate('db-1', 21000, 'mysql', { queries: 10 }), null);
  // Engines without a monotonic counter stay unavailable.
  assert.equal(collector.opsRate('db-2', 1000, 'redis', { opsPerSecond: 12 }), null);

  assert.equal(collector.opsRate('pg-1', 1000, 'postgres', { transactions: { commit: 10, rollback: 2 } }), null);
  assert.equal(collector.opsRate('pg-1', 3000, 'postgres', { transactions: { commit: 14, rollback: 2 } }), 2);
});

test('missingData and healthScore describe only measured components', () => {
  const missing = missingData({
    docker: { available: false },
    k8s: { available: true, topAvailable: false, nodeSummary: { total: 1, ready: 1 } },
    dbs: { connections: [] },
    synthetic: { targets: [] },
    apps: { services: [] },
    remote: { servers: [] },
  });
  assert.ok(missing.some((entry) => entry.startsWith('Docker metrics')));
  assert.ok(missing.some((entry) => entry.startsWith('Kubernetes usage metrics')));
  assert.ok(!missing.some((entry) => entry.startsWith('Kubernetes metrics (')));

  const score = healthScore({
    hosts: { total: 1, online: 1 },
    containers: { total: 0, running: 0, unhealthy: 0 },
    cluster: { nodes: { total: 0, ready: 0 } },
    database: { total: 0, up: 0 },
    service: { total: 0, healthy: 0, degraded: 0, failed: 0 },
  });
  assert.equal(score.value, 100);
  assert.equal(score.label, 'Healthy');
  assert.deepEqual(score.missing.sort(), ['Container health', 'Databases reachable', 'Kubernetes nodes', 'Service health'].sort());
});

test('macOS memory accounting matches Activity Monitor instead of raw free pages', () => {
  const output = [
    'Mach Virtual Memory Statistics: (page size of 16384 bytes)',
    'Pages free:                               1000.',
    'Pages active:                            20000.',
    'Pages inactive:                           5000.',
    'Pages speculative:                         500.',
    'Pages throttled:                             0.',
    'Pages wired down:                         4000.',
    'Pages purgeable:                           250.',
    'Pages occupied by compressor:             2000.',
  ].join('\n');
  const sample = localHelpers.parseVmStat(output);
  assert.equal(sample.pageSize, 16384);
  assert.equal(sample.active, 20000);
  assert.equal(sample.wired, 4000);
  assert.equal(sample.compressor, 2000);
  assert.equal(localHelpers.parseVmStat('not vm_stat output'), null);

  const total = 64 * 1024 ** 3;
  const usage = localHelpers.macMemoryUsage(sample, total);
  assert.equal(usage.used, (20000 + 4000 + 2000) * 16384);
  assert.equal(usage.free, 1000 * 16384);
  assert.equal(usage.available, total - usage.used);
  assert.equal(usage.cached, (5000 + 250 + 500) * 16384);

  // Compressor pages can never push "used" past physical memory.
  const clamped = localHelpers.macMemoryUsage({ ...sample, active: 10 ** 9 }, total);
  assert.equal(clamped.used, total);
  assert.equal(clamped.available, 0);
});

test('Windows per-process CPU needs two samples and never invents a rate', () => {
  assert.equal(localHelpers.processCpuPercent(null, 10, 10, 8), null);
  assert.equal(localHelpers.processCpuPercent(10, 10, 0, 8), null);
  assert.equal(localHelpers.processCpuPercent(10, 12, 10, 8), 20);
  assert.equal(localHelpers.processCpuPercent(10, 5, 10, 8), null);
  // A process can burn every core, but never more than 100% per core.
  assert.equal(localHelpers.processCpuPercent(0, 1000, 1, 4), 400);
});
