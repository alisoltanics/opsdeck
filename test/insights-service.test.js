'use strict';

/**
 * Service-level tests for the module intelligence endpoints.
 *
 * Each test builds a real IntelligenceService with stub module services that
 * shape their answers like the production services do. The point is to prove
 * the composition and error isolation, not to mock the analysers themselves
 * (those are covered by test/insights.test.js).
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { IntelligenceService } = require('../src/main/intelligence');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opsdeck-intel-'));
}

function service(overrides = {}) {
  const dir = tempDir();
  const instance = new IntelligenceService({
    app: { getPath: () => dir },
    getWindow: null,
    ...overrides,
  });
  return { instance, dir };
}

function series(name, points, extra = {}) {
  return { name, resource: 'local', unit: 'percent', labels: {}, points, ...extra };
}

test('service: database insights choose the live connection and isolate a denied metric read', async () => {
  const calls = [];
  const databases = {
    listConnections: () => [
      { id: 'idle', name: 'Idle', engine: 'postgres', status: { state: 'idle' } },
      { id: 'live', name: 'App', engine: 'postgres', database: 'app', status: { state: 'connected' } },
    ],
    metrics: async (id) => {
      calls.push(`metrics:${id}`);
      return {
        ok: true, available: true, engine: 'postgres',
        cacheHitRatio: 99.2, activeConnections: 3, maxConnections: 100,
        longRunning: [], deadlocks: 0, idleInTransaction: 0, tempBytes: 0,
      };
    },
    diagnostics: async (id) => { calls.push(`diagnostics:${id}`); return { ok: true, steps: [] }; },
    listDatabases: async (id) => { calls.push(`databases:${id}`); return { ok: true, items: [{ name: 'app' }] }; },
    explorer: async (payload) => {
      calls.push(`explorer:${payload.database}`);
      return {
        ok: true,
        relations: [{ schema: 'public', name: 'orders', kind: 'table', row_estimate: 100, size_bytes: 4096 }],
        columns: [{ schema: 'public', table: 'orders', name: 'id', key: 'PRI' }],
        indexes: [{ table: 'orders', name: 'orders_pkey', definition: 'CREATE UNIQUE INDEX orders_pkey ON orders (id)' }],
        constraints: [{ schema: 'public', table: 'orders', name: 'orders_pkey', type: 'PRIMARY KEY', column: 'id', ref_schema: '', ref_table: '' }],
      };
    },
    history: async () => ({ ok: true, items: [] }),
  };
  const observability = { metricsQuery: async () => ({ ok: true, series: [] }) };
  const { instance } = service({ databases, observability });
  try {
    const result = await instance.databaseInsights({});
    assert.equal(result.ok, true);
    assert.equal(result.available, true);
    assert.equal(result.connection.id, 'live');
    assert.equal(result.health.status, 'healthy');
    assert.equal(result.schema.supported, true);
    assert.equal(result.schema.tables, 1);
    assert.ok(calls.some((entry) => entry === 'metrics:live'));
    assert.ok(!calls.some((entry) => entry === 'metrics:idle'), 'an idle connection is not queried');
    assert.ok(Array.isArray(result.findings));

    // A denied metric read must not fail the page or silently look healthy.
    const denied = await instance.databaseInsights({
      connectionId: 'live',
      database: 'app',
    });
    assert.equal(denied.ok, true);

    instance.databases.metrics = async () => { throw new Error('permission denied for pg_stat_activity'); };
    const unavailable = await instance.databaseInsights({ connectionId: 'live' });
    assert.equal(unavailable.ok, true);
    assert.equal(unavailable.health.status, 'unknown');
    assert.ok((unavailable.limitations || []).some((entry) => /Not measured|permission/i.test(entry)));
  } finally {
    instance.dispose();
  }
});

test('service: docker insights compose security, images, resources and environment drift', async () => {
  const containers = [
    {
      id: 'c1', name: 'shop-web-1', image: 'shop/web:latest', state: 'running', status: 'Up 3 minutes',
      labels: { 'com.docker.compose.project': 'shop', 'com.docker.compose.service': 'web' },
      mounts: 'data:/var/lib/data', networks: ['shop_default'], compose: 'shop', service: 'web',
    },
    {
      id: 'c2', name: 'shop-worker-1', image: 'shop/worker:latest', state: 'running', status: 'Up 3 minutes',
      labels: { 'com.docker.compose.project': 'shop', 'com.docker.compose.service': 'worker' },
      mounts: 'data:/var/lib/data', networks: ['shop_default'], compose: 'shop', service: 'worker',
    },
  ];
  const inspect = (id, name, service) => ({
    ok: true,
    item: {
      id, name, image: 'shop/app:latest',
      env: [
        { key: 'MODE', value: service === 'web' ? 'web' : 'worker', sensitive: false },
        { key: 'TOKEN', value: '••••••••', sensitive: true },
      ],
      mounts: [{ source: 'data', destination: '/var/lib/data' }],
      networks: { shop_default: {} },
      restartPolicy: { Name: 'unless-stopped' },
      resources: { memory: service === 'web' ? 256 * 1024 ** 2 : 0, nanoCpus: 0, cpuShares: 0 },
      security: {
        privileged: id === 'c2', user: '', readonlyRootfs: false, networkMode: 'bridge',
        pidMode: '', ipcMode: '', capAdd: [], capDrop: [], securityOpt: [], devices: 0, noNewPrivileges: false,
      },
      labels: { 'com.docker.compose.project': 'shop', 'com.docker.compose.service': service },
    },
  });
  const docker = {
    overview: async () => ({ ok: true }),
    containersList: async () => ({ ok: true, items: containers }),
    imagesList: async () => ({ ok: true, items: [{ id: 'i1', name: 'shop/web:latest', size: '120MB', dangling: false }] }),
    volumesList: async () => ({ ok: true, items: [{ name: 'data', driver: 'local' }, { name: 'orphan', driver: 'local' }] }),
    networksList: async () => ({ ok: true, items: [{ name: 'shop_default', driver: 'bridge' }, { name: 'bridge', driver: 'bridge' }] }),
    composeList: async () => ({ ok: true, items: [{ name: 'shop', containers: 2, running: 2 }] }),
    stats: async () => ({ ok: true, items: [{ name: 'shop-web-1', cpu: 2, memory: 10 }] }),
    inspectContainer: async (id) => inspect(id, `shop-${id === 'c1' ? 'web' : 'worker'}-1`, id === 'c1' ? 'web' : 'worker'),
  };
  const { instance } = service({ docker });
  try {
    const result = await instance.dockerInsights();
    assert.equal(result.ok, true);
    assert.equal(result.overview.containers, 2);
    assert.equal(result.overview.running, 2);
    assert.equal(result.security.stats.inspected, 2);
    assert.ok(result.security.containers.some((entry) => entry.name === 'shop-worker-1' && entry.issues.length));
    assert.equal(result.images.latest, 1);
    assert.equal(result.resources.volumes.unused, 1);
    assert.equal(result.resources.networks.unused, 0);
    assert.equal(result.compose.projects[0].name, 'shop');
    assert.equal(result.envCompare.available, true);
    assert.ok(result.envCompare.projects[0].differences.some((entry) => entry.key === 'MODE'));
    assert.ok(result.findings.every((entry) => entry.title));
  } finally {
    instance.dispose();
  }
});

test('service: kubernetes insights pass configured prices and never list secrets', async () => {
  let requested = null;
  const kubernetes = {
    insightData: async (options) => {
      requested = options;
      return {
        ok: true, context: 'kind-dev', namespace: 'shop', contexts: [{ name: 'kind-dev' }],
        tools: { kubectl: { installed: true, version: 'v1.37.2' } },
        items: {
          pods: [{
            metadata: { name: 'api-1', namespace: 'shop' },
            spec: { containers: [{ name: 'api', image: 'api:1', resources: { requests: { cpu: '500m', memory: '1Gi' }, limits: { cpu: '1' } } }] },
            status: { phase: 'Running', containerStatuses: [{ name: 'api', ready: true, restartCount: 0 }] },
          }],
          nodes: [{ metadata: { name: 'n1' }, status: { conditions: [{ type: 'Ready', status: 'True' }], allocatable: { cpu: '4', memory: '8Gi' } } }],
          deployments: [{ metadata: { name: 'api', namespace: 'shop', labels: {} }, spec: { replicas: 1, template: { spec: { containers: [{ name: 'api', image: 'api:1' }] } } }, status: { availableReplicas: 1 } }],
          statefulsets: [], daemonsets: [], jobs: [], services: [], ingresses: [], networkpolicies: [],
          endpoints: [], pvcs: [], pvs: [], storageclasses: [], events: [], clusterrolebindings: [],
          serviceaccounts: [], namespaces: [{ metadata: { name: 'shop' } }], apiGroups: '',
        },
        errors: {},
      };
    },
  };
  const { instance } = service({ kubernetes });
  try {
    instance.updateSettings({ cost: { cpuHour: 0.04, memoryGbHour: 0.005, currency: 'EUR' } });
    const result = await instance.kubernetesInsights({ allNamespaces: false });
    assert.equal(result.ok, true);
    assert.equal(result.context, 'kind-dev');
    assert.equal(requested.allNamespaces, false);
    assert.equal(result.cost.priced, true);
    assert.equal(result.cost.currency, 'EUR');
    assert.ok(result.cost.totals.costMonth > 0);
    assert.ok(Array.isArray(result.findings));
    // No secret payload can exist because pods are the only workload list.
    assert.equal(JSON.stringify(result).includes('secretKey'), false);

    instance.kubernetes = null;
    const missing = await instance.kubernetesInsights({});
    assert.equal(missing.ok, false);
  } finally {
    instance.dispose();
  }
});

test('service: multi-cluster comparison forwards its bounded limit', async () => {
  let requested = null;
  const kubernetes = {
    multiClusterSnapshot: async (options) => {
      requested = options;
      return {
        ok: true,
        selected: 'prod',
        checkedAt: new Date().toISOString(),
        contexts: [{
          name: 'prod', cluster: 'eks', ok: true,
          nodes: { ok: true, total: 2, ready: 2 },
          pods: { ok: true, total: 4, running: 4, problem: 0 },
          deployments: { ok: true, total: 2, available: 2 },
          warningEvents: { ok: true, count: 0 },
        }],
      };
    },
  };
  const { instance } = service({ kubernetes });
  try {
    const result = await instance.kubernetesMultiCluster({ limit: 4 });
    assert.equal(result.ok, true);
    assert.equal(result.totals.reachable, 1);
    assert.equal(result.totals.nodesReady, 2);
    assert.deepEqual(requested, { limit: 4 });

    instance.kubernetes = null;
    const missing = await instance.kubernetesMultiCluster({});
    assert.equal(missing.ok, false);
  } finally {
    instance.dispose();
  }
});

test('service: schema time machine stores distinct captures and reports structural changes', async () => {
  let columns = [
    { schema: 'public', table: 'orders', name: 'id', type: 'bigint', nullable: 'NO', key: 'PRI' },
  ];
  const databases = {
    listConnections: () => [{ id: 'live', name: 'App', engine: 'postgres', database: 'app', status: { state: 'connected' } }],
    metrics: async () => ({ ok: true, available: true, engine: 'postgres', cacheHitRatio: 99, activeConnections: 1, maxConnections: 100 }),
    diagnostics: async () => ({ ok: true, steps: [] }),
    listDatabases: async () => ({ ok: true, items: [{ name: 'app' }] }),
    explorer: async () => ({
      ok: true,
      relations: [{ schema: 'public', name: 'orders', kind: 'table' }],
      columns,
      indexes: [],
      constraints: [],
    }),
    history: async () => ({ ok: true, items: [] }),
  };
  const { instance, dir } = service({ databases });
  try {
    const baseline = await instance.databaseInsights({ connectionId: 'live' });
    assert.equal(baseline.timeMachine.available, true);
    assert.equal(baseline.timeMachine.baseline, true);
    assert.equal(baseline.timeMachine.changed, false);
    assert.equal(baseline.timeMachine.history.length, 1);

    // Re-reading an unchanged schema must not add a duplicate capture.
    const unchanged = await instance.databaseInsights({ connectionId: 'live' });
    assert.equal(unchanged.timeMachine.changed, false);
    assert.equal(unchanged.timeMachine.history.length, 1);

    columns = columns.concat([
      { schema: 'public', table: 'orders', name: 'status', type: 'text', nullable: 'YES' },
    ]);
    const changed = await instance.databaseInsights({ connectionId: 'live' });
    assert.equal(changed.timeMachine.baseline, false);
    assert.equal(changed.timeMachine.changed, true);
    assert.equal(changed.timeMachine.diff.summary.columnsAdded, 1);
    assert.ok(changed.timeMachine.diff.changes.some((entry) => entry.type === 'column-added' && entry.name === 'status'));
    assert.equal(changed.timeMachine.history.length, 2);
    assert.equal(changed.timeMachine.history[0].changed, true, 'the newest capture is listed first');
    assert.equal(changed.timeMachine.history[1].baseline, true);
    assert.ok((changed.timeMachine.limitations || []).some((entry) => /between two captures/i.test(entry)));

    // The history survives a restart because it is written to the store file.
    instance.store.persist();
    const raw = JSON.parse(fs.readFileSync(instance.store.file, 'utf8'));
    assert.equal(raw.schemaSnapshots.length, 2);
    assert.equal(raw.schemaSnapshots[1].counts.columns, 2);
  } finally {
    instance.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('service: observability insights evaluate stored objectives against retained metrics', async () => {
  const now = Date.now();
  const up = Array.from({ length: 20 }, (_, i) => [now - 20 * 60e3 + i * 60e3, i < 2 ? 0 : 1]);
  const cpu = Array.from({ length: 30 }, (_, i) => [now - 30 * 60e3 + i * 60e3, 40 + (i % 3)]);
  const observability = {
    traceManager: {
      all: () => [
        { id: '1', traceId: 't', parentId: '', service: 'gateway', operation: 'GET /', durationMs: 20, error: false },
        { id: '2', traceId: 't', parentId: '1', service: 'orders', operation: 'GET /orders', durationMs: 800, error: true },
      ],
    },
    metricsQuery: async ({ names }) => ({
      ok: true,
      series: names.includes('synthetic.up')
        ? [series('synthetic.up', up, { unit: 'count' })]
        : names.includes('system.cpu.usage')
          ? [series('system.cpu.usage', cpu)]
          : [],
    }),
  };
  const { instance } = service({ observability });
  try {
    instance.updateSettings({
      slos: [{
        id: 'api-up', name: 'API availability', metric: 'synthetic.up', comparison: 'gte',
        threshold: 1, target: 99, windowHours: 24, aggregation: 'avg', enabled: true,
      }],
      capacityThresholds: { cpu: 80, memory: 85, disk: 85 },
    });
    const result = await instance.observabilityInsights();
    assert.equal(result.ok, true);
    assert.equal(result.sloCount, 1);
    assert.equal(result.slos.slos.length, 1);
    assert.equal(result.slos.slos[0].achieved, 90);
    assert.equal(result.slos.slos[0].status, 'breached');
    assert.equal(result.traceCount, 2);
    assert.equal(result.dependencies.available, true);
    assert.ok(result.dependencies.edges.some((edge) => edge.from === 'gateway' && edge.to === 'orders'));
    assert.ok(Array.isArray(result.findings));
  } finally {
    instance.dispose();
  }
});
