import { mkdtemp, mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { build } from 'vite';
import react from '@vitejs/plugin-react';
import { createPublicDocument, getPageSeo, getPublicPaths, renderRobots, renderSitemap } from '../src/seo.js';

export async function prerender(origin) {
  const output = fileURLToPath(new URL('../dist', import.meta.url));
  const temporary = await mkdtemp(join(tmpdir(), 'dalbit-prerender-'));
  try {
    await build({
      configFile: false,
      plugins: [react()],
      ssr: { noExternal: true },
      build: {
        ssr: fileURLToPath(new URL('../src/entry-server.jsx', import.meta.url)),
        outDir: temporary, emptyOutDir: false, minify: false,
        rollupOptions: { output: { entryFileNames: 'entry-server.mjs' } },
      },
    });
    const { render } = await import(pathToFileURL(join(temporary, 'entry-server.mjs')).href);
    const template = await readFile(join(output, 'index.html'), 'utf8');
    const paths = [...getPublicPaths(), '/admin', '/payment/success', '/payment/fail', '/404'];
    for (const path of paths) {
      const html = createPublicDocument(template, getPageSeo(path, origin), render(path));
      const directory = join(output, ...path.split('/').filter(Boolean));
      await mkdir(directory, { recursive: true });
      await writeFile(join(directory, 'index.html'), html);
      if (path === '/404') await writeFile(join(output, '404.html'), html);
    }
    await writeFile(join(output, 'sitemap.xml'), renderSitemap(origin));
    await writeFile(join(output, 'robots.txt'), renderRobots(origin));
    console.log(`Prerendered ${getPublicPaths().length} indexable pages; admin, payment and error pages are noindex.`);
  } finally {
    await rm(temporary, { recursive: true, force: true });
  }
}
