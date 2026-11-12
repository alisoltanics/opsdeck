'use strict';

const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');
const { execFile } = require('node:child_process');

function run(command, args = [], options = {}) {
  const started = Date.now();
  return new Promise((resolve) => {
    execFile(command, args, {
      timeout: options.timeout || 15000,
      maxBuffer: options.maxBuffer || 8 * 1024 * 1024,
      encoding: 'utf8',
      windowsHide: true,
      env: { ...process.env, ...(options.env || {}) },
      cwd: options.cwd || undefined,
    }, (error, stdout, stderr) => {
      resolve({
        ok: !error,
        code: error?.code ?? 0,
        stdout: String(stdout || ''),
        stderr: String(stderr || ''),
        error: error ? (error.killed ? 'Command timed out.' : error.message) : '',
        ms: Date.now() - started,
      });
    });
  });
}

function which(command) {
  if (!command) return '';
  const extensions = process.platform === 'win32'
    ? String(process.env.PATHEXT || '.EXE;.CMD;.BAT;.COM').split(';')
    : [''];
  for (const dir of String(process.env.PATH || '').split(path.delimiter)) {
    if (!dir) continue;
    for (const ext of extensions) {
      const candidate = path.join(dir, `${command}${ext}`);
      try {
        const stat = fs.statSync(candidate);
        if (stat.isFile()) return candidate;
      } catch { /* try the next path */ }
    }
  }
  return '';
}

function readFileSafe(file, max = 2 * 1024 * 1024) {
  try {
    const stat = fs.statSync(file);
    if (!stat.isFile() || stat.size > max) return '';
    return fs.readFileSync(file, 'utf8');
  } catch {
    return '';
  }
}

function readDirSafe(dir) {
  try { return fs.readdirSync(dir); } catch { return []; }
}

function isDir(file) {
  try { return fs.statSync(file).isDirectory(); } catch { return false; }
}

function powershell(script, timeout = 15000) {
  const shells = ['pwsh', 'powershell'];
  for (const shell of shells) {
    if (which(shell)) {
      return run(shell, ['-NoProfile', '-NonInteractive', '-ExecutionPolicy', 'Bypass', '-Command', script], { timeout });
    }
  }
  return Promise.resolve({ ok: false, error: 'PowerShell is not available.', stdout: '', stderr: '', code: 0, ms: 0 });
}

function parseJsonLines(text) {
  const out = [];
  for (const line of String(text || '').split(/\r?\n/)) {
    const trimmed = line.trim();
    if (!trimmed) continue;
    try { out.push(JSON.parse(trimmed)); } catch { /* ignore partial output */ }
  }
  return out;
}

function parseJson(text, fallback = null) {
  try { return JSON.parse(String(text || '')); } catch { return fallback; }
}

function safeNumber(value, fallback = null) {
  const n = Number(value);
  return Number.isFinite(n) ? n : fallback;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function sanitizeText(text, max = 400) {
  return String(text == null ? '' : text)
    .replace(/(password|passwd|pwd|secret|token|api[_-]?key|authorization)\s*[=:]\s*[^\s,;]+/gi, '$1=••••')
    .replace(/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g, '•••• private key ••••')
    .slice(0, max);
}

function userMap() {
  const map = new Map();
  for (const line of readFileSafe('/etc/passwd', 512 * 1024).split('\n')) {
    const parts = line.split(':');
    if (parts.length > 2) map.set(parts[2], parts[0]);
  }
  return map;
}

function hostname() {
  try { return os.hostname(); } catch { return 'localhost'; }
}

module.exports = {
  run, which, readFileSafe, readDirSafe, isDir, powershell, parseJsonLines, parseJson,
  safeNumber, sleep, sanitizeText, userMap, hostname,
};
