import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  base: '/vue-quill-editor/',
  build: {
    outDir: 'demo-dist',
    emptyOutDir: true,
  },
});
