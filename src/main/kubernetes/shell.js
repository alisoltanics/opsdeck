'use strict';

/**
 * Interactive Kubernetes pod shells.
 *
 * A real pseudo-terminal is opened with util-linux `script`, then kubectl exec
 * attaches the pod shell. Context, namespace, pod and container names are
 * validated before they are interpolated into the fixed wrapper. No user input
 * reaches a host shell.
 */

const { spawn } = require('node:child_process');
const { StringDecoder } = require('node:string_decoder');

const sessions = new Map();
let sequence = 0;
let ptySupport = null;

const NAME_RE = /^[a-z0-9]([-a-z0-9.]{0,251}[a-z0-9])?$/;
const NS_RE = /^[a-z0-9]([-a-z0-9]{0,61}[a-z0-9])?$/;
const CONTEXT_RE = /^[A-Za-z0-9][A-Za-z0-9_.:@/+=,-]{0,252}$/;
const CONTAINER_RE = /^[a-z0-9]([-a-z0-9.]{0,61}[a-z0-9])?$/;

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

function shellQuote(value) {
  return `'${String(value).replace(/'/g, `'\\''`)}'`;
}

function baseArgs({ context, namespace, name, container }) {
  const args = [];
  if (context) args.push('--context', context);
  if (namespace) args.push('--namespace', namespace);
  args.push('exec', '-it', name);
  if (container) args.push('--container', container);
  args.push('--');
  return args;
}

function pipeArgs(spec, shell) {
  return baseArgs(spec).concat([shell]);
}

function ptySpec(spec, shell, cols, rows) {
  const command = [
    `stty rows ${rows} cols ${cols} 2>/dev/null;`,
    'exec kubectl',
    spec.context ? `--context ${shellQuote(spec.context)}` : '',
    spec.namespace ? `--namespace ${shellQuote(spec.namespace)}` : '',
    'exec -it',
    shellQuote(spec.name),
    spec.container ? `--container ${shellQuote(spec.container)}` : '',
    '--',
    shellQuote(shell),
  ].filter(Boolean).join(' ');
  if (process.platform === 'darwin') {
    return { file: 'script', args: ['-q', '/dev/null', '/bin/sh', '-c', command] };
  }
  return { file: 'script', args: ['-qefc', command, '/dev/null'] };
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
  send(session, 'k8s:exec-exit', { sessionId: session.id, code, signal });
}

function terminate(session) {
  if (session.closed) return;
  session.closed = true;
  sessions.delete(session.id);
  const proc = session.proc;
  try {
    if (proc.stdin.writable) {
      proc.stdin.write(session.mode === 'pty' ? '\x03' : 'exit\n');
      if (session.mode !== 'pty') proc.stdin.end();
    }
  } catch { /* already closed */ }
  const killTimer = setTimeout(() => {
    try { proc.kill('SIGTERM'); } catch { /* already gone */ }
  }, 900);
  if (killTimer.unref) killTimer.unref();
}

function wire(session) {
  const { proc } = session;
  const outDecoder = session.mode === 'pty' ? new StringDecoder('utf8') : null;
  const errDecoder = session.mode === 'pty' ? new StringDecoder('utf8') : null;
  const decode = (decoder, chunk) => (decoder ? decoder.write(chunk) : String(chunk));

  proc.stdout.on('data', (chunk) => {
    send(session, 'k8s:exec-data', { sessionId: session.id, stream: 'stdout', data: decode(outDecoder, chunk), mode: session.mode });
  });
  proc.stderr.on('data', (chunk) => {
    send(session, 'k8s:exec-data', { sessionId: session.id, stream: 'stderr', data: decode(errDecoder, chunk), mode: session.mode });
  });
  proc.stdin.on('error', () => { /* the session may end while typing */ });
  proc.on('error', (error) => {
    send(session, 'k8s:exec-data', {
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
      if (tail) send(session, 'k8s:exec-data', { sessionId: session.id, stream, data: tail, mode: session.mode });
    }
    finish(session, code, signal);
  });
  session.sender.once('destroyed', () => terminate(session));
}

function validate(spec) {
  if (!CONTEXT_RE.test(String(spec.context || ''))) throw new Error('Choose a valid context before opening a shell.');
  if (!NS_RE.test(String(spec.namespace || ''))) throw new Error('A valid namespace is required.');
  if (!NAME_RE.test(String(spec.name || ''))) throw new Error('That pod name is not valid.');
  if (spec.container && !CONTAINER_RE.test(String(spec.container))) throw new Error('That container name is not valid.');
}

async function pickShell(spec, runCommand, env = {}) {
  let lastError = '';
  for (const shell of ['bash', 'sh']) {
    const args = [];
    if (spec.context) args.push('--context', spec.context);
    if (spec.namespace) args.push('--namespace', spec.namespace);
    args.push('exec', spec.name);
    if (spec.container) args.push('--container', spec.container);
    args.push('--', shell, '-c', 'exit 0');
    const res = await runCommand('kubectl', args, { timeout: 8000, env });
    if (res.ok) return { shell };
    if (res.missing) return { shell: null, error: 'kubectl was not found. Open Kubernetes → Local tools to install it.' };
    lastError = String(res.stderr || '').split('\n').filter((l) => l.trim() && !/^E\d{4} .*memcache\.go/.test(l)).join('\n').trim() || lastError;
  }
  if (/executable file not found|no such file or directory/i.test(lastError)) {
    return {
      shell: null,
      error: `This container image has no shell (neither bash nor sh), so nothing can be opened inside it. Minimal images such as scratch, distroless or http-echo are built this way.\n\nTo inspect it anyway, attach a debug container:\n  kubectl debug -it ${spec.name} --image=busybox:1.36 --target=${spec.container || '<container>'}\n(Open it in the Kubectl console as a normal command, or run it in your own terminal.)`,
      noShell: true,
    };
  }
  if (/container not found|is not running|ContainerCreating|PodInitializing|waiting to start/i.test(lastError)) {
    return { shell: null, error: `The container is not running yet, so a shell cannot attach.\n${lastError}`.trim() };
  }
  return { shell: null, error: lastError || 'This pod does not provide /bin/bash or /bin/sh.' };
}

async function start(spec, sender, options = {}) {
  validate(spec);
  if (!sender || sender.isDestroyed()) throw new Error('No active window.');

  const detected = await pickShell(spec, options.run, options.env || {});
  if (!detected.shell) return { ok: false, error: detected.error || 'No usable shell in this pod.' };
  if (sender.isDestroyed()) return { ok: false, error: 'The window was closed.' };

  const wantPty = options.pty === true && process.platform !== 'win32';
  if (wantPty && !(await detectPty())) {
    return { ok: false, error: 'Interactive shells need util-linux script (or BSD script) on PATH.' };
  }

  const mode = wantPty ? 'pty' : 'pipe';
  const cols = clampInt(options.cols, 20, 400, 100);
  const rows = clampInt(options.rows, 8, 200, 30);
  const sessionId = `k8s-exec-${Date.now().toString(36)}-${++sequence}`;
  const env = options.env || {};
  const proc = mode === 'pty'
    ? (() => {
      const pty = ptySpec(spec, detected.shell, cols, rows);
      return spawn(pty.file, pty.args, {
        env: { ...process.env, ...env, TERM: 'xterm-256color', COLORTERM: 'truecolor' },
        stdio: ['pipe', 'pipe', 'pipe'],
        windowsHide: true,
      });
    })()
    : spawn('kubectl', pipeArgs(spec, detected.shell), {
      env: { ...process.env, ...env, TERM: 'dumb', NO_COLOR: '1' },
      stdio: ['pipe', 'pipe', 'pipe'],
      windowsHide: true,
    });

  const session = { id: sessionId, name: spec.name, container: spec.container || '', shell: detected.shell, mode, proc, sender, closed: false };
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
    context: spec.context,
    namespace: spec.namespace,
    name: spec.name,
    container: spec.container || '',
  };
}

function input(sessionId, data, senderId) {
  const session = sessions.get(String(sessionId));
  if (!session) return { ok: false, error: 'This terminal session has ended.' };
  if (!session.sender || session.sender.id !== senderId) return { ok: false, error: 'This terminal belongs to another window.' };
  if (session.closed) return { ok: false, error: 'This terminal session has ended.' };
  try {
    session.proc.stdin.write(String(data ?? ''));
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message || 'Could not write to the terminal.' };
  }
}

function resize(sessionId, cols, rows, senderId) {
  const session = sessions.get(String(sessionId));
  if (!session) return { ok: false, error: 'This terminal session has ended.' };
  if (!session.sender || session.sender.id !== senderId) return { ok: false, error: 'This terminal belongs to another window.' };
  if (session.mode !== 'pty') return { ok: true };
  try {
    session.proc.stdin.write(`\x1b[8;${clampInt(rows, 8, 200, 30)};${clampInt(cols, 20, 400, 100)}t`);
    return { ok: true };
  } catch (error) {
    return { ok: false, error: error.message };
  }
}

function stop(sessionId, senderId) {
  const session = sessions.get(String(sessionId));
  if (!session) return { ok: true };
  if (!session.sender || session.sender.id !== senderId) return { ok: false, error: 'This terminal belongs to another window.' };
  terminate(session);
  return { ok: true };
}

function disposeAll() {
  for (const session of sessions.values()) terminate(session);
}

module.exports = { start, input, resize, stop, disposeAll };
