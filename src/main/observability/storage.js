'use strict';

/**
 * Local time-series storage for OpsDeck monitoring.
 *
 * Monitoring data is deliberately kept out of the Academy SQLite database and
 * out of the renderer. Samples live in bounded per-series ring arrays with
 * automatic rollups:
 *
 *   raw   – the configured collection interval, recent window
 *   1 min – average/sum/count buckets for older data
 *   5 min – coarse buckets for long retention
 *
 * Only bounded data is ever written to disk. Retention is enforced by timestamp
 * during compaction, never by deleting a file behind the user's back.
 */

const fs = require('node:fs');
const path = require('node:path');
const zlib = require('node:zlib');
const crypto = require('node:crypto');
const { normalizeMetrics, seriesKey, aggregate, stableLabels } = require('./metrics');
const { writePrivate } = require('../databases/vault');

const MAX_FILE_BYTES = 256 * 1024 * 1024;
const DEFAULT_MAX_SERIES = 5000;

function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function bucketMerge(target, source) {
  if (!source.length) return target;
  if (!target.length) return source.slice();
  const byTime = new Map(target.map((entry) => [entry[0], entry]));
  for (const entry of source) {
    const existing = byTime.get(entry[0]);
    if (!existing) {
      byTime.set(entry[0], entry);
      continue;
    }
    const sum = (Number(existing[1]) || 0) + (Number(entry[1]) || 0);
    const count = (Number(existing[2]) || 0) + (Number(entry[2]) || 0);
    byTime.set(entry[0], [entry[0], sum, count]);
  }
  return [...byTime.values()].sort((a, b) => a[0] - b[0]);
}

function bucketize(points, bucketMs, now) {
  const buckets = new Map();
  for (const [t, v] of points) {
    const index = Math.floor(t / bucketMs) * bucketMs;
    const entry = buckets.get(index) || { sum: 0, count: 0, last: 0 };
    entry.sum += Number(v) || 0;
    entry.count += 1;
    entry.last = Number(v) || 0;
    buckets.set(index, entry);
  }
  void now;
  return [...buckets.entries()].map(([t, entry]) => [t, entry.sum, entry.count]).sort((a, b) => a[0] - b[0]);
}

class MetricsStore {
  constructor({ file, retention } = {}) {
    this.file = file || '';
    this.series = new Map();
    this.dirty = false;
    this.savedAt = 0;
    this.retention = {
      rawHours: 24,
      aggregateDays: 30,
      rollupAfterHours: 6,
      fiveMinuteAfterHours: 48,
      maxSeries: DEFAULT_MAX_SERIES,
      ...(retention || {}),
    };
    this.fileBytes = 0;
    this.lastCompact = 0;
    this.rejected = 0;
    this.loaded = false;
  }

  updateRetention(retention = {}) {
    this.retention = {
      ...this.retention,
      ...Object.fromEntries(Object.entries(retention).filter(([, value]) => Number.isFinite(Number(value)))),
    };
    this.dirty = true;
  }

  load() {
    if (!this.file || !fs.existsSync(this.file)) return this;
    try {
      const stat = fs.statSync(this.file);
      if (stat.size > MAX_FILE_BYTES) {
        console.error('Monitoring metrics file is larger than the configured limit; starting a new bounded store.');
        return this;
      }
      this.fileBytes = stat.size;
      const raw = zlib.gunzipSync(fs.readFileSync(this.file));
      const data = JSON.parse(raw.toString('utf8'));
      if (!data || data.version !== 1 || !Array.isArray(data.series)) return this;
      for (const entry of data.series) {
        if (!entry || !entry.name || !entry.key) continue;
        this.series.set(entry.key, {
          name: String(entry.name),
          source: String(entry.source || 'unknown'),
          resource: String(entry.resource || 'local'),
          unit: String(entry.unit || 'count'),
          method: String(entry.method || 'poll'),
          labels: stableLabels(entry.labels || {}),
          raw: Array.isArray(entry.raw) ? entry.raw.filter(validPair) : [],
          minute: Array.isArray(entry.minute) ? entry.minute.filter(validTriple) : [],
          five: Array.isArray(entry.five) ? entry.five.filter(validTriple) : [],
          lastAt: Number(entry.lastAt) || 0,
        });
      }
      this.savedAt = Number(data.savedAt) || 0;
      this.loaded = true;
    } catch (error) {
      console.error('Could not load monitoring metrics:', error.message);
    }
    return this;
  }

  record(list) {
    const metrics = normalizeMetrics(list);
    if (!metrics.length) return { recorded: 0, rejected: 0, series: 0 };
    const now = Date.now();
    let recorded = 0;
    const touched = new Set();
    for (const metric of metrics) {
      if (this.series.size >= this.retention.maxSeries && !this.series.has(seriesKey(metric))) {
        this.rejected += 1;
        continue;
      }
      const key = seriesKey(metric);
      let series = this.series.get(key);
      if (!series) {
        series = {
          name: metric.name,
          source: metric.source,
          resource: metric.resource,
          unit: metric.unit,
          method: metric.method,
          labels: metric.labels,
          raw: [],
          minute: [],
          five: [],
          lastAt: 0,
        };
        this.series.set(key, series);
      }
      const t = metric.timestamp;
      const last = series.raw[series.raw.length - 1];
      if (last && last[0] === t) last[1] = metric.value;
      else if (last && t < last[0]) {
        // Out-of-order samples are rare; insert in order instead of silently
        // corrupting the series.
        const index = lowerBound(series.raw, t);
        series.raw.splice(index, 0, [t, metric.value]);
      } else {
        series.raw.push([t, metric.value]);
      }
      series.lastAt = Math.max(series.lastAt, t);
      series.unit = metric.unit || series.unit;
      recorded += 1;
      touched.add(key);
    }
    if (recorded) this.dirty = true;
    void now;
    return { recorded, rejected: metrics.length - recorded, series: touched.size };
  }

  /** Compaction produces bounded rollups and enforces retention. */
  compact(now = Date.now()) {
    const rollupAfter = now - this.retention.rollupAfterHours * 3600e3;
    const fiveAfter = now - this.retention.fiveMinuteAfterHours * 3600e3;
    const rawRetention = now - this.retention.rawHours * 3600e3;
    const aggregateRetention = now - this.retention.aggregateDays * 86400e3;
    let moved = 0;
    for (const [key, series] of this.series) {
      if (series.raw.length) {
        if (series.raw[0][0] < rollupAfter) {
          const moving = series.raw.filter(([t]) => t < rollupAfter);
          series.raw = series.raw.filter(([t]) => t >= rollupAfter);
          series.minute = bucketMerge(series.minute, bucketize(moving, 60e3, now));
          moved += moving.length;
        }
        if (series.raw.length > 20000) series.raw = series.raw.slice(-20000);
      }
      if (series.minute.length && series.minute[0][0] < fiveAfter) {
        const moving = series.minute.filter(([t]) => t < fiveAfter);
        series.minute = series.minute.filter(([t]) => t >= fiveAfter);
        series.five = bucketMerge(series.five, moving.map(([t, sum, count]) => [t, sum, count]));
        moved += moving.length;
      }
      if (series.raw.length) {
        const keep = series.raw.filter(([t]) => t >= rawRetention);
        if (keep.length !== series.raw.length) {
          moved += series.raw.length - keep.length;
          series.raw = keep;
        }
      }
      if (series.minute.length) {
        const keep = series.minute.filter(([t]) => t >= aggregateRetention);
        if (keep.length !== series.minute.length) {
          moved += series.minute.length - keep.length;
          series.minute = keep;
        }
      }
      if (series.five.length) {
        const keep = series.five.filter(([t]) => t >= aggregateRetention);
        if (keep.length !== series.five.length) {
          moved += series.five.length - keep.length;
          series.five = keep;
        }
      }
      const hasData = series.raw.length || series.minute.length || series.five.length;
      if (!hasData && series.lastAt && series.lastAt < aggregateRetention) this.series.delete(key);
    }
    this.lastCompact = now;
    if (moved) this.dirty = true;
    return { moved, series: this.series.size };
  }

  matches(series, filter = {}) {
    if (filter.name && series.name !== filter.name) return false;
    if (filter.names && filter.names.length && !filter.names.includes(series.name)) return false;
    if (filter.source && series.source !== filter.source) return false;
    if (filter.resource && series.resource !== filter.resource) return false;
    if (filter.labels && typeof filter.labels === 'object') {
      for (const [key, value] of Object.entries(filter.labels)) {
        if (value == null || value === '') continue;
        if (String(series.labels[key] || '') !== String(value)) return false;
      }
    }
    return true;
  }

  seriesList(filter = {}, limit = 4000) {
    const out = [];
    for (const series of this.series.values()) {
      if (this.matches(series, filter)) out.push(series);
      if (out.length >= limit) break;
    }
    return out;
  }

  /**
   * Query one or more metric names. Returns compact `[timestamp, value]` pairs
   * so the renderer never receives the internal rollup representation.
   */
  query(options = {}) {
    const now = Date.now();
    const to = Number(options.to) || now;
    const from = Number(options.from) || to - 3600e3;
    const requestedStep = Math.max(0, Number(options.step) || 0);
    const span = Math.max(1, to - from);
    const autoStep = requestedStep || Math.max(0, Math.ceil(span / 4000 / 1000) * 1000);
    const maxSeries = clamp(Number(options.limit) || 200, 1, 2000);
    const names = Array.isArray(options.names) ? options.names.filter(Boolean) : (options.name ? [options.name] : []);
    const filter = {
      names,
      source: options.source || '',
      resource: options.resource || '',
      labels: options.labels || {},
    };
    const aggregation = options.aggregation || 'avg';
    const fiveAfter = now - this.retention.fiveMinuteAfterHours * 3600e3;
    const output = [];
    let scanned = 0;
    let truncated = false;
    for (const series of this.series.values()) {
      if (!this.matches(series, filter)) continue;
      scanned += 1;
      if (output.length >= maxSeries) { truncated = true; break; }
      const points = [];
      for (const [t, sum, count] of series.five) {
        if (t + 300e3 < from || t > to) continue;
        points.push([t, count ? sum / count : 0]);
      }
      for (const [t, sum, count] of series.minute) {
        if (t < fiveAfter || t + 60e3 < from || t > to) continue;
        points.push([t, count ? sum / count : 0]);
      }
      for (const [t, v] of series.raw) {
        if (t < from || t > to) continue;
        points.push([t, v]);
      }
      if (!points.length) continue;
      points.sort((a, b) => a[0] - b[0]);
      const sampled = autoStep > 0 ? downsample(points, autoStep, aggregation) : points;
      output.push({
        name: series.name,
        source: series.source,
        resource: series.resource,
        unit: series.unit,
        method: series.method,
        labels: series.labels,
        points: sampled,
      });
    }
    return { ok: true, from, to, step: autoStep, aggregation, series: output, scanned, truncated, at: now };
  }

  /** Latest value for a metric, optionally filtered by labels. */
  latest(name, filter = {}) {
    let best = null;
    for (const series of this.series.values()) {
      if (series.name !== name) continue;
      if (!this.matches(series, { ...filter, name })) continue;
      const point = lastPoint(series);
      if (!point) continue;
      if (!best || point[0] > best.timestamp) {
        best = {
          value: point[1],
          timestamp: point[0],
          unit: series.unit,
          labels: series.labels,
          source: series.source,
          resource: series.resource,
        };
      }
    }
    return best;
  }

  /** All latest values grouped by resource for table-style widgets. */
  latestFor(name, filter = {}) {
    const rows = [];
    for (const series of this.series.values()) {
      if (series.name !== name) continue;
      if (!this.matches(series, { ...filter, name })) continue;
      const point = lastPoint(series);
      if (point) rows.push({
        value: point[1], timestamp: point[0], unit: series.unit,
        labels: series.labels, source: series.source, resource: series.resource,
      });
    }
    return rows.sort((a, b) => b.value - a.value);
  }

  catalog(filter = {}) {
    const map = new Map();
    for (const series of this.series.values()) {
      if (!this.matches(series, filter)) continue;
      let entry = map.get(series.name);
      if (!entry) {
        entry = {
          name: series.name,
          unit: series.unit,
          sources: new Set(),
          resources: new Set(),
          methods: new Set(),
          labels: new Set(),
          series: 0,
          points: 0,
          lastAt: 0,
        };
        map.set(series.name, entry);
      }
      entry.sources.add(series.source);
      entry.resources.add(series.resource);
      entry.methods.add(series.method);
      for (const key of Object.keys(series.labels)) entry.labels.add(key);
      entry.series += 1;
      entry.points += series.raw.length + series.minute.length + series.five.length;
      entry.lastAt = Math.max(entry.lastAt, series.lastAt);
    }
    return [...map.values()]
      .map((entry) => ({
        ...entry,
        sources: [...entry.sources].sort(),
        resources: [...entry.resources].sort(),
        methods: [...entry.methods].sort(),
        labels: [...entry.labels].sort(),
      }))
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  /** Label values for dashboard variables and explorer filters. */
  labelValues(name, label, limit = 500) {
    const values = new Set();
    for (const series of this.series.values()) {
      if (name && series.name !== name) continue;
      if (label) {
        if (series.labels[label]) values.add(series.labels[label]);
      } else {
        for (const value of Object.values(series.labels)) values.add(value);
      }
      if (values.size >= limit) break;
    }
    return [...values].sort((a, b) => a.localeCompare(b));
  }

  stats() {
    let points = 0;
    let raw = 0;
    let minute = 0;
    let five = 0;
    let minAt = Infinity;
    let maxAt = 0;
    for (const series of this.series.values()) {
      raw += series.raw.length;
      minute += series.minute.length;
      five += series.five.length;
      points += series.raw.length + series.minute.length + series.five.length;
      if (series.raw.length) {
        minAt = Math.min(minAt, series.raw[0][0]);
        maxAt = Math.max(maxAt, series.raw[series.raw.length - 1][0]);
      }
    }
    return {
      series: this.series.size,
      points,
      raw,
      minute,
      five,
      fileBytes: this.fileBytes,
      file: this.file,
      loaded: this.loaded,
      savedAt: this.savedAt || null,
      lastCompact: this.lastCompact || null,
      minTimestamp: Number.isFinite(minAt) ? minAt : null,
      maxTimestamp: maxAt || null,
      retention: { ...this.retention },
      rejected: this.rejected,
    };
  }

  persist(force = false) {
    if (!this.file || (!this.dirty && !force)) return false;
    const payload = {
      version: 1,
      savedAt: Date.now(),
      series: [...this.series.entries()].map(([key, series]) => ({
        key,
        name: series.name,
        source: series.source,
        resource: series.resource,
        unit: series.unit,
        method: series.method,
        labels: series.labels,
        raw: series.raw,
        minute: series.minute,
        five: series.five,
        lastAt: series.lastAt,
      })),
    };
    try {
      writePrivate(this.file, zlib.gzipSync(Buffer.from(JSON.stringify(payload)), { level: 6 }));
      this.fileBytes = fs.statSync(this.file).size;
      this.savedAt = payload.savedAt;
      this.dirty = false;
      return true;
    } catch (error) {
      console.error('Could not persist monitoring metrics:', error.message);
      return false;
    }
  }
}

function validPair(entry) {
  return Array.isArray(entry) && entry.length >= 2 && Number.isFinite(Number(entry[0])) && Number.isFinite(Number(entry[1]));
}

function validTriple(entry) {
  return Array.isArray(entry) && entry.length >= 3 && Number.isFinite(Number(entry[0])) && Number.isFinite(Number(entry[1]));
}

function lowerBound(points, timestamp) {
  let lo = 0;
  let hi = points.length;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (points[mid][0] < timestamp) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function lastPoint(series) {
  const tail = series.raw[series.raw.length - 1];
  if (tail) return [tail[0], tail[1]];
  const minute = series.minute[series.minute.length - 1];
  if (minute) return [minute[0], minute[2] ? minute[1] / minute[2] : 0];
  const five = series.five[series.five.length - 1];
  if (five) return [five[0], five[2] ? five[1] / five[2] : 0];
  return null;
}

function downsample(points, stepMs, method) {
  if (!points.length) return [];
  const buckets = new Map();
  for (const [t, v] of points) {
    const index = Math.floor(t / stepMs) * stepMs;
    if (!buckets.has(index)) buckets.set(index, []);
    buckets.get(index).push(v);
  }
  return [...buckets.entries()]
    .map(([t, values]) => [t, aggregate(values, method)])
    .filter(([, value]) => value != null)
    .sort((a, b) => a[0] - b[0]);
}

/** Bounded store for logs or events with full-text search and retention. */
class RecordStore {
  constructor({ file, maxRecords = 20000, retentionDays = 7, kind = 'record' } = {}) {
    this.file = file || '';
    this.maxRecords = maxRecords;
    this.retentionDays = retentionDays;
    this.kind = kind;
    this.items = [];
    this.dirty = false;
    this.savedAt = 0;
    this.fileBytes = 0;
    this.load();
  }

  configure({ maxRecords, retentionDays } = {}) {
    if (Number.isFinite(Number(maxRecords))) this.maxRecords = clamp(Number(maxRecords), 100, 200000);
    if (Number.isFinite(Number(retentionDays))) this.retentionDays = clamp(Number(retentionDays), 1, 365);
    this.prune();
  }

  load() {
    if (!this.file || !fs.existsSync(this.file)) return;
    try {
      const stat = fs.statSync(this.file);
      if (stat.size > MAX_FILE_BYTES) return;
      this.fileBytes = stat.size;
      const data = JSON.parse(zlib.gunzipSync(fs.readFileSync(this.file)).toString('utf8'));
      if (data && Array.isArray(data.items)) this.items = data.items.slice(0, this.maxRecords);
      this.savedAt = Number(data?.savedAt) || 0;
    } catch (error) {
      console.error(`Could not load monitoring ${this.kind}s:`, error.message);
    }
  }

  add(list) {
    const records = Array.isArray(list) ? list : [list];
    let added = 0;
    for (const record of records) {
      if (!record || typeof record !== 'object') continue;
      const item = {
        ...record,
        id: record.id || crypto.randomUUID(),
        timestamp: Number(record.timestamp) || Date.now(),
      };
      this.items.push(item);
      added += 1;
    }
    this.sortAndTrim();
    if (added) this.dirty = true;
    return added;
  }

  sortAndTrim() {
    this.items.sort((a, b) => b.timestamp - a.timestamp);
    const cutoff = Date.now() - this.retentionDays * 86400e3;
    this.items = this.items.filter((item) => item.timestamp >= cutoff).slice(0, this.maxRecords);
  }

  prune() {
    const before = this.items.length;
    this.sortAndTrim();
    if (this.items.length !== before) this.dirty = true;
  }

  query(options = {}) {
    const to = Number(options.to) || Date.now();
    const from = Number(options.from) || 0;
    const search = String(options.search || '').trim().toLowerCase();
    const levels = Array.isArray(options.levels) ? options.levels.map((l) => String(l).toUpperCase()) : [];
    const sources = Array.isArray(options.sources) ? options.sources : [];
    const limit = clamp(Number(options.limit) || 200, 1, 2000);
    const offset = Math.max(0, Number(options.offset) || 0);
    const rows = [];
    let total = 0;
    for (const item of this.items) {
      if (item.timestamp < from || item.timestamp > to) continue;
      if (levels.length && !levels.includes(String(item.level || '').toUpperCase())) continue;
      if (sources.length && !sources.includes(item.source)) continue;
      if (options.service && item.service !== options.service) continue;
      if (options.container && item.container !== options.container) continue;
      if (options.namespace && item.namespace !== options.namespace) continue;
      if (search && !String(item.text || item.message || '').toLowerCase().includes(search)) continue;
      total += 1;
      if (total <= offset) continue;
      if (rows.length < limit) rows.push(item);
    }
    return { ok: true, rows, total, offset, limit, from, to };
  }

  stats() {
    const byLevel = {};
    const bySource = {};
    for (const item of this.items) {
      const level = String(item.level || 'INFO').toUpperCase();
      byLevel[level] = (byLevel[level] || 0) + 1;
      bySource[item.source || 'unknown'] = (bySource[item.source || 'unknown'] || 0) + 1;
    }
    return {
      kind: this.kind,
      records: this.items.length,
      maxRecords: this.maxRecords,
      retentionDays: this.retentionDays,
      fileBytes: this.fileBytes,
      file: this.file,
      savedAt: this.savedAt || null,
      byLevel,
      bySource,
      oldest: this.items.length ? this.items[this.items.length - 1].timestamp : null,
      newest: this.items.length ? this.items[0].timestamp : null,
    };
  }

  clear() {
    this.items = [];
    this.dirty = true;
    this.persist(true);
  }

  persist(force = false) {
    if (!this.file || (!this.dirty && !force)) return false;
    try {
      writePrivate(this.file, zlib.gzipSync(Buffer.from(JSON.stringify({ savedAt: Date.now(), items: this.items })), { level: 6 }));
      this.fileBytes = fs.statSync(this.file).size;
      this.savedAt = Date.now();
      this.dirty = false;
      return true;
    } catch (error) {
      console.error(`Could not persist monitoring ${this.kind}s:`, error.message);
      return false;
    }
  }
}

module.exports = { MetricsStore, RecordStore, bucketize, downsample, bucketMerge };
