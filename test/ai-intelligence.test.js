'use strict';

/**
 * Cross-module AI context tests.
 *
 * The intelligence context must carry live evidence from the intelligence
 * service, keep observed relationships separate from inferred ones, and never
 * fall back to inventing resources when a collector is unavailable.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const { AIService } = require('../src/main/ai');

function tempDir() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'opsdeck-ai-intel-'));
}

function resource(overrides = {}) {
  return {
    id: 'docker:container:web',
    module: 'docker',
    kind: 'container',
    name: 'web',
    status: 'healthy',
    namespace: '',
    cluster: '',
    host: 'local',
    environment: 'prod',
    href: '#/containers',
    labels: {},
    metadata: {},
    ...overrides,
  };
}

function fakeIntelligence(overrides = {}) {
  const items = [
    resource(),
    resource({ id: 'k8s:pod:api-1', module: 'kubernetes', kind: 'pod', name: 'api-1', namespace: 'shop', status: 'degraded' }),
    resource({ id: 'database:conn:orders', module: 'databases', kind: 'database', name: 'orders', status: 'unhealthy' }),
  ];
  const base = {
    bootstrap: () => ({
      ok: true,
      modules: { docker: true, kubernetes: true, databases: true, observability: false },
      settings: {
        automationEnabled: true,
        automationIntervalSec: 15,
        slos: [{ name: 'API availability', metric: 'synthetic.up', comparison: 'gte', threshold: 1, target: 99.9 }],
        cost: { cpuHour: 0.04, memoryGbHour: 0.005, currency: 'EUR' },
      },
      favorites: [{ module: 'kubernetes', kind: 'pod', name: 'api-1', href: '#/kubernetes/pods' }],
      automations: [],
    }),
    snapshot: async () => ({
      items,
      sources: { docker: { ok: true }, kubernetes: { ok: false, error: 'no context' }, databases: { ok: true } },
      collectedAt: new Date().toISOString(),
    }),
    totals: (list) => ({
      total: list.length,
      byModule: { docker: 1, kubernetes: 1, databases: 1 },
      byStatus: { healthy: 1, degraded: 1, unhealthy: 1 },
      byEnvironment: { prod: 3 },
    }),
    listIncidents: () => ({
      ok: true,
      items: [{ id: 'inc-1', title: 'API latency', severity: 'critical', status: 'open', alertCount: 2, updatedAt: '2026-01-01T10:00:00.000Z' }],
    }),
    incidentGet: (id) => (id === 'inc-1'
      ? {
        ok: true,
        incident: {
          id: 'inc-1', title: 'API latency', severity: 'critical', status: 'open',
          timeline: [{ at: '2026-01-01T10:00:00.000Z', text: 'Latency crossed the p95 objective.' }],
        },
      }
      : { ok: false, error: 'not found' }),
    changesHistory: () => ({
      items: [{ at: '2026-01-01T09:00:00.000Z', module: 'docker', kind: 'container', name: 'web', type: 'updated' }],
    }),
    timeline: async () => ({ items: [{ at: '2026-01-01T10:00:00.000Z', module: 'kubernetes', severity: 'warning', title: 'Pod restarted' }] }),
    graph: async () => ({
      stats: { nodes: 3, edges: 2, observed: 1, inferred: 1 },
      edges: [
        { from: 'docker:container:web', to: 'database:conn:orders', kind: 'connects', confidence: 'observed', evidence: 'published port 5432' },
        { from: 'k8s:pod:api-1', to: 'docker:container:web', kind: 'calls', confidence: 'inferred', evidence: 'shared name' },
      ],
    }),
    automations: () => ({ items: [{ name: 'Restart watcher', enabled: true, trigger: { type: 'condition' }, lastStatus: 'dry-run', lastRunAt: '2026-01-01T10:00:00.000Z' }] }),
    automationRuns: () => ({ items: [{ startedAt: '2026-01-01T10:00:00.000Z', status: 'dry-run', dryRun: true, reason: 'Would restart web', steps: [{}] }] }),
    environmentsList: () => ({ items: [{ name: 'prod', kind: 'custom', resourceCount: 3, description: 'Customer traffic' }] }),
    reportTypes: () => ({ ok: true, types: ['health', 'incident'] }),
    auditList: () => ({ ok: true, items: [{ at: '2026-01-01T10:00:00.000Z', module: 'intelligence', action: 'settings-update', outcome: 'success', detail: 'interval' }] }),
    investigate: async () => ({
      ok: true,
      facts: ['Incident “API latency” is open with critical severity.'],
      hypotheses: [{ confidence: 'medium', title: 'A recent container update increased latency.' }],
      limitations: ['No span data was retained.'],
    }),
  };
  return { ...base, ...overrides };
}

function service(intelligence) {
  const dir = tempDir();
  const svc = new AIService({
    app: { getPath: () => dir },
    content: { load: () => null },
    intelligence,
  });
  return { svc, dir };
}

test('intelligence AI context reports live inventory and unavailable sources', async () => {
  const { svc, dir } = service(fakeIntelligence());
  try {
    const out = await svc.buildContext({ kind: 'intelligence', page: 'overview' });
    assert.equal(out.kind, 'intelligence');
    assert.equal(out.meta.engineAvailable, null);
    assert.ok(!/## Docker engine/i.test(out.text));
    assert.match(out.text, /## Inventory/);
    assert.match(out.text, /"total": 3/);
    assert.match(out.text, /unavailable: no context/);
    assert.match(out.text, /api-1/);
    assert.match(out.text, /orders/);
    assert.match(out.text, /## Pinned resources/);
    assert.match(out.text, /observed or inferred/);
  } finally {
    svc.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('intelligence AI context separates observed from inferred relationships', async () => {
  const { svc, dir } = service(fakeIntelligence());
  try {
    const out = await svc.buildContext({ kind: 'intelligence', page: 'graph' });
    assert.match(out.text, /observed/);
    assert.match(out.text, /inferred/);
    assert.match(out.text, /docker:container:web/);
    assert.match(out.text, /published port 5432/);
    assert.match(out.text, /## Graph statistics/);
  } finally {
    svc.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('intelligence AI context includes an incident timeline and recent incidents', async () => {
  const { svc, dir } = service(fakeIntelligence());
  try {
    const out = await svc.buildContext({ kind: 'intelligence', page: 'incidents', id: 'inc-1' });
    assert.match(out.text, /API latency/);
    assert.match(out.text, /Latency crossed the p95 objective/);
    assert.match(out.text, /## Recent incidents/);
    assert.match(out.text, /critical · open/);
  } finally {
    svc.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('intelligence AI context labels root-cause hypotheses as unconfirmed', async () => {
  const { svc, dir } = service(fakeIntelligence());
  try {
    const out = await svc.buildContext({ kind: 'intelligence', page: 'rca', name: 'api' });
    assert.match(out.text, /## Facts/);
    assert.match(out.text, /## Hypotheses \(not confirmed\)/);
    assert.match(out.text, /A recent container update increased latency/);
    assert.match(out.text, /## Limitations/);
    assert.match(out.text, /No span data was retained/);
  } finally {
    svc.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('intelligence AI context degrades safely without the service', async () => {
  const { svc, dir } = service(null);
  try {
    const out = await svc.buildContext({ kind: 'intelligence', page: 'overview' });
    assert.equal(out.kind, 'intelligence');
    assert.match(out.text, /cross-module intelligence service is not available/i);
    assert.equal(out.meta.engineAvailable, null);
  } finally {
    svc.dispose();
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
