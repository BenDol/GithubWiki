import { useState, useMemo } from 'react';
import PrestigeAvatar from '../common/PrestigeAvatar';
import UserActionMenu from '../common/UserActionMenu';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAuthStore } from '../../store/authStore';
import { useDisplayNames } from '../../hooks/useDisplayName';
import { addAdmin } from '../../services/adminActions';

/**
 * HighscoreList Component
 * Displays remaining contributors in a ranked list
 */
const HighscoreList = ({ contributors, startRank = 4 }) => {
  const { config } = useWikiConfig();
  const { user } = useAuthStore();

  // Extract users from contributors for display name fetching
  const contributorUsers = useMemo(() =>
    contributors ? contributors.map(c => ({ id: c.userId, login: c.login })) : [],
    [contributors]
  );
  const { displayNames } = useDisplayNames(contributorUsers);

  // User action menu state
  const [showUserActionMenu, setShowUserActionMenu] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userMenuPosition, setUserMenuPosition] = useState({ x: 0, y: 0 });

  // Handle avatar click
  const handleAvatarClick = (e, username) => {
    if (!username) return;
    e.stopPropagation();
    e.preventDefault(); // Prevent link navigation
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
    try {
      const result = await addAdmin(username);
      alert(`✅ ${result.message}`);
    } catch (error) {
      console.error('Failed to add admin:', error);
      alert('❌ Failed to add admin: ' + error.message);
    }
  };

  if (!contributors || contributors.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-6 sm:mt-8 md:mt-12 px-4 sm:px-6">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 text-center">
        All Contributors
      </h2>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header - Hidden on mobile */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 font-semibold text-sm text-gray-600 dark:text-gray-400">
          <div className="col-span-1 text-center">Rank</div>
          <div className="col-span-7">Contributor</div>
          <div className="col-span-4 text-right">Score</div>
        </div>

        {/* Contributors List */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {contributors.map((contributor, index) => {
            const rank = startRank + index;
            const isTopTen = rank <= 10;

            return (
              <a
                key={contributor.login}
                href={contributor.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`grid grid-cols-12 gap-2 sm:gap-3 md:gap-4 px-3 sm:px-4 md:px-6 py-3 sm:py-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  isTopTen ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
                }`}
              >
                {/* Rank */}
                <div className="col-span-2 md:col-span-1 flex items-center justify-center">
                  <span
                    className={`text-sm sm:text-base md:text-lg font-bold ${
                      isTopTen
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    #{rank}
                  </span>
                </div>

                {/* Contributor Info */}
                <div className="col-span-6 md:col-span-7 flex items-center space-x-2 sm:space-x-3">
                  {contributor.isAnonymous || !contributor.avatarUrl ? (
                    <div className={`${window.innerWidth < 640 ? 'w-8 h-8 text-sm' : 'w-10 h-10 text-base'} rounded-full flex-shrink-0 bg-gray-400 dark:bg-gray-600 flex items-center justify-center text-white font-semibold`}>
                      A
                    </div>
                  ) : (
                    <PrestigeAvatar
                      src={contributor.avatarUrl}
                      alt={contributor.login}
                      username={contributor.login}
                      userId={contributor.userId}
                      size={window.innerWidth < 640 ? 'sm' : 'md'}
                      showBadge={true}
                      onClick={handleAvatarClick}
                    />
                  )}
                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col space-y-0.5">
                      <div className="flex items-center space-x-1 sm:space-x-2">
                        <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white truncate">
                          {displayNames[contributor.userId] || contributor.login}
                        </h3>
                        {isTopTen && (
                          <span className="hidden sm:inline-flex text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full font-medium">
                            Top 10
                          </span>
                        )}
                        {contributor.isAnonymous && (
                          <span className="inline-flex text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 px-2 py-0.5 rounded-full font-medium">
                            Anonymous
                          </span>
                        )}
                      </div>
                      {displayNames[contributor.userId] && displayNames[contributor.userId] !== contributor.login && (
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          @{contributor.login}
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Score */}
                <div className="col-span-4 md:col-span-4 flex items-center justify-end">
                  <div className="text-right">
                    <div className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                      {contributor.score?.toLocaleString() || contributor.contributions?.toLocaleString() || 0}
                    </div>
                    <div className="hidden sm:block text-xs text-gray-500 dark:text-gray-400">
                      score
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>

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

export default HighscoreList;
