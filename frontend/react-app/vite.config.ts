import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { defineConfig, loadEnv } from 'vite';

const appRoot = fileURLToPath(new URL('.', import.meta.url));

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, appRoot, '');
  return {
    base: mode === 'development' ? '/' : '/react-app-assets/',
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: { '@': appRoot },
    },
    server: {
      port: 3001,
      host: '0.0.0.0',
      proxy: {
        '/api': {
          target: env.VITE_BACKEND_ORIGIN || 'http://127.0.0.1:8000',
          changeOrigin: true,
        },
      },
    },
    build: {
      outDir: 'dist',
      emptyOutDir: true,
    },
  };
});
