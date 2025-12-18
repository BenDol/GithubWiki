import { create } from 'zustand';
import { persist } from 'zustand/middleware';

const useProgressStore = create(
  persist(
    (set, get) => ({
      progress: {},

      // Check if item is completed
      isCompleted: (category, item) => {
        return get().progress[category]?.[item] || false;
      },

      // Toggle completion status
      toggleItem: (category, item) => {
        set((state) => ({
          progress: {
            ...state.progress,
            [category]: {
              ...state.progress[category],
              [item]: !state.progress[category]?.[item],
            },
          },
        }));
      },

      // Set multiple items at once
      setProgress: (progressData) => {
        set({ progress: progressData });
      },

      // Clear all progress
      clearProgress: () => {
        set({ progress: {} });
      },

      // Get completion percentage for a category
      getCategoryProgress: (category, totalItems) => {
        const categoryProgress = get().progress[category] || {};
        const completed = Object.values(categoryProgress).filter(Boolean).length;
        return totalItems > 0 ? Math.round((completed / totalItems) * 100) : 0;
      },

      // Export progress as JSON
      exportProgress: () => {
        return JSON.stringify(get().progress, null, 2);
      },

      // Import progress from JSON
      importProgress: (jsonString) => {
        try {
          const imported = JSON.parse(jsonString);
          set({ progress: imported });
          return true;
        } catch (error) {
          console.error('Failed to import progress:', error);
          return false;
        }
      },
    }),
    {
      name: 'wiki-progress', // Generic key for all wiki projects
    }
  )
);

export default useProgressStore;
