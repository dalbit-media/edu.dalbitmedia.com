import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
import { PAID_SERVICE } from './booking.js';
import { HOME_DESCRIPTION, HOME_TITLE } from './seo.js';

test('scroll-to-top is shared across routes and respects reduced motion with an accessible button', async () => {
  const [app, css] = await Promise.all([
    readFile(new URL('./App.jsx', import.meta.url), 'utf8'),
    readFile(new URL('./styles.css', import.meta.url), 'utf8'),
  ]);
  assert.match(app, /window\.scrollY > 300/);
  assert.match(app, /addEventListener\('scroll', updateVisibility, \{ passive: true \}\)/);
  assert.match(app, /removeEventListener\('scroll', updateVisibility\)/);
  assert.match(app, /aria-label="맨 위로 이동"/);
  assert.match(app, /window\.matchMedia\('\(prefers-reduced-motion: reduce\)'\)\.matches \? 'auto' : 'smooth'/);
  assert.equal((app.match(/<ScrollToTop \/>/g) ?? []).length, 2);
  assert.match(css, /\.scroll-to-top:focus-visible/);
  assert.match(css, /@media \(prefers-reduced-motion: reduce\)[\s\S]*html \{ scroll-behavior: auto; \}/);
});

test('student navigation shares accessible links while administrator access lives in the footer', async () => {
  const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  const header = app.match(/function StudentHeader\([\s\S]*?\nfunction Field\(/)?.[0];
  const footer = app.match(/function SiteFooter\([\s\S]*?\nfunction StudentHeader\(/)?.[0];
  assert.ok(header, 'Missing student header');
  assert.ok(footer, 'Missing shared footer');
  assert.doesNotMatch(header, /관리자|nav-admin|SegmentedRole|setRole/);
  assert.doesNotMatch(app, /function SegmentedRole|const \[role, setRole\]/);
  for (const href of ['/#about', '/#ongoing-support', '/#process', '/research']) {
    assert.ok(header.includes(`href: '${href}'`), `Missing navigation target: ${href}`);
  }
  assert.match(header, /href="\/#consultation"/);
  assert.match(header, /aria-current=/);
  assert.match(header, /aria-controls=\{navigationId\}/);
  assert.match(header, /event\.key === 'Escape'/);
  assert.match(footer, /className="footer-admin-link" href="\/admin" rel="nofollow">관리자<\/a>/);
  assert.match(app, /const route = getRoute\(pathname\)/);
  assert.equal((app.match(/<StudentHeader currentHash=\{hash\} currentPath=\{pathname\} \/>/g) ?? []).length, 3);
  assert.match(app, /<BookingAdmin onBack=/);
});

test('process navigation targets a detailed section after the service descriptions', async () => {
  const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  const section = app.match(/<section[^>]*id="process"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, 'Missing dedicated process section');
  assert.ok(app.indexOf(section) > app.indexOf('id="ongoing-support"'), 'Process must follow service descriptions');
  assert.equal((app.match(/id="process"/g) ?? []).length, 1);
  assert.doesNotMatch(app, /process-strip/);
  for (const step of ['학생·연락 정보 입력', '상담 방식과 일정 확인', '검사·대화·토론으로 탐색', '다음 활동과 후속 지원 계획']) {
    assert.ok(section.includes(`<h3>${step}</h3>`), `Missing process step: ${step}`);
  }
  assert.match(section, /무료 기본 상담은 최대 15분/);
  assert.match(section, /PAID_SERVICE\.amount\.toLocaleString/);
  assert.match(section, /결제가 확인되면 예약이 확정/);
  assert.match(section, /일정과 비용을 별도로 안내/);
  assert.match(section, /href="#consultation"/);
});

test('homepage metadata and runtime title use consistent academic framing', async () => {
  const [html, app] = await Promise.all([
    readFile(new URL('../index.html', import.meta.url), 'utf8'),
    readFile(new URL('./App.jsx', import.meta.url), 'utf8'),
  ]);
  const title = html.match(/<title>([^<]+)<\/title>/)?.[1];
  assert.equal(title, HOME_TITLE);
  assert.equal(html.match(/name="description" content="([^"]+)"/)?.[1], HOME_DESCRIPTION);
  assert.match(app, /applyPageSeo\(pathname/);
  assert.match(app, /상담은 진단이나 성적·진학·진로 결과의 보장을 목적으로 하지 않습니다/);
});

test('homepage introduction keeps institutional names only in a lower excerpt without an excerpt disclaimer', async () => {
  const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  const hero = app.match(/<section className="hero-copy">[\s\S]*?<\/section>/)?.[0];
  assert.ok(hero, 'Missing homepage introduction');
  assert.match(hero, /나에게 맞는 공부와 진로/);
  const main = hero.match(/<div className="hero-backgrounds"[\s\S]*?<\/div>/)?.[0];
  const excerpt = hero.match(/<aside className="hero-backgrounds-excerpt"[\s\S]*?<\/aside>/)?.[0];
  assert.ok(main, 'Missing main introduction');
  assert.ok(excerpt, 'Missing staff-background excerpt');
  assert.match(main, /글로벌 기술 현장의 실무 경험과 학습과학 연구/);
  assert.match(main, /학생의 학교와 관심 분야에 맞는 계획/);
  assert.match(main, /현재의 학습 습관과 강점/);
  assert.match(main, /학업 부담과 진학 목표/);
  assert.match(main, /심화학습·탐구 활동·학교 선택에서 필요한 다음 단계/);
  assert.equal((main.match(/<p className="hero-subtitle">/g) ?? []).length, 2);
  assert.doesNotMatch(main, /마이크로소프트|워싱턴대학교|구글|애플|일리노이대학교|매사추세츠공과대학교|MIT|스탠퍼드대학교|하버드대학교|컬럼비아대학교|코넬대학교|로드아일랜드 디자인스쿨/);
  assert.ok(hero.indexOf(excerpt) > hero.indexOf(main), 'Excerpt must follow main paragraphs');
  assert.doesNotMatch(hero, /<(?:dl|dt|dd)\b/);
  for (const name of ['마이크로소프트', '구글', '애플', '워싱턴대학교', '학습과학', '일리노이대학교', '컴퓨터과학', '매사추세츠공과대학교(MIT)', '스탠퍼드대학교', '하버드대학교', '컬럼비아대학교', '코넬대학교', '로드아일랜드 디자인스쿨']) {
    assert.ok(excerpt.includes(name), `Missing staff background in excerpt: ${name}`);
  }
  assert.doesNotMatch(main + excerpt, /Microsoft|Engineering|Google|Apple|University|Learning Science|Computer Science|Harvard|Columbia|Cornell|RISD/);
  assert.match(hero, /aria-label="상담팀 구성원의 근무·교육 배경"/);
  assert.match(hero, /특목고·자사고·영재학교 출신/);
  assert.doesNotMatch(hero, /hero-backgrounds-note|구성원마다 경험이 다르며|공식 제휴·후원·인증을 의미하지 않습니다/);
  assert.doesNotMatch(hero, /분야의 예시|근무 경력이나 기관과의 공식 제휴를 뜻하지 않습니다/);
  assert.match(app, /공식 제휴·후원·인증을 의미하지 않습니다/);
});

test('shared site copy does not reintroduce promotional slogans or unsupported metrics', async () => {
  const sources = await Promise.all([
    '../index.html', './App.jsx', './ResearchPage.jsx',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const source of sources) {
    assert.doesNotMatch(source, /나만의 미래|무료 상담 시작하기|무료 진로·학습 상담 신청하기|열정을 키우는 배움|열정이 자라는 배움|완료율 78%|이번 달 \+12명|24시간 이내/);
  }
  assert.match(sources[1], /무료 기본 상담: 최대 15분 · 일정 확인 후 연락/);
  assert.match(sources[1], /전문가 심층 상담/);
  assert.match(sources[2], /이론적 관점, 실증적 결과와 교육적 적용의 구분/);
});

test('consultation offers label free basic consulting up to 15 minutes without a zero-won price', async () => {
  const sources = await Promise.all([
    './App.jsx', './ConsultationBooking.jsx', './BookingAdmin.jsx', './ResearchPage.jsx', './booking.js',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const source of sources) {
    assert.doesNotMatch(source, /30분|45–60분|무료 초기 상담|무료 서비스 상담|유료 심화 상담|>0원</);
    assert.match(source, /전문가 심층 상담/);
  }
  for (const source of sources.slice(0, 4)) {
    assert.match(source, /무료 기본 상담/);
    assert.match(source, /최대 15분/);
  }
  assert.match(sources[4], /description: '최대 60분'/);
});

test('consultation overview explains assessment, interests, debates and future jobs without school-focused copy', async () => {
  const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  const section = app.match(/<section[^>]*id="about"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, 'Missing consultation overview');
  assert.match(section, /학습과학 기반 진로·학업 탐색/);
  for (const service of ['진로·학업 적성 검사', '흥미·열정 탐색', '토론으로 넓히는 생각과 관심', '미래 직업과 일의 변화 탐색']) {
    assert.ok(section.includes(`<h3>${service}</h3>`), `Missing service explanation: ${service}`);
  }
  assert.match(section, /검사·대화·토론/);
  assert.match(section, /고정된 능력이나 진로의 정답을 뜻하지 않습니다/);
  assert.match(section, /서로의 주장과 근거를 비교하고 질문/);
  assert.match(section, /AI·데이터 분석, 기후·에너지 기술, 바이오·헬스, 디지털 창작/);
  assert.match(section, /유망 직업 순위보다 실제로 해결하는 문제/);
  assert.doesNotMatch(section, /학교|특목|자사고|민사고|외고|유학|진학/);
  assert.ok(app.includes("'진로·학업 적성 검사'"));
  assert.ok(app.includes("'토론·관심 확장'"));
  assert.ok(app.includes("'미래 직업 탐색'"));
  assert.match(app, /'흥미·강점 발견': '흥미·열정 탐색'/);
});

test('homepage explains continuing support and connects each service to intake', async () => {
  const app = await readFile(new URL('./App.jsx', import.meta.url), 'utf8');
  const section = app.match(/<section[^>]*id="ongoing-support"[\s\S]*?<\/section>/)?.[0];
  assert.ok(section, 'Missing ongoing support section');
  for (const service of ['정기 코칭', '멘토십', '스터디 그룹 매칭']) {
    assert.ok(app.includes(`'${service}'`), `Missing intake topic: ${service}`);
    assert.ok(section.includes(`<h3>${service}</h3>`), `Missing service card: ${service}`);
    assert.ok(section.includes(`href="#consultation">${service} 문의</a>`), `Missing intake link: ${service}`);
  }
  assert.match(section, /일정 및 비용을 별도로 안내/);
  assert.match(section, /매칭이 확정되지 않으며/);
  assert.match(section, /1회 전문가 심층 상담 결제에 포함되지 않습니다/);
});

test('expert consultation uses a tax-inclusive 150000 won price in shared configuration and public displays', async () => {
  assert.equal(PAID_SERVICE.amount, 150000);
  assert.equal(PAID_SERVICE.priceNote, '부가세 포함');
  const sources = await Promise.all(['./App.jsx', './ConsultationBooking.jsx']
    .map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const source of sources) assert.match(source, /PAID_SERVICE\.priceNote/);
});

test('education scope includes domestic selective pathways and international students consistently', async () => {
  const [html, app, research, intake] = await Promise.all([
    '../index.html', './App.jsx', './ResearchPage.jsx', './consultationIntake.js',
  ].map((path) => readFile(new URL(path, import.meta.url), 'utf8')));
  for (const source of [html, app]) {
    assert.match(source, /초5–고3/);
    assert.match(source, /Grade 5–12/);
  }
  for (const pathway of ['국제중', '외고', '국제고', '민사고', '과학고', '영재학교', '예술중', '예술고', '국제학교', '유학']) {
    assert.ok((app + intake).includes(pathway), `Missing education context: ${pathway}`);
  }
  assert.match(app, /학교 유형은 상담 맥락을 이해하기 위한 정보이며 선발 기준이 아닙니다/);
  assert.match(app, /<span>예중·예고<\/span>/);
  assert.match(app, /입력 정보는 서버에 접수되며 로그인한 상담 운영자가 확인합니다/);
  assert.match(research, /예술중·예술고/);
  assert.match(research, /상담 효과나 입학 결과를 입증하는 자료가 아닙니다/);
  for (const source of [html, app, research]) assert.doesNotMatch(source, /Grade 5–11/);
});
