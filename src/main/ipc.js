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

function registerIpc({ getWindow, dialog, app }) {
  const content = new ContentService(app);
  const ai = new AIService({ app, content });
  const kubernetes = new KubernetesService({ app, dialog, getWindow });
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
  });
}

module.exports = { registerIpc };
