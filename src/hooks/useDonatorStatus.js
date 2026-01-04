import { useState, useEffect, useMemo } from 'react';
import { useWikiConfig } from './useWikiConfig.js';
import { getDonatorStatus } from '../services/github/donatorRegistry.js';
import { createLogger } from '../utils/logger.js';

const logger = createLogger('useDonatorStatus');

/**
 * Hook to load donator status for a user
 * @param {string|null} username - GitHub username (null to skip loading)
 * @param {number|null} userId - Optional GitHub user ID for faster lookup
 * @returns {Object} { isDonator, donatorData, loading }
 */
export function useDonatorStatus(username, userId = null) {
  const [donatorData, setDonatorData] = useState(null);
  const [loading, setLoading] = useState(false);
  const { config } = useWikiConfig();

  // Extract specific config values to avoid re-running on every config change
  const donationBadgeEnabled = config?.features?.donation?.badge?.enabled;
  const repositoryOwner = config?.wiki?.repository?.owner;
  const repositoryRepo = config?.wiki?.repository?.repo;
  const donationBadge = config?.features?.donation?.badge?.badge;
  const donationColor = config?.features?.donation?.badge?.color;

  // Create stable config object for dependencies
  const stableConfig = useMemo(() => ({
    badgeEnabled: donationBadgeEnabled,
    owner: repositoryOwner,
    repo: repositoryRepo,
    badge: donationBadge,
    color: donationColor,
  }), [donationBadgeEnabled, repositoryOwner, repositoryRepo, donationBadge, donationColor]);

  useEffect(() => {
    // Skip if no username provided
    if (!username) {
      setDonatorData(null);
      setLoading(false);
      return;
    }

    // Skip if donator badges are not enabled
    if (!stableConfig.badgeEnabled) {
      setDonatorData(null);
      setLoading(false);
      return;
    }

    // Skip if no repository configured
    if (!stableConfig.owner || !stableConfig.repo) {
      setDonatorData(null);
      setLoading(false);
      return;
    }

    // Repository owner gets donator badge by default (they're funding the project!)
    if (username === stableConfig.owner) {
      const ownerBadge = {
        isDonator: true,
        donatedAt: new Date(0).toISOString(), // Epoch time (permanent)
        badge: stableConfig.badge,
        color: stableConfig.color,
        assignedBy: 'repository-owner',
      };
      setDonatorData(ownerBadge);
      setLoading(false);
      logger.debug('Repository owner gets default donator badge', { username });
      return;
    }

    // Load donator status
    let cancelled = false;

    const loadDonatorStatus = async () => {
      setLoading(true);
      try {
        logger.debug('Loading donator status', { username });
        const status = await getDonatorStatus(stableConfig.owner, stableConfig.repo, username, userId);

        if (!cancelled) {
          setDonatorData(status);
          logger.debug('Donator status loaded', { username, isDonator: status?.isDonator });
        }
      } catch (error) {
        logger.error('Failed to load donator status', { username, error: error.message });
        if (!cancelled) {
          setDonatorData(null);
        }
      } finally {
        if (!cancelled) {
          setLoading(false);
        }
      }
    };

    loadDonatorStatus();

    // Cleanup on unmount
    return () => {
      cancelled = true;
    };
  }, [username, userId, stableConfig]);

  return {
    isDonator: donatorData?.isDonator || false,
    donatorData,
    loading,
  };
}
