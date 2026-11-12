'use strict';

/**
 * Alert evaluation engine.
 *
 * Rules are evaluated against the real local time-series store. A rule owns a
 * pending period, a firing state and a recovery condition. Alert fingerprints
 * prevent duplicate rows, and silence / maintenance windows suppress delivery
 * without deleting the underlying alert.
 */

const crypto = require('node:crypto');
const { aggregate } = require('./metrics');
const { sendChannel } = require('./notify');

const OPERATORS = ['>', '>=', '<', '<=', '==', '!='];
const AGGREGATIONS = ['avg', 'max', 'min', 'sum', 'last', 'count', 'median', 'p90', 'p95', 'p99'];
const SEVERITIES = ['info', 'warning', 'critical'];
const MAX_RULE_STATE = 2000;

function nowIso() {
  return new Date().toISOString();
}

function validRule(input = {}) {
  const rule = {
    id: typeof input.id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{3,80}$/.test(input.id) ? input.id : `rule-${crypto.randomUUID()}`,
    name: String(input.name || 'Untitled alert rule').slice(0, 160),
    description: String(input.description || '').slice(0, 1000),
    enabled: input.enabled !== false,
    severity: SEVERITIES.includes(input.severity) ? input.severity : 'warning',
    metric: String(input.metric || '').slice(0, 180),
    source: String(input.source || '').slice(0, 80),
    resource: String(input.resource || '').slice(0, 180),
    labels: input.labels && typeof input.labels === 'object' ? input.labels : {},
    aggregation: AGGREGATIONS.includes(input.aggregation) ? input.aggregation : 'avg',
    operator: OPERATORS.includes(input.operator) ? input.operator : '>',
    threshold: Number.isFinite(Number(input.threshold)) ? Number(input.threshold) : 0,
    forSec: bounded(input.forSec, 0, 86400, 0),
    lookbackSec: bounded(input.lookbackSec, 30, 86400, 300),
    evalIntervalSec: bounded(input.evalIntervalSec, 5, 3600, 30),
    recoveryThreshold: Number.isFinite(Number(input.recoveryThreshold)) ? Number(input.recoveryThreshold) : null,
    recoveryForSec: bounded(input.recoveryForSec, 0, 86400, 0),
    missingData: input.missingData === 'fire' ? 'fire' : 'skip',
    notifyChannels: Array.isArray(input.notifyChannels) ? input.notifyChannels.slice(0, 20) : [],
    incident: input.incident !== false,
    groupKey: String(input.groupKey || '').slice(0, 120),
    labelsMatcher: String(input.labelsMatcher || '').slice(0, 300),
    unit: String(input.unit || '').slice(0, 30),
    createdAt: input.createdAt || nowIso(),
    updatedAt: nowIso(),
  };
  return rule;
}

function bounded(value, min, max, fallback) {
  const n = Number(value);
  return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fallback;
}

function compare(value, operator, threshold) {
  switch (operator) {
    case '>': return value > threshold;
    case '>=': return value >= threshold;
    case '<': return value < threshold;
    case '<=': return value <= threshold;
    case '==': return value === threshold;
    case '!=': return value !== threshold;
    default: return false;
  }
}

function matchesSilence(silence, alert) {
  if (!silence || silence.enabled === false) return false;
  if (silence.until && Date.parse(silence.until) < Date.now()) return false;
  if (silence.ruleId && silence.ruleId !== alert.ruleId) return false;
  if (silence.fingerprint && silence.fingerprint !== alert.fingerprint) return false;
  for (const [key, value] of Object.entries(silence.labels || {})) {
    if (value && String(alert.labels?.[key] ?? '') !== String(value)) return false;
  }
  return true;
}

function inMaintenance(config, alert) {
  const now = Date.now();
  return (config.maintenance || []).some((window) => {
    if (!window || window.enabled === false) return false;
    const start = Date.parse(window.startsAt || '');
    const end = Date.parse(window.endsAt || '');
    if (!(Number.isFinite(start) && Number.isFinite(end)) || now < start || now > end) return false;
    if (Array.isArray(window.ruleIds) && window.ruleIds.length && !window.ruleIds.includes(alert.ruleId)) return false;
    if (Array.isArray(window.resources) && window.resources.length && !window.resources.some((resource) => alert.resource?.includes(resource))) return false;
    return true;
  });
}

class AlertEngine {
  constructor({ config, store, incidents, onChange, onEvent }) {
    this.config = config;
    this.store = store;
    this.incidents = incidents;
    this.onChange = onChange;
    this.onEvent = onEvent;
    this.state = new Map();
    this.lastEval = new Map();
    this.dirty = false;
    this.lastRunAt = 0;
    this.lastError = '';
  }

  rules() {
    return (this.config.get().alertRules || []).map(validRule);
  }

  saveRules(rules) {
    this.config.get().alertRules = rules.map(validRule);
    this.config.save();
    this.onChange?.();
    return { ok: true, rules: this.config.get().alertRules };
  }

  saveRule(input = {}) {
    const rules = this.config.get().alertRules || [];
    const index = rules.findIndex((rule) => rule.id === input.id);
    const rule = validRule(input);
    if (index >= 0) rules[index] = { ...rules[index], ...rule, createdAt: rules[index].createdAt };
    else rules.push(rule);
    this.config.save();
    this.onChange?.();
    return { ok: true, rule };
  }

  deleteRule(id) {
    const rules = this.config.get().alertRules || [];
    this.config.get().alertRules = rules.filter((rule) => rule.id !== id);
    this.config.save();
    this.onChange?.();
    return { ok: true, removed: id };
  }

  alerts(options = {}) {
    let items = this.config.get().alerts || [];
    if (options.state) items = items.filter((item) => item.state === options.state);
    if (options.severity) items = items.filter((item) => item.severity === options.severity);
    if (options.ruleId) items = items.filter((item) => item.ruleId === options.ruleId);
    if (options.search) {
      const search = String(options.search).toLowerCase();
      items = items.filter((item) => `${item.name} ${item.resource} ${item.summary}`.toLowerCase().includes(search));
    }
    const limit = Math.max(1, Math.min(500, Number(options.limit) || 200));
    return { ok: true, items: items.slice(0, limit), total: items.length };
  }

  acknowledge(id, by = '') {
    const alert = (this.config.get().alerts || []).find((item) => item.id === id);
    if (!alert) return { ok: false, error: 'That alert was not found.' };
    alert.acknowledgedAt = alert.acknowledgedAt || nowIso();
    alert.acknowledgedBy = String(by || '').slice(0, 120);
    alert.updatedAt = nowIso();
    this.config.save();
    this.onChange?.();
    return { ok: true, alert };
  }

  resolve(id, note = '') {
    const alert = (this.config.get().alerts || []).find((item) => item.id === id);
    if (!alert) return { ok: false, error: 'That alert was not found.' };
    alert.state = 'resolved';
    alert.resolvedAt = nowIso();
    alert.updatedAt = nowIso();
    alert.resolution = String(note || 'Resolved manually.').slice(0, 1000);
    this.config.save();
    this.onChange?.();
    return { ok: true, alert };
  }

  silence(input = {}) {
    const silence = {
      id: `silence-${crypto.randomUUID()}`,
      ruleId: String(input.ruleId || ''),
      fingerprint: String(input.fingerprint || ''),
      labels: input.labels && typeof input.labels === 'object' ? input.labels : {},
      reason: String(input.reason || '').slice(0, 500),
      startsAt: input.startsAt || nowIso(),
      until: input.until || new Date(Date.now() + 3600e3).toISOString(),
      enabled: true,
      createdAt: nowIso(),
    };
    this.config.get().silences.unshift(silence);
    this.config.get().silences = this.config.get().silences.slice(0, 500);
    this.config.save();
    this.onChange?.();
    return { ok: true, silence };
  }

  unsilence(id) {
    this.config.get().silences = (this.config.get().silences || []).filter((entry) => entry.id !== id);
    this.config.save();
    this.onChange?.();
    return { ok: true };
  }

  async evaluate(now = Date.now()) {
    this.lastRunAt = now;
    const rules = this.rules();
    const active = new Set();
    for (const rule of rules) {
      if (!rule.enabled || !rule.metric) continue;
      const last = this.lastEval.get(rule.id) || 0;
      if (now - last < rule.evalIntervalSec * 1000) continue;
      this.lastEval.set(rule.id, now);
      try {
        await this.evaluateRule(rule, now);
        active.add(rule.id);
      } catch (error) {
        this.lastError = `${rule.name}: ${error.message}`;
      }
    }
    for (const key of [...this.state.keys()]) {
      if (!active.has(key.split('|')[0])) this.state.delete(key);
    }
    if (this.dirty) {
      this.dirty = false;
      this.config.save();
      this.onChange?.();
    }
    return { ok: true, rules: active.size, at: new Date(now).toISOString(), error: this.lastError };
  }

  async evaluateRule(rule, now) {
    const query = this.store.query({
      names: [rule.metric],
      source: rule.source,
      resource: rule.resource,
      labels: rule.labels,
      from: now - rule.lookbackSec * 1000,
      to: now,
      step: 0,
      aggregation: rule.aggregation,
      limit: 500,
    });
    const series = (query.series || []).filter((entry) => pointsMatch(entry.points, rule.labelsMatcher));
    if (!series.length) {
      if (rule.missingData === 'fire') {
        await this.transition(rule, { resource: rule.resource || 'unknown', labels: {}, value: null }, true, now, 'No data was received for this metric.');
      } else {
        await this.transition(rule, { resource: rule.resource || 'unknown', labels: {}, value: null }, false, now, 'No data');
      }
      return;
    }
    for (const entry of series) {
      const values = entry.points.map((point) => point[1]);
      const value = aggregate(values, rule.aggregation);
      const target = { resource: entry.resource, labels: entry.labels, value, unit: entry.unit || rule.unit };
      const firing = value != null && compare(value, rule.operator, rule.threshold);
      await this.transition(rule, target, firing, now, '');
    }
  }

  async transition(rule, target, condition, now, note) {
    const fingerprint = `${rule.id}|${target.resource}|${JSON.stringify(target.labels || {})}`;
    const stateKey = fingerprint;
    const previous = this.state.get(stateKey) || { conditionSince: null, firingSince: null, recoverySince: null };
    const alerts = this.config.get().alerts || [];
    let alert = alerts.find((item) => item.fingerprint === fingerprint && item.state !== 'resolved');

    if (condition) {
      state.previousRecovery = null;
      if (!previous.conditionSince) previous.conditionSince = now;
      const pendingLongEnough = now - previous.conditionSince >= rule.forSec * 1000;
      if (pendingLongEnough && !previous.firingSince) {
        previous.firingSince = now;
        if (!alert) {
          alert = {
            id: `alert-${crypto.randomUUID()}`,
            fingerprint,
            ruleId: rule.id,
            name: rule.name,
            summary: this.summaryFor(rule, target),
            severity: rule.severity,
            state: 'firing',
            value: target.value,
            threshold: rule.threshold,
            operator: rule.operator,
            aggregation: rule.aggregation,
            metric: rule.metric,
            resource: target.resource,
            labels: target.labels || {},
            unit: target.unit || rule.unit,
            startedAt: nowIso(),
            updatedAt: nowIso(),
            resolvedAt: null,
            acknowledgedAt: null,
            notifications: [],
            incidentId: null,
          };
          alerts.unshift(alert);
        } else {
          alert.state = 'firing';
          alert.value = target.value;
          alert.updatedAt = nowIso();
          alert.summary = this.summaryFor(rule, target);
        }
        this.config.get().alerts = alerts.slice(0, 1000);
        this.dirty = true;
        if (alert && !alert.notifiedAt) {
          alert.notifiedAt = nowIso();
          await this.deliver(rule, alert);
          if (rule.incident) {
            const incident = this.incidents?.fromAlert(alert, { incident: true, groupKey: rule.groupKey || undefined });
            if (incident?.incident) alert.incidentId = incident.incident.id;
          }
        }
        this.emit('firing', alert);
      } else if (!previous.firingSince) {
        const pending = alerts.find((item) => item.fingerprint === fingerprint && item.state === 'pending');
        if (!pending && rule.forSec > 0) {
          alerts.unshift({
            id: `alert-${crypto.randomUUID()}`,
            fingerprint, ruleId: rule.id, name: rule.name,
            summary: this.summaryFor(rule, target), severity: rule.severity,
            state: 'pending', value: target.value, threshold: rule.threshold,
            operator: rule.operator, aggregation: rule.aggregation, metric: rule.metric,
            resource: target.resource, labels: target.labels || {}, unit: target.unit || rule.unit,
            startedAt: nowIso(), updatedAt: nowIso(), resolvedAt: null, acknowledgedAt: null,
            notifications: [], incidentId: null,
          });
          this.config.get().alerts = alerts.slice(0, 1000);
          this.dirty = true;
          this.emit('pending', alerts[0]);
        } else if (pending) {
          pending.value = target.value;
          pending.updatedAt = nowIso();
          this.dirty = true;
        }
      } else {
        if (alert) {
          if (alert.value !== target.value) { alert.value = target.value; alert.updatedAt = nowIso(); this.dirty = true; }
        }
      }
    } else {
      previous.conditionSince = null;
      if (previous.firingSince) {
        if (!previous.recoverySince) previous.recoverySince = now;
        if (now - previous.recoverySince >= rule.recoveryForSec * 1000) {
          previous.firingSince = null;
          previous.recoverySince = null;
          if (alert) {
            alert.state = 'resolved';
            alert.resolvedAt = nowIso();
            alert.updatedAt = nowIso();
            alert.resolution = note || 'The recovery condition was met.';
            this.dirty = true;
            this.emit('resolved', alert);
            if (alert.incidentId && this.incidents) {
              this.incidents.update(alert.incidentId, { note: `Alert resolved: ${alert.name}`, status: 'resolved', resolution: 'All linked alerts recovered.' });
            }
          }
        }
      } else {
        if (alert && alert.state === 'pending') {
          alert.state = 'resolved';
          alert.resolvedAt = nowIso();
          alert.updatedAt = nowIso();
          alert.resolution = 'The pending condition cleared before the duration elapsed.';
          this.dirty = true;
        }
      }
    }
    this.state.set(stateKey, previous);
    if (this.state.size > MAX_RULE_STATE) this.state.delete(this.state.keys().next().value);
    void note;
  }

  summaryFor(rule, target) {
    const value = target.value == null ? 'no data' : formatNumber(target.value, target.unit || rule.unit);
    return `${rule.name}: ${rule.metric} ${rule.operator} ${formatNumber(rule.threshold, target.unit || rule.unit)} (observed ${value}) on ${target.resource}.`;
  }

  async deliver(rule, alert) {
    const silences = this.config.get().silences || [];
    if (silences.some((silence) => matchesSilence(silence, alert))) {
      alert.silenced = true;
      return;
    }
    if (inMaintenance(this.config.get(), alert)) {
      alert.silenced = true;
      alert.silenceReason = 'maintenance window';
      return;
    }
    const channelIds = rule.notifyChannels?.length ? rule.notifyChannels : (this.config.get().notifications.channels || []).filter((channel) => channel.enabled !== false).map((channel) => channel.id);
    if (!channelIds.length) return;
    const payload = {
      type: alert.state === 'resolved' ? 'alert.resolved' : 'alert.firing',
      alert: {
        id: alert.id, name: alert.name, summary: alert.summary, severity: alert.severity,
        value: alert.value, threshold: alert.threshold, resource: alert.resource,
        labels: alert.labels, startedAt: alert.startedAt,
      },
      at: nowIso(),
    };
    for (const id of channelIds) {
      const channel = (this.config.get().notifications.channels || []).find((entry) => entry.id === id);
      if (!channel) continue;
      const secret = {
        token: this.config.getSecret('channel', channel.id, 'token'),
        password: this.config.getSecret('channel', channel.id, 'password'),
        secret: this.config.getSecret('channel', channel.id, 'secret'),
      };
      const result = await sendChannel({ ...channel, secret }, payload);
      alert.notifications = [...(alert.notifications || []), {
        at: nowIso(), channel: channel.name || channel.type, ok: result.ok,
        error: result.error || '', status: result.status || null,
      }].slice(-20);
      this.dirty = true;
    }
  }

  emit(type, alert) {
    this.onEvent?.({ type: `alert:${type}`, alert });
  }
}

function pointsMatch(points, matcher) {
  if (!matcher) return true;
  const values = (points || []).map((point) => point[1]);
  const match = /^([a-zA-Z_][\w]*)\s*(>=|<=|==|!=|>|<)\s*(-?[\d.]+)$/.exec(String(matcher).trim());
  if (!match) return true;
  const [, , operator, raw] = match;
  const threshold = Number(raw);
  return values.some((value) => compare(Number(value), operator, threshold));
}

function formatNumber(value, unit) {
  if (!Number.isFinite(Number(value))) return '—';
  const n = Number(value);
  if (unit === 'percent') return `${n.toFixed(1)}%`;
  if (unit === 'bytes') return `${(n / 1024 ** 3).toFixed(2)} GB`;
  if (unit === 'milliseconds') return `${n.toFixed(0)} ms`;
  return n.toLocaleString('en-US', { maximumFractionDigits: 2 });
}

function defaultRules() {
  return [
    { name: 'CPU usage high', metric: 'system.cpu.usage', labels: { core: 'all' }, aggregation: 'avg', operator: '>', threshold: 90, forSec: 300, severity: 'warning', description: 'Local CPU stayed above 90% for five minutes.', unit: 'percent' },
    { name: 'Memory usage high', metric: 'system.memory.usage', aggregation: 'avg', operator: '>', threshold: 90, forSec: 300, severity: 'warning', description: 'Local memory stayed above 90% for five minutes.', unit: 'percent' },
    { name: 'Disk usage high', metric: 'system.disk.usage', aggregation: 'max', operator: '>', threshold: 90, forSec: 300, severity: 'warning', description: 'A local filesystem is above 90% capacity.', unit: 'percent' },
    { name: 'Docker container unhealthy', metric: 'docker.containers.unhealthy', aggregation: 'max', operator: '>', threshold: 0, forSec: 60, severity: 'critical', description: 'At least one container reports an unhealthy health check.', unit: 'count' },
    { name: 'Kubernetes pod crash loop', metric: 'k8s.pods.crashloop', aggregation: 'max', operator: '>', threshold: 0, forSec: 60, severity: 'critical', description: 'A pod is in CrashLoopBackOff.', unit: 'count' },
    { name: 'Kubernetes node not ready', metric: 'k8s.nodes.not_ready', aggregation: 'max', operator: '>', threshold: 0, forSec: 60, severity: 'critical', description: 'At least one Kubernetes node is not Ready.', unit: 'count' },
    { name: 'Database unavailable', metric: 'database.up', aggregation: 'min', operator: '<', threshold: 1, forSec: 60, severity: 'critical', description: 'A monitored database is not reachable.', unit: 'count' },
    { name: 'Website or API unavailable', metric: 'synthetic.up', aggregation: 'min', operator: '<', threshold: 1, forSec: 120, severity: 'critical', description: 'A synthetic check failed.', unit: 'count' },
    { name: 'TLS certificate expiring', metric: 'synthetic.certificate.days', aggregation: 'min', operator: '<', threshold: 14, forSec: 0, severity: 'warning', description: 'A monitored TLS certificate expires within 14 days.', unit: 'count' },
    { name: 'Application p95 latency high', metric: 'application.response.p95_ms', aggregation: 'avg', operator: '>', threshold: 1000, forSec: 300, severity: 'warning', description: 'Service p95 latency is above one second.', unit: 'milliseconds' },
    { name: 'Application error rate high', metric: 'application.error_rate', aggregation: 'avg', operator: '>', threshold: 5, forSec: 300, severity: 'critical', description: 'Service error rate is above five percent.', unit: 'percent' },
  ].map((rule) => validRule({ ...rule, id: `rule-${crypto.randomUUID()}` }));
}

module.exports = { AlertEngine, validRule, compare, defaultRules, OPERATORS, AGGREGATIONS };
