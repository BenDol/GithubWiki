import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useWikiConfig } from './useWikiConfig';
import { getPrestigeTier } from '../utils/prestige';
import { getUserPullRequests } from '../services/github/pullRequests';
import { getUserPrestigeData, getCachedPrestigeDataSync } from '../services/github/prestige';
import { getUserSnapshot } from '../services/github/userSnapshots';

/**
 * Prestige data hook
 *
 * Fetches prestige data from user snapshots (primary source).
 * Falls back to prestige cache, then PR-based calculation for authenticated user.
 */

// In-memory cache for user prestige data (short-term, 5 minutes)
// Main cache is localStorage + GitHub issue (updated daily)
const prestigeCache = new Map();

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

      // Check in-memory cache first (5 minute TTL)
      const cached = prestigeCache.get(username);
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) {
        setPrestigeData(cached.data);
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

        // Cache in memory too
        prestigeCache.set(username, { data, timestamp: Date.now() });
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

            // Cache the result
            prestigeCache.set(username, { data, timestamp: Date.now() });
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

          // Cache the result
          prestigeCache.set(username, { data, timestamp: Date.now() });
          setPrestigeData(data);
          return;
        }

        // Third try: Calculate from PRs for authenticated user only
        if (isAuthenticated && user && username === user.login) {
          console.log(`[Prestige] No cache for ${username}, calculating from PRs (authenticated user)`);
          const prs = await getUserPullRequests(owner, repo, username);

          // Calculate stats
          const stats = {
            totalPRs: prs.length,
            openPRs: prs.filter(pr => pr.state === 'open').length,
            mergedPRs: prs.filter(pr => pr.state === 'merged').length,
            closedPRs: prs.filter(pr => pr.state === 'closed' && !pr.merged_at).length,
            totalAdditions: prs.reduce((sum, pr) => sum + (pr.additions || 0), 0),
            totalDeletions: prs.reduce((sum, pr) => sum + (pr.deletions || 0), 0),
            totalFiles: prs.reduce((sum, pr) => sum + (pr.changed_files || 0), 0),
          };

          // Get prestige tier based on total PRs
          const tier = getPrestigeTier(stats, config.prestige.tiers);

          const data = { tier, stats };

          // Cache the result
          prestigeCache.set(username, { data, timestamp: Date.now() });
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
 */
export const useInvalidatePrestige = () => {
  return useCallback((username) => {
    prestigeCache.delete(username);
  }, []);
};

/**
 * Get prestige data from cache synchronously
 * Returns null if not cached or expired
 *
 * @param {string} username - GitHub username
 * @returns {Object|null} Cached prestige data or null
 */
export const getCachedPrestige = (username) => {
  const cached = prestigeCache.get(username);
  if (!cached) return null;

  // Check if cache is still valid (5 minute TTL)
  if (Date.now() - cached.timestamp > 5 * 60 * 1000) {
    prestigeCache.delete(username);
    return null;
  }

  return cached.data;
};
