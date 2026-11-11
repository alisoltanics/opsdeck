'use strict';

const { serializeRows, safeError, boundedLimit, boundedOffset, usesTls, allowsTlsFallback, isTlsHandshakeError } = require('./util');

const MAX_JSON = 1024 * 1024;

function parseJson(value, fallback, label) {
  if (value == null || value === '') return fallback;
  if (typeof value === 'object') return value;
  const text = String(value);
  if (text.length > MAX_JSON) throw new Error(`${label} is too large.`);
  try {
    return JSON.parse(text);
  } catch {
    throw new Error(`${label} is not valid JSON.`);
  }
}

function validName(value, label = 'Name') {
  const text = String(value || '').trim();
  if (!text || text.length > 200 || /[\u0000$]/.test(text)) throw new Error(`${label} is not valid.`);
  return text;
}

/** MongoDB adapter using the official driver. */
function create(profile, secrets = {}) {
  const { MongoClient } = require('mongodb');
  let client = null;
  let disposed = false;
  let tlsEnabled = usesTls(profile);

  function uri() {
    const host = profile.host || '127.0.0.1';
    const port = Number(profile.port) || 27017;
    const auth = profile.username && secrets.password
      ? `${encodeURIComponent(profile.username)}:${encodeURIComponent(secrets.password)}@`
      : '';
    let query = 'authSource=admin';
    if (tlsEnabled) query += '&tls=true';
    if (profile.ssl?.mode === 'verify-full' || (tlsEnabled && profile.ssl?.rejectUnauthorized !== false)) query += '&tlsAllowInvalidCertificates=false';
    return `mongodb://${auth}${host}:${port}/?${query}`;
  }

  function options() {
    return {
      serverSelectionTimeoutMS: Number(profile.timeoutMs) || 10000,
      connectTimeoutMS: Number(profile.timeoutMs) || 10000,
      maxPoolSize: profile.pool?.max || 5,
      minPoolSize: profile.pool?.min || 0,
      ...(secrets.sslCa ? { tlsCAFile: undefined } : {}),
      ...(tlsEnabled ? { tls: true } : {}),
      ...(tlsEnabled && profile.ssl?.rejectUnauthorized === false ? { tlsAllowInvalidCertificates: true } : {}),
    };
  }

  async function connect() {
    const started = Date.now();
    const run = async () => {
      client = new MongoClient(uri(), options());
      await client.connect();
      const admin = client.db(profile.database || 'admin').admin();
      const info = await admin.command({ buildInfo: 1 }).catch(() => ({}));
      await client.db(profile.database || 'test').command({ ping: 1 });
      return info;
    };
    let info;
    try {
      info = await run();
    } catch (error) {
      if (!tlsEnabled || !allowsTlsFallback(profile) || !isTlsHandshakeError(error)) throw error;
      tlsEnabled = false;
      if (client) await client.close().catch(() => {});
      client = null;
      info = await run();
    }
    return {
      ok: true,
      latencyMs: Date.now() - started,
      serverVersion: info.version ? `MongoDB ${info.version}` : 'MongoDB',
      database: profile.database || '',
      username: profile.username || '',
    };
  }

  async function dispose() {
    disposed = true;
    if (client) await client.close().catch(() => {});
    client = null;
  }

  function ensure() {
    if (!client || disposed) throw new Error('The connection is not open.');
    return client;
  }

  function database(name) {
    return ensure().db(validName(name || profile.database || 'test', 'Database'));
  }

  async function serverInfo() {
    const admin = ensure().db('admin').admin();
    const [build, status] = await Promise.all([
      admin.command({ buildInfo: 1 }).catch(() => ({})),
      admin.command({ serverStatus: 1 }).catch(() => ({})),
    ]);
    return {
      version: build.version ? `MongoDB ${build.version}` : 'MongoDB',
      host: status.host || '',
      uptimeSeconds: status.uptime || null,
      process: status.process || '',
    };
  }

  async function listDatabases() {
    const admin = ensure().db('admin').admin();
    const result = await admin.command({ listDatabases: 1, nameOnly: false });
    return (result.databases || []).map((item) => ({
      name: item.name,
      sizeBytes: Number(item.sizeOnDisk) || 0,
      empty: item.empty === true,
    }));
  }

  async function explorer(name) {
    const db = database(name);
    const databases = await listDatabases();
    const collections = await db.listCollections({}, { nameOnly: false }).toArray();
    const items = [];
    for (const collection of collections) {
      const entry = {
        name: collection.name,
        kind: collection.type === 'view' ? 'view' : 'collection',
        options: collection.options || {},
        count: null,
        indexes: [],
      };
      try {
        entry.count = await db.collection(collection.name).estimatedDocumentCount();
      } catch { /* permission */ }
      try {
        entry.indexes = (await db.collection(collection.name).indexes()).map((index) => ({
          name: index.name, key: index.key, unique: index.unique === true, sparse: index.sparse === true,
        }));
      } catch { /* permission */ }
      items.push(entry);
    }
    return {
      database: name || profile.database,
      databases,
      collections: items,
      schemas: [],
      relations: items.map((item) => ({ schema: name, name: item.name, kind: item.kind, row_estimate: item.count || 0 })),
      columns: [],
      indexes: items.flatMap((item) => item.indexes.map((index) => ({ table: item.name, name: index.name, unique: index.unique }))),
      triggers: [],
      routines: [],
      sequences: [],
      extensions: [],
      users: [],
      roleMembers: [],
    };
  }

  async function documents(name, collection, opts = {}) {
    const db = database(name);
    const filter = parseJson(opts.filter, {}, 'Filter');
    const sort = parseJson(opts.sort, null, 'Sort');
    const projection = parseJson(opts.projection, null, 'Projection');
    const limit = boundedLimit(opts.limit, 50, 500);
    const skip = boundedOffset(opts.skip);
    let cursor = db.collection(validName(collection, 'Collection')).find(filter, {
      projection: projection || undefined,
      limit: limit + 1,
      skip,
    });
    if (sort) cursor = cursor.sort(sort);
    const docs = await cursor.toArray();
    let total = null;
    try { total = await db.collection(collection).countDocuments(filter); } catch { /* permission */ }
    return {
      ok: true,
      rows: serializeRows(docs.slice(0, limit)),
      rowCount: Math.min(docs.length, limit),
      total,
      limit,
      skip,
      truncated: docs.length > limit,
    };
  }

  async function aggregate(name, collection, pipeline) {
    const db = database(name);
    const stages = parseJson(pipeline, [], 'Pipeline');
    if (!Array.isArray(stages)) throw new Error('The pipeline must be a JSON array of stages.');
    if (stages.length > 60) throw new Error('The pipeline is too long.');
    const docs = await db.collection(validName(collection, 'Collection')).aggregate(stages, { allowDiskUse: false }).limit(500).toArray();
    return { ok: true, rows: serializeRows(docs), rowCount: docs.length };
  }

  async function query(name, command) {
    const db = database(name);
    const spec = parseJson(command, null, 'Command');
    if (!spec || typeof spec !== 'object' || Array.isArray(spec)) throw new Error('Enter a MongoDB command object, for example {"count":"users"}.');
    const started = Date.now();
    const result = await db.command(spec);
    return { ok: true, rows: [serializeRows([result])[0]], columns: [{ name: 'result' }], rowCount: 1, durationMs: Date.now() - started };
  }

  async function createCollection(name, collection) {
    await database(name).createCollection(validName(collection, 'Collection'));
    return { ok: true };
  }

  async function dropCollection(name, collection) {
    await database(name).collection(validName(collection, 'Collection')).drop();
    return { ok: true };
  }

  async function createIndex(name, collection, spec) {
    const keys = parseJson(spec, null, 'Index keys');
    if (!keys || typeof keys !== 'object') throw new Error('Index keys must be a JSON object.');
    const result = await database(name).collection(validName(collection, 'Collection')).createIndex(keys);
    return { ok: true, name: result };
  }

  async function dropIndex(name, collection, indexName) {
    await database(name).collection(validName(collection, 'Collection')).dropIndex(validName(indexName, 'Index'));
    return { ok: true };
  }

  async function metrics() {
    const admin = ensure().db('admin').admin();
    const status = await admin.command({ serverStatus: 1 });
    let replication = null;
    try {
      const repl = await admin.command({ replSetGetStatus: 1 });
      replication = {
        set: repl.set,
        members: (repl.members || []).map((member) => ({
          name: member.name, state: member.stateStr, healthy: member.health === 1,
          uptime: member.uptime, lag: member.optimeDate ? Date.now() - new Date(member.optimeDate).getTime() : null,
        })),
      };
    } catch { /* standalone or no permission */ }
    return {
      ok: true,
      available: true,
      version: status.version,
      host: status.host,
      uptimeSeconds: status.uptime,
      activeConnections: status.connections?.current ?? null,
      availableConnections: status.connections?.available ?? null,
      totalConnectionsCreated: status.connections?.totalCreated ?? null,
      memory: status.mem || null,
      opcounters: status.opcounters || null,
      network: status.network || null,
      replication,
      storageEngine: status.storageEngine?.name || '',
    };
  }

  async function explain(name, collection, filter) {
    const db = database(name);
    const parsed = parseJson(filter, {}, 'Filter');
    const plan = await db.collection(validName(collection, 'Collection')).find(parsed).explain('executionStats');
    return { ok: true, plan, text: JSON.stringify(plan, null, 2) };
  }

  async function users() {
    const admin = ensure().db('admin').admin();
    const result = await admin.command({ usersInfo: 1 });
    return (result.users || []).map((user) => ({
      name: user.user, database: user.db, roles: (user.roles || []).map((role) => `${role.role}@${role.db}`),
    }));
  }

  return {
    engine: 'mongodb',
    connect, dispose, serverInfo, listDatabases, explorer, documents, aggregate, query,
    cancel: async () => ({ ok: false, error: 'MongoDB cancellation is not available for this operation.' }),
    createCollection, dropCollection, createIndex, dropIndex, metrics, explain, users,
  };
}

module.exports = { create };
