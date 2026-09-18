import { fileURLToPath, URL } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const CLIENT_PORT = Number(process.env.CLIENT_PORT ?? 43127);
const SERVER_PORT = Number(process.env.PORT ?? 43128);

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': fileURLToPath(new URL('./src', import.meta.url)),
      '@oncue/shared': fileURLToPath(new URL('../shared/src/index.ts', import.meta.url)),
    },
  },
  server: {
    port: CLIENT_PORT,
    host: true,
    strictPort: true,
    proxy: {
      '/api': { target: `http://127.0.0.1:${SERVER_PORT}`, changeOrigin: true },
      '/ws': { target: `ws://127.0.0.1:${SERVER_PORT}`, ws: true },
    },
  },
  preview: { port: CLIENT_PORT, host: true },
});
