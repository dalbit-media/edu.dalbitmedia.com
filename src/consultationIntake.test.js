import assert from 'node:assert/strict';
import test from 'node:test';
import { CONTACT_METHODS, GRADE_GROUPS, SCHOOL_TYPES, createStudentIntake, getPreferredTime, normalizePhone, validateIntake } from './consultationIntake.js';

const minimal = { name: ' 학생 ', grade: '중학교 2학년', guardian: ' 보호자 ', phone: '010-1234-5678', contact: '카카오톡', contactRole: '보호자' };

test('only student, grade and contact information are needed for intake', () => {
  assert.deepEqual(validateIntake(minimal), {});
  const saved = createStudentIntake(minimal, 123);
  assert.equal(saved.id, 123);
  assert.equal(saved.name, '학생');
  assert.equal(saved.guardian, '보호자');
  assert.equal(saved.phone, '01012345678');
  assert.deepEqual(saved.subjects, []);
  assert.equal(saved.goals, '');
  assert.equal(saved.preferred, '일정 협의');
  assert.equal(saved.status, '신규');
});

test('domestic and international grades and education pathways remain distinct', () => {
  for (const grade of GRADE_GROUPS.flatMap((group) => group.options)) {
    assert.deepEqual(validateIntake({ ...minimal, grade }), {});
  }
  assert.ok(GRADE_GROUPS[0].options.includes('고등학교 3학년'));
  assert.ok(GRADE_GROUPS[1].options.includes('Grade 12'));
  for (const schoolType of SCHOOL_TYPES) {
    const form = { ...minimal, schoolType, schoolStage: '진학 준비' };
    assert.deepEqual(validateIntake(form), {});
    assert.equal(createStudentIntake(form).schoolType, schoolType);
  }
  assert.ok(SCHOOL_TYPES.includes('자율형 사립고(민사고 등)'));
  assert.ok(SCHOOL_TYPES.includes('과학고·영재학교'));
  assert.ok(SCHOOL_TYPES.includes('예술중·예술고'));
});

test('phone validation accepts Korean formats and international numbers but rejects malformed values', () => {
  for (const phone of ['01012345678', '010-1234-5678', '０１０ １２３４ ５６７８', '02-123-4567', '+1 (206) 555-0123', '+44 20 7946 0958']) {
    assert.deepEqual(validateIntake({ ...minimal, phone }), {});
  }
  for (const phone of ['', ' ', '010-1234', '010123456789', '123', '++12065550123', '01012345678abc', '1'.repeat(16)]) {
    assert.ok(validateIntake({ ...minimal, phone }).phone);
  }
  assert.equal(normalizePhone('+1 (206) 555-0123'), '+12065550123');
});

test('overseas users can select email without supplying a phone number', () => {
  const form = { ...minimal, contact: '이메일', contactRole: '학생 본인', phone: '', email: ' student@example.com ' };
  assert.deepEqual(validateIntake(form), {});
  const saved = createStudentIntake(form);
  assert.equal(saved.phone, '');
  assert.equal(saved.email, 'student@example.com');
  assert.equal(saved.contactRole, '학생 본인');
  for (const email of ['', 'invalid', 'name@', 'a b@example.com']) {
    assert.ok(validateIntake({ ...form, email }).email);
  }
  for (const contact of CONTACT_METHODS.filter((method) => method !== '이메일')) {
    assert.ok(validateIntake({ ...minimal, contact, email: 'invalid' }).email);
  }
});

test('partial optional schedules have clear meanings and use Korean time', () => {
  assert.equal(getPreferredTime({}), '일정 협의');
  assert.equal(getPreferredTime({ day: '월' }), '월요일 · 시간 협의 (한국시간)');
  assert.equal(getPreferredTime({ time: '오후 2:00' }), '요일 협의 · 오후 2:00 (한국시간)');
  assert.equal(getPreferredTime({ day: '월', time: '오후 2:00' }), '월요일 · 오후 2:00 (한국시간)');
});

test('invalid input produces explicit errors instead of a saved student', () => {
  const invalid = { ...minimal, name: ' ', guardian: ' ', grade: 'invalid', contact: 'invalid', contactRole: 'invalid', schoolType: 'invalid', schoolStage: 'invalid', day: 'invalid', time: 'invalid' };
  for (const key of ['name', 'guardian', 'grade', 'contact', 'contactRole', 'schoolType', 'schoolStage', 'day', 'time']) {
    assert.ok(validateIntake(invalid)[key]);
  }
  assert.throws(() => createStudentIntake(invalid), /Invalid student intake/);
});
