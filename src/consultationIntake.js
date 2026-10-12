export const GRADE_GROUPS = [
  { label: '국내 학년', options: ['초등학교 5학년', '초등학교 6학년', '중학교 1학년', '중학교 2학년', '중학교 3학년', '고등학교 1학년', '고등학교 2학년', '고등학교 3학년'] },
  { label: '국제학교·해외 학년', options: ['Grade 5', 'Grade 6', 'Grade 7', 'Grade 8', 'Grade 9', 'Grade 10', 'Grade 11', 'Grade 12'] },
];

export const SCHOOL_TYPES = [
  '국제중학교', '외국어고·국제고', '자율형 사립고(민사고 등)', '과학고·영재학교', '예술중·예술고',
  '국제학교', '해외학교·유학 준비', '일반 중·고교 심화학습', '초등학교·중학교 진학 준비', '기타·미정',
];
export const SCHOOL_STAGES = ['재학 중', '진학 준비', '경로 탐색 중'];
export const CONTACT_METHODS = ['카카오톡', '문자', '전화', '이메일'];
export const CONTACT_ROLES = ['보호자', '학생 본인'];
export const DAY_OPTIONS = ['월', '화', '수', '목', '금', '토', '일'];
export const TIME_OPTIONS = ['오전 10:00', '오후 2:00', '오후 4:00', '오후 6:30', '오후 7:00', '오후 8:00'];

const grades = GRADE_GROUPS.flatMap((group) => group.options);
const phoneText = (value) => (value ?? '').normalize('NFKC').trim();

export function normalizePhone(value) {
  return phoneText(value).replace(/[\s().-]/g, '');
}

export function validateIntake(form) {
  const errors = {};
  if (!form.name?.trim()) errors.name = '학생 이름을 입력해 주세요.';
  if (!grades.includes(form.grade)) errors.grade = '현재 학년을 선택해 주세요.';
  if (!form.guardian?.trim()) errors.guardian = '연락받을 분의 성함을 입력해 주세요.';
  if (!CONTACT_METHODS.includes(form.contact)) errors.contact = '연락 방법을 선택해 주세요.';
  if (!CONTACT_ROLES.includes(form.contactRole)) errors.contactRole = '신청자 구분을 선택해 주세요.';
  if (form.contact !== '이메일') {
    const text = phoneText(form.phone);
    const normalized = normalizePhone(text);
    if (!/^\+?\d{7,15}$/.test(normalized) || !/^[+\d\s().-]+$/.test(text)) {
      errors.phone = '연락 가능한 번호를 입력해 주세요. 해외 번호는 +국가번호를 포함할 수 있습니다.';
    } else if (normalized.startsWith('010') && normalized.length !== 11) {
      errors.phone = '010으로 시작하는 휴대전화 번호는 11자리로 입력해 주세요.';
    }
  }
  if (form.contact === '이메일' || form.email?.trim()) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email?.trim() ?? '')) {
      errors.email = '안내를 받을 수 있는 이메일 주소를 입력해 주세요.';
    }
  }
  if (form.schoolType && !SCHOOL_TYPES.includes(form.schoolType)) errors.schoolType = '학교·교육 경로를 목록에서 선택해 주세요.';
  if (form.schoolStage && !SCHOOL_STAGES.includes(form.schoolStage)) errors.schoolStage = '현재 상황을 목록에서 선택해 주세요.';
  if (form.day && !DAY_OPTIONS.includes(form.day)) errors.day = '희망 요일을 목록에서 선택해 주세요.';
  if (form.time && !TIME_OPTIONS.includes(form.time)) errors.time = '희망 시간을 목록에서 선택해 주세요.';
  return errors;
}

export function getPreferredTime({ day, time }) {
  if (!day && !time) return '일정 협의';
  return `${day ? `${day}요일` : '요일 협의'} · ${time || '시간 협의'} (한국시간)`;
}

export function createStudentIntake(form, id = Date.now()) {
  const errors = validateIntake(form);
  if (Object.keys(errors).length) throw new Error(`Invalid student intake: ${Object.keys(errors).join(', ')}`);
  return {
    ...form,
    name: form.name.trim(),
    guardian: form.guardian.trim(),
    phone: form.contact === '이메일' ? '' : normalizePhone(form.phone),
    email: form.email?.trim() ?? '',
    school: form.school?.trim() ?? '',
    region: form.region?.trim() ?? '',
    subjects: form.subjects ?? [],
    goals: form.goals?.trim() ?? '',
    id,
    preferred: getPreferredTime(form),
    submitted: '방금 전',
    status: '신규',
    avatar: form.name.trim().slice(0, 2),
    color: '#f3c989',
  };
}
