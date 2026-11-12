'use strict';

/**
 * Unified timeline.
 *
 * Merges real events from every module into one chronological list. Each entry
 * keeps its original module and resource so the UI can link back, and carries
 * an explicit severity instead of implying that every change is an incident.
 */

const { clean } = require('./util');

const SEVERITY_RANK = { info: 0, success: 1, warning: 2, error: 3, critical: 4 };

function severityOfDocker(action, type) {
  const text = `${type} ${action}`.toLowerCase();
  if (/die|kill|oom|destroy|remove|delete|fail/.test(text)) return 'error';
  if (/unhealthy|restart|pause|stop/.test(text)) return 'warning';
  if (/start|create|pull|connect|enable/.test(text)) return 'info';
  if (/health_status: healthy|health_status: healthy/.test(text)) return 'success';
  return 'info';
}

function dockerTitle(event) {
  const attributes = event.attributes || {};
  const name = attributes.name || attributes.container || attributes.image || event.id?.slice(0, 12) || 'resource';
  const action = clean(event.action, 80) || 'changed';
  return `${event.type || 'docker'} ${action}: ${name}`;
}

function eventEntry(input = {}) {
  const at = clean(input.at, 40);
  const parsed = Date.parse(at);
  return {
    id: clean(input.id, 200),
    at: Number.isFinite(parsed) ? new Date(parsed).toISOString() : new Date().toISOString(),
    timestamp: Number.isFinite(parsed) ? parsed : Date.now(),
    module: clean(input.module, 40) || 'observability',
    kind: clean(input.kind, 60) || 'event',
    severity: SEVERITY_RANK[input.severity] === undefined ? 'info' : input.severity,
    title: clean(input.title, 240) || 'Event',
    detail: clean(input.detail, 600),
    resource: clean(input.resource, 240),
    resourceId: clean(input.resourceId, 400),
    href: clean(input.href, 400),
    tags: Array.isArray(input.tags) ? input.tags.slice(0, 12).map((tag) => clean(tag, 60)) : [],
  };
}

class TimelineBuilder {
  constructor() {
    this.entries = [];
  }

  add(entry) {
    if (!entry || !entry.title) return;
    this.entries.push(eventEntry(entry));
  }

  docker(events = []) {
    for (const event of events.slice(0, 500)) {
      const attributes = event.attributes || {};
      const containerId = event.type === 'container' ? (event.id || attributes.container || '') : '';
      this.add({
        id: `docker-${event.time}-${event.type}-${event.action}-${event.id}`,
        at: new Date(event.time || Date.now()).toISOString(),
        module: 'docker',
        kind: event.type || 'event',
        severity: severityOfDocker(event.action, event.type),
        title: dockerTitle(event),
        detail: attributes.image ? `Image ${attributes.image}` : '',
        resource: attributes.name || attributes.container || event.id || '',
        resourceId: containerId ? `docker:container:${containerId}` : '',
        href: event.type === 'container' ? '#/containers' : event.type === 'image' ? '#/images' : event.type === 'network' ? '#/networks' : event.type === 'volume' ? '#/volumes' : '#/events',
        tags: [event.type, event.action].filter(Boolean),
      });
    }
  }

  kubernetes(topology) {
    if (!topology) return;
    for (const warning of topology.warnings || []) {
      this.add({
        id: `k8s-${warning.namespace}-${warning.kind}-${warning.object}-${warning.reason}-${warning.last}`,
        at: warning.last || topology.collectedAt,
        module: 'kubernetes',
        kind: 'warning',
        severity: /fail|error|kill|evict|oom|backoff|unhealthy/i.test(`${warning.reason} ${warning.message}`) ? 'error' : 'warning',
        title: `${warning.reason || 'Warning'}: ${warning.kind || 'Object'} ${warning.object || ''}`.trim(),
        detail: warning.message,
        resource: `${warning.namespace || ''}/${warning.object || ''}`.replace(/^\//, ''),
        href: '#/kubernetes/events',
        tags: ['kubernetes', warning.namespace || '', warning.kind || ''].filter(Boolean),
      });
    }
  }

  alerts(alerts = []) {
    for (const alert of alerts) {
      this.add({
        id: `alert-${alert.id || alert.ruleId || alert.name}-${alert.startedAt || alert.at}`,
        at: alert.startedAt || alert.at,
        module: 'observability',
        kind: 'alert',
        severity: ['critical', 'error', 'warning'].includes(alert.severity) ? alert.severity : 'warning',
        title: `Alert: ${alert.name || alert.ruleName || 'rule triggered'}`,
        detail: alert.summary || alert.message || '',
        resource: alert.resource || '',
        href: '#/observability/alerts',
        tags: ['alert', alert.severity || ''].filter(Boolean),
      });
    }
  }

  incidents(incidents = []) {
    for (const incident of incidents) {
      this.add({
        id: `incident-${incident.id}-${incident.updatedAt || incident.createdAt}`,
        at: incident.updatedAt || incident.createdAt || incident.startedAt,
        module: 'observability',
        kind: 'incident',
        severity: incident.severity === 'critical' ? 'critical' : incident.severity === 'major' ? 'error' : 'warning',
        title: `Incident: ${incident.title || incident.name || incident.id}`,
        detail: incident.summary || incident.note || '',
        resource: incident.resource || '',
        href: `#/intelligence/incidents?id=${encodeURIComponent(incident.id)}`,
        tags: ['incident', incident.status || '', incident.severity || ''].filter(Boolean),
      });
    }
  }

  databaseActivity(items = []) {
    const map = {
      query: 'info', 'data-browse': 'info', 'connection-open': 'info', 'connection-close': 'info',
      'database-created': 'warning', 'database-dropped': 'error', 'local-service': 'info',
      'schema-change': 'warning', migration: 'warning', backup: 'success', restore: 'warning',
    };
    for (const item of items) {
      const kind = clean(item.kind, 60) || 'activity';
      const severity = item.status === 'error' ? 'error' : (map[kind] || 'info');
      this.add({
        id: `db-${item.id || `${item.at}-${kind}`}`,
        at: item.at || item.createdAt,
        module: 'databases',
        kind,
        severity,
        title: `${kind.replace(/-/g, ' ')}${item.connectionName ? ` · ${item.connectionName}` : ''}`,
        detail: item.message || item.query || item.error || '',
        resource: item.connectionName || item.connectionId || '',
        resourceId: item.connectionId ? `databases:database:${item.connectionId}` : '',
        href: '#/databases/activity',
        tags: ['database', item.engine || '', item.status || ''].filter(Boolean),
      });
    }
  }

  changes(changes = []) {
    for (const change of changes) {
      this.add({
        id: `change-${change.id}`,
        at: change.at,
        module: change.module || 'intelligence',
        kind: change.kind || 'change',
        severity: change.severity || 'info',
        title: change.title || 'Infrastructure change',
        detail: change.detail,
        resource: change.resource,
        resourceId: change.resourceId,
        href: change.href || '#/intelligence/changes',
        tags: ['change', ...(change.tags || [])].filter(Boolean),
      });
    }
  }

  automationRuns(runs = []) {
    for (const run of runs) {
      this.add({
        id: `automation-${run.id}`,
        at: run.startedAt,
        module: 'intelligence',
        kind: 'automation',
        severity: run.status === 'failed' ? 'error' : run.status === 'pending-approval' ? 'warning' : run.status === 'succeeded' ? 'success' : 'info',
        title: `Automation: ${run.automationName || run.automationId} ${run.status || ''}`.trim(),
        detail: run.reason || run.error || (run.actions || []).map((action) => action.type).join(', '),
        resource: run.automationName || run.automationId,
        href: '#/intelligence/automation',
        tags: ['automation', run.status || ''].filter(Boolean),
      });
    }
  }

  list(options = {}) {
    const from = Number.isFinite(Number(options.from)) ? Number(options.from) : 0;
    const to = Number.isFinite(Number(options.to)) ? Number(options.to) : Date.now() + 60e3;
    const modules = new Set((Array.isArray(options.modules) ? options.modules : []).map((module) => clean(module, 40)).filter(Boolean));
    const kinds = new Set((Array.isArray(options.kinds) ? options.kinds : []).map((kind) => clean(kind, 60)).filter(Boolean));
    const severities = new Set((Array.isArray(options.severities) ? options.severities : []).map((sev) => clean(sev, 20)).filter(Boolean));
    const query = clean(options.query, 200).toLowerCase();
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 200));
    const offset = Math.max(0, Number(options.offset) || 0);
    const seen = new Set();
    let items = this.entries
      .filter((entry) => entry.timestamp >= from && entry.timestamp <= to)
      .filter((entry) => !modules.size || modules.has(entry.module))
      .filter((entry) => !kinds.size || kinds.has(entry.kind))
      .filter((entry) => !severities.size || severities.has(entry.severity))
      .filter((entry) => {
        if (!query) return true;
        const haystack = `${entry.title} ${entry.detail} ${entry.resource} ${entry.tags.join(' ')}`.toLowerCase();
        return haystack.includes(query);
      })
      .sort((a, b) => b.timestamp - a.timestamp || a.id.localeCompare(b.id))
      .filter((entry) => {
        if (seen.has(entry.id)) return false;
        seen.add(entry.id);
        return true;
      });
    const total = items.length;
    items = items.slice(offset, offset + limit);
    const counts = {};
    for (const entry of this.entries.slice(-2000)) {
      if (entry.timestamp < from || entry.timestamp > to) continue;
      counts[entry.module] = (counts[entry.module] || 0) + 1;
    }
    return { ok: true, items, total, offset, limit, counts, from, to };
  }
}

module.exports = { TimelineBuilder, eventEntry, SEVERITY_RANK, __test: { severityOfDocker, dockerTitle } };
