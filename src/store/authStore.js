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

/**
 * Authentication store using Zustand
 * Manages user authentication state and GitHub OAuth
 */
export const useAuthStore = create(
  persist(
    (set, get) => ({
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

        set({ isLoading: true, error: null });

        try {
          // Wait for user to authorize
          const token = await waitForAuthorization(
            deviceFlow.deviceCode,
            deviceFlow.expiresIn,
            deviceFlow.interval
          );

          // Fetch user information
          const user = await fetchGitHubUser(token);

          // Store encrypted token and user
          get().setToken(token);
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            deviceFlow: null,
          });

          return { user, token };
        } catch (error) {
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
        clearOctokit();
        set({
          user: null,
          token: null,
          isAuthenticated: false,
          error: null,
          deviceFlow: null,
        });
      },

      /**
       * Validate and restore session from stored token
       */
      restoreSession: async () => {
        const { token: encryptedToken } = get();

        if (!encryptedToken) {
          return false;
        }

        set({ isLoading: true });

        try {
          // Decrypt token
          const token = decryptToken(encryptedToken);

          if (!token) {
            throw new Error('Invalid token');
          }

          // Validate token and get user
          const { valid, user, error } = await validateToken(token);

          if (!valid) {
            throw new Error(error || 'Invalid token');
          }

          // Initialize Octokit
          initializeOctokit(token);

          // Update state
          set({
            user,
            isAuthenticated: true,
            isLoading: false,
            error: null,
          });

          return true;
        } catch (error) {
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
    }),
    {
      name: 'wiki-auth-storage',
      partialize: (state) => ({
        user: state.user,
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    }
  )
);
