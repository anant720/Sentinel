import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
  server: {
    port: 5174,
    proxy: {
      '/api': {
        target: process.env.VITE_API_URL || '',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/api/, ''),
      },
      '/auth': {
        target: process.env.VITE_API_URL || '',
        changeOrigin: true,
      },
      '/ws': {
        target: process.env.VITE_WS_URL || '',
        ws: true,
        changeOrigin: true,
      },
    },
  },
});
