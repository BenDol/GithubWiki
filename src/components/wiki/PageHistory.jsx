import { useState, useEffect, useRef, useMemo } from 'react';
import { formatDistance } from 'date-fns';
import { Link } from 'react-router-dom';
import { usePageHistory } from '../../hooks/usePageHistory';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAuthStore } from '../../store/authStore';
import { useDisplayNames } from '../../hooks/useDisplayName';
import LoadingSpinner from '../common/LoadingSpinner';
import PrestigeAvatar from '../common/PrestigeAvatar';
import UserActionMenu from '../common/UserActionMenu';
import { addAdmin } from '../../services/adminActions';

/**
 * PageHistory component
 * Displays commit history for a wiki page from GitHub
 */
const PageHistory = ({ sectionId, pageId }) => {
  const { config } = useWikiConfig();
  const { user } = useAuthStore();
  const { commits, loading, loadingMore, error, hasMore, loadMore } = usePageHistory(sectionId, pageId, 10);

  // Extract unique commit authors for display name fetching (exclude bot/anonymous)
  const botUsername = import.meta.env.VITE_WIKI_BOT_USERNAME;
  const commitAuthors = useMemo(() =>
    commits
      .filter(c => c.author.username && c.author.username !== botUsername)
      .map(c => ({ id: c.author.userId, login: c.author.username })),
    [commits, botUsername]
  );
  const { displayNames } = useDisplayNames(commitAuthors);

  // User action menu state
  const [showUserActionMenu, setShowUserActionMenu] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userMenuPosition, setUserMenuPosition] = useState({ x: 0, y: 0 });

  // Expanded commit messages state (track by commit SHA)
  const [expandedCommits, setExpandedCommits] = useState(new Set());

  const toggleCommitExpanded = (sha) => {
    setExpandedCommits(prev => {
      const newSet = new Set(prev);
      if (newSet.has(sha)) {
        newSet.delete(sha);
      } else {
        newSet.add(sha);
      }
      return newSet;
    });
  };

  // Handle avatar click
  const handleAvatarClick = (e, username, userId) => {
    if (!username) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setSelectedUser({ username, userId });
    setUserMenuPosition({ x: rect.left, y: rect.bottom - 20 });
    setShowUserActionMenu(true);
  };

  const handleUserMenuClose = () => {
    setShowUserActionMenu(false);
    setSelectedUser(null);
  };

  const handleMakeAdmin = async (username) => {
    try {
      const result = await addAdmin(username);
      alert(`✅ ${result.message}`);
    } catch (error) {
      console.error('Failed to add admin:', error);
      alert('❌ Failed to add admin: ' + error.message);
    }
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading page history...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
          Failed to Load History
        </h3>
        <p className="text-red-700 dark:text-red-300 text-sm">{error}</p>
        <p className="text-xs text-red-600 dark:text-red-400 mt-2">
          This could be due to network issues or the page not existing in the repository yet.
        </p>
      </div>
    );
  }

  if (commits.length === 0) {
    return (
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-8 text-center">
        <svg className="w-16 h-16 mx-auto mb-4 text-blue-400 dark:text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
        </svg>
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          No History Yet
        </h3>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          This page hasn't been committed to the GitHub repository yet.
        </p>
        <p className="text-sm text-gray-500 dark:text-gray-500">
          History will appear once the page is pushed to GitHub.
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <div className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Page History
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {commits.length} {commits.length === 1 ? 'commit' : 'commits'}
        </p>
      </div>

      <div className="space-y-4">
        {commits.map((commit, index) => {

          // Check if this is an anonymous contribution
          const botUsername = import.meta.env.VITE_WIKI_BOT_USERNAME;
          const isBotCommit = commit.author.username === botUsername;
          const isAnonymousContribution = isBotCommit && commit.message.includes('Anonymous contribution by:');

          // Determine display name: anonymous > fetched display name > GitHub username
          let displayName = commit.author.name;
          if (isAnonymousContribution) {
            const nameMatch = commit.message.match(/Anonymous contribution by:\s*(.+)/);
            if (nameMatch) {
              displayName = nameMatch[1].trim();
            }
          } else if (commit.author.userId && displayNames[commit.author.userId]) {
            displayName = displayNames[commit.author.userId];
          } else if (commit.author.username) {
            displayName = commit.author.username;
          }

          return (
          <div
            key={commit.sha}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start space-x-4">
              {/* Author avatar with prestige badge */}
              <div className="flex-shrink-0">
                {isAnonymousContribution ? (
                  // Anonymous contribution - show "A" with bot avatar in corner
                  <div className="relative h-10 w-10">
                    <div className="h-10 w-10 rounded-full bg-gray-400 dark:bg-gray-600 flex items-center justify-center text-white text-base font-semibold">
                      A
                    </div>
                    {commit.author.avatar && (
                      <img
                        src={commit.author.avatar}
                        alt="Bot"
                        className="absolute -bottom-0.5 -right-0.5 h-5 w-5 rounded-full border-2 border-white dark:border-gray-800"
                      />
                    )}
                  </div>
                ) : commit.author.avatar ? (
                  <PrestigeAvatar
                    src={commit.author.avatar}
                    alt={commit.author.name}
                    username={commit.author.username}
                    userId={commit.author.userId}
                    size="md"
                    showBadge={true}
                    onClick={handleAvatarClick}
                  />
                ) : (
                  <div className="h-10 w-10 rounded-full bg-gray-300 dark:bg-gray-600 flex items-center justify-center">
                    <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                  </div>
                )}
              </div>

              {/* Commit info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between mb-2">
                  <div className="flex-1">
                    <p className="text-base font-medium text-gray-900 dark:text-white mb-1">
                      {commit.message.split('\n')[0]}
                    </p>
                    {commit.message.split('\n').length > 1 && (() => {
                      const messageLines = commit.message.split('\n').slice(1).filter(line => line.trim());
                      const isExpanded = expandedCommits.has(commit.sha);
                      const fullMessage = messageLines.join('\n');

                      return (
                        <div className="relative mt-2">
                          <div
                            className={`text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-hidden transition-all duration-200 ${
                              isExpanded ? 'max-h-none' : 'max-h-[4.5rem]'
                            }`}
                            style={!isExpanded && fullMessage.length > 150 ? {
                              maskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)',
                              WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)'
                            } : {}}
                          >
                            {fullMessage}
                          </div>
                          {fullMessage.length > 150 && (
                            <button
                              onClick={() => toggleCommitExpanded(commit.sha)}
                              className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 flex items-center gap-1 relative z-10"
                            >
                              {isExpanded ? (
                                <>
                                  Show less
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                  </svg>
                                </>
                              ) : (
                                <>
                                  Show more
                                  <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                  </svg>
                                </>
                              )}
                            </button>
                          )}
                        </div>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-2 ml-2">
                    {index === 0 && (
                      <span className="px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full">
                        Latest
                      </span>
                    )}
                    {isAnonymousContribution && (
                      <span className="px-2 py-1 text-xs font-medium bg-purple-100 dark:bg-purple-900 text-purple-800 dark:text-purple-200 rounded-full">
                        Anonymous
                      </span>
                    )}
                  </div>
                </div>

                <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center space-x-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span className="flex items-center gap-1">
                      {isAnonymousContribution ? (
                        displayName
                      ) : commit.author.username ? (
                        <>
                          <Link
                            to={`/profile/${commit.author.username}`}
                            className="hover:text-blue-600 dark:hover:text-blue-400"
                          >
                            {displayName}
                          </Link>
                        </>
                      ) : (
                        displayName
                      )}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <span title={new Date(commit.author.date).toLocaleString()}>
                      {formatDistance(new Date(commit.author.date), new Date(), { addSuffix: true })}
                    </span>
                  </div>

                  <div className="flex items-center space-x-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                    </svg>
                    <code className="text-xs font-mono">{commit.sha.substring(0, 7)}</code>
                  </div>
                </div>

                {/* View on GitHub link */}
                <div className="mt-3">
                  <a
                    href={commit.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center text-sm text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300"
                  >
                    View on GitHub
                    <svg className="w-4 h-4 ml-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                    </svg>
                  </a>
                </div>
              </div>
            </div>
          </div>
          );
        })}
      </div>

      {/* Load More Button */}
      {hasMore && (
        <div className="mt-8 flex items-center justify-center">
          <button
            onClick={loadMore}
            disabled={loadingMore}
            className="px-6 py-3 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
          >
            {loadingMore ? (
              <>
                <svg className="animate-spin h-5 w-5" fill="none" viewBox="0 0 24 24">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                </svg>
                Loading...
              </>
            ) : (
              <>
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                </svg>
                Load More
              </>
            )}
          </button>
        </div>
      )}

      {/* Showing count */}
      {!loading && commits.length > 0 && (
        <div className="mt-4 text-center text-sm text-gray-600 dark:text-gray-400">
          Showing {commits.length} commit{commits.length !== 1 ? 's' : ''}
          {!hasMore && ' (all loaded)'}
        </div>
      )}

      {/* User Action Menu */}
      {showUserActionMenu && selectedUser && (
        <UserActionMenu
          username={selectedUser.username}
          userId={selectedUser.userId}
          onClose={handleUserMenuClose}
          position={userMenuPosition}
          onBan={() => {}}
          onMakeAdmin={handleMakeAdmin}
        />
      )}
    </div>
  );
};

export default PageHistory;
