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
import { configName } from '../utils/storageManager';
import { updateUserSnapshot, getUserSnapshot } from '../services/github/userSnapshots';
import { eventBus, EventNames } from '../services/eventBus';

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
    console.log(`[AuthStore] Linking check already in progress for ${user.login}, skipping`);
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
      console.log(`[AuthStore] User ${user.login} already checked for linking, skipping`);
      return;
    }

    // Import config store dynamically to avoid circular dependency
    const { useConfigStore } = await import('./configStore');
    const config = useConfigStore.getState().config;

    if (!config?.wiki?.repository) {
      console.log('[AuthStore] Skipping anonymous edit linking: no repository config');
      return;
    }

    const { owner, repo } = config.wiki.repository;

    // Get user's OAuth token for backend authentication
    const { useAuthStore } = await import('./authStore');
    const token = useAuthStore.getState().getToken();

    if (!token) {
      console.log('[AuthStore] No token available for linking, skipping');
      return;
    }

    console.log(`[AuthStore] Checking for linkable anonymous edits for ${user.login}...`);
    const result = await linkAnonymousEditsOnLogin(user, owner, repo, token);

    if (result.linked && result.linkedCount > 0) {
      console.log(`[AuthStore] ✓ Linked ${result.linkedCount} anonymous edit(s) for ${user.login}`);

      // Rebuild snapshot to include newly-linked PRs
      // Wait for GitHub API to propagate label changes (eventual consistency)
      console.log(`[AuthStore] Waiting for GitHub API to propagate label changes...`);
      await new Promise(resolve => setTimeout(resolve, 5000)); // 5 second delay

      console.log(`[AuthStore] Rebuilding snapshot to include linked PRs...`);
      try {
        // Security: Only rebuild the authenticated user's own snapshot
        // Get current auth state to confirm user identity
        const { useAuthStore } = await import('./authStore');
        const currentUser = useAuthStore.getState().user;

        if (!currentUser || currentUser.id !== user.id) {
          console.warn(`[AuthStore] Snapshot rebuild skipped: user mismatch (current: ${currentUser?.id}, requested: ${user.id})`);
          return;
        }

        const { updateUserSnapshot } = await import('../services/github/userSnapshots');
        await updateUserSnapshot(owner, repo, user.login);
        console.log(`[AuthStore] ✓ Snapshot rebuilt with linked PRs`);
      } catch (snapshotError) {
        console.warn(`[AuthStore] Failed to rebuild snapshot after linking:`, snapshotError.message);
        // Non-critical - snapshot will be updated eventually
      }
    } else if (result.linked && result.linkedCount === 0) {
      console.log(`[AuthStore] No linkable anonymous edits found for ${user.login}`);
    } else {
      console.log(`[AuthStore] Could not link anonymous edits for ${user.login}:`, result.reason || result.error);
    }

    // Mark as checked (even if failed, to avoid repeated attempts)
    markAsCheckedForLinking(user.id);
  } catch (error) {
    // Silent failure - don't disrupt user experience
    console.warn(`[AuthStore] Failed to link anonymous edits for ${user.login}:`, error.message);
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
    console.log(`[AuthStore] Snapshot update already in progress for ${username}, skipping`);
    return;
  }

  try {
    // Mark as in progress
    snapshotUpdateInProgress.add(username);

    // Import config store dynamically to avoid circular dependency
    const { useConfigStore } = await import('./configStore');
    const config = useConfigStore.getState().config;

    if (!config?.wiki?.repository) {
      console.log('[AuthStore] Skipping snapshot update: no repository config');
      return;
    }

    const { owner, repo } = config.wiki.repository;

    // Check if snapshot exists
    const existingSnapshot = await getUserSnapshot(owner, repo, username);
    if (existingSnapshot) {
      console.log(`[AuthStore] Snapshot already exists for ${username}, skipping update`);
      return;
    }

    console.log(`[AuthStore] Creating user snapshot for ${username} in background...`);
    await updateUserSnapshot(owner, repo, username);
    console.log(`[AuthStore] ✓ User snapshot created for ${username}`);
  } catch (error) {
    // Silent failure - don't disrupt user experience
    console.warn(`[AuthStore] Failed to create user snapshot for ${username}:`, error.message);
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

        console.log('[AuthStore] Completing login flow...');
        set({ isLoading: true, error: null });

        try {
          // Wait for user to authorize
          console.log('[AuthStore] Waiting for user authorization...');
          const token = await waitForAuthorization(
            deviceFlow.deviceCode,
            deviceFlow.expiresIn,
            deviceFlow.interval
          );

          console.log('[AuthStore] Authorization successful, fetching user info...');
          // Fetch user information
          const user = await fetchGitHubUser(token);

          console.log('[AuthStore] User info fetched:', user.login);
          console.log('[AuthStore] Storing token and initializing Octokit...');

          // Store encrypted token and user
          get().setToken(token);
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            deviceFlow: null,
          });

          console.log('[AuthStore] ✓ Login completed successfully for user:', user.login);

          // Emit user login event for achievement system
          eventBus.emit(EventNames.USER_LOGIN, { user });

          // Update user snapshot in background (non-blocking)
          updateSnapshotInBackground(user.login).catch(err => {
            console.warn('[AuthStore] Snapshot update failed (non-critical):', err);
          });

          // Link anonymous edits in background (non-blocking)
          linkAnonymousEditsInBackground(user).catch(err => {
            console.warn('[AuthStore] Anonymous edit linking failed (non-critical):', err);
          });

          return { user, token };
        } catch (error) {
          console.error('[AuthStore] Login failed:', error.message);
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
        const { token: encryptedToken } = get();

        if (!encryptedToken) {
          console.log('[AuthStore] No stored token found, skipping session restore');
          return false;
        }

        console.log('[AuthStore] Restoring session from stored token...');
        set({ isLoading: true });

        try {
          // Decrypt token
          const token = decryptToken(encryptedToken);

          if (!token) {
            console.error('[AuthStore] Token decryption failed');
            throw new Error('Invalid token');
          }

          console.log('[AuthStore] Token decrypted successfully, validating with GitHub...');

          // Validate token and get user
          const { valid, user, error } = await validateToken(token);

          if (!valid) {
            console.error('[AuthStore] Token validation failed:', error);
            throw new Error(error || 'Invalid token');
          }

          console.log('[AuthStore] Token validated successfully for user:', user.login);

          // Initialize Octokit
          initializeOctokit(token);

          // Update state
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          console.log('[AuthStore] ✓ Session restored successfully');

          return true;
        } catch (error) {
          console.error('[AuthStore] Session restore failed:', error.message);
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
          console.error('Failed to refresh user:', error);
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
