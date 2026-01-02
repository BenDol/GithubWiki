/**
 * Image Path Resolver Utility
 *
 * Centralized helper for resolving image paths to CDN URLs.
 * Components must call this explicitly before rendering images.
 */

import { createLogger } from './logger';

const logger = createLogger('ImageResolver');

// Internal cache for config
let configCache = null;

/**
 * Synchronously resolve image path with cached config
 * @param {string} path - Relative image path (e.g., "icons/fire.png")
 * @returns {string} Resolved CDN URL or local path with /images/content/ prefix
 */
export function resolveImagePath(path) {
  if (!path) return '';

  // If already a full URL, return as-is
  if (path.startsWith('http://') || path.startsWith('https://')) {
    return path;
  }

  // Add /images/content/ prefix for local paths
  const normalizedPath = path.startsWith('/images/content/')
    ? path
    : `/images/content/${path.replace(/^\//, '')}`;

  // Check if config is cached
  if (!configCache) {
    logger.warn('Config not loaded yet, returning local path', { path: normalizedPath });
    return normalizedPath;
  }

  return buildCdnUrl(normalizedPath, configCache);
}

/**
 * Resolve multiple image paths at once
 * @param {Array<string>} paths - Array of image paths
 * @returns {Array<string>} Array of resolved URLs
 */
export function resolveImagePaths(paths) {
  return paths.map(resolveImagePath);
}

/**
 * Preload wiki config for synchronous resolution
 * Call this early in app lifecycle (e.g., main.jsx)
 */
export async function preloadImageConfig() {
  try {
    logger.info('Starting to preload image config...');
    const response = await fetch('/wiki-config.json');
    if (!response.ok) throw new Error(`Failed to load config: ${response.status}`);
    const config = await response.json();
    configCache = config;
    logger.info('Image config preloaded successfully', {
      cdnEnabled: config?.features?.gameAssets?.enabled,
      cdnProvider: config?.features?.gameAssets?.cdn?.provider
    });
    return config;
  } catch (err) {
    logger.error('Failed to preload image config', { error: err });
    return null;
  }
}

/**
 * Get the cached config (for testing/debugging)
 */
export function getCachedConfig() {
  return configCache;
}

/**
 * Build CDN URL from normalized path
 */
function buildCdnUrl(path, config) {
  if (!config?.features?.gameAssets?.enabled || !config.features.gameAssets.cdn) {
    return path; // CDN not configured, use local path
  }

  const cdn = config.features.gameAssets.cdn;
  if (cdn.provider !== 'github') {
    return path;
  }

  const { owner, repo, basePath, servingMode = 'jsdelivr', branch = 'main' } = cdn.github;
  const relativePath = path.replace('/images/content/', '');

  if (servingMode === 'jsdelivr') {
    return `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${basePath}/images/${relativePath}`;
  } else {
    return `https://raw.githubusercontent.com/${owner}/${repo}/${branch}/${basePath}/images/${relativePath}`;
  }
}
