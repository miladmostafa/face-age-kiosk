import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv, type Plugin } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

function previewClientIdPlugin(clientId: string): Plugin {
  return {
    name: 'preview-client-id',
    configureServer(server) {
      server.middlewares.use('/__kiosk_preview_client_id', (_req, res) => {
        res.setHeader('Content-Type', 'text/plain; charset=utf-8');
        res.setHeader('Cache-Control', 'no-store');
        res.end(clientId);
      });
    },
  };
}

export default defineConfig(({ mode, command }) => {
  const env = loadEnv(mode, root, '');
  return {
    root: path.join(root, 'src/renderer'),
    base: './',
    publicDir: 'public',
    resolve: {
      alias: {
        'face-age': path.join(root, 'src/renderer/face-age-module.ts'),
      },
    },
    plugins: command === 'serve' ? [previewClientIdPlugin(env.FACEAGE_CLIENT_ID ?? '')] : [],
    build: {
      outDir: path.join(root, 'dist/renderer'),
      emptyOutDir: true,
    },
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
    },
  };
});
