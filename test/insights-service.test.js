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

test('service: query library saves, filters, exports and imports real entries', () => {
  const { instance, dir } = service({});
  try {
    instance.querySave({
      name: 'Slow orders', sql: 'select * from orders where total > 100 order by created_at',
      engine: 'postgres', connectionId: 'prod', connectionName: 'Prod', database: 'shop',
      description: 'Large orders to review', tags: ['orders', 'performance'], author: 'ada',
    });
    instance.querySave({
      name: 'Recent users', sql: 'select * from users order by id desc limit 50',
      engine: 'mysql', connectionId: 'dev', connectionName: 'Dev', tags: ['users'], author: 'grace',
    });

    const all = instance.queryLibrary({});
    assert.equal(all.ok, true);
    assert.equal(all.total, 2);
    assert.equal(all.items[0].name, 'Recent users', 'newest query is listed first');
    assert.deepEqual(all.tags.slice().sort(), ['orders', 'performance', 'users']);

    assert.deepEqual(instance.queryLibrary({ query: 'slow orders' }).items.map((entry) => entry.name), ['Slow orders']);
    assert.deepEqual(instance.queryLibrary({ query: 'grace' }).items.map((entry) => entry.name), ['Recent users']);
    assert.equal(instance.queryLibrary({ engine: 'mysql' }).items.length, 1);
    assert.equal(instance.queryLibrary({ connectionId: 'prod' }).items.length, 1);
    assert.equal(instance.queryLibrary({ tag: 'performance' }).items.length, 1);

    const exported = instance.libraryExport();
    assert.equal(exported.kind, 'opsdeck-database-library');
    assert.equal(exported.queries.length, 2);
    assert.equal(exported.notes.length, 0);
    assert.ok(!JSON.stringify(exported).includes('"password"'), 'the export never reads connection secrets');

    // A teammate can merge the file into a different install.
    const other = service({});
    try {
      const merged = other.instance.libraryImport(exported);
      assert.equal(merged.ok, true);
      assert.equal(merged.queries, 2);
      assert.equal(merged.notes, 0);
      assert.equal(other.instance.queryLibrary({}).total, 2);
      assert.equal(other.instance.libraryImport({ kind: 'unrelated' }).ok, false);
      const partial = other.instance.libraryImport({ queries: [{ name: 'Broken' }, { name: 'Works', sql: 'select 1' }] });
      assert.equal(partial.ok, true);
      assert.equal(partial.queries, 1);
      assert.equal(partial.skipped.length, 1);
    } finally {
      other.instance.dispose();
      fs.rmSync(other.dir, { recursive: true, force: true });
    }

    assert.equal(instance.queryDelete(all.items[0].id).removed, true);
    assert.equal(instance.queryLibrary({}).total, 1);
  } finally {
    instance.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('service: notes are scoped to one database object', () => {
  const { instance, dir } = service({});
  try {
    instance.noteSave({
      connectionId: 'prod', database: 'shop', schema: 'public', table: 'orders',
      body: 'The customer index was added by migration 41.', author: 'ada',
    });
    instance.noteSave({
      connectionId: 'prod', database: 'shop', schema: 'public', table: 'customers',
      body: 'Contains personal data; mask before export.', author: 'grace',
    });
    const orders = instance.notes({ connectionId: 'prod', database: 'shop', table: 'orders' });
    assert.equal(orders.items.length, 1);
    assert.match(orders.items[0].body, /migration 41/);
    assert.equal(instance.notes({ table: 'customers' }).items[0].author, 'grace');
    assert.equal(instance.notes({ database: 'other' }).items.length, 0);

    const exported = instance.libraryExport();
    assert.equal(exported.notes.length, 2);

    assert.equal(instance.noteDelete(orders.items[0].id).removed, true);
    assert.equal(instance.notes({ table: 'orders' }).items.length, 0);
    assert.equal(instance.notes({}).total, 1);
  } finally {
    instance.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('service: deployment evidence reads Kubernetes and Docker independently', async () => {
  const kubernetes = {
    contextState: async () => ({ selected: 'prod' }),
    kubeJson: async (args, options) => {
      assert.deepEqual(args.slice(0, 2), ['get', 'replicasets']);
      assert.equal(options.context, 'prod');
      return {
        ok: true,
        data: {
          items: [{
            metadata: {
              name: 'api-abc', namespace: 'shop', creationTimestamp: '2026-01-01T10:00:00.000Z',
              annotations: { 'deployment.kubernetes.io/revision': '4' },
              ownerReferences: [{ kind: 'Deployment', name: 'api' }],
            },
            spec: { replicas: 2, template: { spec: { containers: [{ image: 'shop/api:4' }] } } },
            status: { readyReplicas: 2, availableReplicas: 2 },
          }],
        },
      };
    },
  };
  const docker = {
    containersList: async () => ({ ok: true, items: [{ id: 'c1', name: 'web', image: 'shop/web:1', state: 'running', createdAt: '2026-01-02T10:00:00.000Z' }] }),
  };
  const { instance } = service({ kubernetes, docker });
  try {
    const result = await instance.deployments({ limit: 10 });
    assert.equal(result.ok, true);
    assert.equal(result.items.length, 2);
    assert.equal(result.summary.kubernetes, 1);
    assert.equal(result.summary.docker, 1);

    // A denied kubectl call must not hide the Docker records.
    instance.kubernetes.kubeJson = async () => ({ ok: false, stderr: 'forbidden: cannot list replicasets' });
    const partial = await instance.deployments({});
    assert.equal(partial.items.length, 1);
    assert.equal(partial.sources.kubernetes.ok, false);
    assert.match(partial.sources.kubernetes.error, /forbidden/);
    assert.equal(partial.sources.docker.ok, true);
  } finally {
    instance.dispose();
  }
});

test('service: automation forwards Kubernetes restarts and scales through resourceAction', async () => {
  const calls = [];
  let compose = null;
  const docker = {
    composeAction: async (project, action) => {
      compose = { project, action };
      return { ok: true };
    },
  };
  const kubernetes = {
    resourceAction: async (section, action, options) => {
      calls.push({ section, action, ...options });
      return { ok: true, message: `${action} requested.` };
    },
  };
  const { instance, dir } = service({ kubernetes, docker });
  try {
    assert.equal((await instance.restartWorkload({ section: 'deployments', name: 'api', namespace: 'shop' })).ok, true);
    assert.equal((await instance.restartWorkload({ section: 'deployments', name: '', namespace: 'shop' })).ok, false);
    assert.equal((await instance.scaleWorkload({ section: 'statefulsets', name: 'db', namespace: 'data', replicas: 3 })).ok, true);
    assert.equal((await instance.restartCompose('shop')).ok, true);
    assert.deepEqual(compose, { project: 'shop', action: 'restart' });
    assert.deepEqual(calls, [
      { section: 'deployments', action: 'restart', name: 'api', namespace: 'shop' },
      { section: 'statefulsets', action: 'scale', name: 'db', namespace: 'data', replicas: 3 },
    ]);
  } finally {
    instance.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
