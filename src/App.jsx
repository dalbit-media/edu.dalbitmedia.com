import { useEffect, useId, useRef, useState } from 'react';
import ResearchPage, { ResearchCards, ResearchNote } from './ResearchPage';
import BookingAdmin from './BookingAdmin';
import { ConsultationChoice, PaymentReturn } from './ConsultationBooking';
import { ApiError, bookingApi, startPaidBooking } from './bookingApi';
import { PAID_SERVICE } from './booking';
import { getLegacyPath, getRoute, navigateTo } from './navigation';
import { applyPageSeo } from './seo';
import { CONTACT_METHODS, CONTACT_ROLES, DAY_OPTIONS as dayOptions, GRADE_GROUPS, SCHOOL_STAGES, SCHOOL_TYPES, TIME_OPTIONS as timeOptions, createStudentIntake, getPreferredTime, validateIntake } from './consultationIntake';
import {
  ArrowLeft,
  ArrowRight,
  ArrowUp,
  BookOpen,
  CalendarDays,
  Check,
  ChevronDown,
  Clock3,
  GraduationCap,
  LayoutDashboard,
  Menu,
  MoonStar,
  Phone,
  Sparkles,
  UserRound,
  UsersRound,
  X,
} from 'lucide-react';

const consultationTopics = ['진로·학업 적성 검사', '미래 직업 탐색', '토론·관심 확장', '심화 교과 학습', '탐구·연구 활동', '학업 부담·자기조절', '특목·자사고 교육 경로', '국내외 대학 진학 경로', '정기 코칭', '멘토십', '스터디 그룹 매칭', '흥미·강점 발견', '진로·꿈 탐색', '아직 잘 모르겠어요', '국어', '영어', '수학', '과학', '사회', '학습 습관'];
const consultationTopicLabels = {
  '흥미·강점 발견': '흥미·열정 탐색',
  '진로·꿈 탐색': '교육·진로 탐색',
  '아직 잘 모르겠어요': '관심 분야 미정',
};

function Logo({ compact = false }) {
  return (
    <div className={`logo ${compact ? 'logo-compact' : ''}`}>
      <span className="logo-mark"><MoonStar size={20} strokeWidth={2.3} /></span>
      <span>달빛에듀</span>
    </div>
  );
}

function SiteFooter() {
  return (
    <footer>
      <div className="footer-main">
        <Logo compact />
        <p>학습과 발달의 이해 · 교육·진로 탐색</p>
        <span>© 2026 Dalbit Edu</span>
        <a className="footer-admin-link" href="/admin" rel="nofollow">관리자</a>
      </div>
      <p className="footer-credits">사이트 기획·운영: <a href="https://nestos.app" target="_blank" rel="noopener noreferrer">NestOS Research Group</a>. 팀 배경 관련 정보: <a href="https://education.uw.edu/academics/program/learning-sciences-human-development" target="_blank" rel="noopener noreferrer">University of Washington Learning Science</a> 및 Microsoft Hackathon Group. 이 표기는 팀 배경에 관한 설명이며, 대학이나 Microsoft의 공식 제휴·후원·인증을 의미하지 않습니다.</p>
    </footer>
  );
}

function StudentHeader({ currentHash, currentPath }) {
  const [menuOpen, setMenuOpen] = useState(false);
  const navigationId = useId();
  const menuButtonRef = useRef(null);
  const links = [
    { href: '/#about', label: '상담 안내' },
    { href: '/#ongoing-support', label: '코칭·멘토십' },
    { href: '/#process', label: '진행 과정' },
    { href: '/research', label: '학습과학 자료' },
  ];

  useEffect(() => { setMenuOpen(false); }, [currentHash, currentPath]);

  return (
    <header className={`site-header${currentPath.startsWith('/research') ? ' research-header' : ''}`} onKeyDown={(event) => {
      if (event.key === 'Escape' && menuOpen) {
        setMenuOpen(false);
        menuButtonRef.current?.focus();
      }
    }}>
      <a className="home-link" href="/#home" aria-label="달빛에듀 홈" onClick={() => setMenuOpen(false)}><Logo /></a>
      <nav id={navigationId} aria-label="주요 메뉴" className={menuOpen ? 'nav-open' : ''}>
        {links.map(({ href, label }) => (
          <a
            key={href}
            href={href}
            aria-current={href === '/research' ? currentPath.startsWith(href) ? 'page' : undefined : currentPath === '/' && currentHash === href.slice(1) ? 'location' : undefined}
            onClick={() => setMenuOpen(false)}
          >{label}</a>
        ))}
      </nav>
      <div className="header-actions">
        <a className="header-intake-link" href="/#consultation" onClick={() => setMenuOpen(false)}>상담 신청</a>
        <button type="button" ref={menuButtonRef} className="menu-button" onClick={() => setMenuOpen(!menuOpen)} aria-label={menuOpen ? '메뉴 닫기' : '메뉴 열기'} aria-expanded={menuOpen} aria-controls={navigationId}>
          {menuOpen ? <X aria-hidden="true" /> : <Menu aria-hidden="true" />}
        </button>
      </div>
    </header>
  );
}

function Field({ id, label, required, children, hint, error }) {
  return (
    <div className="field">
      <label className="field-label" htmlFor={id}>{label}{required && <em aria-hidden="true">*</em>}</label>
      {children}
      {hint && <small id={`${id}-hint`}>{hint}</small>}
      {error && <p className="field-error" id={`${id}-error`}>{error}</p>}
    </div>
  );
}

function StudentForm({ onSubmit }) {
  const [submitted, setSubmitted] = useState(false);
  const [errors, setErrors] = useState({});
  const [submissionError, setSubmissionError] = useState('');
  const formRef = useRef(null);
  const detailsRef = useRef(null);
  const requestId = useRef(crypto.randomUUID());
  const [service, setService] = useState('free');
  const [slotId, setSlotId] = useState('');
  const [consent, setConsent] = useState(false);
  const [paymentReady, setPaymentReady] = useState(false);
  const [pending, setPending] = useState(false);
  const [receiptId, setReceiptId] = useState('');
  const [form, setForm] = useState({
    name: '', grade: '', school: '', region: '', subjects: [], goals: '',
    guardian: '', phone: '', email: '', contact: '카카오톡', day: '', time: '',
    contactRole: '보호자', schoolType: '', schoolStage: '',
  });

  const update = (key, value) => {
    setForm((current) => ({ ...current, [key]: value }));
    setErrors((current) => {
      const next = { ...current };
      delete next[key];
      if (key === 'contact') {
        delete next.phone;
        delete next.email;
      }
      return next;
    });
  };
  const toggleSubject = (subject) => update(
    'subjects',
    form.subjects.includes(subject)
      ? form.subjects.filter((item) => item !== subject)
      : [...form.subjects, subject],
  );
  const inputProps = (key, hint = false) => ({
    id: `intake-${key}`,
    name: key,
    'aria-invalid': Boolean(errors[key]),
    'aria-describedby': [hint && `intake-${key}-hint`, errors[key] && `intake-${key}-error`].filter(Boolean).join(' ') || undefined,
  });

  const handleSubmit = async (event) => {
    event.preventDefault();
    if (pending) return;
    const nextErrors = validateIntake(form);
    setErrors(nextErrors);
    setSubmissionError('');
    if (Object.keys(nextErrors).length) {
      if (['schoolType', 'schoolStage', 'day', 'time'].some((key) => nextErrors[key])) detailsRef.current.open = true;
      requestAnimationFrame(() => formRef.current?.querySelector('[aria-invalid="true"]')?.focus());
      return;
    }
    if (service === 'paid' && (!paymentReady || !slotId || !consent)) {
      setSubmissionError(!paymentReady ? '결제 설정이 완료된 후 유료 예약을 이용할 수 있습니다.' : !slotId ? '유료 상담 시간을 선택해 주세요.' : '상담 금액과 취소·환불 안내를 확인해 주세요.');
      return;
    }
    setPending(true);
    try {
      const result = await onSubmit(createStudentIntake(form), { service, slotId, nonce: requestId.current });
      if (service === 'paid') return;
      setReceiptId(result.id);
      setSubmitted(true);
      requestAnimationFrame(() => document.getElementById('intake-success-heading')?.focus());
    } catch (error) {
      console.error('Consultation submission failed:', error);
      setSubmissionError(error instanceof ApiError ? error.message : '신청을 처리하지 못했습니다. 입력 내용은 유지됩니다. 잠시 후 다시 시도해 주세요.');
      if (error instanceof ApiError && error.holdReleased) requestId.current = crypto.randomUUID();
    } finally {
      setPending(false);
    }
  };

  if (submitted) {
    return (
      <div className="form-card intake-card success-card">
        <div className="success-icon"><Check size={28} /></div>
        <span className="eyebrow">무료 기본 상담 신청 접수</span>
        <h2 id="intake-success-heading" tabIndex={-1}>{form.name.trim()} 학생의<br />무료 기본 상담 신청을 접수했습니다.</h2>
        <p>담당자가 가능한 시간을 확인한 뒤 연락드립니다.<br />상담은 최대 15분이며, 아직 일정이 확정된 것은 아닙니다.</p>
        <div className="summary-ticket">
          <div><UserRound size={19} /><span>{form.grade} · {form.contactRole}</span></div>
          <strong>{form.guardian.trim()} · {form.contact}</strong>
          <p>{form.contact === '이메일' ? form.email.trim() : form.phone.trim()}</p>
          <p>{getPreferredTime(form)}</p>
          <small>접수번호: {receiptId}</small>
        </div>
        <button className="primary-button" onClick={() => {
          setSubmitted(false);
          requestId.current = crypto.randomUUID();
          setErrors({});
          setSubmissionError('');
          setForm({ name: '', grade: '', school: '', region: '', subjects: [], goals: '', guardian: '', phone: '', email: '', contact: '카카오톡', day: '', time: '', contactRole: '보호자', schoolType: '', schoolStage: '' });
        }}>
          다른 학생 정보 입력
        </button>
      </div>
    );
  }

  return (
    <form className="form-card intake-card" ref={formRef} onSubmit={handleSubmit} noValidate>
      <div className="form-heading">
        <h2>상담 신청·유료 예약</h2>
        <p>학생·연락 정보는 필수, 학교·주제·일정은 선택 사항입니다.</p>
      </div>
      <fieldset className="intake-content" disabled={pending}>
      <ConsultationChoice service={service} onService={(value) => { setService(value); setSubmissionError(''); }} slotId={slotId} onSlot={setSlotId} consent={consent} onConsent={setConsent} onReady={setPaymentReady} />
      <p className="intake-required-note"><span aria-hidden="true">*</span> 필수 입력 · 초5–고3 / 해외 Grade 5–12</p>
      <div className="fields">
        <fieldset className="intake-group">
          <legend><UserRound size={17} aria-hidden="true" /> 학생 정보</legend>
          <div className="field-row">
            <Field id="intake-name" label="학생 이름" required error={errors.name}>
              <input {...inputProps('name')} required maxLength={80} autoComplete="off" value={form.name} onChange={(e) => update('name', e.target.value)} placeholder="학생 성명" />
            </Field>
            <Field id="intake-grade" label="현재 학년" required error={errors.grade}>
              <div className="select-wrap">
                <select {...inputProps('grade')} required value={form.grade} onChange={(e) => update('grade', e.target.value)}>
                  <option value="">학년 선택</option>
                  {GRADE_GROUPS.map((group) => <optgroup label={group.label} key={group.label}>{group.options.map((grade) => <option value={grade} key={grade}>{grade.replace('학교', '')}</option>)}</optgroup>)}
                </select>
                <ChevronDown size={17} aria-hidden="true" />
              </div>
            </Field>
          </div>
        </fieldset>
        <fieldset className="intake-group">
          <legend><Phone size={17} aria-hidden="true" /> 연락 정보</legend>
          <div className="intake-role" role="group" aria-label="신청자 구분">
            {CONTACT_ROLES.map((contactRole) => <button type="button" aria-pressed={form.contactRole === contactRole} key={contactRole} onClick={() => update('contactRole', contactRole)}>{contactRole}</button>)}
          </div>
          <fieldset className="field choice-field">
            <legend className="field-label">연락 방법</legend>
            <div className="contact-options">
              {CONTACT_METHODS.map((method) => <button type="button" key={method} aria-pressed={form.contact === method} className={form.contact === method ? 'selected' : ''} onClick={() => update('contact', method)}>{method}</button>)}
            </div>
          </fieldset>
          <div className="field-row">
            <Field id="intake-guardian" label="연락받을 분 성함" required error={errors.guardian}>
              <input {...inputProps('guardian')} required maxLength={80} autoComplete="name" value={form.guardian} onChange={(e) => update('guardian', e.target.value)} placeholder={form.contactRole === '보호자' ? '보호자 성명' : '학생 본인 성명'} />
            </Field>
            {form.contact === '이메일' ? (
              <Field id="intake-email" label="이메일 주소" required error={errors.email}>
                <input {...inputProps('email')} required type="email" inputMode="email" autoComplete="email" maxLength={254} value={form.email} onChange={(e) => update('email', e.target.value)} placeholder="name@example.com" />
              </Field>
            ) : (
              <Field id="intake-phone" label="연락처" required error={errors.phone}>
                <input {...inputProps('phone')} required type="tel" inputMode="tel" autoComplete="tel" maxLength={32} value={form.phone} onChange={(e) => update('phone', e.target.value)} placeholder="01012345678" />
              </Field>
            )}
          </div>
          <p className="intake-contact-hint">전화번호는 하이픈 없이 입력할 수 있습니다. 해외 번호는 +국가번호를 사용하거나 이메일을 선택합니다.</p>
          {form.contact !== '이메일' && form.email && (
            <Field id="intake-email" label="추가 이메일 (선택)" error={errors.email}>
              <input {...inputProps('email')} type="email" inputMode="email" autoComplete="email" value={form.email} onChange={(e) => update('email', e.target.value)} />
            </Field>
          )}
        </fieldset>
      </div>
      <details className="intake-details" ref={detailsRef}>
        <summary><span>학교·상담 정보 추가</span><small>선택 사항</small><ChevronDown size={18} aria-hidden="true" /></summary>
        <div className="fields">
          <p className="intake-contact-hint">재학 중이거나 준비하는 교육 경로를 알려주시면 학습 환경과 상담 주제를 구체화할 수 있습니다.</p>
          <div className="field-row">
            <Field id="intake-schoolType" label="학교·교육 경로 (선택)" error={errors.schoolType}>
              <div className="select-wrap">
                <select {...inputProps('schoolType')} value={form.schoolType} onChange={(e) => update('schoolType', e.target.value)}><option value="">선택하지 않음</option>{SCHOOL_TYPES.map((schoolType) => <option value={schoolType} key={schoolType}>{schoolType.replace('자율형 사립고', '자사고')}</option>)}</select>
                <ChevronDown size={17} aria-hidden="true" />
              </div>
            </Field>
            <Field id="intake-schoolStage" label="현재 상황 (선택)" error={errors.schoolStage}>
              <div className="select-wrap">
                <select {...inputProps('schoolStage')} value={form.schoolStage} onChange={(e) => update('schoolStage', e.target.value)}><option value="">선택하지 않음</option>{SCHOOL_STAGES.map((schoolStage) => <option key={schoolStage}>{schoolStage}</option>)}</select>
                <ChevronDown size={17} aria-hidden="true" />
              </div>
            </Field>
          </div>
          <div className="field-row">
            <Field id="intake-school" label="현재·준비 학교명 (선택)">
              <input {...inputProps('school')} autoComplete="off" maxLength={120} value={form.school} onChange={(e) => update('school', e.target.value)} placeholder="예: ○○외고, 민사고, ○○과학고" />
            </Field>
            <Field id="intake-region" label="거주 국가·지역 (선택)">
              <input {...inputProps('region')} autoComplete="off" maxLength={120} value={form.region} onChange={(e) => update('region', e.target.value)} placeholder="예: 서울 / 미국 시애틀" />
            </Field>
          </div>
          <fieldset className="field choice-field">
            <legend className="field-label">관심 분야와 상담 주제 (선택·복수 선택)</legend>
            <div className="choice-grid">
              {consultationTopics.map((subject) => (
                <button type="button" key={subject} aria-pressed={form.subjects.includes(subject)} onClick={() => toggleSubject(subject)} className={form.subjects.includes(subject) ? 'selected' : ''}>
                  {form.subjects.includes(subject) && <Check size={15} aria-hidden="true" />}{consultationTopicLabels[subject] ?? subject}
                </button>
              ))}
            </div>
          </fieldset>
          <Field id="intake-goals" label="상담에서 논의할 내용 (선택)">
            <textarea {...inputProps('goals')} value={form.goals} maxLength={3000} onChange={(e) => update('goals', e.target.value)} placeholder="예: 과학고 진학을 검토하며 수학·과학 심화학습과 탐구 활동의 방향을 논의하고 싶습니다." rows={3} />
          </Field>
          <fieldset className="field choice-field">
            <legend className="field-label">희망 요일 (선택)</legend>
            <div className="day-options">
              {dayOptions.map((day) => <button type="button" key={day} aria-pressed={form.day === day} className={form.day === day ? 'selected' : ''} onClick={() => update('day', form.day === day ? '' : day)}>{day}</button>)}
            </div>
            {errors.day && <p className="field-error">{errors.day}</p>}
          </fieldset>
          <fieldset className="field choice-field">
            <legend className="field-label">희망 시간 (선택·한국시간 UTC+9)</legend>
            <div className="time-options">
              {timeOptions.map((time) => (
                <button type="button" key={time} aria-pressed={form.time === time} className={form.time === time ? 'selected' : ''} onClick={() => update('time', form.time === time ? '' : time)}>
                  <Clock3 size={15} aria-hidden="true" />{time}
                </button>
              ))}
            </div>
            <small>일정을 선택하지 않아도 저장할 수 있습니다. 실제 일정은 별도 확인이 필요합니다.</small>
            {errors.time && <p className="field-error">{errors.time}</p>}
          </fieldset>
        </div>
      </details>
      {(Object.keys(errors).length > 0 || submissionError) && <div className="intake-error-summary" role="alert">{submissionError || '표시된 입력 항목을 확인해 주세요. 입력하신 내용은 유지됩니다.'}</div>}
      <div className="form-actions">
        <button type="submit" className="primary-button" disabled={pending || (service === 'paid' && !paymentReady)}>{pending ? '처리 중입니다' : service === 'free' ? '무료 기본 상담 신청' : `${PAID_SERVICE.amount.toLocaleString('ko-KR')}원 결제·예약`} <ArrowRight size={18} aria-hidden="true" /></button>
      </div>
      </fieldset>
      <p className="privacy-note">입력 정보는 상담 준비 및 일정 안내 목적으로 사용됩니다.</p>
      <p className="intake-storage-note">입력 정보는 서버에 접수되며 로그인한 상담 운영자가 확인합니다. 무료 신청은 일정 확인 후 연락드리고, 유료 예약은 결제 확인 후 확정됩니다.</p>
    </form>
  );
}

function StudentPage({ onSubmit, hash, pathname }) {
  return (
    <div className="student-page" id="home">
      <StudentHeader currentHash={hash} currentPath={pathname} />
      <main className="hero">
        <section className="hero-copy">
          <div className="hero-badge"><GraduationCap size={16} aria-hidden="true" /> 초5–고3 · 해외 Grade 5–12</div>
          <p className="hero-audience">글로벌 기술 기업·대학·특목고 출신 상담팀</p>
          <h1>전문가와 함께 찾는<br /><span>나에게 맞는 공부와 진로</span></h1>
          <div className="hero-backgrounds" role="group" aria-label="상담팀 구성원의 근무·교육 배경">
            <p className="hero-subtitle">글로벌 기술 현장의 실무 경험과 학습과학 연구를 바탕으로, 학생에게 맞는 공부 방법과 진로를 함께 찾습니다. 현재의 학습 습관과 강점을 살펴보고, 목표를 실천할 수 있는 방법을 논의합니다.</p>
            <p className="hero-subtitle">국내외 대학과 특목·자사고 출신 상담팀이 학생의 학교와 관심 분야에 맞는 계획을 세웁니다. 학업 부담과 진학 목표를 함께 살펴보고, 심화학습·탐구 활동·학교 선택에서 필요한 다음 단계를 정리합니다.</p>
          </div>
          <aside className="hero-backgrounds-excerpt" aria-label="상담팀 배경 상세">
            <p>상담팀에는 마이크로소프트, 구글, 애플의 실무 경험과 워싱턴대학교(학습과학), 일리노이대학교(컴퓨터과학), 매사추세츠공과대학교(MIT), 스탠퍼드대학교, 하버드대학교, 컬럼비아대학교, 코넬대학교, 로드아일랜드 디자인스쿨 등의 교육 배경을 가진 구성원이 참여합니다. 특목고·자사고·영재학교 출신 구성원도 함께합니다.</p>
          </aside>
          <div className="education-contexts" aria-label="상담에서 고려하는 교육 경로">
            <span>국제중</span><span>외고·국제고</span><span>자사고·민사고</span><span>과학고·영재학교</span><span>예중·예고</span><span>국제학교·유학</span>
          </div>
          <div className="hero-invitation">
            <a className="primary-button" href="#consultation">학생·연락 정보 입력 <ArrowRight size={18} /></a>
            <a className="research-link" href="#about">상담 범위 및 진행 안내</a>
          </div>
          <p className="hero-note"><Check size={16} aria-hidden="true" /> 무료 기본 상담: 최대 15분 · 일정 확인 후 연락<br />전문가 심층 상담: {PAID_SERVICE.description} · {PAID_SERVICE.amount.toLocaleString('ko-KR')}원 ({PAID_SERVICE.priceNote}) · 시간 선택 후 결제</p>
        </section>
        <section className="hero-form" id="consultation" aria-label="교육·진로 및 학습 상담 신청"><StudentForm onSubmit={onSubmit} /></section>
      </main>
      <section className="learning-section" id="about" aria-labelledby="consultation-heading">
        <div className="section-heading">
          <span className="eyebrow">상담에서 함께 하는 일</span>
          <h2 id="consultation-heading">학습과학 기반 진로·학업 탐색</h2>
          <p>학생이 어떻게 배우고, 어떤 활동에 몰입하며, 앞으로 어떤 문제를 해결하는 일에 참여하고 싶은지 살펴봅니다.<br />학습과학 연구를 바탕으로 검사·대화·토론에 미래 직업 탐색을 더해, 강점과 관심을 변화하는 일의 세계와 연결하고 직접 시도할 학습·탐구 과제를 정리합니다.</p>
          <p className="scope-note">검사 결과는 자기 이해를 돕는 참고 자료이며, 고정된 능력이나 진로의 정답을 뜻하지 않습니다. 본 상담은 AI 도구 활용 수업이 아닙니다.</p>
        </div>
        <div className="learning-grid">
          <article className="learning-card path-card">
            <div className="path-card-heading"><span>01 · 나를 이해하기</span><BookOpen size={24} aria-hidden="true" /></div>
            <h3>진로·학업 적성 검사</h3>
            <p>검사와 대화로 학습 선호, 강점과 문제 해결 방식을 살펴봅니다. 결과를 특정 직업이나 능력의 등급으로 단정하지 않고, 실제 학습 경험과 함께 해석해 공부 방법과 진로 탐색의 출발점으로 삼습니다.</p>
          </article>
          <article className="learning-card path-card">
            <div className="path-card-heading"><span>02 · 좋아하는 것 찾기</span><Sparkles size={24} aria-hidden="true" /></div>
            <h3>흥미·열정 탐색</h3>
            <p>호기심과 몰입을 느꼈던 활동을 돌아보며, 무엇을 더 배우고 싶은지와 그 이유를 함께 찾습니다. 읽기·탐구·작은 프로젝트를 통해 관심을 직접 확인하고, 꾸준히 이어갈 수 있는 활동을 계획합니다.</p>
          </article>
          <article className="learning-card path-card">
            <div className="path-card-heading"><span>03 · 새로운 생각 만나기</span><UsersRound size={24} aria-hidden="true" /></div>
            <h3>토론으로 넓히는 생각과 관심</h3>
            <p>과학·기술·인문·예술의 질문을 함께 토론하며 새로운 관점과 아이디어를 만납니다. 서로의 주장과 근거를 비교하고 질문하는 과정에서 호기심을 넓히고, 더 알아보고 싶은 주제와 직접 시도할 탐구 과제를 찾습니다.</p>
          </article>
          <article className="learning-card path-card">
            <div className="path-card-heading"><span>04 · 미래의 일 살펴보기</span><GraduationCap size={24} aria-hidden="true" /></div>
            <h3>미래 직업과 일의 변화 탐색</h3>
            <p>AI·데이터 분석, 기후·에너지 기술, 바이오·헬스, 디지털 창작 등 변화하는 분야를 살펴봅니다. 유망 직업 순위보다 실제로 해결하는 문제, 일하는 방식과 필요한 배움을 비교하고, 관심을 확인할 읽기·탐구·작은 프로젝트를 계획합니다.</p>
          </article>
        </div>
      </section>
      <section className="learning-section" id="ongoing-support" aria-labelledby="support-heading">
        <div className="section-heading">
          <span className="eyebrow">지속적인 학습 지원</span>
          <h2 id="support-heading">정기 코칭 · 멘토십 · 스터디 그룹 매칭</h2>
          <p>일회성 상담 이후에도 학습 계획의 실행과 관심 분야의 탐색을 이어갈 수 있도록 지원합니다.<br />학생의 목표와 참여 여건을 확인한 뒤 진행 방식, 일정 및 비용을 별도로 안내합니다.</p>
        </div>
        <div className="learning-grid">
          <article className="learning-card path-card">
            <div className="path-card-heading"><span>01 · 계획과 점검</span><Clock3 size={24} aria-hidden="true" /></div>
            <h3>정기 코칭</h3>
            <p>학습 목표와 실행 계획을 세우고, 주기적인 대화에서 진행 상황과 어려움을 검토합니다. 과제 기록과 피드백을 바탕으로 학습 전략과 자기조절 방식을 조정하며, 참여 주기와 기간은 협의합니다.</p>
            <a className="research-link" href="#consultation">정기 코칭 문의</a>
          </article>
          <article className="learning-card path-card">
            <div className="path-card-heading"><span>02 · 경험과 탐색</span><GraduationCap size={24} aria-hidden="true" /></div>
            <h3>멘토십</h3>
            <p>학생의 관심 분야와 교육 경로에 맞는 멘토 연결을 검토합니다. 전공·학습 경험에 관한 대화와 탐색 과제의 피드백을 중심으로 진행하며, 멘토의 참여 가능 여부와 학생의 필요를 확인한 뒤 연결을 안내합니다.</p>
            <a className="research-link" href="#consultation">멘토십 문의</a>
          </article>
          <article className="learning-card path-card">
            <div className="path-card-heading"><span>03 · 협력과 참여</span><UsersRound size={24} aria-hidden="true" /></div>
            <h3>스터디 그룹 매칭</h3>
            <p>학년, 관심 주제, 학습 목표와 참여 가능한 시간을 바탕으로 함께 공부할 그룹을 검토합니다. 공동 읽기·탐구와 학습 점검 등 활동 목적 및 참여 규칙을 확인하며, 적합한 참여자가 확보된 경우 연결을 안내합니다.</p>
            <a className="research-link" href="#consultation">스터디 그룹 매칭 문의</a>
          </article>
        </div>
        <p className="scope-note">신청서의 관심 분야와 상담 주제에서 희망 서비스를 선택해 주세요. 문의 접수만으로 정기 일정이나 매칭이 확정되지 않으며, 위 서비스는 1회 전문가 심층 상담 결제에 포함되지 않습니다.</p>
      </section>
      <section className="learning-section" id="process" aria-labelledby="process-heading">
        <div className="section-heading">
          <span className="eyebrow">신청부터 후속 탐색까지</span>
          <h2 id="process-heading">상담은 이렇게 진행합니다</h2>
          <p>신청 내용을 바탕으로 상담 방식과 일정을 정한 뒤, 자기 이해와 진로 탐색을 진행합니다.<br />상담에서 확인한 관심과 과제를 실제 학습 활동으로 이어갈 다음 단계를 함께 정리합니다.</p>
        </div>
        <ol className="process-steps" role="list">
          <li>
            <span className="process-step-number" aria-hidden="true">01</span>
            <div><h3>학생·연락 정보 입력</h3><p>학생 이름과 학년, 연락받을 분의 정보를 입력합니다. 관심 분야와 상담 주제는 선택 사항이며, 적성 검사·흥미 탐색·미래 직업 등 논의하고 싶은 내용을 남길 수 있습니다.</p></div>
          </li>
          <li>
            <span className="process-step-number" aria-hidden="true">02</span>
            <div><h3>상담 방식과 일정 확인</h3><p>무료 기본 상담은 최대 15분이며, 담당자가 가능한 시간을 확인한 뒤 연락드립니다. 전문가 심층 상담은 {PAID_SERVICE.description} · {PAID_SERVICE.amount.toLocaleString('ko-KR')}원 ({PAID_SERVICE.priceNote})이며, 공개된 시간을 선택하고 결제가 확인되면 예약이 확정됩니다.</p></div>
          </li>
          <li>
            <span className="process-step-number" aria-hidden="true">03</span>
            <div><h3>검사·대화·토론으로 탐색</h3><p>상담 목적에 맞춰 검사·대화·토론의 진행 방식을 안내합니다. 학습 경험과 관심을 바탕으로 학업 적성, 흥미와 미래 직업을 함께 살펴보고, 더 알아볼 질문을 정리합니다.</p></div>
          </li>
          <li>
            <span className="process-step-number" aria-hidden="true">04</span>
            <div><h3>다음 활동과 후속 지원 계획</h3><p>읽기·탐구·작은 프로젝트 등 다음에 시도할 활동을 정리합니다. 정기 코칭·멘토십·스터디 그룹 매칭이 필요하면 참여 여건을 확인하고, 일정과 비용을 별도로 안내합니다.</p></div>
          </li>
        </ol>
        <div className="process-actions">
          <a className="primary-button" href="#consultation">상담 신청 <ArrowRight size={18} aria-hidden="true" /></a>
          <a className="research-link" href="#ongoing-support">정기 코칭·멘토십 등 후속 지원 보기</a>
        </div>
      </section>
      <section className="education-pathways learning-section" aria-labelledby="pathways-heading">
        <div className="section-heading">
          <span className="eyebrow">재학·진학 준비 단계별 검토</span>
          <h2 id="pathways-heading">학교 유형을 넘어, 실제 교육과정을 중심으로</h2>
          <p>학교의 명칭이나 성취 수준만으로 학생을 분류하지 않습니다. 다음은 교육 경로별로 상담에서 검토할 수 있는 주제이며, 학교와의 제휴나 입학 결과를 의미하지 않습니다.</p>
        </div>
        <div className="pathway-grid">
          <article><h3>국제중·외고·국제고·자사고</h3><p>언어·인문사회 탐구, 교과 심화와 자기조절을 검토합니다. 민사고 등 관심 학교의 교육과정과 학생의 경험을 비교하며 재학 및 진학 준비 과제를 정리합니다.</p></article>
          <article><h3>과학고·영재학교</h3><p>수학·과학의 개념 이해와 탐구 질문, 연구·프로젝트 경험을 검토합니다. 문제 해결의 근거와 과정, 학업 부담 및 협력 경험을 함께 살펴봅니다.</p></article>
          <article><h3>국제학교·해외학교·유학 준비</h3><p>재학 학교의 교육과정과 언어 환경, 탐구 활동 및 국내외 진학 계획을 검토합니다. 학년 명칭과 학사 일정이 다를 수 있으므로 현재 학교의 기준을 확인합니다.</p></article>
        </div>
        <p className="scope-note">일반 중·고교의 심화학습 학생과 진학 경로를 탐색 중인 학생도 포함합니다. 학교 유형은 상담 맥락을 이해하기 위한 정보이며 선발 기준이 아닙니다.</p>
      </section>
      <section className="learning-section research-section" id="research" aria-labelledby="research-heading">
        <div className="section-heading">
          <span className="eyebrow">학습과학·인간 발달 문헌</span>
          <h2 id="research-heading">이론과 연구의 검토</h2>
          <p>흥미 발달, 학습 전략과 진로 탐색에 관한 문헌을 소개합니다.<br />이론적 주장과 실증적 결과를 구분하고, 연구 대상·맥락 및 적용의 한계를 검토합니다.</p>
        </div>
        <ResearchCards featured />
        <ResearchNote />
        <div className="research-hub-link">
          <a className="research-link" href="/research">전체 문헌 목록 및 과목별 읽기 자료 <ArrowRight size={16} /></a>
        </div>
      </section>
      <section className="consultation-cta" aria-labelledby="signup-heading">
        <div>
          <span className="eyebrow">상담 안내</span>
          <h2 id="signup-heading">개별 학습 상황과 탐색 과제의 논의</h2>
          <p>학교와 교육 경로에 맞는 후속 과제를 검토하기 위해 학생·연락 정보를 먼저 입력할 수 있습니다.<br />상담은 진단이나 성적·진학·진로 결과의 보장을 목적으로 하지 않습니다.</p>
        </div>
        <a className="primary-button" href="#consultation">상담 신청 <ArrowRight size={18} /></a>
      </section>
      <SiteFooter />
    </div>
  );
}

function Sidebar() {
  return (
    <aside className="sidebar">
      <Logo />
      <nav>
        <button className="active" onClick={() => window.scrollTo(0, 0)}><LayoutDashboard size={19} /> 상담 운영</button>
        <button onClick={() => document.getElementById('admin-calendar')?.scrollIntoView()}><CalendarDays size={19} /> 예약 달력</button>
        <button onClick={() => document.getElementById('admin-requests')?.scrollIntoView()}><UsersRound size={19} /> 무료 기본 상담 요청</button>
      </nav>
      <div className="sidebar-bottom">
        <button onClick={() => navigateTo('/#home')}><ArrowLeft size={17} /> 상담 신청 화면</button>
        <div className="admin-profile">
          <div><UserRound size={18} /></div><p><strong>상담 운영자</strong><small>로그인 필요 · 보호된 화면</small></p>
        </div>
      </div>
    </aside>
  );
}

function ScrollToTop() {
  const [visible, setVisible] = useState(() => typeof window !== 'undefined' && window.scrollY > 300);

  useEffect(() => {
    const updateVisibility = () => setVisible(window.scrollY > 300);
    updateVisibility();
    window.addEventListener('scroll', updateVisibility, { passive: true });
    return () => window.removeEventListener('scroll', updateVisibility);
  }, []);

  if (!visible) return null;

  return (
    <button
      type="button"
      className="scroll-to-top"
      aria-label="맨 위로 이동"
      onClick={() => window.scrollTo({
        top: 0,
        behavior: window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth',
      })}
    >
      <ArrowUp size={18} aria-hidden="true" /> 맨 위로
    </button>
  );
}

export default function App({ initialPath, initialHash } = {}) {
  const [pathname, setPathname] = useState(() => initialPath ?? window.location.pathname);
  const [hash, setHash] = useState(() => initialHash ?? window.location.hash);
  const route = getRoute(pathname);
  const { isAdmin: isAdminPage, isResearch: isResearchPage, readingId } = route;
  const submitConsultation = async (student, { service, slotId, nonce }) => {
    if (service === 'paid') return startPaidBooking(student, slotId, nonce);
    return bookingApi('/requests', { method: 'POST', body: { intake: student, requestId: nonce } });
  };
  useEffect(() => {
    const updateLocation = () => {
      const legacy = window.location.pathname === '/' && getLegacyPath(window.location.hash);
      if (legacy) window.history.replaceState(null, '', legacy);
      setPathname(window.location.pathname);
      setHash(window.location.hash);
    };
    const handleLink = (event) => {
      if (event.defaultPrevented || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
      const link = event.target instanceof Element ? event.target.closest('a') : null;
      if (!link || link.hasAttribute('download') || (link.target && link.target !== '_self')) return;
      const url = new URL(link.href);
      const target = getRoute(url.pathname);
      if (url.origin !== window.location.origin || url.search || url.pathname === window.location.pathname || (!target.found && !target.isResearch)) return;
      event.preventDefault();
      navigateTo(url.href);
    };
    updateLocation();
    window.addEventListener('hashchange', updateLocation);
    window.addEventListener('popstate', updateLocation);
    document.addEventListener('click', handleLink);
    return () => {
      window.removeEventListener('hashchange', updateLocation);
      window.removeEventListener('popstate', updateLocation);
      document.removeEventListener('click', handleLink);
    };
  }, []);

  useEffect(() => {
    applyPageSeo(pathname, import.meta.env.PUBLIC_ORIGIN);
  }, [pathname]);

  useEffect(() => {
    if (isAdminPage) {
      window.scrollTo(0, 0);
    } else if (isResearchPage) {
      window.scrollTo(0, 0);
      document.getElementById('research-page-heading')?.focus({ preventScroll: true });
    } else {
      if (hash) document.getElementById(hash.slice(1))?.scrollIntoView();
      else window.scrollTo(0, 0);
    }
  }, [hash, pathname, isAdminPage, isResearchPage, readingId]);

  if (route.isPayment) {
    return <div className="student-page"><header className="site-header research-header"><Logo /><a className="research-link" href="/#home">홈으로</a></header><PaymentReturn failed={route.path === '/payment/fail'} /><SiteFooter /><ScrollToTop /></div>;
  }

  return (
    <>
      <div hidden={isResearchPage || !route.found}>
        {route.found && (typeof window !== 'undefined' || !isResearchPage) && (isAdminPage
          ? <div className="admin-page" id="admin"><Sidebar /><BookingAdmin onBack={() => navigateTo('/#home')} /></div>
          : <StudentPage onSubmit={submitConsultation} hash={hash} pathname={pathname} />)}
      </div>
      {isResearchPage && (
        <div className="student-page research-page">
          <StudentHeader currentHash={hash} currentPath={pathname} />
          <ResearchPage readingId={readingId} />
          <SiteFooter />
        </div>
      )}
      {!route.found && !isResearchPage && (
        <div className="student-page">
          <StudentHeader currentHash={hash} currentPath={pathname} />
          <main className="learning-section">
            <h1>페이지를 찾을 수 없습니다.</h1>
            <p>주소를 확인하거나 상담 안내와 연구 자료 목록에서 다시 찾아 주세요.</p>
            <a className="research-link" href="/#home">홈으로 돌아가기</a>
          </main>
          <SiteFooter />
        </div>
      )}
      <ScrollToTop />
    </>
  );
}
