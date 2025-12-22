import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useWikiConfig } from './useWikiConfig';
import { getPrestigeTier } from '../utils/prestige';
import { getUserPullRequests } from '../services/github/pullRequests';
import { getUserPrestigeData, getCachedPrestigeDataSync } from '../services/github/prestige';
import { getUserSnapshot } from '../services/github/userSnapshots';
import { getCacheValue, setCacheValue, clearCacheValue } from '../utils/timeCache.js';
import { cacheName } from '../utils/storageManager';
import { getUserIdFromUsername } from '../services/github/githubCache';

/**
 * Prestige data hook
 *
 * Fetches prestige data from user snapshots (primary source).
 * Falls back to prestige cache, then PR-based calculation for authenticated user.
 */

/**
 * Hook to get prestige data for a specific user
 *
 * @param {string} username - GitHub username to get prestige for
 * @returns {Object} { tier, stats, loading, error }
 */
// Track which users are currently loading to prevent duplicate requests
const loadingUsers = new Set();

export const useUserPrestige = (username) => {
  const { user, isAuthenticated } = useAuthStore();
  const { config } = useWikiConfig();
  const [prestigeData, setPrestigeData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);

  useEffect(() => {
    // Early return if no username provided
    if (!username) {
      setPrestigeData(null);
      setLoading(false);
      return;
    }

    const loadPrestigeData = async () => {
      // Only load prestige if system is enabled
      if (!config?.prestige?.enabled || !config?.prestige?.tiers) {
        setPrestigeData(null);
        setLoading(false);
        return;
      }

      // Get userId for cache key (permanent identifier)
      let userId = null;
      try {
        // Try to get userId from authenticated user first (fast)
        if (user && user.login === username) {
          userId = user.id;
        } else {
          // Fetch userId from GitHub API (will be cached)
          userId = await getUserIdFromUsername(username);
        }
      } catch (error) {
        console.warn(`[Prestige] Failed to get userId for ${username}, using username as fallback:`, error);
        // Fallback to username if userId fetch fails (graceful degradation)
        userId = username;
      }

      // Check localStorage cache first (5 minute TTL)
      const cacheKey = cacheName('prestige', userId);
      const cached = getCacheValue(cacheKey);
      if (cached) {
        console.log(`[Prestige] Cache hit for user ${userId}`);
        setPrestigeData(cached);
        setLoading(false);
        return;
      }

      // Check localStorage cache synchronously (4 hour TTL)
      const syncCached = getCachedPrestigeDataSync(username);
      if (syncCached) {
        console.log(`[Prestige] Using cached data for ${username} from localStorage`);
        const data = {
          tier: {
            id: syncCached.prestigeTier,
            badge: syncCached.prestigeBadge,
            color: syncCached.prestigeColor,
          },
          stats: {
            totalContributions: syncCached.contributions,
          },
        };

        // Cache the result for 5 minutes
        setCacheValue(cacheKey, data, 5 * 60 * 1000);
        setPrestigeData(data);
        setLoading(false);
        return;
      }

      // Prevent duplicate simultaneous requests
      if (loadingUsers.has(username)) {
        return;
      }

      try {
        loadingUsers.add(username);
        setLoading(true);
        setError(null);

        const { owner, repo } = config.wiki.repository;

        // First try: Fetch from user snapshot (primary source)
        console.log(`[Prestige] Fetching prestige data for ${username} from snapshot`);
        try {
          const snapshot = await getUserSnapshot(owner, repo, username);

          if (snapshot && snapshot.stats) {
            console.log(`[Prestige] Found ${username} in snapshot, calculating prestige from stats`);

            // Calculate prestige tier from snapshot stats
            const tier = getPrestigeTier(snapshot.stats, config.prestige.tiers);

            const data = {
              tier,
              stats: snapshot.stats,
            };

            // Cache the result for 5 minutes
            setCacheValue(cacheKey, data, 5 * 60 * 1000);
            setPrestigeData(data);
            return;
          }
        } catch (snapshotError) {
          console.warn(`[Prestige] Failed to fetch snapshot for ${username}:`, snapshotError);
        }

        // Second try: Fallback to old prestige cache (for backwards compatibility)
        console.log(`[Prestige] No snapshot for ${username}, trying GitHub prestige cache`);
        const prestigeData = await getUserPrestigeData(owner, repo, username);

        if (prestigeData) {
          // Found in old cache
          console.log(`[Prestige] Found ${username} in prestige cache with tier: ${prestigeData.prestigeTier}`);
          const data = {
            tier: {
              id: prestigeData.prestigeTier,
              badge: prestigeData.prestigeBadge,
              color: prestigeData.prestigeColor,
            },
            stats: {
              totalContributions: prestigeData.contributions,
            },
          };

          // Cache the result for 5 minutes
          setCacheValue(cacheKey, data, 5 * 60 * 1000);
          setPrestigeData(data);
          return;
        }

        // Third try: Calculate from PRs for authenticated user only
        if (isAuthenticated && user && username === user.login) {
          console.log(`[Prestige] No cache for ${username}, calculating from PRs (authenticated user)`);

          // Fetch ALL PRs for prestige calculation (paginate through all pages)
          let allPRs = [];
          let currentPage = 1;
          let hasMorePages = true;

          while (hasMorePages) {
            const result = await getUserPullRequests(owner, repo, username, user.id, null, currentPage, 100);
            allPRs = [...allPRs, ...result.prs];
            hasMorePages = result.hasMore;
            currentPage++;

            console.log(`[Prestige] Fetched page ${currentPage - 1}, total PRs so far: ${allPRs.length}`);
          }

          console.log(`[Prestige] Loaded ${allPRs.length} total PRs for ${username}`);

          // Calculate stats
          const stats = {
            totalPRs: allPRs.length,
            openPRs: allPRs.filter(pr => pr.state === 'open').length,
            mergedPRs: allPRs.filter(pr => pr.state === 'merged').length,
            closedPRs: allPRs.filter(pr => pr.state === 'closed' && !pr.merged_at).length,
            totalAdditions: allPRs.reduce((sum, pr) => sum + (pr.additions || 0), 0),
            totalDeletions: allPRs.reduce((sum, pr) => sum + (pr.deletions || 0), 0),
            totalFiles: allPRs.reduce((sum, pr) => sum + (pr.changed_files || 0), 0),
          };

          // Get prestige tier based on total PRs
          const tier = getPrestigeTier(stats, config.prestige.tiers);

          const data = { tier, stats };

          // Cache the result for 5 minutes
          setCacheValue(cacheKey, data, 5 * 60 * 1000);
          setPrestigeData(data);
        } else {
          // No data available for non-authenticated users
          console.log(`[Prestige] No prestige data available for ${username}`);
          setPrestigeData(null);
        }
      } catch (err) {
        console.error(`[Prestige] Failed to load prestige data for ${username}:`, err);
        setError(err.message);
      } finally {
        loadingUsers.delete(username);
        setLoading(false);
      }
    };

    loadPrestigeData();
  }, [username, user, isAuthenticated, config]);

  return { ...prestigeData, loading, error };
};

/**
 * Hook to invalidate prestige cache for a user
 * Call this when user makes a new contribution
 * @param {number|string} userIdOrUsername - User ID (preferred) or username (legacy)
 */
export const useInvalidatePrestige = () => {
  return useCallback((userIdOrUsername) => {
    if (typeof userIdOrUsername === 'string') {
      console.warn('[Prestige] useInvalidatePrestige called with username instead of userId - consider updating to use userId');
    }
    const cacheKey = cacheName('prestige', userIdOrUsername);
    clearCacheValue(cacheKey);
    console.log(`[Prestige] Cleared cache for user ${userIdOrUsername}`);
  }, []);
};

/**
 * Get prestige data from cache synchronously
 * Returns null if not cached or expired
 *
 * @param {number|string} userIdOrUsername - User ID (preferred) or username (legacy)
 * @returns {Object|null} Cached prestige data or null
 */
export const getCachedPrestige = (userIdOrUsername) => {
  if (typeof userIdOrUsername === 'string') {
    console.warn('[Prestige] getCachedPrestige called with username instead of userId - consider updating to use userId');
  }
  const cacheKey = cacheName('prestige', userIdOrUsername);
  const cached = getCacheValue(cacheKey);
  return cached; // getCacheValue already handles expiration
};
