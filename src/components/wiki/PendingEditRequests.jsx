import { useState, useEffect } from 'react';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAuthStore } from '../../store/authStore';
import { getOctokit } from '../../services/github/api';
import { useGitHubDataStore } from '../../store/githubDataStore';

/**
 * PendingEditRequests component
 * Shows pending PRs (edit requests) for the current page
 */
const PendingEditRequests = ({ sectionId, pageId }) => {
  const { config } = useWikiConfig();
  const { user, isAuthenticated } = useAuthStore();
  const [prs, setPrs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isExpanded, setIsExpanded] = useState(false);
  const [closingPR, setClosingPR] = useState(null);

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
        const store = useGitHubDataStore.getState();
        const cacheKey = `${owner}/${repo}/open-prs`;

        console.log(`[PendingEditRequests] Fetching PRs for ${sectionId}/${pageId}`);

        // Check cache first
        let allPRs = store.getCachedPR(cacheKey);

        if (!allPRs) {
          // Cache miss - fetch from API
          console.log('[PendingEditRequests] Cache miss - fetching from GitHub API');
          const octokit = getOctokit();
          store.incrementAPICall();

          const { data } = await octokit.rest.pulls.list({
            owner,
            repo,
            state: 'open',
            per_page: 100,
            // Add sort/updated to get freshest data
            sort: 'updated',
            direction: 'desc',
          });

          allPRs = data;

          // Cache the results
          store.cachePR(cacheKey, allPRs);
          console.log(`[PendingEditRequests] Cached ${allPRs.length} open PRs`);
        } else {
          console.log(`[PendingEditRequests] ✓ Cache hit - using cached PRs (${allPRs.length} PRs)`);
        }

        console.log(`[PendingEditRequests] Found ${allPRs.length} total open PRs`);

        // Filter PRs that affect this page
        // Look for branch names containing the section and page
        const patterns = [
          `wiki-edit/${sectionId}/${pageId}-`,
          `:wiki-edit/${sectionId}/${pageId}-`, // Fork branches
          `anonymous-edit/${sectionId}/${pageId}/`, // Anonymous edits
          `:anonymous-edit/${sectionId}/${pageId}/`, // Fork anonymous edits
        ];

        const matchingPRs = allPRs.filter(pr => {
          const branchRef = pr.head.label || pr.head.ref;
          return patterns.some(pattern => branchRef.includes(pattern));
        });

        console.log(`[PendingEditRequests] Found ${matchingPRs.length} matching PRs for this page`);

        // Helper function to check if PR has anonymous-edit label
        const hasAnonymousLabel = (labels) => {
          return labels.some(label =>
            (typeof label === 'string' && label === 'anonymous-edit') ||
            (typeof label === 'object' && label.name === 'anonymous-edit')
          );
        };

        // Helper function to extract display name from name: label
        const getDisplayNameFromLabels = (labels) => {
          const nameLabel = labels.find(label => {
            const labelName = typeof label === 'string' ? label : label.name;
            return labelName?.startsWith('name:');
          });

          if (nameLabel) {
            const labelName = typeof nameLabel === 'string' ? nameLabel : nameLabel.name;
            return labelName.substring(5); // Remove "name:" prefix
          }
          return null;
        };

        // Format PR data
        const formattedPRs = matchingPRs.map(pr => {
          const isAnonymousPR = hasAnonymousLabel(pr.labels);
          const displayName = isAnonymousPR ? getDisplayNameFromLabels(pr.labels) : null;

          return {
            number: pr.number,
            title: pr.title,
            url: pr.html_url,
            author: pr.user.login,
            authorAvatar: pr.user.avatar_url,
            createdAt: pr.created_at,
            updatedAt: pr.updated_at,
            isAnonymous: isAnonymousPR,
            displayName: displayName,
          };
        });

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

  // Handle closing a PR
  const handleClosePR = async (pr, event) => {
    event.preventDefault();
    event.stopPropagation();

    // Confirm with user
    const confirmed = window.confirm(
      `Are you sure you want to close PR #${pr.number}?\n\n"${pr.title}"\n\nThis action cannot be undone.`
    );

    if (!confirmed) return;

    try {
      setClosingPR(pr.number);
      const { owner, repo } = config.wiki.repository;
      const store = useGitHubDataStore.getState();
      const octokit = getOctokit();

      console.log(`[PendingEditRequests] Closing PR #${pr.number}`);
      store.incrementAPICall();

      // Close the PR
      await octokit.rest.pulls.update({
        owner,
        repo,
        pull_number: pr.number,
        state: 'closed',
      });

      console.log(`[PendingEditRequests] PR #${pr.number} closed successfully`);

      // Invalidate open PRs cache
      const cacheKey = `${owner}/${repo}/open-prs`;
      store.invalidatePRCache(cacheKey);
      console.log('[PendingEditRequests] Invalidated open PRs cache');

      // Also invalidate user's PR cache
      store.invalidatePRsForUser(pr.author);

      // Clean up locally stored PR content
      // The storage key format is: pr-content-${sectionId}-${pageId}-${prNumber}
      // We need to iterate through localStorage to find and remove this PR's content
      try {
        const keysToRemove = [];
        for (let i = 0; i < localStorage.length; i++) {
          const key = localStorage.key(i);
          if (key && key.startsWith('pr-content-') && key.endsWith(`-${pr.number}`)) {
            keysToRemove.push(key);
          }
        }
        if (keysToRemove.length > 0) {
          keysToRemove.forEach(key => localStorage.removeItem(key));
          console.log(`[PendingEditRequests] Cleaned up ${keysToRemove.length} stored content entry for PR #${pr.number}`);
        }
      } catch (err) {
        console.warn('[PendingEditRequests] Failed to clean up stored content:', err);
      }

      // Remove from list
      setPrs(prevPrs => prevPrs.filter(p => p.number !== pr.number));
    } catch (err) {
      console.error('[PendingEditRequests] Failed to close PR:', err);
      alert(`Failed to close PR: ${err.message}`);
    } finally {
      setClosingPR(null);
    }
  };

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
          {prs.map(pr => {
            const isOwnPR = isAuthenticated && user?.login === pr.author;
            const isClosing = closingPR === pr.number;
            const displayAuthor = pr.isAnonymous && pr.displayName ? pr.displayName : pr.author;

            return (
              <div
                key={pr.number}
                className="group relative flex items-start space-x-2 px-3 py-2 hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors border-b border-blue-100 dark:border-blue-800 last:border-b-0"
              >
                {pr.isAnonymous ? (
                  <div className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5 bg-gray-400 dark:bg-gray-600 flex items-center justify-center text-white text-xs font-semibold">
                    A
                  </div>
                ) : (
                  <img
                    src={pr.authorAvatar}
                    alt={pr.author}
                    className="w-5 h-5 rounded-full flex-shrink-0 mt-0.5"
                  />
                )}
                <div className="flex-1 min-w-0">
                  <div className="flex items-baseline space-x-2">
                    <span className="text-xs font-medium text-blue-900 dark:text-blue-200">
                      #{pr.number}
                    </span>
                    <span className="text-xs text-blue-700 dark:text-blue-300 truncate">
                      by {displayAuthor}
                    </span>
                    {isOwnPR && (
                      <span className="text-xs bg-blue-200 dark:bg-blue-800 text-blue-800 dark:text-blue-200 px-1.5 py-0.5 rounded">
                        You
                      </span>
                    )}
                  </div>
                  <p className="text-xs text-blue-800 dark:text-blue-300 mt-0.5 line-clamp-2">
                    {pr.title}
                  </p>
                </div>

                {/* Action buttons */}
                <div className="flex items-center space-x-1 flex-shrink-0">
                  {/* Close button - only for own PRs */}
                  {isOwnPR && (
                    <button
                      onClick={(e) => handleClosePR(pr, e)}
                      disabled={isClosing}
                      title="Close this edit request"
                      className="p-1 rounded hover:bg-red-100 dark:hover:bg-red-900/30 text-red-600 dark:text-red-400 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      {isClosing ? (
                        <svg className="w-3.5 h-3.5 animate-spin" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                        </svg>
                      )}
                    </button>
                  )}

                  {/* External link button */}
                  <a
                    href={pr.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    title="View on GitHub"
                    className="p-1 rounded hover:bg-blue-200 dark:hover:bg-blue-800 text-blue-600 dark:text-blue-400 transition-colors"
                  >
                    <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export default PendingEditRequests;
