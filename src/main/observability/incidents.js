'use strict';

/**
 * Incident manager.
 *
 * Incidents are created from real alerts and keep a bounded timeline. Alert
 * deduplication prevents one flapping metric from creating a new incident on
 * every evaluation.
 */

const crypto = require('node:crypto');

const SEVERITIES = ['info', 'warning', 'critical'];
const STATUSES = ['open', 'acknowledged', 'mitigated', 'resolved'];

function nowIso() {
  return new Date().toISOString();
}

function validSeverity(value) {
  return SEVERITIES.includes(String(value)) ? String(value) : 'warning';
}

class IncidentManager {
  constructor({ config }) {
    this.config = config;
    this.onChange = null;
  }

  list(options = {}) {
    let items = this.config.get().incidents || [];
    const status = String(options.status || '');
    const severity = String(options.severity || '');
    const search = String(options.search || '').toLowerCase();
    if (status) items = items.filter((item) => item.status === status);
    if (severity) items = items.filter((item) => item.severity === severity);
    if (search) items = items.filter((item) => `${item.title} ${item.summary} ${(item.services || []).join(' ')}`.toLowerCase().includes(search));
    items = [...items].sort((a, b) => Date.parse(b.updatedAt || b.createdAt) - Date.parse(a.updatedAt || a.createdAt));
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 100));
    return { ok: true, items: items.slice(0, limit), total: items.length };
  }

  get(id) {
    const incident = (this.config.get().incidents || []).find((item) => item.id === id);
    return incident ? { ok: true, incident } : { ok: false, error: 'That incident was not found.' };
  }

  create(input = {}) {
    const incident = {
      id: `inc-${crypto.randomUUID()}`,
      title: String(input.title || 'Monitoring incident').slice(0, 240),
      summary: String(input.summary || '').slice(0, 2000),
      severity: validSeverity(input.severity),
      status: 'open',
      assignee: String(input.assignee || ''),
      services: Array.isArray(input.services) ? input.services.slice(0, 20) : [],
      resources: Array.isArray(input.resources) ? input.resources.slice(0, 30) : [],
      alerts: Array.isArray(input.alerts) ? input.alerts.slice(0, 100) : [],
      groupKey: String(input.groupKey || ''),
      rootCause: '',
      resolution: '',
      createdAt: nowIso(),
      updatedAt: nowIso(),
      acknowledgedAt: null,
      resolvedAt: null,
      timeline: [{ at: nowIso(), type: 'created', text: `Incident opened: ${input.summary || input.title || 'monitoring event'}` }],
    };
    this.config.get().incidents.unshift(incident);
    this.trim();
    this.save();
    this.emit('created', incident);
    return { ok: true, incident };
  }

  fromAlert(alert, options = {}) {
    if (options.incident === false) return { ok: true, incident: null };
    const groupKey = String(options.groupKey || alert.groupKey || `${alert.ruleId}:${alert.resource || ''}`);
    const open = (this.config.get().incidents || []).find((item) => item.groupKey === groupKey && !['resolved'].includes(item.status));
    if (open) {
      open.alerts = [...new Set([...(open.alerts || []), alert.id])].slice(0, 100);
      open.resources = [...new Set([...(open.resources || []), alert.resource].filter(Boolean))].slice(0, 30);
      open.services = [...new Set([...(open.services || []), ...(alert.labels?.service ? [alert.labels.service] : [])])].slice(0, 20);
      if (severityRank(alert.severity) > severityRank(open.severity)) open.severity = alert.severity;
      open.updatedAt = nowIso();
      open.timeline.push({ at: nowIso(), type: 'alert', text: `Alert linked: ${alert.name} (${alert.value ?? '—'})` });
      this.trim();
      this.save();
      this.emit('updated', open);
      return { ok: true, incident: open };
    }
    return this.create({
      title: alert.name,
      summary: alert.summary || `${alert.name} is ${alert.state || 'firing'}.`,
      severity: alert.severity,
      resources: [alert.resource].filter(Boolean),
      services: alert.labels?.service ? [alert.labels.service] : [],
      alerts: [alert.id],
      groupKey,
    });
  }

  update(id, patch = {}) {
    const incident = (this.config.get().incidents || []).find((item) => item.id === id);
    if (!incident) return { ok: false, error: 'That incident was not found.' };
    const before = incident.status;
    if (patch.title) incident.title = String(patch.title).slice(0, 240);
    if (patch.summary != null) incident.summary = String(patch.summary).slice(0, 2000);
    if (patch.severity) incident.severity = validSeverity(patch.severity);
    if (patch.assignee != null) incident.assignee = String(patch.assignee).slice(0, 120);
    if (patch.rootCause != null) incident.rootCause = String(patch.rootCause).slice(0, 4000);
    if (patch.resolution != null) incident.resolution = String(patch.resolution).slice(0, 4000);
    if (patch.status && STATUSES.includes(String(patch.status))) incident.status = String(patch.status);
    if (incident.status === 'acknowledged' && !incident.acknowledgedAt) incident.acknowledgedAt = nowIso();
    if (incident.status === 'resolved' && !incident.resolvedAt) incident.resolvedAt = nowIso();
    if (before !== incident.status) {
      incident.timeline.push({ at: nowIso(), type: 'status', text: `Status changed from ${before} to ${incident.status}.` });
    }
    if (patch.note) incident.timeline.push({ at: nowIso(), type: 'note', text: String(patch.note).slice(0, 2000) });
    incident.updatedAt = nowIso();
    this.save();
    this.emit('updated', incident);
    return { ok: true, incident };
  }

  merge(ids = []) {
    const list = (this.config.get().incidents || []).filter((item) => ids.includes(item.id));
    if (list.length < 2) return { ok: false, error: 'Choose at least two incidents to merge.' };
    const [primary, ...rest] = list.sort((a, b) => severityRank(b.severity) - severityRank(a.severity));
    primary.alerts = [...new Set(list.flatMap((item) => item.alerts || []))].slice(0, 100);
    primary.resources = [...new Set(list.flatMap((item) => item.resources || []))].slice(0, 30);
    primary.services = [...new Set(list.flatMap((item) => item.services || []))].slice(0, 20);
    primary.timeline.push({ at: nowIso(), type: 'merge', text: `Merged incidents: ${rest.map((item) => item.id).join(', ')}` });
    primary.updatedAt = nowIso();
    this.config.get().incidents = (this.config.get().incidents || []).filter((item) => !rest.some((entry) => entry.id === item.id));
    this.save();
    this.emit('updated', primary);
    return { ok: true, incident: primary };
  }

  stats() {
    const items = this.config.get().incidents || [];
    const open = items.filter((item) => item.status !== 'resolved');
    return {
      total: items.length,
      open: open.length,
      critical: open.filter((item) => item.severity === 'critical').length,
      acknowledged: open.filter((item) => item.status === 'acknowledged').length,
      resolved: items.length - open.length,
      last24h: items.filter((item) => Date.parse(item.createdAt) > Date.now() - 86400e3).length,
    };
  }

  trim() {
    const items = this.config.get().incidents || [];
    if (items.length > 500) this.config.get().incidents = items.slice(0, 500);
  }

  save() {
    this.config.save();
    this.onChange?.();
  }

  emit(type, incident) {
    if (this.onChange) this.onChange(type, incident);
  }
}

function severityRank(value) {
  return { info: 1, warning: 2, critical: 3 }[value] || 0;
}

module.exports = { IncidentManager, severityRank, SEVERITIES, STATUSES };
