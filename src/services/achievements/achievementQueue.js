/**
 * Achievement Queue Service
 * Handles targeted achievement checking with retry logic
 */

import { createLogger } from '../../utils/logger.js';
import { callBotService } from '../github/botService.js';
import { achievementService } from './achievementService.js';
import { eventBus, EventNames } from '../eventBus.js';
import { useConfigStore } from '../../store/configStore.js';

const logger = createLogger('AchievementQueue');

// Queue of pending achievement checks
const queue = new Map(); // achievementId => { retries, timeout, options }

/**
 * Sleep helper
 */
function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Queue a targeted achievement check
 *
 * @param {string} achievementId - ID of achievement to check
 * @param {Object} options - Configuration options
 * @param {number} options.delay - Initial delay before checking (ms) [default: 5000]
 * @param {number} options.retryDelay - Delay between retries (ms) [default: 10000]
 * @param {number} options.maxRetries - Maximum retry attempts [default: 3]
 * @param {string} options.owner - Repository owner
 * @param {string} options.repo - Repository name
 * @param {number} options.userId - User ID
 * @param {string} options.username - Username
 * @returns {Promise<boolean>} True if unlocked, false otherwise
 */
export async function queueAchievementCheck(achievementId, options = {}) {
  const config = useConfigStore.getState().config;
  const achievementConfig = config?.features?.achievements;

  // Check if achievements are enabled
  if (achievementConfig?.enabled === false) {
    logger.debug('Achievements disabled, skipping queue', { achievementId });
    return false;
  }

  const {
    delay = 5000,
    retryDelay = 10000,
    maxRetries = 3,
    owner = config?.repo?.owner,
    repo = config?.repo?.name,
    userId,
    username,
    retries = 0,
  } = options;

  // Validation
  if (!owner || !repo) {
    logger.error('Missing owner or repo', { achievementId, owner, repo });
    return false;
  }

  if (!userId || !username) {
    logger.error('Missing userId or username', { achievementId, userId, username });
    return false;
  }

  // Check if already in queue
  if (queue.has(achievementId)) {
    logger.debug('Achievement already in queue', { achievementId });
    return false;
  }

  console.log('[AchievementQueue] Queuing achievement check', {
    achievementId,
    delay,
    retries,
    maxRetries,
  });

  try {
    // Skip local check - let server handle it to avoid rate limits
    // The server will check if already unlocked and return alreadyHas: true

    // Wait for initial delay (allows time for GitHub API to sync)
    const timeout = setTimeout(async () => {
      queue.delete(achievementId); // Remove from queue before processing

      try {
        // 3. Get user token using auth store's getToken() method
        let userToken = null;
        if (typeof window !== 'undefined' && window.__authStore__?.getState) {
          const authStore = window.__authStore__;
          const authState = authStore.getState();

          if (authState?.isAuthenticated) {
            // Try to get token via the getToken() method
            if (typeof authState.getToken === 'function') {
              userToken = authState.getToken();
            }

            // Fallback: If getToken didn't work, try manual decryption
            if (!userToken && authState.token) {
              const { decryptToken } = await import('../github/auth.js');
              userToken = decryptToken(authState.token);
            }
          }
        }

        // Skip silently if no token (stale session is handled by authStore on mount)
        if (!userToken) {
          logger.debug('No auth token available - skipping achievement check', { achievementId });
          return;
        }

        // 4. Call server to check single achievement
        console.log('[AchievementQueue] Calling server to check achievement', { achievementId, retries });

        const response = await callBotService('check-single-achievement', {
          owner,
          repo,
          achievementId,
        }, userToken);

        if (response.unlocked) {
          // Achievement unlocked!
          console.log('[AchievementQueue] Achievement unlocked!', {
            achievementId,
            achievement: response.achievement
          });

          // Always emit event for UI updates (cards, stats, etc.)
          eventBus.emit(EventNames.ACHIEVEMENTS_UNLOCKED, {
            achievements: [response.achievement],
            userId,
            username,
          });

          logger.info('Achievement unlocked via queue', {
            achievementId,
            retries,
          });

          return true;

        } else if (response.alreadyHas) {
          // Already unlocked (server confirmed)
          console.log('[AchievementQueue] Achievement already unlocked on server', { achievementId });
          return false;

        } else {
          // Not unlocked yet - maybe data hasn't synced
          console.log('[AchievementQueue] Achievement not unlocked yet', {
            achievementId,
            retries,
            maxRetries,
            message: response.message
          });

          // Retry if we have retries left
          if (retries < maxRetries) {
            console.log('[AchievementQueue] Retrying after delay', {
              achievementId,
              retryDelay,
              retries: retries + 1,
            });

            // Queue retry
            await sleep(500); // Small gap before retry
            return await queueAchievementCheck(achievementId, {
              ...options,
              delay: retryDelay,
              retries: retries + 1,
            });
          } else {
            logger.warn('Achievement check exhausted retries', {
              achievementId,
              maxRetries,
            });
            return false;
          }
        }

      } catch (error) {
        console.error('[AchievementQueue] Error checking achievement', {
          achievementId,
          error: error.message,
        });

        // Retry on error if we have retries left
        if (retries < maxRetries) {
          console.log('[AchievementQueue] Retrying after error', {
            achievementId,
            retryDelay,
            retries: retries + 1,
          });

          await sleep(500);
          return await queueAchievementCheck(achievementId, {
            ...options,
            delay: retryDelay,
            retries: retries + 1,
          });
        } else {
          logger.error('Achievement check failed after retries', {
            achievementId,
            error: error.message,
            maxRetries,
          });
          return false;
        }
      }
    }, delay);

    // Store in queue
    queue.set(achievementId, { timeout, retries, options });

    return true; // Successfully queued

  } catch (error) {
    console.error('[AchievementQueue] Failed to queue achievement check', {
      achievementId,
      error: error.message,
    });
    queue.delete(achievementId);
    return false;
  }
}

/**
 * Cancel a queued achievement check
 * @param {string} achievementId - ID of achievement to cancel
 */
export function cancelAchievementCheck(achievementId) {
  const queued = queue.get(achievementId);
  if (queued) {
    clearTimeout(queued.timeout);
    queue.delete(achievementId);
    console.log('[AchievementQueue] Cancelled queued check', { achievementId });
    return true;
  }
  return false;
}

/**
 * Clear all queued checks
 */
export function clearQueue() {
  for (const [achievementId, queued] of queue.entries()) {
    clearTimeout(queued.timeout);
  }
  queue.clear();
  console.log('[AchievementQueue] Cleared all queued checks');
}

/**
 * Get queue status
 */
export function getQueueStatus() {
  return {
    pending: queue.size,
    achievements: Array.from(queue.keys()),
  };
}
