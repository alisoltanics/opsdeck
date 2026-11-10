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

  const PAGES = {
    overview: 'Cluster overview',
    contexts: 'Contexts',
    namespaces: 'Namespaces',
    nodes: 'Nodes',
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

  function importButton(label = 'Import kubeconfig') {
    return U.button({ label, icon: 'plus', variant: 'primary', size: 'sm', attrs: 'data-k8s-import' });
  }

  function toolBadge(tool) {
    if (!tool) return U.badge('unknown', 'slate');
    return tool.installed ? U.badge(tool.version || 'installed', 'green') : U.badge('not installed', 'red');
  }

  function toolsCard(tools = {}) {
    const names = [['kubectl', 'kubectl', true], ['kind', 'kind', false], ['minikube', 'minikube', false], ['helm', 'Helm', false]];
    return U.card({
      title: 'Local tools',
      icon: 'terminal',
      sub: 'Detected on PATH · versions are read from the binaries',
      body: `<div class="stack-2" style="display:flex;flex-direction:column;gap:8px">${names.map(([id, label, required]) => {
        const tool = tools[id] || {};
        return `<div class="row gap-2" style="justify-content:space-between">
          <div class="row gap-2"><span class="mono text-xs">${esc(label)}</span>${required ? U.badge('required', 'amber') : ''}</div>
          ${toolBadge(tool)}
        </div>${tool.installed ? '' : `<div class="faint text-xs">${esc(tool.detail || `${label} is not on PATH.`)}</div>`}`;
      }).join('')}</div>`,
      footer: `<span class="faint text-xs">${icon('info', 11)} OpsDeck shells out to these binaries. It does not install them or edit their configuration.</span>`,
    });
  }

  function noKubectl(tools) {
    const tool = tools?.kubectl || {};
    return `<div class="page">
      ${pageHead({
        title: 'Kubernetes',
        sub: 'Connect a cluster with the real kubectl binary already installed on this machine.',
        actions: `${importButton()}${refreshButton()}`,
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
        actions: `${importButton()}${refreshButton()}`,
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

  function selectorBar(data) {
    if (!data.contexts?.length) return '';
    const namespaces = new Set(['default', data.namespace]);
    for (const ns of data.dashboard?.namespaces || []) namespaces.add(ns.name);
    const selected = data.selected || data.contexts[0]?.name || '';
    return `<div class="toolbar">
      <label class="field toolbar-field"><span>Context</span><select class="input" data-k8s-context>${data.contexts.map((context) => `<option value="${esc(context.name)}" ${context.name === selected ? 'selected' : ''}>${esc(context.name)}</option>`).join('')}</select></label>
      <label class="field toolbar-field"><span>Namespace</span><select class="input" data-k8s-namespace>${[...namespaces].filter(Boolean).sort().map((ns) => `<option value="${esc(ns)}" ${ns === data.namespace ? 'selected' : ''}>${esc(ns)}</option>`).join('')}</select></label>
      <span class="badge tone-${data.connection?.connected ? 'green' : 'amber'}">${data.connection?.connected ? 'connected' : 'not connected'}</span>
      <div class="toolbar-spacer"></div>
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
        actions: `${importButton()}${refreshButton()}`,
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
        actions: `${importButton()}${refreshButton()}`,
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
      ${pageHead({ title: PAGES.namespaces, sub: 'Live namespace objects and pod counts for the selected context.', actions: refreshButton() })}
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
      ${pageHead({ title: PAGES.nodes, sub: 'Node readiness, allocatable capacity and kubelet versions from the cluster.', actions: refreshButton() })}
      ${selectorBar(data)}
      ${data.dashboard
        ? U.card({ title: 'Nodes', icon: 'server', sub: `${data.dashboard.nodeSummary?.ready || 0} of ${data.dashboard.nodeSummary?.total || 0} ready`, body: data.dashboard.nodesError ? U.errorBanner('Nodes unavailable', data.dashboard.nodesError) : nodesTable(data.dashboard.nodes) })
        : connectionCard(data)}
    </div>`;
  }

  const RENDERERS = { overview: renderOverview, contexts: renderContexts, namespaces: renderNamespaces, nodes: renderNodes };

  async function render(route) {
    const section = route.parts[0] || 'overview';
    const renderer = RENDERERS[section];
    if (!renderer) {
      return `<div class="page">${pageHead({ title: 'Kubernetes' })}${U.empty({ icon: 'compass', title: 'Page not found', body: `There is no Kubernetes view for “${section}”.`, action: `<a class="btn btn-primary btn-sm" href="#/kubernetes/overview">Open cluster overview</a>` })}</div>`;
    }
    return renderer(route);
  }

  function busy(button, on) {
    if (!button) return;
    if (on) {
      button.dataset.label = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner">${icon('loader', 12)}</span><span>Working…</span>`;
    } else {
      button.disabled = false;
      if (button.dataset.label) button.innerHTML = button.dataset.label;
    }
  }

  function mount(root) {
    root.addEventListener('click', async (event) => {
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
