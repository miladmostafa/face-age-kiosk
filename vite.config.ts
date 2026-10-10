import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: path.join(root, 'src/renderer'),
  base: './',
  publicDir: 'public',
  resolve: {
    alias: {
      'face-age': path.join(root, 'src/renderer/face-age-module.ts'),
    },
  },
  build: {
    outDir: path.join(root, 'dist/renderer'),
    emptyOutDir: true,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
});
