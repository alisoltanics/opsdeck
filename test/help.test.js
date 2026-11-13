'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const js = path.join(__dirname, '..', 'src', 'renderer', 'js');
const appSource = fs.readFileSync(path.join(js, 'app.js'), 'utf8');

function loadHelp() {
  const sandbox = { window: {} };
  sandbox.window.OD = {};
  vm.createContext(sandbox);
  for (const name of ['docker', 'kubernetes', 'databases', 'observability', 'intelligence']) {
    vm.runInContext(fs.readFileSync(path.join(js, 'help', `${name}.js`), 'utf8'), sandbox);
  }
  return sandbox.window.OD.help;
}

function loadHelpFa() {
  const sandbox = { window: {} };
  sandbox.window.OD = {};
  vm.createContext(sandbox);
  for (const name of fs.readdirSync(path.join(js, 'help-fa'))) {
    vm.runInContext(fs.readFileSync(path.join(js, 'help-fa', name), 'utf8'), sandbox);
  }
  return sandbox.window.OD.helpFa;
}

function shape(value) {
  if (Array.isArray(value)) return Array.from(value, shape);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map((k) => [k, shape(value[k])]));
  return typeof value;
}

function sidebarKeys() {
  const keys = new Set(['app/settings']);
  const items = appSource.matchAll(/\{ id: '([a-z]+)',(?: section: '([a-z]+)',)? label: '[^']+', icon: '[^']+', href: '#\/[^']+'/g);
  for (const [, id, section] of items) keys.add(section ? `${id}/${section}` : `docker/${id}`);
  return [...keys];
}

test('every sidebar item has a complete help article', () => {
  const help = loadHelp();
  const keys = sidebarKeys();
  assert.ok(keys.length > 60, `expected the full sidebar, found ${keys.length}`);
  for (const key of keys) {
    const entry = help[key];
    assert.ok(entry, `missing help for ${key}`);
    assert.ok(entry.title && entry.summary, `${key} needs a title and summary`);
    assert.ok(Array.isArray(entry.whenToUse) && entry.whenToUse.length, `${key} needs whenToUse`);
    assert.ok(Array.isArray(entry.howItWorks) && entry.howItWorks.length, `${key} needs howItWorks`);
  }
});

test('help has no entries for pages that do not exist', () => {
  const known = new Set(sidebarKeys());
  for (const key of Object.keys(loadHelp())) assert.ok(known.has(key), `orphan help entry ${key}`);
});

test('every help article has a Persian translation with the same shape', () => {
  const en = loadHelp();
  const fa = loadHelpFa();
  assert.deepEqual(Object.keys(fa).sort(), Object.keys(en).sort());
  for (const key of Object.keys(en)) {
    assert.deepEqual(shape(fa[key]), shape(en[key]), `${key} differs in structure from the English article`);
    assert.match(JSON.stringify(fa[key]), /[\u0600-\u06FF]/, `${key} contains no Persian text`);
  }
});

test('UI dictionary covers the app with matching placeholders', () => {
  const sandbox = { window: {} };
  sandbox.window.OD = {};
  vm.createContext(sandbox);
  for (const name of fs.readdirSync(path.join(js, 'i18n'))) vm.runInContext(fs.readFileSync(path.join(js, 'i18n', name), 'utf8'), sandbox);
  const dict = sandbox.window.OD.i18nFa;
  assert.ok(Object.keys(dict).length > 2500);
  for (const [key, value] of Object.entries(dict)) {
    assert.ok(value, `empty translation for ${key}`);
    const a = (key.match(/\{\d+\}/g) || []).sort().join();
    const b = (value.match(/\{\d+\}/g) || []).sort().join();
    assert.equal(b, a, `placeholders differ for ${key}`);
  }
});
