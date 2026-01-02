import { useState, useEffect } from 'react';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useDisplayName } from '../../hooks/useDisplayName';
import { useAuthStore } from '../../store/authStore';
import { useGitHubDataStore } from '../../store/githubDataStore';
import { getTopContributor } from '../../services/github/admin';
import PrestigeAvatar from '../common/PrestigeAvatar';
import UserActionMenu from '../common/UserActionMenu';

/**
 * StarContributor component
 * Shows the profile picture of the user with the most edits on a page
 * with a star icon overlay to indicate they're the top contributor
 *
 * Top contributor data is pre-calculated by GitHub Action and stored in issues,
 * not calculated client-side (eliminates 100+ API calls per page load!)
 */
const StarContributor = ({ sectionId, pageId }) => {
  const { config } = useWikiConfig();
  const { user, isAuthenticated } = useAuthStore();
  const store = useGitHubDataStore.getState();
  const [topContributor, setTopContributor] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  // User action menu state
  const [showUserActionMenu, setShowUserActionMenu] = useState(false);
  const [userMenuPosition, setUserMenuPosition] = useState({ x: 0, y: 0 });

  // Fetch display name for top contributor
  const { displayName, loading: displayNameLoading } = useDisplayName(
    topContributor ? { id: topContributor.userId, login: topContributor.username } : null
  );

  useEffect(() => {
    const fetchTopContributor = async () => {
      if (!config?.wiki?.repository?.owner || !config?.wiki?.repository?.repo || !sectionId || !pageId) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { owner, repo } = config.wiki.repository;
        const cacheKey = `${owner}/${repo}/${sectionId}/${pageId}`;

        console.log(`[StarContributor] Fetching top contributor for ${sectionId}/${pageId}`);

        // Check cache first (pass auth status for appropriate TTL)
        let contributorData = store.getCachedStarContributor(cacheKey, isAuthenticated);

        if (!contributorData) {
          // Cache miss - fetch from GitHub issue
          console.log('[StarContributor] Cache miss - fetching from GitHub issue');
          store.incrementAPICall();

          contributorData = await getTopContributor(owner, repo, sectionId, pageId, config);

          // Cache the results (even if null)
          store.cacheStarContributor(cacheKey, contributorData);
          console.log(`[StarContributor] Cached top contributor data for ${sectionId}/${pageId}`);
        } else {
          console.log(`[StarContributor] ✓ Cache hit - using cached top contributor`);
        }

        setTopContributor(contributorData);
      } catch (err) {
        console.error('[StarContributor] Failed to fetch top contributor:', err);

        // Check if this is a rate limit error
        const isRateLimit = err.message?.includes('rate limit') ||
                           err.message?.includes('403') ||
                           err.message?.includes('429');

        if (isRateLimit) {
          // Silently fail for rate limits - just hide component
          console.warn('[StarContributor] Rate limit triggered - hiding component');
          setError(null); // Don't show error, just hide
        } else {
          // For other errors, set the error (will be hidden by component but logged)
          setError(err.message);
        }
      } finally {
        setLoading(false);
      }
    };

    fetchTopContributor();
  }, [config, sectionId, pageId, isAuthenticated]);

  // Handle avatar click to show user action menu
  const handleAvatarClick = (event) => {
    if (!topContributor || !user) return;

    event.stopPropagation();
    const rect = event.currentTarget.getBoundingClientRect();
    setUserMenuPosition({ x: rect.right + 8, y: rect.top });
    setShowUserActionMenu(true);
  };

  // Don't show if loading, error, or no top contributor
  if (loading || error || !topContributor) {
    return null;
  }

  // Use display name if available, otherwise username
  const displayAuthor = displayName || topContributor.username;

  return (
    <div className="flex items-center space-x-3">
      <div className="relative group">
        {/* Star contributor avatar with star overlay */}
        <div className="relative cursor-pointer" onClick={handleAvatarClick}>
          <PrestigeAvatar
            username={topContributor.username}
            userId={topContributor.userId}
            size="lg"
            showBadge={true}
          />
          {/* Star overlay */}
          <div className="absolute -top-1 -right-1 w-6 h-6 bg-yellow-400 rounded-full flex items-center justify-center shadow-lg">
            <svg className="w-4 h-4 text-yellow-900" fill="currentColor" viewBox="0 0 20 20">
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
          </div>
        </div>

        {/* User action menu */}
        {showUserActionMenu && user && (
          <UserActionMenu
            targetUser={{
              username: topContributor.username,
              userId: topContributor.userId,
              displayName: displayAuthor,
            }}
            onClose={() => setShowUserActionMenu(false)}
            position={userMenuPosition}
          />
        )}
      </div>

      {/* Contributor info */}
      <div>
        <div className="flex items-center space-x-2">
          <span className="text-sm font-medium text-gray-900 dark:text-gray-100">
            Top Contributor
          </span>
        </div>
        <div className="text-sm text-gray-600 dark:text-gray-400">
          {displayNameLoading ? (
            <span className="inline-block h-4 w-24 bg-gray-200 dark:bg-gray-700 rounded animate-pulse" />
          ) : (
            displayAuthor
          )}
        </div>
      </div>
    </div>
  );
};

export default StarContributor;
