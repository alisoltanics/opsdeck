'use strict';

/**
 * Module intelligence tests.
 *
 * Every analyser is fed fixtures shaped like the data the real module
 * services return, so the tests verify the reasoning rules rather than a
 * mocked UI. No Docker engine, cluster or database is contacted.
 */
const test = require('node:test');
const assert = require('node:assert/strict');

const {
  databaseHealth, analyzeSchema, analyzeQueryHistory, analyzeWorkloads, databaseForecast,
  schemaFingerprint, diffSchemaSnapshots,
  analyzeDockerSecurity, analyzeDockerImages, analyzeDockerResources, analyzeDockerCompose,
  analyzeDockerOptimizer, compareDockerEnvironments,
  analyzeKubernetesHealth, analyzeKubernetesSecurity, analyzeKubernetesStorage,
  analyzeKubernetesNetwork, analyzeKubernetesOptimization, analyzeKubernetesCost,
  analyzeKubernetesGitOps, analyzeKubernetesTroubleshooting, kubernetesInsights,
  analyzeMultiCluster, analyzeDeployments,
  observabilityAnomalies, observabilityCapacity, observabilitySlos,
  observabilityDependencies, observabilityProfiles,
  __test,
} = require('../src/main/intelligence/insights');

function series(name, points, extra = {}) {
  return { name, resource: 'local', unit: 'percent', labels: {}, points, ...extra };
}

// ------------------------------------------------------------------ database

test('database: health scores measured checks and ignores unknown ones', () => {
  const healthy = databaseHealth({
    connection: { status: { state: 'connected' } },
    metrics: {
      available: true, cacheHitRatio: 99.4, activeConnections: 4, maxConnections: 100,
      longRunning: [], deadlocks: 0, idleInTransaction: 0, tempBytes: 0,
    },
    diagnostics: { steps: [] },
  });
  assert.equal(healthy.status, 'healthy');
  assert.ok(healthy.score >= 90);
  assert.equal(healthy.findings.length, 0);
  assert.ok(healthy.checks.some((entry) => entry.id === 'cache' && entry.status === 'pass'));

  const degraded = databaseHealth({
    connection: { status: { state: 'connected' } },
    metrics: {
      available: true, cacheHitRatio: 70, activeConnections: 95, maxConnections: 100,
      longRunning: [{ seconds: 300, blocked_by: 2, query: 'update orders' }], deadlocks: 3,
    },
    diagnostics: { steps: [] },
  });
  assert.equal(degraded.status, 'unhealthy');
  assert.ok(degraded.score < 60);
  assert.ok(degraded.findings.some((entry) => entry.severity === 'critical'));
  assert.ok(degraded.findings.some((entry) => /Blocked statements/i.test(entry.title)));

  const unknown = databaseHealth({ connection: {}, metrics: { available: false }, diagnostics: { steps: [] } });
  assert.equal(unknown.score, null);
  assert.equal(unknown.status, 'unknown');
  assert.ok(unknown.unknown.length > 0);
});

test('database: schema finds missing keys, unindexed foreign keys and duplicates', () => {
  const explorer = {
    engine: 'postgres',
    relations: [
      { schema: 'public', name: 'orders', kind: 'table', row_estimate: 500000, size_bytes: 2 * 1024 ** 3 },
      { schema: 'public', name: 'events', kind: 'table', row_estimate: 90000, size_bytes: 1024 },
    ],
    columns: [
      { schema: 'public', table: 'orders', name: 'id', key: 'PRI' },
      { schema: 'public', table: 'orders', name: 'customer_id' },
      { schema: 'public', table: 'events', name: 'payload' },
    ],
    indexes: [
      { schema: 'public', table: 'orders', name: 'orders_pkey', definition: 'CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)' },
      { schema: 'public', table: 'orders', name: 'orders_customer_idx', definition: 'CREATE INDEX orders_customer_idx ON public.orders USING btree (customer_id)' },
      { schema: 'public', table: 'orders', name: 'orders_customer_idx2', definition: 'CREATE INDEX orders_customer_idx2 ON public.orders USING btree (customer_id)' },
    ],
    constraints: [
      { table: 'orders', name: 'orders_pkey', type: 'PRIMARY KEY', column: 'id' },
      { table: 'orders', name: 'orders_customer_fk', type: 'FOREIGN KEY', column: 'customer_id', ref_table: 'customers' },
      { table: 'events', name: 'events_order_fk', type: 'FOREIGN KEY', column: 'order_id', ref_table: 'orders' },
    ],
  };
  const result = analyzeSchema(explorer);
  assert.equal(result.supported, true);
  assert.equal(result.tables, 2);
  assert.equal(result.stats.foreignKeys, 2);
  assert.ok(result.findings.some((entry) => /no primary key/i.test(entry.title) && entry.resource === 'events'));
  assert.ok(result.findings.some((entry) => /supporting index/i.test(entry.title) && entry.resource === 'events'));
  assert.ok(result.findings.some((entry) => /duplicate index/i.test(entry.title)));
  assert.ok(result.findings.some((entry) => /large table/i.test(entry.title) && entry.resource === 'orders'));
  assert.equal(result.findings.filter((entry) => /supporting index/i.test(entry.title) && entry.resource === 'orders').length, 0);
});

test('database: dependencies only follow declared foreign keys and detect cycles', () => {
  const explorer = {
    engine: 'postgres',
    relations: [
      { schema: 'public', name: 'customers', kind: 'table', row_estimate: 100, size_bytes: 4096 },
      { schema: 'public', name: 'orders', kind: 'table', row_estimate: 500, size_bytes: 8192 },
      { schema: 'public', name: 'order_items', kind: 'table', row_estimate: 900, size_bytes: 16384 },
      { schema: 'public', name: 'audit_log', kind: 'table', row_estimate: 30, size_bytes: 2048 },
    ],
    columns: [
      { schema: 'public', table: 'customers', name: 'id', key: 'PRI' },
      { schema: 'public', table: 'customers', name: 'primary_order_id' },
      { schema: 'public', table: 'orders', name: 'id', key: 'PRI' },
      { schema: 'public', table: 'orders', name: 'customer_id' },
      { schema: 'public', table: 'order_items', name: 'id', key: 'PRI' },
      { schema: 'public', table: 'order_items', name: 'order_id' },
    ],
    indexes: [],
    constraints: [
      { schema: 'public', table: 'orders', name: 'orders_customer_fk', type: 'FOREIGN KEY', column: 'customer_id', ref_schema: 'public', ref_table: 'customers' },
      { schema: 'public', table: 'order_items', name: 'items_order_fk', type: 'FOREIGN KEY', column: 'order_id', ref_schema: 'public', ref_table: 'orders' },
      { schema: 'public', table: 'customers', name: 'customers_order_fk', type: 'FOREIGN KEY', column: 'primary_order_id', ref_schema: 'public', ref_table: 'orders' },
    ],
  };
  const result = analyzeSchema(explorer);
  const deps = result.dependencies;
  assert.equal(deps.supported, true);
  assert.equal(deps.stats.tables, 4);
  assert.equal(deps.stats.edges, 3);
  assert.equal(deps.stats.external, 0);
  assert.ok(deps.edges.some((edge) => edge.fromLabel === 'public.order_items' && edge.toLabel === 'public.orders'));
  assert.ok(deps.edges.some((edge) => edge.columns.includes('customer_id')));
  assert.equal(deps.stats.cycles, 1);
  assert.ok(deps.cycles[0].nodes.includes('public.customers'));
  assert.ok(deps.cycles[0].nodes.includes('public.orders'));
  assert.equal(deps.mostReferenced[0].label, 'public.orders');
  assert.equal(deps.mostReferenced[0].incoming, 2);
  assert.deepEqual(deps.isolated.map((entry) => entry.label), ['public.audit_log']);
  assert.ok(result.findings.some((entry) => /circular foreign-key/i.test(entry.title)));
  // No edge is invented from a shared prefix or a naming convention.
  assert.ok(!deps.edges.some((edge) => edge.toLabel.includes('audit')));
});

test('database: dependencies keep referenced tables outside the schema visible', () => {
  const result = analyzeSchema({
    engine: 'mysql',
    relations: [{ schema: 'app', name: 'orders', kind: 'table', row_estimate: 10, size_bytes: 1024 }],
    columns: [{ schema: 'app', table: 'orders', name: 'id', key: 'PRI' }],
    indexes: [{ table: 'orders', name: 'PRIMARY', non_unique: 0, seq_in_index: 1, column_name: 'id' }],
    constraints: [{ schema: 'app', table: 'orders', name: 'orders_user_fk', type: 'FOREIGN KEY', column: 'user_id', ref_schema: 'auth', ref_table: 'users' }],
  });
  assert.equal(result.dependencies.supported, true);
  assert.equal(result.dependencies.stats.external, 1);
  assert.equal(result.dependencies.edges[0].toLabel, 'auth.users');
  assert.equal(result.dependencies.edges[0].toKnown, false);
});

test('database: schema understands MySQL index rows and a missing default', () => {
  const explorer = {
    engine: 'mysql',
    relations: [{ schema: 'shop', name: 'users', kind: 'BASE TABLE', row_estimate: 10 }],
    columns: [{ schema: 'shop', table: 'users', name: 'id' }, { schema: 'shop', table: 'users', name: 'email' }],
    indexes: [
      { table: 'users', name: 'PRIMARY', non_unique: 0, seq_in_index: 1, column_name: 'id' },
      { table: 'users', name: 'email_idx', non_unique: 0, seq_in_index: 1, column_name: 'email' },
    ],
    constraints: [{ table: 'users', name: 'PRIMARY', type: 'PRIMARY KEY', column: 'id' }],
  };
  const result = analyzeSchema(explorer);
  assert.equal(result.indexes, 2);
  assert.equal(result.tableStats[0].primary, true);
  assert.equal(result.findings.filter((entry) => /no primary key/i.test(entry.title)).length, 0);
});

test('database: schema fingerprint is deterministic and ignores data volumes', () => {
  const base = {
    engine: 'postgres',
    relations: [
      { schema: 'public', name: 'orders', kind: 'table', row_estimate: 10, size_bytes: 1024 },
      { schema: 'public', name: 'customers', kind: 'table', row_estimate: 5, size_bytes: 512 },
    ],
    columns: [
      { schema: 'public', table: 'orders', name: 'id', type: 'bigint', nullable: 'NO', key: 'PRI' },
      { schema: 'public', table: 'orders', name: 'customer_id', type: 'bigint', nullable: 'NO' },
      { schema: 'public', table: 'customers', name: 'id', type: 'bigint', nullable: 'NO', key: 'PRI' },
    ],
    indexes: [
      { schema: 'public', table: 'orders', name: 'orders_pkey', definition: 'CREATE UNIQUE INDEX orders_pkey ON public.orders USING btree (id)' },
    ],
    constraints: [
      { schema: 'public', table: 'orders', name: 'orders_customer_fk', type: 'FOREIGN KEY', column: 'customer_id', ref_schema: 'public', ref_table: 'customers' },
    ],
  };
  const first = schemaFingerprint(base);
  assert.equal(first.counts.tables, 2);
  assert.equal(first.counts.columns, 3);
  assert.equal(first.counts.indexes, 1);
  assert.equal(first.counts.foreignKeys, 1);

  // Row counts and sizes are data, not structure.
  const grown = schemaFingerprint({
    ...base,
    relations: base.relations.map((relation) => ({ ...relation, row_estimate: 999999, size_bytes: 8 * 1024 ** 3 })),
  });
  assert.equal(grown.hash, first.hash);

  // The order the engine returns objects in does not create a false change.
  const reordered = schemaFingerprint({
    ...base,
    relations: base.relations.slice().reverse(),
    columns: base.columns.slice().reverse(),
  });
  assert.equal(reordered.hash, first.hash);

  const changed = schemaFingerprint({
    ...base,
    columns: base.columns.map((column) => (column.name === 'customer_id' ? { ...column, nullable: 'YES' } : column)),
  });
  assert.notEqual(changed.hash, first.hash);
});

test('database: schema diff reports only real structural changes', () => {
  const before = schemaFingerprint({
    engine: 'postgres',
    relations: [
      { schema: 'public', name: 'orders', kind: 'table' },
      { schema: 'public', name: 'legacy', kind: 'table' },
    ],
    columns: [
      { schema: 'public', table: 'orders', name: 'id', type: 'bigint', nullable: 'NO', key: 'PRI' },
      { schema: 'public', table: 'orders', name: 'status', type: 'text', nullable: 'YES' },
      { schema: 'public', table: 'legacy', name: 'id', type: 'int', nullable: 'NO' },
    ],
    indexes: [
      { schema: 'public', table: 'orders', name: 'orders_status_idx', definition: 'CREATE INDEX orders_status_idx ON orders (status)' },
    ],
    constraints: [],
  });
  const after = schemaFingerprint({
    engine: 'postgres',
    relations: [
      { schema: 'public', name: 'orders', kind: 'table' },
      { schema: 'public', name: 'audit', kind: 'table' },
    ],
    columns: [
      { schema: 'public', table: 'orders', name: 'id', type: 'bigint', nullable: 'NO', key: 'PRI' },
      { schema: 'public', table: 'orders', name: 'status', type: 'varchar(20)', nullable: 'NO' },
      { schema: 'public', table: 'orders', name: 'customer_id', type: 'bigint', nullable: 'YES' },
      { schema: 'public', table: 'audit', name: 'id', type: 'bigint', nullable: 'NO' },
    ],
    indexes: [
      { schema: 'public', table: 'orders', name: 'orders_customer_idx', definition: 'CREATE INDEX orders_customer_idx ON orders (customer_id)' },
      { schema: 'public', table: 'orders', name: 'orders_status_idx', definition: 'CREATE INDEX orders_status_idx ON orders (id)' },
    ],
    constraints: [
      { schema: 'public', table: 'orders', name: 'orders_customer_fk', type: 'FOREIGN KEY', column: 'customer_id', ref_table: 'customers' },
    ],
  });
  const diff = diffSchemaSnapshots(before, after);
  assert.equal(diff.available, true);
  assert.equal(diff.baseline, false);
  assert.equal(diff.changed, true);
  assert.equal(diff.summary.tablesAdded, 1);
  assert.equal(diff.summary.tablesRemoved, 1);
  assert.equal(diff.summary.columnsAdded, 1);
  assert.equal(diff.summary.columnsRemoved, 0);
  assert.equal(diff.summary.columnsChanged, 1);
  assert.equal(diff.summary.indexesAdded, 1);
  assert.equal(diff.summary.indexesRemoved, 0);
  assert.equal(diff.summary.indexesChanged, 1);
  assert.equal(diff.summary.foreignKeysAdded, 1);
  const kinds = new Set(diff.changes.map((change) => change.type));
  assert.ok(kinds.has('table-added'));
  assert.ok(kinds.has('table-removed'));
  assert.ok(kinds.has('column-changed'));
  assert.ok(kinds.has('foreign-key-added'));
  assert.ok(!diff.changes.some((change) => change.name === 'status' && change.type === 'column-added'));

  const baseline = diffSchemaSnapshots(null, after);
  assert.equal(baseline.baseline, true);
  assert.equal(baseline.changed, false);
  assert.equal(baseline.changes.length, 0);
});

test('database: schema diff reports no change for an identical capture', () => {
  const snapshot = schemaFingerprint({
    engine: 'sqlite',
    relations: [{ schema: 'main', name: 'people', kind: 'table' }],
    columns: [
      { schema: 'main', table: 'people', name: 'id', type: 'INTEGER', nullable: 'NO', key: 'PRI' },
      { schema: 'main', table: 'people', name: 'name', type: 'TEXT', nullable: 'YES' },
    ],
    indexes: [],
    constraints: [],
  });
  const diff = diffSchemaSnapshots(snapshot, snapshot);
  assert.equal(diff.changed, false);
  assert.deepEqual(diff.changes, []);
  assert.equal(diff.summary.tablesAdded + diff.summary.columnsChanged, 0);
});

test('database: query history groups literal variants and flags a slow regression', () => {
  const now = Date.now();
  const items = [];
  const add = (offset, durationMs, ok = true) => items.push({
    id: `h-${offset}`, at: new Date(now - 3600e3 + offset).toISOString(),
    sql: `select * from orders where id = ${offset}`, ok, durationMs,
  });
  for (let i = 0; i < 10; i += 1) add(i * 1000, i < 5 ? 40 : 400);
  add(20000, 900, false);
  add(21000, 900, false);
  add(22000, 900, false);
  const result = analyzeQueryHistory(items);
  assert.equal(result.statements.length, 1);
  assert.equal(result.statements[0].runs, 13);
  assert.equal(result.statements[0].failures, 3);
  assert.ok(result.statements[0].regression);
  assert.ok(result.statements[0].regression.changePct > 100);
  assert.ok(result.findings.some((entry) => /became slower/i.test(entry.title)));
  assert.ok(result.findings.some((entry) => /keeps failing/i.test(entry.title)));
  assert.equal(__test.normalizeSql('SELECT 1; -- x'), 'select ?;');
});

test('database: workloads only report real blocked and long statements', () => {
  const result = analyzeWorkloads({
    available: true,
    activeConnections: 2,
    maxConnections: 10,
    longRunning: [
      { pid: 1, usename: 'app', state: 'active', seconds: 120, blocked_by: 1, query: 'delete from jobs' },
      { pid: 2, usename: 'app', state: 'active', seconds: 2, blocked_by: 0, query: 'select 1' },
    ],
    idleInTransaction: 1,
  });
  assert.equal(result.rows.length, 2);
  assert.ok(result.findings.some((entry) => entry.severity === 'critical' && /blocked/i.test(entry.title)));
  assert.ok(result.findings.some((entry) => /idle transactions/i.test(entry.title)));
  const empty = analyzeWorkloads({ available: false, reason: 'Not supported' });
  assert.deepEqual(empty.findings, []);
  assert.deepEqual(empty.limitations, ['Not supported']);
});

test('database: forecasts use injected metric history and state confidence', async () => {
  const now = Date.now();
  const points = Array.from({ length: 60 }, (_, i) => [now - 6 * 3600e3 + i * 6 * 60e3, 40 + i]);
  const result = await databaseForecast({
    resource: 'database:one',
    queryMetrics: async ({ names }) => ({
      ok: true,
      series: names[0] === 'database.connections.usage' ? [series(names[0], points)] : [],
    }),
  });
  assert.equal(result.supported, true);
  const usage = result.series.find((entry) => entry.name === 'database.connections.usage');
  assert.ok(usage.current > 40);
  assert.ok(usage.forecast);
  assert.ok(usage.forecast.confidence > 0.3);
  assert.ok(result.limitations.length > 0, 'missing series are reported');
});

// -------------------------------------------------------------------- docker

function inspect(overrides = {}) {
  return {
    id: 'c1', name: 'web', image: 'nginx:latest',
    env: [{ key: 'TOKEN', value: '••••••••', sensitive: true }],
    mounts: [], networks: { bridge: {} }, restartPolicy: { Name: 'unless-stopped' },
    resources: { memory: 0, nanoCpus: 0 },
    security: { privileged: false, user: '', readonlyRootfs: false, networkMode: 'bridge', capAdd: [], devices: 0, noNewPrivileges: false },
    labels: { 'com.docker.compose.project': 'shop', 'com.docker.compose.service': 'web' },
    ...overrides,
  };
}

test('docker: security converts inspect flags into graded issues', () => {
  const result = analyzeDockerSecurity([
    inspect(),
    inspect({
      id: 'c2', name: 'agent',
      mounts: [{ source: '/var/run/docker.sock', destination: '/var/run/docker.sock' }],
      security: { privileged: true, user: 'root', readonlyRootfs: false, networkMode: 'host', capAdd: ['SYS_ADMIN'], devices: 2, noNewPrivileges: false },
    }),
  ]);
  assert.equal(result.stats.inspected, 2);
  assert.equal(result.stats.critical, 3);
  const agent = result.containers.find((entry) => entry.name === 'agent');
  assert.equal(agent.grade, 'F');
  assert.ok(agent.issues.some((issue) => /Privileged/i.test(issue.title)));
  assert.ok(agent.issues.some((issue) => /runtime socket/i.test(issue.title)));
  const web = result.containers.find((entry) => entry.name === 'web');
  assert.ok(web.issues.some((issue) => /root/i.test(issue.title)));
});

test('docker: image hygiene reports dangling, latest and unused images', () => {
  const result = analyzeDockerImages([
    { id: '1', name: '<none>:<none>', size: '1.2GB', dangling: true },
    { id: '2', name: 'nginx:latest', size: '200MB', dangling: false },
    { id: '3', name: 'postgres:16', size: '400MB', dangling: false },
  ], [{ image: 'nginx:latest' }]);
  assert.equal(result.dangling, 1);
  assert.equal(result.latest, 1);
  assert.equal(result.unused, 1);
  assert.ok(result.findings.some((entry) => /dangling/i.test(entry.title)));
  assert.ok(result.findings.some((entry) => /latest tag/i.test(entry.title)));
});

test('docker: resources use the container mount and network lists', () => {
  const result = analyzeDockerResources({
    volumes: [{ name: 'data' }, { name: 'cache' }],
    networks: [{ name: 'shop_default' }, { name: 'unused_net' }, { name: 'bridge' }],
    containers: [{ mounts: 'data:/var/lib/data', networks: ['shop_default'] }],
    stats: [{ name: 'web', cpu: 95, memory: 40 }],
  });
  assert.equal(result.volumes.unused, 1);
  assert.equal(result.networks.unused, 1);
  assert.ok(result.findings.some((entry) => /network/i.test(entry.title)));
  assert.ok(result.findings.some((entry) => /pressure/i.test(entry.title)));
});

test('docker: compose and optimizer only flag observed problems', () => {
  const compose = analyzeDockerCompose([
    { name: 'shop', containers: 3, running: 2 },
    { name: 'ok', containers: 2, running: 2 },
  ]);
  assert.equal(compose.findings.length, 1);
  assert.equal(compose.findings[0].resource, 'shop');

  const optimizer = analyzeDockerOptimizer({
    containers: [{ id: 'c1', name: 'web', status: 'Restarting (1)' }],
    inspects: [inspect({ restartPolicy: { Name: 'no' } })],
    images: [],
    stats: [],
  });
  assert.ok(optimizer.stats.memoryWithoutLimit >= 1);
  assert.ok(optimizer.findings.some((entry) => /restarting/i.test(entry.title)));
  assert.ok(optimizer.findings.some((entry) => /restart policy/i.test(entry.title)));
});

test('docker: environment comparison reports missing keys but masks secrets', () => {
  const result = compareDockerEnvironments([
    inspect({ name: 'shop-web-1', env: [{ key: 'MODE', value: 'web' }, { key: 'TOKEN', value: '••••••••', sensitive: true }] }),
    inspect({ name: 'shop-worker-1', env: [{ key: 'MODE', value: 'worker' }] }),
  ]);
  assert.equal(result.available, true);
  const project = result.projects[0];
  assert.equal(project.name, 'shop');
  assert.ok(project.differences.some((entry) => entry.key === 'MODE'));
  const token = project.differences.find((entry) => entry.key === 'TOKEN');
  assert.ok(token);
  assert.equal(token.values.find((entry) => entry.name === 'shop-web-1').value, '••••');
  assert.ok(project.differences.every((entry) => !JSON.stringify(entry.values).includes('••••••••')));
});

// ---------------------------------------------------------------- kubernetes

function pod(name, overrides = {}) {
  return {
    metadata: { name, namespace: 'shop' },
    spec: { containers: [{ name: 'app', image: 'app:1', resources: {} }], ...(overrides.spec || {}) },
    status: { phase: 'Running', containerStatuses: [{ name: 'app', ready: true, restartCount: 0 }], ...(overrides.status || {}) },
    ...overrides,
  };
}

test('kubernetes: health reports unready nodes, pending pods and unavailable deployments', () => {
  const result = analyzeKubernetesHealth({
    pods: [
      pod('ok'),
      pod('pending', { status: { phase: 'Pending' } }),
      pod('crash', { status: { containerStatuses: [{ ready: false, state: { waiting: { reason: 'CrashLoopBackOff' } }, restartCount: 8 }] } }),
    ],
    nodes: [{ metadata: { name: 'node-1', labels: {} }, status: { conditions: [{ type: 'Ready', status: 'False', message: 'kubelet down' }], allocatable: { cpu: '4', memory: '8Gi' } } }],
    deployments: [{ metadata: { name: 'api', namespace: 'shop' }, spec: { replicas: 3 }, status: { availableReplicas: 1 } }],
    jobs: [{ metadata: { name: 'migrate', namespace: 'shop' }, status: { failed: 2 } }],
  });
  assert.equal(result.health.nodesReady, 0);
  assert.equal(result.pods.problems, 2);
  assert.equal(result.workloads.unavailable, 1);
  assert.ok(result.findings.some((entry) => entry.severity === 'critical' && /Node is not ready/i.test(entry.title)));
  assert.ok(result.findings.some((entry) => /CrashLoopBackOff/.test(entry.title)));
  assert.ok(result.findings.some((entry) => /Deployment is unavailable/i.test(entry.title)));
});

test('kubernetes: security inspects pod spec and cluster-admin bindings', () => {
  const result = analyzeKubernetesSecurity({
    pods: [pod('risky', {
      spec: {
        hostNetwork: true,
        volumes: [{ name: 'root', hostPath: { path: '/' } }],
        containers: [{ name: 'app', image: 'x', securityContext: { privileged: true, capabilities: { add: ['SYS_ADMIN'] } } }],
      },
    })],
    clusterRoleBindings: [{ metadata: { name: 'break-glass' }, roleRef: { name: 'cluster-admin' }, subjects: [{ kind: 'User', name: 'alice' }] }],
    serviceAccounts: [{ metadata: { name: 'default' }, automountServiceAccountToken: true }],
  });
  assert.equal(result.stats.privileged, 1);
  assert.equal(result.stats.hostPath, 1);
  assert.equal(result.stats.clusterAdminBindings, 1);
  assert.ok(result.findings.some((entry) => /cluster-admin/i.test(entry.title)));
  assert.ok(result.findings.some((entry) => /Privileged container/i.test(entry.title)));
});

test('kubernetes: storage and network findings are evidence based', () => {
  const storage = analyzeKubernetesStorage({
    pvcs: [{ metadata: { name: 'data', namespace: 'shop' }, status: { phase: 'Pending' }, spec: { resources: { requests: { storage: '10Gi' } } } }],
    pvs: [{ metadata: { name: 'pv-1' }, status: { phase: 'Released' }, spec: { capacity: { storage: '10Gi' } } }],
    storageClasses: [{ metadata: { name: 'standard', annotations: {} } }],
  });
  assert.ok(storage.findings.some((entry) => /No default StorageClass/i.test(entry.title)));
  assert.ok(storage.findings.some((entry) => /PVC is Pending/i.test(entry.title)));

  const network = analyzeKubernetesNetwork({
    services: [{ metadata: { name: 'api', namespace: 'shop' }, spec: { selector: { app: 'api' }, type: 'ClusterIP', ports: [{ port: 80 }] } }],
    endpoints: [],
    ingresses: [{ metadata: { name: 'web', namespace: 'shop' }, spec: { rules: [{ host: 'shop.example' }] } }],
    networkPolicies: [],
  });
  assert.ok(network.findings.some((entry) => /no ready endpoints/i.test(entry.title)));
  assert.ok(network.findings.some((entry) => /no TLS/i.test(entry.title)));
  assert.equal(network.stats.namespacesWithoutPolicy, 1);
});

test('kubernetes: optimization flags missing requests and huge limit gaps', () => {
  const result = analyzeKubernetesOptimization({
    pods: [pod('app', { spec: { containers: [{ name: 'app', resources: { requests: { cpu: '100m' }, limits: { cpu: '4' } } }] } })],
    deployments: [{ metadata: { name: 'web', namespace: 'shop' }, spec: { template: { spec: { containers: [{ name: 'web', image: 'web:latest' }] } } } }],
  });
  assert.equal(result.stats.withoutRequests, 0);
  assert.ok(result.findings.some((entry) => /far above request/i.test(entry.title)));
  assert.ok(result.findings.some((entry) => /latest tag/i.test(entry.title)));
  assert.equal(__test.parseQuantity('1500m'), 1.5);
  assert.equal(__test.parseQuantity('2Gi'), 2147483648);
});

test('kubernetes: cost stays null until prices are configured', () => {
  const pods = [pod('app', { spec: { containers: [{ name: 'app', resources: { requests: { cpu: '500m', memory: '1Gi' } } }] } })];
  const nodes = [{ metadata: { name: 'n1' }, status: { allocatable: { cpu: '4', memory: '8Gi' } } }];
  const unpriced = analyzeKubernetesCost({ pods, nodes, cost: {} });
  assert.equal(unpriced.priced, false);
  assert.equal(unpriced.totals.costMonth, null);
  assert.equal(unpriced.namespaces[0].costMonth, null);
  assert.ok(unpriced.findings.some((entry) => /not configured/i.test(entry.title)));

  const priced = analyzeKubernetesCost({ pods, nodes, cost: { cpuHour: 0.04, memoryGbHour: 0.005, currency: 'USD' } });
  assert.equal(priced.priced, true);
  assert.ok(priced.totals.costMonth > 0);
  assert.equal(priced.currency, 'USD');
});

test('kubernetes: GitOps is detected only from visible controllers', () => {
  const none = analyzeKubernetesGitOps({ namespaces: [{ metadata: { name: 'shop' } }] });
  assert.equal(none.detected, false);
  assert.ok(none.limitations.length);
  const argo = analyzeKubernetesGitOps({ namespaces: [{ metadata: { name: 'argocd' } }], apiGroups: 'applications.argoproj.io' });
  assert.equal(argo.detected, true);
  assert.equal(argo.argo, true);
});

test('kubernetes: troubleshooting prioritises warning events and restart loops', () => {
  const result = analyzeKubernetesTroubleshooting({
    events: [
      { type: 'Warning', reason: 'BackOff', count: 5, involvedObject: { kind: 'Pod', namespace: 'shop', name: 'app' }, message: 'restarting failed container' },
      { type: 'Normal', reason: 'Pulled', involvedObject: { kind: 'Pod', name: 'app' } },
    ],
    pods: [pod('app', { status: { containerStatuses: [{ ready: false, restartCount: 12, state: { waiting: { reason: 'CrashLoopBackOff' } } }] } })],
  });
  assert.equal(result.warningEvents, 1);
  assert.ok(result.findings.some((entry) => /BackOff/.test(entry.title)));
  assert.ok(result.findings.some((entry) => /restarts repeatedly/i.test(entry.title)));
});

test('kubernetes: combined report deduplicates and carries limitations', () => {
  const report = kubernetesInsights({
    context: 'kind-dev', namespace: 'shop',
    items: {
      pods: [pod('app')], nodes: [], deployments: [], services: [], pvcs: [], pvs: [],
      storageclasses: [], ingresses: [], networkpolicies: [], endpoints: [], events: [],
      clusterrolebindings: [], serviceaccounts: [], statefulsets: [], daemonsets: [], jobs: [],
      namespaces: [{ metadata: { name: 'shop' } }], apiGroups: '',
    },
    errors: { events: 'forbidden' },
  }, {});
  assert.equal(report.ok, true);
  assert.equal(report.context, 'kind-dev');
  assert.ok(Array.isArray(report.findings));
  assert.ok(report.limitations.some((entry) => /events: forbidden/.test(entry)));
  assert.ok(report.counts.critical + report.counts.warning + report.counts.info >= 0);
});

// ------------------------------------------------------------- observability

test('kubernetes: multi-cluster comparison isolates unreachable contexts', () => {
  const result = analyzeMultiCluster({
    selected: 'prod',
    checkedAt: '2026-01-01T10:00:00.000Z',
    contexts: [
      {
        name: 'prod', cluster: 'eks', ok: true,
        nodes: { ok: true, total: 3, ready: 2 },
        pods: { ok: true, total: 10, running: 8, problem: 2 },
        deployments: { ok: true, total: 4, available: 3 },
        warningEvents: { ok: true, count: 5 },
      },
      { name: 'dev', cluster: 'kind', ok: false, error: 'connection refused' },
      {
        name: 'stage', cluster: '', ok: true,
        nodes: { ok: false, error: 'forbidden' },
        pods: { ok: false, error: 'forbidden' },
        deployments: { ok: false, error: 'forbidden' },
        warningEvents: { ok: false, error: 'forbidden' },
      },
    ],
  });
  assert.equal(result.ok, true);
  assert.equal(result.available, true);
  assert.equal(result.selected, 'prod');
  assert.equal(result.totals.contexts, 3);
  assert.equal(result.totals.reachable, 2);
  assert.equal(result.totals.nodes, 3);
  assert.equal(result.totals.nodesReady, 2);
  assert.equal(result.totals.podsProblem, 2);
  assert.equal(result.contexts.find((entry) => entry.name === 'dev').ok, false);
  const stage = result.contexts.find((entry) => entry.name === 'stage');
  assert.equal(stage.nodesTotal, null, 'a failed request is not rendered as zero nodes');
  assert.ok(result.findings.some((entry) => /unreachable/i.test(entry.title) && entry.resource === 'dev'));
  assert.ok(result.findings.some((entry) => /unready nodes/i.test(entry.title) && entry.resource === 'prod'));
  assert.ok(result.findings.some((entry) => /unhealthy pods/i.test(entry.title)));
  assert.ok(result.findings.some((entry) => /unavailable deployments/i.test(entry.title)));
  assert.ok(result.limitations.some((entry) => /stage: node counts are unavailable/i.test(entry)));
});

test('deployments: Kubernetes ReplicaSets and Docker records are merged honestly', () => {
  const result = analyzeDeployments({
    context: 'prod',
    sources: { kubernetes: { ok: true, count: 3 }, docker: { ok: true, count: 1 } },
    replicasets: [
      {
        metadata: {
          name: 'api-7d8f', namespace: 'shop', creationTimestamp: '2026-01-02T10:00:00.000Z',
          annotations: { 'deployment.kubernetes.io/revision': '7', 'kubernetes.io/change-cause': 'bump image to 1.2.3' },
          ownerReferences: [{ kind: 'Deployment', name: 'api' }],
        },
        spec: { replicas: 3, template: { spec: { containers: [{ image: 'shop/api:1.2.3' }] } } },
        status: { readyReplicas: 2, availableReplicas: 2 },
      },
      {
        metadata: {
          name: 'api-old', namespace: 'shop', creationTimestamp: '2026-01-01T10:00:00.000Z',
          annotations: { 'deployment.kubernetes.io/revision': '6' },
          ownerReferences: [{ kind: 'Deployment', name: 'api' }],
        },
        spec: { replicas: 0, template: { spec: { containers: [{ image: 'shop/api:1.2.2' }] } } },
        status: {},
      },
      {
        metadata: { name: 'orphan-rs', namespace: 'shop', creationTimestamp: '2026-01-02T12:00:00.000Z' },
        spec: { replicas: 1, template: { spec: { containers: [{ image: 'no/owner:1' }] } } },
        status: { readyReplicas: 1 },
      },
    ],
    containers: [{
      id: 'c1', name: 'shop-web-1', compose: 'shop', service: 'web', image: 'shop/web:latest',
      state: 'running', status: 'Up 2 hours', createdAt: '2026-01-03T10:00:00.000Z',
    }],
  });
  assert.equal(result.ok, true);
  assert.equal(result.items.length, 3, 'a ReplicaSet without a Deployment owner is not a rollout');
  assert.equal(result.summary.total, 3);
  assert.equal(result.summary.kubernetes, 2);
  assert.equal(result.summary.docker, 1);
  assert.equal(result.summary.progressing, 1);
  assert.equal(result.items[0].source, 'docker');
  assert.equal(result.items[0].workload, 'shop/web');
  const active = result.items.find((item) => item.workload === 'api');
  assert.equal(active.state, 'progressing');
  assert.equal(active.version, '7');
  assert.match(active.image, /1\.2\.3/);
  assert.match(active.detail, /2\/3 replica/);
  assert.match(active.detail, /bump image/);
  assert.equal(active.context, 'prod');
  assert.equal(result.items.find((item) => item.workload === 'api' && item.version === '6').state, 'superseded');
  assert.ok(result.items.every((item) => item.source === 'kubernetes' || item.source === 'docker'));
});

test('deployments: an unavailable source is reported without hiding the other', () => {
  const result = analyzeDeployments({
    sources: { kubernetes: { ok: false, error: 'forbidden' }, docker: { ok: true, count: 1 } },
    containers: [{ id: 'c9', name: 'worker', image: 'shop/worker:2', state: 'exited', createdAt: '2026-01-04T10:00:00.000Z' }],
  });
  assert.equal(result.items.length, 1);
  assert.equal(result.sources.kubernetes.ok, false);
  assert.equal(result.sources.docker.ok, true);
  assert.ok(result.limitations.some((entry) => /garbage-collected/i.test(entry)));
});

test('observability: SLO error budgets are computed from real samples', async () => {
  const now = Date.now();
  const up = Array.from({ length: 20 }, (_, i) => [now - 20 * 60e3 + i * 60e3, i < 10 ? 0 : 1]);
  const result = await observabilitySlos({
    definitions: [{ id: 'a', name: 'API up', metric: 'synthetic.up', comparison: 'gte', threshold: 1, target: 99, windowHours: 24, aggregation: 'avg', enabled: true }],
    queryMetrics: async () => ({ ok: true, series: [series('synthetic.up', up, { unit: 'count' })] }),
  });
  assert.equal(result.available, true);
  const slo = result.slos[0];
  assert.equal(slo.achieved, 50);
  assert.equal(slo.status, 'breached');
  assert.equal(slo.errorBudgetConsumed, 100);
  assert.ok(result.findings.some((entry) => entry.severity === 'critical'));
});

test('observability: anomalies and capacity come from retained series', async () => {
  const now = Date.now();
  const points = Array.from({ length: 40 }, (_, i) => [now - 40 * 60e3 + i * 60e3, i === 35 ? 95 : 50 + (i % 2)]);
  const anomalies = await observabilityAnomalies({
    queryMetrics: async ({ names }) => ({ ok: true, series: [series(names[0], points)] }),
    metrics: ['system.cpu.usage'],
  });
  assert.equal(anomalies.available, true);
  assert.ok(anomalies.anomalies.length >= 1);
  assert.ok(anomalies.findings[0].title.includes('system.cpu.usage'));

  const disk = Array.from({ length: 40 }, (_, i) => [now - 40 * 3600e3 + i * 3600e3, 10 + i * 0.002]);
  const capacity = await observabilityCapacity({
    queryMetrics: async ({ names }) => ({ ok: true, series: names[0] === 'system.disk.usage' ? [series(names[0], disk)] : [] }),
    thresholds: { disk: 95 },
  });
  assert.equal(capacity.available, true);
  assert.ok(capacity.series[0].slopePerDay > 0);
  assert.equal(capacity.findings.length, 0, 'a series far below the threshold is not flagged');

  const high = Array.from({ length: 40 }, (_, i) => [now - 40 * 3600e3 + i * 3600e3, 70 + i * 0.5]);
  const breached = await observabilityCapacity({
    queryMetrics: async ({ names }) => ({ ok: true, series: names[0] === 'system.disk.usage' ? [series(names[0], high)] : [] }),
    thresholds: { disk: 75 },
  });
  assert.ok(breached.findings.some((entry) => /already above/i.test(entry.title)));
});

test('observability: dependencies use span parents and peer services only', () => {
  const traces = [
    { id: '1', traceId: 't', parentId: '', service: 'gateway', operation: 'GET /', durationMs: 50, error: false },
    { id: '2', traceId: 't', parentId: '1', service: 'orders', operation: 'GET /orders', durationMs: 640, error: true },
    { id: '3', traceId: 't', parentId: '2', service: 'postgres', operation: 'SELECT', durationMs: 30, error: false, peerService: 'db' },
  ];
  const result = observabilityDependencies(traces);
  assert.equal(result.available, true);
  assert.equal(result.services.length, 3);
  const edge = result.edges.find((entry) => entry.from === 'gateway' && entry.to === 'orders');
  assert.equal(edge.calls, 1);
  assert.equal(edge.errors, 1);
  assert.ok(result.findings.some((entry) => /failing/i.test(entry.title)));
  const empty = observabilityDependencies([]);
  assert.equal(empty.available, false);
  assert.ok(empty.limitations.length);
});

test('observability: profiles summarise latency percentiles per service', () => {
  const traces = Array.from({ length: 10 }, (_, i) => ({
    id: `s${i}`, traceId: 't', service: 'orders', operation: 'query', durationMs: 10 + i * 10, error: i === 9,
  }));
  const result = observabilityProfiles(traces);
  assert.equal(result.available, true);
  assert.equal(result.services[0].service, 'orders');
  assert.ok(result.services[0].p95Ms >= 90);
  assert.equal(result.services[0].errorRate, 10);
});
