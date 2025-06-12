// vite.config.js
import { defineConfig } from 'vite';
import { join, resolve } from 'path';

export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        index:         resolve(__dirname, 'src/index.html'),
        sobre:         resolve(__dirname, 'src/sobre.html'),
        meupc:         resolve(__dirname, 'src/meupc.html'),
      }
    }
  },
  server: {
    port: 3000
  }
});
