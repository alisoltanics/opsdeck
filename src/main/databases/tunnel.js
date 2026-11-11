'use strict';

const net = require('node:net');
const { spawn } = require('node:child_process');
const path = require('node:path');
const { binDir } = require('../kubernetes/install');

/** Find an unused localhost TCP port. */
function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.unref();
    server.on('error', reject);
    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      server.close(() => resolve(port));
    });
  });
}

function kubectlPath(toolsDir) {
  const dir = String(toolsDir || '');
  if (dir) {
    const candidate = path.join(dir, process.platform === 'win32' ? 'kubectl.exe' : 'kubectl');
    try {
      require('node:fs').accessSync(candidate);
      return candidate;
    } catch { /* fall back to PATH */ }
  }
  return 'kubectl';
}

/**
 * Controlled kubectl port-forward. OpsDeck only forwards a database port to
 * 127.0.0.1, uses the explicitly selected context/namespace and never changes
 * cluster resources.
 */
async function startKubernetesTunnel(source = {}) {
  if (!source.context || !source.namespace) throw new Error('The Kubernetes context and namespace are required.');
  const target = source.pod ? `pod/${source.pod}` : source.workload ? `statefulset/${source.workload}` : '';
  if (!target) throw new Error('No pod or workload was identified for this database.');
  if (!/^[A-Za-z0-9][A-Za-z0-9_.:/-]{0,260}$/.test(source.context)) throw new Error('The Kubernetes context is not valid.');
  if (!/^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/.test(source.namespace)) throw new Error('The Kubernetes namespace is not valid.');
  if (!/^(pod|statefulset)\/[A-Za-z0-9][A-Za-z0-9_.-]{0,252}$/.test(target)) throw new Error('The Kubernetes resource name is not valid.');
  const remotePort = Number(source.internalPort);
  if (!Number.isInteger(remotePort) || remotePort <= 0 || remotePort > 65535) throw new Error('The database port is not valid.');

  const toolsDir = String(source.toolsDir || (source.app ? binDir(source.app) : ''));
  const localPort = await freePort();
  const args = ['--context', source.context, '-n', source.namespace, 'port-forward', '--address', '127.0.0.1', target, `${localPort}:${remotePort}`];
  const child = spawn(kubectlPath(toolsDir), args, {
    stdio: ['ignore', 'pipe', 'pipe'],
    env: { ...process.env, PATH: `${toolsDir || ''}${path.delimiter}${process.env.PATH || ''}` },
  });

  return new Promise((resolve, reject) => {
    let settled = false;
    let output = '';
    const finish = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      if (error) {
        try { child.kill('SIGTERM'); } catch { /* ignore */ }
        reject(error);
      } else {
        resolve({
          port: localPort,
          remotePort,
          target,
          context: source.context,
          namespace: source.namespace,
          stop: () => { try { child.kill('SIGTERM'); } catch { /* ignore */ } },
        });
      }
    };
    const timer = setTimeout(() => finish(new Error('Kubernetes port forwarding timed out. Check the context and pod.')), 20000);
    const onData = (chunk) => {
      output += String(chunk);
      if (/Forwarding from (127\.0\.0\.1|\[::1\]):\d+ -> \d+/.test(output)) finish(null);
    };
    child.stdout.on('data', onData);
    child.stderr.on('data', onData);
    child.once('error', (error) => {
      finish(new Error(error.code === 'ENOENT' ? 'kubectl was not found. Install it from the Kubernetes workspace.' : error.message));
    });
    child.once('exit', (code) => {
      if (!settled) finish(new Error(`kubectl port-forward exited (${code}). ${output.slice(-400)}`.trim()));
    });
  });
}

module.exports = { startKubernetesTunnel, freePort };
