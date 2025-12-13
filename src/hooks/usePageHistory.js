import { useState, useEffect } from 'react';
import { getFileCommits } from '../services/github/api';
import { useWikiConfig } from './useWikiConfig';

/**
 * Hook to fetch page commit history from GitHub
 */
export const usePageHistory = (sectionId, pageId) => {
  const { config } = useWikiConfig();
  const [commits, setCommits] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

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

        const commitHistory = await getFileCommits(owner, repo, filePath);
        setCommits(commitHistory);
      } catch (err) {
        console.error('Failed to fetch page history:', err);
        setError(err.message || 'Failed to load page history');
        setCommits([]);
      } finally {
        setLoading(false);
      }
    };

    fetchHistory();
  }, [config, sectionId, pageId]);

  return { commits, loading, error };
};
