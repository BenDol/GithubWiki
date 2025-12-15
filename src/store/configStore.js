import { create } from 'zustand';

// Cache config for 5 minutes (longer than other caches since config rarely changes)
const CONFIG_CACHE_TTL = 5 * 60 * 1000;

/**
 * Centralized store for wiki configuration with caching
 * This prevents multiple components from fetching the config repeatedly
 */
export const useConfigStore = create((set, get) => ({
  // Cached config data
  config: null,
  cachedAt: null,

  // Loading state
  loading: false,
  error: null,

  /**
   * Load config from server (with caching)
   * Returns cached config if still valid, otherwise fetches fresh
   */
  loadConfig: async () => {
    const state = get();

    // Check if we have a valid cached config
    if (state.config && state.cachedAt) {
      const age = Date.now() - state.cachedAt;
      if (age < CONFIG_CACHE_TTL) {
        console.log('[Config Cache] ✓ Using cached config (age: ' + Math.round(age / 1000) + 's)');
        return state.config;
      } else {
        console.log('[Config Cache] ✗ Cache expired, fetching fresh config');
      }
    } else {
      console.log('[Config Cache] ✗ No cache, fetching config');
    }

    // Fetch fresh config
    set({ loading: true, error: null });

    try {
      // Use import.meta.env.BASE_URL to respect Vite's base path
      const response = await fetch(`${import.meta.env.BASE_URL}wiki-config.json`);

      if (!response.ok) {
        throw new Error('Failed to load wiki configuration');
      }

      const data = await response.json();

      // Validate required fields
      if (!data.wiki || !data.sections) {
        throw new Error('Invalid wiki configuration format');
      }

      // Sort sections by order
      data.sections.sort((a, b) => a.order - b.order);

      // Cache the config
      set({
        config: data,
        cachedAt: Date.now(),
        loading: false,
        error: null,
      });

      console.log('[Config Cache] ✓ Config loaded and cached');
      return data;
    } catch (err) {
      console.error('[Config Cache] Failed to load config:', err);
      set({
        loading: false,
        error: err.message,
      });
      throw err;
    }
  },

  /**
   * Force refresh config (bypasses cache)
   * Useful when you know the config has changed
   */
  refreshConfig: async () => {
    console.log('[Config Cache] 🔄 Force refreshing config');
    set({ config: null, cachedAt: null });
    return get().loadConfig();
  },

  /**
   * Clear the config cache
   */
  clearCache: () => {
    console.log('[Config Cache] 🧹 Clearing cache');
    set({ config: null, cachedAt: null });
  },
}));
