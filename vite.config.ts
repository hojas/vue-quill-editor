import { defineConfig } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig({
  plugins: [vue()],
  server: {
    proxy: {
      '/api': 'http://127.0.0.1:3001',
    },
  },
  build: {
    lib: {
      entry: 'src/index.ts',
      name: 'VueQuillEditorEdm',
      formats: ['es', 'cjs'],
      fileName: (format) => `vue-quill-editor-edm.${format === 'cjs' ? 'cjs' : 'js'}`,
    },
    rollupOptions: {
      external: ['vue', 'quill', 'quill/dist/quill.snow.css'],
      output: {
        globals: {
          vue: 'Vue',
          quill: 'Quill',
        },
      },
    },
    cssCodeSplit: false,
    emptyOutDir: false,
  },
});
