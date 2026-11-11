'use strict';

/**
 * Persistent database connection profiles and activity history.
 *
 * Profiles live in the app profile as JSON with mode 0600. Passwords, private
 * keys and certificates are stored as vault ciphertext inside `secret`; the
 * renderer only receives booleans describing what is configured.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { writePrivate } = require('./vault');
const { safeDriverOptions } = require('./adapters/util');

const MAX_ACTIVITY = 800;
const MAX_HISTORY = 400;

const SECRET_FIELDS = ['password', 'sshPassword', 'sshPrivateKey', 'sslKey', 'sslCert', 'sslCa'];

function clean(value, max = 400) {
  return String(value == null ? '' : value).slice(0, max);
}

function validPort(value, fallback) {
  const port = Number(value);
  return Number.isInteger(port) && port > 0 && port < 65536 ? port : fallback;
}

function validId(value) {
  return typeof value === 'string' && /^[a-f0-9-]{8,64}$/i.test(value);
}

/** Remove credential material from a free-form message before logging it. */
function sanitizeMessage(text) {
  return clean(text, 900)
    .replace(/(password|passwd|pwd|secret|token|api[_-]?key)\s*[=:]\s*[^\s,;]+/gi, '$1=••••')
    .replace(/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g, '•••• private key ••••')
    .replace(/\/\/[^/@\s]+:[^/@\s]+@/g, '//••••:••••@');
}

function sanitizeQuery(text) {
  const source = clean(text, 20000);
  if (/(password|passwd|secret|token|api[_-]?key|credential)\s*=/i.test(source)) {
    return '[statement redacted: contains credential material]';
  }
  return source;
}

class DatabaseStore {
  constructor(app, vault) {
    this.file = path.join(app.getPath('userData'), 'databases.json');
    this.vault = vault;
    this.data = { version: 1, connections: [], activity: [], history: [] };
    this.persistTimer = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (raw && typeof raw === 'object') {
        this.data = {
          version: 1,
          connections: Array.isArray(raw.connections) ? raw.connections : [],
          activity: Array.isArray(raw.activity) ? raw.activity : [],
          history: Array.isArray(raw.history) ? raw.history : [],
        };
      }
    } catch { /* first run or unreadable file */ }
  }

  persistNow() {
    clearTimeout(this.persistTimer);
    this.persistTimer = null;
    try {
      writePrivate(this.file, JSON.stringify(this.data, null, 2));
    } catch (error) {
      console.error('Could not save database profiles:', sanitizeMessage(error.message));
    }
  }

  schedulePersist() {
    clearTimeout(this.persistTimer);
    this.persistTimer = setTimeout(() => this.persistNow(), 250);
  }

  // -------------------------------------------------------------- profiles
  profile(input = {}, existing = null) {
    const now = new Date().toISOString();
    const engine = clean(input.engine, 40).toLowerCase();
    const sslMode = ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'].includes(input.ssl?.mode)
      ? input.ssl.mode
      : 'prefer';
    const profile = {
      id: existing?.id || (validId(input.id) ? input.id : crypto.randomUUID()),
      name: clean(input.name || existing?.name || 'Untitled connection', 120).trim() || 'Untitled connection',
      engine,
      group: clean(input.group ?? existing?.group ?? '', 80).trim(),
      favorite: input.favorite === undefined ? Boolean(existing?.favorite) : input.favorite === true,
      color: /^#[0-9a-f]{6}$/i.test(input.color || '') ? input.color : (existing?.color || ''),
      host: clean(input.host ?? existing?.host ?? '', 255).trim(),
      port: validPort(input.port ?? existing?.port, 0),
      username: clean(input.username ?? existing?.username ?? '', 128),
      database: clean(input.database ?? existing?.database ?? '', 128),
      file: clean(input.file ?? existing?.file ?? '', 2048),
      authMethod: ['password', 'none', 'ssl-certificate', 'iam'].includes(input.authMethod) ? input.authMethod : (existing?.authMethod || 'password'),
      ssl: {
        mode: sslMode,
        rejectUnauthorized: input.ssl?.rejectUnauthorized !== undefined
          ? input.ssl.rejectUnauthorized === true
          : existing?.ssl?.rejectUnauthorized !== false,
        serverName: clean(input.ssl?.serverName ?? existing?.ssl?.serverName ?? '', 255),
      },
      ssh: {
        enabled: input.ssh?.enabled === true,
        host: clean(input.ssh?.host ?? existing?.ssh?.host ?? '', 255).trim(),
        port: validPort(input.ssh?.port ?? existing?.ssh?.port, 22),
        username: clean(input.ssh?.username ?? existing?.ssh?.username ?? '', 128),
        authMethod: ['password', 'private-key', 'agent'].includes(input.ssh?.authMethod) ? input.ssh.authMethod : (existing?.ssh?.authMethod || 'private-key'),
      },
      options: this.options(input.options ?? existing?.options),
      timeoutMs: Math.max(1000, Math.min(60000, Number(input.timeoutMs ?? existing?.timeoutMs) || 10000)),
      pool: {
        min: Math.max(0, Math.min(20, Number(input.pool?.min ?? existing?.pool?.min) || 0)),
        max: Math.max(1, Math.min(50, Number(input.pool?.max ?? existing?.pool?.max) || 5)),
        idleMs: Math.max(1000, Math.min(300000, Number(input.pool?.idleMs ?? existing?.pool?.idleMs) || 30000)),
      },
      source: this.source(input.source ?? existing?.source),
      readOnly: input.readOnly === true,
      createdAt: existing?.createdAt || now,
      updatedAt: now,
      lastConnectedAt: existing?.lastConnectedAt || null,
      lastStatus: existing?.lastStatus || null,
      secrets: existing?.secrets || {},
    };
    return profile;
  }

  options(value) {
    const out = {};
    if (!value || typeof value !== 'object') return out;
    const safe = safeDriverOptions(value);
    for (const [key, raw] of Object.entries(safe)) {
      const text = clean(raw, 500);
      if (text) out[key] = text;
    }
    return out;
  }

  source(value) {
    if (!value || typeof value !== 'object') return { type: 'manual' };
    return {
      type: ['manual', 'docker', 'compose', 'kubernetes', 'local'].includes(value.type) ? value.type : 'manual',
      containerId: clean(value.containerId, 128),
      containerName: clean(value.containerName, 200),
      containerImage: clean(value.containerImage, 300),
      project: clean(value.project, 160),
      service: clean(value.service, 160),
      namespace: clean(value.namespace, 160),
      pod: clean(value.pod, 200),
      workload: clean(value.workload, 200),
      context: clean(value.context, 260),
      serviceName: clean(value.serviceName, 200),
      hostPort: validPort(value.hostPort, 0),
      internalPort: validPort(value.internalPort, 0),
      volumePersistent: value.volumePersistent === true,
      detectedAt: clean(value.detectedAt, 40),
    };
  }

  /** Store provided credential values encrypted; keep existing ones when blank. */
  applySecrets(profile, input = {}) {
    const incoming = input.secrets || {};
    for (const field of SECRET_FIELDS) {
      const raw = incoming[field];
      if (raw === null) {
        delete profile.secrets[field];
      } else if (typeof raw === 'string' && raw.length) {
        profile.secrets[field] = this.vault.encrypt(raw.slice(0, 256 * 1024));
      }
    }
    return profile;
  }

  secret(profile, field) {
    const value = profile?.secrets?.[field];
    if (!value) return '';
    try { return this.vault.decrypt(value); } catch { return ''; }
  }

  all() {
    return this.data.connections;
  }

  get(id) {
    return this.data.connections.find((item) => item.id === id) || null;
  }

  create(input) {
    const profile = this.applySecrets(this.profile(input), input);
    this.data.connections.push(profile);
    this.schedulePersist();
    return profile;
  }

  update(id, input) {
    const existing = this.get(id);
    if (!existing) return null;
    const next = this.applySecrets(this.profile(input, existing), input);
    const idx = this.data.connections.indexOf(existing);
    this.data.connections[idx] = next;
    this.schedulePersist();
    return next;
  }

  remove(id) {
    const before = this.data.connections.length;
    this.data.connections = this.data.connections.filter((item) => item.id !== id);
    if (this.data.connections.length !== before) {
      this.schedulePersist();
      return true;
    }
    return false;
  }

  duplicate(id, name) {
    const existing = this.get(id);
    if (!existing) return null;
    const copy = JSON.parse(JSON.stringify(existing));
    copy.id = crypto.randomUUID();
    copy.name = clean(name || `${existing.name} copy`, 120);
    copy.createdAt = new Date().toISOString();
    copy.updatedAt = copy.createdAt;
    copy.lastConnectedAt = null;
    copy.lastStatus = null;
    this.data.connections.push(copy);
    this.schedulePersist();
    return copy;
  }

  setFavorite(id, favorite) {
    const profile = this.get(id);
    if (!profile) return null;
    profile.favorite = favorite === true;
    profile.updatedAt = new Date().toISOString();
    this.schedulePersist();
    return profile;
  }

  markConnected(id, status) {
    const profile = this.get(id);
    if (!profile) return;
    profile.lastStatus = status;
    if (status && status.ok) profile.lastConnectedAt = new Date().toISOString();
    profile.updatedAt = new Date().toISOString();
    this.schedulePersist();
  }

  // -------------------------------------------------------------- activity
  activity(entry = {}) {
    const row = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      kind: clean(entry.kind, 40) || 'operation',
      connectionId: clean(entry.connectionId, 64),
      connectionName: clean(entry.connectionName, 120),
      engine: clean(entry.engine, 40),
      status: entry.status === 'success' ? 'success' : entry.status === 'warning' ? 'warning' : 'error',
      message: sanitizeMessage(entry.message || ''),
      detail: entry.detail ? sanitizeMessage(entry.detail) : '',
      durationMs: Number.isFinite(entry.durationMs) ? Math.max(0, Math.round(entry.durationMs)) : null,
      source: clean(entry.source, 40) || 'opsdeck',
      query: entry.query ? sanitizeQuery(entry.query) : '',
      rows: Number.isFinite(entry.rows) ? Math.max(0, Math.round(entry.rows)) : null,
    };
    this.data.activity.unshift(row);
    if (this.data.activity.length > MAX_ACTIVITY) this.data.activity.length = MAX_ACTIVITY;
    this.schedulePersist();
    return row;
  }

  listActivity({ limit = 200, kind = '', status = '', connectionId = '' } = {}) {
    const count = Math.max(1, Math.min(MAX_ACTIVITY, Number(limit) || 200));
    return this.data.activity
      .filter((row) => (!kind || row.kind === kind)
        && (!status || row.status === status)
        && (!connectionId || row.connectionId === connectionId))
      .slice(0, count);
  }

  // -------------------------------------------------------------- queries
  addHistory(entry = {}) {
    const row = {
      id: crypto.randomUUID(),
      at: new Date().toISOString(),
      connectionId: clean(entry.connectionId, 64),
      connectionName: clean(entry.connectionName, 120),
      engine: clean(entry.engine, 40),
      database: clean(entry.database, 128),
      sql: sanitizeQuery(entry.sql || ''),
      ok: entry.ok === true,
      durationMs: Number.isFinite(entry.durationMs) ? Math.max(0, Math.round(entry.durationMs)) : null,
      rowCount: Number.isFinite(entry.rowCount) ? Math.max(0, Math.round(entry.rowCount)) : null,
      error: entry.error ? sanitizeMessage(entry.error) : '',
    };
    this.data.history.unshift(row);
    if (this.data.history.length > MAX_HISTORY) this.data.history.length = MAX_HISTORY;
    this.schedulePersist();
    return row;
  }

  history({ limit = 100, connectionId = '' } = {}) {
    const count = Math.max(1, Math.min(MAX_HISTORY, Number(limit) || 100));
    return this.data.history
      .filter((row) => !connectionId || row.connectionId === connectionId)
      .slice(0, count);
  }

  clearHistory() {
    this.data.history = [];
    this.schedulePersist();
  }

  stats() {
    const connections = this.data.connections;
    return {
      connections: connections.length,
      favorites: connections.filter((c) => c.favorite).length,
      groups: [...new Set(connections.map((c) => c.group).filter(Boolean))].length,
      recent: connections
        .filter((c) => c.lastConnectedAt)
        .sort((a, b) => String(b.lastConnectedAt).localeCompare(String(a.lastConnectedAt)))
        .slice(0, 5),
    };
  }
}

module.exports = { DatabaseStore, sanitizeMessage, sanitizeQuery, SECRET_FIELDS };
