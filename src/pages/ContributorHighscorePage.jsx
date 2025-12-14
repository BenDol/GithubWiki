import { useState, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWikiConfig } from '../hooks/useWikiConfig';
import { useAuthStore } from '../store/authStore';
import { getContributorHighscore, refreshHighscoreCache, getTimeUntilRefresh } from '../services/github/contributorHighscore';
import HighscorePodium from '../components/wiki/HighscorePodium';
import HighscoreList from '../components/wiki/HighscoreList';
import LoadingSpinner from '../components/common/LoadingSpinner';

/**
 * ContributorHighscorePage
 * Displays a fancy leaderboard of top contributors with podium and animations
 */
const ContributorHighscorePage = () => {
  const { config } = useWikiConfig();
  const { user, isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState(null);
  const [highscoreData, setHighscoreData] = useState(null);
  const [timeUntilRefresh, setTimeUntilRefresh] = useState(0);
  const [showLimitedOnly, setShowLimitedOnly] = useState(true);

  const enabled = config?.features?.contributorHighscore?.enabled ?? false;
  const cacheMinutes = config?.features?.contributorHighscore?.cacheMinutes ?? 30;
  const displayLimit = config?.features?.contributorHighscore?.displayLimit ?? 100;

  // Check if user is repository owner
  const isRepoOwner = isAuthenticated && user?.login === config?.wiki?.repository?.owner;

  // Check if cache has expired
  const cacheExpired = timeUntilRefresh === 0;

  // Can force refresh if: repo owner ONLY
  // Regular users rely on automated GitHub Action to update the cache
  // This prevents API waste from every user fetching contributor stats
  const canForceRefresh = isRepoOwner;

  // Load highscore data
  useEffect(() => {
    if (!enabled) {
      setLoading(false);
      return;
    }

    const loadHighscore = async () => {
      try {
        setLoading(true);
        setError(null);

        const data = await getContributorHighscore(
          config.wiki.repository.owner,
          config.wiki.repository.repo,
          config
        );

        setHighscoreData(data);
      } catch (err) {
        console.error('[ContributorHighscore] Failed to load:', err);
        setError(err.message || 'Failed to load contributor highscore');
      } finally {
        setLoading(false);
      }
    };

    loadHighscore();
  }, [config, enabled]);

  // Update countdown timer
  useEffect(() => {
    if (!highscoreData?.lastUpdated) return;

    const updateTimer = () => {
      const timeLeft = getTimeUntilRefresh(highscoreData.lastUpdated, cacheMinutes);
      setTimeUntilRefresh(timeLeft);
    };

    updateTimer();
    const interval = setInterval(updateTimer, 1000);

    return () => clearInterval(interval);
  }, [highscoreData, cacheMinutes]);

  // Handle manual refresh
  const handleRefresh = async () => {
    // Check permissions
    if (!canForceRefresh) {
      console.log('[ContributorHighscore] Refresh denied - not owner and cache not expired');
      return;
    }

    try {
      setRefreshing(true);
      setError(null);

      const data = await refreshHighscoreCache(
        config.wiki.repository.owner,
        config.wiki.repository.repo,
        config
      );

      setHighscoreData(data);
    } catch (err) {
      console.error('[ContributorHighscore] Failed to refresh:', err);
      setError(err.message || 'Failed to refresh highscore');
    } finally {
      setRefreshing(false);
    }
  };

  // Format time remaining
  const formatTimeRemaining = (ms) => {
    const minutes = Math.floor(ms / 1000 / 60);
    const seconds = Math.floor((ms / 1000) % 60);
    return `${minutes}m ${seconds}s`;
  };

  // Feature not enabled
  if (!enabled) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">🏆</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Contributor Highscore
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          This feature is not enabled for this wiki.
        </p>
        <Link
          to="/"
          className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
        >
          ← Back to Home
        </Link>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading contributor highscore...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-red-500 text-6xl mb-4">⚠️</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Failed to Load Highscore
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">{error}</p>
        <div className="flex gap-3 justify-center">
          <button
            onClick={() => window.location.reload()}
            className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            Retry
          </button>
          <Link
            to="/"
            className="px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            Back to Home
          </Link>
        </div>
      </div>
    );
  }

  const topThree = highscoreData?.contributors?.slice(0, 3) || [];
  const allRemainingContributors = highscoreData?.contributors?.slice(3) || [];
  const remainingContributors = showLimitedOnly
    ? allRemainingContributors.slice(0, displayLimit - 3) // displayLimit total (3 on podium + remaining in list)
    : allRemainingContributors;
  const totalContributors = highscoreData?.contributors?.length || 0;
  const hasMoreThanLimit = totalContributors > displayLimit;

  return (
    <div className="min-h-screen bg-gradient-to-b from-gray-50 to-white dark:from-gray-900 dark:to-gray-800 pb-12">
      {/* Header */}
      <div className="bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 py-6 sm:py-8 mb-6 sm:mb-8">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div className="flex-1 min-w-0">
              <h1 className="text-2xl sm:text-3xl lg:text-4xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2 truncate">
                Contributor Highscore
              </h1>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                Celebrating our amazing contributors
              </p>
            </div>

            {/* Refresh Button & Timer */}
            <div className="flex flex-col items-start sm:items-end space-y-2 flex-shrink-0">
              <button
                onClick={handleRefresh}
                disabled={refreshing || !canForceRefresh}
                title={
                  refreshing
                    ? 'Refreshing...'
                    : !canForceRefresh
                      ? 'Only repository owner can manually refresh (automated updates run daily via GitHub Action)'
                      : 'Force refresh highscore data'
                }
                className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {refreshing ? (
                  <>
                    <svg className="animate-spin -ml-1 mr-2 h-4 w-4 text-white" fill="none" viewBox="0 0 24 24">
                      <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                      <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                    </svg>
                    Refreshing...
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    Refresh Now
                  </>
                )}
              </button>

              {highscoreData?.lastUpdated && (
                <div className="text-xs text-gray-500 dark:text-gray-400 text-right space-y-1">
                  <div>
                    Updated: {new Date(highscoreData.lastUpdated).toLocaleString()}
                  </div>
                  {isRepoOwner ? (
                    <div>
                      Next manual refresh: {formatTimeRemaining(timeUntilRefresh)}
                    </div>
                  ) : (
                    <div className="text-amber-600 dark:text-amber-400 font-medium">
                      🤖 Auto-updated daily
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {/* Podium - Top 3 */}
      {topThree.length > 0 && <HighscorePodium topThree={topThree} />}

      {/* List - Remaining Contributors */}
      {remainingContributors.length > 0 && (
        <div>
          <HighscoreList contributors={remainingContributors} startRank={4} />

          {/* Toggle Button - Show More/Less */}
          {hasMoreThanLimit && (
            <div className="max-w-4xl mx-auto mt-4 sm:mt-6 px-4 sm:px-6 text-center">
              <button
                onClick={() => setShowLimitedOnly(!showLimitedOnly)}
                className="inline-flex items-center px-4 py-2 sm:px-6 sm:py-3 bg-gradient-to-r from-blue-500 to-blue-600 hover:from-blue-600 hover:to-blue-700 text-white rounded-lg transition-all shadow-lg hover:shadow-xl transform hover:-translate-y-0.5 font-medium text-sm sm:text-base"
              >
                {showLimitedOnly ? (
                  <>
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                    <span className="hidden sm:inline">Show All {totalContributors} Contributors</span>
                    <span className="sm:hidden">Show All ({totalContributors})</span>
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4 sm:w-5 sm:h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                    </svg>
                    <span className="hidden sm:inline">Show Top {displayLimit} Only</span>
                    <span className="sm:hidden">Show Top {displayLimit}</span>
                  </>
                )}
              </button>
              <p className="mt-2 text-xs sm:text-sm text-gray-500 dark:text-gray-400">
                {showLimitedOnly
                  ? `Showing top ${displayLimit} of ${totalContributors} contributors`
                  : `Showing all ${totalContributors} contributors`}
              </p>
            </div>
          )}
        </div>
      )}

      {/* Stats Footer */}
      <div className="max-w-4xl mx-auto mt-6 sm:mt-8 md:mt-12 px-4 sm:px-6">
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-4 sm:p-6">
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 sm:gap-6 text-center">
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-blue-600 dark:text-blue-400">
                {highscoreData?.contributors?.length || 0}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                Total Contributors
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-green-600 dark:text-green-400">
                {highscoreData?.contributors?.reduce((sum, c) => sum + c.contributions, 0).toLocaleString() || 0}
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                Total Contributions
              </div>
            </div>
            <div>
              <div className="text-2xl sm:text-3xl font-bold text-purple-600 dark:text-purple-400">
                {cacheMinutes}m
              </div>
              <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mt-1">
                Cache Duration
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ContributorHighscorePage;
