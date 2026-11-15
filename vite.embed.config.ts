import { defineConfig, type Plugin } from 'vite';
import { readFileSync } from 'node:fs';
import { transform } from 'esbuild';
import { resolve } from 'node:path';
import { FONT_FILES } from './editor/src/embed/faces.ts';

// embed.js, the <fastdraw-diagram> element, as one ES module plus the files it loads on first use:
//   embed.js          the element (small)
//   embed/*.js        the renderer, and the rest of the icons for a diagram that uses one
//   fonts/*.ttf       the fonts the bundled looks use, found next to embed.js
// `npm run build:embed` writes them to dist-embed/ (shipped in the npm package); `npm run build:editor`
// writes them into the website as well, so fastdraw.dev serves /embed.js.
function fonts(): Plugin {
  return {
    name: 'fastdraw-embed-fonts',
    generateBundle() {
      for (const f of FONT_FILES) this.emitFile({ type: 'asset', fileName: `fonts/${f}`, source: readFileSync(resolve(__dirname, 'fonts', f)) });
    },
  };
}

// a library build keeps the whitespace of ES modules; these files go to browsers as they are, so minify them fully
function minify(): Plugin {
  return {
    name: 'fastdraw-embed-minify',
    async generateBundle(_, bundle) {
      for (const c of Object.values(bundle)) if (c.type === 'chunk') c.code = (await transform(c.code, { minify: true, format: 'esm', target: 'es2022' })).code;
    },
  };
}

export default defineConfig({
  publicDir: false,
  plugins: [fonts(), minify()],
  build: {
    outDir: 'dist-embed',
    emptyOutDir: true,
    target: 'es2022',
    chunkSizeWarningLimit: 4000,
    lib: { entry: resolve(__dirname, 'editor/src/embed/element.ts'), formats: ['es'], fileName: () => 'embed.js' },
    rollupOptions: { preserveEntrySignatures: 'allow-extension', output: { chunkFileNames: 'embed/[name]-[hash].js' } },
  },
});
