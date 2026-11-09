'use strict';

/**
 * Container shell sessions.
 *
 * A session is a long-lived `docker exec -i <id> <shell>` child process. Input
 * is line-oriented and forwarded over IPC; stdout/stderr are streamed back to
 * the renderer that owns the session. There is no host shell and no PTY: the
 * in-app console is deliberately a plain pipe so that shell operators typed by
 * the user are interpreted *inside* the container, never by this process.
 */

const { spawn } = require('node:child_process');
const { validId, runRaw, stripAnsi } = require('./docker');

const sessions = new Map();
let sequence = 0;

async function pickShell(id) {
  let lastError = '';
  for (const shell of ['bash', 'sh']) {
    const res = await runRaw(['exec', id, shell, '-c', 'exit 0'], { timeout: 4000 });
    if (res.ok) return { shell };
    lastError = res.stderr || lastError;
  }
  return {
    shell: null,
    error: lastError || 'This container does not provide /bin/bash or /bin/sh.',
  };
}

function send(session, channel, payload) {
  const wc = session.sender;
  if (!wc || wc.isDestroyed()) return;
  try { wc.send(channel, payload); } catch { /* window went away */ }
}

function finish(session, code, signal) {
  if (session.closed) return;
  session.closed = true;
  sessions.delete(session.id);
  send(session, 'docker:exec-exit', { sessionId: session.id, code, signal });
}

function terminate(session) {
  if (session.closed) return;
  session.closed = true;
  sessions.delete(session.id);
  try {
    if (session.proc.stdin.writable) {
      session.proc.stdin.write('exit\n');
      session.proc.stdin.end();
    }
  } catch { /* already closed */ }
  const timer = setTimeout(() => {
    try { session.proc.kill('SIGTERM'); } catch { /* already gone */ }
  }, 500);
  if (timer.unref) timer.unref();
}

async function start(id, sender) {
  if (!validId(id)) throw new Error('Invalid container id');
  if (!sender || sender.isDestroyed()) throw new Error('No active window');
  const detected = await pickShell(id);
  if (!detected.shell) return { ok: false, error: detected.error };
  if (sender.isDestroyed()) return { ok: false, error: 'The window was closed.' };

  const sessionId = `exec-${Date.now().toString(36)}-${++sequence}`;
  const proc = spawn('docker', ['exec', '-i', id, detected.shell], {
    env: { ...process.env, DOCKER_CLI_HINTS: 'false', NO_COLOR: '1', TERM: 'dumb' },
    stdio: ['pipe', 'pipe', 'pipe'],
    windowsHide: true,
  });

  const session = { id: sessionId, container: id, shell: detected.shell, proc, sender, closed: false };
  sessions.set(sessionId, session);

  proc.stdout.on('data', (chunk) => {
    send(session, 'docker:exec-data', { sessionId, stream: 'stdout', data: stripAnsi(String(chunk)) });
  });
  proc.stderr.on('data', (chunk) => {
    send(session, 'docker:exec-data', { sessionId, stream: 'stderr', data: stripAnsi(String(chunk)) });
  });
  proc.stdin.on('error', () => { /* the session may end while typing */ });
  proc.on('error', (error) => {
    send(session, 'docker:exec-data', { sessionId, stream: 'stderr', data: `Could not start docker: ${error.message}\n` });
    finish(session, -1, null);
  });
  proc.on('close', (code, signal) => finish(session, code, signal));
  sender.once('destroyed', () => terminate(session));

  return {
    ok: true,
    sessionId,
    shell: detected.shell,
    shellLabel: detected.shell === 'bash' ? '/bin/bash' : '/bin/sh',
  };
}

function input(sessionId, data, senderId) {
  const session = sessions.get(String(sessionId));
  if (!session) return { ok: false, error: 'This terminal session has ended.' };
  if (!session.sender || session.sender.id !== senderId) {
    return { ok: false, error: 'This terminal session belongs to another window.' };
  }
  if (typeof data !== 'string') throw new Error('Invalid terminal input');
  if (!data || data.length > 10000) return { ok: false, error: 'Invalid terminal input.' };
  if (session.closed || !session.proc.stdin.writable) {
    return { ok: false, error: 'This terminal session has ended.' };
  }
  session.proc.stdin.write(data);
  return { ok: true };
}

function stop(sessionId, senderId) {
  const session = sessions.get(String(sessionId));
  if (!session) return { ok: true };
  if (senderId != null && session.sender && session.sender.id !== senderId) {
    return { ok: false, error: 'This terminal session belongs to another window.' };
  }
  terminate(session);
  return { ok: true };
}

function stopAll() {
  for (const session of [...sessions.values()]) terminate(session);
}

function activeCount() {
  return sessions.size;
}

module.exports = { start, input, stop, stopAll, activeCount };
