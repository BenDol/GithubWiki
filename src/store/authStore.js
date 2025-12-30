import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import {
  initiateDeviceFlow,
  waitForAuthorization,
  fetchGitHubUser,
  encryptToken,
  decryptToken,
  validateToken,
} from '../services/github/auth';
import { initializeOctokit, clearOctokit } from '../services/github/api';
import { configName, cacheName } from '../utils/storageManager';
import { clearSessionCacheValue } from '../utils/timeCache';
import { updateUserSnapshot, getUserSnapshot } from '../services/github/userSnapshots';
import { eventBus, EventNames } from '../services/eventBus';
import { createLogger } from '../utils/logger';

const logger = createLogger('AuthStore');

/**
 * Track in-progress snapshot updates to prevent concurrent duplicates
 */
const snapshotUpdateInProgress = new Set();

/**
 * Track users who have been checked for anonymous edit linking
 */
const linkingCheckInProgress = new Set();

/**
 * Link anonymous edits to user account in background after login
 * Non-blocking - doesn't affect login flow
 * Only runs once per user (tracked in localStorage)
 * Locked: prevents concurrent linking for the same user
 */
const linkAnonymousEditsInBackground = async (user) => {
  // Check if linking is already in progress for this user
  if (linkingCheckInProgress.has(user.id)) {
    logger.debug(`Linking check already in progress for ${user.login}, skipping`);
    return;
  }

  try {
    // Mark as in progress
    linkingCheckInProgress.add(user.id);

    // Import linking service dynamically to avoid circular dependency
    const { linkAnonymousEditsOnLogin, hasBeenCheckedForLinking, markAsCheckedForLinking } =
      await import('../services/github/anonymousEditLinking');

    // Check if already checked before
    if (hasBeenCheckedForLinking(user.id)) {
      logger.debug(`User ${user.login} already checked for linking, skipping`);
      return;
    }

    // Import config store dynamically to avoid circular dependency
    const { useConfigStore } = await import('./configStore');
    const config = useConfigStore.getState().config;

    if (!config?.wiki?.repository) {
      logger.debug('Skipping anonymous edit linking: no repository config');
      return;
    }

    const { owner, repo } = config.wiki.repository;

    // Get user's OAuth token for backend authentication
    const { useAuthStore } = await import('./authStore');
    const token = useAuthStore.getState().getToken();

    if (!token) {
      logger.debug('No token available for linking, skipping');
      return;
    }

    logger.info(`Checking for linkable anonymous edits for ${user.login}...`);
    const result = await linkAnonymousEditsOnLogin(user, owner, repo, token);

    if (result.linked && result.linkedCount > 0) {
      logger.info(`Linked ${result.linkedCount} anonymous edit(s) for ${user.login}`);

      // Rebuild snapshot to include newly-linked PRs
      // Wait for GitHub API to propagate label changes (eventual consistency)
      logger.debug('Waiting for GitHub API to propagate label changes...');
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay

      logger.debug('Rebuilding snapshot to include linked PRs...');
      try {
        // Security: Only rebuild the authenticated user's own snapshot
        // Get current auth state to confirm user identity
        const { useAuthStore } = await import('./authStore');
        const currentUser = useAuthStore.getState().user;

        if (!currentUser || currentUser.id !== user.id) {
          logger.warn(`Snapshot rebuild skipped: user mismatch (current: ${currentUser?.id}, requested: ${user.id})`);
          return;
        }

        const { updateUserSnapshot } = await import('../services/github/userSnapshots');
        await updateUserSnapshot(owner, repo, user.login);
        logger.info('Snapshot rebuilt with linked PRs');
      } catch (snapshotError) {
        logger.warn('Failed to rebuild snapshot after linking', { error: snapshotError.message });
        // Non-critical - snapshot will be updated eventually
      }
    } else if (result.linked && result.linkedCount === 0) {
      logger.debug(`No linkable anonymous edits found for ${user.login}`);
    } else {
      logger.debug(`Could not link anonymous edits for ${user.login}`, { reason: result.reason || result.error });
    }

    // Mark as checked (even if failed, to avoid repeated attempts)
    markAsCheckedForLinking(user.id);
  } catch (error) {
    // Silent failure - don't disrupt user experience
    logger.warn(`Failed to link anonymous edits for ${user.login}`, { error: error.message });
  } finally {
    // Always remove from in-progress set
    linkingCheckInProgress.delete(user.id);
  }
};

/**
 * Update user snapshot in background after login
 * Non-blocking - doesn't affect login flow
 * Only creates snapshot if it doesn't exist
 * Locked: prevents concurrent updates for the same user
 */
const updateSnapshotInBackground = async (username) => {
  // Check if update is already in progress for this user
  if (snapshotUpdateInProgress.has(username)) {
    logger.debug(`Snapshot update already in progress for ${username}, skipping`);
    return;
  }

  try {
    // Mark as in progress
    snapshotUpdateInProgress.add(username);

    // Import config store dynamically to avoid circular dependency
    const { useConfigStore } = await import('./configStore');
    const config = useConfigStore.getState().config;

    if (!config?.wiki?.repository) {
      logger.debug('Skipping snapshot update: no repository config');
      return;
    }

    const { owner, repo } = config.wiki.repository;

    // Check if snapshot exists
    const existingSnapshot = await getUserSnapshot(owner, repo, username);
    if (existingSnapshot) {
      logger.debug(`Snapshot already exists for ${username}, skipping update`);
      return;
    }

    logger.debug(`Creating user snapshot for ${username} in background...`);
    await updateUserSnapshot(owner, repo, username);
    logger.info(`User snapshot created for ${username}`);
  } catch (error) {
    // Silent failure - don't disrupt user experience
    logger.warn(`Failed to create user snapshot for ${username}`, { error: error.message });
  } finally {
    // Always remove from in-progress set
    snapshotUpdateInProgress.delete(username);
  }
};

// Expose auth store globally for Octokit reinit check
if (typeof window !== 'undefined') {
  window.__authStore__ = null;
}

/**
 * Authentication store using Zustand
 * Manages user authentication state and GitHub OAuth
 */
export const useAuthStore = create(
  persist(
    (set, get) => {
      // Expose store globally for Octokit to check auth state
      if (typeof window !== 'undefined') {
        window.__authStore__ = { getState: get };
      }

      return {
        // State
        user: null,
        token: null,
        isAuthenticated: false,
        isLoading: false,
        error: null,
        deviceFlow: null, // Stores device flow data during login

        // Actions
        setUser: (user) => set({ user, isAuthenticated: !!user }),

      setToken: (token) => {
        const encrypted = token ? encryptToken(token) : null;
        set({ token: encrypted });

        // Initialize Octokit with token
        if (token) {
          initializeOctokit(token);
        }
      },

      /**
       * Start GitHub Device Flow login
       */
      startLogin: async () => {
        set({ isLoading: true, error: null, deviceFlow: null });

        try {
          const deviceFlow = await initiateDeviceFlow();
          set({ deviceFlow, isLoading: false });
          return deviceFlow;
        } catch (error) {
          set({ error: error.message, isLoading: false, deviceFlow: null });
          throw error;
        }
      },

      /**
       * Complete login by waiting for user authorization
       */
      completeLogin: async () => {
        const { deviceFlow } = get();

        if (!deviceFlow) {
          throw new Error('No device flow in progress');
        }

        logger.debug('Completing login flow...');
        set({ isLoading: true, error: null });

        try {
          // Wait for user to authorize
          logger.debug('Waiting for user authorization...');
          const token = await waitForAuthorization(
            deviceFlow.deviceCode,
            deviceFlow.expiresIn,
            deviceFlow.interval
          );

          logger.debug('Authorization successful, fetching user info...');
          // Fetch user information
          const user = await fetchGitHubUser(token);

          logger.debug('User info fetched', { username: user.login });
          logger.debug('Storing token and initializing Octokit...');

          // Store encrypted token and user
          get().setToken(token);
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            deviceFlow: null,
          });

          logger.info(`Login completed successfully for user: ${user.login}`);

          // Emit user login event for achievement system
          eventBus.emit(EventNames.USER_LOGIN, { user });

          // Update user snapshot in background (non-blocking)
          updateSnapshotInBackground(user.login).catch(err => {
            logger.warn('Snapshot update failed (non-critical)', { error: err });
          });

          // Link anonymous edits in background (non-blocking)
          linkAnonymousEditsInBackground(user).catch(err => {
            logger.warn('Anonymous edit linking failed (non-critical)', { error: err });
          });

          return { user, token };
        } catch (error) {
          logger.error('Login failed', { error: error.message });
          set({
            error: error.message,
            isLoading: false,
            deviceFlow: null,
          });
          throw error;
        }
      },

      /**
       * Cancel ongoing device flow
       */
      cancelLogin: () => {
        set({
          deviceFlow: null,
          isLoading: false,
          error: null,
        });
      },

      /**
       * Logout user
       */
      logout: () => {
        const { user } = get();

        // Clear GitHub user data from session cache
        const userCacheKey = cacheName('github_user_data', 'current');
        clearSessionCacheValue(userCacheKey);
        logger.info('Cleared GitHub user data from sessionStorage on logout');

        clearOctokit();
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
          deviceFlow: null,
        });

        // Emit user logout event
        if (user) {
          eventBus.emit(EventNames.USER_LOGOUT, { user });
        }
      },

      /**
       * Validate and restore session from stored token
       */
      restoreSession: async () => {
        const { token: encryptedToken, isAuthenticated, user } = get();

        // Detect stale session: authenticated but no token
        if (isAuthenticated && !encryptedToken) {
          logger.warn('Stale session detected: authenticated but token missing');
          logger.info('Clearing stale session - user needs to log in again');

          // Clear the stale state
          get().logout();

          // Emit event to show user notification
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth:session-expired', {
              detail: {
                message: 'Your session has expired. Please log in again.',
                username: user?.login,
              }
            }));
          }

          return false;
        }

        if (!encryptedToken) {
          logger.debug('No stored token found, skipping session restore');
          return false;
        }

        logger.debug('Restoring session from stored token...');
        set({ isLoading: true });

        try {
          // Decrypt token
          const token = decryptToken(encryptedToken);

          if (!token) {
            logger.error('Token decryption failed');
            throw new Error('Invalid token');
          }

          logger.debug('Token decrypted successfully, validating with GitHub...');

          // Validate token with retries (handles network errors)
          const { valid, user: validatedUser, error } = await validateToken(token);

          if (!valid) {
            // Check if error is network-related
            const isNetworkError =
              error === 'Failed to fetch' ||
              error?.includes('NetworkError') ||
              error?.includes('fetch') ||
              error?.includes('network');

            if (isNetworkError) {
              // NETWORK ERROR: Don't log out, just mark as loading failed
              logger.warn('Network error during session restore - keeping user logged in', {
                error,
                username: user?.login
              });

              // Initialize Octokit with token anyway (optimistic)
              initializeOctokit(token);

              // Keep user logged in but show warning
              set({ isLoading: false });

              // Dispatch event for UI notification (non-blocking)
              if (typeof window !== 'undefined') {
                window.dispatchEvent(new CustomEvent('auth:network-error', {
                  detail: {
                    message: 'Unable to verify session due to network issue. You may need to re-login if errors persist.',
                    error,
                  }
                }));
              }

              return true; // Session kept alive
            } else {
              // AUTHENTICATION ERROR: Token is actually invalid, logout required
              logger.error('Token validation failed - invalid token', { error });
              throw new Error(error || 'Invalid token');
            }
          }

          logger.debug('Token validated successfully for user', { username: validatedUser.login });

          // Initialize Octokit
          initializeOctokit(token);

          // Update state
          set({
            user: validatedUser,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          // Dispatch success event
          if (typeof window !== 'undefined') {
            window.dispatchEvent(new CustomEvent('auth:session-restored', {
              detail: { username: validatedUser.login }
            }));
          }

          logger.info('Session restored successfully');

          return true;
        } catch (error) {
          logger.error('Session restore failed', { error: error.message });
          // Token is invalid, clear it
          get().logout();
          set({ isLoading: false });
          return false;
        }
      },

      /**
       * Refresh user data
       */
      refreshUser: async () => {
        const { token: encryptedToken } = get();

        if (!encryptedToken) {
          return;
        }

        try {
          const token = decryptToken(encryptedToken);
          const user = await fetchGitHubUser(token);
          set({ user });
        } catch (error) {
          logger.error('Failed to refresh user', { error });
          // Don't throw, just log the error
        }
      },

      /**
       * Clear error
       */
      clearError: () => set({ error: null }),

      /**
       * Get decrypted token
       */
      getToken: () => {
        const { token: encryptedToken } = get();
        return encryptedToken ? decryptToken(encryptedToken) : null;
      },
    };
  },
    {
      name: configName('wiki_auth'),
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
