import { useState, useEffect, useRef } from 'react';
import { formatDistance } from 'date-fns';
import { Link } from 'react-router-dom';
import { usePageHistory } from '../../hooks/usePageHistory';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAuthStore } from '../../store/authStore';
import LoadingSpinner from '../common/LoadingSpinner';
import PrestigeAvatar from '../common/PrestigeAvatar';
import UserActionMenu from '../common/UserActionMenu';
import { addAdmin } from '../../services/github/admin';

/**
 * PageHistory component
 * Displays commit history for a wiki page from GitHub
 */
const PageHistory = ({ sectionId, pageId }) => {
  const { config } = useWikiConfig();
  const { user } = useAuthStore();
  const { commits, loading, error } = usePageHistory(sectionId, pageId);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // User action menu state
  const [showUserActionMenu, setShowUserActionMenu] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userMenuPosition, setUserMenuPosition] = useState({ x: 0, y: 0 });

  // Ref for commits section
  const commitsRef = useRef(null);

  // Handle avatar click
  const handleAvatarClick = (e, username) => {
    if (!username) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setSelectedUser(username);
    setUserMenuPosition({ x: rect.left, y: rect.bottom - 20 });
    setShowUserActionMenu(true);
  };

  const handleUserMenuClose = () => {
    setShowUserActionMenu(false);
    setSelectedUser(null);
  };

  const handleMakeAdmin = async (username) => {
    if (!config?.wiki?.repository) return;
    try {
      const { owner, repo } = config.wiki.repository;
      await addAdmin(username, owner, repo, user.login);
      alert(`✅ Successfully added ${username} as administrator`);
    } catch (error) {
      console.error('Failed to add admin:', error);
      alert('❌ Failed to add admin: ' + error.message);
    }
  };

  // Reset to page 1 when commits change
  useEffect(() => {
    setCurrentPage(1);
  }, [commits]);

  // Scroll to commits section when page changes
  useEffect(() => {
    if (commitsRef.current && currentPage > 1) {
      commitsRef.current.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }
  }, [currentPage]);

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

  // Calculate pagination
  const totalPages = Math.ceil(commits.length / itemsPerPage);
  const startIndex = (currentPage - 1) * itemsPerPage;
  const endIndex = startIndex + itemsPerPage;
  const paginatedCommits = commits.slice(startIndex, endIndex);

  return (
    <div className="space-y-6">
      <div ref={commitsRef} className="mb-6">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">
          Page History
        </h2>
        <p className="text-gray-600 dark:text-gray-400">
          {commits.length} {commits.length === 1 ? 'commit' : 'commits'}
          {totalPages > 1 && (
            <span className="ml-2">
              (Showing {startIndex + 1}-{Math.min(endIndex, commits.length)})
            </span>
          )}
        </p>
      </div>

      <div className="space-y-4">
        {paginatedCommits.map((commit, index) => {
          // Calculate actual index in full commits array for "Latest" badge
          const actualIndex = startIndex + index;

          // Check if this is an anonymous contribution
          const botUsername = import.meta.env.VITE_WIKI_BOT_USERNAME;
          const isBotCommit = commit.author.username === botUsername;
          const isAnonymousContribution = isBotCommit && commit.message.includes('Anonymous contribution by:');

          // Extract display name from anonymous commit message
          let displayName = commit.author.name;
          if (isAnonymousContribution) {
            const nameMatch = commit.message.match(/Anonymous contribution by:\s*(.+)/);
            if (nameMatch) {
              displayName = nameMatch[1].trim();
            }
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
                      const botUsername = import.meta.env.VITE_WIKI_BOT_USERNAME;
                      const isBotCommit = commit.author.username === botUsername;
                      const messageLines = commit.message.split('\n').slice(1);

                      // For bot commits, show only first 3 lines
                      const displayLines = isBotCommit ? messageLines.slice(0, 3) : messageLines;

                      return (
                        <p className="text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap" style={{ marginTop: '-0.875rem' }}>
                          {displayLines.join('\n')}
                        </p>
                      );
                    })()}
                  </div>

                  <div className="flex items-center gap-2 ml-2">
                    {actualIndex === 0 && (
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
                    <span>
                      {isAnonymousContribution ? (
                        displayName
                      ) : commit.author.username ? (
                        <a
                          href={`https://github.com/${commit.author.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {displayName}
                        </a>
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
            Page {currentPage} of {totalPages}
          </span>
        </div>
      )}

      {/* User Action Menu */}
      {showUserActionMenu && selectedUser && (
        <UserActionMenu
          username={selectedUser}
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
