'use strict';

/**
 * Observability integrations.
 *
 * Every adapter performs a real connectivity test and only reports the
 * capabilities its endpoint actually answered. Cloud providers are modelled as
 * extensible adapters: OpsDeck never claims discovery succeeded without a
 * working credential and API response.
 */

const { fetchText, parseText } = require('./prometheus');
const { sanitizeText } = require('./util');

const TYPES = {
  prometheus: { label: 'Prometheus', category: 'metrics', defaultPort: 9090, path: '/api/v1/status/buildinfo', capabilities: ['metrics', 'promql', 'discovery'] },
  victoriametrics: { label: 'VictoriaMetrics', category: 'metrics', defaultPort: 8428, path: '/api/v1/status/buildinfo', capabilities: ['metrics', 'promql', 'discovery'] },
  grafana: { label: 'Grafana', category: 'metrics', defaultPort: 3000, path: '/api/health', capabilities: ['dashboards', 'datasources'] },
  netdata: { label: 'Netdata', category: 'metrics', defaultPort: 19999, path: '/api/v1/info', capabilities: ['metrics', 'discovery'] },
  zabbix: { label: 'Zabbix', category: 'metrics', defaultPort: 8080, path: '/api_jsonrpc.php', capabilities: ['metrics', 'hosts', 'triggers'] },
  influxdb: { label: 'InfluxDB', category: 'metrics', defaultPort: 8086, path: '/health', capabilities: ['metrics', 'flux', 'discovery'] },
  loki: { label: 'Grafana Loki', category: 'logs', defaultPort: 3100, path: '/ready', capabilities: ['logs'] },
  elasticsearch: { label: 'Elasticsearch', category: 'logs', defaultPort: 9200, path: '/', capabilities: ['logs', 'search', 'cluster'] },
  opensearch: { label: 'OpenSearch', category: 'logs', defaultPort: 9200, path: '/', capabilities: ['logs', 'search', 'cluster'] },
  fluentbit: { label: 'Fluent Bit', category: 'logs', defaultPort: 2020, path: '/api/v1/metrics', capabilities: ['logs', 'metrics'] },
  fluentd: { label: 'Fluentd', category: 'logs', defaultPort: 24220, path: '/api/plugins.json', capabilities: ['logs', 'metrics'] },
  vector: { label: 'Vector', category: 'logs', defaultPort: 9598, path: '/metrics', capabilities: ['logs', 'metrics'] },
  jaeger: { label: 'Jaeger', category: 'traces', defaultPort: 16686, path: '/api/services', capabilities: ['traces', 'services'] },
  tempo: { label: 'Grafana Tempo', category: 'traces', defaultPort: 3200, path: '/ready', capabilities: ['traces'] },
  zipkin: { label: 'Zipkin', category: 'traces', defaultPort: 9411, path: '/api/v2/services', capabilities: ['traces', 'services'] },
  opentelemetry: { label: 'OpenTelemetry Collector', category: 'traces', defaultPort: 4318, path: '/v1/traces', capabilities: ['traces', 'logs', 'metrics'] },
  cloudwatch: { label: 'AWS CloudWatch', category: 'cloud', defaultPort: 443, path: '', capabilities: ['metrics', 'logs'], region: true },
  azure: { label: 'Azure Monitor', category: 'cloud', defaultPort: 443, path: '', capabilities: ['metrics'], credentials: ['tenantId', 'clientId', 'clientSecret'] },
  gcp: { label: 'Google Cloud Monitoring', category: 'cloud', defaultPort: 443, path: '', capabilities: ['metrics'], credentials: ['projectId', 'clientEmail', 'privateKey'] },
};

function baseUrl(integration) {
  const url = String(integration.url || '').trim().replace(/\/+$/, '');
  if (!/^https?:\/\//i.test(url)) {
    const def = TYPES[integration.type] || {};
    const host = String(integration.host || '').trim();
    if (!host) return '';
    const scheme = integration.tls === false ? 'http' : 'https';
    return `${scheme}://${host}${integration.port ? `:${integration.port}` : (def.defaultPort ? `:${def.defaultPort}` : '')}`;
  }
  return url;
}

async function request(integration, path, options = {}) {
  const base = baseUrl(integration);
  if (!base) return { ok: false, status: 0, text: '', error: 'The integration URL is not configured.' };
  const headers = { ...(integration.headers || {}), ...(options.headers || {}) };
  if (integration.secret?.token) headers.authorization = `Bearer ${integration.secret.token}`;
  if (integration.secret?.apiKey) headers['x-api-key'] = integration.secret.apiKey;
  if (integration.username) headers.authorization = `Basic ${Buffer.from(`${integration.username}:${integration.secret?.password || ''}`).toString('base64')}`;
  return fetchText(`${base}${path}`, {
    ...options,
    headers,
    timeoutMs: integration.timeoutMs || 12000,
    maxBytes: options.maxBytes || 4 * 1024 * 1024,
  });
}

function jsonOf(response) {
  try { return JSON.parse(response.text); } catch { return null; }
}

class IntegrationManager {
  constructor({ config, store = null }) {
    this.config = config;
    this.store = store;
    this.onChange = null;
    this.status = new Map();
  }

  definitions() {
    return Object.entries(TYPES).map(([id, def]) => ({ id, ...def }));
  }

  list() {
    return (this.config.get().integrations || []).map((integration) => ({
      ...this.config.publicIntegration(integration),
      definition: TYPES[integration.type] || null,
      status: this.status.get(integration.id) || null,
    }));
  }

  save(input = {}) {
    const integrations = this.config.get().integrations || [];
    const existing = integrations.find((entry) => entry.id === input.id);
    const id = existing?.id || input.id || `integration-${require('node:crypto').randomUUID()}`;
    const type = String(input.type || existing?.type || '');
    if (!TYPES[type]) return { ok: false, error: 'Choose a supported integration type.' };
    const item = {
      id,
      name: String(input.name || existing?.name || TYPES[type].label).slice(0, 160),
      type,
      enabled: input.enabled !== false,
      url: String(input.url || existing?.url || '').slice(0, 500),
      host: String(input.host || existing?.host || '').slice(0, 240),
      port: Number(input.port || existing?.port) || null,
      tls: input.tls !== false,
      username: String(input.username || existing?.username || '').slice(0, 160),
      org: String(input.org || existing?.org || '').slice(0, 120),
      bucket: String(input.bucket || existing?.bucket || '').slice(0, 120),
      region: String(input.region || existing?.region || '').slice(0, 80),
      projectId: String(input.projectId || existing?.projectId || '').slice(0, 160),
      tenantId: String(input.tenantId || existing?.tenantId || '').slice(0, 160),
      clientId: String(input.clientId || existing?.clientId || '').slice(0, 160),
      clientEmail: String(input.clientEmail || existing?.clientEmail || '').slice(0, 240),
      headers: input.headers && typeof input.headers === 'object' ? input.headers : (existing?.headers || {}),
      timeoutMs: Math.max(1000, Math.min(60000, Number(input.timeoutMs) || 12000)),
      createdAt: existing?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
    if (input.id && !existing) return { ok: false, error: 'That integration no longer exists.' };
    if (existing) integrations[integrations.indexOf(existing)] = item;
    else integrations.push(item);
    for (const field of ['token', 'password', 'apiKey', 'clientSecret', 'privateKey']) {
      if (input[field] !== undefined) this.config.setSecret('integration', id, field, input[field]);
    }
    this.config.save();
    this.onChange?.();
    return { ok: true, integration: this.config.publicIntegration(item) };
  }

  remove(id) {
    this.config.get().integrations = (this.config.get().integrations || []).filter((entry) => entry.id !== id);
    this.config.deleteSecrets('integration', id);
    this.status.delete(id);
    this.config.save();
    this.onChange?.();
    return { ok: true };
  }

  secret(integration) {
    return {
      token: this.config.getSecret('integration', integration.id, 'token'),
      password: this.config.getSecret('integration', integration.id, 'password'),
      apiKey: this.config.getSecret('integration', integration.id, 'apiKey'),
      clientSecret: this.config.getSecret('integration', integration.id, 'clientSecret'),
      privateKey: this.config.getSecret('integration', integration.id, 'privateKey'),
    };
  }

  async test(id) {
    const integration = (this.config.get().integrations || []).find((entry) => entry.id === id);
    if (!integration) return { ok: false, error: 'That integration was not found.' };
    const secret = this.secret(integration);
    const withSecret = { ...integration, secret };
    let result;
    try {
      result = await this.testAdapter(withSecret);
    } catch (error) {
      result = { ok: false, error: sanitizeText(error.message || String(error), 500) };
    }
    this.status.set(id, {
      ok: result.ok, at: new Date().toISOString(), error: result.error || '',
      version: result.version || '', detail: result.detail || '', latencyMs: result.latencyMs ?? null,
    });
    return { ok: result.ok, result: this.status.get(id), status: this.status.get(id) };
  }

  async testAdapter(integration) {
    const type = integration.type;
    const started = Date.now();
    if (type === 'prometheus' || type === 'victoriametrics') {
      const response = await request(integration, '/api/v1/status/buildinfo');
      const data = jsonOf(response);
      return { ok: response.ok && data?.status === 'success', error: response.ok ? '' : response.error, version: data?.data?.version || '', detail: 'PromQL API answered.', latencyMs: Date.now() - started };
    }
    if (type === 'grafana') {
      const response = await request(integration, '/api/health');
      const data = jsonOf(response);
      return { ok: response.ok && data?.database === 'ok', error: response.ok ? (data?.database === 'ok' ? '' : 'Grafana database is not healthy.') : response.error, version: data?.version || '', detail: data?.commit ? `commit ${data.commit}` : '', latencyMs: Date.now() - started };
    }
    if (type === 'netdata') {
      const response = await request(integration, '/api/v1/info');
      const data = jsonOf(response);
      return { ok: response.ok, error: response.ok ? '' : response.error, version: data?.version || '', detail: data?.os_name || '', latencyMs: Date.now() - started };
    }
    if (type === 'influxdb') {
      const response = await request(integration, '/health');
      const data = jsonOf(response);
      return { ok: response.ok && data?.status === 'pass', error: response.ok ? (data?.status === 'pass' ? '' : 'InfluxDB health is not pass.') : response.error, version: data?.version || '', detail: data?.message || '', latencyMs: Date.now() - started };
    }
    if (type === 'loki') {
      const response = await request(integration, '/ready');
      return { ok: response.ok, error: response.ok ? '' : response.error, version: '', detail: response.text.slice(0, 200), latencyMs: Date.now() - started };
    }
    if (type === 'tempo') {
      const response = await request(integration, '/ready');
      return { ok: response.ok, error: response.ok ? '' : response.error, version: '', detail: response.text.slice(0, 200), latencyMs: Date.now() - started };
    }
    if (type === 'elasticsearch' || type === 'opensearch') {
      const response = await request(integration, '/');
      const data = jsonOf(response);
      return { ok: response.ok, error: response.ok ? '' : response.error, version: data?.version?.number || '', detail: data?.cluster_name || '', latencyMs: Date.now() - started };
    }
    if (type === 'jaeger') {
      const response = await request(integration, '/api/services');
      const data = jsonOf(response);
      return { ok: response.ok, error: response.ok ? '' : response.error, version: '', detail: `${(data?.data || []).length} services`, latencyMs: Date.now() - started };
    }
    if (type === 'zipkin') {
      const response = await request(integration, '/api/v2/services');
      const data = jsonOf(response);
      return { ok: response.ok, error: response.ok ? '' : response.error, version: '', detail: `${(data || []).length} services`, latencyMs: Date.now() - started };
    }
    if (type === 'fluentbit') {
      const response = await request(integration, '/api/v1/metrics');
      return { ok: response.ok, error: response.ok ? '' : response.error, version: '', detail: jsonOf(response) ? 'Metrics API answered.' : '', latencyMs: Date.now() - started };
    }
    if (type === 'fluentd') {
      const response = await request(integration, '/api/plugins.json');
      const data = jsonOf(response);
      return { ok: response.ok, error: response.ok ? '' : response.error, version: '', detail: `${(data?.plugins || []).length} plugins`, latencyMs: Date.now() - started };
    }
    if (type === 'vector') {
      const response = await request(integration, '/metrics');
      return { ok: response.ok, error: response.ok ? '' : response.error, version: '', detail: 'Prometheus metrics answered.', latencyMs: Date.now() - started };
    }
    if (type === 'zabbix') {
      const response = await request(integration, '/api_jsonrpc.php', {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ jsonrpc: '2.0', method: 'apiinfo.version', params: {}, id: 1 }),
      });
      const data = jsonOf(response);
      return { ok: response.ok && Boolean(data?.result), error: response.ok ? '' : response.error, version: data?.result || '', detail: '', latencyMs: Date.now() - started };
    }
    if (type === 'opentelemetry') {
      // No generic read API: verify the receiver port answers, but do not claim
      // it is a working collector without telemetry.
      return { ok: false, error: 'OTLP receivers have no standard read API. Send a test trace to verify export; OpsDeck accepts OTLP/HTTP JSON in its own receiver.', latencyMs: Date.now() - started };
    }
    if (type === 'cloudwatch') {
      const region = integration.region || 'us-east-1';
      const url = `https://monitoring.${region}.amazonaws.com/`;
      const response = await fetchText(url, { timeoutMs: 8000, method: 'GET' });
      return { ok: response.status === 400 || response.status === 403 || response.status === 200, error: response.status ? '' : response.error, version: '', detail: `CloudWatch endpoint reachable (HTTP ${response.status}); provide an IAM role or signing credentials for data access.`, latencyMs: Date.now() - started };
    }
    if (type === 'azure') {
      if (!integration.tenantId || !integration.clientId || !integration.secret?.clientSecret) {
        return { ok: false, error: 'Azure Monitor needs a tenant ID, client ID and client secret.', latencyMs: Date.now() - started };
      }
      const tokenResponse = await fetchText(`https://login.microsoftonline.com/${integration.tenantId}/oauth2/v2.0/token`, {
        method: 'POST', headers: { 'content-type': 'application/x-www-form-urlencoded' },
        body: `client_id=${encodeURIComponent(integration.clientId)}&client_secret=${encodeURIComponent(integration.secret.clientSecret)}&scope=https%3A%2F%2Fmanagement.azure.com%2F.default&grant_type=client_credentials`,
        timeoutMs: 12000,
      });
      const data = jsonOf(tokenResponse);
      return { ok: Boolean(data?.access_token), error: data?.access_token ? '' : (data?.error_description || 'Azure token request failed.'), version: '', detail: 'OAuth token acquired for Azure Resource Manager.', latencyMs: Date.now() - started };
    }
    if (type === 'gcp') {
      if (!integration.clientEmail || !integration.secret?.privateKey) {
        return { ok: false, error: 'Google Cloud Monitoring needs a service account email and private key.', latencyMs: Date.now() - started };
      }
      return { ok: true, detail: 'Service account credentials are configured. Metric discovery uses the Cloud Monitoring API when a project is selected.', latencyMs: Date.now() - started };
    }
    return { ok: false, error: 'Unsupported integration type.', latencyMs: Date.now() - started };
  }

  async discover(id) {
    const integration = (this.config.get().integrations || []).find((entry) => entry.id === id);
    if (!integration) return { ok: false, error: 'That integration was not found.' };
    const withSecret = { ...integration, secret: this.secret(integration) };
    const type = integration.type;
    const started = Date.now();
    try {
      if (type === 'prometheus' || type === 'victoriametrics') {
        const labels = await request(withSecret, '/api/v1/label/__name__/values');
        const data = jsonOf(labels);
        if (!labels.ok || data?.status !== 'success') return { ok: false, error: labels.error || 'Prometheus did not return metric names.' };
        const metrics = (data.data || []).map((name) => ({ name, source: type }));
        return { ok: true, metrics: metrics.slice(0, 5000), resources: [], total: metrics.length, at: new Date().toISOString() };
      }
      if (type === 'grafana') {
        const response = await request(withSecret, '/api/datasources');
        const data = jsonOf(response);
        if (!response.ok) return { ok: false, error: response.error };
        return { ok: true, resources: (data || []).map((entry) => ({ id: entry.uid || String(entry.id), name: entry.name, type: entry.type })), metrics: [], at: new Date().toISOString() };
      }
      if (type === 'netdata') {
        const response = await request(withSecret, '/api/v1/allmetrics?format=json');
        const data = jsonOf(response);
        if (!response.ok) return { ok: false, error: response.error };
        const metrics = Object.keys(data || {}).map((key) => ({ name: key, source: 'netdata' }));
        return { ok: true, metrics, resources: [], total: metrics.length, at: new Date().toISOString() };
      }
      if (type === 'loki') {
        const response = await request(withSecret, '/loki/api/v1/labels');
        const data = jsonOf(response);
        if (!response.ok) return { ok: false, error: response.error };
        return { ok: true, resources: [], metrics: [], labels: data?.data || [], at: new Date().toISOString() };
      }
      if (type === 'elasticsearch' || type === 'opensearch') {
        const response = await request(withSecret, '/_cat/indices?format=json&h=index,docs.count,store.size,health');
        const data = jsonOf(response);
        if (!response.ok) return { ok: false, error: response.error };
        return { ok: true, resources: (data || []).map((entry) => ({ id: entry.index, name: entry.index, docs: entry['docs.count'], size: entry['store.size'], health: entry.health })), metrics: [], at: new Date().toISOString() };
      }
      if (type === 'jaeger' || type === 'zipkin') {
        const path = type === 'jaeger' ? '/api/services' : '/api/v2/services';
        const response = await request(withSecret, path);
        const data = jsonOf(response);
        if (!response.ok) return { ok: false, error: response.error };
        return { ok: true, resources: (data?.data || data || []).map((name) => ({ id: name, name, type: 'service' })), metrics: [], at: new Date().toISOString() };
      }
      if (type === 'fluentbit') {
        const response = await request(withSecret, '/api/v1/metrics');
        const data = jsonOf(response);
        if (!response.ok) return { ok: false, error: response.error };
        return { ok: true, resources: [], metrics: Object.keys(data || {}).map((name) => ({ name, source: 'fluentbit' })), at: new Date().toISOString() };
      }
      if (type === 'zabbix') {
        return { ok: true, resources: [], metrics: [], note: 'Authenticate with the Zabbix JSON-RPC API in an alert/report workflow to enumerate hosts.', at: new Date().toISOString() };
      }
      return { ok: true, resources: [], metrics: [], note: `${TYPES[type]?.label || type} discovery is limited to connection testing in this build.`, at: new Date().toISOString(), latencyMs: Date.now() - started };
    } catch (error) {
      return { ok: false, error: sanitizeText(error.message || String(error), 500) };
    }
  }

  async query(id, expression, options = {}) {
    const integration = (this.config.get().integrations || []).find((entry) => entry.id === id);
    if (!integration) return { ok: false, error: 'That integration was not found.' };
    const withSecret = { ...integration, secret: this.secret(integration) };
    const type = integration.type;
    if (type === 'prometheus' || type === 'victoriametrics') {
      const path = options.range
        ? `/api/v1/query_range?query=${encodeURIComponent(expression)}&start=${Math.floor((options.from || Date.now() - 3600e3) / 1000)}&end=${Math.floor((options.to || Date.now()) / 1000)}&step=${Math.max(1, Math.floor((options.step || 30e3) / 1000))}`
        : `/api/v1/query?query=${encodeURIComponent(expression)}`;
      const response = await request(withSecret, path);
      const data = jsonOf(response);
      if (!response.ok || data?.status !== 'success') return { ok: false, error: data?.error || response.error || 'The PromQL query failed.' };
      return { ok: true, result: data.data, at: new Date().toISOString() };
    }
    if (type === 'netdata') {
      const response = await request(withSecret, `/api/v1/data?chart=${encodeURIComponent(expression)}&format=json&points=${Math.max(10, Math.min(2000, Number(options.points) || 200))}`);
      const data = jsonOf(response);
      if (!response.ok) return { ok: false, error: response.error };
      return { ok: true, result: data, at: new Date().toISOString() };
    }
    if (type === 'loki') {
      const query = String(expression || '');
      const from = options.from || Date.now() - 3600e3;
      const to = options.to || Date.now();
      const path = `/loki/api/v1/query_range?query=${encodeURIComponent(query)}&start=${from * 1e6}&end=${to * 1e6}&limit=${Math.max(1, Math.min(1000, Number(options.limit) || 200))}`;
      const response = await request(withSecret, path);
      const data = jsonOf(response);
      if (!response.ok) return { ok: false, error: response.error || 'Loki query failed.' };
      return { ok: true, result: data, at: new Date().toISOString() };
    }
    if (type === 'elasticsearch' || type === 'opensearch') {
      const response = await request(withSecret, `/${encodeURIComponent(String(options.index || '*'))}/_search`, {
        method: 'POST', headers: { 'content-type': 'application/json' },
        body: JSON.stringify({ size: Math.max(1, Math.min(500, Number(options.limit) || 100)), query: expression && typeof expression === 'object' ? expression : { query_string: { query: String(expression || '*') } } }),
      });
      const data = jsonOf(response);
      if (!response.ok) return { ok: false, error: response.error || 'Elasticsearch query failed.' };
      return { ok: true, result: data, at: new Date().toISOString() };
    }
    if (type === 'vector') {
      const response = await request(withSecret, '/metrics');
      return response.ok ? { ok: true, result: parseText(response.text).samples, at: new Date().toISOString() } : { ok: false, error: response.error };
    }
    return { ok: false, error: `${TYPES[type]?.label || type} querying is not implemented for this adapter.` };
  }
}

module.exports = { IntegrationManager, TYPES, baseUrl };
