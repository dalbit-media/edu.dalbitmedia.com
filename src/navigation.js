import { RESEARCH_READINGS } from './researchLibrary.js';

export function getRoute(pathname) {
  const path = pathname === '/' ? '/' : pathname.replace(/\/+$/, '');
  const isResearch = path === '/research' || path.startsWith('/research/');
  const readingId = path.startsWith('/research/') ? path.slice('/research/'.length) : null;
  const reading = RESEARCH_READINGS.find((item) => item.id === readingId && item.pdfFile);
  const isAdmin = path === '/admin';
  const isPayment = ['/payment/success', '/payment/fail'].includes(path);
  const found = path === '/' || path === '/research' || Boolean(reading) || isAdmin || isPayment;
  return { path, isResearch, readingId, reading, isAdmin, isPayment, found };
}

export function getLegacyPath(hash) {
  if (hash === '#admin') return '/admin';
  if (hash === '#/research' || hash.startsWith('#/research/')) return hash.slice(1);
  return null;
}

export function navigateTo(href, { replace = false } = {}) {
  const url = new URL(href, window.location.href);
  window.history[replace ? 'replaceState' : 'pushState'](null, '', url.pathname + url.search + url.hash);
  window.dispatchEvent(new PopStateEvent('popstate'));
}
