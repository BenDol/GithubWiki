/**
 * Storage Migration Utility
 * Migrates old localStorage keys to new standardized format
 *
 * Parent projects can register their own migrations via registerMigrations()
 */

import { getAllKeys, getItem, setItem, removeItem } from './storageManager';

/**
 * Framework-only migrations (wiki-specific, not game-specific)
 */
const frameworkMigrations = [
  // Config keys
  {
    name: 'wiki-auth-storage',
    matcher: (key) => key === 'wiki-auth-storage',
    migrator: (key) => 'config:wiki_auth',
  },
  {
    name: 'wiki-ui-storage',
    matcher: (key) => key === 'wiki-ui-storage',
    migrator: (key) => 'config:wiki_ui',
  },
  {
    name: 'sidebarWidth',
    matcher: (key) => key === 'sidebarWidth',
    migrator: (key) => 'config:sidebar_width',
  },

  // Cache entries (all users)
  {
    name: 'contributor_highscore_cache',
    matcher: (key) => key === 'contributor_highscore_cache',
    migrator: (key) => 'cache:contributor_highscore',
  },
  {
    name: 'highscore_refresh_cooldown',
    matcher: (key) => key === 'highscore_refresh_cooldown',
    migrator: (key) => 'cache:highscore_refresh_cooldown',
  },
  {
    name: 'contributor_prestige_cache',
    matcher: (key) => key === 'contributor_prestige_cache',
    migrator: (key) => 'cache:contributor_prestige',
  },
  {
    name: 'dev-banner-dismissed',
    matcher: (key) => key === 'dev-banner-dismissed',
    migrator: (key) => 'cache:dev_banner_dismissed',
  },

  // Framework page editor (generic wiki feature)
  {
    name: 'page editor keys',
    matcher: (key) => /^page-editor:(.+)$/.test(key),
    migrator: (key) => {
      const match = key.match(/^page-editor:(.+)$/);
      if (!match) return key;

      const [, path] = match;
      // Needs user context, use 'anonymous' as fallback
      return `cache:anonymous:page_editor:${path}`;
    },
  },
  {
    name: 'recent PR keys',
    matcher: (key) => /^recent-pr:(.+)$/.test(key),
    migrator: (key) => {
      const match = key.match(/^recent-pr:(.+)$/);
      if (!match) return key;

      const [, path] = match;
      // Needs user context, use 'anonymous' as fallback
      return `cache:anonymous:recent_pr:${path}`;
    },
  },

  // Username-specific cache entries (generic prestige system)
  // NOTE: These migrate legacy keys to username-based format
  // The system now uses userId-based keys (cache:userId:prestige)
  // Old username-based keys will naturally expire via TTL and be replaced
  {
    name: 'prestige cache',
    matcher: (key) => /^prestige:(.+)$/.test(key),
    migrator: (key) => {
      const match = key.match(/^prestige:(.+)$/);
      if (!match) return key;

      const [, username] = match;
      return `cache:${username}:prestige`;
    },
  },

  // Ban check cache entries
  // NOTE: These migrate legacy keys to username-based format
  // The system now uses userId-based keys (cache:userId:ban_check_...)
  // Old username-based keys will naturally expire via TTL and be replaced
  {
    name: 'ban check cache',
    matcher: (key) => /^ban-check:(.+):(.+)$/.test(key),
    migrator: (key) => {
      const match = key.match(/^ban-check:(.+):(.+)$/);
      if (!match) return key;

      const [, username, repo] = match;
      const repoKey = repo.replace(/\//g, '_');
      return `cache:${username}:ban_check_${repoKey}`;
    },
  },

  // Email-specific cache entries (anonymous editing)
  {
    name: 'anon edit tokens',
    matcher: (key) => /^anon-edit-token-(.+)$/.test(key),
    migrator: (key) => {
      const match = key.match(/^anon-edit-token-(.+)$/);
      if (!match) return key;

      const [, email] = match;
      return `cache:${email}:anon_edit_token`;
    },
  },

  // Comment reactions (generic wiki feature)
  {
    name: 'wiki reactions',
    matcher: (key) => /^wiki-reactions:(.+)$/.test(key),
    migrator: (key) => {
      const match = key.match(/^wiki-reactions:(.+)$/);
      if (!match) return key;

      const [, commentId] = match;
      return `cache:reactions:${commentId}`;
    },
  },
];

/**
 * Registered migrations from parent project
 */
let registeredMigrations = [];

/**
 * Register migrations from parent project
 * @param {Array} migrations - Array of migration objects
 */
export const registerMigrations = (migrations) => {
  registeredMigrations = migrations;
  console.log(`[StorageMigration] Registered ${migrations.length} parent project migrations`);
};

/**
 * Get all migrations (framework + registered)
 * @returns {Array} Combined migrations
 */
const getAllMigrations = () => {
  return [...frameworkMigrations, ...registeredMigrations];
};

/**
 * Migrate a single key
 * @param {string} oldKey - Old storage key
 * @returns {Object} Migration result { migrated: boolean, newKey: string|null, error: string|null }
 */
export const migrateKey = (oldKey) => {
  try {
    // Find matching migration
    const migration = getAllMigrations().find(m => m.matcher(oldKey));

    if (!migration) {
      return { migrated: false, newKey: null, error: 'No migration found' };
    }

    // Get new key
    const newKey = migration.migrator(oldKey);

    if (newKey === oldKey) {
      return { migrated: false, newKey: null, error: 'Key unchanged' };
    }

    // Check if new key already exists
    if (localStorage.getItem(newKey) !== null) {
      console.warn(`[StorageMigration] New key "${newKey}" already exists, skipping migration for "${oldKey}"`);
      // Still remove old key to clean up
      removeItem(oldKey);
      return { migrated: true, newKey, error: null };
    }

    // Get old value
    const oldValue = localStorage.getItem(oldKey);

    if (oldValue === null) {
      return { migrated: false, newKey: null, error: 'Old key has no value' };
    }

    // Copy to new key
    localStorage.setItem(newKey, oldValue);

    // Remove old key
    removeItem(oldKey);

    console.log(`[StorageMigration] Migrated "${oldKey}" -> "${newKey}"`);

    return { migrated: true, newKey, error: null };
  } catch (error) {
    console.error(`[StorageMigration] Failed to migrate "${oldKey}":`, error);
    return { migrated: false, newKey: null, error: error.message };
  }
};

/**
 * Migrate all keys
 * @returns {Object} Migration stats
 */
export const migrateAll = () => {
  console.log('[StorageMigration] Starting migration...');

  const allKeys = getAllKeys();
  const stats = {
    total: allKeys.length,
    migrated: 0,
    skipped: 0,
    failed: 0,
    migrations: [],
  };

  allKeys.forEach(key => {
    const result = migrateKey(key);

    if (result.migrated) {
      stats.migrated++;
      stats.migrations.push({ oldKey: key, newKey: result.newKey });
    } else if (result.error) {
      if (result.error === 'No migration found') {
        stats.skipped++;
      } else {
        stats.failed++;
        console.error(`[StorageMigration] Failed to migrate "${key}": ${result.error}`);
      }
    }
  });

  console.log('[StorageMigration] Migration complete:', {
    total: stats.total,
    migrated: stats.migrated,
    skipped: stats.skipped,
    failed: stats.failed,
  });

  return stats;
};

/**
 * Check if migration is needed
 * @returns {boolean} True if any keys need migration
 */
export const needsMigration = () => {
  const allKeys = getAllKeys();

  return allKeys.some(key => {
    return getAllMigrations().some(m => m.matcher(key));
  });
};

/**
 * Get migration status
 * @returns {Object} Status with counts
 */
export const getMigrationStatus = () => {
  const allKeys = getAllKeys();
  const oldKeys = allKeys.filter(key =>
    getAllMigrations().some(m => m.matcher(key))
  );

  return {
    needsMigration: oldKeys.length > 0,
    oldKeysCount: oldKeys.length,
    oldKeys,
  };
};

export default {
  registerMigrations,
  migrateKey,
  migrateAll,
  needsMigration,
  getMigrationStatus,
};
