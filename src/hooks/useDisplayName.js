/**
 * Display Name Hooks
 *
 * React hooks for fetching and managing user display names.
 */

import { useState, useEffect } from 'react';
import { getDisplayName, getDisplayNameOrFallback } from '../services/displayNames';
import { createLogger } from '../utils/logger';

const logger = createLogger('useDisplayName');

/**
 * Hook to fetch and cache display name for a user
 * @param {Object} user - User object with id and login
 * @returns {Object} Display name data and loading state
 */
export function useDisplayName(user) {
  const [displayName, setDisplayName] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!user || !user.id) {
      setDisplayName(user?.login || null);
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchDisplayName = async () => {
      try {
        const name = await getDisplayNameOrFallback(user);
        if (isMounted) {
          setDisplayName(name);
          setLoading(false);
        }
      } catch (error) {
        logger.error('Failed to fetch display name', { userId: user.id, error });
        if (isMounted) {
          setDisplayName(user.login);
          setLoading(false);
        }
      }
    };

    fetchDisplayName();

    return () => {
      isMounted = false;
    };
  }, [user?.id, user?.login]);

  return { displayName, loading };
}

/**
 * Hook to fetch display names for multiple users
 * @param {Array<Object>} users - Array of user objects
 * @returns {Object} Map of userId -> displayName and loading state
 */
export function useDisplayNames(users) {
  const [displayNames, setDisplayNames] = useState({});
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!users || users.length === 0) {
      setDisplayNames({});
      setLoading(false);
      return;
    }

    let isMounted = true;

    const fetchDisplayNames = async () => {
      try {
        const nameMap = {};

        // Fetch in parallel
        await Promise.all(
          users.map(async (user) => {
            if (user && user.id) {
              const name = await getDisplayNameOrFallback(user);
              nameMap[user.id] = name;
            }
          })
        );

        if (isMounted) {
          setDisplayNames(nameMap);
          setLoading(false);
        }
      } catch (error) {
        logger.error('Failed to fetch display names', { error });
        if (isMounted) {
          // Fallback to usernames
          const fallbackMap = {};
          users.forEach(user => {
            if (user && user.id) {
              fallbackMap[user.id] = user.login;
            }
          });
          setDisplayNames(fallbackMap);
          setLoading(false);
        }
      }
    };

    fetchDisplayNames();

    return () => {
      isMounted = false;
    };
  }, [users]);

  return { displayNames, loading };
}
