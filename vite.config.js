import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { loggerPlugin } from './vite-plugin-logger.js';
import { githubProxyPlugin } from './vite-plugin-github-proxy.js';

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react(), loggerPlugin(), githubProxyPlugin()],
  base: '/wiki/', // Replace with your repo name
  build: {
    outDir: 'dist',
    sourcemap: true,
    rollupOptions: {
      output: {
        manualChunks: {
          // Split vendor code
          'react-vendor': ['react', 'react-dom', 'react-router-dom'],
          // Split markdown libraries
          'markdown': ['react-markdown', 'remark-gfm', 'rehype-highlight', 'rehype-slug', 'rehype-autolink-headings'],
          // Split code editor
          'editor': ['@uiw/react-codemirror', '@codemirror/lang-markdown'],
          // Split GitHub API
          'github': ['octokit'],
          // Split search
          'search': ['fuse.js'],
        },
      },
    },
    chunkSizeWarningLimit: 600,
  },
  resolve: {
    alias: {
      '@': resolve(__dirname, 'src'),
      '@content': resolve(__dirname, 'public/content')
    }
  }
});
