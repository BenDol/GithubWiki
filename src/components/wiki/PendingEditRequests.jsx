import { useState, useEffect } from 'react';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { getOctokit } from '../../services/github/api';

/**
 * PendingEditRequests component
 * Shows pending PRs (edit requests) for the current page
 */
const PendingEditRequests = ({ sectionId, pageId }) => {
  const { config } = useWikiConfig();
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);

  useEffect(() => {
    const fetchPendingPRs = async () => {
      if (!config?.wiki?.repository?.owner || !config?.wiki?.repository?.repo || !sectionId || !pageId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { owner, repo } = config.wiki.repository;
        const octokit = getOctokit();

        console.log(`[PendingEditRequests] Fetching PRs for ${sectionId}/${pageId}`);

        // Get all open PRs
        const { data: allPRs } = await octokit.rest.pulls.list({
          owner,
          repo,
          state: 'open',
          per_page: 100,
        });

        console.log(`[PendingEditRequests] Found ${allPRs.length} total open PRs`);

        // Filter PRs that affect this page
        // Look for branch names containing the section and page
        const patterns = [
          `wiki-edit/${sectionId}/${pageId}-`,
          `:wiki-edit/${sectionId}/${pageId}-`, // Fork branches
        ];

        const matchingPRs = allPRs.filter(pr => {
          const branchRef = pr.head.label || pr.head.ref;
          return patterns.some(pattern => branchRef.includes(pattern));
        });

        console.log(`[PendingEditRequests] Found ${matchingPRs.length} matching PRs`);

        // Format PR data
        const formattedPRs = matchingPRs.map(pr => ({
          number: pr.number,
          title: pr.title,
          url: pr.html_url,
          author: pr.user.login,
          authorAvatar: pr.user.avatar_url,
          createdAt: pr.created_at,
          updatedAt: pr.updated_at,
        }));

        setPrs(formattedPRs);
      } catch (err) {
        console.error('[PendingEditRequests] Failed to fetch PRs:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchPendingPRs();
  }, [config, sectionId, pageId]);

  // Don't show if loading or no PRs
  if (loading || error || prs.length === 0) {
    return null;
  }

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg overflow-hidden">
      {/* Header - Always visible */}
      <button
        onClick={() => setIsExpanded(!isExpanded)}
        className="w-full px-3 py-2 flex items-center justify-between hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
      >
        <div className="flex items-center space-x-2">
          <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
          </svg>
          <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
            Pending Edits ({prs.length})
          </span>
        </div>
        <svg
          className={`w-4 h-4 text-blue-600 dark:text-blue-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* PR List - Expandable */}
      {isExpanded && (
        <div className="border-t border-blue-200 dark:border-blue-800">
          {prs.map(pr => (
            <a
              key={pr.number}
              href={pr.url}
              target="_blank"
              rel="noopener noreferrer"
              className="block px-3 py-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors border-b border-blue-100 dark:border-blue-800 last:border-b-0"
            >
              <div className="flex items-start space-x-2">
                <img
                  src={pr.authorAvatar}
                  alt={pr.author}
                  className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline space-x-2">
                    <span className="text-xs font-medium text-blue-900 dark:text-blue-200">
                      #{pr.number}
                    </span>
                    <span className="text-xs text-blue-700 dark:text-blue-300 truncate">
                      by {pr.author}
                    </span>
                  </div>
                  <p className="text-xs text-blue-800 dark:text-blue-300 mt-0.5 line-clamp-2">
                    {pr.title}
                  </p>
                </div>
                <svg className="w-3 h-3 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                </svg>
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

export default PendingEditRequests;
