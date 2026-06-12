import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  define: {
    'process.env.NODE_ENV': '"production"',
  },
  build: {
    outDir: '../public',
    emptyOutDir: false,
    minify: 'terser',
    target: 'es2018',
    cssCodeSplit: false,
    lib: {
      entry: 'src/main.jsx',
      name: 'TriNodeWidget',
      formats: ['iife'],
      fileName: () => 'widget.js',
    },
    rollupOptions: {
      output: {
        entryFileNames: 'widget.js',
        inlineDynamicImports: true,
      },
    },
  },
});
