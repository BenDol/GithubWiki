/**
 * Version Manager
 * Handles version checking and cache purging on updates
 */

import { configName, getItem, setItem, removeItem, clearAllCaches, clearAllCachesExceptDrafts } from './storageManager';
import { migrateAll, needsMigration } from './storageMigration';
import { createLogger } from './logger.js';

const logger = createLogger('VersionManager');
const VERSION_KEY = configName('app_version');

/**
 * Get stored version
 * @returns {string|null} Stored version or null
 */
export const getStoredVersion = () => {
  const versionData = getItem(VERSION_KEY);
  return versionData?.version || null;
};

/**
 * Set stored version
 * @param {string} version - Version to store
 */
export const setStoredVersion = (version) => {
  setItem(VERSION_KEY, { version, updatedAt: new Date().toISOString() });
};

/**
 * Check if version has changed
 * @param {string} currentVersion - Current app version
 * @returns {boolean} True if version changed
 */
export const hasVersionChanged = (currentVersion) => {
  const storedVersion = getStoredVersion();

  if (!storedVersion) {
    // First run or version not stored yet
    return false;
  }

  return storedVersion !== currentVersion;
};

/**
 * Initialize version system on app load
 * @param {Object} config - Wiki config
 * @returns {Object} Initialization result
 */
export const initializeVersionSystem = async (config) => {
  const result = {
    migrationRan: false,
    cachesPurged: false,
    versionChanged: false,
    currentVersion: null,
    previousVersion: null,
  };

  try {
    // Get current version from config
    const currentVersion = config?.version?.commit || 'unknown';
    result.currentVersion = currentVersion;

    // Get stored version
    const storedVersion = getStoredVersion();
    result.previousVersion = storedVersion;

    // Check if this is first run
    const isFirstRun = !storedVersion;

    if (isFirstRun) {
      logger.info('First run detected');

      // Check if migration is needed
      if (needsMigration()) {
        logger.info('Running storage migration');
        const migrationStats = migrateAll();
        result.migrationRan = true;
        logger.info('Migration complete', migrationStats);
      }

      // Store current version
      setStoredVersion(currentVersion);

      return result;
    }

    // Check if version changed
    const versionChanged = hasVersionChanged(currentVersion);
    result.versionChanged = versionChanged;

    if (versionChanged) {
      logger.info('Version changed', {
        from: storedVersion,
        to: currentVersion,
      });

      // Check if we should force re-login
      const forceRelog = config?.features?.forceRelogOnUpdate ?? false;
      if (forceRelog) {
        logger.info('Force re-login enabled, clearing authentication');
        const authKey = configName('wiki_auth');
        removeItem(authKey);
        logger.info('Authentication cleared, user will need to re-login');
      }

      // Check if we should purge caches
      // VITE_PURGE_CLIENT_CACHE env var forces cache purge (set by commit message keyword)
      const forcePurge = import.meta.env.VITE_PURGE_CLIENT_CACHE === 'true';
      const configPurge = config?.features?.purgeClientCacheOnUpdate ?? false;
      const purgeCaches = forcePurge || configPurge;
      const preserveDrafts = config?.features?.preserveDraftsOnUpdate ?? true;

      if (purgeCaches) {
        if (forcePurge) {
          logger.info('Force purging caches (triggered by commit message)');
        } else {
          logger.info('Purging caches');
        }

        // Choose clearing strategy based on preserveDrafts option
        const purgedCount = preserveDrafts
          ? clearAllCachesExceptDrafts()
          : clearAllCaches();

        result.cachesPurged = true;

        if (preserveDrafts) {
          logger.info('Purged cache entries (drafts preserved)', { count: purgedCount });
        } else {
          logger.info('Purged cache entries (including drafts)', { count: purgedCount });
        }
      }

      // Store new version
      setStoredVersion(currentVersion);
    }

    return result;
  } catch (error) {
    logger.error('Initialization failed', { error });
    return result;
  }
};

/**
 * Get version info
 * @param {Object} config - Wiki config
 * @returns {Object} Version info
 */
export const getVersionInfo = (config) => {
  const currentVersion = config?.version?.commit || 'unknown';
  const storedVersion = getStoredVersion();
  const versionChanged = hasVersionChanged(currentVersion);

  return {
    current: currentVersion,
    stored: storedVersion,
    changed: versionChanged,
    isFirstRun: !storedVersion,
  };
};

/**
 * Force purge all caches (for manual/debug use)
 * @returns {number} Number of keys cleared
 */
export const forcePurgeCaches = () => {
  logger.info('Force purging all caches');
  const purgedCount = clearAllCaches();
  logger.info('Force purged cache entries', { count: purgedCount });
  return purgedCount;
};

/**
 * Reset version (for testing)
 */
export const resetVersion = () => {
  localStorage.removeItem(VERSION_KEY);
  logger.debug('Version reset');
};

export default {
  getStoredVersion,
  setStoredVersion,
  hasVersionChanged,
  initializeVersionSystem,
  getVersionInfo,
  forcePurgeCaches,
  resetVersion,
};
