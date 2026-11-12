import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// The editor is a static site: `npm run build:editor` writes it to dist-editor/.
export default defineConfig({
  root: 'editor',
  base: './',
  plugins: [react()],
  server: { fs: { allow: ['..'] }, port: 5199, strictPort: true },
  build: { outDir: '../dist-editor', emptyOutDir: true },
  assetsInclude: ['**/*.fdraw', '**/*.look'],
});
