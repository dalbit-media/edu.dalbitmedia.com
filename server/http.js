import { readFileSync, existsSync, statSync } from 'node:fs';
import { resolve, extname, sep } from 'node:path';
import { getRoute } from '../src/navigation.js';
import { createPublicDocument, getPageSeo, renderRobots, renderSitemap } from '../src/seo.js';

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

export function requireValue(condition, message, status = 400) {
  if (!condition) throw new HttpError(status, message);
}

export function sendJson(response, status, data) {
  response.writeHead(status, {
    'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store',
    'X-Content-Type-Options': 'nosniff', 'X-Robots-Tag': 'noindex, nofollow',
  });
  response.end(JSON.stringify(data));
}

export async function readJson(request) {
  requireValue(request.headers['content-type']?.split(';')[0] === 'application/json', 'JSON 요청이 필요합니다.', 415);
  let size = 0;
  const chunks = [];
  for await (const chunk of request) {
    size += chunk.length;
    requireValue(size <= 32768, '입력 내용이 너무 큽니다.', 413);
    chunks.push(chunk);
  }
  try {
    const data = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    requireValue(data && typeof data === 'object' && !Array.isArray(data), '올바른 요청 형식이 필요합니다.');
    return data;
  } catch (error) {
    if (error instanceof SyntaxError) throw new HttpError(400, '올바른 JSON 요청이 필요합니다.');
    throw error;
  }
}

const contentTypes = {
  '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css',
  '.pdf': 'application/pdf', '.svg': 'image/svg+xml', '.png': 'image/png', '.ico': 'image/x-icon',
};

export function servePublicPage(request, response, url, { staticRoot, publicOrigin }) {
  const path = url.pathname;
  const method = request.method;
  requireValue(method === 'GET' || method === 'HEAD', '지원하지 않는 요청입니다.', 405);
  if (path === '/robots.txt' || path === '/sitemap.xml') {
    const content = path === '/robots.txt' ? renderRobots(publicOrigin) : renderSitemap(publicOrigin);
    response.writeHead(200, {
      'Content-Type': path === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8',
      'X-Content-Type-Options': 'nosniff',
    });
    response.end(method === 'HEAD' ? undefined : content);
    return;
  }
  requireValue(staticRoot, '프런트엔드 개발 서버를 이용해 주세요.', 404);
  const seoPath = path.endsWith('/index.html') ? path.slice(0, -'/index.html'.length) || '/' : path;
  const route = getRoute(seoPath);
  if (route.found && route.path !== path) {
    response.writeHead(301, { Location: route.path + url.search });
    response.end();
    return;
  }
  const root = resolve(staticRoot);
  const target = resolve(root, `.${decodeURIComponent(path)}`);
  requireValue(target === root || target.startsWith(root + sep), '잘못된 경로입니다.', 400);
  const isAsset = Boolean(extname(target));
  if (isAsset) requireValue(existsSync(target) && statSync(target).isFile(), '파일을 찾을 수 없습니다.', 404);
  const asset = isAsset ? target : route.found ? resolve(target, 'index.html') : resolve(root, '404.html');
  requireValue(existsSync(asset), '먼저 npm run build를 실행해 주세요.', 503);
  const seo = extname(asset) === '.html' ? getPageSeo(seoPath, publicOrigin) : null;
  response.writeHead(seo?.status || 200, {
    'Content-Type': contentTypes[extname(asset)] || 'application/octet-stream',
    'X-Content-Type-Options': 'nosniff', 'Referrer-Policy': 'same-origin',
    ...(seo && {
      'X-Robots-Tag': seo.robots,
      'Cache-Control': seo.robots.startsWith('noindex') ? 'no-store' : 'public, max-age=0, must-revalidate',
    }),
  });
  response.end(method === 'HEAD' ? undefined : seo ? createPublicDocument(readFileSync(asset, 'utf8'), seo) : readFileSync(asset));
}
