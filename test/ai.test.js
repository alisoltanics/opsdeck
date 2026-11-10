'use strict';

/**
 * AI service unit tests. These cover the pure helpers that protect the key and
 * shape provider requests; no network, Electron or Docker is involved.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { __test, AIService } = require('../src/main/ai');

const {
  isLoopbackHost,
  normalizeBaseUrl,
  normalizeModel,
  normalizeTransport,
  apiEndpointCandidates,
  redactSecrets,
  sanitizeForAI,
  sanitizeEnvList,
  pretty,
  apiResponseText,
  stripThinkTags,
  cleanCliText,
  parseOpencodeCliOutput,
  parseClaudeCliOutput,
  parseOpencodeAuthList,
  parseClaudeAuthStatus,
  stripJsonComments,
  cleanClaudeEnv,
  parseVsCodeClaudeEnv,
  parseClaudeSettingsEnv,
  noteFileName,
  cliPrompt,
  publicConfig,
} = __test;

test('loopback detection allows local providers and rejects everything else', () => {
  for (const host of ['localhost', '127.0.0.1', '127.10.0.4', '::1', '[::1]']) {
    assert.equal(isLoopbackHost(host), true, host);
  }
  for (const host of ['api.openai.com', '10.0.0.5', '0.0.0.0', 'localhost.example.com', '']) {
    assert.equal(isLoopbackHost(host), false, host);
  }
});

test('base URLs are validated before they reach the network layer', () => {
  assert.equal(normalizeBaseUrl('https://api.openai.com/v1/').value, 'https://api.openai.com/v1');
  assert.equal(normalizeBaseUrl('http://localhost:11434/v1').ok, true);
  assert.equal(normalizeBaseUrl('http://127.0.0.1:1234/v1').ok, true);
  assert.equal(normalizeBaseUrl('http://api.openai.com/v1').ok, false);
  assert.equal(normalizeBaseUrl('ftp://example.com/v1').ok, false);
  assert.equal(normalizeBaseUrl('https://user:pass@example.com/v1').ok, false);
  assert.equal(normalizeBaseUrl('not a url').ok, false);
  assert.equal(normalizeBaseUrl('').ok, true);
});

test('endpoint candidates tolerate base URLs with and without /v1', () => {
  assert.deepEqual(apiEndpointCandidates('https://api.openai.com/v1', 'chat/completions'), ['https://api.openai.com/v1/chat/completions']);
  assert.deepEqual(apiEndpointCandidates('https://api.openai.com', 'chat/completions'), [
    'https://api.openai.com/chat/completions',
    'https://api.openai.com/v1/chat/completions',
  ]);
  assert.deepEqual(apiEndpointCandidates('https://openrouter.ai/api/v1/chat/completions', 'chat/completions'), ['https://openrouter.ai/api/v1/chat/completions']);
  assert.deepEqual(apiEndpointCandidates('', 'chat/completions'), []);
});

test('model names reject whitespace and control characters', () => {
  assert.equal(normalizeModel('deepseek-chat').value, 'deepseek-chat');
  assert.equal(normalizeModel('openai/gpt-4o-mini').ok, true);
  assert.equal(normalizeModel('bad model').ok, false);
  assert.equal(normalizeModel('bad\nmodel').ok, false);
});

test('secret-looking values are redacted', () => {
  const input = [
    'API_KEY=sk-live-1234567890abcdef',
    'password: hunter2hunter2',
    'Authorization: Bearer abcdefghijklmnopqrstuvwxyz',
    'token="abcdef123456"',
    'AKIAIOSFODNN7EXAMPLE',
    'ya29.a0AfH6SMBexample',
  ].join('\n');
  const out = redactSecrets(input);
  assert.ok(!out.includes('sk-live-1234567890abcdef'));
  assert.ok(!out.includes('hunter2hunter2'));
  assert.ok(!out.includes('abcdefghijklmnopqrstuvwxyz'));
  assert.ok(!out.includes('abcdef123456'));
  assert.ok(!out.includes('AKIAIOSFODNN7EXAMPLE'));
  assert.match(out, /••••••••/);
});

test('public config never exposes the API key', () => {
  const config = publicConfig({
    enabled: true,
    baseUrl: 'https://api.deepseek.com/v1',
    model: 'deepseek-chat',
    apiKey: 'sk-secret-value',
  });
  assert.equal(config.configured, true);
  assert.equal(config.hasKey, true);
  assert.equal(config.keyless, false);
  assert.equal('apiKey' in config, false);
  assert.ok(!JSON.stringify(config).includes('sk-secret-value'));
});

test('local providers are configured without a key', () => {
  const config = publicConfig({ enabled: true, baseUrl: 'http://localhost:11434/v1', model: 'llama3.2', apiKey: '' });
  assert.equal(config.keyless, true);
  assert.equal(config.configured, true);
  assert.equal(config.hasKey, false);
});

test('provider responses are read from common OpenAI-compatible shapes', () => {
  assert.equal(apiResponseText({ choices: [{ message: { content: 'hello' } }] }), 'hello');
  assert.equal(apiResponseText({ choices: [{ message: { content: [{ type: 'text', text: 'a' }, { type: 'text', text: 'b' }] } }] }), 'ab');
  assert.equal(apiResponseText({ choices: [{ text: 'legacy' }] }), 'legacy');
  assert.equal(apiResponseText({ response: 'ollama' }), 'ollama');
  assert.equal(apiResponseText({}), '');
  assert.equal(apiResponseText(null), '');
});

test('reasoning wrappers are stripped from answers', () => {
  assert.equal(stripThinkTags('before<think hidden>secret</think>after'), 'beforeafter');
  assert.equal(stripThinkTags('<thinking>x</thinking>answer'), 'answer');
  assert.equal(stripThinkTags('plain'), 'plain');
});

test('transports normalize to supported values', () => {
  assert.equal(normalizeTransport('opencode'), 'opencode');
  assert.equal(normalizeTransport('claude-code'), 'claude-code');
  assert.equal(normalizeTransport('API'), 'api');
  assert.equal(normalizeTransport('unknown'), 'api');
  assert.equal(normalizeTransport(null), 'api');
});

test('CLI transports are configured without a stored API key', () => {
  const config = publicConfig({ enabled: true, transport: 'opencode', model: 'opencode/model', apiKey: 'sk-secret-value' });
  assert.equal(config.cli, true);
  assert.equal(config.configured, true);
  assert.equal(config.transport, 'opencode');
  assert.equal(config.model, 'opencode/model');
  assert.equal(config.hasKey, false);
  assert.ok(!JSON.stringify(config).includes('sk-secret-value'));
  assert.ok(config.transports.some((item) => item.id === 'claude-code' && item.cli));
});

test('OpenCode JSON events become plain answer text', () => {
  const raw = [
    '{"type":"step_start","sessionID":"ses_1","part":{"type":"step-start"}}',
    '{"type":"text","sessionID":"ses_1","part":{"text":"First line."}}',
    '{"type":"text","sessionID":"ses_1","part":{"text":"\\nSecond line."}}',
    '{"type":"step_finish","sessionID":"ses_1","part":{"cost":0,"tokens":{"input":10,"output":2}}}',
  ].join('\n');
  const parsed = parseOpencodeCliOutput(raw);
  assert.equal(parsed.text, 'First line.\nSecond line.');
  assert.equal(parsed.sessionId, 'ses_1');
  assert.deepEqual(parsed.usage, { input: 10, output: 2 });
  assert.equal(parsed.cost, 0);
  assert.deepEqual(parsed.errors, []);
});

test('Claude Code JSON results and sign-in failures are recognized', () => {
  const ok = parseClaudeCliOutput(JSON.stringify({
    type: 'result',
    is_error: false,
    result: 'All good.',
    session_id: 'abc',
    modelUsage: { 'claude-sonnet-4-5': { inputTokens: 3 } },
    total_cost_usd: 0.001,
  }));
  assert.equal(ok.text, 'All good.');
  assert.equal(ok.model, 'claude-sonnet-4-5');
  assert.deepEqual(ok.errors, []);

  const denied = parseClaudeCliOutput(JSON.stringify({
    type: 'result',
    is_error: true,
    result: 'Not logged in · Please run /login',
  }));
  assert.equal(denied.isError, true);
  assert.equal(denied.errors[0], 'Not logged in · Please run /login');
});

test('CLI prompts keep the system rules, history and current question in order', () => {
  const prompt = cliPrompt([
    { role: 'system', content: 'RULES' },
    { role: 'user', content: 'older question' },
    { role: 'assistant', content: 'older answer' },
    { role: 'user', content: 'current question' },
  ]);
  assert.ok(prompt.startsWith('RULES'));
  assert.ok(prompt.includes('User: older question'));
  assert.ok(prompt.includes('Assistant: older answer'));
  assert.ok(prompt.endsWith('# Current question\ncurrent question'));
  assert.equal(prompt.includes('User: current question'), false);
});

test('CLI sign-in reports are parsed without exposing credentials', () => {
  const providers = parseOpencodeAuthList('OpenCode Console  Default      stored\nOpenCode Console  github       stored\n');
  assert.equal(providers.length, 2);
  assert.equal(providers[0].provider, 'OpenCode Console');
  assert.deepEqual(parseClaudeAuthStatus('{"loggedIn":false,"authMethod":"none"}'), {
    authenticated: false,
    method: 'none',
    provider: '',
  });
  assert.equal(parseClaudeAuthStatus('not json'), null);
  assert.equal(cleanCliText('\u001b[32mhello\u001b[0m\r\n'), 'hello');
});

test('Claude Code environments are read from JSONC and limited to allowlisted names', () => {
  const vsCode = parseVsCodeClaudeEnv(`{
    // the editor stores the same block Inkwell reads
    "claudeCode.environmentVariables": [
      { "name": "ANTHROPIC_AUTH_TOKEN", "value": "token-value" },
      { "name": "ANTHROPIC_BASE_URL", "value": "https://gateway.example/v1" },
      { "name": "HTTP_PROXY", "value": "http://proxy:8080" },
      { "name": "PATH", "value": "/usr/bin" },
      { "name": "NODE_OPTIONS", "value": "--require ./evil.js" },
      { "name": "ANTHROPIC_MODEL", "value": "line\\nbreak" },
      { "name": "BAD NAME", "value": "x" },
    ],
  }`);
  assert.deepEqual(vsCode, {
    ANTHROPIC_AUTH_TOKEN: 'token-value',
    ANTHROPIC_BASE_URL: 'https://gateway.example/v1',
    HTTP_PROXY: 'http://proxy:8080',
  });
  assert.deepEqual(parseVsCodeClaudeEnv('not json'), {});
  assert.deepEqual(parseClaudeSettingsEnv('{"env":{"ANTHROPIC_API_KEY":"k","AWS_REGION":"eu-west-1","HOME":"/root"}}'), {
    ANTHROPIC_API_KEY: 'k',
    AWS_REGION: 'eu-west-1',
  });
  assert.deepEqual(cleanClaudeEnv({ ANTHROPIC_API_KEY: ' ', ANTHROPIC_MODEL: 'sonnet' }), { ANTHROPIC_MODEL: 'sonnet' });
  assert.equal(stripJsonComments('{"a":1, // note\n "b":[1,2,],}'), '{"a":1, \n "b":[1,2]}');
});

test('Inkwell filenames keep answers safe and readable', () => {
  assert.equal(noteFileName('# Pod restart plan: api/worker'), 'Pod restart plan- api-worker.md');
  assert.equal(noteFileName('  Bad\\Name*with?chars<>|  '), 'Bad-Name-with-chars---.md');
  assert.equal(noteFileName(''), 'OpsDeck AI answer.md');
  assert.equal(noteFileName('...'), 'OpsDeck AI answer.md');
  assert.ok(noteFileName('x'.repeat(400)).length <= 98);
  assert.ok(noteFileName('x'.repeat(400)).endsWith('.md'));
});

test('switching transports in chat keeps the API provider settings', () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsdeck-ai-switch-'));
  try {
    const svc = new AIService({ app: { getPath: () => dir }, content: { load: () => null } });
    const api = svc.saveConfig({ transport: 'api', baseUrl: 'https://api.example.com/v1', model: 'deepseek-chat', apiKey: 'sk-test' });
    assert.equal(api.ok, true);
    assert.equal(api.config.configured, true);

    const cli = svc.saveConfig({ transport: 'opencode', model: '' });
    assert.equal(cli.ok, true);
    assert.equal(cli.config.transport, 'opencode');
    assert.equal(cli.config.cli, true);
    assert.ok(cli.config.model);

    const back = svc.saveConfig({ transport: 'api', model: 'deepseek-chat' });
    assert.equal(back.ok, true);
    assert.equal(back.config.baseUrl, 'https://api.example.com/v1');
    assert.equal(back.config.hasKey, true);
    assert.equal(back.config.configured, true);
    svc.dispose();
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('sensitive object keys and all environment values are omitted for AI context', () => {
  const sanitized = sanitizeForAI({
    name: 'web',
    env: ['DATABASE_URL=postgres://user:secret@db/app', 'NODE_ENV=production', 'PLAIN=value'],
    token: 'abc123',
    nested: {
      password: 'hunter2',
      image: 'nginx:latest',
      kubeconfig: 'apiVersion: v1',
      exec: { command: 'aws', env: { AWS_SECRET_ACCESS_KEY: 'x' } },
    },
    kind: 'Secret',
    data: { password: 'cGFzcw==' },
    stringData: { password: 'plain' },
  });
  assert.equal(sanitized.name, 'web');
  assert.deepEqual(sanitized.env, [
    'DATABASE_URL [value omitted]',
    'NODE_ENV [value omitted]',
    'PLAIN [value omitted]',
  ]);
  assert.equal(sanitized.token, '[omitted]');
  assert.equal(sanitized.nested.password, '[omitted]');
  assert.equal(sanitized.nested.image, 'nginx:latest');
  assert.equal(sanitized.nested.kubeconfig, '[omitted]');
  assert.equal(sanitized.nested.exec, '[authentication plugin omitted]');
  assert.equal(sanitized.data, '[secret data omitted]');
  assert.equal(sanitized.stringData, '[omitted]');
  const json = JSON.stringify(sanitized);
  assert.ok(!json.includes('postgres://user:secret@db/app'));
  assert.ok(!json.includes('hunter2'));
  assert.ok(!json.includes('cGFzcw=='));
});

test('environment lists are omitted per value, never sent wholesale', () => {
  assert.deepEqual(sanitizeEnvList(['A=1', 'B=two words', 'FLAG']), ['A [value omitted]', 'B [value omitted]', 'FLAG [value omitted]']);
  assert.equal(sanitizeEnvList(null), '[environment omitted]');
});

test('JSON context is sanitized before it becomes prompt text', () => {
  const text = pretty({
    kind: 'Secret',
    data: { password: 'cGFzcw==' },
    env: ['API_KEY=sk-live-1234567890abcdef'],
    image: 'postgres:16',
    exec: { command: 'aws' },
  });
  assert.ok(!text.includes('cGFzcw=='));
  assert.ok(!text.includes('sk-live-1234567890abcdef'));
  assert.ok(!text.includes('"aws"'));
  assert.ok(text.includes('postgres:16'));
  assert.ok(text.includes('[value omitted]'));
});
