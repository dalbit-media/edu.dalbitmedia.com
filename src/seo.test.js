import assert from 'node:assert/strict';
import test from 'node:test';
import { getLegacyPath, getRoute } from './navigation.js';
import { RESEARCH_READINGS } from './researchLibrary.js';
import { createPublicDocument, getPageSeo, getPublicPaths, renderRobots, renderSeoHead, renderSitemap, validateSiteOrigin } from './seo.js';

const origin = 'https://dalbit.example';

test('all public pages have unique titles, descriptions, absolute canonicals and structured data', () => {
  const paths = getPublicPaths();
  assert.equal(paths.length, 14);
  const titles = new Set();
  const descriptions = new Set();
  for (const path of paths) {
    const seo = getPageSeo(path, origin);
    assert.equal(seo.status, 200);
    assert.ok(seo.description.length > 40);
    assert.equal(seo.canonical, origin + path);
    assert.match(seo.robots, /^index, follow/);
    assert.ok(seo.structuredData);
    assert.ok(seo.image.endsWith('/social-preview.png'));
    titles.add(seo.title);
    descriptions.add(seo.description);
  }
  assert.equal(titles.size, paths.length);
  assert.equal(descriptions.size, paths.length);
  const service = getPageSeo('/', origin).structuredData['@graph'].find((item) => item['@type'] === 'Service');
  assert.equal(service.offers.price, 150000);
  assert.match(service.offers.description, /부가세 포함/);
});

test('article SEO retains source attribution rather than assigning the original publication to the site', () => {
  for (const reading of RESEARCH_READINGS.filter((item) => item.pdfFile)) {
    const seo = getPageSeo(`/research/${reading.id}`, origin);
    const article = seo.structuredData['@graph'].find((item) => item['@type'] === 'Article');
    assert.equal(article.isBasedOn.name, reading.publication);
    assert.equal(article.isBasedOn.url, reading.url);
    assert.equal(article.isBasedOn.citation, reading.citation);
    assert.ok(seo.title.includes(reading.courseCode));
    assert.equal(seo.type, 'article');
  }
});

test('admin, transactional callbacks and missing pages are noindex and never advertise structured content', () => {
  for (const path of ['/admin', '/payment/success', '/payment/fail', '/missing', '/research/missing']) {
    const seo = getPageSeo(path, origin);
    assert.equal(seo.robots, 'noindex, nofollow');
    assert.equal(seo.structuredData, null);
    assert.equal(seo.status, path.includes('missing') ? 404 : 200);
  }
  assert.equal(getRoute('/research/').path, '/research');
  assert.equal(getLegacyPath('#/research'), '/research');
  assert.equal(getLegacyPath('#/research/reading'), '/research/reading');
  assert.equal(getLegacyPath('#admin'), '/admin');
  assert.equal(getLegacyPath('#consultation'), null);
});

test('sitemap lists only owned indexable pages and robots lets crawlers read admin noindex directives', () => {
  const sitemap = renderSitemap(origin);
  assert.equal((sitemap.match(/<loc>/g) ?? []).length, 14);
  for (const path of getPublicPaths()) assert.ok(sitemap.includes(`<loc>${origin}${path}</loc>`));
  assert.doesNotMatch(sitemap, /\/admin|\/payment|\/404|#\/research/);
  const robots = renderRobots(origin);
  assert.match(robots, /Disallow: \/api\//);
  assert.match(robots, /Sitemap: https:\/\/dalbit.example\/sitemap.xml/);
  assert.doesNotMatch(robots, /Disallow: \/admin/);
});

test('HTML metadata is escaped, replaced without duplication and does not expose transactional query parameters', () => {
  const seo = getPageSeo('/', origin);
  const template = '<html><head><title>Old</title><meta name="description" content="Old"></head><body><div id="root"><!--app-html--></div></body></html>';
  const html = createPublicDocument(template, seo, '<h1>Public content</h1>');
  const replaced = createPublicDocument(html, getPageSeo('/admin', origin));
  assert.equal((replaced.match(/rel="canonical"/g) ?? []).length, 1);
  assert.equal((replaced.match(/name="description"/g) ?? []).length, 1);
  assert.doesNotMatch(replaced, /application\/ld\+json/);
  assert.match(replaced, /noindex, nofollow/);
  assert.match(html, /<h1>Public content<\/h1>/);
  const unsafe = renderSeoHead({ ...seo, description: '<script>"&', structuredData: { text: '</script>' } });
  assert.match(unsafe, /&lt;script&gt;&quot;&amp;/);
  assert.match(unsafe, /\\u003c\/script>/);
  assert.doesNotMatch(renderSeoHead(getPageSeo('/payment/success', origin)), /paymentKey|orderId/);
  for (const invalid of ['http://public.example', 'https://dalbit.example/', 'https://user:password@dalbit.example', 'https://dalbit.example/?secret=1']) {
    assert.throws(() => validateSiteOrigin(invalid));
  }
});
