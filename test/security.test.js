'use strict';

/**
 * Command validator tests. Security rules are the most important invariant in
 * the app: every terminal and lab command passes through this module before it
 * reaches `execFile('docker', ...)`.
 */
const test = require('node:test');
const assert = require('node:assert/strict');
const { tokenize, validateTerminal, validateLab, validateComposeFile, isLabImage, findImageIndex } = require('../src/main/security');

test('tokenize handles quotes, escapes and rejects malformed input', () => {
  assert.deepEqual(tokenize('docker run "hello world"'), ['docker', 'run', 'hello world']);
  assert.deepEqual(tokenize("docker run 'a b'"), ['docker', 'run', 'a b']);
  assert.deepEqual(tokenize('docker ps --format {{.Names}}'), ['docker', 'ps', '--format', '{{.Names}}']);
  assert.throws(() => tokenize('docker run "unterminated'), /Unterminated quote/);
  assert.throws(() => tokenize('   '), /empty/);
  assert.throws(() => tokenize(42), /must be a string/);
});

test('dangerous runtime options are blocked', () => {
  const blocked = [
    'docker run --privileged alpine',
    'docker run --network host alpine',
    'docker run --network=host alpine',
    'docker run --net host alpine',
    'docker run --pid host alpine',
    'docker run --ipc=host alpine',
    'docker run --userns host alpine',
    'docker run --uts host alpine',
    'docker run --device /dev/sda alpine',
    'docker run --cap-add SYS_ADMIN alpine',
    'docker run -v /var/run/docker.sock:/var/run/docker.sock alpine',
    'docker run -v /etc:/host alpine',
    'docker run -v ./site:/host alpine',
    'docker run --volume=/etc:/host alpine',
    'docker run --mount type=bind,source=/etc,target=/host alpine',
    'rm -rf /',
    'bash -c "docker ps"',
  ];
  for (const command of blocked) {
    const result = validateTerminal(command);
    assert.equal(result.ok, false, `${command} should be blocked`);
    assert.ok(result.threats.length > 0, `${command} should explain the threat`);
  }
});

test('ordinary read-only commands and named volumes remain allowed', () => {
  const allowed = [
    'docker ps',
    'docker ps -a --format {{.Names}}',
    'docker images --filter dangling=true',
    'docker inspect web',
    'docker logs --tail 100 web',
    'docker run -d --name web -p 8080:80 nginx:1.27-alpine',
    'docker run --rm -v db-data:/var/lib/postgresql/data postgres:16-alpine',
    'docker volume create db-data',
    'docker compose up -d',
    'docker compose -f docker-compose.yml config',
  ];
  for (const command of allowed) {
    const result = validateTerminal(command);
    assert.equal(result.ok, true, `${command} should be allowed: ${(result.threats || []).join(' ')}`);
  }
});

test('one Docker command per lab step', () => {
  assert.equal(validateLab('docker ps && docker images').ok, false);
  assert.equal(validateLab('docker ps; docker images').ok, false);
  assert.equal(validateLab('docker ps | grep web').ok, false);
  assert.equal(validateLab('docker ps > out.txt').ok, false);
  assert.equal(validateLab('docker images $(cat ids)').ok, false);
  assert.equal(validateLab('docker ps').ok, true);
});

test('labs only run approved images', () => {
  assert.equal(validateLab('docker run -d nginx:1.27-alpine').ok, true);
  assert.equal(validateLab('docker run -d alpine').ok, true);
  assert.equal(validateLab('docker run -d random/untrusted:latest').ok, false);
  assert.equal(validateLab('docker run -d --entrypoint sh alpine').ok, true);
  assert.equal(isLabImage('nginx:1.27-alpine'), true);
  assert.equal(isLabImage('docker.io/library/redis:7'), true);
  assert.equal(isLabImage('ghcr.io/evil/payload:1'), false);
  assert.equal(isLabImage(''), false);
});

test('lab compose files cannot escape the workspace', () => {
  const labDir = '/tmp/opsdeck-lab-demo';
  assert.equal(validateLab('docker compose -f /etc/passwd up', { labDir }).ok, false);
  assert.equal(validateLab(`docker compose -f ${labDir}/docker-compose.yml up`, { labDir }).ok, true);
  assert.equal(validateLab('docker build /etc', { labDir }).ok, false);
  assert.equal(validateLab(`docker build ${labDir}`, { labDir }).ok, true);
});

test('compose files cannot request privileged or host access', () => {
  const blocked = [
    'services:\n  web:\n    image: nginx\n    privileged: true',
    'services:\n  web:\n    image: nginx\n    network_mode: host',
    'services:\n  web:\n    image: nginx\n    pid: host',
    'services:\n  web:\n    image: nginx\n    volumes:\n      - /var/run/docker.sock:/var/run/docker.sock',
    'services:\n  web:\n    image: nginx\n    cap_add:\n      - SYS_ADMIN',
    'services:\n  web:\n    image: nginx\n    volumes:\n      - /etc:/host',
  ];
  for (const content of blocked) {
    assert.equal(validateComposeFile(content).ok, false, content.split('\n')[0]);
  }
  const allowed = 'services:\n  web:\n    image: nginx:1.27-alpine\n    ports:\n      - "8080:80"\n    volumes:\n      - web-data:/usr/share/nginx/html\nvolumes:\n  web-data: {}';
  assert.equal(validateComposeFile(allowed).ok, true);
});

test('findImageIndex skips flags and their values', () => {
  assert.equal(findImageIndex(['docker', 'run', '-d', '--name', 'web', '-p', '8080:80', 'nginx']), 7);
  assert.equal(findImageIndex(['docker', 'run', '--rm', 'alpine', 'echo', 'hi']), 3);
  assert.equal(findImageIndex(['docker', 'run', '-d']), -1);
});
