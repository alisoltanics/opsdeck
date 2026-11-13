'use strict';

/**
 * Cross-module intelligence unit tests.
 *
 * The intelligence layer only reads services that already exist. These tests
 * use in-memory stores and fake dependencies, so no Electron, Docker, cluster
 * or network connection is needed. They cover the statistical helpers, the
 * bounded store, graph building, timeline merging, change detection, the
 * conservative environment heuristics, dry-run/approval automation semantics
 * and the evidence-based root-cause analyser.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const {
  clamp, clean, hash, mean, median, stdev, percentile,
  linearFit, forecast, timeToThreshold, detectAnomalies, resourceId,
} = require('../src/main/intelligence/util');
const { IntelligenceStore, LIMITS, DEFAULT_ENVIRONMENTS } = require('../src/main/intelligence/store');
const { buildGraph, parseVolumeNames } = require('../src/main/intelligence/graph');
const { TimelineBuilder, eventEntry, SEVERITY_RANK } = require('../src/main/intelligence/timeline');
const { ChangeDetector, signature } = require('../src/main/intelligence/changes');
const { EnvironmentManager, __test: envTest } = require('../src/main/intelligence/environments');
const { AutomationEngine, __test: autoTest } = require('../src/main/intelligence/automation');
const { RootCauseAnalyzer } = require('../src/main/intelligence/rca');
const { __test: resourceTest } = require('../src/main/intelligence/resources');

function tmpDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opsdeck-intel-'));
}

function fakeApp(dir) {
  return { getPath: () => dir };
}

function newStore(dir) {
  return new IntelligenceStore(fakeApp(dir));
}

function resource(overrides = {}) {
  return {
    id: 'docker:container:web',
    module: 'docker',
    kind: 'container',
    name: 'web',
    status: 'healthy',
    namespace: '',
    cluster: '',
    host: 'local',
    href: '#/containers',
    labels: {},
    metadata: {},
    ...overrides,
  };
}

// --------------------------------------------------------------------- util

test('util: bounded primitives do not leak control characters or NaN', () => {
  assert.equal(clamp('nope', 2, 8), 2);
  assert.equal(clamp(99, 2, 8), 8);
  assert.equal(clamp(-1, 0, 5), 0);
  assert.equal(clean('  a\u0000b \n c  ', 80), 'a b c');
  assert.equal(clean('abcdef', 3), 'abc');
  assert.equal(hash('same'), hash('same'));
  assert.notEqual(hash('a'), hash('b'));
  assert.equal(resourceId('docker', 'container', 'abc'), 'docker:container:abc');
  assert.equal(resourceId('kubernetes', 'pod', null), 'kubernetes:pod:');
});

test('util: statistics ignore non-finite samples', () => {
  assert.equal(mean([1, 2, 'x', 3]), 2);
  assert.equal(median([3, 1, 2, 4]), 2.5);
  assert.equal(stdev([2, 2, 2]), 0);
  assert.ok(Math.abs(stdev([1, 2, 3]) - 1) < 1e-9);
  assert.equal(percentile([1, 2, 3, 4], 0.5), 2.5);
  assert.equal(mean([]), null);
});

test('util: linear fit explains a clean trend', () => {
  const points = Array.from({ length: 20 }, (_, i) => [1700000000000 + i * 60e3, 20 + i * 2]);
  const fit = linearFit(points);
  assert.ok(fit.r2 > 0.99);
  assert.ok(fit.slope > 0);
  assert.equal(fit.count, 20);
});

test('util: forecast refuses too few samples and labels a trend honestly', () => {
  const tooFew = forecast([[1, 2], [2, 3]]);
  assert.equal(tooFew.ok, false);

  const points = Array.from({ length: 30 }, (_, i) => [1700000000000 + i * 60e3, 40 + i]);
  const result = forecast(points, { horizonMs: 3600e3 });
  assert.equal(result.ok, true);
  assert.equal(result.method, 'linear-trend');
  assert.ok(result.points.length >= 6);
  assert.ok(result.confidence > 0.35 && result.confidence <= 0.95);
});

test('util: timeToThreshold only reports a crossing for a rising series', () => {
  const rising = Array.from({ length: 20 }, (_, i) => [1700000000000 + i * 60e3, 10 + i]);
  const crossing = timeToThreshold(rising, 35, { horizonMs: 3600e3 });
  assert.equal(crossing.ok, true);
  assert.equal(crossing.reachable, true);

  const flat = Array.from({ length: 20 }, (_, i) => [1700000000000 + i * 60e3, 10]);
  const never = timeToThreshold(flat, 35, { horizonMs: 3600e3 });
  assert.equal(never.ok, true);
  assert.equal(never.reachable, false);
});

test('util: anomaly detection needs a baseline and flags an injected spike', () => {
  const short = detectAnomalies([[1, 2], [2, 3]]);
  assert.equal(short.ok, false);

  const points = Array.from({ length: 30 }, (_, i) => [i * 60e3, i === 20 ? 900 : 50 + (i % 3)]);
  const result = detectAnomalies(points, { sensitivity: 3 });
  assert.equal(result.ok, true);
  assert.equal(result.anomalies.length, 1);
  assert.equal(result.anomalies[0].direction, 'above');
  assert.ok(result.anomalies[0].score > 3);
});

// -------------------------------------------------------------------- store

test('store: defaults are bounded and include the shared collections', () => {
  const dir = tmpDir();
  const store = newStore(dir);
  const data = store.get();
  assert.equal(store.loaded, true);
  assert.equal(data.environments.length, DEFAULT_ENVIRONMENTS.length);
  assert.ok(data.environments.some((entry) => entry.id === 'production'));
  assert.equal(data.settings.automationEnabled, true);
  assert.deepEqual(data.changes, []);
  assert.deepEqual(data.resourceState, {});
  assert.ok(fs.existsSync(store.file) === false, 'defaults are not written until something changes');
  store.persist();
  assert.ok(fs.existsSync(store.file));
  const mode = fs.statSync(store.file).mode & 0o777;
  if (process.platform !== 'win32') assert.equal(mode, 0o600);
});

test('store: favourites and saved searches toggle without duplicates', () => {
  const store = newStore(tmpDir());
  const first = store.favorite({ id: 'docker:container:web', name: 'web', module: 'docker', kind: 'container' });
  assert.equal(first.favorite, true);
  assert.equal(store.favorites().items.length, 1);
  const second = store.favorite({ id: 'docker:container:web' });
  assert.equal(second.favorite, false);
  assert.equal(store.favorites().items.length, 0);

  assert.throws(() => store.favorite({}), /resource id/i);

  const saved = store.saveSearch({ name: 'prod web', query: 'web production', filters: { module: 'docker' } });
  assert.equal(saved.ok, true);
  assert.equal(store.savedSearches().items.length, 1);
  store.saveSearch({ id: saved.item.id, name: 'prod web v2', query: 'web' });
  assert.equal(store.savedSearches().items.length, 1);
  store.removeSaved(saved.item.id);
  assert.equal(store.savedSearches().items.length, 0);
});

test('store: audit and run history respect their bounds', () => {
  const store = newStore(tmpDir());
  for (let i = 0; i < LIMITS.audit + 5; i += 1) {
    store.audit({ action: `action-${i}`, module: 'intelligence' });
  }
  assert.equal(store.auditList({ limit: 5 }).length, 5);
  assert.equal(store.get().audit.length, LIMITS.audit);
  assert.equal(store.get().audit[store.get().audit.length - 1].action, `action-${LIMITS.audit + 4}`);
});

test('store: a corrupt file degrades to defaults without throwing', () => {
  const dir = tmpDir();
  fs.writeFileSync(path.join(dir, 'intelligence.json'), '{ this is not json');
  const store = newStore(dir);
  assert.equal(store.loaded, true);
  assert.ok(store.get().environments.length >= 5);
});

// -------------------------------------------------------------------- graph

test('graph: published ports parse Docker port strings', () => {
  const ports = resourceTest.publishedPorts(['0.0.0.0:8080->80/tcp', '127.0.0.1:5432->5432/tcp', '443/tcp']);
  assert.equal(ports.length, 3);
  assert.equal(ports[0].hostPort, 8080);
  assert.equal(ports[0].containerPort, 80);
  assert.equal(ports[0].protocol, 'tcp');
  assert.equal(ports[1].containerPort, 5432);
  assert.equal(ports[2].hostPort, null, 'an unpublished port is not given a fake host port');
  assert.deepEqual(resourceTest.publishedPorts(''), []);
});

test('graph: mounts and volume names are parsed without inventing paths', () => {
  assert.deepEqual(parseVolumeNames('data:/var/lib/data:rw, /tmp:/tmp, cache:/cache'), ['data', 'cache']);
  assert.deepEqual(parseVolumeNames('C:\\data:/data'), []);
});

test('graph: observed container edges are labelled and counted', () => {
  const resources = [
    resource({ id: 'docker:engine:default', kind: 'engine', name: 'default', metadata: { containers: 1 } }),
    resource({ id: 'host:host:local', module: 'host', kind: 'host', name: 'local-host' }),
    resource({
      id: 'docker:container:web', module: 'docker', kind: 'container', name: 'web',
      metadata: { image: 'nginx:1.25', networks: ['frontend'], mounts: 'data:/data', compose: 'shop', service: 'web' },
    }),
    resource({ id: 'docker:image:sha256:1', module: 'docker', kind: 'image', name: 'nginx:1.25', metadata: { repository: 'nginx', tag: '1.25' } }),
    resource({ id: 'docker:network:frontend', module: 'docker', kind: 'network', name: 'frontend' }),
    resource({ id: 'docker:volume:data', module: 'docker', kind: 'volume', name: 'data' }),
    resource({ id: 'docker:compose:shop', module: 'docker', kind: 'compose-project', name: 'shop' }),
  ];
  const graph = buildGraph({ resources });
  assert.equal(graph.ok, true);
  assert.equal(graph.stats.nodes, resources.length);
  const kinds = graph.edges.map((edge) => edge.kind).sort();
  assert.ok(kinds.includes('uses-image'));
  assert.ok(kinds.includes('attached-to'));
  assert.ok(kinds.includes('uses-volume'));
  assert.ok(kinds.includes('contains'));
  assert.ok(kinds.includes('runs-on'));
  const image = graph.edges.find((edge) => edge.kind === 'uses-image');
  assert.equal(image.confidence, 'observed');
  assert.match(image.evidence, /nginx:1\.25/);
  const web = graph.nodes.find((node) => node.id === 'docker:container:web');
  assert.ok(web.degree >= 5);
});

test('graph: no edge is invented when evidence is missing', () => {
  const graph = buildGraph({ resources: [resource()] });
  assert.equal(graph.stats.edges, 0);
  assert.equal(graph.stats.isolated, 1);
  assert.ok(Array.isArray(graph.notes));
});

// ----------------------------------------------------------------- timeline

test('timeline: module events merge, sort and de-duplicate', () => {
  const builder = new TimelineBuilder();
  builder.docker([
    { type: 'container', action: 'die', id: 'abc', attributes: { name: 'web' }, time: 1700000003000 },
    { type: 'container', action: 'start', id: 'def', attributes: { name: 'api' }, time: 1700000001000 },
  ]);
  builder.alerts([
    { id: 'alert-1', name: 'High CPU', severity: 'critical', state: 'firing', startedAt: new Date(1700000002000).toISOString(), resource: 'host:local' },
  ]);
  builder.add({ id: 'dup', module: 'custom', kind: 'event', at: new Date(1700000004000).toISOString(), title: 'Same' });
  builder.add({ id: 'dup', module: 'custom', kind: 'event', at: new Date(1700000004000).toISOString(), title: 'Same' });

  const result = builder.list({ limit: 50 });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 4);
  assert.equal(result.items[0].id, 'dup');
  assert.ok(result.items.every((entry, index) => index === 0 || entry.timestamp <= result.items[index - 1].timestamp));
  const die = result.items.find((entry) => entry.kind === 'container' && entry.title.includes('die'));
  assert.equal(die.severity, 'error');
});

test('timeline: filters, severity and pagination are applied after sorting', () => {
  const builder = new TimelineBuilder();
  for (let i = 0; i < 10; i += 1) {
    builder.add({
      id: `event-${i}`,
      module: i % 2 ? 'docker' : 'kubernetes',
      kind: 'status',
      at: new Date(1700000000000 + i * 1000).toISOString(),
      title: `Event ${i}`,
      severity: i === 9 ? 'critical' : 'info',
    });
  }
  const filtered = builder.list({ modules: ['docker'], limit: 100 });
  assert.equal(filtered.total, 5);
  assert.ok(filtered.items.every((entry) => entry.module === 'docker'));

  const critical = builder.list({ severities: ['critical'] });
  assert.equal(critical.total, 1);

  const page = builder.list({ limit: 4, offset: 4 });
  assert.equal(page.total, 10);
  assert.equal(page.items.length, 4);
  assert.equal(page.items[0].id, 'event-5');
});

test('timeline: eventEntry normalizes timestamps and severity', () => {
  const entry = eventEntry({ title: 'x', at: 'not-a-date', severity: 'bogus' });
  assert.equal(entry.severity, 'info');
  assert.ok(Number.isFinite(entry.timestamp));
  assert.equal(SEVERITY_RANK.critical, 4);
});

// ------------------------------------------------------------------ changes

test('changes: first snapshot is a baseline and produces no fake history', () => {
  const store = newStore(tmpDir());
  const detector = new ChangeDetector(store);
  const result = detector.detect([resource()]);
  assert.equal(result.baseline, true);
  assert.equal(result.changes.length, 0);
  assert.equal(detector.history().total, 0);
});

test('changes: appearance, health transition, replicas and removal are recorded', () => {
  const store = newStore(tmpDir());
  const detector = new ChangeDetector(store);
  const base = resource();
  detector.detect([base]);

  const added = detector.detect([base, resource({ id: 'docker:container:api', name: 'api' })]);
  assert.equal(added.baseline, false);
  assert.equal(added.changes.length, 1);
  assert.equal(added.changes[0].kind, 'discovered');

  const degraded = detector.detect([resource({ status: 'unhealthy' }), resource({ id: 'docker:container:api', name: 'api' })]);
  assert.equal(degraded.changes.length, 1);
  assert.equal(degraded.changes[0].severity, 'error');
  assert.equal(degraded.changes[0].kind, 'status');

  const removed = detector.detect([resource({ status: 'unhealthy' })]);
  assert.equal(removed.changes.length, 1);
  assert.equal(removed.changes[0].kind, 'removed');

  const history = detector.history({ limit: 10 });
  assert.equal(history.total, 3);
  assert.equal(history.items[0].kind, 'removed');
  assert.equal(detector.history({ resourceId: 'docker:container:api' }).total, 2);
  assert.equal(detector.history({ resourceId: 'docker:container:web' }).total, 1);
});

test('changes: image and replica changes use real metadata only', () => {
  const store = newStore(tmpDir());
  const detector = new ChangeDetector(store);
  const container = resource({ metadata: { image: 'nginx:1.25' } });
  detector.detect([container]);
  const changed = detector.detect([resource({ metadata: { image: 'nginx:1.26' } })]);
  assert.equal(changed.changes[0].kind, 'image');
  assert.match(changed.changes[0].detail, /1\.26/);

  const workload = resource({ id: 'kubernetes:deployment:web', module: 'kubernetes', kind: 'deployment', metadata: { desired: 2, ready: 2 } });
  detector.detect([workload]);
  const scaled = detector.detect([resource({ id: 'kubernetes:deployment:web', module: 'kubernetes', kind: 'deployment', metadata: { desired: 5, ready: 2 } })]);
  assert.equal(scaled.changes[0].kind, 'replicas');
});

test('changes: signature ignores volatile fields outside the reviewed set', () => {
  const a = signature(resource({ statusDetail: 'one', metadata: { image: 'nginx', uptime: 1 } }));
  const b = signature(resource({ statusDetail: 'two', metadata: { image: 'nginx', uptime: 999 } }));
  assert.deepEqual(a, b);
});

// ------------------------------------------------------------- environments

test('environments: tokens match whole words only', () => {
  assert.equal(envTest.tokenMatch('production'), 'production');
  assert.equal(envTest.tokenMatch('my-prod-app'), 'production');
  assert.equal(envTest.tokenMatch('productionish'), null);
  assert.equal(envTest.tokenMatch(''), null);
});

test('environments: rules beat heuristics and are never guessed', () => {
  const store = newStore(tmpDir());
  const manager = new EnvironmentManager(store);
  const item = resource({ name: 'web-1', namespace: 'payments', labels: { team: 'core' } });

  assert.equal(manager.environmentFor(item), null, 'a clean resource stays unassigned');

  manager.saveRule({ field: 'namespace', mode: 'contains', pattern: 'payments', environment: 'production', enabled: true });
  assert.equal(manager.environmentFor(item), 'production');

  manager.assign(item.id, 'staging');
  assert.equal(manager.environmentFor(item), 'staging');

  manager.assign(item.id, '');
  manager.deleteRule(store.get().environmentRules[0].id);
  assert.equal(manager.environmentFor(item), null);
});

test('environments: local host and engine are local; namespace tokens are honoured', () => {
  const store = newStore(tmpDir());
  const manager = new EnvironmentManager(store);
  assert.equal(manager.environmentFor(resource({ module: 'host', kind: 'host', id: 'host:host:local' })), 'local');
  assert.equal(manager.environmentFor(resource({ module: 'docker', kind: 'engine', id: 'docker:engine:default' })), 'local');
  assert.equal(manager.environmentFor(resource({ id: 'kubernetes:pod:a', module: 'kubernetes', kind: 'pod', namespace: 'team-staging' })), 'staging');
});

test('environments: custom environments are validated and cannot shadow built-ins', () => {
  const store = newStore(tmpDir());
  const manager = new EnvironmentManager(store);
  const created = manager.saveEnvironment({ name: 'Edge EU', description: 'Edge locations' });
  assert.equal(created.ok, true);
  assert.equal(created.environment.id, 'edge-eu');
  assert.equal(created.environment.custom, true);

  assert.throws(() => manager.saveEnvironment({ id: 'production', name: 'Duplicate' }), /built-in/i);
  assert.throws(() => manager.deleteEnvironment('production'), /built-in/i);

  manager.assign('docker:container:web', 'edge-eu');
  assert.throws(() => manager.assign('docker:container:web', 'missing'), /does not exist/i);

  manager.deleteEnvironment('edge-eu');
  assert.equal(store.get().assignments['docker:container:web'], undefined);
});

test('environments: summary counts only reported states', () => {
  const store = newStore(tmpDir());
  const manager = new EnvironmentManager(store);
  manager.assign('docker:container:web', 'production');
  const summary = manager.summary([
    resource({ environment: 'production', status: 'healthy' }),
    resource({ id: 'docker:container:api', environment: 'production', status: 'unhealthy' }),
    resource({ id: 'docker:container:job', environment: null, status: 'unknown' }),
  ]);
  const production = summary.environments.find((entry) => entry.id === 'production');
  assert.equal(production.counts.total, 2);
  assert.equal(production.counts.unhealthy, 1);
  assert.equal(summary.unassigned.total, 1);
});

// --------------------------------------------------------------- automation

test('automation: normalization bounds and rejects unsafe actions', () => {
  assert.throws(() => autoTest.normalizeAutomation({ name: 'empty' }), /at least one action/i);
  assert.throws(() => autoTest.normalizeAutomation({ trigger: { type: 'condition' }, actions: [{ type: 'report' }] }), /condition/i);
  assert.throws(() => autoTest.normalizeAutomation({ trigger: { type: 'event' }, actions: [{ type: 'report' }] }), /module or event kind/i);

  const item = autoTest.normalizeAutomation({
    name: 'Reactor',
    trigger: { type: 'schedule', everyMinutes: 1 },
    actions: [{ type: 'docker-restart', containerId: 'web' }],
  });
  assert.equal(item.trigger.everyMinutes, 5, 'the interval is clamped to the safe minimum');
  assert.equal(item.approval, 'always', 'a destructive action defaults to approval');
  assert.equal(item.actions[0].containerId, 'web');
  assert.equal(autoTest.compare(2, '>', 1), true);
  assert.equal(autoTest.compare('x', '>', 1), false);
});

test('automation: dry runs never call an action and are recorded', async () => {
  const store = newStore(tmpDir());
  let notified = 0;
  const engine = new AutomationEngine({
    store,
    deps: { notify: async () => { notified += 1; return { ok: true, results: [] }; } },
  });
  const saved = engine.save({
    name: 'Notify',
    trigger: { type: 'schedule', everyMinutes: 60 },
    actions: [{ type: 'notify', message: 'hello', severity: 'warning' }],
  });
  const result = await engine.runAutomation(saved.automation.id, { dryRun: true });
  assert.equal(result.ok, true);
  assert.equal(result.dryRun, true);
  assert.equal(result.run.status, 'dry-run');
  assert.equal(notified, 0, 'a dry run must not execute the action');
  assert.equal(engine.runs().items.length, 1);
});

test('automation: disruptive actions wait for explicit approval', async () => {
  const store = newStore(tmpDir());
  let restarted = 0;
  const engine = new AutomationEngine({
    store,
    deps: { restartContainer: async () => { restarted += 1; return { ok: true }; } },
  });
  const saved = engine.save({
    name: 'Restart web',
    trigger: { type: 'schedule', everyMinutes: 60 },
    actions: [{ type: 'docker-restart', containerId: 'web' }],
    approval: 'destructive',
  });
  const pending = await engine.runAutomation(saved.automation.id);
  assert.equal(pending.pending, true);
  assert.equal(pending.run.status, 'pending-approval');
  assert.equal(restarted, 0);

  const approved = await engine.approve(pending.run.id);
  assert.equal(approved.ok, true);
  assert.equal(approved.run.status, 'succeeded');
  assert.equal(restarted, 1);
  assert.equal(store.get().automations.find((entry) => entry.id === saved.automation.id).lastStatus, 'succeeded');
});

test('automation: reject and cancel keep a terminal state', async () => {
  const store = newStore(tmpDir());
  const engine = new AutomationEngine({ store, deps: { restartContainer: async () => ({ ok: true }) } });
  const saved = engine.save({
    name: 'Restart api',
    trigger: { type: 'schedule', everyMinutes: 60 },
    actions: [{ type: 'docker-restart', containerId: 'api' }],
    approval: 'always',
  });
  const pending = await engine.runAutomation(saved.automation.id);
  const rejected = engine.reject(pending.run.id, 'change window');
  assert.equal(rejected.run.status, 'rejected');

  const second = await engine.runAutomation(saved.automation.id);
  const cancelled = engine.cancel(second.run.id);
  assert.equal(cancelled.run.status, 'cancelled');
  assert.equal(cancelled.run.cancelled, true);
});

test('automation: db-query actions are checked with the destructive SQL guard', async () => {
  const store = newStore(tmpDir());
  let queried = 0;
  const engine = new AutomationEngine({
    store,
    deps: { queryDatabase: async () => { queried += 1; return { ok: true, rows: [] }; } },
  });
  const saved = engine.save({
    name: 'Read only',
    trigger: { type: 'schedule', everyMinutes: 60 },
    actions: [{ type: 'db-query', connectionId: 'conn-1', sql: 'DROP TABLE users', limit: 10 }],
  });
  const result = await engine.runAutomation(saved.automation.id);
  assert.equal(result.ok, true);
  assert.equal(result.run.status, 'failed');
  assert.match(result.run.steps[0].detail, /read-only/i);
  assert.equal(queried, 0);
});

test('automation: disabled settings block manual runs but not dry runs', async () => {
  const store = newStore(tmpDir());
  store.get().settings.automationEnabled = false;
  const engine = new AutomationEngine({ store, deps: { notify: async () => ({ ok: true }) } });
  const saved = engine.save({
    name: 'Notify',
    trigger: { type: 'schedule', everyMinutes: 60 },
    actions: [{ type: 'notify', message: 'x' }],
  });
  const blocked = await engine.runAutomation(saved.automation.id);
  assert.equal(blocked.ok, false);
  const dry = await engine.runAutomation(saved.automation.id, { dryRun: true });
  assert.equal(dry.ok, true);
});

test('automation: Kubernetes actions are normalized and gated like other disruptive actions', async () => {
  const normalized = autoTest.normalizeAutomation({
    name: 'Roll and scale',
    trigger: { type: 'schedule', everyMinutes: 30 },
    actions: [
      { type: 'k8s-restart', section: 'daemonsets', name: 'node-agent', namespace: 'kube-system' },
      { type: 'k8s-scale', section: 'statefulsets', name: 'db', namespace: 'data', replicas: 999 },
    ],
  });
  assert.equal(normalized.approval, 'always', 'disruptive Kubernetes actions default to approval');
  assert.equal(normalized.actions[0].section, 'daemonsets');
  assert.equal(normalized.actions[0].name, 'node-agent');
  assert.equal(normalized.actions[1].replicas, 100, 'replicas are clamped to the supported range');

  // DaemonSets have no replica count, so scaling one falls back to a safe kind.
  const coerced = autoTest.normalizeAction({ type: 'k8s-scale', section: 'daemonsets', name: 'agent', namespace: 'kube-system', replicas: 3 });
  assert.equal(coerced.section, 'deployments');

  const store = newStore(tmpDir());
  const calls = [];
  const engine = new AutomationEngine({
    store,
    deps: {
      restartWorkload: async (input) => { calls.push({ kind: 'restart', ...input }); return { ok: true }; },
      scaleWorkload: async (input) => { calls.push({ kind: 'scale', ...input }); return { ok: true }; },
    },
  });
  const saved = engine.save({
    name: 'Kubernetes remediation',
    trigger: { type: 'schedule', everyMinutes: 60 },
    actions: [
      { type: 'k8s-restart', section: 'deployments', name: 'api', namespace: 'shop' },
      { type: 'k8s-scale', section: 'statefulsets', name: 'db', namespace: 'data', replicas: 2 },
    ],
  });
  const pending = await engine.runAutomation(saved.automation.id);
  assert.equal(pending.pending, true);
  assert.equal(calls.length, 0, 'nothing runs before approval');

  const approved = await engine.approve(pending.run.id);
  assert.equal(approved.run.status, 'succeeded');
  assert.deepEqual(calls, [
    { kind: 'restart', section: 'deployments', name: 'api', namespace: 'shop' },
    { kind: 'scale', section: 'statefulsets', name: 'db', namespace: 'data', replicas: 2 },
  ]);
  assert.ok(store.get().audit.some((entry) => entry.action === 'workload-restart'));
  assert.ok(store.get().audit.some((entry) => entry.action === 'workload-scale'));
});

test('automation: Kubernetes actions reject invalid or unsupported targets', async () => {
  const store = newStore(tmpDir());
  let calls = 0;
  const engine = new AutomationEngine({
    store,
    deps: {
      restartWorkload: async () => { calls += 1; return { ok: true }; },
      scaleWorkload: async () => { calls += 1; return { ok: true }; },
    },
  });
  // A crafted object name with a slash must never reach kubectl.
  const restart = engine.save({
    name: 'Unsafe restart',
    trigger: { type: 'schedule', everyMinutes: 60 },
    actions: [{ type: 'k8s-restart', section: 'deployments', name: 'api/../secret', namespace: 'shop' }],
    approval: 'always',
  });
  const pending = await engine.runAutomation(restart.automation.id);
  const approved = await engine.approve(pending.run.id);
  assert.equal(approved.run.status, 'failed');
  assert.match(approved.run.steps[0].detail, /valid workload name/i);
  assert.equal(calls, 0);

  // An invalid namespace is rejected before kubectl runs.
  const scale = engine.save({
    name: 'Unsafe scale',
    trigger: { type: 'schedule', everyMinutes: 60 },
    actions: [{ type: 'k8s-scale', section: 'deployments', name: 'api', namespace: 'Prod Cluster', replicas: 1 }],
    approval: 'always',
  });
  const scalePending = await engine.runAutomation(scale.automation.id);
  assert.notEqual(scale.automation.id, restart.automation.id, 'two workflows created in the same tick keep distinct ids');
  const scaleResult = await engine.approve(scalePending.run.id);
  assert.equal(scaleResult.run.status, 'failed');
  assert.match(scaleResult.run.steps[0].detail, /valid namespace/i);
  assert.equal(calls, 0);
});

test('automation: Compose restarts are approval gated and validated', async () => {
  const store = newStore(tmpDir());
  const projects = [];
  const engine = new AutomationEngine({
    store,
    deps: { restartCompose: async (project) => { projects.push(project); return { ok: true }; } },
  });
  const saved = engine.save({
    name: 'Restart the shop stack',
    trigger: { type: 'condition' },
    conditions: [{ type: 'resource-status', module: 'docker', status: 'unhealthy', operator: '>', threshold: 0 }],
    actions: [{ type: 'docker-compose-restart', project: 'shop' }],
  });
  assert.equal(saved.automation.approval, 'always', 'a Compose restart needs approval');

  const pending = await engine.runAutomation(saved.automation.id, { dryRun: false });
  // Conditions are not met because there is no resource collector here, so a
  // direct run is skipped rather than executed.
  assert.equal(pending.run.status, 'skipped');
  assert.equal(projects.length, 0);

  const direct = engine.save({
    name: 'Direct Compose restart',
    trigger: { type: 'schedule', everyMinutes: 60 },
    actions: [{ type: 'docker-compose-restart', project: 'shop' }],
    approval: 'always',
  });
  const approval = await engine.runAutomation(direct.automation.id);
  assert.equal(approval.pending, true);
  assert.equal(projects.length, 0);
  const approved = await engine.approve(approval.run.id);
  assert.equal(approved.run.status, 'succeeded');
  assert.deepEqual(projects, ['shop']);
  assert.ok(store.get().audit.some((entry) => entry.action === 'compose-restart'));

  const invalid = engine.save({
    name: 'Invalid Compose project',
    trigger: { type: 'schedule', everyMinutes: 60 },
    actions: [{ type: 'docker-compose-restart', project: '--volumes' }],
    approval: 'always',
  });
  const invalidPending = await engine.runAutomation(invalid.automation.id);
  const invalidRun = await engine.approve(invalidPending.run.id);
  assert.equal(invalidRun.run.status, 'failed');
  assert.match(invalidRun.run.steps[0].detail, /valid Compose project/i);
  assert.deepEqual(projects, ['shop'], 'the invalid project never reached Docker');
});

// ----------------------------------------------------------------------- RCA

test('rca: manual scope ranks a metric shift and states limitations', async () => {
  const now = Date.now();
  const from = now - 3600e3;
  const points = [];
  for (let i = 0; i <= 60; i += 1) {
    const t = from - 3600e3 + i * 120e3;
    points.push([t, t < from ? 20 : 96]);
  }
  const analyzer = new RootCauseAnalyzer({
    deps: {
      queryMetrics: async ({ names }) => ({
        ok: true,
        series: names[0] === 'system.cpu.usage'
          ? [{ name: 'system.cpu.usage', unit: 'percent', resource: 'local', labels: { host: 'local' }, points }]
          : [],
      }),
      queryLogs: async () => ({ ok: true, rows: [], total: 0 }),
      queryTraces: async () => ({ ok: true, rows: [], total: 0 }),
      listAlerts: async () => ({ items: [] }),
      listIncidents: async () => ({ items: [] }),
      changes: () => ({ items: [] }),
      resources: async () => [],
    },
  });
  const result = await analyzer.investigate({ scope: 'local', from, to: now, broad: true });
  assert.equal(result.ok, true);
  assert.equal(result.readOnly, true);
  assert.ok(result.facts.length > 0);
  assert.ok(result.hypotheses.length > 0);
  assert.ok(result.hypotheses.every((entry) => entry.confidence < 0.95), 'hypotheses are never certain');
  assert.ok(result.limitations.length > 0);
  assert.ok(result.evidence.metrics.some((metric) => metric.name === 'system.cpu.usage'));
});

test('rca: no subject is an error, not a fabricated report', async () => {
  const analyzer = new RootCauseAnalyzer({ deps: {} });
  const result = await analyzer.investigate({});
  assert.equal(result.ok, false);
  assert.match(result.error, /choose|nothing/i);
});

test('rca: a missing alert cannot be investigated', async () => {
  const analyzer = new RootCauseAnalyzer({
    deps: {
      listAlerts: async () => ({ items: [] }),
      queryMetrics: async () => ({ ok: true, series: [] }),
    },
  });
  const result = await analyzer.investigate({ alertId: 'gone' });
  assert.equal(result.ok, false);
  assert.match(result.error, /alert/i);
});

// ------------------------------------------------------------- resources

test('resources: container and Kubernetes status mapping is explicit', () => {
  assert.equal(resourceTest.statusOfContainer({ state: 'running', status: 'Up 2 hours (healthy)' }).status, 'healthy');
  assert.equal(resourceTest.statusOfContainer({ state: 'running', status: 'Up 2 hours (unhealthy)' }).status, 'unhealthy');
  assert.equal(resourceTest.statusOfContainer({ state: 'exited', status: 'Exited (1) 2 hours ago' }).status, 'stopped');
  assert.equal(resourceTest.statusOfContainer({ state: 'restarting', status: 'Restarting' }).status, 'degraded');
  assert.equal(resourceTest.statusOfK8s('green'), 'healthy');
  assert.equal(resourceTest.statusOfK8s('amber'), 'degraded');
  assert.equal(resourceTest.statusOfK8s('red'), 'unhealthy');
  assert.equal(resourceTest.statusOfK8s(undefined), 'unknown');
});
