import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * Detect system dark mode preference
 */
const getSystemDarkMode = () => {
  if (typeof window === 'undefined') return false;
  return window.matchMedia && window.matchMedia('(prefers-color-scheme: dark)').matches;
};

/**
 * UI state store
 * Manages UI-related state like sidebar, modals, theme
 */
export const useUIStore = create(
  persist(
    (set, get) => ({
      // State
      sidebarOpen: true,
      searchOpen: false,
      darkMode: getSystemDarkMode(), // Initialize from system preference
      userPreference: null, // null = follow system, true/false = user override
      activeModal: null,
      toasts: [],

      // Actions
      toggleSidebar: () => set((state) => ({ sidebarOpen: !state.sidebarOpen })),

      setSidebarOpen: (open) => set({ sidebarOpen: open }),

      toggleSearch: () => set((state) => ({ searchOpen: !state.searchOpen })),

      setSearchOpen: (open) => set({ searchOpen: open }),

      toggleDarkMode: () => {
        set((state) => {
          const newDarkMode = !state.darkMode;
          // Update document class for Tailwind dark mode
          if (newDarkMode) {
            document.documentElement.classList.add('dark');
          } else {
            document.documentElement.classList.remove('dark');
          }
          // User manually toggled, so save their preference
          return { darkMode: newDarkMode, userPreference: newDarkMode };
        });
      },

      setDarkMode: (darkMode, isUserAction = false) => {
        if (darkMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        // If user action, save preference. Otherwise, just update state (for system changes)
        set({
          darkMode,
          ...(isUserAction && { userPreference: darkMode })
        });
      },

      // Reset to system preference
      useSystemTheme: () => {
        const systemDarkMode = getSystemDarkMode();
        if (systemDarkMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        set({ darkMode: systemDarkMode, userPreference: null });
      },

      openModal: (modalName) => set({ activeModal: modalName }),

      closeModal: () => set({ activeModal: null }),

      // Toast actions
      addToast: (message, type = 'info', duration = 3000) => {
        const id = Date.now() + Math.random();
        set((state) => ({
          toasts: [...state.toasts, { id, message, type, duration }],
        }));
        return id;
      },

      removeToast: (id) => {
        set((state) => ({
          toasts: state.toasts.filter((toast) => toast.id !== id),
        }));
      },

      clearToasts: () => set({ toasts: [] }),
    }),
    {
      name: 'wiki-ui-storage',
      partialize: (state) => ({
        userPreference: state.userPreference, // Save user's explicit preference (or null for system)
        sidebarOpen: state.sidebarOpen,
      }),
      onRehydrateStorage: () => (state) => {
        if (!state) return;

        // Determine effective dark mode
        let effectiveDarkMode;
        if (state.userPreference !== null) {
          // User has explicitly set a preference
          effectiveDarkMode = state.userPreference;
        } else {
          // Follow system preference
          effectiveDarkMode = getSystemDarkMode();
        }

        // Apply dark mode class on hydration
        if (effectiveDarkMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }

        // Update state with effective dark mode
        state.darkMode = effectiveDarkMode;

        // Listen for system theme changes (only if user hasn't set a preference)
        if (typeof window !== 'undefined' && window.matchMedia) {
          const mediaQuery = window.matchMedia('(prefers-color-scheme: dark)');
          const listener = (e) => {
            const currentState = useUIStore.getState();
            // Only update if user hasn't set an explicit preference
            if (currentState.userPreference === null) {
              if (e.matches) {
                document.documentElement.classList.add('dark');
              } else {
                document.documentElement.classList.remove('dark');
              }
              useUIStore.setState({ darkMode: e.matches });
            }
          };

          // Add listener (modern browsers)
          if (mediaQuery.addEventListener) {
            mediaQuery.addEventListener('change', listener);
          } else {
            // Fallback for older browsers
            mediaQuery.addListener(listener);
          }
        }
      },
    }
  )
);
