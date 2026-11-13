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
const { TOOL_NAMES, labelFor, installTool, binDir, toolsPathEnv, readInstalled } = require('./install');
const { RESOURCES, sanitizeManifest, validObjectName, actionsFor, actionArgs, trimEvent, summaryFor } = require('./resources');
const { sectionCommands, objectCommands } = require('./commands');
const { buildTopology } = require('./topology');
const { runKubectl } = require('./kubectl-runner');
const { runLessonScript } = require('./lesson-runner');
const { start: shellStart, input: shellInput, resize: shellResize, stop: shellStop, disposeAll: shellDisposeAll } = require('./shell');

const CONTEXT_RE = /^[A-Za-z0-9][A-Za-z0-9_.:@/+=,-]{0,252}$/;
const NAMESPACE_RE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
const MAX_IMPORT_BYTES = 4 * 1024 * 1024;
const CONTEXT_CACHE_MS = 4000;
const TOOLS_CACHE_MS = 15000;

function validContext(value) {
  return typeof value === 'string' && CONTEXT_RE.test(value);
}

function clampLimit(value, fallback = 8, max = 12) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.min(Math.max(Math.round(n), 1), max);
}

/**
 * Minikube prints a JSON object with capitalised keys when a profile exists,
 * and a lowercase JSON event when no profile exists. Both shapes are accepted.
 */
function parseMinikubeStatus(data, { ok = true, stderr = '' } = {}) {
  const message = data?.message || data?.Message || scrub(stderr || '', 500);
  const host = String(data?.host || data?.Host || '');
  const kubelet = String(data?.kubelet || data?.Kubelet || '');
  const apiserver = String(data?.apiserver || data?.APIServer || '');
  const running = host === 'Running' && kubelet === 'Running' && apiserver === 'Running';
  let state = running ? 'running' : 'stopped';
  if (!host && /not found|does not exist|to start a cluster/i.test(message)) state = 'absent';
  else if (!ok && !data) state = 'unknown';
  const detailMessage = /^command failed/i.test(message) ? '' : message;
  return {
    running,
    state,
    host,
    kubelet,
    apiserver,
    kubeconfig: String(data?.kubeconfig || data?.Kubeconfig || ''),
    message: detailMessage,
    detail: running
      ? 'The default Minikube profile is running.'
      : state === 'absent'
        ? (detailMessage ? `No Minikube profile exists yet. ${detailMessage}` : 'No Minikube profile exists yet.')
        : 'The default Minikube profile is stopped.',
  };
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
    this.installPromise = null;
    this.minikubePromise = null;
  }

  dispose() {
    shellDisposeAll();
  }

  invalidate() {
    this.contextCache = null;
  }

  env() {
    return { ...this.registry.env(), PATH: toolsPathEnv(this.app) };
  }

  async installStatus() {
    return { ok: true, binDir: binDir(this.app), installed: readInstalled(this.app) };
  }

  async minikubeStatus() {
    const tools = await this.tools();
    if (!tools.tools.minikube.installed) {
      return { ok: true, installed: false, running: false, state: 'missing', profile: 'minikube', detail: 'Minikube is not installed yet.' };
    }
    const res = await run('minikube', ['status', '--output=json'], { timeout: 20000, env: this.env() });
    let data = null;
    for (const line of String(res.stdout || '').trim().split(/\r?\n/).filter(Boolean)) {
      try {
        const parsed = JSON.parse(line);
        if (parsed?.data && typeof parsed.data === 'object') data = { ...(data || {}), ...parsed.data };
        else if (parsed && typeof parsed === 'object') data = { ...(data || {}), ...parsed };
      } catch { /* status may print plain text */ }
    }
    if (!data) {
      const text = String(res.stdout || res.stderr || '').trim();
      if (text) data = { message: text.slice(0, 1000) };
    }
    const parsed = parseMinikubeStatus(data, { ok: res.ok, stderr: res.stderr });
    return {
      ok: true,
      installed: true,
      profile: 'minikube',
      ...parsed,
    };
  }

  async minikubeAction(action) {
    if (action !== 'start' && action !== 'stop') return { ok: false, error: 'Minikube actions are limited to start and stop.' };
    if (this.minikubePromise) return this.minikubePromise;
    this.minikubePromise = (async () => {
      const tools = await this.tools(true);
      if (!tools.tools.minikube.installed) return { ok: false, error: 'Install Minikube from the tools card first.' };
      const args = action === 'start' ? ['start', '--interactive=false'] : ['stop'];
      const res = await run('minikube', args, {
        timeout: action === 'start' ? 360000 : 120000,
        env: this.env(),
      });
      this.invalidate();
      const status = await this.minikubeStatus();
      return {
        ok: res.ok,
        action,
        running: status.running,
        state: status.state,
        status,
        message: scrub(String(res.stdout || '').trim(), 2000),
        error: res.ok ? '' : scrub(res.stderr || `minikube ${action} failed.`, 1000),
      };
    })().finally(() => { this.minikubePromise = null; });
    return this.minikubePromise;
  }

  async commandList(section, { name = '', namespace = '', allNamespaces = false } = {}) {
    const state = await this.contextState();
    const ns = validNamespace(namespace) ? namespace : state.namespace;
    const list = name
      ? objectCommands(section, { context: state.selected, namespace: ns, name })
      : sectionCommands(section, { context: state.selected, namespace: ns, allNamespaces });
    return { ok: true, section, context: state.selected, namespace: ns, commands: list };
  }

  async runCommand(input) {
    const state = await this.contextState();
    return runKubectl(input, {
      context: state.selected,
      namespace: state.namespace,
      env: this.env(),
      allowContext: state.selected,
    });
  }

  async runLesson({ script, yamls } = {}) {
    if (typeof script !== 'string' || !script.trim() || script.length > 20000) return { ok: false, error: 'There is nothing to run.' };
    const cleanYamls = (Array.isArray(yamls) ? yamls : []).slice(0, 12).map((y) => ({ title: String(y?.title || '').slice(0, 120), code: String(y?.code || '').slice(0, 20000) }));
    const [tools, state] = await Promise.all([this.tools(), this.contextState()]);
    if (!tools.tools.kubectl.installed) return { ok: false, error: 'kubectl is not installed. Open Kubernetes → Local tools to install it.' };
    if (!state.selected) return { ok: false, error: 'Choose a Kubernetes context first (Kubernetes → Contexts).' };
    return runLessonScript({ script, yamls: cleanYamls, context: state.selected, namespace: state.namespace, env: this.env() });
  }

  async podLogs({ name, namespace, container = '', tailLines = 200, previous = false } = {}) {
    if (!validObjectName(name)) return { ok: false, error: 'That pod name is not valid.' };
    if (container && !/^[a-z0-9]([-a-z0-9.]{0,61}[a-z0-9])?$/.test(container)) return { ok: false, error: 'That container name is not valid.' };
    const [tools, state] = await Promise.all([this.tools(), this.contextState()]);
    if (!tools.tools.kubectl.installed) return { ok: false, error: 'kubectl is not installed.' };
    if (!state.selected) return { ok: false, error: 'Choose a context before reading logs.' };
    const ns = validNamespace(namespace) ? namespace : state.namespace;
    const tail = Math.min(2000, Math.max(10, Number.isFinite(Number(tailLines)) ? Math.round(Number(tailLines)) : 200));
    const args = ['logs', name, '--tail', String(tail)];
    if (container) args.push('--container', container);
    if (previous) args.push('--previous');
    const res = await this.kube(args, { timeout: 20000, context: state.selected, namespace: ns });
    return {
      ok: res.ok,
      name,
      namespace: ns,
      container,
      previous: previous === true,
      lines: tail,
      stdout: res.ok ? String(res.stdout || '').slice(0, 250000) : '',
      error: res.ok ? '' : scrub(res.stderr || 'Could not read pod logs.', 2000),
    };
  }

  async objectEvents(section, { name, namespace } = {}) {
    const def = RESOURCES[section];
    if (!def || !validObjectName(name)) return { ok: false, error: 'That object is not valid.' };
    const state = await this.contextState();
    if (!state.selected) return { ok: false, error: 'Choose a context before reading events.' };
    const ns = validNamespace(namespace) ? namespace : state.namespace;
    const args = ['get', 'events', '--field-selector', `involvedObject.name=${name}`, '-o', 'json'];
    // Events are namespaced, but node and cluster-scoped objects can emit them
    // into any namespace, so those lookups span every namespace.
    if (!def.namespaced) args.push('--all-namespaces');
    const res = await this.kubeJson(args, {
      timeout: 15000,
      context: state.selected,
      namespace: def.namespaced ? ns : '',
    });
    if (!res.ok) return { ok: false, rows: [], error: scrub(res.stderr || 'Could not read events.', 600) };
    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    const rows = items.map(trimEvent).sort((a, b) => (b.sortAt || 0) - (a.sortAt || 0)).slice(0, 100);
    return { ok: true, rows, error: '' };
  }

  async shellStart(spec, sender, options = {}) {
    return shellStart({
      context: String(spec?.context || ''),
      namespace: String(spec?.namespace || ''),
      name: String(spec?.name || ''),
      container: String(spec?.container || ''),
    }, sender, { ...options, env: this.env(), run });
  }

  shellInput(sessionId, data, senderId) { return shellInput(sessionId, data, senderId); }
  shellResize(sessionId, cols, rows, senderId) { return shellResize(sessionId, cols, rows, senderId); }
  shellStop(sessionId, senderId) { return shellStop(sessionId, senderId); }

  async tools(force = false) {
    if (!force && this.toolsCache && Date.now() - this.toolsCache.at < TOOLS_CACHE_MS) return this.toolsCache.value;
    const env = this.env();
    const probe = async (command, args) => {
      const res = await run(command, args, { timeout: 6000, env });
      if (res.missing) return { installed: false, version: '', detail: `${command} is not installed.` };
      const text = String(res.stdout || res.stderr || '').trim();
      const first = text.split(/\r?\n/).map((line) => line.trim()).filter(Boolean)[0] || '';
      const value = {
        installed: res.ok,
        version: res.ok ? first.slice(0, 120) : '',
        detail: res.ok ? '' : scrub(res.stderr || `exit code ${res.code}`, 400),
      };
      Object.defineProperty(value, 'raw', { value: text, enumerable: false, configurable: true });
      return value;
    };
    const [kubectl, kind, minikube, helm] = await Promise.all([
      probe('kubectl', ['version', '--client', '-o', 'json']),
      probe('kind', ['version']),
      probe('minikube', ['version']),
      probe('helm', ['version', '--short']),
    ]);
    if (kubectl.installed) {
      try {
        const data = JSON.parse(String(kubectl.raw || ''));
        kubectl.version = data.clientVersion?.gitVersion || data.clientVersion?.version || 'installed';
      } catch { kubectl.version = 'installed'; }
      delete kubectl.raw;
    }
    delete kind.raw;
    delete minikube.raw;
    delete helm.raw;
    const value = { ok: true, tools: { kubectl, kind, minikube, helm }, checkedAt: new Date().toISOString() };
    this.toolsCache = { at: Date.now(), value };
    return value;
  }

  async installTools(onProgress = null) {
    if (this.installPromise) return this.installPromise;
    this.installPromise = (async () => {
      const before = await this.tools(true);
      const missing = TOOL_NAMES.filter((name) => !before.tools[name]?.installed);
      if (!missing.length) {
        return {
          ok: true,
          tools: before.tools,
          installed: [],
          failed: [],
          alreadyInstalled: true,
          binDir: binDir(this.app),
          checkedAt: before.checkedAt,
        };
      }

      const installed = [];
      const failed = [];
      for (const name of missing) {
        try {
          const result = await installTool(name, {
            app: this.app,
            onProgress: (event) => onProgress?.({ ...event, tool: name, label: labelFor(name) }),
          });
          installed.push({ name: result.name, label: result.label, version: result.version, bytes: result.bytes });
        } catch (error) {
          const message = scrub(error?.message || `Could not install ${labelFor(name)}.`, 500);
          failed.push({ name, label: labelFor(name), error: message });
          onProgress?.({ tool: name, label: labelFor(name), phase: 'error', message, percent: null });
        }
      }

      this.toolsCache = null;
      const after = await this.tools(true);
      onProgress?.({
        phase: 'done',
        message: failed.length ? 'Finished with errors.' : 'All requested tools are installed.',
        percent: 100,
        installed: installed.length,
        failed: failed.length,
      });
      return {
        ok: failed.length === 0,
        tools: after.tools,
        installed,
        failed,
        alreadyInstalled: false,
        binDir: binDir(this.app),
        checkedAt: after.checkedAt,
      };
    })().finally(() => { this.installPromise = null; });
    return this.installPromise;
  }

  async readSource(source) {
    const res = await runJson('kubectl', ['config', 'view', '--kubeconfig', source.file, '-o', 'json'], { timeout: 9000, env: this.env() });
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

    const validation = await runJson('kubectl', ['config', 'view', '--kubeconfig', sourcePath, '-o', 'json'], { timeout: 12000, env: this.env() });
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

  /**
   * Read-only snapshot for the Kubernetes intelligence analysers.
   *
   * Only workload/meta objects are requested. Secrets are never listed, so no
   * secret value can reach the renderer. Each request is isolated: one denied
   * RBAC rule does not hide the rest of the cluster.
   */
  async insightData({ allNamespaces = true } = {}) {
    const [tools, state] = await Promise.all([this.tools(), this.contextState()]);
    const base = {
      ok: true,
      context: state.selected,
      namespace: state.namespace,
      contexts: state.contexts,
      tools: tools.tools,
      checkedAt: new Date().toISOString(),
      items: {},
      errors: {},
    };
    if (!tools.tools.kubectl.installed) return { ...base, ok: false, error: 'kubectl is not installed.' };
    if (!state.selected) return { ...base, ok: false, error: 'No Kubernetes context is selected.' };

    const namespaced = allNamespaces === true ? ['--all-namespaces'] : [];
    const requests = {
      pods: { args: ['get', 'pods', '-o', 'json'], scoped: true },
      deployments: { args: ['get', 'deployments.apps', '-o', 'json'], scoped: true, key: 'deployments' },
      statefulsets: { args: ['get', 'statefulsets.apps', '-o', 'json'], scoped: true },
      daemonsets: { args: ['get', 'daemonsets.apps', '-o', 'json'], scoped: true },
      jobs: { args: ['get', 'jobs.batch', '-o', 'json'], scoped: true },
      services: { args: ['get', 'services', '-o', 'json'], scoped: true },
      ingresses: { args: ['get', 'ingresses.networking.k8s.io', '-o', 'json'], scoped: true },
      networkpolicies: { args: ['get', 'networkpolicies.networking.k8s.io', '-o', 'json'], scoped: true },
      pvcs: { args: ['get', 'persistentvolumeclaims', '-o', 'json'], scoped: true, key: 'persistentvolumeclaims' },
      endpoints: { args: ['get', 'endpoints', '-o', 'json'], scoped: true },
      nodes: { args: ['get', 'nodes', '-o', 'json'], scoped: false },
      namespaces: { args: ['get', 'namespaces', '-o', 'json'], scoped: false },
      pvs: { args: ['get', 'persistentvolumes', '-o', 'json'], scoped: false },
      storageclasses: { args: ['get', 'storageclasses.storage.k8s.io', '-o', 'json'], scoped: false },
      events: { args: ['get', 'events', '-o', 'json'], scoped: true },
      clusterrolebindings: { args: ['get', 'clusterrolebindings.rbac.authorization.k8s.io', '-o', 'json'], scoped: false },
      serviceaccounts: { args: ['get', 'serviceaccounts', '-o', 'json'], scoped: true },
      apiGroups: { args: ['api-resources', '--api-group=argoproj.io', '-o', 'name'], scoped: false, raw: true },
    };

    const results = await Promise.all(Object.entries(requests).map(async ([key, spec]) => {
      const args = spec.raw ? spec.args : [...spec.args, ...(spec.scoped ? namespaced : [])];
      const res = await this.kube(args, {
        timeout: 20000,
        context: state.selected,
        namespace: spec.scoped && allNamespaces !== true ? state.namespace : '',
      });
      if (!res.ok) {
        return [key, { ok: false, error: scrub(res.stderr || `Could not read ${key}.`, 400) }];
      }
      if (spec.raw) return [key, { ok: true, text: String(res.stdout || '').slice(0, 20000) }];
      try {
        const parsed = JSON.parse(res.stdout);
        return [key, { ok: true, items: Array.isArray(parsed?.items) ? parsed.items.slice(0, 2000) : [] }];
      } catch {
        return [key, { ok: false, error: `Could not parse the ${key} response.` }];
      }
    }));

    for (const [key, value] of results) {
      if (value.ok) base.items[key] = value.items ?? value.text ?? [];
      else base.errors[key] = value.error;
    }
    return base;
  }

  /**
   * Read-only counts across every configured context.
   *
   * Contexts are read concurrently but independently: an unreachable cluster
   * returns its own error and never removes data from the others. Secrets are
   * not requested.
   */
  async multiClusterSnapshot({ limit = 8 } = {}) {
    const [tools, state] = await Promise.all([this.tools(), this.contextState()]);
    if (!tools.tools.kubectl.installed) return { ok: false, error: 'kubectl is not installed.' };
    const contexts = (state.contexts || []).slice(0, clampLimit(limit));
    if (!contexts.length) return { ok: true, contexts: [], selected: state.selected, checkedAt: new Date().toISOString() };
    const parse = (result) => {
      if (!result.ok) return { ok: false, error: scrub(result.stderr || 'The request failed.', 300), items: [] };
      try {
        const parsed = JSON.parse(result.stdout);
        return { ok: true, error: '', items: Array.isArray(parsed?.items) ? parsed.items.slice(0, 5000) : [] };
      } catch {
        return { ok: false, error: 'The response could not be parsed.', items: [] };
      }
    };
    const results = await Promise.all(contexts.map(async (entry) => {
      const name = entry.name;
      try {
        const [nodes, pods, deployments, events] = await Promise.all([
          this.kube(['get', 'nodes', '-o', 'json'], { timeout: 15000, context: name }),
          this.kube(['get', 'pods', '--all-namespaces', '-o', 'json'], { timeout: 15000, context: name }),
          this.kube(['get', 'deployments.apps', '--all-namespaces', '-o', 'json'], { timeout: 15000, context: name }),
          this.kube(['get', 'events', '--all-namespaces', '--field-selector', 'type=Warning', '-o', 'json'], { timeout: 15000, context: name }),
        ]);
        const nodeList = parse(nodes);
        const podList = parse(pods);
        const deploymentList = parse(deployments);
        const eventList = parse(events);
        const readyNodes = nodeList.items.filter((node) => (node.status?.conditions || [])
          .some((condition) => condition.type === 'Ready' && condition.status === 'True')).length;
        const runningPods = podList.items.filter((pod) => pod.status?.phase === 'Running').length;
        const problemPods = podList.items.filter((pod) => ['Failed', 'Pending', 'Unknown'].includes(pod.status?.phase)
          || (pod.status?.containerStatuses || []).some((status) => status.ready === false && status.state?.waiting)).length;
        const availableDeployments = deploymentList.items.filter((deployment) => {
          const desired = Number(deployment.spec?.replicas) || 0;
          const available = Number(deployment.status?.availableReplicas) || 0;
          return desired > 0 && available >= desired;
        }).length;
        return {
          name,
          cluster: entry.cluster || '',
          ok: true,
          error: '',
          nodes: { ok: nodeList.ok, total: nodeList.items.length, ready: readyNodes, error: nodeList.error },
          pods: { ok: podList.ok, total: podList.items.length, running: runningPods, problem: problemPods, error: podList.error },
          deployments: { ok: deploymentList.ok, total: deploymentList.items.length, available: availableDeployments, error: deploymentList.error },
          warningEvents: { ok: eventList.ok, count: eventList.items.length, error: eventList.error },
        };
      } catch (error) {
        return { name, cluster: entry.cluster || '', ok: false, error: scrub(error.message || String(error), 300) };
      }
    }));
    return { ok: true, selected: state.selected, contexts: results, checkedAt: new Date().toISOString() };
  }

  async resources(section, { allNamespaces = false } = {}) {
    const def = RESOURCES[section];
    if (!def) return { ok: false, error: 'Unknown Kubernetes resource.' };
    const [tools, state] = await Promise.all([this.tools(), this.contextState()]);
    const all = def.namespaced && allNamespaces === true;
    const base = {
      ok: true,
      section,
      title: def.label,
      columns: def.columns,
      namespaced: def.namespaced,
      allNamespaces: all,
      contexts: state.contexts,
      selected: state.selected,
      namespace: state.namespace,
      tools: tools.tools,
      checkedAt: tools.checkedAt,
      commands: sectionCommands(section, {
        context: state.selected,
        namespace: state.namespace,
        allNamespaces: all,
      }),
      rows: [],
      total: 0,
      truncated: false,
      error: '',
    };
    if (!tools.tools.kubectl.installed) return { ...base, error: 'kubectl is not installed.' };
    if (!state.selected) return base;

    const args = ['get', def.resource, '-o', 'json'];
    if (all) args.push('--all-namespaces');
    const res = await this.kubeJson(args, {
      timeout: 20000,
      context: state.selected,
      namespace: all ? '' : state.namespace,
    });
    if (!res.ok) {
      return { ...base, error: scrub(res.stderr || `Could not list ${def.label}.`, 600) };
    }
    const items = Array.isArray(res.data?.items) ? res.data.items : [];
    let rows = items.slice(0, 500).map(def.trim);
    if (def.sortDescending) rows = rows.slice().sort((a, b) => (b.sortAt || 0) - (a.sortAt || 0));
    return { ...base, rows, total: items.length, truncated: items.length > rows.length };
  }

  async resourceDetail(section, { name, namespace } = {}) {
    const def = RESOURCES[section];
    if (!def) return { ok: false, error: 'Unknown Kubernetes resource.' };
    if (!validObjectName(name)) return { ok: false, error: 'That object name is not valid.' };

    const [tools, state] = await Promise.all([this.tools(), this.contextState()]);
    if (!tools.tools.kubectl.installed) return { ok: false, error: 'kubectl is not installed.' };
    if (!state.selected) return { ok: false, error: 'Choose a context before opening an object.' };

    const ns = def.namespaced ? (validNamespace(namespace) ? namespace : state.namespace) : '';
    const res = await this.kubeJson(['get', def.resource, name, '-o', 'json'], {
      timeout: 15000,
      context: state.selected,
      namespace: ns,
    });
    if (!res.ok) {
      return { ok: false, error: scrub(res.stderr || `Could not read this ${def.label.toLowerCase().replace(/s$/, '')}.`, 600) };
    }

    const summary = summaryFor(section, res.data);
    const manifest = sanitizeManifest(res.data, section);
    const [describeResult, eventsResult] = await Promise.all([
      this.kube(['describe', def.resource, name], {
        timeout: 15000,
        context: state.selected,
        namespace: ns,
      }),
      this.objectEvents(section, { name, namespace: ns }),
    ]);
    const metadata = manifest.metadata || {};
    return {
      ok: true,
      section,
      title: def.label,
      name: String(metadata.name || name),
      namespace: ns,
      kind: String(manifest.kind || ''),
      context: state.selected,
      created: metadata.creationTimestamp || null,
      labels: metadata.labels && typeof metadata.labels === 'object' ? metadata.labels : {},
      annotations: metadata.annotations && typeof metadata.annotations === 'object' ? metadata.annotations : {},
      manifest,
      summary: summary.sections || [],
      containers: summary.containers || [],
      commands: objectCommands(section, { context: state.selected, namespace: ns, name: String(metadata.name || name) }),
      events: eventsResult.rows || [],
      eventsError: eventsResult.error || '',
      describe: describeResult.ok ? String(describeResult.stdout || '').slice(0, 24000) : '',
      describeError: describeResult.ok ? '' : scrub(describeResult.stderr || 'Could not describe this object.', 400),
      actions: actionsFor(section),
    };
  }

  async resourceAction(section, action, { name, namespace, replicas } = {}) {
    let plan;
    try {
      plan = actionArgs(section, action, name, { namespace, replicas });
    } catch (error) {
      return { ok: false, error: error.message };
    }

    const [tools, state] = await Promise.all([this.tools(), this.contextState()]);
    if (!tools.tools.kubectl.installed) return { ok: false, error: 'kubectl is not installed.' };
    if (!state.selected) return { ok: false, error: 'Choose a context before changing objects.' };

    const res = await this.kube(plan.args, {
      timeout: 20000,
      context: state.selected,
      namespace: plan.namespace,
    });
    if (!res.ok) {
      return { ok: false, error: scrub(res.stderr || `The ${action} command failed.`, 600) };
    }
    return {
      ok: true,
      section,
      action,
      name,
      namespace: plan.namespace,
      replicas: plan.replicas,
      message: scrub(String(res.stdout || '').trim(), 400) || `${action} requested.`,
    };
  }

  async helmReleases({ allNamespaces = false } = {}) {
    const [tools, state] = await Promise.all([this.tools(), this.contextState()]);
    const base = {
      ok: true,
      section: 'helm',
      title: 'Helm releases',
      columns: ['Name', 'Namespace', 'Revision', 'Updated', 'Status', 'Chart', 'App version'],
      namespaced: true,
      allNamespaces: allNamespaces === true,
      contexts: state.contexts,
      selected: state.selected,
      namespace: state.namespace,
      tools: tools.tools,
      checkedAt: tools.checkedAt,
      rows: [],
      total: 0,
      truncated: false,
      error: '',
    };
    if (!tools.tools.helm.installed) return { ...base, error: 'Helm is not installed. Open Tools to install it.' };
    if (!state.selected) return base;

    const args = ['list', '-o', 'json', '--kube-context', state.selected];
    if (allNamespaces === true) args.push('--all-namespaces');
    else args.push('--namespace', state.namespace);
    const res = await run('helm', args, { timeout: 20000, env: this.env() });
    if (!res.ok) return { ...base, error: scrub(res.stderr || 'Could not list Helm releases.', 600) };

    let data = [];
    try { data = JSON.parse(String(res.stdout || '[]')); } catch {
      return { ...base, error: 'Helm returned output OpsDeck could not read as JSON.' };
    }
    const releases = Array.isArray(data) ? data : [];
    const toneFor = (status) => {
      if (status === 'deployed') return 'green';
      if (status === 'failed') return 'red';
      if (/pending|uninstalling/.test(status || '')) return 'amber';
      return 'slate';
    };
    const rows = releases.slice(0, 500).map((release) => {
      const updated = Date.parse(release.updated || '');
      return {
        name: String(release.name || ''),
        namespace: String(release.namespace || ''),
        created: Number.isFinite(updated) ? new Date(updated).toISOString() : null,
        sortAt: Number.isFinite(updated) ? updated : 0,
        cells: [
          { text: String(release.name || '—'), strong: true, mono: true },
          { text: String(release.namespace || '—'), mono: true },
          { text: String(release.revision || '—'), mono: true },
          Number.isFinite(updated) ? { text: new Date(updated).toISOString(), age: true } : { text: String(release.updated || '—') },
          { text: String(release.status || '—'), badge: true, tone: toneFor(release.status) },
          { text: String(release.chart || '—'), mono: true },
          { text: String(release.app_version || '—'), mono: true },
        ],
        status: String(release.status || ''),
        chart: String(release.chart || ''),
      };
    });
    return { ...base, rows, total: releases.length, truncated: releases.length > rows.length };
  }

  async topology() {
    const [tools, state] = await Promise.all([this.tools(), this.contextState()]);
    const base = {
      ok: true,
      section: 'topology',
      title: 'Cluster map',
      contexts: state.contexts,
      selected: state.selected,
      namespace: state.namespace,
      tools: tools.tools,
      checkedAt: tools.checkedAt,
      connection: null,
      commands: sectionCommands('topology', { context: state.selected, namespace: state.namespace }),
      model: null,
      error: '',
    };
    const emptyModel = (error = '') => buildTopology({
      errors: error ? [{ resource: 'cluster', error }] : [],
      context: state.selected,
      namespace: state.namespace,
    }, { context: state.selected, namespace: state.namespace });

    if (!tools.tools.kubectl.installed) {
      return { ...base, model: emptyModel('kubectl is not installed.'), error: 'kubectl is not installed.' };
    }
    if (!state.selected) {
      return { ...base, model: emptyModel('No Kubernetes context is selected.') };
    }

    const connection = await this.connection(state);
    base.connection = connection;
    if (!connection.connected) {
      return { ...base, model: emptyModel(connection.reason || 'The selected context is not connected.') };
    }

    const context = state.selected;
    const all = (args, timeout = 25000) => this.kubeJson([...args, '--all-namespaces', '-o', 'json'], { timeout, context });
    // Multiple resource types must be comma-separated: `kubectl get a b` is
    // parsed as TYPE NAME. Namespaced and cluster-scoped resources also need
    // separate calls because one request cannot mix both scopes.
    const inventoryNamespaced = [
      'configmaps', 'secrets', 'persistentvolumeclaims', 'serviceaccounts',
      'roles.rbac.authorization.k8s.io', 'rolebindings.rbac.authorization.k8s.io',
      'networkpolicies.networking.k8s.io', 'resourcequotas', 'limitranges',
      'jobs.batch', 'cronjobs.batch',
    ];
    const inventoryCluster = ['persistentvolumes', 'storageclasses.storage.k8s.io'];
    const inventoryPrefix = {
      configmap: 'configmaps', secret: 'secrets', persistentvolumeclaim: 'persistentvolumeclaims',
      persistentvolume: 'persistentvolumes', 'storageclass.storage.k8s.io': 'storageclasses',
      serviceaccount: 'serviceaccounts', 'role.rbac.authorization.k8s.io': 'roles',
      'rolebinding.rbac.authorization.k8s.io': 'rolebindings',
      'networkpolicy.networking.k8s.io': 'networkpolicies', resourcequota: 'resourcequotas',
      limitrange: 'limitranges', 'job.batch': 'jobs', 'cronjob.batch': 'cronjobs',
    };

    const [nsRes, nodeRes, podRes, deploymentRes, statefulsetRes, daemonsetRes, serviceRes, ingressRes, eventRes, inventoryRes, inventoryClusterRes] = await Promise.all([
      all(['get', 'namespaces']),
      all(['get', 'nodes']),
      all(['get', 'pods']),
      all(['get', 'deployments.apps']),
      all(['get', 'statefulsets.apps']),
      all(['get', 'daemonsets.apps']),
      all(['get', 'services']),
      all(['get', 'ingresses.networking.k8s.io']),
      all(['get', 'events', '--field-selector=type=Warning']),
      this.kube(['get', inventoryNamespaced.join(','), '--all-namespaces', '-o', 'name'], { timeout: 25000, context }),
      this.kube(['get', inventoryCluster.join(','), '-o', 'name'], { timeout: 25000, context }),
    ]);

    const items = (result) => (result.ok && Array.isArray(result.data?.items) ? result.data.items : []);
    const errors = [];
    const note = (resource, result) => {
      if (!result.ok) errors.push({ resource, error: scrub(result.stderr || `Could not read ${resource}.`, 400) });
    };
    note('namespaces', nsRes);
    note('nodes', nodeRes);
    note('pods', podRes);
    note('deployments', deploymentRes);
    note('statefulsets', statefulsetRes);
    note('daemonsets', daemonsetRes);
    note('services', serviceRes);
    note('ingresses', ingressRes);
    note('warnings', eventRes);

    const inventory = {
      configmaps: 0, secrets: 0, persistentvolumeclaims: 0, persistentvolumes: 0,
      storageclasses: 0, serviceaccounts: 0, roles: 0, rolebindings: 0,
      networkpolicies: 0, resourcequotas: 0, limitranges: 0, jobs: 0, cronjobs: 0,
    };
    let inventoryError = '';
    const countInventory = (result) => {
      if (!result.ok) return false;
      for (const line of countLines(result.stdout)) {
        const prefix = line.split('/')[0];
        const id = inventoryPrefix[prefix];
        if (id) inventory[id] += 1;
      }
      return true;
    };
    const namespacedInventoryOk = countInventory(inventoryRes);
    const clusterInventoryOk = countInventory(inventoryClusterRes);
    if (!namespacedInventoryOk || !clusterInventoryOk) {
      inventoryError = scrub(
        inventoryRes.stderr || inventoryClusterRes.stderr || 'Could not count the remaining resources.',
        400,
      );
      errors.push({ resource: 'inventory', error: inventoryError });
    }

    const model = buildTopology({
      namespaces: items(nsRes),
      nodes: items(nodeRes),
      pods: items(podRes),
      deployments: items(deploymentRes),
      statefulsets: items(statefulsetRes),
      daemonsets: items(daemonsetRes),
      services: items(serviceRes),
      ingresses: items(ingressRes),
      warnings: items(eventRes),
      inventory,
      inventoryError,
      errors,
      context,
      namespace: state.namespace,
      collectedAt: new Date().toISOString(),
    }, { context, namespace: state.namespace });

    return { ...base, model };
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

module.exports = { KubernetesService, __test: { trimNode, trimNamespace, validContext, validNamespace, countLines, parseMinikubeStatus } };
