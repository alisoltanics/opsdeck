'use strict';

(function () {
  const { esc, fmtBytes } = OD.utils;
  const { icon } = OD.icons;

  let overlayStack = [];
  let toastSeq = 0;

  function button(opts = {}) {
    const variant = opts.variant || 'secondary';
    const size = opts.size || 'md';
    const cls = ['btn', `btn-${variant}`, `btn-${size}`, opts.class].filter(Boolean).join(' ');
    const attrs = opts.attrs || '';
    const label = opts.label == null ? '' : `<span>${esc(opts.label)}</span>`;
    return `<button type="button" class="${cls}" ${attrs}${opts.title ? ` title="${esc(opts.title)}"` : ''}>${opts.icon ? icon(opts.icon, opts.iconSize || 15) : ''}${label}</button>`;
  }

  function iconButton(opts = {}) {
    const tone = opts.tone ? ` tone-${opts.tone}` : '';
    const cls = ['icon-btn', opts.class].filter(Boolean).join(' ');
    return `<button type="button" class="${cls}${tone}" ${opts.attrs || ''} title="${esc(opts.title || opts.label || '')}" aria-label="${esc(opts.label || opts.title || 'Action')}">${icon(opts.icon || 'more-horizontal', opts.size || 16)}</button>`;
  }

  function badge(text, tone = 'slate', opts = {}) {
    return `<span class="badge tone-${esc(tone)}${opts.solid ? ' solid' : ''}${opts.mono ? ' mono' : ''}">${opts.dot ? '<i class="badge-dot"></i>' : ''}${esc(text)}</span>`;
  }

  function stateBadge(state, extra = '') {
    const s = String(state || '').toLowerCase();
    const tone = /running/.test(s) ? 'green'
      : /healthy/.test(s) ? 'green'
        : /paused/.test(s) ? 'amber'
          : /restart/.test(s) ? 'orange'
            : /dead|error|unhealthy/.test(s) ? 'red'
              : /created/.test(s) ? 'cyan' : 'slate';
    const label = extra || s || 'unknown';
    return `<span class="state-badge tone-${tone}"><i class="state-dot"></i>${esc(label)}</span>`;
  }

  function progressBar(percent, tone = 'accent', opts = {}) {
    const value = Math.max(0, Math.min(100, Number(percent) || 0));
    return `<div class="progress ${opts.size || ''} tone-${esc(tone)}" role="progressbar" aria-valuenow="${Math.round(value)}" aria-valuemin="0" aria-valuemax="100">
      <div class="progress-fill" style="width:${value.toFixed(1)}%"></div>
    </div>`;
  }

  function meter(value, max, tone = 'accent', opts = {}) {
    const pct = max > 0 ? Math.max(0, Math.min(100, (Number(value) / Number(max)) * 100)) : 0;
    const label = opts.label || `${fmtBytes(value)} / ${fmtBytes(max)}`;
    return `<div class="meter-wrap">
      <div class="meter ${opts.size || ''} tone-${esc(tone)}"><div class="meter-fill" style="width:${pct.toFixed(1)}%"></div></div>
      ${opts.showLabel === false ? '' : `<div class="meter-label">${esc(label)}</div>`}
    </div>`;
  }

  function iconChip(name, tone = 'accent', size = 34) {
    return `<span class="icon-chip tone-${esc(tone)}" style="--chip-size:${size}px">${icon(name, Math.round(size * 0.52))}</span>`;
  }

  function statCard(opts = {}) {
    return `<article class="stat-card ${opts.class || ''}">
      <div class="stat-top">
        <div class="stat-label">${esc(opts.label || '')}</div>
        ${iconChip(opts.icon || 'activity', opts.tone || 'accent', opts.chipSize || 32)}
      </div>
      <div class="stat-value">${opts.valueHtml ?? esc(opts.value ?? '—')}</div>
      <div class="stat-foot">
        <span class="stat-sub">${opts.subHtml ?? esc(opts.sub || '')}</span>
        ${opts.trend ? `<span class="stat-trend tone-${esc(opts.trendTone || 'green')}">${icon(opts.trend === 'down' ? 'chevron-down' : 'chevron-up', 12)}${esc(opts.trendLabel || '')}</span>` : ''}
      </div>
      ${opts.spark ? `<div class="stat-spark">${opts.spark}</div>` : ''}
    </article>`;
  }

  function card(opts = {}) {
    return `<section class="card ${opts.class || ''}"${opts.id ? ` id="${esc(opts.id)}"` : ''}>
      ${(opts.title || opts.actions) ? `<header class="card-head">
        <div class="card-head-text">
          ${opts.title ? `<h2 class="card-title">${opts.icon ? icon(opts.icon, 15) : ''}${esc(opts.title)}</h2>` : ''}
          ${opts.sub ? `<p class="card-sub">${esc(opts.sub)}</p>` : ''}
        </div>
        ${opts.actions ? `<div class="card-actions">${opts.actions}</div>` : ''}
      </header>` : ''}
      <div class="card-body ${opts.bodyClass || ''}">${opts.body || ''}</div>
      ${opts.footer ? `<footer class="card-foot">${opts.footer}</footer>` : ''}
    </section>`;
  }

  function empty(opts = {}) {
    return `<div class="empty-state ${opts.compact ? 'compact' : ''}">
      <div class="empty-icon">${icon(opts.icon || 'sparkles', opts.compact ? 20 : 26)}</div>
      <h3>${esc(opts.title || 'Nothing here yet')}</h3>
      <p>${esc(opts.body || '')}</p>
      ${opts.action ? `<div class="empty-action">${opts.action}</div>` : ''}
    </div>`;
  }

  function loader(text = 'Loading…') {
    return `<div class="loader-row"><span class="spinner">${icon('loader', 16)}</span><span>${esc(text)}</span></div>`;
  }

  function skeleton(opts = {}) {
    const lines = opts.lines || 4;
    return `<div class="skeleton-stack">${Array.from({ length: lines }, (_, i) => `<div class="skeleton-line" style="width:${i === 0 ? 46 : 70 + ((i * 13) % 28)}%"></div>`).join('')}</div>`;
  }

  function skeletonTable(rows = 6, cols = 5) {
    return `<div class="skeleton-table">${Array.from({ length: rows }, () => `<div class="skeleton-row">${Array.from({ length: cols }, (_, i) => `<span class="skeleton-cell" style="width:${i === 0 ? 20 : 12 + ((i * 7) % 12)}%"></span>`).join('')}</div>`).join('')}</div>`;
  }

  function codeBlock(opts = {}) {
    const code = String(opts.code ?? '');
    const lang = opts.lang || opts.language || 'bash';
    return `<div class="code-block" data-lang="${esc(lang)}">
      <div class="code-head">
        <span class="code-lang">${esc(opts.title || lang)}</span>
        <button type="button" class="code-copy" title="Copy code" aria-label="Copy code">${icon('copy', 13)}<span>Copy</span></button>
      </div>
      <pre class="code-pre"><code>${esc(code)}</code></pre>
      ${opts.output ? `<div class="code-output"><div class="code-output-label">${icon('terminal', 12)} Output</div><pre>${esc(opts.output)}</pre></div>` : ''}
      ${opts.note ? `<div class="code-note">${icon('info', 13)}<span>${esc(opts.note)}</span></div>` : ''}
    </div>`;
  }

  function commandLine(command, opts = {}) {
    return `<div class="command-line">
      <span class="prompt" aria-hidden="true">$</span>
      <code>${esc(command)}</code>
      ${opts.run ? `<button type="button" class="cmd-run" data-run-command="${esc(command)}" title="Open in terminal">${icon('play', 12)}<span>Run</span></button>` : ''}
      <button type="button" class="cmd-copy" data-copy-text="${esc(command)}" title="Copy command" aria-label="Copy command">${icon('copy', 13)}</button>
    </div>`;
  }

  function kvRows(rows, opts = {}) {
    return `<dl class="kv ${opts.class || ''}">${rows.filter(Boolean).map(([key, value, mono]) => `
      <div class="kv-row"><dt>${esc(key)}</dt><dd class="${mono ? 'mono' : ''}">${value}</dd></div>`).join('')}</dl>`;
  }

  function tabs(items, active, name) {
    return `<div class="tabs" role="tablist" data-tabs="${esc(name || '')}">${items.map((item) => `
      <button type="button" role="tab" class="tab ${item.id === active ? 'active' : ''}" data-tab="${esc(item.id)}" aria-selected="${item.id === active}">
        ${item.icon ? icon(item.icon, 14) : ''}<span>${esc(item.label)}</span>${item.count !== undefined ? `<span class="tab-count">${esc(item.count)}</span>` : ''}
      </button>`).join('')}</div>`;
  }

  function sectionHead(opts = {}) {
    return `<div class="section-head">
      <div>
        <div class="section-eyebrow">${opts.eyebrow ? `${icon(opts.icon || 'sparkles', 12)}${esc(opts.eyebrow)}` : ''}</div>
        <h2 class="section-title">${esc(opts.title || '')}</h2>
        ${opts.sub ? `<p class="section-sub">${esc(opts.sub)}</p>` : ''}
      </div>
      ${opts.action ? `<div class="section-action">${opts.action}</div>` : ''}
    </div>`;
  }

  function errorBanner(title, message, actionHtml = '') {
    return `<div class="banner banner-error">
      <div class="banner-icon">${icon('alert-triangle', 16)}</div>
      <div class="banner-text"><strong>${esc(title)}</strong><span>${esc(message)}</span></div>
      ${actionHtml ? `<div class="banner-action">${actionHtml}</div>` : ''}
    </div>`;
  }

  function infoBanner(title, message, tone = 'info', actionHtml = '') {
    const ic = tone === 'warning' ? 'alert-triangle' : tone === 'success' ? 'circle-check' : tone === 'danger' ? 'shield' : 'info';
    return `<div class="banner banner-${esc(tone)}">
      <div class="banner-icon">${icon(ic, 16)}</div>
      <div class="banner-text"><strong>${esc(title)}</strong><span>${esc(message)}</span></div>
      ${actionHtml ? `<div class="banner-action">${actionHtml}</div>` : ''}
    </div>`;
  }

  // ---------------- Toasts ----------------
  function toast(message, tone = 'info', opts = {}) {
    const root = document.getElementById('toast-root');
    if (!root) return;
    const id = `toast-${++toastSeq}`;
    const ic = tone === 'success' ? 'circle-check' : tone === 'error' ? 'circle-x' : tone === 'warning' ? 'alert-triangle' : 'info';
    const el = document.createElement('div');
    el.className = `toast tone-${esc(tone)}`;
    el.id = id;
    el.innerHTML = `<span class="toast-icon">${icon(ic, 16)}</span>
      <div class="toast-body"><strong>${esc(opts.title || message)}</strong>${opts.title && opts.description ? `<span>${esc(opts.description)}</span>` : ''}</div>
      ${opts.action ? `<button type="button" class="toast-action">${esc(opts.action)}</button>` : ''}
      <button type="button" class="toast-close" aria-label="Dismiss">${icon('x', 13)}</button>`;
    root.appendChild(el);
    const remove = () => {
      el.classList.add('leaving');
      setTimeout(() => el.remove(), 180);
    };
    el.querySelector('.toast-close').addEventListener('click', remove);
    if (opts.onAction) {
      const action = el.querySelector('.toast-action');
      if (action) action.addEventListener('click', () => { opts.onAction(); remove(); });
    }
    setTimeout(remove, opts.duration || 3600);
  }

  // ---------------- Overlays ----------------
  function overlayRoot() { return document.getElementById('overlay-root'); }

  function syncBodyLock() {
    document.body.classList.toggle('has-overlay', overlayStack.length > 0);
  }

  function trapFocus(container, event) {
    if (event.key !== 'Tab') return;
    const nodes = [...container.querySelectorAll('button:not([disabled]), a[href], input:not([disabled]), select, textarea, [tabindex]:not([tabindex="-1"])')]
      .filter((n) => n.offsetParent !== null);
    if (!nodes.length) return;
    const first = nodes[0];
    const last = nodes[nodes.length - 1];
    if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
    else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
  }

  function openOverlay({ className, html, onMount, dismissible = true, width, kind = 'modal' }) {
    const wrap = document.createElement('div');
    wrap.className = `overlay ${className || ''}`;
    wrap.innerHTML = html;
    const panel = wrap.querySelector('.overlay-panel') || wrap;
    if (width) panel.style.setProperty('--overlay-w', width);
    overlayRoot().appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));

    let closed = false;
    const entry = {
      close(reason = 'close') {
        if (closed) return;
        closed = true;
        wrap.classList.remove('open');
        wrap.classList.add('closing');
        overlayStack = overlayStack.filter((e) => e !== entry);
        syncBodyLock();
        setTimeout(() => wrap.remove(), 170);
        if (onClose) onClose(reason);
      },
    };
    let onClose = null;
    entry.onClose = (fn) => { onClose = fn; };
    overlayStack.push(entry);
    syncBodyLock();

    wrap.addEventListener('mousedown', (event) => {
      if (event.target === wrap && dismissible) entry.close('backdrop');
    });
    wrap.addEventListener('keydown', (event) => trapFocus(panel, event));
    wrap.querySelectorAll('[data-close]').forEach((btn) => btn.addEventListener('click', () => entry.close('cancel')));

    if (onMount) onMount({ root: wrap, panel, close: entry.close, onClose: entry.onClose });
    setTimeout(() => {
      const target = wrap.querySelector('[autofocus]') || wrap.querySelector('input, textarea, select') || wrap.querySelector('.overlay-panel button');
      if (target) target.focus();
    }, 30);
    return entry;
  }

  function modal(opts = {}) {
    const actions = (opts.actions || []).map((a) => button({
      label: a.label,
      icon: a.icon,
      variant: a.variant || 'secondary',
      attrs: `data-action="${esc(a.id)}"`,
    })).join('');
    const html = `<div class="overlay-panel modal tone-${esc(opts.tone || 'accent')}" role="dialog" aria-modal="true" aria-label="${esc(opts.title || 'Dialog')}">
      <header class="overlay-head">
        <div>
          ${opts.eyebrow ? `<div class="eyebrow">${icon(opts.icon || 'sparkles', 12)}${esc(opts.eyebrow)}</div>` : ''}
          <h2>${esc(opts.title || '')}</h2>
          ${opts.subtitle ? `<p>${esc(opts.subtitle)}</p>` : ''}
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </header>
      <div class="overlay-body">${opts.body || ''}</div>
      ${(actions || opts.footer) ? `<footer class="overlay-foot">${actions}${opts.footer || ''}</footer>` : ''}
    </div>`;
    return openOverlay({
      className: `modal-overlay ${opts.className || ''}`,
      html,
      width: opts.width || '520px',
      dismissible: opts.dismissible !== false,
      onMount: ({ root, close, onClose }) => {
        (opts.actions || []).forEach((a) => {
          const btn = root.querySelector(`[data-action="${a.id}"]`);
          if (btn) btn.addEventListener('click', () => {
            a.onClick?.({ root, close });
            if (a.close !== false) close('action');
          });
        });
        opts.onMount?.({ root, close, onClose });
      },
    });
  }

  function confirm(opts = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
      modal({
        title: opts.title || 'Confirm action',
        subtitle: opts.subtitle,
        icon: opts.icon || 'alert-triangle',
        tone: opts.tone || 'red',
        width: opts.width || '460px',
        body: `<p class="confirm-message">${esc(opts.message || '')}</p>${opts.detail ? `<div class="confirm-detail mono">${esc(opts.detail)}</div>` : ''}`,
        actions: [
          { id: 'cancel', label: opts.cancelLabel || 'Cancel', variant: 'ghost', onClick: () => finish(false) },
          { id: 'confirm', label: opts.confirmLabel || 'Confirm', variant: opts.tone === 'red' ? 'danger' : 'primary', onClick: () => finish(true) },
        ],
        onMount: ({ onClose }) => onClose(() => finish(false)),
      });
    });
  }

  function prompt(opts = {}) {
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
      const field = opts.multiline
        ? `<textarea class="input" id="prompt-field" rows="${opts.rows || 4}" placeholder="${esc(opts.placeholder || '')}" autofocus>${esc(opts.value || '')}</textarea>`
        : `<input class="input" id="prompt-field" type="text" value="${esc(opts.value || '')}" placeholder="${esc(opts.placeholder || '')}" autofocus>`;
      modal({
        title: opts.title || 'Input',
        subtitle: opts.subtitle,
        icon: opts.icon || 'edit',
        tone: opts.tone || 'accent',
        width: opts.width || '480px',
        body: `<label class="field"><span>${esc(opts.label || 'Value')}</span>${field}${opts.hint ? `<small>${esc(opts.hint)}</small>` : ''}</label>`,
        footer: `<div class="row gap-2 right" style="width:100%">${button({ label: opts.cancelLabel || 'Cancel', variant: 'ghost', attrs: 'data-prompt-cancel' })}${button({ label: opts.confirmLabel || 'Save', variant: 'primary', icon: 'check', attrs: 'data-prompt-ok' })}</div>`,
        onMount: ({ root, close, onClose }) => {
          const input = root.querySelector('#prompt-field');
          const submit = () => {
            const value = input.value;
            finish(opts.multiline ? value : value.trim());
            close('submit');
          };
          root.querySelector('[data-prompt-ok]').addEventListener('click', submit);
          root.querySelector('[data-prompt-cancel]').addEventListener('click', () => { finish(null); close('cancel'); });
          input.addEventListener('keydown', (event) => {
            if (event.key === 'Enter' && !opts.multiline) { event.preventDefault(); submit(); }
          });
          onClose(() => finish(null));
        },
      });
    });
  }

  function drawer(opts = {}) {
    const html = `<div class="overlay-panel drawer" role="dialog" aria-modal="true" aria-label="${esc(opts.title || 'Details')}">
      <header class="overlay-head drawer-head">
        <div class="drawer-head-text">
          ${opts.eyebrow ? `<div class="eyebrow">${icon(opts.icon || 'box', 12)}${esc(opts.eyebrow)}</div>` : ''}
          <h2>${esc(opts.title || '')}</h2>
          ${opts.subtitle ? `<p class="mono">${esc(opts.subtitle)}</p>` : ''}
        </div>
        <button type="button" class="icon-btn" data-close aria-label="Close">${icon('x', 16)}</button>
      </header>
      ${opts.tabs ? `<div class="drawer-tabs">${opts.tabs}</div>` : ''}
      <div class="overlay-body drawer-body" id="drawer-body">${opts.body || ''}</div>
      ${opts.footer ? `<footer class="overlay-foot drawer-foot">${opts.footer}</footer>` : ''}
    </div>`;
    return openOverlay({
      className: 'drawer-overlay',
      html,
      width: opts.width || '620px',
      dismissible: opts.dismissible !== false,
      onMount: ({ root, close, onClose }) => {
        opts.onMount?.({ root, close, body: root.querySelector('#drawer-body'), onClose });
      },
    });
  }

  function isOverlayOpen() { return overlayStack.length > 0; }

  function closeTopOverlay() {
    const top = overlayStack[overlayStack.length - 1];
    if (top) { top.close('escape'); return true; }
    return false;
  }

  function noop() {}

  window.OD = window.OD || {};
  OD.ui = {
    button, iconButton, badge, stateBadge, progressBar, meter, iconChip, statCard, card,
    empty, loader, skeleton, skeletonTable, codeBlock, commandLine, kvRows, tabs,
    sectionHead, errorBanner, infoBanner, toast, modal, confirm, prompt, drawer,
    isOverlayOpen, closeTopOverlay, noop, esc,
  };
})();
