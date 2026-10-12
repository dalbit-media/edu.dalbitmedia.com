import { useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, ArrowRight, BookOpen, Download } from 'lucide-react';
import { getResearchReadings, RESEARCH_COURSES, RESEARCH_READINGS, RESEARCH_TOPICS, UW_PROGRAM_URL } from './researchLibrary';
import { ARTICLE_DETAILS, getArticleReadingStats } from './researchArticleDetails';
import { navigateTo } from './navigation';

const TOPICS = [
  {
    id: 'all',
    label: '전체 문헌',
    question: '학습과 발달에 관한 주제별 문헌',
    description: '흥미, 발달, 문화와 학습 환경 등 8개 영역의 이론·실증 연구·종합 보고서를 정리했습니다. 자료의 성격과 연구 맥락을 구분하여 검토할 수 있도록 구성했습니다.',
    startWith: 'how-people-learn-ii',
  },
  ...RESEARCH_TOPICS,
];

export function ResearchCards({ featured = false, topic = 'all', courseCode = null }) {
  const readings = getResearchReadings({ featured, topic, courseCode });

  return (
    <div className={`learning-grid${featured ? ' research-preview' : ''}`}>
      {readings.map((item) => {
        const domain = RESEARCH_TOPICS.find((category) => category.id === item.topic);
        return (
          <article className={`learning-card research-card${item.courseCode ? ' research-course-card' : ''}`} key={item.id} data-reading-id={item.id}>
            <div className="research-card-labels">
              <span className="research-topic">{domain.label}</span>
              {item.courseCode && <span className="research-course-badge">{item.courseCode}</span>}
            </div>
            {featured ? (
              <>
                <span className="research-reading-meta">{item.kind}</span>
                <h3>{item.title}</h3>
              </>
            ) : (
              <>
                <div className="research-reading-meta">
                  <span>{item.kind}</span>
                  {domain.startWith === item.id && <span className="research-starter">주제 입문 자료</span>}
                </div>
                <h3 className="research-publication">{item.publication}</h3>
                <p className="research-reading-question">{item.title}</p>
              </>
            )}
            <p className={item.courseCode ? 'research-card-summary' : undefined}>{item.summary}</p>
            {!item.courseCode && <small>{item.limitation}</small>}
            {item.pdfFile ? (
              <a
                className="research-detail-link"
                href={`/research/${item.id}`}
                aria-label={`${item.publication} 상세 내용 및 원문 PDF`}
              >
                <span>{item.citation}</span>
                <span>상세 내용·원문 PDF 보기 →</span>
              </a>
            ) : (
              <a className="research-source-link" href={item.url} target="_blank" rel="noopener noreferrer">
                <span>{item.citation}</span>
                <span>원문·출판 정보 ↗</span>
              </a>
            )}
          </article>
        );
      })}
    </div>
  );
}

export function ResearchNote() {
  return (
    <p className="research-note">이 목록은 이론과 연구를 검토하기 위한 참고자료입니다. 자료별 연구 대상, 맥락과 적용 범위를 고려해야 하며, 소개된 연구는 달빛에듀 상담의 효과나 개인의 성적·진로 결과를 입증하지 않습니다. 일부 원문은 도서 구매나 기관 로그인이 필요하고, 출판 링크의 재판 연도는 원저 연도와 다를 수 있습니다. 과목별 한국어 요약·해설은 제공 자료를 바탕으로 작성했으며 원문을 대체하지 않습니다. 보라색 카드에서 상세 해설과 원문 PDF에 접근할 수 있습니다. 원문 이용에는 저작권과 해당 이용 조건이 적용됩니다.</p>
  );
}

function ReadingDetail({ readingId }) {
  const item = RESEARCH_READINGS.find((reading) => reading.id === readingId && reading.pdfFile);
  const topic = item && RESEARCH_TOPICS.find((category) => category.id === item.topic);
  const details = item && ARTICLE_DETAILS[item.id];
  const readingStats = item && getArticleReadingStats(item);

  return (
    <div className="research-reading-detail">
      <a className="research-back-link" href="/research"><ArrowLeft size={16} aria-hidden="true" /> 읽기 목록으로 돌아가기</a>
      {item ? (
        <article className="research-detail-article" data-reading-id={item.id}>
          <header>
            <div className="research-card-labels">
              <span className="research-course-badge">{item.courseCode}</span>
              <span className="research-topic">{topic.label}</span>
            </div>
            <p className="research-reading-meta">{item.kind}</p>
            <h1 id="research-page-heading" tabIndex={-1}>{item.publication}</h1>
            <p className="research-detail-citation">{item.citation}</p>
            <p className="research-reading-time" title="공백 포함 본문 분량을 분당 450자 기준으로 계산한 대략적인 시간이며, 실제 읽기 속도에 따라 달라집니다.">
              약 {readingStats.minutes}분 읽기 · 본문 {readingStats.characters.toLocaleString('ko-KR')}자
            </p>
            <div className="research-detail-actions">
              <a className="research-download" href={`${import.meta.env.BASE_URL}readings/${item.pdfFile}`} download={item.pdfFile}>
                <Download size={18} aria-hidden="true" /> 원문 PDF 다운로드 <span>{item.pdfPages}쪽</span>
              </a>
              <a href={item.url} target="_blank" rel="noopener noreferrer">원문·출판 정보 ↗</a>
            </div>
            <p className="research-note">제공된 원본 파일을 그대로 다운로드합니다. 스캔·재수록본이나 앞부분 자료가 포함될 수 있으며, 파일 쪽수는 원저의 인쇄 쪽수와 다를 수 있습니다.</p>
          </header>
          <section aria-labelledby="reading-summary-heading">
            <h2 id="reading-summary-heading">{item.title}</h2>
            <p>{item.summary}</p>
            <p className="research-note">{details.sourceScope}</p>
            <p className="research-note">아래 상세 읽기는 원문을 바탕으로 재서술한 요약·해설입니다. 문장별 번역이나 원문 전체를 대체하는 자료가 아닙니다. 각 절의 PDF 쪽수 링크에서 근거를 확인할 수 있습니다. 읽기 시간은 공백 포함 분당 450자 기준의 추정치입니다.</p>
          </section>
          <section aria-labelledby="reading-key-points-heading">
            <h2 id="reading-key-points-heading">핵심 내용</h2>
            <ol>{item.keyPoints.map((point) => <li key={point}>{point}</li>)}</ol>
          </section>
          {details.sections.map((section, index) => (
            <section className="research-analysis-section" key={section.heading} aria-labelledby={`reading-analysis-heading-${index}`}>
              <h2 id={`reading-analysis-heading-${index}`}>{section.heading}</h2>
              {section.paragraphs.map((paragraph) => <p key={paragraph}>{paragraph}</p>)}
              <p className="research-section-sources">
                근거 확인:
                {section.sourcePages.map((pageNumber) => (
                  <a
                    key={pageNumber}
                    href={`${import.meta.env.BASE_URL}readings/${item.pdfFile}#page=${pageNumber}`}
                    target="_blank"
                    rel="noopener noreferrer"
                    aria-label={`${section.heading} 근거 원문 PDF ${pageNumber}쪽`}
                  >PDF {pageNumber}쪽 ↗</a>
                ))}
              </p>
            </section>
          ))}
          <section aria-labelledby="reading-application-heading">
            <h2 id="reading-application-heading">교육·학습에 연결하기 · 달빛에듀 해설</h2>
            <p className="research-note">다음 적용과 토론 질문은 원문을 오늘의 학습 상황에 연결하기 위한 제안입니다. 원문에서 직접 검증된 수업이나 추가 연구 결과를 뜻하지 않습니다.</p>
            <p>{item.application}</p>
          </section>
          <section aria-labelledby="reading-questions-heading">
            <h2 id="reading-questions-heading">검토 및 토론 질문</h2>
            <ul>{item.discussionQuestions.map((question) => <li key={question}>{question}</li>)}</ul>
          </section>
          <section className="research-detail-caution" aria-labelledby="reading-caution-heading">
            <h2 id="reading-caution-heading">자료의 범위와 해석상 유의점</h2>
            <p>{item.limitation}</p>
          </section>
          <ResearchNote />
        </article>
      ) : (
        <section role="alert">
          <h1 id="research-page-heading" tabIndex={-1}>자료를 찾을 수 없습니다.</h1>
          <p>상세 페이지는 보라색으로 표시된 과목 읽기 자료에 한해 제공됩니다. 문헌 목록에서 해당 자료를 선택할 수 있습니다.</p>
        </section>
      )}
    </div>
  );
}

export default function ResearchPage({ readingId = null }) {
  const [selection, setSelection] = useState({ topic: 'all', courseCode: null, isInitialView: true });
  const { topic, courseCode, isInitialView } = selection;
  const resultsRef = useRef(null);
  const selectedTopic = courseCode ? RESEARCH_COURSES.find((item) => item.code === courseCode) : TOPICS.find((item) => item.id === topic);
  const count = getResearchReadings({ topic, courseCode }).length;
  const startingReading = RESEARCH_READINGS.find((item) => item.id === selectedTopic.startWith);
  const LibraryHeading = isInitialView ? 'h2' : 'h1';

  useLayoutEffect(() => {
    if (!readingId && !selection.isInitialView) {
      resultsRef.current?.scrollIntoView({ behavior: 'instant', block: 'start' });
    }
  }, [selection, readingId]);

  return (
    <main className="research-main">
      <aside className="research-sidebar" aria-labelledby="research-topics-heading">
        <span className="eyebrow">학습과학·인간 발달</span>
        <h2 id="research-topics-heading">문헌 분류: 8개 주제</h2>
        <p>학습의 인지적·사회문화적 과정과 교육 환경에 관한 문헌을 분류했습니다.</p>
        <div className="research-filters" role="group" aria-label="연구 주제 선택">
          {TOPICS.map((item) => (
            <button type="button" key={item.id} aria-label={item.label} aria-pressed={!courseCode && topic === item.id} aria-controls="research-results" onClick={() => {
              setSelection({ topic: item.id, courseCode: null, isInitialView: false });
              if (readingId !== null) navigateTo('/research');
            }}>
              <span>{item.label.replaceAll('·', ' · ')}</span>
              <span className="research-topic-count" aria-hidden="true">{getResearchReadings({ topic: item.id }).length}</span>
            </button>
          ))}
        </div>
        <details className="research-course-menu" open>
          <summary>UW Learning Science</summary>
          <div className="research-course-filters" role="group" aria-label="UW Learning Science 과목 선택">
            {RESEARCH_COURSES.map((course) => (
              <button type="button" key={course.code} aria-label={course.code} aria-pressed={courseCode === course.code} aria-controls="research-results" onClick={() => {
                setSelection({ topic: 'all', courseCode: course.code, isInitialView: false });
                if (readingId !== null) navigateTo('/research');
              }}>
                <span>{course.code}</span>
                <span className="research-topic-count" aria-hidden="true">{getResearchReadings({ courseCode: course.code }).length}</span>
              </button>
            ))}
          </div>
          <p>제공 자료의 과목별 분류<br />요약·해설 및 원문 PDF</p>
        </details>
      </aside>
      <div className="research-content" id="research-results">
        {readingId !== null ? <ReadingDetail readingId={readingId} /> : (
          <>
        {isInitialView && (
          <section className="learning-section research-intro" aria-labelledby="research-page-heading">
            <span className="eyebrow">Dalbit Edu · Learning &amp; Human Development</span>
            <h1 id="research-page-heading" tabIndex={-1}>학습과학·인간 발달 연구 자료</h1>
            <p className="research-mission">이론적 관점, 실증적 결과와 교육적 적용의 구분</p>
            <p>학습자의 흥미, 인지, 문화와 참여를 학습과학 및 인간 발달 연구의 관점에서 검토합니다. 각 자료의 핵심 논의와 연구 맥락을 소개하고, 교육·학습에 적용할 때의 범위와 한계를 함께 제시합니다.</p>
            <p>학생, 보호자와 교육 관계자가 참고할 수 있도록 문헌 {RESEARCH_READINGS.length}편을 8개 주제로 정리했습니다. 과목별 제공 자료에는 원문에 근거한 요약·해설과 PDF 쪽수별 참조를 포함합니다.</p>
          </section>
        )}
        <section ref={resultsRef} className="learning-section" aria-labelledby="research-library-heading">
          <div>
            <div className="section-heading research-domain-heading">
              <span className="eyebrow">{selectedTopic.label}</span>
              <LibraryHeading id="research-library-heading">{selectedTopic.question}</LibraryHeading>
              <p>{selectedTopic.description}</p>
              <div className="research-starting-point">
                <BookOpen size={18} aria-hidden="true" />
                <div>
                  <span>주제 입문 자료</span>
                  <a
                    href={startingReading.pdfFile ? `/research/${startingReading.id}` : startingReading.url}
                    target={startingReading.pdfFile ? undefined : '_blank'}
                    rel={startingReading.pdfFile ? undefined : 'noopener noreferrer'}
                  >{startingReading.publication} {startingReading.pdfFile ? '→' : '↗'}</a>
                </div>
              </div>
            </div>
            <p className="research-count" role="status">{selectedTopic.label} · 문헌 {count}편</p>
            <ResearchCards topic={topic} courseCode={courseCode} />
          </div>
          <ResearchNote />
          <p className="research-note research-reference">
            분류 참고: <a href={UW_PROGRAM_URL} target="_blank" rel="noopener noreferrer">워싱턴대학교 학습과학·인간발달 프로그램 ↗</a>. 주제 분류와 문헌 선정은 달빛에듀가 구성한 것이며, 해당 대학의 공식 필독 목록이나 제휴·인증을 의미하지 않습니다.
          </p>
        </section>
          </>
        )}
        <section className="consultation-cta" aria-labelledby="research-signup-heading">
          <div>
            <span className="eyebrow">상담 안내</span>
            <h2 id="research-signup-heading">개별 학습 상황과 교육·진로 과제의 논의</h2>
            <p>국제학교·유학 준비 및 국제중·특목·자사고, 예술중·예술고의 학습 맥락을 고려하여 학생의 경험과 후속 탐색 과제를 검토합니다. 무료 기본 상담은 신청 후 담당자 일정에 맞춰 최대 15분으로 안내하며, 전문가 심층 상담은 최대 60분입니다. 소개된 문헌은 상담 효과나 입학 결과를 입증하는 자료가 아닙니다.</p>
          </div>
          <a className="primary-button" href="/#consultation">상담 신청 <ArrowRight size={18} /></a>
        </section>
      </div>
    </main>
  );
}
