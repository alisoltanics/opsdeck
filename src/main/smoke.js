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
 *
 * AI is exercised against a mock OpenAI-compatible server on 127.0.0.1. The
 * real AI config is never touched: a dedicated ai-smoke.json path is written
 * before the IPC service starts and removed when the app quits.
 */

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');

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
  ['kubernetes overview', '#/kubernetes/overview'],
  ['kubernetes topology', '#/kubernetes/topology'],
  ['kubernetes contexts', '#/kubernetes/contexts'],
  ['kubernetes namespaces', '#/kubernetes/namespaces'],
  ['kubernetes nodes', '#/kubernetes/nodes'],
  ['kubernetes pods', '#/kubernetes/pods'],
  ['kubernetes deployments', '#/kubernetes/deployments'],
  ['kubernetes statefulsets', '#/kubernetes/statefulsets'],
  ['kubernetes daemonsets', '#/kubernetes/daemonsets'],
  ['kubernetes jobs', '#/kubernetes/jobs'],
  ['kubernetes cronjobs', '#/kubernetes/cronjobs'],
  ['kubernetes services', '#/kubernetes/services'],
  ['kubernetes ingresses', '#/kubernetes/ingresses'],
  ['kubernetes network policies', '#/kubernetes/networkpolicies'],
  ['kubernetes persistent volumes', '#/kubernetes/persistentvolumes'],
  ['kubernetes volume claims', '#/kubernetes/persistentvolumeclaims'],
  ['kubernetes storage classes', '#/kubernetes/storageclasses'],
  ['kubernetes configmaps', '#/kubernetes/configmaps'],
  ['kubernetes secrets', '#/kubernetes/secrets'],
  ['kubernetes resource quotas', '#/kubernetes/resourcequotas'],
  ['kubernetes limit ranges', '#/kubernetes/limitranges'],
  ['kubernetes service accounts', '#/kubernetes/serviceaccounts'],
  ['kubernetes roles', '#/kubernetes/roles'],
  ['kubernetes role bindings', '#/kubernetes/rolebindings'],
  ['kubernetes cluster roles', '#/kubernetes/clusterroles'],
  ['kubernetes cluster bindings', '#/kubernetes/clusterrolebindings'],
  ['kubernetes helm', '#/kubernetes/helm'],
  ['kubernetes events', '#/kubernetes/events'],
  ['kubernetes console', '#/kubernetes/console'],
  ['kubernetes tools', '#/kubernetes/tools'],
  ['databases dashboard', '#/databases/dashboard'],
  ['databases connections', '#/databases/connections'],
  ['databases explorer', '#/databases/explorer'],
  ['databases editor', '#/databases/editor'],
  ['databases history', '#/databases/history'],
  ['databases local', '#/databases/local'],
  ['databases docker', '#/databases/docker'],
  ['databases kubernetes', '#/databases/kubernetes'],
  ['databases performance', '#/databases/performance'],
  ['databases diagnostics', '#/databases/diagnostics'],
  ['databases activity', '#/databases/activity'],
  ['observability overview', '#/observability/overview'],
  ['observability infrastructure', '#/observability/infrastructure'],
  ['observability docker', '#/observability/docker'],
  ['observability kubernetes', '#/observability/kubernetes'],
  ['observability databases', '#/observability/databases'],
  ['observability applications', '#/observability/applications'],
  ['observability synthetic', '#/observability/synthetic'],
  ['observability network', '#/observability/network'],
  ['observability logs', '#/observability/logs'],
  ['observability traces', '#/observability/traces'],
  ['observability alerts', '#/observability/alerts'],
  ['observability incidents', '#/observability/incidents'],
  ['observability dashboards', '#/observability/dashboards'],
  ['observability metrics', '#/observability/metrics'],
  ['observability reports', '#/observability/reports'],
  ['observability integrations', '#/observability/integrations'],
  ['observability notifications', '#/observability/notifications'],
  ['observability agents', '#/observability/agents'],
  ['observability remediation', '#/observability/remediation'],
  ['observability settings', '#/observability/settings'],
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
    window.addEventListener('error', (event) => failures.push('renderer error: ' + (event.message || 'unknown') + ' @ ' + (event.filename || '') + ':' + (event.lineno || 0)));
    window.addEventListener('unhandledrejection', (event) => failures.push('unhandled rejection: ' + (event.reason?.message || event.reason || 'unknown')));

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

    // Docker-dependent UI only exists when an engine is reachable. A clean
    // machine must still pass the shell, routing and observability checks.
    const dockerStatus = await window.opsdeck.docker.status();
    const dockerUp = dockerStatus?.available === true;
    const dockerImages = dockerUp ? await window.opsdeck.docker.images() : null;
    const hasImages = Boolean(dockerImages?.ok) && (dockerImages?.items || []).length > 0;

    await waitFor(() => document.querySelector('#view .page') && !document.querySelector('#view [aria-busy="true"]'), 8000);

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
        return text.length > 40 && !document.querySelector('#view [aria-busy="true"]');
      }, 12000);
      await sleep(30);
      const view = document.getElementById('view');
      const text = view ? (view.innerText || '') : '';
      const stillSettled = window.OD.store.state.route?.raw === expectedRaw && text.length > 40 && !document.querySelector('#view [aria-busy="true"]');
      if (!settled || !stillSettled) failures.push(name + ': did not settle (' + text.slice(0, 120).replace(/\\s+/g, ' ') + ')');
      if (!view || !view.querySelector('.page')) failures.push(name + ': no .page rendered');
      if (text.trim().length < 40) failures.push(name + ': rendered an empty page (html ' + (view ? view.innerHTML.length : 0) + ' bytes)');
      for (const marker of errorMarkers) {
        if (text.includes(marker)) failures.push(name + ': ' + marker);
      }
      if (location.hash !== hash) failures.push(name + ': hash did not stay at ' + hash);
    }

    // Database workspace bridge: real service bootstrap, no credentials in IPC.
    const dbBridge = window.opsdeck.databases;
    if (!dbBridge) failures.push('databases: bridge is missing');
    else {
      const boot = await dbBridge.bootstrap();
      if (!boot?.ok) failures.push('databases: bootstrap failed :: ' + (boot?.error || 'no result'));
      else {
        if (!Array.isArray(boot.engines) || boot.engines.length < 6) failures.push('databases: engine registry is missing engines');
        if (boot.engines.some((engine) => engine.planned && engine.supported)) failures.push('databases: a planned engine is advertised as supported');
        if (!boot.limits?.maxRows) failures.push('databases: row limit is missing');
        if (!['os-keyring', 'aes-256-gcm'].includes(boot.vault?.backend)) failures.push('databases: vault backend is unknown');
        if ((boot.connections || []).some((connection) => connection.secrets || 'password' in connection)) failures.push('databases: connection payload exposed credentials');
      }
      const discovery = await dbBridge.discovery(false);
      if (!discovery?.ok) failures.push('databases: discovery failed :: ' + (discovery?.error || 'no result'));
      else if (!discovery.docker || !discovery.local || !discovery.kubernetes) failures.push('databases: discovery is missing a source section');
      const dbHistory = await dbBridge.history({ limit: 5 });
      if (!dbHistory?.ok || !Array.isArray(dbHistory.items)) failures.push('databases: history bridge failed');
      const dbActivity = await dbBridge.activity({ limit: 5 });
      if (!dbActivity?.ok || !Array.isArray(dbActivity.items)) failures.push('databases: activity bridge failed');
    }

    // Observability bridge: real bootstrap, live overview and read-only queries.
    const obsBridge = window.opsdeck.observability;
    if (!obsBridge) failures.push('observability: bridge is missing');
    else {
      const boot = await obsBridge.bootstrap();
      if (!boot?.ok) failures.push('observability: bootstrap failed :: ' + (boot?.error || 'no result'));
      else {
        if (!Array.isArray(boot.collectors) || !boot.collectors.length) failures.push('observability: collectors are missing');
        if (!Array.isArray(boot.dashboards)) failures.push('observability: dashboards are missing');
        if (!boot.config || typeof boot.config.enabled !== 'boolean') failures.push('observability: config is missing');
        if ('secrets' in (boot.config || {})) failures.push('observability: bootstrap exposed the secrets map');
      }
      const overview = await obsBridge.overview({ range: '1h' });
      if (!overview?.ok) failures.push('observability: overview failed :: ' + (overview?.error || 'no result'));
      else if (!Array.isArray(overview.collectors) || !Array.isArray(overview.score?.components)) failures.push('observability: overview shape is incomplete');
      const catalog = await obsBridge.metricsCatalog({});
      if (!catalog?.ok || !Array.isArray(catalog.catalog)) failures.push('observability: metric catalog failed');
      const dashboards = await obsBridge.dashboards();
      if (!dashboards?.ok || !Array.isArray(dashboards.dashboards) || !dashboards.dashboards.length) failures.push('observability: dashboard list is empty');
      const obsAi = await window.opsdeck.ai.context({ kind: 'observability', page: 'overview' });
      if (!obsAi?.ok || !obsAi.context?.text) failures.push('observability: AI context was empty');
      else if (/## Docker engine/.test(obsAi.context.text)) failures.push('observability: AI context leaked Docker engine data');
    }

    // The workspace switcher must reach the Databases workspace.
    document.querySelector('#workspace-btn')?.click();
    if (!(await waitFor(() => !!document.querySelector('[data-workspace="databases"]'), 2500))) {
      failures.push('workspace: Databases entry is missing');
    } else {
      document.querySelector('[data-workspace="databases"]')?.click();
      const dbOpen = await waitFor(() => location.hash === '#/databases/dashboard'
        && !!document.querySelector('#sidebar a[href="#/databases/dashboard"].active')
        && document.querySelector('#view .page'), 8000);
      if (!dbOpen) failures.push('workspace: Databases did not open');
    }

    // The workspace switcher must reach the Observability workspace.
    document.querySelector('#workspace-btn')?.click();
    if (!(await waitFor(() => !!document.querySelector('[data-workspace="observability"]'), 2500))) {
      failures.push('workspace: Observability entry is missing');
    } else {
      document.querySelector('[data-workspace="observability"]')?.click();
      const obsOpen = await waitFor(() => location.hash === '#/observability/overview'
        && !!document.querySelector('#sidebar a[href="#/observability/overview"].active')
        && !!document.querySelector('#view [data-obs-page="overview"]'), 10000);
      if (!obsOpen) failures.push('workspace: Observability did not open');
      if (!document.querySelector('#view [data-obs-ai]')) failures.push('observability: Ask AI button is missing');
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

    // The workspace switcher must reach the live Kubernetes workspace and back.
    document.querySelector('#workspace-btn')?.click();
    const menuOpen = await waitFor(() => !!document.querySelector('[data-workspace="kubernetes"]'), 2500);
    if (!menuOpen) failures.push('workspace: menu did not open');
    else document.querySelector('[data-workspace="kubernetes"]')?.click();
    const kubernetesOpen = await waitFor(() => location.hash === '#/kubernetes/overview'
      && !!document.querySelector('a[href="#/kubernetes/overview"].active')
      && document.querySelector('#view .page'), 8000);
    if (!kubernetesOpen) failures.push('workspace: Kubernetes did not open');
    if (document.querySelector('#sidebar a[href="#/academy"]')) failures.push('workspace: Docker Academy leaked into the Kubernetes sidebar');
    if (!document.querySelector('[data-k8s-install-panel]')) failures.push('kubernetes: tools installer panel is missing');
    if (!document.querySelector('[data-k8s-install-status]')) failures.push('kubernetes: tools installer status area is missing');
    if (!document.querySelector('#view [data-ai-ask="kubernetes"]')) failures.push('kubernetes: Ask AI button is missing');
    // The command and Minikube cards only render when kubectl and a context
    // exist, so a clean machine must not be treated as a UI failure.
    const k8sTools = await window.opsdeck.kubernetes.tools();
    const k8sContexts = await window.opsdeck.kubernetes.contexts();
    if (k8sTools?.tools?.kubectl?.installed && k8sContexts?.contexts?.length) {
      const readyCommands = await waitFor(() => !!document.querySelector('[data-k8s-run-command]'), 5000);
      if (!readyCommands) failures.push('kubernetes: ready-made command buttons are missing');
      if (!document.querySelector('[data-minikube-action]')) failures.push('kubernetes: Minikube start/stop button is missing');
    }
    const k8sAiContext = await window.opsdeck.ai.context({ kind: 'kubernetes', page: 'overview' });
    if (!k8sAiContext?.ok || !k8sAiContext.context?.text) failures.push('kubernetes: AI context was empty');
    else if (/## Docker engine/.test(k8sAiContext.context.text)) failures.push('kubernetes: AI context leaked Docker engine data');
    const installStatus = await window.opsdeck.kubernetes.installStatus();
    if (!installStatus?.ok || !installStatus.binDir) failures.push('kubernetes: install status bridge failed');
    const k8sCommands = await window.opsdeck.kubernetes.commands({ section: 'pods' });
    if (!k8sCommands?.ok || !Array.isArray(k8sCommands.commands) || !k8sCommands.commands.length) failures.push('kubernetes: command catalog bridge failed');
    const mkStatus = await window.opsdeck.kubernetes.minikubeStatus();
    if (!mkStatus?.ok || typeof mkStatus.running !== 'boolean') failures.push('kubernetes: Minikube status bridge failed');
    if (k8sContexts?.contexts?.length && k8sTools?.tools?.kubectl?.installed) {
      for (const section of ['pods', 'deployments', 'services', 'secrets', 'events']) {
        const list = await window.opsdeck.kubernetes.resources({ section, allNamespaces: true });
        if (!list?.ok || list.error) failures.push('kubernetes: ' + section + ' query failed :: ' + (list?.error || 'no result'));
        if (section === 'secrets' && list?.rows?.some((row) => JSON.stringify(row).includes('"data"'))) {
          failures.push('kubernetes: secret data leaked into the renderer');
        }
      }
      const helmList = await window.opsdeck.kubernetes.helmReleases({ allNamespaces: true });
      if (!helmList?.ok) failures.push('kubernetes: helm list bridge failed');
      const topology = await window.opsdeck.kubernetes.topology();
      if (!topology?.ok || !topology.model) failures.push('kubernetes: topology bridge failed :: ' + (topology?.error || 'no model'));
      else {
        if (!Array.isArray(topology.model.edges)) failures.push('kubernetes: topology edges are missing');
        if (!Array.isArray(topology.model.nodes)) failures.push('kubernetes: topology nodes are missing');
        if (JSON.stringify(topology.model).includes('stringData')) failures.push('kubernetes: topology leaked secret data');
        location.hash = '#/kubernetes/topology';
        const mapReady = await waitFor(() => !!document.querySelector('[data-topo-map] .topo-card'), 12000);
        if (!mapReady) failures.push('kubernetes: topology graph did not render cards');
        if (!document.querySelector('[data-topo-node-id]')) failures.push('kubernetes: topology node rail is missing');
        if (!document.querySelector('[data-topo-search]')) failures.push('kubernetes: topology filter is missing');
        if (!document.querySelector('#view [data-ai-ask="kubernetes"]')) failures.push('kubernetes: topology Ask AI button is missing');
        const topoAi = await window.opsdeck.ai.context({ kind: 'kubernetes', page: 'topology' });
        if (!topoAi?.ok || !topoAi.context?.text) failures.push('kubernetes: topology AI context was empty');
        else if (/## Docker engine|stringData/.test(topoAi.context.text)) failures.push('kubernetes: topology AI context leaked unsafe data');

        document.querySelector('[data-topo-map] .topo-card')?.click();
        const actionOpen = await waitFor(() => !!document.querySelector('.drawer-overlay .topo-drawer'), 5000);
        if (!actionOpen) failures.push('kubernetes: topology action drawer did not open');
        else {
          if (!document.querySelector('.drawer-overlay [data-topo-jump]')) failures.push('kubernetes: topology drawer has no graph links');
          if (!document.querySelector('.drawer-overlay [data-ai-ask="k8s-resource"]')) failures.push('kubernetes: topology drawer has no Ask AI action');
          const details = document.querySelector('.drawer-overlay [data-topo-details]');
          details?.click();
          const detailOpen = await waitFor(() => !!document.querySelector('.drawer-overlay [data-k8s-detail-body]'), 8000);
          if (!detailOpen) failures.push('kubernetes: topology details action failed');
          window.OD.ui.closeTopOverlay();
          await sleep(200);
        }

        const podCard = document.querySelector('[data-topo-map] .topo-card[data-topo-kind="Pod"]');
        if (!podCard) failures.push('kubernetes: topology has no pod cards');
        else {
          podCard.click();
          const podDrawer = await waitFor(() => !!document.querySelector('.drawer-overlay [data-topo-logs]'), 5000);
          if (!podDrawer) failures.push('kubernetes: topology pod drawer did not open');
          else {
            if (!document.querySelector('.drawer-overlay [data-topo-shell]')) failures.push('kubernetes: topology pod drawer has no shell action');
            if (!document.querySelector('.drawer-overlay [data-topo-pod-logs]')) failures.push('kubernetes: topology pod drawer has no per-pod log action');
            window.OD.ui.closeTopOverlay();
            await sleep(200);
          }
        }
      }
      const podList = await window.opsdeck.kubernetes.resources({ section: 'pods', allNamespaces: true });
      if (podList?.rows?.length) {
        const first = podList.rows[0];
        const detail = await window.opsdeck.kubernetes.resourceDetail({ section: 'pods', name: first.name, namespace: first.namespace });
        if (!detail?.ok || !detail.manifest) failures.push('kubernetes: pod detail failed :: ' + (detail?.error || 'no manifest'));
        const forbidden = await window.opsdeck.kubernetes.resourceAction('persistentvolumes', 'delete', { name: 'guard-test' });
        if (forbidden?.ok) failures.push('kubernetes: cluster-scoped delete was accepted');

        location.hash = '#/kubernetes/pods?all=1';
        const rowsReady = await waitFor(() => !!document.querySelector('[data-k8s-row]'), 12000);
        if (!rowsReady) failures.push('kubernetes: clickable pod rows did not render');
        else {
          document.querySelector('[data-k8s-row]').click();
          const drawerOpen = await waitFor(() => !!document.querySelector('.drawer-overlay [data-k8s-detail-body]'), 8000);
          if (!drawerOpen) failures.push('kubernetes: detail drawer did not open');
          else {
            const drawer = document.querySelector('.drawer-overlay');
            if (!drawer.querySelector('.detail-section') || !drawer.querySelector('.tab')) failures.push('kubernetes: detail drawer is incomplete');
            if (!drawer.querySelector('[data-ai-ask="k8s-resource"]')) failures.push('kubernetes: object Ask AI button is missing');
            const objectAi = await window.opsdeck.ai.context({ kind: 'k8s-resource', section: 'pods', name: first.name, namespace: first.namespace });
            if (!objectAi?.ok || !objectAi.context?.text?.includes(first.name)) failures.push('kubernetes: object AI context is incomplete');
            const manifestTab = drawer.querySelector('[data-tabs="k8s-detail"] [data-tab="manifest"]');
            manifestTab?.click();
            if (!(await waitFor(() => !!drawer.querySelector('.code-block'), 2000))) failures.push('kubernetes: manifest tab did not render');
            window.OD.ui.closeTopOverlay();
            await sleep(220);
          }
        }
      }
    }
    document.querySelector('#workspace-btn')?.click();
    const menuReopened = await waitFor(() => !!document.querySelector('[data-workspace="docker"]'), 2500);
    if (!menuReopened) failures.push('workspace: menu did not reopen');
    else document.querySelector('[data-workspace="docker"]')?.click();
    const dockerOpen = await waitFor(() => location.hash === '#/overview' && !!document.querySelector('#view .page'), 8000);
    if (!dockerOpen) failures.push('workspace: Docker did not return');

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

    // Zoom controls round-trip through the real IPC bridge.
    const zoomStart = await window.opsdeck.window.zoom('get');
    const zoomIn = await window.opsdeck.window.zoom('in');
    if (!zoomIn?.ok || zoomIn.factor <= (zoomStart?.factor || 1)) failures.push('zoom: in did not increase the factor');
    const zoomOut = await window.opsdeck.window.zoom('out');
    if (!zoomOut?.ok || zoomOut.factor >= zoomIn.factor) failures.push('zoom: out did not decrease the factor');
    const zoomReset = await window.opsdeck.window.zoom('reset');
    if (!zoomReset?.ok || zoomReset.factor !== 1) failures.push('zoom: reset did not return to 100%');
    const zoomRestore = await window.opsdeck.window.zoom('set', zoomStart?.factor || 1);
    if (!zoomRestore?.ok || Math.abs(zoomRestore.factor - (zoomStart?.factor || 1)) > 0.01) failures.push('zoom: could not restore the original factor');

    // Firefox hand-off is exercised only when a stub is on PATH.
    if (${JSON.stringify(Boolean(process.env.OPSDECK_TEST_FIREFOX))}) {
      const firefox = await window.opsdeck.app.openInFirefox('http://localhost:65535/opsdeck-smoke');
      if (!firefox?.ok) failures.push('firefox: ' + (firefox?.error || 'could not spawn firefox'));
    }

    // Container projects: filter and grouping when compose projects exist.
    location.hash = '#/containers';
    await waitFor(() => !!document.querySelector('#container-tbody'), 8000);
    const projectButton = document.querySelector('#container-tbody [data-project-only]');
    if (projectButton) {
      const project = projectButton.dataset.projectOnly;
      projectButton.click();
      const filter = document.querySelector('#container-project');
      if (!filter || filter.value !== project) failures.push('projects: filter did not apply');
      if (filter) {
        filter.value = 'all';
        filter.dispatchEvent(new Event('change', { bubbles: true }));
      }
    }
    const groupToggle = document.querySelector('[data-container-group-toggle]');
    if (groupToggle) {
      const groupedBefore = !!document.querySelector('.container-group-row');
      groupToggle.click();
      const changed = await waitFor(() => !!document.querySelector('.container-group-row') !== groupedBefore, 2000);
      if (!changed) failures.push('projects: grouping toggle did nothing');
      groupToggle.click();
      await waitFor(() => !!document.querySelector('.container-group-row') === groupedBefore, 2000);
    }

    // Container shell: open a real interactive session when one is running.
    location.hash = '#/containers';
    await waitFor(() => !!document.querySelector('#container-tbody'), 8000);
    const execButton = [...document.querySelectorAll('[data-caction="exec"]')].find((btn) => !btn.disabled);
    if (execButton) {
      execButton.click();
      const ready = await waitFor(() => {
        const pane = document.querySelector('#exec-shell');
        return pane && pane.dataset.execSession;
      }, 25000);
      if (!ready) {
        failures.push('shell: session never became ready');
      } else {
        const pane = document.querySelector('#exec-shell');
        if (pane.dataset.execMode !== 'pty') failures.push('shell: expected a PTY session, got ' + pane.dataset.execMode);
        const type = pane._type;
        const read = typeof pane._text === 'function' ? pane._text : () => '';
        if (typeof type !== 'function') {
          failures.push('shell: terminal input is not wired');
        } else {
          type('cd /us\\t');
          await sleep(700);
          type('\\n');
          await sleep(400);
          type('echo "TAB=$(pwd)"\\n');
          const completed = await waitFor(() => read().includes('TAB=/usr'), 8000);
          if (!completed) failures.push('shell: Tab completion did not complete /usr :: ' + JSON.stringify(read().slice(-600)));
          type('echo $((6*7))\\n');
          const answered = await waitFor(() => /(^|\\s)42(\\s|$)/.test(read()), 8000);
          if (!answered) failures.push('shell: command output missing');

          const expand = document.querySelector('[data-exec-expand]');
          expand?.click();
          const fullscreen = await waitFor(() => !!document.querySelector('.drawer.drawer-fullscreen'), 2500);
          if (!fullscreen) failures.push('shell: fullscreen toggle did not apply');
          expand?.click();
          const restored = await waitFor(() => !document.querySelector('.drawer.drawer-fullscreen'), 2500);
          if (!restored) failures.push('shell: fullscreen toggle did not restore');
        }
        document.querySelector('.drawer [data-close]')?.click();
        await sleep(300);
      }
    }

    // Images: run-from-image is prefilled, and free-space review never deletes during smoke.
    location.hash = '#/images';
    await waitFor(() => !!document.querySelector('#image-tbody'), 8000);
    const runFromImage = document.querySelector('#image-tbody [data-iact="run"]');
    if (!runFromImage) {
      if (hasImages) failures.push('images: create-and-start button is missing');
    } else {
      const expectedRef = runFromImage.dataset.iref || '';
      runFromImage.click();
      const runDialog = await waitFor(() => !!document.querySelector('.modal-overlay #run-image'), 3000);
      if (!runDialog) {
        failures.push('images: run dialog did not open');
      } else {
        const value = document.querySelector('#run-image').value;
        if (!value || value !== expectedRef) failures.push('images: run dialog was not prefilled with the image reference');
        document.querySelector('.modal-overlay [data-action="cancel"]')?.click();
        await waitFor(() => !document.querySelector('.modal-overlay #run-image'), 2500);
      }
    }

    const cleanupButton = document.querySelector('[data-action="cleanup-images"]');
    if (!cleanupButton) {
      if (dockerUp) failures.push('images: free space button is missing');
    } else {
      cleanupButton.click();
      const opened = await waitFor(() => !!document.querySelector('#cleanup-list'), 4000);
      if (!opened) {
        failures.push('images: free space dialog did not open');
      } else {
        const text = document.querySelector('.modal-overlay')?.innerText || '';
        if (!/System images are protected/i.test(text)) failures.push('cleanup: system-image safety notice is missing');
        if (!document.querySelector('#cleanup-age')) failures.push('cleanup: age selector is missing');
        const rows = [...document.querySelectorAll('[data-cleanup-id]')];
        const removeButton = document.querySelector('#cleanup-delete');
        if (rows.length && removeButton?.disabled) failures.push('cleanup: delete is disabled despite candidates');
        if (!rows.length && removeButton && !removeButton.disabled) failures.push('cleanup: delete is enabled without candidates');
        const age = document.querySelector('#cleanup-age');
        if (age) {
          age.value = '365';
          age.dispatchEvent(new Event('change', { bubbles: true }));
          await sleep(120);
          if (!document.querySelector('#cleanup-list')) failures.push('cleanup: age change broke the review list');
        }
        document.querySelector('[data-cleanup-cancel]')?.click();
        await waitFor(() => !document.querySelector('#cleanup-list'), 2500);
      }
    }

    // Image row -> containers filtered by that exact image, with a removable chip.
    const containersForImage = document.querySelector('#image-tbody [data-iact="containers"]');
    if (!containersForImage) {
      if (hasImages) failures.push('images: show-containers button is missing');
    } else {
      const imageName = containersForImage.dataset.iname || '';
      const row = containersForImage.closest('tr');
      const usedCount = row ? (row.children[3]?.textContent || '').trim() : '';
      containersForImage.click();
      const filteredRoute = await waitFor(() => window.OD.store.state.route?.name === 'containers' && !!document.querySelector('[data-clear-image-filter]'), 6000);
      if (!filteredRoute) {
        failures.push('images: container image filter did not open');
      } else {
        if (!location.hash.startsWith('#/containers?image=')) failures.push('images: image filter URL is missing its query');
        const chip = document.querySelector('[data-clear-image-filter]');
        if (!chip || !chip.textContent.includes(imageName)) failures.push('images: image filter chip does not name the image');
        if (usedCount && usedCount !== '0' && usedCount !== '—') {
          const filteredRows = document.querySelectorAll('#container-tbody tr[data-open-container]');
          if (!filteredRows.length) failures.push('images: image filter returned no rows for a used image');
        }
        chip?.click();
        const cleared = await waitFor(() => window.OD.store.state.route?.raw === 'containers' && !document.querySelector('[data-clear-image-filter]'), 6000);
        if (!cleared) failures.push('images: clearing the image filter did not restore all containers');
      }
    }

    // Container logs open pinned to the newest line, with a jump control.
    location.hash = '#/containers';
    await waitFor(() => !!document.querySelector('#container-tbody'), 8000);
    const logsButton = [...document.querySelectorAll('[data-caction="logs"]')].find((btn) => !btn.disabled);
    if (logsButton) {
      logsButton.click();
      const loaded = await waitFor(() => {
        const view = document.querySelector('#log-view');
        return view && (view.querySelector('pre') || view.querySelector('.empty-state'));
      }, 15000);
      if (!loaded) {
        failures.push('logs: log content never loaded');
      } else {
        await sleep(150);
        const view = document.querySelector('#log-view');
        if (Math.abs(view.scrollHeight - view.scrollTop - view.clientHeight) > 4) {
          failures.push('logs: view did not open at the newest line');
        }
        if (view.scrollHeight > view.clientHeight + 20) {
          view.scrollTop = 0;
          view.dispatchEvent(new Event('scroll'));
          await sleep(120);
          const latest = document.querySelector('[data-log-latest]');
          if (!latest?.classList.contains('show')) failures.push('logs: jump-to-latest control did not appear');
          latest?.click();
          await sleep(150);
          if (Math.abs(view.scrollHeight - view.scrollTop - view.clientHeight) > 4) {
            failures.push('logs: jump-to-latest did not scroll to the newest line');
          }
        }
        document.querySelector('.drawer [data-close]')?.click();
        await sleep(250);
      }
    }

    // Terminal consent is persisted, so it is asked once and then remembered.
    location.hash = '#/terminal';
    await waitFor(() => !!document.querySelector('#term-input'), 8000);
    await window.OD.store.setSetting('terminalConsent', false);
    location.hash = '#/overview';
    await waitFor(() => window.OD.store.state.route?.raw === 'overview', 8000);
    location.hash = '#/terminal';
    await waitFor(() => !!document.querySelector('#term-consent'), 8000);
    document.querySelector('[data-action="terminal-consent"]')?.click();
    const consentModal = await waitFor(() => !!document.querySelector('.modal-overlay [data-action="confirm"]'), 4000);
    if (!consentModal) {
      failures.push('consent: review dialog did not open');
    } else {
      document.querySelector('.modal-overlay [data-action="confirm"]')?.click();
      const granted = await waitFor(() => {
        const banner = document.querySelector('#term-consent');
        return !banner || banner.hidden;
      }, 4000);
      if (!granted) failures.push('consent: banner did not clear after granting');
      const boot = await window.opsdeck.academy.bootstrap();
      if (boot?.progress?.settings?.terminalConsent !== true) failures.push('consent: setting was not persisted');
      location.hash = '#/overview';
      await waitFor(() => window.OD.store.state.route?.raw === 'overview', 8000);
      location.hash = '#/terminal';
      await waitFor(() => window.OD.store.state.route?.raw === 'terminal' && !!document.querySelector('#term-input'), 8000);
      if (document.querySelector('#term-consent')) failures.push('consent: prompt returned after it was granted');
    }

    // AI assistant: config privacy, live context and a real answer from the
    // loopback mock provider that startSmokeAI installed.
    const aiConfig = await window.opsdeck.ai.config();
    if (!aiConfig?.ok) failures.push('ai: config could not be read');
    const aiData = aiConfig?.config || {};
    if (aiData.configured !== true) failures.push('ai: mock provider is not configured');
    if (aiData.hasKey !== true) failures.push('ai: saved key is not reported');
    if (JSON.stringify(aiData).includes('sk-smoke-not-a-real-key')) failures.push('ai: API key leaked to the renderer');
    if ('apiKey' in aiData) failures.push('ai: config includes an apiKey field');

    const aiPing = await window.opsdeck.ai.test();
    if (!aiPing?.ok) failures.push('ai: connection test failed :: ' + (aiPing?.error || ''));

    const aiContext = await window.opsdeck.ai.context({ kind: 'page', page: 'containers', force: true });
    if (!aiContext?.ok || !aiContext.context?.text) failures.push('ai: live context was empty');
    if (!(aiContext?.context?.meta?.sources || []).length) failures.push('ai: context has no sources');

    const aiAnswer = await window.opsdeck.ai.ask({ target: { kind: 'page', page: 'containers' }, question: 'Which containers are running?' });
    if (!aiAnswer?.ok) failures.push('ai: ask failed :: ' + (aiAnswer?.error || ''));
    if (aiAnswer?.ok && !/Smoke answer/.test(aiAnswer.text || '')) failures.push('ai: mock answer was not returned');
    const sentChars = Number((String(aiAnswer?.text || '').match(/received (\\d+) characters/) || [])[1] || 0);
    if (!(sentChars > 100)) failures.push('ai: live context was not sent to the provider');

    // The topbar, page header and resource rows all open the real drawer.
    location.hash = '#/containers';
    await waitFor(() => window.OD.store.state.route?.raw === 'containers' && !!document.querySelector('#container-tbody'), 10000);
    const pageAiButton = document.querySelector('#view .page-actions [data-ai-ask="page"][data-ai-page="containers"]');
    if (!pageAiButton && dockerUp) failures.push('ai: containers page button is missing');
    const rowAiButton = document.querySelector('#container-tbody [data-ai-ask="container"]');
    if (!rowAiButton && document.querySelectorAll('#container-tbody [data-open-container]').length) failures.push('ai: container row buttons are missing');
    const topbarAi = document.querySelector('.ai-topbar');
    if (!topbarAi) failures.push('ai: topbar button is missing');
    (pageAiButton || topbarAi)?.click();
    const drawerReady = await waitFor(() => !!document.querySelector('.ai-shell'), 4000);
    if (!drawerReady) failures.push('ai: drawer did not open');
    const ctxSettled = await waitFor(() => !!document.querySelector('.ai-context-bar:not(.loading), .ai-context-error'), 20000);
    if (!ctxSettled) failures.push('ai: live context never settled in the drawer');
    if (document.querySelector('.ai-context-error')) failures.push('ai: drawer showed a context error');
    const suggestionsReady = await waitFor(() => !!document.querySelector('.ai-suggestion'), 6000);
    if (!suggestionsReady) failures.push('ai: suggested questions are missing');
    const aiInput = document.querySelector('#ai-question');
    if (!aiInput || aiInput.disabled) failures.push('ai: composer is disabled while configured');
    if (aiInput) {
      aiInput.value = 'Summarize what I should check.';
      aiInput.dispatchEvent(new Event('input', { bubbles: true }));
      document.querySelector('#ai-send')?.click();
      const painted = await waitFor(() => (document.querySelector('.ai-msg.assistant .ai-answer')?.innerText || '').includes('Smoke answer'), 30000);
      if (!painted) failures.push('ai: drawer did not paint the answer');
      const toggle = document.querySelector('[data-ai-context-toggle]');
      if (!toggle) failures.push('ai: context preview toggle is missing');
      else {
        toggle.click();
        const preview = document.querySelector('#ai-context-preview pre');
        if (!preview || preview.textContent.trim().length < 20) failures.push('ai: context preview is empty');
      }
    }
    document.querySelector('.drawer [data-close]')?.click();
    await waitFor(() => !document.querySelector('.ai-shell'), 3000);

    // The command palette exposes the same action.
    window.OD.app.openPalette('Ask AI');
    const paletteAi = await waitFor(() => [...document.querySelectorAll('[data-palette-index]')].some((el) => /Ask AI/i.test(el.innerText)), 4000);
    if (!paletteAi) failures.push('ai: command palette action is missing');
    window.OD.app.closePalette();

    // Settings exposes the provider card and never pre-fills the key.
    location.hash = '#/settings';
    await waitFor(() => window.OD.store.state.route?.raw === 'settings' && !!document.querySelector('[data-ai-settings]'), 10000);
    if (!document.querySelector('[data-ai-settings] #ai-set-base')) failures.push('ai: settings provider form is missing');
    const keyField = document.querySelector('#ai-set-key');
    if (keyField && keyField.value) failures.push('ai: settings form pre-filled the API key');

    // No error toast survived the walk.
    const toastText = document.getElementById('toast-root')?.innerText || '';
    if (/failed|error|could not/i.test(toastText)) failures.push('toasts: ' + toastText.replace(/\\s+/g, ' ').slice(0, 240));

    return { ok: failures.length === 0, failures, routes: ${routes.length} };
  })()`;
}

let mockAI = null;

function smokeJson(res, status, payload) {
  res.writeHead(status, { 'content-type': 'application/json', 'cache-control': 'no-store' });
  res.end(JSON.stringify(payload));
}

/**
 * Start a local OpenAI-compatible provider and point OpsDeck at it. This must
 * run before registerIpc() so AIService reads the smoke config, not the user's.
 * It never opens a socket beyond loopback and never removes real app data.
 */
function startSmokeAI(app) {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let body = '';
      req.on('data', (chunk) => { body += chunk; });
      req.on('end', () => {
        if (req.method === 'GET' && /\/models\/?$/.test(req.url || '')) {
          smokeJson(res, 200, { object: 'list', data: [{ id: 'opsdeck-smoke', object: 'model' }] });
          return;
        }
        if (req.method === 'POST' && /\/chat\/completions\/?$/.test(req.url || '')) {
          let parsed = null;
          try { parsed = JSON.parse(body); } catch { /* answer anyway */ }
          const messages = Array.isArray(parsed?.messages) ? parsed.messages : [];
          const system = String(messages[0]?.content || '');
          const question = String(messages[messages.length - 1]?.content || '');
          const contextChars = system.length;
          smokeJson(res, 200, {
            id: 'chatcmpl-opsdeck-smoke',
            object: 'chat.completion',
            created: Math.floor(Date.now() / 1000),
            model: 'opsdeck-smoke',
            choices: [{
              index: 0,
              message: {
                role: 'assistant',
                content: `**Smoke answer.** I received ${contextChars} characters of live context. You asked: ${question.slice(0, 120)}`,
              },
              finish_reason: 'stop',
            }],
            usage: { prompt_tokens: Math.ceil(contextChars / 4), completion_tokens: 24, total_tokens: Math.ceil(contextChars / 4) + 24 },
          });
          return;
        }
        smokeJson(res, 404, { error: { message: `No mock route for ${req.method} ${req.url}` } });
      });
    });

    server.on('error', (error) => {
      console.error('AI smoke server failed:', error.message);
      resolve(null);
    });

    server.listen(0, '127.0.0.1', () => {
      const port = server.address().port;
      const configPath = process.env.OPSDECK_AI_CONFIG_PATH || path.join(app.getPath('userData'), 'ai-smoke.json');
      process.env.OPSDECK_AI_CONFIG_PATH = configPath;
      try {
        fs.mkdirSync(path.dirname(configPath), { recursive: true });
        fs.writeFileSync(configPath, JSON.stringify({
          version: 1,
          enabled: true,
          baseUrl: `http://127.0.0.1:${port}/v1`,
          model: 'opsdeck-smoke',
          apiKey: 'sk-smoke-not-a-real-key',
          updatedAt: new Date().toISOString(),
        }, null, 2), { mode: 0o600 });
      } catch (error) {
        console.error('AI smoke config could not be written:', error.message);
        server.close();
        resolve(null);
        return;
      }
      mockAI = { server, configPath };
      app.on('will-quit', () => {
        try { server.close(); } catch { /* ignore */ }
        try { fs.unlinkSync(configPath); } catch { /* ignore */ }
      });
      console.log(`AI smoke provider listening on http://127.0.0.1:${port}/v1`);
      resolve(server);
    });
  });
}

function stopSmokeAI() {
  if (!mockAI) return;
  try { mockAI.server.close(); } catch { /* ignore */ }
  try { fs.unlinkSync(mockAI.configPath); } catch { /* ignore */ }
  mockAI = null;
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
    console.log(`Smoke test passed: ${result.routes} routes plus palette, search, theme, sidebar, shell and AI.`);
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

module.exports = { runSmokeTest, watchSmokeTest, startSmokeAI, stopSmokeAI, ROUTES };
