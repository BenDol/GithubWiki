import { usePageHistory } from '../../hooks/usePageHistory';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import PrestigeAvatar from '../common/PrestigeAvatar';

/**
 * StarContributor component
 * Shows the profile picture of the user with the most edits on a page
 * with a star icon overlay to indicate they're the top contributor
 */
const StarContributor = ({ sectionId, pageId }) => {
  const { config } = useWikiConfig();
  const { commits, loading, error } = usePageHistory(sectionId, pageId);

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

  if (!commits || commits.length === 0) {
    console.log('StarContributor: No commits found');
    return null;
  }

  // Calculate top contributor (user with most commits)
  const contributorCounts = {};
  commits.forEach((commit) => {
    const username = commit.author?.username;
    if (username) {
      contributorCounts[username] = (contributorCounts[username] || 0) + 1;
    }
  });

  // Find user with most commits
  let topContributor = null;
  let maxCommits = 0;
  Object.entries(contributorCounts).forEach(([username, count]) => {
    if (count > maxCommits) {
      maxCommits = count;
      topContributor = commits.find((c) => c.author?.username === username)?.author;
    }
  });

  // Don't show if no contributor found
  if (!topContributor) {
    console.log('StarContributor: No top contributor found');
    return null;
  }

  console.log('StarContributor: Showing contributor', {
    contributor: topContributor.name,
    commits: maxCommits
  });

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
        <PrestigeAvatar
          src={topContributor.avatar}
          alt={topContributor.name}
          username={topContributor.username}
          size="sm"
          showBadge={false}
        />
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
          {topContributor.name}
        </span>
      </div>
    </div>
  );
};

export default StarContributor;
