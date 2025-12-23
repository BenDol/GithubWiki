/**
 * useAchievements Hook - React hook for loading and managing achievement data
 *
 * Loads achievement definitions, user achievements, and achievement statistics
 */

import { useState, useEffect } from 'react';
import { achievementService } from '../services/achievements/achievementService.js';
import { useAuthStore } from '../store/authStore.js';
import { useConfigStore } from '../store/configStore.js';
import { eventBus, EventNames } from '../services/eventBus.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('useAchievements');

/**
 * Hook to load achievements for a user
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} [targetUserId] - Optional target user ID (for viewing other profiles)
 * @param {string} [targetUsername] - Optional target username
 * @returns {Object} Achievement data and loading state
 */
export function useAchievements(owner, repo, targetUserId = null, targetUsername = null) {
  const { user } = useAuthStore();
  const { config } = useConfigStore();

  const [achievements, setAchievements] = useState([]);
  const [definitions, setDefinitions] = useState(null);
  const [stats, setStats] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    let isMounted = true;

    async function loadAchievements() {
      try {
        setLoading(true);
        setError(null);

        // Check if achievements are enabled
        if (config?.features?.achievements?.enabled === false) {
          logger.debug('Achievements disabled, skipping load');
          setDefinitions({ achievements: [], categories: {}, rarities: {} });
          setAchievements([]);
          setStats({});
          setLoading(false);
          return;
        }

        // Load achievement definitions (cached)
        const defs = await achievementService.loadAchievementDefinitions();

        if (!isMounted) return;

        setDefinitions(defs);

        // Determine which user to load achievements for
        const userId = targetUserId || user?.id;
        const username = targetUsername || user?.login;

        if (userId && username) {
          logger.debug('Loading achievements', { userId, username });

          // Load user's unlocked achievements
          const userAchievements = await achievementService.getUserAchievements(
            owner,
            repo,
            userId,
            username
          );

          if (!isMounted) return;

          setAchievements(userAchievements.achievements || []);

          logger.debug('Loaded user achievements', {
            username,
            count: userAchievements.achievements?.length || 0,
          });
        } else {
          logger.debug('No user logged in or target specified');
          setAchievements([]);
        }

        // Load achievement statistics (% of users with each achievement)
        const achievementStats = await achievementService.getAchievementStats(owner, repo);

        if (!isMounted) return;

        setStats(achievementStats);

        logger.debug('Loaded achievement stats', {
          totalUsers: achievementStats.totalUsers,
        });
      } catch (err) {
        if (!isMounted) return;

        logger.error('Failed to load achievements', { error: err });
        setError(err.message || 'Failed to load achievements');
      } finally {
        if (isMounted) {
          setLoading(false);
        }
      }
    }

    loadAchievements();

    return () => {
      isMounted = false;
    };
  }, [owner, repo, targetUserId, targetUsername, user, config]);

  // Listen for achievement unlock events to refresh in real-time
  useEffect(() => {
    const handleAchievementUnlocked = async ({ achievements: newAchievements, userId: eventUserId }) => {
      console.log('[useAchievements] Achievement unlocked event received', {
        newAchievements,
        eventUserId,
        targetUserId,
        userLogin: user?.login,
      });

      // Determine the current user being viewed
      const viewingUserId = targetUserId || user?.id;
      const viewingUsername = targetUsername || user?.login;

      // Only refresh if this event is for the current user we're viewing
      if (eventUserId !== viewingUserId) {
        console.log('[useAchievements] Achievement unlocked for different user, ignoring', { eventUserId, viewingUserId });
        logger.debug('Achievement unlocked for different user, ignoring', { eventUserId, viewingUserId });
        return;
      }

      console.log('[useAchievements] Refreshing achievements for current user', { viewingUserId, viewingUsername });
      logger.info('Achievement unlocked event received, refreshing', {
        count: newAchievements?.length || 0,
        achievements: newAchievements?.map(a => a.id),
      });

      // Merge newly unlocked achievements into state immediately
      // (Avoids race condition with GitHub Issue updates)
      try {
        console.log('[useAchievements] Merging newly unlocked achievements into state');

        setAchievements(prevAchievements => {
          // Get IDs of already unlocked achievements
          const existingIds = new Set(prevAchievements.map(a => a.id));

          // Filter out achievements we already have
          const newToAdd = newAchievements.filter(a => !existingIds.has(a.id));

          if (newToAdd.length === 0) {
            console.log('[useAchievements] No new achievements to add (already have them)');
            return prevAchievements;
          }

          console.log('[useAchievements] Adding new achievements to state', {
            newCount: newToAdd.length,
            newIds: newToAdd.map(a => a.id),
          });

          // Merge and return
          return [...prevAchievements, ...newToAdd];
        });

        console.log('[useAchievements] State updated successfully');
        logger.debug('Achievements merged after unlock', {
          count: newAchievements?.length || 0,
        });
      } catch (error) {
        console.error('[useAchievements] Failed to merge achievements', error);
        logger.error('Failed to merge achievements after unlock', { error: error.message });
      }
    };

    // Subscribe to achievement unlock events
    eventBus.on(EventNames.ACHIEVEMENTS_UNLOCKED, handleAchievementUnlocked);

    // Cleanup listener on unmount
    return () => {
      eventBus.off(EventNames.ACHIEVEMENTS_UNLOCKED, handleAchievementUnlocked);
    };
  }, [owner, repo, targetUserId, targetUsername, user]);

  // Calculate derived data
  const unlockedIds = new Set(achievements.map((a) => a.id));
  const unlockedCount = achievements.length;
  const totalCount = definitions?.achievements?.length || 0;

  const totalPoints = achievements.reduce((sum, achievement) => {
    const definition = definitions?.achievements?.find((d) => d.id === achievement.id);
    return sum + (definition?.points || 0);
  }, 0);

  const maxPoints = definitions?.achievements?.reduce((sum, achievement) => {
    return sum + (achievement.points || 0);
  }, 0) || 0;

  return {
    // Raw data
    achievements,
    definitions,
    stats,

    // Loading states
    loading,
    error,

    // Computed values
    unlockedIds,
    unlockedCount,
    totalCount,
    totalPoints,
    maxPoints,
    completionPercentage: totalCount > 0 ? (unlockedCount / totalCount) * 100 : 0,
  };
}
