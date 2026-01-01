import { getFileContent } from '../github/content';
import { getCached, setCached } from '../../utils/storageManager';
import { createLogger } from '../../utils/logger';

const logger = createLogger('DynamicSearchIndex');

/**
 * Dynamic Search Index Service
 *
 * Loads search index from GitHub repository with 1-hour cache.
 * Falls back to static bundled index if GitHub unavailable.
 */

const CACHE_KEY = 'search-index';
const CACHE_TTL = 60 * 60 * 1000; // 1 hour

/**
 * Load search index from GitHub or cache
 *
 * The search index is now checked into the repository and automatically
 * updated by GitHub Actions when content changes. This allows the sidebar
 * and search to reflect deletions within 1 hour, even without deployments.
 *
 * Falls back to static bundled index if GitHub unavailable.
 *
 * @param {Object} config - Wiki configuration
 * @returns {Promise<Object>} Search index data
 */
export async function loadSearchIndex(config) {
  try {
    // Check cache first
    const cached = getCached(CACHE_KEY, CACHE_TTL);
    if (cached) {
      logger.debug('Search index loaded from cache');
      return cached;
    }

    // Fetch from GitHub repository (updated by GitHub Actions)
    const { owner, repo } = config.wiki.repository;
    const branch = config.wiki.repository.branch || 'main';

    logger.debug('Fetching search index from GitHub', { owner, repo, branch });

    const fileData = await getFileContent(owner, repo, 'public/search-index.json', branch);

    if (!fileData) {
      throw new Error('Search index not found on GitHub');
    }

    const index = JSON.parse(fileData.content);

    // Cache for 1 hour
    setCached(CACHE_KEY, index);

    logger.info('Search index loaded from GitHub', { entries: index?.length || 0 });

    return index;

  } catch (error) {
    logger.warn('Failed to fetch search index from GitHub, using static', { error: error.message });

    // Fallback to bundled static index
    try {
      const baseUrl = import.meta.env.BASE_URL || '/';
      const url = `${baseUrl}search-index.json`;

      logger.debug('Loading static search index', { url });

      const response = await fetch(url);
      if (!response.ok) {
        throw new Error(`Failed to load static index: ${response.status}`);
      }

      const index = await response.json();

      logger.info('Search index loaded from static bundle', { entries: index?.length || 0 });

      return index;

    } catch (staticError) {
      logger.error('Failed to load search index from both GitHub and static', { error: staticError.message });
      // Return empty index as last resort
      return [];
    }
  }
}

/**
 * Clear search index cache
 * Useful when index needs to be refreshed immediately
 */
export function clearSearchIndexCache() {
  const { removeItem, StorageKeys } = require('../../utils/storageManager');
  removeItem(StorageKeys.cache(CACHE_KEY));
  logger.info('Search index cache cleared');
}
