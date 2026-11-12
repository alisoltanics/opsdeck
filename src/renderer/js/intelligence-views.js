'use strict';

/**
 * Intelligence workspace.
 *
 * A cross-module view over Docker, Kubernetes, Databases and Observability.
 * Every value is produced by the main-process IntelligenceService; the renderer
 * never invents a relationship, metric or incident. Observed and inferred
 * relationships are labelled differently, and hypotheses are never presented as
 * confirmed root causes.
 */
(function () {
  const api = window.opsdeck;
  const { esc, fmtNumber, timeAgo, fmtDateTime, titleCase, copyText } = OD.utils;
  const { icon } = OD.icons;
  const U = OD.ui;

  const PAGES = {
    overview: 'Overview',
    graph: 'Infrastructure graph',
    resources: 'Resources',
    search: 'Global search',
    timeline: 'Unified timeline',
    changes: 'Changes',
    incidents: 'Incidents',
    rca: 'Root cause investigation',
    reports: 'Reports',
    environments: 'Environments',
    automation: 'Automation',
    audit: 'Audit trail',
    settings: 'Settings',
  };

  const MODULES = [
    { id: 'docker', label: 'Docker', icon: 'box', tone: 'accent' },
    { id: 'kubernetes', label: 'Kubernetes', icon: 'cloud', tone: 'violet' },
    { id: 'databases', label: 'Databases', icon: 'database', tone: 'orange' },
    { id: 'observability', label: 'Observability', icon: 'activity', tone: 'cyan' },
    { id: 'host', label: 'Hosts', icon: 'server', tone: 'slate' },
    { id: 'intelligence', label: 'Intelligence', icon: 'git-branch', tone: 'green' },
  ];
  const MODULE = Object.fromEntries(MODULES.map((entry) => [entry.id, entry]));

  const STATUS_TONE = { healthy: 'green', degraded: 'orange', unhealthy: 'red', stopped: 'slate', unknown: 'slate' };
  const SEVERITY_TONE = { info: 'cyan', success: 'green', warning: 'orange', error: 'red', critical: 'red' };
  const SEVERITY_RANK = { info: 0, success: 1, warning: 2, error: 3, critical: 4 };

  const S = {
    booted: false,
    bootError: '',
    boot: null,
    page: 'overview',
    error: {},
    loading: {},
    overview: null,
    graph: { data: null, module: '', environment: '', confidence: 'all', error: '' },
    resources: {
      items: [], totals: null, sources: null, at: null,
      module: '', kind: '', status: '', environment: '', query: '', page: 1, pageSize: 60,
    },
    search: { query: '', module: '', result: null, busy: false },
    timeline: { rows: [], total: 0, counts: {}, errors: [], range: '24h', module: '', severity: '', query: '', offset: 0, limit: 50 },
    changes: { items: [], total: 0, baseline: false, module: '', query: '' },
    incidents: { items: [], total: 0, selected: null },
    rca: { alerts: [], incidents: [], result: null, busy: false, error: '', form: { subject: 'manual', id: '', scope: '', minutes: 60, broad: false } },
    reports: { types: [], result: null, hours: 24, busy: false },
    environments: { summary: null, items: [] },
    automation: { items: [], runs: [], containers: [], connections: [], metrics: [], enabled: true },
    audit: { items: [], module: '' },
    settings: null,
    timer: null,
    unsubscribe: null,
  };

  const BTN = (label, iconName, attrs = '', variant = 'secondary', size = 'sm') =>
    `<button type="button" class="btn btn-${variant} btn-${size}" ${attrs}>${iconName ? icon(iconName, 14) : ''}<span>${esc(label)}</span></button>`;
  const LINK = (label, iconName, href, variant = 'secondary') =>
    `<a class="btn btn-${variant} btn-sm" href="${href}">${iconName ? icon(iconName, 14) : ''}<span>${esc(label)}</span></a>`;

  function subtitle(page) {
    return {
      overview: 'One read-only picture of Docker, Kubernetes, databases, hosts and observability.',
      graph: 'Relationships that were actually observed, with weaker inferences labelled separately.',
      resources: 'Every resource each module reports, in one comparable inventory.',
      search: 'Search resources, events and recorded changes across every workspace.',
      timeline: 'Real events from every module in one chronological stream.',
      changes: 'What appeared, disappeared or changed since the previous snapshot.',
      incidents: 'Incidents grouped across sources, with evidence-based investigation.',
      rca: 'Facts, ranked hypotheses and limitations — never a fabricated root cause.',
      reports: 'Reports generated from retained metrics, alerts, incidents, logs and traces.',
      environments: 'Map resources to Local, Development, Testing, Staging, Production or custom environments.',
      automation: 'Dry-run first, approval-gated workflows with retries and an audit trail.',
      audit: 'Every sensitive action OpsDeck performed, in order.',
      settings: 'Collection, automation and environment preferences for the intelligence layer.',
    }[page] || '';
  }

  // ------------------------------------------------------------------ helpers

  function moduleMeta(id) {
    return MODULE[id] || { id, label: titleCase(id || 'resource'), icon: 'box', tone: 'slate' };
  }

  function statusBadge(status) {
    return U.badge(String(status || 'unknown'), STATUS_TONE[status] || 'slate');
  }

  function severityBadge(severity) {
    return U.badge(String(severity || 'info'), SEVERITY_TONE[severity] || 'slate');
  }

  function moduleBadge(module) {
    const meta = moduleMeta(module);
    return `<span class="intel-module"><span class="icon-chip tone-${meta.tone}" style="--chip-size:20px">${icon(meta.icon, 11)}</span>${esc(meta.label)}</span>`;
  }

  function envBadge(id) {
    if (!id) return U.badge('unassigned', 'slate');
    const env = (S.boot?.environments || []).find((entry) => entry.id === id);
    return U.badge(env?.name || titleCase(id), env?.tone || 'slate');
  }

  function confidenceBadge(confidence) {
    return U.badge(confidence === 'observed' ? 'observed' : 'inferred', confidence === 'observed' ? 'green' : 'amber');
  }

  function minutesLabel(value) {
    const n = Number(value) || 0;
    if (n >= 1440) return `${(n / 1440).toFixed(n % 1440 ? 1 : 0)} d`;
    if (n >= 60) return `${(n / 60).toFixed(n % 60 ? 1 : 0)} h`;
    return `${n} min`;
  }

  function rangeMs(value) {
    return { '1h': 3600e3, '6h': 6 * 3600e3, '24h': 24 * 3600e3, '7d': 7 * 24 * 3600e3, '30d': 30 * 24 * 3600e3 }[value] || 24 * 3600e3;
  }

  function table(headers, rows, opts = {}) {
    if (!rows.length) {
      return U.empty({ compact: true, icon: opts.icon || 'inbox', title: opts.emptyTitle || 'Nothing to show', body: opts.emptyBody || '' });
    }
    return `<div class="table-wrap"><table class="data-table intel-table">
      <thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>`;
  }

  function select(name, value, options, attrs = '') {
    return `<select class="input input-sm" ${attrs} data-intel-field="${esc(name)}">${options.map((option) => {
      const id = typeof option === 'string' ? option : option.value;
      const label = typeof option === 'string' ? titleCase(option) : option.label;
      return `<option value="${esc(id)}" ${String(id) === String(value) ? 'selected' : ''}>${esc(label)}</option>`;
    }).join('')}</select>`;
  }

  function kv(rows) {
    return `<dl class="intel-kv">${rows.filter(Boolean).map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
  }

  function bar(value, total, tone = 'green') {
    const pct = total ? Math.round((value / total) * 100) : 0;
    return `<div class="intel-bar" title="${value} of ${total}"><i class="tone-${tone}" style="width:${Math.max(value ? 2 : 0, pct)}%"></i></div>`;
  }

  function errorBanner(key) {
    return S.error[key] ? U.errorBanner('Could not load this section', S.error[key]) : '';
  }

  function pageHead(page, actions = '') {
    const ai = OD.ai?.button ? OD.ai.button({ kind: 'intelligence', page }, { label: 'Ask AI' }) : '';
    return `<div class="page-head intel-page-head">
      <div class="page-head-left"><h1 class="page-title">${esc(PAGES[page] || 'Intelligence')}</h1><p class="page-sub">${esc(subtitle(page))}</p></div>
      <div class="intel-head-actions">${actions}${ai}${BTN('Refresh', 'refresh', 'data-intel-refresh', 'secondary')}</div>
    </div>`;
  }

  function shell(page, body) {
    return `<div class="page intel-page" data-intel-page="${esc(page)}">
      ${S.bootError ? U.errorBanner('Intelligence is not available', S.bootError) : ''}
      ${pageHead(page, page === 'overview' ? `${BTN('Search everything', 'search', 'data-intel-nav="#/intelligence/search"', 'secondary')}${BTN('Run a dry-run', 'play', 'data-intel-nav="#/intelligence/automation"', 'primary')}` : '')}
      ${errorBanner(page)}
      ${body}
    </div>`;
  }

  function syncMini() {
    if (!OD.store) return;
    OD.store.state.intelligence = {
      resources: S.overview?.totals?.total ?? null,
      changes: S.changes.total ?? null,
      at: S.overview?.at || null,
    };
    OD.store.emit?.();
  }

  // ------------------------------------------------------------------- boot

  async function boot(force = false) {
    if (S.booted && !force) return;
    try {
      const bootData = await api.intelligence.bootstrap();
      if (!bootData || bootData.ok === false) throw new Error(bootData?.error || 'The intelligence service did not respond.');
      S.boot = bootData;
      S.booted = true;
      S.bootError = '';
      S.settings = { ...bootData.settings };
    } catch (error) {
      S.bootError = error.message || String(error);
      S.booted = false;
    }
  }

  async function safe(key, fn, fallback) {
    S.error[key] = '';
    try {
      const result = await fn();
      if (result && result.ok === false) throw new Error(result.error || 'The request failed.');
      return result;
    } catch (error) {
      S.error[key] = error.message || String(error);
      return fallback;
    }
  }

  async function loadPage(page) {
    if (page === 'overview') {
      const [resources, timeline, changes, alerts, incidents, automations] = await Promise.all([
        safe(page, () => api.intelligence.resources({}), { items: [], totals: {} }),
        safe(page, () => api.intelligence.timeline({ limit: 12, from: Date.now() - 24 * 3600e3 }), { items: [], total: 0 }),
        safe(page, () => api.intelligence.changes({ limit: 8 }), { items: [], total: 0 }),
        safe(page, () => api.intelligence.alerts({ limit: 100 }), { items: [] }),
        safe(page, () => api.intelligence.incidents({ limit: 50 }), { items: [] }),
        safe(page, () => api.intelligence.automations(), { items: [] }),
      ]);
      S.overview = {
        at: new Date().toISOString(),
        items: resources.items || [],
        totals: resources.totals || {},
        sources: resources.sources || {},
        environments: resources.environments || null,
        timeline: timeline.items || [],
        events: timeline,
        changes: changes.items || [],
        changeTotal: changes.total || 0,
        alerts: (alerts.items || []).filter((alert) => alert.state === 'firing' || alert.state === 'pending'),
        incidents: incidents.items || [],
        automations: automations.items || [],
      };
      syncMini();
      return;
    }
    if (page === 'graph') {
      const data = await safe(page, () => api.intelligence.graph({
        module: S.graph.module || undefined,
        environment: S.graph.environment || undefined,
      }), null);
      S.graph.data = data;
      return;
    }
    if (page === 'resources') {
      const data = await safe(page, () => api.intelligence.resources({
        module: S.resources.module || undefined,
        kind: S.resources.kind || undefined,
        status: S.resources.status || undefined,
        environment: S.resources.environment || undefined,
      }), { items: [], totals: {} });
      S.resources.items = data.items || [];
      S.resources.totals = data.totals || {};
      S.resources.sources = data.sources || {};
      S.resources.at = data.collectedAt || null;
      return;
    }
    if (page === 'search') {
      if (!S.search.query) return;
      S.search.busy = true;
      const data = await safe(page, () => api.intelligence.search({
        query: S.search.query,
        modules: S.search.module ? [S.search.module] : undefined,
        limit: 60,
      }), null);
      S.search.result = data;
      S.search.busy = false;
      return;
    }
    if (page === 'timeline') {
      const to = Date.now();
      const from = to - rangeMs(S.timeline.range);
      const data = await safe(page, () => api.intelligence.timeline({
        from,
        to,
        modules: S.timeline.module ? [S.timeline.module] : undefined,
        severities: S.timeline.severity ? [S.timeline.severity] : undefined,
        query: S.timeline.query,
        limit: S.timeline.limit,
        offset: S.timeline.offset,
      }), { items: [], total: 0 });
      S.timeline.rows = data.items || [];
      S.timeline.total = data.total || 0;
      S.timeline.counts = data.counts || {};
      S.timeline.errors = data.errors || [];
      return;
    }
    if (page === 'changes') {
      const data = await safe(page, () => api.intelligence.changes({
        limit: 400,
        module: S.changes.module || undefined,
        query: S.changes.query,
      }), { items: [], total: 0 });
      S.changes.items = data.items || [];
      S.changes.total = data.total || 0;
      S.changes.baseline = data.baseline === true;
      return;
    }
    if (page === 'incidents') {
      const id = null;
      const data = await safe(page, () => api.intelligence.incidents({ limit: 200 }), { items: [], total: 0 });
      S.incidents.items = data.items || [];
      S.incidents.total = data.total || 0;
      if (id) S.incidents.selected = data.items.find((item) => item.id === id) || null;
      return;
    }
    if (page === 'rca') {
      const [alerts, incidents] = await Promise.all([
        safe(page, () => api.intelligence.alerts({ limit: 100 }), { items: [] }),
        safe(page, () => api.intelligence.incidents({ limit: 100 }), { items: [] }),
      ]);
      S.rca.alerts = (alerts.items || []).filter((alert) => alert.state !== 'resolved');
      S.rca.incidents = incidents.items || [];
      return;
    }
    if (page === 'reports') {
      if (!S.reports.types.length) {
        const data = await safe(page, () => api.intelligence.reportTypes(), { types: [] });
        S.reports.types = data.types || [];
      }
      return;
    }
    if (page === 'environments') {
      const [summary, resources] = await Promise.all([
        safe(page, () => api.intelligence.environmentsSummary(), null),
        safe(page, () => api.intelligence.resources({}), { items: [] }),
      ]);
      S.environments.summary = summary;
      S.environments.items = resources.items || [];
      return;
    }
    if (page === 'automation') {
      const [list, runs, containers, connections, catalog] = await Promise.all([
        safe(page, () => api.intelligence.automations(), { items: [] }),
        safe(page, () => api.intelligence.runs({ limit: 60 }), { items: [] }),
        safe(page, () => api.docker.containers(), { items: [] }),
        safe(page, () => api.databases.connections(), { items: [] }),
        safe(page, () => api.observability.metricsCatalog({}), { catalog: [] }),
      ]);
      S.automation.items = list.items || [];
      S.automation.enabled = list.enabled !== false;
      S.automation.runs = runs.items || [];
      S.automation.containers = containers.items || [];
      S.automation.connections = connections.items || connections.connections || [];
      S.automation.metrics = (catalog.catalog || []).slice(0, 400);
      return;
    }
    if (page === 'audit') {
      const data = await safe(page, () => api.intelligence.audit({ limit: 400, module: S.audit.module || undefined }), { items: [] });
      S.audit.items = data.items || [];
      return;
    }
    if (page === 'settings') {
      const data = await safe(page, () => api.intelligence.bootstrap(), null);
      if (data) {
        S.boot = data;
        S.settings = { ...data.settings };
      }
    }
  }

  // ----------------------------------------------------------------- overview

  function overviewBody() {
    const view = S.overview;
    if (!view) return U.skeleton({ lines: 6 });
    const totals = view.totals || {};
    const byStatus = totals.byStatus || {};
    const byModule = totals.byModule || {};
    const sources = view.sources || {};
    const unhealthy = (byStatus.unhealthy || 0) + (byStatus.degraded || 0);
    const envs = view.environments?.environments || [];

    const moduleRows = MODULES.filter((meta) => byModule[meta.id]).map((meta) => {
      const moduleItems = view.items.filter((item) => item.module === meta.id);
      const healthy = moduleItems.filter((item) => item.status === 'healthy').length;
      const bad = moduleItems.filter((item) => item.status === 'unhealthy' || item.status === 'degraded').length;
      return `<div class="intel-module-row">
        <div class="intel-module-head">${moduleBadge(meta.id)}<strong>${fmtNumber(moduleItems.length)}</strong></div>
        <div class="intel-bar-row">${bar(healthy, moduleItems.length, 'green')}<span>${healthy} healthy</span>${bad ? `<span class="intel-warn">${bad} need attention</span>` : ''}</div>
      </div>`;
    }).join('');

    const sourceRows = Object.entries(sources).map(([key, source]) => `<tr>
      <td>${moduleBadge(key === 'host' ? 'host' : key)}</td>
      <td>${source.ok ? U.badge('collected', 'green') : U.badge('unavailable', 'red')}</td>
      <td>${source.ok ? esc(source.at ? timeAgo(source.at) : '') : esc(source.error || 'The source could not be read.')}</td>
    </tr>`);

    const changeRows = (view.changes || []).slice(0, 8).map((change) => `<div class="intel-list-row">
      <span class="intel-time">${esc(timeAgo(change.at))}</span>
      ${severityBadge(change.severity)}
      <div class="intel-list-main"><strong>${esc(change.title)}</strong><span>${esc(change.detail || change.resource || '')}</span></div>
      ${moduleBadge(change.module)}
    </div>`).join('');

    const eventRows = (view.timeline || []).slice(0, 10).map((event) => `<div class="intel-list-row">
      <span class="intel-time">${esc(timeAgo(event.at))}</span>
      ${severityBadge(event.severity)}
      <div class="intel-list-main"><strong>${esc(event.title)}</strong><span>${esc(event.detail || event.resource || '')}</span></div>
      ${moduleBadge(event.module)}
    </div>`).join('');

    const favorites = S.boot?.favorites || [];
    const favoriteRows = favorites.slice(0, 12).map((entry) => `<div class="intel-list-row">
      ${moduleBadge(entry.module)}
      <div class="intel-list-main"><a href="${esc(entry.href || '#/intelligence/resources')}"><strong>${esc(entry.name || entry.id)}</strong></a><span>${esc(entry.kind || '')}</span></div>
      ${BTN('', 'star', `data-intel-favorite="${esc(entry.id)}" data-name="${esc(entry.name || '')}" data-module="${esc(entry.module || '')}" data-kind="${esc(entry.kind || '')}" data-href="${esc(entry.href || '')}" title="Remove from favourites"`, 'ghost', 'xs')}
    </div>`).join('');

    return `<div class="intel-stat-grid">
        ${U.statCard({ label: 'Resources', icon: 'server', tone: 'cyan', value: fmtNumber(totals.total || 0), sub: `${Object.keys(byModule).length} source${Object.keys(byModule).length === 1 ? '' : 's'} reporting` })}
        ${U.statCard({ label: 'Need attention', icon: 'alert-triangle', tone: unhealthy ? 'orange' : 'green', value: fmtNumber(unhealthy), sub: `${byStatus.unhealthy || 0} unhealthy · ${byStatus.degraded || 0} degraded` })}
        ${U.statCard({ label: 'Change records', icon: 'repeat', tone: view.changes.length ? 'violet' : 'slate', value: fmtNumber(view.changeTotal || 0), sub: 'Retained diffs since the baseline' })}
        ${U.statCard({ label: 'Open alerts', icon: 'bell', tone: view.alerts.length ? 'red' : 'green', value: fmtNumber(view.alerts.length), sub: `${view.incidents.filter((incident) => incident.status !== 'resolved' && incident.status !== 'closed').length} open incidents` })}
        ${U.statCard({ label: 'Automations', icon: 'zap', tone: 'cyan', value: fmtNumber(view.automations.filter((automation) => automation.enabled).length), sub: `${view.automations.length} configured` })}
      </div>
      ${envs.length ? `<div class="intel-env-strip">${envs.map((env) => `<a class="intel-env-chip" href="#/intelligence/environments">${U.badge(env.name, env.tone || 'slate')}<strong>${fmtNumber(env.counts?.total || 0)}</strong><span>${env.counts?.unhealthy || 0} unhealthy</span></a>`).join('')}</div>` : ''}
      <div class="intel-grid">
        ${U.card({ title: 'Coverage by module', icon: 'layers', sub: 'Healthy versus needing attention', body: moduleRows || U.empty({ compact: true, icon: 'server', title: 'No resource sources responded', body: 'Start Docker, connect a cluster or add a database profile, then refresh.' }) })}
        ${U.card({ title: 'Source health', icon: 'activity', sub: 'Each collector is isolated; one failure does not hide the others', body: table(['Source', 'State', 'Detail'], sourceRows, { emptyTitle: 'No sources configured' }) })}
      </div>
      <div class="intel-grid">
        ${U.card({ title: 'Recent changes', icon: 'repeat', sub: 'Detected by comparing consecutive snapshots', actions: BTN('Open changes', 'arrow-right', 'data-intel-nav="#/intelligence/changes"', 'ghost'), body: changeRows ? `<div class="intel-list">${changeRows}</div>` : U.empty({ compact: true, icon: 'repeat', title: 'No changes recorded yet', body: 'The first snapshot establishes a baseline. Differences appear after the next collection cycle.' }) })}
        ${U.card({ title: 'Recent events', icon: 'history', sub: 'Docker, Kubernetes, databases, alerts and automation', actions: BTN('Open timeline', 'arrow-right', 'data-intel-nav="#/intelligence/timeline"', 'ghost'), body: eventRows ? `<div class="intel-list">${eventRows}</div>` : U.empty({ compact: true, icon: 'history', title: 'No events in the last 24 hours', body: 'Events are read from each module as they happen; nothing is synthesized.' }) })}
      </div>
      ${U.card({ title: 'Favourites', icon: 'star', sub: 'Pinned resources from the unified inventory', body: favoriteRows ? `<div class="intel-list">${favoriteRows}</div>` : U.empty({ compact: true, icon: 'star', title: 'No favourites yet', body: 'Open Resources and use the star action to pin a container, pod, database or host here.' }) })}
      ${U.infoBanner('Read-only by default', 'The intelligence layer observes existing services. It does not change a resource unless you explicitly run an automation that passed its approval gate.', 'info')}`;
  }

  // -------------------------------------------------------------------- graph

  function graphBody() {
    const graph = S.graph.data;
    if (!graph) return U.skeleton({ lines: 8 });
    const moduleFilter = select('graph-module', S.graph.module, [{ value: '', label: 'All modules' }, ...MODULES.map((entry) => ({ value: entry.id, label: entry.label }))], 'data-intel-graph-filter="module"');
    const envFilter = select('graph-env', S.graph.environment, [{ value: '', label: 'All environments' }, ...(S.boot?.environments || []).map((entry) => ({ value: entry.id, label: entry.name }))], 'data-intel-graph-filter="environment"');
    const confidence = select('graph-confidence', S.graph.confidence, [
      { value: 'all', label: 'All relationships' },
      { value: 'observed', label: 'Observed only' },
      { value: 'inferred', label: 'Inferred only' },
    ], 'data-intel-graph-filter="confidence"');

    const visibleEdges = graph.edges.filter((edge) => S.graph.confidence === 'all' || edge.confidence === S.graph.confidence);
    const visibleNodeIds = new Set(visibleEdges.flatMap((edge) => [edge.from, edge.to]));
    const ranked = graph.nodes.slice().sort((a, b) => b.degree - a.degree);
    const nodeRows = ranked.slice(0, 30).map((node) => `<tr>
      <td><a href="${esc(node.href || '#/intelligence/resources')}"><strong>${esc(node.label)}</strong></a><div class="intel-muted">${esc(node.kind)}${node.namespace ? ` · ${esc(node.namespace)}` : ''}</div></td>
      <td>${moduleBadge(node.module)}</td>
      <td>${statusBadge(node.status)}</td>
      <td>${envBadge(node.environment)}</td>
      <td>${fmtNumber(node.degree)}</td>
    </tr>`);
    const edgeRows = visibleEdges.slice(0, 40).map((edge) => {
      const from = graph.nodes.find((node) => node.id === edge.from);
      const to = graph.nodes.find((node) => node.id === edge.to);
      return `<tr>
        <td>${esc(from?.label || edge.from)}</td>
        <td>${esc(edge.label || edge.kind)}</td>
        <td>${esc(to?.label || edge.to)}</td>
        <td>${confidenceBadge(edge.confidence)}</td>
        <td class="intel-muted">${esc(edge.evidence || '')}</td>
      </tr>`;
    });

    return `<div class="intel-filter-bar">
        ${moduleFilter}${envFilter}${confidence}
        <span class="intel-muted">${fmtNumber(graph.stats?.nodes || 0)} nodes · ${fmtNumber(graph.stats?.edges || 0)} edges · ${fmtNumber(graph.stats?.observed || 0)} observed · ${fmtNumber(graph.stats?.inferred || 0)} inferred</span>
      </div>
      ${graphVisual(graph, visibleEdges, visibleNodeIds)}
      ${graph.notes?.length ? U.infoBanner('What this graph does not show', graph.notes.join(' '), 'info') : ''}
      ${(graph.stats?.isolated || 0) > 0 ? U.infoBanner('Isolated resources', `${graph.stats.isolated} resource(s) have no discovered relationship. They are shown without invented edges.`, 'info') : ''}
      <div class="intel-grid">
        ${U.card({ title: 'Most connected resources', icon: 'git-merge', sub: 'Sorted by discovered degree', body: table(['Resource', 'Module', 'Status', 'Environment', 'Degree'], nodeRows, { emptyTitle: 'No resources', emptyBody: 'Connect a source and refresh.' }) })}
        ${U.card({ title: 'Relationships', icon: 'link', sub: 'Observed edges come from reported runtime data; inferred edges are labelled', body: table(['From', 'Relationship', 'To', 'Confidence', 'Evidence'], edgeRows, { emptyTitle: 'No relationships discovered', emptyBody: 'Edges require labels, selectors, owners or recorded discovery metadata.' }) })}
      </div>`;
  }

  function graphVisual(graph, edges, visibleNodeIds) {
    const modules = ['host', 'docker', 'kubernetes', 'databases', 'observability', 'intelligence'];
    const columns = modules.map((id) => ({
      id,
      label: moduleMeta(id).label,
      nodes: graph.nodes
        .filter((node) => node.module === id && visibleNodeIds.has(node.id))
        .sort((a, b) => b.degree - a.degree || a.label.localeCompare(b.label))
        .slice(0, 12),
    })).filter((column) => column.nodes.length);
    if (!columns.length) return U.empty({ icon: 'git-branch', title: 'No visible relationships', body: 'Widen the filters or wait for the next collection cycle.' });

    const nodeW = 174;
    const nodeH = 34;
    const gapX = 66;
    const gapY = 12;
    const padX = 34;
    const padY = 54;
    const colWidth = nodeW + gapX;
    const maxRows = Math.max(...columns.map((column) => column.nodes.length));
    const width = padX * 2 + columns.length * colWidth;
    const height = Math.max(280, padY + maxRows * (nodeH + gapY) + 20);
    const positions = new Map();
    columns.forEach((column, colIndex) => {
      const x = padX + colIndex * colWidth;
      column.nodes.forEach((node, rowIndex) => {
        positions.set(node.id, { x, y: padY + rowIndex * (nodeH + gapY), node });
      });
    });
    const edgeSvg = edges.map((edge) => {
      const a = positions.get(edge.from);
      const b = positions.get(edge.to);
      if (!a || !b) return '';
      const x1 = a.x + nodeW;
      const y1 = a.y + nodeH / 2;
      const x2 = b.x;
      const y2 = b.y + nodeH / 2;
      const curve = Math.max(28, Math.abs(x2 - x1) / 2);
      const cls = edge.confidence === 'observed' ? 'observed' : 'inferred';
      return `<path class="intel-graph-edge ${cls}" d="M${x1} ${y1} C${x1 + curve} ${y1}, ${x2 - curve} ${y2}, ${x2} ${y2}"><title>${esc(`${edge.label || edge.kind}: ${a.node.label} → ${b.node.label} (${edge.confidence})`)}</title></path>`;
    }).join('');
    const nodeSvg = [...positions.values()].map(({ x, y, node }) => `<a href="${esc(node.href || '#/intelligence/resources')}" class="intel-graph-node" data-status="${esc(node.status || 'unknown')}">
      <title>${esc(`${node.label} · ${node.kind} · ${node.status}${node.environment ? ` · ${node.environment}` : ''}`)}</title>
      <rect x="${x}" y="${y}" width="${nodeW}" height="${nodeH}" rx="7"></rect>
      <text x="${x + 10}" y="${y + 14}" class="intel-graph-label">${esc(String(node.label).slice(0, 24))}</text>
      <text x="${x + 10}" y="${y + 26}" class="intel-graph-kind">${esc(String(node.kind).slice(0, 18))}</text>
      <circle cx="${x + nodeW - 11}" cy="${y + 11}" r="3.5" class="intel-graph-dot"></circle>
    </a>`).join('');
    const headers = columns.map((column, index) => `<text x="${padX + index * colWidth}" y="28" class="intel-graph-head">${esc(column.label)}</text>`).join('');
    return `<div class="intel-card intel-graph-card">
      <div class="intel-graph-legend">
        <span><i class="intel-line observed"></i>observed</span>
        <span><i class="intel-line inferred"></i>inferred</span>
        <span class="intel-muted">Showing ${positions.size} of ${graph.nodes.length} node(s); highest-degree nodes per module.</span>
      </div>
      <div class="intel-graph-wrap">
        <svg class="intel-graph" viewBox="0 0 ${width} ${height}" role="img" aria-label="Cross-module infrastructure graph">
          ${headers}${edgeSvg}${nodeSvg}
        </svg>
      </div>
    </div>`;
  }

  // ---------------------------------------------------------------- resources

  function resourcesBody() {
    const state = S.resources;
    const kinds = Object.keys(state.totals?.byKind || {}).sort();
    const statuses = Object.keys(state.totals?.byStatus || {}).sort();
    const filtered = state.items.filter((item) => {
      if (state.query) {
        const haystack = `${item.name} ${item.kind} ${item.module} ${item.host} ${item.namespace} ${item.status}`.toLowerCase();
        if (!haystack.includes(state.query.toLowerCase())) return false;
      }
      return true;
    });
    const pages = Math.max(1, Math.ceil(filtered.length / state.pageSize));
    const page = Math.min(state.page, pages);
    const slice = filtered.slice((page - 1) * state.pageSize, page * state.pageSize);
    const rows = slice.map((item) => `<tr>
      <td><a href="${esc(item.href || '#/intelligence/resources')}"><strong>${esc(item.name)}</strong></a><div class="intel-muted">${esc(item.statusDetail || item.kind)}</div></td>
      <td>${moduleBadge(item.module)}</td>
      <td>${esc(item.kind)}</td>
      <td>${statusBadge(item.status)}</td>
      <td>${envSelect(item)}</td>
      <td class="intel-muted">${esc(item.namespace || item.host || item.cluster || '—')}</td>
      <td class="intel-row-actions">${OD.ai?.iconButton ? OD.ai.iconButton({ kind: 'intelligence', page: 'resources', id: item.id, name: item.name }, { label: 'Ask AI about this resource' }) : ''}${BTN('', 'star', `data-intel-favorite="${esc(item.id)}" data-name="${esc(item.name)}" data-module="${esc(item.module)}" data-kind="${esc(item.kind)}" data-href="${esc(item.href || '')}" title="Add to favourites"`, 'ghost', 'xs')}</td>
    </tr>`);

    return `<div class="intel-filter-bar">
        <input class="input input-sm" type="search" value="${esc(state.query)}" placeholder="Filter resources…" data-intel-resource-search />
        ${select('module', state.module, [{ value: '', label: 'All modules' }, ...MODULES.map((entry) => ({ value: entry.id, label: entry.label }))], 'data-intel-resource-filter="module"')}
        ${select('kind', state.kind, [{ value: '', label: 'All kinds' }, ...kinds], 'data-intel-resource-filter="kind"')}
        ${select('status', state.status, [{ value: '', label: 'All states' }, ...statuses], 'data-intel-resource-filter="status"')}
        ${select('environment', state.environment, [{ value: '', label: 'All environments' }, ...(S.boot?.environments || []).map((entry) => ({ value: entry.id, label: entry.name }))], 'data-intel-resource-filter="environment"')}
        <span class="intel-muted">${fmtNumber(filtered.length)} shown${state.items.length !== filtered.length ? ` of ${fmtNumber(state.items.length)}` : ''}${state.at ? ` · ${timeAgo(state.at)}` : ''}</span>
      </div>
      ${U.card({
        title: 'Unified resource inventory',
        icon: 'server',
        sub: 'Links open the resource in its native workspace',
        body: table(['Resource', 'Module', 'Kind', 'State', 'Environment', 'Location', ''], rows, {
          emptyTitle: 'No resources match these filters',
          emptyBody: 'Clear the filters or start at least one source.',
        }),
      })}
      ${pages > 1 ? `<div class="intel-pager">${BTN('Previous', 'arrow-left', `data-intel-page="${page - 1}" ${page <= 1 ? 'disabled' : ''}`, 'secondary')}<span>Page ${page} of ${pages}</span>${BTN('Next', 'arrow-right', `data-intel-page="${page + 1}" ${page >= pages ? 'disabled' : ''}`, 'secondary')}</div>` : ''}
      ${state.sources ? Object.entries(state.sources).filter(([, source]) => !source.ok).map(([key, source]) => U.infoBanner(`${moduleMeta(key).label} unavailable`, source.error || 'The source did not respond.', 'warning')).join('') : ''}`;
  }

  function envSelect(item) {
    const options = [{ value: '', label: 'Unassigned' }, ...(S.boot?.environments || []).map((entry) => ({ value: entry.id, label: entry.name }))];
    return `<select class="input input-xs intel-env-select" data-intel-env-assign="${esc(item.id)}">${options.map((option) => `<option value="${esc(option.value)}" ${String(option.value) === String(item.environment || '') ? 'selected' : ''}>${esc(option.label)}</option>`).join('')}</select>`;
  }

  // ------------------------------------------------------------------- search

  function searchBody() {
    const result = S.search.result;
    const resourceRows = (result?.resources || []).map((item) => `<tr>
      <td><a href="${esc(item.href || '#/intelligence/resources')}"><strong>${esc(item.name)}</strong></a><div class="intel-muted">${esc(item.statusDetail || item.kind)}</div></td>
      <td>${moduleBadge(item.module)}</td>
      <td>${statusBadge(item.status)}</td>
      <td>${envBadge(item.environment)}</td>
    </tr>`);
    const eventRows = (result?.events || []).map((event) => `<div class="intel-list-row">
      <span class="intel-time">${esc(timeAgo(event.at))}</span>${severityBadge(event.severity)}
      <div class="intel-list-main"><strong>${esc(event.title)}</strong><span>${esc(event.detail || event.resource || '')}</span></div>
      ${moduleBadge(event.module)}
    </div>`);
    const changeRows = (result?.changes || []).map((change) => `<div class="intel-list-row">
      <span class="intel-time">${esc(timeAgo(change.at))}</span>${severityBadge(change.severity)}
      <div class="intel-list-main"><strong>${esc(change.title)}</strong><span>${esc(change.detail || change.resource || '')}</span></div>
      ${moduleBadge(change.module)}
    </div>`);
    const actionRows = (result?.actions || []).map((action) => `<a class="intel-action-chip" href="${esc(action.href)}">${icon('arrow-up-right', 12)}<span>${esc(action.label)}</span><small>${esc(moduleMeta(action.module).label)}</small></a>`).join('');
    const saved = (S.boot?.savedSearches || []).map((entry) => `<button type="button" class="intel-saved-chip" data-intel-saved-search="${esc(entry.id)}" data-query="${esc(entry.query)}">${icon('search', 12)}${esc(entry.name)}</button>`).join('');

    return `<form class="intel-search-form" data-intel-search-form>
        <div class="intel-search-input">${icon('search', 16)}<input class="input" type="search" name="query" value="${esc(S.search.query)}" placeholder="Search a container, pod, database, alert, change…" autocomplete="off" data-intel-search-input /></div>
        ${select('search-module', S.search.module, [{ value: '', label: 'All modules' }, ...MODULES.map((entry) => ({ value: entry.id, label: entry.label }))], 'data-intel-search-module')}
        ${BTN('Search', 'search', 'type="submit"', 'primary')}
        ${BTN('Save search', 'bookmark', 'data-intel-save-search', 'secondary')}
      </form>
      ${saved ? `<div class="intel-saved-row"><span class="intel-muted">Saved searches</span>${saved}</div>` : ''}
      ${result ? `<div class="intel-stat-grid compact">
        ${U.statCard({ label: 'Resources', icon: 'server', tone: 'cyan', value: fmtNumber(result.counts?.resources || 0), sub: `${result.tookMs || 0} ms` })}
        ${U.statCard({ label: 'Events', icon: 'history', tone: 'violet', value: fmtNumber(result.counts?.events || 0), sub: 'Matching the query' })}
        ${U.statCard({ label: 'Changes', icon: 'repeat', tone: 'orange', value: fmtNumber(result.counts?.changes || 0), sub: 'Recorded diffs' })}
        ${U.statCard({ label: 'Actions', icon: 'command', tone: 'slate', value: fmtNumber(result.counts?.actions || 0), sub: 'Navigation matches' })}
      </div>
      ${actionRows ? `<div class="intel-actions-wrap">${actionRows}</div>` : ''}
      ${U.card({ title: `Resources (${fmtNumber(result.resourceTotal || 0)})`, icon: 'server', body: table(['Resource', 'Module', 'State', 'Environment'], resourceRows, { emptyTitle: 'No matching resources', emptyBody: 'Try a shorter query or remove the module filter.' }) })}
      ${eventRows ? U.card({ title: 'Events', icon: 'history', body: `<div class="intel-list">${eventRows}</div>` }) : ''}
      ${changeRows ? U.card({ title: 'Changes', icon: 'repeat', body: `<div class="intel-list">${changeRows}</div>` }) : ''}` : U.empty({ icon: 'search', title: 'Search across every workspace', body: 'Enter a name, namespace, host, status or module. Results include resources, timeline events and recorded changes.' })}`;
  }

  // ----------------------------------------------------------------- timeline

  function timelineBody() {
    const state = S.timeline;
    const rows = state.rows.map((event) => `<tr>
      <td class="intel-nowrap">${esc(fmtDateTime(event.at))}<div class="intel-muted">${esc(timeAgo(event.at))}</div></td>
      <td>${severityBadge(event.severity)}</td>
      <td>${moduleBadge(event.module)}</td>
      <td>${event.href ? `<a href="${esc(event.href)}"><strong>${esc(event.title)}</strong></a>` : `<strong>${esc(event.title)}</strong>`}<div class="intel-muted">${esc(event.detail || '')}</div></td>
      <td>${esc(event.resource || '—')}</td>
      <td class="intel-muted">${esc((event.tags || []).join(', '))}</td>
    </tr>`);
    const counts = Object.entries(state.counts || {}).sort((a, b) => b[1] - a[1]).map(([module, count]) => `<span class="intel-count-chip">${moduleBadge(module)}<strong>${fmtNumber(count)}</strong></span>`).join('');
    const page = Math.floor(state.offset / state.limit) + 1;
    const pages = Math.max(1, Math.ceil(state.total / state.limit));
    return `<div class="intel-filter-bar">
        <input class="input input-sm" type="search" value="${esc(state.query)}" placeholder="Filter events…" data-intel-timeline-search />
        ${select('range', state.range, [{ value: '1h', label: 'Last hour' }, { value: '6h', label: 'Last 6 hours' }, { value: '24h', label: 'Last 24 hours' }, { value: '7d', label: 'Last 7 days' }, { value: '30d', label: 'Last 30 days' }], 'data-intel-timeline="range"')}
        ${select('module', state.module, [{ value: '', label: 'All modules' }, ...MODULES.map((entry) => ({ value: entry.id, label: entry.label }))], 'data-intel-timeline="module"')}
        ${select('severity', state.severity, [{ value: '', label: 'All severities' }, { value: 'info', label: 'Info' }, { value: 'success', label: 'Success' }, { value: 'warning', label: 'Warning' }, { value: 'error', label: 'Error' }, { value: 'critical', label: 'Critical' }], 'data-intel-timeline="severity"')}
        <span class="intel-muted">${fmtNumber(state.total)} event(s)</span>
      </div>
      ${counts ? `<div class="intel-counts">${counts}</div>` : ''}
      ${state.errors?.length ? U.infoBanner('Some sources could not be read', state.errors.join(' · '), 'warning') : ''}
      ${U.card({ title: 'Event stream', icon: 'history', sub: 'Newest first; each event links back to its module', body: table(['Time', 'Severity', 'Module', 'Event', 'Resource', 'Tags'], rows, { emptyTitle: 'No events in this range', emptyBody: 'Docker, Kubernetes, database activity, alerts, incidents, changes and automation runs all feed this stream.' }) })}
      ${pages > 1 ? `<div class="intel-pager">${BTN('Previous', 'arrow-left', `data-intel-timeline-page="${state.offset - state.limit}" ${state.offset <= 0 ? 'disabled' : ''}`, 'secondary')}<span>Page ${page} of ${pages}</span>${BTN('Next', 'arrow-right', `data-intel-timeline-page="${state.offset + state.limit}" ${state.offset + state.limit >= state.total ? 'disabled' : ''}`, 'secondary')}</div>` : ''}`;
  }

  // ------------------------------------------------------------------ changes

  function changesBody() {
    const state = S.changes;
    const rows = state.items.map((change) => `<tr>
      <td class="intel-nowrap">${esc(fmtDateTime(change.at))}<div class="intel-muted">${esc(timeAgo(change.at))}</div></td>
      <td>${severityBadge(change.severity)}</td>
      <td>${moduleBadge(change.module)}</td>
      <td>${esc(change.kind)}</td>
      <td>${change.href ? `<a href="${esc(change.href)}"><strong>${esc(change.title)}</strong></a>` : `<strong>${esc(change.title)}</strong>`}<div class="intel-muted">${esc(change.detail || '')}</div></td>
      <td>${esc(change.resource || '—')}</td>
    </tr>`);
    return `${state.baseline ? U.infoBanner('Baseline established', 'This is the first stored snapshot. The next collection cycle can compare against it and record what actually changed.', 'info') : ''}
      <div class="intel-filter-bar">
        <input class="input input-sm" type="search" value="${esc(state.query)}" placeholder="Filter changes…" data-intel-changes-search />
        ${select('module', state.module, [{ value: '', label: 'All modules' }, ...MODULES.map((entry) => ({ value: entry.id, label: entry.label }))], 'data-intel-changes="module"')}
        <span class="intel-muted">${fmtNumber(state.total)} retained change(s)</span>
        ${BTN('Detect now', 'refresh', 'data-intel-detect', 'primary')}
      </div>
      ${U.card({ title: 'Change history', icon: 'repeat', sub: 'Appearance, removal, status, image, replica and profile edits', body: table(['Time', 'Severity', 'Module', 'Kind', 'Change', 'Resource'], rows, { emptyTitle: 'No changes recorded', emptyBody: 'Use “Detect now” to compare the current resources with the stored snapshot.' }) })}`;
  }

  // ---------------------------------------------------------------- incidents

  function incidentsBody() {
    const items = S.incidents.items || [];
    const rows = items.map((incident) => `<tr>
      <td><a href="#" data-intel-incident="${esc(incident.id)}"><strong>${esc(incident.title || incident.id)}</strong></a><div class="intel-muted">${esc(incident.summary || '')}</div></td>
      <td>${severityBadge(incident.severity)}</td>
      <td>${U.badge(incident.status || 'open', incident.status === 'resolved' || incident.status === 'closed' ? 'green' : incident.status === 'acknowledged' ? 'cyan' : 'orange')}</td>
      <td>${esc((incident.services || []).slice(0, 3).join(', ') || '—')}</td>
      <td>${esc((incident.resources || []).slice(0, 3).join(', ') || '—')}</td>
      <td class="intel-nowrap">${incident.updatedAt ? esc(timeAgo(incident.updatedAt)) : '—'}</td>
      <td class="intel-row-actions">${OD.ai?.iconButton ? OD.ai.iconButton({ kind: 'intelligence', page: 'incidents', id: incident.id, name: incident.title }, { label: 'Ask AI about this incident' }) : ''}${BTN('Investigate', 'stethoscope', `data-intel-investigate-incident="${esc(incident.id)}"`, 'ghost', 'xs')}</td>
    </tr>`);
    return `<div class="intel-filter-bar"><span class="intel-muted">${fmtNumber(items.length)} incident(s) from the observability store.</span>${LINK('Open observability incidents', 'arrow-up-right', '#/observability/incidents')}${LINK('Investigate', 'stethoscope', '#/intelligence/rca', 'primary')}</div>
      ${U.card({ title: 'Cross-module incidents', icon: 'alert-triangle', sub: 'Related alerts, metrics, logs and traces are joined on demand', body: table(['Incident', 'Severity', 'Status', 'Services', 'Resources', 'Updated', ''], rows, { emptyTitle: 'No incidents', emptyBody: 'Incidents are created by alert rules or by an automation action. Nothing is generated for display.' }) })}`;
  }

  function openIncident(id) {
    const incident = (S.incidents.items || []).find((entry) => entry.id === id);
    if (!incident) {
      U.toast('That incident is no longer in the list', 'warning');
      return;
    }
    U.drawer({
      title: incident.title || incident.id,
      subtitle: incident.id,
      eyebrow: 'Incident',
      icon: 'alert-triangle',
      width: '640px',
      body: `${U.badge(incident.status || 'open', 'orange')} ${severityBadge(incident.severity)}
        <p class="intel-drawer-summary">${esc(incident.summary || 'No summary was recorded.')}</p>
        ${kv([
          ['Created', incident.createdAt ? `${esc(fmtDateTime(incident.createdAt))}` : ''],
          ['Updated', incident.updatedAt ? `${esc(fmtDateTime(incident.updatedAt))}` : ''],
          ['Services', esc((incident.services || []).join(', ') || '—')],
          ['Resources', esc((incident.resources || []).join(', ') || '—')],
          ['Assignee', esc(incident.assignee || 'unassigned')],
        ])}
        ${Array.isArray(incident.timeline) && incident.timeline.length ? `<h3 class="intel-subhead">Timeline</h3><div class="intel-list">${incident.timeline.slice(-12).map((entry) => `<div class="intel-list-row"><span class="intel-time">${esc(timeAgo(entry.at))}</span><div class="intel-list-main"><strong>${esc(entry.text || entry.type || 'update')}</strong><span>${esc(entry.by || '')}</span></div></div>`).join('')}</div>` : ''}
        ${U.infoBanner('Investigation is evidence-based', 'Open the root-cause page to collect metrics, logs, traces, alerts and changes around this incident. Hypotheses are ranked, never confirmed automatically.', 'info')}`,
      footer: `${BTN('Close', 'x', 'data-close', 'secondary')}${BTN('Open in observability', 'external-link', 'data-intel-goto-obs', 'secondary')}${BTN('Investigate', 'stethoscope', 'data-intel-rca-incident', 'primary')}`,
      onMount: ({ root, close }) => {
        root.querySelector('[data-intel-goto-obs]')?.addEventListener('click', () => { close(); location.hash = '#/observability/incidents'; });
        root.querySelector('[data-intel-rca-incident]')?.addEventListener('click', () => {
          S.rca.form = { subject: 'incident', id: incident.id, scope: '', minutes: 60, broad: false };
          S.rca.result = null;
          close();
          location.hash = '#/intelligence/rca';
        });
      },
    });
  }

  // ---------------------------------------------------------------------- RCA

  function rcaBody() {
    const form = S.rca.form;
    const subjects = [
      { value: 'manual', label: 'Resource or service scope' },
      { value: 'alert', label: 'Alert' },
      { value: 'incident', label: 'Incident' },
    ];
    const picker = form.subject === 'alert'
      ? select('rca-id', form.id, [{ value: '', label: 'Choose an alert…' }, ...S.rca.alerts.map((alert) => ({ value: alert.id, label: `${alert.name} · ${alert.severity} · ${alert.resource || 'resource'}` }))], 'data-intel-rca="id"')
      : form.subject === 'incident'
        ? select('rca-id', form.id, [{ value: '', label: 'Choose an incident…' }, ...S.rca.incidents.map((incident) => ({ value: incident.id, label: `${incident.title} · ${incident.severity}` }))], 'data-intel-rca="id"')
        : '';

    const result = S.rca.result;
    const report = result ? rcaReport(result) : U.empty({ icon: 'stethoscope', title: 'Run an investigation', body: 'Choose an alert, an incident or a resource scope. OpsDeck compares the incident window with the preceding baseline and ranks only the evidence it can verify.' });

    return `<div class="intel-card intel-rca-form">
        <div class="intel-form-grid">
          <label class="field"><span>Subject</span>${select('rca-subject', form.subject, subjects, 'data-intel-rca="subject"')}</label>
          ${picker ? `<label class="field"><span>${form.subject === 'alert' ? 'Alert' : 'Incident'}</span>${picker}</label>` : `<label class="field"><span>Scope</span><input class="input" type="text" value="${esc(form.scope)}" placeholder="service, namespace, container or host" data-intel-rca="scope" /></label>`}
          <label class="field"><span>Window</span>${select('rca-minutes', form.minutes, [{ value: 15, label: 'Last 15 minutes' }, { value: 60, label: 'Last hour' }, { value: 180, label: 'Last 3 hours' }, { value: 360, label: 'Last 6 hours' }, { value: 1440, label: 'Last 24 hours' }], 'data-intel-rca="minutes"')}</label>
          <label class="field intel-check"><span>Broad scope</span><input type="checkbox" ${form.broad ? 'checked' : ''} data-intel-rca="broad" /><small>Do not filter metric series by the scope text.</small></label>
        </div>
        <div class="intel-form-actions">${BTN(S.rca.busy ? 'Investigating…' : 'Investigate', 'stethoscope', `data-intel-rca-run ${S.rca.busy ? 'disabled' : ''}`, 'primary')}${result ? BTN('Copy JSON', 'copy', 'data-intel-rca-copy', 'secondary') : ''}</div>
      </div>
      ${S.rca.error ? U.errorBanner('The investigation could not finish', S.rca.error) : ''}
      ${report}`;
  }

  function rcaReport(result) {
    const hypotheses = (result.hypotheses || []).map((hypothesis, index) => `<div class="intel-hypothesis">
      <div class="intel-hypothesis-head"><strong>${index + 1}. ${esc(hypothesis.title)}</strong><span>${U.badge(hypothesis.label || 'low', hypothesis.label === 'high' ? 'red' : hypothesis.label === 'medium' ? 'orange' : 'slate')}<span class="intel-muted">${Math.round((hypothesis.confidence || 0) * 100)}% confidence</span></span></div>
      ${bar(Math.round((hypothesis.confidence || 0) * 100), 100, hypothesis.label === 'high' ? 'red' : hypothesis.label === 'medium' ? 'orange' : 'cyan')}
      <ul class="intel-evidence">${(hypothesis.evidence || []).map((entry) => `<li>${esc(entry)}</li>`).join('')}</ul>
      ${hypothesis.actions?.length ? `<div class="intel-next"><strong>Next steps</strong>${hypothesis.actions.map((action) => `<span>${esc(action)}</span>`).join('')}</div>` : ''}
    </div>`).join('');
    const factList = (result.facts || []).map((fact) => `<li>${esc(fact)}</li>`).join('');
    const limitations = (result.limitations || []).map((entry) => `<li>${esc(entry)}</li>`).join('');
    const metrics = (result.evidence?.metrics || []).slice(0, 12).map((metric) => `<tr>
      <td>${esc(metric.label || metric.name)}<div class="intel-muted">${esc(metric.resource || '')}</div></td>
      <td>${esc(metric.before == null ? '—' : fmtNumber(metric.before))}</td>
      <td>${esc(fmtNumber(metric.during))}</td>
      <td>${metric.deltaPercent == null ? '—' : `${metric.deltaPercent > 0 ? '+' : ''}${metric.deltaPercent}%`}</td>
      <td>${metric.zScore == null ? '—' : fmtNumber(metric.zScore)}</td>
    </tr>`);
    const timeline = (result.timeline || []).map((entry) => `<div class="intel-list-row"><span class="intel-time">${esc(fmtDateTime(entry.at))}</span><div class="intel-list-main"><strong>${esc(entry.title)}</strong><span>${esc(entry.detail || '')}</span></div>${moduleBadge(entry.module)}</div>`).join('');
    const affected = result.affected?.resources || [];
    return `<div class="intel-card intel-rca-report">
      <div class="intel-rca-head">
        <div><div class="intel-rca-title">${esc(result.subject?.title || 'Investigation')}</div><div class="intel-muted">${esc(result.window?.from ? fmtDateTime(result.window.from) : '')} → ${esc(result.window?.to ? fmtDateTime(result.window.to) : '')} · baseline ${fmtNumber(result.window?.baselineMinutes || 0)} min · ${fmtNumber(result.durationMs || 0)} ms</div></div>
        ${U.badge(result.subject?.type || 'manual', 'cyan')}
      </div>
      ${U.infoBanner('Hypotheses, not verdicts', result.summary || 'No ranked explanation was produced.', 'info')}
      <div class="intel-grid">
        ${U.card({ title: 'Facts', icon: 'info', sub: 'Measured values and recorded records', body: factList ? `<ul class="intel-facts">${factList}</ul>` : U.empty({ compact: true, icon: 'info', title: 'No facts collected', body: 'Widen the window or check that collectors are running.' }) })}
        ${U.card({ title: 'Limitations', icon: 'alert-triangle', sub: 'What this investigation could not verify', body: limitations ? `<ul class="intel-facts">${limitations}</ul>` : U.empty({ compact: true, icon: 'check', title: 'No stated limitations', body: 'Every configured evidence source returned data for this window.' }) })}
      </div>
      <h3 class="intel-subhead">Ranked hypotheses</h3>
      ${hypotheses || U.empty({ compact: true, icon: 'stethoscope', title: 'No hypothesis reached the evidence threshold', body: 'More samples, logs or traces are needed before a useful explanation can be ranked.' })}
      ${metrics.length ? U.card({ title: 'Metric movement', icon: 'trending-down', sub: 'Incident window compared with the equal-length baseline', body: table(['Metric', 'Before', 'During', 'Delta', 'z-score'], metrics) }) : ''}
      ${affected.length ? U.card({ title: 'Affected resources', icon: 'server', body: table(['Resource', 'Module', 'Kind', 'Status'], affected.slice(0, 40).map((resource) => `<tr><td>${esc(resource.name)}</td><td>${moduleBadge(resource.module)}</td><td>${esc(resource.kind)}</td><td>${statusBadge(resource.status)}</td></tr>`)) }) : ''}
      ${timeline ? U.card({ title: 'Correlated timeline', icon: 'history', body: `<div class="intel-list">${timeline}</div>` }) : ''}
    </div>`;
  }

  // ------------------------------------------------------------------ reports

  function reportsBody() {
    const state = S.reports;
    const types = state.types || [];
    const cards = types.map((type) => `<div class="intel-report-card">
      <div><strong>${esc(type.label)}</strong><span class="intel-muted">${esc(type.id)}</span></div>
      ${BTN('Generate', 'play', `data-intel-report="${esc(type.id)}"`, 'secondary', 'xs')}
    </div>`).join('');
    const result = state.result;
    let resultHtml = '';
    if (result) {
      const sections = (result.sections || []).map((section) => {
        if (section.metric) {
          const rows = (section.rows || []).slice(0, 30).map((row) => `<tr><td>${esc(row.resource)}</td><td>${esc(row.unit || '')}</td><td>${fmtNumber(row.avg)}</td><td>${fmtNumber(row.min)}</td><td>${fmtNumber(row.max)}</td><td>${fmtNumber(row.p95)}</td><td>${fmtNumber(row.last)}</td></tr>`);
          return U.card({ title: section.metric, icon: 'bar-chart', sub: `${(section.rows || []).length} series`, body: table(['Resource', 'Unit', 'Avg', 'Min', 'Max', 'p95', 'Last'], rows, { emptyTitle: 'No samples for this metric', emptyBody: 'The metric may not be collected in this environment.' }) });
        }
        if (section.alerts || section.incidents) {
          const alerts = (section.alerts || []).map((alert) => `<tr><td>${esc(alert.name)}</td><td>${severityBadge(alert.severity)}</td><td>${esc(alert.state)}</td><td>${esc(alert.resource || '')}</td></tr>`);
          const incidents = (section.incidents || []).map((incident) => `<tr><td>${esc(incident.title)}</td><td>${severityBadge(incident.severity)}</td><td>${esc(incident.status)}</td><td>${esc((incident.resources || []).join(', '))}</td></tr>`);
          return `${alerts.length ? U.card({ title: 'Alerts in range', icon: 'bell', body: table(['Alert', 'Severity', 'State', 'Resource'], alerts) }) : ''}${incidents.length ? U.card({ title: 'Incidents in range', icon: 'alert-triangle', body: table(['Incident', 'Severity', 'Status', 'Resources'], incidents) }) : ''}`;
        }
        if (section.logs) {
          return U.card({ title: 'Logs', icon: 'scroll-text', body: kv([['Records', fmtNumber(section.logs.records)], ['Retention', `${section.logs.retentionDays} days`], ['By level', esc(Object.entries(section.logs.byLevel || {}).map(([key, value]) => `${key}: ${value}`).join(' · '))]]) });
        }
        if (section.traces) {
          return U.card({ title: 'Traces', icon: 'git-branch', body: kv([['Records', fmtNumber(section.traces.records)], ['Retention', `${section.traces.retentionDays} days`], ['Services', esc((section.traces.services || []).slice(0, 12).map((service) => service.name).join(', ') || '—')]]) });
        }
        return '';
      }).join('');
      resultHtml = `<div class="intel-card intel-report-result">
        <div class="intel-report-head"><div><strong>${esc(result.title)}</strong><span class="intel-muted">${esc(result.range)} · generated ${esc(timeAgo(result.generatedAt))}</span></div>${BTN('Copy JSON', 'copy', 'data-intel-report-copy', 'secondary', 'xs')}</div>
        ${sections || U.empty({ compact: true, icon: 'bar-chart', title: 'The report is empty', body: 'No retained metric, alert or incident data matched this range.' })}
      </div>`;
    }
    return `<div class="intel-filter-bar">
        ${select('hours', state.hours, [{ value: 1, label: 'Last hour' }, { value: 24, label: 'Last 24 hours' }, { value: 168, label: 'Last 7 days' }, { value: 720, label: 'Last 30 days' }], 'data-intel-report-hours')}
        <span class="intel-muted">Reports are computed in the main process from the same stores as the dashboards.</span>
        ${LINK('Observability reports', 'arrow-up-right', '#/observability/reports')}
      </div>
      ${U.card({ title: 'Report types', icon: 'file', sub: 'Choose a real data set; nothing is pre-filled', body: `<div class="intel-report-grid">${cards || U.empty({ compact: true, icon: 'file', title: 'No report types available', body: 'The observability service did not return its report catalog.' })}</div>` })}
      ${resultHtml}`;
  }

  // -------------------------------------------------------------- environments

  function environmentsBody() {
    const data = S.environments.summary;
    if (!data) return U.skeleton({ lines: 5 });
    const envs = data.environments || [];
    const unassigned = data.unassigned || { total: 0 };
    const cards = envs.map((env) => {
      const counts = env.counts || {};
      const total = counts.total || 0;
      return `<div class="intel-env-card">
        <div class="intel-env-card-head">${U.badge(env.name, env.tone)}<strong>${fmtNumber(total)}</strong>${env.custom ? U.badge('custom', 'slate') : ''}</div>
        <p class="intel-muted">${esc(env.description || '')}</p>
        ${bar(counts.healthy || 0, total, 'green')}
        <div class="intel-env-card-foot"><span>${counts.healthy || 0} healthy</span><span>${counts.unhealthy || 0} unhealthy</span><span>${counts.degraded || 0} degraded</span></div>
        ${env.custom ? `<div class="intel-row-actions">${BTN('Edit', 'edit', `data-intel-env-edit="${esc(env.id)}"`, 'ghost', 'xs')}${BTN('Delete', 'trash', `data-intel-env-delete="${esc(env.id)}"`, 'ghost', 'xs')}</div>` : ''}
      </div>`;
    }).join('');

    const unassignedItems = (S.environments.items || []).filter((item) => !item.environment).slice(0, 80);
    const assignmentRows = unassignedItems.map((item) => `<tr>
      <td><a href="${esc(item.href || '#')}"><strong>${esc(item.name)}</strong></a></td>
      <td>${moduleBadge(item.module)}</td><td>${esc(item.kind)}</td><td>${statusBadge(item.status)}</td><td>${envSelect(item)}</td>
    </tr>`);
    const ruleRows = (data.rules || []).map((rule) => `<tr>
      <td>${esc(rule.field)}</td><td>${U.badge(rule.mode, 'slate', { mono: true })}</td><td class="mono">${esc(rule.pattern)}</td>
      <td>${envBadge(rule.environment)}</td><td>${rule.enabled ? U.badge('enabled', 'green') : U.badge('off', 'slate')}</td>
      <td class="intel-row-actions">${BTN('Edit', 'edit', `data-intel-rule-edit="${esc(rule.id)}"`, 'ghost', 'xs')}${BTN('Delete', 'trash', `data-intel-rule-delete="${esc(rule.id)}"`, 'ghost', 'xs')}</td>
    </tr>`);
    return `<div class="intel-filter-bar"><span class="intel-muted">${fmtNumber(unassigned.total)} resource(s) are not assigned to an environment.</span>${BTN('New environment', 'plus', 'data-intel-env-new', 'secondary')}${BTN('New rule', 'plus', 'data-intel-rule-new', 'primary')}</div>
      <div class="intel-env-grid">${cards}${unassigned.total ? `<div class="intel-env-card"><div class="intel-env-card-head">${U.badge('Unassigned', 'slate')}<strong>${fmtNumber(unassigned.total)}</strong></div><p class="intel-muted">No explicit assignment, rule or safe heuristic matched these resources.</p></div>` : ''}</div>
      <div class="intel-grid">
        ${U.card({ title: 'Unassigned resources', icon: 'layers', sub: 'Assign explicitly; heuristics only fire on exact tokens', body: table(['Resource', 'Module', 'Kind', 'State', 'Assign'], assignmentRows, { emptyTitle: 'Everything is assigned', emptyBody: 'Every reported resource matched an explicit assignment, a rule or an exact environment token.' }) })}
        ${U.card({ title: 'Rules', icon: 'filter', sub: 'Applied before heuristics, in order', body: table(['Field', 'Mode', 'Pattern', 'Environment', 'State', ''], ruleRows, { emptyTitle: 'No rules', emptyBody: 'Rules let you map names, labels, namespaces, hosts, images or modules to an environment.' }) })}
      </div>
      ${U.infoBanner('Heuristics are conservative', 'A resource is only inferred as production/staging/testing/development when an exact token appears in its namespace, labels or name. Everything else stays unassigned until you map it.', 'info')}`;
  }

  function openEnvironmentEditor(environment) {
    const entry = environment || { id: '', name: '', tone: 'slate', description: '' };
    U.modal({
      title: environment ? 'Edit environment' : 'New environment',
      subtitle: environment ? environment.id : 'Custom environments are additive; built-ins cannot be deleted.',
      icon: 'layers',
      body: `<div class="intel-form-grid one">
        <label class="field"><span>Name</span><input class="input" type="text" value="${esc(entry.name)}" data-intel-env-field="name" autofocus /></label>
        <label class="field"><span>Tone</span>${select('tone', entry.tone, ['slate', 'green', 'cyan', 'amber', 'orange', 'red', 'violet', 'blue'], 'data-intel-env-field="tone"')}</label>
        <label class="field"><span>Description</span><textarea class="input" rows="3" data-intel-env-field="description">${esc(entry.description || '')}</textarea></label>
      </div>`,
      footer: `${BTN('Cancel', 'x', 'data-close', 'secondary')}${BTN('Save environment', 'save', 'data-intel-env-save', 'primary')}`,
      onMount: ({ root, close }) => {
        const draft = { ...entry };
        root.addEventListener('input', (event) => {
          const field = event.target.dataset.intelEnvField;
          if (field) draft[field] = event.target.value;
        });
        root.querySelector('[data-intel-env-save]')?.addEventListener('click', async () => {
          if (!draft.name?.trim()) { U.toast('Give the environment a name', 'warning'); return; }
          const result = await api.intelligence.saveEnvironment(draft);
          if (result?.ok === false) { U.toast(result.error || 'Could not save the environment', 'error'); return; }
          close();
          U.toast('Environment saved', 'success');
          await boot(true);
          refreshView();
        });
      },
    });
  }

  function openRuleEditor(rule) {
    const entry = rule || { id: '', pattern: '', environment: S.boot?.environments?.[0]?.id || 'production', field: 'name', mode: 'contains', enabled: true };
    U.modal({
      title: rule ? 'Edit rule' : 'New environment rule',
      subtitle: 'Rules match resources before heuristics; order is top to bottom.',
      icon: 'filter',
      width: '560px',
      body: `<div class="intel-form-grid">
        <label class="field"><span>Field</span>${select('field', entry.field, [{ value: 'name', label: 'Name' }, { value: 'label', label: 'Labels' }, { value: 'namespace', label: 'Namespace' }, { value: 'host', label: 'Host' }, { value: 'image', label: 'Image' }, { value: 'module', label: 'Module' }], 'data-intel-rule-field="field"')}</label>
        <label class="field"><span>Mode</span>${select('mode', entry.mode, [{ value: 'contains', label: 'Contains' }, { value: 'regex', label: 'Regular expression' }], 'data-intel-rule-field="mode"')}</label>
        <label class="field intel-wide"><span>Pattern</span><input class="input mono" type="text" value="${esc(entry.pattern)}" placeholder="prod" data-intel-rule-field="pattern" autofocus /></label>
        <label class="field"><span>Environment</span>${select('environment', entry.environment, (S.boot?.environments || []).map((env) => ({ value: env.id, label: env.name })), 'data-intel-rule-field="environment"')}</label>
        <label class="field intel-check"><span>Enabled</span><input type="checkbox" ${entry.enabled !== false ? 'checked' : ''} data-intel-rule-field="enabled" /></label>
      </div>`,
      footer: `${BTN('Cancel', 'x', 'data-close', 'secondary')}${BTN('Save rule', 'save', 'data-intel-rule-save', 'primary')}`,
      onMount: ({ root, close }) => {
        const draft = { ...entry };
        root.addEventListener('input', (event) => {
          const field = event.target.dataset.intelRuleField;
          if (!field) return;
          draft[field] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        });
        root.addEventListener('change', (event) => {
          const field = event.target.dataset.intelRuleField;
          if (!field) return;
          draft[field] = event.target.type === 'checkbox' ? event.target.checked : event.target.value;
        });
        root.querySelector('[data-intel-rule-save]')?.addEventListener('click', async () => {
          const result = await api.intelligence.saveEnvironmentRule(draft);
          if (result?.ok === false) { U.toast(result.error || 'Could not save the rule', 'error'); return; }
          close();
          U.toast('Rule saved', 'success');
          refreshView();
        });
      },
    });
  }

  // ---------------------------------------------------------------- automation

  function automationBody() {
    const state = S.automation;
    const pending = (state.runs || []).filter((run) => run.status === 'pending-approval');
    const active = (state.items || []).filter((automation) => automation.enabled).length;
    const rows = (state.items || []).map((automation) => `<tr>
      <td><strong>${esc(automation.name)}</strong><div class="intel-muted">${esc(automation.description || '')}</div></td>
      <td>${esc(triggerLabel(automation.trigger))}</td>
      <td>${fmtNumber((automation.conditions || []).length)}</td>
      <td class="intel-muted">${esc((automation.actions || []).map((action) => action.type).join(', '))}</td>
      <td>${U.badge(automation.approval || 'never', automation.approval === 'never' ? 'slate' : automation.approval === 'destructive' ? 'orange' : 'red')}</td>
      <td>${automation.enabled ? U.badge('enabled', 'green') : U.badge('paused', 'slate')}<div class="intel-muted">${esc(automation.lastStatus || 'never')}${automation.lastRunAt ? ` · ${timeAgo(automation.lastRunAt)}` : ''}</div></td>
      <td class="intel-row-actions">
        ${BTN('Edit', 'edit', `data-intel-automation-edit="${esc(automation.id)}"`, 'ghost', 'xs')}
        ${BTN('Dry run', 'play', `data-intel-automation-dry="${esc(automation.id)}"`, 'ghost', 'xs')}
        ${BTN('Run', 'zap', `data-intel-automation-run="${esc(automation.id)}"`, 'ghost', 'xs')}
        ${BTN(automation.enabled ? 'Pause' : 'Enable', automation.enabled ? 'pause' : 'play-circle', `data-intel-automation-enable="${esc(automation.id)}" data-enabled="${automation.enabled ? 'false' : 'true'}"`, 'ghost', 'xs')}
        ${BTN('Delete', 'trash', `data-intel-automation-delete="${esc(automation.id)}"`, 'ghost', 'xs')}
      </td>
    </tr>`);
    const pendingRows = pending.map((run) => `<tr>
      <td><strong>${esc(run.automationName || run.automationId)}</strong><div class="intel-muted">${esc(run.reason || '')}</div></td>
      <td>${esc(run.trigger)}</td>
      <td>${esc((run.planned || []).map((entry) => `${entry.type}${entry.destructive ? ' (destructive)' : ''}`).join(', '))}</td>
      <td>${esc(timeAgo(run.startedAt))}</td>
      <td class="intel-row-actions">${BTN('Approve', 'check', `data-intel-run-approve="${esc(run.id)}"`, 'primary', 'xs')}${BTN('Reject', 'x', `data-intel-run-reject="${esc(run.id)}"`, 'ghost', 'xs')}${BTN('Cancel', 'circle-x', `data-intel-run-cancel="${esc(run.id)}"`, 'ghost', 'xs')}</td>
    </tr>`);
    const runRows = (state.runs || []).slice(0, 40).map((run) => `<tr>
      <td>${esc(timeAgo(run.startedAt))}</td>
      <td>${esc(run.automationName || run.automationId)}</td>
      <td>${U.badge(run.status, run.status === 'succeeded' ? 'green' : run.status === 'failed' ? 'red' : run.status === 'pending-approval' ? 'orange' : run.status === 'dry-run' ? 'cyan' : 'slate')}${run.dryRun ? U.badge('dry run', 'cyan') : ''}</td>
      <td>${esc(run.trigger)}</td>
      <td class="intel-muted">${esc((run.steps || []).map((step) => `${step.type}: ${step.ok ? 'ok' : step.detail || 'failed'}`).join(' · ') || run.reason || '')}</td>
      <td class="intel-nowrap">${run.finishedAt ? esc(timeAgo(run.finishedAt)) : '—'}</td>
    </tr>`);

    return `<div class="intel-stat-grid">
        ${U.statCard({ label: 'Automations', icon: 'zap', tone: 'cyan', value: fmtNumber(state.items.length), sub: `${active} enabled` })}
        ${U.statCard({ label: 'Pending approval', icon: 'shield-check', tone: pending.length ? 'orange' : 'green', value: fmtNumber(pending.length), sub: 'Disruptive actions wait here' })}
        ${U.statCard({ label: 'Runs retained', icon: 'history', tone: 'violet', value: fmtNumber(state.runs.length), sub: 'Bounded run history' })}
        ${U.statCard({ label: 'Engine', icon: 'timer', tone: S.automation.enabled ? 'green' : 'red', value: S.automation.enabled ? 'enabled' : 'paused', sub: 'Scheduled tick and event triggers' })}
      </div>
      ${U.infoBanner('Dry runs never execute an action', 'Use “Dry run” to evaluate conditions and see the planned actions. A real run still stops at the approval gate when the automation is configured to ask for approval.', 'info')}
      ${pending.length ? U.card({ title: 'Waiting for approval', icon: 'shield-check', sub: 'Approve only after checking the planned action', body: table(['Automation', 'Trigger', 'Planned actions', 'Started', ''], pendingRows) }) : ''}
      ${U.card({ title: 'Automations', icon: 'zap', sub: 'Schedule, condition or event triggers', actions: BTN('New automation', 'plus', 'data-intel-automation-new', 'primary'), body: table(['Name', 'Trigger', 'Conditions', 'Actions', 'Approval', 'State', ''], rows, { emptyTitle: 'No automations yet', emptyBody: 'Create one to notify a channel, open an incident, generate a report, run diagnostics, query a database read-only or restart a container with approval.' }) })}
      ${U.card({ title: 'Recent runs', icon: 'history', sub: 'Retries are bounded; every run is audited', body: table(['Started', 'Automation', 'Status', 'Trigger', 'Steps', 'Finished'], runRows, { emptyTitle: 'No runs yet' }) })}`;
  }

  function triggerLabel(trigger) {
    if (!trigger) return '—';
    if (trigger.type === 'schedule') return trigger.atTime ? `Daily at ${trigger.atTime}` : `Every ${minutesLabel(trigger.everyMinutes)}`;
    if (trigger.type === 'condition') return 'When conditions match';
    return `On event${trigger.modules?.length ? ` (${trigger.modules.join(', ')})` : ''}`;
  }

  async function openAutomationEditor(automation) {
    const draft = automation
      ? JSON.parse(JSON.stringify(automation))
      : {
        name: '', description: '', enabled: true,
        trigger: { type: 'schedule', everyMinutes: 60, atTime: '' },
        conditions: [],
        actions: [{ type: 'notify', channelIds: [], message: '', severity: 'warning' }],
        approval: 'never', cooldownMinutes: 15,
      };
    if (!Array.isArray(draft.conditions)) draft.conditions = [];
    if (!Array.isArray(draft.actions) || !draft.actions.length) draft.actions = [{ type: 'notify', channelIds: [], message: '', severity: 'warning' }];
    await loadAutomationOptions();
    const channels = await safe('automation', () => api.observability.channels(), { channels: [] });

    U.drawer({
      title: automation ? 'Edit automation' : 'New automation',
      subtitle: automation ? automation.id : 'Read-only by default; disruptive actions require approval.',
      eyebrow: 'Automation',
      icon: 'zap',
      width: '760px',
      body: automationForm(draft, channels.channels || []),
      footer: `${BTN('Cancel', 'x', 'data-close', 'secondary')}${BTN('Save automation', 'save', 'data-intel-automation-save', 'primary')}`,
      onMount: ({ root, close, body }) => {
        const rerender = () => { body.innerHTML = automationForm(draft, channels.channels || []); };
        body.addEventListener('input', (event) => {
          const path = event.target.dataset.intelDraft;
          if (path) setDraft(draft, path, event.target.type === 'checkbox' ? event.target.checked : event.target.value);
          const numberPath = event.target.dataset.intelDraftNumber;
          if (numberPath) setDraft(draft, numberPath, event.target.value === '' ? 0 : Number(event.target.value));
          const listTextPath = event.target.dataset.intelDraftListText;
          if (listTextPath) setDraft(draft, listTextPath, String(event.target.value || '').split(',').map((entry) => entry.trim()).filter(Boolean));
        });
        body.addEventListener('change', (event) => {
          const path = event.target.dataset.intelDraft;
          if (path) setDraft(draft, path, event.target.type === 'checkbox' ? event.target.checked : event.target.value);
          const numberPath = event.target.dataset.intelDraftNumber;
          if (numberPath) setDraft(draft, numberPath, event.target.value === '' ? 0 : Number(event.target.value));
          const listPath = event.target.dataset.intelDraftList;
          if (listPath) setDraft(draft, listPath, [...event.target.selectedOptions].map((option) => option.value));
          const actionType = event.target.dataset.intelActionType;
          if (actionType) {
            setDraft(draft, `actions.${Number(actionType)}`, actionDefault(event.target.value));
            rerender();
          }
          const conditionType = event.target.dataset.intelConditionType;
          if (conditionType) {
            setDraft(draft, `conditions.${Number(conditionType)}`, conditionDefault(event.target.value));
            rerender();
          }
          const triggerType = event.target.dataset.intelTriggerType;
          if (triggerType) {
            draft.trigger = { ...draft.trigger, type: triggerType };
            rerender();
          }
        });
        body.addEventListener('click', (event) => {
          const addCondition = event.target.closest('[data-intel-condition-add]');
          if (addCondition) {
            draft.conditions.push(conditionDefault('metric'));
            rerender();
            return;
          }
          const removeCondition = event.target.closest('[data-intel-condition-remove]');
          if (removeCondition) {
            draft.conditions.splice(Number(removeCondition.dataset.intelConditionRemove), 1);
            rerender();
            return;
          }
          const addAction = event.target.closest('[data-intel-action-add]');
          if (addAction) {
            draft.actions.push(actionDefault('notify'));
            rerender();
            return;
          }
          const removeAction = event.target.closest('[data-intel-action-remove]');
          if (removeAction) {
            draft.actions.splice(Number(removeAction.dataset.intelActionRemove), 1);
            rerender();
          }
        });
        root.querySelector('[data-intel-automation-save]')?.addEventListener('click', async () => {
          const payload = { ...draft, conditions: draft.conditions, actions: draft.actions };
          const result = await api.intelligence.saveAutomation(payload);
          if (result?.ok === false) { U.toast(result.error || 'Could not save the automation', 'error'); return; }
          close();
          U.toast('Automation saved', 'success');
          refreshView();
        });
      },
    });
  }

  function conditionDefault(type) {
    if (type === 'resource-status') return { type, module: 'docker', kind: '', status: 'unhealthy', operator: '>', threshold: 0 };
    if (type === 'incident-open') return { type, status: 'open', severity: 'critical', operator: '>', threshold: 0 };
    return { type: 'metric', name: 'system.cpu.usage', aggregation: 'avg', operator: '>', threshold: 85, windowMinutes: 5 };
  }

  function actionDefault(type) {
    if (type === 'create-incident') return { type, title: 'Automation incident', summary: '', severity: 'warning', services: [] };
    if (type === 'report') return { type, reportType: 'system', hours: 24 };
    if (type === 'diagnostics') return { type, target: 'system', id: '' };
    if (type === 'db-query') return { type, connectionId: '', database: '', sql: 'SELECT 1', limit: 50 };
    if (type === 'docker-restart') return { type, containerId: '' };
    return { type: 'notify', channelIds: [], message: '', severity: 'warning' };
  }

  function automationForm(draft, channels) {
    const trigger = draft.trigger || { type: 'schedule', everyMinutes: 60, atTime: '' };
    const conditions = (draft.conditions || []).map((condition, index) => conditionBlock(condition, index));
    const actions = (draft.actions || []).map((action, index) => actionBlock(action, index, channels));
    return `<div class="intel-draft">
      <div class="intel-form-grid">
        <label class="field intel-wide"><span>Name</span><input class="input" type="text" value="${esc(draft.name || '')}" data-intel-draft="name" autofocus /></label>
        <label class="field intel-wide"><span>Description</span><input class="input" type="text" value="${esc(draft.description || '')}" data-intel-draft="description" /></label>
        <label class="field"><span>Approval</span>${select('approval', draft.approval || 'never', [
          { value: 'never', label: 'Run without approval' },
          { value: 'destructive', label: 'Ask before destructive actions' },
          { value: 'always', label: 'Ask before every run' },
        ], 'data-intel-draft="approval"')}</label>
        <label class="field"><span>Cooldown (minutes)</span><input class="input" type="number" min="0" max="10080" value="${Number(draft.cooldownMinutes || 0)}" data-intel-draft-number="cooldownMinutes" /></label>
        <label class="field intel-check"><span>Enabled</span><input type="checkbox" ${draft.enabled !== false ? 'checked' : ''} data-intel-draft="enabled" /></label>
      </div>
      <h3 class="intel-subhead">Trigger</h3>
      <div class="intel-form-grid">
        <label class="field"><span>Type</span>${select('trigger', trigger.type, [
          { value: 'schedule', label: 'Schedule' },
          { value: 'condition', label: 'Condition' },
          { value: 'event', label: 'Event' },
        ], 'data-intel-trigger-type')}</label>
        ${trigger.type === 'schedule' ? `<label class="field"><span>Every (minutes)</span><input class="input" type="number" min="5" max="10080" value="${Number(trigger.everyMinutes || 60)}" data-intel-draft-number="trigger.everyMinutes" /></label>
          <label class="field"><span>Or daily at</span><input class="input" type="text" placeholder="HH:MM" value="${esc(trigger.atTime || '')}" data-intel-draft="trigger.atTime" /></label>` : ''}
        ${trigger.type === 'event' ? `<label class="field"><span>Modules (comma separated)</span><input class="input" type="text" value="${esc((trigger.modules || []).join(','))}" data-intel-draft-list-text="trigger.modules" /></label>
          <label class="field"><span>Event kinds (comma separated)</span><input class="input" type="text" value="${esc((trigger.kinds || []).join(','))}" data-intel-draft-list-text="trigger.kinds" /></label>
          <label class="field"><span>Minimum severity</span>${select('severityMin', trigger.severityMin || 'warning', ['info', 'success', 'warning', 'error', 'critical'], 'data-intel-draft="trigger.severityMin"')}</label>
          <label class="field"><span>Text match</span><input class="input" type="text" value="${esc(trigger.query || '')}" data-intel-draft="trigger.query" /></label>` : ''}
        ${trigger.type === 'condition' ? U.infoBanner('Condition trigger', 'The workflow runs when every condition below evaluates true. Conditions read live metrics, resource states or incidents.', 'info') : ''}
      </div>
      <h3 class="intel-subhead">Conditions <span class="intel-muted">${conditions.length ? 'all must match' : 'none — the trigger runs directly'}</span></h3>
      <div class="intel-draft-list">${conditions.join('') || U.empty({ compact: true, icon: 'filter', title: 'No conditions', body: 'Add conditions to make the workflow data-driven.' })}</div>
      <div class="intel-form-actions">${BTN('Add condition', 'plus', 'data-intel-condition-add', 'secondary', 'xs')}</div>
      <h3 class="intel-subhead">Actions</h3>
      <div class="intel-draft-list">${actions.join('')}</div>
      <div class="intel-form-actions">${BTN('Add action', 'plus', 'data-intel-action-add', 'secondary', 'xs')}</div>
      ${U.infoBanner('Safety rules', 'Database actions are checked with the same destructive-statement guard as the query editor; restarting a container always requires approval, retries are bounded, and every run is written to the audit trail.', 'info')}
    </div>`;
  }

  function conditionBlock(condition, index) {
    const base = `<div class="intel-draft-row">
      <div class="intel-draft-head"><strong>Condition ${index + 1}</strong>${BTN('', 'trash', `data-intel-condition-remove="${index}"`, 'ghost', 'xs')}</div>
      <div class="intel-form-grid">
        <label class="field"><span>Type</span>${select('type', condition.type, [
          { value: 'metric', label: 'Metric threshold' },
          { value: 'resource-status', label: 'Resource status count' },
          { value: 'incident-open', label: 'Open incidents' },
        ], `data-intel-condition-type="${index}"`)}</label>`;
    if (condition.type === 'resource-status') {
      return `${base}
        <label class="field"><span>Module</span>${select('module', condition.module || 'docker', MODULES.map((entry) => ({ value: entry.id, label: entry.label })), `data-intel-draft="conditions.${index}.module"`)}</label>
        <label class="field"><span>Kind</span><input class="input" type="text" value="${esc(condition.kind || '')}" placeholder="container, pod…" data-intel-draft="conditions.${index}.kind" /></label>
        <label class="field"><span>Status</span>${select('status', condition.status || 'unhealthy', ['healthy', 'degraded', 'unhealthy', 'stopped', 'unknown'], `data-intel-draft="conditions.${index}.status"`)}</label>
        <label class="field"><span>Operator</span>${select('operator', condition.operator || '>', ['>', '>=', '<', '<=', '==', '!='], `data-intel-draft="conditions.${index}.operator"`)}</label>
        <label class="field"><span>Threshold</span><input class="input" type="number" value="${Number(condition.threshold || 0)}" data-intel-draft-number="conditions.${index}.threshold" /></label>
      </div></div>`;
    }
    if (condition.type === 'incident-open') {
      return `${base}
        <label class="field"><span>Status</span>${select('status', condition.status || 'open', ['open', 'acknowledged'], `data-intel-draft="conditions.${index}.status"`)}</label>
        <label class="field"><span>Severity</span>${select('severity', condition.severity || '', [{ value: '', label: 'Any' }, 'critical', 'major', 'minor', 'warning', 'info'], `data-intel-draft="conditions.${index}.severity"`)}</label>
        <label class="field"><span>Operator</span>${select('operator', condition.operator || '>', ['>', '>=', '<', '<=', '==', '!='], `data-intel-draft="conditions.${index}.operator"`)}</label>
        <label class="field"><span>Threshold</span><input class="input" type="number" value="${Number(condition.threshold || 0)}" data-intel-draft-number="conditions.${index}.threshold" /></label>
      </div></div>`;
    }
    const metricOptions = S.automation.metrics.length
      ? S.automation.metrics.map((entry) => entry.name)
      : ['system.cpu.usage', 'system.memory.usage', 'docker.containers.unhealthy', 'k8s.pods.crashloop', 'database.connections.down', 'application.error_rate'];
    return `${base}
        <label class="field intel-wide"><span>Metric</span>${select('name', condition.name || 'system.cpu.usage', [...new Set(metricOptions)], `data-intel-draft="conditions.${index}.name"`)}</label>
        <label class="field"><span>Aggregation</span>${select('aggregation', condition.aggregation || 'avg', ['avg', 'max', 'min', 'last', 'sum', 'count'], `data-intel-draft="conditions.${index}.aggregation"`)}</label>
        <label class="field"><span>Operator</span>${select('operator', condition.operator || '>', ['>', '>=', '<', '<=', '==', '!='], `data-intel-draft="conditions.${index}.operator"`)}</label>
        <label class="field"><span>Threshold</span><input class="input" type="number" step="any" value="${Number(condition.threshold ?? 0)}" data-intel-draft-number="conditions.${index}.threshold" /></label>
        <label class="field"><span>Window (minutes)</span><input class="input" type="number" min="1" max="1440" value="${Number(condition.windowMinutes || 5)}" data-intel-draft-number="conditions.${index}.windowMinutes" /></label>
      </div></div>`;
  }

  function actionBlock(action, index, channels) {
    const base = `<div class="intel-draft-row">
      <div class="intel-draft-head"><strong>Action ${index + 1}</strong>${action.type === 'docker-restart' ? U.badge('destructive', 'red') : ''}${BTN('', 'trash', `data-intel-action-remove="${index}"`, 'ghost', 'xs')}</div>
      <div class="intel-form-grid">
        <label class="field"><span>Type</span>${select('type', action.type, [
          { value: 'notify', label: 'Send notification' },
          { value: 'create-incident', label: 'Create incident' },
          { value: 'report', label: 'Generate report' },
          { value: 'diagnostics', label: 'Run diagnostics' },
          { value: 'db-query', label: 'Run read-only SQL' },
          { value: 'docker-restart', label: 'Restart container' },
        ], `data-intel-action-type="${index}"`)}</label>`;
    if (action.type === 'create-incident') {
      return `${base}
        <label class="field intel-wide"><span>Title</span><input class="input" type="text" value="${esc(action.title || '')}" data-intel-draft="actions.${index}.title" /></label>
        <label class="field intel-wide"><span>Summary</span><input class="input" type="text" value="${esc(action.summary || '')}" data-intel-draft="actions.${index}.summary" /></label>
        <label class="field"><span>Severity</span>${select('severity', action.severity || 'warning', ['critical', 'major', 'minor', 'warning', 'info'], `data-intel-draft="actions.${index}.severity"`)}</label>
        <label class="field"><span>Services (comma separated)</span><input class="input" type="text" value="${esc((action.services || []).join(','))}" data-intel-draft-list-text="actions.${index}.services" /></label>
      </div></div>`;
    }
    if (action.type === 'report') {
      return `${base}
        <label class="field"><span>Report</span><input class="input" type="text" value="${esc(action.reportType || 'system')}" data-intel-draft="actions.${index}.reportType" /></label>
        <label class="field"><span>Hours</span><input class="input" type="number" min="1" max="720" value="${Number(action.hours || 24)}" data-intel-draft-number="actions.${index}.hours" /></label>
      </div></div>`;
    }
    if (action.type === 'diagnostics') {
      return `${base}
        <label class="field"><span>Target</span>${select('target', action.target || 'system', ['system', 'docker', 'kubernetes', 'database'], `data-intel-draft="actions.${index}.target"`)}</label>
        <label class="field"><span>Connection id (database only)</span><input class="input" type="text" value="${esc(action.id || '')}" data-intel-draft="actions.${index}.id" /></label>
      </div></div>`;
    }
    if (action.type === 'db-query') {
      const connections = S.automation.connections.map((connection) => ({ value: connection.id, label: connection.name }));
      return `${base}
        <label class="field"><span>Connection</span>${select('connectionId', action.connectionId || '', [{ value: '', label: 'Choose a connection…' }, ...connections], `data-intel-draft="actions.${index}.connectionId"`)}</label>
        <label class="field"><span>Database</span><input class="input" type="text" value="${esc(action.database || '')}" data-intel-draft="actions.${index}.database" /></label>
        <label class="field intel-wide"><span>SQL (read-only)</span><textarea class="input mono" rows="4" data-intel-draft="actions.${index}.sql">${esc(action.sql || '')}</textarea></label>
        <label class="field"><span>Row limit</span><input class="input" type="number" min="1" max="1000" value="${Number(action.limit || 50)}" data-intel-draft-number="actions.${index}.limit" /></label>
      </div></div>`;
    }
    if (action.type === 'docker-restart') {
      const containers = S.automation.containers.map((container) => ({ value: container.id, label: `${container.name} (${container.state})` }));
      return `${base}
        <label class="field intel-wide"><span>Container</span>${select('containerId', action.containerId || '', [{ value: '', label: 'Choose a container…' }, ...containers], `data-intel-draft="actions.${index}.containerId"`)}</label>
      </div></div>`;
    }
    return `${base}
        <label class="field intel-wide"><span>Channels</span><select class="input" multiple size="4" data-intel-draft-list="actions.${index}.channelIds">${(channels || []).map((channel) => `<option value="${esc(channel.id)}" ${(action.channelIds || []).includes(channel.id) ? 'selected' : ''}>${esc(channel.name || channel.type)}</option>`).join('')}</select><small>No selection sends to every enabled channel.</small></label>
        <label class="field"><span>Severity</span>${select('severity', action.severity || 'warning', ['info', 'warning', 'error', 'critical'], `data-intel-draft="actions.${index}.severity"`)}</label>
        <label class="field intel-wide"><span>Message</span><textarea class="input" rows="2" data-intel-draft="actions.${index}.message">${esc(action.message || '')}</textarea></label>
      </div></div>`;
  }

  function setDraft(target, path, value) {
    const parts = String(path).split('.');
    let cursor = target;
    for (let i = 0; i < parts.length - 1; i += 1) {
      const key = /^\d+$/.test(parts[i]) ? Number(parts[i]) : parts[i];
      if (cursor[key] == null) cursor[key] = /^\d+$/.test(parts[i + 1]) ? [] : {};
      cursor = cursor[key];
    }
    const last = parts[parts.length - 1];
    cursor[/^\d+$/.test(last) ? Number(last) : last] = value;
  }

  async function loadAutomationOptions() {
    if (S.automation.connections.length && S.automation.containers.length) return;
    const [connections, containers] = await Promise.all([
      safe('automation', () => api.databases.connections(), { items: [] }),
      safe('automation', () => api.docker.containers(), { items: [] }),
    ]);
    S.automation.connections = connections.items || connections.connections || [];
    S.automation.containers = containers.items || [];
  }

  // -------------------------------------------------------------------- audit

  function auditBody() {
    const items = S.audit.items || [];
    const rows = items.map((entry) => `<tr>
      <td class="intel-nowrap">${esc(fmtDateTime(entry.at))}<div class="intel-muted">${esc(timeAgo(entry.at))}</div></td>
      <td>${U.badge(entry.outcome || 'success', entry.outcome === 'failure' ? 'red' : entry.outcome === 'denied' ? 'orange' : entry.outcome === 'pending' ? 'cyan' : 'green')}</td>
      <td>${esc(entry.action)}</td>
      <td>${moduleBadge(entry.module)}</td>
      <td>${esc(entry.resource || '—')}</td>
      <td class="intel-muted">${esc(entry.detail || '')}</td>
    </tr>`);
    return `<div class="intel-filter-bar">
        ${select('module', S.audit.module, [{ value: '', label: 'All modules' }, ...MODULES.map((entry) => ({ value: entry.id, label: entry.label }))], 'data-intel-audit="module"')}
        <span class="intel-muted">${fmtNumber(items.length)} entries · newest first</span>
      </div>
      ${U.card({ title: 'Audit trail', icon: 'shield-check', sub: 'Environment assignment, automation runs and approvals, notifications and change detection', body: table(['Time', 'Outcome', 'Action', 'Module', 'Resource', 'Detail'], rows, { emptyTitle: 'No audited actions yet', emptyBody: 'Assign an environment, run an automation or send a notification to create an entry.' }) })}`;
  }

  // ----------------------------------------------------------------- settings

  function settingsBody() {
    const settings = S.settings || {};
    const status = S.boot?.status || {};
    return `<div class="intel-grid">
      ${U.card({
        title: 'Collection and automation',
        icon: 'settings',
        sub: 'These preferences are stored in the main process',
        body: `<div class="intel-form-grid">
          <label class="field intel-check"><span>Automation enabled</span><input type="checkbox" ${settings.automationEnabled !== false ? 'checked' : ''} data-intel-setting="automationEnabled" /><small>When disabled, scheduled and condition triggers do not run. Manual dry runs still work.</small></label>
          <label class="field"><span>Automation check interval (seconds)</span><input class="input" type="number" min="5" max="3600" value="${Number(settings.automationIntervalSec || 15)}" data-intel-setting-number="automationIntervalSec" /></label>
          <label class="field intel-check"><span>Use environment heuristics</span><input type="checkbox" ${settings.environmentMatch !== false ? 'checked' : ''} data-intel-setting="environmentMatch" /><small>Exact tokens only; explicit assignments and rules always win.</small></label>
        </div>
        <div class="intel-form-actions">${BTN('Save settings', 'save', 'data-intel-settings-save', 'primary')}</div>`,
      })}
      ${U.card({
        title: 'Storage and status',
        icon: 'hard-drive',
        body: kv([
          ['Data file', `<span class="mono">${esc(status.store?.file || '—')}</span>`],
          ['Loaded', status.store?.loaded ? U.badge('yes', 'green') : U.badge('no', 'red')],
          ['Last refresh', status.lastRefresh?.at ? `${esc(fmtDateTime(status.lastRefresh.at))} · ${fmtNumber(status.lastRefresh.resources)} resource(s) · ${fmtNumber(status.lastRefresh.durationMs)} ms` : 'Not run yet'],
          ['Last error', status.lastError ? esc(status.lastError) : '—'],
          ['Automation engine', status.automation?.enabled ? U.badge('enabled', 'green') : U.badge('disabled', 'slate')],
        ]),
      })}
    </div>
    ${U.infoBanner('Backward compatibility', 'The intelligence store is a separate 0600 JSON document. Existing Docker, Kubernetes, database and observability data is untouched, and the intelligence layer never deletes their records.', 'info')}`;
  }

  // ------------------------------------------------------------------- render

  const BODIES = {
    overview: overviewBody,
    graph: graphBody,
    resources: resourcesBody,
    search: searchBody,
    timeline: timelineBody,
    changes: changesBody,
    incidents: incidentsBody,
    rca: rcaBody,
    reports: reportsBody,
    environments: environmentsBody,
    automation: automationBody,
    audit: auditBody,
    settings: settingsBody,
  };

  async function render(route) {
    const requested = (route.parts && route.parts[0]) || 'overview';
    S.page = requested;
    if (!S.booted) await boot();
    if (!PAGES[S.page]) {
      return `<div class="page intel-page">
        <div class="page-head"><div class="page-head-left"><h1 class="page-title">Intelligence</h1><p class="page-sub">That page does not exist.</p></div></div>
        ${U.empty({ icon: 'compass', title: 'Page not found', body: `There is no intelligence view for “${S.page}”.`, action: LINK('Open overview', 'git-branch', '#/intelligence/overview', 'primary') })}
      </div>`;
    }
    S.error[S.page] = '';
    await loadPage(S.page);
    const body = (BODIES[S.page] || overviewBody)();
    return shell(S.page, body);
  }

  function mount(root) {
    if (!root) return;
    dispose();
    const controller = new AbortController();
    S.controller = controller;
    const opts = { signal: controller.signal };

    root.addEventListener('click', onClick, opts);
    root.addEventListener('change', onChange, opts);
    root.addEventListener('input', onInput, opts);
    root.addEventListener('submit', onSubmit, opts);
    root.addEventListener('keydown', onKeyDown, opts);

    try {
      S.unsubscribe = api.events.intelligence((event) => {
        if (!event) return;
        if (event.type === 'automation') {
          if (S.page === 'automation') {
            const automationEvent = event.event || {};
            if (automationEvent.type === 'automation:pending') {
              U.toast('Automation waiting for approval', 'warning', { description: automationEvent.automation?.name || '' });
            }
          } else if (S.page === 'overview') {
            loadPage('overview').then(() => { if (S.page === 'overview') OD.app?.rerender?.(); }).catch(() => {});
          }
        }
        if (event.type === 'changes' && Array.isArray(event.changes) && event.changes.length) {
          if (S.page === 'overview' || S.page === 'changes') {
            U.toast(`${event.changes.length} change(s) detected`, 'info');
          }
        }
      });
    } catch { S.unsubscribe = null; }

    if (['overview', 'changes', 'timeline'].includes(S.page)) {
      const page = S.page;
      S.timer = setInterval(async () => {
        if (document.hidden || S.page !== page || !document.querySelector(`[data-intel-page="${page}"]`)) return;
        await loadPage(page);
        if (S.page !== page) return;
        OD.app?.rerender?.();
      }, 45000);
    }
  }

  function dispose() {
    if (S.timer) clearInterval(S.timer);
    S.timer = null;
    if (S.controller) S.controller.abort();
    S.controller = null;
    if (S.unsubscribe) S.unsubscribe();
    S.unsubscribe = null;
  }

  function refreshView() {
    OD.app?.rerender?.();
  }

  // ------------------------------------------------------------------ events

  async function onClick(event) {
    const nav = event.target.closest('[data-intel-nav]');
    if (nav) { event.preventDefault(); location.hash = nav.dataset.intelNav; return; }
    if (event.target.closest('[data-intel-refresh]')) {
      event.preventDefault();
      await loadPage(S.page);
      refreshView();
      return;
    }
    const pageButton = event.target.closest('[data-intel-page]');
    if (pageButton && pageButton.dataset.intelPage) {
      event.preventDefault();
      S.resources.page = Math.max(1, Number(pageButton.dataset.intelPage) || 1);
      refreshView();
      return;
    }
    const timelinePage = event.target.closest('[data-intel-timeline-page]');
    if (timelinePage) {
      event.preventDefault();
      S.timeline.offset = Math.max(0, Number(timelinePage.dataset.intelTimelinePage) || 0);
      await loadPage('timeline');
      refreshView();
      return;
    }
    const fav = event.target.closest('[data-intel-favorite]');
    if (fav) {
      event.preventDefault();
      const result = await api.intelligence.favorite({
        id: fav.dataset.intelFavorite,
        name: fav.dataset.name,
        module: fav.dataset.module,
        kind: fav.dataset.kind,
        href: fav.dataset.href,
      });
      if (result?.ok === false) U.toast(result.error || 'Could not update favourites', 'error');
      else {
        if (S.boot) {
          const list = (S.boot.favorites || []).filter((entry) => entry.id !== fav.dataset.intelFavorite);
          if (result.favorite) {
            list.unshift({
              id: fav.dataset.intelFavorite,
              name: fav.dataset.name,
              module: fav.dataset.module,
              kind: fav.dataset.kind,
              href: fav.dataset.href,
              at: new Date().toISOString(),
            });
          }
          S.boot.favorites = list;
        }
        U.toast(result.favorite ? 'Added to favourites' : 'Removed from favourites', 'success');
        refreshView();
      }
      return;
    }
    const detect = event.target.closest('[data-intel-detect]');
    if (detect) {
      detect.disabled = true;
      try {
        const result = await api.intelligence.detectChanges();
        if (result?.ok === false) U.toast(result.error || 'Change detection failed', 'error');
        else U.toast(result.changes?.length ? `${result.changes.length} change(s) detected` : 'No changes since the last snapshot', result.changes?.length ? 'info' : 'success');
        await loadPage('changes');
        refreshView();
      } finally { detect.disabled = false; }
      return;
    }
    const incident = event.target.closest('[data-intel-incident]');
    if (incident) { event.preventDefault(); openIncident(incident.dataset.intelIncident); return; }
    const investigate = event.target.closest('[data-intel-investigate-incident]');
    if (investigate) {
      event.preventDefault();
      S.rca.form = { subject: 'incident', id: investigate.dataset.intelInvestigateIncident, scope: '', minutes: 60, broad: false };
      S.rca.result = null;
      location.hash = '#/intelligence/rca';
      return;
    }
    if (event.target.closest('[data-intel-rca-run]')) { await runInvestigation(); return; }
    if (event.target.closest('[data-intel-rca-copy]')) {
      const result = S.rca.result;
      if (result) { await copyText(JSON.stringify(result, null, 2)); U.toast('Investigation copied', 'success'); }
      return;
    }

    // environments
    if (event.target.closest('[data-intel-env-new]')) { openEnvironmentEditor(null); return; }
    const envEdit = event.target.closest('[data-intel-env-edit]');
    if (envEdit) { const env = (S.boot?.environments || []).find((entry) => entry.id === envEdit.dataset.intelEnvEdit); if (env) openEnvironmentEditor(env); return; }
    const envDelete = event.target.closest('[data-intel-env-delete]');
    if (envDelete) {
      const confirmed = await U.confirm({ title: 'Delete environment?', message: 'Assignments and rules that point at this environment are removed. Resources themselves are never touched.', confirmLabel: 'Delete', tone: 'danger' });
      if (!confirmed) return;
      const result = await api.intelligence.deleteEnvironment(envDelete.dataset.intelEnvDelete);
      if (result?.ok === false) U.toast(result.error || 'Could not delete the environment', 'error');
      else { await boot(true); refreshView(); }
      return;
    }
    if (event.target.closest('[data-intel-rule-new]')) { openRuleEditor(null); return; }
    const ruleEdit = event.target.closest('[data-intel-rule-edit]');
    if (ruleEdit) { const rule = (S.environments.summary?.rules || []).find((entry) => entry.id === ruleEdit.dataset.intelRuleEdit); if (rule) openRuleEditor(rule); return; }
    const ruleDelete = event.target.closest('[data-intel-rule-delete]');
    if (ruleDelete) {
      const result = await api.intelligence.deleteEnvironmentRule(ruleDelete.dataset.intelRuleDelete);
      if (result?.ok === false) U.toast(result.error || 'Could not delete the rule', 'error');
      else { U.toast('Rule removed', 'success'); refreshView(); }
      return;
    }

    // automation
    if (event.target.closest('[data-intel-automation-new]')) { await openAutomationEditor(null); return; }
    const automationEdit = event.target.closest('[data-intel-automation-edit]');
    if (automationEdit) { const item = S.automation.items.find((entry) => entry.id === automationEdit.dataset.intelAutomationEdit); if (item) await openAutomationEditor(item); return; }
    const automationDry = event.target.closest('[data-intel-automation-dry]');
    if (automationDry) {
      automationDry.disabled = true;
      try {
        const result = await api.intelligence.runAutomation(automationDry.dataset.intelAutomationDry, true);
        if (result?.ok === false) U.toast(result.error || 'Dry run failed', 'error');
        else U.toast('Dry run completed', 'success', { description: result.run?.reason || '' });
        await loadPage('automation');
        refreshView();
      } finally { automationDry.disabled = false; }
      return;
    }
    const automationRun = event.target.closest('[data-intel-automation-run]');
    if (automationRun) {
      const confirmed = await U.confirm({
        title: 'Run this automation?',
        message: 'Conditions are evaluated against live data. If the automation is configured to require approval, the run stops at the approval gate before any disruptive action.',
        confirmLabel: 'Run now',
        tone: 'accent',
      });
      if (!confirmed) return;
      const result = await api.intelligence.runAutomation(automationRun.dataset.intelAutomationRun, false);
      if (result?.ok === false) U.toast(result.error || 'The automation could not run', 'error');
      else if (result.pending) U.toast('Run is waiting for approval', 'warning');
      else U.toast(`Automation ${result.run?.status || 'finished'}`, result.run?.status === 'failed' ? 'error' : 'success');
      await loadPage('automation');
      refreshView();
      return;
    }
    const automationEnable = event.target.closest('[data-intel-automation-enable]');
    if (automationEnable) {
      const result = await api.intelligence.enableAutomation(automationEnable.dataset.intelAutomationEnable, automationEnable.dataset.enabled === 'true');
      if (result?.ok === false) U.toast(result.error || 'Could not change the automation', 'error');
      await loadPage('automation');
      refreshView();
      return;
    }
    const automationDelete = event.target.closest('[data-intel-automation-delete]');
    if (automationDelete) {
      const confirmed = await U.confirm({ title: 'Delete automation?', message: 'Run history stays in the audit trail. The workflow definition is removed.', confirmLabel: 'Delete', tone: 'danger' });
      if (!confirmed) return;
      const result = await api.intelligence.deleteAutomation(automationDelete.dataset.intelAutomationDelete);
      if (result?.ok === false) U.toast(result.error || 'Could not delete the automation', 'error');
      await loadPage('automation');
      refreshView();
      return;
    }
    const approve = event.target.closest('[data-intel-run-approve]');
    if (approve) {
      const confirmed = await U.confirm({ title: 'Approve this run?', message: 'The planned actions, including any destructive step, will execute now. The approval is recorded in the audit trail.', confirmLabel: 'Approve and run', tone: 'danger' });
      if (!confirmed) return;
      approve.disabled = true;
      const result = await api.intelligence.approveRun(approve.dataset.intelRunApprove);
      approve.disabled = false;
      if (result?.ok === false) U.toast(result.error || 'Could not approve the run', 'error');
      else U.toast(`Run ${result.run?.status || 'finished'}`, 'success');
      await loadPage('automation');
      refreshView();
      return;
    }
    const reject = event.target.closest('[data-intel-run-reject]');
    if (reject) {
      const reason = await U.prompt({ title: 'Reject this run', label: 'Reason (optional)', placeholder: 'Why is this run being rejected?' });
      if (reason === null) return;
      const result = await api.intelligence.rejectRun(reject.dataset.intelRunReject, reason);
      if (result?.ok === false) U.toast(result.error || 'Could not reject the run', 'error');
      await loadPage('automation');
      refreshView();
      return;
    }
    const cancel = event.target.closest('[data-intel-run-cancel]');
    if (cancel) {
      const result = await api.intelligence.cancelRun(cancel.dataset.intelRunCancel);
      if (result?.ok === false) U.toast(result.error || 'Could not cancel the run', 'error');
      await loadPage('automation');
      refreshView();
      return;
    }

    // reports
    const report = event.target.closest('[data-intel-report]');
    if (report) {
      report.disabled = true;
      S.reports.busy = true;
      try {
        const to = Date.now();
        const result = await api.intelligence.generateReport({ type: report.dataset.intelReport, from: to - S.reports.hours * 3600e3, to, format: 'json' });
        S.reports.result = result?.ok === false ? null : result;
        if (result?.ok === false) U.toast(result.error || 'The report could not be generated', 'error');
        else U.toast('Report generated', 'success');
        refreshView();
      } finally { report.disabled = false; S.reports.busy = false; }
      return;
    }
    if (event.target.closest('[data-intel-report-copy]')) {
      if (S.reports.result) { await copyText(JSON.stringify(S.reports.result, null, 2)); U.toast('Report copied', 'success'); }
      return;
    }

    // saved searches
    const savedSearch = event.target.closest('[data-intel-saved-search]');
    if (savedSearch) {
      S.search.query = savedSearch.dataset.query || '';
      await loadPage('search');
      refreshView();
      return;
    }
    if (event.target.closest('[data-intel-save-search]')) {
      const name = await U.prompt({ title: 'Save this search', label: 'Name', value: S.search.query || '' });
      if (!name) return;
      const result = await api.intelligence.saveSearch({ name, query: S.search.query, filters: { module: S.search.module } });
      if (result?.ok === false) U.toast(result.error || 'Could not save the search', 'error');
      else { U.toast('Search saved', 'success'); await boot(true); refreshView(); }
      return;
    }

    if (event.target.closest('[data-intel-settings-save]')) {
      const patch = {};
      document.querySelectorAll('[data-intel-setting]').forEach((el) => { patch[el.dataset.intelSetting] = el.type === 'checkbox' ? el.checked : el.value; });
      document.querySelectorAll('[data-intel-setting-number]').forEach((el) => { patch[el.dataset.intelSettingNumber] = Number(el.value); });
      const result = await api.intelligence.updateSettings(patch);
      if (result?.ok === false) U.toast(result.error || 'Could not save settings', 'error');
      else { U.toast('Settings saved', 'success'); await boot(true); refreshView(); }
    }
  }

  function onChange(event) {
    const el = event.target;
    const resourceFilter = el.dataset.intelResourceFilter;
    if (resourceFilter) {
      S.resources[resourceFilter] = el.value;
      S.resources.page = 1;
      refreshView();
      return;
    }
    if (el.dataset.intelEnvAssign) {
      assignEnvironment(el.dataset.intelEnvAssign, el.value);
      return;
    }
    const graphFilter = el.dataset.intelGraphFilter;
    if (graphFilter) {
      S.graph[graphFilter] = el.value;
      refreshView();
      return;
    }
    const timeline = el.dataset.intelTimeline;
    if (timeline) {
      S.timeline[timeline] = el.value;
      S.timeline.offset = 0;
      refreshView();
      return;
    }
    if (el.dataset.intelChanges) { S.changes[el.dataset.intelChanges] = el.value; refreshView(); return; }
    if (el.dataset.intelAudit) { S.audit[el.dataset.intelAudit] = el.value; refreshView(); return; }
    if (el.dataset.intelSearchModule !== undefined) { S.search.module = el.value; return; }
    if (el.dataset.intelReportHours) { S.reports.hours = Number(el.value) || 24; return; }
    const rcaField = el.dataset.intelRca;
    if (rcaField) {
      if (rcaField === 'subject') { S.rca.form.subject = el.value; S.rca.form.id = ''; refreshView(); return; }
      if (rcaField === 'broad') { S.rca.form.broad = el.checked; return; }
      S.rca.form[rcaField] = rcaField === 'minutes' ? Number(el.value) : el.value;
      return;
    }
  }

  function onInput(event) {
    const el = event.target;
    if (el.dataset.intelResourceSearch !== undefined) return; // applied on Enter / change
    if (el.dataset.intelTimelineSearch !== undefined) return;
    if (el.dataset.intelChangesSearch !== undefined) return;
    if (el.dataset.intelSearchInput !== undefined) S.search.query = el.value;
  }

  async function onSubmit(event) {
    const form = event.target.closest('[data-intel-search-form]');
    if (form) {
      event.preventDefault();
      const input = form.querySelector('input[name="query"]');
      S.search.query = String(input?.value || '').trim();
      await loadPage('search');
      refreshView();
      return;
    }
  }

  function onKeyDown(event) {
    const el = event.target;
    if (event.key !== 'Enter') return;
    if (el.dataset.intelResourceSearch !== undefined) {
      event.preventDefault();
      S.resources.query = el.value;
      S.resources.page = 1;
      refreshView();
    } else if (el.dataset.intelTimelineSearch !== undefined) {
      event.preventDefault();
      S.timeline.query = el.value;
      S.timeline.offset = 0;
      refreshView();
    } else if (el.dataset.intelChangesSearch !== undefined) {
      event.preventDefault();
      S.changes.query = el.value;
      refreshView();
    }
  }

  async function assignEnvironment(resourceId, environment) {
    const result = await api.intelligence.assignEnvironment({ resourceId, environment: environment || '' });
    if (result?.ok === false) U.toast(result.error || 'Could not assign the environment', 'error');
    else {
      U.toast(environment ? 'Environment assigned' : 'Environment assignment removed', 'success');
      const item = S.resources.items.find((entry) => entry.id === resourceId);
      if (item) item.environment = environment || null;
      if (S.environments.summary && S.environments.items) {
        const target = S.environments.items.find((entry) => entry.id === resourceId);
        if (target) target.environment = environment || null;
      }
      refreshView();
    }
  }

  async function runInvestigation() {
    const form = S.rca.form;
    if (form.subject === 'alert' && !form.id) { U.toast('Choose an alert first', 'warning'); return; }
    if (form.subject === 'incident' && !form.id) { U.toast('Choose an incident first', 'warning'); return; }
    if (form.subject === 'manual' && !String(form.scope || '').trim()) { U.toast('Enter a scope such as a service, namespace or host', 'warning'); return; }
    S.rca.busy = true;
    S.rca.error = '';
    S.rca.result = null;
    refreshView();
    try {
      const to = Date.now();
      const result = await api.intelligence.investigate({
        alertId: form.subject === 'alert' ? form.id : undefined,
        incidentId: form.subject === 'incident' ? form.id : undefined,
        scope: form.subject === 'manual' ? form.scope : undefined,
        from: to - Number(form.minutes) * 60e3,
        to,
        broad: form.broad === true,
      });
      if (!result || result.ok === false) throw new Error(result?.error || 'The investigation did not return a report.');
      S.rca.result = result;
      U.toast('Investigation complete', 'success');
    } catch (error) {
      S.rca.error = error.message || String(error);
      U.toast('Investigation failed', 'error', { description: S.rca.error });
    } finally {
      S.rca.busy = false;
      refreshView();
    }
  }

  // ------------------------------------------------------------------- export

  OD.views = OD.views || {};
  OD.views.intelligence = {
    render,
    mount,
    dispose,
    pages: PAGES,
    label(section) {
      return PAGES[section] || titleCase(section || 'overview');
    },
  };
})();
