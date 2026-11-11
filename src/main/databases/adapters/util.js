'use strict';

const MAX_CELL_CHARS = 100000;

/** Convert driver-specific values into IPC-safe primitives. */
function serializeValue(value) {
  if (value === null || value === undefined) return null;
  if (typeof value === 'bigint') return value.toString();
  if (typeof value === 'number' || typeof value === 'boolean' || typeof value === 'string') {
    return typeof value === 'string' && value.length > MAX_CELL_CHARS ? `${value.slice(0, MAX_CELL_CHARS)}…` : value;
  }
  if (value instanceof Date) return value.toISOString();
  if (Buffer.isBuffer(value)) {
    return value.length <= 64
      ? `0x${value.toString('hex')}`
      : `[binary ${value.length} bytes]`;
  }
  if (Array.isArray(value)) return value.slice(0, 2000).map(serializeValue);
  if (typeof value === 'object') {
    // pg returns geometric/interval/point types with custom toPostgres helpers.
    if (typeof value.toPostgres === 'function' && typeof value.toString === 'function') return value.toString();
    try {
      const text = JSON.stringify(value, (_key, inner) => (typeof inner === 'bigint' ? inner.toString() : inner));
      return text && text.length > MAX_CELL_CHARS ? `${text.slice(0, MAX_CELL_CHARS)}…` : JSON.parse(text);
    } catch {
      return String(value);
    }
  }
  return String(value);
}

function serializeRows(rows) {
  return (rows || []).map((row) => {
    const out = {};
    for (const [key, value] of Object.entries(row || {})) out[key] = serializeValue(value);
    return out;
  });
}

/** Strip credentials and absolute file paths from driver errors. */
function safeError(error, fallback = 'The database operation failed.') {
  let message = '';
  if (error && typeof error === 'object') {
    message = String(error.message || error.error || '');
    if (!message && typeof error.code === 'string') message = error.code;
  } else {
    message = String(error || '');
  }
  message = message
    .replace(/(password|passwd|pwd|secret|token)\s*[=:]\s*[^\s,;]+/gi, '$1=••••')
    .replace(/-----BEGIN [A-Z ]+PRIVATE KEY-----[\s\S]*?-----END [A-Z ]+PRIVATE KEY-----/g, '•••• private key ••••')
    .replace(/\/\/[^/@\s]+:[^/@\s]+@/g, '//••••:••••@')
    .replace(/\b[A-Za-z]:\\[^\s]+/g, '[path]')
    .replace(/\/(?:home|Users|root|tmp)\/[^\s:'"]+/g, '[path]')
    .slice(0, 1200);
  return message || fallback;
}

/**
 * Turn a raw driver/network failure into "what happened + what to check".
 * The original (credential-stripped) driver text is kept after the hint.
 */
function explainConnectionError(error, profile = {}) {
  const raw = safeError(error, '');
  const code = String(error?.code || '');
  const text = `${code} ${raw}`;
  const target = profile.host ? `${profile.host}${profile.port ? `:${profile.port}` : ''}` : (profile.engine === 'sqlite' ? 'the database file' : 'the server');
  const rules = [
    [/ECONNREFUSED|connection refused/i, `Connection refused by ${target}. The server is not running or is not listening on that port. Check the host and port, and that the database service is started.`],
    [/ENOTFOUND|EAI_AGAIN|getaddrinfo/i, `The host name could not be resolved (${target}). Check the host for typos and your DNS/network or VPN.`],
    [/ETIMEDOUT|ESOCKETTIMEDOUT|timed out|timeout/i, `Connecting to ${target} timed out. A firewall, VPN, security group or a wrong host/port is likely blocking it.`],
    [/EHOSTUNREACH|ENETUNREACH/i, `${target} is unreachable from this machine. Check your network, VPN or routing.`],
    [/ECONNRESET|EPIPE|socket hang up|terminated unexpectedly/i, `The server closed the connection (${target}). Check TLS/SSL settings, the server's allowed hosts (pg_hba.conf / bind-address) and that the port belongs to this engine.`],
    [/password authentication failed|access denied for user|authentication failed|invalid password|ER_ACCESS_DENIED|28P01|WRONGPASS|NOAUTH|unauthorized|AuthenticationFailed/i, 'Authentication failed. The username or password is wrong, or this user is not allowed to connect from this host.'],
    [/database ".*" does not exist|unknown database|ER_BAD_DB_ERROR|3D000/i, 'The database does not exist on this server. Check the database name.'],
    [/no pg_hba\.conf entry/i, 'The server rejected this client (no matching pg_hba.conf entry). Allow this host/user, or enable SSL if the server requires it.'],
    [/does not support SSL|SSL (?:connection )?is required|server does not support|ssl.*required/i, 'SSL/TLS mismatch. The server and this connection disagree about encryption; change the SSL mode.'],
    [/self[- ]signed|certificate|CERT_|UNABLE_TO_VERIFY|ERR_TLS|wrong version number|ssl3_get_record|tlsv1 alert/i, 'TLS/certificate problem. The certificate is not trusted or the SSL mode is wrong; provide the CA certificate or adjust the SSL mode.'],
    [/SQLITE_CANTOPEN|unable to open database file|ENOENT/i, 'The database file could not be opened. Check that the path exists.'],
    [/SQLITE_NOTADB|not a database/i, 'This file is not a valid SQLite database.'],
    [/EACCES|EPERM|permission denied/i, 'Permission denied while opening the connection. Check file or socket permissions.'],
    [/too many connections|connection slots|ER_CON_COUNT_ERROR/i, 'The server has no free connections. Close idle clients or raise max_connections.'],
  ];
  for (const [pattern, hint] of rules) {
    if (pattern.test(text)) return raw && !hint.includes(raw) ? `${hint}  Driver message: ${raw}` : hint;
  }
  return raw || 'Could not connect. Check the host, port and credentials.';
}

function isReadOnlySql(sql) {
  const text = String(sql || '')
    .replace(/--[^\n]*/g, ' ')
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .trim();
  if (!text) return true;
  const writeWord = /\b(insert|update|delete|merge|create|alter|drop|truncate|grant|revoke|call|do|copy|vacuum|analyze|replace|load)\b/i;
  if (/^with\b/i.test(text)) return !writeWord.test(text);
  if (/^explain\b/i.test(text)) return !writeWord.test(text);
  return /^(select|show|describe|desc|pragma|values)\b/i.test(text);
}

/**
 * Split a SQL script on semicolons outside strings, quoted identifiers and
 * comments. Keeps statements byte-for-byte, which matters because OpsDeck
 * never rewrites the user's SQL before execution.
 */
function splitStatements(sql) {
  const text = String(sql || '');
  const out = [];
  let current = '';
  let quote = null;
  let lineComment = false;
  let blockComment = false;
  for (let i = 0; i < text.length; i += 1) {
    const ch = text[i];
    const next = text[i + 1];
    if (lineComment) {
      current += ch;
      if (ch === '\n') lineComment = false;
      continue;
    }
    if (blockComment) {
      current += ch;
      if (ch === '*' && next === '/') { current += next; i += 1; blockComment = false; }
      continue;
    }
    if (quote) {
      current += ch;
      if (ch === quote) {
        if (next === quote) { current += next; i += 1; }
        else quote = null;
      } else if (ch === '\\' && quote === "'") {
        current += next || ''; i += 1;
      }
      continue;
    }
    if (ch === '-' && next === '-') { current += ch + next; i += 1; lineComment = true; continue; }
    if (ch === '/' && next === '*') { current += ch + next; i += 1; blockComment = true; continue; }
    if (ch === "'" || ch === '"' || ch === '`') { quote = ch; current += ch; continue; }
    if (ch === ';') {
      if (current.trim()) out.push(current.trim());
      current = '';
      continue;
    }
    current += ch;
  }
  if (current.trim()) out.push(current.trim());
  return out;
}

/** Quote a SQL identifier per engine. Never used on raw user SQL. */
function quoteIdent(engine, name) {
  const text = String(name ?? '');
  if (!text) throw new Error('Identifier is required.');
  if (engine === 'mysql' || engine === 'mariadb') return `\`${text.replace(/`/g, '``')}\``;
  return `"${text.replace(/"/g, '""')}"`;
}

function boundedLimit(value, fallback = 200, max = 5000) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return fallback;
  return Math.max(1, Math.min(max, Math.floor(n)));
}

function boundedOffset(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return 0;
  return Math.floor(n);
}

/**
 * TLS preference shared by every adapter.
 *
 * `disable` and `allow` connect in plaintext (an `allow` server that insists
 * on TLS still negotiates it at the protocol layer). `prefer` is the only mode
 * that silently falls back to plaintext, and only when the server or network
 * rejects the TLS handshake itself. `require`, `verify-ca` and `verify-full`
 * never downgrade.
 */
const TLS_MODES = new Set(['prefer', 'require', 'verify-ca', 'verify-full']);

function tlsMode(profile) {
  const mode = String(profile?.ssl?.mode || 'prefer').toLowerCase();
  return ['disable', 'allow', 'prefer', 'require', 'verify-ca', 'verify-full'].includes(mode) ? mode : 'prefer';
}

function usesTls(profile) {
  return TLS_MODES.has(tlsMode(profile));
}

function allowsTlsFallback(profile) {
  return tlsMode(profile) === 'prefer';
}

/** True when an error means the endpoint is not speaking TLS, not a bad password. */
function isTlsHandshakeError(error) {
  const text = String(error?.message || error || '');
  return /does not support (ssl|tls)|ssl is not enabled|server does not support|wrong version number|packet length too long|unknown protocol|EPROTO|ssl routines|tlsv1|record layer|handshake|connection (is )?closed|connection reset|socket hang up|EPIPE|ECONNRESET/i.test(text);
}

/**
 * Driver option keys that carry connection or credential semantics. They are
 * stripped from the free-form "Advanced options" field so a profile can never
 * override the host, port, TLS policy or credentials the adapter and tunnel
 * already established.
 */
const RESERVED_OPTION_KEY = /^(host|hostname|port|user|username|password|passwd|pass|database|db|ssl|tls|sslmode|connectionstring|uri|url|socketpath|rejectunauthorized|cert|key|ca|servername|application_name|pool|servers|replicaset)$/i;

function safeDriverOptions(options) {
  const out = {};
  for (const [key, value] of Object.entries(options || {})) {
    if (RESERVED_OPTION_KEY.test(key)) continue;
    if (!/^[A-Za-z0-9_.-]{1,80}$/.test(key)) continue;
    out[key] = value;
  }
  return out;
}

module.exports = {
  serializeValue, serializeRows, safeError, explainConnectionError, isReadOnlySql, splitStatements,
  quoteIdent, boundedLimit, boundedOffset,
  tlsMode, usesTls, allowsTlsFallback, isTlsHandshakeError,
  safeDriverOptions, RESERVED_OPTION_KEY,
};
