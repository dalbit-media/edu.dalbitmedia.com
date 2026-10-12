import { createHash, randomBytes, scrypt, scryptSync, timingSafeEqual } from 'node:crypto';
import { promisify } from 'node:util';
import { ADMIN_PASSWORD_MIN_LENGTH, ADMIN_PASSWORD_MAX_LENGTH, ADMIN_SETUP_TOKEN_MIN_LENGTH } from '../src/adminPolicy.js';
import { withTransaction } from './database.js';
import { requireValue } from './http.js';

const derive = promisify(scrypt);
const cost = { N: 16384, r: 8, p: 1 };
const sessionMilliseconds = 8 * 60 * 60 * 1000;
export const digest = (value) => createHash('sha256').update(value).digest('hex');
const administrator = (db) => db.prepare('SELECT * FROM administrator WHERE id=1').get();

export function validateAdminPassword(password) {
  requireValue(typeof password === 'string' && password.length >= ADMIN_PASSWORD_MIN_LENGTH &&
    password.length <= ADMIN_PASSWORD_MAX_LENGTH, `관리자 비밀번호는 ${ADMIN_PASSWORD_MIN_LENGTH}–${ADMIN_PASSWORD_MAX_LENGTH}자로 설정해 주세요.`);
}

async function passwordRecord(password) {
  validateAdminPassword(password);
  const salt = randomBytes(32);
  const hash = await derive(password, salt, 32, cost);
  return { salt: salt.toString('hex'), hash: hash.toString('hex') };
}

function savePassword(db, record, now) {
  db.prepare(`INSERT INTO administrator(id,salt,password_hash,created,updated) VALUES(1,?,?,?,?)
    ON CONFLICT(id) DO UPDATE SET salt=excluded.salt,password_hash=excluded.password_hash,updated=excluded.updated`)
    .run(record.salt, record.hash, now, now);
  db.prepare('DELETE FROM sessions').run();
}

async function matches(password, record) {
  if (!record || typeof password !== 'string' || password.length > ADMIN_PASSWORD_MAX_LENGTH) return false;
  const hash = await derive(password, Buffer.from(record.salt, 'hex'), 32, cost);
  return timingSafeEqual(hash, Buffer.from(record.password_hash, 'hex'));
}

export async function resetAdministratorPassword(db, password) {
  requireValue(administrator(db), '등록된 관리자가 없습니다. 먼저 관리자 초기 설정을 완료해 주세요.', 409);
  const record = await passwordRecord(password);
  withTransaction(db, () => savePassword(db, record, Date.now()));
}

export function createAdminAuth(db, { adminPassword = '', setupToken = '', publicOrigin, now }) {
  if (adminPassword) validateAdminPassword(adminPassword);
  if (setupToken && (setupToken.length < ADMIN_SETUP_TOKEN_MIN_LENGTH || setupToken.length > ADMIN_PASSWORD_MAX_LENGTH)) {
    throw new Error('ADMIN_SETUP_TOKEN must contain 32–256 characters.');
  }
  if (adminPassword) withTransaction(db, () => {
    if (administrator(db)) return;
    const salt = randomBytes(32);
    savePassword(db, { salt: salt.toString('hex'), hash: scryptSync(adminPassword, salt, 32, cost).toString('hex') }, now());
  });
  db.prepare('DELETE FROM sessions').run();
  const localOrigin = ['localhost', '127.0.0.1', '[::1]'].includes(new URL(publicOrigin).hostname);
  const localSetup = (request) => localOrigin &&
    ['127.0.0.1', '::1', '::ffff:127.0.0.1'].includes(request.socket.remoteAddress) &&
    /^(localhost|127\.0\.0\.1|\[::1\])(?::\d+)?$/i.test(request.headers.host || '');
  const session = () => {
    const token = randomBytes(32).toString('hex');
    db.prepare('INSERT INTO sessions(token,expires) VALUES(?,?)').run(digest(token), now() + sessionMilliseconds);
    return token;
  };
  const requireSession = (token) => requireValue(
    db.prepare('SELECT token FROM sessions WHERE token=? AND expires>?').get(digest(token), now()),
    '관리자 로그인이 필요합니다.', 401,
  );
  return {
    get configured() { return Boolean(administrator(db)); },
    status(request) {
      const configured = Boolean(administrator(db));
      const local = localSetup(request);
      return { configured, setupAllowed: !configured && (local || Boolean(setupToken)), requiresSetupToken: !configured && !local };
    },
    requireSession,
    async setup(request, password, suppliedToken) {
      requireValue(!administrator(db), '관리자가 이미 등록되었습니다. 로그인해 주세요.', 409);
      if (!localSetup(request)) {
        requireValue(setupToken && typeof suppliedToken === 'string' && suppliedToken.length <= ADMIN_PASSWORD_MAX_LENGTH &&
          timingSafeEqual(Buffer.from(digest(suppliedToken), 'hex'), Buffer.from(digest(setupToken), 'hex')),
        '초기 설정 승인 코드가 필요하거나 올바르지 않습니다.', 403);
      }
      const record = await passwordRecord(password);
      return withTransaction(db, () => {
        requireValue(!administrator(db), '관리자가 이미 등록되었습니다. 로그인해 주세요.', 409);
        savePassword(db, record, now());
        return session();
      });
    },
    async login(password) {
      const record = administrator(db);
      requireValue(record, '먼저 관리자 초기 설정을 완료해 주세요.', 503);
      requireValue(await matches(password, record), '관리자 비밀번호가 올바르지 않습니다.', 401);
      requireValue(administrator(db)?.password_hash === record.password_hash, '비밀번호가 변경되었습니다. 다시 로그인해 주세요.', 401);
      return session();
    },
    async changePassword(token, currentPassword, password) {
      requireSession(token);
      const previous = administrator(db);
      requireValue(await matches(currentPassword, previous), '현재 관리자 비밀번호가 올바르지 않습니다.', 401);
      const record = await passwordRecord(password);
      return withTransaction(db, () => {
        requireSession(token);
        requireValue(administrator(db)?.password_hash === previous.password_hash, '비밀번호가 변경되었습니다. 다시 로그인해 주세요.', 401);
        savePassword(db, record, now());
        return session();
      });
    },
  };
}
