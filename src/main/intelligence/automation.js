'use strict';

/**
 * Shared automation engine.
 *
 * One engine drives database, Docker, Kubernetes and observability workflows.
 * It is deliberately conservative:
 *  - dry runs never execute an action,
 *  - disruptive actions always require an approval recorded in the audit trail,
 *  - read-only database automation rejects anything the database service would
 *    classify as destructive,
 *  - every condition reads live collectors/stores, never a hardcoded value.
 */

const { clean, clamp, num, safeError } = require('./util');
const { destructiveReason } = require('../databases');

const TRIGGER_TYPES = new Set(['schedule', 'condition', 'event']);
const OPERATORS = new Set(['>', '>=', '<', '<=', '==', '!=']);
const AGGREGATIONS = new Set(['avg', 'max', 'min', 'last', 'sum', 'count']);
const ACTION_TYPES = new Set([
  'notify', 'create-incident', 'report', 'diagnostics', 'db-query',
  'docker-restart', 'docker-compose-restart', 'k8s-restart', 'k8s-scale',
]);
const DESTRUCTIVE_ACTIONS = new Set(['docker-restart', 'docker-compose-restart', 'k8s-restart', 'k8s-scale']);
const CONDITION_TYPES = new Set(['metric', 'resource-status', 'incident-open']);
const MAX_ACTIONS = 12;
const MAX_CONDITIONS = 10;
const MAX_RUNS = 500;

// Workload kinds the cluster can roll or scale. DaemonSets have no replica
// count, so they can only be restarted.
const K8S_RESTART_SECTIONS = new Set(['deployments', 'statefulsets', 'daemonsets']);
const K8S_SCALE_SECTIONS = new Set(['deployments', 'statefulsets']);

function validId(value) {
  return /^[A-Za-z0-9_-]{1,80}$/.test(String(value || ''));
}

// Kubernetes DNS-1123 names. Anything else is rejected before kubectl runs, so
// a crafted automation cannot smuggle an extra argument or target another kind.
function validK8sName(value) {
  return /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/.test(String(value || ''));
}

function validK8sNamespace(value) {
  return /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/.test(String(value || ''));
}

function validOperator(value) {
  return OPERATORS.has(value) ? value : '>';
}

function compare(value, operator, threshold) {
  const left = Number(value);
  const right = Number(threshold);
  if (!Number.isFinite(left) || !Number.isFinite(right)) return false;
  switch (operator) {
    case '>': return left > right;
    case '>=': return left >= right;
    case '<': return left < right;
    case '<=': return left <= right;
    case '==': return left === right;
    case '!=': return left !== right;
    default: return false;
  }
}

function normalizeCondition(input = {}) {
  if (!input || typeof input !== 'object') return null;
  const type = CONDITION_TYPES.has(input.type) ? input.type : 'metric';
  if (type === 'metric') {
    const name = clean(input.name, 120);
    if (!name) return null;
    return {
      type,
      name,
      aggregation: AGGREGATIONS.has(input.aggregation) ? input.aggregation : 'avg',
      operator: validOperator(input.operator),
      threshold: num(input.threshold, 0),
      windowMinutes: clamp(input.windowMinutes || 5, 1, 1440),
      source: clean(input.source, 40),
      resource: clean(input.resource, 200),
      labels: input.labels && typeof input.labels === 'object' ? input.labels : {},
    };
  }
  if (type === 'resource-status') {
    return {
      type,
      module: clean(input.module, 40),
      kind: clean(input.kind, 60),
      status: ['healthy', 'degraded', 'unhealthy', 'stopped', 'unknown'].includes(input.status) ? input.status : 'unhealthy',
      operator: validOperator(input.operator || '>'),
      threshold: num(input.threshold, 0),
      minimum: num(input.minimum, 0),
    };
  }
  return {
    type,
    status: ['open', 'acknowledged'].includes(input.status) ? input.status : 'open',
    severity: ['critical', 'major', 'minor', 'warning', 'info'].includes(input.severity) ? input.severity : '',
    operator: validOperator(input.operator || '>'),
    threshold: num(input.threshold, 0),
  };
}

function normalizeAction(input = {}) {
  if (!input || typeof input !== 'object' || !ACTION_TYPES.has(input.type)) return null;
  const action = { type: input.type, id: validId(input.id) ? input.id : undefined };
  if (input.type === 'notify') {
    action.channelIds = Array.isArray(input.channelIds) ? input.channelIds.filter(validId).slice(0, 10) : [];
    action.message = clean(input.message, 1000);
    action.severity = ['info', 'warning', 'error', 'critical'].includes(input.severity) ? input.severity : 'warning';
  } else if (input.type === 'create-incident') {
    action.title = clean(input.title, 240) || 'Automation incident';
    action.summary = clean(input.summary, 2000);
    action.severity = ['critical', 'major', 'minor', 'warning', 'info'].includes(input.severity) ? input.severity : 'warning';
    action.services = Array.isArray(input.services) ? input.services.slice(0, 10).map((entry) => clean(entry, 120)) : [];
  } else if (input.type === 'report') {
    action.reportType = clean(input.reportType, 60) || 'system';
    action.hours = clamp(input.hours || 24, 1, 24 * 30);
  } else if (input.type === 'diagnostics') {
    action.target = ['database', 'docker', 'kubernetes', 'system'].includes(input.target) ? input.target : 'system';
    action.id = clean(input.id, 80);
  } else if (input.type === 'db-query') {
    action.connectionId = clean(input.connectionId, 80);
    action.database = clean(input.database, 128);
    action.sql = String(input.sql || '').slice(0, 20000);
    action.limit = clamp(input.limit || 50, 1, 1000);
  } else if (input.type === 'docker-restart') {
    action.containerId = clean(input.containerId, 128);
  } else if (input.type === 'docker-compose-restart') {
    action.project = clean(input.project, 128);
  } else if (input.type === 'k8s-restart') {
    action.section = K8S_RESTART_SECTIONS.has(input.section) ? input.section : 'deployments';
    action.name = clean(input.name, 253);
    action.namespace = clean(input.namespace, 63);
    action.replicas = null;
  } else if (input.type === 'k8s-scale') {
    action.section = K8S_SCALE_SECTIONS.has(input.section) ? input.section : 'deployments';
    action.name = clean(input.name, 253);
    action.namespace = clean(input.namespace, 63);
    action.replicas = clamp(input.replicas === undefined ? 1 : input.replicas, 0, 100);
  }
  return action;
}

function normalizeTrigger(input = {}) {
  const type = TRIGGER_TYPES.has(input.type) ? input.type : 'schedule';
  if (type === 'schedule') {
    const atTime = /^([01]\d|2[0-3]):[0-5]\d$/.test(String(input.atTime || '')) ? input.atTime : '';
    return {
      type,
      everyMinutes: atTime ? 0 : clamp(input.everyMinutes || 60, 5, 10080),
      atTime,
    };
  }
  if (type === 'event') {
    return {
      type,
      modules: Array.isArray(input.modules) ? input.modules.slice(0, 8).map((entry) => clean(entry, 40)) : [],
      kinds: Array.isArray(input.kinds) ? input.kinds.slice(0, 8).map((entry) => clean(entry, 60)) : [],
      severityMin: ['info', 'success', 'warning', 'error', 'critical'].includes(input.severityMin) ? input.severityMin : 'warning',
      query: clean(input.query, 200),
    };
  }
  return { type: 'condition' };
}

function normalizeAutomation(input = {}, existing = null) {
  const name = clean(input.name, 160) || existing?.name || 'Automation';
  const trigger = normalizeTrigger(input.trigger || existing?.trigger);
  const conditions = (Array.isArray(input.conditions) ? input.conditions : existing?.conditions || [])
    .slice(0, MAX_CONDITIONS)
    .map(normalizeCondition)
    .filter(Boolean);
  const actions = (Array.isArray(input.actions) ? input.actions : existing?.actions || [])
    .slice(0, MAX_ACTIONS)
    .map(normalizeAction)
    .filter(Boolean);
  if (!actions.length) throw new Error('Add at least one action.');
  if (trigger.type === 'condition' && !conditions.length) throw new Error('A condition trigger needs at least one condition.');
  if (trigger.type === 'event' && !trigger.modules.length && !trigger.kinds.length) {
    throw new Error('An event trigger needs at least one module or event kind.');
  }
  const approval = ['never', 'destructive', 'always'].includes(input.approval)
    ? input.approval
    : existing?.approval || (actions.some((action) => DESTRUCTIVE_ACTIONS.has(action.type)) ? 'always' : 'never');
  const item = {
    id: existing?.id || (validId(input.id) ? input.id : `auto-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`),
    name,
    description: clean(input.description ?? existing?.description ?? '', 600),
    enabled: input.enabled === undefined ? existing?.enabled !== false : input.enabled === true,
    trigger,
    conditions,
    actions,
    approval,
    cooldownMinutes: clamp(input.cooldownMinutes ?? existing?.cooldownMinutes ?? 15, 0, 10080),
    lastRunAt: existing?.lastRunAt || null,
    lastStatus: existing?.lastStatus || 'never',
    lastConditionTrue: existing?.lastConditionTrue === true,
    seenEvents: Array.isArray(existing?.seenEvents) ? existing.seenEvents.slice(-200) : [],
    createdBy: existing?.createdBy || 'local-user',
    createdAt: existing?.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
  return item;
}

class AutomationEngine {
  constructor({ store, deps = {} }) {
    this.store = store;
    this.deps = deps;
    this.timer = null;
    this.ticking = false;
    this.running = new Map();
  }

  get data() {
    return this.store.get();
  }

  list() {
    const automations = this.data.automations.map((automation) => ({
      ...automation,
      nextRunAt: this.nextRunAt(automation),
      pending: this.data.runs.some((run) => run.automationId === automation.id && run.status === 'pending-approval'),
    }));
    return { ok: true, items: automations, enabled: this.data.settings.automationEnabled !== false };
  }

  save(input = {}) {
    const existing = input.id ? this.data.automations.find((automation) => automation.id === input.id) : null;
    if (input.id && !existing) throw new Error('That automation no longer exists.');
    const item = normalizeAutomation(input, existing);
    if (existing) this.data.automations[this.data.automations.indexOf(existing)] = item;
    else this.data.automations.push(item);
    this.store.schedule();
    this.store.audit({
      action: 'automation-save',
      module: 'intelligence',
      resource: item.id,
      outcome: 'success',
      detail: `${item.name}: ${item.trigger.type} → ${item.actions.map((action) => action.type).join(', ')}`,
    });
    this.emit({ type: 'automation:saved', automation: item });
    return { ok: true, automation: item };
  }

  remove(id) {
    const automation = this.data.automations.find((entry) => entry.id === id);
    if (!automation) throw new Error('That automation does not exist.');
    this.data.automations = this.data.automations.filter((entry) => entry.id !== id);
    this.store.schedule();
    this.store.audit({ action: 'automation-delete', module: 'intelligence', resource: id, detail: automation.name });
    return { ok: true };
  }

  setEnabled(id, enabled) {
    const automation = this.data.automations.find((entry) => entry.id === id);
    if (!automation) throw new Error('That automation does not exist.');
    automation.enabled = enabled === true;
    automation.updatedAt = new Date().toISOString();
    this.store.schedule();
    return { ok: true, automation };
  }

  nextRunAt(automation) {
    if (!automation?.enabled) return null;
    if (automation.trigger?.type !== 'schedule') return null;
    if (automation.trigger.atTime) {
      const [hour, minute] = automation.trigger.atTime.split(':').map(Number);
      const base = automation.lastRunAt ? new Date(automation.lastRunAt) : new Date();
      const next = new Date(base);
      next.setHours(hour, minute, 0, 0);
      if (next.getTime() <= base.getTime()) next.setDate(next.getDate() + 1);
      return next.toISOString();
    }
    const base = automation.lastRunAt ? Date.parse(automation.lastRunAt) : Date.now();
    return new Date(base + (automation.trigger.everyMinutes || 60) * 60e3).toISOString();
  }

  // ------------------------------------------------------------------- eval

  async evaluateCondition(condition, context = {}) {
    if (condition.type === 'metric') {
      if (!this.deps.queryMetrics) return { ok: false, detail: 'Metrics are not available.' };
      const to = Date.now();
      const from = to - condition.windowMinutes * 60e3;
      const result = await this.deps.queryMetrics({
        names: [condition.name],
        from,
        to,
        aggregation: condition.aggregation === 'last' ? 'avg' : condition.aggregation,
        source: condition.source,
        resource: condition.resource,
        labels: condition.labels,
        limit: 100,
      });
      if (!result?.ok) return { ok: false, detail: result?.error || 'Metric query failed.' };
      const values = [];
      for (const series of result.series || []) {
        for (const point of series.points || []) {
          if (Number.isFinite(point[1])) values.push(point[1]);
        }
      }
      if (!values.length) return { ok: false, detail: `No samples for ${condition.name} in the last ${condition.windowMinutes} min.` };
      let value;
      if (condition.aggregation === 'max') value = Math.max(...values);
      else if (condition.aggregation === 'min') value = Math.min(...values);
      else if (condition.aggregation === 'sum') value = values.reduce((sum, entry) => sum + entry, 0);
      else if (condition.aggregation === 'count') value = values.length;
      else if (condition.aggregation === 'last') value = values[values.length - 1];
      else value = values.reduce((sum, entry) => sum + entry, 0) / values.length;
      return {
        ok: compare(value, condition.operator, condition.threshold),
        value,
        detail: `${condition.name} ${condition.aggregation} = ${Number(value.toFixed(3))} ${condition.operator} ${condition.threshold} over ${condition.windowMinutes} min`,
      };
    }
    if (condition.type === 'resource-status') {
      const resources = await this.deps.resources();
      const matching = resources.filter((resource) => (
        (!condition.module || resource.module === condition.module)
        && (!condition.kind || resource.kind === condition.kind)
        && resource.status === condition.status
      ));
      return {
        ok: compare(matching.length, condition.operator, condition.threshold),
        value: matching.length,
        detail: `${matching.length} ${condition.module || 'resource'} ${condition.kind || ''} in ${condition.status} state`,
      };
    }
    if (condition.type === 'incident-open') {
      const result = this.deps.listIncidents ? await this.deps.listIncidents({ status: condition.status, limit: 500 }) : { items: [] };
      const matching = (result.items || []).filter((incident) => !condition.severity || incident.severity === condition.severity);
      return {
        ok: compare(matching.length, condition.operator, condition.threshold),
        value: matching.length,
        detail: `${matching.length} ${condition.status} incident(s)`,
      };
    }
    return { ok: false, detail: 'Unknown condition type.' };
  }

  async evaluateAll(conditions = [], context = {}) {
    const results = [];
    let all = conditions.length > 0;
    for (const condition of conditions) {
      let result;
      try {
        result = await this.evaluateCondition(condition, context);
      } catch (error) {
        result = { ok: false, detail: safeError(error, 'Condition evaluation failed.') };
      }
      results.push({ condition, ...result });
      if (!result.ok) all = false;
    }
    return { ok: all, results };
  }

  eventMatches(trigger, event) {
    if (!event) return false;
    if (trigger.modules?.length && !trigger.modules.includes(event.module)) return false;
    if (trigger.kinds?.length && !trigger.kinds.includes(event.kind)) return false;
    const rank = { info: 0, success: 1, warning: 2, error: 3, critical: 4 };
    if ((rank[event.severity] ?? 0) < (rank[trigger.severityMin] ?? 2)) return false;
    if (trigger.query) {
      const haystack = `${event.title} ${event.detail} ${event.resource} ${(event.tags || []).join(' ')}`.toLowerCase();
      if (!haystack.includes(trigger.query.toLowerCase())) return false;
    }
    return true;
  }

  // -------------------------------------------------------------------- run

  isDue(automation, now = Date.now()) {
    if (!automation.enabled) return false;
    if (automation.trigger.type === 'schedule') {
      const next = this.nextRunAt(automation);
      return !next || Date.parse(next) <= now;
    }
    if (automation.cooldownMinutes > 0 && automation.lastRunAt) {
      return now - Date.parse(automation.lastRunAt) >= automation.cooldownMinutes * 60e3;
    }
    return true;
  }

  needsApproval(automation, options = {}) {
    if (options.dryRun) return false;
    if (automation.approval === 'always') return true;
    if (automation.approval === 'destructive') return automation.actions.some((action) => DESTRUCTIVE_ACTIONS.has(action.type));
    return false;
  }

  createRun(automation, input = {}) {
    const run = {
      id: `run-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      automationId: automation.id,
      automationName: automation.name,
      status: 'running',
      dryRun: input.dryRun === true,
      trigger: input.trigger || automation.trigger.type,
      triggerDetail: clean(input.triggerDetail, 600),
      startedAt: new Date().toISOString(),
      finishedAt: null,
      reason: clean(input.reason, 600),
      conditions: Array.isArray(input.conditions) ? input.conditions.slice(0, MAX_CONDITIONS) : [],
      planned: automation.actions.map((action) => ({ type: action.type, destructive: DESTRUCTIVE_ACTIONS.has(action.type) })),
      steps: [],
      approved: false,
      approvedBy: '',
      approvedAt: null,
      cancelled: false,
      error: '',
    };
    this.data.runs.push(run);
    this.trimRuns();
    this.store.schedule();
    return run;
  }

  trimRuns() {
    if (this.data.runs.length > MAX_RUNS) this.data.runs.splice(0, this.data.runs.length - MAX_RUNS);
  }

  async runAutomation(id, options = {}) {
    const automation = this.data.automations.find((entry) => entry.id === id);
    if (!automation) return { ok: false, error: 'That automation does not exist.' };
    if (this.data.settings.automationEnabled === false && !options.dryRun) {
      return { ok: false, error: 'Automation is disabled in settings.' };
    }
    if (options.confirmDryRun !== true && options.dryRun !== true) {
      // Executing a workflow outside its trigger is an explicit action; still
      // allowed, but it is audited and goes through the same approval gates.
    }
    return this.execute(automation, { dryRun: options.dryRun === true, trigger: 'manual', triggerDetail: 'Run requested from the UI' });
  }

  async execute(automation, options = {}) {
    if (this.running.has(automation.id)) {
      return { ok: false, error: 'This workflow is already running.' };
    }
    this.running.set(automation.id, true);
    try {
      const run = this.createRun(automation, {
        dryRun: options.dryRun,
        trigger: options.trigger,
        triggerDetail: options.triggerDetail,
      });
      const conditionResult = await this.evaluateAll(automation.conditions, { run });
      run.conditions = conditionResult.results.map((result) => ({
        type: result.condition.type,
        ok: result.ok === true,
        detail: result.detail || '',
        value: result.value ?? null,
      }));
      if (automation.conditions.length && !conditionResult.ok) {
        run.status = 'skipped';
        run.reason = 'Conditions are not met.';
        run.finishedAt = new Date().toISOString();
        this.finishRun(automation, run);
        return { ok: true, run, skipped: true };
      }
      if (run.dryRun) {
        run.status = 'dry-run';
        run.reason = `Would run ${automation.actions.length} action(s): ${automation.actions.map((action) => action.type).join(', ')}.`;
        run.finishedAt = new Date().toISOString();
        this.finishRun(automation, run);
        return { ok: true, run, dryRun: true };
      }
      if (this.needsApproval(automation, {})) {
        run.status = 'pending-approval';
        run.reason = 'Waiting for explicit approval.';
        run.finishedAt = null;
        automation.lastStatus = 'pending-approval';
        this.store.schedule();
        this.store.audit({
          action: 'automation-approval-requested',
          module: 'intelligence',
          resource: automation.id,
          outcome: 'pending',
          detail: `${automation.name} is waiting for approval`,
        });
        this.emit({ type: 'automation:pending', automation, run });
        return { ok: true, run, pending: true };
      }
      await this.executeActions(automation, run);
      return { ok: true, run };
    } finally {
      this.running.delete(automation.id);
    }
  }

  async executeActions(automation, run) {
    run.status = 'running';
    let failures = 0;
    for (const action of automation.actions) {
      if (run.cancelled) {
        run.status = 'cancelled';
        run.reason = 'Cancelled by the user.';
        break;
      }
      const step = { type: action.type, ok: false, at: new Date().toISOString(), detail: '', attempts: 0 };
      try {
        if (DESTRUCTIVE_ACTIONS.has(action.type) && !run.approved) {
          throw new Error('This action needs explicit approval before it can run.');
        }
        const result = await this.withRetry(() => this.executeAction(action, run, automation), step);
        step.ok = result?.ok !== false;
        step.detail = clean(result?.detail || result?.summary || 'Completed.', 600);
        step.meta = result?.meta;
      } catch (error) {
        failures += 1;
        step.ok = false;
        step.detail = safeError(error, 'Action failed.');
        run.error = step.detail;
      }
      run.steps.push(step);
      this.store.schedule();
      this.emit({ type: 'automation:step', automationId: automation.id, runId: run.id, step });
    }
    run.status = failures ? (run.cancelled ? 'cancelled' : 'failed') : 'succeeded';
    run.finishedAt = new Date().toISOString();
    this.finishRun(automation, run);
    return run;
  }

  async withRetry(fn, step) {
    let lastError;
    for (let attempt = 1; attempt <= 2; attempt += 1) {
      step.attempts = attempt;
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt === 2 || !/ECONN|ETIMEDOUT|timeout|temporar|429|503|socket hang up|network/i.test(error.message || '')) break;
        await new Promise((resolve) => setTimeout(resolve, attempt === 1 ? 400 : 1200));
      }
    }
    throw lastError;
  }

  finishRun(automation, run) {
    automation.lastRunAt = new Date().toISOString();
    automation.lastStatus = run.status;
    this.store.schedule();
    this.store.audit({
      action: 'automation-run',
      module: 'intelligence',
      resource: automation.id,
      outcome: run.status === 'succeeded' || run.status === 'dry-run' ? 'success' : run.status === 'failed' ? 'failure' : 'pending',
      detail: `${automation.name} → ${run.status}`,
      meta: { runId: run.id, steps: run.steps.length },
    });
    this.emit({ type: 'automation:run', automationId: automation.id, run });
  }

  async executeAction(action, run, automation) {
    if (action.type === 'notify') {
      if (!this.deps.notify) throw new Error('Notification channels are not available.');
      const message = action.message
        || `Automation “${automation.name}” ${run.trigger === 'manual' ? 'was run' : `triggered by ${run.trigger}`}.`;
      const result = await this.deps.notify({
        title: automation.name,
        message,
        severity: action.severity,
        channelIds: action.channelIds,
        tags: ['automation', action.severity],
      });
      const sent = (result.results || []).filter((entry) => entry.ok).length;
      return { ok: result.ok !== false, detail: `Notified ${sent} channel(s).`, meta: { channels: sent } };
    }
    if (action.type === 'create-incident') {
      if (!this.deps.createIncident) throw new Error('Incident management is not available.');
      const result = await this.deps.createIncident({
        title: action.title || automation.name,
        summary: action.summary || `Created by automation “${automation.name}”.`,
        severity: action.severity,
        services: action.services,
        resources: run.conditions.filter((condition) => condition.value != null).map((condition) => condition.detail).slice(0, 10),
      });
      if (!result.ok) throw new Error(result.error || 'The incident could not be created.');
      return { ok: true, detail: `Incident created: ${result.incident?.title || 'incident'}`, meta: { incidentId: result.incident?.id } };
    }
    if (action.type === 'report') {
      if (!this.deps.generateReport) throw new Error('Reports are not available.');
      const to = Date.now();
      const report = await this.deps.generateReport({ type: action.reportType, to, from: to - action.hours * 3600e3 });
      if (report?.ok === false) throw new Error(report.error || 'The report could not be generated.');
      return { ok: true, detail: `Generated ${action.reportType} report with ${report.sections?.length || 0} section(s).`, meta: { filename: report.filename } };
    }
    if (action.type === 'diagnostics') {
      if (!this.deps.diagnostics) throw new Error('Diagnostics are not available.');
      const result = await this.deps.diagnostics({ target: action.target, id: action.id });
      if (result?.ok === false) throw new Error(result.error || 'Diagnostics failed.');
      return { ok: true, detail: result.summary || `Collected ${action.target} diagnostics.`, meta: result.meta };
    }
    if (action.type === 'db-query') {
      if (!this.deps.queryDatabase) throw new Error('Database access is not available.');
      if (!action.connectionId) throw new Error('Choose a database connection.');
      const reason = destructiveReason(action.sql);
      if (reason) throw new Error(`Read-only automation cannot run this statement: ${reason}`);
      const result = await this.deps.queryDatabase({
        id: action.connectionId,
        database: action.database,
        sql: action.sql,
        limit: action.limit,
        confirmDestructive: false,
      });
      if (result?.ok === false) throw new Error(result.error || 'The query failed.');
      return { ok: true, detail: `Query returned ${result.rowCount ?? (result.rows?.length || 0)} row(s).`, meta: { rowCount: result.rowCount ?? result.rows?.length ?? 0 } };
    }
    if (action.type === 'docker-restart') {
      if (!this.deps.restartContainer) throw new Error('Docker access is not available.');
      if (!run.approved) throw new Error('Restarting a container requires approval.');
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(action.containerId)) throw new Error('The container reference is not valid.');
      this.store.audit({
        action: 'container-restart',
        module: 'docker',
        resource: action.containerId,
        outcome: 'pending',
        detail: `Approved restarted via automation ${automation.name}`,
      });
      const result = await this.deps.restartContainer(action.containerId);
      if (result?.ok === false) throw new Error(result.error || 'The restart failed.');
      return { ok: true, detail: `Restarted container ${action.containerId}.` };
    }
    if (action.type === 'docker-compose-restart') {
      if (!this.deps.restartCompose) throw new Error('Docker Compose access is not available.');
      if (!run.approved) throw new Error('Restarting a Compose project requires approval.');
      if (!/^[A-Za-z0-9][A-Za-z0-9_.-]{0,127}$/.test(action.project)) throw new Error('Choose a valid Compose project.');
      this.store.audit({
        action: 'compose-restart',
        module: 'docker',
        resource: action.project,
        outcome: 'pending',
        detail: `Approved Compose restart via automation ${automation.name}`,
      });
      const result = await this.deps.restartCompose(action.project);
      if (result?.ok === false) throw new Error(result.error || 'The Compose restart failed.');
      return { ok: true, detail: `Restarted Compose project ${action.project}.` };
    }
    if (action.type === 'k8s-restart') {
      if (!this.deps.restartWorkload) throw new Error('Kubernetes access is not available.');
      if (!run.approved) throw new Error('Restarting a workload requires approval.');
      if (!K8S_RESTART_SECTIONS.has(action.section)) throw new Error('That workload kind cannot be restarted.');
      if (!validK8sNamespace(action.namespace)) throw new Error('Choose a valid namespace for the workload.');
      if (!validK8sName(action.name)) throw new Error('Choose a valid workload name.');
      this.store.audit({
        action: 'workload-restart',
        module: 'kubernetes',
        resource: `${action.section}/${action.namespace}/${action.name}`,
        outcome: 'pending',
        detail: `Approved rolling restart via automation ${automation.name}`,
      });
      const result = await this.deps.restartWorkload({
        section: action.section,
        name: action.name,
        namespace: action.namespace,
      });
      if (result?.ok === false) throw new Error(result.error || 'The rollout restart failed.');
      return {
        ok: true,
        detail: `Rolled out ${action.section}/${action.name} in ${action.namespace}.`,
        meta: { section: action.section, namespace: action.namespace, name: action.name },
      };
    }
    if (action.type === 'k8s-scale') {
      if (!this.deps.scaleWorkload) throw new Error('Kubernetes access is not available.');
      if (!run.approved) throw new Error('Scaling a workload requires approval.');
      if (!K8S_SCALE_SECTIONS.has(action.section)) throw new Error('Only Deployments and StatefulSets can be scaled.');
      if (!validK8sNamespace(action.namespace)) throw new Error('Choose a valid namespace for the workload.');
      if (!validK8sName(action.name)) throw new Error('Choose a valid workload name.');
      const replicas = clamp(action.replicas, 0, 100);
      this.store.audit({
        action: 'workload-scale',
        module: 'kubernetes',
        resource: `${action.section}/${action.namespace}/${action.name}`,
        outcome: 'pending',
        detail: `Approved scale to ${replicas} replica(s) via automation ${automation.name}`,
      });
      const result = await this.deps.scaleWorkload({
        section: action.section,
        name: action.name,
        namespace: action.namespace,
        replicas,
      });
      if (result?.ok === false) throw new Error(result.error || 'The scale request failed.');
      return {
        ok: true,
        detail: `Scaled ${action.section}/${action.name} in ${action.namespace} to ${replicas} replica(s).`,
        meta: { section: action.section, namespace: action.namespace, name: action.name, replicas },
      };
    }
    throw new Error(`Unsupported action type: ${action.type}`);
  }

  // ---------------------------------------------------------------- approval

  async approve(runId, approver = 'local-user') {
    const run = this.data.runs.find((entry) => entry.id === runId);
    if (!run) return { ok: false, error: 'That run was not found.' };
    if (run.status !== 'pending-approval') return { ok: false, error: 'That run is not waiting for approval.' };
    const automation = this.data.automations.find((entry) => entry.id === run.automationId);
    if (!automation) return { ok: false, error: 'The automation no longer exists.' };
    run.status = 'running';
    run.approved = true;
    run.approvedBy = clean(approver, 120) || 'local-user';
    run.approvedAt = new Date().toISOString();
    this.store.audit({
      action: 'automation-approved',
      module: 'intelligence',
      resource: automation.id,
      detail: `${run.id} approved by ${run.approvedBy}`,
      meta: { runId: run.id },
    });
    await this.executeActions(automation, run);
    return { ok: true, run };
  }

  reject(runId, reason = '') {
    const run = this.data.runs.find((entry) => entry.id === runId);
    if (!run) return { ok: false, error: 'That run was not found.' };
    if (run.status !== 'pending-approval') return { ok: false, error: 'That run is not waiting for approval.' };
    run.status = 'rejected';
    run.reason = clean(reason, 600) || 'Rejected by the user.';
    run.finishedAt = new Date().toISOString();
    const automation = this.data.automations.find((entry) => entry.id === run.automationId);
    if (automation) automation.lastStatus = 'rejected';
    this.store.schedule();
    this.store.audit({
      action: 'automation-rejected',
      module: 'intelligence',
      resource: run.automationId,
      outcome: 'denied',
      detail: run.reason,
      meta: { runId: run.id },
    });
    return { ok: true, run };
  }

  cancel(runId) {
    const run = this.data.runs.find((entry) => entry.id === runId);
    if (!run) return { ok: false, error: 'That run was not found.' };
    if (!['running', 'pending-approval'].includes(run.status)) return { ok: false, error: 'That run has already finished.' };
    run.cancelled = true;
    if (run.status === 'pending-approval') {
      run.status = 'cancelled';
      run.reason = 'Cancelled before approval.';
      run.finishedAt = new Date().toISOString();
      this.store.schedule();
    }
    return { ok: true, run };
  }

  runs(options = {}) {
    let items = this.data.runs.slice().reverse();
    if (options.automationId) items = items.filter((run) => run.automationId === options.automationId);
    if (options.status) items = items.filter((run) => run.status === options.status);
    const limit = clamp(options.limit || 100, 1, 500);
    return { ok: true, items: items.slice(0, limit), total: items.length };
  }

  // ---------------------------------------------------------------- schedule

  start() {
    if (this.timer) return;
    const interval = clamp(this.data.settings.automationIntervalSec || 15, 5, 3600) * 1000;
    this.timer = setInterval(() => {
      this.tick().catch((error) => console.error('Automation tick failed:', error.message));
    }, interval);
    this.timer.unref?.();
  }

  dispose() {
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
  }

  async tick() {
    if (this.ticking) return { ok: false, reason: 'A tick is already running.' };
    this.ticking = true;
    try {
      if (this.data.settings.automationEnabled === false) return { ok: true, skipped: 'disabled' };
      const now = Date.now();
      const results = [];
      for (const automation of this.data.automations) {
        if (!automation.enabled) continue;
        if (!this.isDue(automation, now)) continue;
        if (automation.trigger.type === 'event') {
          const events = this.deps.recentEvents ? await this.deps.recentEvents({ limit: 200 }) : [];
          const fresh = (events || []).filter((event) => this.eventMatches(automation.trigger, event)
            && !(automation.seenEvents || []).includes(event.id))
            .slice(0, 3);
          for (const event of fresh) {
            automation.seenEvents = [...(automation.seenEvents || []), event.id].slice(-200);
            const result = await this.execute(automation, {
              trigger: 'event',
              triggerDetail: event.title,
            });
            results.push(result);
          }
          this.store.schedule();
          continue;
        }
        if (automation.trigger.type === 'condition') {
          const evaluation = await this.evaluateAll(automation.conditions, {});
          const wasTrue = automation.lastConditionTrue === true;
          automation.lastConditionTrue = evaluation.ok;
          if (!evaluation.ok) { this.store.schedule(); continue; }
          if (wasTrue && automation.cooldownMinutes > 0 && automation.lastRunAt
            && now - Date.parse(automation.lastRunAt) < automation.cooldownMinutes * 60e3) {
            continue;
          }
          const result = await this.execute(automation, { trigger: 'condition', triggerDetail: evaluation.results.map((entry) => entry.detail).join('; ') });
          results.push(result);
          continue;
        }
        const result = await this.execute(automation, { trigger: 'schedule', triggerDetail: automation.trigger.atTime || `every ${automation.trigger.everyMinutes} min` });
        results.push(result);
      }
      return { ok: true, results };
    } finally {
      this.ticking = false;
    }
  }

  emit(event) {
    if (typeof this.deps.onEvent === 'function') {
      try { this.deps.onEvent(event); } catch { /* isolated */ }
    }
  }
}

module.exports = {
  AutomationEngine,
  normalizeAutomation,
  normalizeCondition,
  normalizeAction,
  compare,
  DESTRUCTIVE_ACTIONS,
  ACTION_TYPES,
  TRIGGER_TYPES,
  __test: { compare, normalizeCondition, normalizeAction, normalizeAutomation },
};
