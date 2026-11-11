'use strict';

const fs = require('node:fs');
const os = require('node:os');
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const registry = require('./registry');

const execFileAsync = promisify(execFile);
const CACHE_MS = 10000;
const cache = new Map();

function cached(key, fn, ttl = CACHE_MS) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = Promise.resolve().then(fn).catch((error) => ({ ok: false, error: error.message }));
  cache.set(key, { at: Date.now(), value });
  return value;
}

function confidenceLabel(score) {
  if (score >= 0.8) return 'high';
  if (score >= 0.5) return 'medium';
  return 'low';
}

/**
 * Combine independent discovery signals. Image names alone are not trusted;
 * ports, env variable names, process names and labels all add evidence.
 */
function detect(signals = {}) {
  const scores = new Map();
  const reasons = new Map();
  const bump = (engine, score, reason) => {
    if (!engine) return;
    scores.set(engine.id, (scores.get(engine.id) || 0) + score);
    if (!reasons.has(engine.id)) reasons.set(engine.id, []);
    reasons.get(engine.id).push(reason);
  };

  const imageEngine = registry.matchImage(signals.image);
  if (imageEngine) bump(imageEngine, 0.62, `image ${signals.image}`);

  for (const port of signals.ports || []) {
    const byPort = registry.matchPort(port);
    if (byPort) bump(byPort, 0.22, `port ${port}`);
  }

  const envEngine = registry.matchEnvKeys(signals.envKeys);
  if (envEngine) bump(envEngine, 0.14, `environment variable names`);

  const processEngine = registry.matchProcess(signals.process);
  if (processEngine) bump(processEngine, 0.5, `process ${signals.process}`);

  const name = String(signals.name || '').toLowerCase();
  for (const engine of registry.ENGINES) {
    if (!registry.isConnectable(engine)) continue;
    if (name.includes(engine.id) || name.includes(engine.label.toLowerCase())) {
      bump(engine, 0.18, 'container or service name');
    }
    for (const token of signals.labels || []) {
      const value = String(token || '').toLowerCase();
      if (value.includes(engine.id)) bump(engine, 0.12, 'label');
    }
  }

  let best = null;
  for (const [id, score] of scores) {
    if (!best || score > best.score) best = { engine: registry.get(id), score };
  }
  if (!best) return null;
  const score = Math.min(0.99, best.score);
  return {
    engine: best.engine,
    confidence: confidenceLabel(score),
    score: Math.round(score * 100) / 100,
    reasons: [...new Set(reasons.get(best.engine.id) || [])],
  };
}

function localAddress(hostIp) {
  if (!hostIp || hostIp === '0.0.0.0' || hostIp === '::') return '127.0.0.1';
  if (hostIp === '::1') return '127.0.0.1';
  return hostIp;
}

function parsePublishedPorts(ports) {
  const published = [];
  const internal = [];
  for (const [key, bindings] of Object.entries(ports || {})) {
    const match = /^(\d+)\/(tcp|udp)$/.exec(key);
    if (!match) continue;
    internal.push(Number(match[1]));
    for (const binding of Array.isArray(bindings) ? bindings : []) {
      published.push({
        internal: Number(match[1]),
        host: localAddress(binding.HostIp),
        hostPort: Number(binding.HostPort) || 0,
      });
    }
  }
  return { published, internal };
}

function composeMap(composeList) {
  const map = new Map();
  for (const project of composeList?.items || []) map.set(project.name, project);
  return map;
}

async function discoverDocker(docker) {
  const [list, compose, stats] = await Promise.all([
    docker.containersList(),
    docker.composeList().catch(() => ({ items: [] })),
    docker.stats().catch(() => ({ items: [] })),
  ]);
  if (!list?.ok) {
    return { ok: false, error: list?.error || 'Docker is not available.', items: [], projects: [] };
  }
  const projectsByName = composeMap(compose);
  const statsById = new Map((stats?.items || []).map((row) => [row.id, row]));
  const containers = list.items || [];
  const results = [];

  // Docker inspect is per-container; bound concurrency so discovery stays fast.
  const queue = [...containers];
  const workers = Array.from({ length: Math.min(4, queue.length) }, async () => {
    while (queue.length) {
      const container = queue.shift();
      const inspect = await docker.inspectContainer(container.id).catch(() => null);
      if (!inspect?.ok) continue;
      const item = inspect.item;
      const portInfo = parsePublishedPorts(item.ports);
      const envKeys = (item.env || []).map((entry) => entry.key);
      const mounts = item.mounts || [];
      const persistent = mounts.some((mount) => mount.Type === 'volume' || mount.Type === 'bind');
      const match = detect({
        image: item.image || container.image,
        ports: [...portInfo.internal, ...portInfo.published.map((p) => p.hostPort)],
        envKeys,
        process: item.cmd?.join(' '),
        name: item.name || container.name,
        labels: Object.values(item.labels || {}),
      });
      if (!match) continue;
      const engine = match.engine;
      const running = String(item.state?.Status || container.state || '').toLowerCase() === 'running';
      const health = item.health?.Status || '';
      const published = portInfo.published.find((entry) => entry.internal === engine.defaultPort)
        || portInfo.published.find((entry) => engine.detect.ports?.includes(entry.internal))
        || portInfo.published[0]
        || null;
      const internalPort = published?.internal || portInfo.internal.find((port) => engine.detect.ports?.includes(port)) || engine.defaultPort;
      const project = container.compose || item.labels?.['com.docker.compose.project'] || '';
      const projectMeta = projectsByName.get(project) || null;
      const namedVolume = mounts.find((mount) => mount.Type === 'volume');
      const bindMount = mounts.find((mount) => mount.Type === 'bind');
      const stat = statsById.get(container.id);
      results.push({
        id: `docker:${container.id}`,
        kind: 'docker',
        engine: engine.id,
        engineLabel: engine.label,
        supported: registry.isConnectable(engine),
        confidence: match.confidence,
        score: match.score,
        reasons: match.reasons,
        name: item.name || container.name,
        container: {
          id: item.id || container.id,
          shortId: String(item.id || container.id).slice(0, 12),
          name: item.name || container.name,
          image: item.image || container.image,
          state: item.state?.Status || container.state,
          status: container.status,
          running,
          health,
          runningFor: container.runningFor,
          restarts: container.restartCount || 0,
          createdAt: item.createdAt,
        },
        network: {
          published,
          internalPort,
          host: published?.host || '',
          hostPort: published?.hostPort || 0,
          reachable: Boolean(running && published?.hostPort),
          networks: Object.keys(item.networks || {}),
          mode: published ? 'published' : 'internal-only',
        },
        compose: project ? {
          project,
          service: container.service || item.labels?.['com.docker.compose.service'] || '',
          status: projectMeta?.status || '',
          files: projectMeta?.files || [],
        } : null,
        storage: {
          persistent,
          namedVolume: namedVolume?.Name || '',
          bindMount: bindMount?.Source || '',
          destination: namedVolume?.Destination || bindMount?.Destination || '',
          mounts: mounts.map((mount) => ({
            type: mount.Type,
            name: mount.Name || '',
            source: mount.Source || '',
            destination: mount.Destination || '',
            rw: mount.RW === true,
          })),
        },
        metrics: stat ? {
          cpuPercent: stat.cpuPercent,
          memoryUsed: stat.memoryUsed,
          memoryLimit: stat.memoryLimit,
          memoryPercent: stat.memoryPercent,
          netIn: stat.netIn, netOut: stat.netOut,
          blockRead: stat.blockRead, blockWrite: stat.blockWrite,
          pids: stat.pids,
        } : null,
        envKeys,
      });
    }
  });
  await Promise.all(workers);

  const projects = [];
  for (const [name, meta] of projectsByName) {
    const services = results.filter((item) => item.compose?.project === name);
    if (!services.length) continue;
    projects.push({
      name,
      status: meta.status,
      files: meta.files,
      directory: meta.directory,
      databases: services.length,
      services: services.map((item) => ({ name: item.compose.service, engine: item.engine, container: item.name })),
    });
  }
  return {
    ok: true,
    items: results.sort((a, b) => (b.container.running - a.container.running) || a.name.localeCompare(b.name)),
    projects,
  };
}

// ---------------------------------------------------------------- local host

const BINARIES = {
  postgres: ['postgres', 'pg_ctl'],
  mysql: ['mysqld', 'mysql'],
  mariadb: ['mariadbd', 'mariadb'],
  mongodb: ['mongod', 'mongosh'],
  redis: ['redis-server', 'redis-cli'],
  elasticsearch: ['elasticsearch'],
  opensearch: ['opensearch'],
};

function parseProcNet(file) {
  let text = '';
  try { text = fs.readFileSync(file, 'utf8'); } catch { return []; }
  const ports = [];
  for (const line of text.split('\n').slice(1)) {
    const parts = line.trim().split(/\s+/);
    if (parts.length < 4) continue;
    if (parts[3] !== '0A') continue; // LISTEN
    const local = parts[1];
    const portHex = local.split(':').pop();
    const port = parseInt(portHex, 16);
    if (port > 0) ports.push(port);
  }
  return ports;
}

function listeningPorts() {
  return new Set([...parseProcNet('/proc/net/tcp'), ...parseProcNet('/proc/net/tcp6')]);
}

async function processNames() {
  try {
    const { stdout } = await execFileAsync('ss', ['-ltnpH'], { timeout: 4000 });
    const entries = [];
    for (const line of String(stdout).split('\n')) {
      const port = Number((/[\d.:\]]+:(\d+)\s/.exec(line) || [])[1]);
      const name = (/\(\("([^"]+)"/.exec(line) || [])[1] || '';
      if (port) entries.push({ port, name });
    }
    return entries;
  } catch {
    return [];
  }
}

async function binaryInfo(binaries) {
  for (const binary of binaries) {
    try {
      const which = await execFileAsync('which', [binary], { timeout: 2000 });
      const path = String(which.stdout || '').trim();
      if (!path) continue;
      return { installed: true, binary, path };
    } catch { /* try next */ }
  }
  return { installed: false };
}

async function discoverLocal() {
  const ports = listeningPorts();
  const processes = await processNames();
  const processByPort = new Map(processes.map((entry) => [entry.port, entry.name]));
  const items = [];

  for (const engine of registry.ENGINES) {
    if (!registry.isConnectable(engine)) continue;
    const candidates = (engine.detect.ports || []).filter((port) => ports.has(port));
    const procMatch = processes.find((entry) => registry.matchProcess(entry.name)?.id === engine.id);
    if (!candidates.length && !procMatch) continue;
    const port = candidates[0] || engine.defaultPort;
    const procName = processByPort.get(port) || procMatch?.name || '';
    const match = detect({ ports: [port], process: procName, name: engine.label });
    if (!match || match.engine.id !== engine.id) continue;
    const binary = await binaryInfo(BINARIES[engine.id] || []);
    items.push({
      id: `local:${engine.id}:${port}`,
      kind: 'local',
      engine: engine.id,
      engineLabel: engine.label,
      supported: true,
      confidence: procName ? 'high' : match.confidence,
      score: procName ? 0.9 : match.score,
      reasons: procName ? [`process ${procName}`, `port ${port} listening`] : match.reasons,
      name: `${engine.label} on :${port}`,
      local: {
        host: '127.0.0.1',
        port,
        process: procName,
        installed: binary.installed,
        binary: binary.binary || '',
        binaryPath: binary.path || '',
      },
      network: { host: '127.0.0.1', hostPort: port, reachable: true, mode: 'local' },
    });
  }

  // Installed but stopped servers are useful for the Local databases page.
  for (const engine of registry.ENGINES) {
    if (!registry.isConnectable(engine)) continue;
    if (items.some((item) => item.engine === engine.id)) continue;
    const binary = await binaryInfo(BINARIES[engine.id] || []);
    if (!binary.installed) continue;
    items.push({
      id: `local:${engine.id}:installed`,
      kind: 'local',
      engine: engine.id,
      engineLabel: engine.label,
      supported: true,
      confidence: 'high',
      score: 1,
      reasons: [`${binary.binary} is installed`],
      name: `${engine.label} (installed)`,
      local: {
        host: '127.0.0.1',
        port: engine.defaultPort,
        process: '',
        installed: true,
        binary: binary.binary,
        binaryPath: binary.path,
        running: false,
      },
      network: { host: '127.0.0.1', hostPort: engine.defaultPort, reachable: false, mode: 'stopped' },
    });
  }

  return { ok: true, items, listening: [...ports] };
}

const SERVICE_UNITS = {
  postgres: ['postgresql', 'postgresql.service'],
  mysql: ['mysql', 'mysqld', 'mysql.service'],
  mariadb: ['mariadb', 'mariadb.service'],
  mongodb: ['mongod', 'mongodb', 'mongod.service'],
  redis: ['redis-server', 'redis', 'redis.service'],
};

async function localServiceAction(engineId, action) {
  const units = SERVICE_UNITS[engineId];
  if (!units) return { ok: false, error: 'No service adapter is available for this engine.' };
  if (!['status', 'start', 'stop', 'restart'].includes(action)) return { ok: false, error: 'Unsupported service action.' };
  for (const unit of units) {
    try {
      const args = action === 'status' ? ['is-active', unit] : [action, unit];
      const { stdout, stderr } = await execFileAsync('systemctl', args, { timeout: 15000 });
      return { ok: true, unit, action, output: String(stdout || stderr || '').trim() };
    } catch (error) {
      if (error.code === 'ENOENT') return { ok: false, error: 'systemctl is not available on this host.' };
      if (/not found|could not be found/i.test(String(error.stderr || ''))) continue;
      return { ok: false, error: String(error.stderr || error.message || 'The service action failed.').trim() };
    }
  }
  return { ok: false, error: `No ${engineId} service unit was found.` };
}

// ------------------------------------------------------------------ kubernetes

async function discoverKubernetes(kubernetes) {
  if (!kubernetes) return { ok: false, error: 'Kubernetes is not available.', items: [] };
  const state = await kubernetes.contextState().catch(() => null);
  if (!state?.selected) return { ok: true, items: [], context: '', reason: 'Select a Kubernetes context to discover database workloads.' };
  const [pods, services, statefulsets] = await Promise.all([
    kubernetes.resources('pods', { allNamespaces: true }).catch(() => ({ items: [] })),
    kubernetes.resources('services', { allNamespaces: true }).catch(() => ({ items: [] })),
    kubernetes.resources('statefulsets', { allNamespaces: true }).catch(() => ({ items: [] })),
  ]);
  const items = [];
  for (const pod of pods.rows || []) {
    const images = pod.images || [];
    let match = null;
    for (const image of images) {
      const candidate = detect({ image, name: pod.name });
      if (candidate && (!match || candidate.score > match.score)) match = candidate;
    }
    if (!match) continue;
    const engine = match.engine;
    const related = (services.rows || []).filter((service) => service.namespace === pod.namespace);
    items.push({
      id: `kubernetes:${pod.namespace}:${pod.name}`,
      kind: 'kubernetes',
      engine: engine.id,
      engineLabel: engine.label,
      supported: registry.isConnectable(engine),
      confidence: match.confidence,
      score: match.score,
      reasons: match.reasons,
      name: pod.name,
      kubernetes: {
        context: state.selected,
        namespace: pod.namespace,
        pod: pod.name,
        workload: '',
        images,
        status: pod.status,
        ready: `${pod.ready || 0}/${pod.total || 0}`,
        services: related.map((service) => ({ name: service.name, type: service.cells?.[1]?.text || '' })),
        internalPort: engine.defaultPort,
        reachable: false,
        mode: 'port-forward',
      },
      network: { host: '127.0.0.1', hostPort: engine.defaultPort, reachable: false, mode: 'port-forward' },
    });
  }
  for (const set of statefulsets.rows || []) {
    if (items.some((item) => item.kubernetes.namespace === set.namespace && item.kubernetes.workload === set.name)) continue;
    const images = set.images || [];
    let match = null;
    for (const image of images) {
      const candidate = detect({ image, name: set.name });
      if (candidate && (!match || candidate.score > match.score)) match = candidate;
    }
    if (!match) continue;
    if (items.some((item) => item.kubernetes.namespace === set.namespace && item.engine === match.engine.id)) {
      const entry = items.find((item) => item.kubernetes.namespace === set.namespace && item.engine === match.engine.id);
      entry.kubernetes.workload = set.name;
      continue;
    }
    items.push({
      id: `kubernetes:${set.namespace}:statefulset:${set.name}`,
      kind: 'kubernetes',
      engine: match.engine.id,
      engineLabel: match.engine.label,
      supported: registry.isConnectable(match.engine),
      confidence: match.confidence,
      score: match.score,
      reasons: match.reasons,
      name: set.name,
      kubernetes: {
        context: state.selected,
        namespace: set.namespace,
        pod: '',
        workload: set.name,
        images,
        status: set.status,
        ready: `${set.ready || 0}/${set.desired || 0}`,
        services: [],
        internalPort: match.engine.defaultPort,
        reachable: false,
        mode: 'port-forward',
      },
      network: { host: '127.0.0.1', hostPort: match.engine.defaultPort, reachable: false, mode: 'port-forward' },
    });
  }
  return { ok: true, items, context: state.selected, namespace: state.namespace || '' };
}

// ----------------------------------------------------------------------- all

async function discoverAll({ docker, kubernetes }) {
  const [dockerResult, localResult, k8sResult] = await Promise.all([
    discoverDocker(docker).catch((error) => ({ ok: false, error: error.message, items: [], projects: [] })),
    discoverLocal().catch((error) => ({ ok: false, error: error.message, items: [] })),
    discoverKubernetes(kubernetes).catch((error) => ({ ok: false, error: error.message, items: [] })),
  ]);
  return {
    ok: true,
    at: new Date().toISOString(),
    host: os.hostname(),
    docker: dockerResult,
    local: localResult,
    kubernetes: k8sResult,
    counts: {
      docker: dockerResult.items?.length || 0,
      local: localResult.items?.length || 0,
      kubernetes: k8sResult.items?.length || 0,
    },
  };
}

function invalidate() { cache.clear(); }

module.exports = {
  detect, discoverAll, discoverDocker, discoverLocal, discoverKubernetes,
  localServiceAction, confidenceLabel, invalidate, parsePublishedPorts,
};
