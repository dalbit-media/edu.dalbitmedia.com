import assert from 'node:assert/strict';
import { readFile, readdir } from 'node:fs/promises';
import test from 'node:test';
import { getResearchReadings, RESEARCH_COURSES, RESEARCH_READINGS, RESEARCH_TOPICS } from './researchLibrary.js';
import { ARTICLE_DETAILS, getArticleReadingStats } from './researchArticleDetails.js';

const courseReadings = RESEARCH_READINGS.filter((item) => item.courseCode === 'EDPSY501');
const highlightedReadings = RESEARCH_READINGS.filter((item) => item.courseCode);

test('course filtering shows only the six purple readings and preserves topic and featured filters', () => {
  assert.deepEqual(getResearchReadings(), RESEARCH_READINGS);
  assert.deepEqual(getResearchReadings({ courseCode: 'EDPSY501' }), courseReadings);
  assert.equal(getResearchReadings({ courseCode: 'EDPSY501', topic: 'cognition' }).length, 2);
  assert.equal(getResearchReadings({ courseCode: 'EDPSY501', featured: true }).length, 0);
  assert.deepEqual(getResearchReadings({ featured: true }), RESEARCH_READINGS.filter((item) => item.featured));
  for (const topic of RESEARCH_TOPICS) {
    assert.deepEqual(getResearchReadings({ topic: topic.id }), RESEARCH_READINGS.filter((item) => item.topic === topic.id));
  }
});

test('all six EDPSY501 readings belong to their relevant sidebar topics', () => {
  assert.equal(courseReadings.length, 6);
  assert.deepEqual(Object.fromEntries(courseReadings.map((item) => [item.id, item.topic])), {
    'edpsy501-thorndike': 'environments',
    'edpsy501-learning-science': 'cognition',
    'edpsy501-experts-novices': 'mastery',
    'edpsy501-power-privilege': 'identity',
    'edpsy501-skinner': 'environments',
    'edpsy501-learning-styles': 'cognition',
  });
  assert.equal(new Set(RESEARCH_READINGS.map((item) => item.id)).size, RESEARCH_READINGS.length);
  for (const item of RESEARCH_READINGS) {
    assert.ok(RESEARCH_TOPICS.some((topic) => topic.id === item.topic));
  }
});

test('EDPSY542 filters its four readings and uses the relevant existing topics', () => {
  const readings = getResearchReadings({ courseCode: 'EDPSY542' });
  assert.equal(RESEARCH_READINGS.length, 42);
  assert.equal(highlightedReadings.length, 12);
  assert.equal(readings.length, 4);
  assert.ok(readings.every((item) => item.courseCode === 'EDPSY542'));
  assert.deepEqual(Object.fromEntries(readings.map((item) => [item.id, item.topic])), {
    'edpsy542-bruner-structure': 'cognition',
    'edpsy542-bruner-readiness': 'development',
    'edpsy542-bruner-preface': 'environments',
    'edpsy542-vygotsky-learning-development': 'development',
  });
  assert.equal(getResearchReadings({ courseCode: 'EDPSY542', topic: 'development' }).length, 2);
  assert.deepEqual(getResearchReadings({ courseCode: 'EDPSY542', featured: true }), []);
  assert.deepEqual(RESEARCH_COURSES.map((course) => course.code), ['EDPSY501', 'EDPSY542', 'EDPSY583']);
  for (const course of RESEARCH_COURSES) {
    assert.ok(getResearchReadings({ courseCode: course.code }).some((item) => item.id === course.startWith));
  }
  assert.ok(highlightedReadings.every((item) => RESEARCH_COURSES.some((course) => course.code === item.courseCode)));
});

test('EDPSY583 shows only its two readings under culture and equity', () => {
  const readings = getResearchReadings({ courseCode: 'EDPSY583' });
  assert.equal(readings.length, 2);
  assert.deepEqual(Object.fromEntries(readings.map((item) => [item.id, item.topic])), {
    'edpsy583-rose-hand-brain': 'identity',
    'edpsy583-life-diversity': 'identity',
  });
  assert.deepEqual(getResearchReadings({ courseCode: 'EDPSY583', topic: 'identity' }), readings);
  assert.deepEqual(getResearchReadings({ courseCode: 'EDPSY583', topic: 'cognition' }), []);
  assert.deepEqual(getResearchReadings({ courseCode: 'EDPSY583', featured: true }), []);
  assert.deepEqual(readings.map((item) => item.pdfPages), [8, 40]);
  assert.equal(new Set(readings.map((item) => item.pdfFile)).size, 2);
});

test('only highlighted readings have details and original PDF downloads', async () => {
  const files = await readdir(new URL('../public/readings/', import.meta.url));
  assert.ok(files.every((file) => !file.endsWith('.txt')));
  assert.equal(new Set(highlightedReadings.map((item) => item.pdfFile)).size, 12);
  for (const item of highlightedReadings) {
    assert.equal(item.keyPoints.length, 3);
    assert.equal(item.discussionQuestions.length, 2);
    assert.ok(item.application.length > 100);
    assert.match(item.pdfFile, /^edpsy(?:501|542|583)-[a-z-]+\.pdf$/);
    assert.ok(item.pdfPages > 0);
    const pdf = await readFile(new URL(`../public/readings/${item.pdfFile}`, import.meta.url));
    assert.equal(pdf.subarray(0, 5).toString(), '%PDF-');
    assert.ok(pdf.length > 1000);
    assert.equal(new URL(item.url).protocol, 'https:');
  }
  assert.ok(RESEARCH_READINGS.filter((item) => !item.courseCode).every((item) => !item.pdfFile));
});

test('existing topic starters and featured home readings remain intact', () => {
  for (const topic of RESEARCH_TOPICS) {
    assert.ok(RESEARCH_READINGS.some((item) => item.id === topic.startWith && item.topic === topic.id));
  }
  assert.ok(highlightedReadings.every((item) => !item.featured));
  assert.ok(RESEARCH_READINGS.some((item) => item.id === 'how-people-learn-ii'));
});

test('all twelve detailed readings have a genuine approximately ten-minute body', () => {
  assert.deepEqual(Object.keys(ARTICLE_DETAILS).sort(), highlightedReadings.map((item) => item.id).sort());
  for (const item of highlightedReadings) {
    const details = ARTICLE_DETAILS[item.id];
    const stats = getArticleReadingStats(item);
    assert.ok(stats.characters >= 4050 && stats.characters <= 4950, `${item.id}: ${stats.characters} characters`);
    assert.ok(stats.minutes >= 9 && stats.minutes <= 11, `${item.id}: ${stats.minutes} minutes`);
    assert.equal(stats.minutes, Math.round(stats.characters / 450));
    assert.equal(details.sections.length, 8);
    assert.equal(new Set(details.sections.map((section) => section.heading)).size, 8);
    const paragraphs = details.sections.flatMap((section) => section.paragraphs);
    assert.equal(paragraphs.length, 16);
    assert.equal(new Set(paragraphs).size, 16);
    assert.match(details.sourceScope, /PDF/);
    for (const section of details.sections) {
      assert.ok(section.sourcePages.length > 0);
      assert.equal(new Set(section.sourcePages).size, section.sourcePages.length);
      assert.ok(section.sourcePages.every((page) => Number.isInteger(page) && page >= 1 && page <= item.pdfPages));
      assert.ok(section.paragraphs.every((paragraph) => paragraph.length >= 150));
    }
  }
});

test('references preserve the supplied excerpt and scan boundaries', () => {
  for (const section of ARTICLE_DETAILS['edpsy501-power-privilege'].sections) {
    assert.ok(section.sourcePages.every((page) => page >= 20 && page <= 24));
  }
  for (const section of ARTICLE_DETAILS['edpsy501-learning-styles'].sections) {
    assert.ok(section.sourcePages.every((page) => page >= 2 && page <= 8));
  }
  for (const section of ARTICLE_DETAILS['edpsy501-skinner'].sections) {
    assert.ok(section.sourcePages.every((page) => page !== 1));
  }
  for (const id of ['edpsy542-bruner-structure', 'edpsy542-bruner-readiness', 'edpsy542-bruner-preface']) {
    assert.ok(ARTICLE_DETAILS[id].sections.every((section) => section.sourcePages.every((page) => page >= 2)));
  }
  assert.ok(ARTICLE_DETAILS['edpsy542-vygotsky-learning-development'].sections.some((section) => section.sourcePages.includes(1)));
  for (const section of ARTICLE_DETAILS['edpsy583-life-diversity'].sections) {
    assert.ok(section.sourcePages.every((page) => page >= 7 && page <= 33));
  }
  assert.deepEqual(ARTICLE_DETAILS['edpsy583-life-diversity'].sections.at(-1).sourcePages, [30, 31, 32, 33]);
  assert.ok(ARTICLE_DETAILS['edpsy583-rose-hand-brain'].sections.some((section) => section.sourcePages.includes(1)));
  assert.ok(ARTICLE_DETAILS['edpsy583-rose-hand-brain'].sections.some((section) => section.sourcePages.includes(8)));
});
