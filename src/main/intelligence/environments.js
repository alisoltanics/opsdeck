'use strict';

/**
 * Environment intelligence.
 *
 * Resources are associated with Local / Development / Testing / Staging /
 * Production / custom environments using, in order:
 *   1. an explicit assignment made in the UI,
 *   2. a user-defined rule,
 *   3. conservative name/label/namespace heuristics.
 *
 * The heuristics only fire on explicit tokens (exact `prod`, `staging`, …), so
 * a random resource is not silently labelled production.
 */

const { clean } = require('./util');

const ENVIRONMENT_TOKENS = [
  { id: 'production', tokens: ['production', 'prod', 'prd', 'live'] },
  { id: 'staging', tokens: ['staging', 'stage', 'stg', 'preprod', 'pre-prod'] },
  { id: 'testing', tokens: ['testing', 'test', 'qa', 'uat', 'sandbox'] },
  { id: 'development', tokens: ['development', 'dev', 'local-dev'] },
];

const LABEL_KEYS = [
  'environment', 'env', 'app.kubernetes.io/environment', 'deployment.environment',
  'com.docker.compose.project', 'com.docker.compose.project.working_dir',
];

function tokenMatch(value) {
  const text = String(value || '').toLowerCase().trim();
  if (!text) return null;
  const parts = text.split(/[^a-z0-9]+/).filter(Boolean);
  for (const entry of ENVIRONMENT_TOKENS) {
    for (const token of entry.tokens) {
      if (parts.includes(token)) return entry.id;
    }
  }
  return null;
}

function ruleMatches(rule, resource) {
  if (!rule || rule.enabled === false || !rule.pattern) return false;
  let value = '';
  if (rule.field === 'module') value = resource.module;
  else if (rule.field === 'namespace') value = resource.namespace;
  else if (rule.field === 'host') value = resource.host;
  else if (rule.field === 'image') value = resource.metadata?.image || '';
  else if (rule.field === 'label') value = Object.values(resource.labels || {}).join(' ');
  else value = resource.name;
  if (!value) return false;
  if (rule.mode === 'regex') {
    try { return new RegExp(rule.pattern, 'i').test(value); } catch { return false; }
  }
  return String(value).toLowerCase().includes(String(rule.pattern).toLowerCase());
}

function inferEnvironment(resource) {
  if (!resource) return null;
  if (resource.module === 'host' && resource.kind === 'host') return 'local';
  if (resource.module === 'docker' && resource.kind === 'engine') return 'local';
  if (resource.module === 'databases' && resource.metadata?.source?.type === 'local') return 'local';
  const namespace = tokenMatch(resource.namespace);
  if (namespace) return namespace;
  for (const key of LABEL_KEYS) {
    const value = resource.labels?.[key];
    if (value) {
      const match = tokenMatch(value);
      if (match) return match;
    }
  }
  if (resource.module === 'kubernetes' && resource.kind === 'namespace') return tokenMatch(resource.name);
  return tokenMatch(resource.name) || tokenMatch(resource.metadata?.image) || null;
}

class EnvironmentManager {
  constructor(store) {
    this.store = store;
  }

  environmentFor(resource, environments = null, rules = null, assignments = null) {
    if (!resource) return null;
    const data = this.store.get();
    const map = assignments || data.assignments || {};
    if (map[resource.id]) return map[resource.id];
    const envs = environments || data.environments || [];
    const ruleset = rules || data.environmentRules || [];
    for (const rule of ruleset) {
      if (ruleMatches(rule, resource) && envs.some((entry) => entry.id === rule.environment)) return rule.environment;
    }
    return inferEnvironment(resource);
  }

  annotate(resources = []) {
    return resources.map((resource) => ({
      ...resource,
      environment: this.environmentFor(resource),
    }));
  }

  list() {
    const data = this.store.get();
    const counts = {};
    for (const environment of data.environments) {
      counts[environment.id] = { total: 0, healthy: 0, degraded: 0, unhealthy: 0, stopped: 0, unknown: 0, byModule: {}, byKind: {} };
    }
    return {
      ok: true,
      environments: data.environments.map((environment) => ({ ...environment, assignmentCount: 0 })),
      rules: data.environmentRules,
      counts,
      settings: data.settings,
    };
  }

  summary(resources = []) {
    const data = this.store.get();
    const counts = {};
    for (const environment of data.environments) {
      counts[environment.id] = { total: 0, healthy: 0, degraded: 0, unhealthy: 0, stopped: 0, unknown: 0, byModule: {}, byKind: {} };
    }
    const unassigned = { total: 0, healthy: 0, degraded: 0, unhealthy: 0, stopped: 0, unknown: 0, byModule: {}, byKind: {} };
    for (const resource of resources) {
      const target = resource.environment ? counts[resource.environment] : unassigned;
      if (!target) { unassigned.total += 1; continue; }
      target.total += 1;
      target[resource.status] = (target[resource.status] || 0) + 1;
      target.byModule[resource.module] = (target.byModule[resource.module] || 0) + 1;
      target.byKind[resource.kind] = (target.byKind[resource.kind] || 0) + 1;
    }
    return {
      ok: true,
      environments: data.environments.map((environment) => ({ ...environment, counts: counts[environment.id] }))
        .filter((environment) => counts[environment.id].total > 0 || !environment.custom),
      unassigned,
      rules: data.environmentRules,
    };
  }

  assign(resourceId, environmentId) {
    const data = this.store.get();
    const id = clean(resourceId, 360);
    const env = clean(environmentId, 60);
    if (!id) throw new Error('A resource id is required.');
    if (env && !data.environments.some((entry) => entry.id === env)) throw new Error('That environment does not exist.');
    if (env) data.assignments[id] = env;
    else delete data.assignments[id];
    this.store.schedule();
    this.store.audit({
      action: 'environment-assign',
      module: 'intelligence',
      resource: id,
      detail: env ? `Assigned to ${env}` : 'Assignment removed',
    });
    return { ok: true, resourceId: id, environment: env || null };
  }

  saveEnvironment(input = {}) {
    const data = this.store.get();
    const requested = clean(input.id, 60);
    const slug = (requested || clean(input.name, 60))
      .toLowerCase()
      .replace(/[^a-z0-9_-]+/g, '-')
      .replace(/^-+|-+$/g, '')
      .slice(0, 60);
    let id = slug || `env-${Date.now().toString(36)}`;
    const existing = requested ? data.environments.find((entry) => entry.id === id) : null;
    if (existing && !existing.custom) throw new Error('Built-in environments cannot be renamed or replaced.');
    if (!existing && !requested) {
      // Keep generated slugs stable and unique without overwriting an existing
      // custom environment when two names normalize to the same id.
      let suffix = 2;
      while (data.environments.some((entry) => entry.id === id)) {
        id = `${slug}-${suffix}`;
        suffix += 1;
      }
    }
    const item = {
      id,
      name: clean(input.name, 80) || id,
      tone: clean(input.tone, 20) || 'slate',
      kind: 'custom',
      description: clean(input.description, 300),
      custom: true,
      createdAt: existing?.createdAt || new Date().toISOString(),
    };
    if (existing) data.environments[data.environments.indexOf(existing)] = item;
    else data.environments.push(item);
    this.store.schedule();
    this.store.audit({ action: 'environment-save', module: 'intelligence', resource: id, detail: item.name });
    return { ok: true, environment: item };
  }

  deleteEnvironment(id) {
    const data = this.store.get();
    const target = data.environments.find((entry) => entry.id === id);
    if (!target) throw new Error('That environment does not exist.');
    if (!target.custom) throw new Error('Built-in environments cannot be deleted.');
    data.environments = data.environments.filter((entry) => entry.id !== id);
    for (const [resourceId, env] of Object.entries(data.assignments)) {
      if (env === id) delete data.assignments[resourceId];
    }
    data.environmentRules = data.environmentRules.filter((rule) => rule.environment !== id);
    this.store.schedule();
    this.store.audit({ action: 'environment-delete', module: 'intelligence', resource: id, detail: target.name });
    return { ok: true };
  }

  saveRule(input = {}) {
    const data = this.store.get();
    const pattern = clean(input.pattern, 200);
    if (!pattern) throw new Error('A rule pattern is required.');
    const environment = clean(input.environment, 60);
    if (!data.environments.some((entry) => entry.id === environment)) throw new Error('Choose an existing environment.');
    if (input.mode === 'regex') {
      try { new RegExp(pattern, 'i'); } catch (error) { throw new Error(`The regular expression is not valid: ${error.message}`); }
    }
    const item = {
      id: clean(input.id, 80) || `rule-${Date.now().toString(36)}`,
      pattern,
      environment,
      field: ['name', 'label', 'namespace', 'host', 'image', 'module'].includes(input.field) ? input.field : 'name',
      mode: input.mode === 'regex' ? 'regex' : 'contains',
      enabled: input.enabled !== false,
    };
    const index = data.environmentRules.findIndex((rule) => rule.id === item.id);
    if (index >= 0) data.environmentRules[index] = item;
    else data.environmentRules.push(item);
    this.store.schedule();
    this.store.audit({ action: 'environment-rule-save', module: 'intelligence', resource: item.id, detail: `${item.field} ${item.mode} ${pattern} → ${environment}` });
    return { ok: true, rule: item };
  }

  deleteRule(id) {
    const data = this.store.get();
    data.environmentRules = data.environmentRules.filter((rule) => rule.id !== id);
    this.store.schedule();
    return { ok: true };
  }
}

module.exports = {
  EnvironmentManager,
  inferEnvironment,
  tokenMatch,
  ruleMatches,
  ENVIRONMENT_TOKENS,
  __test: { tokenMatch, ruleMatches, inferEnvironment },
};
