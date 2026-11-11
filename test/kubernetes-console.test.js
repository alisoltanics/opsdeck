'use strict';

/**
 * Kubectl console, command catalog and pod summary tests.
 *
 * These are pure functions: no cluster, kubectl process or Electron runtime is
 * used. The runner is tested through parseKubectl so blocked flags are proven
 * before any argv reaches execFile.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { parseKubectl, tokenize } = require('../src/main/kubernetes/kubectl-runner');
const { sectionCommands, objectCommands } = require('../src/main/kubernetes/commands');
const { summaryFor, RESOURCES } = require('../src/main/kubernetes/resources');
const shell = require('../src/main/kubernetes/shell');
const { __test: serviceTest } = require('../src/main/kubernetes');

const CTX = 'kind-k8s-demo';
const NS = 'default';
const base = { context: CTX, namespace: NS };

test('tokenizer keeps quoted arguments together and rejects malformed input', () => {
  assert.deepEqual(tokenize('get pods -o wide'), ['get', 'pods', '-o', 'wide']);
  assert.deepEqual(tokenize(`get pods -o jsonpath='{.items[*].metadata.name}'`), ['get', 'pods', '-o', 'jsonpath={.items[*].metadata.name}']);
  assert.deepEqual(tokenize('get pod "web 0"'), ['get', 'pod', 'web 0']);
  assert.deepEqual(tokenize('get pod web\\ pod'), ['get', 'pod', 'web pod']);
  assert.throws(() => tokenize(''), /Type a kubectl command/);
  assert.throws(() => tokenize('get "pods'), /unclosed quote/);
  assert.throws(() => tokenize('get pods \u0007'), /control characters/);
});

test('the console enforces the selected context and namespace', () => {
  const plain = parseKubectl('kubectl get pods -o wide', base);
  assert.deepEqual(plain.args, ['get', 'pods', '-o', 'wide', '--context', CTX, '--namespace', NS]);
  assert.equal(plain.mutating, false);

  const own = parseKubectl('get pods -n kube-system', base);
  assert.deepEqual(own.args, ['get', 'pods', '-n', 'kube-system', '--context', CTX]);
  assert.equal(own.namespace, 'kube-system');

  const everything = parseKubectl('get pods -A', base);
  assert.deepEqual(everything.args, ['get', 'pods', '-A', '--context', CTX]);

  const version = parseKubectl('kubectl version --client', base);
  assert.deepEqual(version.args, ['version', '--client']);

  // Global flags stay before `--`, or kubectl would pass them to the remote command.
  const exec = parseKubectl('exec web -- env', base);
  assert.deepEqual(exec.args, ['exec', 'web', '--context', CTX, '--namespace', NS, '--', 'env']);

  // OpsDeck's own copyable commands include the selected context. The Run
  // button accepts that exact value and enforces it once, without duplication.
  const generated = parseKubectl(`get pods --context ${CTX}`, { ...base, allowContext: CTX });
  assert.deepEqual(generated.args, ['get', 'pods', '--context', CTX, '--namespace', NS]);
  const generatedInline = parseKubectl(`get pods --context=${CTX}`, { ...base, allowContext: CTX });
  assert.deepEqual(generatedInline.args, ['get', 'pods', '--context', CTX, '--namespace', NS]);
  assert.throws(() => parseKubectl(`get pods --context ${CTX}`, base), /controlled by OpsDeck/);
  assert.throws(() => parseKubectl('get pods --context evil', { ...base, allowContext: CTX }), /controlled by OpsDeck/);
});

test('every runnable catalog command can actually be run by the console', () => {
  const sections = ['overview', 'contexts', 'namespaces', 'nodes', 'helm', 'tools', 'console', ...Object.keys(RESOURCES)];
  for (const section of sections) {
    const commands = sectionCommands(section, { context: CTX, namespace: NS });
    for (const entry of commands.filter((item) => item.runnable !== false)) {
      assert.doesNotThrow(
        () => parseKubectl(entry.command, { context: CTX, namespace: NS, allowContext: CTX }),
        `${section} command should parse: ${entry.command}`,
      );
    }
  }

  const names = {
    pods: 'web-0', deployments: 'web', statefulsets: 'web', daemonsets: 'agent', jobs: 'job-1',
    cronjobs: 'nightly', services: 'web', ingresses: 'web', networkpolicies: 'deny', nodes: 'node-a',
    namespaces: 'default', persistentvolumes: 'pv-1', persistentvolumeclaims: 'data', storageclasses: 'standard',
    configmaps: 'settings', secrets: 'db-password', resourcequotas: 'quota', limitranges: 'limits',
    serviceaccounts: 'default', roles: 'reader', rolebindings: 'reader', clusterroles: 'reader',
    clusterrolebindings: 'reader', events: 'event-1',
  };
  for (const [section, name] of Object.entries(names)) {
    const commands = objectCommands(section, { context: CTX, namespace: NS, name });
    for (const entry of commands.filter((item) => item.runnable !== false)) {
      assert.doesNotThrow(
        () => parseKubectl(entry.command, { context: CTX, namespace: NS, allowContext: CTX }),
        `${section}/${name} command should parse: ${entry.command}`,
      );
    }
  }
});

test('the console refuses kubeconfig overrides, credentials and interactive commands', () => {
  assert.throws(() => parseKubectl('get pods --context evil', base), /controlled by OpsDeck/);
  assert.throws(() => parseKubectl('get pods --kubeconfig /tmp/evil', base), /controlled by OpsDeck/);
  assert.throws(() => parseKubectl('get pods --token abc', base), /controlled by OpsDeck/);
  assert.throws(() => parseKubectl('config use-context evil', base), /never edits kubeconfig/);
  assert.throws(() => parseKubectl('config set-context evil', base), /never edits kubeconfig/);
  assert.throws(() => parseKubectl('logs -f web', base), /Long-running/);
  assert.throws(() => parseKubectl('logs --follow=true web', base), /Long-running/);
  assert.throws(() => parseKubectl('get pods -w', base), /Long-running/);
  assert.throws(() => parseKubectl('get pods --watch=true', base), /Long-running/);
  assert.throws(() => parseKubectl('exec -it web -- sh', base), /Interactive exec/);
  assert.throws(() => parseKubectl('port-forward svc/web 8080:80', base), /interactive terminal/);
  assert.throws(() => parseKubectl('proxy', base), /interactive terminal/);
  assert.throws(() => parseKubectl('edit pod web', base), /interactive terminal/);
  assert.throws(() => parseKubectl('helm list', base), /kubectl commands only/);
  assert.throws(() => parseKubectl('minikube status', base), /kubectl commands only/);
});

test('mutating verbs are classified so the UI can ask first', () => {
  assert.equal(parseKubectl('delete pod web', base).dangerous, true);
  assert.equal(parseKubectl('scale deployment web --replicas=2', base).dangerous, true);
  assert.equal(parseKubectl('rollout restart deployment/web', base).dangerous, true);
  assert.equal(parseKubectl('rollout status deployment/web', base).dangerous, false);
  assert.equal(parseKubectl('get events', base).dangerous, false);
});

test('catalog commands use the real context and namespace and never print secret values', () => {
  const pods = sectionCommands('pods', { context: CTX, namespace: NS });
  assert.ok(pods.some((entry) => entry.command.includes(`--context ${CTX}`)));
  assert.ok(pods.some((entry) => entry.command.includes(`-n ${NS}`)));
  assert.ok(pods.some((entry) => entry.label === 'Shell' && entry.runnable === false));
  assert.ok(pods.some((entry) => entry.label === 'Follow logs' && entry.runnable === false));

  const secrets = objectCommands('secrets', { context: CTX, namespace: NS, name: 'db-password' });
  const text = JSON.stringify(secrets);
  assert.ok(!text.includes('jsonpath={.data}'));
  assert.ok(!text.includes('base64'));
  assert.ok(!secrets.some((entry) => /-o (json|yaml)\b/.test(entry.command)));
  assert.ok(secrets.some((entry) => entry.command.includes('go-template')));
  assert.ok(secrets.filter((entry) => entry.runnable !== false).every((entry) => entry.command.startsWith('kubectl ')));

  const all = sectionCommands('deployments', { context: CTX, namespace: NS, name: 'web' });
  assert.ok(all.some((entry) => entry.command.includes('deployments.apps/web')));
  assert.ok(all.some((entry) => entry.label === 'Scale' && entry.tone === 'write'));

  const helm = objectCommands('helm', { context: CTX, namespace: NS, name: 'demo' });
  assert.ok(helm.some((entry) => entry.command.includes('--kube-context')));
  assert.ok(helm.every((entry) => entry.runnable === false));

  const tools = sectionCommands('tools', { context: CTX, namespace: NS });
  assert.ok(tools.length > 0);
  assert.ok(tools.every((entry) => entry.runnable === false));
});

test('pod and deployment summaries expose status, containers and conditions only', () => {
  const pod = summaryFor('pods', {
    metadata: { name: 'web-0', namespace: NS },
    spec: {
      nodeName: 'node-a',
      serviceAccountName: 'default',
      restartPolicy: 'Always',
      containers: [{ name: 'web', image: 'nginx:1.27', resources: {} }],
      volumes: [{ name: 'config', configMap: { name: 'cfg' } }],
    },
    status: {
      phase: 'Running',
      qosClass: 'Burstable',
      podIP: '10.1.2.3',
      conditions: [{ type: 'Ready', status: 'True' }],
      containerStatuses: [{ name: 'web', ready: true, restartCount: 2, state: { running: {} } }],
    },
  });
  const titles = pod.sections.map((section) => section.title);
  assert.deepEqual(titles, ['Pod', 'Conditions', 'Containers', 'Volumes']);
  assert.equal(pod.containers[0].name, 'web');
  assert.equal(pod.containers[0].restarts, 2);
  assert.match(pod.sections.find((section) => section.title === 'Conditions').text, /Ready: True/);

  const deployment = summaryFor('deployments', {
    metadata: { name: 'web' },
    spec: { replicas: 3, strategy: { type: 'RollingUpdate' } },
    status: { readyReplicas: 2, updatedReplicas: 3, availableReplicas: 2, unavailableReplicas: 1 },
  });
  const rows = Object.fromEntries(deployment.sections.find((section) => section.title === 'Deployment').rows);
  assert.equal(rows['Desired replicas'], '3');
  assert.equal(rows['Ready replicas'], '2');
  assert.equal(rows.Strategy, 'RollingUpdate');
});

test('secret summaries list key names but never values', () => {
  const summary = summaryFor('secrets', {
    kind: 'Secret',
    metadata: { name: 'db' },
    type: 'Opaque',
    data: { password: 'c2VjcmV0', token: 'YWJjZA==' },
  });
  const text = JSON.stringify(summary);
  assert.ok(!text.includes('c2VjcmV0'));
  assert.ok(!text.includes('YWJjZA=='));
  assert.ok(text.includes('password'));
  assert.ok(text.includes('token'));
});

test('pod shells reject invalid specs before running a command', async () => {
  const sender = { id: 1, isDestroyed: () => false };
  await assert.rejects(() => shell.start({ context: '', namespace: NS, name: 'web-0' }, sender, { pty: false }), /valid context/);
  await assert.rejects(() => shell.start({ context: CTX, namespace: 'Bad Namespace', name: 'web-0' }, sender, { pty: false }), /valid namespace/);
  await assert.rejects(() => shell.start({ context: CTX, namespace: NS, name: '../evil' }, sender, { pty: false }), /pod name/);
  await assert.rejects(() => shell.start({ context: CTX, namespace: NS, name: 'web-0', container: 'bad/container' }, sender, { pty: false }), /container name/);
  assert.deepEqual(shell.input('missing', 'x', 1), { ok: false, error: 'This terminal session has ended.' });
});

test('Minikube status accepts real JSON shapes for running, stopped and missing profiles', () => {
  const running = serviceTest.parseMinikubeStatus({ Name: 'minikube', Host: 'Running', Kubelet: 'Running', APIServer: 'Running', Kubeconfig: 'Configured' });
  assert.equal(running.running, true);
  assert.equal(running.state, 'running');
  assert.equal(running.kubeconfig, 'Configured');

  const stopped = serviceTest.parseMinikubeStatus({ Name: 'minikube', Host: 'Stopped', Kubelet: 'Stopped', APIServer: 'Stopped' }, { ok: false, stderr: 'Command failed: minikube status --output=json' });
  assert.equal(stopped.running, false);
  assert.equal(stopped.state, 'stopped');
  assert.match(stopped.detail, /stopped/);
  assert.doesNotMatch(stopped.message, /Command failed/);

  const absent = serviceTest.parseMinikubeStatus({ message: 'Profile "minikube" not found.' }, { ok: false });
  assert.equal(absent.state, 'absent');
  assert.match(absent.detail, /No Minikube profile/);

  const unknown = serviceTest.parseMinikubeStatus(null, { ok: false, stderr: '' });
  assert.equal(unknown.state, 'unknown');
  assert.equal(unknown.running, false);
});

test('summary lists stay lists instead of being split into characters', () => {
  const summary = summaryFor('services', {
    metadata: { name: 'web' },
    spec: { type: 'ClusterIP', ports: [{ port: 80, targetPort: 8080, protocol: 'TCP' }], selector: { app: 'web' } },
  });
  const ports = summary.sections.find((section) => section.title === 'Ports');
  assert.deepEqual(ports.list, ['80→8080/TCP']);
  const selector = summary.sections.find((section) => section.title === 'Service').rows.find(([label]) => label === 'Selector');
  assert.equal(selector[1], 'app=web');
});
