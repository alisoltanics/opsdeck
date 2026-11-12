'use strict';

/**
 * Optional automated remediation.
 *
 * Disabled by default. A policy can only execute a small allowlist of actions,
 * is rate limited and cooled down, and records an audit entry for every
 * attempt. Approval-mode policies refuse to run without an explicit approval.
 */

const crypto = require('node:crypto');
const { sendChannel } = require('./notify');
const { sanitizeText } = require('./util');

const ACTIONS = {
  'docker.restart': { label: 'Restart a Docker container', requires: ['containerId'] },
  'compose.restart': { label: 'Restart a Compose project', requires: ['project'] },
  'k8s.restart': { label: 'Restart a Kubernetes workload', requires: ['kind', 'name', 'namespace'] },
  'http.check': { label: 'Run an HTTP health check', requires: ['url'] },
  'notify.webhook': { label: 'Send a notification webhook', requires: ['url'] },
};

function validPolicy(input = {}) {
  const action = ACTIONS[input.action] ? input.action : 'docker.restart';
  const target = input.target && typeof input.target === 'object' ? input.target : {};
  return {
    id: typeof input.id === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{3,80}$/.test(input.id) ? input.id : `policy-${crypto.randomUUID()}`,
    name: String(input.name || 'Remediation policy').slice(0, 160),
    enabled: input.enabled === true,
    action,
    target: Object.fromEntries(Object.entries(target).map(([key, value]) => [String(key).slice(0, 60), String(value).slice(0, 300)])),
    alertRuleId: String(input.alertRuleId || '').slice(0, 80),
    severity: ['info', 'warning', 'critical'].includes(input.severity) ? input.severity : 'critical',
    approval: input.approval === 'auto' ? 'auto' : 'required',
    cooldownSec: Math.max(0, Math.min(86400, Number(input.cooldownSec) || 300)),
    maxPerHour: Math.max(1, Math.min(60, Number(input.maxPerHour) || 3)),
    createdAt: input.createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };
}

class RemediationManager {
  constructor({ config, docker = null, kubernetes = null, synthetic = null }) {
    this.config = config;
    this.docker = docker;
    this.kubernetes = kubernetes;
    this.synthetic = synthetic;
    this.running = new Set();
  }

  status() {
    return {
      enabled: this.config.get().remediation.enabled === true,
      policies: (this.config.get().remediation.policies || []).map((policy) => ({ ...policy, lastExecution: this.lastExecution(policy.id) })),
      executions: (this.config.get().remediation.executions || []).slice(0, 100),
      actions: Object.entries(ACTIONS).map(([id, def]) => ({ id, ...def })),
    };
  }

  savePolicy(input = {}) {
    const policies = this.config.get().remediation.policies || [];
    const existing = policies.find((policy) => policy.id === input.id);
    const policy = validPolicy({ ...(existing || {}), ...input, id: existing?.id || input.id });
    if (existing) policies[policies.indexOf(existing)] = policy;
    else policies.push(policy);
    this.config.save();
    return { ok: true, policy };
  }

  removePolicy(id) {
    this.config.get().remediation.policies = (this.config.get().remediation.policies || []).filter((policy) => policy.id !== id);
    this.config.save();
    return { ok: true };
  }

  setEnabled(value) {
    this.config.get().remediation.enabled = value === true;
    this.config.save();
    return { ok: true, enabled: this.config.get().remediation.enabled };
  }

  lastExecution(policyId) {
    return (this.config.get().remediation.executions || []).find((entry) => entry.policyId === policyId) || null;
  }

  async triggerFor(alert) {
    if (this.config.get().remediation.enabled !== true) return { ok: false, skipped: 'Automated remediation is disabled globally.' };
    const policy = (this.config.get().remediation.policies || []).find((entry) => entry.enabled && entry.alertRuleId === alert.ruleId && (!entry.severity || entry.severity === alert.severity));
    if (!policy) return { ok: false, skipped: 'No enabled policy matches this alert.' };
    if (policy.approval !== 'auto') return { ok: false, pendingApproval: true, policy };
    return this.execute(policy.id, { approved: true, automatic: true, actor: 'alert-engine', alertId: alert.id });
  }

  async execute(policyId, options = {}) {
    const policy = (this.config.get().remediation.policies || []).find((entry) => entry.id === policyId);
    if (!policy) return { ok: false, error: 'That remediation policy was not found.' };
    if (!policy.enabled) return { ok: false, error: 'This policy is disabled.' };
    if (this.config.get().remediation.enabled !== true) return { ok: false, error: 'Automated remediation is disabled globally.' };
    if (policy.approval !== 'auto' && options.approved !== true) {
      return { ok: false, error: 'This policy requires explicit approval.', needsApproval: true };
    }
    if (this.running.has(policy.id)) return { ok: false, error: 'This policy is already running.' };
    const executions = this.config.get().remediation.executions || [];
    const last = executions.find((entry) => entry.policyId === policy.id);
    if (last && Date.now() - Date.parse(last.at) < policy.cooldownSec * 1000) {
      return { ok: false, error: `Cooldown is active for another ${Math.ceil((policy.cooldownSec * 1000 - (Date.now() - Date.parse(last.at))) / 1000)} seconds.` };
    }
    const lastHour = executions.filter((entry) => entry.policyId === policy.id && Date.now() - Date.parse(entry.at) < 3600e3);
    if (lastHour.length >= policy.maxPerHour) return { ok: false, error: `This policy already ran ${lastHour.length} times in the last hour (limit ${policy.maxPerHour}).` };

    this.running.add(policy.id);
    const entry = {
      id: `exec-${crypto.randomUUID()}`,
      policyId: policy.id,
      policyName: policy.name,
      action: policy.action,
      target: policy.target,
      at: new Date().toISOString(),
      actor: String(options.actor || 'user').slice(0, 120),
      automatic: options.automatic === true,
      approved: options.approved === true,
      alertId: String(options.alertId || ''),
      ok: false,
      message: '',
      error: '',
    };
    try {
      const result = await this.run(policy, options);
      entry.ok = result.ok;
      entry.message = result.message || '';
      entry.error = result.error || '';
    } catch (error) {
      entry.error = sanitizeText(error.message || String(error), 500);
    } finally {
      this.running.delete(policy.id);
      executions.unshift(entry);
      this.config.get().remediation.executions = executions.slice(0, 500);
      this.config.save();
    }
    return { ok: entry.ok, execution: entry, error: entry.error || undefined };
  }

  async run(policy) {
    const target = policy.target || {};
    if (policy.action === 'docker.restart') {
      if (!this.docker) return { ok: false, error: 'Docker is not available.' };
      if (!/^[a-f0-9]{12,64}$/i.test(String(target.containerId || ''))) return { ok: false, error: 'The container ID is not valid.' };
      const result = await this.docker.containerAction(target.containerId, 'restart', {});
      return { ok: result.ok, message: result.ok ? `Container ${target.containerId.slice(0, 12)} restarted.` : '', error: result.ok ? '' : result.error || 'Docker restart failed.' };
    }
    if (policy.action === 'compose.restart') {
      if (!this.docker) return { ok: false, error: 'Docker is not available.' };
      const project = String(target.project || '');
      if (!/^[a-zA-Z0-9][a-zA-Z0-9_.-]{0,120}$/.test(project)) return { ok: false, error: 'The Compose project name is not valid.' };
      const result = await this.docker.composeAction(project, 'restart', {});
      return { ok: result.ok, message: result.ok ? `Compose project ${project} restarted.` : '', error: result.ok ? '' : result.error || 'Compose restart failed.' };
    }
    if (policy.action === 'k8s.restart') {
      if (!this.kubernetes) return { ok: false, error: 'Kubernetes is not available.' };
      const kind = String(target.kind || 'deployments');
      if (!['deployments', 'statefulsets', 'daemonsets'].includes(kind)) return { ok: false, error: 'Only Deployments, StatefulSets and DaemonSets can be restarted.' };
      const result = await this.kubernetes.resourceAction(kind, 'restart', { name: target.name, namespace: target.namespace });
      return { ok: result.ok, message: result.ok ? `Rollout restart requested for ${kind}/${target.name}.` : '', error: result.ok ? '' : result.error || 'Kubernetes restart failed.' };
    }
    if (policy.action === 'http.check') {
      if (!/^https?:\/\//i.test(String(target.url || ''))) return { ok: false, error: 'The health check URL is not valid.' };
      const result = await this.synthetic?.check({ kind: 'http', url: target.url, timeoutMs: 10000, expectedStatus: [200] });
      return { ok: result?.ok === true, message: result?.ok ? `${target.url} answered in ${result.durationMs} ms.` : '', error: result?.ok ? '' : (result?.error || 'The health check failed.') };
    }
    if (policy.action === 'notify.webhook') {
      if (!/^https?:\/\//i.test(String(target.url || ''))) return { ok: false, error: 'The webhook URL is not valid.' };
      const result = await sendChannel({ type: 'webhook', url: target.url, name: 'remediation' }, {
        type: 'remediation', at: new Date().toISOString(),
        alert: { name: `Remediation: ${policy.name}`, severity: 'info', summary: `Policy ${policy.name} executed.` },
      });
      return { ok: result.ok, message: result.ok ? 'Webhook delivered.' : '', error: result.error || '' };
    }
    return { ok: false, error: 'Unsupported action.' };
  }
}

module.exports = { RemediationManager, ACTIONS };
