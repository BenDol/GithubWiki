import { useState, useEffect, useCallback } from 'react';
import { useAuthStore } from '../store/authStore';
import { useWikiConfig } from './useWikiConfig';
import { getPrestigeTier } from '../utils/prestige';
import { getUserPullRequests } from '../services/github/pullRequests';

/**
 * Prestige data hook
 *
 * Currently only loads prestige for the authenticated user.
 * Future enhancement: Add central cache to store prestige for multiple users
 * and fetch from GitHub API or a backend service.
 */

// In-memory cache for user prestige data
// Future: Move this to a Zustand store or localStorage for persistence
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

      // Only load prestige for authenticated user (for now)
      // Future: Support loading for any user via API/cache
      if (!isAuthenticated || !user || username !== user.login) {
        setPrestigeData(null);
        setLoading(false);
        return;
      }

      // Check cache first
      const cached = prestigeCache.get(username);
      if (cached && Date.now() - cached.timestamp < 5 * 60 * 1000) { // 5 minute cache
        setPrestigeData(cached.data);
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

        // Get prestige tier
        const tier = getPrestigeTier(stats, config.prestige.tiers);

        const data = { tier, stats };

        // Cache the result
        prestigeCache.set(username, {
          data,
          timestamp: Date.now(),
        });

        setPrestigeData(data);
      } catch (err) {
        console.error('Failed to load prestige data:', err);
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
