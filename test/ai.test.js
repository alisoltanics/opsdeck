'use strict';

/**
 * AI service unit tests. These cover the pure helpers that protect the key and
 * shape provider requests; no network, Electron or Docker is involved.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { __test } = require('../src/main/ai');

const {
  isLoopbackHost,
  normalizeBaseUrl,
  normalizeModel,
  apiEndpointCandidates,
  redactSecrets,
  apiResponseText,
  stripThinkTags,
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
