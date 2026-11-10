'use strict';

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { validateTerminal } = require('./security');

const execFileAsync = promisify(execFile);
const DEFAULT_TIMEOUT = 20000;
const MAX_BUFFER = 12 * 1024 * 1024;

const cache = new Map();
function cached(key, ttl, fn) {
  const hit = cache.get(key);
  if (hit && Date.now() - hit.at < ttl) return hit.value;
  const value = Promise.resolve().then(fn);
  cache.set(key, { at: Date.now(), value });
  value.catch(() => cache.delete(key));
  return value;
}
function invalidate(prefix = '') {
  for (const key of cache.keys()) if (key.startsWith(prefix)) cache.delete(key);
}

async function run(args, { timeout = DEFAULT_TIMEOUT, env = {} } = {}) {
  try {
    const { stdout, stderr } = await execFileAsync('docker', args, {
      timeout,
      maxBuffer: MAX_BUFFER,
      env: { ...process.env, DOCKER_CLI_HINTS: 'false', NO_COLOR: '1', ...env },
      windowsHide: true,
    });
    return { ok: true, stdout, stderr, code: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout || '',
      stderr: (error.stderr || error.message || 'Docker command failed').trim(),
      code: typeof error.code === 'number' ? error.code : 1,
      timedOut: error.killed === true,
    };
  }
}

async function runJson(args, options) {
  const res = await run(args, options);
  if (!res.ok) return { ...res, data: null };
  try {
    const text = res.stdout.trim();
    const data = text.startsWith('[') ? JSON.parse(text) : text.split('\n').filter(Boolean).map((l) => JSON.parse(l));
    return { ...res, data };
  } catch {
    return { ...res, ok: false, stderr: 'Could not parse Docker output.', data: null };
  }
}

function validId(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.:@/-]{0,220}$/.test(value) && !value.includes('..');
}
function validName(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value);
}
function validProject(value) {
  return typeof value === 'string' && /^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(value);
}
function validPath(value) {
  return typeof value === 'string' && value.length > 0 && value.length < 4096 && path.isAbsolute(value) && !value.includes('\u0000');
}

function parseLabels(text) {
  if (!text) return {};
  const out = {};
  for (const part of String(text).split(',')) {
    const idx = part.indexOf('=');
    if (idx > 0) out[part.slice(0, idx)] = part.slice(idx + 1);
  }
  return out;
}

function parsePorts(text) {
  if (!text) return [];
  return String(text).split(',').map((p) => p.trim()).filter(Boolean);
}

async function status() {
  const version = await run(['version', '--format', '{{json .}}'], { timeout: 6000 });
  if (!version.ok) {
    return {
      available: false,
      reason: /Cannot connect|permission denied/i.test(version.stderr)
        ? 'Docker is installed but the engine is not reachable. Start Docker or check permissions.'
        : version.stderr || 'Docker CLI was not found.',
      checkedAt: new Date().toISOString(),
    };
  }
  let parsed = {};
  try { parsed = JSON.parse(version.stdout); } catch { /* ignore */ }
  const server = parsed.Server || {};
  let info = {};
  const infoRes = await run(['info', '--format', '{{json .}}'], { timeout: 6000 });
  if (infoRes.ok) { try { info = JSON.parse(infoRes.stdout); } catch { /* ignore */ } }
  return {
    available: true,
    clientVersion: (parsed.Client || {}).Version || '—',
    serverVersion: server.Version || info.ServerVersion || '—',
    apiVersion: server.ApiVersion || '—',
    os: info.OperatingSystem || server.Os || '—',
    arch: info.Architecture || server.Arch || '—',
    kernel: info.KernelVersion || '—',
    context: info.Name || 'default',
    engineName: info.Name || 'default',
    cgroupDriver: info.CgroupDriver || '—',
    loggingDriver: info.LoggingDriver || '—',
    rootDir: info.DockerRootDir || '—',
    cpus: info.NCPU || os.cpus().length,
    memory: info.MemTotal || os.totalmem(),
    warnings: Array.isArray(info.Warnings) ? info.Warnings : [],
    containers: info.Containers ?? 0,
    containersRunning: info.ContainersRunning ?? 0,
    containersPaused: info.ContainersPaused ?? 0,
    containersStopped: info.ContainersStopped ?? 0,
    images: info.Images ?? 0,
    compose: await composeVersion(),
    checkedAt: new Date().toISOString(),
  };
}

async function composeVersion() {
  const res = await run(['compose', 'version', '--short'], { timeout: 6000 });
  return res.ok ? res.stdout.trim() : 'unavailable';
}

async function overview() {
  return cached('overview', 2500, async () => {
    const [st, df, containers, eventList] = await Promise.all([
      status(),
      systemDf(),
      containersList(),
      events(3600).catch(() => ({ items: [] })),
    ]);
    const running = containers.items.filter((c) => c.state === 'running');
    const cpu = running.reduce((s, c) => s + (c.cpuPercent || 0), 0);
    const mem = running.reduce((s, c) => s + (c.memoryBytes || 0), 0);
    return {
      status: st,
      disk: df.items,
      containers: {
        total: containers.items.length,
        running: running.length,
        stopped: containers.items.filter((c) => c.state !== 'running').length,
        cpu,
        memory: mem,
      },
      events: (eventList.items || []).slice(0, 12),
      checkedAt: new Date().toISOString(),
    };
  });
}

async function containersList() {
  return cached('containers', 1500, async () => {
    const res = await runJson(['ps', '-a', '--no-trunc', '--format', '{{json .}}'], { timeout: 12000 });
    if (!res.ok) return { ok: false, error: res.stderr, items: [] };
    const items = (res.data || []).map((c) => {
      const labels = parseLabels(c.Labels);
      const ports = parsePorts(c.Ports);
      return {
        id: c.ID,
        shortId: String(c.ID).slice(0, 12),
        name: c.Names,
        image: c.Image,
        command: c.Command,
        createdAt: c.CreatedAt,
        runningFor: c.RunningFor,
        state: String(c.State || '').toLowerCase(),
        status: c.Status,
        size: c.Size || '',
        ports,
        labels,
        mounts: c.Mounts || '',
        networks: c.Networks ? String(c.Networks).split(',').map((s) => s.trim()).filter(Boolean) : [],
        platform: c.Platform || null,
        compose: labels['com.docker.compose.project'] || null,
        service: labels['com.docker.compose.service'] || null,
        cpuPercent: 0,
        memoryBytes: 0,
      };
    });
    return { ok: true, items };
  });
}

async function inspectContainer(id) {
  if (!validId(id)) throw new Error('Invalid container id');
  const res = await run(['inspect', id], { timeout: 10000 });
  if (!res.ok) return { ok: false, error: res.stderr };
  try {
    const data = JSON.parse(res.stdout)[0];
    const env = (data.Config?.Env || []).map((entry) => {
      const idx = entry.indexOf('=');
      const key = idx > 0 ? entry.slice(0, idx) : entry;
      const value = idx > 0 ? entry.slice(idx + 1) : '';
      const sensitive = /(secret|token|password|passwd|api[_-]?key|private|credential|auth)/i.test(key);
      return { key, value: sensitive ? '••••••••' : value, sensitive };
    });
    return {
      ok: true,
      item: {
        id: data.Id,
        name: String(data.Name || '').replace(/^\//, ''),
        createdAt: data.Created,
        image: data.Config?.Image,
        imageId: data.Image,
        cmd: data.Config?.Cmd || [],
        entrypoint: data.Config?.Entrypoint || [],
        env,
        labels: data.Config?.Labels || {},
        state: data.State || {},
        mounts: data.Mounts || [],
        networks: data.NetworkSettings?.Networks || {},
        ports: data.NetworkSettings?.Ports || {},
        restartPolicy: data.HostConfig?.RestartPolicy || {},
        resources: {
          memory: data.HostConfig?.Memory || 0,
          nanoCpus: data.HostConfig?.NanoCpus || 0,
          pidsLimit: data.HostConfig?.PidsLimit || 0,
        },
        health: data.State?.Health || null,
        platform: data.Platform || null,
      },
    };
  } catch {
    return { ok: false, error: 'Could not parse container details.' };
  }
}

async function containerLogs(id, tail = 400) {
  if (!validId(id)) throw new Error('Invalid container id');
  const count = Math.max(10, Math.min(2000, Number(tail) || 400));
  const res = await run(['logs', '--tail', String(count), '--timestamps', id], { timeout: 12000 });
  return { ok: res.ok || !!res.stdout, stdout: stripAnsi(res.stdout), stderr: stripAnsi(res.stderr) };
}

const CONTAINER_ACTIONS = {
  start: (id) => ['start', id],
  stop: (id) => ['stop', id],
  restart: (id) => ['restart', id],
  pause: (id) => ['pause', id],
  unpause: (id) => ['unpause', id],
  kill: (id) => ['kill', id],
  remove: (id, o) => ['rm', ...(o?.force ? ['--force'] : []), ...(o?.volumes ? ['--volumes'] : []), id],
};

async function containerAction(id, action, options = {}) {
  if (!validId(id)) throw new Error('Invalid container id');
  const build = CONTAINER_ACTIONS[action];
  if (!build) throw new Error('Unsupported container action');
  const res = await run(build(id, options), { timeout: action === 'remove' ? 30000 : 25000 });
  invalidate('containers');
  invalidate('overview');
  return { ok: res.ok, stdout: res.stdout.trim(), error: res.ok ? null : res.stderr };
}

async function imagesList() {
  return cached('images', 3000, async () => {
    const res = await runJson(['images', '--format', '{{json .}}'], { timeout: 12000 });
    if (!res.ok) return { ok: false, error: res.stderr, items: [] };
    const items = (res.data || []).map((i) => ({
      id: i.ID,
      repository: i.Repository,
      tag: i.Tag,
      name: i.Repository === '<none>' ? `<none>:${i.Tag}` : `${i.Repository}:${i.Tag}`,
      digest: i.Digest,
      createdSince: i.CreatedSince,
      createdAt: i.CreatedAt,
      size: i.Size,
      sharedSize: i.SharedSize,
      uniqueSize: i.UniqueSize,
      containers: i.Containers,
      dangling: i.Repository === '<none>' || i.Tag === '<none>',
      registry: registryOf(i.Repository),
      protected: isProtectedImageRepository(i.Repository),
    }));
    return { ok: true, items };
  });
}

function registryOf(repository) {
  if (!repository || repository === '<none>') return 'local';
  const first = repository.split('/')[0];
  if (first.includes('.') || first.includes(':') || first === 'localhost') return first;
  return 'docker.io';
}

const IMAGE_ACTIONS = {
  remove: (id, o) => ['image', 'rm', ...(o?.force ? ['--force'] : []), id],
  tag: (id, o) => ['image', 'tag', id, o?.target],
  history: (id) => ['image', 'history', '--no-trunc', '--format', '{{json .}}', id],
  prune: () => ['image', 'prune', '--force'],
};

/**
 * Base OS and language runtime images are never removed by "Free space".
 * The name must be an official-style reference: either no namespace, the
 * implicit `library/` namespace, or a registry prefix followed by the bare
 * image name. A user image such as `mycorp/node` is not protected.
 */
const PROTECTED_IMAGE_REPOS = new Set([
  'ubuntu', 'debian', 'alpine', 'busybox', 'fedora', 'centos', 'rockylinux',
  'almalinux', 'amazonlinux', 'oraclelinux', 'archlinux', 'kali', 'opensuse',
  'node', 'python', 'golang', 'rust', 'php', 'ruby', 'openjdk',
  'eclipse-temurin', 'maven', 'gradle', 'postgres', 'mysql', 'mariadb',
  'mongo', 'redis', 'rabbitmq', 'memcached', 'nginx', 'httpd', 'caddy',
  'traefik', 'haproxy',
]);

function isProtectedImageRepository(repository) {
  if (!repository || repository === '<none>') return false;
  const parts = String(repository).split('/');
  const last = parts[parts.length - 1];
  if (!PROTECTED_IMAGE_REPOS.has(last)) return false;
  const first = parts[0];
  const hasRegistry = parts.length > 1 && (first === 'localhost' || first.includes('.') || first.includes(':'));
  const rest = hasRegistry ? parts.slice(1) : parts;
  return rest.length === 1 || rest[0] === 'library';
}

/**
 * Remove explicitly reviewed images. Safety is enforced here as well as in the
 * UI: every reference must still exist, must not be referenced by a container
 * and must not be a protected base image. Removal uses argument arrays, never
 * a shell and never --force, so Docker refuses anything still in use.
 */
async function removeUnusedImages(refs) {
  if (!Array.isArray(refs) || refs.length === 0) throw new Error('No images were selected');
  const wanted = [...new Set(refs)];
  if (wanted.length > 100) throw new Error('Too many images in one request');
  if (wanted.some((ref) => !validId(ref))) throw new Error('Invalid image reference');
  invalidate('images');
  const list = await imagesList();
  if (!list.ok) return { ok: false, error: list.error || 'Could not list images' };
  const byRef = new Map();
  for (const img of list.items) {
    byRef.set(img.id, img);
    byRef.set(img.name, img);
  }
  const checked = new Set();
  for (const ref of wanted) {
    const img = byRef.get(ref) || list.items.find((i) => i.id.startsWith(ref));
    if (!img) return { ok: false, error: `Image ${ref} no longer exists. Refresh the list.` };
    const used = Number(img.containers);
    if (!Number.isFinite(used)) return { ok: false, error: `${img.name} has an unknown usage state.` };
    if (used > 0) return { ok: false, error: `${img.name} is used by ${used} container(s).` };
    if (isProtectedImageRepository(img.repository)) return { ok: false, error: `${img.name} is a protected base image.` };
    checked.add(img.id);
  }
  const timeout = Math.min(240000, 30000 + wanted.length * 4000);
  const res = await run(['image', 'rm', ...wanted], { timeout });
  invalidate('images'); invalidate('overview');
  return {
    ok: res.ok,
    stdout: res.stdout.trim(),
    error: res.ok ? null : res.stderr,
    removed: checked.size,
  };
}

async function imageAction(id, action, options = {}) {
  if (action === 'prune') {
    const res = await run(['image', 'prune', '--force'], { timeout: 120000 });
    invalidate('images'); invalidate('overview');
    return { ok: res.ok, stdout: res.stdout.trim(), error: res.ok ? null : res.stderr };
  }
  if (action === 'remove-unused') return removeUnusedImages(options.refs);
  if (!validId(id)) throw new Error('Invalid image reference');
  if (action === 'tag' && (!options.target || !validId(options.target))) throw new Error('Invalid tag target');
  const build = IMAGE_ACTIONS[action];
  if (!build) throw new Error('Unsupported image action');
  const res = await run(build(id, options), { timeout: 60000 });
  invalidate('images'); invalidate('overview');
  if (action === 'history') {
    let data = [];
    try { data = res.stdout.trim().split('\n').filter(Boolean).map((l) => JSON.parse(l)); } catch { /* ignore */ }
    return { ok: res.ok, data, error: res.ok ? null : res.stderr };
  }
  return { ok: res.ok, stdout: res.stdout.trim(), error: res.ok ? null : res.stderr };
}

async function volumesList() {
  return cached('volumes', 3000, async () => {
    const res = await runJson(['volume', 'ls', '--format', '{{json .}}'], { timeout: 12000 });
    if (!res.ok) return { ok: false, error: res.stderr, items: [] };
    const items = (res.data || []).map((v) => ({
      name: v.Name,
      driver: v.Driver,
      scope: v.Scope,
      mountpoint: v.Mountpoint,
      labels: parseLabels(v.Labels),
      createdAt: v.CreatedAt || null,
      inUse: (v.Labels || '').includes('com.docker.compose.volume') ? null : undefined,
    }));
    return { ok: true, items };
  });
}

const VOLUME_ACTIONS = {
  create: (name, o) => ['volume', 'create', ...(o?.driver ? ['--driver', o.driver] : []), name],
  remove: (name, o) => ['volume', 'rm', ...(o?.force ? ['--force'] : []), name],
  inspect: (name) => ['volume', 'inspect', name],
  prune: () => ['volume', 'prune', '--force'],
};

async function volumeAction(name, action, options = {}) {
  if (action === 'prune') {
    const res = await run(['volume', 'prune', '--force'], { timeout: 60000 });
    invalidate('volumes'); invalidate('overview');
    return { ok: res.ok, stdout: res.stdout.trim(), error: res.ok ? null : res.stderr };
  }
  if (!validName(name)) throw new Error('Invalid volume name');
  const build = VOLUME_ACTIONS[action];
  if (!build) throw new Error('Unsupported volume action');
  const res = await run(build(name, options), { timeout: 30000 });
  invalidate('volumes'); invalidate('overview');
  return { ok: res.ok, stdout: res.stdout.trim(), error: res.ok ? null : res.stderr };
}

async function networksList() {
  return cached('networks', 3000, async () => {
    const res = await runJson(['network', 'ls', '--format', '{{json .}}'], { timeout: 12000 });
    if (!res.ok) return { ok: false, error: res.stderr, items: [] };
    const items = (res.data || []).map((n) => ({
      id: n.ID,
      name: n.Name,
      driver: n.Driver,
      scope: n.Scope,
      ipv6: n.IPv6 === 'true',
      internal: n.Internal === 'true',
      createdAt: n.CreatedAt,
      labels: parseLabels(n.Labels),
    }));
    return { ok: true, items };
  });
}

const NETWORK_ACTIONS = {
  create: (name, o) => ['network', 'create', ...(o?.driver ? ['--driver', o.driver] : []), ...(o?.subnet ? ['--subnet', o.subnet] : []), ...(o?.internal ? ['--internal'] : []), name],
  remove: (name) => ['network', 'rm', name],
  inspect: (name) => ['network', 'inspect', name],
  prune: () => ['network', 'prune', '--force'],
};

async function networkAction(name, action, options = {}) {
  if (action === 'prune') {
    const res = await run(['network', 'prune', '--force'], { timeout: 60000 });
    invalidate('networks'); invalidate('overview');
    return { ok: res.ok, stdout: res.stdout.trim(), error: res.ok ? null : res.stderr };
  }
  if (!validName(name)) throw new Error('Invalid network name');
  if (options.subnet && !/^[0-9a-fA-F:.\/]{3,64}$/.test(options.subnet)) throw new Error('Invalid subnet');
  if (options.driver && !validName(options.driver)) throw new Error('Invalid driver');
  const build = NETWORK_ACTIONS[action];
  if (!build) throw new Error('Unsupported network action');
  const res = await run(build(name, options), { timeout: 30000 });
  invalidate('networks'); invalidate('overview');
  if (action === 'inspect') {
    try { return { ok: res.ok, data: JSON.parse(res.stdout), error: res.ok ? null : res.stderr }; }
    catch { return { ok: false, error: 'Could not parse network details.' }; }
  }
  return { ok: res.ok, stdout: res.stdout.trim(), error: res.ok ? null : res.stderr };
}

async function composeList() {
  return cached('compose', 2500, async () => {
    const res = await runJson(['compose', 'ls', '--all', '--format', 'json'], { timeout: 12000 });
    if (!res.ok) return { ok: false, error: res.stderr, items: [] };
    const raw = Array.isArray(res.data) ? res.data : (res.data ? [res.data] : []);
    const items = raw.map((p) => {
      const files = String(p.ConfigFiles || '').split(',').map((s) => s.trim()).filter(Boolean);
      const match = /running\((\d+)\)/.exec(p.Status || '');
      return {
        name: p.Name,
        status: p.Status || 'unknown',
        running: match ? Number(match[1]) : 0,
        files,
        directory: files.length ? path.dirname(files[0]) : '',
      };
    });
    return { ok: true, items };
  });
}

function findComposeProject(name) {
  return composeList().then((list) => (list.items || []).find((p) => p.name === name));
}

async function composeConfig(name) {
  if (!validProject(name)) throw new Error('Invalid project name');
  const project = await findComposeProject(name);
  if (!project || !project.files.length) return { ok: false, error: 'Compose project has no readable config file.' };
  const file = project.files[0];
  if (!validPath(file)) return { ok: false, error: 'Invalid compose file path.' };
  const res = await run(['compose', '-p', name, '-f', file, 'config', '--format', 'json'], { timeout: 20000, env: { COMPOSE_ANSI: 'never' } });
  if (!res.ok) {
    const fallback = await run(['compose', '-p', name, '-f', file, 'config'], { timeout: 20000 });
    return { ok: fallback.ok, raw: fallback.stdout, error: fallback.ok ? null : res.stderr, file, directory: project.directory };
  }
  try {
    return { ok: true, config: JSON.parse(res.stdout), raw: res.stdout, file, directory: project.directory, project };
  } catch {
    return { ok: true, raw: res.stdout, file, directory: project.directory, project };
  }
}

const COMPOSE_ACTIONS = new Set(['up', 'down', 'restart', 'start', 'stop', 'pull', 'build', 'ps', 'logs']);
async function composeAction(name, action, options = {}) {
  if (!validProject(name)) throw new Error('Invalid project name');
  if (!COMPOSE_ACTIONS.has(action)) throw new Error('Unsupported compose action');
  const project = await findComposeProject(name);
  if (!project) throw new Error('Compose project was not found');
  if (!project.files.length) throw new Error('Compose project has no config file');
  const args = ['compose', '-p', name, '-f', project.files[0]];
  if (action === 'up') args.push('up', '-d', ...(options.build ? ['--build'] : []));
  else if (action === 'down') args.push('down', ...(options.volumes ? ['--volumes'] : []));
  else if (action === 'logs') args.push('logs', '--tail', String(Math.max(20, Math.min(500, Number(options.tail) || 200))), '--no-color');
  else args.push(action);
  const res = await run(args, { timeout: action === 'build' || action === 'pull' ? 300000 : 120000, env: { COMPOSE_ANSI: 'never' } });
  invalidate('compose'); invalidate('containers'); invalidate('overview');
  return { ok: res.ok, stdout: stripAnsi(res.stdout).slice(-200000), error: res.ok ? null : stripAnsi(res.stderr) };
}

async function pickComposeFile(dialog, window) {
  const result = await dialog.showOpenDialog(window, {
    title: 'Open a Compose file',
    properties: ['openFile'],
    filters: [{ name: 'Compose files', extensions: ['yml', 'yaml'] }],
  });
  return result.canceled ? null : result.filePaths[0];
}

async function builds() {
  return cached('builds', 4000, async () => {
    const [builders, df] = await Promise.all([
      runJson(['buildx', 'ls', '--format', 'json'], { timeout: 12000 }),
      systemDf(),
    ]);
    let items = [];
    if (builders.ok) {
      const raw = Array.isArray(builders.data) ? builders.data : (builders.data ? [builders.data] : []);
      items = raw.map((b) => ({
        name: b.Name,
        driver: b.Driver,
        current: !!b.Current,
        dynamic: !!b.Dynamic,
        lastActivity: b.LastActivity,
        nodes: (b.Nodes || []).map((n) => ({
          name: n.Name,
          endpoint: n.Endpoint,
          platforms: n.Platforms || [],
          status: n.Status,
        })),
      }));
    }
    return {
      ok: true,
      items,
      error: builders.ok ? null : builders.stderr,
      cache: (df.items || []).find((d) => /build cache/i.test(d.type)) || null,
    };
  });
}

async function registries() {
  const configPath = path.join(os.homedir(), '.docker', 'config.json');
  let auths = [];
  let credsStore = null;
  try {
    const config = JSON.parse(fs.readFileSync(configPath, 'utf8'));
    credsStore = config.credsStore || null;
    auths = Object.keys(config.auths || {}).map((host) => ({ host, username: config.auths[host]?.username || null }));
  } catch { /* no docker login config */ }
  const images = await imagesList();
  const usage = new Map();
  for (const img of images.items || []) usage.set(img.registry, (usage.get(img.registry) || 0) + 1);
  return {
    ok: true,
    authenticated: auths,
    credsStore,
    imageRegistries: [...usage.entries()].map(([host, count]) => ({ host, count })).sort((a, b) => b.count - a.count),
    configPath,
  };
}

async function searchRegistry(query) {
  const q = String(query || '').trim();
  if (!/^[A-Za-z0-9][A-Za-z0-9._/-]{0,120}$/.test(q)) throw new Error('Invalid search term');
  const res = await run(['search', '--limit', '30', '--format', '{{json .}}', q], { timeout: 30000 });
  if (!res.ok) return { ok: false, error: res.stderr, items: [] };
  let items = [];
  try {
    items = res.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const raw = JSON.parse(line);
      return {
        name: raw.Name,
        description: raw.Description,
        stars: raw.StarCount,
        official: raw.IsOfficial === 'true' || raw.IsOfficial === true,
        automated: raw.IsAutomated === 'true' || raw.IsAutomated === true,
      };
    });
  } catch { /* ignore */ }
  return { ok: true, items };
}

async function stats() {
  const res = await runJson(['stats', '--no-stream', '--format', '{{json .}}'], { timeout: 15000 });
  if (!res.ok) return { ok: false, error: res.stderr, items: [] };
  const num = (v) => {
    if (v == null) return 0;
    const s = String(v).trim();
    const m = /^([\d.]+)\s*([KMGTP]?i?B)$/i.exec(s);
    if (m) {
      const mult = { b: 1, kb: 1e3, kib: 1024, mb: 1e6, mib: 1024 ** 2, gb: 1e9, gib: 1024 ** 3, tb: 1e12, tib: 1024 ** 4 }[m[2].toLowerCase()] || 1;
      return Number(m[1]) * mult;
    }
    return parseFloat(s) || 0;
  };
  const items = (res.data || []).map((s) => {
    const [memUsed, memLimit] = String(s.MemUsage || '0 / 0').split('/').map((x) => x.trim());
    const [netIn, netOut] = String(s.NetIO || '0 / 0').split('/').map((x) => x.trim());
    const [blkRead, blkWrite] = String(s.BlockIO || '0 / 0').split('/').map((x) => x.trim());
    return {
      id: s.ID,
      name: s.Name,
      cpuPercent: parseFloat(s.CPUPerc) || 0,
      memoryPercent: parseFloat(s.MemPerc) || 0,
      memoryUsed: num(memUsed),
      memoryLimit: num(memLimit),
      memoryLabel: s.MemUsage,
      netIn: num(netIn),
      netOut: num(netOut),
      blockRead: num(blkRead),
      blockWrite: num(blkWrite),
      pids: Number(s.PIDs) || 0,
    };
  });
  return { ok: true, items, at: Date.now() };
}

async function events(sinceSeconds = 3600) {
  const since = Math.max(60, Math.min(7 * 24 * 3600, Number(sinceSeconds) || 3600));
  const res = await run(['events', '--since', `${since}s`, '--until', '1s', '--format', '{{json .}}'], { timeout: 8000 });
  if (!res.ok && !res.stdout) return { ok: false, error: res.stderr, items: [] };
  let items = [];
  try {
    items = res.stdout.trim().split('\n').filter(Boolean).map((line) => {
      const e = JSON.parse(line);
      return {
        type: e.Type,
        action: e.Action,
        id: e.Actor?.ID || '',
        attributes: e.Actor?.Attributes || {},
        scope: e.scope,
        time: e.time ? e.time * 1000 : (e.timeNano ? Number(e.timeNano) / 1e6 : Date.now()),
      };
    }).sort((a, b) => b.time - a.time);
  } catch { /* ignore */ }
  return { ok: true, items: items.slice(0, 500) };
}

async function systemDf() {
  return cached('df', 5000, async () => {
    const res = await runJson(['system', 'df', '--format', 'json'], { timeout: 15000 });
    if (!res.ok) return { ok: false, error: res.stderr, items: [], raw: res.stdout };
    const parseSize = (value) => {
      const m = /^([\d.]+)\s*(B|kB|MB|GB|TB|KiB|MiB|GiB|TiB)/.exec(String(value || ''));
      if (!m) return 0;
      const mult = { b: 1, kb: 1e3, mb: 1e6, gb: 1e9, tb: 1e12, kib: 1024, mib: 1024 ** 2, gib: 1024 ** 3, tib: 1024 ** 4 }[m[2].toLowerCase()] || 1;
      return Number(m[1]) * mult;
    };
    const items = (res.data || []).map((d) => ({
      type: d.Type,
      count: Number(d.TotalCount) || 0,
      active: Number(d.Active) || 0,
      sizeLabel: d.Size,
      size: parseSize(d.Size),
      reclaimableLabel: d.Reclaimable,
      reclaimable: parseSize(String(d.Reclaimable || '').split(' ')[0]),
    }));
    return { ok: true, items };
  });
}

function stripAnsi(text) {
  return String(text || '')
    .replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '')
    .replace(/\u001b\][^\u0007]*\u0007/g, '')
    .replace(/\r(?!\n)/g, '\n');
}

async function terminalRun(command, consent) {
  if (!consent) return { ok: false, error: 'Command execution requires explicit consent.', needsConsent: true };
  const v = validateTerminal(command);
  if (!v.ok) return { ok: false, error: v.threats.join(' '), blocked: true };
  if (v.tokens.length > 60) return { ok: false, error: 'Too many arguments.' };
  const follows = v.tokens.some((t) => t === '-f' || t === '--follow' || t === '--attach');
  const timeout = follows ? 10000 : 45000;
  const res = await run(v.tokens.slice(1), { timeout });
  return {
    ok: res.ok,
    stdout: stripAnsi(res.stdout).slice(-200000),
    stderr: stripAnsi(res.stderr).slice(-100000),
    code: res.code,
    timedOut: !!res.timedOut,
    command: v.tokens.map((t) => (/\s/.test(t) ? JSON.stringify(t) : t)).join(' '),
  };
}

// ---------- Help parsing for the command reference ----------

const helpCache = new Map();

function parseHelp(text) {
  const lines = String(text || '').replace(/\r\n/g, '\n').split('\n');
  const usage = [];
  let i = 0;
  while (i < lines.length && !/^\s*Usage:/.test(lines[i])) i += 1;
  const usageLines = [];
  if (i < lines.length) {
    usageLines.push(lines[i].replace(/^\s*Usage:\s*/, '').trim());
    let j = i + 1;
    while (j < lines.length && /^\s{2,}\S/.test(lines[j]) && !/^\s{2,}(Options|Commands|Management Commands|Aliases|Examples):/.test(lines[j])) {
      usageLines.push(lines[j].trim()); j += 1;
    }
    i = j;
  }

  const summaryLines = [];
  while (i < lines.length && !/^\s*(Aliases|Options|Global Options|Commands|Management Commands|Examples|Available Commands):/.test(lines[i])) {
    const t = lines[i].trim();
    if (t) summaryLines.push(t);
    i += 1;
  }

  let aliases = [];
  const aliasIdx = lines.findIndex((l) => /^\s*Aliases:/.test(l));
  if (aliasIdx >= 0) {
    const inline = lines[aliasIdx].replace(/^\s*Aliases:\s*/, '').trim();
    if (inline) aliases = inline.split(',').map((s) => s.trim()).filter(Boolean);
    else if (lines[aliasIdx + 1]) aliases = lines[aliasIdx + 1].trim().split(',').map((s) => s.trim()).filter(Boolean);
  }

  const options = [];
  const commands = [];
  let section = null;
  let currentOption = null;
  let currentCommand = null;
  for (let k = 0; k < lines.length; k += 1) {
    const line = lines[k];
    const header = /^\s*(Options|Global Options|Commands|Management Commands|Available Commands|Examples):\s*$/.exec(line);
    if (header) {
      section = header[1];
      currentOption = null; currentCommand = null;
      continue;
    }
    if (!section) continue;
    if (section === 'Examples') continue;

    if (section === 'Options' || section === 'Global Options') {
      const m = /^\s+(?:(-\w)(?:,\s*)?)?(--[A-Za-z0-9-]+)(?:\s+([A-Za-z0-9_<>\[\]|.,-]+))?\s{2,}(.+)$/.exec(line);
      if (m) {
        currentOption = {
          short: m[1] || null,
          long: m[2],
          value: m[3] || null,
          description: m[4].trim(),
        };
        options.push(currentOption);
        continue;
      }
      const shortOnly = /^\s+(-\w)(?:,\s*(-\w))?\s{2,}(.+)$/.exec(line);
      if (shortOnly) {
        currentOption = { short: shortOnly[1] + (shortOnly[2] ? `, ${shortOnly[2]}` : ''), long: null, value: null, description: shortOnly[3].trim() };
        options.push(currentOption); continue;
      }
      if (currentOption && /^\s{20,}\S/.test(line)) {
        currentOption.description += ' ' + line.trim();
      }
      continue;
    }

    const cmdMatch = /^\s{2,}([A-Za-z0-9][A-Za-z0-9_-]*)(?:,\s*([A-Za-z0-9][A-Za-z0-9_-]*))?\*?\s{2,}(.+)$/.exec(line);
    if (cmdMatch) {
      currentCommand = { name: cmdMatch[1], alias: cmdMatch[2] || null, summary: cmdMatch[3].trim() };
      commands.push(currentCommand);
    } else if (currentCommand && /^\s{12,}\S/.test(line)) {
      currentCommand.summary += ' ' + line.trim();
    }
  }

  return {
    usage: usageLines.join(' ') || null,
    summary: summaryLines.join(' ').trim() || null,
    aliases: [...new Set(aliases)],
    options: dedupeOptions(options),
    commands: dedupeCommands(commands),
  };
}

function dedupeOptions(options) {
  const seen = new Set();
  return options.filter((o) => {
    const key = (o.long || '') + (o.short || '') + (o.value || '');
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
function dedupeCommands(commands) {
  const seen = new Set();
  return commands.filter((c) => { if (seen.has(c.name)) return false; seen.add(c.name); return true; });
}

async function commandIndex() {
  return cached('command-index', 60 * 60 * 1000, async () => {
    const [dockerHelp, composeHelp] = await Promise.all([
      run(['help'], { timeout: 10000 }),
      run(['compose', '--help'], { timeout: 10000 }),
    ]);
    const engine = dockerHelp.ok ? parseHelp(dockerHelp.stdout) : { commands: [], options: [], summary: null };
    const compose = composeHelp.ok ? parseHelp(composeHelp.stdout) : { commands: [], options: [], summary: null };
    return {
      ok: dockerHelp.ok,
      engine,
      compose,
      fetchedAt: new Date().toISOString(),
    };
  });
}

async function commandHelp(command) {
  const parts = String(command || '').trim().split(/\s+/);
  if (!parts.length || parts.length > 4 || parts.some((p) => !/^[a-z0-9][a-z0-9-]*$/.test(p))) {
    throw new Error('Invalid command');
  }
  const key = parts.join(' ');
  if (helpCache.has(key)) return helpCache.get(key);
  const res = await run([...parts, '--help'], { timeout: 12000 });
  if (!res.ok) return { ok: false, error: res.stderr, command: key };
  const parsed = parseHelp(res.stdout);
  const result = { ok: true, command: key, ...parsed, raw: res.stdout, fetchedAt: new Date().toISOString() };
  helpCache.set(key, result);
  return result;
}

module.exports = {
  status, overview, containersList, inspectContainer, containerLogs, containerAction,
  imagesList, imageAction, removeUnusedImages, isProtectedImageRepository,
  volumesList, volumeAction, networksList, networkAction,
  composeList, composeConfig, composeAction, pickComposeFile, builds, registries,
  searchRegistry, stats, events, systemDf, terminalRun, commandIndex, commandHelp,
  parseHelp, stripAnsi, invalidate, validId, validName, validProject, runRaw: run,
};
