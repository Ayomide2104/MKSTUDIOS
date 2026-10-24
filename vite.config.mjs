import { defineConfig } from 'vite';

const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:3000';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: Number(process.env.FRONTEND_PORT || 5174),
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true
      }
    }
  }
});
