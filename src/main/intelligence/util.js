'use strict';

/**
 * Shared helpers for the cross-module intelligence layer.
 *
 * Everything here is pure: bounded strings/numbers, small statistics used by
 * anomaly detection and forecasting, and safe id/hash helpers. No module owns
 * this code exclusively, which keeps Docker, Kubernetes, Databases and
 * Observability speaking the same units.
 */

const crypto = require('node:crypto');

function clamp(value, min, max) {
  const n = Number(value);
  if (!Number.isFinite(n)) return min;
  return Math.min(max, Math.max(min, n));
}

function num(value, fallback = null) {
  if (value === null || value === undefined || value === '') return fallback;
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function clean(value, max = 400) {
  return String(value == null ? '' : value)
    .replace(/[\u0000-\u001f\u007f]/g, ' ')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
}

function safeError(error, fallback = 'The operation failed.') {
  const message = error && error.message ? error.message : String(error || '');
  return clean(message, 400) || fallback;
}

function iso(value = Date.now()) {
  const date = value instanceof Date ? value : new Date(value);
  return Number.isFinite(date.getTime()) ? date.toISOString() : new Date().toISOString();
}

function isoMs(value) {
  const parsed = Date.parse(String(value || ''));
  return Number.isFinite(parsed) ? parsed : null;
}

/** Stable, readable resource id. Never derived from a secret. */
function resourceId(module, kind, key) {
  const safeKey = String(key == null ? '' : key)
    .replace(/[\u0000-\u001f]/g, '')
    .slice(0, 320);
  return `${clean(module, 40)}:${clean(kind, 60)}:${safeKey}`;
}

function fingerprint(text) {
  return crypto.createHash('sha256').update(String(text || '')).digest('hex').slice(0, 16);
}

function hash(value) {
  let h = 2166136261;
  const text = String(value == null ? '' : value);
  for (let i = 0; i < text.length; i += 1) {
    h ^= text.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(36);
}

// ------------------------------------------------------------------ statistics

function mean(values) {
  const list = (values || []).filter((v) => Number.isFinite(Number(v))).map(Number);
  if (!list.length) return null;
  return list.reduce((sum, value) => sum + value, 0) / list.length;
}

function median(values) {
  const list = (values || []).filter((v) => Number.isFinite(Number(v))).map(Number).sort((a, b) => a - b);
  if (!list.length) return null;
  const middle = Math.floor(list.length / 2);
  return list.length % 2 ? list[middle] : (list[middle - 1] + list[middle]) / 2;
}

function stdev(values) {
  const list = (values || []).filter((v) => Number.isFinite(Number(v))).map(Number);
  if (list.length < 2) return 0;
  const avg = mean(list);
  const variance = list.reduce((sum, value) => sum + (value - avg) ** 2, 0) / (list.length - 1);
  return Math.sqrt(variance);
}

function percentile(values, p) {
  const list = (values || []).filter((v) => Number.isFinite(Number(v))).map(Number).sort((a, b) => a - b);
  if (!list.length) return null;
  const rank = clamp(p, 0, 1) * (list.length - 1);
  const low = Math.floor(rank);
  const high = Math.ceil(rank);
  if (low === high) return list[low];
  return list[low] + (list[high] - list[low]) * (rank - low);
}

/**
 * Ordinary least squares over [timestamp, value] points. Returns the fitted
 * line plus R² so callers can show how much of the variance is explained.
 */
function linearFit(points) {
  const list = (points || [])
    .map((point) => [Number(Array.isArray(point) ? point[0] : point?.t), Number(Array.isArray(point) ? point[1] : point?.v)])
    .filter(([t, v]) => Number.isFinite(t) && Number.isFinite(v));
  if (list.length < 2) return { slope: 0, intercept: list[0]?.[1] ?? null, r2: 0, count: list.length };
  const t0 = list[0][0];
  const xs = list.map(([t]) => (t - t0) / 1000);
  const ys = list.map(([, v]) => v);
  const xMean = mean(xs);
  const yMean = mean(ys);
  let sxx = 0;
  let sxy = 0;
  let syy = 0;
  for (let i = 0; i < xs.length; i += 1) {
    sxx += (xs[i] - xMean) ** 2;
    sxy += (xs[i] - xMean) * (ys[i] - yMean);
    syy += (ys[i] - yMean) ** 2;
  }
  const slope = sxx === 0 ? 0 : sxy / sxx;
  const intercept = yMean - slope * xMean;
  const r2 = sxx === 0 || syy === 0 ? 0 : (sxy ** 2) / (sxx * syy);
  return { slope, intercept, r2: clamp(r2, 0, 1), count: list.length, t0 };
}

/**
 * Forecast a numeric series. Uses the fitted trend when it explains the data,
 * otherwise a flat median baseline. The confidence interval widens with the
 * residual spread and shrinks with more samples; it is a bounded estimate, not
 * a promise, and the caller must label it as a forecast.
 */
function forecast(points, options = {}) {
  const horizon = clamp(options.horizonMs || 24 * 3600e3, 60e3, 30 * 24 * 3600e3);
  const list = (points || [])
    .map((point) => ({ t: Number(Array.isArray(point) ? point[0] : point?.t), v: Number(Array.isArray(point) ? point[1] : point?.v) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
  if (list.length < 3) {
    return {
      ok: false,
      reason: 'At least three samples are needed before a forecast can be made.',
      samples: list.length,
    };
  }
  const fit = linearFit(list.map((point) => [point.t, point.v]));
  const residuals = list.map((point) => point.v - (fit.intercept + fit.slope * ((point.t - fit.t0) / 1000)));
  const residualStd = stdev(residuals);
  const useTrend = fit.r2 >= 0.25;
  const baseline = median(list.map((point) => point.v));
  const valueAt = (t) => (useTrend ? fit.intercept + fit.slope * ((t - fit.t0) / 1000) : baseline);
  const last = list[list.length - 1];
  const steps = Math.max(6, Math.min(60, Math.ceil(horizon / Math.max(60e3, (last.t - list[0].t) / Math.max(1, list.length - 1)) / 4)));
  const forecastPoints = [];
  for (let i = 1; i <= steps; i += 1) {
    const t = last.t + (horizon * i) / steps;
    const value = valueAt(t);
    const widen = residualStd * Math.sqrt(1 + i / steps) * 1.96;
    forecastPoints.push({
      t: Math.round(t),
      v: value,
      low: value - widen,
      high: value + widen,
    });
  }
  const perMs = fit.slope / 1000; // value per millisecond
  return {
    ok: true,
    method: useTrend ? 'linear-trend' : 'median-baseline',
    r2: Number(fit.r2.toFixed(4)),
    samples: list.length,
    window: { from: list[0].t, to: last.t },
    baseline,
    slopePerHour: Number((perMs * 3600e3).toFixed(4)),
    residualStd: Number(residualStd.toFixed(4)),
    horizonMs: horizon,
    points: forecastPoints,
    confidence: Number(clamp(0.35 + fit.r2 * 0.5 + Math.min(0.15, list.length / 200), 0, 0.95).toFixed(2)),
    confidenceNote: useTrend
      ? 'Trend explains the recent window; confidence depends on how long that pattern holds.'
      : 'No stable trend was found; the forecast is a flat baseline and should be read as a floor/typical value.',
  };
}

/** First timestamp at which a rising series crosses a threshold, or null. */
function timeToThreshold(points, threshold, options = {}) {
  const horizonMs = clamp(options.horizonMs || 30 * 24 * 3600e3, 60e3, 365 * 24 * 3600e3);
  const result = forecast(points, { horizonMs });
  if (!result.ok) return { ok: false, reason: result.reason };
  if (result.slopePerHour <= 0) return { ok: true, reachable: false, forecast: result };
  const target = Number(threshold);
  if (!Number.isFinite(target)) return { ok: false, reason: 'The threshold is not a number.' };
  const lastKnown = result.points.length ? result.points[0].v : result.baseline;
  if (lastKnown >= target) {
    return { ok: true, reachable: true, alreadyReached: true, at: Date.now(), forecast: result };
  }
  for (const point of result.points) {
    if (point.v >= target) return { ok: true, reachable: true, at: point.t, forecast: result };
  }
  return { ok: true, reachable: false, forecast: result };
}

/**
 * Robust z-score anomaly scan. Median/MAD is used so one huge spike does not
 * hide the rest of the series, and a minimum sample count avoids flagging
 * noise from a handful of points.
 */
function detectAnomalies(points, options = {}) {
  const sensitivity = clamp(options.sensitivity ?? 3, 1.5, 10);
  const minSamples = clamp(options.minSamples ?? 12, 4, 200);
  const maxResults = clamp(options.maxResults ?? 40, 1, 200);
  const list = (points || [])
    .map((point) => ({ t: Number(Array.isArray(point) ? point[0] : point?.t), v: Number(Array.isArray(point) ? point[1] : point?.v) }))
    .filter((point) => Number.isFinite(point.t) && Number.isFinite(point.v))
    .sort((a, b) => a.t - b.t);
  if (list.length < minSamples) return { ok: false, reason: `At least ${minSamples} samples are needed.`, samples: list.length };
  const values = list.map((point) => point.v);
  const med = median(values);
  const deviations = values.map((value) => Math.abs(value - med));
  const mad = median(deviations) || stdev(values) || 0;
  const scale = mad === 0 ? 0 : mad * 1.4826;
  if (!scale) return { ok: true, anomalies: [], baseline: med, scale: 0, samples: list.length };
  const scored = list.map((point) => ({ ...point, score: (point.v - med) / scale }))
    .filter((point) => Math.abs(point.score) >= sensitivity)
    .sort((a, b) => Math.abs(b.score) - Math.abs(a.score))
    .slice(0, maxResults);
  return {
    ok: true,
    baseline: med,
    scale,
    samples: list.length,
    sensitivity,
    anomalies: scored.map((point) => ({
      t: point.t,
      v: point.v,
      score: Number(point.score.toFixed(2)),
      direction: point.score > 0 ? 'above' : 'below',
    })),
  };
}

module.exports = {
  clamp,
  num,
  clean,
  safeError,
  iso,
  isoMs,
  resourceId,
  fingerprint,
  hash,
  mean,
  median,
  stdev,
  percentile,
  linearFit,
  forecast,
  timeToThreshold,
  detectAnomalies,
};
