import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { EXTRA_WORDS } from './src/iconSetAll.ts';

// The editor `fastdraw open --editor local` serves from this computer: the edit page only, written to dist-local/
// and shipped in the npm package. __FASTDRAW_LOCAL__ leaves out what only the editor at fastdraw.dev has (the full
// icon set, the dark theme, the look picker, templates; editor/src/edition.ts).
function localPage(): Plugin {
  return {
    name: 'fastdraw-local-page',
    // light only: the page's dark start-up script goes
    transformIndexHtml: (html) => html.replace(/<script>try\{var t=localStorage[\s\S]*?<\/script>\n?/, ''),
    generateBundle() {
      this.emitFile({ type: 'asset', fileName: 'favicon.svg', source: readFileSync(resolve(import.meta.dirname, 'editor/public/favicon.svg')) });
    },
  };
}

export default defineConfig({
  root: 'editor',
  base: './',
  publicDir: false,
  plugins: [react(), localPage()],
  // the full set's names only (a few KB), so a diagram that uses one is told where it is drawn, not that it is wrong
  define: { __FASTDRAW_LOCAL__: 'true', __FASTDRAW_FULL_ICON_NAMES__: JSON.stringify(Object.keys(EXTRA_WORDS)) },
  build: {
    outDir: '../dist-local',
    emptyOutDir: true,
    rollupOptions: { input: { edit: resolve(import.meta.dirname, 'editor/edit/index.html') } },
  },
  assetsInclude: ['**/*.fdraw', '**/*.look'],
});
