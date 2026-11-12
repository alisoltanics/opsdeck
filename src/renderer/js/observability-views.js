'use strict';

/**
 * Observability workspace.
 *
 * Every number, alert, log line and trace shown here is returned by the main
 * process ObservabilityService. The renderer never probes the network, never
 * fabricates a sample and never performs a lifecycle action directly.
 */
(function () {
  const api = window.opsdeck;
  const { esc, fmtNumber, fmtBytes, fmtPercent, timeAgo, fmtDateTime, titleCase, copyText, truncate } = OD.utils;
  const { icon } = OD.icons;
  const U = OD.ui;
  const C = OD.charts;

  const PAGES = {
    overview: 'Overview',
    infrastructure: 'Infrastructure',
    docker: 'Docker',
    kubernetes: 'Kubernetes',
    databases: 'Databases',
    synthetic: 'Synthetic checks',
    network: 'Network',
    applications: 'Applications',
    logs: 'Logs',
    traces: 'Traces',
    alerts: 'Alerts',
    incidents: 'Incidents',
    dashboards: 'Dashboards',
    metrics: 'Metrics explorer',
    reports: 'Reports',
    integrations: 'Integrations',
    notifications: 'Notifications',
    agents: 'Agents & ingest',
    remediation: 'Remediation',
    settings: 'Settings',
  };

  const RANGE_PAGES = new Set(['overview', 'docker', 'kubernetes', 'databases', 'applications', 'metrics', 'dashboards']);
  // Read-only pages refresh themselves without replacing a form the user is
  // editing. Pages with inputs (logs, traces, settings) refresh on demand.
  const LIVE_PAGES = new Set(['overview', 'infrastructure', 'docker', 'kubernetes', 'databases', 'applications']);
  // Adapters with a real query endpoint in the main process. Others expose
  // discovery only and must not pretend to accept a query.
  const QUERYABLE_INTEGRATIONS = new Set(['prometheus', 'victoriametrics', 'netdata', 'loki', 'elasticsearch', 'opensearch']);

  const S = {
    booted: false,
    bootError: '',
    boot: null,
    page: 'overview',
    range: '1h',
    error: {},
    loading: {},
    overview: null,
    collectors: {},
    dashboards: null,
    dashboard: null,
    servers: [],
    targets: [],
    network: { checks: [], devices: [] },
    logs: { stats: null, rows: [], total: 0, query: '', level: '', source: '', collected: '' },
    traces: { stats: null, services: [], rows: [], total: 0, trace: null, service: '', errors: false },
    alerts: { rules: [], items: [], silences: [], maintenance: [], tab: 'active' },
    incidents: { items: [], total: 0, selected: null },
    metrics: { catalog: [], result: null, name: '', search: '' },
    integrations: { items: [], definitions: [], vault: null },
    channels: [],
    agents: null,
    remediation: null,
    reports: { types: [], result: null },
    settings: null,
    timer: null,
    liveTimer: null,
    warmupTimer: null,
    warmedPage: '',
  };

  const BTN = (label, iconName, attrs = '', variant = 'secondary', size = 'sm') =>
    `<button type="button" class="btn btn-${variant} btn-${size}" ${attrs}>${iconName ? icon(iconName, 14) : ''}<span>${esc(label)}</span></button>`;

  const LINK = (label, iconName, href, variant = 'secondary') =>
    `<a class="btn btn-${variant} btn-sm" href="${href}">${iconName ? icon(iconName, 14) : ''}<span>${esc(label)}</span></a>`;

  function fmtUnit(value, unit = '', digits = 1) {
    if (value == null || value === '' || !Number.isFinite(Number(value))) return '—';
    const n = Number(value);
    const u = String(unit || '').toLowerCase();
    if (u === 'percent') return fmtPercent(n, digits);
    if (u === 'bytes') return fmtBytes(n);
    if (u === 'bytes_per_second') return `${fmtBytes(n)}/s`;
    if (u === 'milliseconds' || u === 'ms') return `${fmtNumber(n)} ms`;
    if (u === 'seconds') return n < 120 ? `${n.toFixed(0)}s` : `${(n / 3600).toFixed(1)}h`;
    if (u === 'mhz') return `${fmtNumber(n)} MHz`;
    if (u === 'celsius') return `${n.toFixed(1)} °C`;
    if (u === 'days') return `${fmtNumber(n)} d`;
    if (u === 'count') return fmtNumber(n);
    return fmtNumber(n);
  }

  function toneFor(value, warn = 70, bad = 90) {
    if (value == null || !Number.isFinite(Number(value))) return 'slate';
    if (Number(value) >= bad) return 'red';
    if (Number(value) >= warn) return 'orange';
    return 'green';
  }

  function statusBadge(ok, good = 'OK', badText = 'Failed') {
    if (ok === null || ok === undefined) return U.badge('Unknown', 'slate');
    return U.badge(ok ? good : badText, ok ? 'green' : 'red');
  }

  function severityBadge(severity) {
    const tone = { critical: 'red', warning: 'orange', info: 'cyan' }[severity] || 'slate';
    return U.badge(String(severity || 'info'), tone);
  }

  function chip(text, tone = 'slate') {
    return `<span class="badge tone-${esc(tone)}">${esc(text)}</span>`;
  }

  function seriesPoints(result) {
    const series = result?.series?.[0];
    return series?.points || [];
  }

  function chart(result, opts = {}) {
    const points = seriesPoints(result);
    const labels = points.filter((_, index) => index % Math.max(1, Math.ceil(points.length / 6)) === 0)
      .map((point) => new Date(point[0]).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false }));
    if (!points.length) return `<div class="obs-chart-empty">${icon('activity', 18)}<span>${esc(opts.empty || 'No samples in this range yet.')}</span></div>`;
    return C.area(points.map((point) => point[1]), {
      color: opts.color || 'var(--accent)',
      height: opts.height || 150,
      labels,
      min: opts.min,
      max: opts.max,
      format: (value) => fmtUnit(value, opts.unit || ''),
      label: opts.label || 'Metric trend',
    });
  }

  function table(headers, rows, opts = {}) {
    if (!rows.length) return U.empty({ compact: true, icon: opts.icon || 'inbox', title: opts.emptyTitle || 'Nothing to show', body: opts.emptyBody || '' });
    return `<div class="table-wrap"><table class="data-table obs-table">
      <thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead>
      <tbody>${rows.join('')}</tbody>
    </table></div>`;
  }

  function kv(rows) {
    return `<dl class="obs-kv">${rows.filter((row) => row).map(([key, value]) => `<div><dt>${esc(key)}</dt><dd>${value}</dd></div>`).join('')}</dl>`;
  }

  function errorBanner(key) {
    return S.error[key] ? U.errorBanner('Could not load this section', S.error[key]) : '';
  }

  function missingBanner(list, title = 'Partial coverage') {
    if (!list || !list.length) return '';
    return U.infoBanner(title, list.join(' · '), 'info');
  }

  function collectorNote(collector, key) {
    if (!collector) return '';
    const status = collector.summary;
    if (!status) return U.infoBanner('Waiting for the first sample', 'The collector has not completed a run yet. Values appear as soon as the scheduled tick finishes.', 'info');
    if (collector.enabled === false) return U.infoBanner('Collector disabled', 'Enable it in Observability → Settings if you want live data here.', 'info');
    if (status.available === false) return U.infoBanner('Source unavailable', status.reason || 'The source could not be read in this environment.', 'warn');
    if (status.errors && status.errors.length) return U.infoBanner('Partial result', status.errors.slice(0, 4).join(' · '), 'warn');
    void key;
    return '';
  }

  async function boot(force = false) {
    if (S.booted && !force) return;
    try {
      const boot = await api.observability.bootstrap();
      if (!boot || boot.ok === false) throw new Error(boot?.error || 'The observability service did not respond.');
      S.boot = boot;
      S.bootError = '';
      S.booted = true;
      S.settings = boot.config;
      syncMini();
    } catch (error) {
      S.bootError = error.message || String(error);
      S.booted = false;
    }
  }

  function syncMini() {
    if (!OD.store) return;
    const overview = S.overview;
    OD.store.state.observability = {
      enabled: (S.settings?.enabled ?? overview?.enabled) !== false,
      score: overview?.score?.value ?? null,
      hosts: overview?.inventory?.hosts || null,
      alerts: overview?.inventory?.alerts || null,
      incidents: overview?.inventory?.incidents || null,
      collectors: overview?.collectors || S.boot?.collectors || [],
      agents: S.agents?.status || null,
      at: overview?.at || null,
    };
    OD.store.emit?.();
  }

  async function loadMetricCatalog() {
    if (S.metrics.catalog.length) return S.metrics.catalog;
    try {
      const result = await api.observability.metricsCatalog({});
      S.metrics.catalog = result.catalog || [];
    } catch { /* the form still allows editing an existing metric name */ }
    return S.metrics.catalog;
  }

  async function loadPage(page) {
    S.error[page] = '';
    S.loading[page] = true;
    try {
      if (page === 'overview') {
        S.overview = await api.observability.overview({ range: S.range });
        S.collectors = Object.fromEntries((S.overview?.collectors || []).map((collector) => [collector.key, collector]));
        syncMini();
      } else if (page === 'infrastructure') {
        const [local, remote, servers] = await Promise.all([
          api.observability.collector('local'),
          api.observability.collector('remote'),
          api.observability.servers(),
        ]);
        S.collectors.local = local;
        S.collectors.remote = remote;
        S.servers = servers.servers || [];
      } else if (['docker', 'kubernetes', 'databases', 'applications'].includes(page)) {
        const key = page === 'applications' ? 'applications' : page === 'databases' ? 'databases' : page;
        S.collectors[key] = await api.observability.collector(key);
        if (page === 'applications' && !S.traces.stats) S.traces = { ...S.traces, ...(await api.observability.tracesBootstrap()) };
      } else if (page === 'synthetic') {
        const result = await api.observability.targets();
        S.targets = result.targets || [];
        S.collectors.synthetic = await api.observability.collector('synthetic');
      } else if (page === 'network') {
        const [config, detail] = await Promise.all([
          api.observability.network(),
          api.observability.collector('network'),
        ]);
        S.network = { checks: config.checks || [], devices: config.devices || [] };
        S.collectors.network = detail;
      } else if (page === 'logs') {
        if (!S.logs.stats) S.logs.stats = (await api.observability.logsBootstrap()).stats;
        const result = await api.observability.logsQuery({
          limit: 300, search: S.logs.query, levels: S.logs.level ? [S.logs.level] : [],
          sources: S.logs.source ? [S.logs.source] : [],
        });
        S.logs.rows = result.rows || [];
        S.logs.total = result.total || 0;
      } else if (page === 'traces') {
        const [boot, result] = await Promise.all([
          S.traces.stats ? Promise.resolve(null) : api.observability.tracesBootstrap(),
          api.observability.tracesQuery({ limit: 100, service: S.traces.service, errors: S.traces.errors }),
        ]);
        if (boot) S.traces = { ...S.traces, ...boot };
        S.traces.rows = result.rows || [];
        S.traces.total = result.total || 0;
      } else if (page === 'alerts') {
        const [rules, alerts, silences] = await Promise.all([
          api.observability.alertRules(),
          api.observability.alerts({ limit: 300 }),
          api.observability.silences(),
        ]);
        S.alerts.rules = rules.rules || [];
        S.alerts.items = alerts.items || [];
        S.alerts.silences = silences.silences || [];
        S.alerts.maintenance = silences.maintenance || [];
      } else if (page === 'incidents') {
        const result = await api.observability.incidents({ limit: 200 });
        S.incidents.items = result.items || [];
        S.incidents.total = result.total || 0;
      } else if (page === 'dashboards') {
        if (!S.dashboards) S.dashboards = await api.observability.dashboards();
        const active = S.dashboard?.dashboard?.id || S.dashboards.dashboards?.[0]?.id;
        if (active) {
          const data = await api.observability.dashboardData({ id: active, range: S.range });
          S.dashboard = data.ok ? data : null;
          if (!data.ok) S.error.dashboards = data.error || '';
        }
      } else if (page === 'metrics') {
        if (!S.metrics.catalog.length) {
          const catalog = await api.observability.metricsCatalog({});
          S.metrics.catalog = catalog.catalog || [];
          if (!S.metrics.name) S.metrics.name = S.metrics.catalog.find((entry) => entry.name === 'system.cpu.usage')?.name || S.metrics.catalog[0]?.name || '';
        }
        if (S.metrics.name) {
          S.metrics.result = await api.observability.metricsQuery({ name: S.metrics.name, range: S.range, limit: 300 });
        }
      } else if (page === 'reports') {
        if (!S.reports.types.length) S.reports.types = (await api.observability.reportTypes()).types || [];
      } else if (page === 'integrations') {
        const previous = S.integrations || {};
        S.integrations = { ...(await api.observability.integrations()), query: previous.query || null, discovery: previous.discovery || null };
      } else if (page === 'notifications') {
        S.channels = (await api.observability.channels()).channels || [];
      } else if (page === 'agents') {
        S.agents = await api.observability.agents();
      } else if (page === 'remediation') {
        S.remediation = await api.observability.remediation();
      } else if (page === 'settings') {
        const boot = await api.observability.bootstrap();
        S.settings = boot.config;
        S.boot = boot;
      }
    } catch (error) {
      S.error[page] = error.message || String(error);
    } finally {
      S.loading[page] = false;
      syncMini();
    }
  }

  function pageHead(page, actions = '') {
    const range = RANGE_PAGES.has(page) ? `<label class="obs-range"><span>Range</span><select class="input input-sm" data-obs-range>${['15m', '1h', '6h', '24h', '7d', '30d'].map((value) => `<option value="${value}" ${value === S.range ? 'selected' : ''}>${value === '15m' ? 'Last 15 minutes' : value === '1h' ? 'Last hour' : value === '6h' ? 'Last 6 hours' : value === '24h' ? 'Last 24 hours' : value === '7d' ? 'Last 7 days' : 'Last 30 days'}</option>`).join('')}</select></label>` : '';
    return `<div class="page-head obs-page-head">
      <div class="page-head-left"><h1 class="page-title">${esc(PAGES[page] || 'Observability')}</h1><p class="page-sub">${esc(subtitleFor(page))}</p></div>
      <div class="obs-head-actions">${range}${actions}${BTN('Refresh', 'refresh', 'data-obs-refresh', 'secondary')}</div>
    </div>`;
  }

  function subtitleFor(page) {
    return {
      overview: 'Live health, coverage and the signals that matter right now.',
      infrastructure: 'This machine and every remote server you have connected.',
      docker: 'Container, volume and network measurements read from the Docker engine.',
      kubernetes: 'Nodes, workloads and warning events from the selected cluster.',
      databases: 'Query and connection metrics read through the existing database sessions.',
      synthetic: 'Active HTTP, TCP, DNS and TLS checks with real response data.',
      network: 'Latency, loss and interface counters for the local network.',
      applications: 'APM derived from real OpenTelemetry spans received by the ingest agent.',
      logs: 'Stored log lines from the local host, containers, pods and remote servers.',
      traces: 'Distributed traces received over OTLP/HTTP JSON.',
      alerts: 'Rules, firing alerts, silences and delivery channels.',
      incidents: 'Grouped operational incidents with a reviewable timeline.',
      dashboards: 'Prebuilt and custom dashboards backed by the local time-series store.',
      metrics: 'Explore every stored metric, label and retained sample.',
      reports: 'Generate JSON, CSV or PDF reports from retained monitoring data.',
      integrations: 'Connect real monitoring sources and query them without leaving OpsDeck.',
      notifications: 'Webhook, Slack, Discord, Telegram and email delivery channels.',
      agents: 'Bearer-token agents and the localhost OTLP/HTTP JSON receiver.',
      remediation: 'Approval-gated actions with allowlists, cooldowns and an audit trail.',
      settings: 'Collection cadence, retention, collectors and workspace preferences.',
    }[page] || '';
  }

  function renderShell(page, body) {
    return `<div class="page obs-page" data-obs-page="${esc(page)}">
      ${S.bootError ? U.errorBanner('Observability is not available', S.bootError) : ''}
      ${pageHead(page, `${page === 'overview' ? BTN('Open dashboards', 'bar-chart', 'data-obs-href="#/observability/dashboards"', 'primary') : ''}${BTN('Ask AI', 'sparkles', 'data-obs-ai', 'secondary')}`)}
      ${errorBanner(page)}
      ${body}
    </div>`;
  }

  // ------------------------------------------------------------------ forms

  function fieldHtml(field) {
    const value = field.value ?? '';
    const id = `obs-field-${field.name}`;
    const attrs = `id="${id}" data-field="${esc(field.name)}" ${field.disabled ? 'disabled' : ''}`;
    if (field.type === 'select') {
      return `<label class="field"><span>${esc(field.label)}${field.required ? ' *' : ''}</span>
        <select class="input" ${attrs}>${(field.options || []).map((option) => {
          const optionValue = typeof option === 'string' ? option : option.value;
          const optionLabel = typeof option === 'string' ? titleCase(option) : option.label;
          return `<option value="${esc(optionValue)}" ${String(optionValue) === String(value) ? 'selected' : ''}>${esc(optionLabel)}</option>`;
        }).join('')}</select>${field.hint ? `<small>${esc(field.hint)}</small>` : ''}</label>`;
    }
    if (field.type === 'textarea') {
      return `<label class="field obs-field-wide"><span>${esc(field.label)}${field.required ? ' *' : ''}</span>
        <textarea class="input" rows="${field.rows || 4}" placeholder="${esc(field.placeholder || '')}" ${attrs}>${esc(value)}</textarea>${field.hint ? `<small>${esc(field.hint)}</small>` : ''}</label>`;
    }
    if (field.type === 'checkbox') {
      return `<label class="obs-check obs-field-wide"><input type="checkbox" ${attrs} ${value === true || value === 'true' ? 'checked' : ''}><span>${esc(field.label)}</span>${field.hint ? `<small>${esc(field.hint)}</small>` : ''}</label>`;
    }
    return `<label class="field ${field.wide ? 'obs-field-wide' : ''}"><span>${esc(field.label)}${field.required ? ' *' : ''}</span>
      <input class="input" type="${field.type || 'text'}" placeholder="${esc(field.placeholder || '')}" value="${esc(value)}" ${field.min != null ? `min="${field.min}"` : ''} ${field.max != null ? `max="${field.max}"` : ''} ${field.step ? `step="${field.step}"` : ''} ${field.required ? 'required' : ''} ${attrs}>${field.hint ? `<small>${esc(field.hint)}</small>` : ''}</label>`;
  }

  function openForm({ title, subtitle, icon: iconName = 'edit', fields, values = {}, submitLabel = 'Save', onSubmit, width = '640px' }) {
    const prepared = fields.map((field) => ({ ...field, value: values[field.name] ?? field.value ?? (field.type === 'checkbox' ? false : '') }));
    U.modal({
      title,
      subtitle,
      icon: iconName,
      width,
      body: `<div class="obs-form">${prepared.map(fieldHtml).join('')}</div>`,
      footer: `<div class="row gap-2 right" style="width:100%">${BTN('Cancel', 'x', 'data-close', 'ghost')}${BTN(submitLabel, 'check', 'data-obs-save', 'primary')}</div>`,
      onMount: ({ root, close }) => {
        const save = root.querySelector('[data-obs-save]');
        save?.addEventListener('click', async () => {
          const data = {};
          for (const field of prepared) {
            const el = root.querySelector(`[data-field="${field.name}"]`);
            if (!el) continue;
            data[field.name] = field.type === 'checkbox' ? el.checked : el.value;
          }
          save.disabled = true;
          try {
            await onSubmit(data);
            close('save');
            // Force the page to re-read from the main process so the saved row,
            // widget or rule is visible immediately.
            S.fresh = null;
            OD.app?.rerender?.();
          } catch (error) {
            save.disabled = false;
            U.toast(error.message || 'Could not save', 'error');
          }
        });
      },
    });
  }

  async function refresh(showToast = false) {
    await loadPage(S.page);
    S.fresh = { page: S.page, at: Date.now() };
    OD.app?.rerender?.();
    if (showToast) U.toast('Refreshed', 'success');
  }

  function resultToast(result, success = 'Saved') {
    if (result?.ok === false) U.toast(result.error || 'The action failed', 'error');
    else U.toast(success, 'success');
    return result;
  }

  // ------------------------------------------------------------------ overview

  function overviewBody() {
    const ov = S.overview;
    if (!ov) return U.loader('Reading live system state…');
    const inv = ov.inventory || {};
    const hosts = inv.hosts || { total: 0, online: 0, offline: 0 };
    const system = ov.system || {};
    const score = ov.score || {};
    const scoreTone = score.value == null ? 'var(--faint)' : score.value >= 90 ? 'var(--green)' : score.value >= 70 ? 'var(--orange)' : 'var(--red)';
    const collectors = ov.collectors || [];
    const activeAlerts = ov.recentAlerts || [];
    const incidents = ov.recentIncidents || [];

    const scoreCard = `<section class="card obs-score-card">
      <div class="card-body obs-score-body">
        ${C.donut(score.value ?? 0, { size: 116, stroke: 10, color: scoreTone, center: score.value == null ? '—' : score.value.toFixed(0), sub: score.label || 'Unknown' })}
        <div class="obs-score-copy">
          <div class="eyebrow">${icon('activity', 12)}Health score</div>
          <h2>${esc(score.label || 'Unknown')}</h2>
          <p>${esc(score.formula || 'No component has enough data to score health yet.')}</p>
          ${score.missing?.length ? `<p class="obs-muted">Missing: ${esc(score.missing.join(', '))}</p>` : ''}
        </div>
      </div>
    </section>`;

    const stats = `<div class="obs-stat-grid">
      ${U.statCard({ label: 'CPU', icon: 'cpu', tone: 'cyan', value: fmtUnit(system.cpu, 'percent'), sub: `${system.platform?.cpu?.logicalProcessors ?? '—'} cores · load ${fmtUnit(system.load1, 'count')}`, spark: system.cpu != null ? C.spark((ov.trends?.cpu || []).map((point) => point[1]), { color: 'var(--cyan)' }) : '' })}
      ${U.statCard({ label: 'Memory', icon: 'memory-stick', tone: 'violet', value: fmtUnit(system.memory, 'percent'), sub: `${fmtBytes(system.platform?.memory?.total || 0)} total` })}
      ${U.statCard({ label: 'Disk pressure', icon: 'hard-drive', tone: toneFor(system.disk), value: fmtUnit(system.disk, 'percent'), sub: `${(system.disks || []).length} mounted filesystem${(system.disks || []).length === 1 ? '' : 's'}` })}
      ${U.statCard({ label: 'Hosts', icon: 'server', tone: 'green', value: `${hosts.online}/${hosts.total}`, sub: hosts.offline ? `${hosts.offline} unreachable` : 'All reachable' })}
      ${U.statCard({ label: 'Services', icon: 'target', tone: (inv.services?.failed || 0) ? 'red' : 'green', value: `${inv.services?.healthy || 0}/${inv.services?.total || 0}`, sub: `${inv.services?.degraded || 0} degraded · ${inv.services?.failed || 0} failed` })}
      ${U.statCard({ label: 'Active alerts', icon: 'bell', tone: inv.alerts?.critical ? 'red' : (inv.alerts?.active ? 'orange' : 'green'), value: fmtNumber(inv.alerts?.active || 0), sub: `${inv.alerts?.critical || 0} critical` })}
    </div>`;

    const inventory = `<div class="obs-mini-grid">
      ${miniStat('Docker', `${inv.docker?.running || 0}/${inv.docker?.total || 0}`, 'containers running', 'box', inv.docker?.unhealthy ? 'orange' : 'green')}
      ${miniStat('Kubernetes', inv.kubernetes?.nodes?.total ? `${inv.kubernetes.nodes.ready}/${inv.kubernetes.nodes.total}` : '—', 'nodes ready', 'cloud', inv.kubernetes?.unhealthy ? 'orange' : 'violet')}
      ${miniStat('Databases', `${inv.databases?.up || 0}/${inv.databases?.total || 0}`, 'connections measured', 'database', inv.databases?.down ? 'red' : 'orange')}
      ${miniStat('Applications', fmtNumber(inv.applications?.active || 0), 'services reporting', 'activity', 'cyan')}
      ${miniStat('Incidents', fmtNumber(inv.incidents?.open || 0), 'open incidents', 'alert-triangle', inv.incidents?.critical ? 'red' : 'slate')}
      ${miniStat('Agents', ov.agents?.running ? String(ov.agents.agents?.length || 0) : 'Off', ov.agents?.running ? 'agents connected' : 'ingest receiver off', 'bot', ov.agents?.running ? 'green' : 'slate')}
    </div>`;

    const trends = `<div class="obs-two-col">
      ${U.card({ title: 'CPU trend', sub: 'Average across all cores', icon: 'cpu', body: chart({ series: [{ points: ov.trends?.cpu || [] }] }, { unit: 'percent', color: 'var(--cyan)', min: 0, max: 100, empty: 'CPU samples will appear after the first two collection ticks.' }) })}
      ${U.card({ title: 'Memory trend', sub: 'System memory utilisation', icon: 'memory-stick', body: chart({ series: [{ points: ov.trends?.memory || [] }] }, { unit: 'percent', color: 'var(--violet)', min: 0, max: 100, empty: 'Memory samples will appear after the first two collection ticks.' }) })}
    </div>`;

    const consumers = U.card({
      title: 'Top consumers', icon: 'bar-chart', sub: 'Live CPU by container, process and pod',
      body: table(['Kind', 'Name', 'Usage', 'Detail'], (ov.topConsumers || []).map((row) => `<tr><td>${chip(row.kind, 'slate')}</td><td class="mono">${esc(row.name)}</td><td><strong>${fmtUnit(row.value, row.unit)}</strong></td><td class="obs-muted">${esc(row.detail || '')}</td></tr>`), { emptyTitle: 'No consumers measured', emptyBody: 'CPU samples from Docker, processes and Kubernetes will appear here.' }),
    });

    const problems = U.card({
      title: 'Needs attention', icon: 'alert-triangle', sub: 'Failed checks, unhealthy containers and unreachable services',
      body: (ov.problematic || []).length
        ? `<div class="obs-list">${ov.problematic.map((row) => `<div class="obs-list-row"><span class="obs-list-icon tone-red">${icon('alert-triangle', 14)}</span><div><strong>${esc(row.name)}</strong><span>${chip(row.kind, 'slate')} ${esc(row.detail || '')}</span></div></div>`).join('')}</div>`
        : U.empty({ compact: true, icon: 'circle-check', title: 'No active problems', body: 'Every measured target is currently healthy.' }),
    });

    const collectorRows = collectors.map((collector) => `<tr>
      <td><strong>${esc(collector.label)}</strong><div class="obs-muted">${esc(collector.key)}</div></td>
      <td>${collector.enabled ? statusBadge(collector.ok, 'Running', collector.available === false ? 'Unavailable' : 'Error') : U.badge('Disabled', 'slate')}</td>
      <td>${collector.metrics ? fmtNumber(collector.metrics) : '—'}</td>
      <td>${collector.durationMs != null ? `${fmtNumber(collector.durationMs)} ms` : '—'}</td>
      <td>${collector.lastAt ? timeAgo(collector.lastAt) : 'waiting'}</td>
      <td class="obs-muted">${esc(truncate(collector.reason || collector.errors?.[0] || '', 80))}</td>
    </tr>`);

    const collectorsCard = U.card({ title: 'Collectors', icon: 'activity', sub: 'Every collector runs independently and failures stay isolated', body: table(['Collector', 'State', 'Metrics', 'Duration', 'Last run', 'Detail'], collectorRows, { emptyTitle: 'No collectors registered' }) });

    const feed = `<div class="obs-two-col">
      ${U.card({ title: 'Active alerts', icon: 'bell', sub: 'Firing or pending', actions: LINK('All alerts', 'bell', '#/observability/alerts'), body: activeAlerts.length ? `<div class="obs-list">${activeAlerts.map((alert) => `<div class="obs-list-row"><span class="obs-list-icon tone-${alert.severity === 'critical' ? 'red' : 'orange'}">${icon('bell', 14)}</span><div><strong>${esc(alert.name)}</strong><span>${severityBadge(alert.severity)} ${esc(alert.resource || '')} · ${timeAgo(alert.startedAt)}</span></div></div>`).join('')}</div>` : U.empty({ compact: true, icon: 'shield-check', title: 'No active alerts', body: 'Rules are evaluated against the local time-series store.' }) })}
      ${U.card({ title: 'Open incidents', icon: 'alert-triangle', sub: 'Grouped from related alerts', actions: LINK('All incidents', 'list', '#/observability/incidents'), body: incidents.length ? `<div class="obs-list">${incidents.map((incident) => `<div class="obs-list-row"><span class="obs-list-icon tone-${incident.severity === 'critical' ? 'red' : 'orange'}">${icon('alert-triangle', 14)}</span><div><strong>${esc(incident.title)}</strong><span>${severityBadge(incident.severity)} ${esc(incident.status)} · ${timeAgo(incident.createdAt)}</span></div></div>`).join('')}</div>` : U.empty({ compact: true, icon: 'circle-check', title: 'No open incidents', body: 'Incidents are created automatically when a rule fires.' }) })}
    </div>`;

    return `${S.bootError ? '' : ''}
      ${missingBanner(ov.missing)}
      <div class="obs-overview-top">${scoreCard}${stats}</div>
      ${inventory}
      ${trends}
      <div class="obs-two-col">${consumers}${problems}</div>
      ${collectorsCard}
      ${feed}`;
  }

  function miniStat(label, value, sub, iconName, tone) {
    return `<div class="obs-mini-stat"><span class="icon-chip tone-${tone}" style="--chip-size:30px">${icon(iconName, 15)}</span><div><span>${esc(label)}</span><strong>${esc(value)}</strong><small>${esc(sub)}</small></div></div>`;
  }

  // ------------------------------------------------------------ infrastructure

  function infrastructureBody() {
    const local = S.collectors.local;
    const remote = S.collectors.remote;
    const details = local?.details;
    const info = details?.info || {};
    const cpu = details?.cpu || {};
    const memory = details?.memory || {};
    const disks = details?.disks || [];
    const interfaces = details?.network?.interfaces || [];
    const processes = (details?.processes || []).slice(0, 20);

    const localCard = U.card({
      title: 'This machine', icon: 'server', sub: info.hostname ? `${info.hostname} · ${info.os || info.platform || ''}` : 'Local collector',
      actions: BTN('Add server', 'plus', 'data-obs-server-add', 'primary'),
      body: `${collectorNote(local, 'local')}
        ${kv([
          ['Hostname', esc(info.hostname || '—')],
          ['Operating system', esc(info.os || info.distro || info.platform || '—')],
          ['Kernel', esc(info.kernel || info.release || '—')],
          ['Architecture', esc(info.arch || '—')],
          ['CPU', esc(cpu.model || '—')],
          ['Cores', esc(cpu.logicalProcessors ?? cpu.perCore?.length ?? '—')],
          ['Uptime', details?.uptimeSeconds != null ? fmtUnit(details.uptimeSeconds, 'seconds') : fmtUnit(info.uptimeSeconds, 'seconds')],
          ['Measured', local?.at ? timeAgo(local.at) : 'waiting'],
        ])}
        <div class="obs-metric-row">
          ${obsMetric('CPU', cpu.usage ?? cpu.overall, 'percent')}
          ${obsMetric('Memory', memory.usage, 'percent')}
          ${obsMetric('Load 1m', cpu.load?.one ?? info.load1, 'count')}
          ${obsMetric('Temperature', cpu.temperatureCelsius, 'celsius')}
        </div>`,
    });

    const disksCard = U.card({
      title: 'Filesystems', icon: 'hard-drive', sub: 'Usage and IO measured from the host',
      body: table(['Mount', 'Filesystem', 'Used', 'Total', 'Usage'], disks.map((disk) => {
        const usage = disk.percent ?? disk.usage;
        return `<tr><td class="mono">${esc(disk.mount || disk.device || '—')}</td><td>${esc(disk.filesystem || disk.fs || '—')}</td><td>${fmtBytes(disk.used)}</td><td>${fmtBytes(disk.total)}</td><td><div class="obs-meter"><span style="width:${Math.min(100, Math.max(0, Number(usage) || 0))}%"></span></div>${fmtUnit(usage, 'percent')}</td></tr>`;
      }), { emptyTitle: 'No filesystems measured', emptyBody: 'The local collector could not read disk usage in this environment.' }),
    });

    const networkCard = U.card({
      title: 'Interfaces', icon: 'network', sub: 'Counters and measured rates',
      body: table(['Interface', 'Address', 'RX/s', 'TX/s', 'State'], interfaces.map((entry) => `<tr><td class="mono">${esc(entry.name)}</td><td class="mono">${esc((entry.addresses || []).find((address) => !address.internal)?.address || '—')}</td><td>${fmtUnit(entry.rxBytesPerSecond, 'bytes_per_second')}</td><td>${fmtUnit(entry.txBytesPerSecond, 'bytes_per_second')}</td><td>${chip(entry.state || 'up', entry.state === 'loopback' ? 'slate' : 'green')}</td></tr>`), { emptyTitle: 'No interfaces measured' }),
    });

    const processesCard = U.card({
      title: 'Processes', icon: 'list-tree', sub: 'Highest CPU processes on this machine',
      body: table(['PID', 'Process', 'User', 'CPU', 'Memory'], processes.map((process) => `<tr><td class="mono">${esc(process.pid)}</td><td><strong>${esc(process.name)}</strong></td><td>${esc(process.user || '—')}</td><td>${fmtUnit(process.cpuPercent, 'percent')}</td><td>${fmtBytes(process.memoryBytes)}</td></tr>`), { emptyTitle: 'No process samples', emptyBody: 'Process details are unavailable on this platform.' }),
    });

    const serverRows = (S.servers || []).map((server) => `<tr>
      <td><strong>${esc(server.name)}</strong><div class="obs-muted">${esc(server.host || server.url || '')}</div></td>
      <td>${chip(server.method, 'slate')}</td>
      <td>${server.status ? statusBadge(server.status.ok, 'Online', 'Offline') : U.badge('Not sampled', 'slate')}</td>
      <td>${server.status?.ok ? fmtUnit(server.status.cpu?.usage, 'percent') : '—'}</td>
      <td>${server.status?.ok ? fmtUnit(server.status.memory?.usage, 'percent') : '—'}</td>
      <td>${server.status?.at ? timeAgo(server.status.at) : '—'}</td>
      <td class="obs-row-actions">
        ${BTN('Test', 'play', `data-obs-server-test="${esc(server.id)}"`, 'ghost', 'xs')}
        ${BTN('Edit', 'edit', `data-obs-server-edit="${esc(server.id)}"`, 'ghost', 'xs')}
        ${BTN('Delete', 'trash', `data-obs-server-delete="${esc(server.id)}"`, 'ghost', 'xs')}
      </td>
    </tr>`);

    const serversCard = U.card({
      title: 'Remote servers', icon: 'cloud', sub: 'SSH, Prometheus exporter or OpsDeck agent',
      actions: BTN('Add server', 'plus', 'data-obs-server-add', 'primary'),
      body: `${collectorNote(remote, 'remote')}${table(['Server', 'Method', 'State', 'CPU', 'Memory', 'Checked', ''], serverRows, { emptyTitle: 'No remote servers yet', emptyBody: 'Add a server to collect CPU, memory, disks and process data over SSH or an exporter.', action: BTN('Add your first server', 'plus', 'data-obs-server-add', 'primary') })}`,
    });

    return `${localCard}${S.error.infrastructure ? '' : ''}
      <div class="obs-two-col">${disksCard}${networkCard}</div>
      ${serversCard}
      ${processesCard}`;
  }

  function obsMetric(label, value, unit) {
    return `<div class="obs-metric"><span>${esc(label)}</span><strong>${fmtUnit(value, unit)}</strong><div class="obs-meter"><span style="width:${unit === 'percent' ? Math.min(100, Math.max(0, Number(value) || 0)) : 0}%"></span></div></div>`;
  }

  // ------------------------------------------------------------------ docker

  function dockerBody() {
    const collector = S.collectors.docker;
    const details = collector?.details;
    if (!details && !collector) return U.loader('Reading Docker metrics…');
    if (!details?.available) {
      return `${collectorNote(collector, 'docker')}${U.empty({ icon: 'box', title: 'Docker metrics are unavailable', body: details?.errors?.[0] || 'The Docker engine is not reachable from this machine. Start Docker and retry. This page never invents container metrics.' })}`;
    }
    const summary = details.summary || {};
    const containers = details.containers || [];
    const projects = details.projects || [];
    const disk = details.disk || [];
    const networks = details.networks || [];
    const volumes = details.volumes || [];

    const stats = `<div class="obs-stat-grid">
      ${U.statCard({ label: 'Containers', icon: 'box', tone: 'cyan', value: `${summary.running || 0}/${summary.total || 0}`, sub: `${summary.stopped || 0} stopped · ${summary.restarting || 0} restarting` })}
      ${U.statCard({ label: 'Unhealthy', icon: 'alert-triangle', tone: summary.unhealthy ? 'red' : 'green', value: fmtNumber(summary.unhealthy || 0), sub: `${summary.restarts || 0} total restarts` })}
      ${U.statCard({ label: 'Container CPU', icon: 'cpu', tone: 'violet', value: fmtUnit(summary.cpu, 'percent'), sub: 'Sum of running containers' })}
      ${U.statCard({ label: 'Container memory', icon: 'memory-stick', tone: 'orange', value: fmtBytes(summary.memory), sub: 'Working set' })}
    </div>`;

    const containerRows = containers.map((container) => `<tr>
      <td><strong>${esc(container.name)}</strong><div class="obs-muted mono">${esc(container.shortId)}</div></td>
      <td class="mono">${esc(truncate(container.image, 40))}</td>
      <td>${U.stateBadge?.(container.state) || chip(container.state, container.state === 'running' ? 'green' : 'slate')}${container.health === 'unhealthy' ? ` ${U.badge('unhealthy', 'red')}` : ''}</td>
      <td>${fmtUnit(container.cpuPercent, 'percent')}</td>
      <td>${fmtBytes(container.memoryBytes)}${container.memoryPercent != null ? `<div class="obs-muted">${fmtUnit(container.memoryPercent, 'percent')} of limit</div>` : ''}</td>
      <td>${container.netIn != null ? `${fmtBytes(container.netIn)} / ${fmtBytes(container.netOut)}` : '—'}</td>
      <td>${fmtNumber(container.restarts || 0)}</td>
    </tr>`);

    const containerCard = U.card({ title: 'Containers', icon: 'box', sub: 'CPU, memory, network and restart counts', body: table(['Container', 'Image', 'State', 'CPU', 'Memory', 'Net in / out', 'Restarts'], containerRows, { emptyTitle: 'No containers', emptyBody: 'The Docker engine reported no containers.' }) });

    const projectRows = projects.map((project) => `<tr><td><strong>${esc(project.name)}</strong><div class="obs-muted">${esc(project.status || '')}</div></td><td>${project.running}/${project.total}</td><td>${fmtUnit(project.cpu, 'percent')}</td><td>${fmtBytes(project.memory)}</td><td>${project.unhealthy ? U.badge(`${project.unhealthy} unhealthy`, 'red') : U.badge('healthy', 'green')}</td><td class="mono obs-muted">${esc(project.directory || '')}</td></tr>`);
    const projectsCard = U.card({ title: 'Compose projects', icon: 'boxes', sub: 'Grouped service measurements', body: table(['Project', 'Running', 'CPU', 'Memory', 'Health', 'Directory'], projectRows, { emptyTitle: 'No Compose projects', emptyBody: 'Compose projects are discovered through the existing Docker service.' }) });

    const diskRows = disk.map((entry) => `<tr><td>${chip(entry.type, 'slate')}</td><td>${fmtNumber(entry.count || 0)}</td><td>${entry.active ?? '—'}</td><td>${esc(entry.sizeLabel || fmtBytes(entry.size))}</td><td>${esc(entry.reclaimableLabel || fmtBytes(entry.reclaimable))}</td></tr>`);
    const diskCard = U.card({ title: 'Storage', icon: 'hard-drive', sub: 'Docker disk usage report', body: table(['Type', 'Items', 'Active', 'Size', 'Reclaimable'], diskRows, { emptyTitle: 'No storage data' }) });

    const networkRows = networks.map((network) => `<tr><td><strong>${esc(network.name)}</strong></td><td>${esc(network.driver || '—')}</td><td>${fmtNumber(network.containers || 0)}</td><td>${esc(network.scope || '—')}</td></tr>`);
    const volumeRows = volumes.map((volume) => `<tr><td><strong>${esc(volume.name)}</strong></td><td>${esc(volume.driver || '—')}</td><td>${esc(volume.mountpoint || '—')}</td><td>${U.badge('usage unavailable', 'slate')}</td></tr>`);
    const storageNetworks = `<div class="obs-two-col">
      ${U.card({ title: 'Networks', icon: 'network', sub: 'Attached containers per network', body: table(['Network', 'Driver', 'Containers', 'Scope'], networkRows, { emptyTitle: 'No networks' }) })}
      ${U.card({ title: 'Volumes', icon: 'database', sub: 'Docker reports metadata, not byte usage', body: table(['Volume', 'Driver', 'Mountpoint', 'Size'], volumeRows, { emptyTitle: 'No volumes' }) })}
    </div>`;

    return `${collectorNote(collector, 'docker')}${stats}${containerCard}${projectsCard}<div class="obs-two-col">${diskCard}${U.card({ title: 'Engine', icon: 'settings', sub: 'Reported by Docker', body: kv([['Version', esc(details.version || '—')], ['OS', esc(details.os || '—')], ['Architecture', esc(details.arch || '—')], ['Measured', details.at ? timeAgo(details.at) : '—']]) })}</div>${storageNetworks}`;
  }

  // -------------------------------------------------------------- kubernetes

  function kubernetesBody() {
    const collector = S.collectors.kubernetes;
    const details = collector?.details;
    if (!details && !collector) return U.loader('Reading Kubernetes metrics…');
    if (details && details.available === false) {
      return `${collectorNote(collector, 'kubernetes')}${U.empty({ icon: 'cloud', title: 'No cluster is connected', body: details.reason || 'Select a kubeconfig context in the Kubernetes workspace. This page stays empty rather than synthesising cluster data.' })}`;
    }
    const nodes = details.nodes || [];
    const pods = details.pods || [];
    const workloads = details.workloads || [];
    const events = details.events || [];
    const nodeSummary = details.nodeSummary || { total: nodes.length, ready: nodes.filter((node) => node.ready).length };
    const podCounts = details.podCounts || { total: pods.length, running: pods.filter((pod) => pod.phase === 'Running').length };

    const stats = `<div class="obs-stat-grid">
      ${U.statCard({ label: 'Nodes ready', icon: 'server', tone: 'violet', value: `${nodeSummary.ready || 0}/${nodeSummary.total || 0}`, sub: `${details.topAvailable === false ? 'Usage metrics unavailable' : 'Metrics server available'}` })}
      ${U.statCard({ label: 'Pods', icon: 'box', tone: 'cyan', value: `${podCounts.running || 0}/${podCounts.total || 0}`, sub: `${podCounts.pending || 0} pending · ${podCounts.failed || 0} failed` })}
      ${U.statCard({ label: 'Crash loops', icon: 'alert-triangle', tone: podCounts.crashLoop ? 'red' : 'green', value: fmtNumber(podCounts.crashLoop || 0), sub: 'Restarting pods' })}
      ${U.statCard({ label: 'Warning events', icon: 'bell', tone: events.length ? 'orange' : 'green', value: fmtNumber(events.length), sub: 'Cluster-wide' })}
    </div>`;

    const nodeRows = nodes.map((node) => `<tr><td><strong>${esc(node.name)}</strong><div class="obs-muted">${esc(node.version || '')}</div></td><td>${statusBadge(node.ready, 'Ready', 'Not ready')}</td><td>${esc(node.internalIP || '—')}</td><td>${node.cpuCapacity != null ? `${fmtNumber(node.cpuCapacity)}m` : '—'}</td><td>${fmtBytes(node.memoryCapacity)}</td><td>${node.diskPressure || node.memoryPressure || node.pidPressure ? U.badge('pressure', 'red') : U.badge('normal', 'green')}</td></tr>`);
    const podRows = pods.map((pod) => `<tr><td><strong>${esc(pod.name)}</strong><div class="obs-muted">${esc(pod.namespace || '')}</div></td><td>${chip(pod.phase || 'Unknown', pod.phase === 'Running' ? 'green' : pod.phase === 'Failed' ? 'red' : 'orange')}</td><td>${esc(pod.node || '—')}</td><td>${fmtNumber(pod.restarts || 0)}</td><td>${pod.cpuMillicores != null ? `${fmtNumber(pod.cpuMillicores)}m` : '—'}</td><td>${pod.memoryBytes != null ? fmtBytes(pod.memoryBytes) : '—'}</td><td>${pod.crashLoop ? U.badge('CrashLoopBackOff', 'red') : pod.oomKilled ? U.badge('OOMKilled', 'red') : '—'}</td></tr>`);
    const workloadRows = workloads.map((workload) => `<tr><td><strong>${esc(workload.name)}</strong><div class="obs-muted">${esc(workload.namespace || '')}</div></td><td>${chip(workload.kind || 'Workload', 'slate')}</td><td>${workload.ready ?? '—'}/${workload.desired ?? '—'}</td><td>${statusBadge(workload.status === 'Healthy', 'Ready', workload.status || 'Degraded')}</td></tr>`);
    const eventRows = events.slice(0, 50).map((event) => `<tr><td>${esc(event.object || event.reason || 'Event')}<div class="obs-muted">${esc(event.reason || '')}</div></td><td>${esc(event.namespace || '')}</td><td class="obs-muted">${esc(truncate(event.message || '', 120))}</td><td>${event.last ? timeAgo(event.last) : '—'}</td></tr>`);

    return `${collectorNote(collector, 'kubernetes')}${details?.topAvailable === false ? U.infoBanner('Usage metrics unavailable', 'kubectl top needs a running metrics-server. OpsDeck leaves CPU and memory blank instead of estimating them.', 'info') : ''}
      ${stats}
      ${U.card({ title: 'Nodes', icon: 'server', sub: 'Capacity and pressure conditions', body: table(['Node', 'Ready', 'Internal IP', 'CPU', 'Memory', 'Pressure'], nodeRows, { emptyTitle: 'No nodes reported' }) })}
      ${U.card({ title: 'Pods', icon: 'box', sub: 'Phase, restarts and measured usage', actions: LINK('Open Kubernetes', 'cloud', '#/kubernetes/pods'), body: table(['Pod', 'Phase', 'Node', 'Restarts', 'CPU', 'Memory', 'Issue'], podRows, { emptyTitle: 'No pods reported' }) })}
      <div class="obs-two-col">
        ${U.card({ title: 'Workloads', icon: 'layers', sub: 'Deployments, StatefulSets and DaemonSets', body: table(['Workload', 'Kind', 'Ready', 'Health'], workloadRows, { emptyTitle: 'No workloads reported' }) })}
        ${U.card({ title: 'Warning events', icon: 'alert-triangle', sub: 'Latest cluster warnings', body: table(['Event', 'Namespace', 'Message', 'When'], eventRows, { emptyTitle: 'No warning events' }) })}
      </div>`;
  }

  // ---------------------------------------------------------------- databases

  function databasesBody() {
    const collector = S.collectors.databases;
    const details = collector?.details;
    if (!details && !collector) return U.loader('Reading database metrics…');
    const connections = details?.connections || [];
    if (!connections.length) {
      return `${collectorNote(collector, 'databases')}${U.empty({ icon: 'database', title: 'No monitored database connections', body: 'Create or connect a database in the Databases workspace. Monitoring only reads engine metrics for connected profiles or profiles with auto-connect enabled.', action: LINK('Open Databases', 'database', '#/databases/dashboard', 'primary') })}`;
    }
    const rows = connections.map((connection) => {
      const m = connection.metrics || {};
      return `<tr>
        <td><strong>${esc(connection.name)}</strong><div class="obs-muted">${esc(connection.database || '')}</div></td>
        <td>${chip(connection.engineLabel || connection.engine, 'slate')}</td>
        <td>${statusBadge(connection.availability === 'measured', 'Measured', connection.availability === 'idle' ? 'Idle' : 'Unreachable')}</td>
        <td>${fmtUnit(m.activeConnections, 'count')}${m.maxConnections ? `<div class="obs-muted">of ${fmtNumber(m.maxConnections)}</div>` : ''}</td>
        <td>${fmtUnit(m.cacheHitRatio, 'percent')}</td>
        <td>${fmtUnit(m.opsPerSecond ?? m.queriesPerSecond, 'count')}</td>
        <td>${fmtBytes(m.sizeBytes ?? m.databaseSizeBytes ?? m.storeBytes)}</td>
        <td class="obs-muted">${esc(truncate(connection.error || '', 80)) || '—'}</td>
      </tr>`;
    });
    const available = connections.filter((connection) => connection.availability === 'measured').length;
    return `${collectorNote(collector, 'databases')}
      <div class="obs-stat-grid">
        ${U.statCard({ label: 'Monitored', icon: 'database', tone: 'orange', value: `${available}/${connections.length}`, sub: 'Profiles with measured metrics' })}
        ${U.statCard({ label: 'Unreachable', icon: 'alert-triangle', tone: connections.some((connection) => connection.availability === 'unreachable') ? 'red' : 'green', value: fmtNumber(connections.filter((connection) => connection.availability === 'unreachable').length), sub: 'Connection attempts failed' })}
      </div>
      ${U.card({ title: 'Connection metrics', icon: 'activity', sub: 'Read through the existing database service', actions: LINK('Open Databases', 'database', '#/databases/dashboard'), body: table(['Database', 'Engine', 'State', 'Connections', 'Cache hit', 'Ops/s', 'Size', 'Detail'], rows) })}
      ${details?.autoConnect ? U.infoBanner('Auto-connect enabled', 'The collector opens sessions for saved profiles that are not already connected.', 'info') : ''}`;
  }

  // ------------------------------------------------------------- applications

  function applicationsBody() {
    const collector = S.collectors.applications;
    const details = collector?.details;
    if (!details && !collector) return U.loader('Reading application telemetry…');
    const services = details?.services || [];
    if (!services.length) {
      const guide = details?.instrumentation || null;
      return `${collectorNote(collector, 'applications')}${U.empty({ icon: 'activity', title: 'No application spans received', body: details?.reason || 'Enable the OTLP ingest receiver and export traces from an instrumented application. Nothing is simulated here.' })}
        ${guide ? U.card({ title: 'Instrument an application', icon: 'code', sub: 'OTLP/HTTP JSON', body: kv([['Endpoint', `<code>${esc(guide.otlpHttp || '')}</code>`], ['Traces exporter', `<code>${esc(guide.traces || '')}</code>`], ['Protocol', `<code>${esc(guide.protocol || '')}</code>`]]) }) : ''}`;
    }
    const rows = services.map((service) => `<tr>
      <td><strong>${esc(service.name)}</strong><div class="obs-muted">${esc((service.dependencies || []).slice(0, 3).map((dependency) => dependency.dependency).join(', '))}</div></td>
      <td>${statusBadge(service.health === 'healthy', 'Healthy', 'Degraded')}</td>
      <td>${fmtUnit(service.requestsPerMinute, 'count')}</td>
      <td>${fmtUnit(service.errorRate, 'percent', 2)}</td>
      <td>${fmtUnit(service.p50Ms, 'milliseconds')}</td>
      <td>${fmtUnit(service.p95Ms, 'milliseconds')}</td>
      <td>${fmtUnit(service.p99Ms, 'milliseconds')}</td>
      <td>${service.lastSeen ? timeAgo(service.lastSeen) : '—'}</td>
    </tr>`);
    return `${collectorNote(collector, 'applications')}
      <div class="obs-stat-grid">
        ${U.statCard({ label: 'Services', icon: 'activity', tone: 'cyan', value: fmtNumber(services.length), sub: 'Reporting spans in the last hour' })}
        ${U.statCard({ label: 'Spans', icon: 'git-branch', tone: 'violet', value: fmtNumber(details.totalSpans || 0), sub: 'In the analysis window' })}
        ${U.statCard({ label: 'Degraded', icon: 'alert-triangle', tone: services.some((service) => service.health !== 'healthy') ? 'red' : 'green', value: fmtNumber(services.filter((service) => service.health !== 'healthy').length), sub: 'Error rate above 5%' })}
      </div>
      ${U.card({ title: 'Services', icon: 'activity', sub: 'Latency and error rate derived from real spans', body: table(['Service', 'Health', 'Req/min', 'Errors', 'p50', 'p95', 'p99', 'Last seen'], rows) })}
      ${S.traces.services?.length ? U.card({ title: 'Instrumented operations', icon: 'list', sub: 'Operations reported by service', body: `<div class="obs-tag-list">${services.flatMap((service) => (service.operations || []).slice(0, 6).map((operation) => `<span class="obs-tag">${esc(service.name)} · ${esc(operation.operation)} · ${fmtUnit(operation.p95Ms, 'milliseconds')}</span>`)).join('')}</div>` }) : ''}`;
  }

  // ----------------------------------------------------------------- synthetic

  function syntheticBody() {
    const collector = S.collectors.synthetic;
    const details = collector?.details;
    const rowsData = details?.targets?.length ? details.targets : (S.targets || []).map((target) => ({ ...target, ...(target.last || {}) }));
    const summary = details?.summary || { total: rowsData.length, up: rowsData.filter((row) => row.ok === true).length, down: rowsData.filter((row) => row.ok === false).length };
    const rows = rowsData.map((target) => `<tr>
      <td><strong>${esc(target.name)}</strong><div class="obs-muted">${esc(target.url || `${target.host || ''}:${target.port || ''}`)}</div></td>
      <td>${chip(target.kind || 'http', 'slate')}</td>
      <td>${target.skipped ? U.badge('skipped', 'slate') : statusBadge(target.ok, 'Up', 'Down')}</td>
      <td>${fmtUnit(target.durationMs, 'milliseconds')}</td>
      <td>${target.status != null ? esc(target.status) : '—'}</td>
      <td>${target.certificateDays != null ? `${fmtNumber(target.certificateDays)} d` : '—'}</td>
      <td class="obs-muted">${esc(truncate(target.error || '', 90)) || '—'}</td>
      <td class="obs-row-actions">
        ${BTN('Test', 'play', `data-obs-target-test="${esc(target.id)}"`, 'ghost', 'xs')}
        ${BTN('Edit', 'edit', `data-obs-target-edit="${esc(target.id)}"`, 'ghost', 'xs')}
        ${BTN('Delete', 'trash', `data-obs-target-delete="${esc(target.id)}"`, 'ghost', 'xs')}
      </td>
    </tr>`);
    return `${collectorNote(collector, 'synthetic')}
      <div class="obs-stat-grid">
        ${U.statCard({ label: 'Targets', icon: 'target', tone: 'cyan', value: fmtNumber(summary.total || 0), sub: `${summary.disabled || 0} disabled` })}
        ${U.statCard({ label: 'Up', icon: 'circle-check', tone: 'green', value: fmtNumber(summary.up || 0), sub: 'Passing checks' })}
        ${U.statCard({ label: 'Down', icon: 'circle-x', tone: summary.down ? 'red' : 'green', value: fmtNumber(summary.down || 0), sub: 'Failing checks' })}
      </div>
      ${U.card({ title: 'Checks', icon: 'target', sub: 'Real HTTP, TCP, DNS and TLS probes', actions: BTN('Add target', 'plus', 'data-obs-target-add', 'primary'), body: table(['Target', 'Kind', 'State', 'Latency', 'Status', 'Certificate', 'Detail', ''], rows, { emptyTitle: 'No synthetic targets', emptyBody: 'Add an HTTP endpoint, TCP port, DNS name or TLS certificate to monitor.', action: BTN('Add target', 'plus', 'data-obs-target-add', 'primary') }) })}`;
  }

  // ------------------------------------------------------------------- network

  function networkBody() {
    const collector = S.collectors.network;
    const details = collector?.details;
    const checks = details?.checks?.length ? details.checks : (S.network?.checks || []);
    const devices = details?.devices?.length ? details.devices : (S.network?.devices || []);
    const checkRows = checks.map((check) => `<tr><td><strong>${esc(check.name)}</strong><div class="obs-muted">${esc(check.host || '')}</div></td><td>${chip(check.kind || 'ping', 'slate')}</td><td>${statusBadge(check.ok, 'Reachable', 'Failed')}</td><td>${fmtUnit(check.latencyMs ?? check.avg ?? check.durationMs, 'milliseconds')}</td><td>${fmtUnit(check.packetLoss ?? check.lossPercent, 'percent')}</td><td class="obs-muted">${esc(truncate(check.error || '', 80)) || '—'}</td><td>${BTN('Delete', 'trash', `data-obs-netcheck-delete="${esc(check.id)}"`, 'ghost', 'xs')}</td></tr>`);
    const deviceRows = devices.map((device) => `<tr><td><strong>${esc(device.name)}</strong><div class="obs-muted">${esc(device.host || '')}</div></td><td>${device.uptimeSeconds != null ? fmtUnit(device.uptimeSeconds, 'seconds') : '—'}</td><td>${fmtNumber(device.interfaces ?? '—')}</td><td>${esc(device.error || '—')}</td><td>${BTN('Delete', 'trash', `data-obs-netdevice-delete="${esc(device.id)}"`, 'ghost', 'xs')}</td></tr>`);
    return `${collectorNote(collector, 'network')}
      ${U.infoBanner('Measured, not estimated', 'Latency and loss come from active probes; interface rates come from real counters. SNMP devices use version 2c with a community stored in the encrypted vault.', 'info')}
      ${U.card({ title: 'Reachability checks', icon: 'radar', sub: 'ICMP, TCP and DNS probes', actions: BTN('Add check', 'plus', 'data-obs-netcheck-add', 'primary'), body: table(['Check', 'Kind', 'State', 'Latency', 'Loss', 'Detail', ''], checkRows, { emptyTitle: 'No network checks', emptyBody: 'Add a host to probe for latency and packet loss.', action: BTN('Add check', 'plus', 'data-obs-netcheck-add', 'primary') }) })}
      ${U.card({ title: 'SNMP devices', icon: 'network', sub: 'v2c inventory and uptime', actions: BTN('Add device', 'plus', 'data-obs-netdevice-add', 'primary'), body: table(['Device', 'Uptime', 'Interfaces', 'Detail', ''], deviceRows, { emptyTitle: 'No SNMP devices', emptyBody: 'Add a switch or router with an SNMP v2c community to read interface inventory.', action: BTN('Add device', 'plus', 'data-obs-netdevice-add', 'primary') }) })}`;
  }

  // -------------------------------------------------------------------- logs

  function logsBody() {
    const stats = S.logs.stats;
    if (!stats) return U.loader('Opening the log store…');
    const levelRows = Object.entries(stats.byLevel || {});
    const rows = S.logs.rows.map((row) => `<tr>
      <td class="mono obs-nowrap">${esc(fmtDateTime(row.timestamp))}</td>
      <td>${U.badge(row.level || 'INFO', row.level === 'ERROR' || row.level === 'FATAL' ? 'red' : row.level === 'WARN' ? 'orange' : 'slate')}</td>
      <td>${chip(row.source || 'unknown', 'slate')}</td>
      <td>${esc(row.service || row.container || row.pod || '—')}</td>
      <td class="obs-log-text mono">${esc(truncate(row.text || row.message || '', 260))}</td>
    </tr>`);
    return `<div class="obs-stat-grid">
        ${U.statCard({ label: 'Stored lines', icon: 'scroll-text', tone: 'cyan', value: fmtNumber(stats.records || 0), sub: `${stats.retentionDays || 0} day retention` })}
        ${U.statCard({ label: 'Errors', icon: 'alert-triangle', tone: stats.byLevel?.ERROR ? 'orange' : 'green', value: fmtNumber((stats.byLevel?.ERROR || 0) + (stats.byLevel?.FATAL || 0)), sub: 'ERROR and FATAL' })}
        ${U.statCard({ label: 'Sources', icon: 'layers', tone: 'violet', value: fmtNumber(Object.keys(stats.bySource || {}).length), sub: 'local, Docker, Kubernetes, remote' })}
        ${U.statCard({ label: 'Store size', icon: 'hard-drive', tone: 'slate', value: fmtBytes(stats.fileBytes || 0), sub: stats.file ? 'gzip, mode 0600' : 'in memory' })}
      </div>
      ${U.card({
        title: 'Search logs', icon: 'search', sub: 'Filter stored lines and collect new ones from a real source',
        body: `<div class="obs-toolbar">
          <label class="field"><span>Search</span><input class="input" data-obs-log-search value="${esc(S.logs.query)}" placeholder="message, service or trace id"></label>
          <label class="field"><span>Level</span><select class="input" data-obs-log-level><option value="">All levels</option>${(S.boot?.logs ? ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] : ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL']).map((level) => `<option value="${level}" ${S.logs.level === level ? 'selected' : ''}>${level}</option>`).join('')}</select></label>
          <label class="field"><span>Source</span><select class="input" data-obs-log-source><option value="">All sources</option>${Object.keys(stats.bySource || {}).sort().map((source) => `<option value="${esc(source)}" ${S.logs.source === source ? 'selected' : ''}>${esc(source)}</option>`).join('')}</select></label>
          <div class="obs-toolbar-actions">${BTN('Apply filters', 'filter', 'data-obs-log-apply', 'secondary')}${BTN('Clear stored logs', 'trash', 'data-obs-log-clear', 'ghost')}${BTN('Export CSV', 'download', 'data-obs-log-export', 'secondary')}</div>
        </div>
        <div class="obs-toolbar">
          <label class="field"><span>Collect from</span><select class="input" data-obs-log-collect-source><option value="local">Local host (journalctl / file)</option><option value="docker">Docker container</option><option value="kubernetes">Kubernetes pod</option><option value="remote">Remote server</option></select></label>
          <label class="field obs-toolbar-grow"><span>Container, pod or server id</span><input class="input" data-obs-log-target placeholder="optional target identifier"></label>
          <div class="obs-toolbar-actions">${BTN('Collect now', 'download', 'data-obs-log-collect', 'primary')}</div>
        </div>
        ${S.logs.collected ? U.infoBanner('Collection result', S.logs.collected, 'info') : ''}
        ${table(['Time', 'Level', 'Source', 'Service', 'Message'], rows, { emptyTitle: 'No log lines match', emptyBody: 'Collect from the local host or a container, or change the filters above.' })}`,
      })}`;
  }

  // ------------------------------------------------------------------ traces

  function tracesBody() {
    const stats = S.traces.stats;
    if (!stats) return U.loader('Opening the trace store…');
    const rows = S.traces.rows.map((trace) => `<tr>
      <td class="mono"><button type="button" class="obs-link" data-obs-trace-open="${esc(trace.traceId)}">${esc(truncate(trace.traceId, 18))}</button></td>
      <td><strong>${esc(trace.name || 'span')}</strong><div class="obs-muted">${esc(trace.service || '')}</div></td>
      <td>${(trace.services || []).map((service) => chip(service, 'slate')).join(' ')}</td>
      <td>${fmtUnit(trace.durationMs, 'milliseconds')}</td>
      <td>${fmtNumber(trace.spans)}</td>
      <td>${trace.errors ? U.badge(`${trace.errors} errors`, 'red') : U.badge('ok', 'green')}</td>
      <td>${timeAgo(trace.timestamp)}</td>
    </tr>`);
    let detail = '';
    if (S.traces.trace?.ok) {
      const trace = S.traces.trace.trace;
      const spans = S.traces.trace.spans || [];
      detail = U.card({
        title: 'Trace detail', icon: 'git-branch', sub: trace.traceId,
        actions: BTN('Close', 'x', 'data-obs-trace-close', 'ghost'),
        body: `${kv([['Started', esc(fmtDateTime(trace.startTime))], ['Duration', fmtUnit(trace.durationMs, 'milliseconds')], ['Spans', fmtNumber(trace.spanCount)], ['Errors', fmtNumber(trace.errors)], ['Services', esc((trace.services || []).join(', '))]])}
          <div class="obs-waterfall">${spans.map((span) => {
            const start = trace.durationMs ? Math.max(0, (span.offsetMs / trace.durationMs) * 100) : 0;
            const width = trace.durationMs ? Math.max(0.5, ((span.durationMs || trace.durationMs) / trace.durationMs) * 100) : 100;
            return `<div class="obs-waterfall-row" style="--depth:${span.depth || 0}"><span class="obs-waterfall-name mono">${'&nbsp;'.repeat((span.depth || 0) * 4)}${esc(span.name || 'span')}</span><span class="obs-waterfall-track"><i class="${span.error ? 'bad' : ''}" style="margin-left:${Math.min(99, start)}%;width:${Math.min(100, width)}%"></span><span class="obs-waterfall-ms">${fmtUnit(span.durationMs, 'milliseconds')}</span></div>`;
          }).join('')}</div>`,
      });
    }
    return `<div class="obs-stat-grid">
        ${U.statCard({ label: 'Stored spans', icon: 'git-branch', tone: 'cyan', value: fmtNumber(stats.records || 0), sub: `${stats.retentionDays || 0} day retention` })}
        ${U.statCard({ label: 'Services', icon: 'activity', tone: 'violet', value: fmtNumber((S.traces.services || []).length), sub: 'Seen in received traces' })}
        ${U.statCard({ label: 'Traces in range', icon: 'list', tone: 'orange', value: fmtNumber(S.traces.total || 0), sub: 'Matching the current filter' })}
      </div>
      ${U.card({ title: 'Filters', icon: 'filter', sub: 'Search trace ids, root spans and services', body: `<div class="obs-toolbar"><label class="field"><span>Service</span><select class="input" data-obs-trace-service><option value="">All services</option>${(S.traces.services || []).map((service) => `<option value="${esc(service.name)}" ${S.traces.service === service.name ? 'selected' : ''}>${esc(service.name)} · ${fmtNumber(service.spans || 0)}</option>`).join('')}</select></label><label class="obs-check"><input type="checkbox" data-obs-trace-errors ${S.traces.errors ? 'checked' : ''}><span>Errors only</span></label><div class="obs-toolbar-actions">${BTN('Apply', 'filter', 'data-obs-trace-apply', 'secondary')}${BTN('Clear stored traces', 'trash', 'data-obs-traces-clear', 'ghost')}${BTN('Ingest guide', 'code', 'data-obs-href="#/observability/agents"', 'secondary')}</div></div>` })}
      ${U.card({ title: 'Traces', icon: 'git-branch', sub: 'Grouped spans from OTLP/HTTP JSON', body: table(['Trace', 'Root span', 'Services', 'Duration', 'Spans', 'Status', 'When'], rows, { emptyTitle: 'No traces received', emptyBody: 'Enable the ingest receiver, then export OTLP/HTTP JSON from an instrumented service. Protobuf payloads are rejected with 415 rather than guessed.' }) })}
      ${detail}`;
  }

  // ------------------------------------------------------------------ alerts

  function alertsBody() {
    const items = S.alerts.items || [];
    const active = items.filter((alert) => alert.state === 'firing' || alert.state === 'pending');
    const rows = items.map((alert) => `<tr>
      <td><strong>${esc(alert.name || alert.ruleId)}</strong><div class="obs-muted">${esc(alert.summary || '')}</div></td>
      <td>${severityBadge(alert.severity)}</td>
      <td>${U.badge(alert.state || 'unknown', alert.state === 'firing' ? 'red' : alert.state === 'pending' ? 'orange' : alert.state === 'resolved' ? 'green' : 'slate')}</td>
      <td>${esc(alert.resource || '—')}</td>
      <td>${fmtUnit(alert.value, alert.unit)}${alert.threshold != null ? `<div class="obs-muted">threshold ${fmtUnit(alert.threshold, alert.unit)}</div>` : ''}</td>
      <td>${alert.startedAt ? timeAgo(alert.startedAt) : '—'}</td>
      <td class="obs-row-actions">${alert.state !== 'resolved' ? `${BTN('Acknowledge', 'check', `data-obs-alert-ack="${esc(alert.id)}"`, 'ghost', 'xs')}${BTN('Resolve', 'circle-check', `data-obs-alert-resolve="${esc(alert.id)}"`, 'ghost', 'xs')}` : '—'}</td>
    </tr>`);
    const ruleRows = (S.alerts.rules || []).map((rule) => `<tr>
      <td><strong>${esc(rule.name)}</strong><div class="obs-muted mono">${esc(rule.metric || '')} ${esc(rule.aggregation)} ${esc(rule.operator)} ${esc(rule.threshold)} ${esc(rule.unit || '')}</div></td>
      <td>${severityBadge(rule.severity)}</td>
      <td>${rule.enabled ? U.badge('enabled', 'green') : U.badge('disabled', 'slate')}</td>
      <td>${fmtNumber(rule.lookbackSec)}s lookback</td>
      <td>${fmtNumber(rule.forSec)}s for</td>
      <td class="obs-row-actions">${BTN('Edit', 'edit', `data-obs-rule-edit="${esc(rule.id)}"`, 'ghost', 'xs')}${BTN('Delete', 'trash', `data-obs-rule-delete="${esc(rule.id)}"`, 'ghost', 'xs')}</td>
    </tr>`);
    const silenceRows = (S.alerts.silences || []).map((silence) => `<tr><td>${esc(silence.ruleId || silence.name || 'All')}</td><td>${esc(silence.reason || '')}</td><td>${silence.until ? fmtDateTime(silence.until) : 'no expiry'}</td><td>${BTN('Remove', 'trash', `data-obs-silence-delete="${esc(silence.id)}"`, 'ghost', 'xs')}</td></tr>`);
    return `<div class="obs-stat-grid">
        ${U.statCard({ label: 'Active', icon: 'bell', tone: active.length ? 'orange' : 'green', value: fmtNumber(active.length), sub: `${items.filter((alert) => alert.severity === 'critical' && alert.state !== 'resolved').length} critical` })}
        ${U.statCard({ label: 'Rules', icon: 'filter', tone: 'cyan', value: fmtNumber((S.alerts.rules || []).length), sub: `${(S.alerts.rules || []).filter((rule) => rule.enabled !== false).length} enabled` })}
        ${U.statCard({ label: 'Silences', icon: 'bell', tone: 'slate', value: fmtNumber((S.alerts.silences || []).length), sub: 'Muted rules or labels' })}
      </div>
      ${U.card({ title: 'Alerts', icon: 'bell', sub: 'Firing, pending and recently resolved', actions: BTN('New rule', 'plus', 'data-obs-rule-add', 'primary'), body: table(['Alert', 'Severity', 'State', 'Resource', 'Value', 'Started', ''], rows, { emptyTitle: 'No alerts have fired', emptyBody: 'Rules evaluate the local time-series store every few seconds.' }) })}
      ${U.card({ title: 'Rules', icon: 'filter', sub: 'Thresholds evaluated against retained metrics', actions: BTN('New rule', 'plus', 'data-obs-rule-add', 'primary'), body: table(['Rule', 'Severity', 'Enabled', 'Lookback', 'For', ''], ruleRows, { emptyTitle: 'No rules' }) })}
      ${U.card({ title: 'Silences', icon: 'bell', sub: 'Suppress notifications without deleting history', actions: BTN('Create silence', 'plus', 'data-obs-silence-add', 'secondary'), body: table(['Target', 'Reason', 'Until', ''], silenceRows, { emptyTitle: 'No active silences' }) })}`;
  }

  // --------------------------------------------------------------- incidents

  function incidentsBody() {
    const items = S.incidents.items || [];
    const open = items.filter((incident) => incident.status !== 'resolved');
    const rows = items.map((incident) => `<tr>
      <td><strong>${esc(incident.title)}</strong><div class="obs-muted">${esc(truncate(incident.summary || '', 100))}</div></td>
      <td>${severityBadge(incident.severity)}</td>
      <td>${U.badge(incident.status || 'open', incident.status === 'resolved' ? 'green' : incident.status === 'acknowledged' ? 'cyan' : 'orange')}</td>
      <td>${esc(incident.assignee || 'Unassigned')}</td>
      <td>${fmtNumber((incident.alerts || []).length)}</td>
      <td>${timeAgo(incident.updatedAt || incident.createdAt)}</td>
      <td class="obs-row-actions">${incident.status !== 'resolved' ? BTN('Update', 'edit', `data-obs-incident-update="${esc(incident.id)}"`, 'ghost', 'xs') : ''}${BTN('View', 'eye', `data-obs-incident-view="${esc(incident.id)}"`, 'ghost', 'xs')}</td>
    </tr>`);
    let detail = '';
    if (S.incidents.selected) {
      const incident = S.incidents.selected;
      detail = U.card({
        title: incident.title, icon: 'alert-triangle', sub: `${incident.status} · ${incident.severity}`,
        actions: BTN('Close', 'x', 'data-obs-incident-close', 'ghost'),
        body: `${kv([['Summary', esc(incident.summary || '—')], ['Assignee', esc(incident.assignee || '—')], ['Root cause', esc(incident.rootCause || '—')], ['Resolution', esc(incident.resolution || '—')], ['Created', esc(fmtDateTime(incident.createdAt))]])}
          <div class="obs-timeline">${(incident.timeline || []).map((entry) => `<div class="obs-timeline-row"><span>${esc(fmtDateTime(entry.at))}</span><strong>${esc(entry.type)}</strong><p>${esc(entry.text)}</p></div>`).join('')}</div>`,
      });
    }
    return `<div class="obs-stat-grid">
        ${U.statCard({ label: 'Open', icon: 'alert-triangle', tone: open.length ? 'orange' : 'green', value: fmtNumber(open.length), sub: 'Not resolved' })}
        ${U.statCard({ label: 'Critical', icon: 'flame', tone: open.some((incident) => incident.severity === 'critical') ? 'red' : 'green', value: fmtNumber(open.filter((incident) => incident.severity === 'critical').length), sub: 'Open critical incidents' })}
        ${U.statCard({ label: 'Total retained', icon: 'list', tone: 'slate', value: fmtNumber(S.incidents.total || items.length), sub: 'Within retention' })}
      </div>
      ${U.card({ title: 'Incidents', icon: 'alert-triangle', sub: 'Grouped alerts with a reviewable timeline', actions: BTN('Create incident', 'plus', 'data-obs-incident-add', 'primary'), body: table(['Incident', 'Severity', 'Status', 'Assignee', 'Alerts', 'Updated', ''], rows, { emptyTitle: 'No incidents', emptyBody: 'Incidents are opened when an alert rule fires, or you can create one manually.', action: BTN('Create incident', 'plus', 'data-obs-incident-add', 'primary') }) })}
      ${detail}`;
  }

  // --------------------------------------------------------------- dashboards

  function dashboardWidget(widgetData, editable = false) {
    const widget = widgetData.widget || {};
    const title = widget.title || 'Widget';
    const unit = widgetData.unit || widget.unit || '';
    let body = '';
    if (widgetData.series?.length) {
      body = chart(widgetData, { unit, color: widget.type === 'bar' ? 'var(--orange)' : 'var(--cyan)', height: Math.max(120, Math.min(300, widget.height || 200)) });
    } else if (widgetData.rows?.length) {
      const rows = widgetData.rows.slice(0, 40).map((row) => {
        if (widget.type?.startsWith('logs-')) {
          return `<tr><td>${esc(fmtDateTime(row.timestamp))}</td><td>${U.badge(row.level || 'INFO', row.level === 'ERROR' ? 'red' : 'slate')}</td><td class="mono">${esc(truncate(row.text || '', 120))}</td></tr>`;
        }
        return `<tr><td>${esc(row.name || row.resource || row.metric || row.labels?.mount || '—')}</td><td><strong>${fmtUnit(row.value, unit || row.unit)}</strong></td></tr>`;
      });
      body = table(widget.type?.startsWith('logs-') ? ['Time', 'Level', 'Message'] : ['Name', 'Value'], rows, { emptyTitle: 'No data', emptyBody: 'This widget has no retained samples in the selected range.' });
    } else {
      body = U.empty({ compact: true, icon: 'bar-chart', title: 'No data yet', body: widgetData.note || 'Samples appear after the collector has run in this range.' });
    }
    return `<section class="card obs-widget" style="--obs-span:${Math.max(3, Math.min(12, widget.span || 6))}">
      <header class="card-head"><div class="card-head-text"><h2 class="card-title">${icon(widget.type === 'stat' ? 'activity' : 'bar-chart', 15)}${esc(title)}</h2><p class="card-sub">${esc(widget.metric || (widget.metrics || []).join(', ') || widget.type || '')}</p></div>
        ${editable ? `<div class="obs-row-actions">${BTN('Edit', 'edit', `data-obs-widget-edit="${esc(widget.id)}"`, 'ghost', 'xs')}${BTN('Delete', 'trash', `data-obs-widget-delete="${esc(widget.id)}"`, 'ghost', 'xs')}</div>` : ''}
      </header>
      <div class="card-body">${body}</div>
    </section>`;
  }

  function dashboardsBody() {
    const list = S.dashboards?.dashboards || [];
    const active = S.dashboard?.dashboard || null;
    const sidebar = `<aside class="obs-dash-list">
      <div class="obs-dash-list-head"><strong>Dashboards</strong>${BTN('New', 'plus', 'data-obs-dashboard-add', 'ghost', 'xs')}</div>
      ${list.map((dashboard) => `<button type="button" class="obs-dash-item ${active?.id === dashboard.id ? 'active' : ''}" data-obs-dashboard-open="${esc(dashboard.id)}">
        <span>${icon(dashboard.icon || 'layout-dashboard', 14)}${esc(dashboard.name)}</span>
        <small>${esc(dashboard.builtin ? 'Built in' : 'Custom')} · ${fmtNumber(dashboard.widgetCount ?? dashboard.widgets?.length ?? 0)} widgets</small>
      </button>`).join('') || U.empty({ compact: true, icon: 'layout-dashboard', title: 'No dashboards' })}
    </aside>`;
    const body = active
      ? `<div class="obs-dash-head">
          <div><h2>${esc(active.name)}</h2><p>${esc(active.description || '')}</p></div>
          <div class="obs-row-actions">
            ${BTN(active.favorite ? 'Unfavorite' : 'Favorite', 'star', `data-obs-dashboard-favorite="${esc(active.id)}"`, 'ghost')}
            ${BTN('Duplicate', 'copy', `data-obs-dashboard-duplicate="${esc(active.id)}"`, 'secondary')}
            ${active.builtin ? '' : BTN('Add widget', 'plus', 'data-obs-widget-add', 'primary')}
            ${active.builtin ? '' : BTN('Delete', 'trash', `data-obs-dashboard-delete="${esc(active.id)}"`, 'ghost')}
          </div>
        </div>
        ${(S.dashboard?.widgets || []).length
          ? `<div class="obs-widget-grid">${(S.dashboard.widgets || []).map((widget) => dashboardWidget(widget, active.builtin !== true)).join('')}</div>`
          : U.empty({ icon: 'bar-chart', title: 'This dashboard has no widgets', body: 'Add a widget backed by a metric the collectors have recorded.', action: active.builtin ? '' : BTN('Add widget', 'plus', 'data-obs-widget-add', 'primary') })}`
      : U.empty({ icon: 'layout-dashboard', title: 'Choose a dashboard', body: 'Prebuilt dashboards cover infrastructure, Docker, Kubernetes, databases, API and logs. Create a custom one to start from a blank canvas.' });
    return `<div class="obs-dash-layout">${sidebar}<div class="obs-dash-main">${body}</div></div>`;
  }

  function openWidgetForm(widget = null) {
    const active = S.dashboard?.dashboard;
    if (!active || active.builtin) return;
    const catalog = S.metrics.catalog || [];
    const metricOptions = catalog.map((entry) => ({ value: entry.name, label: entry.name }));
    if (widget?.metric && !metricOptions.some((option) => option.value === widget.metric)) {
      metricOptions.unshift({ value: widget.metric, label: widget.metric });
    }
    const unitOptions = ['', 'percent', 'count', 'bytes', 'bytes_per_second', 'milliseconds', 'seconds', 'celsius'];
    openForm({
      title: widget ? `Edit ${widget.title}` : 'Add widget',
      subtitle: 'The widget only reads metrics that collectors have actually recorded.',
      icon: 'bar-chart',
      width: '720px',
      fields: [
        { name: 'title', label: 'Title', required: true, placeholder: 'Container CPU' },
        { name: 'type', label: 'Visualisation', type: 'select', options: ['timeseries', 'area', 'bar', 'pie', 'gauge', 'stat', 'table', 'topn', 'heatmap', 'status', 'latency'] },
        { name: 'metric', label: 'Metric', type: 'select', required: true, options: metricOptions.length ? metricOptions : [{ value: '', label: 'No metrics recorded yet' }] },
        { name: 'unit', label: 'Unit', type: 'select', options: unitOptions.map((unit) => ({ value: unit, label: unit || 'none' })) },
        { name: 'aggregation', label: 'Aggregation', type: 'select', options: ['avg', 'max', 'min', 'sum', 'last'] },
        { name: 'span', label: 'Width (1–12 columns)', type: 'number', min: 1, max: 12, value: 6 },
        { name: 'height', label: 'Height (px)', type: 'number', min: 120, max: 600, value: 240 },
      ],
      values: widget || { type: 'timeseries', metric: metricOptions[0]?.value || '', unit: '', aggregation: 'avg', span: 6, height: 240 },
      submitLabel: widget ? 'Save widget' : 'Add widget',
      onSubmit: async (data) => {
        if (!data.metric) throw new Error('Choose a metric that has at least one recorded sample.');
        const widgets = (active.widgets || []).map((entry) => ({ ...entry }));
        const next = {
          title: String(data.title || 'Widget'),
          type: data.type,
          metric: data.metric,
          unit: data.unit || '',
          aggregation: data.aggregation || 'avg',
          span: Number(data.span) || 6,
          height: Number(data.height) || 240,
        };
        const index = widget ? widgets.findIndex((entry) => entry.id === widget.id) : -1;
        if (index >= 0) widgets[index] = { ...widgets[index], ...next };
        else widgets.push(next);
        const result = await api.observability.dashboardSave({
          id: active.id, name: active.name, description: active.description,
          icon: active.icon, favorite: active.favorite, variables: active.variables, widgets,
        });
        if (result?.ok === false) throw new Error(result.error || 'Could not save the dashboard.');
        S.dashboards = null;
        U.toast(widget ? 'Widget updated' : 'Widget added', 'success');
      },
    });
  }

  // ------------------------------------------------------------------ metrics

  function metricsBody() {
    const catalog = S.metrics.catalog || [];
    const result = S.metrics.result;
    const selected = catalog.find((entry) => entry.name === S.metrics.name) || null;
    const filtered = catalog.filter((entry) => !S.metrics.search || entry.name.toLowerCase().includes(S.metrics.search.toLowerCase())).slice(0, 200);
    const series = result?.series || [];
    const rows = series.slice(0, 30).map((entry) => `<tr>
      <td class="mono">${esc(entry.name)}</td><td>${esc(entry.source || '—')}</td><td class="mono">${esc(entry.resource || '—')}</td>
      <td class="mono">${esc(JSON.stringify(entry.labels || {}))}</td><td>${fmtUnit(entry.points?.[entry.points.length - 1]?.[1], entry.unit)}</td><td>${fmtNumber(entry.points?.length || 0)}</td>
    </tr>`);
    return `${U.card({
      title: 'Catalog', icon: 'list', sub: 'Every series currently retained',
      body: `<div class="obs-toolbar"><label class="field obs-toolbar-grow"><span>Search metrics</span><input class="input" data-obs-metric-search value="${esc(S.metrics.search)}" placeholder="system.cpu, docker., synthetic., application."></label><label class="field"><span>Metric</span><select class="input" data-obs-metric-name>${filtered.map((entry) => `<option value="${esc(entry.name)}" ${entry.name === S.metrics.name ? 'selected' : ''}>${esc(entry.name)}</option>`).join('')}</select></label><div class="obs-toolbar-actions">${BTN('Query', 'play', 'data-obs-metric-query', 'primary')}${BTN('Export CSV', 'download', 'data-obs-metric-export', 'secondary')}</div></div>
        <div class="obs-muted">${fmtNumber(catalog.length)} metrics · ${fmtNumber(S.boot?.storage?.series ?? 0)} stored series</div>`,
    })}
    ${result ? U.card({
      title: S.metrics.name, icon: 'activity', sub: `${series.length} series · ${result.aggregation || 'avg'} over ${S.range}`,
      body: `${chart(result, { unit: selected?.unit || series[0]?.unit || '', color: 'var(--cyan)', height: 220 })}
        ${table(['Metric', 'Source', 'Resource', 'Labels', 'Latest', 'Points'], rows, { emptyTitle: 'No samples for this metric', emptyBody: 'Choose another metric or widen the time range.' })}`,
    }) : U.empty({ icon: 'bar-chart', title: 'No metric selected', body: 'Choose a metric from the catalog to inspect its retained samples.' })}`;
  }

  // ------------------------------------------------------------------- reports

  function reportsBody() {
    const types = S.reports.types || [];
    const result = S.reports.result;
    const preview = result?.ok
      ? (result.mime === 'application/pdf' ? `<div class="obs-pdf-preview">${icon('file', 20)}<div><strong>${esc(result.filename || 'report.pdf')}</strong><span>PDF generated (${fmtBytes(result.bytes || 0)})</span></div></div>` : `<pre class="obs-pre">${esc(truncate(result.content || '', 12000))}</pre>`)
      : '';
    return `${U.card({
      title: 'Generate a report', icon: 'file', sub: 'Built from retained metrics, alerts, incidents, logs and traces',
      body: `<div class="obs-toolbar">
        <label class="field"><span>Report</span><select class="input" data-obs-report-type>${types.map((type) => `<option value="${esc(type.id)}">${esc(type.label)}</option>`).join('')}</select></label>
        <label class="field"><span>Format</span><select class="input" data-obs-report-format><option value="json">JSON</option><option value="csv">CSV</option><option value="pdf">PDF</option></select></label>
        <label class="field"><span>Range</span><select class="input" data-obs-report-range>${['1h', '24h', '7d', '30d'].map((value) => `<option value="${value}" ${value === '7d' ? 'selected' : ''}>${value}</option>`).join('')}</select></label>
        <div class="obs-toolbar-actions">${BTN('Generate', 'play', 'data-obs-report-generate', 'primary')}${result?.ok ? BTN('Save to file', 'download', 'data-obs-report-export', 'secondary') : ''}</div>
      </div>`,
    })}
    ${preview ? U.card({ title: 'Preview', icon: 'eye', sub: result.title || '', body: preview }) : U.empty({ icon: 'file', title: 'No report generated yet', body: 'Pick a report and format, then generate a snapshot from retained data.' })}`;
  }

  // -------------------------------------------------------------- integrations

  function integrationsBody() {
    const items = S.integrations?.items || [];
    const definitions = S.integrations?.definitions || [];
    const rows = items.map((item) => `<tr>
      <td><strong>${esc(item.name)}</strong><div class="obs-muted">${esc(item.definition?.label || item.type)}</div></td>
      <td>${esc(item.url || item.host || '—')}</td>
      <td>${item.enabled ? U.badge('enabled', 'green') : U.badge('disabled', 'slate')}</td>
      <td>${item.status ? statusBadge(item.status.ok, 'Connected', 'Unreachable') : U.badge('not tested', 'slate')}<div class="obs-muted">${esc(truncate(item.status?.error || '', 60))}</div></td>
      <td>${item.status?.at ? timeAgo(item.status.at) : '—'}</td>
      <td class="obs-row-actions">${BTN('Test', 'play', `data-obs-integration-test="${esc(item.id)}"`, 'ghost', 'xs')}${BTN('Discover', 'search', `data-obs-integration-discover="${esc(item.id)}"`, 'ghost', 'xs')}${QUERYABLE_INTEGRATIONS.has(item.type) ? BTN('Query', 'filter', `data-obs-integration-query="${esc(item.id)}"`, 'ghost', 'xs') : ''}${BTN('Edit', 'edit', `data-obs-integration-edit="${esc(item.id)}"`, 'ghost', 'xs')}${BTN('Delete', 'trash', `data-obs-integration-delete="${esc(item.id)}"`, 'ghost', 'xs')}</td>
    </tr>`);
    const discovery = S.integrations?.discovery;
    return `${U.infoBanner('Real adapters only', `Credentials are encrypted with the ${esc(S.integrations?.vault?.backend || 'local')} vault. Query results come from the configured source, never from a stub.`, 'info')}
      ${U.card({ title: 'Sources', icon: 'plug', sub: `${definitions.length} supported adapter types`, actions: BTN('Add integration', 'plus', 'data-obs-integration-add', 'primary'), body: table(['Integration', 'Endpoint', 'State', 'Connection', 'Last test', ''], rows, { emptyTitle: 'No integrations configured', emptyBody: 'Connect Prometheus, Loki, Elasticsearch, Tempo, Jaeger, Datadog, CloudWatch, GCP or Azure Monitor.', action: BTN('Add integration', 'plus', 'data-obs-integration-add', 'primary') }) })}
      ${discovery ? U.card({ title: 'Discovery result', icon: 'radar', sub: discovery.integration || '', body: `<pre class="obs-pre">${esc(JSON.stringify(discovery, null, 2))}</pre>` }) : ''}
      ${S.integrations?.query ? U.card({ title: 'Query result', icon: 'search', sub: S.integrations.query.expression || '', body: `<pre class="obs-pre">${esc(truncate(JSON.stringify(S.integrations.query, null, 2), 12000))}</pre>` }) : ''}
      ${U.card({ title: 'Supported adapters', icon: 'list', sub: 'Every adapter uses the native HTTP API', body: `<div class="obs-tag-list">${definitions.map((definition) => `<span class="obs-tag" title="${esc(definition.description || '')}">${esc(definition.label)}</span>`).join('')}</div>` })}`;
  }

  // ------------------------------------------------------------- notifications

  function notificationsBody() {
    const rows = (S.channels || []).map((channel) => `<tr>
      <td><strong>${esc(channel.name)}</strong><div class="obs-muted">${esc(channel.type)}</div></td>
      <td>${esc(channel.url || channel.host || channel.chatId || '—')}</td>
      <td>${channel.enabled ? U.badge('enabled', 'green') : U.badge('disabled', 'slate')}</td>
      <td>${channel.hasSecret ? U.badge('secret stored', 'cyan') : U.badge('no secret', 'slate')}</td>
      <td class="obs-row-actions">${BTN('Send test', 'send', `data-obs-channel-test="${esc(channel.id)}"`, 'ghost', 'xs')}${BTN('Edit', 'edit', `data-obs-channel-edit="${esc(channel.id)}"`, 'ghost', 'xs')}${BTN('Delete', 'trash', `data-obs-channel-delete="${esc(channel.id)}"`, 'ghost', 'xs')}</td>
    </tr>`);
    return `${U.card({ title: 'Delivery channels', icon: 'send', sub: 'Alerts and incident notifications', actions: BTN('Add channel', 'plus', 'data-obs-channel-add', 'primary'), body: table(['Channel', 'Destination', 'State', 'Credentials', ''], rows, { emptyTitle: 'No channels configured', emptyBody: 'Add a webhook, Slack, Discord, Telegram or email channel to receive alerts.', action: BTN('Add channel', 'plus', 'data-obs-channel-add', 'primary') }) })}
      ${U.infoBanner('Secrets stay in the main process', 'Tokens and SMTP passwords are encrypted with the same vault used by database credentials and are never returned to the renderer.', 'info')}`;
  }

  // ------------------------------------------------------------------- agents

  function agentsBody() {
    const status = S.agents?.status || {};
    const agents = S.agents?.agents || status.agents || [];
    const rows = agents.map((agent) => `<tr>
      <td><strong>${esc(agent.name)}</strong><div class="obs-muted mono">${esc(agent.id)}</div></td>
      <td>${esc(agent.platform || '—')}</td>
      <td>${agent.revoked ? U.badge('revoked', 'red') : agent.online ? U.badge('online', 'green') : U.badge('offline', 'slate')}</td>
      <td>${agent.lastSeen ? timeAgo(agent.lastSeen) : 'never'}</td>
      <td class="obs-row-actions">${agent.revoked ? '' : BTN('Revoke', 'shield', `data-obs-agent-revoke="${esc(agent.id)}"`, 'ghost', 'xs')}${BTN('Remove', 'trash', `data-obs-agent-remove="${esc(agent.id)}"`, 'ghost', 'xs')}</td>
    </tr>`);
    return `<div class="obs-stat-grid">
        ${U.statCard({ label: 'Receiver', icon: 'plug', tone: status.running ? 'green' : 'slate', value: status.running ? 'Listening' : 'Stopped', sub: status.running ? `${status.bind}:${status.port}` : 'Enable it in Settings' })}
        ${U.statCard({ label: 'Agents', icon: 'bot', tone: 'cyan', value: fmtNumber(agents.length), sub: `${agents.filter((agent) => agent.online).length} online` })}
        ${U.statCard({ label: 'Requests', icon: 'activity', tone: 'violet', value: fmtNumber(status.requests || 0), sub: status.error ? 'Last error recorded' : 'Since the receiver started' })}
      </div>
      ${status.error ? U.errorBanner('Receiver error', status.error) : ''}
      ${status.running ? U.infoBanner('Ingest endpoint', `POST metrics snapshots and OTLP/HTTP JSON to http://${status.bind}:${status.port}. Agents use a bearer token; OTLP protobuf is rejected with 415 until a decoder is available.`, 'info') : U.infoBanner('Receiver stopped', 'Enable the ingest receiver in Observability → Settings to accept agent and OTLP/HTTP JSON pushes.', 'info')}
      ${U.card({ title: 'Registered agents', icon: 'bot', sub: 'Bearer tokens are shown once at creation', actions: `${BTN('Restart receiver', 'refresh', 'data-obs-agents-restart', 'secondary')}${BTN('Create agent', 'plus', 'data-obs-agent-add', 'primary')}`, body: table(['Agent', 'Platform', 'State', 'Last seen', ''], rows, { emptyTitle: 'No agents registered', emptyBody: 'Create an agent to get a one-time bearer token, then configure your collector to push snapshots or OTLP data.', action: BTN('Create agent', 'plus', 'data-obs-agent-add', 'primary') }) })}`;
  }

  // -------------------------------------------------------------- remediation

  function remediationBody() {
    const status = S.remediation || {};
    const policies = status.policies || [];
    const executions = status.executions || [];
    const actions = status.actions || [];
    const policyRows = policies.map((policy) => `<tr>
      <td><strong>${esc(policy.name)}</strong><div class="obs-muted">${esc(policy.action)}</div></td>
      <td>${policy.enabled ? U.badge('enabled', 'green') : U.badge('disabled', 'slate')}</td>
      <td>${policy.approval === 'auto' ? U.badge('auto', 'orange') : U.badge('approval required', 'cyan')}</td>
      <td>${esc(policy.alertRuleId || 'any alert')}</td>
      <td>${fmtNumber(policy.cooldownSec)}s / ${fmtNumber(policy.maxPerHour)} per hour</td>
      <td class="obs-row-actions">${BTN('Run', 'play', `data-obs-remediation-run="${esc(policy.id)}"`, 'ghost', 'xs')}${BTN('Edit', 'edit', `data-obs-remediation-edit="${esc(policy.id)}"`, 'ghost', 'xs')}${BTN('Delete', 'trash', `data-obs-remediation-delete="${esc(policy.id)}"`, 'ghost', 'xs')}</td>
    </tr>`);
    const executionRows = executions.map((entry) => `<tr><td>${esc(entry.policyName || entry.policyId)}</td><td>${esc(entry.action)}</td><td>${statusBadge(entry.ok, 'Succeeded', 'Failed')}</td><td>${esc(entry.actor || '—')}</td><td>${timeAgo(entry.at)}</td><td class="obs-muted">${esc(truncate(entry.error || entry.result?.message || '', 100))}</td></tr>`);
    return `${U.card({
      title: 'Automation safety', icon: 'shield-check', sub: 'Disabled by default; every attempt is audited',
      body: `<div class="obs-toolbar"><div class="obs-toggle-row"><span>${status.enabled ? 'Automated remediation is enabled' : 'Automated remediation is disabled'}</span>${BTN(status.enabled ? 'Disable' : 'Enable', status.enabled ? 'pause' : 'play', `data-obs-remediation-toggle="${status.enabled ? 'off' : 'on'}"`, status.enabled ? 'danger' : 'primary')}</div></div>
        <div class="obs-tag-list">${actions.map((action) => `<span class="obs-tag">${esc(action.label)}</span>`).join('')}</div>
        <p class="obs-muted">Policies are allowlisted, rate limited, cooled down and require approval unless explicitly set to automatic. OpsDeck never runs a remediation from an AI answer.</p>`,
    })}
    ${U.card({ title: 'Policies', icon: 'wrench', sub: 'Map an alert rule to one allowlisted action', actions: BTN('Add policy', 'plus', 'data-obs-remediation-add', 'primary'), body: table(['Policy', 'State', 'Approval', 'Alert rule', 'Limits', ''], policyRows, { emptyTitle: 'No remediation policies', emptyBody: 'Add a policy only after you have verified the action and its target.', action: BTN('Add policy', 'plus', 'data-obs-remediation-add', 'primary') }) })}
    ${U.card({ title: 'Recent executions', icon: 'scroll-text', sub: 'Audit trail', body: table(['Policy', 'Action', 'Result', 'Actor', 'When', 'Detail'], executionRows, { emptyTitle: 'No executions recorded' }) })}`;
  }

  // ----------------------------------------------------------------- settings

  function settingsBody() {
    const config = S.settings;
    if (!config) return U.loader('Reading settings…');
    const collectors = config.collectors || {};
    const retention = config.retention || {};
    const agents = config.agents || {};
    const database = config.databaseMonitor || {};
    return `${U.card({
      title: 'Collection', icon: 'activity', sub: 'Cadence and enablement',
      body: `<div class="obs-form">
        <label class="obs-check"><input type="checkbox" data-obs-setting="enabled" ${config.enabled !== false ? 'checked' : ''}><span>Monitoring enabled</span><small>Stops every scheduled collector when unchecked.</small></label>
        <label class="field"><span>Base interval (seconds)</span><input class="input" type="number" min="2" max="300" data-obs-setting="intervalSec" value="${esc(config.intervalSec || 10)}"></label>
        <label class="field"><span>Database interval (seconds)</span><input class="input" type="number" min="5" max="600" data-obs-setting="databaseMonitor.intervalSec" value="${esc(database.intervalSec || 30)}"></label>
        <label class="obs-check"><input type="checkbox" data-obs-setting="databaseMonitor.autoConnect" ${database.autoConnect ? 'checked' : ''}><span>Auto-connect saved database profiles</span><small>Opens sessions to read engine metrics even when you have not connected manually.</small></label>
      </div>
      <div class="obs-collector-grid">${Object.entries(collectors).map(([key, value]) => `<label class="obs-check"><input type="checkbox" data-obs-collector="${esc(key)}" ${value !== false ? 'checked' : ''}><span>${esc(titleCase(key))}</span></label>`).join('')}</div>`,
    })}
    ${U.card({
      title: 'Retention', icon: 'hard-drive', sub: 'Bounded local storage, written with mode 0600',
      body: `<div class="obs-form">
        <label class="field"><span>Raw samples (hours)</span><input class="input" type="number" min="1" max="720" data-obs-setting="retention.rawHours" value="${esc(retention.rawHours || 24)}"></label>
        <label class="field"><span>Aggregate retention (days)</span><input class="input" type="number" min="1" max="3650" data-obs-setting="retention.aggregateDays" value="${esc(retention.aggregateDays || 30)}"></label>
        <label class="field"><span>Log retention (days)</span><input class="input" type="number" min="1" max="365" data-obs-setting="retention.logsDays" value="${esc(retention.logsDays || 7)}"></label>
        <label class="field"><span>Trace retention (days)</span><input class="input" type="number" min="1" max="365" data-obs-setting="retention.tracesDays" value="${esc(retention.tracesDays || 7)}"></label>
        <label class="field"><span>Maximum log records</span><input class="input" type="number" min="100" max="200000" data-obs-setting="retention.maxLogs" value="${esc(retention.maxLogs || 20000)}"></label>
        <label class="field"><span>Maximum series</span><input class="input" type="number" min="100" max="100000" data-obs-setting="retention.maxSeries" value="${esc(retention.maxSeries || 5000)}"></label>
      </div>`,
    })}
    ${U.card({
      title: 'Agent & OTLP receiver', icon: 'bot', sub: 'Localhost by default',
      body: `<div class="obs-form">
        <label class="obs-check"><input type="checkbox" data-obs-setting="agents.enabled" ${agents.enabled ? 'checked' : ''}><span>Enable ingest receiver</span></label>
        <label class="field"><span>Bind address</span><input class="input" data-obs-setting="agents.bind" value="${esc(agents.bind || '127.0.0.1')}"></label>
        <label class="field"><span>Port</span><input class="input" type="number" min="0" max="65535" data-obs-setting="agents.port" value="${esc(agents.port || 8787)}"></label>
        <label class="obs-check"><input type="checkbox" data-obs-setting="agents.tls" ${agents.tls ? 'checked' : ''}><span>TLS</span><small>Requires a certificate configured for the receiver.</small></label>
      </div>`,
    })}
    ${U.card({ title: 'Workspace preferences', icon: 'settings', sub: 'Default range and overview widgets', body: `<div class="obs-form"><label class="field"><span>Default time range</span><select class="input" data-obs-setting="preferences.timeRange">${['15m', '1h', '6h', '24h', '7d'].map((range) => `<option value="${range}" ${(config.preferences?.timeRange || '1h') === range ? 'selected' : ''}>${range}</option>`).join('')}</select></label><label class="field"><span>Overview widgets</span><input class="input" data-obs-setting="overview.widgets" value="${esc((config.overview?.widgets || []).join(','))}"><small>Comma-separated widget ids.</small></label></div>` })}
    <div class="obs-actions-row">${BTN('Save settings', 'save', 'data-obs-settings-save', 'primary')}${BTN('Export configuration', 'download', 'data-obs-export-config', 'secondary')}</div>`;
  }

  // ------------------------------------------------------------------ actions

  function busy(button, on, label = 'Working…') {
    if (!button) return;
    if (on) {
      button.dataset.label = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner">${icon('loader', 12)}</span><span>${esc(label)}</span>`;
    } else {
      button.disabled = false;
      if (button.dataset.label) button.innerHTML = button.dataset.label;
    }
  }

  async function runAction(button, label, action, success) {
    busy(button, true, label);
    try {
      const result = await action();
      if (result?.ok === false) {
        U.toast(result.error || 'The action failed', 'error');
        return result;
      }
      if (success) U.toast(success, 'success');
      await refresh();
      return result;
    } catch (error) {
      U.toast(error.message || 'The action failed', 'error');
      return { ok: false, error: error.message };
    } finally {
      busy(button, false);
    }
  }

  function parseJsonObject(text, label) {
    const value = String(text || '').trim();
    if (!value) return {};
    try {
      const parsed = JSON.parse(value);
      if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) throw new Error('not an object');
      return parsed;
    } catch {
      throw new Error(`${label} must be a JSON object.`);
    }
  }

  function textToList(value) {
    return String(value || '').split(',').map((item) => item.trim()).filter(Boolean);
  }

  // ------------------------------------------------------------ server forms

  function serverFields(server = {}) {
    return [
      { name: 'name', label: 'Name', required: true, placeholder: 'db-1.example.com' },
      { name: 'method', label: 'Collection method', type: 'select', options: [{ value: 'ssh', label: 'SSH (standard Linux commands)' }, { value: 'prometheus', label: 'Prometheus node exporter' }, { value: 'agent', label: 'OpsDeck agent' }] },
      { name: 'host', label: 'Host name or IP', placeholder: '10.0.0.12' },
      { name: 'port', label: 'Port', type: 'number', min: 1, max: 65535, placeholder: '22' },
      { name: 'url', label: 'Exporter URL', wide: true, placeholder: 'http://10.0.0.12:9100/metrics' },
      { name: 'username', label: 'SSH username', placeholder: 'monitor' },
      { name: 'os', label: 'Operating system', type: 'select', options: [{ value: 'linux', label: 'Linux' }, { value: 'windows', label: 'Windows' }] },
      { name: 'group', label: 'Group', placeholder: 'production' },
      { name: 'environment', label: 'Environment', placeholder: 'prod' },
      { name: 'tags', label: 'Tags', placeholder: 'edge, eu-west' },
      { name: 'agentId', label: 'Agent id', placeholder: 'agent-…' },
      { name: 'timeoutMs', label: 'Timeout (ms)', type: 'number', min: 3000, max: 120000 },
      { name: 'password', label: 'SSH password (optional)', type: 'password' },
      { name: 'privateKey', label: 'SSH private key (optional)', type: 'textarea', rows: 4 },
      { name: 'passphrase', label: 'Key passphrase', type: 'password' },
      { name: 'token', label: 'Exporter bearer token', type: 'password' },
      { name: 'note', label: 'Note', type: 'textarea', rows: 2 },
      { name: 'enabled', label: 'Collect this server', type: 'checkbox' },
      { name: 'rejectUnauthorized', label: 'Verify TLS certificates', type: 'checkbox' },
    ];
  }

  function openServerForm(server = null) {
    const values = server ? { ...server, tags: (server.tags || []).join(', ') } : { method: 'ssh', os: 'linux', port: 22, timeoutMs: 30000, enabled: true, rejectUnauthorized: true };
    openForm({
      title: server ? 'Edit remote server' : 'Add remote server',
      subtitle: 'Measurements come from the server itself over SSH or an exporter.',
      icon: 'server',
      fields: serverFields(server || {}),
      values,
      submitLabel: server ? 'Save server' : 'Add server',
      onSubmit: async (data) => {
        const result = await api.observability.saveServer({ ...data, id: server?.id });
        if (result?.ok === false) throw new Error(result.error || 'Could not save the server.');
        U.toast(server ? 'Server updated' : 'Server added', 'success');
      },
    });
  }

  // ----------------------------------------------------------- target forms

  function targetFields(target = {}) {
    return [
      { name: 'name', label: 'Name', required: true, placeholder: 'Checkout API' },
      { name: 'kind', label: 'Check type', type: 'select', options: [{ value: 'http', label: 'HTTP(S)' }, { value: 'tcp', label: 'TCP port' }, { value: 'dns', label: 'DNS record' }, { value: 'tls', label: 'TLS certificate' }] },
      { name: 'url', label: 'URL', wide: true, placeholder: 'https://api.example.com/health' },
      { name: 'host', label: 'Host', placeholder: 'api.example.com' },
      { name: 'port', label: 'Port', type: 'number', min: 1, max: 65535 },
      { name: 'method', label: 'HTTP method', type: 'select', options: ['GET', 'HEAD', 'POST', 'PUT', 'PATCH', 'DELETE'] },
      { name: 'expectedStatus', label: 'Expected status codes', placeholder: '200,204' },
      { name: 'recordType', label: 'DNS record type', type: 'select', options: ['A', 'AAAA', 'CNAME', 'MX', 'TXT'] },
      { name: 'bodyMatch', label: 'Response must contain', wide: true },
      { name: 'headerName', label: 'Auth header name', placeholder: 'authorization' },
      { name: 'headerValue', label: 'Auth header value', type: 'password' },
      { name: 'intervalSec', label: 'Interval (seconds)', type: 'number', min: 10, max: 3600 },
      { name: 'timeoutMs', label: 'Timeout (ms)', type: 'number', min: 1000, max: 60000 },
      { name: 'group', label: 'Group', placeholder: 'payments' },
      { name: 'environment', label: 'Environment', placeholder: 'prod' },
      { name: 'tags', label: 'Tags', placeholder: 'critical, api' },
      { name: 'note', label: 'Note', type: 'textarea', rows: 2 },
      { name: 'enabled', label: 'Run this check', type: 'checkbox' },
      { name: 'rejectUnauthorized', label: 'Verify TLS certificates', type: 'checkbox' },
    ];
  }

  function openTargetForm(target = null) {
    const values = target
      ? { ...target, expectedStatus: (target.expectedStatus || []).join(','), tags: (target.tags || []).join(', ') }
      : { kind: 'http', method: 'GET', expectedStatus: '200', recordType: 'A', intervalSec: 60, timeoutMs: 10000, enabled: true, rejectUnauthorized: true };
    openForm({
      title: target ? 'Edit synthetic check' : 'Add synthetic check',
      subtitle: 'Every result is a real probe executed from the main process.',
      icon: 'target',
      fields: targetFields(target || {}),
      values,
      submitLabel: target ? 'Save target' : 'Add target',
      onSubmit: async (data) => {
        const result = await api.observability.saveTarget({ ...data, id: target?.id });
        if (result?.ok === false) throw new Error(result.error || 'Could not save the target.');
        U.toast(target ? 'Target updated' : 'Target added', 'success');
      },
    });
  }

  // ------------------------------------------------------- alert rule forms

  function alertRuleFields(rule = {}) {
    return [
      { name: 'name', label: 'Rule name', required: true, placeholder: 'CPU above 90% for 5 minutes' },
      { name: 'severity', label: 'Severity', type: 'select', options: ['info', 'warning', 'critical'] },
      { name: 'metric', label: 'Metric', required: true, placeholder: 'system.cpu.usage' },
      { name: 'source', label: 'Source filter', placeholder: 'local, docker, remote…' },
      { name: 'resource', label: 'Resource filter', placeholder: 'docker:api' },
      { name: 'aggregation', label: 'Aggregation', type: 'select', options: ['avg', 'max', 'min', 'sum', 'last', 'count', 'median', 'p90', 'p95', 'p99'] },
      { name: 'operator', label: 'Operator', type: 'select', options: ['>', '>=', '<', '<=', '==', '!='] },
      { name: 'threshold', label: 'Threshold', type: 'number', step: 'any' },
      { name: 'unit', label: 'Unit', placeholder: 'percent' },
      { name: 'forSec', label: 'Pending for (seconds)', type: 'number', min: 0, max: 86400 },
      { name: 'lookbackSec', label: 'Lookback (seconds)', type: 'number', min: 30, max: 86400 },
      { name: 'evalIntervalSec', label: 'Evaluate every (seconds)', type: 'number', min: 5, max: 3600 },
      { name: 'recoveryThreshold', label: 'Recovery threshold', type: 'number', step: 'any' },
      { name: 'recoveryForSec', label: 'Recovery for (seconds)', type: 'number', min: 0, max: 86400 },
      { name: 'missingData', label: 'Missing data', type: 'select', options: [{ value: 'skip', label: 'Skip evaluation' }, { value: 'fire', label: 'Fire the alert' }] },
      { name: 'labelsMatcher', label: 'Label matcher', wide: true, placeholder: 'host=db-1,mount=/data' },
      { name: 'groupKey', label: 'Incident group key', placeholder: 'api-cpu' },
      { name: 'description', label: 'Description', type: 'textarea', rows: 2 },
      { name: 'enabled', label: 'Enable this rule', type: 'checkbox' },
      { name: 'incident', label: 'Open an incident when firing', type: 'checkbox' },
    ];
  }

  function openAlertRuleForm(rule = null) {
    const values = rule
      ? { ...rule, recoveryThreshold: rule.recoveryThreshold ?? '' }
      : { severity: 'warning', aggregation: 'avg', operator: '>', threshold: 90, forSec: 300, lookbackSec: 300, evalIntervalSec: 30, recoveryForSec: 300, missingData: 'skip', enabled: true, incident: true };
    openForm({
      title: rule ? 'Edit alert rule' : 'New alert rule',
      subtitle: 'Rules are evaluated against real samples in the local time-series store.',
      icon: 'filter',
      width: '720px',
      fields: alertRuleFields(rule || {}),
      values,
      submitLabel: rule ? 'Save rule' : 'Create rule',
      onSubmit: async (data) => {
        const result = await api.observability.saveAlertRule({ ...data, id: rule?.id });
        if (result?.ok === false) throw new Error(result.error || 'Could not save the rule.');
        U.toast(rule ? 'Rule updated' : 'Rule created', 'success');
      },
    });
  }

  // ---------------------------------------------------------- incident forms

  function openIncidentForm() {
    openForm({
      title: 'Create incident',
      subtitle: 'Use this for an event your monitoring did not raise automatically.',
      icon: 'alert-triangle',
      fields: [
        { name: 'title', label: 'Title', required: true, placeholder: 'Checkout latency above SLO' },
        { name: 'severity', label: 'Severity', type: 'select', options: ['info', 'warning', 'critical'] },
        { name: 'assignee', label: 'Assignee', placeholder: 'on-call engineer' },
        { name: 'summary', label: 'Summary', type: 'textarea', rows: 3 },
      ],
      values: { severity: 'warning' },
      submitLabel: 'Open incident',
      onSubmit: async (data) => {
        const result = await api.observability.createIncident(data);
        if (result?.ok === false) throw new Error(result.error || 'Could not create the incident.');
        U.toast('Incident opened', 'success');
      },
    });
  }

  function openIncidentUpdate(incident) {
    openForm({
      title: 'Update incident',
      subtitle: incident.title,
      icon: 'edit',
      fields: [
        { name: 'status', label: 'Status', type: 'select', options: ['open', 'acknowledged', 'mitigated', 'resolved'] },
        { name: 'severity', label: 'Severity', type: 'select', options: ['info', 'warning', 'critical'] },
        { name: 'assignee', label: 'Assignee' },
        { name: 'rootCause', label: 'Root cause', type: 'textarea', rows: 2 },
        { name: 'resolution', label: 'Resolution', type: 'textarea', rows: 2 },
        { name: 'note', label: 'Timeline note', type: 'textarea', rows: 2 },
      ],
      values: incident,
      submitLabel: 'Update incident',
      onSubmit: async (data) => {
        const result = await api.observability.updateIncident(incident.id, data);
        if (result?.ok === false) throw new Error(result.error || 'Could not update the incident.');
        U.toast('Incident updated', 'success');
      },
    });
  }

  // ------------------------------------------------------- integration forms

  function integrationFields(item = {}) {
    return [
      { name: 'name', label: 'Name', required: true, placeholder: 'Production Prometheus' },
      { name: 'type', label: 'Adapter', type: 'select', options: (S.integrations?.definitions || []).map((definition) => ({ value: definition.id, label: definition.label })) },
      { name: 'url', label: 'Base URL', wide: true, placeholder: 'https://prometheus.example.com' },
      { name: 'host', label: 'Host', placeholder: 'monitoring.internal' },
      { name: 'port', label: 'Port', type: 'number', min: 1, max: 65535 },
      { name: 'tls', label: 'Use TLS', type: 'checkbox' },
      { name: 'username', label: 'Username' },
      { name: 'password', label: 'Password', type: 'password' },
      { name: 'token', label: 'Bearer token', type: 'password' },
      { name: 'apiKey', label: 'API key', type: 'password' },
      { name: 'org', label: 'Organisation / tenant' },
      { name: 'bucket', label: 'Bucket' },
      { name: 'region', label: 'Region' },
      { name: 'projectId', label: 'Project id' },
      { name: 'tenantId', label: 'Tenant id' },
      { name: 'clientId', label: 'Client id' },
      { name: 'clientEmail', label: 'Client email' },
      { name: 'clientSecret', label: 'Client secret', type: 'password' },
      { name: 'privateKey', label: 'Service account private key', type: 'textarea', rows: 3 },
      { name: 'headers', label: 'Extra headers (JSON)', type: 'textarea', rows: 2 },
      { name: 'timeoutMs', label: 'Timeout (ms)', type: 'number', min: 1000, max: 60000 },
      { name: 'enabled', label: 'Enabled', type: 'checkbox' },
    ];
  }

  function openIntegrationForm(item = null) {
    const values = item ? { ...item, headers: JSON.stringify(item.headers || {}, null, 0), tls: item.tls !== false } : { type: 'prometheus', tls: true, timeoutMs: 12000, enabled: true };
    openForm({
      title: item ? 'Edit integration' : 'Add integration',
      subtitle: 'Credentials are stored in the encrypted vault and never returned to this window.',
      icon: 'plug',
      width: '720px',
      fields: integrationFields(item || {}),
      values,
      submitLabel: item ? 'Save integration' : 'Add integration',
      onSubmit: async (data) => {
        data.headers = parseJsonObject(data.headers, 'Extra headers');
        const result = await api.observability.saveIntegration({ ...data, id: item?.id });
        if (result?.ok === false) throw new Error(result.error || 'Could not save the integration.');
        U.toast(item ? 'Integration updated' : 'Integration added', 'success');
      },
    });
  }

  function openIntegrationQuery(item) {
    if (!item) return;
    const isElastic = item.type === 'elasticsearch' || item.type === 'opensearch';
    openForm({
      title: `Query ${item.name}`,
      subtitle: isElastic ? 'Query string or JSON DSL, sent to the configured index.' : 'The expression is sent to the configured source and the raw response is shown below.',
      icon: 'filter',
      width: '720px',
      fields: [
        { name: 'expression', label: isElastic ? 'Query (query_string or JSON)' : 'Expression', type: 'textarea', rows: 4, required: true, wide: true, placeholder: item.type === 'loki' ? '{app="api"} |= "error"' : isElastic ? '{ "match_all": {} }' : 'rate(node_cpu_seconds_total[5m])' },
        ...(isElastic ? [{ name: 'index', label: 'Index', placeholder: '*' }] : []),
        { name: 'limit', label: 'Maximum results', type: 'number', min: 1, max: 1000, value: 100 },
      ],
      values: { expression: '', index: '*', limit: 100 },
      submitLabel: 'Run query',
      onSubmit: async (data) => {
        const expression = String(data.expression || '').trim();
        if (!expression) throw new Error('Enter a query expression.');
        let parsed = expression;
        if (isElastic && expression.startsWith('{')) {
          try { parsed = JSON.parse(expression); } catch { throw new Error('The JSON query is not valid.'); }
        }
        const result = await api.observability.queryIntegration(item.id, parsed, {
          index: data.index || '*',
          limit: Number(data.limit) || 100,
        });
        if (result?.ok === false) throw new Error(result.error || 'The query failed.');
        S.integrations.query = { ...result, integration: item.name, expression };
        U.toast('Query finished', 'success');
      },
    });
  }

  // ---------------------------------------------------------- channel forms

  function channelFields(channel = {}) {
    return [
      { name: 'name', label: 'Name', required: true, placeholder: 'On-call webhook' },
      { name: 'type', label: 'Type', type: 'select', options: ['webhook', 'slack', 'discord', 'telegram', 'email'] },
      { name: 'url', label: 'Webhook / Slack URL', wide: true, placeholder: 'https://hooks.slack.com/services/…' },
      { name: 'host', label: 'SMTP host', placeholder: 'smtp.example.com' },
      { name: 'port', label: 'Port', type: 'number', min: 1, max: 65535 },
      { name: 'username', label: 'SMTP username' },
      { name: 'password', label: 'SMTP password', type: 'password' },
      { name: 'from', label: 'From address', placeholder: 'alerts@example.com' },
      { name: 'to', label: 'Recipients', wide: true, placeholder: 'oncall@example.com, sre@example.com' },
      { name: 'chatId', label: 'Telegram chat id' },
      { name: 'token', label: 'Bot token (Telegram)', type: 'password' },
      { name: 'secret', label: 'Signing secret', type: 'password' },
      { name: 'secure', label: 'Use implicit TLS', type: 'checkbox' },
      { name: 'starttls', label: 'Use STARTTLS', type: 'checkbox' },
      { name: 'rejectUnauthorized', label: 'Verify TLS certificates', type: 'checkbox' },
      { name: 'enabled', label: 'Enabled', type: 'checkbox' },
    ];
  }

  function openChannelForm(channel = null) {
    const values = channel ? { ...channel, to: (channel.to || []).join(', ') } : { type: 'webhook', starttls: true, rejectUnauthorized: true, enabled: true };
    openForm({
      title: channel ? 'Edit notification channel' : 'Add notification channel',
      subtitle: 'Tokens and SMTP passwords stay encrypted in the main process.',
      icon: 'send',
      width: '680px',
      fields: channelFields(channel || {}),
      values,
      submitLabel: channel ? 'Save channel' : 'Add channel',
      onSubmit: async (data) => {
        const result = await api.observability.saveChannel({ ...data, id: channel?.id });
        if (result?.ok === false) throw new Error(result.error || 'Could not save the channel.');
        U.toast(channel ? 'Channel updated' : 'Channel added', 'success');
      },
    });
  }

  // -------------------------------------------------------- remediation form

  function openRemediationForm(policy = null) {
    const actions = (S.remediation?.actions || []).map((action) => ({ value: action.id, label: action.label }));
    openForm({
      title: policy ? 'Edit remediation policy' : 'Add remediation policy',
      subtitle: 'Only allowlisted actions can run, and each attempt is audited.',
      icon: 'wrench',
      width: '720px',
      fields: [
        { name: 'name', label: 'Policy name', required: true, placeholder: 'Restart the API container' },
        { name: 'action', label: 'Action', type: 'select', options: actions },
        { name: 'alertRuleId', label: 'Alert rule id', placeholder: 'rule-… (blank matches any)' },
        { name: 'severity', label: 'Minimum severity', type: 'select', options: ['info', 'warning', 'critical'] },
        { name: 'approval', label: 'Approval', type: 'select', options: [{ value: 'required', label: 'Require explicit approval' }, { value: 'auto', label: 'Run automatically' }] },
        { name: 'target', label: 'Target (JSON)', type: 'textarea', rows: 4, hint: 'eg. {"containerId":"…"} or {"kind":"deployments","name":"api","namespace":"prod"}' },
        { name: 'cooldownSec', label: 'Cooldown (seconds)', type: 'number', min: 0, max: 86400 },
        { name: 'maxPerHour', label: 'Maximum per hour', type: 'number', min: 1, max: 60 },
        { name: 'enabled', label: 'Enable this policy', type: 'checkbox' },
      ],
      values: policy ? { ...policy, target: JSON.stringify(policy.target || {}, null, 0) } : { action: 'docker.restart', severity: 'critical', approval: 'required', cooldownSec: 300, maxPerHour: 3, enabled: false },
      submitLabel: policy ? 'Save policy' : 'Add policy',
      onSubmit: async (data) => {
        data.target = parseJsonObject(data.target, 'Target');
        const result = await api.observability.saveRemediationPolicy({ ...data, id: policy?.id });
        if (result?.ok === false) throw new Error(result.error || 'Could not save the policy.');
        U.toast(policy ? 'Policy updated' : 'Policy added', 'success');
      },
    });
  }

  function showAgentToken(result) {
    U.modal({
      title: 'Agent token created',
      subtitle: 'This token is shown once. Store it before closing this dialog.',
      icon: 'key',
      tone: 'closed',
      body: `<div class="obs-token-box"><code id="obs-agent-token">${esc(result.token)}</code>
        <div class="obs-muted">Send it as <code>Authorization: Bearer &lt;token&gt;</code> to the ingest receiver.</div></div>`,
      footer: `<div class="row gap-2 right" style="width:100%">${BTN('Copy token', 'copy', 'data-obs-copy-token', 'primary')}${BTN('Close', 'x', 'data-close', 'ghost')}</div>`,
      onMount: ({ root }) => {
        root.querySelector('[data-obs-copy-token]')?.addEventListener('click', async () => {
          await copyText(result.token);
          U.toast('Token copied', 'success');
        });
      },
    });
  }

  // ------------------------------------------------------------------ render

  const BODIES = {
    overview: overviewBody,
    infrastructure: infrastructureBody,
    docker: dockerBody,
    kubernetes: kubernetesBody,
    databases: databasesBody,
    applications: applicationsBody,
    synthetic: syntheticBody,
    network: networkBody,
    logs: logsBody,
    traces: tracesBody,
    alerts: alertsBody,
    incidents: incidentsBody,
    dashboards: dashboardsBody,
    metrics: metricsBody,
    reports: reportsBody,
    integrations: integrationsBody,
    notifications: notificationsBody,
    agents: agentsBody,
    remediation: remediationBody,
    settings: settingsBody,
  };

  async function render(route) {
    const requested = (route.parts && route.parts[0]) || 'overview';
    S.page = requested;
    if (!S.booted) await boot();
    if (!PAGES[S.page]) {
      return `<div class="page obs-page">
        <div class="page-head"><div class="page-head-left"><h1 class="page-title">Observability</h1><p class="page-sub">That page does not exist.</p></div></div>
        ${U.empty({ icon: 'compass', title: 'Page not found', body: `There is no observability view for “${S.page}”.`, action: LINK('Open overview', 'activity', '#/observability/overview', 'primary') })}
      </div>`;
    }
    const fresh = S.fresh && S.fresh.page === S.page && Date.now() - S.fresh.at < 2000;
    if (!fresh) await loadPage(S.page);
    S.fresh = null;
    const body = (BODIES[S.page] || overviewBody)();
    return renderShell(S.page, body);
  }

  // ------------------------------------------------------------------- mount

  function mount(root) {
    if (!root) return;
    dispose();
    const controller = new AbortController();
    S.controller = controller;
    const opts = { signal: controller.signal };

    root.addEventListener('click', (event) => onClick(event), opts);
    root.addEventListener('change', (event) => onChange(event), opts);
    root.addEventListener('input', (event) => onInput(event), opts);

    try {
      S.unsubscribe = api.events.observability((event) => {
        if (!event || typeof event.type !== 'string') return;
        if (event.type === 'servers:changed' || event.type === 'targets:changed' || event.type === 'settings:changed') {
          S.booted = false;
          syncMini();
        }
      });
    } catch { S.unsubscribe = null; }

    if (LIVE_PAGES.has(S.page)) {
      const page = S.page;
      // The collector schedule starts shortly after boot; one early refresh
      // makes the first real sample appear without a manual click.
      if (S.warmedPage !== page) {
        S.warmedPage = page;
        S.warmupTimer = setTimeout(() => {
          if (document.hidden || S.page !== page) return;
          loadPage(page).then(() => {
            if (S.page !== page) return;
            S.fresh = { page, at: Date.now() };
            OD.app?.rerender?.();
          }).catch(() => { /* the warmup must never break the view */ });
        }, 3000);
      }
      S.liveTimer = setInterval(async () => {
        if (document.hidden || S.page !== page || !document.querySelector(`[data-obs-page="${page}"]`)) return;
        try {
          await loadPage(page);
          if (S.page !== page) return;
          S.fresh = { page, at: Date.now() };
          OD.app?.rerender?.();
        } catch { /* the scheduled refresh must never break the view */ }
      }, 30000);
    }
  }

  function dispose() {
    if (S.controller) {
      try { S.controller.abort(); } catch { /* ignore */ }
      S.controller = null;
    }
    if (S.warmupTimer) {
      clearTimeout(S.warmupTimer);
      S.warmupTimer = null;
    }
    if (S.liveTimer) {
      clearInterval(S.liveTimer);
      S.liveTimer = null;
    }
    if (S.unsubscribe) {
      try { S.unsubscribe(); } catch { /* ignore */ }
      S.unsubscribe = null;
    }
  }

  function onClick(event) {
    const el = event.target.closest('[data-obs-refresh], [data-obs-href], [data-obs-ai], [data-obs-server-add], [data-obs-server-edit], [data-obs-server-test], [data-obs-server-delete], [data-obs-target-add], [data-obs-target-edit], [data-obs-target-test], [data-obs-target-delete], [data-obs-netcheck-add], [data-obs-netcheck-delete], [data-obs-netdevice-add], [data-obs-netdevice-delete], [data-obs-log-apply], [data-obs-log-clear], [data-obs-log-export], [data-obs-log-collect], [data-obs-trace-open], [data-obs-trace-close], [data-obs-trace-apply], [data-obs-traces-clear], [data-obs-alert-ack], [data-obs-alert-resolve], [data-obs-rule-add], [data-obs-rule-edit], [data-obs-rule-delete], [data-obs-silence-add], [data-obs-silence-delete], [data-obs-incident-add], [data-obs-incident-view], [data-obs-incident-update], [data-obs-incident-close], [data-obs-dashboard-add], [data-obs-dashboard-open], [data-obs-dashboard-favorite], [data-obs-dashboard-duplicate], [data-obs-dashboard-delete], [data-obs-widget-add], [data-obs-widget-edit], [data-obs-widget-delete], [data-obs-metric-query], [data-obs-metric-export], [data-obs-report-generate], [data-obs-report-export], [data-obs-integration-add], [data-obs-integration-edit], [data-obs-integration-test], [data-obs-integration-discover], [data-obs-integration-query], [data-obs-integration-delete], [data-obs-channel-add], [data-obs-channel-edit], [data-obs-channel-test], [data-obs-channel-delete], [data-obs-agent-add], [data-obs-agent-revoke], [data-obs-agent-remove], [data-obs-agents-restart], [data-obs-remediation-toggle], [data-obs-remediation-add], [data-obs-remediation-edit], [data-obs-remediation-delete], [data-obs-remediation-run], [data-obs-settings-save], [data-obs-export-config]');
    if (!el) return;
    handleClick(el, event).catch((error) => U.toast(error.message || 'The action failed', 'error'));
  }

  async function handleClick(el, event) {
    const ds = el.dataset;

    if (ds.obsHref) { location.hash = ds.obsHref; return; }
    if (el.hasAttribute('data-obs-ai')) {
      if (OD.ai) OD.ai.openFor({ kind: 'observability', page: S.page });
      else U.toast('AI is unavailable in this build', 'warning');
      return;
    }
    if (el.hasAttribute('data-obs-refresh')) { await refresh(true); return; }

    // Infrastructure
    if (el.hasAttribute('data-obs-server-add')) { openServerForm(); return; }
    if (ds.obsServerEdit) { openServerForm((S.servers || []).find((server) => server.id === ds.obsServerEdit) || null); return; }
    if (ds.obsServerTest) {
      const result = await runAction(el, 'Testing…', () => api.observability.testServer(ds.obsServerTest));
      if (result?.ok) U.toast('Server responded', 'success', { description: `${fmtNumber(result.durationMs)} ms` });
      else if (result?.ok === false) U.toast('Server did not respond', 'error', { description: result.error || 'No response.' });
      return;
    }
    if (ds.obsServerDelete) {
      const server = (S.servers || []).find((entry) => entry.id === ds.obsServerDelete);
      const confirmed = await U.confirm({ title: 'Delete server', message: `Stop monitoring ${server?.name || 'this server'} and remove its stored credentials?`, confirmLabel: 'Delete' });
      if (confirmed) await runAction(el, 'Deleting…', () => api.observability.deleteServer(ds.obsServerDelete), 'Server removed');
      return;
    }

    // Synthetic
    if (el.hasAttribute('data-obs-target-add')) { openTargetForm(); return; }
    if (ds.obsTargetEdit) { openTargetForm((S.targets || []).find((target) => target.id === ds.obsTargetEdit) || null); return; }
    if (ds.obsTargetTest) {
      const result = await runAction(el, 'Testing…', () => api.observability.testTarget(ds.obsTargetTest));
      if (result?.ok) U.toast('Target responded', 'success', { description: `${fmtNumber(result.result?.durationMs)} ms · ${result.result?.status || ''}`.trim() });
      else if (result?.ok === false) U.toast('Target failed', 'error', { description: result.error || result.result?.error || 'No response.' });
      return;
    }
    if (ds.obsTargetDelete) {
      const confirmed = await U.confirm({ title: 'Delete check', message: 'Remove this synthetic check and its stored credentials?', confirmLabel: 'Delete' });
      if (confirmed) await runAction(el, 'Deleting…', () => api.observability.deleteTarget(ds.obsTargetDelete), 'Check removed');
      return;
    }

    // Network
    if (el.hasAttribute('data-obs-netcheck-add')) {
      openForm({
        title: 'Add network check', icon: 'radar', subtitle: 'ICMP, TCP or DNS from this machine.',
        fields: [
          { name: 'name', label: 'Name', placeholder: 'Gateway' },
          { name: 'kind', label: 'Kind', type: 'select', options: ['ping', 'tcp', 'dns'] },
          { name: 'host', label: 'Host', required: true, placeholder: '1.1.1.1' },
          { name: 'port', label: 'Port (TCP)', type: 'number', min: 1, max: 65535 },
          { name: 'count', label: 'Probe count', type: 'number', min: 1, max: 10 },
          { name: 'timeoutMs', label: 'Timeout (ms)', type: 'number', min: 1000, max: 60000 },
          { name: 'enabled', label: 'Enabled', type: 'checkbox' },
        ],
        values: { kind: 'ping', count: 4, timeoutMs: 6000, enabled: true },
        submitLabel: 'Add check',
        onSubmit: async (data) => {
          const result = await api.observability.saveNetworkCheck(data);
          if (result?.ok === false) throw new Error(result.error || 'Could not save the check.');
          U.toast('Network check added', 'success');
        },
      });
      return;
    }
    if (ds.obsNetcheckDelete) {
      const confirmed = await U.confirm({ title: 'Delete check', message: 'Stop probing this host?', confirmLabel: 'Delete' });
      if (confirmed) await runAction(el, 'Deleting…', () => api.observability.deleteNetworkCheck(ds.obsNetcheckDelete), 'Check removed');
      return;
    }
    if (el.hasAttribute('data-obs-netdevice-add')) {
      openForm({
        title: 'Add SNMP device', icon: 'network', subtitle: 'Version 2c only; the community is stored in the vault.',
        fields: [
          { name: 'name', label: 'Name', placeholder: 'core-switch-1' },
          { name: 'host', label: 'Host', required: true, placeholder: '10.0.0.2' },
          { name: 'port', label: 'Port', type: 'number', min: 1, max: 65535 },
          { name: 'community', label: 'Community', type: 'password' },
          { name: 'timeoutMs', label: 'Timeout (ms)', type: 'number', min: 1000, max: 30000 },
          { name: 'enabled', label: 'Enabled', type: 'checkbox' },
        ],
        values: { port: 161, timeoutMs: 4000, enabled: true },
        submitLabel: 'Add device',
        onSubmit: async (data) => {
          const result = await api.observability.saveNetworkDevice(data);
          if (result?.ok === false) throw new Error(result.error || 'Could not save the device.');
          U.toast('SNMP device added', 'success');
        },
      });
      return;
    }
    if (ds.obsNetdeviceDelete) {
      const confirmed = await U.confirm({ title: 'Delete device', message: 'Remove this SNMP device and its community string?', confirmLabel: 'Delete' });
      if (confirmed) await runAction(el, 'Deleting…', () => api.observability.deleteNetworkDevice(ds.obsNetdeviceDelete), 'Device removed');
      return;
    }

    // Logs
    if (el.hasAttribute('data-obs-log-apply')) { await refresh(); return; }
    if (el.hasAttribute('data-obs-log-clear')) {
      const confirmed = await U.confirm({ title: 'Clear stored logs', message: 'Delete every stored log line? This cannot be undone.', confirmLabel: 'Clear logs' });
      if (confirmed) await runAction(el, 'Clearing…', async () => { const result = await api.observability.logsClear(); S.logs.stats = null; S.logs.rows = []; return result; }, 'Log store cleared');
      return;
    }
    if (el.hasAttribute('data-obs-log-export')) {
      busy(el, true, 'Preparing…');
      try {
        const result = await api.observability.logsExport({ search: S.logs.query, levels: S.logs.level ? [S.logs.level] : [], sources: S.logs.source ? [S.logs.source] : [] });
        if (result?.ok === false) { U.toast(result.error || 'Could not export logs', 'error'); return; }
        const saved = await api.observability.exportFile({ content: result.content, filename: result.filename, format: 'csv' });
        if (saved?.ok) U.toast('Logs exported', 'success', { description: saved.file });
      } finally { busy(el, false); }
      return;
    }
    if (el.hasAttribute('data-obs-log-collect')) {
      const root = el.closest('[data-obs-page]');
      const source = root?.querySelector('[data-obs-log-collect-source]')?.value || 'local';
      const target = root?.querySelector('[data-obs-log-target]')?.value.trim() || '';
      const request = { source };
      if (source === 'docker') request.containerId = target;
      if (source === 'remote') request.serverId = target;
      if (source === 'kubernetes') {
        const [namespace, pod] = target.includes('/') ? target.split('/') : ['default', target];
        request.namespace = namespace;
        request.pod = pod;
      }
      const result = await runAction(el, 'Collecting…', () => api.observability.logsCollect(request));
      if (result?.ok) {
        S.logs.collected = `${fmtNumber(result.added || 0)} lines added from ${result.source || source}.`;
        if (result.stats) S.logs.stats = result.stats;
        await refresh();
      } else if (result?.ok === false) S.logs.collected = result.error || 'Collection failed.';
      return;
    }

    // Traces
    if (ds.obsTraceOpen) {
      const result = await api.observability.traceGet(ds.obsTraceOpen);
      if (result?.ok) S.traces.trace = result;
      else U.toast(result?.error || 'Could not load the trace', 'error');
      await refresh();
      return;
    }
    if (el.hasAttribute('data-obs-trace-close')) { S.traces.trace = null; await refresh(); return; }
    if (el.hasAttribute('data-obs-trace-apply')) {
      const root = el.closest('[data-obs-page]');
      S.traces.service = root?.querySelector('[data-obs-trace-service]')?.value || '';
      S.traces.errors = root?.querySelector('[data-obs-trace-errors]')?.checked === true;
      await refresh();
      return;
    }
    if (el.hasAttribute('data-obs-traces-clear')) {
      const confirmed = await U.confirm({ title: 'Clear stored traces', message: 'Delete every stored span? This cannot be undone.', confirmLabel: 'Clear traces' });
      if (confirmed) await runAction(el, 'Clearing…', () => api.observability.tracesClear(), 'Trace store cleared');
      return;
    }

    // Alerts
    if (ds.obsAlertAck) { await runAction(el, 'Acknowledging…', () => api.observability.acknowledgeAlert(ds.obsAlertAck, 'operator'), 'Alert acknowledged'); return; }
    if (ds.obsAlertResolve) { await runAction(el, 'Resolving…', () => api.observability.resolveAlert(ds.obsAlertResolve, 'Resolved from the Observability workspace.'), 'Alert resolved'); return; }
    if (el.hasAttribute('data-obs-rule-add')) { openAlertRuleForm(); return; }
    if (ds.obsRuleEdit) { openAlertRuleForm((S.alerts.rules || []).find((rule) => rule.id === ds.obsRuleEdit) || null); return; }
    if (ds.obsRuleDelete) {
      const confirmed = await U.confirm({ title: 'Delete alert rule', message: 'Delete this rule? Existing alerts stay in history.', confirmLabel: 'Delete' });
      if (confirmed) await runAction(el, 'Deleting…', () => api.observability.deleteAlertRule(ds.obsRuleDelete), 'Rule deleted');
      return;
    }
    if (el.hasAttribute('data-obs-silence-add')) {
      openForm({
        title: 'Create silence', icon: 'bell', subtitle: 'Notifications are suppressed; alerts still evaluate and record history.',
        fields: [
          { name: 'ruleId', label: 'Rule id (blank for all rules)' },
          { name: 'reason', label: 'Reason', required: true, placeholder: 'Planned maintenance window' },
          { name: 'until', label: 'Until', type: 'datetime-local', required: true },
        ],
        values: { until: new Date(Date.now() + 3600e3).toISOString().slice(0, 16) },
        submitLabel: 'Create silence',
        onSubmit: async (data) => {
          const result = await api.observability.createSilence({ ...data, until: new Date(data.until).toISOString() });
          if (result?.ok === false) throw new Error(result.error || 'Could not create the silence.');
          U.toast('Silence created', 'success');
        },
      });
      return;
    }
    if (ds.obsSilenceDelete) { await runAction(el, 'Removing…', () => api.observability.deleteSilence(ds.obsSilenceDelete), 'Silence removed'); return; }

    // Incidents
    if (el.hasAttribute('data-obs-incident-add')) { openIncidentForm(); return; }
    if (ds.obsIncidentView) {
      const result = await api.observability.incidentGet(ds.obsIncidentView);
      if (result?.ok) S.incidents.selected = result.incident;
      else U.toast(result?.error || 'Could not load the incident', 'error');
      await refresh();
      return;
    }
    if (ds.obsIncidentUpdate) {
      const incident = (S.incidents.items || []).find((entry) => entry.id === ds.obsIncidentUpdate);
      if (incident) openIncidentUpdate(incident);
      return;
    }
    if (el.hasAttribute('data-obs-incident-close')) { S.incidents.selected = null; await refresh(); return; }

    // Dashboards
    if (el.hasAttribute('data-obs-dashboard-add')) {
      openForm({
        title: 'New dashboard', icon: 'layout-dashboard', subtitle: 'Start empty, then add widgets from the dashboard.',
        fields: [
          { name: 'name', label: 'Name', required: true, placeholder: 'Payments service' },
          { name: 'description', label: 'Description', type: 'textarea', rows: 2 },
          { name: 'icon', label: 'Icon', placeholder: 'bar-chart' },
        ],
        values: { icon: 'bar-chart' },
        submitLabel: 'Create dashboard',
        onSubmit: async (data) => {
          const result = await api.observability.dashboardSave({ ...data, widgets: [] });
          if (result?.ok === false) throw new Error(result.error || 'Could not create the dashboard.');
          S.dashboards = null;
          const created = result.dashboard?.id;
          if (created) {
            const opened = await api.observability.dashboardData({ id: created, range: S.range });
            if (opened?.ok) S.dashboard = opened;
          }
          U.toast('Dashboard created', 'success');
        },
      });
      return;
    }
    if (ds.obsDashboardOpen) {
      const data = await api.observability.dashboardData({ id: ds.obsDashboardOpen, range: S.range });
      if (data?.ok) {
        S.dashboard = data;
        if (!S.dashboards) S.dashboards = await api.observability.dashboards();
        await refresh();
      } else U.toast(data?.error || 'Could not load the dashboard', 'error');
      return;
    }
    if (ds.obsDashboardFavorite) { S.dashboards = null; await runAction(el, 'Saving…', () => api.observability.dashboardFavorite(ds.obsDashboardFavorite), 'Dashboard updated'); return; }
    if (ds.obsDashboardDuplicate) { S.dashboards = null; await runAction(el, 'Copying…', () => api.observability.dashboardDuplicate(ds.obsDashboardDuplicate), 'Dashboard duplicated'); return; }
    if (ds.obsDashboardDelete) {
      const confirmed = await U.confirm({ title: 'Delete dashboard', message: 'Delete this custom dashboard? Built-in dashboards cannot be deleted.', confirmLabel: 'Delete' });
      if (confirmed) { S.dashboards = null; S.dashboard = null; await runAction(el, 'Deleting…', () => api.observability.dashboardDelete(ds.obsDashboardDelete), 'Dashboard deleted'); }
      return;
    }
    if (el.hasAttribute('data-obs-widget-add')) { await loadMetricCatalog(); openWidgetForm(); return; }
    if (ds.obsWidgetEdit) {
      const widget = (S.dashboard?.dashboard?.widgets || []).find((entry) => entry.id === ds.obsWidgetEdit);
      await loadMetricCatalog();
      if (widget) openWidgetForm(widget);
      return;
    }
    if (ds.obsWidgetDelete) {
      const active = S.dashboard?.dashboard;
      if (!active || active.builtin) return;
      const widget = (active.widgets || []).find((entry) => entry.id === ds.obsWidgetDelete);
      const confirmed = await U.confirm({ title: 'Delete widget', message: `Remove “${widget?.title || 'this widget'}” from the dashboard?`, confirmLabel: 'Delete widget' });
      if (!confirmed) return;
      const widgets = (active.widgets || []).filter((entry) => entry.id !== ds.obsWidgetDelete);
      const result = await runAction(el, 'Deleting…', () => api.observability.dashboardSave({
        id: active.id, name: active.name, description: active.description,
        icon: active.icon, favorite: active.favorite, variables: active.variables, widgets,
      }), 'Widget removed');
      if (result?.ok !== false) S.dashboards = null;
      return;
    }

    // Metrics
    if (el.hasAttribute('data-obs-metric-query')) {
      const root = el.closest('[data-obs-page]');
      S.metrics.search = root?.querySelector('[data-obs-metric-search]')?.value || '';
      S.metrics.name = root?.querySelector('[data-obs-metric-name]')?.value || S.metrics.name;
      await refresh();
      return;
    }
    if (el.hasAttribute('data-obs-metric-export')) {
      busy(el, true, 'Preparing…');
      try {
        const result = await api.observability.metricsExport({ name: S.metrics.name, range: S.range });
        if (result?.ok === false) { U.toast(result.error || 'Could not export the metric', 'error'); return; }
        const saved = await api.observability.exportFile({ content: result.content, filename: result.filename, format: 'csv' });
        if (saved?.ok) U.toast('Metric exported', 'success', { description: saved.file });
      } finally { busy(el, false); }
      return;
    }

    // Reports
    if (el.hasAttribute('data-obs-report-generate')) {
      const root = el.closest('[data-obs-page]');
      const type = root?.querySelector('[data-obs-report-type]')?.value || 'system';
      const format = root?.querySelector('[data-obs-report-format]')?.value || 'json';
      const range = root?.querySelector('[data-obs-report-range]')?.value || '7d';
      busy(el, true, 'Generating…');
      try {
        const result = await api.observability.reportGenerate({ type, format, range });
        if (result?.ok === false) { U.toast(result.error || 'Could not generate the report', 'error'); return; }
        S.reports.result = result;
        await refresh();
        U.toast('Report generated', 'success');
      } finally { busy(el, false); }
      return;
    }
    if (el.hasAttribute('data-obs-report-export')) {
      busy(el, true, 'Saving…');
      try {
        const root = el.closest('[data-obs-page]');
        const result = await api.observability.exportReport({
          type: root?.querySelector('[data-obs-report-type]')?.value || 'system',
          format: root?.querySelector('[data-obs-report-format]')?.value || 'json',
          range: root?.querySelector('[data-obs-report-range]')?.value || '7d',
        });
        if (result?.ok) U.toast('Report saved', 'success', { description: result.file });
        else if (!result?.canceled) U.toast(result?.error || 'Could not save the report', 'error');
      } finally { busy(el, false); }
      return;
    }

    // Integrations
    if (el.hasAttribute('data-obs-integration-add')) { openIntegrationForm(); return; }
    if (ds.obsIntegrationEdit) { openIntegrationForm((S.integrations?.items || []).find((item) => item.id === ds.obsIntegrationEdit) || null); return; }
    if (ds.obsIntegrationTest) {
      const result = await runAction(el, 'Testing…', () => api.observability.testIntegration(ds.obsIntegrationTest));
      if (result?.ok) U.toast('Integration reachable', 'success', { description: result.message || '' });
      else if (result?.ok === false) U.toast('Integration test failed', 'error', { description: result.error || '' });
      return;
    }
    if (ds.obsIntegrationDiscover) {
      const result = await runAction(el, 'Discovering…', () => api.observability.discoverIntegration(ds.obsIntegrationDiscover));
      if (result?.ok) { S.integrations.discovery = result; await refresh(); U.toast('Discovery finished', 'success'); }
      else if (result?.ok === false) U.toast('Discovery failed', 'error', { description: result.error || '' });
      return;
    }
    if (ds.obsIntegrationQuery) { openIntegrationQuery((S.integrations?.items || []).find((item) => item.id === ds.obsIntegrationQuery) || null); return; }
    if (ds.obsIntegrationDelete) {
      const confirmed = await U.confirm({ title: 'Delete integration', message: 'Remove this integration and its stored credentials?', confirmLabel: 'Delete' });
      if (confirmed) await runAction(el, 'Deleting…', () => api.observability.deleteIntegration(ds.obsIntegrationDelete), 'Integration removed');
      return;
    }

    // Notifications
    if (el.hasAttribute('data-obs-channel-add')) { openChannelForm(); return; }
    if (ds.obsChannelEdit) { openChannelForm((S.channels || []).find((channel) => channel.id === ds.obsChannelEdit) || null); return; }
    if (ds.obsChannelTest) {
      const result = await runAction(el, 'Sending…', () => api.observability.testChannel(ds.obsChannelTest));
      if (result?.ok) U.toast('Test notification sent', 'success');
      else if (result?.ok === false) U.toast('Delivery failed', 'error', { description: result.error || result.result?.error || '' });
      return;
    }
    if (ds.obsChannelDelete) {
      const confirmed = await U.confirm({ title: 'Delete channel', message: 'Remove this channel and its stored secret?', confirmLabel: 'Delete' });
      if (confirmed) await runAction(el, 'Deleting…', () => api.observability.deleteChannel(ds.obsChannelDelete), 'Channel removed');
      return;
    }

    // Agents
    if (el.hasAttribute('data-obs-agent-add')) {
      openForm({
        title: 'Create agent', icon: 'bot', subtitle: 'The bearer token is generated once and only its hash is stored.',
        fields: [
          { name: 'name', label: 'Agent name', required: true, placeholder: 'db-1 collector' },
          { name: 'platform', label: 'Platform', placeholder: 'linux, windows, macos' },
        ],
        submitLabel: 'Create agent',
        onSubmit: async (data) => {
          const result = await api.observability.createAgent(data);
          if (result?.ok === false) throw new Error(result.error || 'Could not create the agent.');
          showAgentToken(result);
          S.agents = await api.observability.agents();
        },
      });
      return;
    }
    if (ds.obsAgentRevoke) {
      const confirmed = await U.confirm({ title: 'Revoke agent', message: 'The agent will no longer be able to push data.', confirmLabel: 'Revoke' });
      if (confirmed) await runAction(el, 'Revoking…', () => api.observability.revokeAgent(ds.obsAgentRevoke), 'Agent revoked');
      return;
    }
    if (ds.obsAgentRemove) {
      const confirmed = await U.confirm({ title: 'Remove agent', message: 'Remove this agent record?', confirmLabel: 'Remove' });
      if (confirmed) await runAction(el, 'Removing…', () => api.observability.removeAgent(ds.obsAgentRemove), 'Agent removed');
      return;
    }
    if (el.hasAttribute('data-obs-agents-restart')) { await runAction(el, 'Restarting…', () => api.observability.restartAgents(), 'Receiver restarted'); return; }

    // Remediation
    if (ds.obsRemediationToggle) {
      const enable = ds.obsRemediationToggle === 'on';
      const confirmed = await U.confirm({
        title: enable ? 'Enable automated remediation' : 'Disable automated remediation',
        message: enable ? 'Policies flagged automatic will run without further confirmation. Only allowlisted actions can execute.' : 'Every automated action stops immediately.',
        confirmLabel: enable ? 'Enable' : 'Disable',
      });
      if (!confirmed) return;
      await runAction(el, 'Saving…', () => api.observability.enableRemediation(enable), enable ? 'Automation enabled' : 'Automation disabled');
      return;
    }
    if (el.hasAttribute('data-obs-remediation-add')) { openRemediationForm(); return; }
    if (ds.obsRemediationEdit) { openRemediationForm((S.remediation?.policies || []).find((policy) => policy.id === ds.obsRemediationEdit) || null); return; }
    if (ds.obsRemediationDelete) {
      const confirmed = await U.confirm({ title: 'Delete policy', message: 'Delete this remediation policy? The audit trail is kept.', confirmLabel: 'Delete' });
      if (confirmed) await runAction(el, 'Deleting…', () => api.observability.deleteRemediationPolicy(ds.obsRemediationDelete), 'Policy deleted');
      return;
    }
    if (ds.obsRemediationRun) {
      const policy = (S.remediation?.policies || []).find((entry) => entry.id === ds.obsRemediationRun);
      const confirmed = await U.confirm({
        title: 'Run remediation policy',
        message: `Execute “${policy?.name || 'this policy'}” now? The action is recorded in the audit trail.`,
        detail: JSON.stringify(policy?.target || {}, null, 2),
        confirmLabel: 'Run now',
      });
      if (!confirmed) return;
      const result = await runAction(el, 'Running…', () => api.observability.executeRemediation(ds.obsRemediationRun, { approved: true, actor: 'operator' }));
      if (result?.ok) U.toast('Remediation finished', 'success', { description: result.execution?.message || '' });
      else if (result?.ok === false) U.toast('Remediation failed', 'error', { description: result.error || '' });
      return;
    }

    // Settings
    if (el.hasAttribute('data-obs-settings-save')) {
      const root = el.closest('[data-obs-page]');
      const patch = {};
      const setPath = (target, path, value) => {
        const keys = path.split('.');
        let cursor = target;
        for (const key of keys.slice(0, -1)) { cursor[key] = cursor[key] && typeof cursor[key] === 'object' ? cursor[key] : {}; cursor = cursor[key]; }
        cursor[keys[keys.length - 1]] = value;
      };
      for (const input of root?.querySelectorAll('[data-obs-setting]') || []) {
        const key = input.dataset.obsSetting;
        const value = input.type === 'checkbox' ? input.checked : input.type === 'number' ? Number(input.value) : input.value;
        setPath(patch, key, value);
      }
      patch.collectors = {};
      for (const input of root?.querySelectorAll('[data-obs-collector]') || []) patch.collectors[input.dataset.obsCollector] = input.checked;
      if (patch.overview?.widgets !== undefined) patch.overview.widgets = textToList(patch.overview.widgets);
      await runAction(el, 'Saving…', () => api.observability.updateSettings(patch), 'Settings saved');
      return;
    }
    if (el.hasAttribute('data-obs-export-config')) {
      busy(el, true, 'Exporting…');
      try {
        const result = await api.observability.exportConfig();
        if (result?.ok === false) { U.toast(result.error || 'Could not export configuration', 'error'); return; }
        const saved = await api.observability.exportFile({ content: result.content, filename: result.filename, format: 'json' });
        if (saved?.ok) U.toast('Configuration exported', 'success', { description: saved.file });
      } finally { busy(el, false); }
      return;
    }
  }

  function onChange(event) {
    const el = event.target;
    if (el.matches('[data-obs-range]')) {
      S.range = el.value;
      S.fresh = null;
      OD.app?.rerender?.();
      return;
    }
    if (el.matches('[data-obs-log-level]')) { S.logs.level = el.value; refresh(); return; }
    if (el.matches('[data-obs-log-source]')) { S.logs.source = el.value; refresh(); return; }
    if (el.matches('[data-obs-trace-service]')) { S.traces.service = el.value; refresh(); return; }
    if (el.matches('[data-obs-trace-errors]')) { S.traces.errors = el.checked; refresh(); return; }
    if (el.matches('[data-obs-metric-name]')) { S.metrics.name = el.value; refresh(); return; }
  }

  function onInput(event) {
    const el = event.target;
    if (el.matches('[data-obs-log-search]')) S.logs.query = el.value;
    else if (el.matches('[data-obs-metric-search]')) S.metrics.search = el.value;
  }

  // ------------------------------------------------------------------- export

  OD.views = OD.views || {};
  OD.views.observability = {
    render,
    mount,
    dispose,
    pages: PAGES,
    label(section) {
      return PAGES[section] || titleCase(section || 'overview');
    },
  };

})();
