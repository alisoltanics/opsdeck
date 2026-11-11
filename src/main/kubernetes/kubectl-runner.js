'use strict';

/**
 * Safe kubectl command parsing for the in-app console.
 *
 * Commands are tokenized here and executed with execFile. There is no host
 * shell, no pipe, no redirection and no variable expansion. The selected
 * context is always enforced so a command cannot silently talk to another
 * cluster. Kubeconfig-mutating commands and long-running streaming commands
 * are rejected; pods have a dedicated interactive shell instead.
 */

const { run, scrub } = require('./exec');

const MAX_COMMAND_CHARS = 4000;
const MAX_OUTPUT_CHARS = 200000;
const DEFAULT_TIMEOUT = 30000;

const BLOCKED_FLAGS = new Set([
  '--context',
  '--kubeconfig',
  '--cluster',
  '--user',
  '--token',
  '--as',
  '--as-group',
  '--as-uid',
  '--username',
  '--password',
  '--server',
  '--client-key',
  '--client-certificate',
  '--certificate-authority',
]);

const BLOCKED_FLAG_PREFIXES = ['--token=', '--password=', '--client-key=', '--client-certificate='];

const STREAMING_FLAGS = new Set(['-f', '--follow', '-w', '--watch']);

const MUTATING_VERBS = new Set([
  'apply',
  'annotate',
  'attach',
  'autoscale',
  'cordon',
  'cp',
  'create',
  'debug',
  'delete',
  'drain',
  'edit',
  'expose',
  'label',
  'patch',
  'port-forward',
  'proxy',
  'replace',
  'run',
  'scale',
  'set',
  'taint',
  'uncordon',
]);

const MUTATING_ROLLOUT = new Set(['restart', 'undo', 'pause', 'resume']);

const CONFIG_MUTATIONS = new Set([
  'set',
  'set-cluster',
  'set-context',
  'set-credentials',
  'unset',
  'use-context',
  'delete-cluster',
  'delete-context',
  'delete-user',
  'rename-context',
]);

function tokenize(input) {
  const text = String(input ?? '');
  if (!text.trim()) throw new Error('Type a kubectl command first.');
  if (text.length > MAX_COMMAND_CHARS) throw new Error(`Commands are limited to ${MAX_COMMAND_CHARS} characters.`);
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f]/.test(text)) throw new Error('The command contains control characters.');

  const tokens = [];
  let current = '';
  let quote = '';
  let escaped = false;
  let hasToken = false;

  for (const char of text) {
    if (escaped) {
      current += char;
      escaped = false;
      hasToken = true;
      continue;
    }
    if (char === '\\' && quote !== "'") {
      escaped = true;
      continue;
    }
    if (quote) {
      if (char === quote) quote = '';
      else current += char;
      hasToken = true;
      continue;
    }
    if (char === '"' || char === "'") {
      quote = char;
      hasToken = true;
      continue;
    }
    if (/\s/.test(char)) {
      if (hasToken) {
        tokens.push(current);
        current = '';
        hasToken = false;
      }
      continue;
    }
    current += char;
    hasToken = true;
  }
  if (escaped) current += '\\';
  if (quote) throw new Error('The command has an unclosed quote.');
  if (hasToken) tokens.push(current);
  return tokens;
}

function hasFlag(args, ...names) {
  return args.some((arg) => names.includes(arg));
}

function valueOfFlag(args, ...names) {
  for (let index = 0; index < args.length; index += 1) {
    if (names.includes(args[index])) return args[index + 1] || '';
    for (const name of names) {
      if (args[index].startsWith(`${name}=`)) return args[index].slice(name.length + 1);
    }
  }
  return '';
}

function classify(args) {
  const verb = String(args[0] || '').toLowerCase();
  const second = String(args[1] || '').toLowerCase();
  if (MUTATING_VERBS.has(verb)) return { mutating: true, dangerous: true };
  if (verb === 'rollout' && MUTATING_ROLLOUT.has(second)) return { mutating: true, dangerous: true };
  if (verb === 'config' && CONFIG_MUTATIONS.has(second)) return { mutating: true, dangerous: true };
  if (verb === 'exec') return { mutating: true, dangerous: true };
  return { mutating: false, dangerous: false };
}

function parseKubectl(input, { context = '', namespace = '' } = {}) {
  const tokens = tokenize(input);
  if (!tokens.length) throw new Error('Type a kubectl command first.');

  let args = tokens;
  if (String(tokens[0]).toLowerCase() === 'kubectl') args = tokens.slice(1);
  if (!args.length) throw new Error('Type a kubectl subcommand such as get pods.');

  const verb = String(args[0]).toLowerCase();
  if (['helm', 'kind', 'minikube', 'docker', 'podman'].includes(verb)) {
    throw new Error('This console runs kubectl commands only. Copy Helm, kind and Minikube commands into your own terminal.');
  }

  for (const arg of args) {
    const name = arg.split('=')[0];
    if (BLOCKED_FLAGS.has(name)) {
      throw new Error(`${name} is controlled by OpsDeck. Use the context selector instead.`);
    }
    if (BLOCKED_FLAG_PREFIXES.some((prefix) => arg.startsWith(prefix))) {
      throw new Error('Credentials and kubeconfig overrides are not allowed in the console.');
    }
  }

  const second = String(args[1] || '').toLowerCase();
  if (verb === 'config' && CONFIG_MUTATIONS.has(second)) {
    throw new Error('OpsDeck never edits kubeconfig files. Import a kubeconfig instead.');
  }
  const terminator = args.indexOf('--');
  const head = terminator === -1 ? args : args.slice(0, terminator);
  if (hasFlag(head, ...STREAMING_FLAGS) || head.some((arg) => /^--(follow|watch)=/.test(arg))) {
    throw new Error('Long-running watch and follow commands are not supported here. Run a snapshot command instead.');
  }
  if (['port-forward', 'proxy', 'attach', 'edit'].includes(verb)) {
    throw new Error(`${verb} needs an interactive terminal. Use the Kubernetes shell or run it outside OpsDeck.`);
  }
  if (verb === 'exec' && hasFlag(head, '-i', '-t', '-it', '--stdin', '--tty')) {
    throw new Error('Interactive exec is not supported in the console. Use the Shell button on a pod.');
  }

  const noContext = ['version', 'config', 'options', 'completion'].includes(verb);
  const inject = [];
  if (!noContext && context) inject.push('--context', context);
  const hasNamespace = hasFlag(head, '-n', '--namespace') || hasFlag(head, '-A', '--all-namespaces');
  if (!noContext && namespace && !hasNamespace) inject.push('--namespace', namespace);
  if (inject.length) {
    // Global flags must stay before the `--` terminator, otherwise kubectl
    // passes them to the remote command and the selected context is bypassed.
    args = terminator === -1
      ? [...args, ...inject]
      : [...args.slice(0, terminator), ...inject, ...args.slice(terminator)];
  }

  const { mutating, dangerous } = classify(args);
  return {
    args,
    command: `kubectl ${args.map((arg) => (/^[A-Za-z0-9_./:@+=,{}[\]-]+$/.test(arg) ? arg : JSON.stringify(arg))).join(' ')}`,
    verb,
    namespace: hasNamespace ? valueOfFlag(args, '-n', '--namespace') : namespace,
    mutating,
    dangerous,
  };
}

async function runKubectl(input, { context = '', namespace = '', env = {}, timeout = DEFAULT_TIMEOUT } = {}) {
  let parsed;
  try {
    parsed = parseKubectl(input, { context, namespace });
  } catch (error) {
    return { ok: false, error: error.message };
  }
  if (!context && !['version', 'config', 'options', 'completion'].includes(parsed.verb)) {
    return { ok: false, error: 'Choose a context before running kubectl.', command: parsed.command };
  }

  const res = await run('kubectl', parsed.args, { timeout, env });
  const stdout = String(res.stdout || '').slice(0, MAX_OUTPUT_CHARS);
  const stderr = String(res.stderr || '').slice(0, 20000);
  return {
    ok: res.ok,
    command: parsed.command,
    stdout,
    stderr: res.ok ? stderr : scrub(stderr || 'kubectl failed.', 20000),
    code: res.code,
    timedOut: res.timedOut === true,
    dangerous: parsed.dangerous,
    context,
    namespace: parsed.namespace,
  };
}

module.exports = { parseKubectl, runKubectl, tokenize, MAX_OUTPUT_CHARS };
