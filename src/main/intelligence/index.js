'use strict';

/**
 * Cross-module intelligence service.
 *
 * This is the only place that combines Docker, Kubernetes, Databases and
 * Observability data. It is intentionally thin: collection, graph building,
 * change detection, environment mapping, root-cause analysis and automation all
 * live in focused modules, and this service composes them, owns the shared
 * store and exposes a renderer-safe API.
 *
 * Everything is read-only by default. The only mutating paths are explicit
 * user actions (environment assignment, automation CRUD, approving a run) and
 * each one is written to the shared audit trail.
 */

const os = require('node:os');
const { IntelligenceStore } = require('./store');
const { ResourceCollector } = require('./resources');
const { buildGraph } = require('./graph');
const { TimelineBuilder } = require('./timeline');
const { ChangeDetector } = require('./changes');
const { EnvironmentManager } = require('./environments');
const { AutomationEngine } = require('./automation');
const { RootCauseAnalyzer } = require('./rca');
const { clean, clamp, safeError } = require('./util');

const REFRESH_INTERVAL_MS = 90e3;
const REFRESH_DELAY_MS = 4e3;
const MAX_GRAPH_SPANS = 2000;

/**
 * Navigation targets are real workspace routes. Search uses them as quick
 * actions; they never claim operational state.
 */
const QUICK_ACTIONS = [
  { id: 'nav-containers', label: 'Containers', module: 'docker', href: '#/containers', keywords: 'docker container' },
  { id: 'nav-images', label: 'Images', module: 'docker', href: '#/images', keywords: 'docker image registry' },
  { id: 'nav-volumes', label: 'Volumes', module: 'docker', href: '#/volumes', keywords: 'docker volume storage' },
  { id: 'nav-networks', label: 'Networks', module: 'docker', href: '#/networks', keywords: 'docker network' },
  { id: 'nav-compose', label: 'Compose projects', module: 'docker', href: '#/compose', keywords: 'compose stack' },
  { id: 'nav-k8s-topology', label: 'Cluster topology', module: 'kubernetes', href: '#/kubernetes/topology', keywords: 'kubernetes cluster graph' },
  { id: 'nav-k8s-pods', label: 'Pods', module: 'kubernetes', href: '#/kubernetes/pods', keywords: 'kubernetes pod' },
  { id: 'nav-k8s-deployments', label: 'Deployments', module: 'kubernetes', href: '#/kubernetes/deployments', keywords: 'kubernetes deployment workload' },
  { id: 'nav-k8s-nodes', label: 'Nodes', module: 'kubernetes', href: '#/kubernetes/nodes', keywords: 'kubernetes node' },
  { id: 'nav-db-connections', label: 'Database connections', module: 'databases', href: '#/databases/connections', keywords: 'database connection profile' },
  { id: 'nav-db-activity', label: 'Database activity', module: 'databases', href: '#/databases/activity', keywords: 'database query history' },
  { id: 'nav-obs-alerts', label: 'Alerts', module: 'observability', href: '#/observability/alerts', keywords: 'alert rule firing' },
  { id: 'nav-obs-incidents', label: 'Incidents', module: 'observability', href: '#/observability/incidents', keywords: 'incident response' },
  { id: 'nav-obs-logs', label: 'Logs', module: 'observability', href: '#/observability/logs', keywords: 'log search' },
  { id: 'nav-obs-traces', label: 'Traces', module: 'observability', href: '#/observability/applications', keywords: 'trace span apm' },
  { id: 'nav-obs-slo', label: 'Alert rules', module: 'observability', href: '#/observability/alerts', keywords: 'slo objective error budget alert rule' },
  { id: 'nav-intel-graph', label: 'Infrastructure graph', module: 'intelligence', href: '#/intelligence/graph', keywords: 'graph dependency topology' },
  { id: 'nav-intel-timeline', label: 'Unified timeline', module: 'intelligence', href: '#/intelligence/timeline', keywords: 'timeline events' },
  { id: 'nav-intel-changes', label: 'Changes', module: 'intelligence', href: '#/intelligence/changes', keywords: 'change detection drift' },
  { id: 'nav-intel-automation', label: 'Automation', module: 'intelligence', href: '#/intelligence/automation', keywords: 'automation workflow runbook' },
];

function scoreResource(resource, tokens, query) {
  if (!tokens.length) return 1;
  const haystack = [
    resource.name,
    resource.kind,
    resource.module,
    resource.namespace,
    resource.cluster,
    resource.host,
    resource.status,
    resource.statusDetail,
    Object.keys(resource.labels || {}).join(' '),
    Object.values(resource.labels || {}).join(' '),
  ].join(' ').toLowerCase();
  let score = 0;
  for (const token of tokens) {
    if (!haystack.includes(token)) return 0;
    score += 1;
    if (String(resource.name || '').toLowerCase() === query) score += 6;
    else if (String(resource.name || '').toLowerCase().startsWith(token)) score += 3;
    else if (String(resource.name || '').toLowerCase().includes(token)) score += 2;
    if (String(resource.kind || '').toLowerCase().includes(token)) score += 1;
  }
  return score;
}

class IntelligenceService {
  constructor({ app, docker = null, kubernetes = null, databases = null, observability = null, getWindow = null }) {
    this.app = app;
    this.docker = docker;
    this.kubernetes = kubernetes;
    this.databases = databases;
    this.observability = observability;
    this.getWindow = getWindow;

    this.store = new IntelligenceStore(app);
    this.collector = new ResourceCollector({
      docker,
      kubernetes,
      databases,
      observability,
      localHost: os.hostname(),
    });
    this.environments = new EnvironmentManager(this.store);
    this.changeDetector = new ChangeDetector(this.store);

    const deps = {
      queryMetrics: (options) => this.queryMetrics(options),
      queryLogs: (options) => this.queryLogs(options),
      queryTraces: (options) => this.queryTraces(options),
      listAlerts: (options) => this.listAlerts(options),
      listIncidents: (options) => this.listIncidents(options),
      getIncident: (id) => this.incidentGet(id),
      createIncident: (input) => this.incidentCreate(input),
      generateReport: (options) => this.reportGenerate(options),
      changes: (options) => this.changeDetector.history(options),
      resources: async () => (await this.snapshot()).items,
      notify: (input) => this.notify(input),
      diagnostics: (input) => this.diagnostics(input),
      queryDatabase: (input) => this.queryDatabase(input),
      restartContainer: (id) => this.restartContainer(id),
      recentEvents: async (options) => (await this.timeline({ limit: options?.limit || 200 })).items,
      onEvent: (event) => this.onAutomationEvent(event),
    };

    this.automation = new AutomationEngine({ store: this.store, deps });
    this.rca = new RootCauseAnalyzer({ deps });

    this.snapshotCache = null;
    this.refreshing = null;
    this.timer = null;
    this.delay = null;
    this.lastRefresh = null;
    this.lastError = '';
    this.disposed = false;
  }

  // ------------------------------------------------------------------ basics

  status() {
    return {
      ok: true,
      store: { file: this.store.file, loaded: this.store.loaded },
      lastRefresh: this.lastRefresh,
      lastError: this.lastError,
      automation: {
        enabled: this.store.get().settings.automationEnabled !== false,
        intervalSec: this.store.get().settings.automationIntervalSec,
      },
    };
  }

  bootstrap() {
    const data = this.store.get();
    return {
      ok: true,
      environments: data.environments,
      rules: data.environmentRules,
      settings: data.settings,
      automations: data.automations.map((automation) => ({
        id: automation.id,
        name: automation.name,
        enabled: automation.enabled,
        lastStatus: automation.lastStatus,
        lastRunAt: automation.lastRunAt,
      })),
      favorites: this.favorites().items,
      savedSearches: this.savedSearches().items,
      workspaces: this.workspaces().items,
      audit: this.store.auditList({ limit: 20 }),
      status: this.status(),
      modules: {
        docker: Boolean(this.docker),
        kubernetes: Boolean(this.kubernetes),
        databases: Boolean(this.databases),
        observability: Boolean(this.observability),
      },
      generatedAt: new Date().toISOString(),
    };
  }

  /** Annotate every resource with its environment and a stable cache. */
  async snapshot(options = {}) {
    const force = options.force === true;
    const collected = await this.collector.collect({ force });
    const items = this.environments.annotate(collected.items);
    return { ...collected, items };
  }

  async refresh(options = {}) {
    if (this.refreshing) return this.refreshing;
    this.refreshing = (async () => {
      const started = Date.now();
      try {
        const snapshot = await this.snapshot({ force: options.force === true });
        let changeResult = { changes: [], baseline: false };
        if (options.detectChanges !== false) {
          try {
            changeResult = this.changeDetector.detect(snapshot.items);
          } catch (error) {
            this.lastError = safeError(error, 'Change detection failed.');
          }
        }
        this.lastRefresh = {
          at: new Date().toISOString(),
          durationMs: Date.now() - started,
          resources: snapshot.items.length,
          sources: snapshot.sources,
          changes: changeResult.changes.length,
          baseline: changeResult.baseline,
        };
        this.snapshotCache = snapshot;
        if (changeResult.changes.length) {
          this.emit({ type: 'changes', changes: changeResult.changes });
        }
        return { ok: true, ...this.lastRefresh, totals: this.totals(snapshot.items) };
      } catch (error) {
        this.lastError = safeError(error, 'Resource refresh failed.');
        return { ok: false, error: this.lastError };
      } finally {
        this.refreshing = null;
      }
    })();
    return this.refreshing;
  }

  totals(items = []) {
    const totals = { byModule: {}, byKind: {}, byStatus: {}, byEnvironment: {} };
    for (const item of items) {
      totals.byModule[item.module] = (totals.byModule[item.module] || 0) + 1;
      totals.byKind[item.kind] = (totals.byKind[item.kind] || 0) + 1;
      totals.byStatus[item.status] = (totals.byStatus[item.status] || 0) + 1;
      if (item.environment) totals.byEnvironment[item.environment] = (totals.byEnvironment[item.environment] || 0) + 1;
    }
    return { total: items.length, ...totals };
  }

  async resources(options = {}) {
    const snapshot = await this.snapshot(options);
    let items = snapshot.items;
    if (options.module) items = items.filter((item) => item.module === options.module);
    if (options.kind) items = items.filter((item) => item.kind === options.kind);
    if (options.status) items = items.filter((item) => item.status === options.status);
    if (options.environment) items = items.filter((item) => item.environment === options.environment);
    if (options.namespace) items = items.filter((item) => item.namespace === options.namespace);
    return {
      ok: true,
      items,
      total: items.length,
      totals: this.totals(items),
      sources: snapshot.sources,
      collectedAt: snapshot.collectedAt,
      durationMs: snapshot.durationMs,
      environments: this.environments.summary(snapshot.items),
    };
  }

  async search(options = {}) {
    const started = Date.now();
    const query = clean(options.query, 200);
    const tokens = query.toLowerCase().split(/\s+/).filter(Boolean);
    const modules = new Set((Array.isArray(options.modules) ? options.modules : []).map((module) => clean(module, 40)).filter(Boolean));
    const kinds = new Set((Array.isArray(options.kinds) ? options.kinds : []).map((kind) => clean(kind, 60)).filter(Boolean));
    const statuses = new Set((Array.isArray(options.statuses) ? options.statuses : []).map((status) => clean(status, 30)).filter(Boolean));
    const environment = clean(options.environment, 60);
    const limit = clamp(options.limit || 40, 1, 200);
    const offset = clamp(options.offset || 0, 0, 10000);

    let resources = [];
    let sourceError = '';
    try {
      const snapshot = await this.snapshot();
      resources = snapshot.items;
    } catch (error) {
      sourceError = safeError(error, 'Resources could not be collected.');
    }
    const matched = [];
    for (const resource of resources) {
      if (modules.size && !modules.has(resource.module)) continue;
      if (kinds.size && !kinds.has(resource.kind)) continue;
      if (statuses.size && !statuses.has(resource.status)) continue;
      if (environment && resource.environment !== environment) continue;
      const score = scoreResource(resource, tokens, query.toLowerCase());
      if (score <= 0) continue;
      matched.push({ score, resource });
    }
    matched.sort((a, b) => b.score - a.score
      || a.resource.module.localeCompare(b.resource.module)
      || a.resource.name.localeCompare(b.resource.name));

    const eventResult = await this.timeline({ limit: 300, query, modules: options.modules, from: options.from, to: options.to }).catch(() => ({ items: [] }));
    const changeResult = this.changeDetector.history({ limit: 200, query, module: options.modules?.[0] });

    const actionMatches = QUICK_ACTIONS.filter((action) => {
      if (modules.size && !modules.has(action.module)) return false;
      if (!tokens.length) return false;
      const haystack = `${action.label} ${action.keywords} ${action.module}`.toLowerCase();
      return tokens.every((token) => haystack.includes(token));
    }).slice(0, 8);

    const page = matched.slice(offset, offset + limit).map((entry) => entry.resource);
    return {
      ok: true,
      query,
      resources: page,
      resourceTotal: matched.length,
      events: (eventResult.items || []).slice(0, 20),
      changes: (changeResult.items || []).slice(0, 20),
      actions: actionMatches,
      counts: {
        resources: matched.length,
        events: eventResult.total || (eventResult.items || []).length,
        changes: changeResult.total || 0,
        actions: actionMatches.length,
      },
      tookMs: Date.now() - started,
      error: sourceError || undefined,
    };
  }

  // ------------------------------------------------------------------- graph

  async graph(options = {}) {
    const started = Date.now();
    let snapshot;
    try {
      snapshot = await this.snapshot();
    } catch (error) {
      return { ok: false, error: safeError(error, 'The infrastructure graph could not be built.') };
    }
    let topology = null;
    if (this.kubernetes && snapshot.sources?.kubernetes?.ok) {
      topology = this.collector.lastTopology || null;
    }
    let spans = [];
    try {
      const all = this.observability?.traceManager?.all?.() || [];
      spans = all.slice(-MAX_GRAPH_SPANS);
    } catch { /* traces are optional */ }
    const graph = buildGraph({ resources: snapshot.items, topology, traces: spans, dockerHost: snapshot.sources?.docker?.host || '' });
    const module = clean(options.module, 40);
    const environment = clean(options.environment, 60);
    if (module || environment) {
      const keep = new Set(graph.nodes.filter((node) => (!module || node.module === module) && (!environment || node.environment === environment)).map((node) => node.id));
      // Keep one hop of neighbours so a filtered graph still shows context.
      for (const edge of graph.edges) {
        if (keep.has(edge.from)) keep.add(edge.to);
        if (keep.has(edge.to)) keep.add(edge.from);
      }
      graph.nodes = graph.nodes.filter((node) => keep.has(node.id));
      graph.edges = graph.edges.filter((edge) => keep.has(edge.from) && keep.has(edge.to));
      graph.stats.nodes = graph.nodes.length;
      graph.stats.edges = graph.edges.length;
      graph.stats.observed = graph.edges.filter((edge) => edge.confidence === 'observed').length;
      graph.stats.inferred = graph.edges.filter((edge) => edge.confidence === 'inferred').length;
    }
    return {
      ...graph,
      durationMs: Date.now() - started,
      collectedAt: snapshot.collectedAt,
      sources: snapshot.sources,
    };
  }

  // ---------------------------------------------------------------- timeline

  async timeline(options = {}) {
    const now = Date.now();
    const to = Number(options.to) || now;
    const from = Number(options.from) || to - 24 * 3600e3;
    const builder = new TimelineBuilder();
    const errors = [];

    const run = async (label, fn) => {
      try {
        await fn();
      } catch (error) {
        errors.push(`${label}: ${safeError(error, 'unavailable')}`);
      }
    };

    await run('docker', async () => {
      if (!this.docker) return;
      const sinceSeconds = clamp(Math.ceil((to - from) / 1000), 60, 7 * 24 * 3600);
      const result = await this.docker.events(sinceSeconds);
      if (result?.ok) builder.docker(result.items || []);
      else if (result?.error) throw new Error(result.error);
    });

    await run('kubernetes', async () => {
      if (!this.kubernetes) return;
      let topology = this.collector.lastTopology;
      if (!topology) {
        topology = await this.kubernetes.topology();
        if (topology?.ok) this.collector.lastTopology = topology;
      }
      if (topology) builder.kubernetes(topology);
    });

    await run('alerts', async () => {
      if (!this.observability) return;
      const result = this.observability.alertsList({ limit: 200 });
      if (result?.items) builder.alerts(result.items);
    });

    await run('incidents', async () => {
      if (!this.observability) return;
      const result = this.observability.incidentsList({ limit: 100 });
      if (result?.items) builder.incidents(result.items);
    });

    await run('databases', async () => {
      if (!this.databases) return;
      const items = this.databases.activityList?.({ limit: 300 }) || [];
      builder.databaseActivity(items);
    });

    await run('changes', async () => {
      const result = this.changeDetector.history({ limit: 500 });
      builder.changes(result.items || []);
    });

    await run('automation', async () => {
      const result = this.automation.runs({ limit: 200 });
      builder.automationRuns(result.items || []);
    });

    const result = builder.list({
      from,
      to,
      modules: options.modules,
      kinds: options.kinds,
      severities: options.severities,
      query: options.query,
      limit: options.limit || 200,
      offset: options.offset || 0,
    });
    return { ...result, from, to, errors: errors.slice(0, 8) };
  }

  // ----------------------------------------------------------------- changes

  async detectChanges() {
    const snapshot = await this.snapshot({ force: true });
    const result = this.changeDetector.detect(snapshot.items);
    return {
      ok: true,
      ...result,
      resources: snapshot.items.length,
      collectedAt: snapshot.collectedAt,
    };
  }

  changesHistory(options = {}) {
    return this.changeDetector.history(options);
  }

  // ------------------------------------------------------------ environments

  environmentsList() {
    return this.environments.list();
  }

  async environmentsSummary() {
    const snapshot = await this.snapshot();
    return this.environments.summary(snapshot.items);
  }

  environmentAssign(resourceId, environmentId) {
    return this.environments.assign(resourceId, environmentId);
  }

  environmentSave(input) {
    return this.environments.saveEnvironment(input);
  }

  environmentDelete(id) {
    return this.environments.deleteEnvironment(id);
  }

  environmentRuleSave(input) {
    return this.environments.saveRule(input);
  }

  environmentRuleDelete(id) {
    return this.environments.deleteRule(id);
  }

  // --------------------------------------------------------------- incidents

  listIncidents(options = {}) {
    if (!this.observability) return { ok: true, items: [], total: 0, unavailable: true };
    return this.observability.incidentsList(options);
  }

  incidentGet(id) {
    if (!this.observability) return { ok: false, error: 'Observability is not available.' };
    return this.observability.incidentGet(id);
  }

  incidentCreate(input = {}) {
    if (!this.observability) return { ok: false, error: 'Observability is not available.' };
    const result = this.observability.incidentCreate(input);
    if (result?.ok) {
      this.store.audit({
        action: 'incident-create',
        module: 'observability',
        resource: result.incident?.id || '',
        detail: result.incident?.title || '',
      });
    }
    return result;
  }

  listAlerts(options = {}) {
    if (!this.observability) return { ok: true, items: [], total: 0, unavailable: true };
    return this.observability.alertsList(options);
  }

  reportGenerate(options = {}) {
    if (!this.observability) return { ok: false, error: 'Observability is not available.' };
    return this.observability.reportGenerate(options);
  }

  reportTypes() {
    if (!this.observability) return { ok: true, types: [] };
    return this.observability.reportTypes();
  }

  // --------------------------------------------------------------------- RCA

  investigate(input = {}) {
    return this.rca.investigate(input);
  }

  // -------------------------------------------------------------- automation

  automations() {
    return this.automation.list();
  }

  automationSave(input) {
    return this.automation.save(input);
  }

  automationDelete(id) {
    return this.automation.remove(id);
  }

  automationSetEnabled(id, enabled) {
    return this.automation.setEnabled(id, enabled);
  }

  automationRun(id, options = {}) {
    return this.automation.runAutomation(id, options);
  }

  automationApprove(runId) {
    return this.automation.approve(runId);
  }

  automationReject(runId, reason) {
    return this.automation.reject(runId, reason);
  }

  automationCancel(runId) {
    return this.automation.cancel(runId);
  }

  automationRuns(options = {}) {
    return this.automation.runs(options);
  }

  automationTick() {
    return this.automation.tick();
  }

  onAutomationEvent(event) {
    this.emit({ type: 'automation', event });
  }

  // ------------------------------------------------------------------ audit

  auditList(options = {}) {
    return { ok: true, items: this.store.auditList(options) };
  }

  // ------------------------------------------------------------- favourites

  favorite(input = {}) {
    return this.store.favorite(input);
  }

  favorites() {
    return this.store.favorites();
  }

  saveSearch(input = {}) {
    return this.store.saveSearch(input);
  }

  savedSearches() {
    return this.store.savedSearches();
  }

  removeSaved(id) {
    return this.store.removeSaved(id);
  }

  saveWorkspace(input = {}) {
    return this.store.saveWorkspace(input);
  }

  workspaces() {
    return this.store.workspaces();
  }

  removeWorkspace(id) {
    return this.store.removeWorkspace(id);
  }

  // --------------------------------------------------------------- settings

  updateSettings(patch = {}) {
    const data = this.store.get();
    if (patch.automationEnabled !== undefined) data.settings.automationEnabled = patch.automationEnabled === true;
    if (patch.automationIntervalSec !== undefined) {
      data.settings.automationIntervalSec = clamp(patch.automationIntervalSec, 5, 3600);
    }
    if (patch.environmentMatch !== undefined) data.settings.environmentMatch = patch.environmentMatch === true;
    this.store.schedule();
    this.store.audit({ action: 'settings-update', module: 'intelligence', detail: JSON.stringify(patch).slice(0, 400) });
    return { ok: true, settings: data.settings };
  }

  // ---------------------------------------------------------------- bridges

  queryMetrics(options = {}) {
    if (!this.observability) return { ok: false, error: 'Observability is not available.', series: [] };
    return this.observability.metricsQuery(options);
  }

  queryLogs(options = {}) {
    if (!this.observability) return { ok: false, error: 'Observability is not available.', rows: [], total: 0 };
    return this.observability.logsQuery(options);
  }

  queryTraces(options = {}) {
    if (!this.observability) return { ok: false, error: 'Observability is not available.', rows: [], total: 0 };
    return this.observability.tracesQuery(options);
  }

  async notify(input = {}) {
    if (!this.observability || typeof this.observability.sendNotification !== 'function') {
      return { ok: false, error: 'Notification channels are not available.', results: [] };
    }
    const result = await this.observability.sendNotification(input);
    this.store.audit({
      action: 'notification-send',
      module: 'intelligence',
      resource: clean(input.title, 200),
      outcome: result?.ok ? 'success' : 'failure',
      detail: (result?.results || []).map((entry) => `${entry.name || entry.id}: ${entry.ok ? 'sent' : entry.error || 'failed'}`).join('; ').slice(0, 800),
    });
    return result;
  }

  queryDatabase(input = {}) {
    if (!this.databases) return { ok: false, error: 'Database access is not available.' };
    return this.databases.query(input);
  }

  restartContainer(id) {
    if (!this.docker) return { ok: false, error: 'Docker is not available.' };
    return this.docker.containerAction(id, 'restart');
  }

  async diagnostics(input = {}) {
    const target = ['database', 'docker', 'kubernetes', 'system'].includes(input.target) ? input.target : 'system';
    const started = Date.now();
    if (target === 'database') {
      if (!this.databases) return { ok: false, error: 'Database access is not available.' };
      if (!input.id) return { ok: false, error: 'Choose a database connection.' };
      const result = await this.databases.diagnostics(input.id);
      return {
        ok: result?.ok !== false,
        summary: result?.ok === false ? (result.error || 'Diagnostics failed.') : 'Database connection diagnostics collected.',
        meta: { target, durationMs: Date.now() - started, result },
      };
    }
    if (target === 'docker') {
      if (!this.docker) return { ok: false, error: 'Docker is not available.' };
      const [status, containers] = await Promise.allSettled([this.docker.status(), this.docker.containersList()]);
      const info = status.status === 'fulfilled' ? status.value : { available: false, reason: 'Status failed.' };
      const list = containers.status === 'fulfilled' ? (containers.value?.items || []) : [];
      const unhealthy = list.filter((entry) => /unhealthy|restarting|dead|exited/i.test(`${entry.state} ${entry.status}`));
      return {
        ok: info.available === true,
        summary: info.available
          ? `Docker ${info.serverVersion || ''}: ${list.length} container(s), ${unhealthy.length} not running cleanly.`
          : (info.reason || 'Docker is not reachable.'),
        meta: { target, durationMs: Date.now() - started, containers: list.length, unhealthy: unhealthy.slice(0, 20).map((entry) => ({ name: entry.name, status: entry.status })) },
      };
    }
    if (target === 'kubernetes') {
      if (!this.kubernetes) return { ok: false, error: 'Kubernetes is not available.' };
      const topology = await this.kubernetes.topology();
      if (!topology?.ok) return { ok: false, error: clean(topology?.error || topology?.connection?.reason || 'The cluster is not reachable.', 400) };
      return {
        ok: true,
        summary: `Cluster ${topology.context || ''}: ${topology.stats?.nodes || 0} node(s), ${topology.stats?.pods || 0} pod(s), ${topology.stats?.totalUnhealthy || 0} unhealthy item(s).`,
        meta: { target, durationMs: Date.now() - started, stats: topology.stats, warnings: (topology.warnings || []).slice(0, 10) },
      };
    }
    const mem = os.totalmem();
    const free = os.freemem();
    return {
      ok: true,
      summary: `${os.type()} ${os.release()} · ${os.cpus().length} CPU(s) · ${Math.round(((mem - free) / mem) * 100)}% memory used.`,
      meta: {
        target,
        durationMs: Date.now() - started,
        platform: process.platform,
        arch: process.arch,
        uptimeSeconds: Math.round(os.uptime()),
        loadAverage: os.loadavg(),
        memoryBytes: mem,
        freeMemoryBytes: free,
      },
    };
  }

  // ---------------------------------------------------------------- lifecycle

  start() {
    if (this.timer || this.disposed) return;
    this.delay = setTimeout(() => {
      this.refresh({ force: true }).catch(() => {});
    }, REFRESH_DELAY_MS);
    this.delay.unref?.();
    this.timer = setInterval(() => {
      this.refresh({ force: false }).catch(() => {});
    }, REFRESH_INTERVAL_MS);
    this.timer.unref?.();
    this.automation.start();
  }

  dispose() {
    this.disposed = true;
    if (this.delay) clearTimeout(this.delay);
    if (this.timer) clearInterval(this.timer);
    this.delay = null;
    this.timer = null;
    this.automation.dispose();
    this.store.persist();
  }

  emit(payload) {
    const win = this.getWindow?.();
    if (win && !win.isDestroyed()) {
      try { win.webContents.send('intel:event', payload); } catch { /* window closing */ }
    }
  }
}

module.exports = { IntelligenceService, QUICK_ACTIONS };
