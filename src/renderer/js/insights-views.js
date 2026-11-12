'use strict';

/**
 * Module intelligence views.
 *
 * One shared renderer for the "Intelligence" section of the Docker,
 * Databases, Kubernetes and Observability workspaces. Every number, finding
 * and limitation comes from the main-process analysers in
 * `src/main/intelligence/insights.js`; this module only presents them.
 *
 * The pages are read-only. The single mutating interaction is editing service
 * objectives on the observability page, which writes the shared intelligence
 * settings through the existing audited `updateSettings` bridge method.
 */
(function () {
  const api = window.opsdeck;
  const { esc, fmtNumber, fmtBytes, fmtPercent, timeAgo, fmtDateTime, titleCase } = OD.utils;
  const { icon } = OD.icons;
  const U = OD.ui;

  const PAGES = {
    databases: 'Database intelligence',
    docker: 'Docker intelligence',
    kubernetes: 'Kubernetes intelligence',
    observability: 'Observability intelligence',
  };

  const WORKSPACE = {
    databases: { label: 'Databases', icon: 'database', href: '#/databases/dashboard' },
    docker: { label: 'Docker', icon: 'box', href: '#/overview' },
    kubernetes: { label: 'Kubernetes', icon: 'cloud', href: '#/kubernetes/overview' },
    observability: { label: 'Observability', icon: 'activity', href: '#/observability/overview' },
  };

  const SEVERITY_TONE = { critical: 'red', warning: 'orange', info: 'cyan', pass: 'green', unknown: 'slate' };
  const STATUS_TONE = { healthy: 'green', degraded: 'orange', unhealthy: 'red', unknown: 'slate' };
  const GRADE_TONE = { A: 'green', B: 'cyan', C: 'orange', D: 'orange', F: 'red' };

  const S = {
    module: '',
    controller: null,
    timer: null,
    at: {},
    data: {},
    loading: {},
    error: {},
    settings: null,
    settingsError: '',
    dbConnection: '',
    k8sScope: 'all',
    multiCluster: null,
    multiClusterLoading: false,
    multiClusterError: '',
    sloForm: { name: '', metric: 'synthetic.up', comparison: 'gte', threshold: '1', target: '99.9', windowHours: '24', aggregation: 'avg' },
  };

  const BTN = (label, iconName, attrs = '', variant = 'secondary', size = 'sm') =>
    `<button type="button" class="btn btn-${variant} btn-${size}" ${attrs}>${iconName ? icon(iconName, 14) : ''}<span>${esc(label)}</span></button>`;
  const LINK = (label, iconName, href, variant = 'secondary') =>
    `<a class="btn btn-${variant} btn-sm" href="${href}">${iconName ? icon(iconName, 14) : ''}<span>${esc(label)}</span></a>`;

  function badge(text, tone = 'slate') {
    return `<span class="badge tone-${esc(tone)}">${esc(text)}</span>`;
  }

  function severityBadge(severity) {
    return badge(titleCase(severity || 'info'), SEVERITY_TONE[severity] || 'slate');
  }

  function statusBadge(status) {
    return `<span class="state-badge tone-${STATUS_TONE[status] || 'slate'}"><i class="state-dot"></i>${esc(titleCase(status || 'unknown'))}</span>`;
  }

  function table(headers, rows, opts = {}) {
    if (!rows || !rows.length) {
      return U.empty({
        compact: true,
        icon: opts.icon || 'inbox',
        title: opts.emptyTitle || 'Nothing to show',
        body: opts.emptyBody || '',
      });
    }
    const body = Array.isArray(rows) ? rows.join('') : String(rows);
    return `<div class="table-wrap"><table class="data-table intel-table">
      <thead><tr>${headers.map((header) => `<th>${esc(header)}</th>`).join('')}</tr></thead>
      <tbody>${body}</tbody>
    </table></div>`;
  }

  function cell(value, extra = '') {
    return `<td class="${extra}">${value == null || value === '' ? '<span class="intel-muted">—</span>' : value}</td>`;
  }

  function textCell(value, extra = '') {
    return cell(esc(value == null ? '' : String(value)), extra);
  }

  function findingsList(findings, opts = {}) {
    const list = Array.isArray(findings) ? findings.slice(0, opts.limit || 60) : [];
    if (!list.length) {
      return U.empty({
        compact: true,
        icon: opts.icon || 'circle-check',
        title: opts.emptyTitle || 'No findings',
        body: opts.emptyBody || 'Nothing in the collected data crossed a rule.',
      });
    }
    return `<div class="intel-list">${list.map((entry) => `<div class="intel-list-row">
      ${severityBadge(entry.severity)}
      <div class="intel-list-main">
        <strong>${esc(entry.title)}</strong>
        <span>${esc(entry.detail || '')}${entry.evidence ? ` · ${esc(entry.evidence)}` : ''}</span>
        ${entry.resource ? `<span class="intel-muted">${esc(entry.resource)}</span>` : ''}
      </div>
      ${entry.href ? `<a class="btn btn-ghost btn-xs" href="${esc(entry.href)}" title="Open the module page">${icon('arrow-right', 13)}<span>Open</span></a>` : ''}
    </div>`).join('')}</div>`;
  }

  function limitationsList(items, title = 'Limitations') {
    const list = (Array.isArray(items) ? items : []).filter(Boolean);
    if (!list.length) return '';
    return U.card({
      title,
      icon: 'info',
      sub: 'Values that were not measured are reported as unknown, never as healthy',
      body: `<ul class="insight-limits">${list.slice(0, 16).map((item) => `<li>${esc(item)}</li>`).join('')}</ul>`,
    });
  }

  function countChips(counts) {
    const order = ['critical', 'warning', 'info', 'pass', 'unknown'];
    return `<div class="intel-counts">${order.filter((key) => counts && counts[key]).map((key) => `<span class="intel-count-chip">${severityBadge(key)}<strong>${fmtNumber(counts[key])}</strong></span>`).join('') || '<span class="intel-muted">No findings</span>'}</div>`;
  }

  function hero(score, status, sub) {
    return U.card({
      title: 'Health score',
      icon: 'activity',
      sub,
      body: `<div class="insight-hero">
        <div class="insight-score tone-${STATUS_TONE[status] || 'slate'}">
          <strong>${score == null ? '—' : fmtNumber(score)}</strong>
          <span>${esc(titleCase(status || 'unknown'))}</span>
        </div>
        <div class="insight-hero-body">${U.progressBar(score == null ? 0 : score, STATUS_TONE[status] === 'green' ? 'green' : STATUS_TONE[status] === 'red' ? 'red' : 'orange')}
          <p class="intel-muted">Weighted from measured checks only. Checks that could not be read are excluded instead of counted as passes.</p>
        </div>
      </div>`,
    });
  }

  // ------------------------------------------------------------------ shell

  function pageHead(module, sub, actions = '') {
    const meta = WORKSPACE[module];
    return `<div class="page-head intel-page-head">
      <div class="page-head-left">
        <div class="eyebrow">${icon(meta.icon, 12)}${esc(meta.label)}</div>
        <h1 class="page-title">${esc(PAGES[module])}</h1>
        <p class="page-sub">${esc(sub)}</p>
      </div>
      <div class="intel-head-actions">${actions}${BTN('Refresh', 'refresh', 'data-insight-refresh', 'primary')}</div>
    </div>`;
  }

  function shell(module, body, sub) {
    const error = S.error[module];
    const data = S.data[module];
    const meta = WORKSPACE[module];
    const actions = `<a class="btn btn-secondary btn-sm" href="#/intelligence/overview">${icon('git-branch', 14)}<span>Cross-module view</span></a>`;
    const unavailable = !data && error && !S.loading[module]
      ? U.empty({
        icon: 'plug',
        title: 'Analysis unavailable',
        body: `${error} Check that the module is reachable, then refresh.`,
        action: `<a class="btn btn-primary btn-sm" href="${meta.href}">${icon(meta.icon, 14)}<span>Open ${esc(meta.label)}</span></a>`,
      })
      : '';
    return `<div class="page intel-page" data-insight-module="${esc(module)}">
      ${pageHead(module, sub, actions)}
      ${error ? U.errorBanner('The analysis failed', error) : ''}
      ${unavailable}
      ${!data && !error && S.loading[module] ? U.skeleton({ lines: 8 }) : body}
      ${data?.generatedAt ? `<p class="intel-page-foot">Analysed ${esc(timeAgo(data.generatedAt))} · read-only snapshot</p>` : ''}
    </div>`;
  }

  // ------------------------------------------------------------------- load

  async function bootSettings(force = false) {
    if (S.settings && !force) return;
    S.settingsError = '';
    try {
      const result = await api.intelligence.bootstrap();
      if (!result || result.ok === false) throw new Error(result?.error || 'The intelligence store did not respond.');
      S.settings = result.settings || {};
    } catch (error) {
      S.settingsError = error.message || String(error);
      S.settings = S.settings || { slos: [] };
    }
  }

  async function load(module, { force = false } = {}) {
    if (S.loading[module]) return;
    if (!force && S.data[module] && Date.now() - (S.at[module] || 0) < 20000) return;
    S.loading[module] = true;
    S.error[module] = '';
    try {
      let result;
      if (module === 'databases') {
        result = await api.intelligence.databaseInsights(S.dbConnection ? { connectionId: S.dbConnection } : {});
      } else if (module === 'docker') {
        result = await api.intelligence.dockerInsights();
      } else if (module === 'kubernetes') {
        result = await api.intelligence.kubernetesInsights({ allNamespaces: S.k8sScope !== 'current' });
      } else if (module === 'observability') {
        await bootSettings();
        result = await api.intelligence.observabilityInsights();
      } else {
        throw new Error('Unknown intelligence module.');
      }
      if (!result || result.ok === false) throw new Error(result?.error || 'The analyser returned no result.');
      S.data[module] = result;
      S.at[module] = Date.now();
      if (module === 'databases' && result.connection?.id) S.dbConnection = result.connection.id;
    } catch (error) {
      S.error[module] = error.message || String(error);
      if (!S.data[module]) S.data[module] = null;
    } finally {
      S.loading[module] = false;
    }
  }

  // -------------------------------------------------------------- databases

  function databaseBody(data) {
    if (!data.available) {
      return `${U.empty({ icon: 'database', title: 'No database to analyse', body: (data.limitations || [])[0] || 'Add a connection in the Databases workspace first.', action: LINK('Open connections', 'plug', '#/databases/connections', 'primary') })}`;
    }
    const health = data.health || {};
    const schema = data.schema || {};
    const dependencies = schema.dependencies || {};
    const workloads = data.workloads || {};
    const history = data.history || {};
    const forecast = data.forecast || {};

    const connectionOptions = (data.connections || []).map((entry) => `<option value="${esc(entry.id)}" ${entry.id === data.connection?.id ? 'selected' : ''}>${esc(entry.name)} · ${esc(entry.engine)}${entry.status === 'connected' ? ' · connected' : ''}</option>`).join('');

    const checkRows = (health.checks || []).map((entry) => `<tr>
      <td>${esc(entry.label)}</td>
      <td>${entry.status === 'pass' ? badge('Pass', 'green') : entry.status === 'warn' ? badge('Warning', 'orange') : entry.status === 'fail' ? badge('Fail', 'red') : badge('Unknown', 'slate')}</td>
      <td>${textCell(entry.value == null ? '' : String(entry.value), 'intel-nowrap')}</td>
      <td class="intel-wrap">${esc(entry.detail || '')}</td>
    </tr>`).join('');

    const schemaRows = (schema.tableStats || []).map((entry) => `<tr>
      <td><strong>${esc(entry.name)}</strong>${entry.schema ? `<span class="intel-muted"> · ${esc(entry.schema)}</span>` : ''}</td>
      <td>${textCell(entry.kind)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.rows)}</td>
      <td class="intel-nowrap">${fmtBytes(entry.sizeBytes)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.columns)} / ${fmtNumber(entry.indexes)}</td>
      <td>${entry.primary ? badge('Primary key', 'green') : badge('No primary key', 'orange')}</td>
    </tr>`).join('');

    const workloadRows = (workloads.rows || []).map((entry) => `<tr>
      <td class="mono">${textCell(entry.id)}</td>
      <td>${textCell(entry.user)}</td>
      <td>${textCell(entry.state)}</td>
      <td class="intel-nowrap">${entry.seconds == null ? '—' : `${fmtNumber(Math.round(entry.seconds))}s`}</td>
      <td>${textCell(entry.wait)}</td>
      <td>${entry.blockedBy ? badge(`${entry.blockedBy} blocking`, 'red') : badge('Not blocked', 'green')}</td>
      <td class="mono intel-wrap">${esc(entry.query || '')}</td>
    </tr>`).join('');

    const slowRows = (workloads.slow || []).map((entry) => `<tr>
      <td class="mono intel-wrap">${esc(entry.query || '')}</td>
      <td class="intel-nowrap">${entry.calls == null ? '—' : fmtNumber(entry.calls)}</td>
      <td class="intel-nowrap">${entry.meanMs == null ? '—' : `${fmtNumber(entry.meanMs)} ms`}</td>
      <td class="intel-nowrap">${entry.rows == null ? '—' : fmtNumber(entry.rows)}</td>
    </tr>`).join('');

    const statementRows = (history.statements || []).map((entry) => `<tr>
      <td class="mono intel-wrap">${esc(entry.sample || '')}</td>
      <td class="intel-nowrap">${fmtNumber(entry.runs)}</td>
      <td class="intel-nowrap">${entry.errorRate ? badge(fmtPercent(entry.errorRate, 1), entry.errorRate >= 20 ? 'orange' : 'slate') : '—'}</td>
      <td class="intel-nowrap">${entry.avgMs == null ? '—' : `${fmtNumber(entry.avgMs)} ms`}</td>
      <td class="intel-nowrap">${entry.p95Ms == null ? '—' : `${fmtNumber(entry.p95Ms)} ms`}</td>
      <td>${entry.regression ? badge(`Slower +${fmtPercent(entry.regression.changePct, 0)}`, 'orange') : badge('Stable', 'green')}</td>
    </tr>`).join('');

    const latestRows = (history.latest || []).slice(0, 15).map((entry) => `<tr>
      <td class="intel-nowrap">${esc(timeAgo(entry.at))}</td>
      <td>${entry.ok ? badge('OK', 'green') : badge('Failed', 'red')}</td>
      <td class="intel-nowrap">${entry.durationMs == null ? '—' : `${fmtNumber(entry.durationMs)} ms`}</td>
      <td class="mono intel-wrap">${esc(entry.sql || '')}${entry.error ? `<span class="intel-warn"> · ${esc(entry.error)}</span>` : ''}</td>
    </tr>`).join('');

    const forecastRows = (forecast.series || []).map((entry) => `<tr>
      <td>${esc(entry.label)}</td>
      <td class="intel-nowrap">${entry.current == null ? '—' : fmtNumber(entry.current)}</td>
      <td class="intel-nowrap">${entry.threshold == null ? '—' : fmtNumber(entry.threshold)}</td>
      <td class="intel-nowrap">${entry.breachAt ? esc(fmtDateTime(entry.breachAt)) : entry.breached ? badge('Already crossed', 'orange') : '—'}</td>
      <td class="intel-nowrap">${entry.forecast?.confidence == null ? '—' : fmtPercent(entry.forecast.confidence * 100, 0)}</td>
      <td class="intel-wrap">${esc(entry.note || '')}</td>
    </tr>`).join('');

    const dependencyRows = (dependencies.edges || []).map((edge) => `<tr>
      <td><strong>${esc(edge.fromLabel)}</strong></td>
      <td class="mono">${esc((edge.columns || []).join(', ') || '—')}</td>
      <td>${esc(edge.toLabel)}${edge.toKnown ? '' : badge('external', 'slate')}</td>
      <td class="mono intel-wrap">${esc(edge.constraint || '—')}</td>
    </tr>`).join('');

    const referencedRows = (dependencies.mostReferenced || []).map((entry) => `<tr>
      <td><strong>${esc(entry.label)}</strong></td>
      <td class="intel-nowrap">${fmtNumber(entry.incoming)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.outgoing)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.rows)}</td>
    </tr>`).join('');

    const isolatedRows = (dependencies.isolated || []).map((entry) => `<tr>
      <td><strong>${esc(entry.label)}</strong></td>
      <td class="intel-nowrap">${fmtNumber(entry.rows)}</td>
      <td class="intel-nowrap">${fmtBytes(entry.sizeBytes)}</td>
    </tr>`).join('');

    const dependencyBody = dependencies.supported
      ? `${(dependencies.cycles || []).length ? `<div class="insight-subhead">Circular relationships</div><ul class="insight-limits">${dependencies.cycles.map((cycle) => `<li>${esc(cycle.nodes.join(' → '))}</li>`).join('')}</ul>` : ''}
        ${table(['Child table', 'Columns', 'Parent table', 'Constraint'], dependencyRows, {
          emptyTitle: 'No foreign keys',
          emptyBody: 'The engine reported no foreign-key constraint, so no dependency is claimed.',
          icon: 'git-branch',
        })}
        <div class="intel-grid">
          <div><div class="insight-subhead">Most referenced tables</div>${table(['Table', 'Referenced by', 'References', 'Rows'], referencedRows, { emptyTitle: 'No referenced table', icon: 'arrow-right' })}</div>
          <div><div class="insight-subhead">Tables with no declared relationship</div>${table(['Table', 'Rows', 'Size'], isolatedRows, { emptyTitle: 'Every table is related', emptyBody: 'Every reported table participates in a foreign key.', icon: 'database' })}</div>
        </div>`
      : U.empty({
        compact: true,
        icon: 'git-branch',
        title: 'Dependencies were not reported',
        body: dependencies.supported === false ? 'This engine or schema did not report foreign-key constraints.' : (schema.limitations || [])[0] || 'Open the schema analysis first.',
      });

    return `
      ${U.card({
        title: 'Connection',
        icon: 'plug',
        sub: 'Analysers only read this connection; no write query is issued',
        actions: `<select class="input input-sm" data-insight-field="db-connection" aria-label="Database connection">${connectionOptions || '<option value="">No connection</option>'}</select>`,
        body: `${U.kvRows([
          ['Engine', esc(data.connection?.engine || '—'), true],
          ['Database', esc(data.connection?.database || '—'), true],
          ['Host', esc(data.connection?.host || 'local'), true],
          ['State', statusBadge(data.connection?.status)],
          ['Read-only', data.connection?.readOnly ? badge('Enforced', 'green') : badge('Not enforced', 'slate')],
          ['Databases visible', fmtNumber((data.databases || []).length)],
        ])}`,
      })}
      <div class="intel-stat-grid">
        ${U.statCard({ label: 'Tables', icon: 'table', tone: 'cyan', value: fmtNumber(schema.stats?.tables ?? 0), sub: `${fmtNumber(schema.stats?.indexes ?? 0)} indexes` })}
        ${U.statCard({ label: 'Rows (estimated)', icon: 'layers', tone: 'violet', value: fmtNumber(schema.stats?.approxRows ?? 0), sub: fmtBytes(schema.stats?.sizeBytes ?? 0) })}
        ${U.statCard({ label: 'Blocked / long', icon: 'clock', tone: (data.findings || []).some((entry) => entry.severity === 'critical') ? 'red' : 'green', value: fmtNumber((workloads.rows || []).filter((row) => row.blockedBy).length), sub: `${fmtNumber((workloads.rows || []).length)} active sessions` })}
        ${U.statCard({ label: 'Queries tracked', icon: 'scroll-text', tone: 'orange', value: fmtNumber(history.totals?.statements ?? 0), sub: `${fmtNumber(history.totals?.failures ?? 0)} failed runs` })}
      </div>
      ${U.card({ title: 'Findings', icon: 'alert-triangle', sub: 'Health, schema, workload and history rules', actions: countChips(data.counts), body: findingsList(data.findings, { emptyTitle: 'No database findings', emptyBody: 'Measured checks are within their thresholds.' }) })}
      <div class="intel-grid">
        ${hero(health.score, health.status, 'Weighted health checks for this connection')}
        ${U.card({ title: 'Health checks', icon: 'stethoscope', sub: 'Measured values and their outcome', body: table(['Check', 'Outcome', 'Value', 'Detail'], checkRows, { emptyTitle: 'No checks ran', emptyBody: 'The connection did not report any measurable check.', icon: 'stethoscope' }) })}
      </div>
      ${U.card({
        title: 'Schema analysis',
        icon: 'folder-tree',
        sub: schema.supported ? `${fmtNumber(schema.tables)} tables · ${fmtNumber(schema.indexes)} indexes · ${fmtNumber(schema.stats?.foreignKeys ?? 0)} foreign keys` : 'Not available for this engine',
        body: schema.supported
          ? `${table(['Table', 'Kind', 'Rows', 'Size', 'Columns / indexes', 'Key'], schemaRows, { emptyTitle: 'No tables reported' })}${schema.findings?.length ? `<div class="insight-subhead">Schema findings</div>${findingsList(schema.findings, { limit: 20 })}` : ''}`
          : U.empty({ compact: true, icon: 'folder-tree', title: 'Schema was not analysed', body: (schema.limitations || [])[0] || 'The explorer did not return relational tables.' }),
      })}
      ${U.card({
        title: 'Table dependencies',
        icon: 'git-branch',
        sub: dependencies.supported
          ? `${fmtNumber(dependencies.stats?.edges ?? 0)} declared foreign key(s) across ${fmtNumber(dependencies.stats?.tables ?? 0)} table(s)${dependencies.stats?.external ? ` · ${fmtNumber(dependencies.stats.external)} referenced table(s) outside this schema` : ''}`
          : 'Built only from declared constraints, never from table names',
        body: dependencyBody,
      })}
      ${U.card({ title: 'Workloads', icon: 'activity', sub: 'Active sessions, blocking chains and slow statements', body: `${table(['Session', 'User', 'State', 'Age', 'Wait', 'Blocked', 'Statement'], workloadRows, { emptyTitle: 'No active workloads', emptyBody: workloads.available ? 'Nothing is running right now.' : (workloads.limitations || [])[0] || 'This engine does not expose session data.', icon: 'activity' })}${slowRows ? `<div class="insight-subhead">Slow statements from the engine</div>${table(['Statement', 'Calls', 'Mean', 'Rows'], slowRows)}` : ''}` })}
      ${U.card({ title: 'Query time machine', icon: 'history', sub: 'History is grouped by normalised statement so literal values do not split it', body: `${table(['Statement', 'Runs', 'Errors', 'Mean', 'p95', 'Trend'], statementRows, { emptyTitle: 'No query history yet', emptyBody: 'Run a query in the SQL editor; history is recorded by the database service.', icon: 'history' })}${latestRows ? `<div class="insight-subhead">Latest runs</div>${table(['When', 'Result', 'Duration', 'Statement'], latestRows)}` : ''}` })}
      ${U.card({ title: 'Forecast', icon: 'trending-up', sub: 'Statistics over retained observability samples; no projection is invented', body: forecast.supported ? table(['Series', 'Current', 'Threshold', 'Projected crossing', 'Confidence', 'Note'], forecastRows) : U.empty({ compact: true, icon: 'trending-up', title: 'Not enough history to forecast', body: (forecast.limitations || [])[0] || 'Retain at least six samples for this connection.' }) })}
      ${limitationsList(data.limitations)}
      ${U.infoBanner('Read-only analysis', 'No SQL is executed by this page beyond the read-only metadata queries the database service already runs.', 'info')}`;
  }

  // ----------------------------------------------------------------- docker

  function dockerBody(data) {
    const security = data.security || {};
    const images = data.images || {};
    const resources = data.resources || {};
    const compose = data.compose || {};
    const optimizer = data.optimizer || {};
    const envCompare = data.envCompare || {};

    const securityRows = (security.containers || []).map((entry) => `<tr>
      <td><strong>${esc(entry.name)}</strong><span class="intel-muted"> · ${esc(entry.image || '')}</span></td>
      <td>${entry.grade ? badge(entry.grade, GRADE_TONE[entry.grade] || 'slate') : '—'}</td>
      <td class="intel-nowrap">${fmtNumber(entry.score)}</td>
      <td>${entry.project ? esc(entry.project) : '<span class="intel-muted">—</span>'}</td>
      <td>${entry.issues.length ? entry.issues.map((issue) => badge(issue.title, issue.severity === 'critical' ? 'red' : issue.severity === 'warning' ? 'orange' : 'cyan')).join(' ') : badge('No issues', 'green')}</td>
    </tr>`).join('');

    const imageRows = (images.rows || []).map((entry) => `<tr>
      <td class="mono intel-wrap">${esc(entry.name)}</td>
      <td class="intel-nowrap">${esc(entry.size || '—')}</td>
      <td>${entry.dangling ? badge('Dangling', 'orange') : badge('Tagged', 'green')}</td>
    </tr>`).join('');

    const volumeRows = (resources.volumes?.rows || []).map((entry) => `<tr>
      <td class="mono">${esc(entry.name)}</td>
      <td>${textCell(entry.driver)}</td>
      <td class="mono intel-wrap">${esc(entry.mountpoint || '')}</td>
      <td class="intel-nowrap">${esc(entry.size || '—')}</td>
    </tr>`).join('');

    const networkRows = (resources.networks?.rows || []).map((entry) => `<tr>
      <td class="mono">${esc(entry.name)}</td>
      <td>${textCell(entry.driver)}</td>
      <td>${textCell(entry.scope)}</td>
      <td class="mono">${textCell(entry.subnet)}</td>
    </tr>`).join('');

    const composeRows = (compose.projects || []).map((entry) => `<tr>
      <td><strong>${esc(entry.name)}</strong></td>
      <td>${entry.running == null ? '—' : `${fmtNumber(entry.running)} / ${fmtNumber(entry.containers)}`}</td>
      <td class="mono intel-wrap">${esc(entry.configFiles || '')}</td>
    </tr>`).join('');

    const envProjects = (envCompare.projects || []).map((project) => `<details class="insight-details" ${project.differences.length ? 'open' : ''}>
      <summary>${esc(project.name)} <span class="intel-muted">${fmtNumber(project.containers.length)} container(s), ${fmtNumber(project.differences.length)} difference(s)</span></summary>
      <div class="insight-details-body">
        ${table(['Service', 'Image', 'Env keys', 'Memory limit', 'Restart policy'], project.containers.map((entry) => `<tr>
          <td>${esc(entry.service)}</td>
          <td class="mono">${esc(entry.image || '')}</td>
          <td class="intel-nowrap">${fmtNumber(entry.envCount)}</td>
          <td class="intel-nowrap">${entry.memoryLimit ? fmtBytes(entry.memoryLimit) : '—'}</td>
          <td>${textCell(entry.restartPolicy)}</td>
        </tr>`))}
        ${project.differences.length ? table(['Variable', 'Values'], project.differences.map((entry) => `<tr>
          <td class="mono">${esc(entry.key)}</td>
          <td class="intel-wrap">${entry.values.map((value) => `<span class="insight-diff-value"><strong>${esc(value.name)}</strong> ${value.value === undefined ? '<em class="intel-muted">not set</em>' : esc(value.value)}</span>`).join('')}${entry.missingFrom.length ? `<div class="intel-muted">Missing from ${esc(entry.missingFrom.join(', '))}</div>` : ''}</td>
        </tr>`)) : ''}
      </div>
    </details>`).join('');

    const idleRows = (optimizer.idle || []).map((entry) => `<tr>
      <td>${esc(entry.name)}</td>
      <td class="intel-nowrap">${entry.cpu == null ? '—' : fmtPercent(entry.cpu, 1)}</td>
      <td class="intel-nowrap">${entry.memory == null ? '—' : fmtPercent(entry.memory, 1)}</td>
    </tr>`).join('');

    return `
      ${data.overview?.ok === false ? U.errorBanner('Docker overview is unavailable', data.overview.error || 'The engine did not answer.') : ''}
      <div class="intel-stat-grid">
        ${U.statCard({ label: 'Containers', icon: 'box', tone: 'cyan', value: fmtNumber(data.overview?.containers ?? 0), sub: `${fmtNumber(data.overview?.running ?? 0)} running` })}
        ${U.statCard({ label: 'Images', icon: 'layers', tone: 'violet', value: fmtNumber(images.total ?? 0), sub: `${fmtNumber(images.dangling ?? 0)} dangling · ${fmtBytes(images.totalSize ?? 0)}` })}
        ${U.statCard({ label: 'Security findings', icon: 'shield', tone: (security.stats?.critical ?? 0) ? 'red' : 'green', value: fmtNumber(security.stats?.critical ?? 0), sub: `${fmtNumber(security.stats?.warning ?? 0)} warning · average ${security.stats?.averageScore == null ? '—' : fmtNumber(security.stats.averageScore)}` })}
        ${U.statCard({ label: 'Storage & networks', icon: 'database', tone: 'orange', value: fmtNumber(resources.volumes?.total ?? 0), sub: `${fmtNumber(resources.volumes?.unused ?? 0)} unused volume · ${fmtNumber(resources.networks?.unused ?? 0)} unused network` })}
        ${U.statCard({ label: 'Compose projects', icon: 'boxes', tone: 'cyan', value: fmtNumber(compose.total ?? 0), sub: `${fmtNumber((compose.projects || []).filter((entry) => entry.containers != null && entry.running !== entry.containers).length)} partially down` })}
      </div>
      ${U.card({ title: 'Findings', icon: 'alert-triangle', sub: 'Security, image, resource, Compose and optimizer rules', actions: countChips(data.counts), body: findingsList(data.findings, { emptyTitle: 'No Docker findings', emptyBody: 'No rule was triggered by the inspected resources.' }) })}
      ${U.card({ title: 'Container security', icon: 'shield', sub: `${fmtNumber(security.stats?.inspected ?? 0)} running container(s) inspected; privileged, host namespace, socket mounts, capabilities and root user`, body: table(['Container', 'Grade', 'Score', 'Project', 'Issues'], securityRows, { emptyTitle: 'No containers inspected', emptyBody: 'Start a container, then refresh.', icon: 'shield' }) })}
      <div class="intel-grid">
        ${U.card({ title: 'Image hygiene', icon: 'layers', sub: 'Dangling layers, mutable tags and images no container references', actions: LINK('Open images', 'arrow-right', '#/images', 'ghost'), body: table(['Image', 'Size', 'State'], imageRows, { emptyTitle: 'No images', emptyBody: 'Nothing was returned by the image list.', icon: 'layers' }) })}
        ${U.card({ title: 'Compose projects', icon: 'boxes', sub: 'Containers that belong to the same project', actions: LINK('Open Compose', 'arrow-right', '#/compose', 'ghost'), body: table(['Project', 'Running', 'Config files'], composeRows, { emptyTitle: 'No Compose projects', emptyBody: 'No container carries Compose labels.', icon: 'boxes' }) })}
      </div>
      ${U.card({ title: 'Resource hygiene', icon: 'database', sub: 'Volumes and networks not currently referenced by a container', body: `<div class="intel-grid"><div>${table(['Volume', 'Driver', 'Mountpoint', 'Size'], volumeRows, { emptyTitle: 'No volumes', icon: 'database' })}</div><div>${table(['Network', 'Driver', 'Scope', 'Subnet'], networkRows, { emptyTitle: 'No networks', icon: 'network' })}</div></div>` })}
      <div class="intel-grid">
        ${U.card({ title: 'Optimizer', icon: 'zap', sub: 'Missing limits, restart policies and restart loops', body: `${U.kvRows([
          ['Containers', fmtNumber(optimizer.stats?.containers ?? 0)],
          ['Inspected', fmtNumber(optimizer.stats?.inspected ?? 0)],
          ['Without memory limit', fmtNumber(optimizer.stats?.memoryWithoutLimit ?? 0)],
          ['Without CPU limit', fmtNumber(optimizer.stats?.cpuWithoutLimit ?? 0)],
          ['Restarting', fmtNumber(optimizer.stats?.restarting ?? 0)],
        ])}${idleRows ? `<div class="insight-subhead">Nearly idle containers</div>${table(['Container', 'CPU', 'Memory'], idleRows)}` : ''}` })}
        ${U.card({ title: 'Environment comparison', icon: 'git-branch', sub: 'Environment variables compared inside the same Compose project; secret values stay masked', body: envProjects || U.empty({ compact: true, icon: 'git-branch', title: 'No comparable project', body: (envCompare.limitations || [])[0] || 'Run at least two containers from one Compose project.' }) })}
      </div>
      ${limitationsList(data.limitations)}`;
  }

  // ------------------------------------------------------------- kubernetes

  function multiClusterBody() {
    if (S.multiClusterLoading) return U.loader('Reading every configured context…');
    if (S.multiClusterError) return U.errorBanner('The multi-cluster comparison failed', S.multiClusterError);
    const data = S.multiCluster;
    if (!data) {
      return U.empty({
        compact: true,
        icon: 'cloud',
        title: 'Compare contexts on demand',
        body: 'Each context is read separately with read-only kubectl calls. Unreachable contexts are reported instead of being hidden or counted as healthy.',
        action: BTN('Compare contexts', 'layers', 'data-insight-multicluster', 'primary'),
      });
    }
    if (!data.available) {
      return U.empty({
        compact: true, icon: 'cloud', title: 'No context configured',
        body: (data.limitations || [])[0] || 'Add a kubeconfig context before comparing clusters.',
        action: LINK('Open contexts', 'cloud', '#/kubernetes/contexts', 'primary'),
      });
    }
    const rows = (data.contexts || []).map((entry) => `<tr>
      <td><strong>${esc(entry.name)}</strong>${entry.name === data.selected ? `<span class="intel-muted"> · selected</span>` : ''}${entry.cluster ? `<div class="intel-muted">${esc(entry.cluster)}</div>` : ''}</td>
      <td>${entry.ok ? badge('Reachable', 'green') : badge('Unreachable', 'red')}</td>
      <td class="intel-nowrap">${entry.nodesTotal == null ? '—' : `${fmtNumber(entry.nodesReady)} / ${fmtNumber(entry.nodesTotal)}`}</td>
      <td class="intel-nowrap">${entry.podsTotal == null ? '—' : `${fmtNumber(entry.podsRunning)} / ${fmtNumber(entry.podsTotal)}`}</td>
      <td class="intel-nowrap">${entry.podsProblem == null ? '—' : fmtNumber(entry.podsProblem)}</td>
      <td class="intel-nowrap">${entry.deploymentsTotal == null ? '—' : `${fmtNumber(entry.deploymentsAvailable)} / ${fmtNumber(entry.deploymentsTotal)}`}</td>
      <td class="intel-nowrap">${entry.warningEvents == null ? '—' : fmtNumber(entry.warningEvents)}</td>
    </tr>`).join('');
    return `${table(['Context', 'State', 'Nodes ready', 'Pods running', 'Pods with problems', 'Deployments available', 'Warning events'], rows, {
      emptyTitle: 'No contexts', emptyBody: 'No kubeconfig context was returned.', icon: 'cloud',
    })}
    ${(data.findings || []).length ? `<div class="insight-subhead">Comparison findings</div>${findingsList(data.findings, { limit: 20 })}` : ''}
    ${(data.limitations || []).length ? `<div class="insight-subhead">Limitations</div><ul class="insight-limits">${data.limitations.map((item) => `<li>${esc(item)}</li>`).join('')}</ul>` : ''}
    <p class="intel-muted">${BTN('Refresh comparison', 'refresh', 'data-insight-multicluster', 'secondary', 'xs')} Last read ${esc(timeAgo(data.checkedAt))}.</p>`;
  }

  function kubernetesBody(data) {
    const health = data.health || {};
    const security = data.security || {};
    const storage = data.storage || {};
    const network = data.network || {};
    const optimization = data.optimization || {};
    const cost = data.cost || {};
    const gitops = data.gitops || {};
    const troubleshooting = data.troubleshooting || {};

    const nodeRows = (health.nodes || []).map((entry) => `<tr>
      <td>${esc(entry.name)}</td>
      <td>${entry.ready ? badge('Ready', 'green') : badge('Not ready', 'red')}</td>
      <td>${textCell((entry.roles || []).join(', '))}</td>
      <td class="intel-nowrap">${entry.cpu == null ? '—' : fmtNumber(entry.cpu)}</td>
      <td class="intel-nowrap">${entry.memory == null ? '—' : fmtBytes(entry.memory)}</td>
      <td class="intel-wrap">${esc(entry.message || entry.reason || '')}</td>
    </tr>`).join('');

    const podSecurityRows = (security.pods || []).map((entry) => `<tr>
      <td>${esc(entry.namespace)}/${esc(entry.name)}</td>
      <td>${entry.issues.map((issue) => badge(issue.title, issue.severity === 'critical' ? 'red' : issue.severity === 'warning' ? 'orange' : 'cyan')).join(' ')}</td>
    </tr>`).join('');

    const storageRows = (storage.rows || []).map((entry) => `<tr>
      <td>${esc(entry.namespace)}/${esc(entry.name)}</td>
      <td>${textCell(entry.phase)}</td>
      <td>${textCell(entry.className)}</td>
      <td class="intel-nowrap">${esc(entry.requested || '—')}</td>
      <td class="intel-nowrap">${esc(entry.capacity || '—')}</td>
    </tr>`).join('');

    const serviceRows = (network.services || []).map((entry) => `<tr>
      <td>${esc(entry.namespace)}/${esc(entry.name)}</td>
      <td>${textCell(entry.type)}</td>
      <td class="mono">${textCell(entry.clusterIP)}</td>
      <td>${entry.endpoints ? badge('Ready', 'green') : badge('No endpoints', 'orange')}</td>
      <td class="mono intel-wrap">${esc(entry.ports || '')}</td>
    </tr>`).join('');

    const optimizationRows = (optimization.namespaces || []).map((entry) => `<tr>
      <td>${esc(entry.namespace)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.containers)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.cpuRequest)}</td>
      <td class="intel-nowrap">${fmtBytes(entry.memoryRequest)}</td>
    </tr>`).join('');

    const costRows = (cost.namespaces || []).map((entry) => `<tr>
      <td>${esc(entry.namespace)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.pods)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.cpu)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.memoryGb)}</td>
      <td class="intel-nowrap">${entry.costMonth == null ? '<span class="intel-muted">not priced</span>' : `${fmtNumber(entry.costMonth)} ${esc(cost.currency || '')}`}</td>
    </tr>`).join('');

    const eventRows = (troubleshooting.byObject || []).map((entry) => `<tr>
      <td class="mono intel-wrap">${esc(entry.object)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.count)}</td>
      <td>${Object.keys(entry.reasons || {}).map((reason) => badge(reason, 'orange')).join(' ')}</td>
      <td class="intel-wrap">${esc(entry.message || '')}</td>
    </tr>`).join('');

    const restartRows = (troubleshooting.restarts || []).map((entry) => `<tr>
      <td class="mono">${esc(entry.name)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.restarts)}</td>
      <td>${textCell(entry.reason)}</td>
    </tr>`).join('');

    const managedRows = (gitops.managedWorkloads || []).map((entry) => `<tr>
      <td>${esc(entry.namespace)}/${esc(entry.name)}</td>
    </tr>`).join('');

    return `
      ${U.card({
        title: 'Cluster scope',
        icon: 'cloud',
        sub: 'Read-only snapshot of workloads, storage, network and RBAC',
        actions: `<select class="input input-sm" data-insight-field="k8s-scope" aria-label="Namespace scope">
          <option value="all" ${S.k8sScope === 'all' ? 'selected' : ''}>All namespaces</option>
          <option value="current" ${S.k8sScope === 'current' ? 'selected' : ''}>Current namespace</option>
        </select>`,
        body: U.kvRows([
          ['Context', esc(data.context || '—'), true],
          ['Namespace', esc(data.namespace || 'default'), true],
          ['Nodes ready', `${fmtNumber(health.health?.nodesReady ?? 0)} / ${fmtNumber(health.health?.nodesTotal ?? 0)}`],
          ['Pods running', `${fmtNumber(health.health?.podsRunning ?? 0)} / ${fmtNumber(health.health?.podsTotal ?? 0)}`],
          ['GitOps', gitops.detected ? badge((gitops.tools || []).join(', ') || 'Detected', 'green') : badge('Not detected', 'slate')],
        ]),
      })}
      <div class="intel-stat-grid">
        ${U.statCard({ label: 'Pods with problems', icon: 'box', tone: health.pods?.problems ? 'red' : 'green', value: fmtNumber(health.pods?.problems ?? 0), sub: `${fmtNumber(health.pods?.restarts ?? 0)} restart(s)` })}
        ${U.statCard({ label: 'Unavailable deployments', icon: 'layers', tone: health.workloads?.unavailable ? 'orange' : 'green', value: fmtNumber(health.workloads?.unavailable ?? 0), sub: `${fmtNumber(health.workloads?.deployments ?? 0)} deployment(s)` })}
        ${U.statCard({ label: 'Security issues', icon: 'shield', tone: security.stats?.privileged ? 'red' : 'green', value: fmtNumber(security.stats?.podsWithIssues ?? 0), sub: `${fmtNumber(security.stats?.privileged ?? 0)} privileged · ${fmtNumber(security.stats?.clusterAdminBindings ?? 0)} cluster-admin` })}
        ${U.statCard({ label: 'Warning events', icon: 'alert-triangle', tone: troubleshooting.warningEvents ? 'orange' : 'green', value: fmtNumber(troubleshooting.warningEvents ?? 0), sub: `${fmtNumber((troubleshooting.notReady || []).length)} not-ready pod(s)` })}
        ${U.statCard({ label: 'Storage claims', icon: 'database', tone: 'cyan', value: fmtNumber(storage.claims ?? 0), sub: `${fmtBytes(storage.provisionedBytes ?? 0)} ${storage.defaultClass ? `· default ${storage.defaultClass}` : '· no default class'}` })}
        ${U.statCard({ label: 'Monthly cost', icon: 'trending-up', tone: cost.priced ? 'violet' : 'slate', value: cost.priced ? `${fmtNumber(cost.totals?.costMonth ?? 0)} ${cost.currency || ''}` : 'Not priced', sub: cost.priced ? 'From configured CPU/memory prices' : 'Set prices in Intelligence settings' })}
      </div>
      ${U.card({ title: 'Findings', icon: 'alert-triangle', sub: 'Health, security, storage, network, optimization and events', actions: countChips(data.counts), body: findingsList(data.findings, { limit: 80, emptyTitle: 'No cluster findings', emptyBody: 'Every inspected object is within its rules.' }) })}
      <div class="intel-grid">
        ${U.card({ title: 'Nodes', icon: 'server', sub: 'Ready condition and allocatable capacity', body: table(['Node', 'State', 'Roles', 'CPU', 'Memory', 'Detail'], nodeRows, { emptyTitle: 'No nodes returned', emptyBody: 'RBAC may not allow listing nodes.', icon: 'server' }) })}
        ${U.card({ title: 'Pod security', icon: 'shield', sub: 'Privileged containers, host namespaces, hostPath, capabilities and tokens', body: table(['Pod', 'Issues'], podSecurityRows, { emptyTitle: 'No pod security issues', emptyBody: 'No inspected pod triggered a hardening rule.', icon: 'shield' }) })}
      </div>
      <div class="intel-grid">
        ${U.card({ title: 'Storage', icon: 'database', sub: 'Claims, classes and provisioned capacity', body: table(['Claim', 'Phase', 'Class', 'Requested', 'Capacity'], storageRows, { emptyTitle: 'No persistent volume claims', icon: 'database' }) })}
        ${U.card({ title: 'Network', icon: 'network', sub: 'Services, endpoint readiness and policy coverage', body: table(['Service', 'Type', 'Cluster IP', 'Endpoints', 'Ports'], serviceRows, { emptyTitle: 'No services', icon: 'network' }) })}
      </div>
      ${U.card({ title: 'Troubleshooting', icon: 'stethoscope', sub: 'Warning events grouped by object and pods with repeated restarts', body: `${table(['Object', 'Events', 'Reasons', 'Message'], eventRows, { emptyTitle: 'No warning events', emptyBody: 'No Warning event is retained by the API server.', icon: 'alert-triangle' })}${restartRows ? `<div class="insight-subhead">Pods with three or more restarts</div>${table(['Pod', 'Restarts', 'Waiting reason'], restartRows)}` : ''}` })}
      <div class="intel-grid">
        ${U.card({ title: 'Requests by namespace', icon: 'layers', sub: 'CPU and memory requests across running pods', body: table(['Namespace', 'Containers', 'CPU cores', 'Memory'], optimizationRows, { emptyTitle: 'No pod requests', icon: 'layers' }) })}
        ${U.card({ title: 'Cost allocation', icon: 'trending-up', sub: cost.priced ? `CPU ${cost.prices?.cpuHour}/${esc(cost.currency)} per hour · memory ${cost.prices?.memoryGbHour}/${esc(cost.currency)} per GB-hour` : 'Add prices in the Intelligence workspace to price requests', body: table(['Namespace', 'Pods', 'CPU cores', 'Memory GB', 'Month'], costRows, { emptyTitle: 'No priced workloads', icon: 'trending-up' }) })}
      </div>
      ${U.card({ title: 'GitOps', icon: 'git-branch', sub: 'Controllers and workloads managed from Git', body: gitops.detected ? `${U.kvRows([
        ['Argo CD', gitops.argo ? badge('Detected', 'green') : badge('Not visible', 'slate')],
        ['Flux', gitops.flux ? badge('Detected', 'green') : badge('Not visible', 'slate')],
        ['Managed workloads', fmtNumber((gitops.managedWorkloads || []).length)],
      ])}${managedRows ? table(['Workload'], managedRows) : ''}<p class="intel-muted">Direct kubectl edits to managed objects may be reverted by the controller.</p>` : U.empty({ compact: true, icon: 'git-branch', title: 'No GitOps controller detected', body: (gitops.limitations || [])[0] || '' }) })}
      ${U.card({
        title: 'Multi-cluster comparison',
        icon: 'cloud',
        sub: 'Read-only counts read separately for every configured context',
        actions: BTN(S.multiCluster ? 'Refresh' : 'Compare', 'layers', 'data-insight-multicluster', 'secondary', 'xs'),
        body: multiClusterBody(),
      })}
      ${limitationsList(data.limitations)}`;
  }

  // ---------------------------------------------------------- observability

  function sloFormBody() {
    const form = S.sloForm;
    return `<form class="insight-form" data-insight-form="slo">
      <label class="insight-field"><span>Name</span><input class="input input-sm" name="name" value="${esc(form.name)}" placeholder="Checkout availability" maxlength="120" required></label>
      <label class="insight-field"><span>Metric</span><input class="input input-sm" name="metric" value="${esc(form.metric)}" placeholder="synthetic.up" maxlength="120" required></label>
      <label class="insight-field"><span>Comparison</span><select class="input input-sm" name="comparison">
        <option value="gte" ${form.comparison === 'gte' ? 'selected' : ''}>At least the threshold is good</option>
        <option value="lte" ${form.comparison === 'lte' ? 'selected' : ''}>At most the threshold is good</option>
      </select></label>
      <label class="insight-field"><span>Threshold</span><input class="input input-sm" name="threshold" type="number" step="any" value="${esc(form.threshold)}" required></label>
      <label class="insight-field"><span>Target %</span><input class="input input-sm" name="target" type="number" min="0" max="100" step="0.01" value="${esc(form.target)}" required></label>
      <label class="insight-field"><span>Window (hours)</span><input class="input input-sm" name="windowHours" type="number" min="1" max="720" value="${esc(form.windowHours)}" required></label>
      <label class="insight-field"><span>Aggregation</span><select class="input input-sm" name="aggregation">
        ${['avg', 'max', 'min', 'last'].map((value) => `<option value="${value}" ${form.aggregation === value ? 'selected' : ''}>${value}</option>`).join('')}
      </select></label>
      <div class="insight-form-actions"><button type="submit" class="btn btn-primary btn-sm">${icon('plus', 14)}<span>Add objective</span></button></div>
    </form>`;
  }

  function observabilityBody(data) {
    const anomalies = data.anomalies || {};
    const capacity = data.capacity || {};
    const slos = data.slos || {};
    const dependencies = data.dependencies || {};
    const profiles = data.profiles || {};
    const definitions = Array.isArray(S.settings?.slos) ? S.settings.slos : [];

    const anomalyRows = (anomalies.anomalies || []).map((entry) => `<tr>
      <td class="mono">${esc(entry.name)}</td>
      <td>${textCell(entry.resource)}</td>
      <td class="intel-nowrap">${esc(timeAgo(entry.at))}</td>
      <td class="intel-nowrap">${fmtNumber(entry.value)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.baseline)}</td>
      <td>${badge(entry.direction === 'below' ? 'Below baseline' : 'Above baseline', entry.direction === 'below' ? 'cyan' : 'orange')}</td>
      <td class="intel-nowrap">${entry.score == null ? '—' : `${fmtNumber(entry.score)}σ`}</td>
    </tr>`).join('');

    const capacityRows = (capacity.series || []).map((entry) => `<tr>
      <td>${esc(entry.label)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.current)}${entry.unit === 'percent' ? '%' : ''}</td>
      <td class="intel-nowrap">${entry.threshold == null ? '—' : `${fmtNumber(entry.threshold)}${entry.unit === 'percent' ? '%' : ''}`}</td>
      <td class="intel-nowrap">${entry.slopePerDay == null ? '—' : `${entry.slopePerDay > 0 ? '+' : ''}${fmtNumber(entry.slopePerDay)}/day`}</td>
      <td class="intel-nowrap">${entry.breachAt ? esc(fmtDateTime(entry.breachAt)) : entry.breached ? badge('Already crossed', 'orange') : '—'}</td>
      <td class="intel-nowrap">${entry.confidence == null ? '—' : fmtPercent(entry.confidence * 100, 0)}</td>
      <td class="intel-wrap">${esc(entry.note || '')}</td>
    </tr>`).join('');

    const sloRows = (slos.slos || []).map((entry) => `<tr>
      <td><strong>${esc(entry.name)}</strong><span class="intel-muted"> · ${esc(entry.metric)}</span></td>
      <td class="intel-nowrap">${fmtPercent(entry.achieved, 2)}</td>
      <td class="intel-nowrap">${fmtPercent(entry.target, 2)}</td>
      <td class="intel-nowrap">${entry.status === 'meeting' ? badge('Meeting', 'green') : badge('Breached', 'red')}</td>
      <td class="intel-nowrap">${U.progressBar(entry.errorBudgetConsumed, entry.errorBudgetConsumed >= 100 ? 'red' : entry.errorBudgetConsumed >= 80 ? 'orange' : 'green')}<span class="intel-muted">${fmtPercent(entry.errorBudgetConsumed, 0)} consumed</span></td>
      <td class="intel-nowrap">${fmtNumber(entry.samples)}</td>
    </tr>`).join('');

    const definitionRows = definitions.map((entry) => `<tr>
      <td><strong>${esc(entry.name)}</strong></td>
      <td class="mono">${esc(entry.metric)}</td>
      <td class="intel-nowrap">${esc(entry.comparison === 'lte' ? '≤' : '≥')} ${fmtNumber(entry.threshold)}</td>
      <td class="intel-nowrap">${fmtPercent(entry.target, 2)}</td>
      <td class="intel-nowrap">${fmtNumber(entry.windowHours)}h</td>
      <td class="intel-nowrap">${entry.enabled === false ? badge('Disabled', 'slate') : badge('Enabled', 'green')}</td>
      <td>${BTN('Delete', 'trash', `data-insight-slo-delete="${esc(entry.id)}"`, 'ghost', 'xs')}</td>
    </tr>`).join('');

    const edgeRows = (dependencies.edges || []).map((entry) => `<tr>
      <td>${esc(entry.from)} → <strong>${esc(entry.to)}</strong></td>
      <td class="intel-nowrap">${fmtNumber(entry.calls)}</td>
      <td class="intel-nowrap">${fmtPercent(entry.errorRate, 1)}</td>
      <td class="intel-nowrap">${entry.avgMs == null ? '—' : `${fmtNumber(entry.avgMs)} ms`}</td>
      <td class="intel-nowrap">${entry.p95Ms == null ? '—' : `${fmtNumber(entry.p95Ms)} ms`}</td>
      <td class="intel-wrap">${esc((entry.operations || []).join(', '))}</td>
    </tr>`).join('');

    const profileRows = (profiles.services || []).map((entry) => `<tr>
      <td><strong>${esc(entry.service)}</strong></td>
      <td class="intel-nowrap">${fmtNumber(entry.spans)}</td>
      <td class="intel-nowrap">${fmtPercent(entry.errorRate, 1)}</td>
      <td class="intel-nowrap">${entry.avgMs == null ? '—' : `${fmtNumber(entry.avgMs)} ms`}</td>
      <td class="intel-nowrap">${entry.p95Ms == null ? '—' : `${fmtNumber(entry.p95Ms)} ms`}</td>
      <td class="intel-nowrap">${entry.p99Ms == null ? '—' : `${fmtNumber(entry.p99Ms)} ms`}</td>
      <td class="intel-wrap">${esc((entry.topOperations || []).map((operation) => `${operation.name} (${operation.count})`).join(', '))}</td>
    </tr>`).join('');

    return `
      <div class="intel-stat-grid">
        ${U.statCard({ label: 'Objectives', icon: 'target', tone: (slos.slos || []).some((entry) => entry.status === 'breached') ? 'red' : 'green', value: fmtNumber((slos.slos || []).length), sub: `${definitions.length} configured · ${fmtNumber(data.sloCount ?? definitions.length)} stored` })}
        ${U.statCard({ label: 'Anomalies (24h)', icon: 'activity', tone: (anomalies.anomalies || []).length ? 'orange' : 'green', value: fmtNumber((anomalies.anomalies || []).length), sub: `${fmtNumber(anomalies.examined ?? 0)} series examined` })}
        ${U.statCard({ label: 'Capacity series', icon: 'trending-up', tone: (capacity.series || []).some((entry) => entry.breachAt || entry.breached) ? 'orange' : 'cyan', value: fmtNumber((capacity.series || []).length), sub: 'Seven-day linear projection' })}
        ${U.statCard({ label: 'Service edges', icon: 'git-branch', tone: 'violet', value: fmtNumber((dependencies.edges || []).length), sub: `${fmtNumber((dependencies.services || []).length)} services · ${fmtNumber(data.traceCount ?? 0)} spans` })}
      </div>
      ${U.card({ title: 'Findings', icon: 'alert-triangle', sub: 'SLO burn, anomalies, capacity crossings and failing dependencies', actions: countChips(data.counts), body: findingsList(data.findings, { emptyTitle: 'No observability findings', emptyBody: 'No objective, anomaly or dependency rule was triggered.' }) })}
      ${U.card({ title: 'Service objectives', icon: 'target', sub: 'Budgets are computed from retained metric samples, not estimated', body: table(['Objective', 'Achieved', 'Target', 'State', 'Error budget', 'Samples'], sloRows, { emptyTitle: 'No objective measured yet', emptyBody: 'Add an objective below, then collect metric samples.', icon: 'target' }) })}
      <div class="intel-grid">
        ${U.card({ title: 'Objective definitions', icon: 'settings', sub: S.settingsError ? `Settings could not be read: ${S.settingsError}` : 'Stored in the shared intelligence settings', body: `${table(['Name', 'Metric', 'Good when', 'Target', 'Window', 'State', ''], definitionRows, { emptyTitle: 'No objective defined', emptyBody: 'Define a metric, comparison, threshold, target and window below.', icon: 'settings' })}${sloFormBody()}` })}
        ${U.card({ title: 'Anomalies', icon: 'activity', sub: 'Robust deviation from the median of retained samples', body: table(['Metric', 'Resource', 'When', 'Value', 'Baseline', 'Direction', 'Score'], anomalyRows, { emptyTitle: 'No anomalies detected', emptyBody: anomalies.available ? 'Every series stayed near its baseline.' : (anomalies.limitations || [])[0] || 'No samples were retained in the last 24 hours.', icon: 'activity' }) })}
      </div>
      ${U.card({ title: 'Capacity forecast', icon: 'trending-up', sub: 'A linear trend is only reported when enough samples exist; crossings are dates, not guesses', body: table(['Series', 'Current', 'Threshold', 'Trend', 'Projected crossing', 'Confidence', 'Note'], capacityRows, { emptyTitle: 'No capacity projection', emptyBody: (capacity.limitations || [])[0] || 'Retain more samples to project capacity.', icon: 'trending-up' }) })}
      <div class="intel-grid">
        ${U.card({ title: 'Dependencies', icon: 'git-branch', sub: 'Edges are built from span parents and peer services only', actions: LINK('Open traces', 'arrow-right', '#/observability/traces', 'ghost'), body: table(['Edge', 'Calls', 'Errors', 'Mean', 'p95', 'Operations'], edgeRows, { emptyTitle: 'No spans retained', emptyBody: (dependencies.limitations || [])[0] || 'Send OTLP spans to the observability ingest endpoint.', icon: 'git-branch' }) })}
        ${U.card({ title: 'Service profiles', icon: 'bar-chart', sub: 'Latency percentiles and operation mix per service', body: table(['Service', 'Spans', 'Errors', 'Mean', 'p95', 'p99', 'Top operations'], profileRows, { emptyTitle: 'No profiles', emptyBody: (profiles.limitations || [])[0] || 'Profiles need retained spans.', icon: 'bar-chart' }) })}
      </div>
      ${limitationsList(data.limitations)}`;
  }

  // ------------------------------------------------------------------ render

  function bodyFor(module, data) {
    if (!data) return '';
    if (module === 'databases') return databaseBody(data);
    if (module === 'docker') return dockerBody(data);
    if (module === 'kubernetes') return kubernetesBody(data);
    return observabilityBody(data);
  }

  const SUBTITLE = {
    databases: 'Health, schema, workloads, query history and forecasts for one connection.',
    docker: 'Container security, image hygiene, resource usage, Compose, optimizer and configuration drift.',
    kubernetes: 'Health, security, storage, network, optimization, cost, GitOps and troubleshooting for the selected context.',
    observability: 'Service objectives, anomalies, capacity, dependencies and profiles from retained telemetry.',
  };

  async function render(module, route) {
    if (!PAGES[module]) {
      return `<div class="page intel-page"><div class="page-head"><div class="page-head-left"><h1 class="page-title">Intelligence</h1><p class="page-sub">That page does not exist.</p></div></div>${U.empty({ icon: 'compass', title: 'Unknown module', body: 'This intelligence page is not wired to a module.' })}</div>`;
    }
    S.module = module;
    await load(module);
    return shell(module, bodyFor(module, S.data[module]), SUBTITLE[module]);
  }

  function mount(root, module) {
    if (!root) return;
    dispose();
    const controller = new AbortController();
    S.controller = controller;
    const opts = { signal: controller.signal };
    S.module = module || S.module;

    root.addEventListener('click', onClick, opts);
    root.addEventListener('change', onChange, opts);
    root.addEventListener('submit', onSubmit, opts);

    // A background refresh keeps a long-open page honest without touching a
    // form the user is editing.
    const page = S.module;
    S.timer = setInterval(async () => {
      if (document.hidden || S.module !== page) return;
      if (document.querySelector('[data-insight-form="slo"]:focus-within')) return;
      await load(page, { force: true });
      if (S.module !== page) return;
      OD.app?.rerender?.();
    }, 90000);
  }

  function dispose() {
    if (S.timer) clearInterval(S.timer);
    S.timer = null;
    if (S.controller) S.controller.abort();
    S.controller = null;
  }

  function refresh() {
    OD.app?.rerender?.();
  }

  async function loadMultiCluster() {
    if (S.multiClusterLoading) return;
    S.multiClusterLoading = true;
    S.multiClusterError = '';
    try {
      const result = await api.intelligence.kubernetesMultiCluster({ limit: 8 });
      if (!result || result.ok === false) throw new Error(result?.error || 'The contexts could not be read.');
      S.multiCluster = result;
    } catch (error) {
      S.multiClusterError = error.message || String(error);
    } finally {
      S.multiClusterLoading = false;
    }
    refresh();
  }

  async function onClick(event) {
    if (event.target.closest('[data-insight-refresh]')) {
      event.preventDefault();
      await load(S.module, { force: true });
      if (S.module === 'observability') await bootSettings(true);
      refresh();
      return;
    }
    if (event.target.closest('[data-insight-multicluster]')) {
      event.preventDefault();
      await loadMultiCluster();
      return;
    }
    const del = event.target.closest('[data-insight-slo-delete]');
    if (del) {
      event.preventDefault();
      const id = del.dataset.insightSloDelete;
      const definitions = Array.isArray(S.settings?.slos) ? S.settings.slos : [];
      const target = definitions.find((entry) => entry.id === id);
      const ok = await U.confirm({
        title: 'Delete this objective?',
        message: `“${target?.name || id}” stops contributing an error budget. No metric data is deleted.`,
        confirmLabel: 'Delete objective',
        tone: 'red',
      });
      if (!ok) return;
      await saveSlos(definitions.filter((entry) => entry.id !== id));
      return;
    }
  }

  async function onChange(event) {
    const field = event.target.closest('[data-insight-field]');
    if (!field) return;
    if (field.dataset.insightField === 'db-connection') {
      S.dbConnection = String(field.value || '');
      await load('databases', { force: true });
      refresh();
    } else if (field.dataset.insightField === 'k8s-scope') {
      S.k8sScope = field.value === 'current' ? 'current' : 'all';
      await load('kubernetes', { force: true });
      refresh();
    }
  }

  async function saveSlos(slos) {
    try {
      const result = await api.intelligence.updateSettings({ slos });
      if (!result || result.ok === false) throw new Error(result?.error || 'The settings could not be saved.');
      S.settings = { ...(S.settings || {}), ...(result.settings || {}) };
      await load('observability', { force: true });
      U.toast('Objectives updated', 'success');
    } catch (error) {
      U.toast('Could not save objectives', 'error', { description: error.message || String(error) });
    }
    refresh();
  }

  async function onSubmit(event) {
    const form = event.target.closest('[data-insight-form="slo"]');
    if (!form) return;
    event.preventDefault();
    const data = new FormData(form);
    const name = String(data.get('name') || '').trim();
    const metric = String(data.get('metric') || '').trim();
    if (!name || !metric) {
      U.toast('Name and metric are required', 'warning');
      return;
    }
    const definitions = Array.isArray(S.settings?.slos) ? S.settings.slos.slice() : [];
    if (definitions.length >= 50) {
      U.toast('Objective limit reached', 'warning', { description: 'Delete an objective before adding another.' });
      return;
    }
    const existing = definitions.some((entry) => entry.name.toLowerCase() === name.toLowerCase());
    if (existing) {
      U.toast('An objective with that name exists', 'warning');
      return;
    }
    definitions.push({
      id: `slo-${Date.now().toString(36)}`,
      name,
      metric,
      comparison: data.get('comparison') === 'lte' ? 'lte' : 'gte',
      threshold: Number(data.get('threshold')),
      target: Number(data.get('target')),
      windowHours: Number(data.get('windowHours')),
      aggregation: String(data.get('aggregation') || 'avg'),
      enabled: true,
    });
    S.sloForm = { ...S.sloForm, name: '', metric: 'synthetic.up' };
    await saveSlos(definitions);
  }

  OD.views = OD.views || {};
  OD.views.insights = {
    render,
    mount,
    dispose,
    pages: PAGES,
    label(module) {
      return PAGES[module] || 'Intelligence';
    },
  };
})();
