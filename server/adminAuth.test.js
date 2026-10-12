import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes } from 'node:crypto';
import { mkdtemp, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { request as httpRequest } from 'node:http';
import { createBookingServer } from './app.js';
import { openDatabase } from './database.js';
import { resetAdministratorPassword } from './adminAuth.js';

const password = 'fixture-only-admin-password-123';
const nextPassword = 'fixture-only-replacement-password-456';
const origin = 'http://127.0.0.1:5173';

async function fixture(t, options = {}) {
  const publicOrigin = options.publicOrigin || origin;
  const server = createBookingServer({ ...options, publicOrigin });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const close = () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (t) t.after(close);
  const base = `http://127.0.0.1:${server.address().port}`;
  const client = () => {
    let cookie = '';
    return async (path, body, headers = {}) => {
      const response = await fetch(base + '/api' + path, {
        method: body === undefined ? 'GET' : 'POST',
        headers: { Origin: publicOrigin, 'Content-Type': 'application/json', Cookie: cookie, ...headers },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const setCookie = response.headers.getSetCookie()[0];
      if (setCookie) cookie = setCookie.split(';')[0];
      return { status: response.status, data: await response.json(), headers: response.headers, cookie };
    };
  };
  return { client, close, base };
}

test('first local administrator chooses a password once and anonymous visitors never gain admin access', async (t) => {
  const f = await fixture(t);
  const admin = f.client();
  const guest = f.client();
  assert.deepEqual((await guest('/admin/status')).data, { configured: false, setupAllowed: true, requiresSetupToken: false });
  assert.equal((await guest('/admin/board')).status, 401);
  assert.equal((await admin('/admin/setup', { password: 'short' })).status, 400);
  assert.equal((await admin('/admin/setup', { password: 'a'.repeat(257) })).status, 400);
  assert.equal((await admin('/admin/setup', { password }, { Origin: 'https://untrusted.example' })).status, 403);
  const untrustedHostStatus = await new Promise((resolve, reject) => {
    const request = httpRequest(f.base + '/api/admin/setup', {
      method: 'POST', headers: { Host: 'untrusted.example', Origin: origin, 'Content-Type': 'application/json' },
    }, (response) => {
      response.resume();
      response.on('end', () => resolve(response.statusCode));
    });
    request.on('error', reject);
    request.end(JSON.stringify({ password }));
  });
  assert.equal(untrustedHostStatus, 403);
  const created = await admin('/admin/setup', { password });
  assert.equal(created.status, 201);
  assert.match(created.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.equal((await admin('/admin/board')).status, 200);
  assert.equal((await guest('/admin/board')).status, 401);
  assert.equal((await guest('/admin/setup', { password: nextPassword })).status, 409);
  assert.equal((await guest('/admin/status')).data.setupAllowed, false);
});

test('public initial setup is locked without a private bootstrap token', async (t) => {
  const f = await fixture(t, { publicOrigin: 'https://dalbit.example' });
  const visitor = f.client();
  assert.deepEqual((await visitor('/admin/status')).data, { configured: false, setupAllowed: false, requiresSetupToken: true });
  assert.equal((await visitor('/admin/setup', { password })).status, 403);
  assert.equal((await visitor('/admin/login', { password })).status, 503);
});

test('remote bootstrap requires its token and payments remain disabled until an administrator exists', async (t) => {
  const setupToken = randomBytes(32).toString('hex');
  const f = await fixture(t, {
    publicOrigin: 'https://dalbit.example', adminSetupToken: setupToken,
    tossClientKey: 'test_ck_fixture', tossSecretKey: 'test_sk_fixture', supportEmail: 'test@example.com',
  });
  const admin = f.client();
  const status = await admin('/admin/status');
  assert.equal(status.data.requiresSetupToken, true);
  assert.equal(status.data.setupAllowed, true);
  assert.ok(!JSON.stringify(status.data).includes(setupToken));
  assert.equal((await admin('/config')).data.paymentReady, false);
  assert.equal((await admin('/admin/setup', { password, setupToken: 'wrong' })).status, 403);
  const created = await admin('/admin/setup', { password, setupToken });
  assert.equal(created.status, 201);
  assert.match(created.headers.get('set-cookie'), /; Secure/);
  assert.equal((await admin('/config')).data.paymentReady, true);
  assert.equal((await f.client()('/admin/setup', { password: nextPassword, setupToken })).status, 409);
});

test('simultaneous initial registrations cannot replace the winning administrator', async (t) => {
  const f = await fixture(t);
  const first = f.client();
  const second = f.client();
  const responses = await Promise.all([
    first('/admin/setup', { password }), second('/admin/setup', { password: nextPassword }),
  ]);
  assert.deepEqual(responses.map((response) => response.status).sort(), [201, 409]);
  const winner = responses[0].status === 201 ? first : second;
  const loser = winner === first ? second : first;
  assert.equal((await winner('/admin/board')).status, 200);
  assert.equal((await loser('/admin/board')).status, 401);
});

test('password changes rotate the current session and revoke every other session', async (t) => {
  const f = await fixture(t);
  const admin = f.client();
  const other = f.client();
  const created = await admin('/admin/setup', { password });
  const oldCookie = created.cookie;
  assert.equal((await other('/admin/login', { password })).status, 200);
  assert.equal((await admin('/admin/password', { currentPassword: 'wrong', password: nextPassword })).status, 401);
  assert.equal((await admin('/admin/board')).status, 200);
  const changed = await admin('/admin/password', { currentPassword: password, password: nextPassword });
  assert.equal(changed.status, 200);
  assert.notEqual(changed.cookie, oldCookie);
  assert.equal((await admin('/admin/board')).status, 200);
  assert.equal((await other('/admin/board')).status, 401);
  assert.equal((await f.client()('/admin/board', undefined, { Cookie: oldCookie })).status, 401);
  assert.equal((await other('/admin/login', { password })).status, 401);
  assert.equal((await other('/admin/login', { password: nextPassword })).status, 200);
});

test('administrator hashes persist, stale environment seeds never overwrite them, and recovery revokes sessions', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dalbit-admin-test-'));
  const databasePath = join(directory, 'admin.sqlite');
  let f;
  try {
    f = await fixture(null, { databasePath });
    const created = await f.client()('/admin/setup', { password });
    await f.close();
    f = null;
    const db = openDatabase(databasePath);
    try {
      const stored = db.prepare('SELECT * FROM administrator').get();
      assert.equal(stored.salt.length, 64);
      assert.equal(stored.password_hash.length, 64);
      assert.ok(!JSON.stringify(stored).includes(password));
    } finally { db.close(); }
    f = await fixture(null, { databasePath, adminPassword: nextPassword });
    const admin = f.client();
    assert.equal((await admin('/admin/board', undefined, { Cookie: created.cookie })).status, 401);
    assert.equal((await admin('/admin/login', { password })).status, 200);
    assert.equal((await f.client()('/admin/login', { password: nextPassword })).status, 401);
    const recovery = openDatabase(databasePath);
    try { await resetAdministratorPassword(recovery, nextPassword); }
    finally { recovery.close(); }
    assert.equal((await admin('/admin/board')).status, 401);
    assert.equal((await admin('/admin/login', { password })).status, 401);
    assert.equal((await admin('/admin/login', { password: nextPassword })).status, 200);
  } finally {
    if (f) await f.close();
    await rm(directory, { recursive: true, force: true });
  }
});

test('migration preserves existing intake and calendar rows and rejects unsupported future schemas', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dalbit-migration-test-'));
  const path = join(directory, 'legacy.sqlite');
  try {
    const legacy = openDatabase(path);
    try {
      legacy.exec("DROP TABLE administrator; PRAGMA user_version=0; INSERT INTO slots VALUES('fixture',1,2,1);");
      legacy.prepare('INSERT INTO requests(id,owner,intake,created) VALUES(?,?,?,?)').run('fixture', 'fixture', '{}', 1);
    } finally { legacy.close(); }
    const migrated = openDatabase(path);
    try {
      assert.equal(migrated.prepare('PRAGMA user_version').get().user_version, 1);
      assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM slots').get().count, 1);
      assert.equal(migrated.prepare('SELECT COUNT(*) AS count FROM requests').get().count, 1);
      migrated.exec('PRAGMA user_version=2;');
    } finally { migrated.close(); }
    assert.throws(() => openDatabase(path), /schema is newer/);
  } finally { await rm(directory, { recursive: true, force: true }); }
});

test('setup attempts are rate limited and administrator sessions expire after eight hours', async (t) => {
  let time = Date.now();
  const f = await fixture(t, { now: () => time });
  const visitor = f.client();
  for (let index = 0; index < 5; index++) {
    assert.equal((await visitor('/admin/setup', { password: 'short' })).status, 400);
  }
  assert.equal((await visitor('/admin/setup', { password })).status, 429);
  time += 15 * 60 * 1000 + 1;
  assert.equal((await visitor('/admin/setup', { password })).status, 201);
  time += 8 * 60 * 60 * 1000 + 1;
  assert.equal((await visitor('/admin/board')).status, 401);
});
