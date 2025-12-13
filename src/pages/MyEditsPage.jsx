import { useState, useEffect, useRef } from 'react';
import { Link } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useWikiConfig } from '../hooks/useWikiConfig';
import { getUserPullRequests, closePullRequest } from '../services/github/pullRequests';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PrestigeAvatar from '../components/common/PrestigeAvatar';
import { getPrestigeTier, getProgressToNextTier } from '../utils/prestige';

/**
 * MyEditsPage - Display user's pending pull requests (edits/creations)
 */
const MyEditsPage = () => {
  const { user, isAuthenticated } = useAuthStore();
  const { config } = useWikiConfig();
  const [pullRequests, setPullRequests] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [closingPR, setClosingPR] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedPRs, setExpandedPRs] = useState(new Set());
  const [showClosed, setShowClosed] = useState(false);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Ref for Edit Requests section
  const editRequestsRef = useRef(null);

  useEffect(() => {
    const loadPullRequests = async () => {
      // Keep loading until config is available
      if (!config) {
        return;
      }

      // If not authenticated, stop loading
      if (!isAuthenticated || !user) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { owner, repo } = config.wiki.repository;
        let prs = await getUserPullRequests(owner, repo, user.login);

        // DEV: Add fake PRs for testing pagination
        const ENABLE_FAKE_PRS = false; // Set to true to enable fake test data
        if (import.meta.env.DEV && ENABLE_FAKE_PRS) {
          const fakePRs = Array.from({ length: 5 }, (_, i) => ({
            id: 999000 + i,
            number: 1000 + i,
            title: `[TEST] Fake Pull Request ${i + 1} - ${i === 0 ? 'MERGED' : i === 1 ? 'OPEN' : 'CLOSED'}`,
            user: {
              login: user.login,
              avatar_url: user.avatar_url,
              html_url: `https://github.com/${user.login}`
            },
            state: i === 0 ? 'merged' : i === 1 ? 'open' : 'closed',
            created_at: new Date(Date.now() - i * 86400000).toISOString(),
            html_url: `https://github.com/${owner}/${repo}/pull/${1000 + i}`,
            changed_files: Math.floor(Math.random() * 10) + 1,
            additions: Math.floor(Math.random() * 500) + 10,
            deletions: Math.floor(Math.random() * 200) + 5,
            labels: i % 3 === 0 ? [{ id: i, name: 'enhancement', color: '84b6eb' }] : [],
            merged_at: i === 0 ? new Date(Date.now() - i * 86400000).toISOString() : null
          }));
          prs = [...prs, ...fakePRs];
          console.log('[MyEdits] Added 5 fake PRs for testing (1 merged, 1 open, 3 closed)');
        }

        setPullRequests(prs);
      } catch (err) {
        console.error('Failed to load pull requests:', err);
        setError('Failed to load your edits. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadPullRequests();
  }, [isAuthenticated, user, config, refreshKey]);

  // Reset to page 1 when filter changes
  useEffect(() => {
    setCurrentPage(1);
  }, [showClosed]);

  // Scroll to Edit Requests section when page changes
  useEffect(() => {
    if (editRequestsRef.current) {
      editRequestsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentPage]);

  const handleRefresh = () => {
    setRefreshKey(prev => prev + 1);
  };

  const togglePRExpanded = (prNumber) => {
    setExpandedPRs(prev => {
      const newSet = new Set(prev);
      if (newSet.has(prNumber)) {
        newSet.delete(prNumber);
      } else {
        newSet.add(prNumber);
      }
      return newSet;
    });
  };

  const handleClosePR = async (prNumber) => {
    if (!config) return;

    const confirmClose = window.confirm(
      'Are you sure you want to cancel this edit? This will close the edit request and cannot be undone.'
    );

    if (!confirmClose) return;

    try {
      setClosingPR(prNumber);
      const { owner, repo } = config.wiki.repository;
      await closePullRequest(owner, repo, prNumber);

      // Remove the closed PR from the list immediately
      setPullRequests(prs => prs.filter(pr => pr.number !== prNumber));

      // Refresh after a short delay to get updated data from GitHub
      setTimeout(() => {
        handleRefresh();
      }, 2000);
    } catch (err) {
      console.error('Failed to close pull request:', err);
      alert('Failed to cancel the edit. Please try again or close it manually on GitHub.');
    } finally {
      setClosingPR(null);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading your edits...</p>
        </div>
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">🔒</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Authentication Required
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          You need to sign in with GitHub to view your edits.
        </p>
        <Link
          to="/"
          className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
        >
          Go to Home
        </Link>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
            Error Loading Edits
          </h3>
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  const getStatusBadge = (pr) => {
    // Check if PR was merged (GitHub returns state='closed' for both closed and merged)
    const isMerged = pr.merged_at || pr.state === 'merged';

    const badges = {
      open: { color: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-200', text: 'Open' },
      closed: { color: 'bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200', text: 'Closed' },
      merged: { color: 'bg-purple-100 text-purple-800 dark:bg-purple-900 dark:text-purple-200', text: 'Merged' },
    };

    let badge;
    if (isMerged) {
      badge = badges.merged;
    } else if (pr.state === 'open') {
      badge = badges.open;
    } else {
      badge = badges.closed;
    }

    return (
      <span className={`px-2 py-1 text-xs font-medium rounded-full ${badge.color}`}>
        {badge.text}
      </span>
    );
  };

  // Filter pull requests based on showClosed state
  const filteredPullRequests = showClosed
    ? pullRequests
    : pullRequests.filter(pr => pr.state === 'open');

  // Calculate pagination
  const totalPages = Math.ceil(filteredPullRequests.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedPullRequests = filteredPullRequests.slice(startIndex, endIndex);

  // Calculate contribution statistics (from all PRs, not just filtered)
  const stats = {
    totalPRs: pullRequests.length,
    openPRs: pullRequests.filter(pr => pr.state === 'open').length,
    mergedPRs: pullRequests.filter(pr => pr.merged_at || pr.state === 'merged').length,
    closedPRs: pullRequests.filter(pr => (pr.state === 'closed' || pr.state === 'merged') && !pr.merged_at).length,
    totalAdditions: pullRequests.reduce((sum, pr) => sum + (pr.additions || 0), 0),
    totalDeletions: pullRequests.reduce((sum, pr) => sum + (pr.deletions || 0), 0),
    totalFiles: pullRequests.reduce((sum, pr) => sum + (pr.changed_files || 0), 0),
    mostRecentEdit: pullRequests.length > 0
      ? new Date(Math.max(...pullRequests.map(pr => new Date(pr.created_at).getTime())))
      : null,
  };

  // Get prestige tier and progress
  const prestigeTier =
    config?.prestige?.enabled && config?.prestige?.tiers
      ? getPrestigeTier(stats, config.prestige.tiers)
      : null;

  const progressToNextTier =
    prestigeTier && config?.prestige?.tiers
      ? getProgressToNextTier(stats, prestigeTier, config.prestige.tiers)
      : null;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            My Edits
          </h1>
          <button
            onClick={handleRefresh}
            disabled={loading}
            className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            <svg
              className={`w-4 h-4 mr-2 ${loading ? 'animate-spin' : ''}`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
            </svg>
            {loading ? 'Refreshing...' : 'Refresh'}
          </button>
        </div>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          View and manage your pending wiki contributions
        </p>

        {/* Prestige Badge Display */}
        {prestigeTier && user && (
          <div className="mt-6 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg p-6 border border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-6">
              {/* Avatar with Prestige Badge */}
              <PrestigeAvatar
                src={user.avatar_url}
                alt={user.name || user.login}
                size="2xl"
                stats={stats}
                showBadge={true}
              />

              {/* Prestige Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-2">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {prestigeTier.title}
                  </h3>
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  {user.name || user.login}
                </p>

                {/* Progress to next tier */}
                {progressToNextTier ? (
                  <div>
                    <div className="flex items-center justify-between text-sm mb-2">
                      <span className="text-gray-700 dark:text-gray-300">
                        Progress to <span className="font-medium">{progressToNextTier.nextTier.title}</span>
                      </span>
                      <span className="font-medium text-gray-900 dark:text-white">
                        {progressToNextTier.percentage}%
                      </span>
                    </div>
                    <div className="h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                        style={{ width: `${progressToNextTier.percentage}%` }}
                      />
                    </div>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1">
                      {Math.ceil(progressToNextTier.required - progressToNextTier.current)} more contribution{Math.ceil(progressToNextTier.required - progressToNextTier.current) !== 1 ? 's' : ''} needed
                    </p>
                  </div>
                ) : (
                  <div className="flex items-center gap-2 text-sm">
                    <span className="inline-flex items-center px-3 py-1 rounded-full text-xs font-medium bg-yellow-100 text-yellow-800 dark:bg-yellow-900 dark:text-yellow-200">
                      Max Tier Achieved
                    </span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Statistics Section */}
      {pullRequests.length > 0 && (
        <div className="mb-8">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
            Contribution Statistics
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Total PRs */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Total Edits
                </h3>
                <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {stats.totalPRs}
              </p>
              <div className="mt-2 flex items-center gap-2 text-xs">
                <span className="text-green-600 dark:text-green-400">{stats.openPRs} open</span>
                <span className="text-purple-600 dark:text-purple-400">{stats.mergedPRs} merged</span>
                {stats.closedPRs > 0 && (
                  <span className="text-gray-600 dark:text-gray-400">{stats.closedPRs} closed</span>
                )}
              </div>
            </div>

            {/* Total Additions */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Lines Added
                </h3>
                <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
                </svg>
              </div>
              <p className="text-3xl font-bold text-green-600 dark:text-green-400">
                +{stats.totalAdditions.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                across all contributions
              </p>
            </div>

            {/* Total Deletions */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Lines Removed
                </h3>
                <svg className="w-5 h-5 text-red-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20 12H4" />
                </svg>
              </div>
              <p className="text-3xl font-bold text-red-600 dark:text-red-400">
                -{stats.totalDeletions.toLocaleString()}
              </p>
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                across all contributions
              </p>
            </div>

            {/* Total Files */}
            <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
              <div className="flex items-center justify-between mb-2">
                <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400">
                  Files Changed
                </h3>
                <svg className="w-5 h-5 text-purple-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 21h10a2 2 0 002-2V9.414a1 1 0 00-.293-.707l-5.414-5.414A1 1 0 0012.586 3H7a2 2 0 00-2 2v14a2 2 0 002 2z" />
                </svg>
              </div>
              <p className="text-3xl font-bold text-gray-900 dark:text-white">
                {stats.totalFiles}
              </p>
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400">
                {stats.mostRecentEdit && (
                  <>Last edit {new Date(stats.mostRecentEdit).toLocaleDateString()}</>
                )}
              </p>
            </div>
          </div>

          {/* Net Changes Bar */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h3 className="text-sm font-medium text-gray-600 dark:text-gray-400 mb-3">
              Net Changes
            </h3>
            <div className="flex items-center gap-4">
              <div className="flex-1">
                <div className="h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden flex">
                  <div
                    className="bg-green-500 dark:bg-green-400 h-full transition-all"
                    style={{
                      width: `${stats.totalAdditions + stats.totalDeletions > 0
                        ? (stats.totalAdditions / (stats.totalAdditions + stats.totalDeletions)) * 100
                        : 50
                      }%`
                    }}
                  />
                  <div
                    className="bg-red-500 dark:bg-red-400 h-full transition-all"
                    style={{
                      width: `${stats.totalAdditions + stats.totalDeletions > 0
                        ? (stats.totalDeletions / (stats.totalAdditions + stats.totalDeletions)) * 100
                        : 50
                      }%`
                    }}
                  />
                </div>
              </div>
              <div className="text-sm font-medium text-gray-900 dark:text-white whitespace-nowrap">
                {stats.totalAdditions > stats.totalDeletions ? '+' : ''}
                {(stats.totalAdditions - stats.totalDeletions).toLocaleString()} lines
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter controls */}
      {pullRequests.length > 0 && (
        <div ref={editRequestsRef} className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              Edit Requests
            </h2>
            {filteredPullRequests.length > 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Showing {startIndex + 1}-{Math.min(endIndex, filteredPullRequests.length)} of {filteredPullRequests.length}
              </p>
            )}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Show closed:
            </span>
            <button
              onClick={() => setShowClosed(!showClosed)}
              className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${
                showClosed
                  ? 'bg-blue-600'
                  : 'bg-gray-300 dark:bg-gray-600'
              }`}
            >
              <span
                className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${
                  showClosed ? 'translate-x-6' : 'translate-x-1'
                }`}
              />
            </button>
          </div>
        </div>
      )}

      {/* Pull requests list */}
      {filteredPullRequests.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-12 text-center">
          <div className="text-gray-400 text-6xl mb-4">📝</div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            {pullRequests.length === 0 ? 'No Edits Yet' : 'No Open Edits'}
          </h2>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            {pullRequests.length === 0
              ? "You haven't created any wiki edits yet. Start contributing by editing a page!"
              : 'You have no open edits. Enable "Show closed edits" to see your closed and merged contributions.'
            }
          </p>
          {pullRequests.length === 0 && (
            <Link
              to="/"
              className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              Browse Wiki
            </Link>
          )}
        </div>
      ) : (
        <>
        <div className="space-y-4">
          {paginatedPullRequests.map((pr) => {
            const isExpanded = expandedPRs.has(pr.number);
            const isClosed = pr.state === 'closed' || pr.state === 'merged';
            const isMerged = pr.state === 'merged' || pr.merged_at;

            return (
            <div
              key={pr.number}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
            >
              {/* Collapsed view for closed PRs */}
              {isClosed && !isExpanded ? (
                <button
                  onClick={() => togglePRExpanded(pr.number)}
                  className="w-full p-4 flex items-center justify-between hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
                >
                  <div className="flex items-center gap-3 flex-1 min-w-0">
                    <PrestigeAvatar
                      src={pr.user.avatar_url}
                      alt={pr.user.login}
                      size="md"
                      stats={pr.user.login === user?.login ? stats : null}
                      showBadge={pr.user.login === user?.login}
                      className="flex-shrink-0"
                    />
                    <div className="flex-1 min-w-0 text-left">
                      <h3 className="text-base font-medium text-gray-900 dark:text-white truncate">
                        {pr.title}
                      </h3>
                      <p className="text-xs text-gray-600 dark:text-gray-400">
                        #{pr.number} • {getStatusBadge(pr)}
                      </p>
                    </div>
                  </div>
                  <div className="flex items-center gap-2 flex-shrink-0">
                    {/* Merged checkmark icon */}
                    {isMerged && (
                      <div className="flex items-center justify-center w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                        <svg
                          className="w-5 h-5 text-purple-600 dark:text-purple-400"
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                        </svg>
                      </div>
                    )}
                    {/* Expand arrow */}
                    <svg
                      className="w-5 h-5 text-gray-400"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </div>
                </button>
              ) : (
                /* Expanded view */
                <div className="p-6">
                  <div className="flex items-start justify-between">
                    <div className="flex-1 min-w-0">
                      {/* Title and status */}
                      <div className="flex items-center gap-3 mb-2">
                        <h3 className="text-lg font-semibold text-gray-900 dark:text-white truncate">
                          {pr.title}
                        </h3>
                        {getStatusBadge(pr)}
                        {/* Merged checkmark icon */}
                        {isMerged && (
                          <div className="flex items-center justify-center w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-full">
                            <svg
                              className="w-5 h-5 text-purple-600 dark:text-purple-400"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2.5} d="M5 13l4 4L19 7" />
                            </svg>
                          </div>
                        )}
                        {isClosed && (
                          <button
                            onClick={() => togglePRExpanded(pr.number)}
                            className="ml-auto text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
                            title="Collapse"
                          >
                            <svg
                              className="w-5 h-5"
                              fill="none"
                              stroke="currentColor"
                              viewBox="0 0 24 24"
                            >
                              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                            </svg>
                          </button>
                        )}
                      </div>

                      {/* PR number and created date */}
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                        #{pr.number} opened {new Date(pr.created_at).toLocaleDateString()} by {pr.user.login}
                      </p>

                      {/* Changes stats */}
                      <div className="flex items-center gap-4 mb-3 text-sm">
                        {pr.changed_files !== undefined && (
                          <span className="text-gray-700 dark:text-gray-300">
                            <span className="font-medium">{pr.changed_files}</span> file{pr.changed_files !== 1 ? 's' : ''} changed
                          </span>
                        )}
                        {pr.additions !== undefined && (
                          <span className="text-green-600 dark:text-green-400 font-medium">
                            +{pr.additions}
                          </span>
                        )}
                        {pr.deletions !== undefined && (
                          <span className="text-red-600 dark:text-red-400 font-medium">
                            -{pr.deletions}
                          </span>
                        )}
                      </div>

                      {/* Labels */}
                      {pr.labels && pr.labels.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {pr.labels.map((label) => (
                            <span
                              key={label.id}
                              className="px-2 py-0.5 text-xs font-medium rounded-full"
                              style={{
                                backgroundColor: `#${label.color}20`,
                                color: `#${label.color}`,
                              }}
                            >
                              {label.name}
                            </span>
                          ))}
                        </div>
                      )}

                      {/* Actions */}
                      <div className="flex items-center gap-2 mt-4">
                        <a
                          href={pr.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
                        >
                          View on GitHub
                          <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                          </svg>
                        </a>

                        {pr.state === 'open' && (
                          <button
                            onClick={() => handleClosePR(pr.number)}
                            disabled={closingPR === pr.number}
                            className="inline-flex items-center px-3 py-1.5 text-sm text-red-600 dark:text-red-400 hover:text-red-800 dark:hover:text-red-300 font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                          >
                            {closingPR === pr.number ? (
                              <>
                                <LoadingSpinner size="sm" />
                                <span className="ml-2">Canceling...</span>
                              </>
                            ) : (
                              <>
                                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                                </svg>
                                Cancel Edit
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </div>

                    {/* Avatar */}
                    <PrestigeAvatar
                      src={pr.user.avatar_url}
                      alt={pr.user.login}
                      size="lg"
                      stats={pr.user.login === user?.login ? stats : null}
                      showBadge={pr.user.login === user?.login}
                      className="ml-4 flex-shrink-0"
                    />
                  </div>
                </div>
              )}
            </div>
            );
          })}
        </div>

        {/* Pagination Controls */}
        {totalPages > 1 && (
          <div className="mt-8 flex items-center justify-center gap-2">
            {/* Previous button */}
            <button
              onClick={() => setCurrentPage(prev => Math.max(1, prev - 1))}
              disabled={currentPage === 1}
              className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 19l-7-7 7-7" />
              </svg>
            </button>

            {/* Page numbers */}
            <div className="flex items-center gap-1">
              {Array.from({ length: totalPages }, (_, i) => i + 1).map((pageNum) => {
                // Show first page, last page, current page, and pages around current
                const showPage =
                  pageNum === 1 ||
                  pageNum === totalPages ||
                  (pageNum >= currentPage - 1 && pageNum <= currentPage + 1);

                // Show ellipsis
                const showEllipsisBefore = pageNum === currentPage - 2 && currentPage > 3;
                const showEllipsisAfter = pageNum === currentPage + 2 && currentPage < totalPages - 2;

                if (showEllipsisBefore || showEllipsisAfter) {
                  return (
                    <span key={pageNum} className="px-2 text-gray-500 dark:text-gray-400">
                      ...
                    </span>
                  );
                }

                if (!showPage) return null;

                return (
                  <button
                    key={pageNum}
                    onClick={() => setCurrentPage(pageNum)}
                    className={`min-w-[40px] px-3 py-2 text-sm font-medium rounded-lg transition-colors ${
                      currentPage === pageNum
                        ? 'bg-blue-500 text-white'
                        : 'text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 hover:bg-gray-50 dark:hover:bg-gray-700'
                    }`}
                  >
                    {pageNum}
                  </button>
                );
              })}
            </div>

            {/* Next button */}
            <button
              onClick={() => setCurrentPage(prev => Math.min(totalPages, prev + 1))}
              disabled={currentPage === totalPages}
              className="px-3 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </button>

            {/* Page info */}
            <span className="ml-4 text-sm text-gray-600 dark:text-gray-400">
              Page {currentPage} of {totalPages} ({filteredPullRequests.length} total)
            </span>
          </div>
        )}
        </>
      )}
    </div>
  );
};

export default MyEditsPage;
