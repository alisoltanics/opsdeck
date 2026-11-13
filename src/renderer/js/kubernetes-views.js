'use strict';

/**
 * Kubernetes workspace — Phase 1.
 *
 * Reads only real cluster data through the main process. Every action uses the
 * selected context explicitly; OpsDeck never rewrites ~/.kube/config or calls
 * `kubectl config use-context`.
 */
(function () {
  const { esc, timeAgo, titleCase } = OD.utils;
  const { icon } = OD.icons;
  const U = OD.ui;
  const api = window.opsdeck;
  const rerender = () => (OD.app && OD.app.rerender ? OD.app.rerender() : location.reload());

  const installState = { running: false, order: [], events: {}, done: null };
  let installInFlight = false;
  let installBound = false;

  const TOOL_LABELS = { kubectl: 'kubectl', kind: 'kind', minikube: 'Minikube', helm: 'Helm' };

  const TERM_THEME = {
    background: '#05080e',
    foreground: '#d7e2f0',
    cursor: '#63b3ff',
    cursorAccent: '#05080e',
    selectionBackground: 'rgba(99,179,255,.30)',
    black: '#1b2433', red: '#ff7b72', green: '#7ee2a8', yellow: '#f5c76b',
    blue: '#6cb6ff', magenta: '#d2a8ff', cyan: '#7ee7f0', white: '#d7e2f0',
    brightBlack: '#5a6b84', brightRed: '#ff9d97', brightGreen: '#9af0c0',
    brightYellow: '#ffdd92', brightBlue: '#9ccdff', brightMagenta: '#e3c2ff',
    brightCyan: '#a7f2f8', brightWhite: '#f4f8ff',
  };

  function terminalFontFamily() {
    const value = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim();
    return value || 'monospace';
  }

  function ptySupported() {
    return typeof window.Terminal === 'function' && !!window.FitAddon?.FitAddon;
  }

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
    topology: 'Cluster map',
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
    console: 'Kubectl console',
    insights: 'Intelligence',
  };

  const SECTION_ICONS = {
    topology: 'map',
    pods: 'box', deployments: 'layers', statefulsets: 'database', daemonsets: 'server',
    jobs: 'play', cronjobs: 'clock', services: 'network', ingresses: 'globe',
    networkpolicies: 'lock', persistentvolumes: 'database', persistentvolumeclaims: 'folder',
    storageclasses: 'layers', configmaps: 'file', secrets: 'key', resourcequotas: 'filter',
    limitranges: 'target', serviceaccounts: 'user', roles: 'shield', rolebindings: 'link',
    clusterroles: 'crown', clusterrolebindings: 'globe', helm: 'rocket', events: 'activity',
    tools: 'terminal', console: 'terminal',
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

  function minikubeCard(status = null) {
    const state = status || {};
    const installed = state.installed !== false && state.state !== 'missing';
    const running = state.running === true;
    const tone = running ? 'green' : installed ? 'amber' : 'slate';
    const label = running ? 'running' : state.state === 'absent' ? 'no profile' : installed ? 'stopped' : 'not installed';
    const action = running
      ? U.button({ label: 'Stop Minikube', icon: 'square', size: 'sm', variant: 'danger', attrs: 'data-minikube-action="stop"' })
      : U.button({
        label: installed ? 'Start Minikube' : 'Minikube not installed',
        icon: 'play',
        size: 'sm',
        variant: 'primary',
        attrs: installed ? 'data-minikube-action="start"' : 'data-minikube-action="start" disabled',
      });
    return U.card({
      title: 'Minikube',
      icon: 'server',
      sub: 'Start or stop the local Minikube profile without leaving OpsDeck.',
      body: `<div class="stack-2" style="display:flex;flex-direction:column;gap:9px">
        <div class="row gap-2" style="justify-content:space-between">
          <div class="row gap-2"><span class="mono text-xs">Profile ${esc(state.profile || 'minikube')}</span>${U.badge(label, tone, { dot: true })}</div>
          ${action}
        </div>
        <div class="faint text-xs">${esc(state.detail || (installed ? 'Minikube status is read from the real binary.' : 'Install Minikube from the local tools card to use it.'))}</div>
        <div class="faint text-xs">${icon('shield-check', 11)} OpsDeck runs <span class="mono">minikube start</span> or <span class="mono">minikube stop</span> only. It never rewrites kubeconfig files itself.</div>
      </div>`,
    });
  }

  async function minikubeStatusSafe() {
    if (!api?.kubernetes?.minikubeStatus) return { ok: false, installed: false, running: false, state: 'missing', detail: 'The Minikube bridge is not available.' };
    try {
      const status = await api.kubernetes.minikubeStatus();
      return status || { ok: false, installed: false, running: false, state: 'missing' };
    } catch (error) {
      return { ok: false, installed: true, running: false, state: 'unknown', detail: error.message || 'Could not read Minikube status.' };
    }
  }

  async function loadCommands(section, opts = {}) {
    if (!api?.kubernetes?.commands) return [];
    try {
      const res = await api.kubernetes.commands({ section, name: opts.name || '', namespace: opts.namespace || '', allNamespaces: opts.allNamespaces === true });
      return res?.ok && Array.isArray(res.commands) ? res.commands : [];
    } catch {
      return [];
    }
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

  function commandsCard(section, commands, opts = {}) {
    if (!commands?.length) return '';
    const rows = commands.map((item) => `<div class="k8s-cmd">
      <div class="k8s-cmd-main">
        <div class="row gap-2" style="align-items:center">
          <strong class="text-sm">${esc(item.label)}</strong>
          ${item.tone === 'write' ? U.badge('write', 'amber') : ''}
          ${item.tone === 'danger' ? U.badge('danger', 'red') : ''}
          ${item.runnable === false ? U.badge('copy only', 'slate') : ''}
        </div>
        <div class="faint text-xs">${esc(item.description || '')}</div>
        <code class="k8s-cmd-text">${esc(item.command)}</code>
      </div>
      <div class="row-actions">
        ${U.iconButton({ icon: 'copy', label: 'Copy command', attrs: `data-copy-text="${esc(item.command)}"` })}
        ${item.runnable === false ? '' : U.iconButton({ icon: 'play', label: 'Run command', attrs: `data-k8s-run-command data-command="${esc(item.command)}" data-tone="${esc(item.tone || 'read')}"` })}
      </div>
    </div>`).join('');
    const title = opts.title
      || (section === 'helm' ? 'Ready-made Helm commands' : section === 'tools' ? 'Local tool commands' : 'Ready-made kubectl commands');
    const sub = opts.sub
      || (section === 'tools'
        ? 'Commands for the real binaries on this machine. Copy-only entries run outside OpsDeck.'
        : section === 'helm'
          ? 'Commands use the selected context through --kube-context. Copy them into your own terminal.'
          : 'Generated from the selected context and namespace. Commands run without a shell and the context is enforced.');
    return U.card({
      title,
      icon: 'terminal',
      sub,
      body: `<details class="k8s-cmd-details" ${opts.open === false ? '' : 'open'}>
        <summary>${commands.length} command${commands.length === 1 ? '' : 's'}</summary>
        <div class="k8s-cmd-list">${rows}</div>
      </details>`,
    });
  }

  function commandOutputBody(result) {
    const status = result?.ok
      ? U.badge(`exit ${result.code ?? 0}`, 'green')
      : U.badge(result?.timedOut ? 'timed out' : `exit ${result?.code ?? 1}`, 'red');
    const body = [result?.stdout, result?.stderr].filter((text) => String(text || '').trim()).join('\n');
    return `<div class="stack-2">
      <div class="row gap-2" style="justify-content:space-between">
        <code class="k8s-cmd-text">${esc(result?.command || '')}</code>
        ${status}
      </div>
      ${body
        ? `<pre class="k8s-output">${esc(body)}</pre>`
        : `<div class="faint text-xs">The command produced no output.</div>`}
      <div class="faint text-xs">${icon('shield-check', 11)} Context ${esc(result?.context || 'unknown')} · namespace ${esc(result?.namespace || 'default')}</div>
    </div>`;
  }

  function consoleEntry(command, result) {
    const ok = result?.ok === true;
    const badge = ok
      ? U.badge(`exit ${result.code ?? 0}`, 'green')
      : U.badge(result?.timedOut ? 'timed out' : `exit ${result?.code ?? 1}`, 'red');
    const body = [result?.stdout, result?.stderr].filter((text) => String(text || '').trim()).join('\n');
    return `<div class="k8s-console-entry">
      <div class="k8s-console-entry-head">
        <code><span class="faint">$</span> ${esc(result?.command || command)}</code>
        <span class="row gap-2" style="align-items:center;flex:0 0 auto">
          ${badge}
          ${U.iconButton({ icon: 'maximize', size: 13, label: 'View output fullscreen', attrs: 'data-k8s-console-expand' })}
        </span>
      </div>
      ${body
        ? `<pre class="k8s-output">${esc(body)}</pre>`
        : `<div class="faint text-xs">${esc(result?.error || 'The command produced no output.')}</div>`}
    </div>`;
  }

  /**
   * Let a drawer expand to the whole window so long command output and logs
   * stay readable. Escape restores the side panel without closing the drawer.
   */
  function mountDrawerFullscreen(root) {
    const panel = root.querySelector('.overlay-panel.drawer');
    const button = root.querySelector('[data-drawer-expand]');
    if (!panel) return;
    let fullscreen = false;
    const apply = () => {
      panel.classList.toggle('drawer-fullscreen', fullscreen);
      panel.classList.toggle('output-fullscreen', fullscreen);
      if (button) {
        button.innerHTML = `${icon(fullscreen ? 'shrink' : 'maximize', 12)}<span>${fullscreen ? 'Exit fullscreen' : 'Fullscreen'}</span>`;
        button.title = fullscreen ? 'Exit fullscreen (Esc)' : 'View the output fullscreen';
        button.setAttribute('aria-pressed', fullscreen ? 'true' : 'false');
      }
    };
    button?.addEventListener('click', () => {
      fullscreen = !fullscreen;
      apply();
    });
    root.addEventListener('keydown', (event) => {
      if (event.key === 'Escape' && fullscreen) {
        event.preventDefault();
        event.stopPropagation();
        fullscreen = false;
        apply();
      }
    }, true);
  }

  function openCommandOutput(result = {}) {
    const text = [result.stdout, result.stderr].filter((value) => String(value || '').trim()).join('\n');
    U.drawer({
      eyebrow: 'kubectl',
      title: 'Command output',
      subtitle: result.ok ? 'Completed' : 'Failed',
      icon: 'terminal',
      width: '860px',
      body: commandOutputBody(result),
      footer: `<div class="row gap-2">
        ${U.button({ label: 'Fullscreen', icon: 'maximize', size: 'sm', attrs: 'data-drawer-expand', title: 'View the output fullscreen' })}
        ${U.button({ label: 'Copy output', icon: 'copy', size: 'sm', attrs: `data-copy-text="${esc(text)}"` })}
        ${U.button({ label: 'Close', variant: 'ghost', size: 'sm', attrs: 'data-close' })}
      </div>`,
      onMount: ({ root }) => mountDrawerFullscreen(root),
    });
  }

  async function runCommandFromUi(button, command, tone = 'read') {
    const dangerous = tone === 'write' || tone === 'danger' || /^\s*kubectl\s+(delete|apply|create|replace|patch|scale|edit|drain|cordon|uncordon|taint|run|expose|exec|label|annotate|set)\b/i.test(command) || /\brollout\s+(restart|undo)\b/i.test(command);
    if (dangerous) {
      const ok = await U.confirm({
        title: 'Run a changing command?',
        message: `This command can change the cluster:\n\n${command}`,
        confirmLabel: 'Run command',
        tone: 'red',
        icon: 'alert-triangle',
      });
      if (!ok) return;
    }
    busy(button, true, 'Running…');
    try {
      const result = await api.kubernetes.runCommand({ command });
      openCommandOutput(result);
      if (result?.ok) U.toast('Command finished', 'success', { description: result.command });
      else U.toast('Command failed', 'error', { description: result?.stderr || result?.error || 'Check the output.' });
    } catch (error) {
      U.toast('Could not run the command', 'error', { description: error.message || 'Try again.' });
    } finally {
      busy(button, false);
    }
  }

  function tableActions(section, row) {
    const ai = OD.ai
      ? OD.ai.iconButton({ kind: 'k8s-resource', section, name: row.name, namespace: row.namespace || '' }, { size: 13, label: 'Ask AI about this object' })
      : '';
    const open = U.iconButton({ icon: 'info', label: 'Open details and commands', attrs: `data-k8s-row-open="${esc(row.name)}" data-k8s-row-section="${esc(section)}" data-k8s-row-namespace="${esc(row.namespace || '')}"` });
    const nameCopy = U.iconButton({ icon: 'copy', label: 'Copy name', attrs: `data-copy-text="${esc(row.name)}"` });
    if (section === 'pods') {
      return `<div class="row-actions">${ai}
        ${U.iconButton({ icon: 'file', label: 'Logs', attrs: `data-k8s-row-logs="${esc(row.name)}" data-k8s-row-namespace="${esc(row.namespace || '')}"` })}
        ${U.iconButton({ icon: 'terminal', label: 'Shell', attrs: `data-k8s-row-shell="${esc(row.name)}" data-k8s-row-namespace="${esc(row.namespace || '')}"` })}
        ${nameCopy}
        ${open}
      </div>`;
    }
    return `<div class="row-actions">${ai}${nameCopy}${open}</div>`;
  }

  function dataTable(columns, rows, opts = {}) {
    if (!columns?.length || !rows?.length) return '';
    const interactive = Boolean(opts.section);
    return `<div class="table-wrap"><table class="data-table" data-k8s-table>
      <thead><tr>${columns.map((column) => `<th>${esc(column)}</th>`).join('')}${interactive ? '<th>Actions</th>' : ''}</tr></thead>
      <tbody>${rows.map((row) => {
        const attrs = interactive
          ? ` class="clickable" data-k8s-row data-k8s-section="${esc(opts.section)}" data-k8s-name="${esc(row.name)}" data-k8s-namespace="${esc(row.namespace || '')}" title="Open ${esc(row.name)}"`
          : '';
        return `<tr${attrs}>${(row.cells || []).map((cell) => `<td>${renderCell(cell)}</td>`).join('')}${interactive ? `<td>${tableActions(opts.section, row)}</td>` : ''}</tr>`;
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
    const [commands, minikube] = await Promise.all([loadCommands('overview'), minikubeStatusSafe()]);
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
      <div class="mt-4">${commandsCard('overview', commands)}</div>
      <div class="split-2 mt-4">${toolsCard(data.tools)}${minikubeCard(minikube)}</div>
    </div>`;
  }

  async function renderTopology() {
    if (!api?.kubernetes?.topology) return unavailable('This build does not expose the cluster map bridge.');
    const data = await api.kubernetes.topology();
    if (!data?.ok) throw new Error(data?.error || 'Could not read the cluster topology.');
    remember(data);
    if (!data.tools?.kubectl?.installed) return noKubectl(data.tools);
    if (!data.contexts?.length) return noContexts(await loadBootstrap());
    if (!OD.kubernetesTopology) {
      return `<div class="page">${pageHead({ title: PAGES.topology })}${U.errorBanner('Cluster map unavailable', 'The topology renderer did not load. Check the script order in index.html.')}</div>`;
    }
    const commands = data.commands?.length ? data.commands : await loadCommands('topology');
    const connection = data.connection || {};
    const sub = connection.connected
      ? `${connection.context || data.selected} · all namespaces · ${connection.serverVersion || connection.cluster || 'live cluster'}`
      : 'The selected context is not answering. The map will show an empty cluster until it reconnects.';
    return `<div class="page topo-page">
      ${pageHead({
        title: PAGES.topology,
        sub,
        actions: pageActions('topology'),
      })}
      ${selectorBar(data, { namespaced: false })}
      ${OD.kubernetesTopology.body(data.model || {})}
      <div class="mt-4">${commandsCard('topology', commands)}</div>
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
    const [data, commands] = await Promise.all([loadBootstrap(), loadCommands('contexts')]);
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
      <div class="mt-4">${commandsCard('contexts', commands)}</div>
      <div class="mt-4">${toolsCard(data.tools)}</div>
    </div>`;
  }

  function labelTags(map, limit = 12) {
    const entries = Object.entries(map || {});
    if (!entries.length) return '<span class="faint text-xs">None</span>';
    const shown = entries.slice(0, limit).map(([key, value]) => `<span class="badge mono">${esc(key)}=${esc(value)}</span>`).join('');
    const rest = entries.length > limit ? `<span class="badge">+${entries.length - limit} more</span>` : '';
    return `<div class="tag-row">${shown}${rest}</div>`;
  }

  function detailSummary(detail) {
    const cards = (detail.summary || []).map((section) => {
      if (section.text) {
        return `<div class="detail-section"><h4>${esc(section.title)}</h4><pre class="k8s-summary-text">${esc(section.text)}</pre></div>`;
      }
      if (section.list) {
        return `<div class="detail-section"><h4>${esc(section.title)}</h4><ul class="k8s-summary-list">${section.list.map((item) => `<li class="mono">${esc(item)}</li>`).join('')}</ul></div>`;
      }
      const rows = (section.rows || []).map(([label, value]) => [label, esc(value), true]);
      return `<div class="detail-section"><h4>${esc(section.title)}</h4>${rows.length ? U.kvRows(rows) : '<span class="faint text-xs">No values</span>'}</div>`;
    }).join('');
    return `<div class="detail-grid">
        ${cards || `<div class="detail-section"><h4>Summary</h4><span class="faint text-xs">kubectl returned no summary values for this object.</span></div>`}
        <div class="detail-section"><h4>Labels</h4>${labelTags(detail.labels)}</div>
        <div class="detail-section" style="grid-column:1/-1"><h4>Annotations</h4>${labelTags(detail.annotations)}</div>
      </div>`;
  }

  const EVENT_COLUMNS = ['Type', 'Reason', 'Object', 'Namespace', 'Count', 'Message', 'Last seen'];

  function eventsBody(rows, error) {
    if (error) return U.infoBanner('Events unavailable', error, 'warning');
    if (!rows?.length) {
      return U.empty({ compact: true, icon: 'activity', title: 'No events for this object', body: 'Kubernetes keeps events for a limited time. Nothing is attached to this object right now.' });
    }
    return `<div class="muted text-xs" style="margin-bottom:8px">${rows.length} event${rows.length === 1 ? '' : 's'} involving this object, newest first.</div>${dataTable(EVENT_COLUMNS, rows)}`;
  }

  function logsBody(logs) {
    if (!logs) return U.loader({ label: 'Reading logs…' });
    if (!logs.ok) return U.infoBanner('Logs unavailable', logs.error || 'Could not read pod logs.', 'warning');
    const text = String(logs.stdout || '').trim();
    return `<div class="row gap-2" style="justify-content:space-between;margin-bottom:8px">
        <span class="faint text-xs">${icon('file', 11)} ${esc(logs.container || 'all containers')} · last ${esc(String(logs.lines || 200))} lines${logs.previous ? ' · previous instance' : ''}</span>
        ${U.button({ label: 'Copy logs', icon: 'copy', size: 'sm', attrs: `data-copy-text="${esc(text)}"` })}
      </div>${text
        ? `<pre class="k8s-output k8s-logs">${esc(text)}</pre>`
        : U.empty({ compact: true, icon: 'file', title: 'No log output', body: 'The container has not written to stdout or stderr.' })}`;
  }

  function detailAskAi(detail) {
    if (!OD.ai) return '';
    return OD.ai.button(
      { kind: 'k8s-resource', section: detail.section, name: detail.name, namespace: detail.namespace || '' },
      { label: 'Ask AI', title: 'Ask AI about this object with sanitized live context' },
    );
  }

  function commandListBody(commands) {
    if (!commands?.length) return U.empty({ compact: true, icon: 'terminal', title: 'No commands for this object', body: 'OpsDeck did not generate commands for this resource type.' });
    return `<div class="k8s-cmd-list">${commands.map((item) => `<div class="k8s-cmd">
        <div class="k8s-cmd-main">
          <div class="row gap-2" style="align-items:center">
            <strong class="text-sm">${esc(item.label)}</strong>
            ${item.tone === 'write' ? U.badge('writes', 'amber') : ''}
            ${item.tone === 'danger' ? U.badge('danger', 'red') : ''}
          </div>
          <div class="faint text-xs">${esc(item.description || '')}</div>
          <code class="k8s-cmd-text">${esc(item.command)}</code>
        </div>
        <div class="row-actions">
          ${U.iconButton({ icon: 'copy', label: 'Copy command', attrs: `data-copy-text="${esc(item.command)}"` })}
          ${U.iconButton({ icon: 'play', label: 'Run command', attrs: `data-k8s-run-command data-command="${esc(item.command)}" data-tone="${esc(item.tone || 'read')}"` })}
        </div>
      </div>`).join('')}</div>
      <div class="faint text-xs" style="margin-top:8px">${icon('shield-check', 11)} Commands run with the selected context and never through a host shell.</div>`;
  }

  function detailActions(detail) {
    const shell = detail.section === 'pods'
      ? U.button({ label: 'Open shell', icon: 'terminal', size: 'sm', attrs: 'data-k8s-action-shell' })
      : '';
    if (!detail.actions?.length) {
      return `<div class="row gap-2" style="width:100%">
        ${shell}
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
    return `<div class="row gap-2" style="width:100%">${shell}${buttons}<span class="toolbar-spacer"></span>${detailAskAi(detail)}</div>`;
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

  async function openPodLogs(name, namespace) {
    let logs = null;
    try {
      logs = await api.kubernetes.podLogs({ name, namespace, tailLines: 300 });
    } catch (error) {
      logs = { ok: false, error: error.message || 'Could not read pod logs.' };
    }
    let previous = false;
    U.drawer({
      eyebrow: 'Pod logs',
      title: name,
      subtitle: `${namespace || 'default'} · last 300 lines`,
      icon: 'file',
      width: '900px',
      body: `<div data-k8s-logs-body>${logsBody(logs)}</div>`,
      footer: `<div class="row gap-2" style="width:100%">
        ${OD.ai ? OD.ai.button({ kind: 'k8s-resource', section: 'pods', name, namespace }, { label: 'Ask AI', size: 'sm' }) : ''}
        <span class="toolbar-spacer"></span>
        ${U.button({ label: 'Fullscreen', icon: 'maximize', size: 'sm', attrs: 'data-drawer-expand', title: 'View the logs fullscreen' })}
        ${U.button({ label: 'Open shell', icon: 'terminal', size: 'sm', attrs: 'data-k8s-logs-shell' })}
        ${U.button({ label: 'Previous instance', icon: 'history', size: 'sm', attrs: 'data-k8s-logs-previous' })}
        ${U.button({ label: 'Close', variant: 'ghost', size: 'sm', attrs: 'data-close' })}
      </div>`,
      onMount: ({ root, close, body }) => {
        mountDrawerFullscreen(root);
        root.querySelector('[data-k8s-logs-shell]')?.addEventListener('click', () => {
          close('shell');
          showPodShell({ name, namespace });
        });
        const previousBtn = root.querySelector('[data-k8s-logs-previous]');
        previousBtn?.addEventListener('click', async () => {
          previous = !previous;
          busy(previousBtn, true, 'Reading…');
          body.innerHTML = U.loader(previous ? 'Reading logs from the previous container instance…' : 'Reading logs…');
          try {
            const next = await api.kubernetes.podLogs({ name, namespace, tailLines: 300, previous });
            body.innerHTML = logsBody(next);
          } catch (error) {
            body.innerHTML = logsBody({ ok: false, error: error.message });
          } finally {
            busy(previousBtn, false);
          }
        });
      },
    });
  }

  /**
   * Real pod shell: util-linux `script` allocates a host PTY so kubectl exec
   * gives the renderer a genuine interactive terminal. The selected context
   * and namespace are validated again in the main process.
   */
  function showPodShell(pod) {
    if (!ptySupported()) {
      U.toast('Interactive terminal unavailable', 'error', { description: 'This build does not include the terminal renderer.' });
      return;
    }
    const context = pod.context || OD.store?.state?.kubernetes?.selected || '';
    const namespace = pod.namespace || OD.store?.state?.kubernetes?.namespace || 'default';
    if (!context) {
      U.toast('Choose a context first', 'error', { description: 'Select a Kubernetes context before opening a pod shell.' });
      return;
    }
    U.drawer({
      title: pod.name,
      subtitle: `${namespace} · interactive pod shell`,
      eyebrow: 'Pod shell',
      icon: 'terminal',
      width: '960px',
      body: `<div class="terminal-shell terminal-drawer exec-pty" id="k8s-exec-shell">
        <div class="term-head">
          <div class="term-lights"><i></i><i></i><i></i></div>
          <span class="term-title" id="k8s-exec-title">${esc(pod.name)} · starting shell</span>
          <span class="term-status" id="k8s-exec-state">connecting</span>
          <button type="button" class="term-btn" data-exec-copy title="Copy selection (Ctrl+Shift+C)" aria-label="Copy selection">${icon('copy', 12)}</button>
          <button type="button" class="term-btn" data-exec-expand title="Fullscreen terminal" aria-label="Toggle fullscreen terminal">${icon('maximize', 12)}</button>
        </div>
        <div class="xterm-host" id="k8s-exec-host"></div>
        <div class="term-hint">Tab completes paths and commands inside the pod · Ctrl+Shift+C / Ctrl+Shift+V copy and paste · Esc leaves fullscreen</div>
      </div>`,
      footer: `<span class="faint text-xs mono">kubectl exec -it ${esc(pod.name)} -n ${esc(namespace)} --context ${esc(context)} -- sh</span><div class="row gap-2">${OD.ai ? OD.ai.button({ kind: 'k8s-resource', section: 'pods', name: pod.name, namespace }, { label: 'Ask AI', size: 'sm' }) : ''}${U.button({ label: 'Close', variant: 'ghost', size: 'sm', attrs: 'data-close' })}</div>`,
      onMount: ({ root, onClose }) => {
        const panel = root.querySelector('.overlay-panel.drawer');
        const shell = root.querySelector('#k8s-exec-shell');
        const host = root.querySelector('#k8s-exec-host');
        const titleEl = root.querySelector('#k8s-exec-title');
        const stateEl = root.querySelector('#k8s-exec-state');
        const expandBtn = root.querySelector('[data-exec-expand]');
        const copyBtn = root.querySelector('[data-exec-copy]');
        panel?.classList.add('exec-drawer');

        const term = new window.Terminal({
          cursorBlink: true,
          cursorStyle: 'bar',
          fontFamily: terminalFontFamily(),
          fontSize: 12.5,
          lineHeight: 1.28,
          letterSpacing: 0,
          scrollback: 8000,
          theme: TERM_THEME,
          allowTransparency: true,
          macOptionIsMeta: true,
        });
        const fit = new window.FitAddon.FitAddon();
        term.loadAddon(fit);
        term.open(host);

        const refit = () => {
          try { fit.fit(); } catch { /* host is not laid out yet */ }
        };
        requestAnimationFrame(() => { refit(); term.focus(); });
        const observer = new ResizeObserver(() => refit());
        observer.observe(host);

        let sessionId = null;
        let ended = false;
        let closed = false;
        let fullscreen = false;
        const pending = [];

        const write = (text) => { if (text) term.write(text); };
        const handleExit = (payload) => {
          if (ended) return;
          ended = true;
          stateEl.textContent = payload?.code === 0 ? 'exited' : 'ended';
          const code = payload?.code == null ? '' : ` (exit ${payload.code})`;
          write(`\r\n\x1b[38;5;243m— session ended${code} —\x1b[0m\r\n`);
        };
        const sendInput = (data) => {
          if (!sessionId || ended || !data) return;
          api.kubernetes.shellInput({ sessionId, data }).then((res) => {
            if (!res?.ok && !ended) {
              ended = true;
              stateEl.textContent = 'ended';
              write(`\r\n\x1b[31m${res?.error || 'The session has ended.'}\x1b[0m\r\n`);
            }
          }).catch(() => {});
        };
        shell._type = sendInput;
        shell._text = () => {
          const buffer = term.buffer.active;
          const lines = [];
          for (let index = 0; index < buffer.length; index += 1) {
            const line = buffer.getLine(index);
            if (line) lines.push(line.translateToString(true));
          }
          return lines.join('\n').trimEnd();
        };
        term.onData(sendInput);

        term.attachCustomKeyEventHandler((event) => {
          if (event.type !== 'keydown') return true;
          const meta = event.ctrlKey || event.metaKey;
          const key = String(event.key || '').toLowerCase();
          if (meta && event.shiftKey && key === 'c') {
            const selection = term.getSelection();
            if (selection) api.app.copy(selection);
            return false;
          }
          if (meta && event.shiftKey && key === 'v') {
            api.app.readClipboard()
              .then((text) => { if (typeof text === 'string' && text) term.paste(text); })
              .catch(() => {});
            return false;
          }
          return true;
        });

        const setFullscreen = (value) => {
          fullscreen = value === true;
          panel?.classList.toggle('drawer-fullscreen', fullscreen);
          document.body.classList.toggle('exec-fullscreen', fullscreen);
          if (expandBtn) {
            expandBtn.innerHTML = icon(fullscreen ? 'shrink' : 'maximize', 12);
            expandBtn.title = fullscreen ? 'Exit fullscreen terminal' : 'Fullscreen terminal';
            expandBtn.setAttribute('aria-label', expandBtn.title);
          }
          requestAnimationFrame(() => { refit(); term.focus(); });
          setTimeout(() => { if (!closed) { refit(); term.focus(); } }, 230);
        };
        expandBtn?.addEventListener('click', () => setFullscreen(!fullscreen));
        root.addEventListener('keydown', (event) => {
          if (event.key === 'Escape' && fullscreen) {
            event.preventDefault();
            event.stopPropagation();
            setFullscreen(false);
          }
        }, true);

        copyBtn?.addEventListener('click', async () => {
          const selection = term.getSelection();
          if (!selection) {
            U.toast('Nothing selected', 'info', { description: 'Drag across text in the terminal first.' });
            return;
          }
          await api.app.copy(selection);
          U.toast('Copied selection', 'success', { description: `${selection.length} characters` });
        });

        const unsubscribeData = api.events.k8sExecData((payload) => {
          if (!payload) return;
          if (!sessionId) { pending.push({ type: 'data', payload }); return; }
          if (payload.sessionId === sessionId) write(payload.data);
        });
        const unsubscribeExit = api.events.k8sExecExit((payload) => {
          if (!payload) return;
          if (!sessionId) { pending.push({ type: 'exit', payload }); return; }
          if (payload.sessionId === sessionId) handleExit(payload);
        });

        onClose(() => {
          closed = true;
          observer.disconnect();
          unsubscribeData();
          unsubscribeExit();
          document.body.classList.remove('exec-fullscreen');
          if (sessionId && !ended) api.kubernetes.shellStop({ sessionId });
          setTimeout(() => { try { term.dispose(); } catch { /* already gone */ } }, 220);
        });

        (async () => {
          const res = await api.kubernetes.shellStart({
            context,
            namespace,
            name: pod.name,
            container: pod.container || '',
            pty: true,
            cols: term.cols,
            rows: term.rows,
          });
          if (closed) {
            if (res?.ok) api.kubernetes.shellStop({ sessionId: res.sessionId });
            return;
          }
          if (!res?.ok) {
            ended = true;
            stateEl.textContent = 'unavailable';
            write(`\x1b[31m${res?.error || 'Could not open a shell in this pod.'}\x1b[0m\r\n`);
            return;
          }
          sessionId = res.sessionId;
          shell.dataset.execSession = sessionId;
          shell.dataset.execMode = res.mode || 'pipe';
          titleEl.textContent = `${pod.name} · ${res.shellLabel || res.shell}`;
          stateEl.textContent = 'connected';
          for (const entry of pending.splice(0)) {
            if (entry.type === 'data') write(entry.payload.data);
            else handleExit(entry.payload);
          }
          if (!ended) {
            refit();
            term.focus();
          }
        })();
      },
    });
  }

  async function runMinikubeAction(button, action) {
    const verb = action === 'stop' ? 'Stop' : 'Start';
    const ok = await U.confirm({
      title: `${verb} Minikube?`,
      message: action === 'stop'
        ? 'OpsDeck runs minikube stop. Workloads on the Minikube profile are stopped; the cluster configuration stays on disk.'
        : 'OpsDeck runs minikube start. This can take a minute while the profile boots and writes its kubeconfig entry.',
      confirmLabel: `${verb} Minikube`,
      tone: action === 'stop' ? 'red' : 'accent',
      icon: action === 'stop' ? 'square' : 'play',
    });
    if (!ok) return;
    busy(button, true, action === 'stop' ? 'Stopping…' : 'Starting…');
    try {
      const res = await api.kubernetes.minikubeAction({ action });
      if (!res?.ok) {
        U.toast(`Could not ${action} Minikube`, 'error', { description: res?.error || 'Check the output and try again.' });
        return;
      }
      U.toast(`Minikube ${action === 'stop' ? 'stopped' : 'started'}`, 'success', { description: res.message || res.status?.detail || '' });
      rerender();
    } catch (error) {
      U.toast(`Could not ${action} Minikube`, 'error', { description: error.message || 'Try again.' });
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
      overview: detailSummary(detail),
      events: eventsBody(detail.events, detail.eventsError),
      commands: commandListBody(detail.commands),
      manifest: U.codeBlock({ code: JSON.stringify(detail.manifest, null, 2), lang: 'json', title: 'JSON manifest' }),
      describe: detail.describe
        ? U.codeBlock({ code: detail.describe, lang: 'text', title: 'kubectl describe' })
        : U.infoBanner('Describe output unavailable', detail.describeError || 'kubectl returned no describe output.', 'warning'),
    };
    const isPod = section === 'pods';
    const tabs = [
      { id: 'overview', label: 'Summary', icon: 'info' },
      { id: 'events', label: 'Events', icon: 'activity', count: detail.events?.length || 0 },
      ...(isPod ? [{ id: 'logs', label: 'Logs', icon: 'file' }] : []),
      { id: 'commands', label: 'Commands', icon: 'terminal', count: detail.commands?.length || 0 },
      { id: 'manifest', label: 'Manifest', icon: 'code' },
      { id: 'describe', label: 'Describe', icon: 'list' },
    ];

    U.drawer({
      eyebrow: detail.title || PAGES[section] || 'Kubernetes object',
      title: detail.name,
      subtitle: [detail.kind, detail.namespace, detail.context].filter(Boolean).join(' · '),
      icon: SECTION_ICONS[section] || 'box',
      tabs: U.tabs(tabs, 'overview', 'k8s-detail'),
      body: `<div data-k8s-detail-body>${bodies.overview}</div>`,
      footer: detailActions(detail),
      width: '820px',
      onMount: ({ root, close, body }) => {
        let active = 'overview';
        let logsPromise = null;
        const show = (id) => {
          active = id;
          if (id === 'logs' && !bodies.logs) {
            body.innerHTML = U.loader('Reading pod logs…');
            if (!logsPromise) {
              logsPromise = api.kubernetes.podLogs({ name: detail.name, namespace: detail.namespace || '', tailLines: 300 })
                .catch((error) => ({ ok: false, error: error.message || 'Could not read pod logs.' }))
                .then((logs) => {
                  bodies.logs = logsBody(logs);
                  return bodies.logs;
                });
            }
            logsPromise.then((html) => { if (active === 'logs') body.innerHTML = html; });
            return;
          }
          body.innerHTML = bodies[id] || bodies.overview;
        };
        const tabButtons = [...root.querySelectorAll('[data-tabs="k8s-detail"] .tab')];
        for (const tab of tabButtons) {
          tab.addEventListener('click', () => {
            for (const item of tabButtons) {
              const on = item === tab;
              item.classList.toggle('active', on);
              item.setAttribute('aria-selected', on ? 'true' : 'false');
            }
            show(tab.dataset.tab);
          });
        }
        for (const button of root.querySelectorAll('[data-k8s-action]')) {
          button.addEventListener('click', () => runResourceAction(button, detail, close));
        }
        root.addEventListener('click', async (event) => {
          const runBtn = event.target.closest('[data-k8s-run-command]');
          if (!runBtn) return;
          await runCommandFromUi(runBtn, runBtn.dataset.command || '', runBtn.dataset.tone || 'read');
        });
        root.querySelector('[data-k8s-action-shell]')?.addEventListener('click', () => {
          close('shell');
          showPodShell({ name: detail.name, namespace: detail.namespace || '', containers: detail.containers || [] });
        });
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
      <div class="mt-4">${commandsCard(section, data.commands, { allNamespaces })}</div>
    </div>`;
  }

  async function renderHelm(route) {
    if (!api?.kubernetes) return unavailable();
    const allNamespaces = allNamespacesFromHash();
    const [data, commands] = await Promise.all([
      api.kubernetes.helmReleases({ allNamespaces }),
      loadCommands('helm', { allNamespaces }),
    ]);
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
      <div class="mt-4">${commandsCard('helm', commands)}</div>
    </div>`;
  }

  async function renderTools() {
    if (!api?.kubernetes) return unavailable();
    const [data, status, minikube, commands] = await Promise.all([
      api.kubernetes.tools(),
      api.kubernetes.installStatus ? api.kubernetes.installStatus() : Promise.resolve({ ok: false }),
      minikubeStatusSafe(),
      loadCommands('tools'),
    ]);
    const installed = status?.ok ? status.installed || {} : {};
    const rows = Object.entries(installed).map(([name, info]) => `<div class="row gap-2" style="justify-content:space-between;border-bottom:1px solid var(--border-soft);padding-bottom:7px">
      <div><span class="mono text-xs">${esc(TOOL_LABELS[name] || name)}</span><div class="faint text-xs">${esc(info.version || 'installed')} · ${esc(timeAgo(info.installedAt))}</div></div>
      <span class="badge tone-green">managed</span>
    </div>`).join('');
    return `<div class="page">
      ${pageHead({ title: PAGES.tools, sub: 'Real binaries from PATH and OpsDeck storage. No sudo and no system-wide changes.', actions: pageActions('tools') })}
      ${toolsCard(data?.tools || {})}
      <div class="mt-4">${minikubeCard(minikube)}</div>
      ${U.card({
        title: 'Managed installs',
        icon: 'download',
        sub: status?.binDir || 'OpsDeck app storage',
        body: rows || U.empty({ compact: true, icon: 'download', title: 'No managed installs yet', body: 'Use “Install missing tools” above. Official releases are checksum-verified before they are written here.' }),
      })}
      <div class="mt-4">${commandsCard('tools', commands)}</div>
      <div class="mt-4">${U.card({
        title: 'What OpsDeck will not touch',
        icon: 'shield-check',
        body: '<div class="muted text-sm">OpsDeck never edits <span class="mono">~/.kube/config</span>, never writes to system directories and never asks for sudo. Imported kubeconfigs stay in app storage and every command uses an explicit context argument.</div>',
      })}</div>
    </div>`;
  }

  // ---------------------------------------------------------------- console
  // The session lives at module level so a context switch or refresh re-render
  // never throws away the scrollback.
  const CS = { entries: [], history: [], filter: '', seq: 0, collapsed: new Set() };
  try { CS.history = JSON.parse(localStorage.getItem('opsdeck:k8s-console-history') || '[]').slice(-200); } catch { CS.history = []; }

  const KUBECTL_VERBS = ['get', 'describe', 'logs', 'top', 'explain', 'api-resources', 'api-versions', 'version', 'cluster-info', 'config', 'auth', 'events', 'diff', 'rollout', 'apply', 'create', 'delete', 'scale', 'label', 'annotate', 'patch', 'set', 'cordon', 'uncordon', 'drain', 'taint', 'exec', 'cp', 'run', 'expose', 'autoscale'];
  const KUBECTL_RESOURCES = ['pods', 'deployments', 'statefulsets', 'daemonsets', 'replicasets', 'jobs', 'cronjobs', 'services', 'ingresses', 'networkpolicies', 'nodes', 'namespaces', 'configmaps', 'secrets', 'persistentvolumes', 'persistentvolumeclaims', 'storageclasses', 'serviceaccounts', 'roles', 'rolebindings', 'clusterroles', 'clusterrolebindings', 'events', 'endpoints', 'hpa', 'resourcequotas', 'limitranges'];
  const KUBECTL_FLAGS = ['-o wide', '-o yaml', '-o json', '-o name', '--all-namespaces', '-n ', '-l ', '--selector=', '--sort-by=', '--show-labels', '--field-selector=', '--previous', '--tail=100', '--since=1h', '--dry-run=client', '--watch-only'];
  const MUTATING = /^(kubectl\s+)?(apply|annotate|autoscale|cordon|cp|create|debug|delete|drain|exec|expose|label|patch|replace|run|scale|set|taint|uncordon|rollout\s+(restart|undo|pause|resume))\b/i;

  const BODY_MAX = 60000;
  const fmtMs = (ms) => (ms < 1000 ? `${ms} ms` : `${(ms / 1000).toFixed(1)} s`);
  const stamp = (t) => new Date(t).toLocaleTimeString([], { hour12: false });

  function highlightOutput(text) {
    const lines = String(text).split('\n');
    return lines.map((line, i) => {
      const safe = esc(line);
      if (i === 0 && /^(NAME|NAMESPACE|NODE|CONTEXT|LAST SEEN|TYPE|REVISION)\b/.test(line)) return `<span class="k8s-th">${safe}</span>`;
      return safe
        .replace(/\b(Running|Ready|Active|Bound|Available|Completed|Succeeded|True)\b/g, '<span class="k8s-ok">$1</span>')
        .replace(/\b(Pending|ContainerCreating|Terminating|Unknown|Warning|Init:\d+\/\d+|PodInitializing)\b/g, '<span class="k8s-warn">$1</span>')
        .replace(/\b(Error|CrashLoopBackOff|ImagePullBackOff|ErrImagePull|Failed|Evicted|OOMKilled|NotReady|False|Forbidden|BackOff)\b/g, '<span class="k8s-bad">$1</span>');
    }).join('\n');
  }

  function consoleEntryHtml(entry) {
    const ok = entry.result?.ok === true;
    const res = entry.result || {};
    const body = [res.stdout, res.stderr].filter((t) => String(t || '').trim()).join('\n');
    const lines = body ? body.split('\n').length : 0;
    const shown = body.length > BODY_MAX ? `${body.slice(0, BODY_MAX)}\n… output truncated in view (${body.length - BODY_MAX} more characters). Use Copy for the full text.` : body;
    const collapsed = CS.collapsed.has(entry.id);
    const status = entry.pending ? U.badge('running', 'blue') : ok ? U.badge(`exit ${res.code ?? 0}`, 'green') : U.badge(res.timedOut ? 'timed out' : `exit ${res.code ?? 1}`, 'red');
    return `<article class="k8s-con-entry ${ok ? 'ok' : entry.pending ? 'pending' : 'fail'}" data-entry="${entry.id}">
      <header class="k8s-con-entry-head">
        <span class="k8s-con-meta"><span class="k8s-con-time">${esc(stamp(entry.at))}</span><span class="k8s-con-ctx" title="Context / namespace">${esc(entry.context || '')}${entry.namespace ? ` · ${esc(entry.namespace)}` : ''}</span></span>
        <code class="k8s-con-cmd"><span class="k8s-con-dollar">$</span> ${esc(res.command || entry.command)}</code>
        <span class="k8s-con-tools">
          ${status}${entry.ms != null ? `<span class="faint text-xs">${fmtMs(entry.ms)}${lines ? ` · ${lines} line${lines === 1 ? '' : 's'}` : ''}</span>` : ''}
          <button type="button" class="icon-btn" data-con-act="rerun" title="Run again" aria-label="Run again">${icon('refresh', 13)}</button>
          <button type="button" class="icon-btn" data-con-act="reuse" title="Edit in prompt" aria-label="Edit in prompt">${icon('terminal', 13)}</button>
          <button type="button" class="icon-btn" data-con-act="copy" title="Copy output" aria-label="Copy output">${icon('copy', 13)}</button>
          <button type="button" class="icon-btn" data-con-act="fold" title="${collapsed ? 'Expand' : 'Collapse'}" aria-label="${collapsed ? 'Expand' : 'Collapse'}">${icon(collapsed ? 'chevron-down' : 'chevron-up', 13)}</button>
          <button type="button" class="icon-btn" data-con-act="remove" title="Remove" aria-label="Remove">${icon('x', 13)}</button>
        </span>
      </header>
      ${collapsed || entry.pending ? '' : (shown
        ? `<pre class="k8s-con-out ${res.stderr && !res.stdout ? 'err' : ''}">${highlightOutput(shown)}</pre>`
        : `<div class="faint text-xs k8s-con-empty">${esc(res.error || 'The command produced no output.')}</div>`)}
    </article>`;
  }

  function consoleFeedHtml() {
    const q = CS.filter.trim().toLowerCase();
    const list = q ? CS.entries.filter((e) => `${e.command} ${e.result?.stdout || ''} ${e.result?.stderr || ''}`.toLowerCase().includes(q)) : CS.entries;
    if (!CS.entries.length) {
      return U.empty({ compact: true, icon: 'terminal', title: 'Session is empty', body: 'Type a kubectl command, press Tab to complete, ↑ ↓ for history. Context and namespace are applied for you.' });
    }
    if (!list.length) return U.empty({ compact: true, icon: 'search', title: 'No match', body: 'No command or output contains that text.' });
    return list.map(consoleEntryHtml).join('');
  }

  function consoleCardHtml(data, commands) {
    const suggestions = commands.slice(0, 8).map((item) => `<button type="button" class="k8s-suggest" data-k8s-suggest="${esc(item.command)}" title="${esc(item.description || '')}">${esc(item.label)}</button>`).join('');
    const ns = data.namespace || 'default';
    return `<section class="k8s-con" data-k8s-console-card data-context="${esc(data.selected || '')}" data-namespace="${esc(ns)}">
        <header class="k8s-con-bar">
          <span class="k8s-con-title">${icon('terminal', 15)}<strong>kubectl</strong></span>
          <span class="k8s-con-chip" title="Context">${icon('cloud', 11)}${esc(data.selected || '—')}</span>
          <span class="k8s-con-chip" title="Namespace">${icon('layers', 11)}${esc(ns)}</span>
          <label class="k8s-con-search">${icon('search', 12)}<input type="search" data-con-filter placeholder="Filter session…" value="${esc(CS.filter)}" aria-label="Filter session" /></label>
          <span class="k8s-con-count faint text-xs" data-con-count></span>
          <span class="k8s-con-spacer"></span>
          <button type="button" class="btn btn-ghost btn-xs" data-con-export title="Save session as text">${icon('download', 12)}<span>Export</span></button>
          <button type="button" class="btn btn-ghost btn-xs" data-con-clear title="Clear session (Ctrl+L)">${icon('trash', 12)}<span>Clear</span></button>
          <button type="button" class="btn btn-secondary btn-xs" data-con-fullscreen title="Fullscreen (F11)">${icon('maximize', 12)}<span>Fullscreen</span></button>
        </header>
        ${suggestions ? `<div class="k8s-console-suggest k8s-con-quick">${suggestions}</div>` : ''}
        <div class="k8s-con-feed" data-con-feed tabindex="-1" aria-live="polite">${consoleFeedHtml()}</div>
        <form class="k8s-con-prompt" data-k8s-console-form autocomplete="off">
          <div class="k8s-con-hints" data-con-hints hidden role="listbox"></div>
          <span class="k8s-con-ps"><span class="k8s-con-ps-ctx">${esc(data.selected || '')}</span><span class="k8s-con-ps-ns">${esc(ns)}</span><span class="k8s-con-dollar">$</span></span>
          <input class="k8s-con-input" data-k8s-console-input name="command" placeholder="kubectl get pods -o wide" autocomplete="off" autocapitalize="off" spellcheck="false" aria-label="kubectl command" />
          <button type="submit" class="btn btn-primary btn-sm" data-k8s-console-run>${icon('play', 12)}<span>Run</span></button>
        </form>
        <footer class="k8s-con-foot faint text-xs">
          <span>${icon('shield-check', 11)} Watch/follow, port-forward, proxy, attach, edit and kubeconfig changes are rejected. Pod shells have their own terminal.</span>
          <span class="k8s-con-keys"><kbd>Tab</kbd> complete <kbd>↑</kbd><kbd>↓</kbd> history <kbd>Ctrl+L</kbd> clear <kbd>Esc</kbd> exit fullscreen</span>
        </footer>
      </section>`;
  }

  // The same console, opened over any Kubernetes page from the header.
  async function openConsoleModal() {
    if (!api?.kubernetes) return;
    let data;
    let commands;
    try {
      [data, commands] = await Promise.all([loadBootstrap(), loadCommands('console')]);
    } catch (error) {
      U.toast('Console unavailable', 'error', { description: error.message });
      return;
    }
    if (!data.tools?.kubectl?.installed) { U.toast('kubectl is not installed', 'warning', { description: 'Open Kubernetes → Local tools to install it.' }); return; }
    if (!data.contexts?.length) { U.toast('No Kubernetes context', 'warning', { description: 'Import a kubeconfig or start a local cluster first.' }); return; }
    U.modal({
      title: 'Kubectl console',
      eyebrow: 'Kubernetes',
      icon: 'terminal',
      subtitle: `Context ${data.selected || '—'} · namespace ${data.namespace || 'default'}`,
      width: 'min(1100px, 95vw)',
      className: 'k8s-con-modal',
      body: consoleCardHtml(data, commands),
      onMount: ({ root }) => mountConsole(root),
    });
  }

  async function renderConsole() {
    if (!api?.kubernetes) return unavailable();
    const [data, commands] = await Promise.all([loadBootstrap(), loadCommands('console')]);
    if (!data.tools?.kubectl?.installed) return noKubectl(data.tools);
    if (!data.contexts?.length) return noContexts(data);
    return `<div class="page k8s-console-page">
      ${pageHead({
        title: PAGES.console,
        sub: 'A real kubectl session with the selected context enforced. No host shell, no pipes and no kubeconfig edits.',
        actions: pageActions('console'),
      })}
      ${selectorBar(data)}
      ${consoleCardHtml(data, commands)}
      <div class="mt-4 k8s-con-below">${commandsCard('console', commands)}</div>
    </div>`;
  }

  function mountConsole(root) {
    const card = root.querySelector('[data-k8s-console-card]');
    if (!card) return;
    const feed = card.querySelector('[data-con-feed]');
    const input = card.querySelector('[data-k8s-console-input]');
    const form = card.querySelector('[data-k8s-console-form]');
    const hints = card.querySelector('[data-con-hints]');
    const runBtn = card.querySelector('[data-k8s-console-run]');
    let histIndex = CS.history.length;
    let draft = '';
    let hintItems = [];
    let hintIndex = -1;

    const paintCount = () => {
      const el = card.querySelector('[data-con-count]');
      if (el) el.textContent = CS.entries.length ? `${CS.entries.length} command${CS.entries.length === 1 ? '' : 's'}` : '';
    };
    const toBottom = () => { feed.scrollTop = feed.scrollHeight; };
    const paint = (stick = false) => { feed.innerHTML = consoleFeedHtml(); paintCount(); if (stick) toBottom(); };
    const saveHistory = () => { try { localStorage.setItem('opsdeck:k8s-console-history', JSON.stringify(CS.history.slice(-200))); } catch { /* optional */ } };

    function candidates(value) {
      const parts = value.replace(/^\s+/, '').split(/\s+/);
      const trailing = /\s$/.test(value);
      const tokens = parts[0] === 'kubectl' ? parts.slice(1) : parts;
      const prefixed = parts[0] === 'kubectl';
      const cur = trailing ? '' : tokens[tokens.length - 1] || '';
      const idx = trailing ? tokens.length : tokens.length - 1;
      let pool = [];
      if (idx <= 0) pool = KUBECTL_VERBS;
      else if (cur.startsWith('-')) pool = KUBECTL_FLAGS;
      else if (['get', 'describe', 'delete', 'top', 'scale', 'rollout', 'label', 'annotate', 'patch', 'logs', 'explain'].includes(tokens[0]) && (idx === 1 || (tokens[0] === 'rollout' && idx === 2))) pool = tokens[0] === 'rollout' && idx === 1 ? ['status', 'history', 'restart', 'undo'] : KUBECTL_RESOURCES.concat(tokens[0] === 'top' ? [] : []);
      else if (tokens[0] === 'rollout' && idx === 1) pool = ['status', 'history', 'restart', 'undo'];
      else if (tokens[0] === 'config' && idx === 1) pool = ['view', 'get-contexts', 'current-context'];
      else if (tokens[0] === 'auth' && idx === 1) pool = ['can-i', 'whoami'];
      const matches = pool.filter((c) => c.startsWith(cur) && c.trim() !== cur).slice(0, 8);
      const head = tokens.slice(0, trailing ? tokens.length : -1);
      return matches.map((m) => ({ label: m.trim(), value: `${prefixed ? 'kubectl ' : ''}${[...head, m].join(' ')}` }));
    }
    function hideHints() { hints.hidden = true; hintItems = []; hintIndex = -1; }
    function showHints() {
      hintItems = input.value.trim() ? candidates(input.value) : [];
      if (!hintItems.length) { hideHints(); return; }
      hintIndex = -1;
      hints.innerHTML = hintItems.map((h, i) => `<button type="button" role="option" data-hint="${i}">${esc(h.label)}</button>`).join('');
      hints.hidden = false;
    }
    function accept(i) {
      const h = hintItems[i];
      if (!h) return;
      input.value = h.value;
      input.focus();
      input.setSelectionRange(input.value.length, input.value.length);
      showHints();
    }

    async function execute(command, { skipConfirm = false } = {}) {
      const text = command.trim();
      if (!text) return;
      if (MUTATING.test(text) && !skipConfirm) {
        const ok = await U.confirm({
          title: 'Run a command that changes the cluster?',
          message: `${text}\n\nContext ${card.dataset.context} · namespace ${card.dataset.namespace}`,
          confirmLabel: 'Run command',
          tone: /^(kubectl\s+)?(delete|drain|taint)\b/i.test(text) ? 'red' : undefined,
        });
        if (!ok) return;
      }
      if (CS.history[CS.history.length - 1] !== text) CS.history.push(text);
      saveHistory();
      histIndex = CS.history.length;
      const entry = { id: ++CS.seq, command: text, at: Date.now(), pending: true, context: card.dataset.context, namespace: card.dataset.namespace };
      CS.entries.push(entry);
      if (CS.entries.length > 150) CS.entries.shift();
      paint(true);
      busy(runBtn, true, 'Running…');
      const started = performance.now();
      try {
        entry.result = await api.kubernetes.runCommand({ command: text });
      } catch (error) {
        entry.result = { ok: false, error: error.message, code: 1 };
      }
      entry.ms = Math.round(performance.now() - started);
      entry.pending = false;
      busy(runBtn, false);
      const stick = feed.scrollHeight - feed.scrollTop - feed.clientHeight < 140 || true;
      paint(stick);
      input.focus();
    }

    form.addEventListener('submit', (event) => {
      event.preventDefault();
      const command = input.value;
      input.value = '';
      hideHints();
      execute(command);
    });

    input.addEventListener('input', () => { histIndex = CS.history.length; showHints(); });
    input.addEventListener('blur', () => setTimeout(hideHints, 120));
    input.addEventListener('keydown', (event) => {
      if (event.key === 'Tab') {
        event.preventDefault();
        if (!hintItems.length) showHints();
        if (hintItems.length === 1) accept(0);
        else if (hintItems.length) {
          hintIndex = (hintIndex + (event.shiftKey ? -1 : 1) + hintItems.length) % hintItems.length;
          hints.querySelectorAll('button').forEach((b, i) => b.classList.toggle('active', i === hintIndex));
          const common = hintItems.map((h) => h.value).reduce((a, b) => { let n = 0; while (n < a.length && a[n] === b[n]) n += 1; return a.slice(0, n); });
          if (hintIndex === 0 && common.length > input.value.length) { input.value = common; hintIndex = -1; hints.querySelectorAll('button').forEach((b) => b.classList.remove('active')); }
          else input.dataset.pick = String(hintIndex);
        }
        return;
      }
      if (event.key === 'Enter' && !hints.hidden && hintIndex >= 0) { event.preventDefault(); accept(hintIndex); return; }
      if (event.key === 'Escape' && !hints.hidden) { event.stopPropagation(); hideHints(); return; }
      if (event.key === 'ArrowUp') {
        event.preventDefault();
        if (histIndex === CS.history.length) draft = input.value;
        histIndex = Math.max(0, histIndex - 1);
        input.value = CS.history[histIndex] ?? input.value;
      } else if (event.key === 'ArrowDown') {
        event.preventDefault();
        histIndex = Math.min(CS.history.length, histIndex + 1);
        input.value = histIndex === CS.history.length ? draft : CS.history[histIndex];
      } else if (event.key === 'l' && event.ctrlKey) {
        event.preventDefault();
        CS.entries = [];
        paint();
      } else if (event.key === 'u' && event.ctrlKey) {
        input.value = '';
      }
    });

    hints.addEventListener('mousedown', (event) => {
      const b = event.target.closest('[data-hint]');
      if (b) { event.preventDefault(); accept(Number(b.dataset.hint)); }
    });

    card.addEventListener('click', async (event) => {
      const suggest = event.target.closest('[data-k8s-suggest]');
      if (suggest) {
        input.value = suggest.dataset.k8sSuggest || '';
        input.focus();
        showHints();
        return;
      }
      if (event.target.closest('[data-con-clear]')) { CS.entries = []; paint(); return; }
      if (event.target.closest('[data-con-fullscreen]')) {
        if (document.fullscreenElement) document.exitFullscreen(); else card.requestFullscreen?.().catch(() => card.classList.toggle('is-full'));
        return;
      }
      if (event.target.closest('[data-con-export]')) {
        const text = CS.entries.map((e) => `# ${new Date(e.at).toISOString()}  ${e.context}/${e.namespace}\n$ ${e.result?.command || e.command}\n${[e.result?.stdout, e.result?.stderr, e.result?.error].filter(Boolean).join('\n')}\n`).join('\n');
        if (!text.trim()) { U.toast('Nothing to export yet', 'info'); return; }
        OD.utils.copyText(text, 'Session copied to clipboard');
        return;
      }
      const act = event.target.closest('[data-con-act]');
      if (act) {
        const id = Number(act.closest('[data-entry]')?.dataset.entry);
        const entry = CS.entries.find((e) => e.id === id);
        if (!entry) return;
        const kind = act.dataset.conAct;
        if (kind === 'rerun') execute(entry.command);
        else if (kind === 'reuse') { input.value = entry.command; input.focus(); }
        else if (kind === 'copy') OD.utils.copyText([entry.result?.stdout, entry.result?.stderr].filter(Boolean).join('\n') || '', 'Output copied');
        else if (kind === 'fold') { if (CS.collapsed.has(id)) CS.collapsed.delete(id); else CS.collapsed.add(id); paint(); }
        else if (kind === 'remove') { CS.entries = CS.entries.filter((e) => e.id !== id); paint(); }
        return;
      }
      if (!window.getSelection()?.toString() && event.target.closest('.k8s-con-feed, .k8s-con-prompt')) input.focus();
    });

    card.querySelector('[data-con-filter]')?.addEventListener('input', (event) => {
      CS.filter = event.target.value;
      paint();
    });

    card.addEventListener('fullscreenchange', () => {
      const on = document.fullscreenElement === card;
      const btn = card.querySelector('[data-con-fullscreen]');
      if (btn) btn.innerHTML = `${icon(on ? 'shrink' : 'maximize', 12)}<span>${on ? 'Exit fullscreen' : 'Fullscreen'}</span>`;
      toBottom();
      input.focus();
    });
    card.addEventListener('keydown', (event) => {
      if (event.key === 'F11') { event.preventDefault(); card.querySelector('[data-con-fullscreen]')?.click(); }
    });

    paintCount();
    toBottom();
    if (OD.pendingKubectl) { input.value = OD.pendingKubectl; OD.pendingKubectl = ''; }
    input.focus({ preventScroll: true });
  }

  const RESOURCE_SECTIONS = ['pods', 'deployments', 'statefulsets', 'daemonsets', 'jobs', 'cronjobs', 'nodes', 'namespaces', 'services', 'ingresses', 'networkpolicies', 'persistentvolumes', 'persistentvolumeclaims', 'storageclasses', 'configmaps', 'secrets', 'resourcequotas', 'limitranges', 'serviceaccounts', 'roles', 'rolebindings', 'clusterroles', 'clusterrolebindings', 'events'];

  const RENDERERS = {
    overview: renderOverview,
    topology: renderTopology,
    contexts: renderContexts,
    helm: renderHelm,
    tools: renderTools,
    console: renderConsole,
    ...Object.fromEntries(RESOURCE_SECTIONS.map((section) => [section, (route) => renderResource(route, section)])),
  };

  async function render(route) {
    const section = route.parts[0] || 'overview';
    if (section === 'insights' && OD.views?.insights) return OD.views.insights.render('kubernetes', route);
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

  // Resource lists repaint in place when the cluster changes, so a Pod that
  // went from Pending to Running updates without a reload or losing scroll.
  let liveTimer = null;
  let liveSignature = '';
  function stopLive() {
    if (liveTimer) clearInterval(liveTimer);
    liveTimer = null;
  }

  function startLive(root, section) {
    stopLive();
    liveSignature = '';
    let busyNow = false;
    const tick = async () => {
      if (busyNow || document.hidden || U.isOverlayOpen()) return;
      const card = root.querySelector('[data-k8s-table]')?.closest('.card') || root.querySelector('.page .card');
      if (!card || !root.isConnected) return;
      busyNow = true;
      try {
        const allNamespaces = allNamespacesFromHash();
        const data = await api.kubernetes.resources({ section, allNamespaces });
        if (!data?.ok || data.error || !root.isConnected || !liveTimer) return;
        const signature = JSON.stringify([data.columns, (data.rows || []).map((r) => [r.name, r.namespace, r.cells])]);
        if (signature === liveSignature) return;
        liveSignature = signature;
        const count = data.rows?.length || 0;
        const body = card.querySelector('.card-body');
        const sub = card.querySelector('.card-sub');
        if (sub) sub.textContent = `${count} object${count === 1 ? '' : 's'}${data.truncated ? ` · showing first 500 of ${data.total}` : ''}`;
        if (body) {
          body.innerHTML = count
            ? dataTable(data.columns, data.rows, { section })
            : U.empty({ compact: true, icon: SECTION_ICONS[section] || 'box', title: `No ${(PAGES[section] || section).toLowerCase()}`, body: 'The selected context returned none in this scope.' });
        }
      } catch { /* keep the last good view */ } finally {
        busyNow = false;
      }
    };
    liveTimer = setInterval(tick, 4000);
  }

  function mount(root, route) {
    stopLive();
    const liveSection = route?.parts?.[0];
    if (RESOURCE_SECTIONS.includes(liveSection)) startLive(root, liveSection);
    OD.views?.insights?.dispose?.();
    if (route?.parts?.[0] === 'insights' && OD.views?.insights) {
      OD.views.insights.mount(root, 'kubernetes');
      return;
    }
    if (OD.kubernetesTopology && root.querySelector('[data-topo-map]')) {
      OD.kubernetesTopology.mount(root, {
        openResourceDrawer,
        openPodLogs,
        showPodShell,
      });
    }
    root.addEventListener('click', async (event) => {
      if (event.target.closest('[data-copy-text], .code-copy')) return;
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
      const runCmd = event.target.closest('[data-k8s-run-command]');
      if (runCmd) {
        await runCommandFromUi(runCmd, runCmd.dataset.command || '', runCmd.dataset.tone || 'read');
        return;
      }
      const rowLogs = event.target.closest('[data-k8s-row-logs]');
      if (rowLogs) {
        await openPodLogs(rowLogs.dataset.k8sRowLogs, rowLogs.dataset.k8sRowNamespace || '');
        return;
      }
      const rowShell = event.target.closest('[data-k8s-row-shell]');
      if (rowShell) {
        showPodShell({ name: rowShell.dataset.k8sRowShell, namespace: rowShell.dataset.k8sRowNamespace || '' });
        return;
      }
      const rowOpen = event.target.closest('[data-k8s-row-open]');
      if (rowOpen) {
        await openResourceDrawer(rowOpen.dataset.k8sRowSection, rowOpen.dataset.k8sRowOpen, rowOpen.dataset.k8sRowNamespace || '');
        return;
      }
      const minikubeBtn = event.target.closest('[data-minikube-action]');
      if (minikubeBtn) {
        await runMinikubeAction(minikubeBtn, minikubeBtn.dataset.minikubeAction);
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

    mountConsole(root);

    root.addEventListener('change', async (event) => {
      if (event.target.matches('[data-k8s-context]')) {        const select = event.target;
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
  function dispose() {
    stopLive();
    OD.views?.insights?.dispose?.();
  }

  OD.views.kubernetes = {
    openConsoleModal,
    render,
    mount,
    dispose,
    pages: PAGES,
    label(section) {
      return PAGES[section] || titleCase(section || 'overview');
    },
    status() {
      return OD.store?.state?.kubernetes || null;
    },
  };
})();
