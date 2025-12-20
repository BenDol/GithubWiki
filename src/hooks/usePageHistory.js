import { useState, useEffect, useCallback } from 'react';
import { getFileCommits } from '../services/github/api';
import { useWikiConfig } from './useWikiConfig';

/**
 * Hook to fetch page commit history from GitHub with lazy loading support
 */
export const usePageHistory = (sectionId, pageId, perPage = 10) => {
  const { config } = useWikiConfig();
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState(null);
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);

  useEffect(() => {
    const fetchHistory = async () => {
      if (!config || !sectionId || !pageId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { owner, repo, contentPath } = config.wiki.repository;
        const filePath = `${contentPath}/${sectionId}/${pageId}.md`;

        const result = await getFileCommits(owner, repo, filePath, 1, perPage);
        setCommits(result.commits);
        setHasMore(result.hasMore);
        setCurrentPage(1);

        // If no commits, don't treat it as an error (file just hasn't been pushed yet)
        if (result.commits.length === 0) {
          setError(null);
        }
      } catch (err) {
        console.error('Failed to fetch page history:', err);
        setError(err.message || 'Failed to load page history');
        setCommits([]);
        setHasMore(false);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [config, sectionId, pageId, perPage]);

  const loadMore = useCallback(async () => {
    if (!config || !sectionId || !pageId || loadingMore || !hasMore) {
      return;
    }

    try {
      setLoadingMore(true);
      const { owner, repo, contentPath } = config.wiki.repository;
      const filePath = `${contentPath}/${sectionId}/${pageId}.md`;
      const nextPage = currentPage + 1;

      const result = await getFileCommits(owner, repo, filePath, nextPage, perPage);

      setCommits(prev => [...prev, ...result.commits]);
      setHasMore(result.hasMore);
      setCurrentPage(nextPage);
    } catch (err) {
      console.error('Failed to load more commits:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [config, sectionId, pageId, currentPage, perPage, loadingMore, hasMore]);

  return { commits, loading, loadingMore, error, hasMore, loadMore };
};
