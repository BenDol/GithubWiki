import { create } from 'zustand';

/**
 * Wiki content store
 * Manages wiki pages, content, and metadata
 */
export const useWikiStore = create((set, get) => ({
  // State
  currentPage: null,
  pageContent: '',
  pageMetadata: null,
  isLoading: false,
  error: null,
  pages: {},

  // Actions
  setCurrentPage: (page) => set({ currentPage: page }),

  setPageContent: (content) => set({ pageContent: content }),

  setPageMetadata: (metadata) => set({ pageMetadata: metadata }),

  setLoading: (isLoading) => set({ isLoading }),

  setError: (error) => set({ error }),

  clearError: () => set({ error: null }),

  // Cache page content
  cachePage: (pageId, content, metadata) => {
    const { pages } = get();
    set({
      pages: {
        ...pages,
        [pageId]: { content, metadata, cachedAt: Date.now() },
      },
    });
  },

  // Get cached page
  getCachedPage: (pageId) => {
    const { pages } = get();
    const cached = pages[pageId];

    // Return cached page if it's less than 5 minutes old
    if (cached && Date.now() - cached.cachedAt < 5 * 60 * 1000) {
      return cached;
    }

    return null;
  },
}));
