import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { resolve } from 'path';
import { fileURLToPath } from 'url';
import { dirname } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Create base wiki configuration
 * This is imported by parent wiki projects and extended with their specific settings
 *
 * @param {Object} options - Configuration options
 * @param {string} options.base - Base URL path (e.g., '/my-wiki/')
 * @param {string} options.contentPath - Path to content directory (default: '../content')
 * @param {string} options.configPath - Path to wiki-config.json (default: '../wiki-config.json')
 * @param {Object} options.plugins - Additional Vite plugins
 * @param {Object} options.alias - Additional path aliases
 * @returns {Object} Vite configuration
 */
export function createWikiConfig(options = {}) {
  const {
    base = '/',
    contentPath = '../content',
    configPath = '../',
    plugins = [],
    alias = {},
    ...otherOptions
  } = options;

  // Only import plugins in development mode
  let devPlugins = [];
  if (process.env.NODE_ENV !== 'production') {
    try {
      const { loggerPlugin } = await import('./vite-plugin-logger.js');
      const { githubProxyPlugin } = await import('./vite-plugin-github-proxy.js');
      devPlugins = [loggerPlugin(), githubProxyPlugin()];
    } catch (error) {
      console.warn('Dev plugins not available:', error.message);
    }
  }

  return defineConfig({
    plugins: [
      react(),
      ...devPlugins,
      ...plugins,
    ],

    base,

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
        '@framework': resolve(__dirname, 'src'),
        '@content': resolve(__dirname, contentPath),
        '@config': resolve(__dirname, configPath),
        ...alias,
      },
    },

    // Allow parent to override any settings
    ...otherOptions,
  });
}

/**
 * Export synchronous version for backwards compatibility
 */
export function createWikiConfigSync(options = {}) {
  const {
    base = '/',
    contentPath = '../content',
    configPath = '../',
    plugins = [],
    alias = {},
    ...otherOptions
  } = options;

  // Lazy-load dev plugins
  const devPlugins = [];

  return defineConfig({
    plugins: [
      react(),
      ...devPlugins,
      ...plugins,
    ],

    base,

    build: {
      outDir: 'dist',
      sourcemap: true,
      rollupOptions: {
        output: {
          manualChunks: {
            'react-vendor': ['react', 'react-dom', 'react-router-dom'],
            'markdown': ['react-markdown', 'remark-gfm', 'rehype-highlight', 'rehype-slug', 'rehype-autolink-headings'],
            'editor': ['@uiw/react-codemirror', '@codemirror/lang-markdown'],
            'github': ['octokit'],
            'search': ['fuse.js'],
          },
        },
      },
      chunkSizeWarningLimit: 600,
    },

    resolve: {
      alias: {
        '@': resolve(__dirname, 'src'),
        '@framework': resolve(__dirname, 'src'),
        '@content': resolve(__dirname, contentPath),
        '@config': resolve(__dirname, configPath),
        ...alias,
      },
    },

    ...otherOptions,
  });
}
