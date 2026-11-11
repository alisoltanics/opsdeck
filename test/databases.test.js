'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');

const registry = require('../src/main/databases/registry');
const util = require('../src/main/databases/adapters/util');
const { destructiveReason, publicProfile } = require('../src/main/databases');
const { SecretVault } = require('../src/main/databases/vault');
const { DatabaseStore } = require('../src/main/databases/store');
const sqlite = require('../src/main/databases/adapters/sqlite');
const { startKubernetesTunnel } = require('../src/main/databases/tunnel');

function tempApp() {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'opsdeck-db-'));
  return {
    root,
    app: { getPath: () => root },
    cleanup: () => fs.rmSync(root, { recursive: true, force: true }),
  };
}

test('engine registry separates supported adapters from planned engines', () => {
  const supported = registry.supported();
  assert.ok(supported.length >= 6, 'at least the six real adapters are supported');
  for (const id of ['postgres', 'mysql', 'sqlite', 'mongodb', 'redis', 'elasticsearch']) {
    assert.ok(supported.some((engine) => engine.id === id), `${id} is supported`);
    assert.equal(registry.isConnectable(registry.get(id)), true);
  }
  for (const id of ['sqlserver', 'oracle', 'cassandra', 'clickhouse', 'neo4j', 'couchdb', 'influxdb', 'firebird']) {
    const engine = registry.get(id);
    assert.equal(registry.isConnectable(engine), false, `${id} must not be connectable`);
    const pub = registry.publicEngine(engine);
    assert.equal(pub.supported, false);
    assert.equal(pub.planned, true);
    assert.equal(Object.prototype.hasOwnProperty.call(pub, 'adapter'), false);
  }
  assert.equal(registry.get('postgres').capabilities.sql, true);
  assert.equal(registry.matchImage('postgres:16-alpine')?.id, 'postgres');
  assert.equal(registry.matchImage('redis:7')?.id, 'redis');
  assert.equal(registry.matchProcess('/usr/bin/mariadbd')?.id, 'mariadb');
});

test('SQL splitting keeps quoted semicolons and comments intact', () => {
  const script = "select 1; select ';' as semi; -- trailing\nselect 2";
  const parts = util.splitStatements(script);
  assert.equal(parts.length, 3);
  assert.equal(parts[0], 'select 1');
  assert.equal(parts[1], "select ';' as semi");
  assert.match(parts[2], /^-- trailing\nselect 2$/);
});

test('read-only detection refuses write CTEs and EXPLAIN ANALYZE writes', () => {
  assert.equal(util.isReadOnlySql('select * from users'), true);
  assert.equal(util.isReadOnlySql('  -- comment\nshow tables'), true);
  assert.equal(util.isReadOnlySql('with x as (select 1) select * from x'), true);
  assert.equal(util.isReadOnlySql('with x as (select 1) delete from users'), false);
  assert.equal(util.isReadOnlySql('explain analyze delete from users'), false);
  assert.equal(util.isReadOnlySql('update users set admin = true'), false);
});

test('destructive statement detection ignores comments and scoped deletes', () => {
  assert.match(destructiveReason('drop table users'), /DROP/);
  assert.match(destructiveReason('delete from users'), /without a WHERE/i);
  assert.equal(destructiveReason('delete from users where id = 1'), '');
  assert.equal(destructiveReason('-- delete from users\nselect 1'), '');
  assert.match(destructiveReason('truncate users'), /TRUNCATE/);
  assert.match(destructiveReason('flushall'), /destructive/i);
});

test('limits, offsets, quoting and serialization are bounded', () => {
  assert.equal(util.boundedLimit(0, 200), 200);
  assert.equal(util.boundedLimit(999999, 100, 20000), 20000);
  assert.equal(util.boundedOffset(-4), 0);
  assert.equal(util.quoteIdent('mysql', 'a`b'), '`a``b`');
  assert.equal(util.quoteIdent('postgres', 'a"b'), '"a""b"');
  assert.equal(util.serializeValue(12n), '12');
  assert.equal(util.serializeValue(Buffer.from([1, 2])), '0x0102');
  assert.equal(util.safeError(new Error('password=hunter2 /home/ali/secret')), 'password=•••• [path]');
  assert.deepEqual(
    util.safeDriverOptions({ host: 'evil', port: '1', ssl: 'false', password: 'x', connectTimeout: 500, 'bad key': 1 }),
    { connectTimeout: 500 },
    'reserved driver options are stripped',
  );
});

test('TLS preference only downgrades for prefer, never for require', () => {
  assert.equal(util.tlsMode({}), 'prefer');
  assert.equal(util.usesTls({ ssl: { mode: 'prefer' } }), true);
  assert.equal(util.allowsTlsFallback({ ssl: { mode: 'prefer' } }), true);
  assert.equal(util.usesTls({ ssl: { mode: 'disable' } }), false);
  assert.equal(util.usesTls({ ssl: { mode: 'allow' } }), false);
  for (const mode of ['require', 'verify-ca', 'verify-full']) {
    assert.equal(util.usesTls({ ssl: { mode } }), true, `${mode} uses TLS`);
    assert.equal(util.allowsTlsFallback({ ssl: { mode } }), false, `${mode} never downgrades`);
  }
  assert.equal(util.isTlsHandshakeError(new Error('The server does not support SSL connections')), true);
  assert.equal(util.isTlsHandshakeError(new Error('password authentication failed')), false);
});

test('vault round-trips secrets with the AES fallback and 0600 key file', () => {
  const { app, cleanup, root } = tempApp();
  try {
    const vault = new SecretVault(app);
    assert.equal(vault.safeAvailable(), false);
    const cipher = vault.encrypt('correct horse battery staple');
    assert.match(cipher, /^v1:aes:/);
    assert.equal(vault.decrypt(cipher), 'correct horse battery staple');
    const mode = fs.statSync(path.join(root, 'databases.secret')).mode & 0o777;
    assert.equal(mode, 0o600);
    assert.notEqual(vault.encrypt('same'), vault.encrypt('same'), 'each ciphertext uses a fresh IV');

    // Chromium's plaintext "basic_text" fallback must not count as a keyring.
    vault.safeStorage = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'basic_text',
      encryptString: (text) => Buffer.from(text),
      decryptString: (buffer) => String(buffer),
    };
    assert.equal(vault.safeAvailable(), false);
    assert.equal(vault.backend(), 'aes-256-gcm');

    vault.safeStorage = {
      isEncryptionAvailable: () => true,
      getSelectedStorageBackend: () => 'gnome_libsecret',
      encryptString: (text) => Buffer.from(`safe:${text}`),
      decryptString: (buffer) => String(buffer).replace(/^safe:/, ''),
    };
    assert.equal(vault.safeAvailable(), true);
    assert.equal(vault.backend(), 'os-keyring');
    assert.match(vault.encrypt('ring'), /^v1:safe:/);
    assert.equal(vault.decrypt(vault.encrypt('ring')), 'ring');
  } finally {
    cleanup();
  }
});

test('store encrypts credentials and never exposes them in public profiles', () => {
  const { app, cleanup, root } = tempApp();
  try {
    const vault = new SecretVault(app);
    const store = new DatabaseStore(app, vault);
    const profile = store.create({
      name: 'Local Postgres',
      engine: 'postgres',
      host: '127.0.0.1',
      port: 5433,
      username: 'ops',
      database: 'app',
      secrets: { password: 'super-secret-password' },
    });
    assert.ok(profile.id);
    assert.equal(store.secret(profile, 'password'), 'super-secret-password');
    const raw = JSON.stringify(store.data);
    assert.equal(raw.includes('super-secret-password'), false, 'profiles on disk never hold plaintext');

    const pub = publicProfile(profile);
    assert.equal(pub.hasPassword, true);
    assert.equal(Object.prototype.hasOwnProperty.call(pub, 'secrets'), false);

    store.update(profile.id, { name: 'Renamed', favorite: true });
    assert.equal(store.get(profile.id).name, 'Renamed');
    assert.equal(store.secret(store.get(profile.id), 'password'), 'super-secret-password', 'blank password keeps the stored secret');

    const guarded = store.create({
      name: 'Guarded', engine: 'postgres', host: '127.0.0.1',
      options: { host: 'evil.internal', port: '1', ssl: 'false', search_path: 'public' },
    });
    assert.deepEqual(store.get(guarded.id).options, { search_path: 'public' }, 'advanced options cannot override host, port or TLS');
    store.remove(guarded.id);

    store.remove(profile.id);
    assert.equal(store.get(profile.id), null);

    store.addHistory({ sql: "select * from users where token='abc'", ok: true });
    assert.match(store.history()[0].sql, /redacted/);

    store.persistNow();
    const mode = fs.statSync(path.join(root, 'databases.json')).mode & 0o777;
    assert.equal(mode, 0o600);
  } finally {
    cleanup();
  }
});

test('kubernetes tunnels refuse unsafe or incomplete targets', async () => {
  await assert.rejects(startKubernetesTunnel({}), /context and namespace/i);
  await assert.rejects(startKubernetesTunnel({ context: 'kind-demo', namespace: 'Bad_NS', workload: 'pg' }), /namespace/i);
  await assert.rejects(startKubernetesTunnel({ context: 'kind-demo', namespace: 'default' }), /pod or workload/i);
  await assert.rejects(
    startKubernetesTunnel({ context: 'kind-demo', namespace: 'default', workload: 'pg; rm -rf /' }),
    /resource name/i,
  );
  await assert.rejects(
    startKubernetesTunnel({ context: 'kind-demo; touch /tmp/x', namespace: 'default', workload: 'pg' }),
    /context is not valid/i,
  );
});

test('SQLite adapter creates, writes, reads and introspects a real database', async () => {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'opsdeck-sqlite-'));
  const file = path.join(dir, 'test.sqlite');
  const adapter = sqlite.create({ file, readOnly: false });
  try {
    const info = await adapter.connect();
    assert.match(info.serverVersion, /^SQLite /);

    const created = await adapter.query('test.sqlite', 'create table people (id integer primary key, name text);');
    assert.equal(created.ok, true);

    const inserted = await adapter.query('test.sqlite', "insert into people (name) values ('Ada'); insert into people (name) values ('Grace');");
    assert.equal(inserted.affectedRows, 2);

    const selected = await adapter.query('test.sqlite', 'select id, name from people order by id');
    assert.equal(selected.rowCount, 2);
    assert.equal(selected.rows[0].name, 'Ada');
    assert.equal(selected.rows[1].name, 'Grace');

    const table = await adapter.tableData('test.sqlite', 'main', 'people', { limit: 1 });
    assert.equal(table.rowCount, 1);
    assert.equal(table.total, 2);
    assert.equal(table.truncated, true);

    const meta = await adapter.explorer();
    assert.ok(meta.relations.some((relation) => relation.name === 'people'));
    assert.ok(meta.columns.some((column) => column.name === 'name'));

    const metrics = await adapter.metrics();
    assert.equal(metrics.tables, 1);

    const plan = await adapter.explain('test.sqlite', 'select * from people');
    assert.ok(Array.isArray(plan.plan));
    assert.ok(typeof plan.text === 'string');
  } finally {
    await adapter.dispose();
    const mode = fs.statSync(file).mode & 0o777;
    assert.equal(mode, 0o600);
    fs.rmSync(dir, { recursive: true, force: true });
  }
});
