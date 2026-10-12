import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { createBookingServer } from './app.js';
import { getPublicPaths } from '../src/seo.js';
import { RESEARCH_READINGS } from '../src/researchLibrary.js';

const origin = 'https://dalbit.example';
const staticRoot = fileURLToPath(new URL('../dist', import.meta.url));

test('built public pages include visible content and article links before JavaScript runs', async () => {
  for (const path of getPublicPaths()) {
    const file = path === '/' ? '../dist/index.html' : `../dist${path}/index.html`;
    const html = await readFile(new URL(file, import.meta.url), 'utf8');
    assert.match(html, /name="robots" content="index, follow/);
    assert.match(html, /property="og:title"/);
    assert.match(html, /name="twitter:card" content="summary_large_image"/);
    assert.match(html, /application\/ld\+json/);
    assert.equal((html.match(/<h1\b/g) ?? []).length, 1);
    assert.doesNotMatch(html, /<!--app-html-->|href="#\/research/);
    if (path.startsWith('/research/')) {
      const reading = RESEARCH_READINGS.find((item) => path.endsWith(`/${item.id}`));
      assert.ok(html.includes(`data-reading-id="${reading.id}"`));
      assert.ok(html.includes(`/readings/${reading.pdfFile}`));
      assert.match(html, /핵심 내용/);
    }
  }
  const image = await readFile(new URL('../dist/social-preview.png', import.meta.url));
  assert.equal(image.readUInt32BE(16), 1200);
  assert.equal(image.readUInt32BE(20), 630);
});

test('production routes serve crawler-ready HTML, noindex private pages, proper 404s and original PDFs', async (t) => {
  const server = createBookingServer({ staticRoot, publicOrigin: origin });
  await new Promise((resolve) => server.listen(0, '127.0.0.1', resolve));
  t.after(() => new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve())));
  const base = `http://127.0.0.1:${server.address().port}`;
  for (const path of getPublicPaths()) {
    const response = await fetch(base + path);
    assert.equal(response.status, 200, path);
    assert.match(response.headers.get('content-type'), /text\/html/);
    assert.match(response.headers.get('x-robots-tag'), /^index, follow/);
    const html = await response.text();
    assert.ok(html.includes(`rel="canonical" href="${origin}${path}"`));
  }
  for (const path of ['/admin', '/payment/success', '/payment/fail', '/research/missing', '/missing']) {
    const response = await fetch(base + path);
    assert.equal(response.status, path.includes('missing') ? 404 : 200);
    assert.equal(response.headers.get('x-robots-tag'), 'noindex, nofollow');
    assert.equal(response.headers.get('cache-control'), 'no-store');
    assert.match(await response.text(), /name="robots" content="noindex, nofollow"/);
  }
  const head = await fetch(base + '/admin', { method: 'HEAD' });
  assert.equal(head.headers.get('x-robots-tag'), 'noindex, nofollow');
  assert.equal(await head.text(), '');
  for (const [path, canonical] of [
    ['/research/', '/research'], ['/research/index.html', '/research'],
    ['/index.html', '/'], ['/admin/index.html', '/admin'],
  ]) {
    const redirect = await fetch(base + path, { redirect: 'manual' });
    assert.equal(redirect.status, 301);
    assert.equal(redirect.headers.get('location'), canonical);
  }
  const pdf = RESEARCH_READINGS.find((item) => item.pdfFile);
  const response = await fetch(base + '/readings/' + pdf.pdfFile);
  assert.equal(response.headers.get('content-type'), 'application/pdf');
  assert.ok(Buffer.from(await response.arrayBuffer()).subarray(0, 5).equals(Buffer.from('%PDF-')));
  const sitemap = await (await fetch(base + '/sitemap.xml')).text();
  assert.ok(sitemap.includes(`${origin}/research`));
  assert.doesNotMatch(sitemap, /\/admin|\/payment/);
  assert.match(await (await fetch(base + '/robots.txt')).text(), /Sitemap: https:\/\/dalbit.example\/sitemap.xml/);
  const privateData = await fetch(base + '/api/admin/board');
  assert.equal(privateData.status, 401);
  assert.equal(privateData.headers.get('x-robots-tag'), 'noindex, nofollow');
});
