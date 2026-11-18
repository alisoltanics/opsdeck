'use strict';

// Direct Docker Engine API client over the local socket/pipe. The hot read
// paths (container list, stats, status, events, images) use this instead of
// spawning `docker` (100-1500 ms per call). Everything falls back to the CLI
// when the socket is unavailable, the active context is remote, or a call fails.

const http = require('node:http');
const { execFile } = require('node:child_process');

const agent = new http.Agent({ keepAlive: true, maxSockets: 32 });
let endpoint; // undefined = unresolved, null = unusable, string = socket path

function resolveEndpoint() {
  if (endpoint !== undefined) return Promise.resolve(endpoint);
  return new Promise((resolve) => {
    const finish = (host) => {
      let sp = null;
      if (typeof host === 'string') {
        if (host.startsWith('unix://')) sp = host.slice(7);
        else if (host.startsWith('npipe://')) sp = host.slice(8).replace(/\//g, '\\');
      }
      endpoint = sp;
      resolve(sp);
    };
    if (process.env.DOCKER_HOST) return finish(process.env.DOCKER_HOST);
    execFile('docker', ['context', 'inspect', '--format', '{{.Endpoints.docker.Host}}'],
      { timeout: 5000, windowsHide: true, env: { ...process.env, DOCKER_CLI_HINTS: 'false' } },
      (err, stdout) => finish(err ? null : String(stdout).trim()));
  });
}

function reset() { endpoint = undefined; }

async function request(path, { timeout = 8000, raw = false } = {}) {
  const socketPath = await resolveEndpoint();
  if (!socketPath) throw new Error('Docker API socket unavailable');
  return new Promise((resolve, reject) => {
    const req = http.request({ socketPath, path, agent, method: 'GET', timeout, headers: { Host: 'docker' } }, (res) => {
      const chunks = [];
      res.on('data', (c) => chunks.push(c));
      res.on('end', () => {
        const text = Buffer.concat(chunks).toString('utf8');
        if (res.statusCode >= 400) return reject(new Error(`Docker API ${res.statusCode}`));
        if (raw) return resolve(text);
        try { resolve(JSON.parse(text)); } catch { reject(new Error('Bad Docker API response')); }
      });
    });
    req.on('timeout', () => req.destroy(new Error('Docker API timeout')));
    req.on('error', reject);
    req.end();
  });
}

module.exports = { request, resolveEndpoint, reset };
