'use strict';

const { contextBridge, ipcRenderer } = require('electron');

const invoke = (channel, payload) => ipcRenderer.invoke(channel, payload);
const on = (channel, cb) => {
  const listener = (_event, data) => cb(data);
  ipcRenderer.on(channel, listener);
  return () => ipcRenderer.removeListener(channel, listener);
};

contextBridge.exposeInMainWorld('opsdeck', {
  app: {
    info: () => invoke('app:info'),
    openExternal: (url) => invoke('app:open-external', url),
    copy: (text) => invoke('app:copy', text),
    readClipboard: () => invoke('app:read-clipboard'),
    relaunch: () => invoke('app:relaunch'),
    openInFirefox: (url) => invoke('app:open-firefox', url),
  },
  window: {
    minimize: () => ipcRenderer.send('window:minimize'),
    toggleMaximize: () => ipcRenderer.send('window:toggle-maximize'),
    close: () => ipcRenderer.send('window:close'),
    isMaximized: () => invoke('window:is-maximized'),
    state: () => invoke('window:state'),
    zoom: (action, factor) => invoke('window:zoom', { action, factor }),
  },
  docker: {
    status: () => invoke('docker:status'),
    overview: () => invoke('docker:overview'),
    containers: () => invoke('docker:containers'),
    inspectContainer: (id) => invoke('docker:container-inspect', id),
    containerLogs: (id, tail) => invoke('docker:container-logs', { id, tail }),
    containerAction: (id, action, options) => invoke('docker:container-action', { id, action, options }),
    execCapabilities: () => invoke('docker:exec-capabilities'),
    execStart: (id, options) => invoke('docker:exec-start', { id, pty: options?.pty, cols: options?.cols, rows: options?.rows }),
    execInput: (sessionId, data) => invoke('docker:exec-input', { sessionId, data }),
    execStop: (sessionId) => invoke('docker:exec-stop', { sessionId }),
    images: () => invoke('docker:images'),
    imageAction: (id, action, options) => invoke('docker:image-action', { id, action, options }),
    volumes: () => invoke('docker:volumes'),
    volumeAction: (name, action, options) => invoke('docker:volume-action', { name, action, options }),
    networks: () => invoke('docker:networks'),
    networkAction: (name, action, options) => invoke('docker:network-action', { name, action, options }),
    composeList: () => invoke('docker:compose-list'),
    composeConfig: (project) => invoke('docker:compose-config', project),
    composeAction: (project, action, options) => invoke('docker:compose-action', { project, action, options }),
    builds: () => invoke('docker:builds'),
    registries: () => invoke('docker:registries'),
    searchRegistry: (query) => invoke('docker:registry-search', query),
    stats: () => invoke('docker:stats'),
    events: (since) => invoke('docker:events', since),
    systemDf: () => invoke('docker:system-df'),
    commandHelp: (command) => invoke('docker:command-help', command),
    commandIndex: () => invoke('docker:command-index'),
    runTerminal: (command, consent) => invoke('docker:terminal-run', { command, consent }),
    pickComposeFile: () => invoke('docker:pick-compose'),
  },
  academy: {
    bootstrap: () => invoke('academy:bootstrap'),
    reload: () => invoke('academy:reload'),
    progress: () => invoke('academy:progress'),
    setLesson: (payload) => invoke('academy:lesson-progress', payload),
    saveQuiz: (payload) => invoke('academy:quiz-save', payload),
    toggleBookmark: (lessonId) => invoke('academy:bookmark', lessonId),
    saveNote: (payload) => invoke('academy:note', payload),
    recordView: (payload) => invoke('academy:view', payload),
    unlockAchievement: (id) => invoke('academy:achievement', id),
    setSetting: (payload) => invoke('settings:set', payload),
    getSettings: () => invoke('settings:get'),
    reset: () => invoke('academy:reset'),
  },
  labs: {
    status: () => invoke('labs:status'),
    run: (payload) => invoke('labs:run', payload),
    writeFile: (payload) => invoke('labs:write-file', payload),
    readFile: (payload) => invoke('labs:read-file', payload),
    files: (labId) => invoke('labs:files', labId),
    reset: (labId) => invoke('labs:reset', labId),
    consent: () => invoke('labs:consent'),
  },
  events: {
    docker: (cb) => on('docker:event', cb),
    lab: (cb) => on('lab:event', cb),
    execData: (cb) => on('docker:exec-data', cb),
    execExit: (cb) => on('docker:exec-exit', cb),
    zoom: (cb) => on('window:zoom-changed', cb),
  },
});
