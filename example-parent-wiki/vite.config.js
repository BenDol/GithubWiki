import { createWikiConfigSync } from './wiki-framework/vite.config.base.js';
import { loggerPlugin } from './wiki-framework/vite-plugin-logger.js';
import { githubProxyPlugin } from './wiki-framework/vite-plugin-github-proxy.js';

/**
 * Parent wiki configuration
 * Extends the base wiki framework configuration
 */
export default createWikiConfigSync({
  // Your wiki's base URL (must match GitHub Pages repo name)
  base: '/my-wiki/',

  // Content location (relative to this file)
  contentPath: './content',

  // Additional plugins specific to your wiki
  plugins: [
    loggerPlugin(),
    githubProxyPlugin(),
  ],

  // You can override any Vite settings here
  server: {
    port: 5173,
  },
});
