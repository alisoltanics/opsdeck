'use strict';

/**
 * Kubernetes workspace — Phase 1.
 *
 * Reads only real cluster data through the main process. Every action uses the
 * selected context explicitly; OpsDeck never rewrites ~/.kube/config or calls
 * `kubectl config use-context`.
 */
(function () {
  const { esc, timeAgo, titleCase, fmtDateTime } = OD.utils;
  const { icon } = OD.icons;
  const U = OD.ui;
  const api = window.opsdeck;
  const rerender = () => (OD.app && OD.app.rerender ? OD.app.rerender() : location.reload());

  const installState = { running: false, order: [], events: {}, done: null };
  let installInFlight = false;
  let installBound = false;

  const TOOL_LABELS = { kubectl: 'kubectl', kind: 'kind', minikube: 'Minikube', helm: 'Helm' };

  function toolLabel(name) {
    return TOOL_LABELS[name] || name;
  }

  function installStatusHtml() {
    if (!installState.running && !installState.order.length) return '';
    const rows = installState.order.map((name) => {
      const event = installState.events[name] || {};
      const failed = event.phase === 'error';
      const percent = typeof event.percent === 'number' ? Math.max(0, Math.min(100, event.percent)) : null;
      return `<div class="install-row">
        <div class="install-row-head">
          <span class="mono text-xs">${esc(toolLabel(name))}</span>
          <span class="faint text-xs${failed ? ' tone-text-red' : ''}">${esc(event.message || 'Waiting…')}</span>
        </div>
        ${percent != null ? U.progressBar(percent, failed ? 'red' : 'accent', { size: 'sm' }) : ''}
      </div>`;
    }).join('');
    if (!rows) {
      return `<div class="install-row"><div class="install-row-head"><span class="mono text-xs">Preparing</span><span class="faint text-xs">Checking which tools are missing…</span></div></div>`;
    }
    return `<div class="install-status-list">${rows}</div>`;
  }

  function paintInstallStatus() {
    for (const node of document.querySelectorAll('[data-k8s-install-status]')) {
      node.innerHTML = installStatusHtml();
      node.hidden = !node.innerHTML;
    }
  }

  function recordInstallEvent(event) {
    if (!event) return;
    if (event.phase === 'done') {
      installState.running = false;
      installState.done = event;
      return;
    }
    if (!event.tool) return;
    if (!installState.events[event.tool]) installState.order.push(event.tool);
    installState.events[event.tool] = event;
  }

  function bindInstallEvents() {
    if (installBound || !api?.events?.k8sInstall) return;
    installBound = true;
    api.events.k8sInstall((event) => {
      recordInstallEvent(event);
      paintInstallStatus();
    });
  }

  const PAGES = {
    overview: 'Cluster overview',
    contexts: 'Contexts',
    namespaces: 'Namespaces',
    nodes: 'Nodes',
    pods: 'Pods',
    deployments: 'Deployments',
    statefulsets: 'StatefulSets',
    daemonsets: 'DaemonSets',
    jobs: 'Jobs',
    cronjobs: 'CronJobs',
    services: 'Services',
    ingresses: 'Ingresses',
    networkpolicies: 'Network policies',
    persistentvolumes: 'Persistent volumes',
    persistentvolumeclaims: 'Persistent volume claims',
    storageclasses: 'Storage classes',
    configmaps: 'ConfigMaps',
    secrets: 'Secrets',
    resourcequotas: 'Resource quotas',
    limitranges: 'Limit ranges',
    serviceaccounts: 'Service accounts',
    roles: 'Roles',
    rolebindings: 'Role bindings',
    clusterroles: 'Cluster roles',
    clusterrolebindings: 'Cluster role bindings',
    helm: 'Helm releases',
    events: 'Events',
    tools: 'Local tools',
  };

  const SECTION_ICONS = {
    pods: 'box', deployments: 'layers', statefulsets: 'database', daemonsets: 'server',
    jobs: 'play', cronjobs: 'clock', services: 'network', ingresses: 'globe',
    networkpolicies: 'lock', persistentvolumes: 'database', persistentvolumeclaims: 'folder',
    storageclasses: 'layers', configmaps: 'file', secrets: 'key', resourcequotas: 'filter',
    limitranges: 'target', serviceaccounts: 'user', roles: 'shield', rolebindings: 'link',
    clusterroles: 'crown', clusterrolebindings: 'globe', helm: 'rocket', events: 'activity',
    tools: 'terminal',
  };

  function pageHead(opts) {
    return `<div class="page-head">
      <div class="page-head-left">
        <div class="eyebrow">${icon('cloud', 12)}${esc(opts.eyebrow || 'Kubernetes')}</div>
        <h1 class="page-title">${esc(opts.title)}</h1>
        ${opts.sub ? `<p class="page-sub">${esc(opts.sub)}</p>` : ''}
      </div>
      <div class="page-actions">${opts.actions || ''}</div>
    </div>`;
  }

  function copy(value) {
    if (OD?.utils?.copyText) OD.utils.copyText(value, 'Copied');
  }

  function remember(data) {
    OD.store.state.kubernetes = {
      selected: data.selected || '',
      namespace: data.namespace || 'default',
      connection: data.connection || null,
      tools: data.tools || null,
      at: Date.now(),
    };
  }

  function unavailable(message) {
    return `<div class="page">${pageHead({ title: 'Kubernetes', actions: refreshButton() })}${U.errorBanner('Kubernetes bridge unavailable', message || 'This build did not expose the Kubernetes bridge.')}</div>`;
  }

  function refreshButton() {
    return U.button({ label: 'Refresh', icon: 'refresh', size: 'sm', attrs: 'data-k8s-refresh' });
  }

  function askAiButton(section) {
    return OD.ai
      ? OD.ai.button({ kind: 'kubernetes', page: section || 'overview' }, { label: 'Ask AI', title: 'Ask AI about this Kubernetes view with live cluster context' })
      : '';
  }

  function pageActions(section, extra = '') {
    return `${extra}${askAiButton(section)}${refreshButton()}`;
  }

  function importButton(label = 'Import kubeconfig') {
    return U.button({ label, icon: 'plus', variant: 'primary', size: 'sm', attrs: 'data-k8s-import' });
  }

  function toolBadge(tool) {
    if (!tool) return U.badge('unknown', 'slate');
    return tool.installed ? U.badge(tool.version || 'installed', 'green') : U.badge('not installed', 'red');
  }

  function toolsCard(tools = {}) {
    const names = [['kubectl', 'kubectl', true], ['kind', 'kind', false], ['minikube', 'minikube', false], ['helm', 'Helm', false]];
    const missing = names.filter(([id]) => !tools[id]?.installed);
    const installing = installState.running || installInFlight;
    const showStatus = missing.length > 0 && (installState.running || installState.order.length > 0);
    const installButton = missing.length
      ? U.button({
        label: installing ? 'Installing…' : 'Install missing tools',
        icon: installing ? 'loader' : 'download',
        variant: 'primary',
        size: 'sm',
        attrs: installing ? 'data-k8s-install-tools disabled' : 'data-k8s-install-tools',
      })
      : '';
    return U.card({
      title: 'Local tools',
      icon: 'terminal',
      sub: 'Detected from PATH and OpsDeck storage · versions are read from the binaries',
      body: `<div class="stack-2" style="display:flex;flex-direction:column;gap:8px">${names.map(([id, label, required]) => {
        const tool = tools[id] || {};
        return `<div class="row gap-2" style="justify-content:space-between">
          <div class="row gap-2"><span class="mono text-xs">${esc(label)}</span>${required ? U.badge('required', 'amber') : ''}</div>
          ${toolBadge(tool)}
        </div>${tool.installed ? '' : `<div class="faint text-xs">${esc(tool.detail || `${label} is not installed.`)}</div>`}`;
      }).join('')}</div>
      <div class="install-panel" data-k8s-install-panel>
        <div class="install-panel-head">
          <div>
            <div class="text-sm"><strong>${missing.length ? `${missing.length} tool${missing.length === 1 ? '' : 's'} missing` : 'All tools installed'}</strong></div>
            <div class="faint text-xs">${missing.length
              ? 'OpsDeck installs official releases into its own storage. No sudo and no system-wide changes.'
              : 'The required binaries are ready for this workspace.'}</div>
          </div>
          ${installButton}
        </div>
        <div class="install-status" data-k8s-install-status ${showStatus ? '' : 'hidden'}>${showStatus ? installStatusHtml() : ''}</div>
      </div>`,
    });
  }

  function noKubectl(tools) {
    const tool = tools?.kubectl || {};
    return `<div class="page">
      ${pageHead({
        title: 'Kubernetes',
        sub: 'Connect a cluster with the real kubectl binary already installed on this machine.',
        actions: pageActions('overview', importButton()),
      })}
      ${U.errorBanner('kubectl is not installed', tool.detail || 'kubectl is not on PATH, so OpsDeck cannot read a cluster.', `<a class="btn btn-secondary btn-sm" data-external href="https://kubernetes.io/docs/tasks/tools/">${icon('external-link', 13)}<span>Install kubectl</span></a>`)}
      ${U.card({ title: 'Why this is required', icon: 'shield-check', body: `<div class="muted text-sm">OpsDeck does not bundle a fake cluster or a metrics placeholder. Every cluster view is produced by running kubectl with a validated argument list. Install kubectl, kind, Minikube or use a managed-cluster kubeconfig, then refresh.</div>` })}
      ${toolsCard(tools)}
    </div>`;
  }

  function noContexts(data) {
    return `<div class="page">
      ${pageHead({
        title: 'Kubernetes',
        sub: 'Import a kubeconfig or create a local cluster to start.',
        actions: pageActions('overview', importButton()),
      })}
      ${U.card({
        title: 'Connect a cluster',
        icon: 'cloud',
        body: U.empty({
          icon: 'cloud',
          title: 'No kubeconfig context found',
          body: 'OpsDeck read the paths in KUBECONFIG and ~/.kube/config. Import a kubeconfig file, or create a local cluster with kind or Minikube first.',
          action: `<div class="row gap-2">${importButton()}${U.button({ label: 'Recheck tools', icon: 'refresh', size: 'sm', attrs: 'data-k8s-refresh' })}</div>`,
        }),
      })}
      ${toolsCard(data.tools)}
    </div>`;
  }

  function allNamespacesFromHash() {
    return new URLSearchParams(String(location.hash).split('?')[1] || '').get('all') === '1';
  }

  function selectorBar(data, opts = {}) {
    if (!data.contexts?.length) return '';
    const namespaces = new Set(['default', data.namespace]);
    for (const ns of data.dashboard?.namespaces || []) namespaces.add(ns.name);
    const selected = data.selected || data.contexts[0]?.name || '';
    const namespaced = opts.namespaced !== false;
    const allNamespaces = opts.allNamespaces === true;
    const status = data.connection
      ? U.badge(data.connection.connected ? 'connected' : 'not connected', data.connection.connected ? 'green' : 'amber', { dot: true })
      : U.badge('context selected', 'green');
    return `<div class="toolbar">
      <label class="field toolbar-field"><span>Context</span><select class="input" data-k8s-context>${data.contexts.map((context) => `<option value="${esc(context.name)}" ${context.name === selected ? 'selected' : ''}>${esc(context.name)}</option>`).join('')}</select></label>
      ${namespaced
        ? `<label class="field toolbar-field"><span>Namespace</span><select class="input" data-k8s-namespace ${allNamespaces ? 'disabled' : ''}>${[...namespaces].filter(Boolean).sort().map((ns) => `<option value="${esc(ns)}" ${ns === data.namespace ? 'selected' : ''}>${esc(ns)}</option>`).join('')}</select></label>`
        : U.badge('cluster-scoped', 'slate')}
      ${status}
      <div class="toolbar-spacer"></div>
      ${namespaced && opts.toggleAll ? `<button type="button" class="btn btn-sm ${allNamespaces ? 'btn-primary' : 'btn-ghost'}" data-k8s-toggle-all title="Toggle all namespaces">${icon('layers', 12)}<span>${allNamespaces ? 'All namespaces' : 'Current namespace'}</span></button>` : ''}
      <button type="button" class="btn btn-sm btn-ghost" data-k8s-copy-context title="Copy kubectl context command">${icon('copy', 12)}<span>Copy context</span></button>
    </div>`;
  }

  function connectionCard(data) {
    const connection = data.connection || {};
    if (connection.connected) {
      return U.card({
        title: 'Cluster',
        icon: 'cloud',
        sub: 'Live connection through kubectl',
        body: `<div class="kv">
          <div class="kv-row"><dt>Context</dt><dd class="mono">${esc(connection.context || '—')}</dd></div>
          <div class="kv-row"><dt>Cluster</dt><dd class="mono">${esc(connection.cluster || '—')}</dd></div>
          <div class="kv-row"><dt>Server</dt><dd class="mono">${esc(connection.server || '—')}</dd></div>
          <div class="kv-row"><dt>Server version</dt><dd>${esc(connection.serverVersion || '—')}${connection.platform ? ` · ${esc(connection.platform)}` : ''}</dd></div>
          <div class="kv-row"><dt>Namespace</dt><dd>${esc(data.namespace || 'default')}</dd></div>
        </div>`,
      });
    }
    return U.card({
      title: 'Cluster',
      icon: 'wifi-off',
      body: U.infoBanner(
        connection.configured ? 'The cluster did not answer' : 'No context selected',
        connection.reason || 'Choose a context or check the cluster connection.',
        'warning',
        U.button({ label: 'Retry', icon: 'refresh', size: 'sm', attrs: 'data-k8s-refresh' }),
      ),
    });
  }

  function warningsCard(warnings) {
    return U.card({
      title: 'Warning events',
      icon: 'alert-triangle',
      sub: 'Latest warnings across all namespaces',
      body: warnings?.length
        ? `<div class="stack-2" style="display:flex;flex-direction:column;gap:9px">${warnings.map((warning) => `<div class="row gap-2" style="align-items:flex-start">
            <span class="icon-chip tone-orange" style="--chip-size:24px">${icon('alert-triangle', 11)}</span>
            <div style="min-width:0"><div class="text-sm"><strong>${esc(warning.reason || 'Warning')}</strong> · ${esc(warning.kind || 'Object')} ${esc(warning.object || '')}</div><div class="faint text-xs">${esc(warning.namespace || '—')} · ${esc(String(warning.count || 1))}× · ${esc(timeAgo(warning.last))}</div><div class="muted text-xs" style="margin-top:2px">${esc(warning.message || '')}</div></div>
          </div>`).join('')}</div>`
        : U.empty({ compact: true, icon: 'circle-check', title: 'No warning events', body: 'The cluster has not reported a Warning event in the current window.' }),
    });
  }

  function nodesTable(nodes, compact = false) {
    if (!nodes?.length) return U.empty({ compact: true, icon: 'server', title: 'No nodes returned', body: 'The context answered, but it did not return any node objects.' });
    const list = compact ? nodes.slice(0, 8) : nodes;
    return `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Node</th><th>Status</th><th>Roles</th><th>Version</th><th>CPU</th><th>Memory</th><th>Pods</th><th>Age</th></tr></thead>
      <tbody>${list.map((node) => `<tr>
        <td><div class="cell-main"><span class="dot-indicator ${node.ready ? 'running' : 'error'}"></span><div><div class="cell-title">${esc(node.name)}</div><div class="cell-sub mono">${esc(node.internalIP || '—')}</div></div></div></td>
        <td>${node.ready ? U.badge('Ready', 'green', { dot: true }) : U.badge(node.readyReason || 'Not ready', 'red')}</td>
        <td class="mono">${esc((node.roles || []).join(', '))}</td>
        <td class="mono">${esc(node.version || '—')}</td>
        <td class="mono">${esc(node.cpu || '—')}</td>
        <td class="mono">${esc(node.memory || '—')}</td>
        <td class="mono">${esc(node.pods || '—')}</td>
        <td class="cell-nowrap">${esc(timeAgo(node.created))}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function namespacesTable(namespaces, podsByNamespace = {}, compact = false) {
    if (!namespaces?.length) return U.empty({ compact: true, icon: 'layers', title: 'No namespaces', body: 'The context did not return a namespace list.' });
    const list = compact ? namespaces.slice(0, 10) : namespaces;
    return `<div class="table-wrap"><table class="data-table">
      <thead><tr><th>Namespace</th><th>Status</th><th>Pods</th><th>Created</th></tr></thead>
      <tbody>${list.map((ns) => `<tr>
        <td class="mono-strong">${esc(ns.name)}</td>
        <td>${U.badge(ns.status || 'Active', ns.status === 'Active' ? 'green' : 'amber')}</td>
        <td class="mono">${esc(String(podsByNamespace[ns.name] || 0))}</td>
        <td class="cell-nowrap">${esc(timeAgo(ns.created))}</td>
      </tr>`).join('')}</tbody>
    </table></div>`;
  }

  function renderCell(cell) {
    if (!cell) return '—';
    const value = cell.age ? timeAgo(cell.text) : cell.text;
    if (cell.badge) return U.badge(value || '—', cell.tone || 'slate');
    const classes = [
      cell.mono ? 'mono' : '',
      cell.strong ? 'mono-strong' : '',
      cell.age ? 'cell-nowrap' : '',
      cell.tone ? `tone-text-${cell.tone}` : '',
    ].filter(Boolean).join(' ');
    const title = value && value.length > 90 ? ` title="${esc(value)}"` : '';
    return `<span class="${classes}"${title}>${esc(value || '—')}</span>`;
  }

  function dataTable(columns, rows, opts = {}) {
    if (!columns?.length || !rows?.length) return '';
    const interactive = Boolean(opts.section);
    return `<div class="table-wrap"><table class="data-table" data-k8s-table>
      <thead><tr>${columns.map((column) => `<th>${esc(column)}</th>`).join('')}</tr></thead>
      <tbody>${rows.map((row) => {
        const attrs = interactive
          ? ` class="clickable" data-k8s-row data-k8s-section="${esc(opts.section)}" data-k8s-name="${esc(row.name)}" data-k8s-namespace="${esc(row.namespace || '')}" title="Open ${esc(row.name)}"`
          : '';
        return `<tr${attrs}>${(row.cells || []).map((cell) => `<td>${renderCell(cell)}</td>`).join('')}</tr>`;
      }).join('')}</tbody>
    </table></div>`;
  }

  function overviewBody(data) {
    const dashboard = data.dashboard;
    if (!dashboard) return connectionCard(data);
    const pods = dashboard.pods || {};
    const nodeSummary = dashboard.nodeSummary || {};
    return `<div class="stat-grid">
      ${U.statCard({ label: 'Namespaces', value: dashboard.namespaceCount ?? 0, sub: `${dashboard.namespaces?.length || 0} visible`, icon: 'layers', tone: 'violet' })}
      ${U.statCard({ label: 'Nodes ready', value: `${nodeSummary.ready || 0}/${nodeSummary.total || 0}`, sub: 'schedulable capacity', icon: 'server', tone: nodeSummary.ready === nodeSummary.total && nodeSummary.total ? 'green' : 'amber' })}
      ${U.statCard({ label: 'Pods running', value: pods.running || 0, sub: `${pods.total || 0} total · ${pods.pending || 0} pending`, icon: 'box', tone: 'accent' })}
      ${U.statCard({ label: 'Services', value: dashboard.services || 0, sub: `${dashboard.workloads?.deployments || 0} deployments`, icon: 'network', tone: 'cyan' })}
    </div>
    <div class="split-wide mt-4">
      ${U.card({
        title: 'Nodes',
        icon: 'server',
        sub: dashboard.nodesError || 'Live node objects from the cluster',
        actions: `<a class="btn btn-sm btn-ghost" href="#/kubernetes/nodes">${icon('arrow-right', 12)}<span>All nodes</span></a>`,
        body: dashboard.nodesError ? U.errorBanner('Nodes unavailable', dashboard.nodesError) : nodesTable(dashboard.nodes, true),
      })}
      ${connectionCard(data)}
    </div>
    <div class="split-2 mt-4">
      ${U.card({
        title: 'Namespaces',
        icon: 'layers',
        sub: dashboard.namespaceError || 'Pod counts come from the live pod list',
        actions: `<a class="btn btn-sm btn-ghost" href="#/kubernetes/namespaces">${icon('arrow-right', 12)}<span>All namespaces</span></a>`,
        body: dashboard.namespaceError ? U.errorBanner('Namespaces unavailable', dashboard.namespaceError) : namespacesTable(dashboard.namespaces, dashboard.podsByNamespace, true),
      })}
      ${warningsCard(dashboard.warnings)}
    </div>`;
  }

  async function loadDashboard() {
    if (!api?.kubernetes) throw new Error('The Kubernetes bridge is not available in this build.');
    const data = await api.kubernetes.dashboard();
    if (!data?.ok) throw new Error(data?.error || 'Could not read the cluster.');
    remember(data);
    return data;
  }

  async function loadBootstrap() {
    if (!api?.kubernetes) throw new Error('The Kubernetes bridge is not available in this build.');
    const data = await api.kubernetes.bootstrap();
    if (!data?.ok) throw new Error(data?.error || 'Could not read the Kubernetes configuration.');
    remember(data);
    return data;
  }

  async function renderOverview() {
    if (!api?.kubernetes) return unavailable();
    const data = await loadDashboard();
    if (!data.tools?.kubectl?.installed) return noKubectl(data.tools);
    if (!data.contexts?.length) return noContexts(data);
    return `<div class="page">
      ${pageHead({
        title: PAGES.overview,
        sub: data.connection?.connected
          ? `${data.connection.context} · ${data.connection.serverVersion || data.connection.cluster || 'connected'}`
          : 'Selected context is not answering. OpsDeck still shows the local configuration.',
        actions: pageActions('overview', importButton()),
      })}
      ${selectorBar(data)}
      ${overviewBody(data)}
      <div class="mt-4">${toolsCard(data.tools)}</div>
    </div>`;
  }

  function sourceCard(source, data) {
    const contexts = (data.contexts || []).filter((context) => context.source === source.id);
    return U.card({
      title: source.label,
      icon: source.imported ? 'file-code' : 'settings',
      sub: source.imported ? 'Imported copy in OpsDeck storage' : 'Installed by the user or KUBECONFIG',
      actions: source.imported
        ? `<button type="button" class="btn btn-sm btn-danger" data-k8s-remove="${esc(source.id)}">${icon('trash', 12)}<span>Remove copy</span></button>`
        : '',
      body: contexts.length ? `<div class="stack-2" style="display:flex;flex-direction:column;gap:8px">${contexts.map((context) => `<div class="row gap-2" style="justify-content:space-between;align-items:flex-start;border-bottom:1px solid var(--border-soft);padding-bottom:8px">
          <div style="min-width:0">
            <div class="row gap-2"><span class="mono-strong">${esc(context.name)}</span>${context.name === data.selected ? U.badge('active', 'green', { dot: true }) : ''}</div>
            <div class="faint text-xs">${esc(context.cluster || 'cluster')} · ${esc(context.namespace || 'default')} · ${esc(context.server || 'server unknown')}</div>
          </div>
          ${context.name === data.selected ? '' : `<button type="button" class="btn btn-sm btn-ghost" data-k8s-use-context="${esc(context.name)}">${icon('check', 12)}<span>Use</span></button>`}
        </div>`).join('')}</div>` : U.empty({ compact: true, icon: 'alert-triangle', title: 'No readable contexts', body: source.error || 'This kubeconfig did not expose a valid context.' }),
    });
  }

  async function renderContexts() {
    if (!api?.kubernetes) return unavailable();
    const data = await loadBootstrap();
    if (!data.tools?.kubectl?.installed) return noKubectl(data.tools);
    return `<div class="page">
      ${pageHead({
        title: PAGES.contexts,
        sub: 'OpsDeck never edits ~/.kube/config. Imported files are copied into app storage and passed with KUBECONFIG.',
        actions: pageActions('contexts', importButton()),
      })}
      ${data.sources?.length
        ? `<div class="split-2">${data.sources.map((source) => sourceCard(source, data)).join('')}</div>`
        : U.card({ body: U.empty({ icon: 'cloud', title: 'No kubeconfig sources', body: 'Import a kubeconfig or let kind/Minikube write one to ~/.kube/config.', action: importButton() }) })}
      <div class="mt-4">${toolsCard(data.tools)}</div>
    </div>`;
  }

  async function renderNamespaces() {
    if (!api?.kubernetes) return unavailable();
    const data = await loadDashboard();
    if (!data.tools?.kubectl?.installed) return noKubectl(data.tools);
    if (!data.contexts?.length) return noContexts(data);
    return `<div class="page">
      ${pageHead({ title: PAGES.namespaces, sub: 'Live namespace objects and pod counts for the selected context.', actions: pageActions('namespaces') })}
      ${selectorBar(data)}
      ${data.dashboard
        ? U.card({ title: 'Namespaces', icon: 'layers', sub: `${data.dashboard.namespaceCount || 0} namespaces`, body: data.dashboard.namespaceError ? U.errorBanner('Namespaces unavailable', data.dashboard.namespaceError) : namespacesTable(data.dashboard.namespaces, data.dashboard.podsByNamespace) })
        : connectionCard(data)}
    </div>`;
  }

  async function renderNodes() {
    if (!api?.kubernetes) return unavailable();
    const data = await loadDashboard();
    if (!data.tools?.kubectl?.installed) return noKubectl(data.tools);
    if (!data.contexts?.length) return noContexts(data);
    return `<div class="page">
      ${pageHead({ title: PAGES.nodes, sub: 'Node readiness, allocatable capacity and kubelet versions from the cluster.', actions: pageActions('nodes') })}
      ${selectorBar(data)}
      ${data.dashboard
        ? U.card({ title: 'Nodes', icon: 'server', sub: `${data.dashboard.nodeSummary?.ready || 0} of ${data.dashboard.nodeSummary?.total || 0} ready`, body: data.dashboard.nodesError ? U.errorBanner('Nodes unavailable', data.dashboard.nodesError) : nodesTable(data.dashboard.nodes) })
        : connectionCard(data)}
    </div>`;
  }

  function labelTags(map, limit = 12) {
    const entries = Object.entries(map || {});
    if (!entries.length) return '<span class="faint text-xs">None</span>';
    const shown = entries.slice(0, limit).map(([key, value]) => `<span class="badge mono">${esc(key)}=${esc(value)}</span>`).join('');
    const rest = entries.length > limit ? `<span class="badge">+${entries.length - limit} more</span>` : '';
    return `<div class="tag-row">${shown}${rest}</div>`;
  }

  function detailOverview(detail) {
    return `<div class="detail-hero">
        <span class="icon-chip tone-violet" style="--chip-size:34px">${icon(SECTION_ICONS[detail.section] || 'box', 16)}</span>
        <div style="min-width:0">
          <div class="name">${esc(detail.name)}</div>
          <div class="sub">${esc([detail.kind, detail.namespace, detail.context].filter(Boolean).join(' · '))}</div>
        </div>
      </div>
      <div class="detail-grid">
        <div class="detail-section"><h4>Object</h4>${U.kvRows([
          ['Kind', esc(detail.kind || '—'), true],
          ['Namespace', esc(detail.namespace || 'cluster-scoped'), true],
          ['Context', esc(detail.context || '—'), true],
          ['Created', esc(detail.created ? fmtDateTime(detail.created) : '—')],
        ])}</div>
        <div class="detail-section"><h4>Labels</h4>${labelTags(detail.labels)}</div>
        <div class="detail-section" style="grid-column:1/-1"><h4>Annotations</h4>${labelTags(detail.annotations)}</div>
      </div>`;
  }

  function detailAskAi(detail) {
    if (!OD.ai) return '';
    return OD.ai.button(
      { kind: 'k8s-resource', section: detail.section, name: detail.name, namespace: detail.namespace || '' },
      { label: 'Ask AI', title: 'Ask AI about this object with sanitized live context' },
    );
  }

  function detailActions(detail) {
    if (!detail.actions?.length) {
      return `<div class="row gap-2" style="width:100%">
        <span class="faint text-xs">${icon('lock', 11)} This object is read-only in OpsDeck.</span>
        <span class="toolbar-spacer"></span>
        ${detailAskAi(detail)}
      </div>`;
    }
    const buttons = detail.actions.map((action) => {
      if (action === 'scale') return U.button({ label: 'Scale', icon: 'maximize', size: 'sm', attrs: 'data-k8s-action="scale"' });
      if (action === 'restart') return U.button({ label: 'Restart rollout', icon: 'refresh', size: 'sm', attrs: 'data-k8s-action="restart"' });
      if (action === 'delete') return U.button({ label: 'Delete', icon: 'trash', size: 'sm', variant: 'danger', attrs: 'data-k8s-action="delete"' });
      return '';
    }).join('');
    return `<div class="row gap-2" style="width:100%">${buttons}<span class="toolbar-spacer"></span>${detailAskAi(detail)}</div>`;
  }

  async function runResourceAction(button, detail, close) {
    const action = button.dataset.k8sAction;
    const payload = { section: detail.section, action, name: detail.name, namespace: detail.namespace };

    if (action === 'scale') {
      const current = Number(detail.manifest?.spec?.replicas ?? 1);
      const value = await U.prompt({
        title: `Scale ${detail.name}`,
        subtitle: `${detail.kind}${detail.namespace ? ` in ${detail.namespace}` : ''}`,
        label: 'Replicas',
        value: String(Number.isFinite(current) ? current : 1),
        hint: `The current desired replica count is ${Number.isFinite(current) ? current : 1}. Use 0 to scale down completely.`,
        confirmLabel: 'Scale',
        icon: 'maximize',
      });
      if (value === null) return;
      const replicas = Number(value);
      if (!Number.isInteger(replicas) || replicas < 0 || replicas > 1000) {
        U.toast('Replicas must be a whole number between 0 and 1000', 'error');
        return;
      }
      payload.replicas = replicas;
    } else {
      const copy = action === 'restart'
        ? {
          title: `Restart ${detail.name}?`,
          message: 'OpsDeck runs a rolling restart. Pods are replaced one at a time according to the rollout strategy.',
          confirmLabel: 'Restart rollout',
          tone: 'accent',
        }
        : {
          title: `Delete ${detail.name}?`,
          message: `This sends a real delete request to the ${detail.context || 'selected'} cluster. Dependent objects may be removed by Kubernetes.`,
          confirmLabel: 'Delete object',
          tone: 'red',
        };
      const ok = await U.confirm(copy);
      if (!ok) return;
    }

    busy(button, true, 'Working…');
    try {
      const res = await api.kubernetes.resourceAction(payload);
      if (!res?.ok) {
        U.toast(`Could not ${action} ${detail.name}`, 'error', { description: res?.error || 'Try again.' });
        return;
      }
      const done = action === 'delete' ? 'deleted' : action === 'restart' ? 'restart requested' : 'scaled';
      U.toast(`${detail.kind} ${done}`, 'success', { description: res.message || '' });
      close('action');
      rerender();
    } catch (error) {
      U.toast(`Could not ${action} ${detail.name}`, 'error', { description: error.message || 'Try again.' });
    } finally {
      busy(button, false);
    }
  }

  async function openResourceDrawer(section, name, namespace) {
    if (!api?.kubernetes?.resourceDetail || !name) return;
    let detail;
    try {
      detail = await api.kubernetes.resourceDetail({ section, name, namespace });
    } catch (error) {
      U.toast('Could not open the object', 'error', { description: error.message || 'Try again.' });
      return;
    }
    if (!detail?.ok) {
      U.toast(`Could not open ${name}`, 'error', { description: detail?.error || 'Try again.' });
      return;
    }

    const bodies = {
      overview: detailOverview(detail),
      manifest: U.codeBlock({ code: JSON.stringify(detail.manifest, null, 2), lang: 'json', title: 'JSON manifest' }),
      describe: detail.describe
        ? U.codeBlock({ code: detail.describe, lang: 'text', title: 'kubectl describe' })
        : U.infoBanner('Describe output unavailable', detail.describeError || 'kubectl returned no describe output.', 'warning'),
    };

    U.drawer({
      eyebrow: detail.title || PAGES[section] || 'Kubernetes object',
      title: detail.name,
      subtitle: [detail.kind, detail.namespace, detail.context].filter(Boolean).join(' · '),
      icon: SECTION_ICONS[section] || 'box',
      tabs: U.tabs([
        { id: 'overview', label: 'Overview', icon: 'info' },
        { id: 'manifest', label: 'Manifest', icon: 'code' },
        { id: 'describe', label: 'Describe', icon: 'terminal' },
      ], 'overview', 'k8s-detail'),
      body: `<div data-k8s-detail-body>${bodies.overview}</div>`,
      footer: detailActions(detail),
      width: '720px',
      onMount: ({ root, close, body }) => {
        const tabButtons = [...root.querySelectorAll('[data-tabs="k8s-detail"] .tab')];
        for (const tab of tabButtons) {
          tab.addEventListener('click', () => {
            for (const item of tabButtons) {
              const active = item === tab;
              item.classList.toggle('active', active);
              item.setAttribute('aria-selected', active ? 'true' : 'false');
            }
            body.innerHTML = bodies[tab.dataset.tab] || bodies.overview;
          });
        }
        for (const button of root.querySelectorAll('[data-k8s-action]')) {
          button.addEventListener('click', () => runResourceAction(button, detail, close));
        }
      },
    });
  }

  async function renderResource(route, section) {
    if (!api?.kubernetes) return unavailable();
    const allNamespaces = allNamespacesFromHash();
    const data = await api.kubernetes.resources({ section, allNamespaces });
    if (!data?.ok) throw new Error(data?.error || 'Could not read the resource list.');
    if (!data.tools?.kubectl?.installed) return noKubectl(data.tools);
    if (!data.contexts?.length) return noContexts(await loadBootstrap());
    const title = PAGES[section] || data.title || titleCase(section);
    const iconName = SECTION_ICONS[section] || 'box';
    const count = data.rows?.length || 0;
    const sub = data.namespaced === false
      ? 'Cluster-scoped objects from the selected context.'
      : allNamespaces
        ? 'All namespaces in the selected context.'
        : `Namespace ${data.namespace || 'default'} in the selected context.`;
    return `<div class="page">
      ${pageHead({ title, sub, actions: pageActions(section) })}
      ${selectorBar(data, { namespaced: data.namespaced !== false, allNamespaces, toggleAll: data.namespaced !== false })}
      ${U.card({
        title,
        icon: iconName,
        sub: data.error || `${count} object${count === 1 ? '' : 's'}${data.truncated ? ` · showing first 500 of ${data.total}` : ''}`,
        body: data.error
          ? U.errorBanner(`Could not list ${title}`, data.error, refreshButton())
          : count
            ? dataTable(data.columns, data.rows, { section })
            : U.empty({ compact: true, icon: iconName, title: `No ${title.toLowerCase()}`, body: `The selected context returned no ${title.toLowerCase()} in this scope.` }),
        footer: section === 'secrets'
          ? `<span class="faint text-xs">${icon('lock', 11)} Secret values are never read into this view. Only names, types and key counts are shown.</span>`
          : '',
      })}
    </div>`;
  }

  async function renderHelm(route) {
    if (!api?.kubernetes) return unavailable();
    const allNamespaces = allNamespacesFromHash();
    const data = await api.kubernetes.helmReleases({ allNamespaces });
    if (!data?.ok) throw new Error(data?.error || 'Could not read Helm releases.');
    if (!data.tools?.kubectl?.installed) return noKubectl(data.tools);
    if (!data.contexts?.length) return noContexts(await loadBootstrap());
    const count = data.rows?.length || 0;
    return `<div class="page">
      ${pageHead({ title: PAGES.helm, sub: data.error || 'Releases reported by the real Helm binary.', actions: pageActions('helm') })}
      ${selectorBar(data, { allNamespaces, toggleAll: true })}
      ${data.error
        ? U.infoBanner('Helm is not ready', data.error, 'warning', `<a class="btn btn-primary btn-sm" href="#/kubernetes/tools">${icon('terminal', 12)}<span>Open tools</span></a>`)
        : U.card({
          title: PAGES.helm,
          icon: 'rocket',
          sub: `${count} release${count === 1 ? '' : 's'}${data.truncated ? ` · showing first 500 of ${data.total}` : ''}`,
          body: count
            ? dataTable(data.columns, data.rows)
            : U.empty({ compact: true, icon: 'rocket', title: 'No Helm releases', body: 'The selected context has no Helm releases.' }),
        })}
    </div>`;
  }

  async function renderTools() {
    if (!api?.kubernetes) return unavailable();
    const [data, status] = await Promise.all([
      api.kubernetes.tools(),
      api.kubernetes.installStatus ? api.kubernetes.installStatus() : Promise.resolve({ ok: false }),
    ]);
    const installed = status?.ok ? status.installed || {} : {};
    const rows = Object.entries(installed).map(([name, info]) => `<div class="row gap-2" style="justify-content:space-between;border-bottom:1px solid var(--border-soft);padding-bottom:7px">
      <div><span class="mono text-xs">${esc(TOOL_LABELS[name] || name)}</span><div class="faint text-xs">${esc(info.version || 'installed')} · ${esc(timeAgo(info.installedAt))}</div></div>
      <span class="badge tone-green">managed</span>
    </div>`).join('');
    return `<div class="page">
      ${pageHead({ title: PAGES.tools, sub: 'Real binaries from PATH and OpsDeck storage. No sudo and no system-wide changes.', actions: pageActions('tools') })}
      ${toolsCard(data?.tools || {})}
      ${U.card({
        title: 'Managed installs',
        icon: 'download',
        sub: status?.binDir || 'OpsDeck app storage',
        body: rows || U.empty({ compact: true, icon: 'download', title: 'No managed installs yet', body: 'Use “Install missing tools” above. Official releases are checksum-verified before they are written here.' }),
      })}
      <div class="mt-4">${U.card({
        title: 'What OpsDeck will not touch',
        icon: 'shield-check',
        body: '<div class="muted text-sm">OpsDeck never edits <span class="mono">~/.kube/config</span>, never writes to system directories and never asks for sudo. Imported kubeconfigs stay in app storage and every command uses an explicit context argument.</div>',
      })}</div>
    </div>`;
  }

  const RESOURCE_SECTIONS = ['pods', 'deployments', 'statefulsets', 'daemonsets', 'jobs', 'cronjobs', 'services', 'ingresses', 'networkpolicies', 'persistentvolumes', 'persistentvolumeclaims', 'storageclasses', 'configmaps', 'secrets', 'resourcequotas', 'limitranges', 'serviceaccounts', 'roles', 'rolebindings', 'clusterroles', 'clusterrolebindings', 'events'];

  const RENDERERS = {
    overview: renderOverview,
    contexts: renderContexts,
    namespaces: renderNamespaces,
    nodes: renderNodes,
    helm: renderHelm,
    tools: renderTools,
    ...Object.fromEntries(RESOURCE_SECTIONS.map((section) => [section, (route) => renderResource(route, section)])),
  };

  async function render(route) {
    const section = route.parts[0] || 'overview';
    const renderer = RENDERERS[section];
    if (!renderer) {
      return `<div class="page">${pageHead({ title: 'Kubernetes' })}${U.empty({ icon: 'compass', title: 'Page not found', body: `There is no Kubernetes view for “${section}”.`, action: `<a class="btn btn-primary btn-sm" href="#/kubernetes/overview">Open cluster overview</a>` })}</div>`;
    }
    return renderer(route);
  }

  function busy(button, on, label = 'Working…') {
    if (!button) return;
    if (on) {
      button.dataset.label = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner">${icon('loader', 12)}</span><span>${esc(label)}</span>`;
    } else {
      button.disabled = false;
      if (button.dataset.label) button.innerHTML = button.dataset.label;
    }
  }

  function installSummary(result) {
    const installed = (result?.installed || []).map((tool) => `${tool.label || tool.name}${tool.version ? ` ${tool.version}` : ''}`);
    return installed.length ? `Installed ${installed.join(', ')}.` : 'Everything was already installed.';
  }

  function installFailure(result) {
    const failures = (result?.failed || []).map((tool) => `${tool.label || tool.name}: ${tool.error}`);
    return (failures.join(' · ') || result?.error || 'Check your connection and retry.').slice(0, 600);
  }

  async function startInstall(button) {
    if (installInFlight || !api?.kubernetes?.installTools) return;
    installInFlight = true;
    installState.running = true;
    installState.order = [];
    installState.events = {};
    installState.done = null;
    paintInstallStatus();
    busy(button, true, 'Installing…');
    let result = null;
    try {
      result = await api.kubernetes.installTools();
      if (result?.ok) {
        U.toast('Kubernetes tools installed', 'success', { description: installSummary(result) });
      } else {
        U.toast('Some tools could not be installed', 'error', { description: installFailure(result) });
      }
    } catch (error) {
      U.toast('Could not install the Kubernetes tools', 'error', { description: error.message || 'Try again.' });
    } finally {
      installInFlight = false;
      installState.running = false;
      paintInstallStatus();
      busy(button, false);
    }
    if (result?.ok) rerender();
  }

  function mount(root) {
    root.addEventListener('click', async (event) => {
      const installBtn = event.target.closest('[data-k8s-install-tools]');
      if (installBtn) {
        await startInstall(installBtn);
        return;
      }
      const importBtn = event.target.closest('[data-k8s-import]');
      if (importBtn) {
        busy(importBtn, true);
        try {
          const res = await api.kubernetes.importKubeconfig();
          if (res?.cancelled) return;
          if (!res?.ok) {
            U.toast('Could not import the kubeconfig', 'error', { description: res?.error || 'Try again.' });
            return;
          }
          U.toast(res.alreadyImported ? 'Kubeconfig already imported' : 'Kubeconfig imported', 'success', { description: res.imported?.label || '' });
          rerender();
        } finally {
          busy(importBtn, false);
        }
        return;
      }
      if (event.target.closest('[data-k8s-refresh]')) {
        rerender();
        return;
      }
      if (event.target.closest('[data-k8s-toggle-all]')) {
        const base = String(location.hash).split('?')[0];
        location.hash = allNamespacesFromHash() ? base : `${base}?all=1`;
        return;
      }
      const use = event.target.closest('[data-k8s-use-context]');
      if (use) {
        busy(use, true);
        try {
          const res = await api.kubernetes.selectContext({ context: use.dataset.k8sUseContext });
          if (!res?.ok) {
            U.toast('Could not select the context', 'error', { description: res?.error || 'Try again.' });
            return;
          }
          U.toast('Context selected', 'success', { description: res.selected || '' });
          rerender();
        } finally {
          busy(use, false);
        }
        return;
      }
      const remove = event.target.closest('[data-k8s-remove]');
      if (remove) {
        const ok = await U.confirm({
          title: 'Remove the imported kubeconfig?',
          message: 'OpsDeck deletes only its own copy in app storage. The original file on disk is not touched.',
          confirmLabel: 'Remove copy',
          tone: 'red',
        });
        if (!ok) return;
        busy(remove, true);
        try {
          const res = await api.kubernetes.removeKubeconfig({ id: remove.dataset.k8sRemove });
          if (!res?.ok) {
            U.toast('Could not remove the kubeconfig', 'error', { description: res?.error || 'Try again.' });
            return;
          }
          U.toast('Imported kubeconfig removed', 'success');
          rerender();
        } finally {
          busy(remove, false);
        }
        return;
      }
      if (event.target.closest('[data-k8s-copy-context]')) {
        const select = root.querySelector('[data-k8s-context]');
        const context = select?.value || '';
        copy(context ? `kubectl --context ${context} get pods -A` : 'kubectl get pods -A');
        return;
      }
      const row = event.target.closest('[data-k8s-row]');
      if (row) {
        await openResourceDrawer(row.dataset.k8sSection, row.dataset.k8sName, row.dataset.k8sNamespace);
        return;
      }
    });

    root.addEventListener('change', async (event) => {
      if (event.target.matches('[data-k8s-context]')) {
        const select = event.target;
        select.disabled = true;
        try {
          const res = await api.kubernetes.selectContext({ context: select.value });
          if (!res?.ok) {
            U.toast('Could not select the context', 'error', { description: res?.error || 'Try again.' });
            select.disabled = false;
            return;
          }
          rerender();
        } catch (error) {
          U.toast('Could not select the context', 'error', { description: error.message });
          select.disabled = false;
        }
        return;
      }
      if (event.target.matches('[data-k8s-namespace]')) {
        const select = event.target;
        select.disabled = true;
        try {
          const res = await api.kubernetes.setNamespace({ namespace: select.value });
          if (!res?.ok) {
            U.toast('Could not set the namespace', 'error', { description: res?.error || 'Try again.' });
            select.disabled = false;
            return;
          }
          U.toast('Namespace selected', 'success', { description: res.namespace || '' });
          rerender();
        } catch (error) {
          U.toast('Could not set the namespace', 'error', { description: error.message });
          select.disabled = false;
        }
      }
    });
  }

  bindInstallEvents();

  OD.views = OD.views || {};
  OD.views.kubernetes = {
    render,
    mount,
    pages: PAGES,
    label(section) {
      return PAGES[section] || titleCase(section || 'overview');
    },
    status() {
      return OD.store?.state?.kubernetes || null;
    },
  };
})();
