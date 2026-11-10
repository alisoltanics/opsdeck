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
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { KubernetesService, __test } = require('../src/main/kubernetes');
const { KubeRegistry } = require('../src/main/kubernetes/registry');
const { scrub } = require('../src/main/kubernetes/exec');
const { RESOURCES, __test: resourceTest, actionArgs, actionsFor, sanitizeManifest, validObjectName } = require('../src/main/kubernetes/resources');
const {
  FALLBACK_VERSIONS,
  installTool,
  parseChecksum,
  resolveVersion,
  safeArchivePath,
  sha256,
  targetArch,
  targetPlatform,
  tarFiles,
  extractTarEntry,
  toolPlan,
  toolsPathEnv,
  readInstalled,
} = require('../src/main/kubernetes/install');

const { trimNode, trimNamespace, validContext, validNamespace, countLines } = __test;

function fakeExecutable(size = 4096) {
  const buffer = Buffer.alloc(size, 0x41);
  buffer.set([0x7f, 0x45, 0x4c, 0x46, 0x02, 0x01, 0x01, 0x00]);
  return buffer;
}

function tarEntry(name, data) {
  const header = Buffer.alloc(512);
  header.write(name, 0, 100, 'utf8');
  header.write('0000755\u0000', 100, 8, 'utf8');
  header.write(`${data.length.toString(8).padStart(11, '0')}\u0000`, 124, 12, 'utf8');
  header.write('0', 156, 1, 'utf8');
  header.fill(' ', 148, 156);
  let sum = 0;
  for (const byte of header) sum += byte;
  header.write(`${sum.toString(8).padStart(6, '0')}\u0000 `, 148, 8, 'utf8');
  const padding = Buffer.alloc((512 - (data.length % 512)) % 512);
  return Buffer.concat([header, data, padding]);
}

function fakeTarGz(entries) {
  return zlib.gzipSync(Buffer.concat([...entries.map(([name, data]) => tarEntry(name, data)), Buffer.alloc(1024)]));
}

function bufferResponse(buffer) {
  return {
    ok: true,
    status: 200,
    headers: { get: (name) => (String(name).toLowerCase() === 'content-length' ? String(buffer.length) : null) },
    body: (async function* stream() { yield buffer; })(),
  };
}

function fakeFetch(routes) {
  return async (url) => {
    if (Object.prototype.hasOwnProperty.call(routes, url)) {
      const value = routes[url];
      return bufferResponse(Buffer.isBuffer(value) ? value : Buffer.from(String(value), 'utf8'));
    }
    throw new Error(`unexpected download: ${url}`);
  };
}

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

test('installer maps platform and architecture names to release asset names', () => {
  assert.equal(targetPlatform('linux'), 'linux');
  assert.equal(targetPlatform('darwin'), 'darwin');
  assert.equal(targetPlatform('win32'), 'windows');
  assert.throws(() => targetPlatform('freebsd'));
  assert.equal(targetArch('x64'), 'amd64');
  assert.equal(targetArch('arm64'), 'arm64');
  assert.equal(targetArch('ia32'), '386');
  assert.equal(targetArch('ppc64'), 'ppc64le');
  assert.throws(() => targetArch('mips'));
});

test('checksums are parsed from raw and sha256sum formats', () => {
  const digest = 'a'.repeat(64);
  assert.equal(parseChecksum(`${digest}\n`), digest);
  assert.equal(parseChecksum(`${digest}  kubectl\n`), digest);
  assert.throws(() => parseChecksum('not a checksum'));
});

test('release plans use official endpoints and the right archive member', () => {
  const kubectl = toolPlan('kubectl', { version: 'v1.37.2', platform: 'linux', arch: 'x64' });
  assert.equal(kubectl.url, 'https://dl.k8s.io/release/v1.37.2/bin/linux/amd64/kubectl');
  assert.equal(kubectl.checksumUrl, `${kubectl.url}.sha256`);
  assert.equal(kubectl.checksumTarget, 'download');

  const kind = toolPlan('kind', { version: 'v0.33.0', platform: 'linux', arch: 'x64' });
  assert.equal(kind.url, 'https://github.com/kubernetes-sigs/kind/releases/download/v0.33.0/kind-linux-amd64');
  assert.equal(kind.checksumUrl, `${kind.url}.sha256sum`);

  const minikube = toolPlan('minikube', { version: 'v1.39.0', platform: 'linux', arch: 'x64' });
  assert.equal(minikube.url, 'https://github.com/kubernetes/minikube/releases/download/v1.39.0/minikube-linux-amd64.tar.gz');
  assert.equal(minikube.checksumUrl, 'https://github.com/kubernetes/minikube/releases/download/v1.39.0/minikube-linux-amd64.sha256');
  assert.equal(minikube.checksumTarget, 'extracted');
  assert.equal(minikube.entry, 'out/minikube-linux-amd64');

  const helm = toolPlan('helm', { version: 'v4.3.1', platform: 'linux', arch: 'x64' });
  assert.equal(helm.url, 'https://get.helm.sh/helm-v4.3.1-linux-amd64.tar.gz');
  assert.equal(helm.entry, 'linux-amd64/helm');
  assert.throws(() => toolPlan('helm', { version: 'v4.3.1', platform: 'win32', arch: 'x64' }));
  assert.throws(() => toolPlan('kubectl', { version: 'latest', platform: 'linux', arch: 'x64' }));
});

test('archive paths cannot escape the extraction root', () => {
  assert.equal(safeArchivePath('out/minikube-linux-amd64'), 'out/minikube-linux-amd64');
  assert.equal(safeArchivePath('./out/minikube-linux-amd64'), 'out/minikube-linux-amd64');
  assert.equal(safeArchivePath('out//minikube-linux-amd64'), 'out/minikube-linux-amd64');
  assert.equal(safeArchivePath('../evil'), null);
  assert.equal(safeArchivePath('out/../../evil'), null);
  assert.equal(safeArchivePath('/etc/passwd'), null);
  assert.equal(safeArchivePath('C:/Windows/system32/evil.exe'), null);
  assert.equal(safeArchivePath('out\\..\\evil'), null);

  const binary = fakeExecutable(1024);
  const archive = fakeTarGz([
    ['../evil', fakeExecutable(128)],
    ['out/minikube-linux-amd64', binary],
  ]);
  const files = tarFiles(archive);
  assert.deepEqual(files.map((file) => file.path), ['out/minikube-linux-amd64']);
  const extracted = extractTarEntry(archive, 'out/minikube-linux-amd64');
  assert.equal(extracted.path, 'out/minikube-linux-amd64');
  assert.deepEqual(extracted.data, binary);
  assert.throws(() => extractTarEntry(archive, 'out/missing'), /did not contain/);
});

test('a full fake install verifies the checksum and writes an executable atomically', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsdeck-k8s-install-'));
  const app = { getPath: () => dir };
  const binary = fakeExecutable(8192);
  const url = 'https://dl.k8s.io/release/v1.37.2/bin/linux/amd64/kubectl';
  const fetchImpl = fakeFetch({
    'https://dl.k8s.io/release/stable.txt': 'v1.37.2\n',
    [url]: binary,
    [`${url}.sha256`]: sha256(binary),
  });
  try {
    const result = await installTool('kubectl', { app, platform: 'linux', arch: 'x64', fetchImpl });
    assert.equal(result.version, 'v1.37.2');
    assert.equal(result.bytes, binary.length);
    const target = path.join(dir, 'k8s', 'tools', 'bin', 'kubectl');
    assert.equal(fs.existsSync(target), true);
    assert.equal(fs.statSync(target).mode & 0o777, 0o755);
    assert.deepEqual(fs.readFileSync(target), binary);
    assert.equal(readInstalled(app).kubectl.version, 'v1.37.2');
    assert.ok(toolsPathEnv(app).startsWith(path.join(dir, 'k8s', 'tools', 'bin') + path.delimiter));
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('a checksum mismatch installs nothing', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsdeck-k8s-install-'));
  const app = { getPath: () => dir };
  const binary = fakeExecutable(2048);
  const url = 'https://dl.k8s.io/release/v1.37.2/bin/linux/amd64/kubectl';
  const fetchImpl = fakeFetch({
    'https://dl.k8s.io/release/stable.txt': 'v1.37.2\n',
    [url]: binary,
    [`${url}.sha256`]: 'b'.repeat(64),
  });
  try {
    await assert.rejects(() => installTool('kubectl', { app, platform: 'linux', arch: 'x64', fetchImpl }), /checksum verification/);
    assert.equal(fs.existsSync(path.join(dir, 'k8s', 'tools', 'bin', 'kubectl')), false);
    assert.deepEqual(readInstalled(app), {});
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('release lookup falls back to a known version when the network is unavailable', async () => {
  const version = await resolveVersion('kind', {
    fetchImpl: async () => { throw new Error('offline'); },
  });
  assert.equal(version, FALLBACK_VERSIONS.kind);
});

test('every resource section has a real kubectl resource and a trimmer', () => {
  for (const [section, def] of Object.entries(RESOURCES)) {
    assert.ok(def.resource, section);
    assert.ok(Array.isArray(def.columns) && def.columns.length, section);
    assert.equal(typeof def.trim, 'function', section);
    assert.equal(typeof def.namespaced, 'boolean', section);
  }
  assert.equal(RESOURCES.pods.resource, 'pods');
  assert.equal(RESOURCES.deployments.resource, 'deployments.apps');
  assert.equal(RESOURCES.persistentvolumes.namespaced, false);
});

test('workload and network objects become compact, readable rows', () => {
  const pod = resourceTest.trimPod({
    metadata: { name: 'web-0', namespace: 'team', creationTimestamp: '2026-01-01T00:00:00Z' },
    spec: { nodeName: 'node-a', containers: [{ image: 'nginx:1.27' }, { image: 'sidecar:1' }] },
    status: {
      phase: 'Running',
      podIP: '10.1.2.3',
      containerStatuses: [{ ready: true, restartCount: 1 }, { ready: false, restartCount: 0 }],
    },
  });
  assert.equal(pod.name, 'web-0');
  assert.equal(pod.ready, 1);
  assert.equal(pod.total, 2);
  assert.equal(pod.restarts, 1);
  assert.equal(pod.cells[1].text, '1/2');
  assert.equal(pod.cells[5].badge, true);
  assert.equal(pod.cells[5].text, 'Running');

  const deployment = resourceTest.trimDeployment({
    metadata: { name: 'web', namespace: 'team', creationTimestamp: '2026-01-01T00:00:00Z' },
    spec: { replicas: 3, template: { spec: { containers: [{ image: 'nginx:1.27' }] } } },
    status: { readyReplicas: 2, updatedReplicas: 3, availableReplicas: 2 },
  });
  assert.equal(deployment.cells[1].text, '2/3');
  assert.equal(deployment.cells[5].text, 'Progressing');
  assert.equal(deployment.cells[4].text, 'nginx:1.27');

  const service = resourceTest.trimService({
    metadata: { name: 'web', namespace: 'team' },
    spec: { type: 'NodePort', clusterIP: '10.96.0.10', ports: [{ port: 80, protocol: 'TCP', nodePort: 30080 }], selector: { app: 'web' } },
  });
  assert.equal(service.cells[1].text, 'NodePort');
  assert.equal(service.cells[4].text, '80/TCP→30080');
  assert.equal(service.cells[5].text, 'app=web');
});

test('secret rows never contain secret values or data keys', () => {
  const secret = resourceTest.trimSecret({
    metadata: {
      name: 'db-password',
      namespace: 'team',
      annotations: { 'kubectl.kubernetes.io/last-applied-configuration': '{"data":{"password":"c2VjcmV0"}}' },
      creationTimestamp: '2026-01-01T00:00:00Z',
    },
    type: 'Opaque',
    data: { password: 'c2VjcmV0', token: 'YWJjZA==' },
    stringData: { extra: 'plain-text-secret' },
  });
  const serialized = JSON.stringify(secret);
  assert.ok(!serialized.includes('c2VjcmV0'));
  assert.ok(!serialized.includes('plain-text-secret'));
  assert.ok(!serialized.includes('YWJjZA=='));
  assert.equal(secret.cells[1].text, 'Opaque');
  assert.equal(secret.cells[2].text, '3');
});

test('event timestamps and job durations are formatted without locale assumptions', () => {
  assert.equal(resourceTest.duration('2026-01-01T00:00:00Z', '2026-01-01T00:02:10Z'), '2m');
  assert.equal(resourceTest.duration('2026-01-01T00:00:00Z', '2026-01-01T02:00:00Z'), '2h');
  const event = resourceTest.trimEvent({
    metadata: { name: 'web.1', namespace: 'team', creationTimestamp: '2026-01-01T00:00:00Z' },
    type: 'Warning',
    reason: 'BackOff',
    involvedObject: { kind: 'Pod', name: 'web-0' },
    count: 4,
    lastTimestamp: '2026-01-01T00:01:00Z',
    message: 'Back-off restarting failed container',
  });
  assert.equal(event.cells[0].text, 'Warning');
  assert.equal(event.cells[0].tone, 'amber');
  assert.equal(event.cells[2].text, 'Pod/web-0');
  assert.equal(event.cells[4].text, '4');
  assert.equal(event.cells[6].age, true);
});

test('manifests are sanitized before they reach the renderer', () => {
  const source = {
    metadata: {
      name: 'web-0',
      managedFields: [{ manager: 'kubectl' }],
      annotations: {
        'kubectl.kubernetes.io/last-applied-configuration': '{"data":{"password":"c2VjcmV0"}}',
        'example.com/owner': 'team-a',
      },
    },
    data: { password: 'c2VjcmV0' },
    stringData: { token: 'plain-text-secret' },
    spec: { containers: [{ name: 'web', env: [{ name: 'TOKEN', value: 'hunter2' }] }] },
  };
  const clean = sanitizeManifest(source, 'secrets');
  assert.equal(clean.metadata.managedFields, undefined);
  assert.equal(clean.metadata.annotations['kubectl.kubernetes.io/last-applied-configuration'], undefined);
  assert.equal(clean.metadata.annotations['example.com/owner'], 'team-a');
  assert.equal(clean.data, undefined);
  assert.equal(clean.stringData, undefined);
  assert.ok(source.metadata.managedFields, 'the source object must not be mutated');

  const config = sanitizeManifest({ kind: 'ConfigMap', metadata: { name: 'cfg' }, data: { mode: 'production' } }, 'configmaps');
  assert.deepEqual(config.data, { mode: 'production' });
});

test('object names and actions are validated before kubectl is called', () => {
  assert.equal(validObjectName('web-0'), true);
  assert.equal(validObjectName('web.example.com'), true);
  assert.equal(validObjectName('web_0'), false);
  assert.equal(validObjectName('../etc/passwd'), false);
  assert.equal(validObjectName(''), false);
  assert.equal(validObjectName('A'.repeat(254)), false);

  assert.deepEqual(actionsFor('deployments'), ['scale', 'restart', 'delete']);
  assert.deepEqual(actionsFor('persistentvolumes'), []);
  assert.deepEqual(actionsFor('events'), []);

  const scale = actionArgs('deployments', 'scale', 'web', { namespace: 'team-a', replicas: 3 });
  assert.deepEqual(scale.args, ['scale', 'deployments.apps', 'web', '--replicas=3']);
  assert.equal(scale.namespace, 'team-a');
  assert.equal(scale.replicas, 3);

  assert.deepEqual(actionArgs('pods', 'delete', 'web-0', { namespace: 'team-a' }).args, ['delete', 'pods', 'web-0', '--wait=false']);
  assert.deepEqual(actionArgs('daemonsets', 'restart', 'agent', { namespace: 'kube-system' }).args, ['rollout', 'restart', 'daemonsets.apps/agent']);

  assert.throws(() => actionArgs('pods', 'scale', 'web-0', { namespace: 'team-a', replicas: 2 }), /not available/);
  assert.throws(() => actionArgs('persistentvolumes', 'delete', 'data', {}), /not available/);
  assert.throws(() => actionArgs('deployments', 'scale', 'web', { namespace: 'team-a', replicas: -1 }), /between 0 and 1000/);
  assert.throws(() => actionArgs('deployments', 'scale', 'web', { namespace: 'team-a', replicas: 1.5 }), /whole number/);
  assert.throws(() => actionArgs('deployments', 'scale', 'web', { namespace: '../bad', replicas: 1 }), /namespace/);
  assert.throws(() => actionArgs('deployments', 'scale', '../web', { namespace: 'team-a', replicas: 1 }), /name/);
});

test('service rejects invalid detail and action input before touching a cluster', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsdeck-k8s-guard-'));
  const service = new KubernetesService({ app: { getPath: () => dir }, dialog: {}, getWindow: () => null });
  try {
    assert.equal((await service.resourceDetail('not-a-resource', { name: 'web' })).ok, false);
    assert.equal((await service.resourceDetail('pods', { name: '../evil' })).ok, false);
    assert.equal((await service.resourceAction('pods', 'delete', { name: '../evil', namespace: 'default' })).ok, false);
    assert.equal((await service.resourceAction('persistentvolumes', 'delete', { name: 'data' })).ok, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
