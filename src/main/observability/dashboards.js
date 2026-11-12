'use strict';

/**
 * Dashboard engine and prebuilt dashboards.
 *
 * Widgets only reference metric names that collectors actually produce. The
 * renderer asks the main process for each widget's data, so no series is
 * generated in the UI.
 */

const crypto = require('node:crypto');

const WIDGET_TYPES = [
  'timeseries', 'area', 'bar', 'pie', 'gauge', 'stat', 'table', 'heatmap',
  'histogram', 'scatter', 'status', 'timeline', 'topn', 'latency',
];

const DEFAULT_WIDGETS = [
  { id: 'local-cpu', title: 'CPU usage', type: 'timeseries', metric: 'system.cpu.usage', labels: { core: 'all' }, unit: 'percent', span: 6, height: 220 },
  { id: 'local-memory', title: 'Memory usage', type: 'timeseries', metric: 'system.memory.usage', unit: 'percent', span: 6, height: 220 },
  { id: 'local-disks', title: 'Filesystem usage', type: 'bar', metric: 'system.disk.usage', unit: 'percent', span: 6, height: 240 },
  { id: 'local-network', title: 'Network throughput', type: 'area', metrics: ['system.network.rx.bytes_per_second', 'system.network.tx.bytes_per_second'], unit: 'bytes_per_second', span: 6, height: 240 },
  { id: 'local-load', title: 'Load average', type: 'timeseries', metrics: ['system.load.1', 'system.load.5', 'system.load.15'], span: 6, height: 220 },
  { id: 'local-swap', title: 'Swap usage', type: 'gauge', metric: 'system.swap.usage', unit: 'percent', span: 3, height: 180 },
  { id: 'local-processes', title: 'Process count', type: 'stat', metric: 'system.process.count', span: 3, height: 180 },
  { id: 'local-top-proc', title: 'Top processes by CPU', type: 'table', metric: 'system.process.cpu.usage', unit: 'percent', span: 6, height: 280, groupBy: 'process' },
];

const PREBUILT = [
  {
    id: 'dashboard-local', name: 'Local System Overview', icon: 'monitor', builtin: true,
    description: 'CPU, memory, disk, network, load and processes collected from the OpsDeck host.',
    widgets: DEFAULT_WIDGETS,
  },
  {
    id: 'dashboard-infrastructure', name: 'Server Infrastructure', icon: 'server', builtin: true,
    description: 'Remote server availability, CPU, memory, disk and network.',
    widgets: [
      { id: 'srv-up', title: 'Servers online', type: 'stat', metric: 'server.up', aggregation: 'sum', span: 3, height: 180 },
      { id: 'srv-cpu', title: 'Server CPU', type: 'table', metric: 'server.cpu.usage', unit: 'percent', span: 9, height: 260 },
      { id: 'srv-mem', title: 'Server memory', type: 'timeseries', metric: 'server.memory.usage', unit: 'percent', span: 6, height: 240 },
      { id: 'srv-disk', title: 'Server disk usage', type: 'bar', metric: 'server.disk.usage', unit: 'percent', span: 6, height: 240 },
      { id: 'srv-net', title: 'Server network', type: 'area', metrics: ['server.network.rx.bytes_per_second', 'server.network.tx.bytes_per_second'], unit: 'bytes_per_second', span: 6, height: 240 },
      { id: 'srv-load', title: 'Server load', type: 'timeseries', metric: 'server.load.1', span: 6, height: 240 },
    ],
  },
  {
    id: 'dashboard-docker', name: 'Docker Overview', icon: 'box', builtin: true,
    description: 'Container CPU, memory, health, restarts, storage and Compose projects.',
    widgets: [
      { id: 'docker-running', title: 'Running containers', type: 'stat', metric: 'docker.containers.running', span: 3, height: 180 },
      { id: 'docker-unhealthy', title: 'Unhealthy containers', type: 'stat', metric: 'docker.containers.unhealthy', span: 3, height: 180 },
      { id: 'docker-restarts', title: 'Restart count', type: 'stat', metric: 'docker.containers.restarts', span: 3, height: 180 },
      { id: 'docker-cpu', title: 'Container CPU', type: 'topn', metric: 'docker.container.cpu.usage', unit: 'percent', span: 6, height: 280 },
      { id: 'docker-mem', title: 'Container memory', type: 'topn', metric: 'docker.container.memory.bytes', unit: 'bytes', span: 6, height: 280 },
      { id: 'docker-cpu-history', title: 'CPU history', type: 'timeseries', metric: 'docker.container.cpu.usage', unit: 'percent', span: 6, height: 240 },
      { id: 'docker-storage', title: 'Docker storage', type: 'bar', metric: 'docker.storage.bytes', unit: 'bytes', span: 6, height: 240 },
      { id: 'docker-compose', title: 'Compose projects', type: 'table', metric: 'docker.compose.running', span: 6, height: 260 },
    ],
  },
  {
    id: 'dashboard-kubernetes', name: 'Kubernetes Overview', icon: 'cloud', builtin: true,
    description: 'Cluster node and pod health, restarts, workload readiness and resource usage.',
    widgets: [
      { id: 'k8s-nodes', title: 'Ready nodes', type: 'stat', metric: 'k8s.nodes.ready', span: 3, height: 180 },
      { id: 'k8s-pods', title: 'Running pods', type: 'stat', metric: 'k8s.pods.running', span: 3, height: 180 },
      { id: 'k8s-crash', title: 'CrashLoopBackOff', type: 'stat', metric: 'k8s.pods.crashloop', span: 3, height: 180 },
      { id: 'k8s-unhealthy', title: 'Degraded workloads', type: 'stat', metric: 'k8s.workloads.degraded', span: 3, height: 180 },
      { id: 'k8s-pod-cpu', title: 'Pod CPU', type: 'topn', metric: 'k8s.pod.cpu.millicores', span: 6, height: 280 },
      { id: 'k8s-pod-mem', title: 'Pod memory', type: 'topn', metric: 'k8s.pod.memory.bytes', unit: 'bytes', span: 6, height: 280 },
      { id: 'k8s-node-cpu', title: 'Node CPU usage', type: 'bar', metric: 'k8s.node.cpu.usage.millicores', span: 6, height: 240 },
      { id: 'k8s-node-mem', title: 'Node memory usage', type: 'bar', metric: 'k8s.node.memory.usage.bytes', unit: 'bytes', span: 6, height: 240 },
    ],
  },
  {
    id: 'dashboard-databases', name: 'Database Overview', icon: 'database', builtin: true,
    description: 'Availability, connections, cache hit ratio, query throughput and engine-specific metrics.',
    widgets: [
      { id: 'db-up', title: 'Databases up', type: 'stat', metric: 'database.up', aggregation: 'sum', span: 3, height: 180 },
      { id: 'db-connections', title: 'Active connections', type: 'topn', metric: 'database.connections.active', span: 6, height: 260 },
      { id: 'db-cache', title: 'Cache hit ratio', type: 'topn', metric: 'database.cache.hit_ratio', unit: 'percent', span: 6, height: 260 },
      { id: 'db-history', title: 'Connection history', type: 'timeseries', metric: 'database.connections.active', span: 6, height: 240 },
      { id: 'db-slow', title: 'Slow queries', type: 'topn', metric: 'database.queries.slow', span: 6, height: 240 },
    ],
  },
  {
    id: 'dashboard-applications', name: 'Application Performance', icon: 'activity', builtin: true,
    description: 'Service request rate, error rate and latency percentiles from OTLP spans.',
    widgets: [
      { id: 'app-rpm', title: 'Requests per minute', type: 'topn', metric: 'application.requests.per_minute', span: 6, height: 260 },
      { id: 'app-errors', title: 'Error rate', type: 'topn', metric: 'application.error_rate', unit: 'percent', span: 6, height: 260 },
      { id: 'app-p95', title: 'p95 latency', type: 'topn', metric: 'application.response.p95_ms', unit: 'milliseconds', span: 6, height: 260 },
      { id: 'app-p99', title: 'p99 latency', type: 'timeseries', metric: 'application.response.p99_ms', unit: 'milliseconds', span: 6, height: 260 },
    ],
  },
  {
    id: 'dashboard-network', name: 'Network Overview', icon: 'network', builtin: true,
    description: 'Interface throughput, latency, packet loss and SNMP device status.',
    widgets: [
      { id: 'net-checks', title: 'Checks failed', type: 'stat', metric: 'network.checks.failed', span: 3, height: 180 },
      { id: 'net-latency', title: 'Latency', type: 'timeseries', metric: 'network.check.latency_ms', unit: 'milliseconds', span: 9, height: 220 },
      { id: 'net-loss', title: 'Packet loss', type: 'bar', metric: 'network.check.packet_loss', unit: 'percent', span: 6, height: 240 },
      { id: 'net-rx', title: 'Local throughput', type: 'area', metrics: ['system.network.rx.bytes_per_second', 'system.network.tx.bytes_per_second'], unit: 'bytes_per_second', span: 6, height: 240 },
    ],
  },
  {
    id: 'dashboard-api', name: 'API Monitoring', icon: 'globe', builtin: true,
    description: 'Synthetic availability, response time, HTTP status and certificate expiry.',
    widgets: [
      { id: 'api-up', title: 'Targets up', type: 'stat', metric: 'synthetic.up', aggregation: 'sum', span: 3, height: 180 },
      { id: 'api-down', title: 'Targets down', type: 'stat', metric: 'synthetic.targets.down', span: 3, height: 180 },
      { id: 'api-response', title: 'Response time', type: 'timeseries', metric: 'synthetic.response.ms', unit: 'milliseconds', span: 6, height: 240 },
      { id: 'api-table', title: 'Target health', type: 'table', metric: 'synthetic.up', span: 6, height: 280 },
      { id: 'api-certs', title: 'Certificate expiry', type: 'topn', metric: 'synthetic.certificate.days', span: 6, height: 240 },
    ],
  },
  {
    id: 'dashboard-logs', name: 'Logs Overview', icon: 'file-text', builtin: true,
    description: 'Log volume by severity and source; requires logs to be collected first.',
    widgets: [
      { id: 'logs-total', title: 'Stored logs', type: 'logs-stat', span: 4, height: 180 },
      { id: 'logs-levels', title: 'By severity', type: 'logs-levels', span: 4, height: 220 },
      { id: 'logs-sources', title: 'Top sources', type: 'logs-sources', span: 4, height: 220 },
      { id: 'logs-recent', title: 'Recent errors', type: 'logs-recent', span: 12, height: 320 },
    ],
  },
];

function validWidget(input = {}) {
  const type = WIDGET_TYPES.includes(input.type) || String(input.type || '').startsWith('logs-') ? input.type : 'timeseries';
  return {
    id: typeof input.id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{1,80}$/.test(input.id) ? input.id : `w-${crypto.randomUUID().slice(0, 8)}`,
    title: String(input.title || 'Widget').slice(0, 160),
    type,
    metric: String(input.metric || '').slice(0, 180),
    metrics: Array.isArray(input.metrics) ? input.metrics.map((name) => String(name).slice(0, 180)).slice(0, 8) : [],
    source: String(input.source || '').slice(0, 80),
    resource: String(input.resource || '').slice(0, 180),
    labels: input.labels && typeof input.labels === 'object' ? input.labels : {},
    aggregation: String(input.aggregation || 'avg').slice(0, 20),
    unit: String(input.unit || '').slice(0, 30),
    span: Math.max(1, Math.min(12, Number(input.span) || 6)),
    height: Math.max(120, Math.min(600, Number(input.height) || 240)),
    groupBy: String(input.groupBy || '').slice(0, 80),
    options: input.options && typeof input.options === 'object' ? input.options : {},
    thresholds: Array.isArray(input.thresholds) ? input.thresholds.slice(0, 8) : [],
  };
}

function validDashboard(input = {}) {
  const id = typeof input.id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{2,80}$/.test(input.id) ? input.id : `dashboard-${crypto.randomUUID()}`;
  return {
    id,
    name: String(input.name || 'Untitled dashboard').slice(0, 160),
    description: String(input.description || '').slice(0, 1000),
    icon: String(input.icon || 'layout-dashboard').slice(0, 40),
    builtin: input.builtin === true,
    favorite: input.favorite === true,
    variables: Array.isArray(input.variables) ? input.variables.slice(0, 20) : [],
    widgets: Array.isArray(input.widgets) ? input.widgets.map(validWidget).slice(0, 80) : [],
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

class DashboardEngine {
  constructor({ config, store = null }) {
    this.config = config;
    this.store = store;
    this.onChange = null;
  }

  seed() {
    if (!this.config.get().dashboards.length) {
      this.config.get().dashboards = PREBUILT.map((dashboard) => validDashboard(dashboard));
      this.config.save();
    }
  }

  list() {
    return (this.config.get().dashboards || []).map((dashboard) => ({
      id: dashboard.id, name: dashboard.name, description: dashboard.description,
      icon: dashboard.icon, builtin: dashboard.builtin, favorite: dashboard.favorite,
      widgetCount: dashboard.widgets.length, widgets: dashboard.widgets.length, updatedAt: dashboard.updatedAt,
    }));
  }

  get(id) {
    const dashboard = (this.config.get().dashboards || []).find((entry) => entry.id === id);
    return dashboard ? { ok: true, dashboard } : { ok: false, error: 'That dashboard was not found.' };
  }

  save(input = {}) {
    const dashboards = this.config.get().dashboards || [];
    const existing = dashboards.find((entry) => entry.id === input.id);
    if (existing?.builtin && input.allowOverride !== true) return { ok: false, error: 'Built-in dashboards are read-only. Duplicate this dashboard to edit it.' };
    const dashboard = validDashboard({ ...(existing || {}), ...input, id: existing?.id || input.id });
    dashboard.builtin = existing?.builtin === true;
    dashboard.createdAt = existing?.createdAt || dashboard.createdAt;
    if (existing) {
      const index = dashboards.indexOf(existing);
      dashboards[index] = dashboard;
    } else dashboards.push(dashboard);
    this.config.save();
    this.onChange?.();
    return { ok: true, dashboard };
  }

  remove(id) {
    const dashboards = this.config.get().dashboards || [];
    const dashboard = dashboards.find((entry) => entry.id === id);
    if (!dashboard) return { ok: false, error: 'That dashboard was not found.' };
    if (dashboard.builtin) return { ok: false, error: 'Built-in dashboards cannot be deleted. Duplicate it instead.' };
    this.config.get().dashboards = dashboards.filter((entry) => entry.id !== id);
    this.config.save();
    this.onChange?.();
    return { ok: true, removed: id };
  }

  duplicate(id) {
    const dashboard = (this.config.get().dashboards || []).find((entry) => entry.id === id);
    if (!dashboard) return { ok: false, error: 'That dashboard was not found.' };
    const copy = validDashboard({
      ...dashboard, id: `dashboard-${crypto.randomUUID()}`, name: `${dashboard.name} (copy)`,
      builtin: false, favorite: false,
    });
    this.config.get().dashboards.push(copy);
    this.config.save();
    this.onChange?.();
    return { ok: true, dashboard: copy };
  }

  toggleFavorite(id) {
    const dashboard = (this.config.get().dashboards || []).find((entry) => entry.id === id);
    if (!dashboard) return { ok: false, error: 'That dashboard was not found.' };
    dashboard.favorite = !dashboard.favorite;
    dashboard.updatedAt = new Date().toISOString();
    this.config.save();
    this.onChange?.();
    return { ok: true, dashboard };
  }

  queryWidget(widget, { from, to, step, variables = {} } = {}) {
    const resolved = this.resolveWidget(widget, variables);
    const names = resolved.metrics.length ? resolved.metrics : (resolved.metric ? [resolved.metric] : []);
    if (!names.length) return { widgetId: widget.id, series: [], rows: [], note: 'This widget has no metric selected.' };
    const latestOnly = ['stat', 'gauge', 'pie', 'bar', 'topn', 'table', 'status', 'heatmap'].includes(resolved.type);
    if (latestOnly) {
      const rows = [];
      for (const name of names) {
        for (const entry of this.store ? this.store.latestFor(name, { source: resolved.source, resource: resolved.resource, labels: resolved.labels }) : []) {
          rows.push({ ...entry, metric: name });
        }
      }
      rows.sort((a, b) => b.value - a.value);
      return { widgetId: widget.id, type: resolved.type, rows: rows.slice(0, 500), series: [], unit: resolved.unit || rows[0]?.unit || '' };
    }
    const result = this.store ? this.store.query({
      names, source: resolved.source, resource: resolved.resource, labels: resolved.labels,
      from, to, step, aggregation: resolved.aggregation, limit: 40,
    }) : { series: [] };
    return { widgetId: widget.id, type: resolved.type, series: result.series || [], rows: [], unit: resolved.unit || result.series?.[0]?.unit || '', truncated: result.truncated === true };
  }

  resolveWidget(widget, variables = {}) {
    const replace = (value) => String(value || '').replace(/\$\{?([a-zA-Z0-9_]+)\}?/g, (match, key) => (variables[key] != null ? String(variables[key]) : match));
    return {
      ...widget,
      metric: replace(widget.metric),
      metrics: (widget.metrics || []).map(replace),
      resource: replace(widget.resource),
      source: replace(widget.source),
      labels: Object.fromEntries(Object.entries(widget.labels || {}).map(([key, value]) => [key, replace(value)])),
    };
  }
}

module.exports = { DashboardEngine, PREBUILT, WIDGET_TYPES, DEFAULT_WIDGETS, validDashboard, validWidget };
