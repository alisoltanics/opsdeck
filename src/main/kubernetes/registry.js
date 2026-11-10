'use strict';

/**
 * Local Kubernetes configuration registry.
 *
 * OpsDeck never edits the user's ~/.kube/config. Imported kubeconfigs are
 * copied into the app data directory with mode 0600 and referenced through
 * KUBECONFIG. Only context metadata is ever returned to the renderer.
 */

const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const crypto = require('node:crypto');

function writeJson(file, value) {
  const dir = path.dirname(file);
  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const tmp = `${file}.${process.pid}.tmp`;
  fs.writeFileSync(tmp, JSON.stringify(value, null, 2), { mode: 0o600 });
  try { fs.chmodSync(tmp, 0o600); } catch { /* best effort */ }
  fs.renameSync(tmp, file);
  try { fs.chmodSync(file, 0o600); } catch { /* best effort */ }
}

function readJson(file, fallback) {
  try {
    const data = JSON.parse(fs.readFileSync(file, 'utf8'));
    return data && typeof data === 'object' ? data : fallback;
  } catch {
    return fallback;
  }
}

function existingFilePath(value) {
  const text = String(value || '').trim();
  if (!text || text.includes('\u0000')) return null;
  try {
    return fs.statSync(text).isFile() ? path.resolve(text) : null;
  } catch {
    return null;
  }
}

class KubeRegistry {
  constructor(app) {
    this.root = path.join(app.getPath('userData'), 'k8s');
    this.importsDir = path.join(this.root, 'imports');
    this.registryFile = path.join(this.root, 'imports.json');
    this.settingsFile = path.join(this.root, 'settings.json');
  }

  ensure() {
    fs.mkdirSync(this.importsDir, { recursive: true, mode: 0o700 });
    try { fs.chmodSync(this.root, 0o700); } catch { /* best effort */ }
  }

  basePaths() {
    const configured = String(process.env.KUBECONFIG || '')
      .split(path.delimiter)
      .map((item) => existingFilePath(item))
      .filter(Boolean);
    if (configured.length) return [...new Set(configured)];
    const fallback = existingFilePath(path.join(os.homedir(), '.kube', 'config'));
    return fallback ? [fallback] : [];
  }

  imports() {
    const data = readJson(this.registryFile, { imports: [] });
    const list = Array.isArray(data.imports) ? data.imports : [];
    return list
      .filter((entry) => entry && typeof entry.id === 'string' && typeof entry.file === 'string')
      .map((entry) => ({ ...entry, file: existingFilePath(entry.file) }))
      .filter((entry) => entry.file);
  }

  addImport(entry) {
    const imports = this.imports().filter((item) => item.id !== entry.id && item.hash !== entry.hash);
    imports.push(entry);
    this.ensure();
    writeJson(this.registryFile, { version: 1, imports });
    return entry;
  }

  removeImport(id) {
    const imports = this.imports();
    const entry = imports.find((item) => item.id === id);
    if (!entry) return null;
    const remaining = imports.filter((item) => item.id !== id);
    try { fs.unlinkSync(entry.file); } catch { /* already gone */ }
    writeJson(this.registryFile, { version: 1, imports: remaining });
    return entry;
  }

  copyImport(sourcePath, content) {
    this.ensure();
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    const id = `kc_${hash}`;
    const target = path.join(this.importsDir, `${id}.yaml`);
    fs.writeFileSync(target, content, { mode: 0o600 });
    try { fs.chmodSync(target, 0o600); } catch { /* best effort */ }
    return { id, hash, file: target, source: path.basename(sourcePath) };
  }

  settings() {
    const data = readJson(this.settingsFile, {});
    return {
      context: typeof data.context === 'string' ? data.context : '',
      namespace: typeof data.namespace === 'string' ? data.namespace : 'default',
    };
  }

  saveSettings(patch = {}) {
    const current = this.settings();
    const next = {
      context: typeof patch.context === 'string' ? patch.context : current.context,
      namespace: typeof patch.namespace === 'string' ? patch.namespace : current.namespace,
    };
    this.ensure();
    writeJson(this.settingsFile, next);
    return next;
  }

  kubeconfigPaths() {
    return [...this.basePaths(), ...this.imports().map((entry) => entry.file)];
  }

  env() {
    const paths = this.kubeconfigPaths();
    if (!paths.length) return {};
    return { KUBECONFIG: paths.join(path.delimiter) };
  }

  sources() {
    const base = this.basePaths().map((file, index) => ({
      id: index === 0 ? 'user' : `user_${index}`,
      label: index === 0 ? 'User kubeconfig' : `User kubeconfig (${path.basename(file)})`,
      file,
      imported: false,
    }));
    const imports = this.imports().map((entry) => ({
      id: entry.id,
      label: entry.label || entry.source || 'Imported kubeconfig',
      file: entry.file,
      imported: true,
      importedAt: entry.importedAt || null,
    }));
    return [...base, ...imports];
  }
}

module.exports = { KubeRegistry, writeJson, readJson };
