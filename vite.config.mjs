import { defineConfig } from 'vite';

const apiTarget = process.env.API_PROXY_TARGET || 'http://localhost:3000';

export default defineConfig({
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    proxy: {
      '/api': {
        target: apiTarget,
        changeOrigin: true
      }
    }
  }
});
