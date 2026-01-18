import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  root: 'src/renderer',
  base: './',
  build: {
    outDir: '../../dist/renderer',
    emptyOutDir: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, 'src/renderer'),
      '@components': path.resolve(__dirname, 'src/renderer/components'),
      '@screens': path.resolve(__dirname, 'src/renderer/screens'),
      '@hooks': path.resolve(__dirname, 'src/renderer/hooks'),
      '@services': path.resolve(__dirname, 'src/renderer/services'),
    },
  },
  server: {
    port: 5173,
  },
});
