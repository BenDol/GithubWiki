import { create } from 'zustand';
import { persist } from 'zustand/middleware';

/**
 * UI state store
 * Manages UI-related state like sidebar, modals, theme
 */
export const useUIStore = create(
  persist(
    (set) => ({
      // State
      sidebarOpen: true,
      searchOpen: false,
      darkMode: false,
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
          return { darkMode: newDarkMode };
        });
      },

      setDarkMode: (darkMode) => {
        if (darkMode) {
          document.documentElement.classList.add('dark');
        } else {
          document.documentElement.classList.remove('dark');
        }
        set({ darkMode });
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
        darkMode: state.darkMode,
        sidebarOpen: state.sidebarOpen,
      }),
      onRehydrateStorage: () => (state) => {
        // Apply dark mode class on hydration
        if (state?.darkMode) {
          document.documentElement.classList.add('dark');
        }
      },
    }
  )
);
