/**
 * Client-side Achievement Checker
 *
 * Calls server-side achievement checking endpoint
 * All data retrieval and processing happens on the server
 */

import { createLogger } from '../../utils/logger.js';
import { callBotService } from '../github/botService.js';
import { getOctokit } from '../github/api.js';
import { eventBus, EventNames } from '../eventBus.js';
import { useConfigStore } from '../../store/configStore.js';

const logger = createLogger('AchievementChecker');

// Debounce map to prevent excessive checks
const checkCooldowns = new Map();
const DEFAULT_COOLDOWN_MS = 30000; // 30 seconds between checks per user

// Track if already initialized to prevent duplicate listeners
let isInitialized = false;

/**
 * Get achievement configuration from wiki-config
 */
function getAchievementConfig() {
  const configStore = useConfigStore.getState();
  const config = configStore.config?.features?.achievements;

  // Default config if not specified
  return {
    enabled: config?.enabled ?? true,
    checking: {
      checkOnLogin: config?.checking?.checkOnLogin ?? true,
      checkOnSnapshotUpdate: config?.checking?.checkOnSnapshotUpdate ?? true,
      checkOnBuildSave: config?.checking?.checkOnBuildSave ?? false,
      checkOnLoadoutSave: config?.checking?.checkOnLoadoutSave ?? false,
      autoCheckInterval: config?.checking?.autoCheckInterval ?? 0,
    },
    limits: {
      maxChecksPerHour: config?.limits?.maxChecksPerHour ?? 10,
      maxDeciderExecutionTime: config?.limits?.maxDeciderExecutionTime ?? 5000,
    },
    notifications: {
      enabled: config?.notifications?.enabled ?? true,
    },
    debug: {
      enabled: config?.debug?.enabled ?? false,
      logChecks: config?.debug?.logChecks ?? false,
    },
  };
}

/**
 * Calculate cooldown in milliseconds based on rate limit
 */
function getCooldownMs() {
  const config = getAchievementConfig();
  const maxChecksPerHour = config.limits.maxChecksPerHour;

  if (maxChecksPerHour <= 0) return DEFAULT_COOLDOWN_MS;

  // Calculate cooldown: 1 hour / max checks = ms between checks
  return Math.floor((60 * 60 * 1000) / maxChecksPerHour);
}

/**
 * Check achievements for current user (calls server-side endpoint)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} userId - User ID
 * @param {string} username - Username
 * @returns {Promise<{checked: boolean, newlyUnlocked: Array, totalAchievements: number}>}
 */
export async function checkUserAchievements(owner, repo, userId, username) {
  const config = getAchievementConfig();

  // Check if achievements are enabled
  if (!config.enabled) {
    if (config.debug.logChecks) {
      logger.debug('Achievements disabled, skipping check');
    }
    return { checked: false, newlyUnlocked: [], totalAchievements: 0 };
  }

  // Check cooldown
  const cooldownKey = `${userId}`;
  const lastCheck = checkCooldowns.get(cooldownKey);
  const now = Date.now();
  const cooldownMs = getCooldownMs();

  if (lastCheck && (now - lastCheck) < cooldownMs) {
    const remaining = Math.ceil((cooldownMs - (now - lastCheck)) / 1000);
    if (config.debug.logChecks) {
      logger.trace('Achievement check on cooldown', { userId, remainingSeconds: remaining });
    }
    return { checked: false, newlyUnlocked: [], totalAchievements: 0 };
  }

  try {
    if (config.debug.logChecks) {
      logger.debug('Checking achievements server-side', { userId, username });
    }

    // Get user token from auth store
    let userToken = null;
    if (typeof window !== 'undefined' && window.__authStore__?.getState) {
      try {
        const authState = window.__authStore__.getState();
        if (authState?.token && authState?.isAuthenticated) {
          // Token is stored encrypted - decrypt it
          const { decryptToken } = await import('../github/auth.js');
          userToken = decryptToken(authState.token);
        }
      } catch (error) {
        logger.error('Failed to get auth token from store', { error });
      }
    }

    if (!userToken) {
      logger.warn('No auth token available, skipping achievement check');
      return { checked: false, newlyUnlocked: [], totalAchievements: 0 };
    }

    // Call server-side endpoint
    const response = await callBotService('check-achievements', {
      owner,
      repo,
    }, userToken);

    if (response.checked && response.newlyUnlocked?.length > 0) {
      logger.info('Achievements unlocked', { count: response.newlyUnlocked.length });

      // Emit event for toast notification (if notifications enabled)
      if (config.notifications.enabled) {
        eventBus.emit(EventNames.ACHIEVEMENTS_UNLOCKED, {
          achievements: response.newlyUnlocked,
          userId,
          username,
        });
      }
    }

    // Update cooldown
    checkCooldowns.set(cooldownKey, now);

    return response;
  } catch (error) {
    logger.error('Failed to check achievements', { error: error.message });
    return { checked: false, newlyUnlocked: [], totalAchievements: 0 };
  }
}

/**
 * Initialize achievement checking on login
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 */
export function initializeAchievementChecker(owner, repo) {
  const config = getAchievementConfig();

  // Skip initialization if achievements are disabled
  if (!config.enabled) {
    logger.debug('Achievements disabled, skipping initialization');
    return;
  }

  // Skip if already initialized to prevent duplicate listeners
  if (isInitialized) {
    logger.debug('Achievement checker already initialized, skipping');
    return;
  }

  logger.debug('Initializing achievement checker', { owner, repo });
  isInitialized = true;

  // Check achievements on login (if enabled in config)
  if (config.checking.checkOnLogin) {
    eventBus.on(EventNames.USER_LOGIN, async ({ user }) => {
      if (!user?.id || !user?.login) return;

      if (config.debug.logChecks) {
        logger.debug('User logged in, checking achievements', { userId: user.id, username: user.login });
      }

      // Wait a bit for user snapshot to be created/updated
      setTimeout(async () => {
        await checkUserAchievements(owner, repo, user.id, user.login);
      }, 2000);
    });
  }

  // Check achievements when user saves builds (if enabled in config)
  if (config.checking.checkOnBuildSave) {
    eventBus.on(EventNames.USER_BUILD_SAVED, async ({ userId, username }) => {
      if (!userId || !username) return;

      if (config.debug.logChecks) {
        logger.debug('User saved build, checking achievements', { userId, username });
      }

      // Wait a bit for data to be persisted
      setTimeout(async () => {
        await checkUserAchievements(owner, repo, userId, username);
      }, 1000);
    });
  }

  // Check achievements when user saves loadouts (if enabled in config)
  if (config.checking.checkOnLoadoutSave) {
    eventBus.on(EventNames.USER_LOADOUT_SAVED, async ({ userId, username }) => {
      if (!userId || !username) return;

      if (config.debug.logChecks) {
        logger.debug('User saved loadout, checking achievements', { userId, username });
      }

      // Wait a bit for data to be persisted
      setTimeout(async () => {
        await checkUserAchievements(owner, repo, userId, username);
      }, 1000);
    });
  }

  // Check achievements on snapshot updates (if enabled in config)
  if (config.checking.checkOnSnapshotUpdate) {
    eventBus.on(EventNames.USER_SNAPSHOT_UPDATED, async ({ userId, username }) => {
      if (!userId || !username) return;

      if (config.debug.logChecks) {
        logger.debug('User snapshot updated, checking achievements', { userId, username });
      }

      // Wait a bit for snapshot to be persisted
      setTimeout(async () => {
        await checkUserAchievements(owner, repo, userId, username);
      }, 1000);
    });
  }

  logger.info('Achievement checker initialized', {
    owner,
    repo,
    checkOnLogin: config.checking.checkOnLogin,
    checkOnBuildSave: config.checking.checkOnBuildSave,
    checkOnLoadoutSave: config.checking.checkOnLoadoutSave,
    checkOnSnapshotUpdate: config.checking.checkOnSnapshotUpdate,
  });
}

/**
 * Stop achievement checking (for cleanup)
 */
export function stopAchievementChecker() {
  // Clear all listeners for achievement-related events
  eventBus.clear(EventNames.USER_LOGIN);
  eventBus.clear(EventNames.USER_BUILD_SAVED);
  eventBus.clear(EventNames.USER_LOADOUT_SAVED);
  eventBus.clear(EventNames.USER_SNAPSHOT_UPDATED);
  checkCooldowns.clear();
  isInitialized = false;
  logger.debug('Achievement checker stopped');
}
