'use strict';

/**
 * Minimal Prometheus text exposition parser and HTTP client.
 *
 * Supports the standard text format (`# TYPE`, labels, timestamps) without
 * pulling a dependency into the app. Used by remote node_exporter checks, the
 * Metrics Explorer and integration discovery.
 */

function parseLabels(text) {
  const labels = {};
  if (!text) return labels;
  const re = /([a-zA-Z_][a-zA-Z0-9_]*)="((?:\\.|[^"])*)"/g;
  let match;
  while ((match = re.exec(text))) {
    labels[match[1]] = match[2].replace(/\\"/g, '"').replace(/\\n/g, '\n').replace(/\\\\/g, '\\');
  }
  return labels;
}

function parseValue(text) {
  const value = String(text || '').trim();
  if (value === 'NaN') return NaN;
  if (value === '+Inf') return Infinity;
  if (value === '-Inf') return -Infinity;
  const n = Number(value);
  return Number.isFinite(n) || Number.isNaN(n) ? n : null;
}

function parseText(text, { limit = 20000 } = {}) {
  const samples = [];
  const types = {};
  const help = {};
  for (const rawLine of String(text || '').split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line) continue;
    if (line.startsWith('#')) {
      const typeMatch = /^#\s*TYPE\s+(\S+)\s+(\S+)/.exec(line);
      if (typeMatch) types[typeMatch[1]] = typeMatch[2];
      const helpMatch = /^#\s*HELP\s+(\S+)\s+(.*)$/.exec(line);
      if (helpMatch) help[helpMatch[1]] = helpMatch[2];
      continue;
    }
    if (samples.length >= limit) break;
    const match = /^([a-zA-Z_:][a-zA-Z0-9_:]*)(\{.*?\})?\s+(\S+)(?:\s+(\S+))?$/.exec(line);
    if (!match) continue;
    const value = parseValue(match[3]);
    if (value == null) continue;
    samples.push({
      name: match[1],
      labels: parseLabels(match[2] || ''),
      value,
      timestamp: match[4] ? Number(match[4]) * 1000 : null,
    });
  }
  return { samples, types, help };
}

function escapeLabel(value) {
  return String(value).replace(/\\/g, '\\\\').replace(/"/g, '\\"').replace(/\n/g, '\\n');
}

function formatSample(name, labels, value, timestamp) {
  const labelText = Object.entries(labels || {}).map(([key, val]) => `${key}="${escapeLabel(val)}"`).join(',');
  return `${name}${labelText ? `{${labelText}}` : ''} ${value}${timestamp ? ` ${Math.floor(timestamp / 1000)}` : ''}`;
}

async function fetchText(url, options = {}) {
  const timeout = Math.max(1000, Math.min(60000, Number(options.timeoutMs) || 12000));
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeout);
  const started = Date.now();
  try {
    const headers = { accept: 'text/plain, application/json;q=0.9', ...(options.headers || {}) };
    if (options.token) headers.authorization = `Bearer ${options.token}`;
    if (options.username) {
      headers.authorization = `Basic ${Buffer.from(`${options.username}:${options.password || ''}`).toString('base64')}`;
    }
    const response = await fetch(url, {
      method: options.method || 'GET',
      headers,
      body: options.body,
      signal: controller.signal,
      redirect: 'follow',
    });
    const text = await response.text();
    return {
      ok: response.ok,
      status: response.status,
      text: text.slice(0, options.maxBytes || 16 * 1024 * 1024),
      headers: Object.fromEntries(response.headers.entries()),
      durationMs: Date.now() - started,
      error: response.ok ? '' : `HTTP ${response.status}`,
    };
  } catch (error) {
    return {
      ok: false, status: 0, text: '', headers: {}, durationMs: Date.now() - started,
      error: error.name === 'AbortError' ? `Timed out after ${timeout} ms.` : error.message,
    };
  } finally {
    clearTimeout(timer);
  }
}

async function instantQuery(baseUrl, query, options = {}) {
  const url = new URL('/api/v1/query', baseUrl);
  url.searchParams.set('query', query);
  return fetchText(url.toString(), options);
}

async function rangeQuery(baseUrl, query, from, to, step, options = {}) {
  const url = new URL('/api/v1/query_range', baseUrl);
  url.searchParams.set('query', query);
  url.searchParams.set('start', String(Math.floor(from / 1000)));
  url.searchParams.set('end', String(Math.floor(to / 1000)));
  url.searchParams.set('step', String(Math.max(1, Math.floor(step / 1000))));
  return fetchText(url.toString(), options);
}

module.exports = { parseText, parseLabels, parseValue, formatSample, fetchText, instantQuery, rangeQuery };
