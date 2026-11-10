'use strict';

/**
 * Kubernetes service — Phase 1: tools, contexts, kubeconfig import,
 * connectivity, namespaces and a read-only cluster dashboard.
 *
 * All cluster data comes from the real kubectl binary. Kubeconfig contents
 * never leave this process; the renderer receives only context metadata.
 */

const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { run, runJson, scrub } = require('./exec');
const { KubeRegistry } = require('./registry');

const CONTEXT_RE = /^[A-Za-z0-9][A-Za-z0-9_.:@/+=,-]{0,252}$/;
const NAMESPACE_RE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
const CONTEXT_CACHE_MS = 4000;
const TOOLS_CACHE_MS = 15000;

function validContext(value) {
  return typeof value === 'string' && CONTEXT_RE.test(value);
}

function validNamespace(value) {
  return typeof value === 'string' && NAMESPACE_RE.test(value) && value.length <= 63;
}

function serverOf(clusters, name) {
  const cluster = (clusters || []).find((item) => item?.name === name)?.cluster;
  return typeof cluster?.server === 'string' ? cluster.server : '';
}

function countLines(text) {
  return String(text || '').split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
}

function trimNode(node) {
  const metadata = node?.metadata || {};
  const status = node?.status || {};
  const labels = metadata.labels || {};
  const conditions = Array.isArray(status.conditions) ? status.conditions : [];
  const ready = conditions.find((item) => item.type === 'Ready');
  const roles = Object.keys(labels)
    .filter((key) => key.startsWith('node-role.kubernetes.io/'))
    .map((key) => key.slice('node-role.kubernetes.io/'.length))
    .filter(Boolean);
  const addresses = Array.isArray(status.addresses) ? status.addresses : [];
  const internal = addresses.find((item) => item.type === 'InternalIP');
  const info = status.nodeInfo || {};
  return {
    name: String(metadata.name || ''),
    ready: ready?.status === 'True',
    readyReason: ready?.reason || '',
    roles: roles.length ? roles : ['worker'],
    version: info.kubeletVersion || '',
    os: info.operatingSystem || '',
    arch: info.architecture || '',
    containerRuntime: info.containerRuntimeVersion || '',
    cpu: status.allocatable?.cpu || '',
    memory: status.allocatable?.memory || '',
    pods: status.allocatable?.pods || '',
    internalIP: internal?.address || '',
    created: metadata.creationTimestamp || null,
    unschedulable: status.conditions?.some((item) => item.type === 'Ready' && item.status === 'False') === true || metadata.spec?.unschedulable === true,
  };
}

function trimNamespace(ns) {
  return {
    name: String(ns?.metadata?.name || ''),
    status: String(ns?.status?.phase || ''),
    created: ns?.metadata?.creationTimestamp || null,
  };
}

function ageIso(value) {
  return typeof value === 'string' ? value : null;
}

class KubernetesService {
  constructor({ app, dialog, getWindow }) {
    this.app = app;
    this.dialog = dialog;
    this.getWindow = getWindow;
    this.registry = new KubeRegistry(app);
    this.contextCache = null;
    this.toolsCache = null;
  }

  invalidate() {
    this.contextCache = null;
  }

  env() {
    return this.registry.env();
  }

  async tools(force = false) {
    if (!force && this.toolsCache && Date.now() - this.toolsCache.at < TOOLS_CACHE_MS) return this.toolsCache.value;
    const probe = async (command, args) => {
      const res = await run(command, args, { timeout: 6000 });
      if (res.missing) return { installed: false, version: '', detail: `${command} is not on PATH.` };
      const text = String(res.stdout || res.stderr || '').trim();
      const first = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || '';
      return {
        installed: res.ok,
        version: res.ok ? first.slice(0, 120) : '',
        detail: res.ok ? '' : scrub(res.stderr || `exit code ${res.code}`, 400),
      };
    };
    const [kubectl, kind, minikube, helm] = await Promise.all([
      probe('kubectl', ['version', '--client', '-o', 'json']),
      probe('kind', ['version']),
      probe('minikube', ['version']),
      probe('helm', ['version', '--short']),
    ]);
    if (kubectl.installed && /^\{/.test(kubectl.version)) {
      try {
        const data = JSON.parse(String(kubectl.version));
        kubectl.version = data.clientVersion?.gitVersion || data.clientVersion?.version || 'installed';
      } catch { kubectl.version = 'installed'; }
    }
    const value = { ok: true, tools: { kubectl, kind, minikube, helm }, checkedAt: new Date().toISOString() };
    this.toolsCache = { at: Date.now(), value };
    return value;
  }

  async readSource(source) {
    const res = await runJson('kubectl', ['config', 'view', '--kubeconfig', source.file, '-o', 'json'], { timeout: 9000 });
    if (!res.ok) {
      return {
        source: { id: source.id, label: source.label, imported: source.imported, contexts: 0, error: scrub(res.stderr || 'Could not read this kubeconfig.', 400) },
        contexts: [],
        clusters: [],
        current: '',
      };
    }
    const data = res.data || {};
    const contexts = (Array.isArray(data.contexts) ? data.contexts : []).map((entry) => {
      const name = String(entry?.name || '');
      const context = entry?.context || {};
      return {
        name,
        cluster: String(context.cluster || ''),
        user: String(context.user || ''),
        namespace: String(context.namespace || 'default'),
        server: serverOf(data.clusters, context.cluster),
        source: source.id,
        sourceLabel: source.label,
      };
    }).filter((entry) => entry.name);
    const clusters = (Array.isArray(data.clusters) ? data.clusters : []).map((entry) => ({
      name: String(entry?.name || ''),
      server: String(entry?.cluster?.server || ''),
      source: source.id,
      sourceLabel: source.label,
    })).filter((entry) => entry.name);
    return {
      source: { id: source.id, label: source.label, imported: source.imported, contexts: contexts.length, error: '' },
      contexts,
      clusters,
      current: String(data['current-context'] || ''),
    };
  }

  async loadContextState() {
    const sources = this.registry.sources();
    const results = await Promise.all(sources.map((source) => this.readSource(source)));
    const contexts = [];
    const seen = new Set();
    const clusters = [];
    const seenClusters = new Set();
    let current = '';
    for (const result of results) {
      if (result.current && !current) current = result.current;
      for (const entry of result.contexts) {
        if (seen.has(entry.name)) continue;
        seen.add(entry.name);
        contexts.push(entry);
      }
      for (const entry of result.clusters) {
        const key = `${entry.name}\u0000${entry.server}`;
        if (seenClusters.has(key)) continue;
        seenClusters.add(key);
        clusters.push(entry);
      }
    }
    const settings = this.registry.settings();
    const selected = contexts.find((entry) => entry.name === settings.context)?.name
      || contexts.find((entry) => entry.name === current)?.name
      || contexts[0]?.name
      || '';
    const selectedContext = contexts.find((entry) => entry.name === selected);
    const namespace = settings.namespace || selectedContext?.namespace || 'default';
    return {
      ok: true,
      contexts,
      clusters,
      sources: results.map((result) => result.source),
      current,
      selected,
      namespace,
      selectedContext: selectedContext || null,
      toolsInstalled: sources.length > 0 || false,
    };
  }

  async contextState(force = false) {
    if (!force && this.contextCache && Date.now() - this.contextCache.at < CONTEXT_CACHE_MS) return this.contextCache.value;
    const value = await this.loadContextState();
    this.contextCache = { at: Date.now(), value };
    return value;
  }

  contextArgs(opts = {}) {
    const args = [];
    if (validContext(opts.context)) args.push('--context', opts.context);
    if (validNamespace(opts.namespace)) args.push('--namespace', opts.namespace);
    return args;
  }

  kube(args, { timeout = 15000, context = '', namespace = '' } = {}) {
    return run('kubectl', [...args, ...this.contextArgs({ context, namespace })], {
      timeout,
      env: this.env(),
    });
  }

  kubeJson(args, { timeout = 15000, context = '', namespace = '' } = {}) {
    return runJson('kubectl', [...args, ...this.contextArgs({ context, namespace })], {
      timeout,
      env: this.env(),
    });
  }

  async connection(state = null, force = false) {
    const current = state || await this.contextState(force);
    if (!current.selected) {
      return {
        configured: false,
        connected: false,
        context: '',
        cluster: '',
        namespace: current.namespace,
        reason: current.contexts.length
          ? 'Choose a context to connect to a cluster.'
          : 'No kubeconfig context found. Import a kubeconfig or install kind/Minikube.',
      };
    }
    const meta = current.contexts.find((entry) => entry.name === current.selected) || current.selectedContext;
    const res = await this.kubeJson(['get', '--raw=/version'], { timeout: 9000, context: current.selected });
    if (res.ok) {
      return {
        configured: true,
        connected: true,
        context: current.selected,
        cluster: meta?.cluster || '',
        server: meta?.server || '',
        namespace: current.namespace,
        serverVersion: res.data?.gitVersion || res.data?.version || '',
        platform: res.data?.platform || '',
        reason: '',
      };
    }
    return {
      configured: true,
      connected: false,
      context: current.selected,
      cluster: meta?.cluster || '',
      server: meta?.server || '',
      namespace: current.namespace,
      reason: scrub(res.stderr || 'The cluster did not answer. Check the context, VPN, certificates and permissions.', 600),
    };
  }

  async bootstrap() {
    const tools = await this.tools();
    const state = await this.contextState();
    const connection = await this.connection(state);
    return { ok: true, ...state, tools: tools.tools, toolsCheckedAt: tools.checkedAt, connection };
  }

  async selectContext(value) {
    if (!validContext(value)) return { ok: false, error: 'That context name is not valid.' };
    const state = await this.contextState(true);
    const target = state.contexts.find((entry) => entry.name === value);
    if (!target) return { ok: false, error: 'That context is not present in any kubeconfig OpsDeck can read.' };
    const settings = this.registry.saveSettings({ context: value, namespace: target.namespace || 'default' });
    this.invalidate();
    const next = await this.contextState(true);
    return { ok: true, ...next, namespace: settings.namespace, connection: await this.connection(next) };
  }

  async setNamespace(value) {
    if (!validNamespace(value)) return { ok: false, error: 'Namespace names must be lowercase DNS labels.' };
    this.registry.saveSettings({ namespace: value });
    this.invalidate();
    return { ok: true, namespace: value };
  }

  async importKubeconfig() {
    let result;
    try {
      result = await this.dialog.showOpenDialog(this.getWindow(), {
        title: 'Import a kubeconfig',
        buttonLabel: 'Import',
        properties: ['openFile'],
        filters: [
          { name: 'Kubeconfig', extensions: ['yaml', 'yml', 'conf', 'config', 'json'] },
          { name: 'All files', extensions: ['*'] },
        ],
      });
    } catch (error) {
      return { ok: false, error: error.message || 'Could not open the file picker.' };
    }
    if (!result || result.canceled || !result.filePaths?.[0]) return { ok: true, cancelled: true };
    const sourcePath = result.filePaths[0];

    let stat;
    try { stat = fs.statSync(sourcePath); } catch (error) { return { ok: false, error: error.message }; }
    if (!stat.isFile()) return { ok: false, error: 'Choose a kubeconfig file, not a directory.' };
    if (stat.size <= 0 || stat.size > MAX_IMPORT_BYTES) return { ok: false, error: 'The kubeconfig must be between 1 byte and 4 MB.' };

    let content;
    try { content = fs.readFileSync(sourcePath, 'utf8'); } catch (error) { return { ok: false, error: error.message }; }
    const hash = crypto.createHash('sha256').update(content).digest('hex').slice(0, 16);
    const existing = this.registry.imports().find((entry) => entry.hash === hash);
    if (existing) {
      this.invalidate();
      return { ok: true, alreadyImported: true, imported: { id: existing.id, label: existing.label }, state: await this.bootstrap() };
    }

    const validation = await runJson('kubectl', ['config', 'view', '--kubeconfig', sourcePath, '-o', 'json'], { timeout: 12000 });
    if (!validation.ok) {
      return {
        ok: false,
        error: `kubectl rejected this kubeconfig: ${scrub(validation.stderr || 'could not read the file', 600)}`,
      };
    }
    const contexts = (Array.isArray(validation.data?.contexts) ? validation.data.contexts : [])
      .map((entry) => String(entry?.name || ''))
      .filter(Boolean);
    if (!contexts.length) return { ok: false, error: 'This file does not contain any kubeconfig contexts.' };

    let copy;
    try {
      copy = this.registry.copyImport(sourcePath, content);
    } catch (error) {
      return { ok: false, error: `Could not copy the kubeconfig into app storage: ${error.message}` };
    }
    const label = `${path.basename(sourcePath).slice(0, 80)} · ${contexts[0]}`.slice(0, 160);
    const entry = {
      id: copy.id,
      hash: copy.hash,
      file: copy.file,
      label,
      source: copy.source,
      contexts,
      importedAt: new Date().toISOString(),
    };
    this.registry.addImport(entry);
    this.invalidate();

    const hadContext = (await this.contextState(true)).selected;
    if (!hadContext && contexts[0]) {
      await this.selectContext(contexts[0]);
    }
    return { ok: true, imported: { id: entry.id, label: entry.label, contexts }, state: await this.bootstrap() };
  }

  async removeKubeconfig(id) {
    if (typeof id !== 'string' || !/^kc_[a-f0-9]{16}$/.test(id)) return { ok: false, error: 'That imported kubeconfig is not valid.' };
    const entry = this.registry.removeImport(id);
    if (!entry) return { ok: false, error: 'That imported kubeconfig was not found.' };
    const settings = this.registry.settings();
    if (settings.context && Array.isArray(entry.contexts) && entry.contexts.includes(settings.context)) {
      this.registry.saveSettings({ context: '', namespace: 'default' });
    }
    this.invalidate();
    return { ok: true, removed: entry.id, state: await this.bootstrap() };
  }

  async dashboard() {
    const tools = await this.tools();
    const state = await this.contextState(true);
    if (!tools.tools.kubectl.installed) {
      return {
        ok: true,
        ...state,
        tools: tools.tools,
        connection: { configured: false, connected: false, reason: 'kubectl is not installed or not on PATH.' },
        dashboard: null,
      };
    }
    const connection = await this.connection(state);
    if (!connection.connected) {
      return { ok: true, ...state, tools: tools.tools, connection, dashboard: null };
    }

    const context = state.selected;
    const [nsRes, nodeRes, podRes, workloadRes, serviceRes, eventRes] = await Promise.all([
      this.kubeJson(['get', 'namespaces', '-o', 'json'], { timeout: 12000, context }),
      this.kubeJson(['get', 'nodes', '-o', 'json'], { timeout: 15000, context }),
      this.kube(['get', 'pods', '--all-namespaces', '--no-headers', '-o', 'custom-columns=NS:.metadata.namespace,PHASE:.status.phase'], { timeout: 20000, context }),
      this.kube(['get', 'deployments,statefulsets,daemonsets', '--all-namespaces', '-o', 'name'], { timeout: 15000, context }),
      this.kube(['get', 'services', '--all-namespaces', '-o', 'name'], { timeout: 12000, context }),
      this.kubeJson(['get', 'events', '--all-namespaces', '--field-selector=type=Warning', '-o', 'json'], { timeout: 12000, context }),
    ]);

    const namespaces = nsRes.ok && Array.isArray(nsRes.data?.items) ? nsRes.data.items.map(trimNamespace) : [];
    const nodes = nodeRes.ok && Array.isArray(nodeRes.data?.items) ? nodeRes.data.items.map(trimNode) : [];

    const podCounts = { total: 0, running: 0, pending: 0, failed: 0, succeeded: 0, unknown: 0 };
    const podsByNamespace = {};
    if (podRes.ok) {
      for (const line of countLines(podRes.stdout)) {
        const [namespace, phaseRaw] = line.split(/\s+/);
        if (!namespace) continue;
        const phase = String(phaseRaw || 'Unknown').toLowerCase();
        podCounts.total += 1;
        if (Object.prototype.hasOwnProperty.call(podCounts, phase)) podCounts[phase] += 1;
        else podCounts.unknown += 1;
        podsByNamespace[namespace] = (podsByNamespace[namespace] || 0) + 1;
      }
    }

    const workloads = { deployments: 0, statefulsets: 0, daemonsets: 0 };
    if (workloadRes.ok) {
      for (const line of countLines(workloadRes.stdout)) {
        if (line.startsWith('deployment.apps/')) workloads.deployments += 1;
        else if (line.startsWith('statefulset.apps/')) workloads.statefulsets += 1;
        else if (line.startsWith('daemonset.apps/')) workloads.daemonsets += 1;
      }
    }

    const services = serviceRes.ok ? countLines(serviceRes.stdout).length : 0;

    let warnings = [];
    if (eventRes.ok && Array.isArray(eventRes.data?.items)) {
      warnings = eventRes.data.items.slice(-8).reverse().map((item) => ({
        namespace: String(item?.metadata?.namespace || ''),
        reason: String(item?.reason || ''),
        object: String(item?.involvedObject?.name || ''),
        kind: String(item?.involvedObject?.kind || ''),
        message: String(item?.message || '').slice(0, 500),
        count: Number(item?.count) || 1,
        last: ageIso(item?.lastTimestamp || item?.eventTime || item?.metadata?.creationTimestamp),
      }));
    }

    return {
      ok: true,
      ...state,
      tools: tools.tools,
      connection,
      dashboard: {
        namespaces: namespaces.sort((a, b) => a.name.localeCompare(b.name)),
        namespaceCount: namespaces.length,
        nodes,
        nodeSummary: { total: nodes.length, ready: nodes.filter((node) => node.ready).length },
        pods: podCounts,
        podsByNamespace,
        workloads,
        services,
        warnings,
        namespaceError: nsRes.ok ? '' : scrub(nsRes.stderr, 300),
        nodesError: nodeRes.ok ? '' : scrub(nodeRes.stderr, 300),
        podsError: podRes.ok ? '' : scrub(podRes.stderr, 300),
        workloadsError: workloadRes.ok ? '' : scrub(workloadRes.stderr, 300),
        servicesError: serviceRes.ok ? '' : scrub(serviceRes.stderr, 300),
        eventsError: eventRes.ok ? '' : scrub(eventRes.stderr, 300),
      },
    };
  }
}

module.exports = { KubernetesService, __test: { trimNode, trimNamespace, validContext, validNamespace, countLines } };
