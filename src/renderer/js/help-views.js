'use strict';

/**
 * Help pages: one per sidebar item, reached from the "?" button that appears
 * when hovering a sidebar entry. Content lives in js/help/*.js as plain data
 * (OD.help, keyed "<workspace>/<section>"); this module only presents it.
 */
(function () {
  const { esc, titleCase } = OD.utils;
  const { icon } = OD.icons;
  const U = OD.ui;

  const LABELS = {
    en: { whenToUse: 'When to use it', howItWorks: 'How it works', parts: 'Everything on this page', tables: 'Columns and values', tips: 'Tips and gotchas', back: 'Back', beside: 'Open beside the page', close: 'Close help', column: 'Column', meaning: 'What it means', example: 'Example', missing: 'No help for this page yet', missingBody: 'This page has no help article.' },
    fa: { whenToUse: 'چه زمانی استفاده کنیم', howItWorks: 'چطور کار می‌کند', parts: 'همه چیز در این صفحه', tables: 'ستون‌ها و مقدارها', tips: 'نکته‌ها و خطاهای رایج', back: 'بازگشت', beside: 'باز کردن کنار صفحه', close: 'بستن راهنما', column: 'ستون', meaning: 'یعنی چه', example: 'مثال', missing: 'برای این صفحه هنوز راهنمایی نیست', missingBody: 'این صفحه مقاله راهنما ندارد.' },
  };

  function language() {
    return OD.store?.state?.settings?.uiLanguage === 'fa' ? 'fa' : 'en';
  }

  // Persian falls back to English per article, so a missing translation never leaves a blank page.
  function articleFor(route) {
    const key = keyOf(route);
    const fa = language() === 'fa' ? OD.helpFa?.[key] : null;
    return fa ? { entry: fa, lang: 'fa' } : { entry: OD.help?.[key], lang: 'en' };
  }

  function keyOf(route) {
    return `${route.parts[0] || ''}/${route.parts[1] || ''}`;
  }

  function list(items, className = 'help-list') {
    return items?.length ? `<ul class="${className}">${items.map((i) => `<li>${esc(i)}</li>`).join('')}</ul>` : '';
  }

  function part(p) {
    return `<div class="help-part">
      <h3>${esc(p.name)}</h3>
      <p>${esc(p.description)}</p>
      ${p.items?.length ? `<ul class="help-items">${p.items.map((i) => `<li><strong>${esc(i.name)}</strong> — ${esc(i.description)}</li>`).join('')}</ul>` : ''}
    </div>`;
  }

  function table(t, L) {
    return `<div class="help-part">
      <h3>${esc(t.name)}</h3>
      ${t.description ? `<p>${esc(t.description)}</p>` : ''}
      <div class="table-wrap"><table class="data-table">
        <thead><tr><th>${esc(L.column)}</th><th>${esc(L.meaning)}</th><th>${esc(L.example)}</th></tr></thead>
        <tbody>${(t.columns || []).map((c) => `<tr><td><strong>${esc(c.name)}</strong></td><td style="text-align:left;white-space:normal">${esc(c.meaning)}</td><td class="help-example" style="text-align:left;white-space:normal">${esc(c.example || '')}</td></tr>`).join('')}</tbody>
      </table></div>
    </div>`;
  }

  function pageKeyFor(route) {
    if (route.name === 'settings') return 'app/settings';
    if (route.name === 'kubernetes' || route.name === 'databases' || route.name === 'observability' || route.name === 'intelligence') return `${route.name}/${route.parts[0] || (route.name === 'databases' ? 'dashboard' : 'overview')}`;
    return `docker/${route.name === 'academy' ? 'academy' : route.name}`;
  }

  function dockHtml(key) {
    const route = { parts: key.split('/') };
    const { entry, lang } = articleFor(route);
    const L = LABELS[lang];
    const body = entry ? article(entry, L) : `<p>${esc(L.missingBody)}</p>`;
    return `<div class="help-dock-head"><span>${icon('help-circle', 14)} ${esc(entry?.title || L.missing)}</span>
      <button type="button" class="icon-btn" data-help-dock-close aria-label="${esc(L.close)}" title="${esc(L.close)}">${icon('x', 14)}</button></div>
      <div class="help-dock-body"><div class="help-page" lang="${lang}" dir="${lang === 'fa' ? 'rtl' : 'ltr'}">${entry ? `<h2 class="help-dock-title">${esc(entry.title)}</h2><p class="help-dock-sub">${esc(entry.summary)}</p>` : ''}${body}</div></div>`;
  }

  // Docked beside the page it describes; follows the user while they navigate.
  let dockKey = null;
  function syncDock(route) {
    const dock = document.getElementById('help-dock');
    if (!dock) return;
    if (!dockKey) { dock.hidden = true; dock.innerHTML = ''; return; }
    if (route.name === 'help') return;
    const key = pageKeyFor(route);
    if (dock.dataset.key === key && !dock.hidden) return;
    dock.dataset.key = key;
    dock.innerHTML = dockHtml(key);
    dock.hidden = false;
    dock.querySelector('[data-help-dock-close]')?.addEventListener('click', () => { dockKey = null; syncDock(OD.store.state.route); });
  }

  function openBeside(key) {
    const parts = key.split('/');
    const target = parts[0] === 'app' ? '#/settings' : parts[0] === 'docker' ? `#/${parts[1]}` : `#/${parts[0]}/${parts[1]}`;
    dockKey = key;
    const dock = document.getElementById('help-dock');
    if (dock) dock.dataset.key = '';
    if (location.hash === target) syncDock(OD.store.state.route); else location.hash = target;
  }

  function article(entry, L) {
    return `${entry.whenToUse?.length ? U.card({ title: L.whenToUse, icon: 'compass', body: list(entry.whenToUse) }) : ''}
      ${entry.howItWorks?.length ? U.card({ title: L.howItWorks, icon: 'info', body: entry.howItWorks.map((t) => `<p>${esc(t)}</p>`).join('') }) : ''}
      ${entry.parts?.length ? U.card({ title: L.parts, icon: 'layout-dashboard', body: entry.parts.map(part).join('') }) : ''}
      ${entry.tables?.length ? U.card({ title: L.tables, icon: 'list', body: entry.tables.map((t) => table(t, L)).join('') }) : ''}
      ${entry.example ? U.card({ title: entry.example.title, icon: 'play', body: `<ol class="help-steps">${entry.example.steps.map((s) => `<li>${esc(s)}</li>`).join('')}</ol>` }) : ''}
      ${entry.tips?.length ? U.card({ title: L.tips, icon: 'sparkles', body: list(entry.tips) }) : ''}`;
  }

  function render(route) {
    const { entry, lang } = articleFor(route);
    const L = LABELS[lang];
    if (!entry) {
      return `<div class="page help-page">${U.empty({ icon: 'help-circle', title: L.missing, body: L.missingBody, action: '<a class="btn btn-primary btn-sm" href="#/overview">Open overview</a>' })}</div>`;
    }
    return `<div class="page help-page" lang="${lang}" dir="${lang === 'fa' ? 'rtl' : 'ltr'}">
      <div class="page-head"><div class="page-head-left">
        <h1 class="page-title">${esc(entry.title)}</h1>
        <p class="page-sub">${esc(entry.summary)}</p>
      </div>
      <div class="page-actions"><button type="button" class="btn btn-primary btn-md" data-help-beside="${esc(keyOf(route))}">${icon('panel-left', 14)}<span>${esc(L.beside)}</span></button><button type="button" class="btn btn-secondary btn-md" data-help-back>${icon('arrow-left', 14)}<span>${esc(L.back)}</span></button></div></div>
      ${article(entry, L)}
    </div>`;
  }

  function mount(host) {
    host.querySelector('[data-help-beside]')?.addEventListener('click', (e) => openBeside(e.currentTarget.dataset.helpBeside));
    host.querySelector('[data-help-back]')?.addEventListener('click', () => {
      if (history.length > 1) history.back(); else location.hash = '#/overview';
    });
  }

  function dispose() {}

  OD.views = OD.views || {};
  OD.views.help = {
    render,
    mount,
    dispose,
    syncDock,
    label(route) {
      return articleFor(route).entry?.title || titleCase(route.parts[1] || 'help');
    },
  };
})();
