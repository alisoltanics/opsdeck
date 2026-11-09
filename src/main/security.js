'use strict';

/**
 * Command validation for anything that reaches a Docker binary.
 * All execution uses execFile (never a shell), so these checks are defence in
 * depth against dangerous Docker options rather than shell injection.
 */

const BLOCKED_FLAGS = [
  { re: /^--privileged$/, reason: 'Privileged containers are disabled.' },
  { re: /^--pid[= ]?host$/, reason: 'Host PID namespace is disabled.' },
  { re: /^--ipc[= ]?host$/, reason: 'Host IPC namespace is disabled.' },
  { re: /^--network[= ]?host$/, reason: 'Host networking is disabled in OpsDeck.' },
  { re: /^--net[= ]?host$/, reason: 'Host networking is disabled in OpsDeck.' },
  { re: /^--userns[= ]?host$/, reason: 'Host user namespace is disabled.' },
  { re: /^--uts[= ]?host$/, reason: 'Host UTS namespace is disabled.' },
  { re: /^--device(=|$)/, reason: 'Host device passthrough is disabled.' },
  { re: /^--cap-add(=|$)/, reason: 'Adding Linux capabilities is disabled.' },
  { re: /^--security-opt[= ]?(seccomp|apparmor|no-new-privileges)=?unconfined$/, reason: 'Disabling security profiles is disabled.' },
  { re: /docker\.sock/, reason: 'Mounting the Docker socket is disabled.' },
  { re: /^\/var\/run\//, reason: 'Mounting host runtime paths is disabled.' },
  { re: /^--mount(=|$)/, reason: 'Use explicit named volumes; bind mounts are disabled in the terminal and labs.' },
];

const DANGEROUS_VALUE = /(^|[=:])\/var\/run|docker\.sock|^\/$/;

function tokenize(input) {
  if (typeof input !== 'string') throw new Error('Command must be a string');
  const text = input.trim();
  if (!text) throw new Error('Command is empty');
  if (text.length > 4000) throw new Error('Command is too long');
  if (/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/.test(text)) throw new Error('Command contains control characters');
  const tokens = [];
  let current = '';
  let quote = null;
  let escaped = false;
  for (const ch of text) {
    if (escaped) { current += ch; escaped = false; continue; }
    if (ch === '\\' && quote !== "'") { escaped = true; continue; }
    if (quote) {
      if (ch === quote) quote = null;
      else current += ch;
      continue;
    }
    if (ch === '"' || ch === "'") { quote = ch; continue; }
    if (/\s/.test(ch)) {
      if (current) { tokens.push(current); current = ''; }
      continue;
    }
    current += ch;
  }
  if (escaped) current += '\\';
  if (quote) throw new Error('Unterminated quote in command');
  if (current) tokens.push(current);
  if (!tokens.length) throw new Error('Command is empty');
  return tokens;
}

function isHostBind(value) {
  const text = String(value || '');
  if (/^[a-zA-Z]:[\\/]/.test(text)) return true;
  const source = text.split(':')[0];
  return source.startsWith('/') || source.startsWith('.') || source.startsWith('~') || source.includes('/') || source.includes('\\');
}

const HOST_NAMESPACE_FLAGS = new Set(['--pid', '--ipc', '--network', '--net', '--userns', '--uts']);

function inspect(tokens) {
  const threats = [];
  if (tokens[0] !== 'docker') {
    threats.push('Only Docker CLI commands can run here.');
    return { ok: false, threats };
  }
  for (let i = 1; i < tokens.length; i += 1) {
    const t = tokens[i];
    for (const rule of BLOCKED_FLAGS) {
      if (rule.re.test(t)) threats.push(rule.reason);
    }
    if (HOST_NAMESPACE_FLAGS.has(t) && tokens[i + 1] === 'host') {
      threats.push('Host namespaces and host networking are disabled.');
    }
    if ((t === '-v' || t === '--volume') && tokens[i + 1]) {
      if (isHostBind(tokens[i + 1]) || DANGEROUS_VALUE.test(tokens[i + 1])) {
        threats.push('Bind mounts from the host filesystem are disabled.');
      }
    }
    if (t.startsWith('--volume=')) {
      const value = t.slice('--volume='.length);
      if (isHostBind(value) || DANGEROUS_VALUE.test(value)) {
        threats.push('Bind mounts from the host filesystem are disabled.');
      }
    }
    if ((t === '--mount' || t.startsWith('--mount=')) && /type=bind|source=\/|src=\//.test(tokens.slice(i).join(' '))) {
      threats.push('Bind mounts from the host filesystem are disabled.');
    }
    if (/^--cap-add/.test(t) && !threats.length) threats.push('Adding Linux capabilities is disabled.');
  }
  return { ok: threats.length === 0, threats: [...new Set(threats)] };
}

function validateTerminal(command) {
  const tokens = tokenize(command);
  const result = inspect(tokens);
  if (tokens[1] === 'compose') {
    const blocked = ['--privileged', '--pid host', '--network host'];
    const joined = tokens.join(' ');
    for (const b of blocked) {
      if (joined.includes(b)) result.threats.push(`"${b}" is disabled.`);
    }
  }
  return { ...result, ok: result.threats.length === 0, tokens };
}

const LAB_IMAGES = [
  'alpine', 'busybox', 'hello-world', 'nginx', 'httpd', 'redis', 'postgres',
  'mysql', 'mongo', 'node', 'python', 'ubuntu', 'debian', 'traefik', 'caddy',
  'golang', 'eclipse-temurin', 'maven', 'gradle', 'memcached', 'rabbitmq',
];

function isLabImage(image) {
  if (!image) return false;
  const clean = image.toLowerCase().replace(/^(?:docker\.io|index\.docker\.io)\//, '');
  const name = clean.replace(/^library\//, '').split(':')[0].split('@')[0];
  return LAB_IMAGES.includes(name);
}

function validateLab(command, { labDir } = {}) {
  const tokens = tokenize(command);
  const base = inspect(tokens);
  const threats = [...base.threats];

  const SHELL_OPERATORS = new Set(['&&', '||', ';', '|', '>', '>>', '<', '2>', '2>&1']);
  if (tokens.some((token) => SHELL_OPERATORS.has(token)) || /(?:&&|\|\||[;|<>]|`|\$\()/.test(command)) {
    threats.push('Run one Docker command per lab step. Shell operators and command substitution are disabled.');
  }

  if (tokens[1] === 'compose') {
    const joined = tokens.join(' ');
    if (/--privileged/.test(joined)) threats.push('Privileged services are disabled in labs.');
    if (/network[= ]host/.test(joined)) threats.push('Host networking is disabled in labs.');
    if (/\/var\/run\/docker\.sock/.test(joined)) threats.push('Mounting the Docker socket is disabled in labs.');
    for (const t of tokens) {
      if (t === '-f' || t === '--file') {
        const idx = tokens.indexOf(t);
        const file = tokens[idx + 1];
        if (!file || !labDir || !require('node:path').resolve(file).startsWith(require('node:path').resolve(labDir))) {
          threats.push('Compose files must live inside the current lab folder.');
        }
      }
    }
  }

  if (tokens[1] === 'run' || tokens[1] === 'create') {
    const imageIdx = findImageIndex(tokens);
    const image = imageIdx >= 0 ? tokens[imageIdx] : null;
    if (!image) threats.push('A container image is required.');
    else if (!isLabImage(image)) threats.push(`Image "${image}" is not in the lab allowlist. Use alpine, nginx, redis, postgres, node, python, or another approved training image.`);
  }

  if (tokens[1] === 'build') {
    const context = tokens.filter((t) => !t.startsWith('-')).slice(2)[0];
    if (!context) threats.push('A build context folder is required.');
    else if (labDir && !require('node:path').resolve(context).startsWith(require('node:path').resolve(labDir))) {
      threats.push('Build contexts must live inside the current lab folder.');
    }
  }

  return { ok: threats.length === 0, threats: [...new Set(threats)], tokens };
}

function findImageIndex(tokens) {
  const valueFlags = new Set([
    '-e', '--env', '-p', '--publish', '-v', '--volume', '--name', '--network', '--net',
    '-w', '--workdir', '--entrypoint', '-u', '--user', '--hostname', '-h', '--label',
    '--memory', '-m', '--cpus', '--pids-limit', '--restart', '--platform', '--mount',
    '--add-host', '--dns', '--env-file', '--health-cmd', '--health-interval',
    '--log-driver', '--log-opt', '--tmpfs', '--ulimit', '--sysctl', '--gpus',
  ]);
  for (let i = 2; i < tokens.length; i += 1) {
    const t = tokens[i];
    if (valueFlags.has(t)) { i += 1; continue; }
    if (t.startsWith('-')) continue;
    return i;
  }
  return -1;
}

const FORBIDDEN_COMPOSE = [
  { re: /^\s*privileged:\s*true/mi, msg: 'privileged: true is disabled in labs.' },
  { re: /^\s*network_mode:\s*["']?host/mi, msg: 'network_mode: host is disabled in labs.' },
  { re: /^\s*pid:\s*["']?host/mi, msg: 'pid: host is disabled in labs.' },
  { re: /^\s*ipc:\s*["']?host/mi, msg: 'ipc: host is disabled in labs.' },
  { re: /^\s*userns_mode:\s*["']?host/mi, msg: 'userns_mode: host is disabled in labs.' },
  { re: /\/var\/run\/docker\.sock/, msg: 'Mounting the Docker socket is disabled in labs.' },
  { re: /^\s*devices:/mi, msg: 'Device passthrough is disabled in labs.' },
  { re: /^\s*cap_add:/mi, msg: 'cap_add is disabled in labs.' },
  { re: /(^|\n)\s*-\s*["']?\/[^:\n]*:/m, msg: 'Host bind mounts are disabled in labs. Use named volumes.' },
];

function validateComposeFile(content) {
  const threats = [];
  if (typeof content !== 'string') return { ok: false, threats: ['Compose file must be text.'] };
  if (content.length > 64 * 1024) threats.push('Compose file is too large for a lab.');
  for (const rule of FORBIDDEN_COMPOSE) if (rule.re.test(content)) threats.push(rule.msg);
  return { ok: threats.length === 0, threats };
}

module.exports = { tokenize, validateTerminal, validateLab, validateComposeFile, isLabImage, findImageIndex };
