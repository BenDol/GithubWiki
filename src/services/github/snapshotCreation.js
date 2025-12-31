import { createLogger } from '../../utils/logger.js';
import { getGithubBotEndpoint } from '../../utils/apiEndpoints.js';

const logger = createLogger('SnapshotCreation');

// Cache key prefix for localStorage
const CACHE_KEY_PREFIX = 'snapshot-creation-';
const CACHE_TTL_MS = 60 * 60 * 1000; // 1 hour

/**
 * Check if we recently attempted to create a snapshot for this user
 * @param {number} userId - GitHub user ID
 * @returns {Object|null} Cache data if exists and not expired, null otherwise
 */
function getCachedCreationAttempt(userId) {
  const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
  const cachedStr = localStorage.getItem(cacheKey);

  if (!cachedStr) {
    return null;
  }

  try {
    const cached = JSON.parse(cachedStr);
    const age = Date.now() - cached.timestamp;

    if (age < CACHE_TTL_MS) {
      logger.debug('Found cached snapshot creation attempt', { userId, ageMinutes: (age / 1000 / 60).toFixed(1) });
      return cached;
    } else {
      // Cache expired, remove it
      localStorage.removeItem(cacheKey);
      logger.debug('Cached snapshot creation attempt expired', { userId });
      return null;
    }
  } catch (err) {
    logger.warn('Failed to parse cached snapshot creation', { error: err.message });
    localStorage.removeItem(cacheKey);
    return null;
  }
}

/**
 * Store snapshot creation attempt in cache
 * @param {number} userId - GitHub user ID
 * @param {Object} data - Data to cache
 */
function setCachedCreationAttempt(userId, data) {
  const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
  const cacheData = {
    ...data,
    timestamp: Date.now()
  };

  try {
    localStorage.setItem(cacheKey, JSON.stringify(cacheData));
    logger.debug('Cached snapshot creation attempt', { userId });
  } catch (err) {
    logger.warn('Failed to cache snapshot creation', { error: err.message });
  }
}

/**
 * Trigger automatic snapshot creation for a user
 * Uses persistent caching to avoid repeated API calls
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} userId - GitHub user ID (for caching)
 * @returns {Promise<Object>} Result object with status
 */
export async function triggerSnapshotCreation(owner, repo, username, userId) {
  logger.info('Triggering snapshot creation', { username, userId });

  // Check cache first to avoid repeated API calls
  const cached = getCachedCreationAttempt(userId);
  if (cached) {
    if (cached.status === 'creating') {
      logger.info('Snapshot creation already in progress', { username });
      return {
        status: 'in_progress',
        message: 'Snapshot creation already in progress',
        cached: true
      };
    } else if (cached.status === 'created') {
      logger.info('Snapshot recently created', { username });
      return {
        status: 'exists',
        message: 'Snapshot was recently created',
        cached: true,
        snapshot: cached.snapshot
      };
    } else if (cached.status === 'failed') {
      // Allow retry if it failed
      logger.info('Previous snapshot creation failed, retrying', { username });
    }
  }

  // Mark as creating in cache
  setCachedCreationAttempt(userId, {
    status: 'creating',
    username
  });

  try {
    const endpoint = getGithubBotEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create-user-snapshot',
        owner,
        repo,
        username,
        userId
      }),
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `HTTP ${response.status}`);
    }

    const data = await response.json();

    if (data.alreadyExists) {
      logger.info('Snapshot already exists', { username });
      setCachedCreationAttempt(userId, {
        status: 'created',
        username,
        snapshot: data.snapshot
      });
      return {
        status: 'exists',
        message: 'Snapshot already exists',
        snapshot: data.snapshot,
        ageInMinutes: data.ageInMinutes
      };
    } else if (data.skipped) {
      logger.info('Snapshot creation skipped', { username, reason: data.reason });
      setCachedCreationAttempt(userId, {
        status: 'skipped',
        username,
        reason: data.reason
      });
      return {
        status: 'skipped',
        message: data.reason
      };
    } else if (data.created || data.updated) {
      logger.info('Snapshot created successfully', { username, created: data.created, updated: data.updated });
      setCachedCreationAttempt(userId, {
        status: 'created',
        username,
        snapshot: data.snapshot
      });
      return {
        status: 'created',
        message: data.created ? 'Snapshot created successfully' : 'Snapshot updated successfully',
        snapshot: data.snapshot,
        issueNumber: data.issueNumber,
        issueUrl: data.issueUrl
      };
    }

    return {
      status: 'unknown',
      message: 'Unknown response from server'
    };

  } catch (error) {
    logger.error('Failed to trigger snapshot creation', { username, error: error.message });

    // Cache the failure (allows retry after cache expires)
    setCachedCreationAttempt(userId, {
      status: 'failed',
      username,
      error: error.message
    });

    throw error;
  }
}

/**
 * Clear the cached creation attempt for a user
 * Useful when you want to force a retry
 * @param {number} userId - GitHub user ID
 */
export function clearSnapshotCreationCache(userId) {
  const cacheKey = `${CACHE_KEY_PREFIX}${userId}`;
  localStorage.removeItem(cacheKey);
  logger.debug('Cleared snapshot creation cache', { userId });
}
