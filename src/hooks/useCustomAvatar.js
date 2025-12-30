/**
 * Custom Avatar Hook
 *
 * React hook for fetching and managing user custom profile pictures.
 * Falls back to GitHub avatar if no custom avatar is set.
 */

import { useState, useEffect } from 'react';
import { getCustomAvatar } from '../services/customAvatars';
import { createLogger } from '../utils/logger';
import { onAvatarUpdated } from '../utils/avatarEvents';

const logger = createLogger('useCustomAvatar');

/**
 * Hook to fetch and cache custom avatar for a user
 * @param {number} userId - GitHub user ID
 * @param {string} githubAvatarUrl - GitHub avatar URL (fallback)
 * @param {any} refreshTrigger - Optional dependency to force re-fetch (e.g., timestamp)
 * @returns {Object} Avatar data with URL, custom flag, loading state, and refresh function
 */
export function useCustomAvatar(userId, githubAvatarUrl, refreshTrigger = null) {
  const [avatarUrl, setAvatarUrl] = useState(githubAvatarUrl || '');
  const [isCustom, setIsCustom] = useState(false);
  const [loading, setLoading] = useState(true);
  const [internalRefresh, setInternalRefresh] = useState(0);

  useEffect(() => {
    if (!userId) {
      setAvatarUrl(githubAvatarUrl || '');
      setIsCustom(false);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchCustomAvatar = async () => {
      try {
        logger.trace('Fetching custom avatar', { userId, refreshTrigger, internalRefresh });
        const customUrl = await getCustomAvatar(userId);

        if (isMounted) {
          if (customUrl) {
            logger.debug('Using custom avatar', { userId, customUrl });
            setAvatarUrl(customUrl);
            setIsCustom(true);
          } else {
            logger.debug('Using GitHub avatar fallback', { userId });
            setAvatarUrl(githubAvatarUrl || '');
            setIsCustom(false);
          }
          setLoading(false);
        }
      } catch (error) {
        logger.error('Failed to fetch custom avatar', { userId, error });
        if (isMounted) {
          // Fallback to GitHub avatar on error
          setAvatarUrl(githubAvatarUrl || '');
          setIsCustom(false);
          setLoading(false);
        }
      }
    };

    fetchCustomAvatar();

    // Listen for global avatar update events for this user
    const unsubscribe = onAvatarUpdated(async ({ userId: updatedUserId }) => {
      if (isMounted && updatedUserId === userId) {
        logger.debug('Avatar updated via event, re-fetching...', { userId });
        try {
          // Re-fetch from API to get fresh cache-busted URL
          const customUrl = await getCustomAvatar(userId);
          if (isMounted && customUrl) {
            // Add extra cache busting with random value to force browser reload
            const cacheBuster = `&r=${Math.random().toString(36).substring(7)}`;
            const fullUrl = customUrl + cacheBuster;
            logger.debug('Avatar refreshed with cache buster', { userId, fullUrl });
            setAvatarUrl(fullUrl);
            setIsCustom(true);
            setLoading(false);
          }
        } catch (error) {
          logger.error('Failed to refresh avatar after event', { userId, error });
        }
      }
    });

    return () => {
      isMounted = false;
      unsubscribe();
    };
  }, [userId, githubAvatarUrl, refreshTrigger, internalRefresh]);

  // Function to manually trigger a refresh
  const refresh = () => {
    logger.debug('Manual refresh triggered', { userId });
    setLoading(true);
    setInternalRefresh(prev => prev + 1);
  };

  return { avatarUrl, isCustom, loading, refresh };
}

/**
 * Hook to fetch custom avatars for multiple users
 * @param {Array<Object>} users - Array of user objects with id and avatar_url
 * @returns {Object} Map of userId -> {avatarUrl, isCustom} and loading state
 */
export function useCustomAvatars(users) {
  const [avatars, setAvatars] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!users || users.length === 0) {
      setAvatars({});
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchCustomAvatars = async () => {
      try {
        const avatarMap = {};

        // Fetch in parallel
        await Promise.all(
          users.map(async (user) => {
            if (user && user.id) {
              const customUrl = await getCustomAvatar(user.id);
              avatarMap[user.id] = {
                avatarUrl: customUrl || user.avatar_url || '',
                isCustom: !!customUrl
              };
            }
          })
        );

        if (isMounted) {
          setAvatars(avatarMap);
          setLoading(false);
        }
      } catch (error) {
        logger.error('Failed to fetch custom avatars', { error });
        if (isMounted) {
          // Fallback to GitHub avatars
          const fallbackMap = {};
          users.forEach(user => {
            if (user && user.id) {
              fallbackMap[user.id] = {
                avatarUrl: user.avatar_url || '',
                isCustom: false
              };
            }
          });
          setAvatars(fallbackMap);
          setLoading(false);
        }
      }
    };

    fetchCustomAvatars();

    return () => {
      isMounted = false;
    };
  }, [users]);

  return { avatars, loading };
}
