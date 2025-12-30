import { useState, useEffect } from 'react';
import { useAuthStore } from '../store/authStore';
import { useWikiConfig } from './useWikiConfig';
import { isAdmin, isRepositoryOwner } from '../services/github/admin';

/**
 * Hook to check if current user is an admin
 *
 * Uses a three-tier caching strategy to minimize API calls:
 * 1. Auth check - Free (already in store)
 * 2. Owner check - Free (string comparison)
 * 3. Admin API check - ~200ms (cached for 10 minutes by admin service)
 *
 * @returns {Object} Admin status object
 * @returns {boolean} isAdmin - True if user is admin or owner
 * @returns {boolean} isOwner - True if user is repository owner
 * @returns {boolean} loading - True while checking admin status
 */
export const useAdminStatus = () => {
  const { config } = useWikiConfig();
  const { isAuthenticated, user } = useAuthStore();
  const [isAdminUser, setIsAdminUser] = useState(false);
  const [isOwner, setIsOwner] = useState(false);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const checkAdminStatus = async () => {
      // Tier 1: Check authentication (free)
      if (!isAuthenticated || !user || !config?.wiki?.repository) {
        setIsAdminUser(false);
        setIsOwner(false);
        setLoading(false);
        return;
      }

      const { owner, repo } = config.wiki.repository;

      // Tier 2: Check if repository owner (API call to get owner ID - cached)
      try {
        const ownerStatus = await isRepositoryOwner(user.id, owner, repo);
        setIsOwner(ownerStatus);

        if (ownerStatus) {
          setIsAdminUser(true);
          setLoading(false);
          return;
        }
      } catch (error) {
        console.warn('[useAdminStatus] Failed to check owner status:', error);
        setIsOwner(false);
        // Continue to check admin list
      }

      // Tier 3: Check admin list (cached by admin service - 10 min TTL)
      try {
        const adminStatus = await isAdmin(user.login, owner, repo, config);
        setIsAdminUser(adminStatus);
      } catch (error) {
        console.warn('[useAdminStatus] Failed to check admin status:', error);
        setIsAdminUser(false); // Fail closed (safe default)
      } finally {
        setLoading(false);
      }
    };

    checkAdminStatus();
  }, [isAuthenticated, user, config]);

  return { isAdmin: isAdminUser, isOwner, loading };
};
