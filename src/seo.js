import { PAID_SERVICE } from './booking.js';
import { getRoute } from './navigation.js';
import { RESEARCH_READINGS } from './researchLibrary.js';

export const HOME_TITLE = '달빛에듀 | 학습과학 기반 진로·학업 상담';
export const HOME_DESCRIPTION = '학습과학 기반 진로·학업 적성 검사, 흥미·열정 탐색, 토론과 미래 직업 탐색을 안내합니다. 초5–고3 및 해외 Grade 5–12 학생 대상 무료 기본 상담, 전문가 심층 상담, 정기 코칭과 멘토십을 제공합니다.';
export const DEFAULT_ORIGIN = 'http://127.0.0.1:5173';

export function validateSiteOrigin(value) {
  const url = new URL(value);
  if (!['http:', 'https:'].includes(url.protocol) || url.origin !== value || url.username || url.password) {
    throw new Error('PUBLIC_ORIGIN must be an HTTP(S) origin without credentials, a path, query or fragment.');
  }
  if (url.protocol !== 'https:' && !['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)) {
    throw new Error('A public site requires an HTTPS PUBLIC_ORIGIN.');
  }
  return value;
}

export function getPublicPaths() {
  return ['/', '/research', ...RESEARCH_READINGS.filter((item) => item.pdfFile).map((item) => `/research/${item.id}`)];
}

export function getPageSeo(pathname, origin = DEFAULT_ORIGIN) {
  validateSiteOrigin(origin);
  const route = getRoute(pathname);
  const canonical = origin + route.path;
  let title = HOME_TITLE;
  let description = HOME_DESCRIPTION;
  if (route.path === '/research') {
    title = '학습과학 연구 자료 · EDPSY501·542·583 | 달빛에듀';
    description = `학습과학·인간 발달 문헌 ${RESEARCH_READINGS.length}편을 8개 주제로 살펴봅니다. 연구 맥락과 적용 한계, EDPSY501·EDPSY542·EDPSY583 읽기 자료의 한국어 해설과 원문 PDF를 제공합니다.`;
  } else if (route.reading) {
    title = `${route.reading.title} | ${route.reading.courseCode} · 달빛에듀`;
    description = `${route.reading.courseCode} 읽기 자료: ${route.reading.summary} 원문 PDF와 근거 쪽수를 확인하세요.`;
  } else if (route.isAdmin) {
    title = '상담 운영자 로그인 | 달빛에듀';
    description = '인증된 상담 운영자를 위한 상담 신청·예약 관리 화면입니다.';
  } else if (route.isPayment) {
    title = `${route.path.endsWith('/success') ? '결제 상태 확인' : '결제 미완료'} | 달빛에듀`;
    description = '개인 상담 예약의 결제 상태를 확인하는 화면입니다.';
  } else if (!route.found) {
    title = '페이지를 찾을 수 없습니다 | 달빛에듀';
    description = '요청한 페이지를 찾을 수 없습니다. 상담 안내와 연구 자료 목록을 확인해 주세요.';
  }
  const indexable = route.found && !route.isAdmin && !route.isPayment;
  const organization = { '@type': 'Organization', '@id': `${origin}/#organization`, name: '달빛에듀', url: `${origin}/` };
  const page = {
    '@type': route.path === '/research' ? 'CollectionPage' : 'WebPage',
    '@id': canonical + '#webpage', url: canonical, name: title, description, inLanguage: 'ko',
    isPartOf: { '@id': `${origin}/#website` }, publisher: { '@id': organization['@id'] },
  };
  const graph = [organization, {
    '@type': 'WebSite', '@id': `${origin}/#website`, url: `${origin}/`, name: '달빛에듀',
    inLanguage: 'ko', publisher: { '@id': organization['@id'] },
  }, page];
  if (route.path === '/') {
    graph.push({
      '@type': 'Service', name: '학습과학 기반 진로·학업 상담', provider: { '@id': organization['@id'] },
      description: HOME_DESCRIPTION,
      offers: {
        '@type': 'Offer', price: PAID_SERVICE.amount, priceCurrency: PAID_SERVICE.currency,
        description: `전문가 심층 상담 · ${PAID_SERVICE.description} · ${PAID_SERVICE.priceNote}`, url: `${origin}/#consultation`,
      },
    });
  } else if (route.reading) {
    graph.push({
      '@type': 'Article', headline: route.reading.title, description: route.reading.summary,
      url: canonical, inLanguage: 'ko', mainEntityOfPage: { '@id': page['@id'] },
      author: { '@id': organization['@id'] }, publisher: { '@id': organization['@id'] },
      keywords: [route.reading.courseCode, '학습과학', '한국어 요약·해설'],
      isBasedOn: { '@type': 'CreativeWork', name: route.reading.publication, url: route.reading.url, citation: route.reading.citation },
    });
    graph.push({
      '@type': 'BreadcrumbList', itemListElement: [
        { '@type': 'ListItem', position: 1, name: '홈', item: `${origin}/` },
        { '@type': 'ListItem', position: 2, name: '연구 자료', item: `${origin}/research` },
        { '@type': 'ListItem', position: 3, name: route.reading.title, item: canonical },
      ],
    });
  } else if (route.path === '/research') {
    graph.push({
      '@type': 'ItemList', numberOfItems: RESEARCH_READINGS.length,
      itemListElement: RESEARCH_READINGS.map((item, index) => ({
        '@type': 'ListItem', position: index + 1, name: item.publication,
        url: item.pdfFile ? `${origin}/research/${item.id}` : item.url,
      })),
    });
  }
  return {
    title, description, canonical, image: `${origin}/social-preview.png`, type: route.reading ? 'article' : 'website',
    robots: indexable ? 'index, follow, max-image-preview:large' : 'noindex, nofollow',
    status: route.found ? 200 : 404,
    structuredData: indexable ? { '@context': 'https://schema.org', '@graph': graph } : null,
  };
}

const escapeHtml = (value) => String(value).replace(/[&<>"']/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
})[character]);

export function renderSeoHead(seo) {
  const names = [
    ['description', seo.description], ['robots', seo.robots], ['twitter:card', 'summary_large_image'],
    ['twitter:title', seo.title], ['twitter:description', seo.description], ['twitter:image', seo.image],
    ['twitter:image:alt', '달빛에듀 · 학습과학 기반 공부·진로 탐색'],
  ];
  const properties = [
    ['og:title', seo.title], ['og:description', seo.description], ['og:type', seo.type],
    ['og:url', seo.canonical], ['og:site_name', '달빛에듀'], ['og:locale', 'ko_KR'],
    ['og:image', seo.image], ['og:image:width', '1200'], ['og:image:height', '630'],
    ['og:image:alt', '달빛에듀 · 학습과학 기반 공부·진로 탐색'],
  ];
  const tags = [
    ...names.map(([name, content]) => `<meta data-seo name="${name}" content="${escapeHtml(content)}" />`),
    ...properties.map(([property, content]) => `<meta data-seo property="${property}" content="${escapeHtml(content)}" />`),
    `<link data-seo rel="canonical" href="${escapeHtml(seo.canonical)}" />`,
  ];
  if (seo.structuredData) tags.push(`<script data-seo type="application/ld+json">${JSON.stringify(seo.structuredData).replace(/</g, '\\u003c')}</script>`);
  return tags.join('\n    ');
}

export function createPublicDocument(template, seo, markup) {
  let html = template
    .replace(/<(?:meta|link)\b[^>]*\bdata-seo\b[^>]*>/g, '')
    .replace(/<script\b[^>]*\bdata-seo\b[^>]*>[\s\S]*?<\/script>/g, '')
    .replace(/<meta\b[^>]*name="description"[^>]*>/g, '')
    .replace(/<title>[\s\S]*?<\/title>/, `<title>${escapeHtml(seo.title)}</title>`)
    .replace('</head>', `    ${renderSeoHead(seo)}\n  </head>`);
  if (markup !== undefined) {
    if (!html.includes('<!--app-html-->')) throw new Error('Prerender template is missing the app HTML marker.');
    html = html.replace('<!--app-html-->', markup);
  }
  return html;
}

export function applyPageSeo(pathname, origin) {
  const seo = getPageSeo(pathname, origin);
  document.title = seo.title;
  document.head.querySelectorAll('[data-seo], meta[name="description"]').forEach((element) => element.remove());
  document.head.insertAdjacentHTML('beforeend', renderSeoHead(seo));
}

export function renderSitemap(origin) {
  validateSiteOrigin(origin);
  return `<?xml version="1.0" encoding="UTF-8"?>\n<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">\n${getPublicPaths().map((path) => `  <url><loc>${escapeHtml(origin + path)}</loc></url>`).join('\n')}\n</urlset>\n`;
}

export function renderRobots(origin) {
  validateSiteOrigin(origin);
  return `User-agent: *\nAllow: /\nDisallow: /api/\n\nSitemap: ${origin}/sitemap.xml\n`;
}
