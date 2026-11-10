'use strict';

/**
 * One-click installer for the Kubernetes command-line tools.
 *
 * Everything is installed into app-managed storage:
 *   <userData>/k8s/tools/bin
 *
 * Nothing is written system-wide, no sudo is used and the user's PATH file is
 * never edited. Downloads use official release endpoints, are checked against
 * the published SHA-256 digest and only the expected archive member is
 * extracted, with path traversal rejected.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { writeJson, readJson } = require('./registry');

const TOOL_NAMES = ['kubectl', 'kind', 'minikube', 'helm'];
const TOOL_LABELS = { kubectl: 'kubectl', kind: 'kind', minikube: 'Minikube', helm: 'Helm' };

// Known-good versions are only used when the release endpoint is unreachable.
const FALLBACK_VERSIONS = { kubectl: 'v1.37.2', kind: 'v0.33.0', minikube: 'v1.39.0', helm: 'v4.3.1' };

const DEFAULT_TIMEOUT = 300000;
const CHECKSUM_TIMEOUT = 60000;
const MAX_DOWNLOAD_BYTES = 256 * 1024 * 1024;
const MAX_BINARY_BYTES = 200 * 1024 * 1024;
const MAX_ARCHIVE_BYTES = 512 * 1024 * 1024;
const VERSION_RE = /^v?\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/;
const USER_AGENT = 'OpsDeck/1.0 (+https://github.com/opsdeck)';

function labelFor(name) {
  return TOOL_LABELS[name] || name;
}

function targetPlatform(platform = process.platform) {
  if (platform === 'linux' || platform === 'darwin' || platform === 'win32') {
    return platform === 'win32' ? 'windows' : platform;
  }
  throw new Error(`Automatic installs are not supported on ${platform}.`);
}

function targetArch(arch = process.arch) {
  if (arch === 'x64') return 'amd64';
  if (arch === 'arm64') return 'arm64';
  if (arch === 'ia32') return '386';
  if (arch === 'ppc64') return 'ppc64le';
  if (arch === 's390x') return 's390x';
  if (arch === 'arm') return 'arm';
  throw new Error(`Automatic installs are not supported on the ${arch} architecture.`);
}

function humanBytes(bytes) {
  const value = Number(bytes) || 0;
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / (1024 * 1024)).toFixed(1)} MB`;
}

function parseChecksum(text) {
  const match = String(text || '').match(/\b[a-fA-F0-9]{64}\b/);
  if (!match) throw new Error('The published checksum file did not contain a SHA-256 digest.');
  return match[0].toLowerCase();
}

function sha256(buffer) {
  return crypto.createHash('sha256').update(buffer).digest('hex');
}

function safeArchivePath(raw) {
  const value = String(raw || '').replace(/\0/g, '').replace(/\\/g, '/').trim();
  if (!value || value.startsWith('/')) return null;
  if (/^[A-Za-z]:\//.test(value)) return null;
  const parts = [];
  for (const segment of value.split('/')) {
    if (!segment || segment === '.') continue;
    if (segment === '..') return null;
    parts.push(segment);
  }
  return parts.length ? parts.join('/') : null;
}

function tarFiles(gzBuffer) {
  const tar = zlib.gunzipSync(gzBuffer, { maxOutputLength: MAX_ARCHIVE_BYTES });
  const files = [];
  let offset = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    let empty = true;
    for (const byte of header) {
      if (byte !== 0) { empty = false; break; }
    }
    if (empty) break;

    const cString = (start, end) => {
      const slice = header.subarray(start, end);
      const zero = slice.indexOf(0);
      return slice.subarray(0, zero === -1 ? slice.length : zero).toString('utf8').trim();
    };

    const name = cString(0, 100);
    const prefix = cString(345, 500);
    const sizeText = cString(124, 136);
    const size = parseInt(sizeText || '0', 8);
    const mode = parseInt(cString(100, 108) || '0', 8);
    const type = header[156] === 0 ? '0' : String.fromCharCode(header[156]);
    const dataStart = offset + 512;

    if (!Number.isFinite(size) || size < 0 || dataStart + size > tar.length) {
      throw new Error('The downloaded archive is corrupt.');
    }

    if (type === '0' || type === '7') {
      const rawPath = prefix ? `${prefix}/${name}` : name;
      const safe = safeArchivePath(rawPath);
      if (safe) files.push({ path: safe, size, mode, data: tar.subarray(dataStart, dataStart + size) });
    }

    offset = dataStart + Math.ceil(size / 512) * 512;
  }
  return files;
}

function extractTarEntry(gzBuffer, expectedPath) {
  const expected = safeArchivePath(expectedPath);
  if (!expected) throw new Error('The expected archive path is not safe.');
  const files = tarFiles(gzBuffer);
  const exact = files.find((file) => file.path === expected);
  const fallback = exact || files.find((file) => path.posix.basename(file.path) === path.posix.basename(expected));
  if (!fallback) throw new Error(`The archive did not contain ${path.posix.basename(expected)}.`);
  if (!fallback.size || fallback.size > MAX_BINARY_BYTES) throw new Error('The extracted binary has an unexpected size.');
  return { path: fallback.path, data: Buffer.from(fallback.data) };
}

function looksExecutable(buffer, os) {
  if (!buffer || buffer.length < 64) return false;
  if (os === 'windows') return buffer[0] === 0x4d && buffer[1] === 0x5a;
  if (os === 'linux') return buffer[0] === 0x7f && buffer[1] === 0x45 && buffer[2] === 0x4c && buffer[3] === 0x46;
  if (os === 'darwin') {
    const magic = buffer.readUInt32BE(0);
    return magic === 0xfeedface || magic === 0xfeedfacf || magic === 0xcafebabe || magic === 0xbebafeca;
  }
  return true;
}

async function fetchBuffer(url, {
  fetchImpl = globalThis.fetch,
  timeout = DEFAULT_TIMEOUT,
  maxBytes = MAX_DOWNLOAD_BYTES,
  onProgress = null,
} = {}) {
  if (typeof fetchImpl !== 'function') throw new Error('This build cannot download files.');
  const parsed = new URL(url);
  if (parsed.protocol !== 'https:') throw new Error('Only https downloads are allowed.');

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  let lastReport = 0;
  try {
    const response = await fetchImpl(url, {
      redirect: 'follow',
      signal: controller.signal,
      headers: { 'user-agent': USER_AGENT, accept: '*/*' },
    });
    if (!response.ok) throw new Error(`Download failed with HTTP ${response.status}.`);
    const total = Number(response.headers.get('content-length') || 0);
    if (total > maxBytes) throw new Error('The download is larger than OpsDeck allows.');

    if (!response.body || typeof response.body[Symbol.asyncIterator] !== 'function') {
      const buffer = Buffer.from(await response.arrayBuffer());
      if (buffer.length > maxBytes) throw new Error('The download is larger than OpsDeck allows.');
      onProgress?.({ received: buffer.length, total: buffer.length, percent: 100 });
      return buffer;
    }

    const chunks = [];
    let received = 0;
    for await (const chunk of response.body) {
      received += chunk.length;
      if (received > maxBytes) throw new Error('The download is larger than OpsDeck allows.');
      chunks.push(Buffer.from(chunk));
      const now = Date.now();
      if (onProgress && (now - lastReport >= 180 || (total && received >= total))) {
        lastReport = now;
        onProgress({ received, total, percent: total ? Math.min(100, (received / total) * 100) : null });
      }
    }
    if (!received) throw new Error('The download was empty.');
    onProgress?.({ received, total: total || received, percent: 100 });
    return Buffer.concat(chunks, received);
  } catch (error) {
    if (error.name === 'AbortError') throw new Error('The download timed out. Check your connection and retry.');
    throw error;
  } finally {
    clearTimeout(timer);
  }
}

async function fetchText(url, options = {}) {
  const buffer = await fetchBuffer(url, { ...options, timeout: options.timeout || CHECKSUM_TIMEOUT, maxBytes: 1024 * 1024 });
  return buffer.toString('utf8');
}

async function resolveVersion(name, { fetchImpl = globalThis.fetch, onProgress = null } = {}) {
  const fallback = FALLBACK_VERSIONS[name];
  try {
    if (name === 'kubectl') {
      const text = (await fetchText('https://dl.k8s.io/release/stable.txt', { fetchImpl })).trim();
      if (!VERSION_RE.test(text)) throw new Error('The kubectl release endpoint returned an unexpected version.');
      return text;
    }
    const repo = name === 'kind' ? 'kubernetes-sigs/kind' : name === 'minikube' ? 'kubernetes/minikube' : 'helm/helm';
    const text = await fetchText(`https://api.github.com/repos/${repo}/releases/latest`, { fetchImpl });
    let data;
    try { data = JSON.parse(text); } catch { throw new Error('The release endpoint returned unreadable data.'); }
    const tag = String(data?.tag_name || '').trim();
    if (!VERSION_RE.test(tag)) throw new Error('The release endpoint returned an unexpected version.');
    return tag;
  } catch (error) {
    if (!fallback) throw error;
    onProgress?.({ phase: 'resolve', message: `Release endpoint unavailable; using ${fallback}.` });
    return fallback;
  }
}

function toolPlan(name, { version, platform = process.platform, arch = process.arch } = {}) {
  const os = targetPlatform(platform);
  const cpu = targetArch(arch);
  const tag = String(version || '');
  if (!VERSION_RE.test(tag)) throw new Error(`The ${labelFor(name)} version is not valid.`);
  const exe = os === 'windows' ? '.exe' : '';

  if (name === 'kubectl') {
    const url = `https://dl.k8s.io/release/${tag}/bin/${os}/${cpu}/kubectl${exe}`;
    return { name, version: tag, os, arch: cpu, url, checksumUrl: `${url}.sha256`, checksumTarget: 'download', archive: false, target: `kubectl${exe}` };
  }
  if (name === 'kind') {
    const url = `https://github.com/kubernetes-sigs/kind/releases/download/${tag}/kind-${os}-${cpu}${exe}`;
    return { name, version: tag, os, arch: cpu, url, checksumUrl: `${url}.sha256sum`, checksumTarget: 'download', archive: false, target: `kind${exe}` };
  }
  if (name === 'minikube') {
    if (os === 'windows') {
      const url = `https://github.com/kubernetes/minikube/releases/download/${tag}/minikube-${os}-${cpu}${exe}`;
      return { name, version: tag, os, arch: cpu, url, checksumUrl: `${url}.sha256`, checksumTarget: 'download', archive: false, target: `minikube${exe}` };
    }
    const url = `https://github.com/kubernetes/minikube/releases/download/${tag}/minikube-${os}-${cpu}.tar.gz`;
    return {
      name,
      version: tag,
      os,
      arch: cpu,
      url,
      checksumUrl: `https://github.com/kubernetes/minikube/releases/download/${tag}/minikube-${os}-${cpu}.sha256`,
      checksumTarget: 'extracted',
      archive: true,
      entry: `out/minikube-${os}-${cpu}`,
      target: `minikube${exe}`,
    };
  }
  if (name === 'helm') {
    if (os === 'windows') throw new Error('Helm installs automatically on Linux and macOS. Install Helm manually on Windows.');
    const url = `https://get.helm.sh/helm-${tag}-${os}-${cpu}.tar.gz`;
    return {
      name,
      version: tag,
      os,
      arch: cpu,
      url,
      checksumUrl: `${url}.sha256sum`,
      checksumTarget: 'download',
      archive: true,
      entry: `${os}-${cpu}/helm`,
      target: 'helm',
    };
  }
  throw new Error(`Unknown tool: ${name}`);
}

function binDir(app) {
  return path.join(app.getPath('userData'), 'k8s', 'tools', 'bin');
}

function toolsPathEnv(app) {
  const dir = binDir(app);
  const current = String(process.env.PATH || '');
  return current ? `${dir}${path.delimiter}${current}` : dir;
}

function installedFile(app) {
  return path.join(app.getPath('userData'), 'k8s', 'tools', 'installed.json');
}

function readInstalled(app) {
  const data = readJson(installedFile(app), { tools: {} });
  return data && typeof data.tools === 'object' && data.tools ? data.tools : {};
}

function recordInstall(app, result) {
  const tools = readInstalled(app);
  tools[result.name] = {
    version: result.version,
    path: result.path,
    checksum: result.checksum,
    bytes: result.bytes,
    installedAt: new Date().toISOString(),
  };
  writeJson(installedFile(app), { version: 1, tools });
}

function atomicWrite(file, data, mode = 0o755) {
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o755 });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`;
  try {
    fs.writeFileSync(tmp, data, { mode });
    try { fs.chmodSync(tmp, mode); } catch { /* best effort */ }
    try {
      fs.renameSync(tmp, file);
    } catch {
      fs.rmSync(file, { force: true });
      fs.renameSync(tmp, file);
    }
    try { fs.chmodSync(file, mode); } catch { /* best effort */ }
  } catch (error) {
    try { fs.rmSync(tmp, { force: true }); } catch { /* best effort */ }
    throw error;
  }
}

async function installTool(name, {
  app,
  platform = process.platform,
  arch = process.arch,
  fetchImpl = globalThis.fetch,
  onProgress = null,
} = {}) {
  if (!TOOL_NAMES.includes(name)) throw new Error(`Unknown tool: ${name}`);
  if (!app || typeof app.getPath !== 'function') throw new Error('App storage is not available.');

  const emit = (patch) => onProgress?.({ tool: name, label: labelFor(name), ...patch });
  emit({ phase: 'resolve', message: 'Resolving the current release…' });
  const version = await resolveVersion(name, { fetchImpl, onProgress: emit });
  const plan = toolPlan(name, { version, platform, arch });

  emit({ phase: 'download', message: `Downloading ${plan.version}…`, percent: 0 });
  let lastEmit = 0;
  const archive = await fetchBuffer(plan.url, {
    fetchImpl,
    maxBytes: MAX_DOWNLOAD_BYTES,
    onProgress: ({ received, total, percent }) => {
      const now = Date.now();
      if (now - lastEmit < 180 && percent !== 100) return;
      lastEmit = now;
      emit({
        phase: 'download',
        message: total ? `${humanBytes(received)} of ${humanBytes(total)}` : humanBytes(received),
        percent: typeof percent === 'number' ? percent : null,
        received,
        total,
      });
    },
  });

  emit({ phase: 'extract', message: plan.archive ? 'Verifying and unpacking the archive…' : 'Reading the downloaded binary…', percent: null });
  let binary = archive;
  if (plan.archive) {
    const extracted = extractTarEntry(archive, plan.entry);
    binary = extracted.data;
  }

  emit({ phase: 'verify', message: 'Verifying the published SHA-256 checksum…', percent: null });
  const checksumText = await fetchText(plan.checksumUrl, { fetchImpl });
  const expected = parseChecksum(checksumText);
  const actual = sha256(plan.checksumTarget === 'extracted' ? binary : archive);
  if (actual !== expected) {
    throw new Error(`The ${labelFor(name)} download failed checksum verification. Nothing was installed.`);
  }
  if (!looksExecutable(binary, plan.os)) {
    throw new Error(`The ${labelFor(name)} download did not contain a valid ${plan.os} executable. Nothing was installed.`);
  }

  emit({ phase: 'install', message: 'Installing into OpsDeck storage…', percent: null });
  const target = path.join(binDir(app), plan.target);
  atomicWrite(target, binary, 0o755);
  const result = { name, label: labelFor(name), version: plan.version, path: target, bytes: binary.length, checksum: actual };
  recordInstall(app, result);
  emit({ phase: 'installed', message: `${labelFor(name)} ${plan.version} installed.`, percent: 100 });
  return result;
}

module.exports = {
  TOOL_NAMES,
  TOOL_LABELS,
  FALLBACK_VERSIONS,
  labelFor,
  targetPlatform,
  targetArch,
  parseChecksum,
  sha256,
  safeArchivePath,
  tarFiles,
  extractTarEntry,
  looksExecutable,
  toolPlan,
  resolveVersion,
  fetchBuffer,
  binDir,
  toolsPathEnv,
  readInstalled,
  installTool,
  __test: { humanBytes },
};
