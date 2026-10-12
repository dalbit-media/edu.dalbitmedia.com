import assert from 'node:assert/strict';
import test from 'node:test';
import { randomBytes, randomUUID } from 'node:crypto';
import { mkdtemp, rm, rmdir } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { createBookingServer } from './app.js';
import { PAID_SERVICE, HOLD_MINUTES, koreanDate, monthDays, shiftMonth } from '../src/booking.js';

const origin = 'http://127.0.0.1:5173';
const intake = {
  name: '테스트 학생', grade: '중학교 2학년', guardian: '테스트 보호자',
  phone: '010-1234-5678', contact: '카카오톡', contactRole: '보호자', subjects: [],
};

async function fixture(t, overrides = {}) {
  let time = Date.UTC(2026, 9, 12, 0, 0);
  const password = overrides.adminPassword ?? randomBytes(24).toString('hex');
  const payments = new Map();
  const calls = [];
  const provider = async (url, options) => {
    calls.push({ url, method: options.method, headers: options.headers, body: options.body });
    if (url.endsWith('/confirm')) {
      const body = JSON.parse(options.body);
      const payment = {
        ...body, totalAmount: body.amount, balanceAmount: body.amount, currency: 'KRW', status: 'DONE',
        receipt: { url: 'https://receipt.tosspayments.com/test-fixture' },
      };
      payments.set(body.paymentKey, payment);
      return Response.json(payment);
    }
    const key = decodeURIComponent(url.split('/payments/')[1].split('/')[0]);
    const payment = payments.get(key);
    if (!payment) return Response.json({ code: 'NOT_FOUND_PAYMENT' }, { status: 404 });
    if (url.endsWith('/cancel')) {
      payment.status = 'CANCELED';
      payment.balanceAmount = 0;
    }
    return Response.json(payment);
  };
  const server = createBookingServer({
    publicOrigin: origin, adminPassword: password, supportEmail: 'test@example.com',
    tossClientKey: 'test_ck_fixture', tossSecretKey: 'test_sk_fixture',
    now: () => time, fetchImpl: provider, logger: { error() {} }, ...overrides,
  });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  const base = `http://127.0.0.1:${server.address().port}`;
  const close = () => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
  if (t) t.after(close);
  const session = () => {
    const cookies = new Map();
    return async (path, method = 'GET', body, customHeaders = {}) => {
      const response = await fetch(base + path, {
        method, headers: {
          Origin: origin, 'Content-Type': 'application/json',
          Cookie: [...cookies].map(([key, value]) => `${key}=${value}`).join('; '), ...customHeaders,
        }, body: body === undefined ? undefined : JSON.stringify(body),
      });
      for (const cookie of response.headers.getSetCookie()) {
        const [key, value] = cookie.split(';')[0].split('=');
        cookies.set(key, value);
      }
      return { status: response.status, data: await response.json(), headers: response.headers };
    };
  };
  const operator = session();
  assert.equal((await operator('/api/admin/login', 'POST', { password })).status, 200);
  const createSlot = async (hour = '14:00', date = '2026-10-13') => {
    const result = await operator('/api/admin/slots', 'POST', { startsAt: `${date}T${hour}:00+09:00` });
    assert.equal(result.status, 201, JSON.stringify(result.data));
    return result.data.id;
  };
  const reserve = (buyer, slotId, extra = {}) => buyer('/api/bookings', 'POST', {
    intake, slotId, consent: true, nonce: randomUUID(), expectedAmount: PAID_SERVICE.amount, ...extra,
  });
  const confirm = (buyer, order, paymentKey = randomUUID(), amount = PAID_SERVICE.amount) =>
    buyer(`/api/bookings/${order.id}/confirm`, 'POST', { paymentKey, amount });
  return { server, base, session, operator, createSlot, reserve, confirm, payments, calls, close, advance: (ms) => { time += ms; } };
}

test('configuration is public but secrets and student information require administrator authentication', async (t) => {
  const f = await fixture(t);
  const visitor = f.session();
  const configuration = await visitor('/api/config');
  assert.equal(configuration.data.service.amount, 150000);
  assert.equal(configuration.data.service.priceNote, '부가세 포함');
  assert.equal(configuration.data.service.durationMinutes, 60);
  assert.equal(configuration.data.service.name, '달빛에듀 전문가 심층 상담');
  assert.equal(configuration.data.service.description, '최대 60분');
  assert.equal(configuration.data.paymentMode, 'test');
  assert.doesNotMatch(JSON.stringify(configuration.data), /test_sk_fixture|password/);
  assert.equal((await visitor('/api/admin/board')).status, 401);
  assert.equal((await visitor('/api/admin/login', 'POST', { password: 'wrong' })).status, 401);
  assert.equal((await f.operator('/api/admin/logout', 'POST', {})).status, 200);
  assert.equal((await f.operator('/api/admin/board')).status, 401);
});

test('writes reject a different origin and malformed intake without storing records', async (t) => {
  const f = await fixture(t);
  const buyer = f.session();
  assert.equal((await buyer('/api/requests', 'POST', { requestId: randomUUID(), intake }, { Origin: 'https://untrusted.example' })).status, 403);
  assert.equal((await buyer('/api/requests', 'POST', { requestId: randomUUID(), intake: { ...intake, name: 4 } })).status, 400);
  assert.equal((await buyer('/api/requests', 'POST', { requestId: randomUUID(), intake: { ...intake, subjects: [null] } })).status, 400);
  assert.equal((await buyer('/api/requests', 'POST', { requestId: randomUUID(), intake: { ...intake, subjects: false } })).status, 400);
  assert.equal((await f.operator('/api/admin/board')).data.requests.length, 0);
});

test('free callback requests persist in the shared queue, replay safely, and do not immediately reserve a time', async (t) => {
  const f = await fixture(t);
  const buyer = f.session();
  const requestId = randomUUID();
  const slotId = await f.createSlot();
  const emailIntake = { ...intake, grade: 'Grade 12', contact: '이메일', contactRole: '학생 본인', phone: '', email: 'student@example.com' };
  assert.equal((await buyer('/api/requests', 'POST', { intake: emailIntake, requestId })).status, 201);
  assert.equal((await buyer('/api/requests', 'POST', { intake: emailIntake, requestId })).status, 201);
  let board = (await f.operator('/api/admin/board')).data;
  assert.equal(board.requests.length, 1);
  assert.equal(board.requests[0].email, 'student@example.com');
  assert.equal(board.bookings.length, 0);
  assert.equal((await buyer('/api/slots')).data.slots.length, 1);
  const scheduled = await f.operator(`/api/admin/requests/${requestId}/schedule`, 'POST', { slotId });
  assert.equal(scheduled.status, 200);
  assert.equal(scheduled.data.durationMinutes, 15);
  board = (await f.operator('/api/admin/board')).data;
  assert.equal(board.bookings[0].status, 'free_scheduled');
  assert.equal(Date.parse(board.bookings[0].endsAt) - Date.parse(board.bookings[0].startsAt), 15 * 60000);
  assert.equal(board.requests[0].status, '상담 예정');
  assert.equal((await buyer('/api/slots')).data.slots.length, 0);
  assert.equal((await f.operator(`/api/admin/bookings/${board.bookings[0].id}/cancel`, 'POST', {})).status, 200);
  assert.equal((await buyer('/api/slots')).data.slots.length, 1);
});

test('arts school pathways are accepted and retained for free intake and paid booking', async (t) => {
  const f = await fixture(t);
  const buyer = f.session();
  const artsIntake = { ...intake, schoolType: '예술중·예술고', schoolStage: '진학 준비' };
  const request = await buyer('/api/requests', 'POST', { requestId: randomUUID(), intake: artsIntake });
  assert.equal(request.status, 201);
  const slotId = await f.createSlot();
  const booking = await f.reserve(buyer, slotId, { intake: artsIntake });
  assert.equal(booking.status, 201);
  const board = (await f.operator('/api/admin/board')).data;
  assert.equal(board.requests[0].schoolType, '예술중·예술고');
  assert.equal(board.bookings[0].intake.schoolType, '예술중·예술고');
});

test('calendar availability is server-persistent, nonoverlapping, explicitly openable and tied to Korean time', async (t) => {
  const f = await fixture(t);
  const slotId = await f.createSlot();
  const visitor = f.session();
  let slots = (await visitor('/api/slots')).data.slots;
  assert.equal(slots[0].startsAt, '2026-10-13T05:00:00.000Z');
  assert.equal(slots[0].endsAt, '2026-10-13T06:00:00.000Z');
  assert.equal((await f.operator('/api/admin/slots', 'POST', { startsAt: '2026-10-13T14:30:00+09:00' })).status, 409);
  assert.equal((await f.operator('/api/admin/slots', 'POST', { startsAt: '2026-02-30T14:00:00+09:00' })).status, 400);
  assert.equal((await f.operator(`/api/admin/slots/${slotId}`, 'PATCH', { open: false })).status, 200);
  assert.equal((await visitor('/api/slots')).data.slots.length, 0);
  assert.equal((await f.operator(`/api/admin/slots/${slotId}`, 'PATCH', { open: true })).status, 200);
  slots = (await visitor('/api/slots')).data.slots;
  assert.equal(slots.length, 1);
});

test('one slot accepts one exclusive hold and expired unpaid holds reopen without confirming payment', async (t) => {
  const f = await fixture(t);
  const slot = await f.createSlot();
  const buyer = f.session();
  const other = f.session();
  const result = await f.reserve(buyer, slot);
  assert.equal(result.status, 201);
  assert.equal((await f.reserve(other, slot)).status, 409);
  assert.equal((await f.operator(`/api/admin/slots/${slot}`, 'PATCH', { open: false })).status, 409);
  f.advance((HOLD_MINUTES + 1) * 60000);
  assert.equal((await other('/api/slots')).data.slots.length, 1);
  assert.equal((await f.confirm(buyer, result.data)).status, 409);
  assert.equal(f.calls.length, 0);
  assert.equal((await f.reserve(other, slot)).status, 201);
});

test('paid orders use the authoritative price, require consent, and support creation retries', async (t) => {
  const f = await fixture(t);
  const buyer = f.session();
  const slotId = await f.createSlot();
  assert.equal((await f.reserve(buyer, slotId, { consent: false })).status, 400);
  assert.equal((await f.reserve(buyer, slotId, { expectedAmount: 1 })).status, 409);
  assert.equal((await f.reserve(buyer, slotId, { expectedAmount: 100000 })).status, 409);
  assert.equal((await f.reserve(buyer, null)).status, 400);
  const nonce = randomUUID();
  const first = await f.reserve(buyer, slotId, { amount: 1, nonce });
  assert.equal(first.data.amount, 150000);
  const retry = await f.reserve(buyer, slotId, { nonce });
  assert.equal(retry.status, 201);
  assert.equal(retry.data.id, first.data.id);
  assert.equal((await f.session()(`/api/bookings/${first.data.id}`)).status, 404);
  assert.equal((await f.confirm(buyer, first.data, 'fixture-key', 1)).status, 400);
  assert.equal(f.calls.length, 0);
});

test('provider approval must match the order and confirmation replays do not capture twice', async (t) => {
  const f = await fixture(t);
  const buyer = f.session();
  const order = (await f.reserve(buyer, await f.createSlot())).data;
  const paymentKey = randomUUID();
  const approved = await f.confirm(buyer, order, paymentKey);
  assert.equal(approved.status, 200);
  assert.equal(approved.data.status, 'paid');
  assert.equal((await f.confirm(buyer, order, paymentKey)).data.status, 'paid');
  assert.equal(f.calls.filter((call) => call.url.endsWith('/confirm')).length, 1);
  assert.equal(f.calls[0].headers['Idempotency-Key'], `confirm-${order.id}`);
  assert.equal(JSON.parse(f.calls[0].body).amount, 150000);
  assert.equal((await f.confirm(buyer, order, 'another-key')).status, 409);
  assert.equal((await buyer('/api/slots')).data.slots.length, 0);
});

test('mismatched or nonfinal provider responses never create a confirmed booking', async (t) => {
  const f = await fixture(t, { fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    return Response.json({ ...body, totalAmount: 1, balanceAmount: 1, currency: 'KRW', status: 'DONE' });
  } });
  const buyer = f.session();
  const order = (await f.reserve(buyer, await f.createSlot())).data;
  assert.equal((await f.confirm(buyer, order)).status, 502);
  assert.equal((await buyer(`/api/bookings/${order.id}`)).data.status, 'confirming');
  f.advance(60 * 60000);
  assert.equal((await buyer('/api/slots')).data.slots.length, 0);
});

test('unknown network outcomes keep the slot locked and can recover through canonical provider lookup', async (t) => {
  let payment;
  const f = await fixture(t, { fetchImpl: async (url, options) => {
    if (url.endsWith('/confirm')) {
      const body = JSON.parse(options.body);
      payment = { ...body, totalAmount: body.amount, balanceAmount: body.amount, currency: 'KRW', status: 'DONE' };
      throw new TypeError('Simulated lost response');
    }
    return Response.json(payment);
  } });
  const buyer = f.session();
  const order = (await f.reserve(buyer, await f.createSlot())).data;
  const key = randomUUID();
  assert.equal((await f.confirm(buyer, order, key)).status, 502);
  f.advance((HOLD_MINUTES + 1) * 60000);
  assert.equal((await buyer('/api/slots')).data.slots.length, 0);
  assert.equal((await f.operator(`/api/admin/bookings/${order.id}/reconcile`, 'POST', {})).data.status, 'paid');
  assert.equal((await f.confirm(buyer, order, key)).data.status, 'paid');
});

test('in-flight provider calls keep bookings exclusive while another customer attempts checkout', async (t) => {
  let notify;
  const started = new Promise((resolve) => { notify = resolve; });
  let finish;
  const f = await fixture(t, { fetchImpl: async (url, options) => {
    const body = JSON.parse(options.body);
    notify();
    await new Promise((resolve) => { finish = resolve; });
    return Response.json({ ...body, totalAmount: body.amount, balanceAmount: body.amount, currency: 'KRW', status: 'DONE' });
  } });
  const buyer = f.session();
  const slotId = await f.createSlot();
  const order = (await f.reserve(buyer, slotId)).data;
  const confirmation = f.confirm(buyer, order);
  await started;
  assert.equal((await f.reserve(f.session(), slotId)).status, 409);
  finish();
  assert.equal((await confirmation).data.status, 'paid');
});

test('refunds are provider verified, replay safely and only then release the calendar', async (t) => {
  const f = await fixture(t);
  const buyer = f.session();
  const order = (await f.reserve(buyer, await f.createSlot())).data;
  const key = randomUUID();
  await f.confirm(buyer, order, key);
  assert.equal((await buyer(`/api/bookings/${order.id}/cancel`, 'POST', {})).data.status, 'cancelled');
  assert.equal((await buyer(`/api/bookings/${order.id}/cancel`, 'POST', {})).data.status, 'cancelled');
  assert.equal(f.calls.filter((call) => call.url.endsWith('/cancel')).length, 1);
  assert.equal((await buyer('/api/slots')).data.slots.length, 1);
  assert.equal((await f.confirm(buyer, order, key)).data.status, 'cancelled');
});

test('unverified webhook payloads cannot confirm payment or free an occupied slot', async (t) => {
  const f = await fixture(t);
  const buyer = f.session();
  const order = (await f.reserve(buyer, await f.createSlot())).data;
  const key = randomUUID();
  await f.confirm(buyer, order, key);
  const webhook = await buyer('/api/payments/webhook', 'POST', { data: { paymentKey: key, status: 'CANCELED' } }, { Origin: 'https://untrusted.example' });
  assert.equal(webhook.status, 200);
  assert.equal((await buyer(`/api/bookings/${order.id}`)).data.status, 'paid');
  f.payments.get(key).status = 'CANCELED';
  f.payments.get(key).balanceAmount = 0;
  assert.equal((await buyer('/api/payments/webhook', 'POST', { data: { paymentKey: key } })).status, 200);
  assert.equal((await buyer(`/api/bookings/${order.id}`)).data.status, 'cancelled');
});

test('lost refund responses keep the slot locked until canonical cancellation is verified', async (t) => {
  let payment;
  let cancellations = 0;
  const f = await fixture(t, { fetchImpl: async (url, options) => {
    if (url.endsWith('/confirm')) {
      const body = JSON.parse(options.body);
      payment = { ...body, totalAmount: body.amount, balanceAmount: body.amount, currency: 'KRW', status: 'DONE' };
    } else if (url.endsWith('/cancel')) {
      cancellations += 1;
      payment = { ...payment, status: 'CANCELED', balanceAmount: 0 };
      throw new TypeError('Simulated lost refund response');
    }
    return Response.json(payment);
  } });
  const buyer = f.session();
  const order = (await f.reserve(buyer, await f.createSlot())).data;
  await f.confirm(buyer, order);
  assert.equal((await buyer(`/api/bookings/${order.id}/cancel`, 'POST', {})).status, 502);
  assert.equal((await buyer(`/api/bookings/${order.id}`)).data.status, 'cancelling');
  assert.equal((await buyer('/api/slots')).data.slots.length, 0);
  assert.equal((await buyer(`/api/bookings/${order.id}/cancel`, 'POST', {})).data.status, 'cancelled');
  assert.equal(cancellations, 1);
  assert.equal((await buyer('/api/slots')).data.slots.length, 1);
});

test('free completion closes the appointment record and unpaid holds can be released safely', async (t) => {
  const f = await fixture(t);
  const buyer = f.session();
  const slotId = await f.createSlot();
  const order = (await f.reserve(buyer, slotId)).data;
  assert.equal((await buyer(`/api/bookings/${order.id}/release`, 'POST', {})).data.status, 'cancelled');
  const requestId = randomUUID();
  await buyer('/api/requests', 'POST', { intake, requestId });
  await f.operator(`/api/admin/requests/${requestId}/schedule`, 'POST', { slotId });
  await f.operator(`/api/admin/requests/${requestId}`, 'PATCH', { status: '상담 완료' });
  const board = (await f.operator('/api/admin/board')).data;
  assert.equal(board.requests[0].status, '상담 완료');
  assert.equal(board.bookings.find((booking) => booking.requestId === requestId).status, 'free_completed');
});

test('missing Toss credentials disable checkout while free intake remains available', async (t) => {
  const f = await fixture(t, { tossClientKey: '', tossSecretKey: '' });
  const buyer = f.session();
  assert.equal((await buyer('/api/config')).data.paymentReady, false);
  assert.equal((await buyer('/api/requests', 'POST', { intake, requestId: randomUUID() })).status, 201);
  assert.equal((await f.reserve(buyer, await f.createSlot())).status, 503);
});

test('calendar and free intake survive an API restart without seeding sample data', async () => {
  const directory = await mkdtemp(join(tmpdir(), 'dalbit-booking-test-'));
  const databasePath = join(directory, 'test.sqlite');
  const password = randomBytes(24).toString('hex');
  let f;
  try {
    f = await fixture(null, { databasePath, adminPassword: password });
    await f.createSlot();
    await f.session()('/api/requests', 'POST', { intake, requestId: randomUUID() });
    await f.close();
    f = null;
    f = await fixture(null, { databasePath, adminPassword: password });
    const board = (await f.operator('/api/admin/board')).data;
    assert.equal(board.slots.length, 1);
    assert.equal(board.requests.length, 1);
    assert.equal(board.bookings.length, 0);
  } finally {
    if (f) await f.close();
    for (const suffix of ['', '-wal', '-shm']) await rm(databasePath + suffix, { force: true });
    await rmdir(directory);
  }
});

test('Korean dates and calendar months are independent of the device timezone', () => {
  assert.equal(koreanDate('2026-10-12T16:00:00Z'), '2026-10-13');
  assert.equal(shiftMonth('2026-12', 1), '2027-01');
  assert.equal(shiftMonth('2026-01', -1), '2025-12');
  assert.equal(monthDays('2028-02').filter(Boolean).length, 29);
  assert.equal(monthDays('2026-10').filter(Boolean).length, 31);
});
