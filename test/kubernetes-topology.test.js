'use strict';

/**
 * Cluster topology tests.
 *
 * Pure data only: no Electron, no kubectl and no cluster. The fixtures mimic
 * real API objects closely enough to prove relationship resolution, cap logic
 * and renderer-safe output.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { buildTopology, __test } = require('../src/main/kubernetes/topology');

const meta = (name, namespace, extra = {}) => ({
  name,
  namespace,
  uid: `${namespace}-${name}-uid`,
  creationTimestamp: '2026-01-01T00:00:00Z',
  ...extra,
});

function deployment(name, namespace, labels, extra = {}) {
  return {
    metadata: meta(name, namespace, { labels }),
    spec: {
      replicas: 2,
      selector: { matchLabels: labels },
      template: { metadata: { labels }, spec: { containers: [{ name: 'app', image: `example/${name}:1.0` }] } },
    },
    status: { readyReplicas: 2, availableReplicas: 2, updatedReplicas: 2, ...extra },
  };
}

function pod(name, namespace, labels, owner, extra = {}) {
  return {
    metadata: meta(name, namespace, {
      labels,
      ownerReferences: owner ? [{ kind: owner.kind, name: owner.name, uid: owner.uid, controller: true }] : [],
    }),
    spec: { nodeName: 'node-a', containers: [{ name: 'app', image: 'example/app:1.0' }] },
    status: {
      phase: 'Running',
      containerStatuses: [{ ready: true, restartCount: 0 }],
      ...extra,
    },
  };
}

const base = () => {
  const webLabels = { app: 'web', tier: 'frontend' };
  const apiLabels = { app: 'api' };
  const webUid = 'default-web-uid';
  const apiUid = 'default-api-uid';
  return {
    namespaces: [
      { metadata: meta('default', ''), status: { phase: 'Active' } },
      { metadata: meta('kube-system', ''), status: { phase: 'Active' } },
    ],
    nodes: [
      {
        metadata: meta('node-a', '', { labels: { 'node-role.kubernetes.io/control-plane': '' } }),
        status: {
          conditions: [{ type: 'Ready', status: 'True' }],
          addresses: [{ type: 'InternalIP', address: '172.18.0.2' }],
          allocatable: { cpu: '4', memory: '8Gi', pods: '110' },
          nodeInfo: { kubeletVersion: 'v1.31.0', osImage: 'Debian' },
        },
      },
    ],
    pods: [
      pod('web-1', 'default', webLabels, { kind: 'ReplicaSet', name: 'web-abc', uid: 'rs-web' }),
      pod('web-2', 'default', webLabels, { kind: 'ReplicaSet', name: 'web-abc', uid: 'rs-web' }),
      pod('api-1', 'default', apiLabels, { kind: 'ReplicaSet', name: 'api-abc', uid: 'rs-api' }),
      pod('solo-1', 'default', { app: 'solo' }, null),
      pod('noisy-1', 'default', { app: 'noisy' }, null, {
        phase: 'Pending', containerStatuses: [{ ready: false, restartCount: 3 }],
      }),
    ],
    deployments: [
      { ...deployment('web', 'default', webLabels), metadata: { ...meta('web', 'default', { labels: webLabels }), uid: webUid } },
      { ...deployment('api', 'default', apiLabels), metadata: { ...meta('api', 'default', { labels: apiLabels }), uid: apiUid } },
    ],
    statefulsets: [],
    daemonsets: [],
    services: [
      {
        metadata: meta('web', 'default'),
        spec: { type: 'ClusterIP', clusterIP: '10.0.0.10', selector: { app: 'web' }, ports: [{ port: 80, targetPort: 8080 }] },
      },
      {
        metadata: meta('solo', 'default'),
        spec: { type: 'ClusterIP', clusterIP: '10.0.0.11', selector: { app: 'solo' }, ports: [{ port: 9000, targetPort: 9000 }] },
      },
    ],
    ingresses: [
      {
        metadata: meta('public', 'default'),
        spec: {
          ingressClassName: 'nginx',
          rules: [{ host: 'demo.local', http: { paths: [{ path: '/', backend: { service: { name: 'web', port: { number: 80 } } } }] } }],
          tls: [{ hosts: ['demo.local'] }],
        },
      },
    ],
    warnings: [
      {
        metadata: meta('', 'default'),
        involvedObject: { kind: 'Pod', name: 'noisy-1', namespace: 'default' },
        reason: 'BackOff',
        message: 'Back-off restarting failed container',
        count: 3,
        lastTimestamp: '2026-01-01T00:10:00Z',
      },
    ],
    inventory: { configmaps: 4, secrets: 2, jobs: 1 },
    collectedAt: '2026-01-01T00:00:00Z',
  };
};

test('selector matching supports equality maps, matchLabels and matchExpressions', () => {
  assert.equal(__test.matchesSelector({ app: 'web', tier: 'ui' }, { app: 'web' }), true);
  assert.equal(__test.matchesSelector({ app: 'web' }, { app: 'api' }), false);
  assert.equal(__test.matchesSelector({}, {}), false);
  assert.equal(__test.matchesLabelSelector({ app: 'web', tier: 'ui' }, { matchLabels: { app: 'web' } }), true);
  assert.equal(__test.matchesLabelSelector({ app: 'web', tier: 'ui' }, {
    matchExpressions: [{ key: 'tier', operator: 'In', values: ['ui', 'edge'] }],
  }), true);
  assert.equal(__test.matchesLabelSelector({ app: 'web' }, {
    matchExpressions: [{ key: 'tier', operator: 'Exists' }],
  }), false);
  assert.equal(__test.matchesLabelSelector({ app: 'web', tier: 'ui' }, {
    matchExpressions: [{ key: 'tier', operator: 'NotIn', values: ['ui'] }],
  }), false);
});

test('topology resolves ingress → service → workload → pod and keeps standalone pods', () => {
  const model = buildTopology(base(), { context: 'kind-test', namespace: 'default' });
  const ids = new Set(model.edges.map((edge) => `${edge.from} -> ${edge.to}`));

  assert.ok(ids.has('ingress:default:public -> service:default:web'));
  assert.ok(ids.has('service:default:web -> deployment:default:web'));
  assert.ok(ids.has('deployment:default:web -> pod:default:web-1'));
  assert.ok(ids.has('deployment:default:web -> pod:default:web-2'));
  assert.ok(ids.has('service:default:solo -> pod:default:solo-1'));

  const band = model.namespaces.find((entry) => entry.name === 'default');
  assert.ok(band);
  assert.equal(band.totals.pods, 5);
  assert.equal(band.standalone, 2);
  assert.ok(band.pods.some((entry) => entry.name === 'noisy-1'));
  assert.equal(model.stats.pending, 1);
  assert.equal(model.stats.unhealthyPods, 1);
  assert.equal(model.stats.nodesReady, 1);
  assert.equal(model.nodes[0].pods, 5);
  assert.equal(model.nodes[0].roles[0], 'control-plane');
});

test('topology keeps inventory counts and never carries Secret or ConfigMap data', () => {
  const raw = base();
  raw.inventory.secrets = 2;
  const model = buildTopology(raw, { context: 'kind-test' });
  const inventory = Object.fromEntries(model.inventory.map((entry) => [entry.id, entry.count]));
  assert.equal(inventory.secrets, 2);
  assert.equal(inventory.configmaps, 4);
  assert.equal(inventory.jobs, 1);

  const serialized = JSON.stringify(model);
  assert.equal(/stringData|"data"\s*:/.test(serialized), false);
  assert.equal(serialized.includes('password'), false);
});

test('topology caps large namespaces and reports truncation without inventing edges', () => {
  const raw = base();
  raw.pods = Array.from({ length: 40 }, (_value, index) =>
    pod(`web-${index}`, 'default', { app: 'web' }, { kind: 'ReplicaSet', name: 'web-abc', uid: 'rs-web' }));
  raw.services = Array.from({ length: 20 }, (_value, index) => ({
    metadata: meta(`svc-${index}`, 'default'),
    spec: { type: 'ClusterIP', selector: { app: 'web' }, ports: [{ port: 80 }] },
  }));
  const model = buildTopology(raw, { context: 'kind-test' });
  const band = model.namespaces.find((entry) => entry.name === 'default');
  assert.equal(band.totals.pods, 40);
  assert.ok(band.pods.length <= __test.LIMITS.podsPerNamespace);
  assert.ok(band.truncated.pods > 0);
  assert.ok(band.services.length <= __test.LIMITS.servicesPerNamespace);
  for (const edge of model.edges) {
    const known = band.pods.some((entry) => entry.id === edge.from || entry.id === edge.to)
      || band.services.some((entry) => entry.id === edge.from || entry.id === edge.to)
      || band.workloads.some((entry) => entry.id === edge.from || entry.id === edge.to)
      || band.ingresses.some((entry) => entry.id === edge.from || entry.id === edge.to);
    assert.ok(known, `edge ${edge.id} should reference a visible component`);
  }
});

test('topology survives partial cluster data', () => {
  const model = buildTopology({ errors: [{ resource: 'pods', error: 'timed out' }] }, { context: 'kind-test' });
  assert.equal(model.ok, true);
  assert.equal(model.errors[0].resource, 'pods');
  assert.equal(model.stats.pods, 0);
  assert.deepEqual(model.namespaces, []);
});
