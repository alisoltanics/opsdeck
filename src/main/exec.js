'use strict';

/**
 * Container shell sessions.
 *
 * Preferred mode is a real pseudo-terminal: util-linux `script` allocates a
 * host PTY, and `docker exec -it` attaches the container shell to it. That
 * gives the renderer a genuine interactive terminal (Tab completion, history,
 * colours, Ctrl+C) without a native module.
 *
 * When no PTY allocator is available, the session falls back to the older
 * line-oriented `docker exec -i` pipe. Input is never interpreted by a host
 * shell except for the fixed `stty ...; exec docker exec ...` wrapper passed to
 * `script`, which only interpolates a validated container id and shell name.
 */

const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');
const { validId, runRaw, stripAnsi } = require('./docker');

const sessions = new Map();
let sequence = 0;
let ptySupport = null;

function clampInt(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}

function detectPty() {
  if (process.platform === 'win32') return Promise.resolve(false);
  if (ptySupport) return ptySupport;
  ptySupport = new Promise((resolve) => {
    const args = process.platform === 'darwin' ? ['-q', '/dev/null', 'true'] : ['--version'];
    let child;
    try {
      child = spawn('script', args, { stdio: 'ignore', windowsHide: true });
    } catch {
      resolve(false);
      return;
    }
    child.once('error', () => resolve(false));
    child.once('close', (code) => resolve(code === 0));
  });
  return ptySupport;
}

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

function ptySpec(id, shell, cols, rows) {
  const size = `stty rows ${rows} cols ${cols} 2>/dev/null; exec docker exec -it ${id} ${shell}`;
  if (process.platform === 'darwin') {
    return { file: 'script', args: ['-q', '/dev/null', '/bin/sh', '-c', size] };
  }
  return { file: 'script', args: ['-qefc', size, '/dev/null'] };
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
  const proc = session.proc;

  if (session.mode === 'pty') {
    try { if (proc.stdin.writable) proc.stdin.write('\x03'); } catch { /* already closed */ }
    const exitTimer = setTimeout(() => {
      try {
        if (proc.stdin.writable) {
          proc.stdin.write('exit\n');
          proc.stdin.end();
        }
      } catch { /* already closed */ }
    }, 120);
    if (exitTimer.unref) exitTimer.unref();
  } else {
    try {
      if (proc.stdin.writable) {
        proc.stdin.write('exit\n');
        proc.stdin.end();
      }
    } catch { /* already closed */ }
  }

  const killTimer = setTimeout(() => {
    try { proc.kill('SIGTERM'); } catch { /* already gone */ }
  }, 900);
  if (killTimer.unref) killTimer.unref();
}

function wire(session) {
  const { proc } = session;
  const outDecoder = session.mode === 'pty' ? new StringDecoder('utf8') : null;
  const errDecoder = session.mode === 'pty' ? new StringDecoder('utf8') : null;
  const decode = (decoder, chunk) => (decoder ? decoder.write(chunk) : stripAnsi(String(chunk)));

  proc.stdout.on('data', (chunk) => {
    send(session, 'docker:exec-data', {
      sessionId: session.id,
      stream: 'stdout',
      data: decode(outDecoder, chunk),
      mode: session.mode,
    });
  });
  proc.stderr.on('data', (chunk) => {
    send(session, 'docker:exec-data', {
      sessionId: session.id,
      stream: 'stderr',
      data: decode(errDecoder, chunk),
      mode: session.mode,
    });
  });
  proc.stdin.on('error', () => { /* the session may end while typing */ });
  proc.on('error', (error) => {
    send(session, 'docker:exec-data', {
      sessionId: session.id,
      stream: 'stderr',
      data: `Could not start the shell: ${error.message}\r\n`,
      mode: session.mode,
    });
    finish(session, -1, null);
  });
  proc.on('close', (code, signal) => {
    for (const [decoder, stream] of [[outDecoder, 'stdout'], [errDecoder, 'stderr']]) {
      if (!decoder) continue;
      const tail = decoder.end();
      if (tail) send(session, 'docker:exec-data', { sessionId: session.id, stream, data: tail, mode: session.mode });
    }
    finish(session, code, signal);
  });
  session.sender.once('destroyed', () => terminate(session));
}

async function start(id, sender, options = {}) {
  if (!validId(id)) throw new Error('Invalid container id');
  if (!sender || sender.isDestroyed()) throw new Error('No active window');

  const detected = await pickShell(id);
  if (!detected.shell) return { ok: false, error: detected.error };
  if (sender.isDestroyed()) return { ok: false, error: 'The window was closed.' };

  const wantPty = options.pty === true && process.platform !== 'win32';
  if (wantPty && !(await detectPty())) {
    return { ok: false, error: 'Interactive shells need util-linux script (or BSD script) on PATH.' };
  }

  const mode = wantPty ? 'pty' : 'pipe';
  const cols = clampInt(options.cols, 20, 400, 100);
  const rows = clampInt(options.rows, 8, 200, 30);
  const sessionId = `exec-${Date.now().toString(36)}-${++sequence}`;

  const pty = mode === 'pty' ? ptySpec(id, detected.shell, cols, rows) : null;
  const proc = mode === 'pty'
    ? spawn(pty.file, pty.args, {
      env: {
        ...process.env,
        TERM: 'xterm-256color',
        COLORTERM: 'truecolor',
        DOCKER_CLI_HINTS: 'false',
      },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    })
    : spawn('docker', ['exec', '-i', id, detected.shell], {
      env: { ...process.env, DOCKER_CLI_HINTS: 'false', NO_COLOR: '1', TERM: 'dumb' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

  const session = {
    id: sessionId,
    container: id,
    shell: detected.shell,
    mode,
    proc,
    sender,
    closed: false,
  };
  sessions.set(sessionId, session);
  wire(session);

  return {
    ok: true,
    sessionId,
    mode,
    cols,
    rows,
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
  if (!data) return { ok: true };
  if (data.length > 50000) return { ok: false, error: 'Pasted input is too large.' };
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

async function capabilities() {
  return { ok: true, pty: await detectPty() };
}

module.exports = { start, input, stop, stopAll, activeCount, capabilities };
