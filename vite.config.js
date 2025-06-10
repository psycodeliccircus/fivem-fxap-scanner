import { defineConfig } from 'vite';
import { join } from 'path';

export default defineConfig({
  root: 'src',
  base: './',
  build: {
    outDir: '../dist',
    emptyOutDir: true,
    rollupOptions: {
      input: {
        main: join(__dirname, 'src/index.html')
      }
    }
  },
  server: {
    port: 3000
  }
});
