import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'node:path';
import { siteFiles } from './tools/siteFiles.ts';

// The website is static: `npm run build:editor` writes it to dist-editor/.
// /       the landing page (editor/index.html)
// /edit/  the editor (editor/edit/index.html)
// /llms.txt and /guide/*.md  the guide, for agents that read the web
function agentFiles(): Plugin {
  return {
    name: 'fastdraw-agent-files',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const path = (req.url ?? '').split('?')[0].replace(/^\//, '');
        const text = siteFiles(import.meta.dirname).get(path);
        if (text === undefined) return next();
        res.setHeader('Content-Type', `${path.endsWith('.md') ? 'text/markdown' : 'text/plain'}; charset=utf-8`);
        res.end(text);
      });
    },
    generateBundle() {
      for (const [fileName, source] of siteFiles(import.meta.dirname)) this.emitFile({ type: 'asset', fileName, source });
    },
  };
}

export default defineConfig({
  root: 'editor',
  base: './',
  plugins: [react(), agentFiles()],
  server: { fs: { allow: ['..'] }, port: 5199, strictPort: true },
  build: {
    outDir: '../dist-editor',
    emptyOutDir: true,
    rollupOptions: { input: { main: resolve(import.meta.dirname, 'editor/index.html'), edit: resolve(import.meta.dirname, 'editor/edit/index.html') } },
  },
  assetsInclude: ['**/*.fdraw', '**/*.look'],
});
