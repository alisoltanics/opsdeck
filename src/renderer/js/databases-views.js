'use strict';

/**
 * Database workspace — connections, discovery, explorer, SQL editor,
 * monitoring, diagnostics and activity.
 *
 * Every value shown here comes from the main-process DatabaseService; no
 * metrics or records are generated in the renderer.
 */
(function () {
  const api = window.opsdeck;
  const { esc, fmtNumber, fmtBytes, fmtPercent, timeAgo, fmtDateTime, titleCase, copyText, truncate } = OD.utils;
  const { icon } = OD.icons;
  const U = OD.ui;

  const PAGES = {
    dashboard: 'Dashboard',
    connections: 'Connections',
    explorer: 'Database explorer',
    editor: 'SQL editor',
    history: 'Query history',
    local: 'Local databases',
    docker: 'Docker databases',
    kubernetes: 'Kubernetes databases',
    performance: 'Performance',
    diagnostics: 'Diagnostics',
    activity: 'Activity log',
  };

  const S = {
    booted: false,
    bootError: '',
    engines: [],
    connections: [],
    stats: {},
    vault: null,
    limits: { defaultRows: 1000, tablePage: 200 },
    discovery: null,
    discoveryAt: 0,
    discoveryError: '',
    dbs: {},
    selected: { explorer: '', editor: '', performance: '', diagnostics: '' },
    explorer: {
      database: '', data: null, loading: false, error: '', filter: '',
      detail: null, key: '', redis: { keys: [], cursor: '0', pattern: '*', loaded: false },
    },
    editor: {
      sql: '', result: null, error: '', running: false, token: '', explain: null,
      database: '', durationMs: null, view: 'table', page: 0, search: '', sort: null,
    },
    perf: { data: null, loading: false, error: '', interval: 0, history: [] },
    diag: { data: null, loading: false, error: '' },
    history: [],
    activity: [],
  };

  let perfTimer = null;
  let pendingSource = null;

  // ---------------------------------------------------------------- helpers
  function engineMeta(id) {
    return S.engines.find((engine) => engine.id === id) || { id, label: titleCase(id || 'database'), tone: 'slate', capabilities: {} };
  }

  function connById(id) {
    return S.connections.find((connection) => connection.id === id) || null;
  }

  function isConnected(connection) {
    return connection?.status?.state === 'connected';
  }

  function fmtDuration(ms) {
    const value = Number(ms);
    if (!Number.isFinite(value)) return '—';
    if (value < 1000) return `${Math.round(value)} ms`;
    if (value < 60000) return `${(value / 1000).toFixed(value < 10000 ? 2 : 1)} s`;
    return `${Math.floor(value / 60000)}m ${Math.round((value % 60000) / 1000)}s`;
  }

  function pageHead(opts) {
    return `<div class="page-head">
      <div class="page-head-left">
        <div class="eyebrow">${icon(opts.icon || 'database', 12)}${esc(opts.eyebrow || 'Databases')}</div>
        <h1 class="page-title">${esc(opts.title)}</h1>
        ${opts.sub ? `<p class="page-sub">${esc(opts.sub)}</p>` : ''}
      </div>
      <div class="page-actions">${opts.actions || ''}</div>
    </div>`;
  }

  function refreshButton(extra = '') {
    return U.button({ label: 'Refresh', icon: 'refresh', size: 'sm', attrs: `data-db-refresh ${extra}` });
  }

  function newConnectionButton() {
    return U.button({ label: 'New connection', icon: 'plus', size: 'sm', variant: 'primary', attrs: 'data-db-new' });
  }

  function statusBadge(connection) {
    if (isConnected(connection)) return U.badge('connected', 'green', { dot: true });
    if (connection?.lastStatus?.ok === false) return U.badge('error', 'red', { dot: true });
    return U.badge('idle', 'slate', { dot: true });
  }

  function confidenceBadge(item) {
    const tone = item.confidence === 'high' ? 'green' : item.confidence === 'medium' ? 'amber' : 'slate';
    const title = (item.reasons || []).join(', ');
    return `<span title="${esc(title)}">${U.badge(`detection ${item.confidence || 'low'}`, tone)}</span>`;
  }

  function engineBadge(id) {
    const meta = engineMeta(id);
    return `<span class="inline-flex gap-2">${U.badge(meta.label, meta.tone || 'slate')}${meta.supported === false ? U.badge('planned', 'slate') : ''}</span>`;
  }

  function connectionSelect(role, selected, opts = {}) {
    const connections = opts.filter ? S.connections.filter(opts.filter) : S.connections;
    if (!connections.length) return `<span class="muted">No connections yet.</span>`;
    return `<select class="input input-sm" data-db-role="${esc(role)}" ${opts.disabled ? 'disabled' : ''}>
      <option value="">Select a connection…</option>
      ${connections.map((connection) => `<option value="${esc(connection.id)}" ${connection.id === selected ? 'selected' : ''}>${esc(connection.name)} · ${esc(engineMeta(connection.engine).label)}</option>`).join('')}
    </select>`;
  }

  function databaseSelect(role, connection, selected) {
    const list = connection ? S.dbs[connection.id] || null : null;
    if (!list) return `<input class="input input-sm" data-db-role="${esc(role)}" value="${esc(selected || '')}" placeholder="Database name" spellcheck="false">`;
    return `<select class="input input-sm" data-db-role="${esc(role)}">
      ${(list.length ? list : [{ name: selected || '' }]).map((entry) => `<option value="${esc(entry.name)}" ${entry.name === selected ? 'selected' : ''}>${esc(entry.name)}</option>`).join('')}
    </select>`;
  }

  function dataTable(opts) {
    if (!opts.rows.length) {
      return U.empty({ icon: opts.icon || 'inbox', title: opts.emptyTitle || 'Nothing to show', body: opts.emptyBody || '', compact: true });
    }
    return `<div class="table-wrap"><table class="data-table ${opts.class || ''}">
      <thead><tr>${opts.columns.map((column) => `<th>${esc(column.label)}</th>`).join('')}</tr></thead>
      <tbody>${opts.rows.map((row) => `<tr>${opts.columns.map((column) => `<td>${column.render ? column.render(row) : esc(row[column.key] ?? '—')}</td>`).join('')}</tr>`).join('')}</tbody>
    </table></div>`;
  }

  function cellValue(value, max = 220) {
    if (value === null || value === undefined) return '<span class="db-null">NULL</span>';
    if (typeof value === 'boolean') return `<span class="db-bool">${value}</span>`;
    if (typeof value === 'number') return `<span class="db-number">${esc(value)}</span>`;
    if (typeof value === 'object') {
      const text = JSON.stringify(value);
      return `<span class="mono" title="${esc(truncate(text, 1200))}">${esc(truncate(text, max))}</span>`;
    }
    const text = String(value);
    return `<span title="${esc(truncate(text, 1200))}" class="${text === '' ? 'muted' : ''}">${esc(truncate(text, max))}</span>`;
  }

  function parseColumns(result) {
    if (!result) return [];
    if (Array.isArray(result.columns) && result.columns.length) {
      return result.columns.map((column) => (typeof column === 'string' ? column : column.name)).filter(Boolean);
    }
    const first = (result.rows || [])[0];
    return first && typeof first === 'object' ? Object.keys(first) : [];
  }

  function errorPage(error) {
    return `<div class="page">${pageHead({ title: 'Databases' })}${U.errorBanner('The database workspace could not load', error?.message || String(error))}</div>`;
  }

  function unavailable(message) {
    return `<div class="page">${pageHead({ title: 'Databases', actions: refreshButton() })}${U.errorBanner('Database bridge unavailable', message || 'This build did not expose the database bridge.')}</div>`;
  }

  // ----------------------------------------------------------------- loading
  async function loadBootstrap() {
    if (!api?.databases) throw new Error('The preload bridge does not expose databases.');
    const res = await api.databases.bootstrap();
    if (!res?.ok) throw new Error(res?.error || 'The database service did not start.');
    S.engines = res.engines || [];
    S.connections = res.connections || [];
    S.stats = res.stats || {};
    S.vault = res.vault;
    S.limits = res.limits || S.limits;
    S.booted = true;
    S.bootError = '';
    for (const connection of S.connections) {
      if (!S.selected.explorer) S.selected.explorer = connection.id;
      if (!S.selected.editor) S.selected.editor = connection.id;
      if (!S.selected.performance) S.selected.performance = connection.id;
      if (!S.selected.diagnostics) S.selected.diagnostics = connection.id;
    }
    syncStore();
  }

  async function refreshConnections() {
    const res = await api.databases.connections();
    if (res?.ok) {
      S.connections = res.connections || S.connections;
      S.stats = res.stats || S.stats;
      syncStore();
      OD.app?.refreshSidebar?.();
    }
  }

  function syncStore() {
    if (!OD.store) return;
    OD.store.state.databases = {
      connections: S.connections.length,
      connected: S.connections.filter(isConnected).length,
      engines: S.engines.filter((engine) => engine.supported).length,
      discovered: S.discovery
        ? (S.discovery.counts?.docker || 0) + (S.discovery.counts?.local || 0) + (S.discovery.counts?.kubernetes || 0)
        : null,
      at: Date.now(),
    };
  }

  async function loadDiscovery(refresh = false) {
    try {
      const res = await api.databases.discovery(refresh);
      if (res?.ok === false) throw new Error(res.error || 'Discovery failed.');
      S.discovery = res;
      S.discoveryAt = Date.now();
      S.discoveryError = '';
      syncStore();
      OD.app?.refreshSidebar?.();
    } catch (error) {
      S.discoveryError = error.message;
      throw error;
    }
  }

  async function loadDatabases(connectionId) {
    if (!connectionId) return [];
    try {
      const res = await api.databases.databases(connectionId);
      if (!res?.ok) throw new Error(res?.error || 'Could not list databases.');
      let list = res.databases || [];
      if (engineMeta(connById(connectionId)?.engine).id === 'sqlite') {
        list = list.map((entry) => ({ ...entry, name: entry.name }));
      }
      S.dbs[connectionId] = list;
      return list;
    } catch (error) {
      U.toast('Could not list databases', 'error', { description: error.message });
      return [];
    }
  }

  function ensureSelection(section, route) {
    const requested = route?.query?.get?.('connection') || '';
    if (requested && connById(requested)) S.selected[section] = requested;
    if (!S.selected[section] || !connById(S.selected[section])) {
      S.selected[section] = S.connections[0]?.id || '';
    }
    return S.selected[section];
  }

  // ---------------------------------------------------------------- prepare
  async function prepare(route) {
    const section = route.parts[0] || 'dashboard';
    if (!api?.databases) return;
    if (!S.booted) await loadBootstrap();
    else await refreshConnections().catch(() => {});

    if (['dashboard', 'docker', 'kubernetes', 'local'].includes(section)) {
      if (!S.discovery || Date.now() - S.discoveryAt > 8000) {
        await loadDiscovery(false).catch(() => {});
      }
    }

    if (section === 'history') {
      const res = await api.databases.history({ limit: 300 });
      S.history = res?.items || [];
    }
    if (section === 'activity' || section === 'dashboard') {
      const res = await api.databases.activity({ limit: 300 });
      S.activity = res?.items || [];
    }

    if (['explorer', 'editor', 'performance', 'diagnostics'].includes(section)) {
      const connectionId = ensureSelection(section, route);
      if (connectionId) {
        const connection = connById(connectionId);
        if (!S.dbs[connectionId] || section === 'editor') {
          await loadDatabases(connectionId);
        }
        if (section === 'explorer') {
          const requestedDb = route?.query?.get?.('database') || '';
          const available = (S.dbs[connectionId] || []).map((entry) => entry.name);
          if (requestedDb && (!available.length || available.includes(requestedDb))) S.explorer.database = requestedDb;
          if (!S.explorer.database || (available.length && !available.includes(S.explorer.database))) {
            S.explorer.database = connection?.database && available.includes(connection.database)
              ? connection.database
              : available[0] || connection?.database || '';
          }
          const key = `${connectionId}|${S.explorer.database}`;
          if (S.explorer.database && S.explorer.key !== key) await loadExplorer(connectionId, S.explorer.database);
        }
        if (section === 'editor') {
          if (!S.editor.database) {
            S.editor.database = connection?.database && (S.dbs[connectionId] || []).some((entry) => entry.name === connection.database)
              ? connection.database
              : (S.dbs[connectionId] || [])[0]?.name || '';
          }
        }
        if (section === 'performance' && !S.perf.data && !S.perf.loading) {
          await loadMetrics(connectionId);
        }
      }
    }
  }

  async function loadExplorer(connectionId, database) {
    S.explorer.loading = true;
    S.explorer.error = '';
    try {
      const res = await api.databases.explorer({ id: connectionId, database });
      if (!res?.ok) throw new Error(res?.error || 'The explorer could not read this database.');
      S.explorer.data = res;
      S.explorer.key = `${connectionId}|${database}`;
      if (res.engine === 'redis') {
        S.explorer.redis = { keys: res.keys || [], cursor: res.cursor || '0', pattern: '*', loaded: true };
      }
    } catch (error) {
      S.explorer.data = null;
      S.explorer.key = '';
      S.explorer.error = error.message;
    } finally {
      S.explorer.loading = false;
    }
  }

  async function loadMetrics(connectionId) {
    S.perf.loading = true;
    S.perf.error = '';
    try {
      const res = await api.databases.metrics(connectionId);
      S.perf.data = res;
      if (res?.available) {
        S.perf.history.push({
          at: Date.now(),
          active: Number(res.activeConnections) || 0,
          cache: Number(res.cacheHitRatio) || 0,
        });
        if (S.perf.history.length > 60) S.perf.history.shift();
      }
    } catch (error) {
      S.perf.error = error.message;
      S.perf.data = null;
    } finally {
      S.perf.loading = false;
    }
  }

  async function loadDetail(payload) {
    S.explorer.detail = { loading: true, ...payload };
    OD.app?.rerender?.();
    try {
      let res;
      if (payload.kind === 'redis-key') {
        res = await api.databases.redisKey({ id: S.selected.explorer, key: payload.name });
      } else if (payload.kind === 'collection' || payload.kind === 'index' || payload.kind === 'document') {
        res = await api.databases.tableData({
          id: S.selected.explorer,
          database: S.explorer.database,
          table: payload.name,
          limit: 50,
        });
      } else if (payload.kind === 'view') {
        res = await api.databases.tableData({
          id: S.selected.explorer,
          database: S.explorer.database,
          schema: payload.schema,
          table: payload.name,
          limit: 100,
        });
      } else if (payload.kind === 'table') {
        res = await api.databases.tableData({
          id: S.selected.explorer,
          database: S.explorer.database,
          schema: payload.schema,
          table: payload.name,
          limit: S.limits.tablePage || 200,
        });
      } else {
        res = { ok: true, rows: [], columns: [] };
      }
      if (res?.ok === false) throw new Error(res.error || 'Could not read the object.');
      S.explorer.detail = { ...payload, data: res, loading: false };
    } catch (error) {
      S.explorer.detail = { ...payload, error: error.message, loading: false };
    }
    OD.app?.rerender?.();
  }

  // ------------------------------------------------------------------ pages
  function dashboardPage() {
    const connected = S.connections.filter(isConnected).length;
    const discovered = S.discovery
      ? (S.discovery.counts?.docker || 0) + (S.discovery.counts?.local || 0) + (S.discovery.counts?.kubernetes || 0)
      : 0;
    const recent = S.connections
      .filter((connection) => connection.lastConnectedAt)
      .sort((a, b) => String(b.lastConnectedAt).localeCompare(String(a.lastConnectedAt)))
      .slice(0, 5);
    const cards = [
      U.statCard({ label: 'Connections', value: fmtNumber(S.connections.length), icon: 'database', tone: 'orange', sub: `${S.stats.favorites || 0} favorite${(S.stats.favorites || 0) === 1 ? '' : 's'}` }),
      U.statCard({ label: 'Connected now', value: `${connected}/${S.connections.length}`, icon: 'plug', tone: 'green', sub: connected ? 'Live sessions in this window' : 'No open sessions' }),
      U.statCard({ label: 'Engines available', value: fmtNumber(S.engines.filter((engine) => engine.supported).length), icon: 'layers', tone: 'cyan', sub: `${S.engines.filter((engine) => engine.planned).length} planned, not advertised` }),
      U.statCard({ label: 'Discovered databases', value: S.discovery ? fmtNumber(discovered) : '—', icon: 'radar', tone: 'violet', sub: S.discovery ? `${S.discovery.counts?.docker || 0} Docker · ${S.discovery.counts?.local || 0} local · ${S.discovery.counts?.kubernetes || 0} Kubernetes` : 'Scanning…' }),
    ].join('');

    const health = dataTable({
      rows: S.connections.slice(0, 10),
      emptyTitle: 'No connections yet',
      emptyBody: 'Create a profile for a local, Docker, Kubernetes or remote database.',
      columns: [
        { label: 'Connection', render: (row) => `<div class="cell-main">${icon('database', 14)}<a href="#/databases/explorer?connection=${esc(row.id)}">${esc(row.name)}</a></div>` },
        { label: 'Engine', render: (row) => engineBadge(row.engine) },
        { label: 'Status', render: (row) => statusBadge(row) },
        { label: 'Last connected', render: (row) => esc(row.lastConnectedAt ? timeAgo(row.lastConnectedAt) : 'never') },
        { label: '', render: (row) => `<div class="row-actions">${isConnected(row)
          ? U.iconButton({ icon: 'plug-zap', title: 'Disconnect', attrs: `data-db-disconnect="${esc(row.id)}"` })
          : U.iconButton({ icon: 'play', title: 'Connect', attrs: `data-db-connect="${esc(row.id)}"` })}${U.iconButton({ icon: 'activity', title: 'Performance', attrs: `data-db-goto="#/databases/performance?connection=${esc(row.id)}"` })}</div>` },
      ],
    });

    const discovery = S.discovery
      ? `<div class="db-discovery-grid">
          ${discoveryCard('Docker', 'box', 'docker', S.discovery.docker)}
          ${discoveryCard('Local services', 'server', 'local', S.discovery.local)}
          ${discoveryCard('Kubernetes', 'cloud', 'kubernetes', S.discovery.kubernetes)}
        </div>`
      : U.skeleton({ lines: 5 });

    const recentActivity = dataTable({
      rows: (S.activity.length ? S.activity : []).slice(0, 6),
      emptyTitle: 'No activity recorded yet',
      emptyBody: 'Connections, queries and schema changes are logged here.',
      columns: [
        { label: 'When', render: (row) => `<span title="${esc(fmtDateTime(row.at))}">${esc(timeAgo(row.at))}</span>` },
        { label: 'Operation', render: (row) => U.badge(row.kind, row.status === 'success' ? 'green' : row.status === 'warning' ? 'amber' : 'red') },
        { label: 'Connection', render: (row) => esc(row.connectionName || '—') },
        { label: 'Message', render: (row) => `<span class="muted">${esc(truncate(row.message, 120))}</span>` },
      ],
    });

    return `<div class="page">
      ${pageHead({
        title: 'Database dashboard',
        sub: 'One control plane for local, Docker, Kubernetes and remote databases.',
        actions: `${U.button({ label: 'Discover', icon: 'radar', size: 'sm', attrs: 'data-db-discover' })}${newConnectionButton()}${refreshButton()}`,
      })}
      ${S.bootError ? U.errorBanner('Database service', S.bootError) : ''}
      ${S.vault ? U.infoBanner(
        S.vault.secureStorage ? 'Credentials protected by the OS keyring' : 'Credentials encrypted with AES-256-GCM',
        S.vault.secureStorage
          ? 'Passwords are stored through Electron safeStorage and never cross into the renderer.'
          : 'No OS keyring is available, so OpsDeck uses a local AES-256-GCM key file with 0600 permissions. Passwords never reach the renderer.',
        S.vault.secureStorage ? 'success' : 'warning',
      ) : ''}
      <div class="stat-grid">${cards}</div>
      ${S.discoveryError ? U.errorBanner('Discovery unavailable', S.discoveryError) : ''}
      ${U.sectionHead({ eyebrow: 'Sources', icon: 'radar', title: 'Discovery', sub: 'Databases found from Docker, host services and the selected Kubernetes context.' })}
      ${discovery}
      ${U.sectionHead({ eyebrow: 'Health', icon: 'activity', title: 'Connection health', action: `<a class="btn btn-ghost btn-sm" href="#/databases/connections">All connections ${icon('chevron-right', 13)}</a>` })}
      ${U.card({ bodyClass: 'flush', body: health })}
      ${U.sectionHead({ eyebrow: 'Audit', icon: 'history', title: 'Recent activity', action: `<a class="btn btn-ghost btn-sm" href="#/databases/activity">Open log ${icon('chevron-right', 13)}</a>` })}
      ${U.card({ bodyClass: 'flush', body: recentActivity })}
      ${recent.length ? `<p class="db-footnote">${icon('clock', 12)} Last connected: ${recent.map((connection) => `<a href="#/databases/explorer?connection=${esc(connection.id)}">${esc(connection.name)}</a>`).join(' · ')}</p>` : ''}
    </div>`;
  }

  function discoveryCard(title, iconName, kind, result) {
    const items = result?.items || [];
    const up = items.filter((item) => item.kind === 'kubernetes' ? item.kubernetes?.status === 'Running' : item.network?.reachable).length;
    return `<a class="db-discovery-card" href="#/databases/${esc(kind)}">
      <div class="db-discovery-head">${U.iconChip(iconName, kind === 'docker' ? 'cyan' : kind === 'local' ? 'slate' : 'violet', 30)}<span>${esc(title)}</span></div>
      <div class="db-discovery-value">${result?.ok === false ? 'unavailable' : `${items.length} database${items.length === 1 ? '' : 's'}`}</div>
      <div class="db-discovery-sub">${result?.ok === false ? esc(truncate(result.error || 'Not available', 70)) : `${up} reachable · ${items.length - up} not reachable`}</div>
    </a>`;
  }

  function connectionsPage() {
    const groups = new Map();
    for (const connection of S.connections) {
      const key = connection.group || 'Ungrouped';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(connection);
    }
    const rows = S.connections.filter((connection) => connection.favorite);
    const favorites = rows.length
      ? `<div class="db-favorites">${rows.map((connection) => `<button type="button" class="db-fav" data-db-goto="#/databases/explorer?connection=${esc(connection.id)}">${icon('star', 13)}${esc(connection.name)}<span>${esc(engineMeta(connection.engine).label)}</span></button>`).join('')}</div>`
      : '';

    const sections = [...groups.entries()].map(([group, items]) => U.card({
      title: group,
      icon: 'folder',
      sub: `${items.length} connection${items.length === 1 ? '' : 's'}`,
      bodyClass: 'flush',
      body: dataTable({
        rows: items,
        emptyTitle: 'Empty group',
        columns: [
          { label: 'Name', render: (row) => `<div class="cell-main"><button type="button" class="db-star ${row.favorite ? 'active' : ''}" data-db-favorite="${esc(row.id)}" title="${row.favorite ? 'Remove favorite' : 'Add favorite'}" aria-label="Favorite">${icon('star', 14)}</button><button type="button" class="link-like" data-db-open="${esc(row.id)}">${esc(row.name)}</button></div>` },
          { label: 'Engine', render: (row) => engineBadge(row.engine) },
          { label: 'Target', render: (row) => `<span class="mono">${esc(row.engine === 'sqlite' ? row.file : `${row.host || '—'}${row.port ? `:${row.port}` : ''}`)}</span>` },
          { label: 'Source', render: (row) => U.badge(row.source?.type || 'manual', 'slate') },
          { label: 'Status', render: (row) => `${statusBadge(row)}${row.readOnly ? ` ${U.badge('read-only', 'amber')}` : ''}` },
          { label: '', render: (row) => `<div class="row-actions">
            ${isConnected(row)
              ? U.iconButton({ icon: 'plug-zap', title: 'Disconnect', attrs: `data-db-disconnect="${esc(row.id)}"` })
              : U.iconButton({ icon: 'play', title: 'Connect', attrs: `data-db-connect="${esc(row.id)}"` })}
            ${U.iconButton({ icon: 'activity', title: 'Diagnostics', attrs: `data-db-goto="#/databases/diagnostics?connection=${esc(row.id)}"` })}
            ${U.iconButton({ icon: 'edit', title: 'Edit connection', attrs: `data-db-open="${esc(row.id)}"` })}
            ${U.iconButton({ icon: 'copy', title: 'Duplicate', attrs: `data-db-duplicate="${esc(row.id)}"` })}
            ${U.iconButton({ icon: 'trash', title: 'Delete connection', attrs: `data-db-delete="${esc(row.id)}"` })}
          </div>` },
        ],
      }),
    })).join('');

    return `<div class="page">
      ${pageHead({
        title: 'Connections',
        sub: 'Profiles are stored locally; passwords stay encrypted in the main process.',
        actions: `${U.button({ label: 'Import', icon: 'download', size: 'sm', attrs: 'data-db-import-connections' })}${U.button({ label: 'Export', icon: 'upload', size: 'sm', attrs: 'data-db-export-connections' })}${newConnectionButton()}${refreshButton()}`,
      })}
      ${favorites ? `<div class="db-toolbar"><span class="db-toolbar-label">${icon('star', 13)} Favorites</span>${favorites}</div>` : ''}
      ${sections || U.card({ body: U.empty({ icon: 'database', title: 'No connection profiles', body: 'Add PostgreSQL, MySQL/MariaDB, SQLite, MongoDB, Redis, Elasticsearch or OpenSearch. Planned engines are listed but cannot be connected to until an adapter exists.', action: newConnectionButton() }) })}
    </div>`;
  }

  function explorerPage() {
    const connectionId = S.selected.explorer;
    const connection = connById(connectionId);
    if (!S.connections.length) {
      return `<div class="page">${pageHead({ title: 'Database explorer', actions: newConnectionButton() })}${U.card({ body: U.empty({ icon: 'database', title: 'No connections yet', body: 'Create a connection first, then browse databases, schemas and tables here.', action: newConnectionButton() }) })}</div>`;
    }
    return `<div class="page db-page-wide">
      ${pageHead({
        title: 'Database explorer',
        sub: connection ? `${connection.name} · ${engineMeta(connection.engine).label}` : 'Choose a connection.',
        actions: `${connectionSelect('explorer-connection', connectionId)}${refreshButton('data-db-explore-refresh')}`,
      })}
      ${!connection ? U.card({ body: U.empty({ icon: 'mouse-pointer-click', title: 'Select a connection', body: 'Pick a saved connection to browse its databases.' }) }) : `
        <div class="db-toolbar">
          <span class="db-toolbar-label">${icon('database', 13)} Database</span>
          ${databaseSelect('explorer-database', connection, S.explorer.database)}
          <input class="input input-sm db-search" data-db-filter="explorer" placeholder="Filter tables, views, keys…" value="${esc(S.explorer.filter)}">
          ${S.explorer.data?.engine === 'redis' ? `<input class="input input-sm db-search" data-db-redis-pattern placeholder="SCAN pattern" value="${esc(S.explorer.redis.pattern)}">` : ''}
          ${S.explorer.loading ? U.loader('Reading metadata…') : ''}
        </div>
        ${S.explorer.error ? U.errorBanner('Explorer error', S.explorer.error) : ''}
        <div class="db-split">
          <div class="db-tree" data-db-tree>${explorerTree(S.explorer.data, connection)}</div>
          <div class="db-detail">${explorerDetail()}</div>
        </div>
      `}
    </div>`;
  }

  function explorerTree(data, connection) {
    if (!data) return U.empty({ icon: 'search', title: 'No metadata yet', body: 'Select a database or refresh to read its objects.', compact: true });
    if (data.engine === 'redis') return redisTree();
    if (data.engine === 'mongodb') return mongoTree(data);
    if (data.engine === 'elasticsearch' || data.engine === 'opensearch') return elasticTree(data);
    return relationalTree(data, connection);
  }

  function treeNode(opts) {
    return `<div class="db-node ${opts.class || ''}">
      <button type="button" class="db-node-main" ${opts.attrs || ''}>
        ${icon(opts.icon || 'chevron-right', 12, 'db-node-chevron')}
        ${icon(opts.objectIcon || 'table', 13)}
        <span class="db-node-label" title="${esc(opts.title || opts.label || '')}">${esc(opts.label || '')}</span>
        ${opts.badge ? `<span class="db-node-badge">${esc(opts.badge)}</span>` : ''}
      </button>
      ${opts.children ? `<div class="db-node-children">${opts.children}</div>` : ''}
    </div>`;
  }

  function relationalTree(data, connection) {
    const schemas = data.schemas || [];
    const relations = data.relations || [];
    const columns = data.columns || [];
    const indexes = data.indexes || [];
    const triggers = data.triggers || [];
    const routines = data.routines || [];
    const sequences = data.sequences || [];
    const users = data.users || [];
    const extensions = data.extensions || [];
    const roleMembers = data.roleMembers || [];
    const groups = schemas.length ? schemas : ['main'];
    const body = groups.map((schema) => {
      const schemaRelations = relations.filter((relation) => (relation.schema || schema) === schema);
      const tables = schemaRelations.filter((relation) => relation.kind !== 'view' && relation.kind !== 'materialized view');
      const views = schemaRelations.filter((relation) => relation.kind === 'view' || relation.kind === 'materialized view');
      const schemaIndexes = indexes.filter((index) => (index.schema || schema) === schema);
      const schemaTriggers = triggers.filter((trigger) => (trigger.schema || schema) === schema);
      const schemaRoutines = routines.filter((routine) => (routine.schema || schema) === schema);
      const schemaSequences = sequences.filter((sequence) => (sequence.schema || schema) === schema);
      const countFor = (name) => columns.filter((column) => (column.schema || schema) === name).length;
      return treeNode({
        label: schema,
        icon: 'folder',
        objectIcon: 'folder-tree',
        class: 'open',
        badge: `${schemaRelations.length}`,
        children: [
          treeNode({
            label: 'Tables', icon: 'chevron-down', objectIcon: 'table', class: 'open', badge: `${tables.length}`,
            children: tables.map((table) => treeNode({
              label: table.name,
              icon: 'chevron-right',
              objectIcon: 'table',
              badge: table.row_estimate != null ? fmtNumber(table.row_estimate) : '',
              attrs: `data-db-object="table" data-schema="${esc(schema)}" data-name="${esc(table.name)}"`,
            })).join('') || '<div class="db-node-empty">No tables</div>',
          }),
          views.length ? treeNode({
            label: 'Views', icon: 'chevron-down', objectIcon: 'eye', class: 'open', badge: `${views.length}`,
            children: views.map((view) => treeNode({
              label: view.name, icon: 'chevron-right', objectIcon: 'eye',
              attrs: `data-db-object="view" data-schema="${esc(schema)}" data-name="${esc(view.name)}"`,
            })).join(''),
          }) : '',
          schemaIndexes.length ? treeNode({
            label: 'Indexes', icon: 'chevron-down', objectIcon: 'list-tree', class: 'open', badge: `${schemaIndexes.length}`,
            children: schemaIndexes.slice(0, 300).map((index) => treeNode({
              label: index.name, title: index.definition || '', icon: 'chevron-right', objectIcon: 'list-tree',
            })).join(''),
          }) : '',
          schemaRoutines.length ? treeNode({
            label: 'Functions & procedures', icon: 'chevron-down', objectIcon: 'function-square', class: 'open', badge: `${schemaRoutines.length}`,
            children: schemaRoutines.slice(0, 200).map((routine) => treeNode({
              label: `${routine.name}${routine.arguments ? `(${routine.arguments})` : ''}`, icon: 'chevron-right',
              objectIcon: routine.kind === 'procedure' ? 'square-function' : 'function-square',
            })).join(''),
          }) : '',
          schemaTriggers.length ? treeNode({
            label: 'Triggers', icon: 'chevron-down', objectIcon: 'zap', class: 'open', badge: `${schemaTriggers.length}`,
            children: schemaTriggers.slice(0, 200).map((trigger) => treeNode({
              label: `${trigger.table || ''}${trigger.table ? ' · ' : ''}${trigger.name}`, icon: 'chevron-right', objectIcon: 'zap',
            })).join(''),
          }) : '',
          schemaSequences.length ? treeNode({
            label: 'Sequences', icon: 'chevron-down', objectIcon: 'hash', class: 'open', badge: `${schemaSequences.length}`,
            children: schemaSequences.slice(0, 200).map((sequence) => treeNode({
              label: sequence.name, icon: 'chevron-right', objectIcon: 'hash',
            })).join(''),
          }) : '',
        ].join(''),
      });
    }).join('');

    const databaseLevel = [
      users.length ? treeNode({
        label: 'Users & roles', icon: 'chevron-right', objectIcon: 'users', badge: `${users.length}`,
        children: users.slice(0, 200).map((user) => treeNode({
          label: `${user.name}${user.superuser ? ' · superuser' : ''}`, icon: 'chevron-right', objectIcon: 'user',
          title: roleMembers.filter((member) => member.member === user.name).map((member) => member.role).join(', '),
        })).join(''),
      }) : '',
      extensions.length ? treeNode({
        label: 'Extensions', icon: 'chevron-right', objectIcon: 'puzzle', badge: `${extensions.length}`,
        children: extensions.map((extension) => treeNode({ label: `${extension.name} ${extension.version || ''}`.trim(), icon: 'chevron-right', objectIcon: 'puzzle' })).join(''),
      }) : '',
    ].join('');

    return `<div class="db-tree-scroll">${body}${databaseLevel}</div>`;
  }

  function mongoTree(data) {
    const collections = data.collections || [];
    return `<div class="db-tree-scroll">
      ${collections.map((collection) => treeNode({
        label: collection.name,
        icon: 'chevron-right',
        objectIcon: collection.kind === 'view' ? 'eye' : 'box',
        badge: collection.count != null ? fmtNumber(collection.count) : '',
        attrs: `data-db-object="${esc(collection.kind || 'collection')}" data-name="${esc(collection.name)}"`,
      })).join('') || '<div class="db-node-empty">No collections</div>'}
      ${(data.databases || []).length > 1 ? `<div class="db-tree-split">${data.databases.map((db) => `<button type="button" class="db-db-chip" data-db-database="${esc(db.name)}">${icon('database', 12)}${esc(db.name)} <span>${fmtBytes(db.sizeBytes)}</span></button>`).join('')}</div>` : ''}
    </div>`;
  }

  function elasticTree(data) {
    const indices = data.indices || [];
    return `<div class="db-tree-scroll">
      ${indices.map((index) => treeNode({
        label: index.name,
        icon: 'chevron-right',
        objectIcon: 'layers',
        badge: index.documents != null ? fmtNumber(index.documents) : '',
        attrs: `data-db-object="index" data-name="${esc(index.name)}"`,
      })).join('') || '<div class="db-node-empty">No indices</div>'}
    </div>`;
  }

  function redisTree() {
    const keys = S.explorer.redis.keys || [];
    return `<div class="db-tree-scroll">
      <div class="db-node-open">${keys.map((key) => treeNode({
        label: key.key,
        icon: 'chevron-right',
        objectIcon: redisIcon(key.type),
        badge: key.ttl > 0 ? `${key.ttl}s` : '',
        title: `${key.type} · ${fmtBytes(key.memoryBytes)}`,
        attrs: `data-db-object="redis-key" data-name="${esc(key.key)}"`,
      })).join('')}${keys.length ? '' : '<div class="db-node-empty">No keys matched this pattern.</div>'}</div>
      <button type="button" class="btn btn-ghost btn-sm db-wide" data-db-redis-more ${S.explorer.redis.cursor === '0' ? 'disabled' : ''}>${icon('chevron-down', 13)}${S.explorer.redis.cursor === '0' ? 'End of SCAN' : `Load more (cursor ${esc(S.explorer.redis.cursor)})`}</button>
    </div>`;
  }

  function redisIcon(type) {
    return ['string', 'list', 'set', 'zset', 'hash', 'stream'].includes(type) ? (type === 'zset' ? 'bar-chart' : type === 'hash' ? 'brackets' : 'key') : 'key';
  }

  function explorerDetail() {
    const detail = S.explorer.detail;
    if (!detail) {
      return U.empty({ icon: 'mouse-pointer-click', title: 'Inspect an object', body: 'Choose a table, view, collection, index or Redis key from the tree to read it.' });
    }
    if (detail.loading) return U.loader('Loading object…');
    if (detail.error) return U.errorBanner('Could not read the object', detail.error);
    if (detail.kind === 'redis-key') return redisKeyDetail(detail);
    const data = detail.data || {};
    const columns = parseColumns(data);
    return `<div class="db-detail-head">
        <div><div class="eyebrow">${icon('table', 12)}${esc(titleCase(detail.kind))}</div><h2 class="db-detail-title">${esc(detail.schema ? `${detail.schema}.` : '')}${esc(detail.name)}</h2></div>
        <div class="db-detail-actions">${U.button({ label: 'Query', icon: 'terminal', size: 'sm', attrs: `data-db-query-object="${esc(detail.kind)}" data-schema="${esc(detail.schema || '')}" data-name="${esc(detail.name)}"` })}${U.button({ label: 'Copy name', icon: 'copy', size: 'sm', attrs: `data-db-copy="${esc(detail.name)}"` })}</div>
      </div>
      ${data.total != null || data.rowCount != null ? `<div class="db-detail-meta">${U.badge(`${fmtNumber(data.rowCount ?? 0)} rows shown`, 'slate')}${data.total != null ? U.badge(`${fmtNumber(data.total)} total`, 'slate') : ''}${data.truncated ? U.badge('bounded', 'amber') : ''}</div>` : ''}
      ${columns.length ? `<div class="table-wrap db-result"><table class="data-table"><thead><tr>${columns.map((name) => `<th>${esc(name)}</th>`).join('')}</tr></thead>
        <tbody>${(data.rows || []).slice(0, 200).map((row) => `<tr>${columns.map((name) => `<td>${cellValue(row[name])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
        : `<pre class="db-json">${esc(JSON.stringify(data.rows || data.items || data, null, 2).slice(0, 20000))}</pre>`}
    `;
  }

  function redisKeyDetail(detail) {
    const data = detail.data || {};
    const meta = [
      ['Type', U.badge(data.type || 'unknown', 'cyan')],
      ['TTL', data.ttl > 0 ? `${data.ttl}s` : data.ttl === -1 ? 'no expiry' : 'missing'],
      ['Memory', data.memoryBytes != null ? fmtBytes(data.memoryBytes) : '—'],
      ['Encoding', data.encoding || '—'],
      ['Length', data.count != null ? fmtNumber(data.count) : '—'],
    ];
    let body;
    if (data.type === 'string') body = `<pre class="db-json">${esc(data.value || '')}</pre>`;
    else if (data.type === 'hash') body = dataTable({ rows: data.items || [], columns: [{ label: 'Field', key: 'field', render: (row) => cellValue(row.field) }, { label: 'Value', key: 'value', render: (row) => cellValue(row.value) }] });
    else if (data.type === 'zset') body = dataTable({ rows: data.items || [], columns: [{ label: 'Member', key: 'member', render: (row) => cellValue(row.member) }, { label: 'Score', key: 'score', render: (row) => cellValue(row.score) }] });
    else if (data.type === 'stream') body = `<pre class="db-json">${esc(JSON.stringify(data.items || [], null, 2))}</pre>`;
    else body = `<pre class="db-json">${esc(JSON.stringify(data.items || [], null, 2))}</pre>`;
    return `<div class="db-detail-head">
      <div><div class="eyebrow">${icon('key', 12)}Redis key</div><h2 class="db-detail-title mono">${esc(data.key || detail.name)}</h2></div>
      <div class="db-detail-actions">${U.button({ label: 'Edit TTL', icon: 'clock', size: 'sm', attrs: `data-db-redis-ttl="${esc(detail.name)}"` })}${U.button({ label: 'Delete', icon: 'trash', size: 'sm', variant: 'danger', attrs: `data-db-redis-delete="${esc(detail.name)}"` })}</div>
    </div>
    ${U.kvRows(meta)}
    <div class="db-detail-body">${body}</div>`;
  }

  function editorPage() {
    const connectionId = S.selected.editor;
    const connection = connById(connectionId);
    const result = S.editor.result;
    const columns = parseColumns(result);
    const engine = connection ? engineMeta(connection.engine) : null;
    const dialect = engine?.dialect || (engine ? 'sql' : 'sql');
    return `<div class="page db-page-wide">
      ${pageHead({
        title: 'SQL editor',
        sub: connection ? `${connection.name} · ${engine.label}${connection.readOnly ? ' · read-only profile' : ''}` : 'Choose a connection to run queries.',
        actions: `${connectionSelect('editor-connection', connectionId)}${databaseSelect('editor-database', connection, S.editor.database)}${refreshButton('data-db-editor-refresh')}`,
      })}
      ${!connection ? U.card({ body: U.empty({ icon: 'terminal', title: 'Select a connection', body: 'The editor needs an open connection profile. OpsDeck will open it on demand.' }) }) : `
        ${connection.engine === 'redis' || connection.engine === 'mongodb' || connection.engine === 'elasticsearch' || connection.engine === 'opensearch'
          ? U.infoBanner(`${engine.label} console`, connection.engine === 'redis' ? 'Enter Redis commands such as SCAN 0 MATCH user:* COUNT 100. KEYS with broad patterns and FLUSH commands are blocked.' : connection.engine === 'mongodb' ? 'Enter a MongoDB command object, for example {"count":"users"} or {"find":"users","filter":{},"limit":10}.' : 'Enter an Elasticsearch search body, for example {"query":{"match_all":{}},"size":10}.', 'info')
          : ''}
        <div class="db-editor">
          <div class="db-editor-bar">
            <span class="db-editor-dialect">${U.badge(dialect, 'cyan', { mono: true })}</span>
            <span class="db-editor-hint">${icon('keyboard', 12)} Ctrl+Enter runs · select text to run only that statement</span>
            <div class="db-editor-actions">
              ${U.button({ label: S.editor.running ? 'Running…' : 'Run', icon: 'play', size: 'sm', variant: 'primary', attrs: `data-db-run ${S.editor.running ? 'disabled' : ''}` })}
              ${U.button({ label: 'Run selection', icon: 'text-select', size: 'sm', attrs: 'data-db-run-selection' })}
              ${U.button({ label: 'Explain', icon: 'git-branch', size: 'sm', attrs: 'data-db-explain' })}
              ${U.button({ label: 'Cancel', icon: 'square', size: 'sm', variant: 'ghost', attrs: 'data-db-cancel' })}
            </div>
          </div>
          <textarea class="db-sql" data-db-sql spellcheck="false" placeholder="${esc(connection.engine === 'redis' ? 'SCAN 0 MATCH * COUNT 100' : connection.engine === 'mongodb' ? '{ "count": "users" }' : 'SELECT * FROM …')}">${esc(S.editor.sql)}</textarea>
        </div>
        ${S.editor.error ? U.errorBanner('Query failed', S.editor.error, U.button({ label: 'Copy error', icon: 'copy', size: 'sm', attrs: `data-db-copy="${esc(S.editor.error)}"` })) : ''}
        ${S.editor.explain ? U.card({
          title: 'Execution plan',
          icon: 'git-branch',
          actions: U.button({ label: 'Copy', icon: 'copy', size: 'sm', attrs: `data-db-copy="${esc(S.editor.explain.text || '')}"` }),
          body: `<pre class="db-json db-plan">${esc(S.editor.explain.text || JSON.stringify(S.editor.explain.plan, null, 2))}</pre>`,
        }) : ''}
        ${result ? resultView(result, columns) : U.card({ body: U.empty({ icon: 'table', title: 'Results appear here', body: 'Run a statement to see rows, timings and execution statistics. Result sets are bounded before they leave the main process.', compact: true }) })}
      `}
    </div>`;
  }

  function resultView(result, columns) {
    const rows = result.rows || [];
    const view = S.editor.view;
    const search = S.editor.search.trim().toLowerCase();
    let filtered = rows;
    if (search) {
      filtered = rows.filter((row) => columns.some((name) => String(row[name] ?? '').toLowerCase().includes(search)));
    }
    const sort = S.editor.sort;
    if (sort && columns.includes(sort.column)) {
      filtered = [...filtered].sort((a, b) => {
        const left = a[sort.column];
        const right = b[sort.column];
        if (left === right) return 0;
        if (left === null || left === undefined) return sort.dir === 'desc' ? 1 : -1;
        if (right === null || right === undefined) return sort.dir === 'desc' ? -1 : 1;
        const cmp = typeof left === 'number' && typeof right === 'number' ? left - right : String(left).localeCompare(String(right));
        return sort.dir === 'desc' ? -cmp : cmp;
      });
    }
    const pageSize = 100;
    const pages = Math.max(1, Math.ceil(filtered.length / pageSize));
    const page = Math.min(S.editor.page, pages - 1);
    const pageRows = filtered.slice(page * pageSize, page * pageSize + pageSize);

    const table = view === 'table'
      ? `<div class="table-wrap db-result"><table class="data-table db-result-table"><thead><tr>${columns.map((name) => {
          const active = sort?.column === name;
          return `<th><button type="button" class="db-sort ${active ? 'active' : ''}" data-db-sort="${esc(name)}">${esc(name)}${active ? icon(sort.dir === 'desc' ? 'chevron-down' : 'chevron-up', 11) : ''}</button></th>`;
        }).join('')}</tr></thead>
        <tbody>${pageRows.map((row) => `<tr>${columns.map((name) => `<td>${cellValue(row[name])}</td>`).join('')}</tr>`).join('')}</tbody></table></div>`
      : view === 'json'
        ? `<pre class="db-json">${esc(JSON.stringify(filtered.slice(0, 500), null, 2))}</pre>`
        : `<pre class="db-json">${esc(filtered.slice(0, 500).map((row) => JSON.stringify(row)).join('\n'))}</pre>`;

    const meta = [
      U.badge(`${fmtNumber(result.rowCount ?? rows.length)} rows`, 'slate', { mono: true }),
      result.totalRows != null && result.totalRows !== result.rowCount ? U.badge(`${fmtNumber(result.totalRows)} returned`, 'amber', { mono: true }) : '',
      result.durationMs != null ? U.badge(fmtDuration(result.durationMs), 'cyan', { mono: true }) : '',
      result.affectedRows ? U.badge(`${fmtNumber(result.affectedRows)} affected`, 'amber') : '',
      result.truncated ? U.badge('truncated by row limit', 'amber') : '',
      result.command ? U.badge(result.command, 'slate') : '',
    ].filter(Boolean).join('');

    return U.card({
      title: 'Query results',
      icon: 'table',
      sub: `${S.editor.durationMs ? `Round trip ${fmtDuration(S.editor.durationMs)}` : ''}`,
      actions: `${U.tabs([
        { id: 'table', label: 'Table', icon: 'table' },
        { id: 'json', label: 'JSON', icon: 'braces' },
        { id: 'raw', label: 'Raw', icon: 'file-code' },
      ], view, 'db-result-view')}
        <input class="input input-sm db-result-search" data-db-result-search placeholder="Search results…" value="${esc(S.editor.search)}">
        ${U.button({ label: 'CSV', icon: 'download', size: 'sm', attrs: 'data-db-export-result="csv"' })}
        ${U.button({ label: 'JSON', icon: 'download', size: 'sm', attrs: 'data-db-export-result="json"' })}
        ${U.button({ label: 'SQL', icon: 'download', size: 'sm', attrs: 'data-db-export-result="sql"' })}`,
      bodyClass: 'flush',
      body: `<div class="db-result-meta">${meta || ''}</div>${columns.length
        ? `${table}${pages > 1 ? `<div class="db-pager"><button type="button" class="btn btn-ghost btn-sm" data-db-page="-1" ${page === 0 ? 'disabled' : ''}>${icon('chevron-left', 13)}Previous</button><span>Page ${page + 1} of ${pages}</span><button type="button" class="btn btn-ghost btn-sm" data-db-page="1" ${page >= pages - 1 ? 'disabled' : ''}>Next${icon('chevron-right', 13)}</button></div>` : ''}`
        : U.empty({
          icon: 'check',
          title: 'Statement completed',
          body: `${fmtNumber(result.affectedRows ?? 0)} row${(result.affectedRows ?? 0) === 1 ? '' : 's'} affected. This statement returned no result set.`,
          compact: true,
        })}`,
    });
  }

  function historyPage() {
    const rows = S.history;
    const table = dataTable({
      rows,
      emptyTitle: 'No queries recorded yet',
      emptyBody: 'Successful and failed statements from the SQL editor are recorded here, with credential-looking values redacted.',
      columns: [
        { label: 'When', render: (row) => `<span title="${esc(fmtDateTime(row.at))}">${esc(timeAgo(row.at))}</span>` },
        { label: 'Connection', render: (row) => `<span>${esc(row.connectionName || '—')}</span><div class="muted mono">${esc(row.engine || '')}</div>` },
        { label: 'Status', render: (row) => U.badge(row.ok ? 'success' : 'failed', row.ok ? 'green' : 'red') },
        { label: 'Rows', render: (row) => esc(row.rowCount != null ? fmtNumber(row.rowCount) : '—') },
        { label: 'Duration', render: (row) => `<span class="mono">${esc(row.durationMs != null ? fmtDuration(row.durationMs) : '—')}</span>` },
        { label: 'Statement', render: (row) => `<span class="mono db-sql-cell" title="${esc(row.sql)}">${esc(truncate(row.sql, 180))}</span>${row.error ? `<div class="db-row-error">${esc(truncate(row.error, 160))}</div>` : ''}` },
        { label: '', render: (row) => `<div class="row-actions">${U.iconButton({ icon: 'terminal', title: 'Open in editor', attrs: `data-db-reuse="${esc(row.id)}"` })}${U.iconButton({ icon: 'copy', title: 'Copy SQL', attrs: `data-db-copy="${esc(row.sql)}"` })}</div>` },
      ],
    });
    return `<div class="page">
      ${pageHead({ title: 'Query history', sub: 'Statements executed through OpsDeck on this host.', actions: `${U.button({ label: 'Clear history', icon: 'trash', size: 'sm', variant: 'ghost', attrs: 'data-db-history-clear' })}${refreshButton()}` })}
      ${U.card({ bodyClass: 'flush', body: table })}
    </div>`;
  }

  // A container with no published host port is unreachable from the host by
  // design. Explain the cause and the exact fix instead of offering a Connect
  // action that can only fail.
  function dockerUnreachableHelp(row) {
    const port = row.network?.internalPort || 5432;
    const name = row.container?.name || row.name;
    const image = row.container?.image || '<image>';
    const service = row.compose?.service || '';
    const project = row.compose?.project || '';
    const hostPort = port === 5432 ? 5433 : port + 1;
    const running = Boolean(row.container?.running);

    if (!running) {
      U.modal({
        title: 'This container is not running',
        subtitle: name,
        icon: 'power',
        tone: 'amber',
        body: `<p class="confirm-message">OpsDeck found the database container but Docker reports it as <strong>${esc(row.container?.state || 'stopped')}</strong>. A stopped container cannot accept connections, even when its port is published.</p>
          <p class="confirm-message">Start the container, then rescan and connect.</p>
          ${U.infoBanner('Nothing was changed', 'OpsDeck does not start containers without an explicit action from you.', 'info')}`,
        actions: row.container?.id ? [{
          id: 'start', label: 'Start container', icon: 'play', variant: 'primary',
          onClick: () => api.docker.containerAction(row.container.id, 'start')
            .then((res) => { if (res?.ok === false) U.toast('Start failed', 'error', { description: res?.error }); return loadDiscovery(true); })
            .then(() => OD.app?.rerender?.()),
        }] : [],
      });
      return;
    }

    if (!row.supported) {
      U.modal({
        title: 'No adapter for this engine yet',
        subtitle: name,
        icon: 'puzzle',
        tone: 'amber',
        body: `<p class="confirm-message">The container was detected as <strong>${esc(engineMeta(row.engine).label)}</strong>, but OpsDeck does not ship an adapter for it yet, so it will not fake a connection.</p>
          <p class="confirm-message">Supported today: PostgreSQL, MySQL, MariaDB, SQLite, MongoDB, Redis, Elasticsearch and OpenSearch.</p>`,
      });
      return;
    }

    const composeSnippet = `services:
  ${service || 'postgres'}:
    ports:
      - "${hostPort}:${port}"`;
    const composeCommand = project && service
      ? `docker compose -p ${project} up -d ${service}`
      : 'docker compose up -d';
    const runCommand = `docker run -d --name ${name} -p ${hostPort}:${port} ${image}`;

    U.modal({
      title: 'Publish a host port to connect',
      subtitle: `${name} · ${row.engine}`,
      icon: 'network',
      tone: 'amber',
      width: '620px',
      body: `<p class="confirm-message">The database listens on <strong>${esc(String(port))}/tcp</strong> inside the Docker network, but the container was created <strong>without a published host port</strong>. Nothing on your machine is listening on a host port for it, so there is no address OpsDeck can connect to.</p>
        ${U.infoBanner('Why not use the container IP?', 'Bridge IPs such as 172.x are only routable from inside that Docker network. OpsDeck refuses to guess them because the connection would fail or reach the wrong service.', 'info')}
        <div class="db-fix-steps">
          <div class="db-fix-step"><span>1</span><div><strong>${project ? 'Edit the Compose service' : 'Recreate the container'}</strong><p>${project ? `Add the <code>ports</code> mapping to the <code>${esc(service || 'database')}</code> service in the Compose project <code>${esc(project)}</code>.` : 'Docker cannot add a published port to an existing container; recreate it with the same volume so the data survives.'}</p></div></div>
          <div class="db-fix-step"><span>2</span><div><strong>Apply the change</strong><p>${project ? 'Compose recreates the service in place and keeps its volumes.' : 'Reuse the existing named volume or bind mount in the new container.'}</p></div></div>
          <div class="db-fix-step"><span>3</span><div><strong>Rescan and connect</strong><p>The row turns reachable and the normal Connect action appears.</p></div></div>
        </div>
        ${project
          ? U.codeBlock({ code: composeSnippet, title: 'compose.yml', note: `Use any free host port; ${hostPort} is only a suggestion.` }) + U.commandLine(composeCommand)
          : U.codeBlock({
            code: runCommand,
            title: 'docker run',
            note: 'Keep the same -v volume mount and environment variables from the current container, otherwise the database starts empty.',
          })}`,
      actions: [{
        id: 'rescan', label: 'Rescan now', icon: 'radar', variant: 'primary',
        onClick: () => loadDiscovery(true).then(() => OD.app?.rerender?.()),
      }],
    });
  }

  function dockerPage() {
    const result = S.discovery?.docker;
    if (!result) return `<div class="page">${pageHead({ title: 'Docker databases', actions: refreshButton() })}${U.skeleton({ lines: 6 })}</div>`;
    if (result.ok === false) return `<div class="page">${pageHead({ title: 'Docker databases', actions: refreshButton() })}${U.errorBanner('Docker discovery unavailable', result.error || 'Docker is not available.')}</div>`;
    const items = result.items || [];
    const projects = result.projects || [];
    const groups = new Map();
    for (const item of items) {
      const key = item.compose?.project || '';
      if (!groups.has(key)) groups.set(key, []);
      groups.get(key).push(item);
    }
    const sections = [...groups.entries()].map(([project, entries]) => U.card({
      title: project ? `Compose project · ${project}` : 'Standalone containers',
      icon: project ? 'boxes' : 'box',
      sub: `${entries.length} database service${entries.length === 1 ? '' : 's'}${project ? ` · ${projects.find((p) => p.name === project)?.status || ''}` : ''}`,
      bodyClass: 'flush',
      body: dataTable({
        rows: entries,
        emptyTitle: 'No databases found',
        columns: [
          { label: 'Database', render: (row) => `<div class="cell-main">${U.iconChip(row.engine === 'redis' ? 'zap' : 'database', engineMeta(row.engine).tone, 26)}<div><div>${esc(row.name)}</div><div class="muted mono">${esc(row.compose?.service || row.container?.shortId || '')}</div></div></div>` },
          { label: 'Engine', render: (row) => `<div>${engineBadge(row.engine)}</div><div>${confidenceBadge(row)}</div>` },
          { label: 'Image', render: (row) => `<span class="mono">${esc(row.container?.image || '—')}</span>` },
          { label: 'Container', render: (row) => `${U.stateBadge(row.container?.state, row.container?.status ? truncate(row.container.status, 28) : '')}<div class="muted mono">${esc(row.container?.shortId || '')}</div>` },
          { label: 'Ports', render: (row) => row.network?.published
            ? `<span class="mono">${esc(`${row.network.host}:${row.network.published.hostPort}`)}</span><div class="muted">→ ${esc(row.network.published.internal)}</div>`
            : `<span class="mono">${esc(String(row.network?.internalPort || ''))}/tcp</span><div>${U.badge('internal only', 'amber')}</div>` },
          { label: 'Storage', render: (row) => row.storage?.persistent ? U.badge(row.storage.namedVolume ? 'volume' : 'bind mount', 'green') : U.badge('ephemeral', 'red') },
          { label: '', render: (row) => {
            const reachable = Boolean(row.network?.reachable);
            return `<div class="row-actions">
            ${row.connectionId
              ? U.button({ label: 'Open', size: 'sm', attrs: `data-db-goto="#/databases/explorer?connection=${esc(row.connectionId)}"` })
              : reachable && row.supported
                ? U.button({ label: 'Connect', size: 'sm', variant: 'primary', attrs: `data-db-discovery-connect="${esc(row.id)}"` })
                : U.button({ label: row.supported ? 'How to connect' : 'Not supported', size: 'sm', variant: 'ghost', icon: 'info', attrs: `data-db-docker-fix="${esc(row.id)}"` })}
            ${U.iconButton({ icon: row.container?.running ? 'square' : 'play', title: row.container?.running ? 'Stop container' : 'Start container', attrs: `data-db-docker-action="${esc(row.container?.id || '')}" data-action="${row.container?.running ? 'stop' : 'start'}"` })}
            ${U.iconButton({ icon: 'refresh', title: 'Restart container', attrs: `data-db-docker-action="${esc(row.container?.id || '')}" data-action="restart"` })}
            ${U.iconButton({ icon: 'scroll-text', title: 'Container logs', attrs: `data-db-docker-logs="${esc(row.container?.id || '')}"` })}
            ${U.iconButton({ icon: 'external-link', title: 'Open in Docker workspace', attrs: `data-db-goto="#/containers"` })}
          </div>`; } },
        ],
      }),
    })).join('');

    return `<div class="page db-page-wide">
      ${pageHead({
        title: 'Docker databases',
        sub: 'Detected from image names, ports, environment variable names, labels and container metadata.',
        actions: `${U.button({ label: 'Rescan', icon: 'radar', size: 'sm', attrs: 'data-db-discover' })}${refreshButton()}`,
      })}
      ${U.infoBanner('Detection, not assumption', 'A running container does not prove the database accepts connections. OpsDeck tests every candidate before saving a profile and refuses to guess credentials.', 'info')}
      ${items.length ? sections : U.card({ body: U.empty({ icon: 'box', title: 'No database containers detected', body: 'Start a database container or publish its port, then rescan.' }) })}
      ${items.some((item) => !item.network?.reachable) ? U.infoBanner('Some databases are not reachable', 'Containers without a published host port cannot be reached from the host, and OpsDeck never guesses bridge IPs. Use “How to connect” on a row for the exact fix, then rescan.', 'warning') : ''}
    </div>`;
  }

  function kubernetesPage() {
    const result = S.discovery?.kubernetes;
    if (!result) return `<div class="page">${pageHead({ title: 'Kubernetes databases', actions: refreshButton() })}${U.skeleton({ lines: 6 })}</div>`;
    if (result.ok === false) return `<div class="page">${pageHead({ title: 'Kubernetes databases', actions: refreshButton() })}${U.errorBanner('Kubernetes discovery unavailable', result.error || 'Kubernetes is not available.')}</div>`;
    if (!result.context) {
      return `<div class="page">${pageHead({ title: 'Kubernetes databases', actions: refreshButton() })}${U.card({ body: U.empty({ icon: 'cloud', title: 'No cluster context selected', body: result.reason || 'Select a context in the Kubernetes workspace first.', action: `<a class="btn btn-primary btn-sm" href="#/kubernetes/contexts">Open contexts</a>` }) })}</div>`;
    }
    const items = result.items || [];
    const table = dataTable({
      rows: items,
      emptyTitle: 'No database workloads detected',
      emptyBody: 'Pods and StatefulSets whose images match a supported database engine will appear here.',
      columns: [
        { label: 'Workload', render: (row) => `<div class="cell-main">${U.iconChip('database', engineMeta(row.engine).tone, 26)}<div><div>${esc(row.name)}</div><div class="muted mono">${esc(row.kubernetes?.namespace || '')}</div></div></div>` },
        { label: 'Engine', render: (row) => `<div>${engineBadge(row.engine)}</div><div>${confidenceBadge(row)}</div>` },
        { label: 'Kind', render: (row) => U.badge(row.kubernetes?.workload ? 'StatefulSet' : 'Pod', 'slate') },
        { label: 'Status', render: (row) => `${U.stateBadge(String(row.kubernetes?.status || '').toLowerCase(), row.kubernetes?.status || '')}<div class="muted">${esc(row.kubernetes?.ready || '')}</div>` },
        { label: 'Access', render: () => U.badge('kubectl port-forward', 'violet') },
        { label: '', render: (row) => `<div class="row-actions">
          ${row.connectionId
            ? U.button({ label: 'Open', size: 'sm', attrs: `data-db-goto="#/databases/explorer?connection=${esc(row.connectionId)}"` })
            : U.button({ label: 'Connect', size: 'sm', variant: 'primary', attrs: `data-db-discovery-connect="${esc(row.id)}"` })}
          ${U.iconButton({ icon: 'external-link', title: 'Open workload in Kubernetes', attrs: `data-db-goto="${row.kubernetes?.workload ? '#/kubernetes/statefulsets' : '#/kubernetes/pods'}"` })}
        </div>` },
      ],
    });
    return `<div class="page db-page-wide">
      ${pageHead({
        title: 'Kubernetes databases',
        sub: `Context ${result.context}${result.namespace ? ` · namespace ${result.namespace}` : ''}`,
        actions: `${U.button({ label: 'Rescan', icon: 'radar', size: 'sm', attrs: 'data-db-discover' })}${refreshButton()}`,
      })}
      ${U.infoBanner('Port forwarding only', 'OpsDeck never assumes Pod IPs are reachable from the host. Connecting starts a controlled kubectl port-forward to 127.0.0.1 using the selected context and namespace, and stops it when you disconnect.', 'info')}
      ${table}
    </div>`;
  }

  function localPage() {
    const result = S.discovery?.local;
    if (!result) return `<div class="page">${pageHead({ title: 'Local databases', actions: refreshButton() })}${U.skeleton({ lines: 5 })}</div>`;
    if (result.ok === false) return `<div class="page">${pageHead({ title: 'Local databases', actions: refreshButton() })}${U.errorBanner('Local discovery unavailable', result.error || 'The host could not be inspected.')}</div>`;
    const items = result.items || [];
    const table = dataTable({
      rows: items,
      emptyTitle: 'No local database services found',
      emptyBody: 'OpsDeck checks listening ports, processes and installed binaries. Docker-hosted databases appear on the Docker page.',
      columns: [
        { label: 'Engine', render: (row) => `<div class="cell-main">${U.iconChip('server', engineMeta(row.engine).tone, 26)}${engineBadge(row.engine)}</div>` },
        { label: 'Endpoint', render: (row) => `<span class="mono">${esc(row.local?.host || '127.0.0.1')}:${esc(row.local?.port || '')}</span>` },
        { label: 'Process', render: (row) => `<span class="mono">${esc(row.local?.process || '—')}</span>` },
        { label: 'Binary', render: (row) => row.local?.installed ? `<span class="mono">${esc(row.local.binaryPath || row.local.binary)}</span>` : U.badge('not on PATH', 'amber') },
        { label: 'State', render: (row) => row.network?.reachable ? U.badge('listening', 'green', { dot: true }) : U.badge('stopped', 'slate', { dot: true }) },
        { label: '', render: (row) => `<div class="row-actions">
          ${row.connectionId
            ? U.button({ label: 'Open', size: 'sm', attrs: `data-db-goto="#/databases/explorer?connection=${esc(row.connectionId)}"` })
            : row.network?.reachable
              ? U.button({ label: 'Connect', size: 'sm', variant: 'primary', attrs: `data-db-discovery-connect="${esc(row.id)}"` })
              : `<span class="db-row-note" title="Start the service first; a stopped service cannot accept connections.">Start the service to connect</span>`}
          ${row.network?.reachable
            ? U.iconButton({ icon: 'refresh', title: 'Restart service', attrs: `data-db-local-engine="${esc(row.engine)}" data-action="restart"` })
            : U.iconButton({ icon: 'play', title: 'Start service', attrs: `data-db-local-engine="${esc(row.engine)}" data-action="start"` })}
          ${row.network?.reachable ? U.iconButton({ icon: 'square', title: 'Stop service', attrs: `data-db-local-engine="${esc(row.engine)}" data-action="stop"` }) : ''}
        </div>` },
      ],
    });
    return `<div class="page db-page-wide">
      ${pageHead({
        title: 'Local databases',
        sub: 'Services installed directly on this host. Docker containers are managed on the Docker page.',
        actions: `${U.button({ label: 'Rescan', icon: 'radar', size: 'sm', attrs: 'data-db-discover' })}${refreshButton()}`,
      })}
      ${table}
      ${U.infoBanner('Service management', 'Start, stop and restart use systemd through systemctl on this host. If no unit exists, OpsDeck reports the failure instead of pretending the action succeeded.', 'info')}
    </div>`;
  }

  function performancePage() {
    const connectionId = S.selected.performance;
    const connection = connById(connectionId);
    if (!connection) return `<div class="page">${pageHead({ title: 'Performance', actions: newConnectionButton() })}${U.card({ body: U.empty({ icon: 'activity', title: 'No connection selected', body: 'Create a connection to read real database metrics.', action: newConnectionButton() }) })}</div>`;
    const data = S.perf.data;
    const meta = engineMeta(connection.engine);
    const body = !data
      ? (S.perf.loading ? U.loader('Reading metrics…') : U.empty({ icon: 'activity', title: 'No metrics loaded', body: 'Refresh to read metrics from the database.' }))
      : data.available === false
        ? U.infoBanner('Metrics unavailable', data.reason || 'This engine or user does not expose performance metrics.', 'warning')
        : metricsBody(data, connection);
    return `<div class="page db-page-wide">
      ${pageHead({
        title: 'Performance',
        sub: `${connection.name} · ${meta.label}`,
        actions: `${connectionSelect('performance-connection', connectionId)}
          <select class="input input-sm" data-db-perf-interval>
            ${[0, 5, 15, 30, 60].map((value) => `<option value="${value}" ${S.perf.interval === value ? 'selected' : ''}>${value ? `Every ${value}s` : 'Manual refresh'}</option>`).join('')}
          </select>
          ${U.button({ label: S.perf.loading ? 'Reading…' : 'Refresh', icon: 'refresh', size: 'sm', attrs: 'data-db-perf-refresh' })}`,
      })}
      ${S.perf.error ? U.errorBanner('Metrics error', S.perf.error) : ''}
      ${body}
      ${S.perf.history.length > 1 ? `<p class="db-footnote">${icon('activity', 12)} ${S.perf.history.length} samples collected this session. Values are shown as reported by the database; no interpolation.</p>` : ''}
    </div>`;
  }

  function metricsBody(data, connection) {
    const cards = [];
    if (data.activeConnections != null) {
      cards.push(U.statCard({ label: 'Active connections', value: fmtNumber(data.activeConnections), sub: data.maxConnections ? `of ${fmtNumber(data.maxConnections)} max` : 'reported by server', icon: 'users', tone: 'cyan' }));
    }
    if (data.cacheHitRatio != null) {
      cards.push(U.statCard({ label: 'Cache hit ratio', value: `${Number(data.cacheHitRatio).toFixed(1)}%`, sub: 'buffer pool / cache reads', icon: 'zap', tone: 'green' }));
    }
    if (data.sizeBytes != null) {
      cards.push(U.statCard({ label: 'Database size', value: fmtBytes(data.sizeBytes), sub: 'on-disk where reported', icon: 'hard-drive', tone: 'orange' }));
    }
    if (data.uptimeSeconds != null) {
      cards.push(U.statCard({ label: 'Uptime', value: fmtDuration(Number(data.uptimeSeconds) * 1000), sub: 'server process', icon: 'clock', tone: 'violet' }));
    }
    if (data.usedMemory != null) {
      cards.push(U.statCard({ label: 'Memory used', value: fmtBytes(data.usedMemory), sub: data.maxMemory ? `max ${fmtBytes(data.maxMemory)}` : 'used_memory', icon: 'memory-stick', tone: 'violet' }));
    }
    if (data.opsPerSecond != null) {
      cards.push(U.statCard({ label: 'Commands / sec', value: fmtNumber(data.opsPerSecond), sub: 'instantaneous', icon: 'activity', tone: 'cyan' }));
    }
    if (data.status && data.cluster) {
      cards.push(U.statCard({ label: 'Cluster health', value: String(data.status).toUpperCase(), sub: `${fmtNumber(data.nodes)} nodes · ${fmtNumber(data.activeShards)} shards`, icon: 'cloud', tone: data.status === 'green' ? 'green' : data.status === 'yellow' ? 'amber' : 'red' }));
    }
    if (data.tables != null) {
      cards.push(U.statCard({ label: 'Tables', value: fmtNumber(data.tables), sub: `${fmtNumber(data.indexes)} indexes`, icon: 'table', tone: 'slate' }));
    }

    const sections = [];
    if (data.states?.length) {
      sections.push(U.card({
        title: 'Connection states', icon: 'users', bodyClass: 'flush',
        body: dataTable({ rows: data.states, columns: [{ label: 'State', render: (row) => U.badge(row.state || 'unknown', 'slate') }, { label: 'Sessions', render: (row) => `<span class="mono">${fmtNumber(row.count)}</span>` }] }),
      }));
    }
    const longRunning = data.longRunning || (data.processes || []).filter((row) => Number(row.seconds) > 1);
    if (longRunning.length) {
      sections.push(U.card({
        title: 'Long-running queries', icon: 'timer', bodyClass: 'flush',
        body: dataTable({
          rows: longRunning.slice(0, 30),
          columns: [
            { label: 'PID', render: (row) => `<span class="mono">${esc(row.pid || row.id || '—')}</span>` },
            { label: 'User', render: (row) => esc(row.username || row.user || '—') },
            { label: 'State', render: (row) => esc(row.state || row.command || '—') },
            { label: 'Duration', render: (row) => `<span class="mono">${esc(row.duration || (row.seconds ? `${row.seconds}s` : '—'))}</span>` },
            { label: 'Query', render: (row) => `<span class="mono">${esc(truncate(row.query || row.info || '', 160))}</span>` },
          ],
        }),
      }));
    }
    const slow = data.slowQueries || data.slowQueryList;
    if (slow?.length) {
      sections.push(U.card({
        title: 'Slow query analysis', icon: 'trending-down', bodyClass: 'flush',
        body: dataTable({
          rows: slow.slice(0, 30),
          columns: [
            { label: 'Query', render: (row) => `<span class="mono">${esc(truncate(row.query || row.digest_text || '', 200))}</span>` },
            { label: 'Calls', render: (row) => esc(row.calls ?? '—') },
            { label: 'Mean time', render: (row) => `<span class="mono">${esc(row.mean_ms != null ? `${Number(row.mean_ms).toFixed(2)} ms` : row.mean_exec_time != null ? `${Number(row.mean_exec_time).toFixed(2)} ms` : '—')}</span>` },
            { label: 'Rows', render: (row) => esc(row.rows ?? row.rows_examined ?? '—') },
          ],
        }),
      }));
    } else if (data.slowQueriesAvailable === false) {
      sections.push(U.card({ title: 'Slow query analysis', icon: 'trending-down', body: U.infoBanner('Extension not available', connection.engine === 'postgres' ? 'pg_stat_statements is not installed or not readable by this user.' : 'The performance schema is not available for this user.', 'warning') }));
    }
    if (data.transactions) {
      sections.push(U.card({
        title: 'Transactions', icon: 'repeat', body: U.kvRows([
          ['Committed', fmtNumber(data.transactions.commit)],
          ['Rolled back', fmtNumber(data.transactions.rollback)],
          ['Deadlocks', fmtNumber(data.deadlocks)],
          ['Temporary bytes', data.tempBytes != null ? fmtBytes(data.tempBytes) : '—'],
        ]),
      }));
    }
    if (data.opcounters) {
      sections.push(U.card({
        title: 'Operations', icon: 'activity', body: U.kvRows(Object.entries(data.opcounters).map(([key, value]) => [titleCase(key), fmtNumber(value)])),
      }));
    }
    if (data.replication) {
      const replication = data.replication;
      sections.push(U.card({
        title: 'Replication', icon: 'git-merge',
        body: replication.members
          ? dataTable({ rows: replication.members, columns: [{ label: 'Member', render: (row) => `<span class="mono">${esc(row.name)}</span>` }, { label: 'State', render: (row) => U.badge(row.state, row.healthy ? 'green' : 'red') }, { label: 'Lag', render: (row) => esc(row.lag != null ? fmtDuration(row.lag) : '—') }] })
          : U.kvRows([
            ['Role', replication.role || '—'],
            ['Connected replicas', fmtNumber(replication.connectedSlaves)],
            ['Master link', replication.masterLinkStatus || '—'],
          ]),
      }));
    }
    if (data.clients?.length) {
      sections.push(U.card({
        title: 'Clients', icon: 'users', bodyClass: 'flush',
        body: dataTable({ rows: data.clients.slice(0, 50), columns: [{ label: 'Address', render: (row) => `<span class="mono">${esc(row.addr || row.laddr || '—')}</span>` }, { label: 'Name', render: (row) => esc(row.name || '—') }, { label: 'Database', render: (row) => esc(row.db || '—') }, { label: 'Commands', render: (row) => esc(row.cmd || '—') }] }),
      }));
    }
    if (data.slowLog?.length) {
      sections.push(U.card({
        title: 'Redis slow log', icon: 'scroll-text', bodyClass: 'flush',
        body: dataTable({ rows: data.slowLog, columns: [{ label: 'When', render: (row) => esc(row.at ? timeAgo(row.at) : '—') }, { label: 'Duration', render: (row) => `<span class="mono">${esc(row.durationUs != null ? `${(row.durationUs / 1000).toFixed(2)} ms` : '—')}</span>` }, { label: 'Command', render: (row) => `<span class="mono">${esc(truncate(row.command, 180))}</span>` }] }),
      }));
    }
    return `${cards.length ? `<div class="stat-grid">${cards.join('')}</div>` : ''}${sections.join('') || U.card({ body: U.empty({ icon: 'activity', title: 'No metrics reported', body: 'The server returned no recognizable metrics for this engine or permission level.' }) })}`;
  }

  function diagnosticsPage() {
    const connectionId = S.selected.diagnostics;
    const connection = connById(connectionId);
    const data = S.diag.data;
    const steps = data?.steps || [];
    const body = !connection
      ? U.card({ body: U.empty({ icon: 'stethoscope', title: 'Select a connection', body: 'Diagnostics test configuration, reachability, authentication, permissions and monitoring.' }) })
      : `<div class="db-diag">
          ${S.diag.error ? U.errorBanner('Diagnostics failed', S.diag.error) : ''}
          ${S.diag.loading ? U.loader('Running diagnostics…') : ''}
          ${data ? `<div class="db-diag-summary ${data.healthy ? 'ok' : 'bad'}">${icon(data.healthy ? 'circle-check' : 'alert-triangle', 18)}<div><strong>${data.healthy ? 'All checks passed' : 'Some checks failed'}</strong><span>${esc(fmtDateTime(data.at))}</span></div></div>
            <div class="db-diag-steps">${steps.map((step) => `<div class="db-diag-step tone-${step.status === 'pass' ? 'green' : step.status === 'warn' ? 'amber' : 'red'}">
              <span class="db-diag-icon">${icon(step.status === 'pass' ? 'check' : step.status === 'warn' ? 'alert-triangle' : 'x', 14)}</span>
              <div class="db-diag-text"><strong>${esc(step.name)}</strong><span>${esc(step.detail)}</span></div>
              <span class="db-diag-time mono">${step.ms != null ? fmtDuration(step.ms) : ''}</span>
            </div>`).join('')}</div>` : (S.diag.loading ? '' : U.empty({ icon: 'stethoscope', title: 'No diagnostics run yet', body: 'Run the checks to validate this connection end to end.', action: U.button({ label: 'Run diagnostics', icon: 'play', size: 'sm', variant: 'primary', attrs: 'data-db-diag-run' }) }))}
        </div>`;
    return `<div class="page">
      ${pageHead({ title: 'Diagnostics', sub: connection ? `${connection.name} · ${engineMeta(connection.engine).label}` : 'Validate a connection before saving changes.', actions: `${connectionSelect('diagnostics-connection', connectionId)}${U.button({ label: 'Run diagnostics', icon: 'play', size: 'sm', variant: 'primary', attrs: 'data-db-diag-run' })}` })}
      ${body}
    </div>`;
  }

  function activityPage() {
    const rows = S.activity;
    const table = dataTable({
      rows,
      emptyTitle: 'No activity recorded',
      emptyBody: 'Connection tests, queries, schema changes and service actions performed through OpsDeck appear here.',
      columns: [
        { label: 'When', render: (row) => `<span title="${esc(fmtDateTime(row.at))}">${esc(timeAgo(row.at))}</span>` },
        { label: 'Kind', render: (row) => U.badge(row.kind, 'slate', { mono: true }) },
        { label: 'Connection', render: (row) => esc(row.connectionName || '—') },
        { label: 'Status', render: (row) => U.badge(row.status, row.status === 'success' ? 'green' : row.status === 'warning' ? 'amber' : 'red') },
        { label: 'Duration', render: (row) => `<span class="mono">${esc(row.durationMs != null ? fmtDuration(row.durationMs) : '—')}</span>` },
        { label: 'Detail', render: (row) => `<span class="muted">${esc(truncate(row.message, 220))}</span>${row.query ? `<div class="mono db-row-error">${esc(truncate(row.query, 160))}</div>` : ''}` },
      ],
    });
    return `<div class="page db-page-wide">
      ${pageHead({ title: 'Activity log', sub: 'Actions performed through OpsDeck. Server-side audit events are a separate source and are not mixed into this log.', actions: refreshButton() })}
      ${U.card({ bodyClass: 'flush', body: table })}
    </div>`;
  }

  // ------------------------------------------------------------------ render
  async function render(route) {
    if (!api?.databases) return unavailable();
    const section = route.parts[0] || 'dashboard';
    if (!PAGES[section]) {
      return `<div class="page">${U.empty({ icon: 'compass', title: 'Unknown database section', body: `“${section}” is not part of the database workspace.` })}</div>`;
    }
    try {
      await prepare(route);
    } catch (error) {
      S.bootError = error.message;
      return errorPage(error);
    }
    switch (section) {
      case 'connections': return connectionsPage();
      case 'explorer': return explorerPage();
      case 'editor': return editorPage();
      case 'history': return historyPage();
      case 'local': return localPage();
      case 'docker': return dockerPage();
      case 'kubernetes': return kubernetesPage();
      case 'performance': return performancePage();
      case 'diagnostics': return diagnosticsPage();
      case 'activity': return activityPage();
      default: return dashboardPage();
    }
  }

  // ------------------------------------------------------------------- mount
  function findDiscoveryItem(id) {
    if (!S.discovery) return null;
    for (const kind of ['docker', 'local', 'kubernetes']) {
      const item = (S.discovery[kind]?.items || []).find((entry) => entry.id === id);
      if (item) return item;
    }
    return null;
  }

  function openConnectionDrawer(connectionId, sourceItem) {
    const existing = connectionId ? connById(connectionId) : null;
    const base = existing || {
      id: '', name: sourceItem?.name || '', engine: sourceItem?.engine || 'postgres', group: sourceItem?.compose?.project || '',
      host: sourceItem?.network?.host || '127.0.0.1', port: sourceItem?.network?.hostPort || engineMeta(sourceItem?.engine).defaultPort || 5432,
      username: '', database: '', file: '', authMethod: 'password',
      ssl: { mode: 'prefer', rejectUnauthorized: true, serverName: '' },
      timeoutMs: 10000, pool: { min: 0, max: 5, idleMs: 30000 }, readOnly: false, favorite: false,
      source: sourceItem ? {
        type: sourceItem.kind === 'docker' && sourceItem.compose ? 'compose' : sourceItem.kind,
        containerId: sourceItem.container?.id || '',
        containerName: sourceItem.container?.name || '',
        containerImage: sourceItem.container?.image || '',
        project: sourceItem.compose?.project || '',
        service: sourceItem.compose?.service || '',
        namespace: sourceItem.kubernetes?.namespace || '',
        pod: sourceItem.kubernetes?.pod || '',
        workload: sourceItem.kubernetes?.workload || '',
        context: sourceItem.kubernetes?.context || '',
        internalPort: sourceItem.kubernetes?.internalPort || sourceItem.network?.internalPort || engineMeta(sourceItem?.engine).defaultPort,
        hostPort: sourceItem.network?.hostPort || 0,
        detectedAt: new Date().toISOString(),
      } : { type: 'manual' },
    };
    pendingSource = base.source;
    const engineOptions = S.engines.map((engine) => `<option value="${esc(engine.id)}" ${engine.id === base.engine ? 'selected' : ''} ${engine.supported ? '' : 'disabled'}>${esc(engine.label)}${engine.supported ? '' : ' — planned'}</option>`).join('');
    const hasPassword = existing ? existing.hasPassword : false;
    const isSqlite = base.engine === 'sqlite';
    const body = `<div class="db-form" data-connection-id="${esc(existing?.id || '')}" data-source="${esc(JSON.stringify(base.source || { type: 'manual' }))}">
      <div class="db-form-grid">
        <label class="field"><span>Connection name</span><input class="input" name="name" value="${esc(base.name || '')}" placeholder="Production PostgreSQL" autofocus></label>
        <label class="field"><span>Engine</span><select class="input" name="engine">${engineOptions}</select></label>
      </div>
      <div class="db-form-grid ${isSqlite ? 'hide' : ''}" data-field-tcp>
        <label class="field"><span>Host</span><input class="input" name="host" value="${esc(base.host || '')}" placeholder="127.0.0.1" spellcheck="false"></label>
        <label class="field"><span>Port</span><input class="input" name="port" type="number" min="1" max="65535" value="${esc(base.port || '')}"></label>
      </div>
      <label class="field ${isSqlite ? '' : 'hide'}" data-field-file><span>SQLite file</span>
        <div class="row gap-2"><input class="input" name="file" value="${esc(base.file || '')}" placeholder="/home/you/data.sqlite" spellcheck="false"><button type="button" class="btn btn-secondary btn-sm" data-db-browse>Browse</button></div>
      </label>
      <div class="db-form-grid">
        <label class="field"><span>Username</span><input class="input" name="username" value="${esc(base.username || '')}" placeholder="Optional" spellcheck="false" autocomplete="off"></label>
        <label class="field"><span>Password ${hasPassword ? U.badge('stored', 'green') : ''}</span><input class="input" name="password" type="password" placeholder="${hasPassword ? 'Leave blank to keep the stored password' : 'Never stored in plaintext'}" autocomplete="new-password"></label>
      </div>
      <div class="db-form-grid">
        <label class="field"><span>Default database</span><input class="input" name="database" value="${esc(base.database || '')}" placeholder="Optional" spellcheck="false"></label>
        <label class="field"><span>Group</span><input class="input" name="group" value="${esc(base.group || '')}" placeholder="e.g. production, compose project"></label>
      </div>
      <div class="db-form-grid">
        <label class="field"><span>TLS mode</span><select class="input" name="sslMode">
          ${['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'].map((mode) => `<option value="${mode}" ${base.ssl?.mode === mode ? 'selected' : ''}>${mode}</option>`).join('')}
        </select></label>
        <label class="field"><span>Connection timeout (ms)</span><input class="input" name="timeoutMs" type="number" min="1000" max="60000" value="${esc(base.timeoutMs || 10000)}"></label>
      </div>
      <div class="db-form-grid">
        <label class="field"><span>Pool size</span><input class="input" name="poolMax" type="number" min="1" max="50" value="${esc(base.pool?.max || 5)}"></label>
        <label class="field"><span>Advanced options</span><input class="input" name="options" value="${esc(Object.entries(base.options || {}).map(([key, value]) => `${key}=${value}`).join(';'))}" placeholder="key=value; key2=value2" spellcheck="false"></label>
      </div>
      <div class="db-form-checks">
        <label class="check-row"><input type="checkbox" name="readOnly" ${base.readOnly ? 'checked' : ''}><span>Read-only profile — block write statements</span></label>
        <label class="check-row"><input type="checkbox" name="favorite" ${base.favorite ? 'checked' : ''}><span>Favorite</span></label>
        <label class="check-row"><input type="checkbox" name="rejectUnauthorized" ${base.ssl?.rejectUnauthorized !== false ? 'checked' : ''}><span>Validate TLS certificates</span></label>
      </div>
      ${base.source && base.source.type !== 'manual' ? U.infoBanner('Linked to infrastructure', `Source: ${base.source.type}${base.source.containerName ? ` · ${base.source.containerName}` : ''}${base.source.namespace ? ` · ${base.source.namespace}/${base.source.pod || base.source.workload}` : ''}. OpsDeck re-tests the endpoint before saving.`, 'info') : ''}
      ${existing ? '' : U.infoBanner('Credentials', 'Passwords are encrypted by the main process before they reach disk. Export files never include secrets.', 'info')}
      <div class="db-form-error" data-db-form-error></div>
    </div>`;
    U.drawer({
      title: existing ? 'Edit connection' : 'New database connection',
      subtitle: existing ? `${engineMeta(existing.engine).label} · ${existing.name}` : 'Local, Docker, Kubernetes or remote',
      icon: 'database',
      width: '680px',
      body,
      footer: `<div class="row gap-2 right" style="width:100%">
        ${U.button({ label: 'Test connection', icon: 'plug-zap', variant: 'secondary', attrs: 'data-db-form-test' })}
        ${U.button({ label: existing ? 'Save changes' : 'Create connection', icon: 'check', variant: 'primary', attrs: 'data-db-form-save' })}
      </div>`,
      onMount: ({ root, close }) => {
        const engineSelect = root.querySelector('[name="engine"]');
        const syncEngine = () => {
          const engine = engineMeta(engineSelect.value);
          const tcp = root.querySelector('[data-field-tcp]');
          const file = root.querySelector('[data-field-file]');
          const sqlite = engineSelect.value === 'sqlite';
          if (tcp) tcp.classList.toggle('hide', sqlite);
          if (file) file.classList.toggle('hide', !sqlite);
          const port = root.querySelector('[name="port"]');
          if (port && !sqlite) port.value = engine.defaultPort || port.value;
        };
        engineSelect?.addEventListener('change', syncEngine);
        root.querySelector('[data-db-browse]')?.addEventListener('click', async () => {
          const res = await api.databases.pickSqlite();
          if (res?.ok) {
            root.querySelector('[name="file"]').value = res.file;
            if (!root.querySelector('[name="name"]').value.trim()) {
              root.querySelector('[name="name"]').value = res.file.split('/').pop();
            }
          }
        });
        const collect = () => {
          const get = (name) => root.querySelector(`[name="${name}"]`)?.value ?? '';
          const port = Number(get('port'));
          const options = {};
          for (const part of get('options').split(';')) {
            const idx = part.indexOf('=');
            if (idx > 0) options[part.slice(0, idx).trim()] = part.slice(idx + 1).trim();
          }
          const password = get('password');
          return {
            id: existing?.id || undefined,
            name: get('name').trim(),
            engine: get('engine'),
            group: get('group').trim(),
            host: get('host').trim(),
            port: Number.isInteger(port) && port > 0 ? port : engineMeta(get('engine')).defaultPort,
            username: get('username').trim(),
            database: get('database').trim(),
            file: get('file').trim(),
            authMethod: get('engine') === 'sqlite' ? 'none' : password ? 'password' : (existing?.hasPassword ? 'password' : 'none'),
            ssl: { mode: get('sslMode'), rejectUnauthorized: root.querySelector('[name="rejectUnauthorized"]')?.checked !== false },
            timeoutMs: Number(get('timeoutMs')) || 10000,
            pool: { max: Number(get('poolMax')) || 5, min: 0, idleMs: 30000 },
            readOnly: root.querySelector('[name="readOnly"]')?.checked === true,
            favorite: root.querySelector('[name="favorite"]')?.checked === true,
            options,
            source: JSON.parse(root.dataset.source || '{"type":"manual"}'),
            secrets: password ? { password } : {},
          };
        };
        const showError = (message) => {
          const target = root.querySelector('[data-db-form-error]');
          if (target) target.textContent = message || '';
        };
        root.querySelector('[data-db-form-test]')?.addEventListener('click', async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          showError('');
          try {
            const values = collect();
            const res = await api.databases.testConnection({ connection: values, secrets: values.secrets, id: existing?.id });
            if (res?.ok) {
              U.toast('Connection test passed', 'success', { description: `${res.info?.serverVersion || 'Server responded'} · ${res.latencyMs} ms` });
            } else {
              showError(res?.error || 'The connection test failed.');
              U.toast('Connection test failed', 'error', { description: truncate(res?.error || '', 180) });
            }
          } catch (error) {
            showError(error.message);
          } finally {
            button.disabled = false;
          }
        });
        root.querySelector('[data-db-form-save]')?.addEventListener('click', async (event) => {
          const button = event.currentTarget;
          button.disabled = true;
          showError('');
          try {
            const values = collect();
            if (!values.name) throw new Error('Enter a connection name.');
            const res = await api.databases.saveConnection(values);
            if (!res?.ok) throw new Error(res?.error || 'The connection was not saved.');
            close('saved');
            U.toast(existing ? 'Connection updated' : 'Connection created', 'success', { description: res.connection?.name || values.name });
            await loadBootstrap();
            OD.app?.rerender?.();
          } catch (error) {
            showError(error.message);
            U.toast('Could not save the connection', 'error', { description: truncate(error.message, 180) });
          } finally {
            button.disabled = false;
          }
        });
      },
    });
  }

  function openLogs(containerId) {
    if (!containerId) return;
    const id = containerId;
    const paint = (body) => {
      api.docker.containerLogs(id, 500).then((res) => {
        const text = [res?.stdout || '', res?.stderr || ''].filter(Boolean).join('\n');
        body.innerHTML = `<div class="db-log-actions">${U.button({ label: 'Refresh', icon: 'refresh', size: 'sm', attrs: 'data-db-log-refresh' })}${U.button({ label: 'Copy', icon: 'copy', size: 'sm', attrs: 'data-db-log-copy' })}</div><pre class="db-json db-log">${esc(text || res?.error || 'No log output.')}</pre>`;
        body.querySelector('[data-db-log-refresh]')?.addEventListener('click', () => paint(body));
        body.querySelector('[data-db-log-copy]')?.addEventListener('click', () => copyText(text, 'Logs copied'));
      }).catch((error) => {
        body.innerHTML = U.errorBanner('Could not read logs', error.message);
      });
    };
    U.drawer({
      title: 'Container logs',
      subtitle: id.slice(0, 12),
      icon: 'scroll-text',
      width: '760px',
      body: U.loader('Reading logs…'),
      onMount: ({ body }) => paint(body),
    });
  }

  async function runQuery(selectedOnly = false, confirmDestructive = false) {
    const editor = document.querySelector('[data-db-sql]');
    let sql = S.editor.sql;
    if (editor) {
      sql = editor.value;
      S.editor.sql = sql;
      if (selectedOnly && editor.selectionStart !== editor.selectionEnd) {
        sql = sql.slice(editor.selectionStart, editor.selectionEnd);
      }
    }
    if (!String(sql).trim()) {
      U.toast('Nothing to run', 'warning', { description: 'Write or select a statement first.' });
      return;
    }
    S.editor.running = true;
    S.editor.error = '';
    S.editor.token = `q-${Date.now()}-${Math.random().toString(16).slice(2, 8)}`;
    OD.app?.rerender?.();
    try {
      const res = await api.databases.query({
        id: S.selected.editor,
        database: S.editor.database,
        sql,
        limit: 1000,
        token: S.editor.token,
        confirmDestructive,
      });
      if (res?.requiresConfirmation) {
        S.editor.running = false;
        OD.app?.rerender?.();
        const ok = await U.confirm({
          title: 'Destructive statement',
          message: res.confirmation || 'This statement can remove or overwrite data.',
          detail: truncate(res.statement || sql, 400),
          confirmLabel: 'Run anyway',
          tone: 'red',
        });
        if (ok) return runQuery(selectedOnly, true);
        return;
      }
      if (res?.ok === false) throw new Error(res?.error || 'The query failed.');
      S.editor.result = res;
      S.editor.durationMs = res.durationMs;
      S.editor.page = 0;
      S.editor.sort = null;
      S.editor.explain = null;
      S.editor.error = '';
    } catch (error) {
      S.editor.error = error.message;
      S.editor.result = null;
    } finally {
      S.editor.running = false;
      await refreshConnections().catch(() => {});
      OD.app?.rerender?.();
    }
  }

  async function runExplain() {
    const editor = document.querySelector('[data-db-sql]');
    const sql = editor ? editor.value : S.editor.sql;
    if (!String(sql).trim()) return;
    try {
      const res = await api.databases.explain({ id: S.selected.editor, database: S.editor.database, sql });
      if (res?.ok === false) throw new Error(res?.error || 'The plan could not be read.');
      S.editor.explain = res;
      S.editor.error = '';
    } catch (error) {
      S.editor.error = error.message;
    }
    OD.app?.rerender?.();
  }

  async function exportResults(format) {
    const result = S.editor.result;
    if (!result) return;
    const columns = parseColumns(result);
    try {
      const res = await api.databases.exportResult({ format, columns, rows: result.rows || [], table: 'exported_rows' });
      if (res?.canceled) return;
      if (!res?.ok) throw new Error(res?.error || 'Export failed.');
      U.toast('Results exported', 'success', { description: `${fmtNumber(res.rows)} rows · ${fmtBytes(res.bytes)} · ${res.file}` });
    } catch (error) {
      U.toast('Export failed', 'error', { description: truncate(error.message, 180) });
    }
  }

  async function scanRedisKeys(reset = true) {
    if (!S.selected.explorer) return;
    const prev = S.explorer.redis;
    const pattern = prev.pattern || '*';
    try {
      const res = await api.databases.redisScan({
        id: S.selected.explorer,
        database: S.explorer.database,
        pattern,
        cursor: reset ? '0' : prev.cursor,
        count: 200,
      });
      if (!res?.ok) throw new Error(res?.error || 'SCAN failed.');
      const seen = new Set(reset ? [] : prev.keys.map((key) => key.key));
      const keys = reset ? [] : [...prev.keys];
      for (const key of res.keys || []) {
        if (!seen.has(key.key)) { seen.add(key.key); keys.push(key); }
      }
      S.explorer.redis = { keys, cursor: res.cursor || '0', pattern, loaded: true };
    } catch (error) {
      U.toast('SCAN failed', 'error', { description: truncate(error.message, 180) });
    }
    OD.app?.rerender?.();
  }

  // -------------------------------------------------------------------- bind
  function mount(root, route) {
    clearInterval(perfTimer);
    perfTimer = null;
    if (S.perf.interval > 0 && route.parts[0] === 'performance') {
      perfTimer = setInterval(async () => {
        if (!S.selected.performance) return;
        await loadMetrics(S.selected.performance);
        OD.app?.rerender?.();
      }, S.perf.interval * 1000);
    }
    root.addEventListener('click', (event) => handleClick(event, root));
    root.addEventListener('change', (event) => handleChange(event, root));
    root.addEventListener('input', (event) => {
      if (event.target.matches('[data-db-filter="explorer"]')) {
        S.explorer.filter = event.target.value;
        filterExplorer(root);
      }
      if (event.target.matches('[data-db-result-search]')) {
        S.editor.search = event.target.value;
        S.editor.page = 0;
        OD.app?.rerender?.();
      }
      if (event.target.matches('[data-db-sql]')) {
        S.editor.sql = event.target.value;
      }
      if (event.target.matches('[data-db-redis-pattern]')) {
        S.explorer.redis.pattern = event.target.value;
      }
      if (event.target.matches('[data-db-table-filter]')) {
        filterRows(event.target);
      }
    });
    root.addEventListener('keydown', (event) => {
      if (event.target.matches('[data-db-sql]') && event.key === 'Enter' && (event.ctrlKey || event.metaKey)) {
        event.preventDefault();
        runQuery(event.shiftKey);
      }
      if (event.target.matches('[data-db-redis-pattern]') && event.key === 'Enter') {
        event.preventDefault();
        scanRedisKeys(true);
      }
    });
  }

  function filterExplorer(root) {
    const term = S.explorer.filter.trim().toLowerCase();
    root.querySelectorAll('[data-db-tree] .db-node').forEach((node) => {
      const button = node.querySelector('.db-node-main');
      const label = button?.querySelector('.db-node-label')?.textContent?.toLowerCase() || '';
      if (!term) { node.classList.remove('db-hidden'); return; }
      const match = label.includes(term);
      node.classList.toggle('db-hidden', !match && !node.querySelector('.db-node-children'));
    });
  }

  function filterRows(input) {
    const table = input.closest('.db-detail')?.querySelector('table');
    if (!table) return;
    const term = input.value.trim().toLowerCase();
    table.querySelectorAll('tbody tr').forEach((row) => {
      row.classList.toggle('db-hidden', Boolean(term) && !row.textContent.toLowerCase().includes(term));
    });
  }

  async function handleChange(event, root) {
    const target = event.target;
    if (target.matches('[data-db-role="explorer-connection"]')) {
      S.selected.explorer = target.value;
      S.explorer.data = null;
      S.explorer.key = '';
      S.explorer.database = '';
      S.explorer.detail = null;
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-role="explorer-database"]')) {
      S.explorer.database = target.value;
      S.explorer.key = '';
      S.explorer.detail = null;
      await loadExplorer(S.selected.explorer, S.explorer.database);
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-role="editor-connection"]')) {
      S.selected.editor = target.value;
      S.editor.database = '';
      const connection = connById(target.value);
      if (connection) {
        await loadDatabases(connection.id);
        S.editor.database = connection.database && (S.dbs[connection.id] || []).some((entry) => entry.name === connection.database)
          ? connection.database
          : (S.dbs[connection.id] || [])[0]?.name || '';
      }
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-role="editor-database"]')) {
      S.editor.database = target.value;
      return;
    }
    if (target.matches('[data-db-role="performance-connection"]')) {
      S.selected.performance = target.value;
      S.perf.data = null;
      S.perf.history = [];
      if (target.value) await loadMetrics(target.value);
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-perf-interval]')) {
      S.perf.interval = Number(target.value) || 0;
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-role="diagnostics-connection"]')) {
      S.selected.diagnostics = target.value;
      S.diag = { data: null, loading: false, error: '' };
      OD.app?.rerender?.();
    }
  }

  async function handleClick(event, root) {
    const target = event.target.closest('button, a, [data-db-goto]');
    if (!target) return;

    if (target.matches('[data-db-copy]')) {
      event.preventDefault();
      copyText(target.dataset.dbCopy || '', 'Copied');
      return;
    }
    if (target.matches('[data-db-refresh]')) {
      event.preventDefault();
      S.discovery = null;
      S.perf.data = null;
      S.explorer.key = '';
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-discover]')) {
      event.preventDefault();
      target.disabled = true;
      try {
        await loadDiscovery(true);
        U.toast('Discovery finished', 'success', { description: `Docker ${S.discovery.counts?.docker || 0} · local ${S.discovery.counts?.local || 0} · Kubernetes ${S.discovery.counts?.kubernetes || 0}` });
      } catch (error) {
        U.toast('Discovery failed', 'error', { description: error.message });
      }
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-new]')) {
      event.preventDefault();
      openConnectionDrawer('');
      return;
    }
    if (target.matches('[data-db-open]')) {
      event.preventDefault();
      openConnectionDrawer(target.dataset.dbOpen);
      return;
    }
    if (target.matches('[data-db-favorite]')) {
      event.preventDefault();
      await api.databases.setFavorite(target.dataset.dbFavorite, !target.classList.contains('active'));
      await refreshConnections();
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-connect]')) {
      event.preventDefault();
      const id = target.dataset.dbConnect;
      target.disabled = true;
      try {
        const res = await api.databases.connect(id);
        if (!res?.ok) throw new Error(res?.error || 'The connection failed.');
        U.toast('Connected', 'success', { description: res.info?.serverVersion || connById(id)?.name });
        await refreshConnections();
      } catch (error) {
        U.toast('Could not connect', 'error', { description: truncate(error.message, 200) });
      }
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-disconnect]')) {
      event.preventDefault();
      await api.databases.disconnect(target.dataset.dbDisconnect).catch(() => {});
      await refreshConnections();
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-duplicate]')) {
      event.preventDefault();
      const res = await api.databases.duplicateConnection(target.dataset.dbDuplicate);
      if (res?.ok) U.toast('Connection duplicated', 'success', { description: res.connection?.name });
      else U.toast('Could not duplicate', 'error', { description: res?.error });
      await refreshConnections();
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-delete]')) {
      event.preventDefault();
      const connection = connById(target.dataset.dbDelete);
      const ok = await U.confirm({
        title: 'Delete connection profile',
        message: `Delete “${connection?.name || 'this connection'}”? The stored profile and its encrypted credentials are removed. The database itself is not touched.`,
        confirmLabel: 'Delete profile',
        tone: 'red',
      });
      if (!ok) return;
      const res = await api.databases.deleteConnection(target.dataset.dbDelete);
      if (!res?.ok) U.toast('Could not delete', 'error', { description: res?.error });
      await loadBootstrap();
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-import-connections]')) {
      event.preventDefault();
      const res = await api.databases.importConnectionsFromFile();
      if (res?.canceled) return;
      if (!res?.ok) U.toast('Import failed', 'error', { description: res?.error });
      else U.toast('Connections imported', 'success', { description: `${res.created} created · ${res.skipped?.length || 0} skipped. Credentials must be re-entered.` });
      await loadBootstrap();
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-export-connections]')) {
      event.preventDefault();
      const res = await api.databases.exportConnectionsToFile();
      if (res?.canceled) return;
      if (!res?.ok) U.toast('Export failed', 'error', { description: res?.error });
      else U.toast('Connections exported', 'success', { description: `${res.count} profiles · no secrets included` });
      return;
    }
    if (target.matches('[data-db-history-clear]')) {
      event.preventDefault();
      const ok = await U.confirm({ title: 'Clear query history', message: 'Delete the recorded query history for this host? Activity logs are kept.', confirmLabel: 'Clear history', tone: 'red' });
      if (!ok) return;
      await api.databases.clearHistory();
      S.history = [];
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-reuse]')) {
      event.preventDefault();
      const entry = S.history.find((row) => row.id === target.dataset.dbReuse);
      if (!entry) return;
      S.editor.sql = entry.sql;
      S.selected.editor = entry.connectionId || S.selected.editor;
      OD.app?.goto?.(`#/databases/editor?connection=${encodeURIComponent(entry.connectionId || '')}`);
      return;
    }
    if (target.matches('[data-db-run]')) { event.preventDefault(); await runQuery(false); return; }
    if (target.matches('[data-db-run-selection]')) { event.preventDefault(); await runQuery(true); return; }
    if (target.matches('[data-db-explain]')) { event.preventDefault(); await runExplain(); return; }
    if (target.matches('[data-db-cancel]')) {
      event.preventDefault();
      const res = await api.databases.cancel({ id: S.selected.editor, token: S.editor.token });
      if (res?.ok) U.toast('Cancellation requested', 'info');
      else U.toast('Nothing to cancel', 'warning', { description: res?.error });
      return;
    }
    if (target.matches('[data-db-result-search]')) return;
    if (target.matches('[data-db-export-result]')) {
      event.preventDefault();
      await exportResults(target.dataset.dbExportResult);
      return;
    }
    if (target.matches('[data-tab]') && target.closest('[data-tabs="db-result-view"]')) {
      event.preventDefault();
      S.editor.view = target.dataset.tab;
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-sort]')) {
      event.preventDefault();
      const column = target.dataset.dbSort;
      S.editor.sort = S.editor.sort?.column === column && S.editor.sort.dir === 'asc'
        ? { column, dir: 'desc' }
        : { column, dir: 'asc' };
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-page]')) {
      event.preventDefault();
      S.editor.page = Math.max(0, S.editor.page + Number(target.dataset.dbPage || 0));
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-dbselect]')) return;
    if (target.matches('[data-db-database]')) {
      event.preventDefault();
      S.explorer.database = target.dataset.dbDatabase;
      S.explorer.key = '';
      S.explorer.detail = null;
      await loadExplorer(S.selected.explorer, S.explorer.database);
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-object]')) {
      event.preventDefault();
      const kind = target.dataset.dbObject;
      if (kind === 'redis-key') {
        await loadDetail({ kind: 'redis-key', name: target.dataset.name });
        return;
      }
      await loadDetail({ kind, name: target.dataset.name, schema: target.dataset.schema || '' });
      return;
    }
    if (target.matches('[data-db-redis-more]')) {
      event.preventDefault();
      await scanRedisKeys(false);
      return;
    }
    if (target.matches('[data-db-redis-ttl]')) {
      event.preventDefault();
      const seconds = await U.prompt({ title: 'Set key TTL', label: 'Seconds (0 persists, negative deletes)', value: '3600', icon: 'clock' });
      if (seconds === null) return;
      const res = await api.databases.redisWrite({ id: S.selected.explorer, action: 'ttl', key: target.dataset.dbRedisTtl, seconds: Number(seconds) });
      if (!res?.ok) U.toast('Could not set TTL', 'error', { description: res?.error });
      else { U.toast('TTL updated', 'success'); await loadExplorer(S.selected.explorer, S.explorer.database); OD.app?.rerender?.(); }
      return;
    }
    if (target.matches('[data-db-redis-delete]')) {
      event.preventDefault();
      const key = target.dataset.dbRedisDelete;
      const ok = await U.confirm({ title: 'Delete Redis key', message: `Permanently delete “${key}”?`, confirmLabel: 'Delete key', tone: 'red' });
      if (!ok) return;
      const res = await api.databases.redisWrite({ id: S.selected.explorer, action: 'delete', key, confirm: true });
      if (!res?.ok) U.toast('Could not delete key', 'error', { description: res?.error });
      else { U.toast('Key deleted', 'success'); S.explorer.detail = null; await loadExplorer(S.selected.explorer, S.explorer.database); OD.app?.rerender?.(); }
      return;
    }
    if (target.matches('[data-db-query-object]')) {
      event.preventDefault();
      const kind = target.dataset.dbQueryObject;
      const name = target.dataset.name;
      const schema = target.dataset.schema;
      S.editor.sql = kind === 'collection' || kind === 'index'
        ? JSON.stringify({ find: name, filter: {}, limit: 20 }, null, 2)
        : `SELECT * FROM ${schema ? `${schema}.` : ''}${name} LIMIT 100;`;
      S.selected.editor = S.selected.explorer;
      S.editor.database = S.explorer.database;
      OD.app?.goto?.(`#/databases/editor?connection=${encodeURIComponent(S.selected.explorer)}`);
      return;
    }
    if (target.matches('[data-db-diag-run]')) {
      event.preventDefault();
      if (!S.selected.diagnostics) return;
      S.diag.loading = true;
      S.diag.error = '';
      OD.app?.rerender?.();
      try {
        const res = await api.databases.diagnostics(S.selected.diagnostics);
        if (!res?.ok) throw new Error(res?.error || 'Diagnostics failed.');
        S.diag.data = res;
      } catch (error) {
        S.diag.error = error.message;
      } finally {
        S.diag.loading = false;
        OD.app?.rerender?.();
      }
      return;
    }
    if (target.matches('[data-db-discovery-connect]')) {
      event.preventDefault();
      const item = findDiscoveryItem(target.dataset.dbDiscoveryConnect);
      if (item) openConnectionDrawer('', item);
      return;
    }
    if (target.matches('[data-db-docker-fix]')) {
      event.preventDefault();
      const item = findDiscoveryItem(target.dataset.dbDockerFix);
      if (item) dockerUnreachableHelp(item);
      return;
    }
    if (target.matches('[data-db-docker-action]')) {
      event.preventDefault();
      const id = target.dataset.dbDockerAction;
      const action = target.dataset.action;
      if (['stop', 'restart', 'kill'].includes(action)) {
        const ok = await U.confirm({ title: `${titleCase(action)} container`, message: 'This interrupts database availability for every client of this container.', confirmLabel: titleCase(action), tone: 'red' });
        if (!ok) return;
      }
      const res = await api.docker.containerAction(id, action);
      if (res?.ok === false) U.toast('Docker action failed', 'error', { description: res?.error });
      else {
        U.toast(`Container ${action} requested`, 'success');
        await loadDiscovery(true);
      }
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-docker-logs]')) {
      event.preventDefault();
      openLogs(target.dataset.dbDockerLogs);
      return;
    }
    if (target.matches('[data-db-local-engine]')) {
      event.preventDefault();
      const engine = target.dataset.dbLocalEngine;
      const action = target.dataset.action;
      if (['stop', 'restart'].includes(action)) {
        const ok = await U.confirm({ title: `${titleCase(action)} local service`, message: `This will ${action} the ${engineMeta(engine).label} service on this host.`, confirmLabel: titleCase(action), tone: 'red' });
        if (!ok) return;
      }
      const res = await api.databases.localAction({ engine, action });
      if (!res?.ok) U.toast('Service action failed', 'error', { description: res?.error });
      else U.toast(`Service ${action} succeeded`, 'success', { description: res?.unit || '' });
      await loadDiscovery(true).catch(() => {});
      OD.app?.rerender?.();
      return;
    }
    if (target.matches('[data-db-form-test], [data-db-form-save], [data-db-browse]')) return;

    // Expand or collapse a tree group. Object buttons keep their own action.
    if (target.matches('.db-node-main') && !target.matches('[data-db-object]')) {
      const node = target.closest('.db-node');
      if (node?.querySelector(':scope > .db-node-children')) {
        event.preventDefault();
        node.classList.toggle('open');
      }
      return;
    }

    // generic anchors and data-db-goto
    if (target.matches('[data-db-goto]')) {
      event.preventDefault();
      OD.app?.goto?.(target.dataset.dbGoto);
    }
  }

  function dispose() {
    clearInterval(perfTimer);
    perfTimer = null;
  }

  OD.views = OD.views || {};
  OD.views.databases = {
    render,
    mount,
    dispose,
    pages: PAGES,
    label(section) {
      return PAGES[section] || titleCase(section || 'dashboard');
    },
    status() {
      return OD.store?.state?.databases || null;
    },
  };
})();
