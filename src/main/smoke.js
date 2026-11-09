'use strict';

/**
 * Headless-ish Electron smoke test.
 *
 * Loads the real renderer against the real preload bridge, walks every route,
 * and exercises the command palette, theme and sidebar controls. Run it with:
 *
 *   npm run smoke
 *
 * It exits non-zero on the first render or interaction failure.
 */

const ROUTES = [
  ['overview', '#/overview'],
  ['containers', '#/containers'],
  ['images', '#/images'],
  ['compose', '#/compose'],
  ['volumes', '#/volumes'],
  ['networks', '#/networks'],
  ['builds', '#/builds'],
  ['registries', '#/registries'],
  ['monitoring', '#/monitoring'],
  ['events', '#/events'],
  ['terminal', '#/terminal'],
  ['settings', '#/settings'],
  ['academy', '#/academy'],
  ['courses', '#/academy/courses'],
  ['course', '#/academy/course/docker-fundamentals'],
  ['lesson', '#/academy/lesson/first-container'],
  ['paths', '#/academy/paths'],
  ['reference', '#/academy/reference'],
  ['reference detail', '#/academy/reference/run'],
  ['troubleshooting', '#/academy/troubleshooting'],
  ['guide', '#/academy/troubleshooting/socket-permission'],
  ['labs', '#/academy/labs'],
  ['lab', '#/academy/labs/lab-first-contact'],
  ['visuals', '#/academy/visuals'],
  ['visual detail', '#/academy/visuals/docker-architecture'],
  ['glossary', '#/academy/glossary'],
  ['search', '#/academy/search'],
];

const TIMEOUT_MS = 120000;

function rendererScript(routes) {
  return `(async () => {
    const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
    const failures = [];

    async function waitFor(check, timeout = 7000) {
      const started = Date.now();
      while (Date.now() - started < timeout) {
        try { if (check()) return true; } catch { /* keep polling */ }
        await sleep(40);
      }
      return false;
    }

    if (!(await waitFor(() => window.OD && window.OD.store && window.OD.store.state.booted, 25000))) {
      return { ok: false, failures: ['renderer never finished booting'], routes: 0 };
    }
    if (window.OD.store.state.bootError) failures.push('academy bootstrap: ' + window.OD.store.state.bootError);

    await waitFor(() => document.querySelector('#view .page') && !document.getElementById('view').innerText.includes('Loading workspace'), 8000);

    const errorMarkers = [
      'This view could not be rendered',
      'OpsDeck could not finish loading',
      'The view module did not load',
    ];

    for (const [name, hash] of ${JSON.stringify(routes)}) {
      location.hash = hash;
      const expectedRaw = hash.replace(/^#\\/?/, '');
      const settled = await waitFor(() => {
        const route = window.OD.store.state.route;
        if (!route || route.raw !== expectedRaw) return false;
        const view = document.getElementById('view');
        if (!view) return false;
        const text = view.innerText || '';
        return text.length > 40 && !text.includes('Loading workspace');
      }, 12000);
      await sleep(30);
      const view = document.getElementById('view');
      const text = view ? (view.innerText || '') : '';
      const stillSettled = window.OD.store.state.route?.raw === expectedRaw && text.length > 40 && !text.includes('Loading workspace');
      if (!settled || !stillSettled) failures.push(name + ': did not settle (' + text.slice(0, 120).replace(/\\s+/g, ' ') + ')');
      if (!view || !view.querySelector('.page')) failures.push(name + ': no .page rendered');
      if (text.trim().length < 40) failures.push(name + ': rendered an empty page (html ' + (view ? view.innerHTML.length : 0) + ' bytes)');
      for (const marker of errorMarkers) {
        if (text.includes(marker)) failures.push(name + ': ' + marker);
      }
      if (location.hash !== hash) failures.push(name + ': hash did not stay at ' + hash);
    }

    // Reference live help should resolve (or explain why it cannot).
    location.hash = '#/academy/reference/run';
    await waitFor(() => {
      const live = document.querySelector('#ref-live-help .ref-live-body');
      return live && !live.innerText.includes('Reading local CLI help');
    }, 8000);
    const live = document.querySelector('#ref-live-help .ref-live-body');
    if (!live || live.innerText.includes('Reading local CLI help')) failures.push('reference: live help never resolved');

    // Global search indexes content and responds to input.
    location.hash = '#/academy/search';
    await waitFor(() => !!document.querySelector('#academy-search-input'), 6000);
    const search = document.querySelector('#academy-search-input');
    if (search) {
      search.value = 'volume';
      search.dispatchEvent(new Event('input', { bubbles: true }));
      const found = await waitFor(() => (document.querySelectorAll('#search-results .search-result').length > 0), 5000);
      if (!found) failures.push('search: no results for volume');
    } else {
      failures.push('search: input missing');
    }

    // Command palette opens, filters and closes.
    window.OD.app.openPalette('volume');
    const paletteOpen = await waitFor(() => document.querySelectorAll('[data-palette-index]').length > 0, 4000);
    if (!paletteOpen) failures.push('palette: no items rendered');
    window.OD.app.closePalette();
    if (document.getElementById('palette-root').children.length) failures.push('palette: did not close');

    // Theme and sidebar toggles must round-trip.
    const root = document.documentElement;
    const app = document.getElementById('app');
    const themeBefore = root.dataset.theme;
    document.querySelector('[data-action="toggle-theme"]')?.click();
    const themeChanged = await waitFor(() => root.dataset.theme !== themeBefore, 2500);
    if (!themeChanged) failures.push('theme: toggle did nothing');
    document.querySelector('[data-action="toggle-theme"]')?.click();
    await waitFor(() => root.dataset.theme === themeBefore, 2500);

    const collapsedBefore = app.dataset.collapsed;
    document.querySelector('[data-action="toggle-sidebar"]')?.click();
    const collapsedChanged = await waitFor(() => app.dataset.collapsed !== collapsedBefore, 2500);
    if (!collapsedChanged) failures.push('sidebar: toggle did nothing');
    document.querySelector('[data-action="toggle-sidebar"]')?.click();
    await waitFor(() => app.dataset.collapsed === collapsedBefore, 2500);

    // Container shell: open a real session when Docker has a running container.
    location.hash = '#/containers';
    await waitFor(() => !!document.querySelector('#container-tbody'), 8000);
    const execButton = [...document.querySelectorAll('[data-caction="exec"]')].find((btn) => !btn.disabled);
    if (execButton) {
      execButton.click();
      const ready = await waitFor(() => {
        const field = document.querySelector('#exec-input');
        return field && !field.disabled;
      }, 20000);
      if (!ready) {
        failures.push('shell: session never became ready');
      } else {
        const field = document.querySelector('#exec-input');
        field.value = 'echo $((6*7))';
        document.querySelector('#exec-form').dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
        const answered = await waitFor(() => /(^|\\n)42(\\n|$)/.test(document.getElementById('exec-output')?.innerText || ''), 8000);
        if (!answered) failures.push('shell: command output missing');
        document.querySelector('.drawer [data-close]')?.click();
        await sleep(300);
      }
    }

    // No error toast survived the walk.
    const toastText = document.getElementById('toast-root')?.innerText || '';
    if (/failed|error|could not/i.test(toastText)) failures.push('toasts: ' + toastText.replace(/\\s+/g, ' ').slice(0, 240));

    return { ok: failures.length === 0, failures, routes: ${routes.length} };
  })()`;
}

async function runSmokeTest(win) {
  const consoleErrors = [];
  win.webContents.on('console-message', (_event, level, message) => {
    if (level >= 3 && /uncaught|render failed|mount failed/i.test(message)) {
      consoleErrors.push(message);
    }
  });
  win.webContents.on('render-process-gone', (_event, details) => {
    consoleErrors.push(`renderer process gone: ${details.reason}`);
  });

  const result = await win.webContents.executeJavaScript(rendererScript(ROUTES), true);
  if (consoleErrors.length) {
    result.ok = false;
    result.failures = [...(result.failures || []), ...consoleErrors.map((e) => `console: ${e}`)];
  }

  if (result.ok) {
    console.log(`Smoke test passed: ${result.routes} routes plus palette, search, theme and sidebar.`);
    return 0;
  }
  console.error('Smoke test failed:');
  for (const failure of result.failures || ['unknown failure']) console.error(`  ✗ ${failure}`);
  return 1;
}

function watchSmokeTest(win, onDone) {
  const timer = setTimeout(() => {
    console.error('Smoke test timed out.');
    onDone(1);
  }, TIMEOUT_MS);
  runSmokeTest(win)
    .then((code) => { clearTimeout(timer); onDone(code); })
    .catch((error) => {
      clearTimeout(timer);
      console.error('Smoke test crashed:', error);
      onDone(1);
    });
}

module.exports = { runSmokeTest, watchSmokeTest, ROUTES };
