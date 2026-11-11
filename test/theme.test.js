'use strict';

// Guard the design tokens against contrast regressions. The dark workspace was
// reported as "too black" with hard-to-read secondary text, so these assertions
// pin minimum WCAG contrast ratios between the text scale and the surfaces.

const fs = require('node:fs');
const path = require('node:path');
const test = require('node:test');
const assert = require('node:assert/strict');

const CSS = fs.readFileSync(path.join(__dirname, '..', 'src', 'renderer', 'styles', 'tokens.css'), 'utf8');

function tokens(selector) {
  const start = CSS.indexOf(selector);
  assert.notEqual(start, -1, `token block ${selector} exists`);
  const open = CSS.indexOf('{', start);
  const close = CSS.indexOf('}', open);
  const body = CSS.slice(open + 1, close);
  const out = {};
  for (const match of body.matchAll(/(--[a-z0-9-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)) out[match[1]] = match[2];
  return out;
}

function luminance(hex) {
  const [r, g, b] = [1, 3, 5]
    .map((index) => parseInt(hex.slice(index, index + 2), 16) / 255)
    .map((value) => (value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

function contrast(a, b) {
  const [hi, lo] = [luminance(a), luminance(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
}

test('dark theme keeps readable contrast and separated surfaces', () => {
  const dark = tokens(':root');
  for (const key of ['--bg', '--surface', '--text', '--text-secondary', '--muted', '--faint', '--border', '--border-strong']) {
    assert.match(dark[key] || '', /^#[0-9a-f]{6}$/i, `${key} is a hex color`);
  }

  const surface = dark['--surface'];
  assert.ok(contrast(dark['--bg'], surface) >= 1.1, 'surfaces are visibly lifted off the background');
  assert.ok(contrast(dark['--border'], surface) >= 1.3, 'card borders are visible against the surface');
  assert.ok(contrast(dark['--border-strong'], surface) >= 2, 'emphasis borders stand out');

  assert.ok(contrast(dark['--text'], surface) >= 12, 'primary text is high contrast');
  assert.ok(contrast(dark['--text-secondary'], surface) >= 8, 'secondary text stays readable');
  assert.ok(contrast(dark['--muted'], surface) >= 5.5, 'muted text stays readable');
  assert.ok(contrast(dark['--faint'], surface) >= 4.5, 'faint labels still meet WCAG AA for body text');
});

test('light theme keeps readable contrast', () => {
  const light = tokens("[data-theme='light']");
  const surface = light['--surface'];
  assert.ok(contrast(light['--text'], surface) >= 12, 'primary text is high contrast');
  assert.ok(contrast(light['--text-secondary'], surface) >= 7, 'secondary text stays readable');
  assert.ok(contrast(light['--muted'], surface) >= 5, 'muted text stays readable');
});
