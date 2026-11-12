'use strict';

const { serializeRows, safeError, boundedLimit, boundedOffset, quoteIdent, splitStatements, usesTls, allowsTlsFallback, isTlsHandshakeError, safeDriverOptions } = require('./util');

/**
 * MySQL / MariaDB adapter backed by mysql2 pools. Statements are executed one
 * at a time from the user's script; OpsDeck never rewrites them.
 */
function create(profile, secrets = {}) {
  let mysql = null;
  const pools = new Map();
  let disposed = false;
  let tlsEnabled = usesTls(profile);
  let currentThread = null;

  function sslConfig() {
    const ssl = profile.ssl || {};
    if (!tlsEnabled) return undefined;
    const options = { rejectUnauthorized: ssl.rejectUnauthorized !== false };
    if (secrets.sslCa) options.ca = secrets.sslCa;
    if (secrets.sslCert) options.cert = secrets.sslCert;
    if (secrets.sslKey) options.key = secrets.sslKey;
    return options;
  }

  function getPool(database) {
    if (disposed) throw new Error('The connection has been closed.');
    if (!mysql) mysql = require('mysql2/promise');
    const key = database || profile.database || '';
    if (!pools.has(key)) {
      pools.set(key, mysql.createPool({
        host: profile.host || '127.0.0.1',
        port: Number(profile.port) || 3306,
        user: profile.username || undefined,
        password: secrets.password || undefined,
        database: key || undefined,
        connectTimeout: Number(profile.timeoutMs) || 10000,
        waitForConnections: true,
        connectionLimit: profile.pool?.max || 5,
        maxIdle: profile.pool?.max || 5,
        idleTimeout: profile.pool?.idleMs || 30000,
        enableKeepAlive: true,
        multipleStatements: false,
        ssl: sslConfig(),
        ...safeDriverOptions(profile.options),
      }));
    }
    return pools.get(key);
  }

  async function connect() {
    const started = Date.now();
    const run = async () => {
      const connection = await getPool(profile.database).getConnection();
      try {
        const [rows] = await connection.query('select version() as version, database() as db, current_user() as username');
        return {
          ok: true,
          latencyMs: Date.now() - started,
          serverVersion: rows[0]?.version || '',
          database: rows[0]?.db || '',
          username: rows[0]?.username || '',
        };
      } finally {
        connection.release();
      }
    };
    try {
      return await run();
    } catch (error) {
      if (!tlsEnabled || !allowsTlsFallback(profile) || !isTlsHandshakeError(error)) throw error;
      tlsEnabled = false;
      await Promise.all([...pools.values()].map((instance) => instance.end().catch(() => {})));
      pools.clear();
      return run();
    }
  }

  async function dispose() {
    disposed = true;
    currentThread = null;
    await Promise.all([...pools.values()].map((instance) => instance.end().catch(() => {})));
    pools.clear();
  }

  async function runOne(sql, database) {
    const connection = await getPool(database).getConnection();
    currentThread = connection.threadId;
    try {
      const [result, fields] = await connection.query(sql);
      if (Array.isArray(result)) {
        return {
          columns: (fields || []).map((field) => ({ name: field.name, type: String(field.type ?? '') })),
          rows: result,
          affectedRows: null,
          command: 'select',
        };
      }
      return {
        columns: (fields || []).map((field) => ({ name: field.name, type: String(field.type ?? '') })),
        rows: [],
        affectedRows: result?.affectedRows ?? 0,
        command: 'write',
        insertId: result?.insertId,
      };
    } finally {
      connection.release();
      currentThread = null;
    }
  }

  async function query(database, sql, opts = {}) {
    const maxRows = boundedLimit(opts.limit, 1000, 20000);
    const statements = splitStatements(sql);
    if (!statements.length) throw new Error('There is no statement to run.');
    const started = Date.now();
    let last = { columns: [], rows: [], command: '' };
    let affected = 0;
    for (const statement of statements) {
      const result = await runOne(statement, database);
      last = result;
      if (result.affectedRows != null) affected += result.affectedRows;
    }
    const rows = last.rows.slice(0, maxRows);
    return {
      ok: true,
      columns: last.columns,
      rows: serializeRows(rows),
      rowCount: rows.length,
      totalRows: last.rows.length,
      command: last.command,
      affectedRows: affected,
      truncated: last.rows.length > maxRows,
      durationMs: Date.now() - started,
    };
  }

  async function cancel() {
    if (!currentThread) return { ok: false, error: 'No running query to cancel.' };
    try {
      const connection = await getPool(profile.database).getConnection();
      try { await connection.query(`KILL ${Number(currentThread)}`); } finally { connection.release(); }
      return { ok: true };
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  }

  async function serverInfo() {
    const connection = await getPool().getConnection();
    try {
      const [rows] = await connection.query(`select version() as version, @@hostname as hostname,
        @@port as port, @@version_comment as comment, uptime() as uptime_seconds`);
      return rows[0] || {};
    } finally { connection.release(); }
  }

  async function listDatabases() {
    const connection = await getPool().getConnection();
    try {
      const [rows] = await connection.query(`select schema_name as name, default_character_set_name as charset
        from information_schema.schemata order by schema_name`);
      const [sizes] = await connection.query(`select table_schema as name,
        sum(data_length + index_length) as size_bytes
        from information_schema.tables group by table_schema`);
      const sizeMap = new Map(sizes.map((row) => [row.name, Number(row.size_bytes) || 0]));
      return rows.map((row) => ({
        name: row.name,
        charset: row.charset,
        sizeBytes: sizeMap.get(row.name) || 0,
      }));
    } finally { connection.release(); }
  }

  async function explorer(database) {
    const db = database || profile.database;
    if (!db) throw new Error('Select a database first.');
    const databases = await listDatabases();
    const connection = await getPool(db).getConnection();
    try {
      const [relations] = await connection.query(`select table_schema as \`schema\`, table_name as name,
          table_type as kind, engine, table_rows as row_estimate,
          data_length + index_length as size_bytes
        from information_schema.tables where table_schema = ? order by table_name`, [db]);
      const [columns] = await connection.query(`select table_name as \`table\`, column_name as name,
          column_type as type, is_nullable as nullable, column_default as \`default\`,
          column_key as \`key\`, extra, ordinal_position as position
        from information_schema.columns where table_schema = ? order by table_name, ordinal_position`, [db]);
      const [indexes] = await connection.query(`select table_name as \`table\`, index_name as name,
          non_unique, seq_in_index, column_name, index_type
        from information_schema.statistics where table_schema = ?
        order by table_name, index_name, seq_in_index`, [db]);
      const [constraints] = await connection.query(`select tc.table_name as \`table\`,
          tc.constraint_name as name, tc.constraint_type as type,
          kcu.column_name as \`column\`, kcu.ordinal_position as position,
          kcu.referenced_table_schema as ref_schema, kcu.referenced_table_name as ref_table,
          kcu.referenced_column_name as ref_column
        from information_schema.table_constraints tc
        left join information_schema.key_column_usage kcu
          on kcu.constraint_schema = tc.constraint_schema and kcu.constraint_name = tc.constraint_name
          and kcu.table_name = tc.table_name
        where tc.table_schema = ? and tc.constraint_type in ('PRIMARY KEY','FOREIGN KEY','UNIQUE')
        order by tc.table_name, tc.constraint_name, kcu.ordinal_position`, [db]);
      const [routines] = await connection.query(`select routine_name as name, routine_type as kind,
          routine_schema as \`schema\`, data_type, routine_definition
        from information_schema.routines where routine_schema = ? order by routine_name`, [db]);
      const [triggers] = await connection.query(`select trigger_name as name, event_object_table as \`table\`,
          event_manipulation as event, action_timing as timing, action_statement as statement
        from information_schema.triggers where trigger_schema = ? order by trigger_name`, [db]);
      const [users] = await connection.query(`select user as name, host from mysql.user order by user, host`)
        .catch(() => [[]]);
      return {
        database: db,
        databases,
        schemas: [db],
        relations,
        columns,
        indexes,
        constraints,
        routines,
        triggers,
        sequences: [],
        extensions: [],
        users,
        roleMembers: [],
      };
    } finally { connection.release(); }
  }

  async function tableData(database, _schema, table, opts = {}) {
    const limit = boundedLimit(opts.limit, 200);
    const offset = boundedOffset(opts.offset);
    const qualified = `${quoteIdent('mysql', database)}.${quoteIdent('mysql', table)}`;
    const sort = opts.sort && /^[A-Za-z0-9_ ]{1,80}$/.test(opts.sort.column || '')
      ? ` order by ${quoteIdent('mysql', opts.sort.column)} ${opts.sort.dir === 'desc' ? 'desc' : 'asc'}`
      : '';
    const connection = await getPool(database).getConnection();
    try {
      const [rows, fields] = await connection.query(`select * from ${qualified}${sort} limit ? offset ?`, [limit + 1, offset]);
      const [count] = await connection.query(`select count(*) as total from ${qualified}`);
      const page = rows.slice(0, limit);
      return {
        columns: (fields || []).map((field) => ({ name: field.name, type: String(field.type ?? '') })),
        rows: serializeRows(page),
        rowCount: page.length,
        total: Number(count[0]?.total) || 0,
        limit,
        offset,
        truncated: rows.length > limit,
      };
    } finally { connection.release(); }
  }

  async function explain(database, sql, analyze) {
    const statement = String(sql || '').trim().replace(/;+\s*$/, '');
    if (!statement) throw new Error('There is no statement to explain.');
    const readOnly = /^(select|with|values)\b/i.test(statement);
    const prefix = analyze && readOnly ? 'EXPLAIN ANALYZE ' : 'EXPLAIN FORMAT=JSON ';
    return query(database, `${prefix}${statement}`, { limit: 200 });
  }

  async function metrics() {
    const connection = await getPool().getConnection();
    try {
      const [status] = await connection.query('SHOW GLOBAL STATUS');
      const map = {};
      for (const row of status) map[row.Variable_name] = row.Value;
      let processes = [];
      try {
        const [rows] = await connection.query(`select id, user as username, host, db as \`database\`,
            command, time as seconds, state, left(info, 300) as query
          from information_schema.processlist where command <> 'Sleep' order by time desc limit 30`);
        processes = rows;
      } catch { /* permission */ }
      let slow = null;
      try {
        const [rows] = await connection.query(`select digest_text as query, count_star as calls,
            avg_timer_wait/1000000000 as mean_ms, sum_rows_examined as rows_examined
          from performance_schema.events_statements_summary_by_digest
          where digest_text is not null order by avg_timer_wait desc limit 20`);
        slow = rows;
      } catch { /* performance_schema unavailable */ }
      const number = (key) => Number(map[key]) || 0;
      const readRequests = number('Innodb_buffer_pool_read_requests');
      const reads = number('Innodb_buffer_pool_reads');
      return {
        ok: true,
        available: true,
        serverVersion: map.version || '',
        uptimeSeconds: number('Uptime'),
        activeConnections: number('Threads_connected'),
        maxConnections: Number(map.max_connections) || (await connection.query('select @@max_connections as max').then(([r]) => r[0]?.max).catch(() => null)),
        queries: number('Queries'),
        slowQueries: number('Slow_queries'),
        threadsRunning: number('Threads_running'),
        cacheHitRatio: readRequests > 0 ? ((readRequests - reads) / readRequests) * 100 : null,
        bytesReceived: number('Bytes_received'),
        bytesSent: number('Bytes_sent'),
        processes,
        slowQueryList: slow,
        slowQueriesAvailable: Boolean(slow),
      };
    } finally { connection.release(); }
  }

  async function createDatabase(name) {
    const connection = await getPool().getConnection();
    try {
      await connection.query(`create database ${quoteIdent('mysql', name)}`);
      return { ok: true };
    } finally { connection.release(); }
  }

  async function dropDatabase(name) {
    const connection = await getPool().getConnection();
    try {
      await connection.query(`drop database ${quoteIdent('mysql', name)}`);
      return { ok: true };
    } finally { connection.release(); }
  }

  return {
    engine: profile.engine === 'mariadb' ? 'mariadb' : 'mysql',
    connect, dispose, serverInfo, listDatabases, explorer, tableData, query, cancel,
    explain, metrics, createDatabase, dropDatabase,
  };
}

module.exports = { create };
