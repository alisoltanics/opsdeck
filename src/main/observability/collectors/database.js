'use strict';

/**
 * Database collector.
 *
 * Delegates all connections and queries to the existing DatabaseService. Each
 * engine exposes a different metric set; this collector maps only fields that
 * are actually present and records per-engine availability so the UI never
 * implies a uniform database dashboard where one does not exist.
 */

const { metric, percent } = require('../metrics');
const { sanitizeText } = require('../util');

const ENGINE_LABELS = {
  postgres: 'PostgreSQL', mysql: 'MySQL', mariadb: 'MariaDB', mongodb: 'MongoDB',
  redis: 'Redis', mssql: 'SQL Server', elasticsearch: 'Elasticsearch',
  opensearch: 'OpenSearch', cassandra: 'Cassandra', sqlite: 'SQLite',
};

function num(value) {
  const n = Number(value);
  return Number.isFinite(n) ? n : null;
}

class DatabaseCollector {
  constructor({ databases, autoConnect = false }) {
    this.name = 'databases';
    this.label = 'Databases';
    this.source = 'database';
    this.databases = databases;
    this.autoConnect = autoConnect === true;
    this.lastDetails = null;
    this.lastAt = 0;
    this.lastError = '';
    this.previousOps = new Map();
  }

  setAutoConnect(value) {
    this.autoConnect = value === true;
  }

  async collect() {
    const started = Date.now();
    const timestamp = started;
    const metrics = [];
    const errors = [];
    if (!this.databases) {
      return this.unavailable('The database service is not available.', started);
    }

    let connections = [];
    try {
      connections = this.databases.listConnections();
    } catch (error) {
      return this.unavailable(error.message || String(error), started);
    }

    const rows = [];
    let available = 0;
    let unavailable = 0;
    const monitored = connections.filter((profile) => {
      const connected = profile.status?.state === 'connected';
      return connected || this.autoConnect || profile.engine === 'sqlite';
    });

    await Promise.all(monitored.map(async (profile) => {
      const labels = { engine: profile.engine, database: profile.name, host: profile.host || 'local' };
      const resource = `database:${profile.id}`;
      const base = {
        id: profile.id,
        name: profile.name,
        engine: profile.engine,
        engineLabel: ENGINE_LABELS[profile.engine] || profile.engine,
        host: profile.host || (profile.file ? 'file' : ''),
        port: profile.port || null,
        database: profile.database || profile.file || '',
        connected: profile.status?.state === 'connected',
        readOnly: profile.readOnly === true,
        metrics: null,
        error: '',
        availability: 'unavailable',
        missing: [],
      };
      try {
        const result = await this.databases.metrics(profile.id);
        base.metrics = result;
        if (result?.available === false) {
          base.error = result.reason || 'Metrics are not available for this engine.';
          base.missing = ['engine metrics'];
          metrics.push(metric('database.up', 1, { unit: 'count', source: this.source, resource, labels, timestamp }));
          metrics.push(metric('database.metrics.available', 0, { unit: 'count', source: this.source, resource, labels, timestamp }));
        } else {
          base.availability = 'measured';
          available += 1;
          const opsPerSecond = this.opsRate(profile.id, timestamp, profile.engine, result);
          if (opsPerSecond != null && num(result?.opsPerSecond) == null) {
            base.metrics = { ...result, opsPerSecond };
          }
          metrics.push(metric('database.up', 1, { unit: 'count', source: this.source, resource, labels, timestamp }));
          metrics.push(metric('database.metrics.available', 1, { unit: 'count', source: this.source, resource, labels, timestamp }));
          if (opsPerSecond != null) {
            metrics.push(metric('database.ops.persec', opsPerSecond, { unit: 'count', source: this.source, resource, labels, timestamp }));
          }
          this.mapMetrics(profile, result, metrics, timestamp, labels, resource, base);
        }
      } catch (error) {
        base.error = sanitizeText(error.message || String(error), 400);
        base.availability = 'unreachable';
        unavailable += 1;
        errors.push(`${profile.name}: ${base.error}`);
        metrics.push(metric('database.up', 0, { unit: 'count', source: this.source, resource, labels, timestamp }));
      }
      rows.push(base);
    }));

    for (const profile of connections) {
      if (monitored.some((entry) => entry.id === profile.id)) continue;
      rows.push({
        id: profile.id, name: profile.name, engine: profile.engine,
        engineLabel: ENGINE_LABELS[profile.engine] || profile.engine,
        host: profile.host || (profile.file ? 'file' : ''), port: profile.port || null,
        database: profile.database || profile.file || '', connected: false,
        readOnly: profile.readOnly === true, metrics: null, error: '',
        availability: 'idle',
        missing: ['not connected (enable auto-connect to monitor without opening it manually)'],
      });
    }

    metrics.push(metric('database.connections.monitored', monitored.length, { unit: 'count', source: this.source, resource: 'database', labels: { host: 'local' }, timestamp }));
    metrics.push(metric('database.connections.up', available, { unit: 'count', source: this.source, resource: 'database', labels: { host: 'local' }, timestamp }));
    metrics.push(metric('database.connections.down', unavailable, { unit: 'count', source: this.source, resource: 'database', labels: { host: 'local' }, timestamp }));

    this.lastAt = timestamp;
    this.lastError = errors.join('; ');
    this.lastDetails = {
      at: new Date(timestamp).toISOString(),
      available: true,
      connections: rows.sort((a, b) => a.name.localeCompare(b.name)),
      autoConnect: this.autoConnect,
      errors,
    };
    return { ok: true, available: true, metrics, details: this.lastDetails, errors, durationMs: Date.now() - started, at: new Date(timestamp).toISOString() };
  }

  // Only engines exposing a monotonic counter can produce a real rate. Redis
  // reports instantaneous ops directly, so it is left to the adapter.
  opsRate(id, timestamp, engine, result) {
    let counter = null;
    if (engine === 'postgres') {
      const transactions = result?.transactions;
      if (transactions) counter = num(transactions.commit) + num(transactions.rollback);
    } else if (engine === 'mysql' || engine === 'mariadb') {
      counter = num(result?.queries);
    } else if (engine === 'mongodb') {
      const ops = result?.opcounters;
      if (ops) {
        counter = ['query', 'insert', 'update', 'delete', 'getmore', 'command']
          .reduce((sum, key) => sum + (num(ops[key]) ?? 0), 0);
      }
    }
    if (counter == null || !Number.isFinite(counter)) {
      this.previousOps.delete(id);
      return null;
    }
    const previous = this.previousOps.get(id);
    this.previousOps.set(id, { at: timestamp, counter });
    if (!previous || timestamp <= previous.at) return null;
    const delta = counter - previous.counter;
    if (delta < 0) return null;
    const seconds = (timestamp - previous.at) / 1000;
    if (seconds <= 0) return null;
    return Math.round((delta / seconds) * 100) / 100;
  }

  mapMetrics(profile, result, metrics, timestamp, labels, resource, base) {
    const push = (name, value, unit = 'count', extra = {}) => {
      const n = num(value);
      if (n == null) return;
      metrics.push(metric(name, n, { unit, source: this.source, resource, labels: { ...labels, ...extra }, timestamp }));
    };
    const engine = profile.engine;
    if (engine === 'postgres') {
      push('database.connections.active', result.activeConnections);
      push('database.connections.max', result.maxConnections);
      if (result.activeConnections != null && result.maxConnections) {
        push('database.connections.usage', percent(result.activeConnections, result.maxConnections), 'percent');
      }
      push('database.cache.hit_ratio', result.cacheHitRatio, 'percent');
      push('database.size.bytes', result.sizeBytes, 'bytes');
      push('database.transactions.commit', result.transactions?.commit, 'count');
      push('database.transactions.rollback', result.transactions?.rollback, 'count');
      push('database.deadlocks', result.deadlocks, 'count');
      push('database.temp.bytes', result.tempBytes, 'bytes');
      push('database.long_running', Array.isArray(result.longRunning) ? result.longRunning.length : null);
      if (result.slowQueryList) push('database.slow_queries.tracked', result.slowQueryList.length);
      else base.missing.push('pg_stat_statements (slow queries)');
    } else if (engine === 'mysql' || engine === 'mariadb') {
      push('database.connections.active', result.activeConnections);
      push('database.connections.max', result.maxConnections);
      if (result.activeConnections != null && result.maxConnections) {
        push('database.connections.usage', percent(result.activeConnections, result.maxConnections), 'percent');
      }
      push('database.queries.total', result.queries, 'count');
      push('database.queries.slow', result.slowQueries, 'count');
      push('database.threads.running', result.threadsRunning);
      push('database.cache.hit_ratio', result.cacheHitRatio, 'percent');
      push('database.network.received.bytes', result.bytesReceived, 'bytes');
      push('database.network.sent.bytes', result.bytesSent, 'bytes');
      push('database.uptime.seconds', result.uptimeSeconds, 'seconds');
    } else if (engine === 'mongodb') {
      push('database.connections.active', result.activeConnections);
      push('database.connections.available', result.availableConnections);
      push('database.connections.total_created', result.totalConnectionsCreated, 'count');
      push('database.uptime.seconds', result.uptimeSeconds, 'seconds');
      push('database.memory.resident.bytes', result.memory?.resident, 'bytes');
      push('database.memory.virtual.bytes', result.memory?.virtual, 'bytes');
      push('database.ops.query', result.opcounters?.query, 'count');
      push('database.ops.insert', result.opcounters?.insert, 'count');
      push('database.ops.update', result.opcounters?.update, 'count');
      push('database.ops.delete', result.opcounters?.delete, 'count');
      push('database.network.bytes_in', result.network?.bytesIn, 'bytes');
      push('database.network.bytes_out', result.network?.bytesOut, 'bytes');
      if (!result.replication) base.missing.push('replication status (standalone or limited permissions)');
    } else if (engine === 'redis') {
      push('database.connections.active', result.activeConnections);
      push('database.connections.max', result.maxConnections);
      push('database.memory.used.bytes', result.usedMemory, 'bytes');
      push('database.memory.peak.bytes', result.usedMemoryPeak, 'bytes');
      push('database.memory.max.bytes', result.maxMemory, 'bytes');
      push('database.keyspace.hits', result.keyspaceHits, 'count');
      push('database.keyspace.misses', result.keyspaceMisses, 'count');
      push('database.keys.evicted', result.evictedKeys, 'count');
      push('database.keys.expired', result.expiredKeys, 'count');
      push('database.ops.persec', result.opsPerSecond, 'count');
      push('database.uptime.seconds', result.uptimeSeconds, 'seconds');
    } else if (engine === 'elasticsearch' || engine === 'opensearch') {
      push('database.cluster.nodes', result.nodes);
      push('database.cluster.data_nodes', result.dataNodes);
      push('database.cluster.active_shards', result.activeShards);
      push('database.cluster.unassigned_shards', result.unassignedShards);
      push('database.documents.count', result.documentCount, 'count');
      push('database.size.bytes', result.storeBytes, 'bytes');
      push('database.memory.heap.used.bytes', result.jvmHeapUsed, 'bytes');
      push('database.memory.heap.max.bytes', result.jvmHeapMax, 'bytes');
      push('database.cpu.usage', result.cpuPercent, 'percent');
      push('database.uptime.seconds', result.uptimeMs != null ? result.uptimeMs / 1000 : null, 'seconds');
    } else if (engine === 'sqlite') {
      push('database.size.bytes', result.sizeBytes, 'bytes');
      push('database.pages.count', result.pageCount, 'count');
      push('database.tables.count', result.tables, 'count');
      push('database.indexes.count', result.indexes, 'count');
    } else {
      base.missing.push(`${engine} metric mapping`);
    }
  }

  unavailable(reason, started) {
    this.lastAt = started;
    this.lastError = reason;
    this.lastDetails = { at: new Date(started).toISOString(), available: false, reason, connections: [], errors: [reason] };
    return { ok: true, available: false, reason, metrics: [], details: this.lastDetails, errors: [reason], durationMs: Date.now() - started, at: new Date(started).toISOString() };
  }
}

module.exports = { DatabaseCollector, ENGINE_LABELS };
