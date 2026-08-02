import { defineConfig } from 'vite';
import { resolve } from 'path';

export default defineConfig({
  build: {
    lib: {
      entry: resolve(__dirname, 'src/index.ts'),
      name: 'WM8741BLE',
      fileName: (format) => `wm8741-ble.${format === 'es' ? 'esm' : format}.js`,
      formats: ['es', 'umd']
    },
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    minify: 'esbuild',
    rollupOptions: {
      output: {
        globals: {}
      }
    }
  }
});
