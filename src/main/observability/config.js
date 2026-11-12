'use strict';

/**
 * Persistent observability configuration.
 *
 * Non-secret settings live in observability.json (mode 0600). Credentials,
 * bearer tokens and SMTP passwords are encrypted with the existing SecretVault
 * and only booleans are exposed to the renderer.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { writePrivate } = require('../databases/vault');

const MAX_INCIDENTS = 500;
const MAX_ALERTS = 1000;

const OVERVIEW_WIDGETS = [
  'infrastructure', 'system', 'service-health', 'health-score', 'top-consumers',
  'problem-services', 'recent-alerts', 'recent-incidents', 'trends', 'agents',
];

const DEFAULT_CONFIG = {
  version: 1,
  enabled: true,
  intervalSec: 10,
  collectors: {
    local: true,
    network: true,
    docker: true,
    kubernetes: true,
    databases: true,
    synthetic: true,
    remote: true,
    logs: true,
    applications: true,
  },
  databaseMonitor: {
    autoConnect: false,
    intervalSec: 30,
  },
  remote: { intervalSec: 30 },
  synthetic: { intervalSec: 30 },
  network: { intervalSec: 60 },
  applications: { intervalSec: 30 },
  kubernetesMonitor: { intervalSec: 30 },
  retention: {
    rawHours: 24,
    aggregateDays: 30,
    rollupAfterHours: 6,
    fiveMinuteAfterHours: 48,
    maxSeries: 5000,
    logsDays: 7,
    tracesDays: 7,
    maxLogs: 20000,
    maxTraces: 5000,
    maxEvents: 5000,
  },
  notifications: {
    channels: [],
    defaultPolicy: 'all',
  },
  overview: {
    widgets: OVERVIEW_WIDGETS.slice(),
  },
  dashboards: [],
  alertRules: [],
  alerts: [],
  silences: [],
  maintenance: [],
  incidents: [],
  integrations: [],
  servers: [],
  targets: [],
  networkChecks: [],
  networkDevices: [],
  agents: {
    enabled: false,
    bind: '127.0.0.1',
    port: 0,
    tls: false,
    items: [],
  },
  remediation: {
    enabled: false,
    policies: [],
    executions: [],
  },
  preferences: {
    healthWeights: { hosts: 0.25, containers: 0.2, clusters: 0.2, databases: 0.15, services: 0.2 },
    timeRange: '1h',
  },
  secrets: {},
};

function isPlainObject(value) {
  return !!value && typeof value === 'object' && !Array.isArray(value);
}

function mergeDefaults(target, defaults) {
  const out = {};
  for (const [key, value] of Object.entries(defaults)) {
    if (isPlainObject(value)) out[key] = mergeDefaults(isPlainObject(target?.[key]) ? target[key] : {}, value);
    else if (Array.isArray(value)) out[key] = Array.isArray(target?.[key]) ? target[key] : value.slice();
    else out[key] = target?.[key] === undefined ? value : target[key];
  }
  for (const [key, value] of Object.entries(target || {})) if (!(key in out)) out[key] = value;
  return out;
}

function boundedInt(value, min, max, fallback) {
  const n = Number(value);
  return Number.isInteger(n) && n >= min && n <= max ? n : fallback;
}

function clean(value, max = 400) {
  return String(value == null ? '' : value).replace(/[\u0000-\u001f]/g, ' ').slice(0, max).trim();
}

function validId(value) {
  return typeof value === 'string' && /^[a-zA-Z0-9][a-zA-Z0-9_-]{3,80}$/.test(value);
}

function validHttpUrl(raw) {
  try {
    const parsed = new URL(String(raw || ''));
    return parsed.protocol === 'http:' || parsed.protocol === 'https:';
  } catch {
    return false;
  }
}

function normalizeId(value, prefix) {
  if (validId(value)) return value;
  return `${prefix}-${crypto.randomUUID()}`;
}

class ObservabilityConfig {
  constructor(app, vault) {
    this.app = app;
    this.vault = vault;
    this.file = path.join(app.getPath('userData'), 'observability.json');
    this.data = mergeDefaults({}, DEFAULT_CONFIG);
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      if (raw && typeof raw === 'object') {
        this.data = mergeDefaults(raw, DEFAULT_CONFIG);
        this.data.version = 1;
        this.normalize();
      }
    } catch { /* first run or unreadable config */ }
  }

  normalize() {
    const d = this.data;
    d.enabled = d.enabled !== false;
    d.intervalSec = boundedInt(d.intervalSec, 2, 300, 10);
    d.databaseMonitor.intervalSec = boundedInt(d.databaseMonitor.intervalSec, 5, 600, 30);
    d.databaseMonitor.autoConnect = d.databaseMonitor.autoConnect === true;
    d.remote.intervalSec = boundedInt(d.remote.intervalSec, 10, 600, 30);
    d.synthetic.intervalSec = boundedInt(d.synthetic.intervalSec, 10, 600, 30);
    d.network.intervalSec = boundedInt(d.network.intervalSec, 15, 900, 60);
    d.applications.intervalSec = boundedInt(d.applications.intervalSec, 10, 600, 30);
    d.kubernetesMonitor.intervalSec = boundedInt(d.kubernetesMonitor.intervalSec, 10, 600, 30);
    d.retention.rawHours = boundedInt(d.retention.rawHours, 1, 720, 24);
    d.retention.aggregateDays = boundedInt(d.retention.aggregateDays, 1, 3650, 30);
    d.retention.rollupAfterHours = boundedInt(d.retention.rollupAfterHours, 1, Math.max(1, d.retention.rawHours - 1), 6);
    d.retention.fiveMinuteAfterHours = boundedInt(d.retention.fiveMinuteAfterHours, 2, d.retention.rawHours, 48);
    d.retention.maxSeries = boundedInt(d.retention.maxSeries, 100, 100000, 5000);
    d.retention.logsDays = boundedInt(d.retention.logsDays, 1, 365, 7);
    d.retention.tracesDays = boundedInt(d.retention.tracesDays, 1, 365, 7);
    d.retention.maxLogs = boundedInt(d.retention.maxLogs, 100, 200000, 20000);
    d.retention.maxTraces = boundedInt(d.retention.maxTraces, 100, 50000, 5000);
    d.retention.maxEvents = boundedInt(d.retention.maxEvents, 100, 100000, 5000);
    for (const [key, value] of Object.entries(d.collectors)) d.collectors[key] = value !== false;
    d.overview.widgets = Array.isArray(d.overview.widgets) ? d.overview.widgets.filter((w) => OVERVIEW_WIDGETS.includes(w)) : OVERVIEW_WIDGETS.slice();
    if (!d.overview.widgets.length) d.overview.widgets = OVERVIEW_WIDGETS.slice();
    d.alerts = Array.isArray(d.alerts) ? d.alerts.slice(0, MAX_ALERTS) : [];
    d.incidents = Array.isArray(d.incidents) ? d.incidents.slice(0, MAX_INCIDENTS) : [];
    d.silences = Array.isArray(d.silences) ? d.silences.slice(0, 500) : [];
    d.maintenance = Array.isArray(d.maintenance) ? d.maintenance.slice(0, 200) : [];
    d.alertRules = Array.isArray(d.alertRules) ? d.alertRules : [];
    d.integrations = Array.isArray(d.integrations) ? d.integrations : [];
    d.servers = Array.isArray(d.servers) ? d.servers : [];
    d.targets = Array.isArray(d.targets) ? d.targets : [];
    d.networkChecks = Array.isArray(d.networkChecks) ? d.networkChecks : [];
    d.networkDevices = Array.isArray(d.networkDevices) ? d.networkDevices : [];
    d.dashboards = Array.isArray(d.dashboards) ? d.dashboards : [];
    d.notifications.channels = Array.isArray(d.notifications.channels) ? d.notifications.channels : [];
    d.agents.items = Array.isArray(d.agents.items) ? d.agents.items : [];
    d.remediation.policies = Array.isArray(d.remediation.policies) ? d.remediation.policies : [];
    d.remediation.executions = Array.isArray(d.remediation.executions) ? d.remediation.executions.slice(0, 500) : [];
    d.agents.enabled = d.agents.enabled === true;
    d.agents.bind = clean(d.agents.bind, 80) || '127.0.0.1';
    d.agents.port = boundedInt(d.agents.port, 0, 65535, 0);
    d.agents.tls = d.agents.tls === true;
    d.remediation.enabled = d.remediation.enabled === true;
    d.secrets = isPlainObject(d.secrets) ? d.secrets : {};
  }

  save() {
    this.normalize();
    try {
      writePrivate(this.file, JSON.stringify(this.data, null, 2));
      return true;
    } catch (error) {
      console.error('Could not save observability configuration:', error.message);
      return false;
    }
  }

  get() {
    return this.data;
  }

  seedDashboards(dashboards) {
    if (!this.data.dashboards.length) {
      this.data.dashboards = dashboards;
      this.save();
    }
  }

  // ------------------------------------------------------------- secrets
  secretKey(scope, id, field) {
    return `${scope}:${id}:${field}`;
  }

  setSecret(scope, id, field, value) {
    const key = this.secretKey(scope, id, field);
    if (value === null || value === undefined || value === '') {
      delete this.data.secrets[key];
      return;
    }
    this.data.secrets[key] = this.vault.encrypt(String(value).slice(0, 64 * 1024));
  }

  hasSecret(scope, id, field) {
    return Boolean(this.data.secrets[this.secretKey(scope, id, field)]);
  }

  getSecret(scope, id, field) {
    const value = this.data.secrets[this.secretKey(scope, id, field)];
    if (!value) return '';
    try { return this.vault.decrypt(value); } catch { return ''; }
  }

  deleteSecrets(scope, id) {
    const prefix = `${scope}:${id}:`;
    for (const key of Object.keys(this.data.secrets)) {
      if (key.startsWith(prefix)) delete this.data.secrets[key];
    }
  }

  // ------------------------------------------------------------- serializers
  publicIntegration(item) {
    if (!item) return null;
    return {
      ...item,
      hasToken: this.hasSecret('integration', item.id, 'token'),
      hasPassword: this.hasSecret('integration', item.id, 'password'),
      hasApiKey: this.hasSecret('integration', item.id, 'apiKey'),
      secretFields: [
        this.hasSecret('integration', item.id, 'token') ? 'token' : '',
        this.hasSecret('integration', item.id, 'password') ? 'password' : '',
        this.hasSecret('integration', item.id, 'apiKey') ? 'apiKey' : '',
      ].filter(Boolean),
    };
  }

  publicServer(server) {
    if (!server) return null;
    return {
      ...server,
      hasPassword: this.hasSecret('server', server.id, 'password'),
      hasPrivateKey: this.hasSecret('server', server.id, 'privateKey'),
      hasPassphrase: this.hasSecret('server', server.id, 'passphrase'),
      hasToken: this.hasSecret('server', server.id, 'token'),
    };
  }

  publicTarget(target) {
    if (!target) return null;
    return {
      ...target,
      hasPassword: this.hasSecret('target', target.id, 'password'),
      hasToken: this.hasSecret('target', target.id, 'token'),
      hasHeaderValue: this.hasSecret('target', target.id, 'headerValue'),
    };
  }

  publicChannel(channel) {
    if (!channel) return null;
    return {
      ...channel,
      hasToken: this.hasSecret('channel', channel.id, 'token'),
      hasPassword: this.hasSecret('channel', channel.id, 'password'),
      hasSecret: this.hasSecret('channel', channel.id, 'secret'),
    };
  }

  publicAgent(agent) {
    if (!agent) return null;
    const { tokenHash, ...rest } = agent;
    void tokenHash;
    return { ...rest, tokenConfigured: Boolean(agent.tokenHash) };
  }

  publicConfig() {
    const d = this.data;
    return {
      version: d.version,
      enabled: d.enabled,
      intervalSec: d.intervalSec,
      collectors: { ...d.collectors },
      databaseMonitor: { ...d.databaseMonitor },
      retention: { ...d.retention },
      notifications: {
        defaultPolicy: d.notifications.defaultPolicy,
        channels: d.notifications.channels.map((channel) => this.publicChannel(channel)),
      },
      overview: { widgets: d.overview.widgets.slice() },
      preferences: { ...d.preferences },
      agents: {
        enabled: d.agents.enabled,
        bind: d.agents.bind,
        port: d.agents.port,
        tls: d.agents.tls,
        items: d.agents.items.map((agent) => this.publicAgent(agent)),
      },
      remediation: {
        enabled: d.remediation.enabled,
        policies: d.remediation.policies,
        executions: d.remediation.executions.slice(0, 100),
      },
      vault: { secureStorage: this.vault.safeAvailable(), backend: this.vault.backend() },
      counts: {
        integrations: d.integrations.length,
        servers: d.servers.length,
        targets: d.targets.length,
        dashboards: d.dashboards.length,
        alertRules: d.alertRules.length,
        incidents: d.incidents.length,
      },
    };
  }
}

module.exports = {
  ObservabilityConfig, DEFAULT_CONFIG, OVERVIEW_WIDGETS,
  validId, validHttpUrl, clean, boundedInt, normalizeId, mergeDefaults,
};
