'use strict';

const { ipcMain, shell, clipboard } = require('electron');
const { spawn } = require('node:child_process');
const path = require('node:path');
const os = require('node:os');
const fs = require('node:fs');
const docker = require('./docker');
const exec = require('./exec');
const { ContentService } = require('./content');
const { AcademyStore } = require('./store');
const { LabService } = require('./labs');
const { AIService } = require('./ai');
const { KubernetesService } = require('./kubernetes');
const { DatabaseService } = require('./databases');
const { ObservabilityService } = require('./observability');
const { IntelligenceService } = require('./intelligence');

function registerIpc({ getWindow, dialog, app }) {
  const content = new ContentService(app);
  const kubernetes = new KubernetesService({ app, dialog, getWindow });
  const databases = new DatabaseService({ app, docker, kubernetes });
  const observability = new ObservabilityService({ app, docker, kubernetes, databases, getWindow });
  const intelligence = new IntelligenceService({ app, docker, kubernetes, databases, observability, getWindow });
  const ai = new AIService({ app, content, kubernetes, databases, observability });
  const store = new AcademyStore(path.join(app.getPath('userData'), 'academy.db'));
  const storeReady = store.init().catch((error) => {
    console.error('Academy store failed to initialise:', error);
    throw error;
  });
  const labs = new LabService(app, (event) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('lab:event', event);
  });

  const handle = (channel, fn) => {
    ipcMain.handle(channel, async (event, payload) => {
      try {
        return await fn(payload, event);
      } catch (error) {
        console.error(`IPC ${channel}:`, error);
        return { ok: false, error: error.message || 'Unexpected error' };
      }
    });
  };

  handle('app:info', () => ({
    ok: true,
    name: 'OpsDeck',
    version: app.getVersion(),
    electron: process.versions.electron,
    chrome: process.versions.chrome,
    node: process.versions.node,
    platform: process.platform,
    arch: process.arch,
    hostname: os.hostname(),
    userData: app.getPath('userData'),
    contentVersion: content.version,
    isDev: !app.isPackaged,
  }));

  handle('app:open-external', (url) => {
    if (typeof url !== 'string' || !/^https?:\/\//i.test(url)) return { ok: false, error: 'Only http(s) links can open.' };
    shell.openExternal(url);
    return { ok: true };
  });

  handle('app:copy', (text) => {
    clipboard.writeText(String(text ?? ''));
    return { ok: true };
  });

  handle('app:read-clipboard', () => clipboard.readText());

  handle('app:open-firefox', (rawUrl) => {
    if (typeof rawUrl !== 'string' || rawUrl.length > 2048) {
      return { ok: false, error: 'The address is not valid.' };
    }
    let parsed;
    try { parsed = new URL(rawUrl); } catch { return { ok: false, error: 'The address is not valid.' }; }
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') {
      return { ok: false, error: 'Only http and https addresses can open in Firefox.' };
    }
    return new Promise((resolve) => {
      let settled = false;
      const finish = (value) => { if (!settled) { settled = true; resolve(value); } };
      let child;
      try {
        child = spawn('firefox', ['--new-tab', parsed.href], { detached: true, stdio: 'ignore' });
      } catch (error) {
        finish({ ok: false, error: error.message });
        return;
      }
      child.once('error', (error) => {
        finish({
          ok: false,
          error: error.code === 'ENOENT'
            ? 'Firefox was not found on PATH. Install Firefox or add it to your PATH.'
            : error.message,
        });
      });
      child.once('spawn', () => {
        child.unref();
        finish({ ok: true, url: parsed.href });
      });
    });
  });

  handle('app:relaunch', () => {
    app.relaunch();
    app.exit(0);
    return { ok: true };
  });

  // ---------------- Docker ----------------
  handle('docker:status', () => docker.status());
  handle('docker:overview', () => docker.overview());
  handle('docker:containers', () => docker.containersList());
  handle('docker:container-inspect', (id) => docker.inspectContainer(id));
  handle('docker:container-logs', (p) => docker.containerLogs(p?.id, p?.tail));
  handle('docker:container-action', (p) => docker.containerAction(p?.id, p?.action, p?.options));
  handle('docker:exec-capabilities', () => exec.capabilities());
  handle('docker:exec-start', (p, event) => exec.start(p?.id, event.sender, {
    pty: p?.pty === true,
    cols: p?.cols,
    rows: p?.rows,
  }));
  handle('docker:exec-input', (p, event) => exec.input(p?.sessionId, p?.data, event.sender.id));
  handle('docker:exec-stop', (p, event) => exec.stop(p?.sessionId, event.sender.id));
  handle('docker:images', () => docker.imagesList());
  handle('docker:image-action', (p) => docker.imageAction(p?.id, p?.action, p?.options));
  handle('docker:volumes', () => docker.volumesList());
  handle('docker:volume-action', (p) => docker.volumeAction(p?.name, p?.action, p?.options));
  handle('docker:networks', () => docker.networksList());
  handle('docker:network-action', (p) => docker.networkAction(p?.name, p?.action, p?.options));
  handle('docker:compose-list', () => docker.composeList());
  handle('docker:compose-config', (project) => docker.composeConfig(project));
  handle('docker:compose-action', (p) => docker.composeAction(p?.project, p?.action, p?.options));
  handle('docker:builds', () => docker.builds());
  handle('docker:registries', () => docker.registries());
  handle('docker:registry-search', (query) => docker.searchRegistry(query));
  handle('docker:stats', () => docker.stats());
  handle('docker:events', (since) => docker.events(since));
  handle('docker:system-df', () => docker.systemDf());
  handle('docker:command-index', () => docker.commandIndex());
  handle('docker:command-help', (command) => docker.commandHelp(command));
  handle('docker:terminal-run', (p) => docker.terminalRun(p?.command, p?.consent === true));
  handle('docker:pick-compose', () => docker.pickComposeFile(dialog, getWindow()));

  // ---------------- Kubernetes ----------------
  handle('k8s:bootstrap', () => kubernetes.bootstrap());
  handle('k8s:tools', () => kubernetes.tools(true));
  handle('k8s:contexts', () => kubernetes.contextState());
  handle('k8s:select-context', (p) => kubernetes.selectContext(p?.context));
  handle('k8s:namespace', (p) => kubernetes.setNamespace(p?.namespace));
  handle('k8s:import-kubeconfig', () => kubernetes.importKubeconfig());
  handle('k8s:remove-kubeconfig', (p) => kubernetes.removeKubeconfig(p?.id));
  handle('k8s:dashboard', () => kubernetes.dashboard());
  handle('k8s:topology', () => kubernetes.topology());
  handle('k8s:resources', (p) => kubernetes.resources(p?.section, { allNamespaces: p?.allNamespaces === true }));
  handle('k8s:resource-detail', (p) => kubernetes.resourceDetail(p?.section, { name: p?.name, namespace: p?.namespace }));
  handle('k8s:resource-action', (p) => kubernetes.resourceAction(p?.section, p?.action, { name: p?.name, namespace: p?.namespace, replicas: p?.replicas }));
  handle('k8s:commands', (p) => kubernetes.commandList(p?.section, { name: p?.name, namespace: p?.namespace, allNamespaces: p?.allNamespaces === true }));
  handle('k8s:run-command', (p) => kubernetes.runCommand(p?.command));
  handle('k8s:pod-logs', (p) => kubernetes.podLogs({ name: p?.name, namespace: p?.namespace, container: p?.container, tailLines: p?.tailLines, previous: p?.previous === true }));
  handle('k8s:shell-start', (p, event) => kubernetes.shellStart(p, event.sender, { pty: p?.pty === true, cols: p?.cols, rows: p?.rows }));
  handle('k8s:shell-input', (p, event) => kubernetes.shellInput(p?.sessionId, p?.data, event.sender.id));
  handle('k8s:shell-resize', (p, event) => kubernetes.shellResize(p?.sessionId, p?.cols, p?.rows, event.sender.id));
  handle('k8s:shell-stop', (p, event) => kubernetes.shellStop(p?.sessionId, event.sender.id));
  handle('k8s:minikube-status', () => kubernetes.minikubeStatus());
  handle('k8s:minikube-action', (p) => kubernetes.minikubeAction(p?.action));
  handle('k8s:helm-releases', (p) => kubernetes.helmReleases({ allNamespaces: p?.allNamespaces === true }));
  handle('k8s:install-status', () => kubernetes.installStatus());
  handle('k8s:install-tools', () => kubernetes.installTools((event) => {
    const win = getWindow();
    if (win && !win.isDestroyed()) win.webContents.send('k8s:install-progress', event);
  }));

  // ---------------- AI assistant ----------------
  handle('ai:config', () => ai.publicConfig());
  handle('ai:save-config', (p) => ai.saveConfig(p || {}));
  handle('ai:clear-key', () => ai.clearKey());
  handle('ai:test', (p) => ai.test(p || {}));
  handle('ai:detect', (p) => ai.detectCli(p || {}));
  handle('ai:models', (p) => ai.listModels(p || {}));
  handle('ai:save-to-inkwell', (p) => ai.saveToInkwell(p || {}));
  handle('ai:context', (p, event) => ai.context(event.sender.id, p || {}));
  handle('ai:ask', (p, event) => ai.ask(event.sender.id, p || {}));
  handle('ai:cancel', (_p, event) => ai.cancel(event.sender.id));

  // ---------------- Academy ----------------
  handle('academy:bootstrap', async () => {
    await storeReady;
    const academy = content.load();
    return { ok: true, academy, progress: store.getProgress() };
  });

  handle('academy:reload', async () => {
    await storeReady;
    return { ok: true, academy: content.load(), progress: store.getProgress() };
  });

  handle('academy:progress', async () => {
    await storeReady;
    return { ok: true, progress: store.getProgress() };
  });

  handle('academy:lesson-progress', async (p) => {
    await storeReady;
    return store.setLessonProgress(p || {});
  });

  handle('academy:quiz-save', async (p) => {
    await storeReady;
    return store.saveQuiz(p || {});
  });

  handle('academy:bookmark', async (lessonId) => {
    await storeReady;
    return store.toggleBookmark(lessonId);
  });

  handle('academy:note', async (p) => {
    await storeReady;
    return store.saveNote(p || {});
  });

  handle('academy:view', async (p) => {
    await storeReady;
    return store.recordView(p || {});
  });

  handle('academy:achievement', async (id) => {
    await storeReady;
    return store.unlockAchievement(id);
  });

  handle('academy:reset', async () => {
    await storeReady;
    return store.resetProgress();
  });

  handle('settings:get', async () => {
    await storeReady;
    return { ok: true, settings: store.getSettings() };
  });

  handle('settings:set', async (p) => {
    await storeReady;
    if (!p || typeof p.key !== 'string') return { ok: false, error: 'Invalid setting' };
    return store.setSetting(p.key, p.value);
  });

  // ---------------- Database workspace ----------------
  handle('db:bootstrap', () => databases.bootstrap());
  handle('db:connections', () => ({ ok: true, connections: databases.listConnections(), stats: databases.store.stats() }));
  handle('db:connection-save', (p) => databases.saveConnection(p || {}));
  handle('db:connection-delete', (p) => databases.deleteConnection(p?.id));
  handle('db:connection-duplicate', (p) => databases.duplicateConnection(p?.id));
  handle('db:connection-favorite', (p) => databases.setFavorite(p?.id, p?.favorite === true));
  handle('db:connection-test', (p) => databases.testConnection(p || {}));
  handle('db:connection-connect', (p) => databases.openSession(p?.id).then((session) => ({ ok: true, status: databases.sessionStatus(p.id), info: session.info })));
  handle('db:connection-disconnect', (p) => databases.disconnect(p?.id));
  handle('db:connection-reconnect', (p) => databases.reconnect(p?.id));
  handle('db:connections-export', () => databases.exportConnections());
  handle('db:connections-import', (p) => databases.importConnections(p || {}));

  handle('db:connections-export-file', async () => {
    const payload = databases.exportConnections();
    const chosen = await dialog.showSaveDialog(getWindow(), {
      title: 'Export connection profiles',
      defaultPath: 'opsdeck-databases.json',
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (chosen.canceled || !chosen.filePath) return { ok: false, canceled: true };
    fs.writeFileSync(chosen.filePath, JSON.stringify(payload, null, 2), { mode: 0o600 });
    return { ok: true, file: chosen.filePath, count: payload.connections.length };
  });

  handle('db:connections-import-file', async () => {
    const chosen = await dialog.showOpenDialog(getWindow(), {
      title: 'Import connection profiles',
      properties: ['openFile'],
      filters: [{ name: 'JSON', extensions: ['json'] }],
    });
    if (chosen.canceled || !chosen.filePaths?.[0]) return { ok: false, canceled: true };
    const stat = fs.statSync(chosen.filePaths[0]);
    if (stat.size > 4 * 1024 * 1024) return { ok: false, error: 'The import file is larger than 4 MB.' };
    let parsed;
    try { parsed = JSON.parse(fs.readFileSync(chosen.filePaths[0], 'utf8')); } catch { return { ok: false, error: 'The import file is not valid JSON.' }; }
    return databases.importConnections(parsed);
  });
  handle('db:connection-diagnostics', (p) => databases.diagnostics(p?.id));
  handle('db:connection-info', (p) => databases.serverInfo(p?.id));
  handle('db:databases', (p) => databases.listDatabases(p?.id));
  handle('db:explorer', (p) => databases.explorer(p || {}));
  handle('db:table-data', (p) => databases.tableData(p || {}));
  handle('db:query', (p) => databases.query(p || {}));
  handle('db:explain', (p) => databases.explain(p || {}));
  handle('db:cancel', (p) => databases.cancel(p || {}));
  handle('db:ai-query', async (p, event) => {
    const payload = p || {};
    let schema;
    try {
      schema = await databases.aiSchema(payload);
    } catch (error) {
      return { ok: false, error: error.message || String(error) };
    }
    if (!schema.ok) return schema;
    return ai.askSql(event.sender.id, { ...schema, question: payload.question });
  });
  handle('db:metrics', (p) => databases.metrics(p?.id));
  handle('db:discovery', (p) => databases.discover({ refresh: p?.refresh === true }));
  handle('db:discovery-connect', (p) => databases.createFromDiscovery(p || {}));
  handle('db:local-action', (p) => databases.localAction(p || {}));
  handle('db:create-database', (p) => databases.createDatabase(p || {}));
  handle('db:drop-database', (p) => databases.dropDatabase(p || {}));
  handle('db:redis-scan', (p) => databases.redisScan(p || {}));
  handle('db:redis-key', (p) => databases.redisKey(p || {}));
  handle('db:redis-write', (p) => databases.redisWrite(p || {}));
  handle('db:mongo-aggregate', (p) => databases.mongoAggregate(p || {}));
  handle('db:history', (p) => databases.history(p || {}));
  handle('db:history-clear', () => databases.clearHistory());
  handle('db:activity', (p) => databases.activityList(p || {}));

  handle('db:pick-sqlite', async () => {
    const result = await dialog.showOpenDialog(getWindow(), {
      title: 'Open SQLite database',
      properties: ['openFile'],
      filters: [{ name: 'SQLite database', extensions: ['db', 'sqlite', 'sqlite3', 'db3'] }, { name: 'All files', extensions: ['*'] }],
    });
    if (result.canceled || !result.filePaths?.[0]) return { ok: false, canceled: true };
    return { ok: true, file: result.filePaths[0] };
  });

  handle('db:export-result', async (p) => {
    const format = ['csv', 'json', 'sql'].includes(p?.format) ? p.format : 'json';
    let target = typeof p?.path === 'string' ? p.path : '';
    if (!target) {
      const chosen = await dialog.showSaveDialog(getWindow(), {
        title: 'Export query results',
        defaultPath: `query-results.${format === 'sql' ? 'sql' : format}`,
        filters: [{ name: format.toUpperCase(), extensions: [format === 'sql' ? 'sql' : format] }],
      });
      if (chosen.canceled || !chosen.filePath) return { ok: false, canceled: true };
      target = chosen.filePath;
    }
    return databases.exportResult({ ...p, path: target, format });
  });

  // ---------------- Observability ----------------
  const obsDetail = (key) => {
    const method = {
      local: 'localDetail',
      docker: 'dockerDetail',
      kubernetes: 'kubernetesDetail',
      databases: 'databaseDetail',
      remote: 'remoteDetail',
      synthetic: 'syntheticDetail',
      network: 'networkDetail',
      applications: 'applicationDetail',
    }[key];
    return method ? observability[method]() : { ok: false, error: 'Unknown collector.' };
  };

  handle('obs:bootstrap', () => observability.bootstrap());
  handle('obs:overview', (p) => observability.overview(p || {}));
  handle('obs:collector', (p) => obsDetail(p?.key));
  handle('obs:settings-update', (p) => observability.updateSettings(p || {}));

  handle('obs:metrics-query', (p) => observability.metricsQuery(p || {}));
  handle('obs:metrics-catalog', (p) => observability.metricsCatalog(p || {}));
  handle('obs:metrics-labels', (p) => observability.metricsLabels(p?.name, p?.label));
  handle('obs:metrics-export', (p) => observability.metricsExport(p || {}));

  handle('obs:dashboards', () => observability.dashboardList());
  handle('obs:dashboard-get', (p) => observability.dashboardGet(p?.id));
  handle('obs:dashboard-save', (p) => observability.dashboardSave(p || {}));
  handle('obs:dashboard-delete', (p) => observability.dashboardDelete(p?.id));
  handle('obs:dashboard-duplicate', (p) => observability.dashboardDuplicate(p?.id));
  handle('obs:dashboard-favorite', (p) => observability.dashboardFavorite(p?.id));
  handle('obs:dashboard-data', (p) => observability.dashboardData(p || {}));

  handle('obs:servers', () => ({ ok: true, servers: observability.listServers() }));
  handle('obs:server-save', (p) => observability.saveServer(p || {}));
  handle('obs:server-delete', (p) => observability.deleteServer(p?.id));
  handle('obs:server-test', (p) => observability.testServer(p?.id));

  handle('obs:targets', () => ({ ok: true, targets: observability.listTargets() }));
  handle('obs:target-save', (p) => observability.saveTarget(p || {}));
  handle('obs:target-delete', (p) => observability.deleteTarget(p?.id));
  handle('obs:target-test', (p) => observability.testTarget(p?.id));

  handle('obs:network', () => ({ ok: true, checks: observability.listNetworkChecks(), devices: observability.listNetworkDevices() }));
  handle('obs:network-check-save', (p) => observability.saveNetworkCheck(p || {}));
  handle('obs:network-check-delete', (p) => observability.deleteNetworkCheck(p?.id));
  handle('obs:network-device-save', (p) => observability.saveNetworkDevice(p || {}));
  handle('obs:network-device-delete', (p) => observability.deleteNetworkDevice(p?.id));

  handle('obs:logs-bootstrap', () => observability.logsBootstrap());
  handle('obs:logs-query', (p) => observability.logsQuery(p || {}));
  handle('obs:logs-collect', (p) => observability.logsCollect(p || {}));
  handle('obs:logs-clear', () => observability.logsClear());
  handle('obs:logs-export', (p) => observability.logsExport(p || {}));

  handle('obs:traces-bootstrap', () => observability.tracesBootstrap());
  handle('obs:traces-query', (p) => observability.tracesQuery(p || {}));
  handle('obs:trace-get', (p) => observability.traceGet(p?.id));
  handle('obs:traces-clear', () => observability.tracesClear());

  handle('obs:alert-rules', () => observability.alertRules());
  handle('obs:alert-rule-save', (p) => observability.alertRuleSave(p || {}));
  handle('obs:alert-rule-delete', (p) => observability.alertRuleDelete(p?.id));
  handle('obs:alerts', (p) => observability.alertsList(p || {}));
  handle('obs:alert-acknowledge', (p) => observability.alertAcknowledge(p?.id, p?.by));
  handle('obs:alert-resolve', (p) => observability.alertResolve(p?.id, p?.note));
  handle('obs:silences', () => observability.silences());
  handle('obs:silence-create', (p) => observability.silenceCreate(p || {}));
  handle('obs:silence-delete', (p) => observability.silenceDelete(p?.id));

  handle('obs:incidents', (p) => observability.incidentsList(p || {}));
  handle('obs:incident-get', (p) => observability.incidentGet(p?.id));
  handle('obs:incident-create', (p) => observability.incidentCreate(p || {}));
  handle('obs:incident-update', (p) => observability.incidentUpdate(p?.id, p?.patch || {}));
  handle('obs:incident-merge', (p) => observability.incidentMerge(Array.isArray(p?.ids) ? p.ids : []));

  handle('obs:integrations', () => observability.integrationsList());
  handle('obs:integration-save', (p) => observability.integrationSave(p || {}));
  handle('obs:integration-delete', (p) => observability.integrationDelete(p?.id));
  handle('obs:integration-test', (p) => observability.integrationTest(p?.id));
  handle('obs:integration-discover', (p) => observability.integrationDiscover(p?.id));
  handle('obs:integration-query', (p) => observability.integrationQuery(p?.id, p?.expression, p?.options || {}));

  handle('obs:channels', () => ({ ok: true, channels: observability.listChannels() }));
  handle('obs:channel-save', (p) => observability.saveChannel(p || {}));
  handle('obs:channel-delete', (p) => observability.deleteChannel(p?.id));
  handle('obs:channel-test', (p) => observability.testChannel(p?.id));

  handle('obs:report-types', () => observability.reportTypes());
  handle('obs:report-generate', (p) => observability.reportGenerate(p || {}));
  handle('obs:report-export-file', async (p) => {
    const report = observability.reportGenerate(p || {});
    if (!report.ok) return report;
    const ext = report.mime === 'application/pdf' ? 'pdf' : report.mime === 'text/csv' ? 'csv' : 'json';
    const chosen = await dialog.showSaveDialog(getWindow(), {
      title: 'Save observability report',
      defaultPath: report.filename,
      filters: [{ name: ext.toUpperCase(), extensions: [ext] }],
    });
    if (chosen.canceled || !chosen.filePath) return { ok: false, canceled: true };
    const encoding = report.encoding === 'base64' ? 'base64' : 'utf8';
    fs.writeFileSync(chosen.filePath, report.content, { mode: 0o600, encoding });
    return { ok: true, file: chosen.filePath, bytes: Buffer.byteLength(report.content, encoding), filename: report.filename };
  });

  handle('obs:agents', () => observability.agentsStatus());
  handle('obs:agent-create', (p) => observability.agentCreate(p || {}));
  handle('obs:agent-revoke', (p) => observability.agentRevoke(p?.id));
  handle('obs:agent-remove', (p) => observability.agentRemove(p?.id));
  handle('obs:agents-restart', () => observability.agentsRestart());

  handle('obs:remediation', () => observability.remediationStatus());
  handle('obs:remediation-policy-save', (p) => observability.remediationPolicySave(p || {}));
  handle('obs:remediation-policy-delete', (p) => observability.remediationPolicyDelete(p?.id));
  handle('obs:remediation-enable', (p) => observability.remediationEnable(p?.enabled === true));
  handle('obs:remediation-execute', (p) => observability.remediationExecute(p?.id, p?.options || {}));
  handle('obs:export-config', () => observability.exportConfig());
  handle('obs:ai-snapshot', () => observability.aiSnapshot());

  handle('obs:export-file', async (p) => {
    const payload = p || {};
    const content = String(payload.content || '');
    if (!content) return { ok: false, error: 'There is nothing to export.' };
    const format = ['csv', 'json', 'pdf'].includes(payload.format) ? payload.format : 'json';
    const chosen = await dialog.showSaveDialog(getWindow(), {
      title: 'Export observability data',
      defaultPath: payload.filename || `opsdeck-observability.${format}`,
      filters: [{ name: format.toUpperCase(), extensions: [format] }],
    });
    if (chosen.canceled || !chosen.filePath) return { ok: false, canceled: true };
    const encoding = payload.encoding === 'base64' ? 'base64' : 'utf8';
    fs.writeFileSync(chosen.filePath, content, { mode: 0o600, encoding });
    return { ok: true, file: chosen.filePath, bytes: Buffer.byteLength(content, encoding) };
  });

  // ---------------- Cross-module intelligence ----------------
  handle('intel:bootstrap', () => intelligence.bootstrap());
  handle('intel:status', () => intelligence.status());
  handle('intel:refresh', () => intelligence.refresh({ force: true }));
  handle('intel:resources', (p) => intelligence.resources(p || {}));
  handle('intel:search', (p) => intelligence.search(p || {}));
  handle('intel:graph', (p) => intelligence.graph(p || {}));
  handle('intel:timeline', (p) => intelligence.timeline(p || {}));
  handle('intel:changes', (p) => intelligence.changesHistory(p || {}));
  handle('intel:changes-detect', () => intelligence.detectChanges());

  handle('intel:environments', () => intelligence.environmentsList());
  handle('intel:environments-summary', () => intelligence.environmentsSummary());
  handle('intel:environment-assign', (p) => intelligence.environmentAssign(p?.resourceId, p?.environment));
  handle('intel:environment-save', (p) => intelligence.environmentSave(p || {}));
  handle('intel:environment-delete', (p) => intelligence.environmentDelete(p?.id));
  handle('intel:environment-rule-save', (p) => intelligence.environmentRuleSave(p || {}));
  handle('intel:environment-rule-delete', (p) => intelligence.environmentRuleDelete(p?.id));

  handle('intel:incidents', (p) => intelligence.listIncidents(p || {}));
  handle('intel:incident-get', (p) => intelligence.incidentGet(p?.id));
  handle('intel:incident-create', (p) => intelligence.incidentCreate(p || {}));
  handle('intel:alerts', (p) => intelligence.listAlerts(p || {}));
  handle('intel:reports', () => intelligence.reportTypes());
  handle('intel:report-generate', (p) => intelligence.reportGenerate(p || {}));
  handle('intel:investigate', (p) => intelligence.investigate(p || {}));

  handle('intel:automations', () => intelligence.automations());
  handle('intel:automation-save', (p) => intelligence.automationSave(p || {}));
  handle('intel:automation-delete', (p) => intelligence.automationDelete(p?.id));
  handle('intel:automation-enable', (p) => intelligence.automationSetEnabled(p?.id, p?.enabled === true));
  handle('intel:automation-run', (p) => intelligence.automationRun(p?.id, { dryRun: p?.dryRun === true }));
  handle('intel:automation-approve', (p) => intelligence.automationApprove(p?.runId));
  handle('intel:automation-reject', (p) => intelligence.automationReject(p?.runId, p?.reason));
  handle('intel:automation-cancel', (p) => intelligence.automationCancel(p?.runId));
  handle('intel:automation-runs', (p) => intelligence.automationRuns(p || {}));
  handle('intel:automation-tick', () => intelligence.automationTick());

  handle('intel:audit', (p) => intelligence.auditList(p || {}));
  handle('intel:favorite', (p) => intelligence.favorite(p || {}));
  handle('intel:favorites', () => intelligence.favorites());
  handle('intel:search-save', (p) => intelligence.saveSearch(p || {}));
  handle('intel:searches', () => intelligence.savedSearches());
  handle('intel:search-remove', (p) => intelligence.removeSaved(p?.id));
  handle('intel:workspace-save', (p) => intelligence.saveWorkspace(p || {}));
  handle('intel:workspaces', () => intelligence.workspaces());
  handle('intel:workspace-remove', (p) => intelligence.removeWorkspace(p?.id));
  handle('intel:settings-update', (p) => intelligence.updateSettings(p || {}));
  handle('intel:diagnostics', (p) => intelligence.diagnostics(p || {}));
  handle('intel:notify', (p) => intelligence.notify(p || {}));

  observability.start().catch((error) => {
    console.error('Observability service failed to start:', error);
  });
  intelligence.start();

  // ---------------- Labs ----------------
  handle('labs:status', () => labs.status());
  handle('labs:run', (p) => labs.run(p || {}));
  handle('labs:write-file', (p) => labs.writeFile(p || {}));
  handle('labs:read-file', (p) => labs.readFile(p || {}));
  handle('labs:files', (labId) => ({ ok: true, files: labs.listFiles(labId) }));
  handle('labs:reset', (labId) => labs.reset(labId));
  handle('labs:consent', () => labs.consent());

  // Persist state and close container shells on quit.
  app.on('before-quit', () => {
    store.persistNow();
    exec.stopAll();
    ai.dispose();
    observability.dispose().catch(() => {});
    intelligence.dispose();
    databases.disposeAll().catch(() => {});
  });
}

module.exports = { registerIpc };
