'use strict';

/**
 * Persistence for the intelligence layer.
 *
 * One JSON document (mode 0600, atomic replace) holds environments, automation
 * definitions, run history, the audit trail, favourites and saved views. Lists
 * are bounded so a long-running install cannot grow without limit, and a
 * corrupt file degrades to defaults instead of breaking startup.
 */

const fs = require('node:fs');
const path = require('node:path');
const { writePrivate } = require('../databases/vault');
const { clean, clamp } = require('./util');

const LIMITS = {
  automations: 200,
  runs: 500,
  audit: 2000,
  changes: 2000,
  favorites: 500,
  savedSearches: 100,
  savedQueries: 500,
  workspaces: 100,
  notes: 500,
  assignments: 2000,
  schemaSnapshotsPerConnection: 8,
  schemaSnapshots: 80,
};

const DEFAULT_ENVIRONMENTS = [
  { id: 'local', name: 'Local', tone: 'slate', kind: 'local', description: 'This workstation and the services running on it.' },
  { id: 'development', name: 'Development', tone: 'green', kind: 'development', description: 'Shared development resources.' },
  { id: 'testing', name: 'Testing', tone: 'cyan', kind: 'testing', description: 'Test and QA resources.' },
  { id: 'staging', name: 'Staging', tone: 'amber', kind: 'staging', description: 'Pre-production validation.' },
  { id: 'production', name: 'Production', tone: 'red', kind: 'production', description: 'Live customer-facing resources.' },
];

function defaults() {
  return {
    version: 1,
    environments: DEFAULT_ENVIRONMENTS.map((entry) => ({ ...entry, custom: false })),
    environmentRules: [],
    assignments: {},
    automations: [],
    runs: [],
    audit: [],
    favorites: [],
    savedSearches: [],
    savedQueries: [],
    workspaces: [],
    notes: [],
    changes: [],
    resourceState: {},
    schemaSnapshots: [],
    settings: {
      environmentMatch: true,
      automationEnabled: true,
      automationIntervalSec: 15,
      slos: [],
      capacityThresholds: { cpu: 80, memory: 85, disk: 85 },
      cost: { cpuHour: 0, memoryGbHour: 0, currency: 'USD' },
    },
  };
}

function array(value) {
  return Array.isArray(value) ? value : [];
}

function trimList(list, max) {
  if (list.length > max) list.splice(0, list.length - max);
  return list;
}

function normalizeSnapshotEntry(entry) {
  const tables = array(entry.tables).slice(0, 400).map((table) => ({
    schema: clean(table?.schema, 120),
    name: clean(table?.name, 240),
    kind: clean(table?.kind, 40) || 'table',
    columns: array(table?.columns).slice(0, 300).map((column) => [
      clean(column?.[0], 200), clean(column?.[1], 120), clean(column?.[2], 20), clean(column?.[3], 200), clean(column?.[4], 20),
    ]),
    indexes: array(table?.indexes).slice(0, 80).map((index) => [
      clean(index?.[0], 200), index?.[1] ? 1 : 0, clean(index?.[2], 1000),
    ]),
    foreignKeys: array(table?.foreignKeys).slice(0, 80).map((fk) => [
      clean(fk?.[0], 200), clean(fk?.[1], 1000), clean(fk?.[2], 240),
    ]),
  })).filter((table) => table.name);
  const at = clean(entry.at, 40) || new Date().toISOString();
  return {
    connectionId: clean(entry.connectionId, 80),
    at,
    lastSeenAt: clean(entry.lastSeenAt, 40) || at,
    engine: clean(entry.engine, 40),
    hash: clean(entry.hash, 80),
    tables,
    counts: {
      tables: tables.length,
      columns: tables.reduce((sum, table) => sum + table.columns.length, 0),
      indexes: tables.reduce((sum, table) => sum + table.indexes.length, 0),
      foreignKeys: tables.reduce((sum, table) => sum + table.foreignKeys.length, 0),
    },
  };
}

class IntelligenceStore {
  constructor(app) {
    this.file = path.join(app.getPath('userData'), 'intelligence.json');
    this.data = defaults();
    this.loaded = false;
    this.dirty = false;
    this.timer = null;
    this.load();
  }

  load() {
    try {
      const raw = JSON.parse(fs.readFileSync(this.file, 'utf8'));
      const base = defaults();
      this.data = {
        ...base,
        ...raw,
        settings: { ...base.settings, ...(raw.settings || {}) },
        assignments: raw.assignments && typeof raw.assignments === 'object' ? raw.assignments : {},
        environments: array(raw.environments).length ? raw.environments : base.environments,
      };
    } catch {
      this.data = defaults();
    }
    this.normalize();
    this.loaded = true;
    return this;
  }

  normalize() {
    const data = this.data;
    data.version = 1;
    data.environments = array(data.environments)
      .filter((entry) => entry && typeof entry === 'object' && clean(entry.id, 60))
      .map((entry) => ({
        id: clean(entry.id, 60),
        name: clean(entry.name, 80) || clean(entry.id, 60),
        tone: clean(entry.tone, 20) || 'slate',
        kind: clean(entry.kind, 40) || 'custom',
        description: clean(entry.description, 300),
        custom: entry.custom === true,
        createdAt: entry.createdAt || new Date().toISOString(),
      }));
    if (!data.environments.length) data.environments = DEFAULT_ENVIRONMENTS.map((entry) => ({ ...entry, custom: false }));
    data.environmentRules = array(data.environmentRules)
      .filter((rule) => rule && typeof rule === 'object')
      .slice(0, 100)
      .map((rule) => ({
        id: String(rule.id || '').slice(0, 80) || `rule-${Math.random().toString(36).slice(2, 10)}`,
        pattern: clean(rule.pattern, 200),
        environment: clean(rule.environment, 60),
        field: ['name', 'label', 'namespace', 'host', 'image', 'module'].includes(rule.field) ? rule.field : 'name',
        mode: rule.mode === 'regex' ? 'regex' : 'contains',
        enabled: rule.enabled !== false,
      }));
    for (const key of ['automations', 'runs', 'audit', 'favorites', 'savedSearches', 'savedQueries', 'workspaces', 'notes', 'changes']) {
      data[key] = array(data[key]);
    }    trimList(data.automations, LIMITS.automations);
    trimList(data.runs, LIMITS.runs);
    trimList(data.audit, LIMITS.audit);
    trimList(data.favorites, LIMITS.favorites);
    trimList(data.savedSearches, LIMITS.savedSearches);
    trimList(data.savedQueries, LIMITS.savedQueries);
    data.savedQueries = data.savedQueries
      .filter((entry) => entry && typeof entry === 'object' && String(entry.sql || '').trim())
      .map((entry) => ({
        id: clean(entry.id, 80) || `query-${Math.random().toString(36).slice(2, 10)}`,
        name: clean(entry.name, 120) || 'Saved query',
        sql: String(entry.sql || '').slice(0, 20000),
        engine: clean(entry.engine, 40),
        connectionId: clean(entry.connectionId, 80),
        connectionName: clean(entry.connectionName, 160),
        database: clean(entry.database, 120),
        description: clean(entry.description, 400),
        tags: array(entry.tags).slice(0, 8).map((tag) => clean(tag, 30)).filter(Boolean),
        author: clean(entry.author, 80) || 'local-user',
        createdAt: clean(entry.createdAt, 40) || new Date().toISOString(),
        updatedAt: clean(entry.updatedAt, 40) || new Date().toISOString(),
      }));
    trimList(data.workspaces, LIMITS.workspaces);
    trimList(data.notes, LIMITS.notes);
    data.notes = data.notes
      .filter((entry) => entry && typeof entry === 'object' && String(entry.body || '').trim())
      .map((entry) => ({
        id: clean(entry.id, 80) || `note-${Math.random().toString(36).slice(2, 10)}`,
        module: clean(entry.module, 40) || 'databases',
        resourceId: clean(entry.resourceId, 400),
        connectionId: clean(entry.connectionId, 80),
        database: clean(entry.database, 120),
        schema: clean(entry.schema, 120),
        table: clean(entry.table, 240),
        body: String(entry.body || '').slice(0, 8000),
        author: clean(entry.author, 80) || 'local-user',
        createdAt: clean(entry.createdAt, 40) || new Date().toISOString(),
        updatedAt: clean(entry.updatedAt, 40) || new Date().toISOString(),
      }));
    trimList(data.changes, LIMITS.changes);
    data.schemaSnapshots = array(data.schemaSnapshots)
      .filter((entry) => entry && typeof entry === 'object' && clean(entry.connectionId, 80) && clean(entry.hash, 80))
      .slice(-LIMITS.schemaSnapshots)
      .map(normalizeSnapshotEntry);
    const state = {};
    let stateCount = 0;
    for (const [key, value] of Object.entries(data.resourceState || {})) {
      if (stateCount >= 3000) break;
      if (!value || typeof value !== 'object') continue;
      state[String(key).slice(0, 360)] = {
        status: clean(value.status, 30),
        name: clean(value.name, 240),
        image: clean(value.image, 240),
        images: clean(value.images, 400),
        namespace: clean(value.namespace, 200),
        at: clean(value.at, 40),
      };
      stateCount += 1;
    }
    data.resourceState = state;
    const assignments = {};
    let count = 0;
    for (const [key, value] of Object.entries(data.assignments || {})) {
      if (count >= LIMITS.assignments) break;
      if (typeof value !== 'string' || !value) continue;
      assignments[String(key).slice(0, 360)] = value.slice(0, 60);
      count += 1;
    }
    data.assignments = assignments;
    data.settings.automationIntervalSec = clamp(data.settings.automationIntervalSec || 15, 5, 3600);
    data.settings.slos = array(data.settings.slos).slice(0, 50).map((slo, index) => ({
      id: clean(slo.id, 60) || `slo-${index + 1}`,
      name: clean(slo.name, 120) || 'Service objective',
      metric: clean(slo.metric, 120) || 'synthetic.up',
      aggregation: ['avg', 'max', 'min', 'last'].includes(slo.aggregation) ? slo.aggregation : 'avg',
      comparison: slo.comparison === 'lte' ? 'lte' : 'gte',
      threshold: clamp(slo.threshold == null ? 1 : slo.threshold, -1e12, 1e12),
      target: clamp(slo.target == null ? 99.9 : slo.target, 0, 100),
      windowHours: clamp(slo.windowHours || 24, 1, 720),
      unit: clean(slo.unit, 20),
      enabled: slo.enabled !== false,
    }));
    data.settings.capacityThresholds = {
      cpu: clamp(data.settings.capacityThresholds?.cpu || 80, 1, 100),
      memory: clamp(data.settings.capacityThresholds?.memory || 85, 1, 100),
      disk: clamp(data.settings.capacityThresholds?.disk || 85, 1, 100),
    };
    data.settings.cost = {
      cpuHour: clamp(data.settings.cost?.cpuHour || 0, 0, 1000),
      memoryGbHour: clamp(data.settings.cost?.memoryGbHour || 0, 0, 1000),
      currency: clean(data.settings.cost?.currency, 8) || 'USD',
    };
  }

  get() {
    return this.data;
  }

  schedule() {
    this.dirty = true;
    if (this.timer) return;
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.dirty) this.persist();
    }, 800);
    this.timer.unref?.();
  }

  persist() {
    if (!this.loaded) return false;
    this.dirty = false;
    try {
      if (this.timer) { clearTimeout(this.timer); this.timer = null; }
      writePrivate(this.file, JSON.stringify(this.data, null, 2));
      return true;
    } catch (error) {
      console.error('Could not save intelligence data:', error.message);
      return false;
    }
  }

  // ------------------------------------------------------------------- audit

  audit(entry = {}) {
    const record = {
      id: `audit-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`,
      at: new Date().toISOString(),
      actor: clean(entry.actor, 120) || 'local-user',
      action: clean(entry.action, 120) || 'unknown',
      module: clean(entry.module, 40) || 'intelligence',
      resource: clean(entry.resource, 400),
      outcome: ['success', 'failure', 'pending', 'denied'].includes(entry.outcome) ? entry.outcome : 'success',
      detail: clean(entry.detail, 1000),
      meta: entry.meta && typeof entry.meta === 'object' ? entry.meta : undefined,
    };
    this.data.audit.push(record);
    trimList(this.data.audit, LIMITS.audit);
    this.schedule();
    return record;
  }

  auditList(options = {}) {
    const limit = clamp(options.limit || 200, 1, 1000);
    let items = this.data.audit.slice().reverse();
    if (options.module) items = items.filter((entry) => entry.module === options.module);
    if (options.action) items = items.filter((entry) => entry.action === options.action);
    if (options.resource) items = items.filter((entry) => entry.resource === options.resource);
    if (options.outcome) items = items.filter((entry) => entry.outcome === options.outcome);
    return items.slice(0, limit);
  }

  // -------------------------------------------------------------- favourites

  favorite(input = {}) {
    const id = clean(input.id, 400);
    if (!id) throw new Error('A resource id is required.');
    const existing = this.data.favorites.find((entry) => entry.id === id);
    if (input.remove === true || existing) {
      this.data.favorites = this.data.favorites.filter((entry) => entry.id !== id);
      this.schedule();
      return { ok: true, favorite: false, id };
    }
    this.data.favorites.push({
      id,
      module: clean(input.module, 40),
      kind: clean(input.kind, 60),
      name: clean(input.name, 200),
      href: /^#\/[A-Za-z0-9/_?&=.#%-]*$/.test(String(input.href || '')) ? clean(input.href, 400) : '',
      at: new Date().toISOString(),
    });
    trimList(this.data.favorites, LIMITS.favorites);
    this.schedule();
    return { ok: true, favorite: true, id };
  }

  favorites() {
    return { ok: true, items: this.data.favorites.slice().reverse() };
  }

  // ---------------------------------------------------------- saved searches

  saveSearch(input = {}) {
    const name = clean(input.name, 120) || 'Saved search';
    const query = clean(input.query, 300);
    const filters = input.filters && typeof input.filters === 'object' ? input.filters : {};
    const item = {
      id: clean(input.id, 80) || `search-${Date.now().toString(36)}`,
      name, query, filters,
      at: new Date().toISOString(),
    };
    const index = this.data.savedSearches.findIndex((entry) => entry.id === item.id);
    if (index >= 0) this.data.savedSearches[index] = item;
    else this.data.savedSearches.push(item);
    trimList(this.data.savedSearches, LIMITS.savedSearches);
    this.schedule();
    return { ok: true, item };
  }

  savedSearches() {
    return { ok: true, items: this.data.savedSearches.slice().reverse() };
  }

  removeSaved(id) {
    this.data.savedSearches = this.data.savedSearches.filter((entry) => entry.id !== id);
    this.schedule();
    return { ok: true };
  }

  // ------------------------------------------------------------ query library

  saveQuery(input = {}) {
    const sql = String(input.sql || '').slice(0, 20000);
    if (!sql.trim()) throw new Error('A query is required.');
    const tags = Array.isArray(input.tags)
      ? [...new Set(input.tags.map((tag) => clean(tag, 30)).filter(Boolean))].slice(0, 8)
      : [];
    const now = new Date().toISOString();
    const item = {
      id: clean(input.id, 80) || `query-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      name: clean(input.name, 120) || 'Saved query',
      sql,
      engine: clean(input.engine, 40),
      connectionId: clean(input.connectionId, 80),
      connectionName: clean(input.connectionName, 160),
      database: clean(input.database, 120),
      description: clean(input.description, 400),
      tags,
      author: clean(input.author, 80) || 'local-user',
      createdAt: now,
      updatedAt: now,
    };
    const index = this.data.savedQueries.findIndex((entry) => entry.id === item.id);
    if (index >= 0) {
      item.createdAt = this.data.savedQueries[index].createdAt || now;
      this.data.savedQueries[index] = item;
    } else {
      this.data.savedQueries.push(item);
    }
    trimList(this.data.savedQueries, LIMITS.savedQueries);
    this.schedule();
    return { ok: true, item };
  }

  queries(filters = {}) {
    const text = clean(filters.query, 200).toLowerCase();
    const engine = clean(filters.engine, 40);
    const connectionId = clean(filters.connectionId, 80);
    const tag = clean(filters.tag, 30);
    const limit = clamp(filters.limit || 200, 1, LIMITS.savedQueries);
    const items = this.data.savedQueries
      .filter((entry) => {
        if (engine && entry.engine !== engine) return false;
        if (connectionId && entry.connectionId !== connectionId) return false;
        if (tag && !(entry.tags || []).includes(tag)) return false;
        if (!text) return true;
        return [entry.name, entry.description, entry.sql, entry.author, ...(entry.tags || [])]
          .join('\n').toLowerCase().includes(text);
      })
      .slice()
      .reverse()
      .slice(0, limit);
    const tags = [...new Set(this.data.savedQueries.flatMap((entry) => entry.tags || []))].sort();
    return { ok: true, items, total: this.data.savedQueries.length, tags };
  }

  deleteQuery(id) {
    const key = clean(id, 80);
    const before = this.data.savedQueries.length;
    this.data.savedQueries = this.data.savedQueries.filter((entry) => entry.id !== key);
    this.schedule();
    return { ok: true, removed: before !== this.data.savedQueries.length };
  }

  // ----------------------------------------------------------- object notes

  saveNote(input = {}) {
    const body = String(input.body || '').slice(0, 8000);
    if (!body.trim()) throw new Error('A note body is required.');
    const now = new Date().toISOString();
    const item = {
      id: clean(input.id, 80) || `note-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      module: clean(input.module, 40) || 'databases',
      resourceId: clean(input.resourceId, 400),
      connectionId: clean(input.connectionId, 80),
      database: clean(input.database, 120),
      schema: clean(input.schema, 120),
      table: clean(input.table, 240),
      body,
      author: clean(input.author, 80) || 'local-user',
      createdAt: now,
      updatedAt: now,
    };
    const index = this.data.notes.findIndex((entry) => entry.id === item.id);
    if (index >= 0) {
      item.createdAt = this.data.notes[index].createdAt || now;
      this.data.notes[index] = item;
    } else {
      this.data.notes.push(item);
    }
    trimList(this.data.notes, LIMITS.notes);
    this.schedule();
    return { ok: true, item };
  }

  notes(filters = {}) {
    const connectionId = clean(filters.connectionId, 80);
    const database = clean(filters.database, 120);
    const table = clean(filters.table, 240);
    const resourceId = clean(filters.resourceId, 400);
    const module = clean(filters.module, 40);
    const limit = clamp(filters.limit || 200, 1, LIMITS.notes);
    const items = this.data.notes.filter((entry) => {
      if (module && entry.module !== module) return false;
      if (connectionId && entry.connectionId !== connectionId) return false;
      if (database && entry.database !== database) return false;
      if (table && entry.table !== table) return false;
      if (resourceId && entry.resourceId !== resourceId) return false;
      return true;
    }).slice().reverse().slice(0, limit);
    return { ok: true, items, total: this.data.notes.length };
  }

  deleteNote(id) {
    const key = clean(id, 80);
    const before = this.data.notes.length;
    this.data.notes = this.data.notes.filter((entry) => entry.id !== key);
    this.schedule();
    return { ok: true, removed: before !== this.data.notes.length };
  }

  // -------------------------------------------------------------- saved views

  saveWorkspace(input = {}) {
    const item = {
      id: clean(input.id, 80) || `workspace-${Date.now().toString(36)}`,
      name: clean(input.name, 160) || 'Investigation',
      description: clean(input.description, 400),
      modules: Array.isArray(input.modules) ? input.modules.slice(0, 8).map((m) => clean(m, 40)) : [],
      query: clean(input.query, 300),
      filters: input.filters && typeof input.filters === 'object' ? input.filters : {},
      at: new Date().toISOString(),
    };
    const index = this.data.workspaces.findIndex((entry) => entry.id === item.id);
    if (index >= 0) this.data.workspaces[index] = item;
    else this.data.workspaces.push(item);
    trimList(this.data.workspaces, LIMITS.workspaces);
    this.schedule();
    return { ok: true, item };
  }

  workspaces() {
    return { ok: true, items: this.data.workspaces.slice().reverse() };
  }

  removeWorkspace(id) {
    this.data.workspaces = this.data.workspaces.filter((entry) => entry.id !== id);
    this.schedule();
    return { ok: true };
  }

  // --------------------------------------------------------- schema history

  schemaSnapshots(connectionId = '') {
    const id = clean(connectionId, 80);
    const items = this.data.schemaSnapshots.filter((entry) => !id || entry.connectionId === id);
    return items.slice().sort((a, b) => String(a.at).localeCompare(String(b.at)));
  }

  latestSchemaSnapshot(connectionId = '') {
    const items = this.schemaSnapshots(connectionId);
    return items[items.length - 1] || null;
  }

  /**
   * Store a schema capture, or refresh the timestamp when the structure is
   * unchanged. Per-connection and global history stay bounded.
   */
  recordSchemaSnapshot(input = {}) {
    const entry = normalizeSnapshotEntry(input);
    if (!entry.connectionId || !entry.hash) throw new Error('A connection and schema hash are required.');
    const existing = this.data.schemaSnapshots.filter((item) => item.connectionId === entry.connectionId);
    const latest = existing[existing.length - 1];
    if (latest && latest.hash === entry.hash) {
      latest.lastSeenAt = entry.at;
      this.schedule();
      return { ok: true, stored: false, snapshot: latest };
    }
    this.data.schemaSnapshots.push(entry);
    // Keep only the most recent captures per connection.
    const perConnection = this.data.schemaSnapshots.filter((item) => item.connectionId === entry.connectionId);
    if (perConnection.length > LIMITS.schemaSnapshotsPerConnection) {
      const drop = new Set(perConnection.slice(0, perConnection.length - LIMITS.schemaSnapshotsPerConnection));
      this.data.schemaSnapshots = this.data.schemaSnapshots.filter((item) => !drop.has(item));
    }
    trimList(this.data.schemaSnapshots, LIMITS.schemaSnapshots);
    this.schedule();
    return { ok: true, stored: true, snapshot: entry };
  }
}

module.exports = { IntelligenceStore, LIMITS, DEFAULT_ENVIRONMENTS };
