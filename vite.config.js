import { defineConfig, loadEnv } from 'vite';
import react from '@vitejs/plugin-react';
import { createPublicDocument, DEFAULT_ORIGIN, getPageSeo, renderRobots, renderSitemap, validateSiteOrigin } from './src/seo.js';

export default defineConfig(({ mode }) => {
  const origin = validateSiteOrigin(process.env.PUBLIC_ORIGIN || loadEnv(mode, process.cwd(), 'PUBLIC_ORIGIN').PUBLIC_ORIGIN || DEFAULT_ORIGIN);
  let isBuild = false;
  return {
  define: { 'import.meta.env.PUBLIC_ORIGIN': JSON.stringify(origin) },
  plugins: [react(), {
    name: 'public-page-seo',
    transformIndexHtml: {
      order: 'pre',
      handler(html, context) {
        const path = new URL(context.originalUrl || context.path, origin).pathname;
        return createPublicDocument(html, getPageSeo(path === '/index.html' ? '/' : path, origin));
      },
    },
    configureServer(server) {
      server.middlewares.use((request, response, next) => {
        const path = new URL(request.url, origin).pathname;
        if (path === '/robots.txt' || path === '/sitemap.xml') {
          response.setHeader('Content-Type', path === '/robots.txt' ? 'text/plain; charset=utf-8' : 'application/xml; charset=utf-8');
          response.end(path === '/robots.txt' ? renderRobots(origin) : renderSitemap(origin));
          return;
        }
        const seo = getPageSeo(path, origin);
        if (request.headers.accept?.includes('text/html')) {
          response.statusCode = seo.status;
          response.setHeader('X-Robots-Tag', seo.robots);
        }
        next();
      });
    },
    configResolved(config) { isBuild = config.command === 'build'; },
    async closeBundle() {
      if (isBuild) {
        const { prerender } = await import('./server/prerender.js');
        await prerender(origin);
      }
    },
  }],
  server: {
    proxy: { '/api': 'http://127.0.0.1:8787' },
  },
  };
});
