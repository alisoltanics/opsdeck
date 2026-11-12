'use strict';

/**
 * Module intelligence analysers.
 *
 * Each analyser turns data that a module already collected into findings with
 * an explicit severity and evidence. Nothing here invents a measurement:
 * unsupported engines, denied Kubernetes RBAC rules and metrics that were
 * never collected are reported as limitations, not as healthy values.
 *
 * The analysers are pure except for the optional metric queries used by the
 * forecast/SLO helpers, which are passed in as dependencies.
 */

const {
  clean, clamp, num, mean, percentile, forecast, timeToThreshold, detectAnomalies,
} = require('./util');

const SEVERITY_ORDER = { critical: 0, warning: 1, info: 2, pass: 3, unknown: 4 };

function finding(capability, severity, title, detail = '', extra = {}) {
  const level = ['critical', 'warning', 'info', 'pass', 'unknown'].includes(severity) ? severity : 'info';
  return {
    id: clean(extra.id, 160) || `${capability}-${title}`.toLowerCase().replace(/[^a-z0-9]+/g, '-').slice(0, 120),
    capability,
    severity: level,
    title: clean(title, 240),
    detail: clean(detail, 800),
    evidence: clean(extra.evidence, 600),
    resource: clean(extra.resource, 240),
    href: /^#\/[A-Za-z0-9/_?&=.#%-]*$/.test(String(extra.href || '')) ? clean(extra.href, 400) : '',
    action: clean(extra.action, 400),
  };
}

function sortFindings(findings) {
  return findings.slice().sort((a, b) => (SEVERITY_ORDER[a.severity] ?? 9) - (SEVERITY_ORDER[b.severity] ?? 9));
}

function summarize(findings) {
  const counts = { critical: 0, warning: 0, info: 0, pass: 0, unknown: 0 };
  for (const item of findings) counts[item.severity] = (counts[item.severity] || 0) + 1;
  return counts;
}

function weighChecks(checks) {
  let weight = 0;
  let score = 0;
  for (const check of checks) {
    if (check.status === 'unknown') continue;
    const w = Math.max(1, Number(check.weight) || 1);
    weight += w;
    if (check.status === 'pass') score += w;
    else if (check.status === 'warn') score += w * 0.5;
  }
  return weight ? Math.round((score / weight) * 100) : null;
}

function check(id, label, status, value, detail, extra = {}) {
  return {
    id, label, status, value: value == null ? null : value, detail: clean(detail, 400),
    weight: extra.weight || 1, capability: extra.capability || 'health',
  };
}

// ------------------------------------------------------------------ database

function databaseHealth({ connection, metrics, diagnostics } = {}) {
  const checks = [];
  const state = connection?.status?.state || (connection?.status?.connected ? 'connected' : 'unknown');
  checks.push(check('connection', 'Connection', state === 'connected' ? 'pass' : state === 'unknown' ? 'unknown' : 'fail',
    state, state === 'connected' ? 'The session is open.' : 'The session is not open, so live values could not be read.', { weight: 3 }));

  if (!metrics || metrics.available === false) {
    checks.push(check('metrics', 'Engine metrics', 'unknown', null, metrics?.reason || 'This engine does not expose metrics.'));
  } else {
    if (num(metrics.cacheHitRatio) != null) {
      const ratio = Number(metrics.cacheHitRatio);
      checks.push(check('cache', 'Cache hit ratio', ratio >= 95 ? 'pass' : ratio >= 90 ? 'warn' : 'fail',
        ratio, ratio >= 95 ? 'Reads are mostly served from memory.' : 'A low ratio means reads are reaching storage.', { weight: 2 }));
    }
    if (num(metrics.activeConnections) != null && num(metrics.maxConnections)) {
      const usage = (Number(metrics.activeConnections) / Number(metrics.maxConnections)) * 100;
      checks.push(check('connections', 'Connection saturation', usage >= 90 ? 'fail' : usage >= 75 ? 'warn' : 'pass',
        usage, `${metrics.activeConnections} of ${metrics.maxConnections} connections are in use.`, { weight: 2 }));
    }
    const running = Array.isArray(metrics.longRunning) ? metrics.longRunning : [];
    const blocked = running.filter((entry) => Number(entry.blocked_by) > 0);
    checks.push(check('blocked', 'Blocked statements', blocked.length ? 'fail' : 'pass', blocked.length,
      blocked.length ? `${blocked.length} statement(s) are waiting on a lock.` : 'No statement is waiting on a lock.', { weight: 2 }));
    const oldest = running.reduce((max, entry) => Math.max(max, Number(entry.seconds) || 0), 0);
    checks.push(check('long-running', 'Long-running statements', oldest >= 60 ? 'fail' : oldest >= 5 ? 'warn' : 'pass',
      oldest, oldest ? `The oldest active statement has run for ${Math.round(oldest)}s.` : 'No statement is running longer than a second.'));
    if (num(metrics.idleInTransaction) != null) {
      const idle = Number(metrics.idleInTransaction);
      checks.push(check('idle-transaction', 'Idle transactions', idle > 0 ? 'warn' : 'pass', idle,
        idle ? `${idle} session(s) are idle inside a transaction and can hold locks.` : 'No session is idle in a transaction.'));
    }
    if (num(metrics.deadlocks) != null) {
      const deadlocks = Number(metrics.deadlocks);
      checks.push(check('deadlocks', 'Deadlocks', deadlocks > 0 ? 'warn' : 'pass', deadlocks,
        deadlocks ? `${deadlocks} deadlock(s) have been recorded since the database started.` : 'No deadlocks have been recorded.'));
    }
    if (num(metrics.tempBytes) != null && Number(metrics.tempBytes) > 0) {
      checks.push(check('temp', 'Temporary spill', 'warn', Number(metrics.tempBytes),
        `${formatBytes(Number(metrics.tempBytes))} of temporary data has been written; sorts may be spilling to disk.`));
    }
    if (metrics.replication) {
      const lag = Number(metrics.replication.masterLinkStatus === 'down' ? 1 : 0);
      const members = Array.isArray(metrics.replication.members) ? metrics.replication.members : [];
      const worstLag = members.reduce((max, member) => Math.max(max, Number(member.lag) || 0), 0);
      if (lag || members.length) {
        checks.push(check('replication', 'Replication', lag ? 'fail' : worstLag > 60e3 ? 'warn' : 'pass',
          worstLag || (lag ? 'down' : 'ok'), lag ? 'A replica has lost its link to the primary.' : `${members.length} replica member(s) reported.`, { weight: 2 }));
      }
    }
    if (num(metrics.unassignedShards) != null) {
      const shards = Number(metrics.unassignedShards);
      checks.push(check('shards', 'Shard allocation', shards > 0 ? 'warn' : 'pass', shards,
        shards ? `${shards} shard(s) are unassigned.` : 'All shards are assigned.', { weight: 2 }));
    }
    if (num(metrics.jvmHeapUsed) != null && num(metrics.jvmHeapMax)) {
      const heap = (Number(metrics.jvmHeapUsed) / Number(metrics.jvmHeapMax)) * 100;
      checks.push(check('heap', 'JVM heap', heap >= 90 ? 'fail' : heap >= 75 ? 'warn' : 'pass', heap,
        `Heap is ${heap.toFixed(1)}% used.`));
    }
    if (num(metrics.slowQueries) != null && Number(metrics.slowQueries) > 0) {
      checks.push(check('slow-queries', 'Slow query counter', 'warn', Number(metrics.slowQueries),
        `${metrics.slowQueries} slow queries have been counted.`));
    }
    const missing = Array.isArray(metrics.missing) ? metrics.missing : [];
    for (const item of missing) checks.push(check(`missing-${item}`, item, 'unknown', null, `${item} is not available.`));
  }

  const diagnosticsChecks = Array.isArray(diagnostics?.steps) ? diagnostics.steps : [];
  const failed = diagnosticsChecks.filter((step) => step.status === 'fail');
  if (failed.length) {
    checks.push(check('diagnostics', 'Diagnostics', 'warn', failed.length,
      failed.map((step) => step.name).join(', '), { weight: 2 }));
  }

  const connectionCheck = checks.find((entry) => entry.id === 'connection');
  const measuredData = checks.filter((entry) => entry.status !== 'unknown' && entry.id !== 'connection');
  const measured = connectionCheck?.status === 'fail' ? checks.filter((entry) => entry.status !== 'unknown') : measuredData;
  // A reachable session alone is not a health measurement: without any engine
  // or diagnostic value the honest answer is "unknown", not a perfect score.
  const score = measured.length ? weighChecks(checks) : null;
  const findings = checks
    .filter((entry) => entry.status !== 'pass' && entry.status !== 'unknown')
    .map((entry) => finding('health', entry.status === 'fail' ? 'critical' : 'warning', entry.label, entry.detail, {
      id: `db-health-${entry.id}`, evidence: entry.value == null ? '' : String(entry.value),
    }));
  const unknown = checks.filter((entry) => entry.status === 'unknown').map((entry) => entry.label);
  return {
    score,
    status: connectionCheck?.status === 'fail' ? 'unhealthy'
      : score == null ? 'unknown'
        : score >= 85 ? 'healthy' : score >= 60 ? 'degraded' : 'unhealthy',
    checks,
    findings,
    unknown,
  };
}

function normalizeSql(sql) {
  return clean(sql, 2000)
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .replace(/--[^\n]*/g, ' ')
    .replace(/'(?:''|[^'])*'/g, '?')
    .replace(/\b\d+(?:\.\d+)?\b/g, '?')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase()
    .slice(0, 400);
}

function analyzeQueryHistory(items = []) {
  const rows = (Array.isArray(items) ? items : []).filter((entry) => entry && entry.sql);
  const groups = new Map();
  for (const row of rows) {
    const key = normalizeSql(row.sql);
    if (!key) continue;
    const group = groups.get(key) || {
      key, sample: clean(row.sql, 240), runs: 0, failures: 0, durations: [], firstAt: row.at, lastAt: row.at, entries: [],
    };
    group.runs += 1;
    if (row.ok === false) group.failures += 1;
    if (Number.isFinite(Number(row.durationMs))) group.durations.push(Number(row.durationMs));
    if (Date.parse(row.at) < Date.parse(group.firstAt)) group.firstAt = row.at;
    if (Date.parse(row.at) > Date.parse(group.lastAt)) group.lastAt = row.at;
    group.entries.push(row);
    groups.set(key, group);
  }
  const statements = [];
  for (const group of groups.values()) {
    const durations = group.durations;
    const stats = {
      key: group.key,
      sample: group.sample,
      runs: group.runs,
      failures: group.failures,
      errorRate: group.runs ? (group.failures / group.runs) * 100 : 0,
      avgMs: durations.length ? Number(mean(durations).toFixed(1)) : null,
      p95Ms: durations.length >= 3 ? Number(percentile(durations, 0.95).toFixed(1)) : null,
      maxMs: durations.length ? Math.max(...durations) : null,
      firstAt: group.firstAt,
      lastAt: group.lastAt,
      regression: null,
    };
    const chronological = group.entries.slice().sort((a, b) => Date.parse(a.at) - Date.parse(b.at))
      .filter((entry) => Number.isFinite(Number(entry.durationMs)));
    if (chronological.length >= 4) {
      const half = Math.floor(chronological.length / 2);
      const older = mean(chronological.slice(0, half).map((entry) => Number(entry.durationMs)));
      const recent = mean(chronological.slice(half).map((entry) => Number(entry.durationMs)));
      if (older != null && recent != null && recent > older * 1.5 && recent - older > 20) {
        stats.regression = {
          olderMs: Number(older.toFixed(1)), recentMs: Number(recent.toFixed(1)),
          changePct: Number((((recent - older) / older) * 100).toFixed(1)),
        };
      }
    }
    statements.push(stats);
  }
  statements.sort((a, b) => b.runs - a.runs);
  const findings = [];
  for (const item of statements) {
    if (item.regression) {
      findings.push(finding('time-machine', 'warning', 'Query became slower', item.sample, {
        id: `db-regression-${item.key.slice(0, 40)}`,
        evidence: `${item.regression.olderMs} ms → ${item.regression.recentMs} ms (+${item.regression.changePct}%)`,
      }));
    }
    if (item.errorRate >= 20 && item.failures >= 2) {
      findings.push(finding('time-machine', 'warning', 'Query keeps failing', item.sample, {
        id: `db-failure-${item.key.slice(0, 40)}`, evidence: `${item.failures} of ${item.runs} runs failed`,
      }));
    }
  }
  const latest = rows.slice().sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).slice(0, 60).map((row) => ({
    id: row.id, at: row.at, sql: clean(row.sql, 300), ok: row.ok === true,
    durationMs: Number.isFinite(Number(row.durationMs)) ? Number(row.durationMs) : null,
    database: row.database || '', engine: row.engine || '', error: clean(row.error, 200),
  }));
  return {
    statements: statements.slice(0, 60),
    latest,
    totals: {
      statements: statements.length,
      runs: rows.length,
      failures: rows.filter((row) => row.ok === false).length,
      avgMs: rows.length ? Number(mean(rows.map((row) => Number(row.durationMs)).filter((value) => Number.isFinite(value))).toFixed(1)) : null,
    },
    findings: sortFindings(findings).slice(0, 20),
  };
}

function analyzeSchema(explorer = {}) {
  const relations = Array.isArray(explorer.relations) ? explorer.relations : [];
  const columns = Array.isArray(explorer.columns) ? explorer.columns : [];
  const constraints = Array.isArray(explorer.constraints) ? explorer.constraints : [];
  const rawIndexes = Array.isArray(explorer.indexes) ? explorer.indexes : [];
  const engine = explorer.engine || '';
  const limitations = [];
  const tables = relations.filter((relation) => /table|collection/i.test(String(relation.kind || 'table')) && !/view/i.test(String(relation.kind || '')));
  if (!tables.length) {
    return {
      supported: false, tables: 0, indexes: 0, findings: [],
      limitations: ['This engine did not report relational tables.'],
      stats: {},
      dependencies: { supported: false, nodes: [], edges: [], cycles: [], mostReferenced: [], isolated: [], stats: {} },
    };
  }

  const columnMap = new Map();
  for (const column of columns) {
    const key = `${column.schema || ''}|${column.table}`;
    if (!columnMap.has(key)) columnMap.set(key, []);
    columnMap.get(key).push(column);
  }

  // Indexes are normalised to one entry per index with ordered columns.
  const indexMap = new Map();
  const addIndex = (table, name, cols, options = {}) => {
    const key = `${table}|${name}`;
    if (!indexMap.has(key)) indexMap.set(key, { table, name, columns: [], unique: false, primary: false });
    const entry = indexMap.get(key);
    if (cols?.length) entry.columns.push(...cols.map((col) => clean(col, 120)).filter(Boolean));
    if (options.unique) entry.unique = true;
    if (options.primary) entry.primary = true;
  };
  if (engine === 'sqlite' || rawIndexes.some((index) => Array.isArray(index.columns))) {
    for (const index of rawIndexes) {
      if (!Array.isArray(index.columns)) continue;
      addIndex(index.table, index.name, index.columns, {
        unique: index.unique === true,
        primary: String(index.origin || '').toLowerCase() === 'pk' || /^sqlite_autoindex/i.test(String(index.name || '')) && String(index.origin || '') === 'pk',
      });
    }
  } else if (rawIndexes.some((index) => index.seq_in_index != null)) {
    const grouped = new Map();
    for (const index of rawIndexes) {
      const key = `${index.table}|${index.name}`;
      if (!grouped.has(key)) grouped.set(key, []);
      grouped.get(key).push(index);
    }
    for (const [key, list] of grouped) {
      list.sort((a, b) => Number(a.seq_in_index) - Number(b.seq_in_index));
      addIndex(list[0].table, list[0].name, list.map((entry) => entry.column_name), {
        unique: Number(list[0].non_unique) === 0, primary: String(list[0].name) === 'PRIMARY',
      });
      indexMap.get(key).unique = Number(list[0].non_unique) === 0;
    }
  } else if (rawIndexes.some((index) => index.key && typeof index.key === 'object')) {
    for (const index of rawIndexes) {
      if (!index.key || typeof index.key !== 'object') {
        addIndex(index.table, index.name, [], { unique: index.unique === true, primary: String(index.name) === '_id_' });
        continue;
      }
      addIndex(index.table, index.name, Object.keys(index.key), {
        unique: index.unique === true, primary: String(index.name) === '_id_',
      });
    }
  } else if (rawIndexes.length) {
    for (const index of rawIndexes) {
      const definition = String(index.definition || '');
      const match = definition.match(/using\s+\w+\s*\(([^)]*)\)/i) || definition.match(/\(([^)]*)\)\s*$/);
      const cols = match ? match[1].split(',').map((part) => part.trim().replace(/["`]/g, '').split(/\s+/)[0]) : [];
      addIndex(index.table, index.name, cols, {
        unique: /unique/i.test(definition), primary: /_pkey$/i.test(String(index.name || '')),
      });
    }
    if (!constraints.length) limitations.push('Primary keys were inferred from index names because constraints were not reported.');
  }

  const primaryTables = new Set();
  const foreignKeys = [];
  for (const constraint of constraints) {
    const key = `${constraint.table}`;
    if (String(constraint.type) === 'PRIMARY KEY') primaryTables.add(key);
    if (String(constraint.type) === 'FOREIGN KEY') {
      const schema = constraint.schema || '';
      const existing = foreignKeys.find((entry) => entry.schema === schema && entry.table === constraint.table && entry.name === constraint.name);
      if (existing) existing.columns.push(constraint.column);
      else {
        foreignKeys.push({
          schema,
          table: constraint.table,
          name: constraint.name,
          columns: [constraint.column],
          refSchema: constraint.ref_schema || schema,
          refTable: constraint.ref_table,
        });
      }
    }
  }
  // SQLite reports the primary key on the column, MySQL through the PRIMARY index.
  for (const column of columns) {
    if (String(column.key || '').toUpperCase() === 'PRI') primaryTables.add(`${column.table}`);
  }
  for (const index of indexMap.values()) if (index.primary) primaryTables.add(index.table);

  const findings = [];
  const tableStats = [];
  for (const table of tables) {
    const name = String(table.name || '');
    const tableColumns = columnMap.get(`${table.schema || ''}|${name}`) || columnMap.get(`${table.schema || ''}|${table.name}`) || [];
    const tableIndexes = [...indexMap.values()].filter((index) => index.table === name);
    const rows = Number(table.row_estimate) || 0;
    const sizeBytes = Number(table.size_bytes) || 0;
    const hasPrimary = primaryTables.has(name) || tableIndexes.some((index) => index.primary);
    tableStats.push({
      name, schema: table.schema || '', kind: table.kind || 'table', rows, sizeBytes,
      columns: tableColumns.length, indexes: tableIndexes.length, primary: hasPrimary,
    });
    if (!hasPrimary && tableColumns.length) {
      findings.push(finding('schema', 'warning', 'Table has no primary key', `${table.schema ? `${table.schema}.` : ''}${name}`, {
        id: `db-nopk-${name}`, resource: name,
        evidence: `${tableColumns.length} column(s), ${tableIndexes.length} index(es)`,
        action: 'Add a primary key so rows can be identified and replicated safely.',
      }));
    }
    if (!tableIndexes.length && rows >= 10000) {
      findings.push(finding('schema', 'warning', 'Large table without indexes', name, {
        id: `db-noindex-${name}`, resource: name, evidence: `${rows.toLocaleString()} estimated rows`,
        action: 'Index the columns used by frequent filters and joins.',
      }));
    }
    if (sizeBytes >= 1024 ** 3) {
      findings.push(finding('schema', 'info', 'Large table', name, {
        id: `db-large-${name}`, resource: name, evidence: formatBytes(sizeBytes),
        action: 'Review retention, partitioning or archival for this table.',
      }));
    }
  }

  for (const fk of foreignKeys) {
    const indexed = [...indexMap.values()].some((index) => index.table === fk.table
      && index.columns.slice(0, fk.columns.length).every((column, position) => column === fk.columns[position]));
    if (!indexed) {
      findings.push(finding('schema', 'warning', 'Foreign key has no supporting index', `${fk.table}.${fk.columns.join(', ')}`, {
        id: `db-fk-${fk.table}-${fk.name}`, resource: fk.table,
        evidence: `references ${fk.refTable || 'another table'}`,
        action: 'Add an index on the referencing columns to avoid slow deletes and joins.',
      }));
    }
  }

  const seen = new Map();
  for (const index of indexMap.values()) {
    if (index.primary || !index.columns.length) continue;
    const key = `${index.table}|${index.columns.join(',')}`;
    if (seen.has(key)) {
      findings.push(finding('schema', 'info', 'Duplicate index', `${index.table}: ${index.name}`, {
        id: `db-dup-${index.table}-${index.name}`, resource: index.table,
        evidence: `The same columns are already indexed by ${seen.get(key)}`,
        action: 'Drop the redundant index to reduce write amplification.',
      }));
    } else seen.set(key, index.name);
  }

  const dependencies = buildTableDependencies(tables, foreignKeys, tableStats);
  for (const cycle of dependencies.cycles.slice(0, 5)) {
    findings.push(finding('schema', 'info', 'Circular foreign-key relationship', cycle.nodes.join(' → '), {
      id: `db-cycle-${cycle.signature.replace(/[^a-z0-9]+/gi, '-').slice(0, 80)}`,
      resource: cycle.nodes[0],
      evidence: 'Deletes and inserts must satisfy the cycle; check the ON DELETE behaviour.',
      action: 'Break the cycle with a nullable reference or an application-level invariant.',
    }));
  }

  return {
    supported: true,
    engine,
    tables: tables.length,
    indexes: indexMap.size,
    dependencies,
    stats: {
      tables: tables.length,
      indexes: indexMap.size,
      foreignKeys: foreignKeys.length,
      columns: columns.length,
      approxRows: tableStats.reduce((sum, table) => sum + table.rows, 0),
      sizeBytes: tableStats.reduce((sum, table) => sum + table.sizeBytes, 0),
    },
    tableStats: tableStats.sort((a, b) => b.sizeBytes - a.sizeBytes).slice(0, 100),
    findings: sortFindings(findings).slice(0, 80),
    limitations,
  };
}

/**
 * Foreign-key graph for one schema.
 *
 * Edges are only the declared foreign keys that the engine reported. Nothing
 * is inferred from naming conventions, so a missing constraint stays missing.
 */
function buildTableDependencies(tables, foreignKeys, tableStats = []) {
  const keyOf = (schema, name) => `${schema || ''}|${name || ''}`;
  const nodes = new Map();
  const ensureNode = (schema, name) => {
    if (!name) return null;
    const key = keyOf(schema, name);
    if (!nodes.has(key)) {
      nodes.set(key, {
        id: key, name, schema: schema || '', known: false,
        rows: 0, sizeBytes: 0, outgoing: 0, incoming: 0,
      });
    }
    return nodes.get(key);
  };
  for (const table of tables) {
    const node = ensureNode(table.schema, table.name);
    if (!node) continue;
    node.known = true;
    const stat = tableStats.find((entry) => entry.name === table.name && (entry.schema || '') === (table.schema || ''));
    node.rows = stat?.rows || 0;
    node.sizeBytes = stat?.sizeBytes || 0;
  }

  const edges = [];
  const seen = new Set();
  for (const fk of foreignKeys) {
    if (!fk.refTable) continue;
    const from = ensureNode(fk.schema, fk.table);
    const to = ensureNode(fk.refSchema || fk.schema, fk.refTable);
    if (!from || !to) continue;
    const id = `${from.id}->${to.id}:${fk.name || (fk.columns || []).join(',')}`;
    if (seen.has(id)) continue;
    seen.add(id);
    edges.push({
      id,
      from: from.id, to: to.id,
      fromLabel: from.schema ? `${from.schema}.${from.name}` : from.name,
      toLabel: to.schema ? `${to.schema}.${to.name}` : to.name,
      columns: (fk.columns || []).filter(Boolean),
      constraint: fk.name || '',
      toKnown: to.known,
    });
    from.outgoing += 1;
    to.incoming += 1;
  }

  const labelOf = (key) => {
    const node = nodes.get(key);
    if (node) return node.schema ? `${node.schema}.${node.name}` : node.name;
    const [schema, name] = String(key).split('|');
    return schema ? `${schema}.${name}` : name;
  };

  // Iterative depth-first search keeps a pathological schema from exhausting
  // the main-process stack.
  const adjacency = new Map();
  for (const edge of edges) {
    if (!adjacency.has(edge.from)) adjacency.set(edge.from, []);
    adjacency.get(edge.from).push(edge.to);
  }
  const order = new Map([...nodes.keys()].map((key, index) => [key, index]));
  const color = new Uint8Array(nodes.size);
  const cycles = [];
  const seenCycle = new Set();
  for (const start of nodes.keys()) {
    if (color[order.get(start)]) continue;
    color[order.get(start)] = 1;
    const path = [start];
    const stack = [{ key: start, next: 0 }];
    while (stack.length) {
      const frame = stack[stack.length - 1];
      const neighbours = adjacency.get(frame.key) || [];
      if (frame.next < neighbours.length) {
        const next = neighbours[frame.next];
        frame.next += 1;
        const position = order.get(next);
        if (position == null) continue;
        if (color[position] === 1) {
          const at = path.indexOf(next);
          if (at >= 0) {
            const cycle = path.slice(at).concat(next);
            const signature = [...cycle].sort().join('|');
            if (!seenCycle.has(signature)) {
              seenCycle.add(signature);
              cycles.push({ signature, nodes: cycle.map(labelOf) });
            }
          }
        } else if (color[position] === 0) {
          color[position] = 1;
          path.push(next);
          stack.push({ key: next, next: 0 });
        }
      } else {
        color[order.get(frame.key)] = 2;
        stack.pop();
        path.pop();
      }
    }
  }

  const allNodes = [...nodes.values()];
  const mostReferenced = allNodes
    .filter((node) => node.incoming > 0)
    .sort((a, b) => b.incoming - a.incoming || labelOf(a.id).localeCompare(labelOf(b.id)))
    .slice(0, 20)
    .map((node) => ({ id: node.id, label: labelOf(node.id), incoming: node.incoming, outgoing: node.outgoing, rows: node.rows }));
  const isolated = allNodes
    .filter((node) => node.known && node.incoming === 0 && node.outgoing === 0)
    .sort((a, b) => b.sizeBytes - a.sizeBytes)
    .slice(0, 30)
    .map((node) => ({ id: node.id, label: labelOf(node.id), rows: node.rows, sizeBytes: node.sizeBytes }));

  return {
    supported: true,
    nodes: allNodes.slice(0, 500).map((node) => ({ ...node, label: labelOf(node.id) })),
    edges: edges.slice(0, 200),
    cycles: cycles.slice(0, 20),
    mostReferenced,
    isolated,
    stats: {
      tables: allNodes.filter((node) => node.known).length,
      edges: edges.length,
      external: allNodes.filter((node) => !node.known).length,
      cycles: cycles.length,
      isolated: isolated.length,
    },
  };
}

function analyzeWorkloads(metrics = {}) {
  const running = Array.isArray(metrics.longRunning) ? metrics.longRunning : [];
  const processes = Array.isArray(metrics.processes) ? metrics.processes : [];
  const clients = Array.isArray(metrics.clients) ? metrics.clients : [];
  const slow = Array.isArray(metrics.slowQueries) ? metrics.slowQueries
    : Array.isArray(metrics.slowQueryList) ? metrics.slowQueryList : [];
  const rows = (running.length ? running : processes).map((entry) => ({
    id: String(entry.pid || entry.id || entry.username || ''),
    user: clean(entry.usename || entry.username || entry.user || '', 120),
    state: clean(entry.state || entry.command || '', 80),
    seconds: num(entry.seconds ?? entry.time) ?? null,
    wait: clean([entry.wait_event_type, entry.wait_event].filter(Boolean).join(' / '), 120),
    blockedBy: Number(entry.blocked_by) || 0,
    query: clean(entry.query || entry.info || '', 300),
    database: clean(entry.database || entry.db || '', 120),
  }));
  const findings = [];
  const blocked = rows.filter((row) => row.blockedBy > 0);
  for (const row of blocked.slice(0, 10)) {
    findings.push(finding('workloads', 'critical', 'Statement is blocked', row.query || `Session ${row.id}`, {
      id: `db-blocked-${row.id}`, evidence: `${row.blockedBy} blocking session(s), waiting ${Math.round(row.seconds || 0)}s`,
      action: 'Investigate the blocking transaction before cancelling anything.',
    }));
  }
  for (const row of rows.filter((entry) => (entry.seconds || 0) >= 30).slice(0, 10)) {
    findings.push(finding('workloads', 'warning', 'Long-running statement', row.query || `Session ${row.id}`, {
      id: `db-long-${row.id}`, evidence: `${Math.round(row.seconds)}s by ${row.user || 'unknown user'}`,
    }));
  }
  if (Number(metrics.idleInTransaction) > 0) {
    findings.push(finding('workloads', 'warning', 'Idle transactions hold locks', `${metrics.idleInTransaction} session(s)`, {
      id: 'db-idle-tx', evidence: 'Idle in transaction',
    }));
  }
  const topSlow = slow.slice(0, 12).map((entry) => ({
    query: clean(entry.query || entry.digest_text || entry.command || '', 300),
    calls: num(entry.calls),
    meanMs: num(entry.mean_ms ?? entry.total_ms ?? entry.durationUs / 1000),
    rows: num(entry.rows ?? entry.rows_examined),
  })).filter((entry) => entry.query);
  return {
    available: Boolean(running.length || processes.length || clients.length || slow.length || num(metrics.activeConnections) != null),
    rows: rows.slice(0, 60),
    clients: clients.slice(0, 40).map((client) => ({
      id: clean(client.id || client.addr || '', 80),
      name: clean(client.name || client.addr || client.laddr || '', 160),
      age: num(client.age), idle: num(client.idle), db: clean(client.db || '', 120),
      command: clean(client.cmd || client.command || '', 60),
    })),
    slow: topSlow,
    states: Array.isArray(metrics.states) ? metrics.states.map((state) => ({ state: clean(state.state, 60), count: num(state.count) })) : [],
    findings: sortFindings(findings).slice(0, 40),
    limitations: metrics.available === false ? [metrics.reason || 'This engine does not expose session data.'] : [],
  };
}

async function databaseForecast({ queryMetrics, resource, thresholds = {} } = {}) {
  if (typeof queryMetrics !== 'function') {
    return { supported: false, series: [], limitations: ['The metrics store is not available.'] };
  }
  const now = Date.now();
  const definitions = [
    { name: 'database.connections.usage', label: 'Connection usage', unit: 'percent', threshold: clamp(thresholds.connections || 85, 1, 100) },
    { name: 'database.cache.hit_ratio', label: 'Cache hit ratio', unit: 'percent', threshold: 90, direction: 'below' },
    { name: 'database.size.bytes', label: 'Database size', unit: 'bytes', threshold: null },
    { name: 'database.long_running', label: 'Long-running statements', unit: 'count', threshold: 5 },
  ];
  const series = [];
  const limitations = [];
  for (const def of definitions) {
    let result;
    try {
      result = await queryMetrics({
        names: [def.name], resource, from: now - 24 * 3600e3, to: now,
        step: 5 * 60e3, aggregation: 'max', limit: 5,
      });
    } catch (error) {
      limitations.push(`${def.label}: ${clean(error.message, 200)}`);
      continue;
    }
    if (!result?.ok) { limitations.push(`${def.label} could not be queried.`); continue; }
    const points = (result.series || []).flatMap((entry) => entry.points || []).sort((a, b) => a[0] - b[0]);
    if (points.length < 6) { limitations.push(`${def.label}: not enough samples yet.`); continue; }
    const observed = points.length;
    if (def.direction === 'below') {
      const below = points.filter((point) => point[1] < def.threshold).length;
      series.push({
        name: def.name, label: def.label, unit: def.unit, threshold: def.threshold,
        current: points[points.length - 1][1], observed, breach: below > 0 ? (below / observed) * 100 : 0,
        trend: points[points.length - 1][1] - points[0][1], forecast: null,
        note: below ? `${below} of ${observed} samples were below ${def.threshold}%.` : `Stayed above ${def.threshold}% in every sample.`,
      });
      continue;
    }
    const predicted = forecast(points, { horizonMs: 24 * 3600e3 });
    const eta = def.threshold == null ? null : timeToThreshold(points, def.threshold, { horizonMs: 30 * 24 * 3600e3 });
    series.push({
      name: def.name, label: def.label, unit: def.unit, threshold: def.threshold,
      current: points[points.length - 1][1], observed,
      trend: predicted.ok ? predicted.slopePerHour : null,
      forecast: predicted.ok ? { at24h: predicted.points[Math.min(predicted.points.length - 1, 24)]?.v ?? null, confidence: predicted.confidence, method: predicted.method } : null,
      breachAt: eta?.reachable && !eta.alreadyReached ? new Date(eta.at).toISOString() : null,
      breached: eta?.alreadyReached === true,
      note: predicted.ok ? predicted.confidenceNote : predicted.reason,
    });
  }
  return { supported: series.length > 0, series, limitations };
}

// -------------------------------------------------------------------- docker

function parseCpu(value) {
  const text = String(value == null ? '' : value).trim();
  if (!text) return null;
  const match = text.match(/^([0-9.]+)\s*(n|u|m)?$/i);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const unit = (match[2] || '').toLowerCase();
  if (unit === 'n') return n / 1e9;
  if (unit === 'u') return n / 1e6;
  if (unit === 'm') return n / 1000;
  return n;
}

function inspectSecurity(inspect) {
  const item = inspect?.item || inspect;
  if (!item) return null;
  const security = item.security || {};
  const mounts = Array.isArray(item.mounts) ? item.mounts : [];
  const env = Array.isArray(item.env) ? item.env : [];
  const labels = item.labels || {};
  const issues = [];
  if (security.privileged) issues.push({ severity: 'critical', title: 'Privileged container', detail: 'The container has all host capabilities and can escape the runtime boundary.' });
  if (/^host$/i.test(security.networkMode || '')) issues.push({ severity: 'critical', title: 'Host network', detail: 'The container shares the host network namespace.' });
  if (/^host$/i.test(security.pidMode || '')) issues.push({ severity: 'critical', title: 'Host PID namespace', detail: 'The container can see and signal host processes.' });
  if (/^host$/i.test(security.ipcMode || '')) issues.push({ severity: 'warning', title: 'Host IPC namespace', detail: 'The container shares host shared memory.' });
  if (mounts.some((mount) => /docker\.sock|containerd\.sock|\/var\/run\/docker/i.test(String(mount.source || mount.Source || '')))) {
    issues.push({ severity: 'critical', title: 'Container runtime socket mounted', detail: 'A process inside the container can control the Docker engine.' });
  }
  if (mounts.some((mount) => /(^|\/)(proc|sys|dev)$/i.test(String(mount.destination || mount.Destination || '').replace(/\/$/, '')))) {
    issues.push({ severity: 'warning', title: 'Sensitive host path mounted', detail: 'A pseudo-filesystem or device directory from the host is exposed.' });
  }
  if (!security.user || /^0$|^root(?::|$)/i.test(security.user)) {
    issues.push({ severity: 'warning', title: 'Runs as root', detail: 'No non-root user is configured (empty user means root).' });
  }
  if (!security.readonlyRootfs) {
    issues.push({ severity: 'info', title: 'Writable root filesystem', detail: 'A read-only root filesystem limits tampering after compromise.' });
  }
  const added = (security.capAdd || []).filter((cap) => !/^(NET_BIND_SERVICE|CHOWN|SETUID|SETGID)$/i.test(cap));
  if (added.length) {
    issues.push({ severity: 'warning', title: 'Extra Linux capabilities', detail: `cap_add: ${added.join(', ')}` });
  }
  if (security.devices > 0) {
    issues.push({ severity: 'warning', title: 'Host devices passed through', detail: `${security.devices} device(s) are exposed to the container.` });
  }
  if (!security.noNewPrivileges && !security.privileged) {
    issues.push({ severity: 'info', title: 'No no-new-privileges option', detail: 'Set security_opt: no-new-privileges:true unless the workload needs setuid binaries.' });
  }
  const sensitiveKeys = env.filter((entry) => entry.sensitive).map((entry) => entry.key);
  if (sensitiveKeys.length) {
    issues.push({ severity: 'info', title: 'Secrets in environment variables', detail: `${sensitiveKeys.slice(0, 8).join(', ')} are configured inline; values are masked.` });
  }
  const composeConfig = labels['com.docker.compose.project.config_files'] || '';
  return {
    id: item.id, name: item.name, image: item.image, project: labels['com.docker.compose.project'] || '',
    service: labels['com.docker.compose.service'] || '', composeConfig,
    issues,
    score: 100 - issues.reduce((sum, issue) => sum + (issue.severity === 'critical' ? 35 : issue.severity === 'warning' ? 15 : 5), 0),
  };
}

function analyzeDockerSecurity(inspects = []) {
  const rows = (Array.isArray(inspects) ? inspects : []).map(inspectSecurity).filter(Boolean);
  const findings = [];
  for (const row of rows) {
    for (const issue of row.issues.filter((entry) => entry.severity !== 'info')) {
      findings.push(finding('security', issue.severity, issue.title, `${row.name}: ${issue.detail}`, {
        id: `docker-sec-${row.id}-${issue.title}`, resource: row.name,
        evidence: row.image, href: '#/containers',
        action: issue.severity === 'critical' ? 'Review this container before exposing it to untrusted traffic.' : 'Harden the container definition.',
      }));
    }
  }
  const grade = (score) => (score >= 90 ? 'A' : score >= 75 ? 'B' : score >= 60 ? 'C' : score >= 40 ? 'D' : 'F');
  return {
    available: rows.length > 0,
    containers: rows.map((row) => ({ ...row, grade: grade(clamp(row.score, 0, 100)) })).sort((a, b) => a.score - b.score),
    findings: sortFindings(findings).slice(0, 80),
    stats: {
      inspected: rows.length,
      critical: findings.filter((entry) => entry.severity === 'critical').length,
      warning: findings.filter((entry) => entry.severity === 'warning').length,
      averageScore: rows.length ? Math.round(mean(rows.map((row) => row.score))) : null,
    },
  };
}

function analyzeDockerImages(images = [], containers = []) {
  const list = Array.isArray(images) ? images : [];
  const used = new Set();
  for (const container of Array.isArray(containers) ? containers : []) {
    if (container.image) used.add(String(container.image));
    if (container.imageId) used.add(String(container.imageId));
  }
  const parseSize = (value) => {
    const text = String(value || '').trim();
    const match = text.match(/^([0-9.]+)\s*([KMGTP]?B)$/i);
    if (!match) return 0;
    const units = { B: 1, KB: 1024, MB: 1024 ** 2, GB: 1024 ** 3, TB: 1024 ** 4, PB: 1024 ** 5 };
    return Number(match[1]) * (units[match[2].toUpperCase()] || 1);
  };
  const dangling = list.filter((image) => image.dangling);
  const latest = list.filter((image) => /:latest$/.test(String(image.name || '')) || image.tag === 'latest');
  const unused = list.filter((image) => !image.dangling && !used.has(image.name) && !used.has(image.id));
  const findings = [];
  if (dangling.length) {
    findings.push(finding('images', 'warning', 'Dangling images', `${dangling.length} image layer set(s) have no tag`, {
      id: 'docker-dangling', evidence: formatBytes(dangling.reduce((sum, image) => sum + parseSize(image.size), 0)),
      action: 'Prune them from the Images page when no build depends on the cache.', href: '#/images',
    }));
  }
  for (const image of latest.slice(0, 10)) {
    findings.push(finding('images', 'info', 'Mutable latest tag', image.name, {
      id: `docker-latest-${image.id}`, resource: image.name, evidence: image.size,
      action: 'Pin a digest or a semantic version so deployments are reproducible.', href: '#/images',
    }));
  }
  if (unused.length) {
    findings.push(finding('images', 'info', 'Images not used by a container', `${unused.length} image(s)`, {
      id: 'docker-unused-images', evidence: unused.slice(0, 6).map((image) => image.name).join(', '),
      action: 'Review before removing; a stopped container or a build may still reference them.', href: '#/images',
    }));
  }
  return {
    total: list.length,
    dangling: dangling.length,
    latest: latest.length,
    unused: unused.length,
    totalSize: list.reduce((sum, image) => sum + parseSize(image.uniqueSize || image.size), 0),
    rows: list.slice(0, 100).map((image) => ({ id: image.id, name: image.name, size: image.size, dangling: image.dangling, containers: image.containers })),
    findings: sortFindings(findings).slice(0, 40),
  };
}

function analyzeDockerResources({ volumes = [], networks = [], containers = [], stats = [] } = {}) {
  const volumeRows = Array.isArray(volumes) ? volumes : [];
  const networkRows = Array.isArray(networks) ? networks : [];
  const containerRows = Array.isArray(containers) ? containers : [];
  const statRows = Array.isArray(stats) ? stats : [];
  const usedVolumes = new Set();
  const usedNetworks = new Set();
  for (const container of containerRows) {
    for (const mount of String(container.mounts || '').split(',')) {
      const source = mount.trim().split(':')[0];
      if (source && !source.startsWith('/') && !/^[A-Za-z]:[\\/]/.test(source)) usedVolumes.add(source);
    }
    for (const network of container.networks || []) usedNetworks.add(network);
  }
  const unusedVolumes = volumeRows.filter((volume) => !usedVolumes.has(volume.name));
  const builtInNetworks = new Set(['bridge', 'host', 'none']);
  const unusedNetworks = networkRows.filter((network) => !builtInNetworks.has(network.name) && !usedNetworks.has(network.name));
  const findings = [];
  if (unusedVolumes.length) {
    findings.push(finding('resources', 'info', 'Volumes not mounted by any container', `${unusedVolumes.length} volume(s)`, {
      id: 'docker-unused-volumes', evidence: unusedVolumes.slice(0, 6).map((volume) => volume.name).join(', '),
      action: 'Verify the data before deleting a volume; Docker cannot restore it.', href: '#/volumes',
    }));
  }
  if (unusedNetworks.length) {
    findings.push(finding('resources', 'info', 'Networks without endpoints', `${unusedNetworks.length} user-defined network(s)`, {
      id: 'docker-unused-networks', evidence: unusedNetworks.slice(0, 6).map((network) => network.name).join(', '),
      href: '#/networks',
    }));
  }
  const hot = statRows
    .map((row) => ({
      name: clean(row.name || row.id, 120),
      cpu: num(row.cpuPercent ?? row.cpu),
      memory: num(row.memoryPercent ?? row.mem),
    }))
    .filter((row) => (row.cpu || 0) >= 80 || (row.memory || 0) >= 85);
  for (const row of hot.slice(0, 10)) {
    findings.push(finding('resources', row.cpu >= 90 || row.memory >= 95 ? 'warning' : 'info', 'Resource pressure', row.name, {
      id: `docker-pressure-${row.name}`, resource: row.name,
      evidence: `${row.cpu != null ? `${row.cpu}% CPU` : ''}${row.cpu != null && row.memory != null ? ' · ' : ''}${row.memory != null ? `${row.memory}% memory` : ''}`,
      href: '#/monitoring',
    }));
  }
  return {
    volumes: {
      total: volumeRows.length, unused: unusedVolumes.length,
      rows: volumeRows.slice(0, 100).map((volume) => ({ name: volume.name, driver: volume.driver, mountpoint: volume.mountpoint, size: volume.size, containers: volume.containers })),
    },
    networks: {
      total: networkRows.length, unused: unusedNetworks.length,
      rows: networkRows.slice(0, 100).map((network) => ({ name: network.name, driver: network.driver, scope: network.scope, subnet: network.subnet, containers: network.containers })),
    },
    findings: sortFindings(findings).slice(0, 40),
  };
}

function analyzeDockerCompose(projects = []) {
  const list = Array.isArray(projects) ? projects : [];
  const findings = [];
  const rows = [];
  for (const project of list) {
    const status = String(project.status || '');
    const runningMatch = /running\((\d+)\)/i.exec(status);
    const exitedMatch = /exited\((\d+)\)/i.exec(status);
    const running = num(project.running) ?? (runningMatch ? Number(runningMatch[1]) : null);
    const exited = num(project.exited) ?? (exitedMatch ? Number(exitedMatch[1]) : null);
    const total = num(project.containers) ?? num(project.total)
      ?? (running != null || exited != null ? (running || 0) + (exited || 0) : null);
    const configFiles = project.configFiles || (Array.isArray(project.files) ? project.files.join(', ') : '');
    if (total > 0 && running != null && running < total) {
      findings.push(finding('compose', 'warning', 'Compose project is partially down', project.name, {
        id: `docker-compose-${project.name}`, resource: project.name,
        evidence: `${running} of ${total} container(s) running`, href: '#/compose',
      }));
    }
    rows.push({
      name: project.name, status, configFiles,
      containers: total, running, services: num(project.services),
    });
  }
  return {
    total: list.length,
    projects: rows.slice(0, 100),
    findings: sortFindings(findings),
  };
}

function analyzeDockerOptimizer({ containers = [], inspects = [], images = [], volumes = [], stats = [] } = {}) {
  const containerRows = Array.isArray(containers) ? containers : [];
  const inspectRows = (Array.isArray(inspects) ? inspects : []).map((entry) => entry?.item || entry).filter(Boolean);
  const statRows = Array.isArray(stats) ? stats : [];
  const findings = [];
  let memoryWithoutLimit = 0;
  let cpuWithoutLimit = 0;
  const restarting = containerRows.filter((container) => /restart/i.test(String(container.status || container.state || '')));
  for (const item of inspectRows) {
    if (!item.resources?.memory) {
      memoryWithoutLimit += 1;
      findings.push(finding('optimizer', 'info', 'No memory limit', item.name, {
        id: `docker-mem-${item.id}`, resource: item.name,
        action: 'Set --memory so one container cannot exhaust the host.', href: '#/containers',
      }));
    }
    if (!item.resources?.nanoCpus && !item.resources?.cpuShares) {
      cpuWithoutLimit += 1;
      findings.push(finding('optimizer', 'info', 'No CPU limit', item.name, {
        id: `docker-cpu-${item.id}`, resource: item.name,
        action: 'Set --cpus for predictable scheduling.', href: '#/containers',
      }));
    }
    if (item.restartPolicy?.Name === 'no' || !item.restartPolicy?.Name) {
      findings.push(finding('optimizer', 'info', 'No restart policy', item.name, {
        id: `docker-restart-${item.id}`, resource: item.name,
        action: 'Use unless-stopped for long-running services.', href: '#/containers',
      }));
    }
  }
  for (const container of restarting.slice(0, 10)) {
    findings.push(finding('optimizer', 'warning', 'Container is restarting', clean(container.name || container.id, 120), {
      id: `docker-restarting-${container.id}`, resource: container.name,
      evidence: clean(container.status, 200), href: '#/containers',
      action: 'Read the logs; a restart loop usually hides a startup dependency or a failing probe.',
    }));
  }
  const idle = statRows.filter((row) => (num(row.cpu) || 0) < 1 && (num(row.memory) || 0) < 5);
  if (idle.length >= 3) {
    findings.push(finding('optimizer', 'info', 'Several containers are nearly idle', `${idle.length} container(s)`, {
      id: 'docker-idle', evidence: idle.slice(0, 6).map((row) => row.name || row.id).join(', '),
      action: 'Consider consolidating low-traffic services.', href: '#/monitoring',
    }));
  }
  const imageAnalysis = analyzeDockerImages(images, containerRows);
  return {
    stats: { containers: containerRows.length, inspected: inspectRows.length, memoryWithoutLimit, cpuWithoutLimit, restarting: restarting.length },
    idle: idle.slice(0, 20).map((row) => ({ name: clean(row.name || row.id, 120), cpu: num(row.cpu), memory: num(row.memory) })),
    findings: sortFindings([...findings, ...imageAnalysis.findings.filter((entry) => entry.severity !== 'info')]).slice(0, 60),
  };
}

function compareDockerEnvironments(inspects = []) {
  const rows = (Array.isArray(inspects) ? inspects : []).map((entry) => entry?.item || entry).filter(Boolean);
  const groups = new Map();
  for (const item of rows) {
    const project = item.labels?.['com.docker.compose.project'] || 'no-compose-project';
    if (!groups.has(project)) groups.set(project, []);
    groups.get(project).push(item);
  }
  const projects = [];
  for (const [project, items] of groups) {
    if (items.length < 2) continue;
    const containers = items.map((item) => {
      const env = new Map();
      for (const entry of item.env || []) env.set(entry.key, entry.sensitive ? null : entry.value);
      return {
        name: item.name, service: item.labels?.['com.docker.compose.service'] || item.name,
        image: item.image, env, restartPolicy: item.restartPolicy?.Name || '',
        memoryLimit: item.resources?.memory || 0, mounts: (item.mounts || []).map((mount) => mount.destination || mount.Destination).filter(Boolean),
      };
    });
    const keys = new Set(containers.flatMap((container) => [...container.env.keys()]));
    const differences = [];
    for (const key of keys) {
      const values = containers.map((container) => ({ name: container.name, value: container.env.has(key) ? container.env.get(key) : undefined }));
      const present = values.filter((entry) => entry.value !== undefined);
      const unique = new Set(present.map((entry) => entry.value === null ? '\u0000masked' : entry.value));
      if (present.length !== containers.length || unique.size > 1) {
        differences.push({
          key,
          missingFrom: containers.filter((container) => !container.env.has(key)).map((container) => container.name),
          values: values.map((entry) => ({ name: entry.name, value: entry.value === null ? '••••' : clean(entry.value, 120) })),
        });
      }
    }
    projects.push({
      name: project,
      containers: containers.map((container) => ({
        name: container.name, service: container.service, image: container.image,
        envCount: container.env.size, memoryLimit: container.memoryLimit,
        restartPolicy: container.restartPolicy, mounts: container.mounts,
      })),
      differences: differences.slice(0, 60),
      images: [...new Set(containers.map((container) => container.image))],
      restartPolicies: [...new Set(containers.map((container) => container.restartPolicy || 'none'))],
    });
  }
  return {
    available: projects.length > 0,
    projects,
    findings: projects.flatMap((project) => (project.differences.length
      ? [finding('env-compare', 'info', 'Configuration differs between services', project.name, {
        id: `docker-env-${project.name}`, resource: project.name,
        evidence: project.differences.slice(0, 6).map((entry) => entry.key).join(', '), href: '#/compose',
      })]
      : [])),
    limitations: projects.length ? [] : ['At least two running containers from the same Compose project are needed to compare environments.'],
  };
}

// ---------------------------------------------------------------- kubernetes

function parseQuantity(value) {
  if (value == null || value === '') return null;
  const text = String(value).trim();
  const match = text.match(/^([0-9.]+)\s*([a-zA-Z]*)$/);
  if (!match) return null;
  const n = Number(match[1]);
  if (!Number.isFinite(n)) return null;
  const suffix = match[2];
  const binary = { Ki: 1024, Mi: 1024 ** 2, Gi: 1024 ** 3, Ti: 1024 ** 4, Pi: 1024 ** 5 };
  const decimal = { n: 1e-9, u: 1e-6, m: 1e-3, '': 1, k: 1e3, K: 1e3, M: 1e6, G: 1e9, T: 1e12, P: 1e15 };
  if (binary[suffix]) return n * binary[suffix];
  if (decimal[suffix] != null) return n * decimal[suffix];
  const number = Number(text);
  return Number.isFinite(number) ? number : null;
}

function podNamespace(pod) { return String(pod?.metadata?.namespace || ''); }
function podName(pod) { return String(pod?.metadata?.name || ''); }

function podIssue(pod) {
  const status = pod?.status || {};
  const containerStatuses = Array.isArray(status.containerStatuses) ? status.containerStatuses : [];
  const initStatuses = Array.isArray(status.initContainerStatuses) ? status.initContainerStatuses : [];
  const all = [...containerStatuses, ...initStatuses];
  const waiting = all.map((entry) => entry.state?.waiting).filter(Boolean);
  const crash = waiting.find((entry) => /crashloopbackoff|imagepullbackoff|errimagepull|createcontainerconfigerror|runcontainererror/i.test(String(entry.reason || '')));
  if (crash) return { severity: /crashloop/i.test(crash.reason) ? 'critical' : 'warning', reason: String(crash.reason), detail: clean(crash.message, 300) };
  if (status.phase === 'Failed') return { severity: 'critical', reason: 'Failed', detail: clean(status.message || status.reason, 300) };
  if (status.phase === 'Pending') return { severity: 'warning', reason: 'Pending', detail: clean(status.message || status.reason, 300) };
  const notReady = containerStatuses.filter((entry) => entry.ready !== true);
  if (notReady.length) {
    return { severity: 'warning', reason: 'NotReady', detail: `${notReady.length} container(s) are not ready` };
  }
  return null;
}

function analyzeKubernetesHealth({ pods = [], nodes = [], deployments = [], statefulsets = [], daemonsets = [], jobs = [] } = {}) {
  const findings = [];
  const podRows = Array.isArray(pods) ? pods : [];
  const nodeRows = Array.isArray(nodes) ? nodes : [];
  const deploymentsRows = Array.isArray(deployments) ? deployments : [];
  const nodeReady = nodeRows.map((node) => {
    const conditions = Array.isArray(node.status?.conditions) ? node.status.conditions : [];
    const ready = conditions.find((condition) => condition.type === 'Ready');
    return {
      name: node.metadata?.name || '', ready: ready?.status === 'True',
      reason: clean(ready?.reason, 160), message: clean(ready?.message, 300),
      roles: Object.keys(node.metadata?.labels || {}).filter((key) => key.startsWith('node-role.kubernetes.io/')).map((key) => key.split('/')[1]),
      cpu: parseQuantity(node.status?.allocatable?.cpu), memory: parseQuantity(node.status?.allocatable?.memory),
    };
  });
  for (const node of nodeReady.filter((entry) => !entry.ready)) {
    findings.push(finding('health', 'critical', 'Node is not ready', node.name, {
      id: `k8s-node-${node.name}`, resource: node.name, evidence: node.message || node.reason || 'Ready condition is not True',
      href: '#/kubernetes/nodes',
    }));
  }
  const podProblems = [];
  for (const pod of podRows) {
    const issue = podIssue(pod);
    if (!issue) continue;
    const restarts = (pod.status?.containerStatuses || []).reduce((sum, entry) => sum + (Number(entry.restartCount) || 0), 0);
    podProblems.push({ name: podName(pod), namespace: podNamespace(pod), ...issue, restarts });
    findings.push(finding('health', issue.severity, `Pod ${issue.reason}`, `${podNamespace(pod)}/${podName(pod)}`, {
      id: `k8s-pod-${podNamespace(pod)}-${podName(pod)}`, resource: podName(pod), evidence: issue.detail || `${restarts} restart(s)`,
      href: '#/kubernetes/pods',
      action: issue.reason === 'Pending' ? 'Check node capacity, taints and the pod events.' : 'Open the pod events and previous logs.',
    }));
  }
  for (const deployment of deploymentsRows) {
    const desired = num(deployment.spec?.replicas) ?? 0;
    const available = num(deployment.status?.availableReplicas) ?? 0;
    if (desired > 0 && available < desired) {
      findings.push(finding('health', 'warning', 'Deployment is unavailable', `${podNamespace(deployment)}/${deployment.metadata?.name}`, {
        id: `k8s-deploy-${podNamespace(deployment)}-${deployment.metadata?.name}`,
        resource: deployment.metadata?.name, evidence: `${available} of ${desired} replica(s) available`,
        href: '#/kubernetes/deployments',
      }));
    }
  }
  for (const job of Array.isArray(jobs) ? jobs : []) {
    const failed = num(job.status?.failed) ?? 0;
    if (failed > 0) {
      findings.push(finding('health', 'warning', 'Job has failed pods', `${podNamespace(job)}/${job.metadata?.name}`, {
        id: `k8s-job-${podNamespace(job)}-${job.metadata?.name}`, evidence: `${failed} failed attempt(s)`,
        href: '#/kubernetes/jobs',
      }));
    }
  }
  const readyCount = nodeReady.filter((entry) => entry.ready).length;
  return {
    nodes: nodeReady,
    pods: { total: podRows.length, problems: podProblems.length, restarts: podProblems.reduce((sum, pod) => sum + pod.restarts, 0) },
    workloads: {
      deployments: deploymentsRows.length,
      unavailable: findings.filter((entry) => entry.id.startsWith('k8s-deploy-')).length,
      statefulsets: (statefulsets || []).length,
      daemonsets: (daemonsets || []).length,
      jobs: (jobs || []).length,
    },
    health: {
      nodesReady: readyCount, nodesTotal: nodeRows.length,
      podsRunning: podRows.filter((pod) => pod.status?.phase === 'Running').length,
      podsTotal: podRows.length,
    },
    findings: sortFindings(findings).slice(0, 100),
  };
}

function analyzeKubernetesSecurity({ pods = [], clusterRoleBindings = [], serviceAccounts = [] } = {}) {
  const findings = [];
  const podRows = Array.isArray(pods) ? pods : [];
  const rows = [];
  for (const pod of podRows) {
    const spec = pod.spec || {};
    const podSecurity = spec.securityContext || {};
    const containers = Array.isArray(spec.containers) ? spec.containers : [];
    const hostPath = (spec.volumes || []).filter((volume) => volume.hostPath).map((volume) => volume.hostPath.path);
    const added = containers.flatMap((container) => container.securityContext?.capabilities?.add || []);
    const privileged = containers.filter((container) => container.securityContext?.privileged === true).map((container) => container.name);
    const noLimits = containers.filter((container) => !container.resources?.limits).map((container) => container.name);
    const issues = [];
    if (spec.hostNetwork) issues.push({ severity: 'warning', title: 'Pod uses host network' });
    if (spec.hostPID) issues.push({ severity: 'warning', title: 'Pod uses host PID' });
    if (spec.hostIPC) issues.push({ severity: 'warning', title: 'Pod uses host IPC' });
    if (privileged.length) issues.push({ severity: 'critical', title: `Privileged container: ${privileged.join(', ')}` });
    if (hostPath.length) issues.push({ severity: 'warning', title: `hostPath volume: ${hostPath.slice(0, 3).join(', ')}` });
    if (added.length) issues.push({ severity: 'warning', title: `Added capabilities: ${added.slice(0, 6).join(', ')}` });
    if (podSecurity.runAsNonRoot !== true && !containers.some((container) => container.securityContext?.runAsNonRoot === true)) {
      issues.push({ severity: 'info', title: 'Pod may run as root' });
    }
    if (containers.some((container) => container.securityContext?.allowPrivilegeEscalation !== false)) {
      issues.push({ severity: 'info', title: 'Privilege escalation is not disabled' });
    }
    if (spec.automountServiceAccountToken !== false) {
      issues.push({ severity: 'info', title: 'Service account token is mounted' });
    }
    if (noLimits.length) issues.push({ severity: 'info', title: `${noLimits.length} container(s) have no limits` });
    if (!issues.length) continue;
    const namespace = podNamespace(pod);
    const name = podName(pod);
    rows.push({ name, namespace, issues, privileged: privileged.length > 0, hostPath: hostPath.length });
    for (const issue of issues.filter((entry) => entry.severity !== 'info')) {
      findings.push(finding('security', issue.severity, issue.title, `${namespace}/${name}`, {
        id: `k8s-sec-${namespace}-${name}-${issue.title}`, resource: name, evidence: clean(issue.title, 300),
        href: '#/kubernetes/pods', action: 'Apply the restricted Pod Security Standard where possible.',
      }));
    }
  }
  const clusterAdmins = (Array.isArray(clusterRoleBindings) ? clusterRoleBindings : []).filter((binding) => /^cluster-admin$/i.test(String(binding.roleRef?.name || '')));
  for (const binding of clusterAdmins) {
    const subjects = (binding.subjects || []).map((subject) => `${subject.kind}/${subject.namespace ? `${subject.namespace}/` : ''}${subject.name}`).join(', ');
    findings.push(finding('security', 'critical', 'cluster-admin binding', binding.metadata?.name || 'binding', {
      id: `k8s-rbac-${binding.metadata?.name}`, evidence: subjects || 'no subjects',
      action: 'Replace with a narrowly scoped role unless this is a break-glass identity.',
    }));
  }
  const automount = (Array.isArray(serviceAccounts) ? serviceAccounts : []).filter((account) => account.automountServiceAccountToken !== false);
  return {
    pods: rows.slice(0, 100),
    stats: {
      podsInspected: podRows.length, podsWithIssues: rows.length,
      privileged: rows.filter((row) => row.privileged).length,
      hostPath: rows.filter((row) => row.hostPath).length,
      clusterAdminBindings: clusterAdmins.length,
      serviceAccountsWithToken: automount.length,
    },
    findings: sortFindings(findings).slice(0, 100),
  };
}

function analyzeKubernetesStorage({ pvcs = [], pvs = [], storageClasses = [] } = {}) {
  const findings = [];
  const claims = Array.isArray(pvcs) ? pvcs : [];
  const volumes = Array.isArray(pvs) ? pvs : [];
  const classes = Array.isArray(storageClasses) ? storageClasses : [];
  const defaultClass = classes.find((item) => item.metadata?.annotations?.['storageclass.kubernetes.io/is-default-class'] === 'true'
    || item.metadata?.annotations?.['storageclass.beta.kubernetes.io/is-default-class'] === 'true');
  if (classes.length && !defaultClass) {
    findings.push(finding('storage', 'warning', 'No default StorageClass', `${classes.length} class(es) exist`, {
      id: 'k8s-default-storageclass', evidence: classes.map((item) => item.metadata?.name).join(', '),
      action: 'A claim without storageClassName will stay Pending.', href: '#/kubernetes/storageclasses',
    }));
  }
  for (const claim of claims) {
    const phase = claim.status?.phase || 'Unknown';
    if (phase !== 'Bound') {
      findings.push(finding('storage', phase === 'Pending' ? 'warning' : 'warning', `PVC is ${phase}`, `${podNamespace(claim)}/${claim.metadata?.name}`, {
        id: `k8s-pvc-${podNamespace(claim)}-${claim.metadata?.name}`, evidence: claim.spec?.storageClassName || 'no storage class',
        href: '#/kubernetes/persistentvolumeclaims',
      }));
    }
  }
  for (const volume of volumes) {
    const phase = volume.status?.phase || 'Unknown';
    if (phase === 'Failed' || phase === 'Released' || phase === 'Available') {
      findings.push(finding('storage', phase === 'Failed' ? 'warning' : 'info', `Persistent volume is ${phase}`, volume.metadata?.name, {
        id: `k8s-pv-${volume.metadata?.name}`, evidence: `${volume.spec?.capacity?.storage || ''} ${volume.spec?.reclaimPolicy || ''}`.trim(),
        href: '#/kubernetes/persistentvolumes',
      }));
    }
  }
  const capacity = claims.reduce((sum, claim) => sum + (parseQuantity(claim.status?.capacity?.storage || claim.spec?.resources?.requests?.storage) || 0), 0);
  return {
    claims: claims.length,
    volumes: volumes.length,
    storageClasses: classes.length,
    defaultClass: defaultClass?.metadata?.name || '',
    provisionedBytes: capacity,
    rows: claims.slice(0, 100).map((claim) => ({
      name: claim.metadata?.name, namespace: podNamespace(claim), phase: claim.status?.phase || '',
      className: claim.spec?.storageClassName || '', requested: claim.spec?.resources?.requests?.storage || '',
      capacity: claim.status?.capacity?.storage || '',
    })),
    findings: sortFindings(findings).slice(0, 60),
  };
}

function analyzeKubernetesNetwork({ services = [], ingresses = [], networkPolicies = [], endpoints = [] } = {}) {
  const findings = [];
  const serviceRows = Array.isArray(services) ? services : [];
  const ingressRows = Array.isArray(ingresses) ? ingresses : [];
  const policies = Array.isArray(networkPolicies) ? networkPolicies : [];
  const endpointRows = Array.isArray(endpoints) ? endpoints : [];
  const readyEndpoints = new Set();
  for (const endpoint of endpointRows) {
    for (const subset of endpoint.subsets || []) {
      if ((subset.addresses || []).length) readyEndpoints.add(`${podNamespace(endpoint)}/${endpoint.metadata?.name}`);
    }
  }
  for (const service of serviceRows) {
    const selector = service.spec?.selector;
    if (selector && Object.keys(selector).length) {
      const key = `${podNamespace(service)}/${service.metadata?.name}`;
      if (!readyEndpoints.has(key)) {
        findings.push(finding('network', 'warning', 'Service has no ready endpoints', key, {
          id: `k8s-svc-${key}`, evidence: `selector ${Object.entries(selector).map(([k, v]) => `${k}=${v}`).join(', ')}`,
          href: '#/kubernetes/services',
          action: 'Check that a ready pod matches the selector and the target port.',
        }));
      }
    }
  }
  for (const ingress of ingressRows) {
    const name = `${podNamespace(ingress)}/${ingress.metadata?.name}`;
    if (!(ingress.spec?.tls || []).length) {
      findings.push(finding('network', 'info', 'Ingress has no TLS', name, {
        id: `k8s-ing-${name}`, href: '#/kubernetes/ingresses',
        evidence: (ingress.spec?.rules || []).flatMap((rule) => rule.host || []).join(', '),
      }));
    }
  }
  const namespaces = new Set(serviceRows.map((service) => podNamespace(service)));
  const covered = new Set(policies.map((policy) => podNamespace(policy)));
  const uncovered = [...namespaces].filter((namespace) => namespace && !covered.has(namespace));
  if (uncovered.length) {
    findings.push(finding('network', 'info', 'Namespaces without a network policy', `${uncovered.length} namespace(s)`, {
      id: 'k8s-netpol-coverage', evidence: uncovered.slice(0, 8).join(', '), href: '#/kubernetes/networkpolicies',
      action: 'Default-deny ingress/egress and allow only the required flows.',
    }));
  }
  return {
    stats: { services: serviceRows.length, ingresses: ingressRows.length, networkPolicies: policies.length, namespacesWithoutPolicy: uncovered.length },
    services: serviceRows.slice(0, 100).map((service) => ({
      name: service.metadata?.name, namespace: podNamespace(service), type: service.spec?.type || '',
      clusterIP: service.spec?.clusterIP || '', ports: (service.spec?.ports || []).map((port) => `${port.port}${port.protocol ? `/${port.protocol}` : ''}`).join(', '),
      endpoints: readyEndpoints.has(`${podNamespace(service)}/${service.metadata?.name}`),
    })),
    findings: sortFindings(findings).slice(0, 60),
  };
}

function analyzeKubernetesOptimization({ pods = [], deployments = [] } = {}) {
  const findings = [];
  const podRows = Array.isArray(pods) ? pods : [];
  let withoutRequests = 0;
  let withoutLimits = 0;
  let limitsOverRequest = 0;
  const namespaceTotals = {};
  for (const pod of podRows) {
    const namespace = podNamespace(pod) || 'default';
    namespaceTotals[namespace] = namespaceTotals[namespace] || { cpuRequest: 0, memoryRequest: 0, containers: 0 };
    for (const container of pod.spec?.containers || []) {
      namespaceTotals[namespace].containers += 1;
      const requests = container.resources?.requests || {};
      const limits = container.resources?.limits || {};
      if (!requests.cpu && !requests.memory) withoutRequests += 1;
      if (!limits.cpu && !limits.memory) withoutLimits += 1;
      else limitsOverRequest += 1;
      namespaceTotals[namespace].cpuRequest += parseQuantity(requests.cpu) || 0;
      namespaceTotals[namespace].memoryRequest += parseQuantity(requests.memory) || 0;
      const cpuRequest = parseQuantity(requests.cpu);
      const memoryRequest = parseQuantity(requests.memory);
      const cpuLimit = parseQuantity(limits.cpu);
      const memoryLimit = parseQuantity(limits.memory);
      const name = `${namespace}/${podName(pod)}`;
      if (cpuRequest && cpuLimit && cpuLimit / cpuRequest >= 5) {
        findings.push(finding('optimization', 'info', 'CPU limit is far above request', name, {
          id: `k8s-overlimit-cpu-${name}`, evidence: `${cpuRequest} → ${cpuLimit} cores`,
          action: 'A large gap lets this pod starve neighbours during a burst.',
        }));
      }
      if (memoryRequest && memoryLimit && memoryLimit / memoryRequest >= 4) {
        findings.push(finding('optimization', 'info', 'Memory limit is far above request', name, {
          id: `k8s-overlimit-mem-${name}`, evidence: `${formatBytes(memoryRequest)} → ${formatBytes(memoryLimit)}`,
        }));
      }
    }
  }
  for (const deployment of Array.isArray(deployments) ? deployments : []) {
    const containers = deployment.spec?.template?.spec?.containers || [];
    if (containers.some((container) => !container.resources?.requests)) {
      findings.push(finding('optimization', 'info', 'Deployment without requests', `${podNamespace(deployment)}/${deployment.metadata?.name}`, {
        id: `k8s-noreq-${podNamespace(deployment)}-${deployment.metadata?.name}`,
        action: 'The scheduler cannot reserve capacity without requests.',
      }));
    }
    if (containers.some((container) => /:latest$/.test(String(container.image || '')))) {
      findings.push(finding('optimization', 'info', 'Deployment uses latest tag', `${podNamespace(deployment)}/${deployment.metadata?.name}`, {
        id: `k8s-latest-${podNamespace(deployment)}-${deployment.metadata?.name}`, evidence: containers.map((container) => container.image).join(', '),
      }));
    }
  }
  const namespaces = Object.entries(namespaceTotals).map(([namespace, value]) => ({ namespace, ...value }));
  return {
    stats: { containers: namespaces.reduce((sum, entry) => sum + entry.containers, 0), withoutRequests, withoutLimits, namespaces: namespaces.length },
    namespaces: namespaces.sort((a, b) => b.memoryRequest - a.memoryRequest).slice(0, 60),
    findings: sortFindings(findings).slice(0, 80),
  };
}

function analyzeKubernetesCost({ pods = [], nodes = [], cost = {} } = {}) {
  const podRows = Array.isArray(pods) ? pods : [];
  const nodeRows = Array.isArray(nodes) ? nodes : [];
  const cpuPrice = Number(cost.cpuHour) || 0;
  const memoryPrice = Number(cost.memoryGbHour) || 0;
  const currency = clean(cost.currency, 8) || 'USD';
  const priced = cpuPrice > 0 || memoryPrice > 0;
  const byNamespace = {};
  for (const pod of podRows) {
    const namespace = podNamespace(pod) || 'default';
    const entry = byNamespace[namespace] || { namespace, cpu: 0, memory: 0, pods: 0, cost: 0 };
    entry.pods += 1;
    for (const container of pod.spec?.containers || []) {
      entry.cpu += parseQuantity(container.resources?.requests?.cpu) || 0;
      entry.memory += parseQuantity(container.resources?.requests?.memory) || 0;
    }
    byNamespace[namespace] = entry;
  }
  const nodeSummary = nodeRows.map((node) => ({
    name: node.metadata?.name || '',
    cpu: parseQuantity(node.status?.allocatable?.cpu) || 0,
    memory: parseQuantity(node.status?.allocatable?.memory) || 0,
  }));
  const totalCpu = nodeSummary.reduce((sum, node) => sum + node.cpu, 0);
  const totalMemory = nodeSummary.reduce((sum, node) => sum + node.memory, 0);
  const requestedCpu = Object.values(byNamespace).reduce((sum, entry) => sum + entry.cpu, 0);
  const requestedMemory = Object.values(byNamespace).reduce((sum, entry) => sum + entry.memory, 0);
  const rows = Object.values(byNamespace).map((entry) => {
    const monthly = (entry.cpu * cpuPrice + (entry.memory / 1024 ** 3) * memoryPrice) * 730;
    return { ...entry, memoryGb: Number((entry.memory / 1024 ** 3).toFixed(2)), costMonth: priced ? Number(monthly.toFixed(2)) : null };
  }).sort((a, b) => b.cpu - a.cpu);
  const findings = [];
  if (!priced) {
    findings.push(finding('cost', 'info', 'Cost prices are not configured', 'Requests are measured, cost is not', {
      id: 'k8s-cost-unset', action: 'Add a CPU-hour and memory-GB-hour price in Intelligence settings to price requests.',
    }));
  }
  if (totalCpu && requestedCpu / totalCpu > 0.85) {
    findings.push(finding('cost', 'warning', 'Cluster is over-requested', `${Math.round((requestedCpu / totalCpu) * 100)}% of allocatable CPU`, {
      id: 'k8s-cost-overrequest', evidence: `${requestedCpu.toFixed(2)} of ${totalCpu.toFixed(2)} cores requested`,
      action: 'Trim over-provisioned requests; new pods may not schedule.',
    }));
  } else if (totalCpu && requestedCpu / totalCpu < 0.25 && requestedCpu > 0) {
    findings.push(finding('cost', 'info', 'Most capacity is unrequested', `${Math.round((requestedCpu / totalCpu) * 100)}% of allocatable CPU`, {
      id: 'k8s-cost-underrequest', evidence: `${requestedCpu.toFixed(2)} of ${totalCpu.toFixed(2)} cores requested`,
      action: 'Consider consolidating nodes or lowering reserved capacity.',
    }));
  }
  return {
    priced, currency, prices: { cpuHour: cpuPrice, memoryGbHour: memoryPrice },
    totals: {
      cpuAllocatable: totalCpu, memoryAllocatableGb: Number((totalMemory / 1024 ** 3).toFixed(2)),
      cpuRequested: Number(requestedCpu.toFixed(2)), memoryRequestedGb: Number((requestedMemory / 1024 ** 3).toFixed(2)),
      costMonth: priced ? Number(rows.reduce((sum, row) => sum + row.costMonth, 0).toFixed(2)) : null,
    },
    nodes: nodeSummary,
    namespaces: rows.slice(0, 80),
    findings: sortFindings(findings),
  };
}

function analyzeKubernetesGitOps({ deployments = [], statefulsets = [], namespaces = [], apiGroups = '' } = {}) {
  const workloads = [...(deployments || []), ...(statefulsets || [])];
  const namespaceNames = (namespaces || []).map((entry) => entry.metadata?.name || '');
  const argo = /argoproj\.io|applicationsets|appprojects/i.test(String(apiGroups || '')) || namespaceNames.includes('argocd');
  const flux = namespaceNames.includes('flux-system')
    || workloads.some((workload) => Object.keys(workload.metadata?.labels || {}).some((key) => /kustomize\.toolkit\.fluxcd\.io|helm\.toolkit\.fluxcd\.io|fluxcd\.io/i.test(key)));
  const managed = workloads.filter((workload) => {
    const labels = workload.metadata?.labels || {};
    return Object.keys(labels).some((key) => /argocd\.argoproj\.io|fluxcd\.io|kustomize\.toolkit/i.test(key));
  });
  return {
    detected: argo || flux,
    argo, flux,
    tools: [argo ? 'Argo CD' : '', flux ? 'Flux' : ''].filter(Boolean),
    managedWorkloads: managed.slice(0, 50).map((workload) => ({ name: workload.metadata?.name, namespace: podNamespace(workload) })),
    findings: argo || flux
      ? [finding('gitops', 'info', `GitOps controller detected${argo ? ' (Argo CD)' : ''}${flux ? ' (Flux)' : ''}`, `${namespaceNames.length} namespace(s)`, {
        id: 'k8s-gitops', evidence: [argo ? 'argoproj.io API' : '', flux ? 'flux-system namespace' : ''].filter(Boolean).join(', '),
        action: 'Changes made with kubectl may be reverted by the controller; prefer committing to Git.',
      })]
      : [],
    limitations: argo || flux ? [] : ['No Argo CD or Flux installation was visible from the API groups or namespaces.'],
  };
}

function analyzeKubernetesTroubleshooting({ events = [], pods = [] } = {}) {
  const findings = [];
  const warningEvents = (Array.isArray(events) ? events : []).filter((event) => event.type === 'Warning');
  const byObject = new Map();
  for (const event of warningEvents) {
    const object = `${event.involvedObject?.namespace || event.metadata?.namespace || ''}/${event.involvedObject?.kind || ''}/${event.involvedObject?.name || ''}`;
    const entry = byObject.get(object) || { object, reasons: {}, count: 0, last: null, message: '' };
    const reason = String(event.reason || 'Warning');
    entry.reasons[reason] = (entry.reasons[reason] || 0) + (Number(event.count) || 1);
    entry.count += Number(event.count) || 1;
    const at = Date.parse(event.lastTimestamp || event.eventTime || event.metadata?.creationTimestamp || '');
    if (Number.isFinite(at) && (!entry.last || at > entry.last)) { entry.last = at; entry.message = clean(event.message, 300); }
    byObject.set(object, entry);
  }
  const rows = [...byObject.values()].sort((a, b) => b.count - a.count).slice(0, 60);
  for (const row of rows.slice(0, 20)) {
    const reasons = Object.keys(row.reasons);
    findings.push(finding('troubleshooting', 'warning', reasons[0] || 'Warning events', row.object, {
      id: `k8s-event-${row.object}`, evidence: `${row.count} event(s): ${reasons.join(', ')}`, detail: row.message,
      href: '#/kubernetes/events', action: 'Read the full event message and the object describe output.',
    }));
  }
  const notReady = (Array.isArray(pods) ? pods : []).filter((pod) => pod.status?.phase === 'Running'
    && (pod.status?.containerStatuses || []).some((container) => container.ready !== true));
  const restarts = (Array.isArray(pods) ? pods : []).map((pod) => ({
    name: `${podNamespace(pod)}/${podName(pod)}`,
    restarts: (pod.status?.containerStatuses || []).reduce((sum, container) => sum + (Number(container.restartCount) || 0), 0),
    reason: clean((pod.status?.containerStatuses || []).find((container) => container.state?.waiting)?.state?.waiting?.reason, 120),
  })).filter((pod) => pod.restarts >= 3).sort((a, b) => b.restarts - a.restarts);
  for (const pod of restarts.slice(0, 10)) {
    findings.push(finding('troubleshooting', pod.restarts >= 10 ? 'critical' : 'warning', 'Pod restarts repeatedly', pod.name, {
      id: `k8s-restarts-${pod.name}`, evidence: `${pod.restarts} restart(s)${pod.reason ? ` · ${pod.reason}` : ''}`,
      href: '#/kubernetes/pods', action: 'Compare current and previous logs; check liveness/readiness probes.',
    }));
  }
  return {
    warningEvents: warningEvents.length,
    byObject: rows,
    notReady: notReady.slice(0, 30).map((pod) => `${podNamespace(pod)}/${podName(pod)}`),
    restarts: restarts.slice(0, 30),
    findings: sortFindings(findings).slice(0, 80),
  };
}

/**
 * Aggregate a read-only health snapshot across configured contexts.
 *
 * One unreachable context never hides the others. Absent counts stay null so a
 * failed request is not rendered as zero objects.
 */
function analyzeMultiCluster(snapshot = {}) {
  const contexts = Array.isArray(snapshot.contexts) ? snapshot.contexts : [];
  const findings = [];
  const rows = [];
  const limitations = [];
  const totals = {
    contexts: contexts.length, reachable: 0, nodes: 0, nodesReady: 0,
    pods: 0, podsRunning: 0, podsProblem: 0,
    deployments: 0, deploymentsAvailable: 0, warningEvents: 0,
  };
  for (const entry of contexts) {
    const name = clean(entry.name || 'context', 200);
    const cluster = clean(entry.cluster || '', 200);
    if (entry.ok === false) {
      findings.push(finding('multicluster', 'warning', 'Cluster context is unreachable', name, {
        id: `mc-unreachable-${name}`, resource: name,
        evidence: clean(entry.error || 'kubectl did not answer.', 300),
        action: 'Check the kubeconfig entry and network access before comparing this context.',
      }));
      rows.push({
        name, cluster, ok: false, error: clean(entry.error || 'Unreachable', 300),
        nodesTotal: null, nodesReady: null, podsTotal: null, podsRunning: null, podsProblem: null,
        deploymentsTotal: null, deploymentsAvailable: null, warningEvents: null,
      });
      limitations.push(`${name}: ${clean(entry.error || 'unreachable', 200)}`);
      continue;
    }
    totals.reachable += 1;
    const nodes = entry.nodes || {};
    const pods = entry.pods || {};
    const deployments = entry.deployments || {};
    const events = entry.warningEvents || {};
    const nodeTotal = nodes.ok === false ? null : num(nodes.total);
    const nodeReady = nodes.ok === false ? null : num(nodes.ready);
    const podTotal = pods.ok === false ? null : num(pods.total);
    const podRunning = pods.ok === false ? null : num(pods.running);
    const podProblem = pods.ok === false ? null : num(pods.problem);
    const deploymentTotal = deployments.ok === false ? null : num(deployments.total);
    const deploymentAvailable = deployments.ok === false ? null : num(deployments.available);
    const warningEvents = events.ok === false ? null : num(events.count);
    if (nodeTotal == null) limitations.push(`${name}: node counts are unavailable.`);
    if (podTotal == null) limitations.push(`${name}: pod counts are unavailable.`);
    if (deploymentTotal == null) limitations.push(`${name}: deployment counts are unavailable.`);
    totals.nodes += nodeTotal || 0;
    totals.nodesReady += nodeReady || 0;
    totals.pods += podTotal || 0;
    totals.podsRunning += podRunning || 0;
    totals.podsProblem += podProblem || 0;
    totals.deployments += deploymentTotal || 0;
    totals.deploymentsAvailable += deploymentAvailable || 0;
    totals.warningEvents += warningEvents || 0;
    if (nodeTotal != null && nodeReady != null && nodeReady < nodeTotal) {
      findings.push(finding('multicluster', 'critical', 'A cluster has unready nodes', name, {
        id: `mc-nodes-${name}`, resource: name,
        evidence: `${nodeReady} of ${nodeTotal} node(s) ready`,
      }));
    }
    if (podProblem) {
      findings.push(finding('multicluster', 'warning', 'A cluster has unhealthy pods', name, {
        id: `mc-pods-${name}`, resource: name,
        evidence: `${podProblem} pod(s) pending, failed or waiting`,
      }));
    }
    if (deploymentTotal != null && deploymentAvailable != null && deploymentAvailable < deploymentTotal) {
      findings.push(finding('multicluster', 'warning', 'A cluster has unavailable deployments', name, {
        id: `mc-deploy-${name}`, resource: name,
        evidence: `${deploymentAvailable} of ${deploymentTotal} deployment(s) fully available`,
      }));
    }
    if (warningEvents) {
      findings.push(finding('multicluster', 'info', 'A cluster reports warning events', name, {
        id: `mc-events-${name}`, resource: name, evidence: `${warningEvents} Warning event(s) retained`,
      }));
    }
    rows.push({
      name, cluster, ok: true, error: '',
      nodesTotal: nodeTotal, nodesReady: nodeReady,
      podsTotal: podTotal, podsRunning: podRunning, podsProblem: podProblem,
      deploymentsTotal: deploymentTotal, deploymentsAvailable: deploymentAvailable,
      warningEvents,
    });
  }
  if (!contexts.length) limitations.push('No kubeconfig context is configured.');
  return {
    ok: true,
    available: contexts.length > 0,
    selected: clean(snapshot.selected || '', 200),
    checkedAt: snapshot.checkedAt || new Date().toISOString(),
    contexts: rows.slice(0, 30),
    totals,
    findings: sortFindings(findings).slice(0, 80),
    limitations: limitations.slice(0, 20),
  };
}

function kubernetesInsights(data = {}, cost = {}) {
  const items = data.items || {};
  const health = analyzeKubernetesHealth(items);
  const security = analyzeKubernetesSecurity({
    pods: items.pods, clusterRoleBindings: items.clusterrolebindings, serviceAccounts: items.serviceaccounts,
  });
  const storage = analyzeKubernetesStorage(items);
  const network = analyzeKubernetesNetwork(items);
  const optimization = analyzeKubernetesOptimization(items);
  const costing = analyzeKubernetesCost({ pods: items.pods, nodes: items.nodes, cost });
  const gitops = analyzeKubernetesGitOps(items);
  const troubleshooting = analyzeKubernetesTroubleshooting(items);
  const findings = sortFindings([
    ...health.findings, ...security.findings, ...storage.findings, ...network.findings,
    ...optimization.findings, ...costing.findings, ...troubleshooting.findings,
  ]);
  return {
    ok: true,
    context: data.context || '',
    namespace: data.namespace || '',
    generatedAt: new Date().toISOString(),
    health,
    security: { ...security, findings: undefined },
    storage: { ...storage, findings: undefined },
    network: { ...network, findings: undefined },
    optimization: { ...optimization, findings: undefined },
    cost: { ...costing, findings: undefined },
    gitops: { ...gitops, findings: undefined },
    troubleshooting: { ...troubleshooting, findings: undefined },
    findings: findings.slice(0, 200),
    counts: summarize(findings),
    limitations: Object.entries(data.errors || {}).map(([key, error]) => `${key}: ${error}`),
  };
}

// ------------------------------------------------------------- observability

async function analysesForMetrics({ queryMetrics, names = [], from, to = Date.now(), labels = {} } = {}) {
  if (typeof queryMetrics !== 'function') return { ok: false, series: [], limitations: ['The metrics store is not available.'] };
  let result;
  try {
    result = await queryMetrics({ names, from, to, step: 60e3, aggregation: 'avg', limit: 100 });
  } catch (error) {
    return { ok: false, series: [], limitations: [clean(error.message, 300)] };
  }
  if (!result?.ok) return { ok: false, series: [], limitations: ['Metric query failed.'] };
  return {
    ok: true,
    series: (result.series || []).filter((series) => (series.points || []).length).map((series) => ({
      name: series.name, resource: series.resource, unit: series.unit, labels: series.labels || {},
      points: series.points,
      latest: series.points[series.points.length - 1]?.[1] ?? null,
    })),
    limitations: [],
  };
}

async function observabilityAnomalies({ queryMetrics, metrics = [] } = {}) {
  const targets = metrics.length ? metrics : [
    'system.cpu.usage', 'system.memory.usage', 'system.disk.usage',
    'docker.container.cpu.usage', 'docker.container.memory.usage',
    'k8s.pods.restarts', 'database.connections.usage', 'database.cache.hit_ratio',
  ];
  const now = Date.now();
  const query = await analysesForMetrics({ queryMetrics, names: targets, from: now - 24 * 3600e3, to: now });
  if (!query.ok) return { available: false, anomalies: [], findings: [], limitations: query.limitations };
  const anomalies = [];
  for (const series of query.series) {
    const detected = detectAnomalies(series.points, { sensitivity: 3 });
    if (!detected.ok || !detected.anomalies.length) continue;
    for (const anomaly of detected.anomalies.slice(-3)) {
      anomalies.push({
        name: series.name, resource: series.resource, unit: series.unit, at: new Date(anomaly.t).toISOString(),
        value: anomaly.v, baseline: detected.baseline, score: anomaly.score, direction: anomaly.direction,
      });
    }
  }
  anomalies.sort((a, b) => b.score - a.score);
  const findings = anomalies.slice(0, 20).map((anomaly) => finding('anomalies', 'warning', `${anomaly.name} moved ${anomaly.direction} the baseline`, anomaly.resource || anomaly.name, {
    id: `obs-anomaly-${anomaly.name}-${anomaly.at}`, resource: anomaly.resource,
    evidence: `${anomaly.value} vs baseline ${anomaly.baseline} (${anomaly.score.toFixed(1)}σ)`,
    href: '#/observability/metrics', action: 'Open the metric to confirm whether this is a real shift or a short spike.',
  }));
  return {
    available: true,
    examined: query.series.length,
    anomalies: anomalies.slice(0, 40),
    findings: sortFindings(findings),
    limitations: query.series.length ? [] : ['No metric samples were retained in the last 24 hours.'],
  };
}

async function observabilityCapacity({ queryMetrics, thresholds = {} } = {}) {
  const definitions = [
    { name: 'system.disk.usage', label: 'Disk usage', unit: 'percent', threshold: clamp(thresholds.disk || 85, 1, 100), resource: 'local' },
    { name: 'system.memory.usage', label: 'Memory usage', unit: 'percent', threshold: clamp(thresholds.memory || 85, 1, 100), resource: 'local' },
    { name: 'system.cpu.usage', label: 'CPU usage', unit: 'percent', threshold: clamp(thresholds.cpu || 80, 1, 100), resource: 'local' },
    { name: 'database.size.bytes', label: 'Database size', unit: 'bytes', threshold: null },
  ];
  const now = Date.now();
  const series = [];
  const limitations = [];
  for (const def of definitions) {
    let result;
    try {
      result = await queryMetrics?.({ names: [def.name], from: now - 7 * 24 * 3600e3, to: now, step: 15 * 60e3, aggregation: 'max', limit: 50 });
    } catch (error) {
      limitations.push(`${def.label}: ${clean(error.message, 200)}`);
      continue;
    }
    if (!result?.ok) { limitations.push(`${def.label}: metric query failed.`); continue; }
    const points = (result.series || []).flatMap((entry) => entry.points || []).sort((a, b) => a[0] - b[0]);
    if (points.length < 6) { limitations.push(`${def.label}: not enough samples yet.`); continue; }
    const current = points[points.length - 1][1];
    const predicted = forecast(points, { horizonMs: 7 * 24 * 3600e3 });
    const eta = def.threshold == null ? null : timeToThreshold(points, def.threshold, { horizonMs: 90 * 24 * 3600e3 });
    series.push({
      name: def.name, label: def.label, unit: def.unit, threshold: def.threshold,
      current, observed: points.length,
      slopePerDay: predicted.ok ? Number((predicted.slopePerHour * 24).toFixed(3)) : null,
      confidence: predicted.ok ? predicted.confidence : null,
      breached: eta?.alreadyReached === true,
      breachAt: eta?.reachable && !eta.alreadyReached ? new Date(eta.at).toISOString() : null,
      note: predicted.ok ? predicted.confidenceNote : predicted.reason,
    });
  }
  const findings = [];
  for (const item of series) {
    if (item.breached) {
      findings.push(finding('capacity', 'warning', `${item.label} is already above its threshold`, item.label, {
        id: `obs-cap-${item.name}`, evidence: `${roundValue(item.current)}${item.unit === 'percent' ? '%' : ''} ≥ ${item.threshold}${item.unit === 'percent' ? '%' : ''}`,
        action: 'Reclaim or add capacity now.', href: '#/observability/metrics',
      }));
    } else if (item.breachAt) {
      findings.push(finding('capacity', 'warning', `${item.label} will cross its threshold`, item.label, {
        id: `obs-cap-${item.name}`, evidence: `projected ${new Date(item.breachAt).toISOString()} at ${item.slopePerDay}/day`,
        action: 'Plan capacity before the projected date.', href: '#/observability/metrics',
      }));
    }
  }
  return { available: series.length > 0, series, findings: sortFindings(findings), limitations };
}

function observabilityDependencies(traces = []) {
  const spans = Array.isArray(traces) ? traces : [];
  if (!spans.length) return { available: false, edges: [], services: [], findings: [], limitations: ['No spans are retained. Ingest traces from an OpenTelemetry exporter.'] };
  const byId = new Map(spans.map((span) => [span.id, span]));
  const edges = new Map();
  const add = (from, to, span) => {
    if (!from || !to || from === to) return;
    const key = `${from}->${to}`;
    const entry = edges.get(key) || { from, to, calls: 0, errors: 0, durations: [], operations: new Set() };
    entry.calls += 1;
    if (span?.error) entry.errors += 1;
    if (Number.isFinite(Number(span?.durationMs))) entry.durations.push(Number(span.durationMs));
    if (span?.operation) entry.operations.add(String(span.operation).slice(0, 80));
    edges.set(key, entry);
  };
  for (const span of spans) {
    const parent = span.parentId ? byId.get(span.parentId) : null;
    if (parent) add(parent.service, span.service, span);
    if (span.peerService) add(span.service, span.peerService, span);
  }
  const rows = [...edges.values()].map((edge) => ({
    from: edge.from, to: edge.to, calls: edge.calls, errors: edge.errors,
    errorRate: edge.calls ? Number(((edge.errors / edge.calls) * 100).toFixed(1)) : 0,
    avgMs: edge.durations.length ? Number(mean(edge.durations).toFixed(1)) : null,
    p95Ms: edge.durations.length >= 3 ? Number(percentile(edge.durations, 0.95).toFixed(1)) : null,
    operations: [...edge.operations].slice(0, 6),
  })).sort((a, b) => b.calls - a.calls);
  const services = [...new Set(spans.map((span) => span.service))].sort();
  const findings = rows.filter((edge) => edge.errorRate >= 20 || (edge.p95Ms || 0) >= 500).slice(0, 20).map((edge) => finding(
    'dependencies',
    edge.errorRate >= 50 ? 'critical' : 'warning',
    edge.errorRate >= 20 ? 'Dependency calls are failing' : 'Slow dependency calls',
    `${edge.from} → ${edge.to}`,
    {
      id: `obs-edge-${edge.from}-${edge.to}`, resource: `${edge.from} → ${edge.to}`,
      evidence: `${edge.errorRate}% errors · p95 ${edge.p95Ms ?? '—'} ms of ${edge.calls} call(s)`,
      href: '#/observability/traces', action: 'Open the traces for this edge to see the failing operation.',
    },
  ));
  return { available: true, edges: rows.slice(0, 100), services, findings: sortFindings(findings), limitations: [] };
}

function observabilityProfiles(traces = []) {
  const spans = Array.isArray(traces) ? traces : [];
  const services = new Map();
  for (const span of spans) {
    const entry = services.get(span.service) || { service: span.service, spans: 0, errors: 0, durations: [], operations: new Map() };
    entry.spans += 1;
    if (span.error) entry.errors += 1;
    if (Number.isFinite(Number(span.durationMs))) entry.durations.push(Number(span.durationMs));
    const operation = String(span.operation || span.name || 'operation').slice(0, 120);
    entry.operations.set(operation, (entry.operations.get(operation) || 0) + 1);
    services.set(span.service, entry);
  }
  const rows = [...services.values()].map((entry) => ({
    service: entry.service, spans: entry.spans, errors: entry.errors,
    errorRate: entry.spans ? Number(((entry.errors / entry.spans) * 100).toFixed(1)) : 0,
    avgMs: entry.durations.length ? Number(mean(entry.durations).toFixed(1)) : null,
    p95Ms: entry.durations.length >= 3 ? Number(percentile(entry.durations, 0.95).toFixed(1)) : null,
    p99Ms: entry.durations.length >= 5 ? Number(percentile(entry.durations, 0.99).toFixed(1)) : null,
    topOperations: [...entry.operations.entries()].sort((a, b) => b[1] - a[1]).slice(0, 5).map(([name, count]) => ({ name, count })),
  })).sort((a, b) => (b.p95Ms || 0) - (a.p95Ms || 0));
  return { available: rows.length > 0, services: rows.slice(0, 60), limitations: rows.length ? [] : ['No spans are retained for profiling.'] };
}

async function observabilitySlos({ queryMetrics, definitions = [] } = {}) {
  const slos = (Array.isArray(definitions) ? definitions : []).filter((slo) => slo.enabled !== false);
  if (!slos.length) return { available: false, slos: [], findings: [], limitations: ['Add an objective to measure an error budget.'] };
  const now = Date.now();
  const rows = [];
  const findings = [];
  const limitations = [];
  for (const slo of slos) {
    const windowMs = clamp(slo.windowHours || 24, 1, 720) * 3600e3;
    let result;
    try {
      result = await queryMetrics?.({ names: [slo.metric], from: now - windowMs, to: now, step: 60e3, aggregation: slo.aggregation || 'avg', limit: 20 });
    } catch (error) {
      limitations.push(`${slo.name}: ${clean(error.message, 200)}`);
      continue;
    }
    const points = (result?.series || []).flatMap((series) => series.points || []).sort((a, b) => a[0] - b[0]);
    if (points.length < 3) { limitations.push(`${slo.name}: not enough samples in the window.`); continue; }
    const values = points.map((point) => point[1]);
    const comparison = slo.comparison === 'lte' ? 'lte' : 'gte';
    const threshold = Number(slo.threshold);
    const good = values.filter((value) => (comparison === 'lte' ? value <= threshold : value >= threshold)).length;
    const achieved = (good / values.length) * 100;
    const target = Number(slo.target);
    const tolerated = 100 - target;
    const consumed = tolerated > 0
      ? clamp(((100 - achieved) / tolerated) * 100, 0, 100)
      : (achieved >= target ? 0 : 100);
    const status = achieved >= target ? 'meeting' : 'breached';
    rows.push({
      id: slo.id, name: slo.name, metric: slo.metric, aggregation: slo.aggregation,
      comparison, threshold, target, windowHours: slo.windowHours, unit: slo.unit,
      achieved: Number(achieved.toFixed(3)), status,
      errorBudgetConsumed: Number(consumed.toFixed(1)), samples: values.length,
      latest: values[values.length - 1],
    });
    if (status === 'breached' || consumed >= 80) {
      findings.push(finding('slo', consumed >= 100 ? 'critical' : 'warning', `${slo.name} error budget`, `${achieved.toFixed(2)}% achieved vs ${target}% target`, {
        id: `obs-slo-${slo.id}`, evidence: `${consumed.toFixed(0)}% of the error budget consumed over ${slo.windowHours}h`,
        href: '#/observability/insights', action: 'Prioritise the largest error source before the window rolls over.',
      }));
    }
  }
  return { available: rows.length > 0, slos: rows, findings: sortFindings(findings), limitations };
}

async function observabilityInsights({ queryMetrics, traces, slos, thresholds } = {}) {
  const [anomalies, capacity, sloResult] = await Promise.all([
    observabilityAnomalies({ queryMetrics }),
    observabilityCapacity({ queryMetrics, thresholds }),
    observabilitySlos({ queryMetrics, definitions: slos }),
  ]);
  const dependencies = observabilityDependencies(traces);
  const profiles = observabilityProfiles(traces);
  const findings = sortFindings([
    ...anomalies.findings, ...capacity.findings, ...sloResult.findings,
    ...dependencies.findings,
  ]);
  return {
    ok: true,
    generatedAt: new Date().toISOString(),
    anomalies,
    capacity,
    slos: sloResult,
    dependencies,
    profiles,
    findings: findings.slice(0, 200),
    counts: summarize(findings),
    limitations: [...anomalies.limitations, ...capacity.limitations, ...sloResult.limitations, ...dependencies.limitations],
  };
}

// ---------------------------------------------------------------------- misc

function formatBytes(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return '0 B';
  const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
  const index = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
  return `${(n / 1024 ** index).toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function roundValue(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.abs(n) >= 100 ? Math.round(n) : Math.round(n * 100) / 100;
}

module.exports = {
  finding,
  sortFindings,
  summarize,
  weighChecks,
  databaseHealth,
  analyzeSchema,
  analyzeQueryHistory,
  analyzeWorkloads,
  databaseForecast,
  parseQuantity,
  parseCpu,
  analyzeDockerSecurity,
  analyzeDockerImages,
  analyzeDockerResources,
  analyzeDockerCompose,
  analyzeDockerOptimizer,
  compareDockerEnvironments,
  analyzeKubernetesHealth,
  analyzeKubernetesSecurity,
  analyzeKubernetesStorage,
  analyzeKubernetesNetwork,
  analyzeKubernetesOptimization,
  analyzeKubernetesCost,
  analyzeKubernetesGitOps,
  analyzeKubernetesTroubleshooting,
  kubernetesInsights,
  analyzeMultiCluster,
  observabilityAnomalies,
  observabilityCapacity,
  observabilityDependencies,
  observabilityProfiles,
  observabilitySlos,
  observabilityInsights,
  formatBytes,
  __test: { normalizeSql, inspectSecurity, parseQuantity, check, weighChecks },
};
