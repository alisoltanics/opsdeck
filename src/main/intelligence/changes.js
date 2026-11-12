'use strict';

/**
 * Infrastructure change detection.
 *
 * Compares two real resource snapshots and records only differences that are
 * meaningful to an operator: appearance/removal, health transitions, image or
 * replica changes and database profile edits. The first snapshot establishes a
 * baseline and deliberately produces no change events, so a fresh install does
 * not claim that every existing container was "created".
 */

const { clean, hash } = require('./util');

const MAX_CHANGES_PER_CYCLE = 200;

function statusRank(status) {
  return { healthy: 0, unknown: 1, degraded: 2, stopped: 2, unhealthy: 3 }[status] ?? 1;
}

function severityForStatus(previous, next) {
  const before = statusRank(previous);
  const after = statusRank(next);
  if (after === before) return 'info';
  return after > before ? (next === 'unhealthy' ? 'error' : 'warning') : 'success';
}

function signature(resource) {
  const metadata = resource.metadata || {};
  return {
    status: resource.status || 'unknown',
    name: resource.name || '',
    image: resource.kind === 'container' ? clean(metadata.image, 240) : '',
    images: Array.isArray(metadata.images) ? hash(metadata.images.join('|')) : '',
    replicas: metadata.desired !== undefined ? `${metadata.desired}/${metadata.ready}` : '',
    updatedAt: metadata.updatedAt || '',
    namespace: resource.namespace || '',
  };
}

class ChangeDetector {
  constructor(store) {
    this.store = store;
    this.baseline = false;
  }

  /** Diff a snapshot, persist the new state and return new change records. */
  detect(resources = []) {
    const data = this.store.get();
    const previous = data.resourceState || {};
    const next = {};
    const changes = [];
    const now = new Date().toISOString();
    const initialized = Object.keys(previous).length > 0;
    const present = new Set();

    const push = (change) => {
      if (changes.length >= MAX_CHANGES_PER_CYCLE) return;
      const record = {
        id: `change-${Date.now().toString(36)}-${changes.length}-${Math.random().toString(36).slice(2, 6)}`,
        at: now,
        module: clean(change.module, 40),
        kind: change.kind,
        severity: change.severity || 'info',
        title: clean(change.title, 240),
        detail: clean(change.detail, 600),
        resource: clean(change.resource, 240),
        resourceId: clean(change.resourceId, 400),
        href: clean(change.href, 400),
        tags: Array.isArray(change.tags) ? change.tags.slice(0, 8).map((tag) => clean(tag, 60)) : [],
      };
      changes.push(record);
      data.changes.push(record);
    };

    for (const resource of resources) {
      if (!resource || !resource.id) continue;
      present.add(resource.id);
      const current = signature(resource);
      next[resource.id] = current;
      const before = previous[resource.id];
      if (!before) {
        if (initialized) {
          push({
            module: resource.module,
            kind: 'discovered',
            severity: ['unhealthy', 'degraded'].includes(resource.status) ? 'warning' : 'info',
            title: `${resource.kind} appeared: ${resource.name}`,
            detail: resource.statusDetail || '',
            resource: resource.name,
            resourceId: resource.id,
            href: resource.href,
            tags: [resource.kind, resource.module],
          });
        }
        continue;
      }
      if (before.status !== current.status) {
        push({
          module: resource.module,
          kind: 'status',
          severity: severityForStatus(before.status, current.status),
          title: `${resource.name}: ${before.status} → ${current.status}`,
          detail: resource.statusDetail || '',
          resource: resource.name,
          resourceId: resource.id,
          href: resource.href,
          tags: [resource.kind, resource.module, 'status'],
        });
      }
      if (current.image && before.image && current.image !== before.image) {
        push({
          module: resource.module,
          kind: 'image',
          severity: 'warning',
          title: `${resource.name}: image changed`,
          detail: `${before.image} → ${current.image}`,
          resource: resource.name,
          resourceId: resource.id,
          href: resource.href,
          tags: [resource.kind, 'image'],
        });
      }
      if (current.images && before.images && current.images !== before.images) {
        push({
          module: resource.module,
          kind: 'image',
          severity: 'warning',
          title: `${resource.name}: workload images changed`,
          detail: 'The workload template now references a different image set.',
          resource: resource.name,
          resourceId: resource.id,
          href: resource.href,
          tags: [resource.kind, 'image'],
        });
      }
      if (current.replicas && before.replicas && current.replicas !== before.replicas) {
        push({
          module: resource.module,
          kind: 'replicas',
          severity: 'info',
          title: `${resource.name}: replicas ${current.replicas}`,
          detail: `Previously ${before.replicas}.`,
          resource: resource.name,
          resourceId: resource.id,
          href: resource.href,
          tags: [resource.kind, 'replicas'],
        });
      }
      if (resource.module === 'databases' && current.updatedAt && before.updatedAt && current.updatedAt !== before.updatedAt) {
        push({
          module: resource.module,
          kind: 'configuration',
          severity: 'warning',
          title: `${resource.name}: connection profile changed`,
          detail: 'A saved database profile was edited.',
          resource: resource.name,
          resourceId: resource.id,
          href: resource.href,
          tags: ['database', 'configuration'],
        });
      }
    }

    for (const [id, before] of Object.entries(previous)) {
      if (present.has(id) || !initialized) continue;
      push({
        module: id.split(':')[0] || 'intelligence',
        kind: 'removed',
        severity: 'warning',
        title: `${id.split(':')[1] || 'resource'} disappeared: ${before.name || id}`,
        detail: 'The resource was present in the previous snapshot and is no longer reported.',
        resource: before.name || id,
        resourceId: id,
        href: '#/intelligence/changes',
        tags: ['removed'],
      });
    }

    data.resourceState = next;
    if (changes.length) {
      this.store.schedule();
      this.store.audit({
        action: 'change-detected',
        module: 'intelligence',
        resource: `${changes.length} resource change(s)`,
        detail: changes.slice(0, 8).map((entry) => entry.title).join('; '),
      });
    }
    this.baseline = initialized;
    return { changes, baseline: !initialized };
  }

  history(options = {}) {
    const limit = Math.max(1, Math.min(1000, Number(options.limit) || 200));
    const module = clean(options.module, 40);
    const kind = clean(options.kind, 60);
    const query = clean(options.query, 200).toLowerCase();
    let items = (this.store.get().changes || []).slice().reverse();
    if (module) items = items.filter((entry) => entry.module === module);
    if (kind) items = items.filter((entry) => entry.kind === kind);
    if (query) {
      items = items.filter((entry) => `${entry.title} ${entry.detail} ${entry.resource}`.toLowerCase().includes(query));
    }
    return { ok: true, items: items.slice(0, limit), total: items.length, baseline: this.baseline };
  }
}

module.exports = { ChangeDetector, signature, __test: { statusRank, severityForStatus, signature } };
