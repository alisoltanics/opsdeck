'use strict';

/**
 * Interface language. English strings stay in the source; Persian is applied by
 * translating rendered text, titles, placeholders and aria-labels against the
 * dictionary in js/i18n/fa-*.js (OD.i18nFa). Code, terminals and user data are
 * never touched. Missing entries fall back to English.
 */
(function () {
  const OD = (window.OD = window.OD || {});
  const SKIP = 'script,style,pre,code,textarea,kbd,samp,.xterm,[data-no-i18n],.help-page[lang]';
  const ATTRS = ['title', 'aria-label', 'placeholder', 'alt'];

  let lang = 'en';
  let observer = null;
  let exact = null;
  let templates = null;
  const cache = new Map();
  const originals = new WeakMap();
  const originalAttrs = new WeakMap();

  function norm(s) { return s.replace(/\s+/g, ' ').trim(); }

  function build() {
    const dict = OD.i18nFa || {};
    exact = new Map();
    templates = [];
    for (const [key, value] of Object.entries(dict)) {
      const k = norm(key);
      if (!/\{\d+\}/.test(k)) { exact.set(k, value); continue; }
      const parts = k.split(/\{(\d+)\}/);
      let source = '';
      const order = [];
      for (let i = 0; i < parts.length; i += 1) {
        if (i % 2) { source += '(.+?)'; order.push(Number(parts[i])); }
        else source += parts[i].replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      }
      templates.push({ regex: new RegExp(`^${source}$`), order, value });
    }
    templates.sort((a, b) => b.regex.source.length - a.regex.source.length);
  }

  function lookup(text) {
    if (exact.has(text)) return exact.get(text);
    for (const t of templates) {
      const m = t.regex.exec(text);
      if (!m) continue;
      return t.value.replace(/\{(\d+)\}/g, (_, n) => {
        const idx = t.order.indexOf(Number(n));
        return idx >= 0 ? m[idx + 1] : '';
      });
    }
    return null;
  }

  function translate(text) {
    const key = norm(text);
    if (!key || !/[A-Za-z]{2}/.test(key)) return null;
    if (cache.has(key)) return cache.get(key);
    let result = lookup(key);
    if (result == null) {
      // Numbers, units and separators around a known phrase: "3 pods", "Pods ·".
      const m = /^([\d\s.,%:·•—–\-/+()]*)(.*?)([\d\s.,%:·•—–\-/+()]*)$/.exec(key);
      if (m && m[2] && m[2] !== key) {
        const inner = lookup(m[2]);
        if (inner != null) result = `${m[1]}${inner}${m[3]}`;
      }
    }
    if (result == null && cache.size < 20000) cache.set(key, null);
    else if (result != null) cache.set(key, result);
    return result;
  }

  function skipped(el) {
    return !!(el && el.closest && el.closest(SKIP));
  }

  function textNode(node) {
    const parent = node.parentElement;
    if (!parent || skipped(parent)) return;
    const current = node.nodeValue;
    const known = originals.get(node);
    const source = known && known.translated === current ? known.source : current;
    const out = translate(source);
    if (out == null) return;
    const lead = /^\s*/.exec(source)[0];
    const trail = /\s*$/.exec(source)[0];
    const next = `${lead}${out}${trail}`;
    originals.set(node, { source, translated: next });
    if (current !== next) node.nodeValue = next;
  }

  function attrs(el) {
    if (skipped(el)) return;
    for (const name of ATTRS) {
      const value = el.getAttribute(name);
      if (!value) continue;
      const known = originalAttrs.get(el)?.[name];
      const source = known && known.translated === value ? known.source : value;
      const out = translate(source);
      if (out == null) continue;
      const store = originalAttrs.get(el) || {};
      store[name] = { source, translated: out };
      originalAttrs.set(el, store);
      if (value !== out) el.setAttribute(name, out);
    }
  }

  function filterNode(node) {
    if (node.nodeType === 1 && node.matches(SKIP)) return NodeFilter.FILTER_REJECT;
    return NodeFilter.FILTER_ACCEPT;
  }

  function walk(root) {
    if (!root) return;
    if (root.nodeType === 3) { textNode(root); return; }
    if (root.nodeType !== 1 || skipped(root)) return;
    attrs(root);
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT, { acceptNode: filterNode });
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === 3) textNode(node);
      else attrs(node);
      node = walker.nextNode();
    }
  }

  function revert(root) {
    const walker = document.createTreeWalker(root, NodeFilter.SHOW_ELEMENT | NodeFilter.SHOW_TEXT);
    let node = walker.nextNode();
    while (node) {
      if (node.nodeType === 3) {
        const known = originals.get(node);
        if (known && node.nodeValue === known.translated) node.nodeValue = known.source;
        originals.delete(node);
      } else {
        const store = originalAttrs.get(node);
        if (store) {
          for (const [name, v] of Object.entries(store)) if (node.getAttribute(name) === v.translated) node.setAttribute(name, v.source);
          originalAttrs.delete(node);
        }
      }
      node = walker.nextNode();
    }
  }

  function start() {
    if (observer) return;
    observer = new MutationObserver((mutations) => {
      observer.disconnect();
      try {
        for (const m of mutations) {
          if (m.type === 'childList') m.addedNodes.forEach(walk);
          else if (m.type === 'characterData') textNode(m.target);
          else if (m.type === 'attributes') attrs(m.target);
        }
      } finally { observe(); }
    });
    observe();
  }

  function observe() {
    observer.observe(document.documentElement, {
      childList: true, subtree: true, characterData: true,
      attributes: true, attributeFilter: ATTRS,
    });
  }

  function setLang(next) {
    const value = next === 'fa' ? 'fa' : 'en';
    if (value === lang && (value === 'en' || exact)) return;
    lang = value;
    const html = document.documentElement;
    html.lang = value;
    html.dir = value === 'fa' ? 'rtl' : 'ltr';
    if (value === 'fa') {
      if (!exact) build();
      document.title = translate(document.title) || document.title;
      walk(document.body);
      start();
    } else {
      if (observer) { observer.disconnect(); observer = null; }
      revert(document.body);
    }
  }

  // Strings built in JavaScript (toasts, confirm dialogs) pass through here too.
  function t(text, params) {
    let out = lang === 'fa' ? (translate(text) ?? text) : text;
    if (params) out = out.replace(/\{(\w+)\}/g, (_, k) => (k in params ? params[k] : `{${k}}`));
    return out;
  }

  OD.i18n = { setLang, t, get lang() { return lang; }, translate };
})();
