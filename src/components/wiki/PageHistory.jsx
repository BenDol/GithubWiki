import { formatDistance } from 'date-fns';
import { Link } from 'react-router-dom';
import { usePageHistory } from '../../hooks/usePageHistory';
import LoadingSpinner from '../common/LoadingSpinner';
import PrestigeAvatar from '../common/PrestigeAvatar';

/**
 * PageHistory component
 * Displays commit history for a wiki page from GitHub
 */
const PageHistory = ({ sectionId, pageId }) => {
  const { commits, loading, error } = usePageHistory(sectionId, pageId);

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
        {commits.map((commit, index) => (
          <div
            key={commit.sha}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:shadow-md transition-shadow"
          >
            <div className="flex items-start space-x-4">
              {/* Author avatar with prestige badge */}
              <div className="flex-shrink-0">
                {commit.author.avatar ? (
                  <PrestigeAvatar
                    src={commit.author.avatar}
                    alt={commit.author.name}
                    username={commit.author.username}
                    size="md"
                    showBadge={true}
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
                    {commit.message.split('\n').length > 1 && (
                      <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                        {commit.message.split('\n').slice(1).join('\n')}
                      </p>
                    )}
                  </div>

                  {index === 0 && (
                    <span className="ml-2 px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded-full">
                      Latest
                    </span>
                  )}
                </div>

                <div className="flex items-center space-x-4 text-sm text-gray-600 dark:text-gray-400">
                  <div className="flex items-center space-x-1">
                    <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                    </svg>
                    <span>
                      {commit.author.username ? (
                        <a
                          href={`https://github.com/${commit.author.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="hover:text-blue-600 dark:hover:text-blue-400"
                        >
                          {commit.author.name}
                        </a>
                      ) : (
                        commit.author.name
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
        ))}
      </div>
    </div>
  );
};

export default PageHistory;
