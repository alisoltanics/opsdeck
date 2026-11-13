'use strict';

/**
 * Shared log viewer for Docker containers and Kubernetes pods.
 *
 * Lines are rendered one by one with a line number and a hover copy button.
 * It can be paused (new lines keep arriving in the background and are counted),
 * searched with highlighting and next/previous, filtered to matching lines,
 * and always follows the newest line unless the reader scrolls up.
 */
(function () {
  const OD = (window.OD = window.OD || {});
  const { esc } = OD.utils;
  const { icon } = OD.icons;

  function markup(options = {}) {
    const tails = options.tails || [100, 300, 600, 1200];
    const live = options.static !== true;
    const ai = options.ai !== false && !!OD.ai;
    return `<div class="lv${live ? '' : ' lv-static'}" data-lv>
      <div class="lv-bar">
        ${live ? `<button type="button" class="btn btn-secondary btn-sm" data-lv-pause>${icon('pause', 13)}<span>Pause</span></button>` : ''}
        <label class="lv-search">${icon('search', 12)}<input type="search" data-lv-q placeholder="Search in these logs…" aria-label="Search logs" /><span class="lv-hits" data-lv-hits></span>
          <button type="button" class="icon-btn" data-lv-prev title="Previous match (Shift+Enter)" aria-label="Previous match">${icon('chevron-up', 13)}</button>
          <button type="button" class="icon-btn" data-lv-next title="Next match (Enter)" aria-label="Next match">${icon('chevron-down', 13)}</button></label>
        <label class="lv-check"><input type="checkbox" data-lv-filter /> <span>Only matches</span></label>
        <label class="lv-check"><input type="checkbox" data-lv-wrap checked /> <span>Wrap</span></label>
        ${live ? `<label class="field lv-tail"><select class="input" data-lv-tail aria-label="Lines to load">${tails.map((n) => `<option value="${n}" ${n === (options.tail || 300) ? 'selected' : ''}>${n} lines</option>`).join('')}</select></label>` : ''}
        <span class="lv-spacer"></span>
        <span class="faint text-xs" data-lv-meta></span>
        ${live ? `<button type="button" class="btn btn-ghost btn-sm" data-lv-reload>${icon('refresh', 13)}<span>Refresh</span></button>` : ''}
        ${ai ? `<button type="button" class="btn btn-ai btn-sm" data-lv-ask title="Ask AI about the selected text, or about everything shown">${icon('sparkles', 13)}<span>Ask AI</span></button>` : ''}
        <button type="button" class="btn btn-ghost btn-sm" data-lv-copy-all>${icon('copy', 13)}<span>Copy all</span></button>
        <button type="button" class="btn btn-secondary btn-sm" data-lv-full title="Fullscreen (F11)">${icon('maximize', 13)}<span>Fullscreen</span></button>
      </div>
      <div class="lv-wrap">
        <div class="lv-view" data-lv-view tabindex="0">${options.loader || ''}</div>
        <button type="button" class="log-latest" data-lv-latest>${icon('chevron-down', 12)}<span>Latest</span></button>
        <div class="lv-banner" data-lv-banner hidden></div>
      </div>
    </div>`;
  }

  function highlight(text, q) {
    const safe = esc(text);
    if (!q) return safe;
    const re = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'gi');
    let out = '';
    let last = 0;
    let m;
    while ((m = re.exec(text))) {
      out += esc(text.slice(last, m.index)) + `<mark class="lv-hit">${esc(m[0])}</mark>`;
      last = m.index + m[0].length;
      if (m[0].length === 0) re.lastIndex += 1;
    }
    return out + esc(text.slice(last));
  }

  function mount(root, options) {
    const host = root.querySelector('[data-lv]');
    const view = host.querySelector('[data-lv-view]');
    const pauseBtn = host.querySelector('[data-lv-pause]') || document.createElement('button');
    const qInput = host.querySelector('[data-lv-q]');
    const hitsEl = host.querySelector('[data-lv-hits]');
    const filterBox = host.querySelector('[data-lv-filter]');
    const wrapBox = host.querySelector('[data-lv-wrap]');
    const tailSel = host.querySelector('[data-lv-tail]') || { value: '300' };
    const metaEl = host.querySelector('[data-lv-meta]');
    const latest = host.querySelector('[data-lv-latest]');
    const banner = host.querySelector('[data-lv-banner]');

    let lines = [];          // what is shown
    let incoming = [];       // newest fetch while paused
    let paused = false;
    let stopped = false;
    let stick = true;
    let first = true;
    let current = -1;        // index in matches
    let matches = [];
    let timer = null;
    let busy = false;

    const atBottom = () => view.scrollHeight - view.scrollTop - view.clientHeight < 10;
    const jump = () => { view.scrollTop = view.scrollHeight; stick = true; latest.classList.remove('show'); };
    const syncLatest = () => { stick = atBottom(); latest.classList.toggle('show', !stick); };
    view.addEventListener('scroll', syncLatest, { passive: true });
    latest.addEventListener('click', jump);

    function render({ keepScroll = false } = {}) {
      const q = qInput.value.trim();
      const only = filterBox.checked && q;
      const lower = q.toLowerCase();
      const rows = [];
      matches = [];
      const CAP = 5000;
      lines.forEach((text, i) => {
        if (rows.length >= CAP) return;
        const hit = q && text.toLowerCase().includes(lower);
        if (only && !hit) return;
        if (hit) matches.push(rows.length);
        rows.push(`<div class="lv-row${hit ? ' has-hit' : ''}" data-i="${i}"><span class="lv-no">${i + 1}</span><span class="lv-text">${highlight(text, hit ? q : '')}</span><span class="lv-acts"><button type="button" class="lv-copy" data-lv-copy="${i}" title="Copy this line" aria-label="Copy line ${i + 1}">${icon('copy', 11)}</button>${options.ai !== false && OD.ai ? `<button type="button" class="lv-copy lv-ask" data-lv-ask-line="${i}" title="Ask AI about this line" aria-label="Ask AI about line ${i + 1}">${icon('sparkles', 11)}</button>` : ''}</span></div>`);
      });
      const top = view.scrollTop;
      view.classList.toggle('nowrap', !wrapBox.checked);
      view.innerHTML = rows.length ? rows.join('') : `<div class="lv-empty">${q ? 'No line contains that text.' : 'No log output yet.'}</div>`;
      if (current >= matches.length) current = matches.length - 1;
      hitsEl.textContent = q ? (matches.length ? `${Math.max(current, 0) + 1}/${matches.length}` : '0') : '';
      if (current >= 0 && q) markCurrent(false);
      if (keepScroll) view.scrollTop = top;
    }

    function markCurrent(scroll = true) {
      const rows = view.querySelectorAll('.lv-row');
      rows.forEach((r) => r.classList.remove('current'));
      const row = rows[matches[current]];
      if (!row) return;
      row.classList.add('current');
      hitsEl.textContent = `${current + 1}/${matches.length}`;
      if (scroll) { row.scrollIntoView({ block: 'center' }); stick = false; syncLatest(); }
    }

    function step(dir) {
      if (!matches.length) return;
      current = current < 0 ? (dir > 0 ? 0 : matches.length - 1) : (current + dir + matches.length) % matches.length;
      markCurrent(true);
    }

    function setPaused(value) {
      paused = value;
      pauseBtn.innerHTML = paused ? `${icon('play', 13)}<span>Resume</span>` : `${icon('pause', 13)}<span>Pause</span>`;
      pauseBtn.classList.toggle('btn-primary', paused);
      pauseBtn.classList.toggle('btn-secondary', !paused);
      banner.hidden = !paused;
      if (!paused) {
        if (incoming.length || incoming.changed) { lines = incoming; incoming = []; }
        banner.hidden = true;
        render();
        jump();
      } else banner.textContent = 'Paused. New lines keep arriving in the background.';
    }

    function bannerCount() {
      const extra = Math.max(0, incoming.length - lines.length);
      banner.textContent = extra ? `Paused · ${extra} new line${extra === 1 ? '' : 's'} waiting. Press Resume to see them.` : 'Paused. Nothing new yet.';
    }

    async function load({ force = false, loader = false } = {}) {
      if (stopped || busy) return;
      busy = true;
      if (first || loader) view.innerHTML = options.loader || '';
      let res;
      try { res = await options.fetch(Number(tailSel.value) || 300); } catch (error) { res = { ok: false, error: error.message }; }
      busy = false;
      if (stopped) return;
      if (!res || res.ok === false) {
        if (first || loader || force) view.innerHTML = `<div class="lv-empty lv-error">${esc(res?.error || 'Logs are unavailable.')}</div>`;
        first = false;
        return;
      }
      const text = String(res.text || '').replace(/\s+$/, '');
      const next = text ? text.split('\n') : [];
      metaEl.textContent = res.meta || '';
      if (paused) {
        incoming = next;
        bannerCount();
        return;
      }
      const same = next.length === lines.length && next[next.length - 1] === lines[lines.length - 1] && next[0] === lines[0];
      if (same && !first && !force && !loader) return;
      const pin = force || first || stick;
      lines = next;
      render({ keepScroll: !pin });
      if (pin) { jump(); requestAnimationFrame(jump); setTimeout(() => { if (!stopped && stick) jump(); }, 90); }
      else requestAnimationFrame(syncLatest);
      first = false;
    }

    pauseBtn.addEventListener('click', () => setPaused(!paused));
    host.querySelector('[data-lv-reload]')?.addEventListener('click', () => load({ force: true }));
    tailSel.addEventListener?.('change', () => load({ force: true, loader: true }));
    qInput.addEventListener('input', () => { current = -1; render({ keepScroll: true }); if (matches.length) { current = 0; markCurrent(true); } });
    qInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') { e.preventDefault(); step(e.shiftKey ? -1 : 1); } });
    host.querySelector('[data-lv-next]').addEventListener('click', () => step(1));
    host.querySelector('[data-lv-prev]').addEventListener('click', () => step(-1));
    filterBox.addEventListener('change', () => { current = -1; render(); if (filterBox.checked) view.scrollTop = 0; });
    wrapBox.addEventListener('change', () => view.classList.toggle('nowrap', !wrapBox.checked));
    host.querySelector('[data-lv-copy-all]').addEventListener('click', () => OD.utils.copyText((paused ? lines : lines).join('\n'), 'Logs copied'));
    function ask(focus) {
      if (!OD.ai) return;
      const all = lines.join('\n');
      OD.ai.openFor({
        kind: 'snippet',
        label: options.title || 'Output',
        language: options.language || 'text',
        snippet: all.slice(0, 24000),
        truncated: all.length > 24000,
        focus,
      });
    }
    view.addEventListener('click', (event) => {
      const btn = event.target.closest('[data-lv-copy]');
      if (btn) { OD.utils.copyText(lines[Number(btn.dataset.lvCopy)] ?? '', 'Line copied'); return; }
      const askLine = event.target.closest('[data-lv-ask-line]');
      if (askLine) {
        const i = Number(askLine.dataset.lvAskLine);
        const from = Math.max(0, i - 4);
        const around = lines.slice(from, i + 5).map((t, k) => `${from + k + 1}${from + k === i ? ' >>' : '   '} ${t}`).join('\n');
        ask(`Line ${i + 1}: ${lines[i]}\n\nSurrounding lines (>> marks the line in question):\n${around}`);
      }
    });
    host.querySelector('[data-lv-ask]')?.addEventListener('click', () => {
      const selected = String(window.getSelection?.()?.toString() || '').trim();
      const inside = selected && view.contains(window.getSelection().anchorNode);
      ask(inside ? `The user selected this text:\n${selected.slice(0, 4000)}` : '');
    });
    host.addEventListener('keydown', (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'f') { event.preventDefault(); qInput.focus(); qInput.select(); }
      if (event.key === ' ' && event.target === view) { event.preventDefault(); setPaused(!paused); }
    });

    const fullBtn = host.querySelector('[data-lv-full]');
    const paintFull = () => {
      const on = document.fullscreenElement === host || host.classList.contains('is-full');
      fullBtn.innerHTML = `${icon(on ? 'shrink' : 'maximize', 13)}<span>${on ? 'Exit fullscreen' : 'Fullscreen'}</span>`;
      if (stick) requestAnimationFrame(jump);
    };
    const toggleFull = () => {
      if (document.fullscreenElement === host) { document.exitFullscreen(); return; }
      if (host.classList.contains('is-full')) { host.classList.remove('is-full'); paintFull(); return; }
      if (host.requestFullscreen) host.requestFullscreen().catch(() => { host.classList.add('is-full'); paintFull(); });
      else { host.classList.add('is-full'); paintFull(); }
    };
    fullBtn.addEventListener('click', toggleFull);
    host.addEventListener('fullscreenchange', paintFull);
    host.addEventListener('keydown', (event) => {
      if (event.key === 'F11') { event.preventDefault(); toggleFull(); }
      if (event.key === 'Escape' && host.classList.contains('is-full')) { event.stopPropagation(); toggleFull(); }
    });

    if (options.static !== true) timer = setInterval(() => { if (!document.hidden) load(); }, options.interval || 5000);
    load();
    return {
      stop() { stopped = true; clearInterval(timer); },
      reload: (opts) => load(opts || { force: true }),
      setFetch(fn) { options.fetch = fn; },
      setAuto(on) { if (on && !timer) timer = setInterval(() => { if (!document.hidden) load(); }, options.interval || 5000); if (!on) { clearInterval(timer); timer = null; } },
    };
  }

  // Static text (manifests, command output, JSON): same search, copy-per-line,
  // fullscreen and Ask AI, without polling.
  function staticViewer(root, text, options = {}) {
    const holder = typeof root === 'string' ? document.querySelector(root) : root;
    if (!holder) return null;
    holder.innerHTML = markup({ ...options, static: true });
    return mount(holder, { ...options, static: true, fetch: async () => ({ ok: true, text: String(text ?? ''), meta: options.meta || '' }) });
  }

  // Any long <pre> block (query results, plans, JSON) gets Copy and Ask AI controls
  // without each view having to build them.
  const ENHANCE = '.db-json, .obs-pre, .k8s-summary-text';
  function enhancePre(scope) {
    (scope || document).querySelectorAll(ENHANCE).forEach((pre) => {
      if (pre.tagName !== 'PRE' || pre.dataset.enhanced || pre.closest('.lv')) return;
      pre.dataset.enhanced = '1';
      const wrap = document.createElement('div');
      wrap.className = 'pre-tools-wrap';
      pre.parentNode.insertBefore(wrap, pre);
      wrap.appendChild(pre);
      const bar = document.createElement('div');
      bar.className = 'pre-tools';
      bar.innerHTML = `<button type="button" class="pre-tool" data-pre-copy title="Copy">${icon('copy', 12)}<span>Copy</span></button>${OD.ai ? `<button type="button" class="pre-tool" data-pre-ask title="Ask AI about this">${icon('sparkles', 12)}<span>Ask AI</span></button>` : ''}`;
      wrap.insertBefore(bar, pre);
      bar.addEventListener('click', (event) => {
        const text = pre.textContent || '';
        if (event.target.closest('[data-pre-copy]')) OD.utils.copyText(text, 'Copied');
        else if (event.target.closest('[data-pre-ask]')) {
          OD.ai.openFor({ kind: 'snippet', label: document.title.replace(/^OpsDeck — /, '') || 'Output', language: 'text', snippet: text.slice(0, 24000), truncated: text.length > 24000, focus: '' });
        }
      });
    });
  }
  let enhanceTimer = null;
  new MutationObserver(() => {
    if (enhanceTimer) return;
    enhanceTimer = setTimeout(() => { enhanceTimer = null; enhancePre(); }, 120);
  }).observe(document.documentElement, { childList: true, subtree: true });

  OD.logViewer = { markup, mount, staticViewer, enhancePre };
})();
