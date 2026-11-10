'use strict';

/**
 * Shared, shell-free command execution for Kubernetes tooling.
 *
 * Every command is an argument array executed with execFile. Output is capped
 * so a hostile or misconfigured kubeconfig cannot exhaust the main process.
 */

const { execFile } = require('node:child_process');
const { promisify } = require('node:util');

const execFileAsync = promisify(execFile);
const MAX_BUFFER = 32 * 1024 * 1024;
const DEFAULT_TIMEOUT = 15000;

function stripAnsi(text) {
  return String(text || '').replace(/\u001b\[[0-9;?]*[ -/]*[@-~]/g, '').replace(/\u001b\][^\u0007]*\u0007/g, '');
}

function scrub(text, max = 2000) {
  let out = stripAnsi(text)
    .replace(/\b(authorization\s*:\s*(?:bearer|basic)\s+)\S+/gi, '$1••••••••')
    .replace(/\b(password|passwd|token|secret|api[_-]?key|client-key-data|client-certificate-data|certificate-authority-data)\s*[:=]\s*\S+/gi, '$1=••••••••')
    .replace(/\bBearer\s+[A-Za-z0-9._~+/=-]{8,}/gi, 'Bearer ••••••••')
    .trim();
  if (out.length > max) out = `${out.slice(0, max)}\n… [truncated]`;
  return out;
}

async function run(command, args = [], { timeout = DEFAULT_TIMEOUT, env = {}, input = '' } = {}) {
  try {
    const options = {
      timeout,
      maxBuffer: MAX_BUFFER,
      env: { ...process.env, NO_COLOR: '1', ...env },
      windowsHide: true,
    };
    const { stdout, stderr } = await execFileAsync(command, args, options);
    return { ok: true, stdout, stderr, code: 0 };
  } catch (error) {
    return {
      ok: false,
      stdout: error.stdout || '',
      stderr: scrub(error.stderr || error.message || `${command} failed`, 4000),
      code: typeof error.code === 'number' ? error.code : 1,
      timedOut: error.killed === true,
      missing: error.code === 'ENOENT',
    };
  }
}

async function runJson(command, args = [], options = {}) {
  const res = await run(command, args, options);
  if (!res.ok) return { ...res, data: null };
  const text = String(res.stdout || '').trim();
  if (!text) return { ...res, data: null };
  try {
    return { ...res, data: JSON.parse(text) };
  } catch {
    // kubectl sometimes prints a warning before the JSON document.
    const start = text.search(/[[{]/);
    if (start > 0) {
      try { return { ...res, data: JSON.parse(text.slice(start)) }; } catch { /* fall through */ }
    }
    return { ...res, ok: false, stderr: 'The tool returned output OpsDeck could not read as JSON.', data: null };
  }
}

module.exports = { run, runJson, scrub, stripAnsi };
