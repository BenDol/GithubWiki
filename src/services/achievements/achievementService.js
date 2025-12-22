/**
 * Achievement Service - Client-side achievement data access
 *
 * Handles loading achievement definitions and reading user achievements from GitHub.
 * All achievement checking and validation happens server-side.
 */

import { createLogger } from '../../utils/logger.js';
import { getOctokit } from '../github/api.js';
import { useConfigStore } from '../../store/configStore.js';

const logger = createLogger('AchievementService');

// In-memory cache for achievement definitions
let achievementDefinitionsCache = null;
let achievementDefinitionsCacheTime = 0;
const DEFINITIONS_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Get achievement configuration from wiki-config
 */
function getAchievementConfig() {
  const configStore = useConfigStore.getState();
  const config = configStore.config?.features?.achievements;

  return {
    enabled: config?.enabled ?? true,
    definitionsPath: config?.definitionsPath ?? '/achievements.json',
    categories: config?.categories ?? {},
    ui: {
      showHiddenAchievements: config?.ui?.showHiddenAchievements ?? false,
    },
    storage: {
      issueLabel: config?.storage?.issueLabel ?? 'achievements',
      statsLabel: config?.storage?.statsLabel ?? 'achievement-stats',
    },
    stats: {
      enabled: config?.stats?.enabled ?? true,
      cacheMinutes: config?.stats?.cacheMinutes ?? 60,
    },
  };
}

/**
 * Achievement Service API
 */
export const achievementService = {
  /**
   * Load achievement definitions from public/achievements.json
   * @returns {Promise<Object>} Achievement definitions { version, categories, rarities, achievements }
   */
  async loadAchievementDefinitions() {
    const now = Date.now();
    const config = getAchievementConfig();

    // Return cached definitions if still valid
    if (
      achievementDefinitionsCache &&
      now - achievementDefinitionsCacheTime < DEFINITIONS_CACHE_TTL
    ) {
      logger.trace('Using cached achievement definitions');
      return achievementDefinitionsCache;
    }

    try {
      // Use configured definitions path
      const definitionsPath = config.definitionsPath;
      logger.debug('Loading achievement definitions', { path: definitionsPath });

      const response = await fetch(definitionsPath);

      if (!response.ok) {
        throw new Error(`Failed to load ${definitionsPath}: ${response.statusText}`);
      }

      const definitions = await response.json();

      // Validate structure
      if (!definitions.version || !definitions.achievements || !Array.isArray(definitions.achievements)) {
        throw new Error('Invalid achievements.json structure');
      }

      // Filter achievements by enabled categories
      const enabledCategories = Object.keys(config.categories).filter(
        (cat) => config.categories[cat]?.enabled !== false
      );

      const filteredAchievements = definitions.achievements.filter((achievement) => {
        // If no categories configured, include all
        if (enabledCategories.length === 0) return true;

        // Include if achievement's category is enabled
        return enabledCategories.includes(achievement.category);
      });

      // Filter out hidden achievements if not configured to show them
      const visibleAchievements = filteredAchievements.filter((achievement) => {
        if (config.ui.showHiddenAchievements) return true;
        return !achievement.hidden;
      });

      // Create filtered definitions
      const filteredDefinitions = {
        ...definitions,
        achievements: visibleAchievements,
      };

      // Cache the filtered definitions
      achievementDefinitionsCache = filteredDefinitions;
      achievementDefinitionsCacheTime = now;

      logger.info('Loaded achievement definitions', {
        version: filteredDefinitions.version,
        total: definitions.achievements.length,
        filtered: visibleAchievements.length,
        enabledCategories,
      });

      return filteredDefinitions;
    } catch (error) {
      logger.error('Failed to load achievement definitions', { error });

      // Return empty structure on error
      return {
        version: '1.0',
        categories: {},
        rarities: {},
        achievements: [],
      };
    }
  },

  /**
   * Get user's achievement issue from GitHub
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} userId - User ID (permanent identifier)
   * @param {string} username - Username (for fallback lookup)
   * @returns {Promise<Object|null>} GitHub issue object or null
   */
  async getUserAchievementIssue(owner, repo, userId, username) {
    try {
      const config = getAchievementConfig();
      const octokit = getOctokit();

      // Primary lookup: user-id label
      const userIdLabel = `user-id:${userId}`;
      const achievementLabel = config.storage.issueLabel;

      logger.debug('Looking up achievement issue', { userId, username, label: achievementLabel });

      const { data: issuesByUserId } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        labels: `${achievementLabel},${userIdLabel}`,
        state: 'open',
        per_page: 1,
      });

      if (issuesByUserId.length > 0) {
        logger.debug('Found achievement issue by user ID', { issueNumber: issuesByUserId[0].number });
        return issuesByUserId[0];
      }

      // Fallback: search by username in title
      logger.debug('User ID lookup failed, trying username fallback');

      const { data: issuesByUsername } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        labels: achievementLabel,
        state: 'open',
        per_page: 100, // Need more results to search titles
      });

      const matchedIssue = issuesByUsername.find((issue) =>
        issue.title.includes(`[Achievements] ${username}`)
      );

      if (matchedIssue) {
        logger.debug('Found achievement issue by username', { issueNumber: matchedIssue.number });
        return matchedIssue;
      }

      logger.debug('No achievement issue found', { userId, username });
      return null;
    } catch (error) {
      logger.error('Failed to get achievement issue', { error });
      return null;
    }
  },

  /**
   * Parse and return user's achievements from their achievement issue
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @param {number} userId - User ID
   * @param {string} username - Username
   * @returns {Promise<Object>} User achievements { userId, username, achievements, lastUpdated, version }
   */
  async getUserAchievements(owner, repo, userId, username) {
    const issue = await this.getUserAchievementIssue(owner, repo, userId, username);

    if (!issue) {
      logger.debug('No achievements found, returning empty', { userId, username });
      return {
        userId,
        username,
        achievements: [],
        lastUpdated: null,
        version: '1.0',
      };
    }

    try {
      const data = JSON.parse(issue.body);

      logger.debug('Parsed user achievements', {
        userId,
        username,
        count: data.achievements?.length || 0,
      });

      return {
        userId: data.userId || userId,
        username: data.username || username,
        achievements: data.achievements || [],
        lastUpdated: data.lastUpdated || null,
        version: data.version || '1.0',
      };
    } catch (error) {
      logger.error('Failed to parse achievements from issue', { error });
      return {
        userId,
        username,
        achievements: [],
        lastUpdated: null,
        version: '1.0',
      };
    }
  },

  /**
   * Get achievement statistics (% of users who unlocked each achievement)
   * @param {string} owner - Repository owner
   * @param {string} repo - Repository name
   * @returns {Promise<Object>} Achievement statistics { lastUpdated, totalUsers, achievements: { achievementId: { count, percentage } } }
   */
  async getAchievementStats(owner, repo) {
    try {
      const octokit = getOctokit();

      const { data: issues } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        labels: 'achievement-stats',
        state: 'open',
        per_page: 1,
      });

      if (issues.length === 0) {
        logger.debug('No achievement stats cache found');
        return { achievements: {} };
      }

      const stats = JSON.parse(issues[0].body);

      logger.debug('Loaded achievement stats', {
        totalUsers: stats.totalUsers,
        achievementCount: Object.keys(stats.achievements || {}).length,
      });

      return stats;
    } catch (error) {
      logger.error('Failed to load achievement stats', { error });
      return { achievements: {} };
    }
  },

  /**
   * Clear achievement definitions cache (for testing)
   */
  clearCache() {
    achievementDefinitionsCache = null;
    achievementDefinitionsCacheTime = 0;
    logger.trace('Achievement definitions cache cleared');
  },
};
