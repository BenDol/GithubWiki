import { getFileContent } from './content';
import { getItem, setItem, removeItem, getKeys } from '../../utils/storageManager';
import matter from 'gray-matter';
import { createLogger } from '../../utils/logger';

const logger = createLogger('DynamicPageLoader');

/**
 * Dynamic Page Loader Service
 *
 * Loads markdown pages from GitHub repository with localStorage caching.
 * Hierarchy: cache → GitHub → static fallback → error
 */

// Constants
const CACHE_KEY_PREFIX = 'slayerwiki:dynamic-pages';
const CACHE_VERSION = '1.0';
const MAX_CACHE_ENTRIES = 200;
const DEFAULT_CACHE_TTL = 5 * 60 * 1000; // 5 minutes
const STALE_CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

/**
 * Build cache key for a page
 * @param {string} sectionId - Section ID
 * @param {string} pageId - Page ID
 * @returns {string} Cache key
 */
function buildCacheKey(sectionId, pageId) {
  return `${CACHE_KEY_PREFIX}:${sectionId}:${pageId}`;
}

/**
 * Get all dynamic page cache keys
 * @returns {string[]} Array of cache keys
 */
function getAllCacheKeys() {
  return getKeys(`${CACHE_KEY_PREFIX}:*`);
}

/**
 * Check if dynamic loading should be used
 * @param {Object} config - Wiki configuration
 * @returns {boolean} True if dynamic loading enabled
 */
export function shouldUseDynamicLoading(config) {
  return config?.features?.dynamicPageLoading?.enabled === true;
}

/**
 * Get cache entry from localStorage
 * @param {string} sectionId - Section ID
 * @param {string} pageId - Page ID
 * @param {boolean} allowStale - Allow expired cache (for rate limit fallback)
 * @param {number} ttl - Cache TTL in milliseconds
 * @returns {Object|null} Cache entry or null
 */
function getCacheEntry(sectionId, pageId, allowStale = false, ttl = DEFAULT_CACHE_TTL) {
  const key = buildCacheKey(sectionId, pageId);
  const entry = getItem(key);

  if (!entry) {
    return null;
  }

  // Validate cache entry schema
  if (!entry.content || !entry.metadata || !entry.cachedAt || entry.version !== CACHE_VERSION) {
    logger.warn('Invalid cache entry, removing', { sectionId, pageId });
    removeItem(key);
    return null;
  }

  const age = Date.now() - entry.cachedAt;

  // Check if cache is fresh
  if (age < ttl) {
    logger.debug('Cache hit (fresh)', { sectionId, pageId, age });
    return entry;
  }

  // Check if stale cache is allowed (for rate limit fallback)
  if (allowStale && age < STALE_CACHE_TTL) {
    logger.debug('Cache hit (stale)', { sectionId, pageId, age });
    return entry;
  }

  // Cache expired
  logger.debug('Cache expired', { sectionId, pageId, age });
  return null;
}

/**
 * Set cache entry in localStorage with LRU eviction
 * @param {string} sectionId - Section ID
 * @param {string} pageId - Page ID
 * @param {Object} entry - Cache entry data
 */
function setCacheEntry(sectionId, pageId, entry) {
  const key = buildCacheKey(sectionId, pageId);

  // Check if we need to evict entries (LRU)
  const allKeys = getAllCacheKeys();
  if (allKeys.length >= MAX_CACHE_ENTRIES) {
    logger.debug('Cache full, evicting oldest entries', { count: allKeys.length });

    // Get all entries with timestamps
    const entries = allKeys.map(k => {
      const e = getItem(k);
      return { key: k, cachedAt: e?.cachedAt || 0 };
    });

    // Sort by age (oldest first)
    entries.sort((a, b) => a.cachedAt - b.cachedAt);

    // Remove oldest 20% to make room
    const toRemove = Math.ceil(MAX_CACHE_ENTRIES * 0.2);
    for (let i = 0; i < toRemove; i++) {
      removeItem(entries[i].key);
      logger.trace('Evicted cache entry', { key: entries[i].key });
    }
  }

  // Store entry
  setItem(key, {
    ...entry,
    version: CACHE_VERSION,
    cachedAt: Date.now(),
  });

  logger.debug('Cache entry stored', { sectionId, pageId });
}

/**
 * Invalidate cache after page edit
 * @param {string} sectionId - Section ID
 * @param {string} pageId - Page ID
 * @param {string|null} commitSha - Commit SHA (for cache busting)
 */
export function invalidatePageCache(sectionId, pageId, commitSha = null) {
  const key = buildCacheKey(sectionId, pageId);
  removeItem(key);

  // Store the commit SHA for next fetch to bypass GitHub CDN cache
  if (commitSha) {
    const shaKey = `${key}:latest-sha`;
    setItem(shaKey, { sha: commitSha, timestamp: Date.now() });
    logger.info('Page cache invalidated with commit SHA', { sectionId, pageId, commitSha });
  } else {
    logger.info('Page cache invalidated', { sectionId, pageId });
  }
}

/**
 * Get the latest commit SHA for a page (if available from recent edit)
 * @param {string} sectionId - Section ID
 * @param {string} pageId - Page ID
 * @returns {string|null} Commit SHA or null
 */
function getLatestCommitSha(sectionId, pageId) {
  const key = buildCacheKey(sectionId, pageId);
  const shaKey = `${key}:latest-sha`;
  const shaData = getItem(shaKey);

  // Only use SHA if it's less than 5 minutes old (fresh edit)
  if (shaData && (Date.now() - shaData.timestamp) < 5 * 60 * 1000) {
    return shaData.sha;
  }

  // Clean up expired SHA
  if (shaData) {
    removeItem(shaKey);
  }

  return null;
}

/**
 * Load page content from static bundled file
 * @param {string} sectionId - Section ID
 * @param {string} pageId - Page ID
 * @returns {Promise<Object>} Page data
 */
async function loadStaticFile(sectionId, pageId) {
  try {
    const baseUrl = import.meta.env.BASE_URL || '/';
    const url = `${baseUrl}content/${sectionId}/${pageId}.md`;

    logger.debug('Loading static file', { sectionId, pageId, url });

    const response = await fetch(url);
    if (!response.ok) {
      throw new Error(`Static file not found: ${response.status}`);
    }

    const rawContent = await response.text();

    // Parse frontmatter
    const { data: metadata, content } = matter(rawContent);

    return {
      content,
      metadata,
      sha: null,
      commitSha: null,
      source: 'static',
    };
  } catch (error) {
    logger.error('Failed to load static file', { sectionId, pageId, error });
    return null;
  }
}

/**
 * Load page from GitHub or cache
 * @param {string} sectionId - Section ID
 * @param {string} pageId - Page ID
 * @param {Object} config - Wiki configuration
 * @param {string} branch - Branch name (default: 'main')
 * @param {boolean} bustCache - Force fresh fetch (default: false)
 * @returns {Promise<Object>} Page data with content, metadata, sha, commitSha, source, warning?
 */
export async function loadDynamicPage(sectionId, pageId, config, branch = 'main', bustCache = false) {
  try {
    // Check if feature enabled
    if (!shouldUseDynamicLoading(config)) {
      throw new Error('Dynamic page loading not enabled');
    }

    const cacheTTL = config.features.dynamicPageLoading.cacheTTL || DEFAULT_CACHE_TTL;
    const fallbackToStatic = config.features.dynamicPageLoading.fallbackToStatic !== false;
    const allowStaleOnRateLimit = config.features.dynamicPageLoading.allowStaleOnRateLimit !== false;

    // Try cache (unless busting)
    if (!bustCache) {
      const cached = getCacheEntry(sectionId, pageId, false, cacheTTL);
      if (cached) {
        return {
          content: cached.content,
          metadata: cached.metadata,
          sha: cached.sha,
          commitSha: cached.commitSha,
          source: 'cache',
        };
      }
    }

    // Fetch from GitHub
    const { owner, repo } = config.wiki.repository;
    const path = `public/content/${sectionId}/${pageId}.md`;

    // Check if we have a fresh commit SHA to bypass GitHub CDN cache
    const latestSha = getLatestCommitSha(sectionId, pageId);
    const refToFetch = latestSha || branch;

    if (latestSha) {
      logger.debug('Fetching from GitHub using commit SHA', {
        sectionId, pageId, owner, repo, path, commitSha: latestSha
      });
    } else {
      logger.debug('Fetching from GitHub using branch', {
        sectionId, pageId, owner, repo, path, branch
      });
    }

    const fileData = await getFileContent(owner, repo, path, refToFetch, bustCache);

    if (!fileData) {
      throw new Error('Page not found on GitHub');
    }

    // Parse frontmatter
    const { data: metadata, content } = matter(fileData.content);

    const result = {
      content,
      metadata,
      sha: fileData.sha,
      commitSha: branch, // Store the ref used for fetching
      source: 'github',
    };

    // Cache the result
    setCacheEntry(sectionId, pageId, result);

    logger.info('Page loaded from GitHub', { sectionId, pageId, sha: fileData.sha });

    return result;

  } catch (error) {
    logger.error('Failed to load dynamic page', { sectionId, pageId, error });

    // Handle rate limiting
    if (error.status === 403 || error.status === 429) {
      logger.warn('GitHub rate limit reached', { sectionId, pageId });

      // Try stale cache
      if (config.features.dynamicPageLoading.allowStaleOnRateLimit !== false) {
        const staleEntry = getCacheEntry(sectionId, pageId, true);
        if (staleEntry) {
          logger.info('Using stale cache due to rate limit', { sectionId, pageId });
          return {
            content: staleEntry.content,
            metadata: staleEntry.metadata,
            sha: staleEntry.sha,
            commitSha: staleEntry.commitSha,
            source: 'cache-stale',
            warning: 'rate-limited',
          };
        }
      }
    }

    // Fall back to static bundled file
    if (config.features.dynamicPageLoading.fallbackToStatic !== false) {
      logger.info('Falling back to static file', { sectionId, pageId });
      const staticResult = await loadStaticFile(sectionId, pageId);
      if (staticResult) {
        return {
          ...staticResult,
          warning: 'github-unavailable',
        };
      }
    }

    // No fallback worked
    throw error;
  }
}

/**
 * Cleanup expired cache entries
 * Should be called on app boot
 */
export function cleanupExpiredCache() {
  try {
    const allKeys = getAllCacheKeys();
    let removed = 0;

    for (const key of allKeys) {
      const entry = getItem(key);

      // Remove if invalid or expired beyond stale TTL
      if (!entry || !entry.cachedAt || entry.version !== CACHE_VERSION) {
        removeItem(key);
        removed++;
        continue;
      }

      const age = Date.now() - entry.cachedAt;
      if (age > STALE_CACHE_TTL) {
        removeItem(key);
        removed++;
      }
    }

    if (removed > 0) {
      logger.info('Cleaned up expired cache entries', { removed, total: allKeys.length });
    }
  } catch (error) {
    logger.error('Failed to cleanup cache', { error });
  }
}

/**
 * Get cache statistics for debugging
 * @returns {Object} Cache stats
 */
export function getCacheStats() {
  try {
    const allKeys = getAllCacheKeys();
    let totalSize = 0;
    let freshCount = 0;
    let staleCount = 0;

    for (const key of allKeys) {
      const entry = getItem(key);
      if (!entry) continue;

      // Estimate size
      const entrySize = JSON.stringify(entry).length;
      totalSize += entrySize;

      // Count fresh vs stale
      const age = Date.now() - entry.cachedAt;
      if (age < DEFAULT_CACHE_TTL) {
        freshCount++;
      } else if (age < STALE_CACHE_TTL) {
        staleCount++;
      }
    }

    return {
      entries: allKeys.length,
      fresh: freshCount,
      stale: staleCount,
      expired: allKeys.length - freshCount - staleCount,
      sizeBytes: totalSize,
      maxEntries: MAX_CACHE_ENTRIES,
    };
  } catch (error) {
    logger.error('Failed to get cache stats', { error });
    return {
      entries: 0,
      fresh: 0,
      stale: 0,
      expired: 0,
      sizeBytes: 0,
      maxEntries: MAX_CACHE_ENTRIES,
    };
  }
}
