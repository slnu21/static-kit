import { defineConfig } from 'vitest/config';

// Library mode, ESM only. Each module is its own entry so consumers can import
// (or vendor) just the file they need. Shared internals land in dist/shared/.
export default defineConfig({
  build: {
    target: 'es2022',
    outDir: 'dist',
    emptyOutDir: true,
    minify: false,
    sourcemap: false,
    lib: {
      entry: {
        index: 'src/index.ts',
        'save/store': 'src/save/store.ts',
        'save/persist': 'src/save/persist.ts',
        'save/code': 'src/save/code.ts',
        'save/file': 'src/save/file.ts',
        rng: 'src/rng.ts',
        daily: 'src/daily.ts',
        catalog: 'src/catalog.ts',
      },
      formats: ['es'],
      fileName: (_format, name) => `${name}.js`,
    },
    rollupOptions: {
      output: {
        chunkFileNames: 'shared/[name].js',
      },
    },
  },
  test: {
    include: ['test/**/*.test.ts'],
    environment: 'node',
  },
});
