'use strict';

const http = require('node:http');
const https = require('node:https');
const { safeError, boundedLimit, boundedOffset, serializeRows, usesTls, allowsTlsFallback, isTlsHandshakeError } = require('./util');

const MAX_BODY = 4 * 1024 * 1024;

function validIndex(value) {
  const text = String(value || '').trim();
  if (!text || text.length > 255 || /[\s,"*?<>|\\/]/.test(text)) throw new Error('The index name is not valid.');
  return text;
}

/** Elasticsearch / OpenSearch adapter over the HTTP API. */
function create(profile, secrets = {}) {
  let base = null;
  let disposed = false;
  let tlsEnabled = usesTls(profile);
  let authHeader = '';
  let agent = null;

  function target(pathname) {
    if (!base) throw new Error('The connection is not open.');
    const url = new URL(String(pathname || '/').replace(/^\/+/, ''), base);
    if (url.origin !== new URL(base).origin) throw new Error('Refusing to request a different host.');
    return url;
  }

  function request(method, pathname, body) {
    return new Promise((resolve, reject) => {
      let url;
      try { url = target(pathname); } catch (error) { reject(error); return; }
      const payload = body === undefined || body === null ? null : JSON.stringify(body);
      const lib = url.protocol === 'https:' ? https : http;
      const req = lib.request(url, {
        method,
        agent,
        timeout: Number(profile.timeoutMs) || 10000,
        headers: {
          accept: 'application/json',
          'content-type': 'application/json',
          ...(authHeader ? { authorization: authHeader } : {}),
          ...(payload ? { 'content-length': Buffer.byteLength(payload) } : {}),
        },
      }, (res) => {
        let text = '';
        res.setEncoding('utf8');
        res.on('data', (chunk) => {
          text += chunk;
          if (text.length > MAX_BODY) req.destroy(new Error('The response was too large.'));
        });
        res.on('end', () => {
          let data = null;
          try { data = text ? JSON.parse(text) : null; } catch { data = { raw: text.slice(0, 2000) }; }
          if (res.statusCode >= 400) {
            const message = data?.error?.reason || data?.error?.type || data?.message || `HTTP ${res.statusCode}`;
            reject(new Error(String(message)));
            return;
          }
          resolve(data);
        });
      });
      req.on('timeout', () => req.destroy(new Error('The request timed out.')));
      req.on('error', reject);
      if (payload) req.write(payload);
      req.end();
    });
  }

  async function connect() {
    const started = Date.now();
    const host = profile.host || '127.0.0.1';
    const port = Number(profile.port) || 9200;
    if (profile.username || secrets.password) {
      authHeader = `Basic ${Buffer.from(`${profile.username || ''}:${secrets.password || ''}`).toString('base64')}`;
    }
    const run = async () => {
      base = `${tlsEnabled ? 'https' : 'http'}://${host}:${port}/`;
      if (tlsEnabled) agent = new https.Agent({ rejectUnauthorized: profile.ssl?.rejectUnauthorized !== false });
      return request('GET', '/');
    };
    let info;
    try {
      info = await run();
    } catch (error) {
      if (!tlsEnabled || !allowsTlsFallback(profile) || !isTlsHandshakeError(error)) throw error;
      tlsEnabled = false;
      if (agent) agent.destroy();
      agent = null;
      info = await run();
    }
    const version = info?.version?.number || '';
    const distribution = info?.version?.distribution || profile.engine || 'elasticsearch';
    return {
      ok: true,
      latencyMs: Date.now() - started,
      serverVersion: `${distribution === 'opensearch' ? 'OpenSearch' : 'Elasticsearch'} ${version}`.trim(),
      database: info?.cluster_name || '',
      username: profile.username || '',
    };
  }

  async function dispose() {
    disposed = true;
    base = null;
    authHeader = '';
    if (agent) agent.destroy();
    agent = null;
  }

  function ensure() {
    if (!base || disposed) throw new Error('The connection is not open.');
  }

  async function serverInfo() {
    ensure();
    const [info, health] = await Promise.all([
      request('GET', '/'),
      request('GET', '/_cluster/health').catch(() => null),
    ]);
    return {
      version: info?.version?.number || '',
      cluster: info?.cluster_name || '',
      node: info?.name || '',
      distribution: info?.version?.distribution || '',
      health: health?.status || '',
    };
  }

  async function listDatabases() {
    ensure();
    const rows = await request('GET', '/_cat/indices?format=json&h=index,docs.count,store.size,health,status');
    return (rows || []).map((row) => ({
      name: row.index,
      documents: Number(row['docs.count']) || 0,
      sizeLabel: row['store.size'] || '',
      health: row.health || '',
      status: row.status || '',
    }));
  }

  async function explorer(index) {
    ensure();
    const indices = await listDatabases();
    const name = index || indices[0]?.name;
    let mappings = null;
    let settings = null;
    if (name) {
      mappings = await request('GET', `/${encodeURIComponent(name)}/_mapping`).catch(() => null);
      settings = await request('GET', `/${encodeURIComponent(name)}/_settings`).catch(() => null);
    }
    return {
      database: name || '',
      databases: indices,
      indices,
      mappings: mappings ? mappings[name]?.mappings || mappings : null,
      settings: settings ? settings[name]?.settings || settings : null,
      schemas: [],
      collections: [],
      relations: [],
      columns: [],
      indexes: [],
      triggers: [],
      routines: [],
      sequences: [],
      extensions: [],
      users: [],
      roleMembers: [],
    };
  }

  async function documents(index, opts = {}) {
    ensure();
    const limit = boundedLimit(opts.limit, 50, 500);
    const from = boundedOffset(opts.offset);
    const query = opts.query && typeof opts.query === 'object' ? opts.query : { match_all: {} };
    const body = { size: limit, from, query };
    if (opts.sort) body.sort = opts.sort;
    const res = await request('POST', `/${encodeURIComponent(validIndex(index))}/_search`, body);
    const hits = res?.hits?.hits || [];
    return {
      ok: true,
      rows: serializeRows(hits.map((hit) => ({ _id: hit._id, _index: hit._index, _score: hit._score, ...hit._source }))),
      rowCount: hits.length,
      total: res?.hits?.total?.value ?? null,
      limit,
      offset: from,
      truncated: hits.length >= limit,
    };
  }

  async function query(index, command) {
    ensure();
    const spec = typeof command === 'string' ? JSON.parse(command) : command;
    if (!spec || typeof spec !== 'object') throw new Error('Provide a JSON search body.');
    const targetIndex = validIndex(index || spec.index || '_all');
    const body = spec.body || spec;
    const res = await request('POST', `/${encodeURIComponent(targetIndex)}/_search`, body);
    const hits = res?.hits?.hits || [];
    return {
      ok: true,
      rows: serializeRows(hits.map((hit) => ({ _id: hit._id, _index: hit._index, ...hit._source }))),
      rowCount: hits.length,
      total: res?.hits?.total?.value ?? null,
      durationMs: Number(res?.took) || null,
    };
  }

  async function metrics() {
    ensure();
    const [health, stats, nodes] = await Promise.all([
      request('GET', '/_cluster/health'),
      request('GET', '/_stats').catch(() => null),
      request('GET', '/_nodes/stats/jvm,os,process').catch(() => null),
    ]);
    const nodeStats = Object.values(nodes?.nodes || {})[0] || {};
    return {
      ok: true,
      available: true,
      cluster: health?.cluster_name || '',
      status: health?.status || '',
      nodes: health?.number_of_nodes ?? null,
      dataNodes: health?.number_of_data_nodes ?? null,
      activeShards: health?.active_shards ?? null,
      relocatingShards: health?.relocating_shards ?? null,
      unassignedShards: health?.unassigned_shards ?? null,
      activePrimaryShards: health?.active_primary_shards ?? null,
      documentCount: stats?._all?.primaries?.docs?.count ?? null,
      storeBytes: stats?._all?.primaries?.store?.size_in_bytes ?? null,
      jvmHeapUsed: nodeStats?.jvm?.mem?.heap_used_in_bytes ?? null,
      jvmHeapMax: nodeStats?.jvm?.mem?.heap_max_in_bytes ?? null,
      cpuPercent: nodeStats?.os?.cpu?.percent ?? null,
      uptimeMs: nodeStats?.jvm?.uptime_in_millis ?? null,
    };
  }

  async function createDatabase(name) {
    ensure();
    await request('PUT', `/${encodeURIComponent(validIndex(name))}`);
    return { ok: true };
  }

  async function dropDatabase(name) {
    ensure();
    await request('DELETE', `/${encodeURIComponent(validIndex(name))}`);
    return { ok: true };
  }

  async function cancel() {
    return { ok: false, error: 'Search cancellation is not wired for this adapter.' };
  }

  return {
    engine: profile.engine === 'opensearch' ? 'opensearch' : 'elasticsearch',
    connect, dispose, serverInfo, listDatabases, explorer, documents, query, cancel,
    metrics, createDatabase, dropDatabase,
  };
}

module.exports = { create };
