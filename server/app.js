import { createServer } from 'node:http';
import { randomBytes, randomUUID } from 'node:crypto';
import { createStudentIntake } from '../src/consultationIntake.js';
import { PAID_SERVICE, HOLD_MINUTES, FREE_MINUTES } from '../src/booking.js';
import { validateSiteOrigin } from '../src/seo.js';
import { createAdminAuth, digest } from './adminAuth.js';
import { openDatabase, withTransaction } from './database.js';
import { HttpError, requireValue, readJson, sendJson as send, servePublicPage } from './http.js';

const MINUTE = 60000;
const activeStates = "'pending','confirming','paid','cancelling','free_scheduled'";

function intakeData(value) {
  requireValue(value && typeof value === 'object' && !Array.isArray(value), '학생·연락 정보를 입력해 주세요.');
  const limits = {
    name: 80, grade: 40, guardian: 80, phone: 32, email: 254, contact: 20, contactRole: 20,
    school: 120, region: 120, goals: 3000, schoolType: 80, schoolStage: 30, day: 10, time: 30,
  };
  const form = {};
  for (const [key, limit] of Object.entries(limits)) {
    const text = value[key] === undefined ? '' : value[key];
    requireValue(typeof text === 'string' && text.length <= limit, `${key} 입력 형식이나 길이를 확인해 주세요.`);
    form[key] = text;
  }
  requireValue(value.subjects === undefined || (Array.isArray(value.subjects) && value.subjects.length <= 20 &&
    value.subjects.every((text) => typeof text === 'string' && text.length <= 80)), '상담 주제의 입력 형식을 확인해 주세요.');
  form.subjects = value.subjects ?? [];
  try {
    return createStudentIntake(form, null);
  } catch (error) {
    if (!error.message.startsWith('Invalid student intake:')) throw error;
    throw new HttpError(400, '학생 이름, 학년과 연락 정보를 확인해 주세요.');
  }
}

export function createBookingServer({
  databasePath = ':memory:', publicOrigin = 'http://127.0.0.1:5173', adminPassword = '',
  adminSetupToken = '',
  tossClientKey = '', tossSecretKey = '', supportEmail = '', staticRoot = null,
  fetchImpl = fetch, now = Date.now, logger = console,
} = {}) {
  const origin = new URL(validateSiteOrigin(publicOrigin));
  if (Boolean(tossClientKey) !== Boolean(tossSecretKey)) throw new Error('Configure both Toss API individual-integration keys.');
  if (tossClientKey && (!/^(test|live)_ck_/.test(tossClientKey) || !/^(test|live)_sk_/.test(tossSecretKey) ||
    tossClientKey.split('_')[0] !== tossSecretKey.split('_')[0])) throw new Error('Toss client and secret keys must be matching test/live API individual-integration keys.');
  if (tossClientKey && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(supportEmail)) throw new Error('Payments require a valid SUPPORT_EMAIL.');
  const db = openDatabase(databasePath);
  let auth;
  try {
    auth = createAdminAuth(db, { adminPassword, setupToken: adminSetupToken, publicOrigin, now });
  } catch (error) {
    db.close();
    throw error;
  }
  const rates = new Map();
  const isPaymentReady = () => Boolean(tossClientKey && tossSecretKey && auth.configured);
  const transaction = (action) => withTransaction(db, action);
  const expire = () => {
    db.prepare("UPDATE bookings SET status='expired' WHERE status='pending' AND expires <= ?").run(now());
    db.prepare('DELETE FROM sessions WHERE expires <= ?').run(now());
  };
  const cookie = (name, token, maxAge, strict = false) =>
    `${name}=${token}; Path=/; HttpOnly; SameSite=${strict ? 'Strict' : 'Lax'}; Max-Age=${maxAge}${origin.protocol === 'https:' ? '; Secure' : ''}`;
  const cookies = (request) => Object.fromEntries((request.headers.cookie || '').split(';').map((part) => {
    const index = part.indexOf('=');
    return index < 0 ? ['', ''] : [part.slice(0, index).trim(), part.slice(index + 1)];
  }));
  const guest = (request, response) => {
    let token = cookies(request).dalbit_guest;
    if (!/^[a-f0-9]{64}$/.test(token || '')) {
      token = randomBytes(32).toString('hex');
      response.setHeader('Set-Cookie', cookie('dalbit_guest', token, 604800));
    }
    return digest(token);
  };
  const owner = (request) => digest(cookies(request).dalbit_guest || '');
  const admin = (request) => auth.requireSession(cookies(request).dalbit_admin || '');
  const rate = (request, group, limit) => {
    for (const [key, value] of rates) if (value.until <= now()) rates.delete(key);
    requireValue(rates.size < 10000, '잠시 후 다시 시도해 주세요.', 429);
    const key = `${group}:${request.socket.remoteAddress}`;
    const current = rates.get(key) || { count: 0, until: now() + 15 * MINUTE };
    current.count += 1;
    rates.set(key, current);
    requireValue(current.count <= limit, '요청이 많습니다. 15분 후 다시 시도해 주세요.', 429);
  };
  const getBooking = (id) => db.prepare('SELECT b.*, s.starts, s.ends FROM bookings b JOIN slots s ON s.id=b.slot_id WHERE b.id=?').get(id);
  const ownedBooking = (request, id) => {
    const booking = getBooking(id);
    requireValue(booking && booking.owner === owner(request), '예약을 찾을 수 없습니다. 결제한 브라우저에서 다시 확인해 주세요.', 404);
    return booking;
  };
  const blocked = (slotId) => db.prepare(`SELECT id FROM bookings WHERE slot_id=? AND status IN (${activeStates})`).get(slotId);
  const availableSlots = () => db.prepare(`
    SELECT s.* FROM slots s WHERE s.open=1 AND s.starts>? AND NOT EXISTS
    (SELECT 1 FROM bookings b WHERE b.slot_id=s.id AND b.status IN (${activeStates}))
    ORDER BY s.starts LIMIT 500
  `).all(now() + HOLD_MINUTES * MINUTE);
  const slotJson = (slot) => ({ id: slot.id, startsAt: new Date(slot.starts).toISOString(), endsAt: new Date(slot.ends).toISOString(), open: Boolean(slot.open) });
  const bookingJson = (booking, privateFields = false) => ({
    id: booking.id, slotId: booking.slot_id, status: booking.status, amount: booking.amount,
    startsAt: new Date(booking.starts).toISOString(), endsAt: new Date(booking.amount ? booking.ends : booking.starts + FREE_MINUTES * MINUTE).toISOString(),
    expiresAt: new Date(booking.expires).toISOString(), receiptUrl: booking.receipt || null,
    ...(privateFields ? { intake: JSON.parse(booking.intake), requestId: booking.request_id, createdAt: new Date(booking.created).toISOString() } : {}),
  });
  const orderJson = (booking) => ({
    ...bookingJson(booking), orderId: booking.id, customerKey: booking.id, clientKey: tossClientKey,
    orderName: PAID_SERVICE.name, currency: PAID_SERVICE.currency,
    successUrl: `${publicOrigin}/payment/success`, failUrl: `${publicOrigin}/payment/fail`,
  });
  const toss = async (path, method = 'GET', body, idempotencyKey) => {
    requireValue(isPaymentReady(), '토스페이먼츠 결제 설정이 아직 완료되지 않았습니다.', 503);
    let response;
    try {
      response = await fetchImpl(`https://api.tosspayments.com/v1/payments${path}`, {
        method, headers: {
          Authorization: `Basic ${Buffer.from(`${tossSecretKey}:`).toString('base64')}`,
          'Content-Type': 'application/json',
          ...(idempotencyKey ? { 'Idempotency-Key': idempotencyKey } : {}),
        }, body: body ? JSON.stringify(body) : undefined, signal: AbortSignal.timeout(15000),
      });
    } catch (error) {
      logger.error('Toss request failed:', error.name);
      throw new HttpError(502, '결제사 응답을 확인하지 못했습니다. 예약 시간을 보호하고 있습니다. 다시 확인하거나 운영자에게 문의해 주세요.');
    }
    let payment;
    try {
      payment = await response.json();
    } catch (error) {
      logger.error('Invalid Toss response:', error.name);
      throw new HttpError(502, '결제사 응답 형식이 올바르지 않습니다. 운영자에게 문의해 주세요.');
    }
    if (!response.ok) {
      logger.error('Toss API error:', payment.code || response.status);
      throw new HttpError(502, '결제 승인·조회에 실패했습니다. 결제 상태를 다시 확인하거나 운영자에게 문의해 주세요.');
    }
    return payment;
  };
  const reconcile = async (booking) => {
    requireValue(booking.payment_key, '이 예약에는 확인할 결제 정보가 없습니다.', 409);
    const payment = await toss(`/${encodeURIComponent(booking.payment_key)}`);
    applyPayment(booking, payment);
    return getBooking(booking.id);
  };
  const applyPayment = (booking, payment) => {
    requireValue(payment.orderId === booking.id && payment.paymentKey === booking.payment_key &&
      payment.totalAmount === booking.amount && payment.currency === 'KRW', '결제 정보가 주문과 일치하지 않습니다. 운영자 확인이 필요합니다.', 502);
    const current = getBooking(booking.id);
    if (payment.status === 'DONE') {
      requireValue(payment.balanceAmount === booking.amount && ['confirming', 'paid', 'cancelling'].includes(booking.status),
        '결제 상태를 수동으로 확인해야 합니다. 운영자에게 문의해 주세요.', 409);
      requireValue(current.status !== 'cancelled', '이미 환불된 예약입니다. 결제 상태를 다시 확인해 주세요.', 409);
      let receipt = null;
      if (typeof payment.receipt?.url === 'string') {
        const url = new URL(payment.receipt.url);
        requireValue(url.protocol === 'https:', '결제 영수증 주소를 확인할 수 없습니다.', 502);
        receipt = url.href;
      }
      db.prepare("UPDATE bookings SET status='paid',receipt=? WHERE id=?").run(receipt, booking.id);
    } else if (payment.status === 'CANCELED' && payment.balanceAmount === 0) {
      db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(booking.id);
    } else if (['ABORTED', 'EXPIRED'].includes(payment.status)) {
      db.prepare("UPDATE bookings SET status='expired' WHERE id=? AND status!='paid'").run(booking.id);
    } else {
      throw new HttpError(409, '결제 상태가 아직 확정되지 않았습니다. 잠시 후 다시 확인해 주세요.');
    }
  };
  const refund = async (booking) => {
    requireValue(['paid', 'cancelling', 'cancelled'].includes(booking.status), '환불할 수 있는 결제 완료 예약이 아닙니다.', 409);
    if (booking.status === 'cancelled') return booking;
    if (booking.status === 'cancelling') {
      const checked = await reconcile(booking);
      if (checked.status === 'cancelled') return checked;
      booking = checked;
    }
    db.prepare("UPDATE bookings SET status='cancelling' WHERE id=?").run(booking.id);
    const payment = await toss(`/${encodeURIComponent(booking.payment_key)}/cancel`, 'POST',
      { cancelReason: '상담 예약 취소 요청' }, `cancel-${booking.id}`);
    requireValue(payment.status === 'CANCELED' && payment.balanceAmount === 0, '전액 환불이 확인되지 않았습니다. 운영자 확인이 필요합니다.', 502);
    applyPayment({ ...booking, status: 'cancelling' }, payment);
    return getBooking(booking.id);
  };
  const server = createServer(async (request, response) => {
    try {
      const url = new URL(request.url, publicOrigin);
      const path = url.pathname;
      const method = request.method;
      if (!path.startsWith('/api/')) {
        servePublicPage(request, response, url, { staticRoot, publicOrigin });
        return;
      }
      if (!['GET', 'HEAD'].includes(method) && path !== '/api/payments/webhook') {
        requireValue(request.headers.origin === publicOrigin, '이 사이트에서 요청을 다시 보내 주세요.', 403);
      }
      expire();
      if (method === 'GET' && path === '/api/config') {
        const paymentReady = isPaymentReady();
        send(response, 200, { service: PAID_SERVICE, paymentReady, paymentMode: !paymentReady ? 'unconfigured' : tossClientKey.startsWith('test_') ? 'test' : 'live', supportEmail });
        return;
      }
      if (method === 'GET' && path === '/api/slots') {
        send(response, 200, { slots: availableSlots().map(slotJson) });
        return;
      }
      if (method === 'POST' && path === '/api/requests') {
        rate(request, 'intake', 30);
        const body = await readJson(request);
        requireValue(typeof body.requestId === 'string' && /^[a-f0-9-]{36}$/.test(body.requestId), '신청 식별자를 확인해 주세요.');
        const intake = intakeData(body.intake);
        const guestOwner = guest(request, response);
        const existing = db.prepare('SELECT * FROM requests WHERE id=?').get(body.requestId);
        if (existing) {
          requireValue(existing.owner === guestOwner && existing.intake === JSON.stringify(intake), '이미 처리된 신청입니다. 새 신청 화면에서 다시 입력해 주세요.', 409);
        } else {
          db.prepare('INSERT INTO requests(id,owner,intake,created) VALUES(?,?,?,?)').run(body.requestId, guestOwner, JSON.stringify(intake), now());
        }
        send(response, 201, { id: body.requestId, status: '신규' });
        return;
      }
      if (method === 'POST' && path === '/api/bookings') {
        rate(request, 'booking', 20);
        requireValue(isPaymentReady(), '결제 설정이 아직 완료되지 않았습니다. 무료 기본 상담 신청을 이용해 주세요.', 503);
        const body = await readJson(request);
        const intake = intakeData(body.intake);
        requireValue(typeof body.slotId === 'string' && body.slotId.length <= 80, '상담 시간을 선택해 주세요.');
        requireValue(body.consent === true, '상담 금액과 취소 안내를 확인해 주세요.');
        requireValue(body.expectedAmount === PAID_SERVICE.amount, '상담 금액이 변경되었거나 일치하지 않습니다. 화면을 새로고침하고 금액을 확인해 주세요.', 409);
        requireValue(typeof body.nonce === 'string' && /^[a-f0-9-]{36}$/.test(body.nonce), '예약 식별자를 확인해 주세요.');
        const guestOwner = guest(request, response);
        const booking = transaction(() => {
          const existing = db.prepare('SELECT id,owner,intake,slot_id,status FROM bookings WHERE nonce=?').get(body.nonce);
          if (existing) {
            requireValue(existing.owner === guestOwner && existing.intake === JSON.stringify(intake) && existing.slot_id === body.slotId &&
              existing.status === 'pending', '기존 예약의 상태가 변경되었습니다. 예약 화면에서 다시 시작해 주세요.', 409);
            return getBooking(existing.id);
          }
          requireValue(db.prepare("SELECT COUNT(*) AS count FROM bookings WHERE owner=? AND status='pending'").get(guestOwner).count < 2,
            '진행 중인 결제를 먼저 완료하거나 취소해 주세요.', 409);
          const slot = db.prepare('SELECT * FROM slots WHERE id=? AND open=1 AND starts>?').get(body.slotId, now() + HOLD_MINUTES * MINUTE);
          requireValue(slot && !blocked(slot.id), '이 시간은 이미 예약되었거나 닫혔습니다. 다른 시간을 선택해 주세요.', 409);
          const id = `dalbit_${randomUUID()}`;
          db.prepare('INSERT INTO bookings(id,owner,nonce,slot_id,intake,amount,status,expires,created) VALUES(?,?,?,?,?,?,?,?,?)')
            .run(id, guestOwner, body.nonce, slot.id, JSON.stringify(intake), PAID_SERVICE.amount, 'pending', now() + HOLD_MINUTES * MINUTE, now());
          return getBooking(id);
        });
        send(response, 201, orderJson(booking));
        return;
      }
      const bookingMatch = path.match(/^\/api\/bookings\/([^/]+)(?:\/(confirm|release|cancel))?$/);
      if (bookingMatch) {
        let booking = ownedBooking(request, bookingMatch[1]);
        if (method === 'GET' && !bookingMatch[2]) {
          send(response, 200, bookingJson(booking));
          return;
        }
        requireValue(method === 'POST', '지원하지 않는 요청입니다.', 405);
        const body = await readJson(request);
        if (bookingMatch[2] === 'release') {
          requireValue(['pending', 'expired', 'cancelled'].includes(booking.status), '결제 확인 중이거나 완료된 예약입니다. 예약 상태를 다시 확인해 주세요.', 409);
          db.prepare("UPDATE bookings SET status='cancelled' WHERE id=? AND status='pending'").run(booking.id);
        } else if (bookingMatch[2] === 'cancel') {
          requireValue(now() < booking.starts, '상담 시작 이후에는 운영자에게 취소·환불을 문의해 주세요.', 409);
          await refund(booking);
        } else if (bookingMatch[2] === 'confirm') {
          requireValue(typeof body.paymentKey === 'string' && body.paymentKey.length > 0 && body.paymentKey.length <= 200 &&
            body.amount === booking.amount, '결제 금액 또는 결제 정보가 주문과 일치하지 않습니다.');
          requireValue(!booking.payment_key || booking.payment_key === body.paymentKey, '이 주문의 결제 식별자가 일치하지 않습니다.', 409);
          if (booking.status === 'paid' || (booking.status === 'cancelled' && booking.payment_key)) {
            send(response, 200, bookingJson(booking));
            return;
          }
          requireValue(['pending', 'confirming'].includes(booking.status), '예약 시간이 만료되었거나 취소되었습니다. 결제를 새로 시작해 주세요.', 409);
          if (booking.status === 'confirming') {
            await reconcile(booking);
          } else {
            requireValue(!db.prepare('SELECT id FROM bookings WHERE payment_key=? AND id!=?').get(body.paymentKey, booking.id),
              '다른 주문에 연결된 결제 정보입니다.', 409);
            db.prepare("UPDATE bookings SET status='confirming',payment_key=? WHERE id=?").run(body.paymentKey, booking.id);
            booking = getBooking(booking.id);
            const payment = await toss('/confirm', 'POST',
              { paymentKey: body.paymentKey, orderId: booking.id, amount: booking.amount }, `confirm-${booking.id}`);
            applyPayment(booking, payment);
          }
        } else throw new HttpError(404, '요청 경로를 찾을 수 없습니다.');
        send(response, 200, bookingJson(getBooking(booking.id)));
        return;
      }
      if (method === 'POST' && path === '/api/payments/webhook') {
        rate(request, 'webhook', 120);
        const body = await readJson(request);
        requireValue(typeof body.data?.paymentKey === 'string', '결제 식별자가 필요합니다.');
        const row = db.prepare('SELECT id FROM bookings WHERE payment_key=?').get(body.data.paymentKey);
        requireValue(row, '확인할 주문을 찾을 수 없습니다.', 404);
        await reconcile(getBooking(row.id));
        send(response, 200, { received: true });
        return;
      }
      if (method === 'GET' && path === '/api/admin/status') {
        send(response, 200, auth.status(request));
        return;
      }
      if (method === 'POST' && path === '/api/admin/setup') {
        rate(request, 'setup', 5);
        const body = await readJson(request);
        const token = await auth.setup(request, body.password, body.setupToken);
        response.setHeader('Set-Cookie', cookie('dalbit_admin', token, 28800, true));
        send(response, 201, { authenticated: true });
        return;
      }
      if (method === 'POST' && path === '/api/admin/login') {
        rate(request, 'login', 5);
        const body = await readJson(request);
        const token = await auth.login(body.password);
        response.setHeader('Set-Cookie', cookie('dalbit_admin', token, 28800, true));
        send(response, 200, { authenticated: true });
        return;
      }
      if (path.startsWith('/api/admin/')) {
        admin(request);
        if (method === 'POST' && path === '/api/admin/password') {
          rate(request, 'password', 5);
          const body = await readJson(request);
          const token = await auth.changePassword(cookies(request).dalbit_admin || '', body.currentPassword, body.password);
          response.setHeader('Set-Cookie', cookie('dalbit_admin', token, 28800, true));
          send(response, 200, { authenticated: true });
          return;
        }
        if (method === 'POST' && path === '/api/admin/logout') {
          db.prepare('DELETE FROM sessions WHERE token=?').run(digest(cookies(request).dalbit_admin || ''));
          response.setHeader('Set-Cookie', cookie('dalbit_admin', '', 0, true));
          send(response, 200, { authenticated: false });
          return;
        }
        if (method === 'GET' && path === '/api/admin/board') {
          const requests = db.prepare('SELECT * FROM requests ORDER BY created DESC').all().map((row) => ({
            ...JSON.parse(row.intake), id: row.id, status: row.status, createdAt: new Date(row.created).toISOString(),
          }));
          const bookings = db.prepare('SELECT b.*,s.starts,s.ends FROM bookings b JOIN slots s ON s.id=b.slot_id ORDER BY s.starts').all();
          send(response, 200, {
            requests, slots: db.prepare('SELECT * FROM slots ORDER BY starts').all().map(slotJson),
            bookings: bookings.map((row) => bookingJson(row, true)),
          });
          return;
        }
        if (method === 'POST' && path === '/api/admin/slots') {
          const body = await readJson(request);
          requireValue(typeof body.startsAt === 'string' && /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:00\+09:00$/.test(body.startsAt), '한국시간 날짜와 시간을 입력해 주세요.');
          const starts = Date.parse(body.startsAt);
          requireValue(Number.isFinite(starts) && starts > now() && starts < now() + 366 * 24 * 60 * MINUTE,
            '앞으로 1년 이내의 미래 시간을 선택해 주세요.');
          requireValue(new Date(starts + 9 * 60 * MINUTE).toISOString().slice(0, 16) === body.startsAt.slice(0, 16), '유효한 날짜와 시간을 선택해 주세요.');
          const ends = starts + PAID_SERVICE.durationMinutes * MINUTE;
          const id = randomUUID();
          transaction(() => {
            requireValue(!db.prepare('SELECT id FROM slots WHERE starts<? AND ends>?').get(ends, starts),
              '기존 상담 시간과 겹칩니다. 닫힌 시간은 다시 열 수 있습니다.', 409);
            db.prepare('INSERT INTO slots(id,starts,ends) VALUES(?,?,?)').run(id, starts, ends);
          });
          send(response, 201, { id });
          return;
        }
        const slotMatch = path.match(/^\/api\/admin\/slots\/([^/]+)$/);
        if (method === 'PATCH' && slotMatch) {
          const body = await readJson(request);
          requireValue(typeof body.open === 'boolean', '시간 공개 상태를 지정해 주세요.');
          transaction(() => {
            requireValue(db.prepare('SELECT id FROM slots WHERE id=?').get(slotMatch[1]), '시간을 찾을 수 없습니다.', 404);
            requireValue(!blocked(slotMatch[1]), '결제·예약이 진행 중인 시간은 닫거나 변경할 수 없습니다.', 409);
            db.prepare('UPDATE slots SET open=? WHERE id=?').run(body.open ? 1 : 0, slotMatch[1]);
          });
          send(response, 200, { updated: true });
          return;
        }
        const requestMatch = path.match(/^\/api\/admin\/requests\/([^/]+)(?:\/(schedule))?$/);
        if (requestMatch && ['PATCH', 'POST'].includes(method)) {
          const body = await readJson(request);
          const intake = db.prepare('SELECT * FROM requests WHERE id=?').get(requestMatch[1]);
          requireValue(intake, '신청을 찾을 수 없습니다.', 404);
          if (requestMatch[2] === 'schedule' && method === 'POST') {
            requireValue(typeof body.slotId === 'string' && body.slotId.length <= 80, '무료 기본 상담 시간을 선택해 주세요.');
            transaction(() => {
              const slot = db.prepare('SELECT * FROM slots WHERE id=? AND open=1 AND starts>?').get(body.slotId, now());
              requireValue(slot && !blocked(slot.id), '예약할 수 없는 시간입니다.', 409);
              requireValue(!db.prepare("SELECT id FROM bookings WHERE request_id=? AND status='free_scheduled'").get(intake.id),
                '이미 무료 기본 상담 일정이 지정되었습니다. 기존 일정을 먼저 취소해 주세요.', 409);
              db.prepare('INSERT INTO bookings(id,owner,slot_id,request_id,intake,amount,status,expires,created) VALUES(?,?,?,?,?,?,?,?,?)')
                .run(randomUUID(), intake.owner, slot.id, intake.id, intake.intake, 0, 'free_scheduled', now(), now());
              db.prepare("UPDATE requests SET status='상담 예정' WHERE id=?").run(intake.id);
            });
          } else {
            requireValue(method === 'PATCH' && ['신규', '연락 완료', '상담 완료'].includes(body.status), '올바른 상담 상태를 선택해 주세요.');
            transaction(() => {
              db.prepare('UPDATE requests SET status=? WHERE id=?').run(body.status, intake.id);
              if (body.status === '상담 완료') {
                db.prepare("UPDATE bookings SET status='free_completed' WHERE request_id=? AND status='free_scheduled'").run(intake.id);
              }
            });
          }
          send(response, 200, { updated: true, durationMinutes: FREE_MINUTES });
          return;
        }
        const adminBookingMatch = path.match(/^\/api\/admin\/bookings\/([^/]+)\/(reconcile|cancel)$/);
        if (method === 'POST' && adminBookingMatch) {
          await readJson(request);
          const booking = getBooking(adminBookingMatch[1]);
          requireValue(booking, '예약을 찾을 수 없습니다.', 404);
          if (adminBookingMatch[2] === 'reconcile') await reconcile(booking);
          else if (booking.status === 'free_scheduled') {
            transaction(() => {
              db.prepare("UPDATE bookings SET status='cancelled' WHERE id=?").run(booking.id);
              db.prepare("UPDATE requests SET status='연락 완료' WHERE id=?").run(booking.request_id);
            });
          } else await refund(booking);
          send(response, 200, bookingJson(getBooking(booking.id)));
          return;
        }
      }
      throw new HttpError(404, '요청 경로를 찾을 수 없습니다.');
    } catch (error) {
      if (!(error instanceof HttpError)) logger.error('Booking server error:', error.name, error.code || '');
      if (!response.headersSent) send(response, error instanceof HttpError ? error.status : 500,
        { message: error instanceof HttpError ? error.message : '서버에서 처리하지 못했습니다. 잠시 후 다시 시도해 주세요.' });
      else response.destroy();
    }
  });
  server.requestTimeout = 30000;
  server.headersTimeout = 15000;
  server.on('close', () => db.close());
  return server;
}
