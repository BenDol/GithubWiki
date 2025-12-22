/**
 * useAchievements Hook - React hook for loading and managing achievement data
 *
 * Loads achievement definitions, user achievements, and achievement statistics
 */

import { useState, useEffect } from 'react';
import { achievementService } from '../services/achievements/achievementService.js';
import { useAuthStore } from '../store/authStore.js';
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
