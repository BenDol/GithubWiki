import { useState, useEffect, useMemo } from 'react';
import Fuse from 'fuse.js';

/**
 * Hook for full-text search using Fuse.js
 * Loads search index and provides search functionality
 */
export const useSearch = () => {
  const [searchIndex, setSearchIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // Load search index on mount
  useEffect(() => {
    const loadSearchIndex = async () => {
      try {
        setLoading(true);
        const response = await fetch('/search-index.json');

        if (!response.ok) {
          throw new Error('Failed to load search index');
        }

        const data = await response.json();
        setSearchIndex(data);
        setError(null);
      } catch (err) {
        console.error('Error loading search index:', err);
        setError(err.message);
        setSearchIndex([]);
      } finally {
        setLoading(false);
      }
    };

    loadSearchIndex();
  }, []);

  // Configure Fuse.js
  const fuse = useMemo(() => {
    if (!searchIndex) return null;

    return new Fuse(searchIndex, {
      keys: [
        { name: 'title', weight: 3 },
        { name: 'description', weight: 2 },
        { name: 'content', weight: 1 },
        { name: 'tags', weight: 2 },
        { name: 'category', weight: 1.5 },
      ],
      threshold: 0.4,
      includeScore: true,
      includeMatches: true,
      minMatchCharLength: 2,
    });
  }, [searchIndex]);

  return { searchIndex, fuse, loading, error };
};

/**
 * Perform a search query
 */
export const performSearch = (fuse, query) => {
  if (!fuse || !query || query.trim().length < 2) {
    return [];
  }

  const results = fuse.search(query);

  // Transform results
  return results.map((result) => ({
    ...result.item,
    score: result.score,
    matches: result.matches,
  }));
};

/**
 * Filter search results by section
 */
export const filterBySection = (results, section) => {
  if (!section) return results;
  return results.filter((result) => result.section === section);
};

/**
 * Filter search results by tag
 */
export const filterByTag = (results, tag) => {
  if (!tag) return results;
  return results.filter((result) => result.tags.includes(tag));
};

/**
 * Get all unique tags from search index
 */
export const getAllTags = (searchIndex) => {
  if (!searchIndex) return [];

  const tags = new Set();
  searchIndex.forEach((item) => {
    if (item.tags) {
      item.tags.forEach((tag) => tags.add(tag));
    }
  });

  return Array.from(tags).sort();
};

/**
 * Get all unique categories from search index
 */
export const getAllCategories = (searchIndex) => {
  if (!searchIndex) return [];

  const categories = new Set();
  searchIndex.forEach((item) => {
    if (item.category) {
      categories.add(item.category);
    }
  });

  return Array.from(categories).sort();
};
