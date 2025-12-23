/**
 * GitHub User Data Cache
 * Caches GitHub user API calls to prevent redundant requests
 */

import { getOctokit } from './api.js';
import { getCacheValue, setCacheValue } from '../../utils/timeCache.js';
import { cacheName } from '../../utils/storageManager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('UserCache');

// Cache TTL: 15 minutes (user data changes rarely)
const USER_CACHE_TTL = 15 * 60 * 1000;

/**
 * Fetch GitHub user data with caching
 * Caches for 15 minutes to prevent redundant API calls
 *
 * @param {string} username - GitHub username
 * @returns {Promise<Object>} User data from GitHub API
 * @throws {Error} If user not found or API error
 */
export async function getCachedUserData(username) {
  const normalizedUsername = username.toLowerCase();
  const cacheKey = cacheName('github_user', normalizedUsername);

  // Check cache first
  const cached = getCacheValue(cacheKey);
  if (cached) {
    logger.trace('User data cache hit', { username });
    return cached;
  }

  // Fetch from GitHub
  logger.debug('User data cache miss - fetching from GitHub', { username });
  const octokit = getOctokit();

  try {
    const { data: userData } = await octokit.rest.users.getByUsername({
      username,
    });

    // Cache for 15 minutes
    setCacheValue(cacheKey, userData, USER_CACHE_TTL);
    logger.debug('Cached user data', { username, id: userData.id });

    return userData;
  } catch (error) {
    logger.error('Failed to fetch user data', { username, error: error.message });
    throw error;
  }
}

/**
 * Get user ID from username (cached)
 * Convenience method that returns just the ID
 *
 * @param {string} username - GitHub username
 * @returns {Promise<number>} GitHub user ID
 * @throws {Error} If user not found
 */
export async function getCachedUserId(username) {
  const userData = await getCachedUserData(username);
  return userData.id;
}

/**
 * Prefetch user data for multiple users (batch optimization)
 * Useful when you know you'll need multiple users soon
 *
 * @param {string[]} usernames - Array of GitHub usernames
 * @returns {Promise<void>}
 */
export async function prefetchUsers(usernames) {
  if (!Array.isArray(usernames) || usernames.length === 0) return;

  logger.debug('Prefetching user data', { count: usernames.length });

  // Fetch all users in parallel (non-blocking)
  await Promise.allSettled(
    usernames.map(username => getCachedUserData(username))
  );
}
