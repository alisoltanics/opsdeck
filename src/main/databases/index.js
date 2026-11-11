'use strict';

/**
 * Database service orchestrator.
 *
 * Owns the connection profiles, the live adapter sessions and every database
 * operation that crosses IPC. The renderer never sees passwords or keys: it
 * receives profiles with `has*` flags and operation results only.
 */

const net = require('node:net');
const path = require('node:path');
const registry = require('./registry');
const { SecretVault } = require('./vault');
const { DatabaseStore, sanitizeMessage } = require('./store');
const { createAdapter } = require('./adapters');
const { isReadOnlySql, splitStatements, safeError, explainConnectionError, boundedLimit, boundedOffset } = require('./adapters/util');
const discovery = require('./discovery');
const { startKubernetesTunnel } = require('./tunnel');

const DISCOVERY_TTL = 8000;
const SESSION_MAX_IDLE = 15 * 60 * 1000;
const SECRET_KEY_RE = /pass|secret|token|private|credential/i;

function clean(value, max = 400) {
  return String(value == null ? '' : value).slice(0, max);
}

function validId(value) {
  return typeof value === 'string' && /^[a-f0-9-]{8,64}$/i.test(value);
}

function sanitizeOptions(options) {
  const out = {};
  for (const [key, value] of Object.entries(options || {})) {
    if (SECRET_KEY_RE.test(key)) continue;
    out[key] = clean(value, 500);
  }
  return out;
}

/** Potentially destructive statement detection (comments removed first). */
function destructiveReason(sql) {
  const text = String(sql || '')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();
  if (!text) return '';
  const statements = splitStatements(text);
  for (const statement of statements) {
    if (/^drop\s+(database|schema|table|view|materialized\s+view|index|user|role|extension|function|procedure|trigger|sequence)\b/i.test(statement)) {
      return 'DROP removes database objects and cannot be undone.';
    }
    if (/^truncate\b/i.test(statement)) return 'TRUNCATE removes every row in the target table.';
    if (/^delete\b/i.test(statement) && !/\bwhere\b/i.test(statement)) {
      return 'DELETE without a WHERE clause removes every row.';
    }
    if (/^alter\s+table\b/i.test(statement) && /\bdrop\b/i.test(statement)) {
      return 'ALTER TABLE … DROP removes a column or constraint.';
    }
    if (/^(flushall|flushdb|shutdown)\b/i.test(statement)) return `${statement.split(/\s+/)[0].toUpperCase()} is destructive.`;
    if (/^update\b/i.test(statement) && !/\bwhere\b/i.test(statement)) {
      return 'UPDATE without a WHERE clause modifies every row.';
    }
  }
  return '';
}

function publicProfile(profile) {
  if (!profile) return null;
  return {
    id: profile.id,
    name: profile.name,
    engine: profile.engine,
    group: profile.group,
    favorite: profile.favorite === true,
    color: profile.color || '',
    host: profile.host,
    port: profile.port,
    username: profile.username,
    database: profile.database,
    file: profile.file,
    authMethod: profile.authMethod,
    ssl: {
      mode: profile.ssl?.mode || 'prefer',
      rejectUnauthorized: profile.ssl?.rejectUnauthorized !== false,
      serverName: profile.ssl?.serverName || '',
    },
    ssh: {
      enabled: profile.ssh?.enabled === true,
      host: profile.ssh?.host || '',
      port: profile.ssh?.port || 22,
      username: profile.ssh?.username || '',
      authMethod: profile.ssh?.authMethod || 'private-key',
    },
    options: sanitizeOptions(profile.options),
    timeoutMs: profile.timeoutMs,
    pool: profile.pool || { min: 0, max: 5, idleMs: 30000 },
    source: profile.source || { type: 'manual' },
    readOnly: profile.readOnly === true,
    createdAt: profile.createdAt,
    updatedAt: profile.updatedAt,
    lastConnectedAt: profile.lastConnectedAt,
    lastStatus: profile.lastStatus,
    hasPassword: Boolean(profile.secrets?.password),
    hasSshPassword: Boolean(profile.secrets?.sshPassword),
    hasSshPrivateKey: Boolean(profile.secrets?.sshPrivateKey),
    hasSslMaterial: Boolean(profile.secrets?.sslKey || profile.secrets?.sslCert || profile.secrets?.sslCa),
  };
}

function probeTcp(host, port, timeoutMs = 4000) {
  return new Promise((resolve) => {
    if (!host || !port) {
      resolve({ ok: false, error: 'No TCP endpoint was configured.' });
      return;
    }
    const started = Date.now();
    const socket = net.createConnection({ host, port });
    let settled = false;
    const done = (result) => {
      if (settled) return;
      settled = true;
      socket.destroy();
      resolve({ ...result, latencyMs: Date.now() - started });
    };
    socket.setTimeout(timeoutMs);
    socket.once('connect', () => done({ ok: true }));
    socket.once('timeout', () => done({ ok: false, error: `Timed out after ${timeoutMs}ms.` }));
    socket.once('error', (error) => done({ ok: false, error: safeError(error, 'The TCP connection failed.') }));
  });
}

class DatabaseService {
  constructor({ app, docker, kubernetes }) {
    this.app = app;
    this.docker = docker || null;
    this.kubernetes = kubernetes || null;
    this.vault = new SecretVault(app);
    this.store = new DatabaseStore(app, this.vault);
    this.sessions = new Map();
    this.discoveryCache = null;
    this.discoveryPromise = null;
    this.pending = new Map();
  }

  // ---------------------------------------------------------------- helpers
  secretsFor(profile) {
    return {
      password: this.store.secret(profile, 'password'),
      sshPassword: this.store.secret(profile, 'sshPassword'),
      sshPrivateKey: this.store.secret(profile, 'sshPrivateKey'),
      sslKey: this.store.secret(profile, 'sslKey'),
      sslCert: this.store.secret(profile, 'sslCert'),
      sslCa: this.store.secret(profile, 'sslCa'),
    };
  }

  validateProfile(profile) {
    if (!profile) throw new Error('The connection profile was not found.');
    const engine = registry.get(profile.engine);
    if (!engine) throw new Error('Choose a database engine.');
    if (!registry.isConnectable(engine)) {
      throw new Error(`${engine.label} is not supported yet. ${engine.reason || ''}`.trim());
    }
    if (engine.id === 'sqlite') {
      if (!String(profile.file || '').trim()) throw new Error('Choose a SQLite database file.');
    } else if (!String(profile.host || '').trim()) {
      throw new Error('Enter a database host.');
    }
    if (profile.ssh?.enabled) {
      throw new Error('SSH tunneling is not available in this build. Connect directly or use a published Docker port.');
    }
    return engine;
  }

  activity(entry) {
    try { return this.store.activity(entry); } catch { return null; }
  }

  connectionName(id) {
    return this.store.get(id)?.name || '';
  }

  sessionStatus(id) {
    const session = this.sessions.get(id);
    if (!session) return { state: 'idle' };
    return {
      state: 'connected',
      connectedAt: session.connectedAt,
      lastUsedAt: session.lastUsedAt,
      info: session.info || null,
      tunnel: session.tunnel ? { port: session.tunnel.port, target: session.tunnel.target, namespace: session.tunnel.namespace } : null,
    };
  }

  listConnections() {
    return this.store.all().map((profile) => ({
      ...publicProfile(profile),
      status: this.sessionStatus(profile.id),
      engineMeta: registry.publicEngine(registry.get(profile.engine) || { id: profile.engine, label: profile.engine, capabilities: {} }),
    }));
  }

  bootstrap() {
    return {
      ok: true,
      engines: registry.all(),
      connections: this.listConnections(),
      stats: this.store.stats(),
      vault: { secureStorage: this.vault.safeAvailable(), backend: this.vault.backend() },
      limits: { maxRows: 20000, defaultRows: 1000, tablePage: 200 },
    };
  }

  // -------------------------------------------------------------- profiles
  saveConnection(input = {}) {
    const existing = input.id ? this.store.get(input.id) : null;
    if (input.id && !existing) throw new Error('That connection no longer exists.');
    const merged = { ...(existing || {}), ...input };
    const engine = registry.get(merged.engine);
    if (!engine) throw new Error('Choose a database engine.');
    if (!registry.isConnectable(engine)) {
      throw new Error(`${engine.label} is not supported yet. ${engine.reason || ''}`.trim());
    }
    if (engine.id === 'sqlite') {
      if (!String(merged.file || '').trim()) throw new Error('Choose a SQLite database file.');
    } else if (!String(merged.host || '').trim()) {
      throw new Error('Enter a database host.');
    }
    if (merged.ssh?.enabled) {
      throw new Error('SSH tunneling is not available in this build.');
    }
    const profile = existing ? this.store.update(existing.id, input) : this.store.create(input);
    if (!profile) throw new Error('The connection could not be saved.');
    if (existing && this.sessions.has(profile.id)) this.disconnect(profile.id).catch(() => {});
    this.activity({
      kind: existing ? 'connection-updated' : 'connection-created',
      connectionId: profile.id,
      connectionName: profile.name,
      engine: profile.engine,
      status: 'success',
      message: `${existing ? 'Updated' : 'Created'} connection ${profile.name}.`,
    });
    return { ok: true, connection: publicProfile(profile) };
  }

  deleteConnection(id) {
    if (!validId(id)) throw new Error('That connection id is not valid.');
    const profile = this.store.get(id);
    if (!profile) throw new Error('That connection no longer exists.');
    this.disconnect(id).catch(() => {});
    this.store.remove(id);
    this.activity({
      kind: 'connection-deleted', connectionId: id, connectionName: profile.name,
      engine: profile.engine, status: 'success', message: `Deleted connection ${profile.name}.`,
    });
    return { ok: true };
  }

  duplicateConnection(id) {
    if (!validId(id)) throw new Error('That connection id is not valid.');
    const copy = this.store.duplicate(id);
    if (!copy) throw new Error('That connection no longer exists.');
    this.activity({
      kind: 'connection-duplicated', connectionId: copy.id, connectionName: copy.name,
      engine: copy.engine, status: 'success', message: `Duplicated connection as ${copy.name}.`,
    });
    return { ok: true, connection: publicProfile(copy) };
  }

  setFavorite(id, favorite) {
    if (!validId(id)) throw new Error('That connection id is not valid.');
    const profile = this.store.setFavorite(id, favorite === true);
    if (!profile) throw new Error('That connection no longer exists.');
    return { ok: true, connection: publicProfile(profile) };
  }

  exportConnections() {
    return {
      ok: true,
      format: 'opsdeck-databases',
      version: 1,
      exportedAt: new Date().toISOString(),
      secretsIncluded: false,
      connections: this.store.all().map((profile) => {
        const pub = publicProfile(profile);
        delete pub.status;
        delete pub.engineMeta;
        return pub;
      }),
    };
  }

  importConnections(payload = {}) {
    let data = payload;
    if (typeof data === 'string') {
      try { data = JSON.parse(data); } catch { throw new Error('The import file is not valid JSON.'); }
    }
    const list = Array.isArray(data) ? data : Array.isArray(data?.connections) ? data.connections : null;
    if (!list) throw new Error('The import file does not contain a connections array.');
    let created = 0;
    const skipped = [];
    for (const item of list.slice(0, 200)) {
      try {
        const engine = registry.get(item?.engine);
        if (!engine || !registry.isConnectable(engine)) {
          skipped.push(`${clean(item?.name || item?.engine, 80)}: engine is not supported.`);
          continue;
        }
        if (engine.id === 'sqlite' ? !String(item.file || '').trim() : !String(item.host || '').trim()) {
          skipped.push(`${clean(item?.name || 'Untitled', 80)}: missing host or file.`);
          continue;
        }
        this.store.create({ ...item, id: undefined, favorite: false, secrets: undefined });
        created += 1;
      } catch (error) {
        skipped.push(`${clean(item?.name || 'Untitled', 80)}: ${safeError(error)}`);
      }
    }
    this.activity({
      kind: 'connections-imported', status: created ? 'success' : 'warning',
      message: `Imported ${created} connection profile${created === 1 ? '' : 's'}; ${skipped.length} skipped. Credentials must be entered again.`,
    });
    return { ok: true, created, skipped };
  }

  // --------------------------------------------------------------- sessions
  effectiveProfile(profile) {
    return JSON.parse(JSON.stringify(profile));
  }

  /**
   * Start the controlled kubectl port-forward for a Kubernetes-sourced
   * profile. Returns null for every other source. The tunnel targets
   * 127.0.0.1 only and is stopped by the caller.
   */
  kubernetesTunnel(profile, engine) {
    if (profile.source?.type !== 'kubernetes') return Promise.resolve(null);
    const internalPort = Number(profile.source.internalPort) || engine.defaultPort;
    return startKubernetesTunnel({
      context: profile.source.context,
      namespace: profile.source.namespace,
      pod: profile.source.pod,
      workload: profile.source.workload,
      internalPort,
      app: this.app,
    });
  }

  async openSession(id, { quiet = false } = {}) {
    if (!validId(id)) throw new Error('That connection id is not valid.');
    const existing = this.sessions.get(id);
    if (existing) {
      existing.lastUsedAt = Date.now();
      return existing;
    }
    const profile = this.store.get(id);
    if (!profile) throw new Error('That connection no longer exists.');
    const engine = this.validateProfile(profile);
    const effective = this.effectiveProfile(profile);
    let tunnel = null;
    if (profile.source?.type === 'kubernetes') {
      tunnel = await this.kubernetesTunnel(profile, engine);
      effective.host = '127.0.0.1';
      effective.port = tunnel.port;
    }
    const started = Date.now();
    const adapter = createAdapter(effective, this.secretsFor(profile));
    let info;
    try {
      info = await adapter.connect();
    } catch (error) {
      try { await adapter.dispose(); } catch { /* ignore */ }
      if (tunnel) tunnel.stop();
      const message = explainConnectionError(error, effective);
      this.store.markConnected(id, { ok: false, error: message, at: new Date().toISOString() });
      if (!quiet) {
        this.activity({
          kind: 'connection-failed', connectionId: id, connectionName: profile.name,
          engine: profile.engine, status: 'error', message,
          durationMs: Date.now() - started,
        });
      }
      throw new Error(message);
    }
    const session = {
      id,
      adapter,
      profile: effective,
      tunnel,
      info,
      connectedAt: new Date().toISOString(),
      lastUsedAt: Date.now(),
    };
    this.sessions.set(id, session);
    this.store.markConnected(id, { ok: true, at: session.connectedAt });
    if (!quiet) {
      this.activity({
        kind: 'connection', connectionId: id, connectionName: profile.name,
        engine: profile.engine, status: 'success',
        message: `Connected to ${profile.name}. ${info.serverVersion || ''}`.trim(),
        durationMs: Date.now() - started,
      });
    }
    return session;
  }

  session(id) {
    const session = this.sessions.get(id);
    if (!session) throw new Error('Connect to the database first.');
    session.lastUsedAt = Date.now();
    return session;
  }

  async disconnect(id) {
    const session = this.sessions.get(id);
    if (!session) return { ok: true, disconnected: false };
    this.sessions.delete(id);
    try { await session.adapter.dispose(); } catch { /* ignore */ }
    if (session.tunnel) {
      try { session.tunnel.stop(); } catch { /* ignore */ }
    }
    this.activity({
      kind: 'disconnect', connectionId: id, connectionName: session.profile.name,
      engine: session.profile.engine, status: 'success', message: 'Disconnected.',
    });
    return { ok: true, disconnected: true };
  }

  async disposeAll() {
    const ids = [...this.sessions.keys()];
    await Promise.all(ids.map((id) => this.disconnect(id).catch(() => {})));
    this.store.persistNow();
  }

  async reconnect(id) {
    await this.disconnect(id).catch(() => {});
    const session = await this.openSession(id);
    return { ok: true, status: this.sessionStatus(id), info: session.info };
  }

  async testConnection(payload = {}) {
    const started = Date.now();
    const draft = payload.connection || {};
    const profile = payload.id && this.store.get(payload.id)
      ? { ...this.store.get(payload.id), ...draft }
      : draft;
    const engine = registry.get(profile.engine);
    if (!engine || !registry.isConnectable(engine)) {
      return { ok: false, error: engine ? `${engine.label} is not supported yet.` : 'Choose a database engine.' };
    }
    if (engine.id !== 'sqlite' && !String(profile.host || '').trim()) {
      return { ok: false, error: 'Enter a database host.' };
    }
    if (engine.id === 'sqlite' && !String(profile.file || '').trim()) {
      return { ok: false, error: 'Choose a SQLite database file.' };
    }
    if (profile.ssh?.enabled) {
      return { ok: false, error: 'SSH tunneling is not available in this build.' };
    }
    const secrets = { ...(payload.id && this.store.get(payload.id) ? this.secretsFor(this.store.get(payload.id)) : {}), ...(payload.secrets || {}) };
    let adapter = null;
    let tunnel = null;
    let effective = profile;
    try {
      if (profile.source?.type === 'kubernetes') {
        tunnel = await this.kubernetesTunnel(profile, engine);
        effective = { ...profile, host: '127.0.0.1', port: tunnel.port };
      }
      adapter = createAdapter(effective, secrets);
      const info = await adapter.connect();
      const result = { ok: true, latencyMs: Date.now() - started, info };
      if (payload.id) {
        this.store.markConnected(payload.id, { ok: true, at: new Date().toISOString() });
        this.activity({
          kind: 'connection-test', connectionId: payload.id, connectionName: this.connectionName(payload.id),
          engine: profile.engine, status: 'success',
          message: `Connection test succeeded. ${info.serverVersion || ''}`.trim(),
          durationMs: Date.now() - started,
        });
      }
      return result;
    } catch (error) {
      const message = explainConnectionError(error, profile);
      if (payload.id) {
        this.store.markConnected(payload.id, { ok: false, error: message, at: new Date().toISOString() });
        this.activity({
          kind: 'connection-test', connectionId: payload.id, connectionName: this.connectionName(payload.id),
          engine: profile.engine, status: 'error', message, durationMs: Date.now() - started,
        });
      }
      return { ok: false, error: message, latencyMs: Date.now() - started };
    } finally {
      if (adapter) { try { await adapter.dispose(); } catch { /* ignore */ } }
      if (tunnel) { try { tunnel.stop(); } catch { /* ignore */ } }
    }
  }

  // -------------------------------------------------------------- discovery
  async discover({ refresh = false } = {}) {
    if (!refresh && this.discoveryCache && Date.now() - this.discoveryCache.at < DISCOVERY_TTL) {
      return this.discoveryCache.value;
    }
    if (this.discoveryPromise) return this.discoveryPromise;
    this.discoveryPromise = discovery.discoverAll({ docker: this.docker, kubernetes: this.kubernetes })
      .then((value) => {
        const enriched = this.enrichDiscovery(value);
        this.discoveryCache = { at: Date.now(), value: enriched };
        return enriched;
      })
      .finally(() => { this.discoveryPromise = null; });
    return this.discoveryPromise;
  }

  enrichDiscovery(result) {
    const profiles = this.store.all();
    const link = (item) => {
      const source = item.kind === 'docker' ? item.container.id : item.kind === 'kubernetes' ? `${item.kubernetes.namespace}/${item.kubernetes.pod || item.kubernetes.workload}` : `${item.engine}:${item.network?.hostPort}`;
      const linked = profiles.find((profile) => {
        if (profile.source?.type === 'docker' && item.kind === 'docker') {
          return profile.source.containerId === item.container.id;
        }
        if (profile.source?.type === 'kubernetes' && item.kind === 'kubernetes') {
          return profile.source.context === item.kubernetes.context
            && profile.source.namespace === item.kubernetes.namespace
            && (profile.source.pod === item.kubernetes.pod || profile.source.workload === item.kubernetes.workload);
        }
        if (profile.source?.type === 'local' && item.kind === 'local') {
          return profile.host === item.network?.host && Number(profile.port) === Number(item.network?.hostPort);
        }
        return false;
      }) || null;
      return { ...item, linkKey: source, connectionId: linked?.id || '' };
    };
    const groups = ['docker', 'local', 'kubernetes'];
    const out = { ...result };
    for (const key of groups) {
      if (out[key]?.items) out[key] = { ...out[key], items: out[key].items.map(link) };
    }
    return out;
  }

  async createFromDiscovery(payload = {}) {
    const item = payload.item || {};
    const engine = registry.get(item.engine);
    if (!engine || !registry.isConnectable(engine)) throw new Error('This database engine is not supported yet.');
    if (item.kind === 'local' && item.network?.reachable === false) {
      throw new Error('This local service is not running. Start it from the Local databases page first.');
    }
    if (item.kind === 'docker' && !item.network?.reachable) {
      throw new Error('This container does not publish a reachable port. Publish the database port or use the container CLI first.');
    }
    const credentials = payload.credentials || {};
    const draft = {
      name: clean(payload.name || item.name || `${engine.label} database`, 120),
      engine: engine.id,
      host: item.network?.host || '127.0.0.1',
      port: Number(item.network?.hostPort) || engine.defaultPort,
      username: clean(credentials.username, 128),
      database: clean(credentials.database, 128),
      authMethod: credentials.password ? 'password' : 'none',
      ssl: { mode: credentials.sslMode || 'prefer' },
      group: item.compose?.project || item.kubernetes?.namespace || (item.kind === 'local' ? 'Local' : ''),
      favorite: false,
      readOnly: false,
      source: {
        type: item.kind === 'docker' && item.compose ? 'compose' : item.kind,
        containerId: item.container?.id || '',
        containerName: item.container?.name || '',
        containerImage: item.container?.image || '',
        project: item.compose?.project || '',
        service: item.compose?.service || '',
        namespace: item.kubernetes?.namespace || '',
        pod: item.kubernetes?.pod || '',
        workload: item.kubernetes?.workload || '',
        context: item.kubernetes?.context || '',
        internalPort: item.kubernetes?.internalPort || item.network?.internalPort || engine.defaultPort,
        hostPort: item.network?.hostPort || 0,
        volumePersistent: item.storage?.persistent === true,
        detectedAt: new Date().toISOString(),
      },
      secrets: credentials.password ? { password: credentials.password } : {},
    };
    if (item.kind === 'kubernetes') {
      draft.host = '127.0.0.1';
      draft.port = 0;
    }
    const test = await this.testConnection({ connection: draft, secrets: credentials.password ? { password: credentials.password } : {} });
    if (!test.ok) return { ok: false, error: test.error, tested: false };
    const saved = this.saveConnection(draft);
    return { ok: true, connection: saved.connection, test };
  }

  async localAction(payload = {}) {
    const engine = registry.get(payload.engine);
    if (!engine || !registry.isConnectable(engine)) throw new Error('This engine has no service adapter.');
    const result = await discovery.localServiceAction(engine.id, payload.action);
    this.activity({
      kind: 'local-service', engine: engine.id, status: result.ok ? 'success' : 'error',
      message: `${engine.label} service ${payload.action}: ${result.ok ? 'ok' : result.error}`,
    });
    return result;
  }

  // --------------------------------------------------------------- explorer
  async listDatabases(id) {
    const session = await this.openSession(id);
    const adapter = session.adapter;
    if (typeof adapter.listDatabases !== 'function') return { ok: true, databases: [] };
    const databases = await adapter.listDatabases();
    return { ok: true, databases, defaultDatabase: session.profile.database || '' };
  }

  async explorer(payload = {}) {
    const session = await this.openSession(payload.id);
    const adapter = session.adapter;
    const engine = registry.get(session.profile.engine);
    const database = clean(payload.database, 128) || session.profile.database || '';
    if (engine.id === 'redis') {
      const databases = await adapter.listDatabases();
      const target = clean(database, 128) || `db${Number(session.profile.database) || 0}`;
      const scan = await adapter.scanKeys({ database: target, pattern: payload.pattern || '*', cursor: payload.cursor || '0', count: payload.count });
      return { ok: true, engine: engine.id, databases, database: target, ...scan };
    }
    const data = await adapter.explorer(database);
    return { ok: true, engine: engine.id, ...data };
  }

  /**
   * Compact schema digest for AI query generation. Only table/column names and
   * types leave the main process — never credentials, connection strings or rows.
   */
  async aiSchema(payload = {}) {
    const session = await this.openSession(payload.id);
    const engine = registry.get(session.profile.engine);
    if (!engine.capabilities?.sql) {
      return {
        ok: false,
        error: `${engine.label} does not use SQL. AI query generation is available for PostgreSQL, MySQL, MariaDB and SQLite.`,
      };
    }
    const database = clean(payload.database, 128) || session.profile.database || '';
    const data = await session.adapter.explorer(database);
    const relations = (data.relations || []).filter((relation) => relation && relation.name);
    const columns = data.columns || [];
    const lines = [];
    for (const relation of relations.slice(0, 400)) {
      const kind = String(relation.kind || 'table').toLowerCase();
      if (!['table', 'base table', 'view', 'materialized view', 'foreign table'].includes(kind)) continue;
      const cols = columns
        .filter((column) => column.table === relation.name
          && (!column.schema || !relation.schema || column.schema === relation.schema))
        .map((column) => {
          const type = column.type || column.data_type || '';
          const bits = [column.name, type].filter(Boolean).join(' ');
          return [
            bits,
            column.nullable === 'NO' ? 'not null' : '',
            String(column.key || '').toUpperCase() === 'PRI' ? 'primary key' : '',
          ].filter(Boolean).join(' ');
        });
      const label = relation.schema ? `${relation.schema}.${relation.name}` : relation.name;
      const suffix = kind === 'table' || kind === 'base table' ? '' : ` (${kind})`;
      lines.push(`- ${label}${suffix}${cols.length ? `: ${cols.join(', ')}` : ''}`);
    }
    return {
      ok: true,
      engine: engine.dialect || engine.id,
      label: engine.label,
      database: data.database || database,
      connection: session.profile.name,
      schema: lines.join('\n'),
      tables: lines.length,
    };
  }

  async tableData(payload = {}) {
    const session = await this.openSession(payload.id);
    const engine = registry.get(session.profile.engine);
    const limit = boundedLimit(payload.limit, 200);
    const offset = boundedOffset(payload.offset);
    if (engine.id === 'mongodb') {
      return session.adapter.documents(payload.database, payload.table || payload.collection, {
        filter: payload.filter, sort: payload.sort, projection: payload.projection, limit, skip: offset,
      });
    }
    if (engine.id === 'elasticsearch' || engine.id === 'opensearch') {
      return session.adapter.documents(payload.table || payload.index || payload.database, { ...payload, limit, offset });
    }
    if (typeof session.adapter.tableData !== 'function') {
      throw new Error(`${engine.label} does not expose table browsing.`);
    }
    const result = await session.adapter.tableData(payload.database, payload.schema, payload.table, {
      limit, offset, sort: payload.sort,
    });
    this.activity({
      kind: 'data-browse', connectionId: payload.id, connectionName: session.profile.name,
      engine: engine.id, status: 'success', rows: result.rowCount,
      message: `Browsed ${payload.schema ? `${payload.schema}.` : ''}${payload.table}.`,
    });
    return result;
  }

  // ------------------------------------------------------------------ query
  async query(payload = {}) {
    const session = await this.openSession(payload.id);
    const profile = session.profile;
    const adapter = session.adapter;
    const engine = registry.get(profile.engine);
    const sql = String(payload.sql || '').slice(0, 400000).trim();
    if (!sql) throw new Error('There is no statement to run.');
    if (profile.readOnly && !splitStatements(sql).every((statement) => isReadOnlySql(statement))) {
      throw new Error('This connection is read-only. Disable read-only mode in the connection settings to run write statements.');
    }
    if (engine.family === 'relational' && payload.confirmDestructive !== true) {
      const reason = destructiveReason(sql);
      if (reason) {
        return { ok: false, requiresConfirmation: true, confirmation: reason, statement: sql.slice(0, 2000), destructive: true };
      }
    }
    const token = clean(payload.token, 80);
    const started = Date.now();
    try {
      let result;
      if (engine.id === 'mongodb') {
        result = await adapter.query(payload.database, sql);
      } else if (engine.id === 'redis') {
        const confirmed = payload.confirmDestructive === true;
        result = await adapter.command(sql, { confirmed });
      } else if (engine.id === 'elasticsearch' || engine.id === 'opensearch') {
        result = await adapter.query(payload.database, sql);
      } else {
        if (typeof adapter.query !== 'function') throw new Error(`${engine.label} cannot run SQL.`);
        result = await adapter.query(payload.database, sql, {
          limit: boundedLimit(payload.limit, 1000, 20000),
          token,
          timeoutMs: payload.timeoutMs,
        });
      }
      const durationMs = Date.now() - started;
      const rowCount = Number(result.rowCount) || 0;
      this.store.addHistory({
        connectionId: payload.id,
        connectionName: profile.name,
        engine: engine.id,
        database: payload.database || profile.database,
        sql,
        ok: true,
        durationMs,
        rowCount,
      });
      this.activity({
        kind: 'query', connectionId: payload.id, connectionName: profile.name,
        engine: engine.id, status: 'success', rows: rowCount, durationMs,
        query: sql,
        message: `Query executed${result.command ? ` (${result.command})` : ''}.`,
      });
      return { ...result, ok: true, durationMs, engine: engine.id };
    } catch (error) {
      const durationMs = Date.now() - started;
      const message = safeError(error, 'The query failed.');
      this.store.addHistory({
        connectionId: payload.id,
        connectionName: profile.name,
        engine: engine.id,
        database: payload.database || profile.database,
        sql,
        ok: false,
        durationMs,
        error: message,
      });
      this.activity({
        kind: 'query', connectionId: payload.id, connectionName: profile.name,
        engine: engine.id, status: 'error', durationMs, query: sql, message,
      });
      throw new Error(message);
    }
  }

  async explain(payload = {}) {
    const session = await this.openSession(payload.id);
    const engine = registry.get(session.profile.engine);
    if (engine.id === 'mongodb') {
      return session.adapter.explain(payload.database, payload.table || payload.collection, payload.filter || '{}');
    }
    if (typeof session.adapter.explain !== 'function') {
      throw new Error(`${engine.label} does not support execution plans in this build.`);
    }
    const result = await session.adapter.explain(payload.database, payload.sql, payload.analyze === true);
    return { ...result, engine: engine.id };
  }

  async cancel(payload = {}) {
    const session = this.sessions.get(payload.id);
    if (!session) return { ok: false, error: 'There is no open connection.' };
    if (typeof session.adapter.cancel !== 'function') {
      return { ok: false, error: 'This adapter cannot cancel a running statement.' };
    }
    return session.adapter.cancel(clean(payload.token, 80));
  }

  async metrics(id) {
    const session = await this.openSession(id);
    const engine = registry.get(session.profile.engine);
    if (typeof session.adapter.metrics !== 'function') {
      return { ok: true, available: false, reason: `${engine.label} metrics are not available in this build.`, at: new Date().toISOString() };
    }
    try {
      const metrics = await session.adapter.metrics();
      return { ...metrics, available: true, at: new Date().toISOString(), engine: engine.id };
    } catch (error) {
      return {
        ok: true, available: false, engine: engine.id, at: new Date().toISOString(),
        reason: safeError(error, 'Metrics are not available for this connection.'),
      };
    }
  }

  async serverInfo(id) {
    const session = await this.openSession(id);
    const info = typeof session.adapter.serverInfo === 'function'
      ? await session.adapter.serverInfo()
      : session.info;
    return { ok: true, info, status: this.sessionStatus(id) };
  }

  // ------------------------------------------------------------ diagnostics
  async diagnostics(id) {
    const profile = this.store.get(id);
    if (!profile) throw new Error('That connection no longer exists.');
    const engine = registry.get(profile.engine);
    const steps = [];
    if (!engine) throw new Error('Unknown database engine.');
    steps.push({ name: 'Configuration', status: registry.isConnectable(engine) ? 'pass' : 'fail', detail: `${engine.label}: ${registry.isConnectable(engine) ? 'supported adapter' : 'not supported yet'}`, ms: 0 });
    let tunnel = null;
    let tunnelFailed = false;
    const existingSession = this.sessions.get(id);
    const effective = this.effectiveProfile(profile);
    if (profile.source?.type === 'kubernetes' && !existingSession) {
      try {
        tunnel = await this.kubernetesTunnel(profile, engine);
        effective.host = '127.0.0.1';
        effective.port = tunnel.port;
      } catch (error) {
        tunnelFailed = true;
        steps.push({ name: 'Kubernetes port-forward', status: 'fail', detail: safeError(error, 'The kubectl port-forward could not start.'), ms: 0 });
      }
    }
    const targetHost = existingSession?.profile?.host || effective.host;
    const targetPort = Number(existingSession?.profile?.port) || Number(effective.port) || engine.defaultPort;
    if (engine.id === 'sqlite') {
      const exists = require('node:fs').existsSync(String(profile.file || ''));
      steps.push({ name: 'File access', status: exists ? 'pass' : 'fail', detail: exists ? 'The database file exists.' : 'The database file was not found.', ms: 0 });
    } else if (!tunnelFailed) {
      const tcp = await probeTcp(targetHost, targetPort, profile.timeoutMs || 4000);
      steps.push({
        name: 'Network reachability', status: tcp.ok ? 'pass' : 'fail',
        detail: tcp.ok ? `TCP ${targetHost}:${targetPort} accepted a connection.` : tcp.error,
        ms: tcp.latencyMs,
      });
    }
    if (profile.ssl?.mode && profile.ssl.mode !== 'disable') {
      const mode = profile.ssl.mode;
      let detail = 'TLS is attempted first and falls back to plaintext only when the server rejects the handshake.';
      if (mode === 'allow') detail = 'Plaintext is used first; the server may still require TLS.';
      else if (mode === 'require') detail = 'TLS is required; the connection fails if the server does not support it.';
      else if (mode === 'verify-ca' || mode === 'verify-full') {
        detail = profile.ssl.rejectUnauthorized
          ? 'TLS is required with certificate validation.'
          : 'TLS is required (certificate validation is disabled).';
      }
      steps.push({ name: 'TLS', status: 'pass', detail, ms: 0 });
    }
    let adapter = null;
    let ownAdapter = false;
    if (!tunnelFailed) {
      try {
        const started = Date.now();
        if (existingSession) {
          adapter = existingSession.adapter;
        } else {
          adapter = createAdapter(effective, this.secretsFor(profile));
          ownAdapter = true;
        }
        const info = await adapter.connect();
        steps.push({ name: 'Authentication', status: 'pass', detail: `Authenticated as ${info.username || profile.username || 'the configured user'}.`, ms: Date.now() - started });
        steps.push({ name: 'Version', status: 'pass', detail: info.serverVersion || 'Version reported by the server.', ms: 0 });
        try {
          const databases = typeof adapter.listDatabases === 'function' ? await adapter.listDatabases() : [];
          steps.push({ name: 'Permissions', status: 'pass', detail: `${databases.length} database${databases.length === 1 ? '' : 's'} visible.`, ms: 0 });
        } catch (error) {
          steps.push({ name: 'Permissions', status: 'warn', detail: safeError(error, 'The user cannot list databases.'), ms: 0 });
        }
        if (typeof adapter.metrics === 'function') {
          try {
            await adapter.metrics();
            steps.push({ name: 'Monitoring', status: 'pass', detail: 'Performance metrics are readable.', ms: 0 });
          } catch (error) {
            steps.push({ name: 'Monitoring', status: 'warn', detail: safeError(error, 'Metrics are not available for this user.'), ms: 0 });
          }
        }
      } catch (error) {
        steps.push({ name: 'Authentication', status: 'fail', detail: safeError(error, 'The connection failed.'), ms: 0 });
      } finally {
        if (ownAdapter && adapter) { try { await adapter.dispose(); } catch { /* ignore */ } }
      }
    }
    if (tunnel) { try { tunnel.stop(); } catch { /* ignore */ } }
    const failed = steps.some((step) => step.status === 'fail');
    return { ok: true, steps, healthy: !failed, at: new Date().toISOString() };
  }

  // ------------------------------------------------------------- redis ops
  async redisScan(payload = {}) {
    const session = await this.openSession(payload.id);
    return session.adapter.scanKeys({
      database: payload.database, pattern: payload.pattern || '*', cursor: payload.cursor || '0', count: payload.count,
    });
  }

  async redisKey(payload = {}) {
    const session = await this.openSession(payload.id);
    return session.adapter.keyInfo(payload.key);
  }

  async redisWrite(payload = {}) {
    const session = await this.openSession(payload.id);
    const action = payload.action;
    if (action === 'set') return session.adapter.setKey(payload.key, payload.value || {});
    if (action === 'ttl') return session.adapter.setTtl(payload.key, payload.seconds);
    if (action === 'delete') {
      if (payload.confirm !== true) return { ok: false, requiresConfirmation: true, confirmation: `Delete key ${payload.key}?` };
      const result = await session.adapter.deleteKey(payload.key);
      this.activity({
        kind: 'redis-delete', connectionId: payload.id, connectionName: session.profile.name,
        engine: 'redis', status: 'success', message: `Deleted Redis key ${clean(payload.key, 200)}.`,
      });
      return result;
    }
    throw new Error('Unsupported Redis operation.');
  }

  // -------------------------------------------------------------- mongo ops
  async mongoAggregate(payload = {}) {
    const session = await this.openSession(payload.id);
    return session.adapter.aggregate(payload.database, payload.collection, payload.pipeline);
  }

  // ------------------------------------------------------------ databases
  async createDatabase(payload = {}) {
    const session = await this.openSession(payload.id);
    if (typeof session.adapter.createDatabase !== 'function') {
      throw new Error('Creating databases is not supported for this engine.');
    }
    const result = await session.adapter.createDatabase(payload.name);
    this.activity({
      kind: 'database-created', connectionId: payload.id, connectionName: session.profile.name,
      engine: session.profile.engine, status: 'success', message: `Created database ${clean(payload.name, 120)}.`,
    });
    return result;
  }

  async dropDatabase(payload = {}) {
    const session = await this.openSession(payload.id);
    if (typeof session.adapter.dropDatabase !== 'function') {
      throw new Error('Dropping databases is not supported for this engine.');
    }
    if (payload.confirm !== true) {
      return { ok: false, requiresConfirmation: true, confirmation: `Drop database ${payload.name}? This permanently removes its data.` };
    }
    const result = await session.adapter.dropDatabase(payload.name);
    this.activity({
      kind: 'database-dropped', connectionId: payload.id, connectionName: session.profile.name,
      engine: session.profile.engine, status: 'warning', message: `Dropped database ${clean(payload.name, 120)}.`,
    });
    return result;
  }

  // ---------------------------------------------------------------- history
  history(payload = {}) {
    return { ok: true, items: this.store.history({ limit: payload.limit, connectionId: payload.connectionId || '' }) };
  }

  clearHistory() {
    this.store.clearHistory();
    return { ok: true };
  }

  activityList(payload = {}) {
    return {
      ok: true,
      items: this.store.listActivity({
        limit: payload.limit, kind: payload.kind || '', status: payload.status || '', connectionId: payload.connectionId || '',
      }),
    };
  }

  /** Export a query result to a host file through the main process. */
  async exportResult(payload = {}) {
    const fs = require('node:fs');
    const format = ['csv', 'json', 'sql'].includes(payload.format) ? payload.format : 'json';
    const target = String(payload.path || '').trim();
    if (!target) throw new Error('Choose an export path.');
    const resolved = path.resolve(target);
    if (!path.isAbsolute(resolved)) throw new Error('Choose an absolute export path.');
    const rows = Array.isArray(payload.rows) ? payload.rows.slice(0, 200000) : [];
    const columns = Array.isArray(payload.columns) ? payload.columns.map((column) => clean(column, 200)) : [];
    if (rows.length === 0) throw new Error('There are no rows to export.');
    fs.mkdirSync(path.dirname(resolved), { recursive: true });
    const escapeCsv = (value) => {
      const text = value == null ? '' : String(value);
      return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
    };
    const escapeSql = (value) => {
      if (value == null) return 'NULL';
      if (typeof value === 'number') return String(value);
      if (typeof value === 'boolean') return value ? 'TRUE' : 'FALSE';
      return `'${String(value).replace(/'/g, "''")}'`;
    };
    let body;
    if (format === 'csv') {
      body = [columns.join(','), ...rows.map((row) => columns.map((name) => escapeCsv(row[name])).join(','))].join('\n');
    } else if (format === 'sql') {
      const table = String(payload.table || 'exported_rows').replace(/[^A-Za-z0-9_]/g, '_');
      body = rows.map((row) => `INSERT INTO ${table} (${columns.join(', ')}) VALUES (${columns.map((name) => escapeSql(row[name])).join(', ')});`).join('\n');
    } else {
      body = JSON.stringify(rows, null, 2);
    }
    fs.writeFileSync(resolved, body, { mode: 0o600 });
    return { ok: true, file: resolved, rows: rows.length, format, bytes: Buffer.byteLength(body) };
  }
}

module.exports = { DatabaseService, destructiveReason, publicProfile, probeTcp };
