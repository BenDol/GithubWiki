import { getOctokit } from './api';
import { cacheName } from '../../utils/storageManager';

/**
 * Contributor Prestige Service
 * DEPRECATED: Prestige data now comes from user snapshots.
 * This service is kept for backwards compatibility with existing prestige cache issues.
 */

const PRESTIGE_CACHE_ISSUE_TITLE = '[Cache] Contributor Prestige';
const PRESTIGE_CACHE_KEY = cacheName('contributor_prestige');

/**
 * Get the prestige cache issue
 * Returns null if user doesn't have permission to access issues
 */
async function getPrestigeCacheIssue(owner, repo) {
  const octokit = getOctokit();

  try {
    // Search for existing cache issue
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      labels: 'prestige-cache',
      per_page: 1,
    });

    if (issues.length > 0) {
      const cacheIssue = issues[0];
      // Security: Verify issue was created by github-actions or wiki bot
      const validCreators = ['github-actions[bot]', import.meta.env.VITE_WIKI_BOT_USERNAME];
      if (!validCreators.includes(cacheIssue.user.login)) {
        console.warn(`[Prestige] Security: Cache issue created by ${cacheIssue.user.login}, expected github-actions or bot`);
        return null;
      }
      return cacheIssue;
    }

    console.log('[Prestige] Cache issue not found - will be created by GitHub Action');
    return null;
  } catch (error) {
    if (error.status === 403 || error.status === 401) {
      console.warn('[Prestige] Cannot access cache issue (no permissions)');
      return null;
    }
    console.error('[Prestige] Failed to get cache issue:', error);
    throw error;
  }
}

/**
 * Parse prestige cache data from issue body
 */
function parseCacheData(issueBody) {
  try {
    return JSON.parse(issueBody);
  } catch (error) {
    console.error('[Prestige] Failed to parse cache data:', error);
    return null;
  }
}

/**
 * Check if cache is still valid
 */
function isCacheValid(lastUpdated, cacheHours = 24) {
  if (!lastUpdated) return false;

  const lastUpdate = new Date(lastUpdated);
  const now = new Date();
  const diffHours = (now - lastUpdate) / 1000 / 60 / 60;

  return diffHours < cacheHours;
}

/**
 * Get prestige data for all contributors with intelligent caching
 * 1. Check browser localStorage cache
 * 2. If expired, check GitHub issue cache
 * 3. If not available, return empty (wait for GitHub Action to populate)
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Object>} Prestige data map { username: { tier, badge, color, contributions, ... } }
 */
export async function getAllPrestigeData(owner, repo) {
  console.log('[Prestige] Fetching prestige data (cache: 4 hours)');

  // Step 1: Check browser localStorage cache (4 hour TTL)
  const localCache = localStorage.getItem(PRESTIGE_CACHE_KEY);
  if (localCache) {
    const localData = JSON.parse(localCache);
    if (isCacheValid(localData.lastUpdated, 4)) {
      console.log('[Prestige] Using browser cache (age: ' +
        Math.round((new Date() - new Date(localData.lastUpdated)) / 1000 / 60 / 60) + ' hours)');
      return localData.prestigeData || {};
    }
    console.log('[Prestige] Browser cache expired');
  }

  // Step 2: Check GitHub issue cache (4 hour TTL)
  const cacheIssue = await getPrestigeCacheIssue(owner, repo);

  if (cacheIssue) {
    const githubCacheData = parseCacheData(cacheIssue.body);

    if (githubCacheData && isCacheValid(githubCacheData.lastUpdated, 4)) {
      console.log('[Prestige] Using GitHub cache (age: ' +
        Math.round((new Date() - new Date(githubCacheData.lastUpdated)) / 1000 / 60 / 60) + ' hours)');

      // Update browser cache
      localStorage.setItem(PRESTIGE_CACHE_KEY, JSON.stringify(githubCacheData));
      return githubCacheData.prestigeData || {};
    }

    console.log('[Prestige] GitHub cache expired or invalid');
  } else {
    console.log('[Prestige] No GitHub cache available (will be created by daily GitHub Action)');
  }

  // Step 3: Return empty data (wait for GitHub Action to populate)
  console.log('[Prestige] No cached prestige data available - waiting for GitHub Action to run');
  return {};
}

/**
 * Get prestige data for a specific user
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @returns {Promise<Object|null>} Prestige data for user or null if not found
 */
export async function getUserPrestigeData(owner, repo, username) {
  const allPrestigeData = await getAllPrestigeData(owner, repo);
  return allPrestigeData[username] || null;
}

/**
 * Clear prestige cache (useful for testing or manual refresh)
 */
export function clearPrestigeCache() {
  console.log('[Prestige] Clearing prestige cache');
  localStorage.removeItem(PRESTIGE_CACHE_KEY);
}

/**
 * Get cached prestige data synchronously (without API call)
 * Returns null if not cached or expired (4 hour TTL)
 *
 * @param {string} username - GitHub username
 * @returns {Object|null} Cached prestige data or null
 */
export function getCachedPrestigeDataSync(username) {
  const localCache = localStorage.getItem(PRESTIGE_CACHE_KEY);
  if (!localCache) return null;

  try {
    const localData = JSON.parse(localCache);
    if (!isCacheValid(localData.lastUpdated, 4)) {
      return null;
    }

    const prestigeData = localData.prestigeData || {};
    return prestigeData[username] || null;
  } catch (error) {
    console.error('[Prestige] Failed to parse cached data:', error);
    return null;
  }
}
