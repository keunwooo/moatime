/// <reference types="vitest/config" />
import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';

// Node's environment (this file runs in Node; the app's tsconfig has no Node types)
declare const process: { env: Record<string, string | undefined> };

// GitHub Pages serves the project under /<repo>/ (the Pages workflow sets BASE_PATH)
const base = process.env.BASE_PATH || '/';

/**
 * Link previews (KakaoTalk, Slack, X, …) need absolute image addresses. When the site's origin is
 * known (SITE_ORIGIN, e.g. https://name.github.io), the share image becomes absolute and the page
 * gets og:url and a canonical link. Without it the build keeps relative paths.
 */
function shareLinks(origin: string | undefined): Plugin {
  return {
    name: 'moa-share-links',
    transformIndexHtml: {
      order: 'post',
      handler(html) {
        if (!origin) return html;
        const site = origin.replace(/\/+$/, '');
        const root = base.replace(/\/+$/, '');
        const abs = (p: string) => (/^https?:/.test(p) ? p : `${site}${p.startsWith(`${root}/`) ? p : `${root}${p}`}`);
        const page = `${site}${root}/`;
        return html
          .replace(/(<meta\s+(?:property|name)="(?:og:image|twitter:image)"\s+content=")([^"]+)(")/g, (_m, a: string, p: string, b: string) => a + abs(p) + b)
          .replace('</head>', `  <meta property="og:url" content="${page}" />\n    <link rel="canonical" href="${page}" />\n  </head>`);
      },
    },
  };
}

export default defineConfig({
  base,
  plugins: [react(), shareLinks(process.env.SITE_ORIGIN)],
  server: {
    // Native file events are unreliable for this (non-ASCII) Windows path; polling is.
    watch: { usePolling: true, interval: 300 },
  },
  build: {
    outDir: 'dist',
    target: 'es2022',
    sourcemap: false,
    chunkSizeWarningLimit: 900,
  },
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
