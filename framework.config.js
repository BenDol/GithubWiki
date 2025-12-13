/**
 * Framework configuration
 * Defines where the framework looks for content and configuration
 *
 * This file can be overridden in parent projects by setting environment variables:
 * - WIKI_CONTENT_PATH: Path to content directory (default: './public/content')
 * - WIKI_CONFIG_FILE: Path to wiki-config.json (default: './public/wiki-config.json')
 * - WIKI_PUBLIC_PATH: Path to public directory (default: './public')
 */

export const frameworkConfig = {
  // Content directory - where markdown files are stored
  contentPath: process.env.WIKI_CONTENT_PATH || './public/content',

  // Configuration file - wiki-config.json location
  configFile: process.env.WIKI_CONFIG_FILE || './public/wiki-config.json',

  // Public directory - static assets
  publicPath: process.env.WIKI_PUBLIC_PATH || './public',

  // Base URL for the wiki (used in Vite config)
  baseUrl: process.env.WIKI_BASE_URL || '/wiki/',
};

/**
 * Get content path for runtime (browser)
 * This is the URL path where content is served
 */
export function getContentUrl() {
  // In development, Vite serves from public/
  // In production, content should be in the build output
  return import.meta.env.BASE_URL + 'content/';
}

/**
 * Get config file URL for runtime (browser)
 */
export function getConfigUrl() {
  return import.meta.env.BASE_URL + 'wiki-config.json';
}

/**
 * Get search index URL for runtime (browser)
 */
export function getSearchIndexUrl() {
  return import.meta.env.BASE_URL + 'search-index.json';
}
