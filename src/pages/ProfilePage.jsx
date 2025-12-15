import { useState, useEffect, useRef } from 'react';
import { Link, useParams } from 'react-router-dom';
import { useAuthStore } from '../store/authStore';
import { useWikiConfig } from '../hooks/useWikiConfig';
import { useBranchNamespace } from '../hooks/useBranchNamespace';
import { getUserPullRequests, closePullRequest } from '../services/github/pullRequests';
import LoadingSpinner from '../components/common/LoadingSpinner';
import PrestigeAvatar from '../components/common/PrestigeAvatar';
import UserActionMenu from '../components/common/UserActionMenu';
import { getPrestigeTier, getProgressToNextTier } from '../utils/prestige';
import { getOctokit } from '../services/github/api';
import { getUserContributionStats } from '../services/github/contributorHighscore';
import { addAdmin, isBanned } from '../services/github/admin';
import { getUserSnapshot } from '../services/github/userSnapshots';

/**
 * ProfilePage - Display user's profile and pull requests
 * Supports viewing own profile (/profile) or another user's profile (/profile/:username)
 */
const ProfilePage = () => {
  const { username: urlUsername } = useParams();
  const { user: currentUser, isAuthenticated, isLoading: authLoading } = useAuthStore();
  const { config } = useWikiConfig();
  const { branch, loading: branchLoading } = useBranchNamespace();
  const [pullRequests, setPullRequests] = useState([]);
  const [profileUser, setProfileUser] = useState(null);
  const [highscoreStats, setHighscoreStats] = useState(null);
  const [snapshotData, setSnapshotData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [closingPR, setClosingPR] = useState(null);
  const [refreshKey, setRefreshKey] = useState(0);
  const [expandedPRs, setExpandedPRs] = useState(new Set());
  const [showClosed, setShowClosed] = useState(false);
  const [userIsBanned, setUserIsBanned] = useState(false);

  // User action menu state
  const [showUserActionMenu, setShowUserActionMenu] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userMenuPosition, setUserMenuPosition] = useState({ x: 0, y: 0 });

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const itemsPerPage = 10;

  // Ref for Edit Requests section
  const editRequestsRef = useRef(null);

  // Handle avatar click
  const handleAvatarClick = (e, username) => {
    if (!username) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setSelectedUser(username);
    setUserMenuPosition({ x: rect.left, y: rect.bottom - 2 });
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
      await addAdmin(username, owner, repo, currentUser.login);
      alert(`✅ Successfully added ${username} as administrator`);
    } catch (error) {
      console.error('Failed to add admin:', error);
      alert('❌ Failed to add admin: ' + error.message);
    }
  };

  // Determine if viewing own profile or another user's profile
  const isOwnProfile = !urlUsername || (isAuthenticated && currentUser?.login === urlUsername);
  const targetUsername = isOwnProfile ? currentUser?.login : urlUsername;

  useEffect(() => {
    const loadProfile = async () => {
      // Keep loading until config and branch are available
      if (!config || branchLoading) {
        return;
      }

      // If viewing own profile but not authenticated, stop loading
      if (isOwnProfile && !isAuthenticated) {
        setLoading(false);
        return;
      }

      // If no target username, stop loading
      if (!targetUsername) {
        setLoading(false);
        setError('No username specified');
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { owner, repo } = config.wiki.repository;

        // If viewing someone else's profile, try to load from snapshot first
        if (!isOwnProfile && urlUsername) {
          console.log(`[Profile] Loading profile for other user: ${urlUsername}`);

          // Try to load snapshot data
          try {
            console.log(`[Profile] Fetching snapshot for: ${urlUsername}`);
            const snapshot = await getUserSnapshot(owner, repo, urlUsername);

            if (snapshot) {
              console.log(`[Profile] Snapshot loaded for ${urlUsername}:`, {
                lastUpdated: snapshot.lastUpdated,
                totalPRs: snapshot.stats.totalPRs,
                additions: snapshot.stats.totalAdditions,
              });

              // Set snapshot data
              setSnapshotData(snapshot);
              setProfileUser(snapshot.user);
              setPullRequests(snapshot.pullRequests);
              setHighscoreStats(snapshot.stats);
            } else {
              // No snapshot available - fetch user data and show basic profile
              console.log(`[Profile] No snapshot found for ${urlUsername}, fetching basic user data`);
              try {
                const octokit = getOctokit();
                const { data: userData } = await octokit.rest.users.getByUsername({
                  username: urlUsername,
                });
                setProfileUser(userData);
                // Don't set error - we'll show a basic profile page with a friendly message
                setPullRequests([]); // No PRs yet
                setHighscoreStats(null); // No stats yet
              } catch (err) {
                console.error('Failed to fetch user data:', err);
                setError(`User "${urlUsername}" not found`);
                setLoading(false);
                return;
              }
            }
          } catch (err) {
            console.error('[Profile] Failed to load snapshot:', err);
            // Fallback to fetching basic user data
            try {
              const octokit = getOctokit();
              const { data: userData } = await octokit.rest.users.getByUsername({
                username: urlUsername,
              });
              setProfileUser(userData);
              // Show basic profile with no data
              setPullRequests([]);
              setHighscoreStats(null);
            } catch (userErr) {
              console.error('Failed to fetch user data:', userErr);
              setError(`User "${urlUsername}" not found`);
              setLoading(false);
              return;
            }
          }
        } else {
          // Viewing own profile - use live data
          console.log(`[Profile] Loading own profile with live data`);
          setProfileUser(currentUser);

          // Fetch pull requests for own profile
          console.log(`[Profile] Loading PRs for user: ${targetUsername}, branch: ${branch}`);
          const prs = await getUserPullRequests(owner, repo, targetUsername, branch);
          setPullRequests(prs);

          // Fetch highscore stats (for prestige calculation)
          if (config?.features?.contributorHighscore?.enabled) {
            try {
              console.log(`[Profile] Fetching highscore stats for: ${targetUsername}`);
              const stats = await getUserContributionStats(owner, repo, targetUsername, config, 'allTime');
              setHighscoreStats(stats);
              if (stats) {
                console.log(`[Profile] Highscore stats loaded for ${targetUsername}:`, stats);
              }
            } catch (err) {
              console.warn('[Profile] Failed to fetch highscore stats:', err);
              // Don't fail the whole page if highscore fetch fails
              setHighscoreStats(null);
            }
          }
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
        setError('Failed to load profile data. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadProfile();
  }, [isAuthenticated, currentUser, config, branch, branchLoading, refreshKey, urlUsername, targetUsername, isOwnProfile]);

  // Check if profile user is banned
  useEffect(() => {
    const checkBanStatus = async () => {
      if (!profileUser || !config?.wiki?.repository) {
        setUserIsBanned(false);
        return;
      }

      try {
        const { owner, repo } = config.wiki.repository;
        const banned = await isBanned(profileUser.login, owner, repo, config);
        setUserIsBanned(banned);

        if (banned) {
          console.log(`[Profile] User ${profileUser.login} is banned`);
        }
      } catch (error) {
        console.error('[Profile] Failed to check ban status:', error);
        setUserIsBanned(false); // Fail open
      }
    };

    checkBanStatus();
  }, [profileUser, config]);

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
    if (!config || !isOwnProfile) return;

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

  // CRITICAL: Check authLoading FIRST to prevent flickering of "Authentication Required" message
  if (authLoading || loading || branchLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            {authLoading ? 'Authenticating...' : branchLoading ? 'Detecting branch...' : 'Loading profile...'}
          </p>
        </div>
      </div>
    );
  }

  if (isOwnProfile && !isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">🔒</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Authentication Required
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          You need to sign in with GitHub to view your profile.
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
            Error Loading Profile
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

  // Calculate contribution statistics from PRs
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

  // For prestige calculation, use PR stats (accurate breakdown of merged/open/closed)
  // Highscore data treats all contributions as "merged" which inflates the score by 3x
  // For display stats, use PR data (has detailed information)
  const prestigeStats = stats;

  // Get prestige tier and progress (using accurate PR-based stats)
  const prestigeTier =
    config?.prestige?.enabled && config?.prestige?.tiers
      ? getPrestigeTier(prestigeStats, config.prestige.tiers)
      : null;

  const progressToNextTier =
    prestigeTier && config?.prestige?.tiers
      ? getProgressToNextTier(prestigeStats, prestigeTier, config.prestige.tiers)
      : null;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <div className="flex items-center gap-3">
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
              {isOwnProfile ? 'My Profile' : `${profileUser?.login}'s Profile`}
            </h1>
            {userIsBanned && (
              <span className="inline-flex items-center px-3 py-1 rounded-full text-sm font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border border-red-200 dark:border-red-800">
                <svg className="w-4 h-4 mr-1.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                </svg>
                Banned
              </span>
            )}
          </div>
          <div className="flex items-center gap-2">
            {profileUser && (
              <a
                href={`https://github.com/${profileUser.login}`}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                title="View on GitHub"
              >
                <svg className="w-4 h-4 mr-2" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                GitHub
              </a>
            )}
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
        </div>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          {isOwnProfile
            ? 'View and manage your wiki contributions'
            : `View ${profileUser?.login}'s wiki contributions`}
        </p>

        {/* Prestige Badge Display */}
        {profileUser && config?.prestige?.enabled && pullRequests.length > 0 && (
          <div className="mt-6 bg-gradient-to-r from-gray-50 to-gray-100 dark:from-gray-800 dark:to-gray-700 rounded-lg p-6 border border-gray-200 dark:border-gray-600">
            <div className="flex items-center gap-6">
              {/* Avatar with Prestige Badge */}
              <PrestigeAvatar
                src={profileUser.avatar_url}
                alt={profileUser.name || profileUser.login}
                username={profileUser.login}
                stats={stats}
                size="2xl"
                showBadge={true}
                onClick={!isOwnProfile ? handleAvatarClick : undefined}
              />

              {/* Prestige Info */}
              <div className="flex-1">
                {prestigeTier ? (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                        {prestigeTier.title}
                      </h3>
                    </div>
                    <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                      {profileUser.name || profileUser.login}
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
                    <div className="relative flex items-center gap-2">
                      {/* Progress bar */}
                      <div className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                        <div
                          className="h-full bg-gradient-to-r from-blue-500 to-purple-500 transition-all duration-500"
                          style={{ width: `${progressToNextTier.percentage}%` }}
                        />
                      </div>
                      {/* Next tier badge icon */}
                      <div
                        className="flex-shrink-0 flex items-center justify-center w-8 h-8 rounded-full shadow-lg ring-2 ring-white dark:ring-gray-800"
                        style={{ backgroundColor: progressToNextTier.nextTier.color }}
                        title={`Next: ${progressToNextTier.nextTier.title}`}
                      >
                        <span className="text-lg leading-none select-none">
                          {progressToNextTier.nextTier.badge}
                        </span>
                      </div>
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
                  </>
                ) : (
                  <div className="text-center py-4">
                    <p className="text-gray-600 dark:text-gray-400">
                      Prestige information unavailable
                    </p>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Basic Profile Info - Show when no contributions yet */}
        {profileUser && !isOwnProfile && pullRequests.length === 0 && (
          <div className="mt-6 bg-gradient-to-r from-blue-50 to-indigo-50 dark:from-blue-900/20 dark:to-indigo-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
            <div className="flex items-start gap-6">
              {/* Avatar without prestige badge */}
              <img
                src={profileUser.avatar_url}
                alt={profileUser.login}
                className="w-24 h-24 rounded-full border-4 border-white dark:border-gray-800 shadow-lg flex-shrink-0"
              />

              {/* User Info */}
              <div className="flex-1">
                <div className="flex items-center gap-2 mb-1">
                  <h3 className="text-2xl font-bold text-gray-900 dark:text-white">
                    {profileUser.name || profileUser.login}
                  </h3>
                  {userIsBanned && (
                    <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800 dark:bg-red-900 dark:text-red-200 border border-red-200 dark:border-red-800">
                      <svg className="w-3.5 h-3.5 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
                      </svg>
                      Banned
                    </span>
                  )}
                </div>
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-3">
                  @{profileUser.login}
                </p>

                {/* Bio */}
                {profileUser.bio && (
                  <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                    {profileUser.bio}
                  </p>
                )}

                {/* Additional Info */}
                <div className="flex flex-wrap items-center gap-4 text-sm text-gray-600 dark:text-gray-400 mb-4">
                  {profileUser.location && (
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z" />
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 11a3 3 0 11-6 0 3 3 0 016 0z" />
                      </svg>
                      <span>{profileUser.location}</span>
                    </div>
                  )}
                  {profileUser.company && (
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5M9 7h1m-1 4h1m4-4h1m-1 4h1m-5 10v-5a1 1 0 011-1h2a1 1 0 011 1v5m-4 0h4" />
                      </svg>
                      <span>{profileUser.company}</span>
                    </div>
                  )}
                  {profileUser.created_at && (
                    <div className="flex items-center gap-1">
                      <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                      </svg>
                      <span>Joined GitHub {new Date(profileUser.created_at).toLocaleDateString()}</span>
                    </div>
                  )}
                </div>

                {/* GitHub Stats */}
                <div className="flex items-center gap-6 text-sm">
                  {profileUser.public_repos !== undefined && (
                    <div>
                      <span className="font-semibold text-gray-900 dark:text-white">{profileUser.public_repos}</span>
                      <span className="text-gray-600 dark:text-gray-400 ml-1">repositories</span>
                    </div>
                  )}
                  {profileUser.followers !== undefined && (
                    <div>
                      <span className="font-semibold text-gray-900 dark:text-white">{profileUser.followers}</span>
                      <span className="text-gray-600 dark:text-gray-400 ml-1">followers</span>
                    </div>
                  )}
                  {profileUser.following !== undefined && (
                    <div>
                      <span className="font-semibold text-gray-900 dark:text-white">{profileUser.following}</span>
                      <span className="text-gray-600 dark:text-gray-400 ml-1">following</span>
                    </div>
                  )}
                </div>

                {/* Info Message */}
                <div className="mt-4 p-3 bg-blue-100 dark:bg-blue-900/30 border border-blue-200 dark:border-blue-700 rounded-lg">
                  <div className="flex items-start gap-2">
                    <svg className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <div className="flex-1">
                      <p className="text-sm font-medium text-blue-900 dark:text-blue-200 mb-1">
                        No Contributions Yet
                      </p>
                      <p className="text-xs text-blue-800 dark:text-blue-300">
                        {profileUser.login} hasn't made any wiki contributions yet. Once they create and merge their first edit request, their profile will show detailed contribution statistics and prestige information.
                      </p>
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Statistics Section */}
      {pullRequests.length > 0 && (
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Contribution Statistics
              </h2>
              {snapshotData && !isOwnProfile && (
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  Last updated: {new Date(snapshotData.lastUpdated).toLocaleString()}
                </p>
              )}
            </div>
            {branch && isOwnProfile && (
              <div className="flex items-center gap-2 px-3 py-1 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <svg className="w-4 h-4 text-blue-600 dark:text-blue-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8.684 13.342C8.886 12.938 9 12.482 9 12c0-.482-.114-.938-.316-1.342m0 2.684a3 3 0 110-2.684m0 2.684l6.632 3.316m-6.632-6l6.632-3.316m0 0a3 3 0 105.367-2.684 3 3 0 00-5.367 2.684zm0 9.316a3 3 0 105.368 2.684 3 3 0 00-5.368-2.684z" />
                </svg>
                <span className="text-sm font-medium text-blue-700 dark:text-blue-300">
                  Branch: {branch}
                </span>
              </div>
            )}
          </div>
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
            {/* Total Edits */}
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
          {(stats.totalAdditions > 0 || stats.totalDeletions > 0) && (
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
          )}
        </div>
      )}

      {/* Filter controls */}
      {pullRequests.length > 0 && (
        <div ref={editRequestsRef} className="mb-6 flex items-center justify-between">
          <div>
            <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
              {isOwnProfile ? 'My Edit Requests' : 'Edit Requests'}
            </h2>
            {filteredPullRequests.length > 0 && (
              <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                Showing {startIndex + 1}-{Math.min(endIndex, filteredPullRequests.length)} of {filteredPullRequests.length}
                {snapshotData?.pullRequestsTruncated && !isOwnProfile && (
                  <span className="text-gray-500 dark:text-gray-500"> • Most recent 100 shown</span>
                )}
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
              ? `${isOwnProfile ? "You haven't" : `${profileUser?.login} hasn't`} created any wiki edits yet.`
              : `${isOwnProfile ? 'You have' : `${profileUser?.login} has`} no open edits. Enable "Show closed edits" to see ${isOwnProfile ? 'your' : 'their'} closed and merged contributions.`
            }
          </p>
          {pullRequests.length === 0 && isOwnProfile && (
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
                      src={pr.user?.avatar_url || profileUser?.avatar_url}
                      alt={pr.user?.login || profileUser?.login}
                      size="md"
                      stats={pr.user?.login === profileUser?.login ? stats : null}
                      showBadge={pr.user?.login === profileUser?.login}
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
                        #{pr.number} opened {new Date(pr.created_at).toLocaleDateString()} by {pr.user?.login || profileUser?.login || 'Unknown'}
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

                        {/* Only show Cancel button for own PRs when viewing own profile */}
                        {isOwnProfile && pr.state === 'open' && (
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
                      src={pr.user?.avatar_url || profileUser?.avatar_url}
                      alt={pr.user?.login || profileUser?.login}
                      size="lg"
                      stats={pr.user?.login === profileUser?.login ? stats : null}
                      showBadge={pr.user?.login === profileUser?.login}
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

export default ProfilePage;
