'use strict';

(function () {
  let uid = 0;

  const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : 0);

  function bounds(data) {
    const values = (data || []).map(num);
    if (!values.length) return { min: 0, max: 1 };
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) { min = Math.max(0, min - 1); max += 1; }
    return { min, max };
  }

  function points(data, w, h, pad, min, max) {
    const n = data.length;
    const innerW = Math.max(1, w - pad.left - pad.right);
    const innerH = Math.max(1, h - pad.top - pad.bottom);
    const span = max - min || 1;
    return data.map((value, i) => ({
      x: pad.left + (n <= 1 ? innerW / 2 : (i / (n - 1)) * innerW),
      y: pad.top + innerH - ((num(value) - min) / span) * innerH,
      value: num(value),
    }));
  }

  function smoothPath(pts) {
    if (!pts.length) return '';
    if (pts.length === 1) return `M${pts[0].x},${pts[0].y} L${pts[0].x + 0.01},${pts[0].y}`;
    let d = `M${pts[0].x.toFixed(2)},${pts[0].y.toFixed(2)}`;
    for (let i = 1; i < pts.length; i += 1) {
      const prev = pts[i - 1];
      const cur = pts[i];
      const mid = (prev.x + cur.x) / 2;
      d += ` C${mid.toFixed(2)},${prev.y.toFixed(2)} ${mid.toFixed(2)},${cur.y.toFixed(2)} ${cur.x.toFixed(2)},${cur.y.toFixed(2)}`;
    }
    return d;
  }

  /**
   * Smooth area chart. Values are drawn from a zero/min baseline with an
   * optional gradient fill and dotted grid.
   */
  function area(data, opts = {}) {
    const values = (data || []).map(num);
    const w = opts.width || 640;
    const h = opts.height || 170;
    const pad = { top: 14, right: 10, bottom: 22, left: 34, ...(opts.pad || {}) };
    const color = opts.color || 'var(--accent)';
    const id = `grad-${++uid}`;
    const { min: dataMin, max: dataMax } = bounds(values);
    const min = opts.min !== undefined ? opts.min : Math.min(0, dataMin);
    const max = opts.max !== undefined ? opts.max : dataMax * 1.12 || 1;
    const pts = points(values, w, h, pad, min, max);
    const line = smoothPath(pts);
    const baseY = h - pad.bottom;
    const areaPath = pts.length
      ? `${line} L${pts[pts.length - 1].x.toFixed(2)},${baseY} L${pts[0].x.toFixed(2)},${baseY} Z`
      : '';

    const gridLines = [0, 0.25, 0.5, 0.75, 1].map((t) => {
      const y = pad.top + (h - pad.top - pad.bottom) * t;
      return `<line x1="${pad.left}" y1="${y.toFixed(1)}" x2="${w - pad.right}" y2="${y.toFixed(1)}" class="chart-grid"/>`;
    }).join('');

    const yLabels = [1, 0.5, 0].map((t) => {
      const y = pad.top + (h - pad.top - pad.bottom) * (1 - t);
      const value = min + (max - min) * t;
      return `<text x="${pad.left - 7}" y="${(y + 3).toFixed(1)}" text-anchor="end" class="chart-axis">${opts.format ? opts.format(value) : Math.round(value)}</text>`;
    }).join('');

    const labels = (opts.labels || []).map((label, i, arr) => {
      if (!arr.length) return '';
      const x = pad.left + (arr.length <= 1 ? 0 : (i / (arr.length - 1)) * (w - pad.left - pad.right));
      return `<text x="${x.toFixed(1)}" y="${h - 5}" text-anchor="${i === 0 ? 'start' : i === arr.length - 1 ? 'end' : 'middle'}" class="chart-axis">${label}</text>`;
    }).join('');

    const last = pts[pts.length - 1];
    const dot = last ? `<circle cx="${last.x.toFixed(1)}" cy="${last.y.toFixed(1)}" r="3" fill="${color}" stroke="var(--surface)" stroke-width="2"/>` : '';

    return `<svg class="chart chart-area" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" role="img" aria-label="${opts.label || 'Trend chart'}">
      <defs>
        <linearGradient id="${id}" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="${color}" stop-opacity=".30"/>
          <stop offset="100%" stop-color="${color}" stop-opacity="0"/>
        </linearGradient>
      </defs>
      ${gridLines}
      ${yLabels}
      ${areaPath ? `<path d="${areaPath}" fill="url(#${id})"/>` : ''}
      ${line ? `<path d="${line}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round"/>` : ''}
      ${dot}
      ${labels}
      ${values.length === 0 ? `<text x="${w / 2}" y="${h / 2}" text-anchor="middle" class="chart-empty">No samples yet</text>` : ''}
    </svg>`;
  }

  function spark(data, opts = {}) {
    const values = (data || []).map(num);
    const w = opts.width || 108;
    const h = opts.height || 30;
    const color = opts.color || 'var(--accent)';
    if (values.length < 2) {
      return `<svg class="chart chart-spark" viewBox="0 0 ${w} ${h}" aria-hidden="true"><line x1="2" y1="${h - 4}" x2="${w - 2}" y2="${h - 4}" stroke="${color}" stroke-opacity=".25" stroke-width="1.5"/></svg>`;
    }
    const { min, max } = bounds(values);
    const pts = points(values, w, h, { top: 4, right: 2, bottom: 4, left: 2 }, min, max);
    const line = smoothPath(pts);
    return `<svg class="chart chart-spark" viewBox="0 0 ${w} ${h}" preserveAspectRatio="none" aria-hidden="true">
      <path d="${line}" fill="none" stroke="${color}" stroke-width="1.8" stroke-linecap="round"/>
    </svg>`;
  }

  function donut(percent, opts = {}) {
    const value = Math.max(0, Math.min(100, num(percent)));
    const size = opts.size || 92;
    const stroke = opts.stroke || 9;
    const r = (size - stroke) / 2;
    const c = 2 * Math.PI * r;
    const offset = c - (value / 100) * c;
    const color = opts.color || 'var(--accent)';
    return `<div class="donut" style="--donut-size:${size}px">
      <svg viewBox="0 0 ${size} ${size}" role="img" aria-label="${opts.label || 'Progress'} ${Math.round(value)}%">
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="var(--border)" stroke-width="${stroke}"/>
        <circle cx="${size / 2}" cy="${size / 2}" r="${r}" fill="none" stroke="${color}" stroke-width="${stroke}"
          stroke-linecap="round" stroke-dasharray="${c.toFixed(2)}" stroke-dashoffset="${offset.toFixed(2)}"
          transform="rotate(-90 ${size / 2} ${size / 2})"/>
      </svg>
      <div class="donut-center">
        <strong>${opts.center ?? `${Math.round(value)}%`}</strong>
        ${opts.sub ? `<span>${opts.sub}</span>` : ''}
      </div>
    </div>`;
  }

  function heatmap(activity, opts = {}) {
    const weeks = opts.weeks || 26;
    const counts = new Map((activity || []).map((a) => [a.day, Number(a.count) || 0]));
    const today = new Date();
    today.setHours(12, 0, 0, 0);
    const end = new Date(today);
    // Align the last column to the current week (Sunday start).
    end.setDate(end.getDate() + (6 - end.getDay()));
    const start = new Date(end);
    start.setDate(start.getDate() - weeks * 7 + 1);
    const max = Math.max(1, ...[...counts.values()]);
    const cells = [];
    for (let i = 0; i < weeks * 7; i += 1) {
      const d = new Date(start);
      d.setDate(start.getDate() + i);
      const key = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
      const count = counts.get(key) || 0;
      const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / max) * 4));
      const future = d > today;
      cells.push(`<span class="heat-cell ${future ? 'future' : ''}" data-level="${level}" title="${d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' })}${count ? ` · ${count} events` : ''}"></span>`);
    }
    return `<div class="heatmap" role="img" aria-label="Study activity over the last ${weeks} weeks">
      <div class="heatmap-grid">${cells.join('')}</div>
      <div class="heatmap-legend"><span>Less</span><i data-level="0"></i><i data-level="1"></i><i data-level="2"></i><i data-level="3"></i><i data-level="4"></i><span>More</span></div>
    </div>`;
  }

  function gauge(percent, opts = {}) {
    const value = Math.max(0, Math.min(100, num(percent)));
    const color = opts.color || 'var(--accent)';
    return `<div class="gauge" style="--gauge-color:${color}"><div class="gauge-fill" style="width:${value}%"></div></div>`;
  }

  window.OD = window.OD || {};
  OD.charts = { area, spark, donut, heatmap, gauge };
})();
