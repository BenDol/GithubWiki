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
    <div
      className="flex items-start space-x-2 px-2.5 py-1.5 bg-amber-100 dark:bg-amber-900/20 border border-amber-300 dark:border-amber-800 rounded-lg h-[44px] relative overflow-hidden"
      style={{
        animation: 'starContributorPopIn 0.5s cubic-bezier(0.34, 1.56, 0.64, 1), starContributorGlow 2s ease-in-out'
      }}
    >
      {/* Gold shine overlay */}
      <div
        className="absolute inset-0 pointer-events-none"
        style={{
          background: 'linear-gradient(90deg, transparent 0%, rgba(251, 191, 36, 0.3) 50%, transparent 100%)',
          animation: 'starContributorShine 1.5s ease-in-out 0.3s'
        }}
      />

      <style>{`
        @keyframes starContributorPopIn {
          0% {
            opacity: 0;
            transform: scale(0.8);
          }
          100% {
            opacity: 1;
            transform: scale(1);
          }
        }

        @keyframes starContributorGlow {
          0%, 100% {
            box-shadow: 0 0 0 rgba(251, 191, 36, 0);
          }
          50% {
            box-shadow: 0 0 20px rgba(251, 191, 36, 0.4);
          }
        }

        @keyframes starContributorShine {
          0% {
            transform: translateX(-100%);
            opacity: 0;
          }
          20% {
            opacity: 1;
          }
          80% {
            opacity: 1;
          }
          100% {
            transform: translateX(100%);
            opacity: 0;
          }
        }
      `}</style>

      <div className="relative flex-shrink-0 mt-[0px]">
        <PrestigeAvatar
          username={topContributor.username}
          userId={topContributor.userId}
          size="sm"
          showBadge={true}
          showPrestigeBadge={false}
          showDonatorBadge={true}
          onClick={handleAvatarClick}
        />
        {/* Star overlay */}
        <div
          className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-500 dark:bg-amber-400 rounded-full flex items-center justify-center shadow-md text-[9px]"
          title="Top Contributor"
        >
          ⭐
        </div>
      </div>

      <div className="flex flex-col justify-center min-w-0 gap-0.5 mt-[3px]">
        <span className="text-[10px] font-medium text-amber-900 dark:text-amber-200 truncate leading-none">
          Top Contributor
        </span>
        <span className="text-xs text-amber-700 dark:text-amber-300 truncate leading-none">
          {displayNameLoading ? '...' : displayAuthor}
        </span>
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
  );
};

export default StarContributor;
