'use strict';

(function () {
  const ESC = { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' };
  const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (c) => ESC[c]);

  function fmtBytes(bytes, decimals = 1) {
    const n = Number(bytes);
    if (!n || n < 0 || !Number.isFinite(n)) return '0 B';
    const units = ['B', 'KB', 'MB', 'GB', 'TB', 'PB'];
    const i = Math.min(units.length - 1, Math.floor(Math.log(n) / Math.log(1024)));
    const value = n / 1024 ** i;
    return `${value >= 100 || i === 0 ? Math.round(value) : value.toFixed(decimals)} ${units[i]}`;
  }

  function fmtNumber(n) {
    if (n === null || n === undefined) return '—';
    const value = Number(n);
    if (!Number.isFinite(value)) return '—';
    if (Math.abs(value) >= 1e6) return `${(value / 1e6).toFixed(1)}M`;
    if (Math.abs(value) >= 1e4) return `${(value / 1e3).toFixed(1)}k`;
    return value.toLocaleString('en-US');
  }

  function fmtPercent(n, decimals = 0) {
    const value = Number(n);
    if (!Number.isFinite(value)) return '—';
    return `${value.toFixed(decimals)}%`;
  }

  function timeAgo(value) {
    if (!value) return '—';
    const ms = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(ms)) return '—';
    const diff = Date.now() - ms;
    if (diff < 0) return 'just now';
    const s = Math.floor(diff / 1000);
    if (s < 45) return 'just now';
    if (s < 90) return '1m ago';
    const m = Math.floor(s / 60);
    if (m < 60) return `${m}m ago`;
    const h = Math.floor(m / 60);
    if (h < 24) return `${h}h ago`;
    const d = Math.floor(h / 24);
    if (d < 7) return `${d}d ago`;
    return new Date(ms).toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  }

  function fmtDateTime(value) {
    if (!value) return '—';
    const ms = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(ms)) return String(value);
    return new Date(ms).toLocaleString('en-US', {
      month: 'short', day: 'numeric', year: 'numeric', hour: '2-digit', minute: '2-digit',
    });
  }

  function fmtClock(value = Date.now()) {
    const ms = typeof value === 'number' ? value : Date.parse(value);
    if (!Number.isFinite(ms)) return '—';
    return new Date(ms).toLocaleTimeString('en-US', { hour12: false });
  }

  function shortId(value, length = 12) {
    const s = String(value || '').replace(/^sha256:/, '');
    return s.slice(0, length);
  }

  function titleCase(value) {
    return String(value || '').replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
  }

  function debounce(fn, wait = 180) {
    let timer = null;
    const wrapped = (...args) => {
      clearTimeout(timer);
      timer = setTimeout(() => fn(...args), wait);
    };
    wrapped.cancel = () => clearTimeout(timer);
    return wrapped;
  }

  function clamp(n, min, max) { return Math.max(min, Math.min(max, n)); }

  function escapeRegExp(value) { return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&'); }

  function highlight(text, query) {
    const safe = esc(text);
    const q = String(query || '').trim();
    if (!q) return safe;
    const re = new RegExp(`(${escapeRegExp(esc(q))})`, 'ig');
    return safe.replace(re, '<mark class="hl">$1</mark>');
  }

  function truncate(text, max = 120) {
    const s = String(text ?? '');
    return s.length > max ? `${s.slice(0, max - 1)}…` : s;
  }

  function plural(count, singular, pluralForm) {
    return Number(count) === 1 ? singular : (pluralForm || `${singular}s`);
  }

  function groupBy(list, keyFn) {
    const out = new Map();
    for (const item of list || []) {
      const key = keyFn(item);
      if (!out.has(key)) out.set(key, []);
      out.get(key).push(item);
    }
    return out;
  }

  async function copyText(text, label = 'Copied to clipboard') {
    try {
      await window.opsdeck.app.copy(String(text ?? ''));
      if (window.OD && OD.ui) OD.ui.toast(label, 'success');
      return true;
    } catch {
      if (window.OD && OD.ui) OD.ui.toast('Could not copy to clipboard', 'error');
      return false;
    }
  }

  function safeJson(value, space = 2) {
    try { return JSON.stringify(value, null, space); } catch { return String(value); }
  }

  function parseMs(value) {
    if (!value) return 0;
    if (typeof value === 'number') return value;
    const n = Date.parse(value);
    return Number.isFinite(n) ? n : 0;
  }

  function normalizeCommand(value) {
    return String(value || '').replace(/\s+/g, ' ').trim();
  }

  function cssTone(tone) {
    return ['accent', 'green', 'orange', 'violet', 'cyan', 'amber', 'red', 'slate'].includes(tone) ? tone : 'accent';
  }

  function dayKey(date = new Date()) {
    const pad = (n) => String(n).padStart(2, '0');
    return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
  }

  window.OD = window.OD || {};
  OD.utils = {
    esc, attr: esc, fmtBytes, fmtNumber, fmtPercent, timeAgo, fmtDateTime, fmtClock,
    shortId, titleCase, debounce, clamp, highlight, truncate, plural, groupBy, copyText,
    safeJson, parseMs, normalizeCommand, cssTone, dayKey, escapeRegExp,
  };
})();
