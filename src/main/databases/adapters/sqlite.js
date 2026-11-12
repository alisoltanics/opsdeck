'use strict';

const fs = require('node:fs');
const path = require('node:path');
const initSqlJs = require('sql.js');
const { serializeRows, safeError, boundedLimit, boundedOffset, quoteIdent, splitStatements, isReadOnlySql } = require('./util');

let sqlPromise = null;
function loadSql() {
  if (!sqlPromise) {
    const wasmBinary = fs.readFileSync(require.resolve('sql.js/dist/sql-wasm.wasm'));
    sqlPromise = initSqlJs({ wasmBinary });
  }
  return sqlPromise;
}

/**
 * SQLite adapter using sql.js. The database file is loaded into memory and
 * flushed atomically after write statements. OpsDeck refuses to overwrite a
 * file that changed on disk since it was opened.
 */
function create(profile) {
  let SQL = null;
  let db = null;
  let file = '';
  let loadedMtime = 0;
  let disposed = false;
  let readOnly = profile.readOnly === true;

  function resolveFile() {
    const raw = String(profile.file || '').trim();
    if (!raw) throw new Error('Choose a SQLite database file.');
    if (raw.length > 4000 || raw.includes('\u0000')) throw new Error('The SQLite path is not valid.');
    const resolved = path.resolve(raw.replace(/^~(?=$|\/)/, require('node:os').homedir()));
    if (!path.isAbsolute(resolved)) throw new Error('The SQLite path must be absolute.');
    return resolved;
  }

  async function reload() {
    SQL = await loadSql();
    if (!file) file = resolveFile();
    if (fs.existsSync(file)) {
      const bytes = fs.readFileSync(file);
      loadedMtime = fs.statSync(file).mtimeMs;
      db = new SQL.Database(new Uint8Array(bytes));
    } else {
      if (readOnly) throw new Error('The SQLite file does not exist.');
      fs.mkdirSync(path.dirname(file), { recursive: true });
      db = new SQL.Database();
      persist();
    }
    return db;
  }

  function persist() {
    if (!db || readOnly || !file) return;
    try {
      if (fs.existsSync(file)) {
        const mtime = fs.statSync(file).mtimeMs;
        if (loadedMtime && Math.abs(mtime - loadedMtime) > 1) {
          throw new Error('The SQLite file changed on disk. Refresh the connection before saving.');
        }
      }
      const data = Buffer.from(db.export());
      const temp = `${file}.${process.pid}.tmp`;
      const mode = fs.existsSync(file) ? fs.statSync(file).mode & 0o777 : 0o600;
      fs.writeFileSync(temp, data, { mode });
      fs.renameSync(temp, file);
      loadedMtime = fs.statSync(file).mtimeMs;
    } catch (error) {
      throw new Error(safeError(error, 'Could not save the SQLite database.'));
    }
  }

  async function connect() {
    const started = Date.now();
    file = resolveFile();
    await reload();
    let version = '';
    try {
      const res = db.exec('select sqlite_version() as version');
      version = String(res[0]?.values?.[0]?.[0] || '');
    } catch { /* ignore */ }
    return {
      ok: true,
      latencyMs: Date.now() - started,
      serverVersion: `SQLite ${version}`.trim(),
      database: path.basename(file),
      username: '',
    };
  }

  async function dispose() {
    disposed = true;
    if (db) db.close();
    db = null;
  }

  function ensure() {
    if (disposed || !db) throw new Error('The connection is not open.');
    return db;
  }

  async function serverInfo() {
    const size = fs.existsSync(file) ? fs.statSync(file).size : 0;
    return {
      version: SQL ? `SQLite ${db.exec('select sqlite_version()')[0]?.values?.[0]?.[0] || ''}` : 'SQLite',
      file,
      sizeBytes: size,
    };
  }

  async function listDatabases() {
    return [{
      name: path.basename(file),
      path: file,
      sizeBytes: fs.existsSync(file) ? fs.statSync(file).size : 0,
    }];
  }

  async function explorer() {
    const database = ensure();
    const relations = [];
    const query = database.exec(`select name, type, sql from sqlite_master
      where type in ('table','view') and name not like 'sqlite_%' order by type, name`);
    for (const row of query[0]?.values || []) {
      const [name, type, sql] = row;
      relations.push({ schema: 'main', name, kind: type === 'view' ? 'view' : 'table', sql });
    }
    const columns = [];
    for (const relation of relations.filter((item) => item.kind === 'table')) {
      const info = database.exec(`PRAGMA table_info(${quoteIdent('sqlite', relation.name)})`);
      for (const row of info[0]?.values || []) {
        const [cid, name, type, notnull, dflt, pk] = row;
        columns.push({
          schema: 'main', table: relation.name, name, type: type || '',
          nullable: notnull ? 'NO' : 'YES', default: dflt, key: pk ? 'PRI' : '', position: cid,
        });
      }
    }
    const indexes = [];
    for (const relation of relations.filter((item) => item.kind === 'table')) {
      const list = database.exec(`PRAGMA index_list(${quoteIdent('sqlite', relation.name)})`);
      for (const row of list[0]?.values || []) {
        const [seq, name, unique, origin, partial] = row;
        const info = database.exec(`PRAGMA index_info(${quoteIdent('sqlite', name)})`);
        indexes.push({
          schema: 'main', table: relation.name, name, unique: unique === 1,
          origin, partial: partial === 1,
          columns: (info[0]?.values || []).map((entry) => entry[2]),
        });
      }
    }
    const triggers = [];
    const triggerRows = database.exec(`select name, tbl_name, sql from sqlite_master where type = 'trigger'`);
    for (const row of triggerRows[0]?.values || []) {
      triggers.push({ schema: 'main', table: row[1], name: row[0], statement: row[2] || '' });
    }
    // SQLite exposes foreign keys only through a pragma, not information_schema.
    const constraints = [];
    for (const relation of relations.filter((item) => item.kind === 'table')) {
      const list = database.exec(`PRAGMA foreign_key_list(${quoteIdent('sqlite', relation.name)})`);
      const grouped = new Map();
      for (const row of list[0]?.values || []) {
        const [id, seq, parent, from, to, onUpdate, onDelete] = row;
        if (!grouped.has(id)) grouped.set(id, []);
        grouped.get(id).push({ seq, parent, from, to, onUpdate, onDelete });
      }
      for (const [id, columns] of grouped) {
        columns.sort((a, b) => Number(a.seq) - Number(b.seq));
        for (const entry of columns) {
          if (!entry.from || !entry.parent) continue;
          constraints.push({
            schema: 'main', table: relation.name, name: `fk_${relation.name}_${id}`,
            type: 'FOREIGN KEY', column: entry.from, position: entry.seq,
            ref_schema: 'main', ref_table: entry.parent, ref_column: entry.to,
            on_delete: entry.onDelete, on_update: entry.onUpdate,
          });
        }
      }
    }
    const views = relations.filter((item) => item.kind === 'view').map((item) => ({ name: item.name, schema: 'main' }));
    const tables = relations.filter((item) => item.kind === 'table').map((item) => ({ name: item.name, schema: 'main' }));
    return {
      database: path.basename(file),
      databases: await listDatabases(),
      schemas: ['main'],
      relations,
      columns,
      indexes,
      constraints,
      triggers,
      routines: [],
      sequences: [],
      extensions: [],
      users: [],
      roleMembers: [],
      tables,
      views,
    };
  }

  async function tableData(_database, _schema, table, opts = {}) {
    const database = ensure();
    const limit = boundedLimit(opts.limit, 200);
    const offset = boundedOffset(opts.offset);
    const qualified = quoteIdent('sqlite', table);
    const sort = opts.sort && /^[A-Za-z0-9_ ]{1,80}$/.test(opts.sort.column || '')
      ? ` order by ${quoteIdent('sqlite', opts.sort.column)} ${opts.sort.dir === 'desc' ? 'desc' : 'asc'}`
      : '';
    const rowsRes = database.exec(`select * from ${qualified}${sort} limit ${limit + 1} offset ${offset}`);
    const columns = (rowsRes[0]?.columns || []).map((name) => ({ name }));
    const raw = rowsRes[0]?.values || [];
    const rows = raw.slice(0, limit).map((values) => {
      const row = {};
      columns.forEach((column, index) => { row[column.name] = values[index]; });
      return row;
    });
    const countRes = database.exec(`select count(*) from ${qualified}`);
    return {
      columns,
      rows: serializeRows(rows),
      rowCount: rows.length,
      total: Number(countRes[0]?.values?.[0]?.[0]) || 0,
      limit,
      offset,
      truncated: raw.length > limit,
    };
  }

  async function query(database_, sql, opts = {}) {
    const database = ensure();
    const maxRows = boundedLimit(opts.limit, 1000, 20000);
    const statements = splitStatements(sql);
    if (!statements.length) throw new Error('There is no statement to run.');
    const started = Date.now();
    let last = { columns: [], values: [] };
    let affected = 0;
    let wrote = false;
    for (const statement of statements) {
      const result = database.exec(statement);
      if (result.length) last = result[result.length - 1];
      if (!isReadOnlySql(statement)) {
        wrote = true;
        affected += database.getRowsModified();
      }
    }
    if (wrote) persist();
    const columns = (last.columns || []).map((name) => ({ name }));
    const raw = last.values || [];
    const rows = raw.slice(0, maxRows).map((values) => {
      const row = {};
      columns.forEach((column, index) => { row[column.name] = values[index]; });
      return row;
    });
    return {
      ok: true,
      columns,
      rows: serializeRows(rows),
      rowCount: rows.length,
      totalRows: raw.length,
      affectedRows: affected,
      command: wrote ? 'write' : 'select',
      truncated: raw.length > maxRows,
      durationMs: Date.now() - started,
    };
  }

  async function cancel() {
    return { ok: false, error: 'sql.js cannot cancel a statement synchronously in this build.' };
  }

  async function explain(_database, sql) {
    const database = ensure();
    const statement = String(sql || '').trim().replace(/;+\s*$/, '');
    const res = database.exec(`EXPLAIN QUERY PLAN ${statement}`);
    const rows = (res[0]?.values || []).map((values) => ({
      id: values[0], parent: values[1], notused: values[2], detail: values[3],
    }));
    return { ok: true, plan: rows, text: rows.map((row) => row.detail).join('\n') };
  }

  async function metrics() {
    const database = ensure();
    const pageCount = Number(database.exec('PRAGMA page_count')[0]?.values?.[0]?.[0]) || 0;
    const pageSize = Number(database.exec('PRAGMA page_size')[0]?.values?.[0]?.[0]) || 0;
    const tables = Number(database.exec(`select count(*) from sqlite_master where type = 'table' and name not like 'sqlite_%'`)[0]?.values?.[0]?.[0]) || 0;
    const indexes = Number(database.exec(`select count(*) from sqlite_master where type = 'index'`)[0]?.values?.[0]?.[0]) || 0;
    return {
      ok: true,
      available: true,
      sizeBytes: pageCount * pageSize || (fs.existsSync(file) ? fs.statSync(file).size : 0),
      pageCount,
      pageSize,
      tables,
      indexes,
      journalMode: String(database.exec('PRAGMA journal_mode')[0]?.values?.[0]?.[0] || ''),
      foreignKeys: String(database.exec('PRAGMA foreign_keys')[0]?.values?.[0]?.[0] ?? ''),
    };
  }

  async function backup(destination) {
    if (!db) throw new Error('The connection is not open.');
    const target = path.resolve(String(destination || ''));
    fs.mkdirSync(path.dirname(target), { recursive: true });
    const temp = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temp, Buffer.from(db.export()), { mode: 0o600 });
    fs.renameSync(temp, target);
    return { ok: true, file: target, sizeBytes: fs.statSync(target).size };
  }

  return {
    engine: 'sqlite',
    connect, dispose, serverInfo, listDatabases, explorer, tableData, query, cancel,
    explain, metrics, createDatabase: null, dropDatabase: null, backup,
    reload,
  };
}

module.exports = { create };
