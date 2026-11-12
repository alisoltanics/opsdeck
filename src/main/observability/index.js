'use strict';

/**
 * OpsDeck ObservabilityService.
 *
 * Owns configuration, bounded storage, collectors, the scheduler, alerting,
 * incidents, dashboards, integrations, logs, traces, reports, agents and
 * remediation. All privileged work stays in the main process; the renderer only
 * receives prepared data over the `obs:` IPC bridge.
 */

const path = require('node:path');
const { SecretVault } = require('../databases/vault');
const { ObservabilityConfig, OVERVIEW_WIDGETS, clean, validHttpUrl, normalizeId } = require('./config');
const { MetricsStore } = require('./storage');
const { quantile } = require('./metrics');
const { sanitizeText } = require('./util');
const { LogManager } = require('./logs');
const { TraceManager } = require('./traces');
const { LocalCollector } = require('./collectors/local');
const { DockerCollector } = require('./collectors/docker');
const { KubernetesCollector } = require('./collectors/kubernetes');
const { DatabaseCollector } = require('./collectors/database');
const { SyntheticCollector } = require('./collectors/synthetic');
const { RemoteCollector } = require('./collectors/remote');
const { NetworkCollector } = require('./collectors/network');
const { ApplicationCollector } = require('./collectors/applications');
const { AlertEngine, defaultRules } = require('./alerts');
const { IncidentManager } = require('./incidents');
const { DashboardEngine } = require('./dashboards');
const { IntegrationManager } = require('./integrations');
const { ReportGenerator } = require('./reports');
const { AgentManager } = require('./agents');
const { RemediationManager, ACTIONS } = require('./remediation');

const START_DELAY = 1200;
const TICK_MS = 2000;
const PERSIST_MS = 60e3;

function iso() { return new Date().toISOString(); }

function cleanHost(value) {
  const host = String(value || '').trim();
  return /^[A-Za-z0-9._:-]{1,253}$/.test(host) ? host : '';
}

function parseTags(value) {
  if (Array.isArray(value)) return value.map((tag) => clean(tag, 40)).filter(Boolean).slice(0, 20);
  return String(value || '').split(',').map((tag) => clean(tag, 40)).filter(Boolean).slice(0, 20);
}

function publicRemoveSecrets(server) {
  const { secret, ...rest } = server || {};
  void secret;
  return rest;
}

class ObservabilityService {
  constructor({ app, docker = null, kubernetes = null, databases = null, getWindow = null }) {
    this.app = app;
    this.docker = docker;
    this.kubernetes = kubernetes;
    this.databases = databases;
    this.getWindow = getWindow;

    this.vault = new SecretVault(app, { keyFile: 'observability.secret' });
    this.config = new ObservabilityConfig(app, this.vault);
    const dir = app.getPath('userData');
    this.metrics = new MetricsStore({
      file: path.join(dir, 'observability-metrics.json.gz'),
      retention: this.config.get().retention,
    }).load();
    this.logManager = new LogManager({
      file: path.join(dir, 'observability-logs.json.gz'),
      maxRecords: this.config.get().retention.maxLogs,
      retentionDays: this.config.get().retention.logsDays,
      docker,
      kubernetes,
      getServer: (id) => this.serverWithSecret(id),
    });
    this.traceManager = new TraceManager({
      file: path.join(dir, 'observability-traces.json.gz'),
      maxRecords: this.config.get().retention.maxTraces,
      retentionDays: this.config.get().retention.tracesDays,
      logManager: this.logManager,
    });

    this.incidents = new IncidentManager({ config: this.config });
    this.dashboards = new DashboardEngine({ config: this.config, store: this.metrics });
    this.alerts = new AlertEngine({
      config: this.config,
      store: this.metrics,
      incidents: this.incidents,
      onChange: () => this.emit('obs:event', { type: 'alerts:changed', at: iso() }),
      onEvent: (event) => {
        this.emit('obs:event', { ...event, at: iso() });
        if (event.type === 'alert:firing' && event.alert) {
          this.remediation.triggerFor(event.alert).then((result) => {
            if (result?.execution) this.emit('obs:event', { type: 'remediation:executed', execution: result.execution, at: iso() });
          }).catch(() => { /* isolated */ });
        }
      },
    });
    this.integrations = new IntegrationManager({ config: this.config, store: this.metrics });
    this.remediation = new RemediationManager({ config: this.config, docker, kubernetes });
    this.reports = new ReportGenerator({
      config: this.config, store: this.metrics, logs: this.logManager,
      traces: this.traceManager, alerts: this.alerts, incidents: this.incidents,
    });

    this.collectors = {
      local: new LocalCollector(),
      docker: new DockerCollector({ docker }),
      kubernetes: new KubernetesCollector({ kubernetes }),
      databases: new DatabaseCollector({ databases, autoConnect: this.config.get().databaseMonitor.autoConnect }),
      synthetic: new SyntheticCollector({ config: this.config, targets: this.targetsWithSecrets() }),
      remote: new RemoteCollector({ getServers: () => this.serversWithSecrets() }),
      network: new NetworkCollector({ getChecks: () => this.config.get().networkChecks || [], getDevices: () => this.networkDevicesWithSecrets() }),
      applications: new ApplicationCollector({ getSpans: () => this.traceManager.all() }),
    };
    this.remediation.synthetic = this.collectors.synthetic;

    this.agents = new AgentManager({
      config: this.config,
      logManager: this.logManager,
      traceManager: this.traceManager,
      onMetrics: (metrics) => this.recordMetrics(metrics, 'otlp'),
      onLogs: (count) => { if (count) this.emit('obs:event', { type: 'logs:changed', count, at: iso() }); },
      onTraces: (count) => { if (count) this.emit('obs:event', { type: 'traces:changed', count, at: iso() }); },
      onSnapshot: (agent, snapshot) => {
        this.emit('obs:event', { type: 'agent:snapshot', agentId: agent.id, at: snapshot.at });
      },
    });

    this.timer = null;
    this.maintenanceTimer = null;
    this.running = new Set();
    this.inFlight = new Set();
    this.nextRun = {};
    this.results = {};
    this.started = false;
    this.startedAt = null;
    this.lastError = '';
    this.lastTickAt = null;
    this.booted = false;

    this.dashboards.seed();
    this.seedAlertRules();
    this.applyRetention();
    this.incidents.onChange = (type, incident) => this.emit('obs:event', { type: `incident:${type}`, incident, at: iso() });
    this.dashboards.onChange = () => this.emit('obs:event', { type: 'dashboards:changed', at: iso() });
    this.integrations.onChange = () => this.emit('obs:event', { type: 'integrations:changed', at: iso() });
  }

  // ---------------------------------------------------------------- lifecycle

  async start() {
    if (this.started) return this.bootstrap();
    this.started = true;
    this.startedAt = iso();
    await this.agents.start();
    const begin = () => {
      this.tick().catch((error) => { this.lastError = error.message || String(error); });
      this.timer = setInterval(() => {
        this.tick().catch((error) => { this.lastError = error.message || String(error); });
      }, TICK_MS);
      this.timer.unref?.();
      this.maintenanceTimer = setInterval(() => this.maintenance(), PERSIST_MS);
      this.maintenanceTimer.unref?.();
    };
    this.startTimer = setTimeout(begin, START_DELAY);
    this.startTimer.unref?.();
    return this.bootstrap();
  }

  async dispose() {
    if (this.timer) clearInterval(this.timer);
    if (this.maintenanceTimer) clearInterval(this.maintenanceTimer);
    if (this.startTimer) clearTimeout(this.startTimer);
    this.timer = null;
    this.maintenanceTimer = null;
    await this.agents.stop().catch(() => {});
    this.config.save();
    this.metrics.persist(true);
    this.logManager.persist(true);
    this.traceManager.persist(true);
    this.started = false;
  }

  seedAlertRules() {
    if (this.config.get().alertRules.length) return;
    this.config.get().alertRules = defaultRules();
    this.config.save();
  }

  applyRetention() {
    const retention = this.config.get().retention;
    this.metrics.updateRetention(retention);
    this.logManager.configure({ maxRecords: retention.maxLogs, retentionDays: retention.logsDays });
    this.traceManager.configure({ maxRecords: retention.maxTraces, retentionDays: retention.tracesDays });
  }

  intervals() {
    const d = this.config.get();
    const base = Math.max(2, d.intervalSec);
    return {
      local: base * 1000,
      docker: Math.max(5, base) * 1000,
      kubernetes: Math.max(10, d.kubernetesMonitor.intervalSec) * 1000,
      databases: Math.max(5, d.databaseMonitor.intervalSec) * 1000,
      synthetic: Math.max(10, d.synthetic.intervalSec) * 1000,
      remote: Math.max(10, d.remote.intervalSec) * 1000,
      network: Math.max(15, d.network.intervalSec) * 1000,
      applications: Math.max(10, d.applications.intervalSec) * 1000,
    };
  }

  async tick() {
    this.lastTickAt = iso();
    if (this.config.get().enabled !== true) return;
    const now = Date.now();
    const intervals = this.intervals();
    const enabled = this.config.get().collectors;
    for (const [key, collector] of Object.entries(this.collectors)) {
      if (enabled[key] === false) continue;
      const due = this.nextRun[key] || 0;
      if (now < due || this.inFlight.has(key)) continue;
      this.nextRun[key] = now + (intervals[key] || 30000);
      this.runCollector(key, collector).catch(() => { /* isolated per collector */ });
    }
    // Alerts are evaluated independently from collection.
    this.alerts.evaluate(now).catch((error) => { this.lastError = `Alerts: ${error.message}`; });
  }

  async runCollector(key, collector) {
    this.inFlight.add(key);
    const started = Date.now();
    try {
      const result = await collector.collect(Date.now());
      const recorded = result.metrics?.length ? this.metrics.record(result.metrics) : { recorded: 0 };
      const summary = {
        key,
        label: collector.label,
        ok: result.ok !== false && result.available !== false,
        available: result.available !== false,
        reason: result.reason || '',
        errors: (result.errors || []).slice(0, 8),
        durationMs: Date.now() - started,
        metrics: recorded.recorded || 0,
        at: iso(),
      };
      this.results[key] = { summary, details: result.details || null, at: Date.now() };
      this.emit('obs:event', { type: 'collector:update', collector: summary, at: iso() });
      return result;
    } catch (error) {
      const summary = {
        key, label: collector.label, ok: false, available: false,
        reason: error.message || String(error), errors: [error.message || String(error)],
        durationMs: Date.now() - started, metrics: 0, at: iso(),
      };
      this.results[key] = { summary, details: null, at: Date.now() };
      this.lastError = `${key}: ${summary.reason}`;
      this.emit('obs:event', { type: 'collector:update', collector: summary, at: iso() });
      return null;
    } finally {
      this.inFlight.delete(key);
    }
  }

  maintenance() {
    const now = Date.now();
    this.metrics.compact(now);
    this.metrics.persist(false);
    this.logManager.configure({ maxRecords: this.config.get().retention.maxLogs, retentionDays: this.config.get().retention.logsDays });
    this.traceManager.configure({ maxRecords: this.config.get().retention.maxTraces, retentionDays: this.config.get().retention.tracesDays });
    this.logManager.persist(false);
    this.traceManager.persist(false);
    const cutoff = now - this.config.get().retention.logsDays * 86400e3;
    for (const key of this.alerts.state.keys()) {
      const parts = key.split('|');
      if (parts.length && !this.config.get().alertRules.some((rule) => rule.id === parts[0])) this.alerts.state.delete(key);
    }
    void cutoff;
  }

  recordMetrics(list, source = 'push') {
    const metrics = (Array.isArray(list) ? list : []).filter(Boolean).map((entry) => ({
      ...entry, source: entry.source || source, method: entry.method || 'push',
    }));
    const result = this.metrics.record(metrics);
    if (result.recorded) this.emit('obs:event', { type: 'metrics:recorded', count: result.recorded, at: iso() });
    return result;
  }

  emit(channel, payload) {
    try {
      const window = this.getWindow?.();
      if (window && !window.isDestroyed()) window.webContents.send(channel, payload);
    } catch { /* renderer may be gone */ }
  }

  // ---------------------------------------------------------------- bootstrap

  bootstrap() {
    this.booted = true;
    return {
      ok: true,
      config: this.config.publicConfig(),
      agent: this.agents.status(),
      credentials: { vault: { secureStorage: this.vault.safeAvailable(), backend: this.vault.backend() } },
      storage: this.metrics.stats(),
      logs: this.logManager.stats(),
      traces: this.traceManager.stats(),
      collectors: this.collectorSummaries(),
      servers: this.listServers(),
      targets: this.listTargets(),
      network: { checks: this.listNetworkChecks(), devices: this.listNetworkDevices() },
      integrations: this.integrations.list(),
      dashboards: this.dashboards.list(),
      alertRules: this.config.get().alertRules,
      alerts: this.alerts.alerts({ limit: 200 }),
      incidents: this.incidents.list({ limit: 100 }),
      channels: this.listChannels(),
      remediation: this.remediation.status(),
      generatedAt: iso(),
    };
  }

  collectorSummaries() {
    const intervals = this.intervals();
    return Object.keys(this.collectors).map((key) => {
      const collector = this.collectors[key];
      const result = this.results[key];
      return {
        key,
        label: collector.label || key,
        enabled: this.config.get().collectors[key] !== false,
        available: result?.summary?.available ?? null,
        ok: result?.summary?.ok ?? null,
        reason: result?.summary?.reason || '',
        errors: result?.summary?.errors || [],
        durationMs: result?.summary?.durationMs ?? null,
        metrics: result?.summary?.metrics ?? 0,
        intervalSec: Math.round((intervals[key] || 0) / 1000),
        lastAt: result ? new Date(result.at).toISOString() : null,
        inFlight: this.inFlight.has(key),
      };
    });
  }

  // ---------------------------------------------------------------- overview

  async overview(options = {}) {
    const range = rangeFrom(options.range || this.config.get().preferences.timeRange || '1h');
    const latest = (name, filter) => this.metrics.latest(name, filter)?.value ?? null;
    const local = this.results.local?.details || null;
    const docker = this.results.docker?.details || null;
    const k8s = this.results.kubernetes?.details || null;
    const dbs = this.results.databases?.details || null;
    const remote = this.results.remote?.details || null;
    const synthetic = this.results.synthetic?.details || null;
    const apps = this.results.applications?.details || null;
    const network = this.results.network?.details || null;

    const disks = this.metrics.latestFor('system.disk.usage', {});
    const networkRx = this.metrics.latestFor('system.network.rx.bytes_per_second', {}).filter((row) => row.labels.interface !== 'lo').reduce((sum, row) => sum + row.value, 0);
    const networkTx = this.metrics.latestFor('system.network.tx.bytes_per_second', {}).filter((row) => row.labels.interface !== 'lo').reduce((sum, row) => sum + row.value, 0);
    const activeAlerts = (this.config.get().alerts || []).filter((alert) => alert.state === 'firing' || alert.state === 'pending');
    const incidentStats = this.incidents.stats();
    const serverRows = remote?.servers || [];
    const hosts = {
      total: 1 + serverRows.length,
      online: 1 + serverRows.filter((server) => server.ok).length,
      offline: serverRows.filter((server) => !server.ok).length,
    };
    const containerSummary = docker?.summary || { total: 0, running: 0, unhealthy: 0, stopped: 0 };
    const clusterSummary = {
      total: k8s?.available ? 1 : 0,
      healthy: k8s?.available && (k8s.nodeSummary?.total || 0) > 0 && (k8s.nodeSummary.ready || 0) === k8s.nodeSummary.total ? 1 : 0,
      unhealthy: k8s?.available && (k8s.nodeSummary?.ready || 0) < (k8s.nodeSummary?.total || 0) ? 1 : 0,
      nodes: k8s?.nodeSummary || { total: 0, ready: 0 },
      pods: k8s?.podCounts || { total: 0, running: 0, pending: 0, failed: 0, crashLoop: 0 },
      workloads: (k8s?.workloads || []).length,
    };
    const databaseSummary = {
      total: (dbs?.connections || []).length,
      up: (dbs?.connections || []).filter((connection) => connection.availability === 'measured').length,
      down: (dbs?.connections || []).filter((connection) => connection.availability === 'unreachable').length,
      idle: (dbs?.connections || []).filter((connection) => connection.availability === 'idle').length,
    };
    const services = serviceHealth({ synthetic, apps, availability: this.availabilityFromStore(range) });

    const score = healthScore({ hosts, containers: containerSummary, cluster: clusterSummary, database: databaseSummary, service: services });

    const system = {
      cpu: latest('system.cpu.usage', { labels: { core: 'all' } }),
      memory: latest('system.memory.usage'),
      disk: disks.length ? Math.max(...disks.map((row) => row.value)) : null,
      disks: disks.map((row) => ({ mount: row.labels.mount, usage: row.value, used: this.metrics.latest('system.disk.used.bytes', { labels: { mount: row.labels.mount } })?.value ?? null, total: this.metrics.latest('system.disk.total.bytes', { labels: { mount: row.labels.mount } })?.value ?? null })).sort((a, b) => b.usage - a.usage),
      networkRx,
      networkTx,
      load1: latest('system.load.1'),
      load5: latest('system.load.5'),
      load15: latest('system.load.15'),
      processCount: latest('system.process.count'),
      uptimeSeconds: latest('system.uptime.seconds'),
      temperature: latest('system.cpu.temperature.celsius'),
      platform: local?.info || null,
    };

    const topConsumers = [
      ...(docker?.containers || []).filter((container) => container.cpuPercent != null).sort((a, b) => b.cpuPercent - a.cpuPercent).slice(0, 5).map((container) => ({ kind: 'container', name: container.name, value: container.cpuPercent, unit: 'percent', detail: `CPU · ${container.state}` })),
      ...(local?.processes || []).slice(0, 5).map((process) => ({ kind: 'process', name: process.name, value: process.cpuPercent, unit: 'percent', detail: `CPU · PID ${process.pid}` })),
      ...(k8s?.pods || []).filter((pod) => pod.cpuMillicores != null).sort((a, b) => b.cpuMillicores - a.cpuMillicores).slice(0, 3).map((pod) => ({ kind: 'pod', name: `${pod.namespace}/${pod.name}`, value: pod.cpuMillicores, unit: 'millicores', detail: 'CPU · Kubernetes' })),
    ].sort((a, b) => b.value - a.value).slice(0, 10);

    const problematic = [
      ...(synthetic?.targets || []).filter((target) => target.ok === false).map((target) => ({ kind: 'synthetic', name: target.name, detail: target.error || 'Check failed' })),
      ...(docker?.containers || []).filter((container) => container.health === 'unhealthy' || container.state === 'restarting').map((container) => ({ kind: 'container', name: container.name, detail: container.status || container.health })),
      ...(dbs?.connections || []).filter((connection) => connection.availability === 'unreachable').map((connection) => ({ kind: 'database', name: connection.name, detail: connection.error || 'Unreachable' })),
      ...(k8s?.pods || []).filter((pod) => pod.crashLoop || pod.oomKilled || pod.phase === 'Failed').map((pod) => ({ kind: 'pod', name: `${pod.namespace}/${pod.name}`, detail: pod.status })),
      ...(apps?.services || []).filter((service) => service.health !== 'healthy').map((service) => ({ kind: 'service', name: service.name, detail: `${service.errorRate.toFixed(1)}% errors` })),
      ...(network?.checks || []).filter((check) => !check.ok).map((check) => ({ kind: 'network', name: check.name, detail: check.error || 'Check failed' })),
    ].slice(0, 12);

    const trends = {
      cpu: this.metrics.query({ names: ['system.cpu.usage'], labels: { core: 'all' }, from: range.from, to: range.to, step: range.step, aggregation: 'avg', limit: 1 }).series[0]?.points || [],
      memory: this.metrics.query({ names: ['system.memory.usage'], from: range.from, to: range.to, step: range.step, aggregation: 'avg', limit: 1 }).series[0]?.points || [],
    };

    const result = {
      ok: true,
      at: iso(),
      enabled: this.config.get().enabled === true,
      range,
      inventory: {
        hosts,
        docker: { total: containerSummary.total || 0, running: containerSummary.running || 0, unhealthy: containerSummary.unhealthy || 0, stopped: containerSummary.stopped || 0, restarts: containerSummary.restarts || 0, available: docker?.available === true },
        kubernetes: clusterSummary,
        databases: databaseSummary,
        applications: { total: (apps?.services || []).length, active: (apps?.services || []).filter((service) => service.lastSeen && Date.now() - Date.parse(service.lastSeen) < 300000).length },
        services: { total: services.total, healthy: services.healthy, degraded: services.degraded, failed: services.failed },
        alerts: { active: activeAlerts.length, critical: activeAlerts.filter((alert) => alert.severity === 'critical').length },
        incidents: { open: incidentStats.open, critical: incidentStats.critical },
      },
      system,
      services,
      score,
      topConsumers,
      problematic,
      trends,
      recentAlerts: activeAlerts.slice(0, 6),
      recentIncidents: (this.config.get().incidents || []).filter((incident) => incident.status !== 'resolved').slice(0, 6),
      collectors: this.collectorSummaries(),
      agents: this.agents.status(),
      widgets: this.config.get().overview.widgets,
      errors: [
        ...(local?.errors || []), ...(docker?.errors || []), ...(k8s?.errors || []),
        ...(dbs?.errors || []), ...(remote?.errors || []), ...(synthetic?.errors || []), ...(network?.errors || []),
      ].slice(0, 12),
      missing: missingData({ docker, k8s, dbs, synthetic, apps, remote }),
    };
    this.lastOverview = result;
    return result;
  }

  availabilityFromStore(range) {
    const result = this.metrics.query({ names: ['synthetic.up'], from: range.from, to: range.to, step: 60000, aggregation: 'avg', limit: 200 });
    const points = result.series.flatMap((series) => series.points.map((point) => point[1]));
    if (!points.length) return null;
    return (points.filter((value) => value >= 1).length / points.length) * 100;
  }

  // ---------------------------------------------------------------- collectors detail

  localDetail() { return this.withSummary('local'); }
  dockerDetail() { return this.withSummary('docker'); }
  kubernetesDetail() { return this.withSummary('kubernetes'); }
  databaseDetail() { return this.withSummary('databases'); }
  remoteDetail() { return this.withSummary('remote'); }
  syntheticDetail() { return this.withSummary('synthetic'); }
  networkDetail() { return this.withSummary('network'); }
  applicationDetail() { return this.withSummary('applications'); }

  withSummary(key) {
    const entry = this.results[key];
    const collector = this.collectors[key];
    return {
      ok: true,
      key,
      label: collector.label,
      enabled: this.config.get().collectors[key] !== false,
      summary: entry?.summary || null,
      details: entry?.details || null,
      at: entry ? new Date(entry.at).toISOString() : null,
    };
  }

  kubernetesDetailData() {
    return this.withSummary('kubernetes');
  }

  // ---------------------------------------------------------------- metrics explorer

  metricsQuery(options = {}) {
    const range = rangeFrom(options.range || '1h', options.from, options.to);
    return this.metrics.query({
      names: Array.isArray(options.names) ? options.names : (options.name ? [options.name] : []),
      source: options.source, resource: options.resource, labels: options.labels,
      from: options.from || range.from, to: options.to || range.to,
      step: options.step || range.step,
      aggregation: options.aggregation || 'avg',
      limit: options.limit || 200,
    });
  }

  metricsCatalog(options = {}) {
    const search = String(options.search || '').toLowerCase();
    let catalog = this.metrics.catalog({ source: options.source || '', resource: options.resource || '' });
    if (search) catalog = catalog.filter((entry) => entry.name.toLowerCase().includes(search));
    return {
      ok: true,
      catalog,
      sources: [...new Set(catalog.flatMap((entry) => entry.sources))].sort(),
      resources: [...new Set(catalog.flatMap((entry) => entry.resources))].sort(),
      stats: this.metrics.stats(),
      at: iso(),
    };
  }

  metricsLabels(name, label) {
    return { ok: true, values: this.metrics.labelValues(name, label) };
  }

  metricsExport(options = {}) {
    const result = this.metricsQuery({ ...options, limit: 500 });
    const lines = ['metric,source,resource,labels,timestamp,value'];
    for (const series of result.series) {
      for (const [timestamp, value] of series.points) {
        lines.push([series.name, series.source, series.resource, JSON.stringify(series.labels || {}), timestamp, value].join(','));
      }
    }
    return { ok: true, content: lines.join('\n'), filename: `opsdeck-metrics-${new Date().toISOString().slice(0, 10)}.csv`, mime: 'text/csv' };
  }

  // ---------------------------------------------------------------- dashboards

  dashboardList() {
    return { ok: true, dashboards: this.dashboards.list(), overviewWidgets: OVERVIEW_WIDGETS };
  }

  dashboardGet(id) { return this.dashboards.get(id); }
  dashboardSave(input) {
    const result = this.dashboards.save(input);
    if (result.ok) this.emit('obs:event', { type: 'dashboards:changed', at: iso() });
    return result;
  }
  dashboardDelete(id) { return this.dashboards.remove(id); }
  dashboardDuplicate(id) { return this.dashboards.duplicate(id); }
  dashboardFavorite(id) { return this.dashboards.toggleFavorite(id); }

  dashboardData(options = {}) {
    const id = String(options.id || '');
    const dashboard = this.dashboards.get(id);
    if (!dashboard.ok) return dashboard;
    const range = rangeFrom(options.range || '1h', options.from, options.to);
    const variables = options.variables && typeof options.variables === 'object' ? options.variables : {};
    const widgets = dashboard.dashboard.widgets.map((widget) => {
      if (String(widget.type).startsWith('logs-')) return this.logWidget(widget);
      const data = this.dashboards.queryWidget(widget, { ...range, variables });
      return { ...data, widget, error: '', note: data.note || '' };
    });
    return { ok: true, dashboard: dashboard.dashboard, range, widgets, at: iso() };
  }

  logWidget(widget) {
    const stats = this.logManager.stats();
    if (widget.type === 'logs-stat') {
      return { widget, rows: [{ name: 'Stored logs', value: stats.records, unit: 'count' }, { name: 'Retention', value: stats.retentionDays, unit: 'days' }], series: [] };
    }
    if (widget.type === 'logs-levels') {
      return { widget, rows: Object.entries(stats.byLevel).map(([name, value]) => ({ name, value })), series: [] };
    }
    if (widget.type === 'logs-sources') {
      return { widget, rows: Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]).slice(0, 12).map(([name, value]) => ({ name, value })), series: [] };
    }
    const result = this.logManager.query({ levels: ['ERROR', 'FATAL'], limit: 60, from: Date.now() - 86400e3 });
    return { widget, rows: result.rows, total: result.total, series: [] };
  }

  // ---------------------------------------------------------------- servers

  listServers() {
    return (this.config.get().servers || []).map((server) => {
      const result = this.results.remote?.details?.servers?.find((entry) => entry.id === server.id);
      return {
        ...this.config.publicServer(server),
        status: result ? { ok: result.ok, at: result.at, error: result.error || '', cpu: result.cpu, memory: result.memory, missing: result.missing || [] } : null,
        agent: server.agentId ? this.agents.items().find((agent) => agent.id === server.agentId) || null : null,
      };
    });
  }

  saveServer(input = {}) {
    const servers = this.config.get().servers || [];
    const existing = servers.find((server) => server.id === input.id);
    if (input.id && !existing) return { ok: false, error: 'That server no longer exists.' };
    const method = ['ssh', 'prometheus', 'agent'].includes(input.method) ? input.method : 'ssh';
    const host = cleanHost(input.host);
    const url = String(input.url || '').slice(0, 500);
    if (method === 'prometheus' && !validHttpUrl(url)) return { ok: false, error: 'A valid http(s) exporter URL is required.' };
    if (method !== 'prometheus' && !host) return { ok: false, error: 'A valid host name or IP is required.' };
    if (method === 'agent' && !input.agentId) return { ok: false, error: 'Choose a registered agent.' };
    const id = normalizeId(input.id, 'server');
    const item = {
      id,
      name: clean(input.name, 160) || host || 'Remote server',
      method,
      host,
      url,
      port: Math.max(1, Math.min(65535, Number(input.port) || (method === 'prometheus' ? 9100 : 22))),
      username: clean(input.username, 120),
      os: input.os === 'windows' ? 'windows' : 'linux',
      group: clean(input.group, 80),
      environment: clean(input.environment, 60),
      tags: parseTags(input.tags),
      enabled: input.enabled !== false,
      agentId: clean(input.agentId, 80),
      timeoutMs: Math.max(3000, Math.min(120000, Number(input.timeoutMs) || 30000)),
      rejectUnauthorized: input.rejectUnauthorized !== false,
      note: clean(input.note, 500),
      createdAt: existing?.createdAt || iso(),
      updatedAt: iso(),
    };
    if (existing) servers[servers.indexOf(existing)] = item;
    else servers.push(item);
    for (const field of ['password', 'privateKey', 'passphrase', 'token']) {
      if (input[field] !== undefined) this.config.setSecret('server', id, field, input[field]);
    }
    this.config.save();
    this.emit('obs:event', { type: 'servers:changed', at: iso() });
    return { ok: true, server: this.config.publicServer(item) };
  }

  deleteServer(id) {
    this.config.get().servers = (this.config.get().servers || []).filter((server) => server.id !== id);
    this.config.deleteSecrets('server', id);
    this.config.save();
    this.emit('obs:event', { type: 'servers:changed', at: iso() });
    return { ok: true };
  }

  serverWithSecret(id) {
    const server = (this.config.get().servers || []).find((entry) => entry.id === id);
    if (!server) return null;
    return {
      ...server,
      secret: {
        password: this.config.getSecret('server', id, 'password'),
        privateKey: this.config.getSecret('server', id, 'privateKey'),
        passphrase: this.config.getSecret('server', id, 'passphrase'),
        token: this.config.getSecret('server', id, 'token'),
      },
      agentSnapshot: server.agentId ? this.agents.snapshotFor(server) : null,
    };
  }

  serversWithSecrets() {
    return (this.config.get().servers || []).filter((server) => server.enabled !== false).map((server) => this.serverWithSecret(server.id)).filter(Boolean);
  }

  async testServer(id) {
    const server = this.serverWithSecret(id);
    if (!server) return { ok: false, error: 'That server was not found.' };
    const started = Date.now();
    try {
      const result = await this.collectors.remote.collectServer(server, Date.now());
      return {
        ok: result.ok === true,
        error: result.error || '',
        durationMs: Date.now() - started,
        at: iso(),
        snapshot: publicRemoveSecrets({ ...result, metrics: undefined }),
      };
    } catch (error) {
      return { ok: false, error: error.message || String(error), durationMs: Date.now() - started };
    }
  }

  // ---------------------------------------------------------------- synthetic targets

  listTargets() {
    return (this.config.get().targets || []).map((target) => {
      const last = this.results.synthetic?.details?.targets?.find((entry) => entry.id === target.id);
      return { ...this.config.publicTarget(target), last: last || null };
    });
  }

  saveTarget(input = {}) {
    const targets = this.config.get().targets || [];
    const existing = targets.find((target) => target.id === input.id);
    if (input.id && !existing) return { ok: false, error: 'That target no longer exists.' };
    const kind = ['http', 'tcp', 'dns', 'tls'].includes(input.kind) ? input.kind : 'http';
    const id = normalizeId(input.id, 'target');
    let url = String(input.url || '').slice(0, 1000);
    let host = cleanHost(input.host);
    if (kind === 'http') {
      if (!validHttpUrl(url)) return { ok: false, error: 'A valid http(s) URL is required.' };
      try { host = new URL(url).hostname; } catch { /* validated above */ }
    } else if (!host) {
      return { ok: false, error: 'A valid host name or IP is required.' };
    }
    const expected = Array.isArray(input.expectedStatus) ? input.expectedStatus.map(Number).filter(Number.isFinite).slice(0, 10)
      : String(input.expectedStatus || '200').split(',').map((value) => Number(value.trim())).filter(Number.isFinite);
    const item = {
      id,
      name: clean(input.name, 160) || url || host,
      kind,
      url,
      host,
      port: Math.max(1, Math.min(65535, Number(input.port) || (kind === 'tcp' ? 80 : 443))),
      method: ['GET', 'POST', 'HEAD', 'PUT', 'PATCH', 'DELETE'].includes(String(input.method || '').toUpperCase()) ? String(input.method).toUpperCase() : 'GET',
      body: String(input.body || '').slice(0, 16000),
      headers: input.headers && typeof input.headers === 'object' ? input.headers : {},
      headerName: clean(input.headerName, 80),
      expectedStatus: expected.length ? expected : [200],
      bodyMatch: String(input.bodyMatch || '').slice(0, 500),
      recordType: ['A', 'AAAA', 'MX', 'TXT', 'CNAME'].includes(String(input.recordType || 'A').toUpperCase()) ? String(input.recordType).toUpperCase() : 'A',
      intervalSec: Math.max(10, Math.min(3600, Number(input.intervalSec) || 60)),
      timeoutMs: Math.max(1000, Math.min(60000, Number(input.timeoutMs) || 10000)),
      enabled: input.enabled !== false,
      group: clean(input.group, 80),
      environment: clean(input.environment, 60),
      tags: parseTags(input.tags),
      rejectUnauthorized: input.rejectUnauthorized !== false,
      note: clean(input.note, 500),
      createdAt: existing?.createdAt || iso(),
      updatedAt: iso(),
    };
    if (existing) targets[targets.indexOf(existing)] = item;
    else targets.push(item);
    for (const field of ['token', 'headerValue', 'password']) {
      if (input[field] !== undefined) this.config.setSecret('target', id, field, input[field]);
    }
    this.config.save();
    this.collectors.synthetic.setTargets(this.targetsWithSecrets());
    this.emit('obs:event', { type: 'targets:changed', at: iso() });
    return { ok: true, target: this.config.publicTarget(item) };
  }

  deleteTarget(id) {
    this.config.get().targets = (this.config.get().targets || []).filter((target) => target.id !== id);
    this.config.deleteSecrets('target', id);
    this.config.save();
    this.collectors.synthetic.setTargets(this.targetsWithSecrets());
    return { ok: true };
  }

  targetsWithSecrets() {
    return (this.config.get().targets || []).map((target) => ({
      ...target,
      secret: {
        token: this.config.getSecret('target', target.id, 'token'),
        headerValue: this.config.getSecret('target', target.id, 'headerValue'),
        password: this.config.getSecret('target', target.id, 'password'),
      },
    }));
  }

  async testTarget(id) {
    const target = this.targetsWithSecrets().find((entry) => entry.id === id);
    if (!target) return { ok: false, error: 'That target was not found.' };
    const result = await this.collectors.synthetic.check(target);
    return { ok: result.ok, result: { ...result, body: undefined, headers: undefined }, at: iso() };
  }

  // ---------------------------------------------------------------- network config

  listNetworkChecks() { return (this.config.get().networkChecks || []).slice(); }
  listNetworkDevices() {
    return (this.config.get().networkDevices || []).map((device) => ({
      ...device,
      community: undefined,
      hasCommunity: this.config.hasSecret('device', device.id, 'community'),
    }));
  }

  saveNetworkCheck(input = {}) {
    const checks = this.config.get().networkChecks || [];
    const existing = checks.find((check) => check.id === input.id);
    const host = cleanHost(input.host);
    if (!host) return { ok: false, error: 'A valid host is required.' };
    const kind = ['ping', 'tcp', 'dns'].includes(input.kind) ? input.kind : 'ping';
    const item = {
      id: normalizeId(input.id, 'netcheck'),
      name: clean(input.name, 160) || host,
      kind,
      host,
      port: Math.max(1, Math.min(65535, Number(input.port) || 80)),
      count: Math.max(1, Math.min(10, Number(input.count) || 4)),
      timeoutMs: Math.max(1000, Math.min(60000, Number(input.timeoutMs) || 6000)),
      enabled: input.enabled !== false,
      group: clean(input.group, 80),
      createdAt: existing?.createdAt || iso(),
      updatedAt: iso(),
    };
    if (existing) checks[checks.indexOf(existing)] = item;
    else checks.push(item);
    this.config.get().networkChecks = checks;
    this.config.save();
    return { ok: true, check: item };
  }

  deleteNetworkCheck(id) {
    this.config.get().networkChecks = (this.config.get().networkChecks || []).filter((check) => check.id !== id);
    this.config.save();
    return { ok: true };
  }

  saveNetworkDevice(input = {}) {
    const devices = this.config.get().networkDevices || [];
    const existing = devices.find((device) => device.id === input.id);
    const host = cleanHost(input.host);
    if (!host) return { ok: false, error: 'A valid SNMP host is required.' };
    const id = normalizeId(input.id, 'device');
    const item = {
      id,
      name: clean(input.name, 160) || host,
      host,
      port: Math.max(1, Math.min(65535, Number(input.port) || 161)),
      version: 'v2c',
      enabled: input.enabled !== false,
      timeoutMs: Math.max(1000, Math.min(30000, Number(input.timeoutMs) || 4000)),
      createdAt: existing?.createdAt || iso(),
      updatedAt: iso(),
    };
    if (existing) devices[devices.indexOf(existing)] = item;
    else devices.push(item);
    if (input.community !== undefined) this.config.setSecret('device', id, 'community', input.community);
    this.config.get().networkDevices = devices;
    this.config.save();
    return { ok: true, device: this.listNetworkDevices().find((device) => device.id === id) };
  }

  deleteNetworkDevice(id) {
    this.config.get().networkDevices = (this.config.get().networkDevices || []).filter((device) => device.id !== id);
    this.config.deleteSecrets('device', id);
    this.config.save();
    return { ok: true };
  }

  networkDevicesWithSecrets() {
    return (this.config.get().networkDevices || []).filter((device) => device.enabled !== false).map((device) => ({
      ...device, community: this.config.getSecret('device', device.id, 'community') || 'public',
    }));
  }

  // ---------------------------------------------------------------- logs

  logsBootstrap() {
    const stats = this.logManager.stats();
    const sources = Object.entries(stats.bySource).sort((a, b) => b[1] - a[1]).slice(0, 50).map(([name, count]) => ({ name, count }));
    return { ok: true, stats, sources, levels: ['TRACE', 'DEBUG', 'INFO', 'WARN', 'ERROR', 'FATAL'] };
  }

  logsQuery(options = {}) {
    return this.logManager.query(options);
  }

  async logsCollect(options = {}) {
    const source = String(options.source || 'local');
    let result;
    if (source === 'docker') result = await this.logManager.collectDocker(options.containerId, options);
    else if (source === 'kubernetes') result = await this.logManager.collectKubernetes(options);
    else if (source === 'remote') result = await this.logManager.collectRemote(options.serverId, options);
    else result = await this.logManager.collectLocal(options);
    if (result.added) this.emit('obs:event', { type: 'logs:changed', count: result.added, at: iso() });
    return { ...result, stats: this.logManager.stats(), at: iso() };
  }

  logsClear() {
    this.logManager.clear();
    this.emit('obs:event', { type: 'logs:changed', count: 0, at: iso() });
    return { ok: true };
  }

  logsExport(options = {}) {
    const rows = this.logManager.exportRows(options);
    const lines = ['timestamp,level,source,service,host,container,namespace,pod,traceId,text'];
    for (const row of rows.reverse()) {
      lines.push([row.timestamp, row.level, row.source, row.service, row.host, row.container, row.namespace, row.pod, row.traceId, JSON.stringify(row.text)].join(','));
    }
    return { ok: true, content: lines.join('\n'), filename: `opsdeck-logs-${new Date().toISOString().slice(0, 10)}.csv`, mime: 'text/csv' };
  }

  // ---------------------------------------------------------------- traces

  tracesBootstrap() {
    return { ok: true, stats: this.traceManager.stats(), services: this.traceManager.services() };
  }

  tracesQuery(options = {}) { return this.traceManager.query(options); }
  traceGet(id) { return this.traceManager.get(id); }
  tracesClear() {
    this.traceManager.clear();
    this.emit('obs:event', { type: 'traces:changed', count: 0, at: iso() });
    return { ok: true };
  }

  // ---------------------------------------------------------------- alerts / incidents

  alertRules() { return { ok: true, rules: this.config.get().alertRules || [] }; }
  alertRuleSave(input) {
    const result = this.alerts.saveRule(input);
    this.emit('obs:event', { type: 'alerts:changed', at: iso() });
    return result;
  }
  alertRuleDelete(id) { return this.alerts.deleteRule(id); }
  alertsList(options) { return this.alerts.alerts(options); }
  alertAcknowledge(id, by) { return this.alerts.acknowledge(id, by); }
  alertResolve(id, note) { return this.alerts.resolve(id, note); }
  silences() { return { ok: true, silences: this.config.get().silences || [], maintenance: this.config.get().maintenance || [] }; }
  silenceCreate(input) { return this.alerts.silence(input); }
  silenceDelete(id) { return this.alerts.unsilence(id); }

  incidentsList(options) { return this.incidents.list(options); }
  incidentGet(id) { return this.incidents.get(id); }
  incidentCreate(input) { return this.incidents.create(input); }
  incidentUpdate(id, patch) { return this.incidents.update(id, patch); }
  incidentMerge(ids) { return this.incidents.merge(ids); }

  // ---------------------------------------------------------------- integrations

  integrationsList() {
    return {
      ok: true,
      items: this.integrations.list(),
      definitions: this.integrations.definitions(),
      vault: { secureStorage: this.vault.safeAvailable(), backend: this.vault.backend() },
    };
  }
  integrationSave(input) { return this.integrations.save(input); }
  integrationDelete(id) { return this.integrations.remove(id); }
  integrationTest(id) { return this.integrations.test(id); }
  integrationDiscover(id) { return this.integrations.discover(id); }
  integrationQuery(id, expression, options) { return this.integrations.query(id, expression, options); }

  // ---------------------------------------------------------------- notifications

  listChannels() {
    return (this.config.get().notifications.channels || []).map((channel) => this.config.publicChannel(channel));
  }

  saveChannel(input = {}) {
    const channels = this.config.get().notifications.channels || [];
    const existing = channels.find((channel) => channel.id === input.id);
    const type = ['webhook', 'slack', 'discord', 'telegram', 'email'].includes(input.type) ? input.type : 'webhook';
    const id = normalizeId(input.id, 'channel');
    const item = {
      id,
      name: clean(input.name, 160) || `${type} channel`,
      type,
      enabled: input.enabled !== false,
      url: String(input.url || '').slice(0, 1000),
      host: cleanHost(input.host),
      port: Number(input.port) || (type === 'email' ? 587 : null),
      secure: input.secure === true,
      starttls: input.starttls !== false,
      username: clean(input.username, 160),
      from: clean(input.from, 240),
      to: parseTags(input.to),
      chatId: clean(input.chatId, 80),
      rejectUnauthorized: input.rejectUnauthorized !== false,
      createdAt: existing?.createdAt || iso(),
      updatedAt: iso(),
    };
    if (existing) channels[channels.indexOf(existing)] = item;
    else channels.push(item);
    for (const field of ['token', 'password', 'secret']) {
      if (input[field] !== undefined) this.config.setSecret('channel', id, field, input[field]);
    }
    this.config.get().notifications.channels = channels;
    this.config.save();
    this.emit('obs:event', { type: 'channels:changed', at: iso() });
    return { ok: true, channel: this.config.publicChannel(item) };
  }

  deleteChannel(id) {
    this.config.get().notifications.channels = (this.config.get().notifications.channels || []).filter((channel) => channel.id !== id);
    this.config.deleteSecrets('channel', id);
    this.config.save();
    return { ok: true };
  }

  async testChannel(id) {
    const channel = (this.config.get().notifications.channels || []).find((entry) => entry.id === id);
    if (!channel) return { ok: false, error: 'That channel was not found.' };
    const { sendChannel } = require('./notify');
    const secret = {
      token: this.config.getSecret('channel', id, 'token'),
      password: this.config.getSecret('channel', id, 'password'),
      secret: this.config.getSecret('channel', id, 'secret'),
    };
    const result = await sendChannel({ ...channel, secret }, {
      type: 'test', at: iso(),
      alert: { name: 'OpsDeck test notification', severity: 'info', summary: 'If you can read this, the channel is configured correctly.', resource: 'local', value: null, threshold: null, startedAt: iso() },
    });
    return { ok: result.ok, result };
  }

  /**
   * Deliver a free-form notification (used by intelligence automations) to the
   * configured channels. Returns one result per channel so the caller can show
   * exactly which delivery failed; it never throws for a single bad channel.
   */
  async sendNotification(input = {}) {
    const channels = (this.config.get().notifications?.channels || []).filter((channel) => channel.enabled !== false);
    const wanted = Array.isArray(input.channelIds) ? input.channelIds.filter(Boolean) : [];
    const selected = wanted.length ? channels.filter((channel) => wanted.includes(channel.id)) : channels;
    if (!selected.length) {
      return { ok: false, error: wanted.length ? 'None of the selected channels exist or are enabled.' : 'No notification channel is enabled.', results: [] };
    }
    const { sendChannel } = require('./notify');
    const severity = ['info', 'warning', 'error', 'critical'].includes(input.severity) ? input.severity : 'info';
    const payload = {
      type: input.type || 'automation',
      at: iso(),
      alert: {
        name: sanitizeText(input.title || 'OpsDeck notification', 200),
        severity,
        summary: sanitizeText(input.message || '', 2000),
        resource: sanitizeText(input.resource || 'intelligence', 200),
        value: null,
        threshold: null,
        startedAt: iso(),
      },
    };
    const results = [];
    for (const channel of selected.slice(0, 10)) {
      try {
        const secret = {
          token: this.config.getSecret('channel', channel.id, 'token'),
          password: this.config.getSecret('channel', channel.id, 'password'),
          secret: this.config.getSecret('channel', channel.id, 'secret'),
        };
        const result = await sendChannel({ ...channel, secret }, payload);
        results.push({
          id: channel.id,
          name: channel.name || channel.type,
          type: channel.type,
          ok: result?.ok === true,
          error: result?.ok === true ? '' : sanitizeText(result?.error || 'Delivery failed.', 300),
        });
      } catch (error) {
        results.push({ id: channel.id, name: channel.name || channel.type, type: channel.type, ok: false, error: sanitizeText(error.message || String(error), 300) });
      }
    }
    const delivered = results.filter((entry) => entry.ok).length;
    this.emit('obs:event', { type: 'notification:sent', delivered, total: results.length, at: iso() });
    return {
      ok: delivered > 0,
      delivered,
      total: results.length,
      results,
      error: delivered ? '' : 'Every channel rejected the notification.',
    };
  }

  // ---------------------------------------------------------------- settings

  updateSettings(patch = {}) {
    const data = this.config.get();
    if (patch.enabled !== undefined) data.enabled = patch.enabled === true;
    if (patch.intervalSec !== undefined) data.intervalSec = Number(patch.intervalSec);
    if (patch.collectors && typeof patch.collectors === 'object') {
      for (const key of Object.keys(data.collectors)) if (patch.collectors[key] !== undefined) data.collectors[key] = patch.collectors[key] !== false;
    }
    if (patch.retention) data.retention = { ...data.retention, ...patch.retention };
    if (patch.databaseMonitor) data.databaseMonitor = { ...data.databaseMonitor, ...patch.databaseMonitor };
    if (patch.overview?.widgets) data.overview.widgets = patch.overview.widgets.filter((widget) => OVERVIEW_WIDGETS.includes(widget));
    if (patch.preferences) data.preferences = { ...data.preferences, ...patch.preferences };
    if (patch.agents) {
      const before = { ...data.agents };
      data.agents = { ...data.agents, ...patch.agents };
      data.agents.enabled = data.agents.enabled === true;
      data.agents.tls = data.agents.tls === true;
      data.agents.port = Math.max(0, Math.min(65535, Number(data.agents.port) || 0));
      data.agents.bind = clean(data.agents.bind, 80) || '127.0.0.1';
      if (before.enabled !== data.agents.enabled || before.port !== data.agents.port || before.bind !== data.agents.bind) {
        this.agents.stop().then(() => this.agents.start()).catch(() => {});
      }
    }
    this.config.normalize();
    this.config.save();
    this.applyRetention();
    this.collectors.databases.setAutoConnect(data.databaseMonitor.autoConnect);
    this.emit('obs:event', { type: 'settings:changed', at: iso() });
    return { ok: true, config: this.config.publicConfig() };
  }

  // ---------------------------------------------------------------- reports

  reportTypes() { return { ok: true, types: this.reports.types() }; }
  reportGenerate(options) { return this.reports.generate(options); }

  // ---------------------------------------------------------------- agents

  agentsStatus() { return { ok: true, status: this.agents.status(), agents: this.agents.items() }; }
  agentCreate(input) { return this.agents.create(input); }
  agentRevoke(id) { return this.agents.revoke(id); }
  agentRemove(id) { return this.agents.remove(id); }
  async agentsRestart() {
    await this.agents.stop();
    return { ok: true, status: await this.agents.start() };
  }

  // ---------------------------------------------------------------- remediation

  remediationStatus() { return { ok: true, ...this.remediation.status() }; }
  remediationPolicySave(input) { return this.remediation.savePolicy(input); }
  remediationPolicyDelete(id) { return this.remediation.removePolicy(id); }
  remediationEnable(value) { return this.remediation.setEnabled(value); }
  remediationExecute(id, options) { return this.remediation.execute(id, options); }

  // ---------------------------------------------------------------- AI context

  aiSnapshot() {
    const overview = this.lastOverview || null;
    const details = {
      local: this.results.local?.details || null,
      docker: this.results.docker?.details || null,
      kubernetes: this.results.kubernetes?.details || null,
      databases: this.results.databases?.details || null,
      remote: this.results.remote?.details || null,
      synthetic: this.results.synthetic?.details || null,
      network: this.results.network?.details || null,
      applications: this.results.applications?.details || null,
    };
    const alerts = (this.config.get().alerts || []).filter((alert) => alert.state === 'firing' || alert.state === 'pending').slice(0, 20);
    const incidents = (this.config.get().incidents || []).filter((incident) => incident.status !== 'resolved').slice(0, 10);
    const missing = missingData({
      docker: details.docker,
      k8s: details.kubernetes,
      dbs: details.databases,
      synthetic: details.synthetic,
      apps: details.applications,
      remote: details.remote,
    });
    return {
      at: iso(),
      overview,
      details,
      alerts,
      incidents,
      collectors: this.collectorSummaries(),
      missing,
      traces: this.traceManager.services().slice(0, 20),
      logs: this.logManager.stats(),
      note: 'Analysis must use only these collected values. Missing data is listed explicitly; do not invent metrics.',
    };
  }

  setLastOverview(value) { this.lastOverview = value; }

  // ---------------------------------------------------------------- backup

  exportConfig() {
    const data = this.config.get();
    const safe = {
      ...data,
      alerts: data.alerts.slice(0, 1000),
      incidents: data.incidents.slice(0, 500),
      secrets: undefined,
    };
    return { ok: true, content: JSON.stringify(safe, null, 2), filename: `opsdeck-observability-${new Date().toISOString().slice(0, 10)}.json` };
  }
}

function rangeFrom(range, from, to) {
  const presets = {
    '15m': 15 * 60e3, '30m': 30 * 60e3, '1h': 3600e3, '3h': 3 * 3600e3,
    '6h': 6 * 3600e3, '12h': 12 * 3600e3, '24h': 86400e3, '7d': 7 * 86400e3, '30d': 30 * 86400e3,
  };
  const end = Number(to) || Date.now();
  const start = Number(from) || end - (presets[range] || 3600e3);
  const span = Math.max(1, end - start);
  const step = Math.max(10000, Math.min(3600e3, Math.ceil(span / 300 / 1000) * 1000));
  return { from: start, to: end, step, range };
}

function serviceHealth({ synthetic, apps, availability }) {
  const targets = synthetic?.targets || [];
  const services = apps?.services || [];
  let healthy = 0;
  let degraded = 0;
  let failed = 0;
  const rows = [];
  for (const target of targets) {
    if (target.skipped) continue;
    const state = target.ok ? 'healthy' : 'failed';
    if (state === 'healthy') healthy += 1; else failed += 1;
    rows.push({ kind: 'synthetic', name: target.name, state, responseMs: target.durationMs, error: target.error || '', certificateDays: target.certificateDays ?? null });
  }
  for (const service of services) {
    const state = service.errorRate > 5 ? 'degraded' : 'healthy';
    if (state === 'healthy') healthy += 1; else degraded += 1;
    rows.push({ kind: 'application', name: service.name, state, responseMs: service.p95Ms, errorRate: service.errorRate, p95Ms: service.p95Ms, requestsPerMinute: service.requestsPerMinute });
  }
  const responseTimes = rows.map((row) => row.responseMs).filter((value) => Number.isFinite(value));
  const errors = [targets.filter((target) => target.ok === false).length, ...services.map((service) => service.errorRate)];
  return {
    total: targets.filter((target) => !target.skipped).length + services.length,
    healthy, degraded, failed,
    availability: availability == null ? null : Number(availability.toFixed(2)),
    responseAvgMs: responseTimes.length ? responseTimes.reduce((sum, value) => sum + value, 0) / responseTimes.length : null,
    responseP95Ms: quantile(responseTimes, 0.95),
    errorRate: services.length ? services.reduce((sum, service) => sum + service.errorRate, 0) / services.length : (targets.length ? (failed / Math.max(1, targets.length)) * 100 : null),
    rows,
    errors: errors.filter(Number.isFinite),
  };
}

function healthScore({ hosts, containers, cluster, database, service }) {
  const components = [];
  const add = (key, label, score, weight, available, detail) => components.push({ key, label, score: score == null ? null : Math.max(0, Math.min(100, score)), weight, available: available && score != null, detail });
  add('hosts', 'Hosts online', hosts.total ? (hosts.online / hosts.total) * 100 : 100, 0.25, true, `${hosts.online}/${hosts.total} online`);
  const containerScore = containers.total ? ((containers.running || 0) / containers.total) * 100 - (containers.unhealthy || 0) * 10 : null;
  add('containers', 'Container health', containerScore, 0.2, Boolean(containers.total), containers.total ? `${containers.running}/${containers.total} running, ${containers.unhealthy} unhealthy` : 'No containers');
  const nodeTotal = cluster.nodes?.total || 0;
  add('kubernetes', 'Kubernetes nodes', nodeTotal ? ((cluster.nodes.ready || 0) / nodeTotal) * 100 : null, 0.2, nodeTotal > 0, nodeTotal ? `${cluster.nodes.ready}/${nodeTotal} ready` : 'No cluster connected');
  add('databases', 'Databases reachable', database.total ? (database.up / database.total) * 100 : null, 0.15, database.total > 0, database.total ? `${database.up}/${database.total} measured` : 'No monitored connections');
  add('services', 'Service health', service.total ? ((service.healthy + service.degraded * 0.5) / service.total) * 100 : null, 0.2, service.total > 0, service.total ? `${service.healthy} healthy, ${service.degraded} degraded, ${service.failed} failed` : 'No synthetic or APM services');
  const available = components.filter((component) => component.available);
  if (!available.length) return { value: null, label: 'Unknown', components, formula: 'No component has enough data to score health.' };
  const weightSum = available.reduce((sum, component) => sum + component.weight, 0);
  const value = available.reduce((sum, component) => sum + component.score * component.weight, 0) / weightSum;
  return {
    value: Number(value.toFixed(1)),
    label: value >= 90 ? 'Healthy' : value >= 70 ? 'Degraded' : 'Critical',
    components,
    formula: `Weighted average over available components: ${available.map((component) => `${component.label} ${component.score.toFixed(1)}×${component.weight}`).join(' + ')} ÷ ${weightSum.toFixed(2)}`,
    missing: components.filter((component) => !component.available).map((component) => component.label),
  };
}

function missingData({ docker, k8s, dbs, synthetic, apps, remote }) {
  const missing = [];
  if (!docker?.available) missing.push('Docker metrics (engine unavailable or not installed)');
  if (!k8s?.available) missing.push('Kubernetes metrics (no connected cluster)');
  if (k8s && k8s.available && k8s.topAvailable === false) missing.push('Kubernetes usage metrics (metrics-server / kubectl top unavailable)');
  if (!dbs?.connections?.length) missing.push('Database metrics (no monitored connections)');
  for (const connection of dbs?.connections || []) if (connection.missing?.length) missing.push(`${connection.name}: ${connection.missing.join(', ')}`);
  if (!synthetic?.targets?.length) missing.push('Synthetic checks (no targets configured)');
  if (!apps?.services?.length) missing.push('Application APM (no OTLP spans received)');
  if (!remote?.servers?.length) missing.push('Remote servers (none configured)');
  return [...new Set(missing)].slice(0, 20);
}

module.exports = { ObservabilityService, rangeFrom, healthScore, serviceHealth, missingData, ACTIONS };
