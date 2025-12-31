import { useState, useMemo } from 'react';
import { usePageHistory } from '../../hooks/usePageHistory';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useDisplayName } from '../../hooks/useDisplayName';
import PrestigeAvatar from '../common/PrestigeAvatar';
import UserActionMenu from '../common/UserActionMenu';
import { addAdmin } from '../../services/adminActions';
import { useAuthStore } from '../../store/authStore';

/**
 * StarContributor component
 * Shows the profile picture of the user with the most edits on a page
 * with a star icon overlay to indicate they're the top contributor
 */
const StarContributor = ({ sectionId, pageId }) => {
  const { config } = useWikiConfig();
  // Fetch ALL commits (up to 100) for accurate star contributor calculation
  const { commits, loading, error } = usePageHistory(sectionId, pageId, 100);
  const { user } = useAuthStore();

  // User action menu state
  const [showUserActionMenu, setShowUserActionMenu] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userMenuPosition, setUserMenuPosition] = useState({ x: 0, y: 0 });

  // Helper to parse anonymous contribution from commit message
  const parseAnonymousContribution = (commitMessage) => {
    if (!commitMessage) return null;
    const nameMatch = commitMessage.match(/Anonymous contribution by:\s*(.+)/);
    const emailMatch = commitMessage.match(/Email:\s*(.+?)\s*\(verified\s*✓\)/);
    if (nameMatch && emailMatch) {
      return {
        displayName: nameMatch[1].trim(),
        email: emailMatch[1].trim(),
      };
    }
    return null;
  };

  // Calculate top contributor using weighted scoring
  // Scoring: additions/deletions weighted more heavily than commit count
  // Formula: (commits * 10) + (additions * 0.5) + (deletions * 0.5)
  // Support both regular users and anonymous contributors
  const topContributor = useMemo(() => {
    if (!commits || commits.length === 0) {
      console.log('StarContributor: No commits found');
      return null;
    }

    const contributorScores = {}; // Track weighted scores
    const contributorStats = {}; // Track detailed stats
    const anonymousContributors = {}; // Track anonymous by email
    const botUsername = config?.wiki?.botUsername || import.meta.env.VITE_WIKI_BOT_USERNAME;

    // Scoring weights (configurable)
    const COMMIT_WEIGHT = 10; // Each commit is worth 10 points
    const ADDITION_WEIGHT = 0.5; // Each line added is worth 0.5 points
    const DELETION_WEIGHT = 0.5; // Each line deleted is worth 0.5 points

    console.log('[StarContributor] Debug:', {
      botUsername,
      totalCommits: commits.length,
      firstCommit: commits[0],
      weights: { COMMIT_WEIGHT, ADDITION_WEIGHT, DELETION_WEIGHT },
    });

    commits.forEach((commit) => {
      const username = commit.author?.username;
      const stats = commit.stats || { additions: 0, deletions: 0, total: 0 };

      console.log('[StarContributor] Processing commit:', {
        sha: commit.sha?.substring(0, 7),
        username,
        authorName: commit.author?.name,
        isBotCommit: username === botUsername,
        stats,
        messagePreview: commit.message?.substring(0, 100),
      });

      // Calculate score for this commit
      const commitScore = COMMIT_WEIGHT +
        (stats.additions * ADDITION_WEIGHT) +
        (stats.deletions * DELETION_WEIGHT);

      // Check if this is an anonymous contribution
      if (username === botUsername) {
        const anonData = parseAnonymousContribution(commit.message);
        console.log('[StarContributor] Anonymous data:', anonData);
        if (anonData) {
          const key = `anon:${anonData.email}`;
          contributorScores[key] = (contributorScores[key] || 0) + commitScore;

          // Track detailed stats
          if (!contributorStats[key]) {
            contributorStats[key] = { commits: 0, additions: 0, deletions: 0 };
          }
          contributorStats[key].commits += 1;
          contributorStats[key].additions += stats.additions;
          contributorStats[key].deletions += stats.deletions;

          // Store display name for this anonymous contributor (use first one encountered)
          if (!anonymousContributors[key]) {
            anonymousContributors[key] = {
              displayName: anonData.displayName,
              email: anonData.email,
              isAnonymous: true,
            };
          }
        }
      } else if (username) {
        // Regular contributor
        contributorScores[username] = (contributorScores[username] || 0) + commitScore;

        // Track detailed stats
        if (!contributorStats[username]) {
          contributorStats[username] = { commits: 0, additions: 0, deletions: 0 };
        }
        contributorStats[username].commits += 1;
        contributorStats[username].additions += stats.additions;
        contributorStats[username].deletions += stats.deletions;
      }
    });

    console.log('[StarContributor] Contributor scores:', contributorScores);
    console.log('[StarContributor] Contributor stats:', contributorStats);
    console.log('[StarContributor] Anonymous contributors:', anonymousContributors);

    // Find user/contributor with highest score
    let topContrib = null;
    let maxScore = 0;
    Object.entries(contributorScores).forEach(([key, score]) => {
      if (score > maxScore) {
        maxScore = score;

        if (key.startsWith('anon:')) {
          // Anonymous contributor
          topContrib = {
            ...anonymousContributors[key],
            name: anonymousContributors[key].displayName,
            username: null,
            avatar: null,
          };
        } else {
          // Regular contributor
          topContrib = commits.find((c) => c.author?.username === key)?.author;
        }
      }
    });

    if (topContrib) {
      console.log('StarContributor: Found top contributor', {
        contributor: topContrib.name,
        score: maxScore.toFixed(1),
        stats: contributorStats[topContrib.username || `anon:${topContrib.email}`],
      });
    } else {
      console.log('StarContributor: No top contributor found');
    }

    return topContrib;
  }, [commits, config?.wiki?.botUsername]);

  // Fetch display name for top contributor (skip anonymous)
  const topContributorUser = topContributor && !topContributor.isAnonymous && topContributor.username
    ? { id: topContributor.userId, login: topContributor.username }
    : null;
  const { displayName } = useDisplayName(topContributorUser);

  // Handle avatar click
  const handleAvatarClick = (e, username, userId) => {
    if (!username) return;
    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();
    setSelectedUser({ username, userId });
    setUserMenuPosition({ x: rect.left, y: rect.bottom - 2 });
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

  // Check if feature is enabled
  const starContributorConfig = config?.features?.starContributor;

  console.log('StarContributor Debug:', {
    enabled: starContributorConfig?.enabled,
    loading,
    commitsCount: commits?.length,
    error,
    sectionId,
    pageId,
    config: config?.features
  });

  if (!starContributorConfig?.enabled) {
    console.log('StarContributor: Feature not enabled');
    return null;
  }

  // Show error if there is one (temporarily for debugging)
  if (error) {
    console.error('StarContributor Error:', error);
    return (
      <div className="text-xs text-red-500 px-2 py-1">
        Error loading contributors: {error}
      </div>
    );
  }

  // Show loading state
  if (loading) {
    console.log('StarContributor: Loading...');
    return (
      <div className="flex items-center justify-center px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg h-[44px] w-[140px]">
        <svg className="animate-spin h-5 w-5 text-amber-600 dark:text-amber-400" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </div>
    );
  }

  // Don't show if no contributor found
  if (!topContributor) {
    return null;
  }

  const starIcon = starContributorConfig.icon || '⭐';

  return (
    <div
      className="flex items-start space-x-2 px-2.5 py-1.5 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg h-[44px] relative overflow-hidden"
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
        {topContributor.isAnonymous ? (
          <div className="w-8 h-8 rounded-full bg-gray-400 dark:bg-gray-600 flex items-center justify-center text-white text-sm font-semibold">
            A
          </div>
        ) : (
          <PrestigeAvatar
            src={topContributor.avatar}
            alt={topContributor.name}
            username={topContributor.username}
            userId={topContributor.userId}
            size="sm"
            showBadge={true}
            showPrestigeBadge={false}
            showDonatorBadge={true}
            onClick={handleAvatarClick}
          />
        )}
        {/* Star overlay */}
        <div
          className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 bg-amber-400 rounded-full flex items-center justify-center shadow-md text-[9px]"
          title="Top Contributor"
        >
          {starIcon}
        </div>
      </div>
      <div className="flex flex-col justify-center min-w-0 gap-0.5 mt-[3px]">
        <span className="text-[10px] font-medium text-amber-900 dark:text-amber-200 truncate leading-none">
          Top Contributor
        </span>
        <span className="text-xs text-amber-700 dark:text-amber-300 truncate leading-none">
          {topContributor.isAnonymous ? topContributor.name : (displayName || topContributor.username || topContributor.name)}
        </span>
      </div>

      {/* User Action Menu - only for registered users */}
      {showUserActionMenu && selectedUser && !topContributor.isAnonymous && (
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

export default StarContributor;
