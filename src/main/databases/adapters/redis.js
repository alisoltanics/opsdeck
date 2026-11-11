'use strict';

const { safeError, tlsMode, usesTls, allowsTlsFallback, isTlsHandshakeError } = require('./util');

const MAX_VALUE_ITEMS = 500;
const BROAD_KEY_PATTERNS = ['*', '?', '**'];

function tokenize(input) {
  const text = String(input || '').trim();
  if (!text) throw new Error('Enter a Redis command.');
  if (text.length > 8000) throw new Error('The command is too long.');
  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;
  for (const ch of text) {
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\') { escaped = true; continue; }
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (/\s/.test(ch)) {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    current += ch;
  }
  if (quote) throw new Error('Unterminated quote in the command.');
  if (current) tokens.push(current);
  if (!tokens.length) throw new Error('Enter a Redis command.');
  return tokens;
}

function parseInfo(text) {
  const out = {};
  let section = 'default';
  for (const line of String(text || '').split(/\r?\n/)) {
    if (/^#\s/.test(line)) { section = line.replace(/^#\s*/, '').trim(); continue; }
    const idx = line.indexOf(':');
    if (idx <= 0) continue;
    const key = line.slice(0, idx);
    out[key] = line.slice(idx + 1);
    out[`${section}.${key}`] = line.slice(idx + 1);
  }
  return out;
}

/** Redis adapter backed by ioredis, using SCAN for all key discovery. */
function parseDb(value, fallback = 0) {
  if (value === undefined || value === null || value === '') return fallback;
  const text = String(value).trim().replace(/^db/i, '');
  const index = Number(text);
  return Number.isInteger(index) && index >= 0 && index <= 15 ? index : fallback;
}

function create(profile, secrets = {}) {
  const Redis = require('ioredis');
  let redis = null;
  let disposed = false;
  // RESP has no in-band TLS upgrade: a TLS-only server answers a plaintext
  // client by closing the socket. `prefer` therefore probes plaintext first
  // (fast, the common case) and retries with TLS when that probe fails.
  // `require` and the verify modes always use TLS.
  let tlsEnabled = allowsTlsFallback(profile) ? false : usesTls(profile);
  const upgradeAllowed = allowsTlsFallback(profile) || tlsMode(profile) === 'allow';
  let currentDb = parseDb(profile.database, 0);

  function createClient(db) {
    return new Redis({
      host: profile.host || '127.0.0.1',
      port: Number(profile.port) || 6379,
      username: profile.username || undefined,
      password: secrets.password || undefined,
      db: Number.isInteger(db) ? db : 0,
      connectTimeout: Number(profile.timeoutMs) || 10000,
      lazyConnect: false,
      maxRetriesPerRequest: 1,
      enableReadyCheck: true,
      retryStrategy: () => null,
      ...(tlsEnabled ? { tls: { rejectUnauthorized: profile.ssl?.rejectUnauthorized !== false } } : {}),
    });
  }

  async function connect() {
    const started = Date.now();
    const run = async () => {
      redis = createClient(currentDb);
      await redis.ping();
    };
    try {
      await run();
    } catch (error) {
      if (tlsEnabled || !upgradeAllowed || !isTlsHandshakeError(error)) throw error;
      tlsEnabled = true;
      try { redis?.disconnect(); } catch { /* ignore */ }
      await run();
    }
    const info = parseInfo(await redis.info('server'));
    return {
      ok: true,
      latencyMs: Date.now() - started,
      serverVersion: info.redis_version ? `Redis ${info.redis_version}` : 'Redis',
      database: `db${currentDb}`,
      username: profile.username || '',
    };
  }

  async function dispose() {
    disposed = true;
    if (redis) {
      try { await redis.quit(); } catch { try { redis.disconnect(); } catch { /* ignore */ } }
    }
    redis = null;
  }

  function ensure() {
    if (!redis || disposed) throw new Error('The connection is not open.');
    return redis;
  }

  async function select(db) {
    const value = Number(db);
    if (!Number.isInteger(value) || value < 0 || value > 15) throw new Error('Redis database must be between 0 and 15.');
    await ensure().select(value);
    currentDb = value;
    return { ok: true, database: `db${value}` };
  }

  async function serverInfo() {
    const info = parseInfo(await ensure().info());
    return {
      version: info.redis_version ? `Redis ${info.redis_version}` : 'Redis',
      mode: info.redis_mode || '',
      os: info.os || '',
      uptimeSeconds: Number(info.uptime_in_seconds) || null,
      role: info.role || '',
      connectedClients: Number(info.connected_clients) || null,
      usedMemory: Number(info.used_memory) || null,
    };
  }

  async function listDatabases() {
    const info = parseInfo(await ensure().info('keyspace'));
    const out = [];
    for (let db = 0; db < 16; db += 1) {
      const row = info[`db${db}`];
      const keys = /keys=(\d+)/.exec(row || '')?.[1];
      const expires = /expires=(\d+)/.exec(row || '')?.[1];
      out.push({ name: `db${db}`, index: db, keys: Number(keys) || 0, expires: Number(expires) || 0 });
    }
    return out;
  }

  async function scanKeys(opts = {}) {
    const db = parseDb(opts.database, currentDb);
    if (db !== currentDb) await select(db);
    const pattern = String(opts.pattern || '*').slice(0, 500) || '*';
    const cursor = String(opts.cursor || '0');
    const count = Math.max(10, Math.min(2000, Number(opts.count) || 200));
    const started = await ensure().scan(cursor, 'MATCH', pattern, 'COUNT', count);
    const next = String(started[0]);
    const keys = started[1] || [];
    const items = [];
    const pipeline = ensure().pipeline();
    for (const key of keys.slice(0, 500)) {
      pipeline.type(key);
      pipeline.ttl(key);
      pipeline.memory('USAGE', key);
    }
    const results = await pipeline.exec();
    keys.slice(0, 500).forEach((key, index) => {
      const typeRes = results[index * 3] || [];
      const ttlRes = results[index * 3 + 1] || [];
      const memRes = results[index * 3 + 2] || [];
      items.push({
        key,
        type: typeRes[1] || 'unknown',
        ttl: Number(ttlRes[1]) || -1,
        memoryBytes: Number(memRes[1]) || 0,
      });
    });
    return { ok: true, cursor: next, keys: items, scanned: keys.length };
  }

  async function keyInfo(key) {
    const name = String(key || '');
    if (!name) throw new Error('Select a key first.');
    const client = ensure();
    const type = await client.type(name);
    const [ttl, memoryBytes, encoding] = await Promise.all([
      client.ttl(name),
      client.memory('USAGE', name).catch(() => null),
      client.object('ENCODING', name).catch(() => ''),
    ]);
    let value = null;
    let count = null;
    let items = [];
    if (type === 'string') {
      value = await client.get(name);
    } else if (type === 'list') {
      count = await client.llen(name);
      items = await client.lrange(name, 0, MAX_VALUE_ITEMS - 1);
    } else if (type === 'set') {
      count = await client.scard(name);
      const res = await client.sscan(name, 0, 'COUNT', MAX_VALUE_ITEMS);
      items = res[1] || [];
    } else if (type === 'zset') {
      count = await client.zcard(name);
      const res = await client.zrange(name, 0, MAX_VALUE_ITEMS - 1, 'WITHSCORES');
      for (let i = 0; i < res.length; i += 2) items.push({ member: res[i], score: res[i + 1] });
    } else if (type === 'hash') {
      count = await client.hlen(name);
      const res = await client.hscan(name, 0, 'COUNT', MAX_VALUE_ITEMS);
      const flat = res[1] || [];
      for (let i = 0; i < flat.length; i += 2) items.push({ field: flat[i], value: flat[i + 1] });
    } else if (type === 'stream') {
      count = await client.xlen(name);
      const res = await client.xrange(name, '-', '+', 'COUNT', MAX_VALUE_ITEMS);
      items = res.map(([id, fields]) => ({ id, fields }));
    } else if (type === 'none') {
      throw new Error('The key no longer exists.');
    }
    return { ok: true, key: name, type, ttl: Number(ttl), memoryBytes: Number(memoryBytes) || null, encoding, value, count, items };
  }

  async function setKey(key, payload = {}) {
    const name = String(key || '');
    if (!name) throw new Error('A key name is required.');
    const client = ensure();
    const type = String(payload.type || 'string');
    const ttl = Number(payload.ttl);
    if (type === 'string') await client.set(name, String(payload.value ?? ''));
    else if (type === 'hash') await client.hset(name, payload.items || {});
    else if (type === 'list') {
      await client.del(name);
      const values = Array.isArray(payload.items) ? payload.items : [];
      if (values.length) await client.rpush(name, ...values.map(String));
    } else if (type === 'set') {
      await client.del(name);
      const values = Array.isArray(payload.items) ? payload.items : [];
      if (values.length) await client.sadd(name, ...values.map(String));
    } else if (type === 'zset') {
      await client.del(name);
      const values = Array.isArray(payload.items) ? payload.items : [];
      for (const item of values) await client.zadd(name, Number(item.score) || 0, String(item.member));
    } else {
      throw new Error('Unsupported Redis key type.');
    }
    if (Number.isFinite(ttl) && ttl > 0) await client.pexpire(name, Math.floor(ttl * 1000));
    return { ok: true };
  }

  async function setTtl(key, seconds) {
    const value = Number(seconds);
    const client = ensure();
    if (!Number.isFinite(value) || value === 0) await client.persist(String(key));
    else if (value < 0) await client.del(String(key));
    else await client.expire(String(key), Math.max(1, Math.floor(value)));
    return { ok: true };
  }

  async function deleteKey(key) {
    const removed = await ensure().del(String(key));
    return { ok: true, removed };
  }

  const DANGEROUS = new Set(['FLUSHALL', 'FLUSHDB', 'SHUTDOWN', 'DEBUG', 'CONFIG', 'SCRIPT', 'MODULE', 'SLAVEOF', 'REPLICAOF']);
  async function command(raw, opts = {}) {
    const tokens = tokenize(raw);
    const name = tokens[0].toUpperCase();
    if (name === 'KEYS' && (tokens[1] === '*' || tokens[1] === undefined || BROAD_KEY_PATTERNS.includes(tokens[1]))) {
      throw new Error('KEYS is disabled for broad discovery. Use SCAN in the key explorer.');
    }
    if (DANGEROUS.has(name) && opts.confirmed !== true) {
      throw new Error(`${name} requires explicit confirmation and is never run silently.`);
    }
    if (name === 'SELECT') {
      const result = await select(tokens[1]);
      return { ok: true, result: `OK db${tokens[1]}`, database: result.database };
    }
    const result = await ensure().call(name, ...tokens.slice(1));
    const flat = Array.isArray(result)
      ? result.flatMap((item) => (Array.isArray(item) ? item : [item]))
      : [result];
    return {
      ok: true,
      rows: flat.map((value) => ({ result: value == null ? null : String(value) })),
      columns: [{ name: 'result' }],
      rowCount: flat.length,
    };
  }

  async function metrics() {
    const client = ensure();
    const [infoText, slow, clients] = await Promise.all([
      client.info(),
      client.slowlog('GET', 30).catch(() => []),
      client.client('LIST').catch(() => ''),
    ]);
    const info = parseInfo(infoText);
    const clientRows = String(clients || '').trim().split('\n').filter(Boolean).map((line) => {
      const fields = {};
      for (const part of line.split(' ')) {
        const idx = part.indexOf('=');
        if (idx > 0) fields[part.slice(0, idx)] = part.slice(idx + 1);
      }
      return fields;
    });
    return {
      ok: true,
      available: true,
      version: info.redis_version,
      mode: info.redis_mode,
      role: info.role,
      uptimeSeconds: Number(info.uptime_in_seconds) || null,
      activeConnections: Number(info.connected_clients) || clientRows.length,
      maxConnections: Number(info.maxclients) || null,
      usedMemory: Number(info.used_memory) || null,
      usedMemoryPeak: Number(info.used_memory_peak) || null,
      maxMemory: Number(info.maxmemory) || null,
      keyspaceHits: Number(info.keyspace_hits) || 0,
      keyspaceMisses: Number(info.keyspace_misses) || 0,
      evictedKeys: Number(info.evicted_keys) || 0,
      expiredKeys: Number(info.expired_keys) || 0,
      totalCommands: Number(info.total_commands_processed) || 0,
      opsPerSecond: Number(info.instantaneous_ops_per_sec) || 0,
      replication: {
        role: info.role || '',
        connectedSlaves: Number(info.connected_slaves) || 0,
        masterLinkStatus: info.master_link_status || '',
      },
      slowLog: (slow || []).slice(0, 20).map((row) => ({
        id: row[0], at: row[1] ? new Date(Number(row[1]) * 1000).toISOString() : null,
        durationUs: row[2], command: Array.isArray(row[3]) ? row[3].join(' ') : String(row[3] || ''),
      })),
      clients: clientRows.slice(0, 50),
    };
  }

  async function users() {
    const rows = await ensure().acl('LIST').catch(() => []);
    return (rows || []).map((line) => ({ name: String(line).split(' ')[0], rule: String(line) }));
  }

  return {
    engine: 'redis',
    connect, dispose, serverInfo, listDatabases, scanKeys, select, keyInfo, setKey, setTtl,
    deleteKey, command, cancel: async () => ({ ok: false, error: 'Redis commands are not cancellable through ioredis.' }),
    metrics, users,
  };
}

module.exports = { create };
