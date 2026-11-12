'use strict';

/**
 * Alert notification delivery.
 *
 * Channels are optional and user-configured. Secrets are decrypted by the
 * observability config and passed in memory. Every delivery result is recorded
 * so a failed webhook is visible in the UI rather than silently dropped.
 */

const net = require('node:net');
const tls = require('node:tls');
const { sanitizeText } = require('./util');

const MAX_BODY = 64 * 1024;

function renderTemplate(template, payload) {
  return String(template || '').replace(/\{\{\s*([a-zA-Z0-9_.]+)\s*\}\}/g, (_match, key) => {
    const value = key.split('.').reduce((acc, part) => (acc == null ? acc : acc[part]), payload);
    return value == null ? '' : String(value);
  });
}

function alertBlock(payload) {
  const alert = payload.alert || {};
  return [
    `[${String(alert.severity || 'warning').toUpperCase()}] ${alert.name || 'OpsDeck alert'}`,
    alert.summary || '',
    alert.resource ? `Resource: ${alert.resource}` : '',
    alert.value != null ? `Value: ${alert.value} (threshold ${alert.threshold ?? '—'})` : '',
    alert.startedAt ? `Started: ${alert.startedAt}` : '',
  ].filter(Boolean).join('\n');
}

async function postJson(url, body, headers = {}, timeoutMs = 10000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), Math.max(1000, Math.min(60000, timeoutMs)));
  try {
    const response = await fetch(url, {
      method: 'POST',
      headers: { 'content-type': 'application/json', ...headers },
      body: JSON.stringify(body).slice(0, MAX_BODY),
      signal: controller.signal,
    });
    const text = (await response.text()).slice(0, 2000);
    return { ok: response.ok, status: response.status, error: response.ok ? '' : `HTTP ${response.status}: ${text}` };
  } catch (error) {
    return { ok: false, status: 0, error: error.name === 'AbortError' ? 'Notification timed out.' : error.message };
  } finally {
    clearTimeout(timer);
  }
}

async function sendChannel(channel, payload) {
  if (!channel || channel.enabled === false) return { ok: false, skipped: true, error: 'Channel is disabled.' };
  const title = channel.name || channel.type;
  try {
    if (channel.type === 'webhook') {
      if (!/^https?:\/\//i.test(String(channel.url || ''))) return { ok: false, error: 'The webhook URL is not valid.' };
      const headers = {};
      if (channel.secret?.token) headers.authorization = `Bearer ${channel.secret.token}`;
      const body = channel.template ? renderTemplate(channel.template, payload) : JSON.stringify(payload);
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), 10000);
      try {
        const response = await fetch(channel.url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body, signal: controller.signal });
        return { ok: response.ok, status: response.status, channel: title, error: response.ok ? '' : `HTTP ${response.status}`, at: new Date().toISOString() };
      } finally { clearTimeout(timer); }
    }
    if (channel.type === 'slack') {
      if (!/^https:\/\/hooks\.slack\.com\/|^https:\/\/.+\/services\//i.test(String(channel.url || ''))) {
        return { ok: false, channel: title, error: 'A Slack incoming webhook URL is required.' };
      }
      return { ...(await postJson(channel.url, { text: `*${payload.alert?.name || 'OpsDeck alert'}*\n${alertBlock(payload)}` }, {}, 10000)), channel: title, at: new Date().toISOString() };
    }
    if (channel.type === 'discord') {
      if (!/^https:\/\/discord(app)?\.com\/api\/webhooks\//i.test(String(channel.url || ''))) {
        return { ok: false, channel: title, error: 'A Discord webhook URL is required.' };
      }
      return { ...(await postJson(channel.url, { content: alertBlock(payload).slice(0, 1900) }, {}, 10000)), channel: title, at: new Date().toISOString() };
    }
    if (channel.type === 'telegram') {
      const token = channel.secret?.token;
      const chatId = channel.chatId;
      if (!token || !chatId) return { ok: false, channel: title, error: 'A bot token and chat ID are required.' };
      const url = `https://api.telegram.org/bot${token}/sendMessage`;
      return { ...(await postJson(url, { chat_id: chatId, text: alertBlock(payload).slice(0, 4000) }, {}, 10000)), channel: title, at: new Date().toISOString() };
    }
    if (channel.type === 'email' || channel.type === 'smtp') {
      return await sendEmail(channel, payload);
    }
    return { ok: false, channel: title, error: `Unsupported channel type: ${channel.type}` };
  } catch (error) {
    return { ok: false, channel: title, error: sanitizeText(error.message || String(error), 400), at: new Date().toISOString() };
  }
}

// ---------------------------------------------------------------- SMTP

function sslWrap(socket, options) {
  return new Promise((resolve, reject) => {
    const secure = tls.connect({ socket, servername: options.servername, rejectUnauthorized: options.rejectUnauthorized !== false }, () => resolve(secure));
    secure.once('error', reject);
  });
}

function readSmtp(socket, timeoutMs = 15000) {
  return new Promise((resolve, reject) => {
    let buffer = '';
    const timer = setTimeout(() => { cleanup(); reject(new Error('SMTP response timed out.')); }, timeoutMs);
    const cleanup = () => { clearTimeout(timer); socket.removeListener('data', onData); socket.removeListener('error', onError); };
    const onData = (chunk) => {
      buffer += chunk.toString('utf8');
      const lines = buffer.split(/\r?\n/).filter(Boolean);
      if (!lines.length) return;
      const last = lines[lines.length - 1];
      if (/^\d{3} /.test(last)) { cleanup(); resolve({ code: Number(last.slice(0, 3)), text: buffer }); }
    };
    const onError = (error) => { cleanup(); reject(error); };
    socket.on('data', onData);
    socket.once('error', onError);
  });
}

function writeSmtp(socket, line) {
  return new Promise((resolve, reject) => {
    socket.write(`${line}\r\n`, (error) => (error ? reject(error) : resolve()));
  });
}

async function sendEmail(channel, payload) {
  const host = String(channel.host || '');
  if (!host) return { ok: false, channel: channel.name || 'email', error: 'An SMTP host is required.' };
  const port = Number(channel.port) || (channel.secure ? 465 : 587);
  const timeout = Number(channel.timeoutMs) || 15000;
  const to = Array.isArray(channel.to) ? channel.to : String(channel.to || '').split(',').map((value) => value.trim()).filter(Boolean);
  if (!to.length) return { ok: false, channel: channel.name || 'email', error: 'At least one recipient is required.' };
  const from = channel.from || channel.username || 'opsdeck@localhost';
  let socket;
  try {
    socket = channel.secure
      ? tls.connect({ host, port, servername: host, rejectUnauthorized: channel.rejectUnauthorized !== false })
      : net.connect({ host, port });
    socket.setTimeout(timeout);
    await new Promise((resolve, reject) => { socket.once('connect', resolve); socket.once('error', reject); socket.once('timeout', () => reject(new Error('SMTP connection timed out.'))); });
    let response = await readSmtp(socket);
    if (!channel.secure && channel.starttls !== false && response.code === 220) {
      await writeSmtp(socket, 'EHLO opsdeck.local');
      response = await readSmtp(socket);
      if (/\bSTARTTLS\b/i.test(response.text)) {
        await writeSmtp(socket, 'STARTTLS');
        const go = await readSmtp(socket);
        if (go.code !== 220) throw new Error('SMTP server rejected STARTTLS.');
        socket = await sslWrap(socket, { servername: host, rejectUnauthorized: channel.rejectUnauthorized !== false });
        socket.setTimeout(timeout);
        await writeSmtp(socket, 'EHLO opsdeck.local');
        response = await readSmtp(socket);
      }
    }
    if (channel.secret?.password && channel.username) {
      await writeSmtp(socket, 'AUTH LOGIN');
      await readSmtp(socket);
      await writeSmtp(socket, Buffer.from(String(channel.username)).toString('base64'));
      await readSmtp(socket);
      await writeSmtp(socket, Buffer.from(String(channel.secret.password)).toString('base64'));
      const auth = await readSmtp(socket);
      if (auth.code !== 235) throw new Error(`SMTP authentication failed (${auth.code}).`);
    }
    await writeSmtp(socket, `MAIL FROM:<${from}>`);
    let step = await readSmtp(socket);
    if (step.code !== 250) throw new Error(`MAIL FROM rejected (${step.code}).`);
    for (const recipient of to) {
      await writeSmtp(socket, `RCPT TO:<${recipient}>`);
      step = await readSmtp(socket);
      if (step.code !== 250 && step.code !== 251) throw new Error(`RCPT TO rejected for ${recipient} (${step.code}).`);
    }
    await writeSmtp(socket, 'DATA');
    step = await readSmtp(socket);
    if (step.code !== 354) throw new Error(`DATA rejected (${step.code}).`);
    const subject = `[OpsDeck] ${payload.alert?.severity || 'alert'}: ${payload.alert?.name || 'Monitoring alert'}`;
    const body = alertBlock(payload);
    const message = [
      `From: ${from}`, `To: ${to.join(', ')}`, `Subject: ${subject.replace(/[\r\n]/g, ' ')}`,
      'MIME-Version: 1.0', 'Content-Type: text/plain; charset=utf-8', '',
      body.replace(/^\./gm, '..'),
    ].join('\r\n');
    await writeSmtp(socket, `${message}\r\n.`);
    step = await readSmtp(socket);
    if (step.code !== 250) throw new Error(`Message rejected (${step.code}).`);
    await writeSmtp(socket, 'QUIT').catch(() => {});
    return { ok: true, channel: channel.name || 'email', at: new Date().toISOString() };
  } catch (error) {
    return { ok: false, channel: channel.name || 'email', error: sanitizeText(error.message || String(error), 400), at: new Date().toISOString() };
  } finally {
    try { socket?.destroy(); } catch { /* ignore */ }
  }
}

module.exports = { sendChannel, renderTemplate, alertBlock };
