'use strict';

/**
 * OpsDeck renderer entry point: shell, hash router, command palette,
 * keyboard shortcuts, theme application and global event delegation.
 */
(function () {
  const { esc, debounce, fmtNumber, titleCase } = OD.utils;
  const { icon } = OD.icons;
  const U = OD.ui;
  const store = OD.store;
  const api = window.opsdeck;

  const WORKSPACES = [
    { id: 'docker', label: 'Docker', icon: 'box', tone: 'accent' },
    { id: 'kubernetes', label: 'Kubernetes', icon: 'cloud', tone: 'violet' },
    { id: 'databases', label: 'Databases', icon: 'database', tone: 'orange', soon: true },
    { id: 'observability', label: 'Observability', icon: 'activity', tone: 'cyan', soon: true },
  ];

  const NAV = [
    {
      label: 'Docker',
      items: [
        { id: 'overview', label: 'Overview', icon: 'layout-dashboard', href: '#/overview' },
        { id: 'containers', label: 'Containers', icon: 'box', href: '#/containers' },
        { id: 'images', label: 'Images', icon: 'layers', href: '#/images' },
        { id: 'compose', label: 'Compose', icon: 'boxes', href: '#/compose' },
        { id: 'volumes', label: 'Volumes', icon: 'database', href: '#/volumes' },
        { id: 'networks', label: 'Networks', icon: 'network', href: '#/networks' },
        { id: 'builds', label: 'Builds', icon: 'hammer', href: '#/builds' },
        { id: 'registries', label: 'Registries', icon: 'cloud', href: '#/registries' },
      ],
    },
    {
      label: 'Observe',
      items: [
        { id: 'monitoring', label: 'Monitoring', icon: 'activity', href: '#/monitoring' },
        { id: 'events', label: 'Events', icon: 'list', href: '#/events' },
        { id: 'terminal', label: 'Terminal', icon: 'terminal', href: '#/terminal' },
      ],
    },
    {
      label: 'Learn',
      items: [
        { id: 'academy', label: 'Academy', icon: 'graduation-cap', href: '#/academy', badge: 'academy' },
      ],
    },
  ];

  const KUBERNETES_NAV = [
    {
      label: 'Clusters',
      items: [
        { id: 'kubernetes', section: 'overview', label: 'Cluster overview', icon: 'layout-dashboard', href: '#/kubernetes/overview' },
        { id: 'kubernetes', section: 'topology', label: 'Cluster map', icon: 'map', href: '#/kubernetes/topology' },
        { id: 'kubernetes', section: 'contexts', label: 'Contexts', icon: 'cloud', href: '#/kubernetes/contexts' },
        { id: 'kubernetes', section: 'namespaces', label: 'Namespaces', icon: 'layers', href: '#/kubernetes/namespaces' },
        { id: 'kubernetes', section: 'nodes', label: 'Nodes', icon: 'server', href: '#/kubernetes/nodes' },
      ],
    },
    {
      label: 'Workloads',
      items: [
        { id: 'kubernetes', section: 'pods', label: 'Pods', icon: 'box', href: '#/kubernetes/pods' },
        { id: 'kubernetes', section: 'deployments', label: 'Deployments', icon: 'layers', href: '#/kubernetes/deployments' },
        { id: 'kubernetes', section: 'statefulsets', label: 'StatefulSets', icon: 'database', href: '#/kubernetes/statefulsets' },
        { id: 'kubernetes', section: 'daemonsets', label: 'DaemonSets', icon: 'server', href: '#/kubernetes/daemonsets' },
        { id: 'kubernetes', section: 'jobs', label: 'Jobs', icon: 'play', href: '#/kubernetes/jobs' },
        { id: 'kubernetes', section: 'cronjobs', label: 'CronJobs', icon: 'clock', href: '#/kubernetes/cronjobs' },
      ],
    },
    {
      label: 'Networking',
      items: [
        { id: 'kubernetes', section: 'services', label: 'Services', icon: 'network', href: '#/kubernetes/services' },
        { id: 'kubernetes', section: 'ingresses', label: 'Ingresses', icon: 'globe', href: '#/kubernetes/ingresses' },
        { id: 'kubernetes', section: 'networkpolicies', label: 'Network policies', icon: 'lock', href: '#/kubernetes/networkpolicies' },
      ],
    },
    {
      label: 'Storage',
      items: [
        { id: 'kubernetes', section: 'persistentvolumes', label: 'Persistent volumes', icon: 'database', href: '#/kubernetes/persistentvolumes' },
        { id: 'kubernetes', section: 'persistentvolumeclaims', label: 'Volume claims', icon: 'folder', href: '#/kubernetes/persistentvolumeclaims' },
        { id: 'kubernetes', section: 'storageclasses', label: 'Storage classes', icon: 'layers', href: '#/kubernetes/storageclasses' },
      ],
    },
    {
      label: 'Configuration',
      items: [
        { id: 'kubernetes', section: 'configmaps', label: 'ConfigMaps', icon: 'file', href: '#/kubernetes/configmaps' },
        { id: 'kubernetes', section: 'secrets', label: 'Secrets', icon: 'key', href: '#/kubernetes/secrets' },
        { id: 'kubernetes', section: 'resourcequotas', label: 'Resource quotas', icon: 'filter', href: '#/kubernetes/resourcequotas' },
        { id: 'kubernetes', section: 'limitranges', label: 'Limit ranges', icon: 'target', href: '#/kubernetes/limitranges' },
      ],
    },
    {
      label: 'Security',
      items: [
        { id: 'kubernetes', section: 'serviceaccounts', label: 'Service accounts', icon: 'user', href: '#/kubernetes/serviceaccounts' },
        { id: 'kubernetes', section: 'roles', label: 'Roles', icon: 'shield', href: '#/kubernetes/roles' },
        { id: 'kubernetes', section: 'rolebindings', label: 'Role bindings', icon: 'link', href: '#/kubernetes/rolebindings' },
        { id: 'kubernetes', section: 'clusterroles', label: 'Cluster roles', icon: 'crown', href: '#/kubernetes/clusterroles' },
        { id: 'kubernetes', section: 'clusterrolebindings', label: 'Cluster bindings', icon: 'globe', href: '#/kubernetes/clusterrolebindings' },
      ],
    },
    {
      label: 'Applications',
      items: [
        { id: 'kubernetes', section: 'helm', label: 'Helm releases', icon: 'rocket', href: '#/kubernetes/helm' },
      ],
    },
    {
      label: 'Observability',
      items: [
        { id: 'kubernetes', section: 'events', label: 'Events', icon: 'activity', href: '#/kubernetes/events' },
      ],
    },
    {
      label: 'Tools',
      items: [
        { id: 'kubernetes', section: 'console', label: 'Kubectl console', icon: 'terminal', href: '#/kubernetes/console' },
        { id: 'kubernetes', section: 'tools', label: 'Local tools', icon: 'download', href: '#/kubernetes/tools' },
      ],
    },
  ];

  const PAGE_LABELS = {
    overview: 'Overview', containers: 'Containers', images: 'Images', compose: 'Compose',
    volumes: 'Volumes', networks: 'Networks', builds: 'Builds', registries: 'Registries',
    monitoring: 'Monitoring', events: 'Events', terminal: 'Terminal', settings: 'Settings',
    academy: 'Academy', kubernetes: 'Kubernetes', notfound: 'Not found',
  };

  let currentView = null;
  let renderSeq = 0;
  let paletteOpen = false;
  let paletteIndex = 0;
  let paletteItems = [];
  let workspaceMenuOpen = false;
  let statusTimer = null;

  // ------------------------------------------------------------------ routing

  function parseHash() {
    const raw = String(location.hash || '').replace(/^#\/?/, '');
    const [path, query = ''] = raw.split('?');
    const parts = path.split('/').filter(Boolean);
    return { name: parts[0] || 'overview', parts: parts.slice(1), raw, query: new URLSearchParams(query) };
  }

  function isDockerRoute(name) {
    return ['overview', 'containers', 'images', 'compose', 'volumes', 'networks', 'builds', 'registries', 'monitoring', 'events', 'terminal', 'settings'].includes(name);
  }

  function workspaceIdForRoute(route) {
    return route?.name === 'kubernetes' ? 'kubernetes' : 'docker';
  }

  function routeLabel(route) {
    if (route.name === 'kubernetes') {
      return OD.views?.kubernetes?.label?.(route.parts[0] || 'overview') || titleCase(route.parts[0] || 'overview');
    }
    if (route.name !== 'academy') return PAGE_LABELS[route.name] || titleCase(route.name);
    const section = route.parts[0];
    if (!section) return 'Academy';
    if (section === 'course') return store.courseById(route.parts[1])?.title || 'Course';
    if (section === 'lesson') return store.lessonById(route.parts[1])?.title || 'Lesson';
    if (section === 'paths') return route.parts[1] ? (store.pathById(route.parts[1])?.title || 'Path') : 'Paths';
    if (section === 'reference') return route.parts[1] ? (store.commandById(route.parts[1])?.command || store.commandById(route.parts[1])?.name || 'Reference') : 'Reference';
    if (section === 'troubleshooting') return route.parts[1] ? (store.guideById(route.parts[1])?.title || 'Troubleshooting') : 'Troubleshooting';
    if (section === 'labs') return route.parts[1] ? (store.allLabs().find((l) => l.id === route.parts[1])?.title || 'Lab') : 'Labs';
    if (section === 'visuals') return route.parts[1] ? (store.diagramById(route.parts[1])?.title || 'Visuals') : 'Visuals';
    return titleCase(section);
  }

  function breadcrumbs(route) {
    if (route.name === 'kubernetes') {
      const section = route.parts[0] || 'overview';
      return `<a class="crumb" href="#/kubernetes/overview">Kubernetes</a>${icon('chevron-right', 11)}<span class="crumb current">${esc(routeLabel(route) || titleCase(section))}</span>`;
    }
    if (route.name !== 'academy') {
      return `<span class="crumb">Docker</span>${icon('chevron-right', 11)}<span class="crumb current">${esc(routeLabel(route))}</span>`;
    }
    const crumbs = [`<a class="crumb" href="#/academy">Academy</a>`];
    const section = route.parts[0];
    if (section) {
      const roots = {
        courses: ['Courses', '#/academy/courses'], paths: ['Paths', '#/academy/paths'], reference: ['Reference', '#/academy/reference'],
        troubleshooting: ['Troubleshooting', '#/academy/troubleshooting'], labs: ['Labs', '#/academy/labs'], visuals: ['Visuals', '#/academy/visuals'],
        glossary: ['Glossary', '#/academy/glossary'], search: ['Search', '#/academy/search'],
      };
      const root = roots[section];
      if (root) {
        if (route.parts[1] && section !== 'glossary' && section !== 'search' && section !== 'courses' && section !== 'paths') {
          crumbs.push(`<a class="crumb" href="${root[1]}">${esc(root[0])}</a>`);
        } else {
          crumbs.push(`<span class="crumb current">${esc(root[0])}</span>`);
        }
      }
      if (route.parts[1]) crumbs.push(`<span class="crumb current">${esc(routeLabel(route))}</span>`);
    } else {
      crumbs.push(`<span class="crumb current">Dashboard</span>`);
    }
    return crumbs.join(icon('chevron-right', 11));
  }

  function setFaviconTitle(route) {
    const label = routeLabel(route);
    document.title = `OpsDeck — ${label}`;
  }

  function renderError(error, route) {
    return `<div class="page">
      <div class="hero">
        <div>
          <div class="eyebrow">${icon('alert-triangle', 12)}View error</div>
          <h1 class="hero-title">This view could not be rendered</h1>
          <p class="hero-sub">${esc(error?.message || 'An unexpected error occurred while building the page. OpsDeck kept the shell alive so you can recover without restarting.')}</p>
          <div class="hero-actions">
            ${U.button({ label: 'Retry', icon: 'refresh', variant: 'primary', attrs: 'data-action="retry-route"' })}
            <a class="btn btn-secondary btn-md" href="#/overview">${icon('layout-dashboard', 14)}<span>Back to overview</span></a>
            <a class="btn btn-ghost btn-md" href="#/settings">${icon('settings', 14)}<span>Settings</span></a>
          </div>
        </div>
        <div class="hero-side">
          <div class="engine-panel">
            <div class="engine-status"><span class="pulse bad"></span><div><div class="engine-name">Route: ${esc(route.raw || 'unknown')}</div><div class="engine-reason">${esc(error?.stack ? String(error.stack).split('\n')[0] : 'No stack available.')}</div></div></div>
          </div>
        </div>
      </div>
      ${U.errorBanner('Details', error?.message || 'Unknown render failure')}
    </div>`;
  }

  async function renderRoute(options = {}) {
    const seq = ++renderSeq;
    const route = parseHash();
    store.state.route = route;
    setFaviconTitle(route);

    const previous = document.getElementById('view');
    let host = document.createElement('div');
    host.id = 'view';
    host.className = 'content-inner';
    if (previous) previous.replaceWith(host);
    else document.getElementById('content').appendChild(host);

    if (currentView && typeof currentView.dispose === 'function') {
      try { currentView.dispose(); } catch { /* ignore */ }
    }
    currentView = null;

    if (typeof route.name === 'string' && route.name !== 'academy' && route.name !== 'kubernetes' && !isDockerRoute(route.name)) {
      host.innerHTML = `<div class="page">${U.empty({ icon: 'compass', title: 'Page not found', body: `There is no view for “${route.raw}”. Use the sidebar or the command palette to continue.`, action: `<a class="btn btn-primary btn-sm" href="#/overview">Open overview</a>` })}</div>`;
      applyChrome();
      return;
    }

    host.innerHTML = `<div class="page" style="padding:30px 0">${U.loader('Loading workspace…')}</div>`;

    currentView = route.name === 'academy'
      ? OD.views.academy
      : route.name === 'kubernetes' ? OD.views.kubernetes : OD.views.docker;
    if (!currentView) {
      host.innerHTML = renderError(new Error('The view module did not load. Check the script order in index.html.'), route);
      applyChrome();
      return;
    }

    let html = '';
    try {
      html = await currentView.render(route);
    } catch (error) {
      console.error(`Render failed for ${route.raw}:`, error);
      html = renderError(error, route);
    }
    if (seq !== renderSeq) return;
    host = document.getElementById('view') || host;
    host.innerHTML = html || '';

    try {
      currentView.mount(host, route);
    } catch (error) {
      console.error(`Mount failed for ${route.raw}:`, error);
      U.toast('Interaction setup failed', 'error', { description: error.message });
    }

    if (options.scroll !== false && document.getElementById('content')) {
      document.getElementById('content').scrollTop = 0;
    }
    applyChrome();
    paintZoom();
  }

  const rerender = debounce(() => { renderRoute({ scroll: false }); }, 20);

  function goto(hash) {
    if (!hash) return;
    if (location.hash === hash) renderRoute({ scroll: false });
    else location.hash = hash;
  }

  // ------------------------------------------------------------------ shell

  function engineMini() {
    const status = store.state.status;
    const ok = !!status?.available;
    return `<div class="engine-mini" role="status" title="${esc(ok ? `Docker ${status.serverVersion || ''} on ${status.context || 'default'}` : (status?.reason || 'Engine offline'))}">
      <span class="dot ${ok ? 'ok' : 'bad'}"></span>
      <span class="sidebar-footer-text">${ok ? `Docker ${esc(status.serverVersion || '')}` : 'Engine offline'}</span>
      <button type="button" class="icon-btn" data-action="retry-status" title="Check engine" aria-label="Check engine">${icon('refresh', 12)}</button>
    </div>`;
  }

  function kubernetesMini() {
    const status = store.state.kubernetes;
    const tool = status?.tools?.kubectl;
    const connected = status?.connection?.connected === true;
    const missing = tool && tool.installed === false;
    const label = missing ? 'kubectl missing' : connected ? (status?.selected || 'Cluster connected') : (status ? 'Cluster offline' : 'Kubernetes');
    const detail = missing ? (tool.detail || 'kubectl is not on PATH') : connected ? (status?.namespace || 'default') : (status?.connection?.reason || 'Open the Kubernetes workspace');
    return `<div class="engine-mini" role="status" title="${esc(detail)}">
      <span class="dot ${connected ? 'ok' : 'bad'}"></span>
      <span class="sidebar-footer-text">${esc(label)}</span>
      <button type="button" class="icon-btn" data-action="k8s-refresh" title="Refresh cluster" aria-label="Refresh cluster">${icon('refresh', 12)}</button>
    </div>`;
  }

  function renderSidebar() {
    const sidebar = document.getElementById('sidebar');
    if (!sidebar) return;
    const route = store.state.route || parseHash();
    const stats = store.overallStats();
    const collapsed = store.state.sidebarCollapsed;
    document.getElementById('app').dataset.collapsed = collapsed ? 'true' : 'false';
    const workspaceId = workspaceIdForRoute(route);
    const workspace = WORKSPACES.find((w) => w.id === workspaceId) || WORKSPACES[0];
    const nav = workspaceId === 'kubernetes' ? KUBERNETES_NAV : NAV;

    const navGroup = (group) => `<div class="sidebar-section">
      <div class="sidebar-section-label">${esc(group.label)}</div>
      <div class="nav-list">${group.items.map((item) => {
        const section = route.parts?.[0] || 'overview';
        const active = (item.id === 'academy' && route.name === 'academy')
          || (item.id === route.name && (!item.section || item.section === section));
        const badge = item.badge === 'academy' ? `${stats.percent}%` : '';
        return `<a class="nav-item ${active ? 'active' : ''}" href="${item.href}" title="${esc(item.label)}" aria-current="${active ? 'page' : 'false'}">
          ${icon(item.icon, 16)}<span class="nav-label">${esc(item.label)}</span>${badge ? `<span class="nav-badge accent">${badge}</span>` : ''}
        </a>`;
      }).join('')}</div>
    </div>`;

    sidebar.innerHTML = `
      <div class="sidebar-head">
        <span class="brand-mark">${icon('deck', 16)}</span>
        <div class="brand-text"><div class="brand-name">OpsDeck</div><div class="brand-sub">Operations Studio</div></div>
      </div>
      <div class="workspace-switcher">
        <div class="workspace-wrap">
          <button type="button" class="workspace-btn" id="workspace-btn" aria-haspopup="true" aria-expanded="${workspaceMenuOpen}">
            <span class="workspace-icon">${icon(workspace.icon, 13)}</span>
            <span class="workspace-name">${esc(workspace.label)}</span>
            ${icon('chevron-down', 13, 'workspace-chevron')}
          </button>
          ${workspaceMenuOpen ? `<div class="workspace-menu" role="menu">
            <div class="workspace-menu-label">Workspaces</div>
            ${WORKSPACES.map((w) => `<button type="button" class="workspace-menu-item ${w.id === workspaceId ? 'active' : ''}" data-workspace="${w.id}" role="menuitem">
              <span class="icon-chip tone-${w.tone}" style="--chip-size:24px">${icon(w.icon, 12)}</span>
              <span class="workspace-menu-name">${esc(w.label)}</span>
              ${w.id === workspaceId ? U.badge('active', 'green') : w.soon ? U.badge('planned', 'slate') : ''}
            </button>`).join('')}
            <div class="workspace-menu-note">Docker and Kubernetes are live. The same shell, search and learning system will host databases and observability.</div>
          </div>` : ''}
        </div>
      </div>
      <nav class="sidebar-scroll" aria-label="Primary">
        ${nav.map(navGroup).join('')}
      </nav>
      ${workspaceId === 'kubernetes' ? kubernetesMini() : engineMini()}
      <div class="sidebar-footer">
        <a class="nav-item ${route.name === 'settings' ? 'active' : ''}" href="#/settings" title="Settings">
          ${icon('settings', 16)}<span class="nav-label">Settings</span>
        </a>
        <div class="sidebar-footer-text" style="padding:8px 10px 0;font-size:9.5px;color:var(--faint)">v${esc(store.state.info?.version || '1.0.0')} · local-first</div>
      </div>`;
  }

  function renderTopbar() {
    const bar = document.getElementById('topbar');
    if (!bar) return;
    const route = store.state.route || parseHash();
    const status = store.state.status;
    const ok = !!status?.available;
    const isMac = store.state.info?.platform === 'darwin';
    const theme = store.resolvedTheme();

    bar.innerHTML = `
      <div class="breadcrumbs">${breadcrumbs(route)}</div>
      <div class="topbar-spacer"></div>
      <button type="button" class="search-trigger" id="topbar-search" aria-label="Search or jump to">
        ${icon('search', 13)}<span>Search or jump to…</span><span class="kbd">Ctrl K</span>
      </button>
      <div class="topbar-actions">
        ${OD.ai ? OD.ai.topbarButton() : ''}
        <a class="env-pill ${ok ? '' : 'offline'}" href="#/terminal" title="${esc(ok ? `Engine ${status.serverVersion || ''}` : (status?.reason || 'Engine offline'))}"><span class="dot"></span>${ok ? 'Engine online' : 'Engine offline'}</a>
        <div class="zoom-control" title="Interface scale — Ctrl + / Ctrl − / Ctrl 0">
          <button type="button" class="icon-btn" data-action="zoom-out" aria-label="Zoom out">${icon('minus', 14)}</button>
          <button type="button" class="zoom-value" data-action="zoom-reset" data-zoom-value aria-label="Reset zoom">${Math.round((store.state.zoomFactor || 1) * 100)}%</button>
          <button type="button" class="icon-btn" data-action="zoom-in" aria-label="Zoom in">${icon('plus', 14)}</button>
        </div>
        <button type="button" class="icon-btn" data-action="toggle-theme" title="Switch to ${theme === 'dark' ? 'light' : 'dark'} theme" aria-label="Toggle theme">${icon(theme === 'dark' ? 'sun' : 'moon', 15)}</button>
        <button type="button" class="icon-btn" data-action="toggle-sidebar" title="Toggle sidebar (Ctrl+B)" aria-label="Toggle sidebar">${icon('panel-left', 15)}</button>
        <a class="icon-btn" href="#/academy" title="Academy" aria-label="Academy">${icon('graduation-cap', 15)}</a>
        ${isMac ? '' : `<div class="window-controls">
          <button type="button" class="window-btn" data-window="minimize" aria-label="Minimize">${icon('minimize', 14)}</button>
          <button type="button" class="window-btn" data-window="maximize" aria-label="Maximize or restore">${icon('maximize', 13)}</button>
          <button type="button" class="window-btn close" data-window="close" aria-label="Close">${icon('x', 14)}</button>
        </div>`}
      </div>`;
  }

  function applyChrome() {
    renderSidebar();
    renderTopbar();
  }

  function applySidebar() {
    const collapsed = store.state.sidebarCollapsed === true;
    document.getElementById('app').dataset.collapsed = collapsed ? 'true' : 'false';
  }

  function refreshChrome() { applyChrome(); }

  // ------------------------------------------------------------------ zoom

  function applyZoomState(payload) {
    if (!payload || !payload.ok) return;
    store.state.zoomFactor = payload.factor || 1;
    paintZoom();
  }

  function paintZoom() {
    const percent = `${Math.round((store.state.zoomFactor || 1) * 100)}%`;
    document.querySelectorAll('[data-zoom-value]').forEach((el) => { el.textContent = percent; });
  }

  async function changeZoom(action, factor) {
    const res = await api.window.zoom(action, factor);
    applyZoomState(res);
    return res;
  }

  // ------------------------------------------------------------------ command palette

  function paletteActions() {
    const route = store.state.route || parseHash();
    const actions = [
      { title: 'Overview', sub: 'Workspace health and recent activity', type: 'Navigate', icon: 'layout-dashboard', href: '#/overview' },
      { title: 'Containers', sub: 'Lifecycle, logs and inspect', type: 'Navigate', icon: 'box', href: '#/containers' },
      { title: 'Images', sub: 'Local images and layers', type: 'Navigate', icon: 'layers', href: '#/images' },
      { title: 'Compose projects', sub: 'Multi-service stacks', type: 'Navigate', icon: 'boxes', href: '#/compose' },
      { title: 'Volumes', sub: 'Persistent storage', type: 'Navigate', icon: 'database', href: '#/volumes' },
      { title: 'Networks', sub: 'Bridge, overlay and DNS', type: 'Navigate', icon: 'network', href: '#/networks' },
      { title: 'Builds', sub: 'Buildx builders and cache', type: 'Navigate', icon: 'hammer', href: '#/builds' },
      { title: 'Registries', sub: 'Auth and image sources', type: 'Navigate', icon: 'cloud', href: '#/registries' },
      { title: 'Monitoring', sub: 'Live resource telemetry', type: 'Navigate', icon: 'activity', href: '#/monitoring' },
      { title: 'Events', sub: 'Engine event stream', type: 'Navigate', icon: 'list', href: '#/events' },
      { title: 'Terminal', sub: 'Validated Docker console', type: 'Navigate', icon: 'terminal', href: '#/terminal' },
      { title: 'Academy', sub: 'Courses, lessons and progress', type: 'Navigate', icon: 'graduation-cap', href: '#/academy' },
      { title: 'Kubernetes overview', sub: 'Cluster health and contexts', type: 'Navigate', icon: 'cloud', href: '#/kubernetes/overview' },
      { title: 'Kubernetes contexts', sub: 'Kubeconfig sources and selected context', type: 'Navigate', icon: 'cloud', href: '#/kubernetes/contexts' },
      { title: 'Kubernetes namespaces', sub: 'Live namespaces and pod counts', type: 'Navigate', icon: 'layers', href: '#/kubernetes/namespaces' },
      { title: 'Kubernetes nodes', sub: 'Node readiness and capacity', type: 'Navigate', icon: 'server', href: '#/kubernetes/nodes' },
      { title: 'Academy search', sub: 'Search every lesson, command and guide', type: 'Navigate', icon: 'search', href: '#/academy/search' },
      { title: 'Settings', sub: 'Appearance, goals and security', type: 'Navigate', icon: 'settings', href: '#/settings' },
      { title: 'Ask AI about this page', sub: 'Open the assistant with live context  (Ctrl+Shift+A)', type: 'Action', icon: 'sparkles', action: 'ai-ask' },
      { title: `Switch to ${store.resolvedTheme() === 'dark' ? 'light' : 'dark'} theme`, sub: 'Change the interface appearance', type: 'Action', icon: store.resolvedTheme() === 'dark' ? 'sun' : 'moon', action: 'toggle-theme' },
      { title: 'Zoom in', sub: 'Increase the interface scale  (Ctrl +)', type: 'Action', icon: 'zoom-in', action: 'zoom-in' },
      { title: 'Zoom out', sub: 'Decrease the interface scale  (Ctrl −)', type: 'Action', icon: 'zoom-out', action: 'zoom-out' },
      { title: 'Reset zoom', sub: 'Return the interface to 100%  (Ctrl 0)', type: 'Action', icon: 'rotate-ccw', action: 'zoom-reset' },
      { title: `${store.state.sidebarCollapsed ? 'Expand' : 'Collapse'} sidebar`, sub: 'More room for content', type: 'Action', icon: 'panel-left', action: 'toggle-sidebar' },
      { title: 'Check Docker engine', sub: 'Refresh connection status', type: 'Action', icon: 'refresh', action: 'retry-status' },
      { title: 'Reset Academy progress', sub: 'Open settings to reset local data', type: 'Navigate', icon: 'rotate-ccw', href: '#/settings' },
    ];
    void route;
    return actions;
  }

  function openPalette(initial = '') {
    if (paletteOpen) return;
    paletteOpen = true;
    paletteIndex = 0;
    const root = document.getElementById('palette-root');
    root.innerHTML = `<div class="palette-overlay" data-palette-backdrop>
      <div class="palette" role="dialog" aria-modal="true" aria-label="Command palette">
        <div class="palette-input">${icon('search', 17)}<input id="palette-input" type="text" placeholder="Search pages, commands, lessons, errors…" autocomplete="off" spellcheck="false" value="${esc(initial)}" /><span class="kbd">Esc</span></div>
        <div class="palette-list" id="palette-list"></div>
        <div class="palette-foot"><span><span class="kbd">↑</span><span class="kbd">↓</span> navigate</span><span><span class="kbd">↵</span> open</span><span><span class="kbd">Esc</span> close</span><span class="palette-brand">${icon('deck', 11)}OpsDeck</span></div>
      </div>
    </div>`;
    paintPalette(initial);
    const input = document.getElementById('palette-input');
    input?.focus();
    input?.addEventListener('input', () => { paletteIndex = 0; paintPalette(input.value); });
    input?.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); movePalette(1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); movePalette(-1); }
      else if (event.key === 'Enter') { event.preventDefault(); runPaletteItem(paletteIndex); }
      else if (event.key === 'Escape') { event.preventDefault(); closePalette(); }
    });
    const backdrop = root.querySelector('[data-palette-backdrop]');
    backdrop?.addEventListener('mousedown', (event) => { if (event.target === backdrop) closePalette(); });
  }

  function paletteSearchResults(query) {
    if (!query.trim()) return [];
    return store.search(query, 10).map((r) => ({
      title: r.title, sub: r.subtitle || '', type: r.type, icon: r.icon || 'search', href: r.href,
    }));
  }

  function paintPalette(query) {
    const list = document.getElementById('palette-list');
    if (!list) return;
    const q = String(query || '').trim();
    const actions = paletteActions().filter((a) => !q || `${a.title} ${a.sub} ${a.type}`.toLowerCase().includes(q.toLowerCase()));
    const results = paletteSearchResults(q);
    paletteItems = [...results, ...actions];
    if (!paletteItems.length) {
      list.innerHTML = `<div class="palette-empty">${icon('search', 20)}<strong>No matches for “${esc(q)}”</strong><span>Try a command, lesson title, error text or page name.</span></div>`;
      return;
    }
    const sections = new Map();
    for (const item of paletteItems) {
      const key = item.type || 'Navigate';
      if (!sections.has(key)) sections.set(key, []);
      sections.get(key).push(item);
    }
    let running = 0;
    list.innerHTML = [...sections.entries()].map(([type, items]) => `<div class="palette-group"><div class="palette-section">${esc(type)}</div>${items.map((item) => {
      const index = running++;
      return `<button type="button" class="palette-item ${index === paletteIndex ? 'selected' : ''}" data-palette-index="${index}">
        <span class="palette-item-icon">${icon(item.icon || 'search', 15)}</span>
        <span class="palette-item-body"><span class="p-title">${esc(item.title)}</span>${item.sub ? `<span class="p-sub">${esc(item.sub)}</span>` : ''}</span>
        <span class="p-type">${esc(type)}</span>
      </button>`;
    }).join('')}</div>`).join('');
    list.querySelectorAll('[data-palette-index]').forEach((btn) => {
      btn.addEventListener('mouseenter', () => {
        paletteIndex = Number(btn.dataset.paletteIndex);
        highlightPalette();
      });
      btn.addEventListener('click', () => runPaletteItem(Number(btn.dataset.paletteIndex)));
    });
  }

  function highlightPalette() {
    document.querySelectorAll('[data-palette-index]').forEach((el) => {
      el.classList.toggle('selected', Number(el.dataset.paletteIndex) === paletteIndex);
    });
    const current = document.querySelector(`[data-palette-index="${paletteIndex}"]`);
    current?.scrollIntoView({ block: 'nearest' });
  }

  function movePalette(delta) {
    if (!paletteItems.length) return;
    paletteIndex = (paletteIndex + delta + paletteItems.length) % paletteItems.length;
    highlightPalette();
  }

  function runPaletteItem(index) {
    const item = paletteItems[index];
    if (!item) return;
    closePalette();
    if (item.action) {
      runGlobalAction(item.action);
      return;
    }
    if (item.href) goto(item.href);
  }

  function closePalette() {
    paletteOpen = false;
    const root = document.getElementById('palette-root');
    if (root) root.innerHTML = '';
  }

  // ------------------------------------------------------------------ global actions

  async function runGlobalAction(action) {
    if (action === 'toggle-theme') {
      const next = store.resolvedTheme() === 'dark' ? 'light' : 'dark';
      await store.setSetting('theme', next);
      applyChrome();
      U.toast(`${titleCase(next)} theme`, 'success');
    } else if (action === 'toggle-sidebar') {
      await store.setSetting('sidebarCollapsed', !store.state.sidebarCollapsed);
      applySidebar();
      applyChrome();
    } else if (action === 'zoom-in') {
      await changeZoom('in');
    } else if (action === 'zoom-out') {
      await changeZoom('out');
    } else if (action === 'zoom-reset') {
      await changeZoom('reset');
      U.toast('Interface scale reset', 'success', { description: 'Zoom is back to 100%.' });
    } else if (action === 'retry-status') {
      await store.refreshStatus();
      applyChrome();
      U.toast(store.state.status?.available ? 'Docker engine reachable' : 'Docker engine offline', store.state.status?.available ? 'success' : 'warning', { description: store.state.status?.reason || store.state.status?.serverVersion || '' });
    } else if (action === 'retry-route') {
      renderRoute();
    } else if (action === 'k8s-refresh') {
      renderRoute({ scroll: false });
    } else if (action === 'open-workspace') {
      U.toast('That workspace is planned', 'info', { description: 'OpsDeck currently ships the Docker and Kubernetes workspaces plus the Academy. The shell is ready for databases and observability.' });
    } else if (action === 'ai-ask') {
      if (OD.ai) OD.ai.openForCurrent();
      else U.toast('AI is unavailable in this build', 'warning');
    }
  }

  async function copyFromElement(el) {
    const text = el.dataset.copyText
      || el.closest('.code-block')?.querySelector('pre code')?.textContent
      || el.closest('.config-view')?.querySelector('pre')?.textContent
      || '';
    if (!text) return;
    await OD.utils.copyText(text, 'Copied to clipboard');
  }

  function handleDocumentClick(event) {
    const external = event.target.closest('[data-external]');
    if (external) {
      event.preventDefault();
      const href = external.getAttribute('href') || '';
      if (/^https?:\/\//i.test(href)) api.app.openExternal(href);
      return;
    }
    const copy = event.target.closest('[data-copy-text], .code-copy');
    if (copy) {
      event.preventDefault();
      copyFromElement(copy);
      return;
    }
    const run = event.target.closest('[data-run-command]');
    if (run) {
      event.preventDefault();
      const command = run.dataset.runCommand || '';
      if (OD.views.docker && OD.views.docker.terminalPending) {
        OD.views.docker.terminalPending(command);
      }
      if (parseHash().name === 'terminal') renderRoute({ scroll: false });
      else goto('#/terminal');
      return;
    }
    const nav = event.target.closest('[data-goto]');
    if (nav) {
      event.preventDefault();
      goto(nav.dataset.goto);
      return;
    }
    const globalAction = event.target.closest('[data-action]');
    if (globalAction && ['toggle-theme', 'toggle-sidebar', 'zoom-in', 'zoom-out', 'zoom-reset', 'retry-status', 'retry-route', 'open-workspace', 'k8s-refresh'].includes(globalAction.dataset.action)) {
      event.preventDefault();
      runGlobalAction(globalAction.dataset.action);
      return;
    }
    const workspace = event.target.closest('[data-workspace]');
    if (workspace) {
      event.preventDefault();
      workspaceMenuOpen = false;
      applyChrome();
      const target = WORKSPACES.find((w) => w.id === workspace.dataset.workspace);
      if (target?.id === 'docker') goto('#/overview');
      else if (target?.id === 'kubernetes') goto('#/kubernetes/overview');
      else if (target) runGlobalAction('open-workspace');
      return;
    }
    if (event.target.closest('#workspace-btn')) {
      event.preventDefault();
      workspaceMenuOpen = !workspaceMenuOpen;
      applyChrome();
      return;
    }
    if (workspaceMenuOpen && !event.target.closest('.workspace-wrap')) {
      workspaceMenuOpen = false;
      applyChrome();
    }
  }

  function setupGlobalEvents() {
    document.addEventListener('click', handleDocumentClick);

    document.addEventListener('click', (event) => {
      const win = event.target.closest('[data-window]');
      if (!win) return;
      if (win.dataset.window === 'minimize') api.window.minimize();
      else if (win.dataset.window === 'maximize') api.window.toggleMaximize();
      else if (win.dataset.window === 'close') api.window.close();
    });

    document.getElementById('topbar')?.addEventListener('click', (event) => {
      if (event.target.closest('#topbar-search')) openPalette();
    });
    document.getElementById('sidebar')?.addEventListener('click', (event) => {
      if (event.target.closest('[data-action="retry-status"]')) runGlobalAction('retry-status');
    });

    document.addEventListener('keydown', (event) => {
      const meta = event.ctrlKey || event.metaKey;
      const tag = String(event.target?.tagName || '').toLowerCase();
      const typing = tag === 'input' || tag === 'textarea' || tag === 'select' || event.target?.isContentEditable;
      if (meta && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        if (paletteOpen) closePalette(); else openPalette();
        return;
      }
      if (meta && event.key.toLowerCase() === 'b') {
        event.preventDefault();
        runGlobalAction('toggle-sidebar');
        return;
      }
      if (meta && event.shiftKey && event.key.toLowerCase() === 'f') {
        event.preventDefault();
        closePalette();
        goto('#/academy/search');
        return;
      }
      if (event.key === 'Escape') {
        if (paletteOpen) { event.preventDefault(); closePalette(); return; }
        if (workspaceMenuOpen) { workspaceMenuOpen = false; applyChrome(); return; }
        if (U.isOverlayOpen && U.isOverlayOpen()) { event.preventDefault(); U.closeTopOverlay(); return; }
      }
      if (event.key === '/' && !typing && !paletteOpen) {
        event.preventDefault();
        const search = document.querySelector('#view .search-box input, #view .search-page-input input');
        if (search) search.focus();
        else openPalette('/');
      }
    });

    window.addEventListener('hashchange', () => {
      closePalette();
      workspaceMenuOpen = false;
      renderRoute();
    });

    let lastWheelZoom = 0;
    window.addEventListener('wheel', (event) => {
      if (!(event.ctrlKey || event.metaKey)) return;
      event.preventDefault();
      const now = Date.now();
      if (now - lastWheelZoom < 90) return;
      lastWheelZoom = now;
      runGlobalAction(event.deltaY < 0 ? 'zoom-in' : 'zoom-out');
    }, { passive: false });

    api.events.zoom(applyZoomState);

    window.addEventListener('error', (event) => {
      if (!event?.message) return;
      U.toast('Renderer error', 'error', { description: String(event.message).slice(0, 180) });
    });
    window.addEventListener('unhandledrejection', (event) => {
      const reason = event?.reason?.message || String(event?.reason || '');
      if (!reason) return;
      U.toast('Background task failed', 'error', { description: reason.slice(0, 180) });
    });

    store.subscribe(debounce(() => { applyChrome(); }, 120));
  }

  function startPolling() {
    if (statusTimer) clearInterval(statusTimer);
    statusTimer = setInterval(async () => {
      const before = store.state.status?.available;
      await store.refreshStatus();
      if (store.state.status?.available !== before) {
        applyChrome();
        if (parseHash().name === 'overview' && store.state.status?.available) renderRoute({ scroll: false });
      }
    }, 30000);
  }

  function setMaximizedState() {
    api.window.state?.().then((state) => {
      const btn = document.querySelector('[data-window="maximize"]');
      if (btn && state) {
        btn.title = state.maximized ? 'Restore' : 'Maximize';
        btn.setAttribute('aria-label', state.maximized ? 'Restore window' : 'Maximize window');
      }
    }).catch(() => {});
  }

  async function boot() {
    setupGlobalEvents();
    renderSidebar();
    renderTopbar();
    api.window.zoom('get').then(applyZoomState).catch(() => {});
    try {
      await store.boot();
    } catch (error) {
      const view = document.getElementById('view');
      if (view) {
        view.innerHTML = `<div class="page"><div class="hero">
          <div><div class="eyebrow">${icon('alert-triangle', 12)}Startup error</div><h1 class="hero-title">OpsDeck could not finish loading</h1><p class="hero-sub">${esc(error.message || 'The renderer could not read its content or progress database.')}</p><div class="hero-actions">${U.button({ label: 'Retry', icon: 'refresh', variant: 'primary', attrs: 'data-action="retry-route"' })}${U.button({ label: 'Restart', icon: 'power', variant: 'secondary', attrs: 'data-restart-app="1"' })}</div></div>
          <div class="hero-side"><div class="engine-panel"><div class="engine-status"><span class="pulse bad"></span><div><div class="engine-name">Content or database unavailable</div><div class="engine-reason">${esc(error.message || '')}</div></div></div></div></div>
        </div>${U.errorBanner('Troubleshooting', 'Check that the content folder shipped with the application and that the user data directory is writable.')}</div>`;
      }
      document.addEventListener('click', (event) => {
        if (event.target.closest('[data-restart-app]')) api.app.relaunch();
      });
      return;
    }
    applyChrome();
    if (!location.hash) location.hash = '#/overview';
    await renderRoute();
    setMaximizedState();
    startPolling();
  }

  // ------------------------------------------------------------------ exports

  window.OD = window.OD || {};
  OD.app = {
    rerender,
    goto,
    renderRoute,
    applyChrome,
    applySidebar,
    refreshChrome,
    refreshSidebar: applyChrome,
    openPalette,
    closePalette,
    boot,
  };

  document.addEventListener('DOMContentLoaded', boot);
  if (document.readyState !== 'loading') boot();
})();
