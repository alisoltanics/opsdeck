'use strict';

const { serializeRows, safeError, boundedLimit, boundedOffset, quoteIdent, usesTls, allowsTlsFallback, isTlsHandshakeError, safeDriverOptions } = require('./util');

/**
 * PostgreSQL adapter backed by `pg` pools. All queries are sent verbatim;
 * OpsDeck never rewrites user SQL. Row buffers are bounded before crossing IPC.
 */
function create(profile, secrets = {}) {
  let pg = null;
  const pools = new Map();
  let disposed = false;
  let tlsEnabled = usesTls(profile);
  const cancels = new Map();

  function sslConfig() {
    const ssl = profile.ssl || {};
    if (!tlsEnabled) return false;
    const options = { rejectUnauthorized: ssl.rejectUnauthorized !== false };
    if (secrets.sslCa) options.ca = secrets.sslCa;
    if (secrets.sslCert) options.cert = secrets.sslCert;
    if (secrets.sslKey) options.key = secrets.sslKey;
    if (ssl.serverName) options.servername = ssl.serverName;
    return options;
  }

  function baseConfig(database) {
    return {
      host: profile.host || '127.0.0.1',
      port: Number(profile.port) || 5432,
      user: profile.username || undefined,
      password: secrets.password || undefined,
      database: database || profile.database || 'postgres',
      ssl: sslConfig(),
      connectionTimeoutMillis: Number(profile.timeoutMs) || 10000,
      idleTimeoutMillis: profile.pool?.idleMs || 30000,
      max: profile.pool?.max || 5,
      min: profile.pool?.min || 0,
      application_name: 'OpsDeck',
      keepAlive: true,
      ...safeDriverOptions(profile.options),
    };
  }

  function pool(database) {
    if (disposed) throw new Error('The connection has been closed.');
    if (!pg) pg = require('pg');
    const key = database || profile.database || 'postgres';
    if (!pools.has(key)) {
      const instance = new pg.Pool(baseConfig(key));
      instance.on('error', () => { /* idle client errors are surfaced on next query */ });
      pools.set(key, instance);
    }
    return pools.get(key);
  }

  async function withClient(database, fn) {
    const client = await pool(database).connect();
    try {
      return await fn(client);
    } finally {
      client.release();
    }
  }

  async function connect() {
    const started = Date.now();
    const run = () => withClient(profile.database || 'postgres', async (client) => {
      await client.query(`SET statement_timeout = ${Math.max(1000, Math.floor(Number(profile.timeoutMs) || 10000))}`);
      await client.query("SET application_name = 'OpsDeck'");
      const version = await client.query('select version() as version, current_database() as database, current_user as username');
      return version.rows[0] || {};
    });
    let info;
    try {
      info = await run();
    } catch (error) {
      if (!tlsEnabled || !allowsTlsFallback(profile) || !isTlsHandshakeError(error)) throw error;
      // The server does not speak TLS: `prefer` falls back to plaintext once.
      tlsEnabled = false;
      await Promise.all([...pools.values()].map((instance) => instance.end().catch(() => {})));
      pools.clear();
      info = await run();
    }
    return {
      ok: true,
      latencyMs: Date.now() - started,
      serverVersion: info.version || '',
      database: info.database || '',
      username: info.username || '',
    };
  }

  async function dispose() {
    disposed = true;
    cancels.clear();
    await Promise.all([...pools.values()].map((instance) => instance.end().catch(() => {})));
    pools.clear();
  }

  async function serverInfo() {
    return withClient(profile.database || 'postgres', async (client) => {
      const res = await client.query(`select version() as version,
        current_database() as database,
        current_user as username,
        pg_postmaster_start_time() as started_at,
        now() - pg_postmaster_start_time() as uptime`);
      return res.rows[0] || {};
    });
  }

  async function listDatabases() {
    return withClient(profile.database || 'postgres', async (client) => {
      const res = await client.query(`
        select d.datname as name,
               pg_get_userbyid(d.datdba) as owner,
               d.datistemplate as is_template,
               pg_database_size(d.datname) as size_bytes
        from pg_database d
        order by d.datname`);
      return res.rows.map((row) => ({
        name: row.name,
        owner: row.owner || '',
        isTemplate: row.is_template === true,
        sizeBytes: Number(row.size_bytes) || 0,
      }));
    });
  }

  async function explorer(database) {
    const db = database || profile.database || 'postgres';
    const databases = await listDatabases();
    const data = await withClient(db, async (client) => {
      // pg clients run one statement at a time; await sequentially.
      const schemas = await client.query(`select schema_name from information_schema.schemata
        where schema_name not in ('pg_catalog','information_schema')
        order by schema_name`);
      const relations = await client.query(`select n.nspname as schema, c.relname as name,
          case c.relkind when 'r' then 'table' when 'p' then 'table'
            when 'v' then 'view' when 'm' then 'materialized view'
            when 'f' then 'foreign table' when 'S' then 'sequence' end as kind,
          greatest(c.reltuples, 0) as row_estimate,
          pg_total_relation_size(c.oid) as size_bytes
        from pg_class c join pg_namespace n on n.oid = c.relnamespace
        where c.relkind in ('r','p','v','m','f','S')
          and n.nspname not in ('pg_catalog','information_schema')
        order by n.nspname, c.relname`);
      const columns = await client.query(`select table_schema as schema, table_name as table, column_name as name,
          data_type as type, is_nullable as nullable, column_default as default,
          character_maximum_length as max_length, ordinal_position as position
        from information_schema.columns
        where table_schema not in ('pg_catalog','information_schema')
        order by table_schema, table_name, ordinal_position`);
      const indexes = await client.query(`select schemaname as schema, tablename as table, indexname as name, indexdef as definition
        from pg_indexes where schemaname not in ('pg_catalog','information_schema')`);
      const triggers = await client.query(`select trigger_schema as schema, event_object_table as table, trigger_name as name,
          event_manipulation as event, action_timing as timing, action_statement as statement
        from information_schema.triggers order by trigger_schema, event_object_table`);
      const sequences = await client.query(`select sequence_schema as schema, sequence_name as name, data_type as type,
          start_value as start, increment as increment
        from information_schema.sequences order by sequence_schema, sequence_name`);
      const routines = await client.query(`select n.nspname as schema, p.proname as name,
          case p.prokind when 'p' then 'procedure' when 'a' then 'aggregate'
            when 'w' then 'window' else 'function' end as kind,
          pg_get_function_identity_arguments(p.oid) as arguments,
          l.lanname as language
        from pg_proc p join pg_namespace n on n.oid = p.pronamespace
        join pg_language l on l.oid = p.prolang
        where n.nspname not in ('pg_catalog','information_schema')
        order by n.nspname, p.proname`);
      const extensions = await client.query(`select e.extname as name, e.extversion as version,
          n.nspname as schema, d.description
        from pg_extension e join pg_namespace n on n.oid = e.extnamespace
        left join pg_description d on d.objoid = e.oid
        order by e.extname`);
      const users = await client.query(`select rolname as name, rolsuper as superuser, rolcanlogin as can_login,
          rolcreatedb as create_db, rolcreaterole as create_role, rolvaliduntil as valid_until
        from pg_roles where rolname not like 'pg\\_%' order by rolname`);
      const roles = await client.query(`select r.rolname as role, m.rolname as member, am.admin_option
        from pg_auth_members am
        join pg_roles r on r.oid = am.roleid
        join pg_roles m on m.oid = am.member
        order by r.rolname, m.rolname`);
      return {
        schemas: schemas.rows.map((row) => row.schema_name),
        relations: relations.rows,
        columns: columns.rows,
        indexes: indexes.rows,
        triggers: triggers.rows,
        sequences: sequences.rows,
        routines: routines.rows,
        extensions: extensions.rows,
        users: users.rows,
        roleMembers: roles.rows,
      };
    });
    return { database: db, databases, ...data };
  }

  async function tableData(database, schema, table, opts = {}) {
    const limit = boundedLimit(opts.limit, 200);
    const offset = boundedOffset(opts.offset);
    const qualified = `${quoteIdent('postgres', schema || 'public')}.${quoteIdent('postgres', table)}`;
    const sort = opts.sort && /^[A-Za-z0-9_ ]{1,80}$/.test(opts.sort.column || '')
      ? ` order by ${quoteIdent('postgres', opts.sort.column)} ${opts.sort.dir === 'desc' ? 'desc' : 'asc'}`
      : '';
    return withClient(database, async (client) => {
      const res = await client.query(`select * from ${qualified}${sort} limit $1 offset $2`, [limit + 1, offset]);
      const rows = res.rows.slice(0, limit);
      const count = await client.query(`select count(*)::bigint as total from ${qualified}`);
      return {
        columns: res.fields.map((field) => ({ name: field.name, type: String(field.dataTypeID) })),
        rows: serializeRows(rows),
        rowCount: rows.length,
        total: Number(count.rows[0]?.total) || 0,
        limit,
        offset,
        truncated: res.rows.length > limit,
      };
    });
  }

  async function query(database, sql, opts = {}) {
    const maxRows = boundedLimit(opts.limit, 1000, 20000);
    const started = Date.now();
    return withClient(database, async (client) => {
      const pid = (await client.query('select pg_backend_pid() as pid')).rows[0]?.pid;
      if (opts.token) cancels.set(String(opts.token), { database, pid });
      try {
        const timeout = Math.max(1000, Number(opts.timeoutMs) || Number(profile.timeoutMs) || 30000);
        await client.query(`SET statement_timeout = ${Math.floor(timeout)}`);
        const result = await client.query(sql);
        const list = Array.isArray(result) ? result[result.length - 1] : result;
        const allRows = Array.isArray(list?.rows) ? list.rows : [];
        const rows = allRows.slice(0, maxRows);
        return {
          ok: true,
          columns: (list?.fields || []).map((field) => ({ name: field.name })),
          rows: serializeRows(rows),
          rowCount: rows.length,
          totalRows: allRows.length,
          command: list?.command || '',
          truncated: allRows.length > maxRows,
          durationMs: Date.now() - started,
        };
      } finally {
        if (opts.token) cancels.delete(String(opts.token));
      }
    });
  }

  async function cancel(token) {
    const entry = cancels.get(String(token));
    if (!entry || !entry.pid) return { ok: false, error: 'No running query to cancel.' };
    try {
      await withClient(entry.database, (client) => client.query('select pg_cancel_backend($1)', [entry.pid]));
      return { ok: true };
    } catch (error) {
      return { ok: false, error: safeError(error) };
    }
  }

  async function explain(database, sql, analyze) {
    const statement = String(sql || '').trim();
    if (!statement) throw new Error('There is no statement to explain.');
    const readOnly = /^(select|with|values)\b/i.test(statement);
    const prefix = analyze && readOnly ? 'EXPLAIN (ANALYZE, BUFFERS, FORMAT JSON) ' : 'EXPLAIN (FORMAT JSON) ';
    return withClient(database, async (client) => {
      const res = await client.query(`${prefix}${statement}`);
      const plan = res.rows?.[0]?.['QUERY PLAN'] || res.rows?.[0] || null;
      return {
        ok: true,
        analyze: Boolean(analyze && readOnly),
        plan,
        text: JSON.stringify(plan, null, 2),
      };
    });
  }

  async function metrics() {
    return withClient(profile.database || 'postgres', async (client) => {
      const activity = await client.query(`select state, count(*)::int as count from pg_stat_activity
          where datname = current_database() group by state`);
      const database = await client.query(`select numbackends, xact_commit, xact_rollback, blks_read, blks_hit,
            tup_returned, tup_fetched, tup_inserted, tup_updated, tup_deleted,
            conflicts, deadlocks, temp_files, temp_bytes,
            pg_database_size(current_database()) as size_bytes
          from pg_stat_database where datname = current_database()`);
      const settings = await client.query(`select name, setting, unit from pg_settings
          where name in ('max_connections','shared_buffers','work_mem','server_version')`);
      const db = database.rows[0] || {};
      const hits = Number(db.blks_hit) || 0;
      const reads = Number(db.blks_read) || 0;
      const settingMap = {};
      for (const row of settings.rows) settingMap[row.name] = `${row.setting}${row.unit && row.unit !== 'kB' ? row.unit : ''}`;
      let longRunning = [];
      try {
        const res = await client.query(`select pid, usename as username, state,
            extract(epoch from (now() - query_start))::numeric(12,1) as seconds,
            left(query, 300) as query
          from pg_stat_activity
          where datname = current_database() and state <> 'idle'
            and now() - query_start > interval '1 second'
          order by seconds desc limit 20`);
        longRunning = res.rows.map((row) => ({ ...row }));
      } catch { /* permission */ }
      let slow = null;
      try {
        const res = await client.query(`select query, calls, total_exec_time as total_ms,
            mean_exec_time as mean_ms, rows
          from pg_stat_statements order by mean_exec_time desc limit 20`);
        slow = res.rows;
      } catch { /* extension not installed */ }
      return {
        ok: true,
        available: true,
        state: 'connected',
        activeConnections: (activity.rows || []).reduce((sum, row) => sum + (Number(row.count) || 0), 0),
        states: activity.rows,
        maxConnections: Number(settingMap.max_connections) || null,
        cacheHitRatio: hits + reads > 0 ? (hits / (hits + reads)) * 100 : null,
        sizeBytes: Number(db.size_bytes) || 0,
        transactions: { commit: Number(db.xact_commit) || 0, rollback: Number(db.xact_rollback) || 0 },
        deadlocks: Number(db.deadlocks) || 0,
        tempBytes: Number(db.temp_bytes) || 0,
        settings: settingMap,
        longRunning,
        slowQueries: slow ? slow.map((row) => ({ ...row })) : null,
        slowQueriesAvailable: Boolean(slow),
      };
    });
  }

  async function createDatabase(name) {
    const ident = quoteIdent('postgres', name);
    await withClient(profile.database || 'postgres', (client) => client.query(`create database ${ident}`));
    return { ok: true };
  }

  async function dropDatabase(name) {
    const ident = quoteIdent('postgres', name);
    await withClient(profile.database || 'postgres', (client) => client.query(`drop database ${ident}`));
    return { ok: true };
  }

  return {
    engine: 'postgres',
    connect, dispose, serverInfo, listDatabases, explorer, tableData, query, cancel,
    explain, metrics, createDatabase, dropDatabase,
  };
}

module.exports = { create };
