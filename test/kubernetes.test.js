'use strict';

/**
 * Kubernetes service tests. These cover the argument guards, output trimming
 * and the local kubeconfig registry. No cluster, kubectl process or Electron
 * runtime is involved.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { __test } = require('../src/main/kubernetes');
const { KubeRegistry } = require('../src/main/kubernetes/registry');
const { scrub } = require('../src/main/kubernetes/exec');

const { trimNode, trimNamespace, validContext, validNamespace, countLines } = __test;

test('context and namespace names are validated before they become argv values', () => {
  for (const name of ['minikube', 'kind-dev', 'gke_project_zone_cluster', 'arn:aws:eks:eu-west-1:1:cluster/x', 'team@cluster']) {
    assert.equal(validContext(name), true, name);
  }
  for (const name of ['', '--context', 'a\nb', ' a', '-cluster', 'x'.repeat(254)]) {
    assert.equal(validContext(name), false, name);
  }
  for (const name of ['default', 'kube-system', 'team-a', 'a']) assert.equal(validNamespace(name), true, name);
  for (const name of ['', 'Default', '-team', 'team-', 'a_b', 'x'.repeat(64), 'a/b']) {
    assert.equal(validNamespace(name), false, name);
  }
});

test('node and namespace objects are trimmed to renderer-safe fields', () => {
  const node = trimNode({
    metadata: {
      name: 'node-a',
      labels: { 'node-role.kubernetes.io/control-plane': '', 'node-role.kubernetes.io/worker': '' },
      creationTimestamp: '2026-01-01T00:00:00Z',
    },
    status: {
      conditions: [{ type: 'Ready', status: 'True' }],
      addresses: [{ type: 'InternalIP', address: '10.0.0.5' }],
      allocatable: { cpu: '4', memory: '8Gi', pods: '110' },
      nodeInfo: { kubeletVersion: 'v1.31.0', operatingSystem: 'linux', architecture: 'amd64', containerRuntimeVersion: 'containerd://1.7' },
    },
  });
  assert.equal(node.name, 'node-a');
  assert.equal(node.ready, true);
  assert.deepEqual(node.roles, ['control-plane', 'worker']);
  assert.equal(node.internalIP, '10.0.0.5');
  assert.equal(node.version, 'v1.31.0');
  assert.equal(node.cpu, '4');
  assert.deepEqual(trimNamespace({ metadata: { name: 'team', creationTimestamp: '2026-01-01T00:00:00Z' }, status: { phase: 'Active' } }), {
    name: 'team', status: 'Active', created: '2026-01-01T00:00:00Z',
  });
  assert.equal(countLines('a\n\n b \r\nc').length, 3);
});

test('command output scrubs credentials and certificate data', () => {
  const text = scrub('Authorization: Bearer abcdefghijklmnop\npassword=hunter2\nclient-key-data: MIIEvQ==\nimage: nginx');
  assert.ok(!text.includes('abcdefghijklmnop'));
  assert.ok(!text.includes('hunter2'));
  assert.ok(!text.includes('MIIEvQ'));
  assert.ok(text.includes('nginx'));
});

test('the kubeconfig registry copies imports into app storage and never edits the source', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsdeck-k8s-test-'));
  const previous = process.env.KUBECONFIG;
  try {
    const source = path.join(dir, 'config.yaml');
    const content = 'apiVersion: v1\nkind: Config\ncontexts: []\n';
    fs.writeFileSync(source, content, 'utf8');
    process.env.KUBECONFIG = source;
    const registry = new KubeRegistry({ getPath: () => path.join(dir, 'userData') });
    assert.deepEqual(registry.basePaths(), [path.resolve(source)]);

    assert.deepEqual(registry.settings(), { context: '', namespace: 'default' });
    assert.deepEqual(registry.saveSettings({ context: 'dev', namespace: 'team-a' }), { context: 'dev', namespace: 'team-a' });
    assert.deepEqual(registry.settings(), { context: 'dev', namespace: 'team-a' });

    const copy = registry.copyImport(source, content);
    assert.match(copy.id, /^kc_[a-f0-9]{16}$/);
    assert.equal(fs.statSync(copy.file).mode & 0o777, 0o600);
    assert.notEqual(path.resolve(copy.file), path.resolve(source));

    registry.addImport({ ...copy, label: 'local', contexts: ['dev'], importedAt: '2026-01-01T00:00:00Z' });
    const sources = registry.sources();
    assert.equal(sources.length, 2);
    assert.equal(sources[0].imported, false);
    assert.equal(sources[1].id, copy.id);
    assert.equal(sources[1].imported, true);

    const removed = registry.removeImport(copy.id);
    assert.equal(removed.id, copy.id);
    assert.equal(fs.existsSync(copy.file), false);
    assert.equal(fs.readFileSync(source, 'utf8'), content);
  } finally {
    if (previous === undefined) delete process.env.KUBECONFIG;
    else process.env.KUBECONFIG = previous;
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
