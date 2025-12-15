import { useState, useEffect } from 'react';
import PrestigeAvatar from '../common/PrestigeAvatar';
import SparkleEffect from '../effects/SparkleEffect';
import UserActionMenu from '../common/UserActionMenu';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAuthStore } from '../../store/authStore';
import { addAdmin } from '../../services/github/admin';

/**
 * HighscorePodium Component
 * Displays top 3 contributors on an arc-aligned podium with animations
 */
const HighscorePodium = ({ topThree }) => {
  const { config } = useWikiConfig();
  const { user } = useAuthStore();
  const [isVisible, setIsVisible] = useState(false);

  // User action menu state
  const [showUserActionMenu, setShowUserActionMenu] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userMenuPosition, setUserMenuPosition] = useState({ x: 0, y: 0 });

  useEffect(() => {
    // Trigger entrance animation
    setTimeout(() => setIsVisible(true), 100);
  }, []);

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
      await addAdmin(username, owner, repo, user.login);
      alert(`✅ Successfully added ${username} as administrator`);
    } catch (error) {
      console.error('Failed to add admin:', error);
      alert('❌ Failed to add admin: ' + error.message);
    }
  };

  if (!topThree || topThree.length === 0) {
    return null;
  }

  // Ensure we have exactly 3 positions (fill with nulls if needed)
  const [first, second, third] = topThree;

  return (
    <div className="relative w-full max-w-5xl mx-auto py-6 sm:py-8 md:py-12">
      {/* Podium Container */}
      <div className="relative flex items-end justify-center gap-2 sm:gap-4 md:gap-8 px-2 sm:px-4">
        {/* 2nd Place - Left */}
        {second && (
          <div
            className={`flex flex-col items-center transition-all duration-700 transform ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'
            }`}
            style={{ transitionDelay: '200ms' }}
          >
            {/* Avatar with Prestige Badge */}
            <div className="relative mb-2 sm:mb-3 md:mb-4">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 blur-lg opacity-60 animate-pulse"></div>
              <PrestigeAvatar
                src={second.avatarUrl}
                alt={second.login}
                username={second.login}
                size={window.innerWidth < 640 ? 'md' : window.innerWidth < 768 ? 'lg' : 'xl'}
                showBadge={true}
                onClick={handleAvatarClick}
              />
            </div>

            {/* Username */}
            <div className="text-center mb-1 sm:mb-2">
              <h3 className="text-base sm:text-lg md:text-xl font-bold text-gray-800 dark:text-gray-200 truncate max-w-[80px] sm:max-w-none">
                {second.login}
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                {second.score?.toLocaleString() || second.contributions?.toLocaleString() || 0}
              </p>
            </div>

            {/* Podium Base */}
            <div className="relative w-20 h-16 sm:w-24 sm:h-20 md:w-32 md:h-24 bg-gradient-to-b from-gray-300 to-gray-400 rounded-t-lg shadow-2xl border-t-2 sm:border-t-4 border-gray-200 dark:from-gray-600 dark:to-gray-700 dark:border-gray-500">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-t-lg"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl sm:text-4xl md:text-5xl drop-shadow-lg">🥈</span>
              </div>
            </div>
          </div>
        )}

        {/* 1st Place - Center (Highest) */}
        {first && (
          <div
            className={`flex flex-col items-center transition-all duration-700 transform ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'
            }`}
            style={{ transitionDelay: '100ms' }}
          >
            {/* Avatar with Prestige Badge and Glow */}
            <div className="relative mb-2 sm:mb-3 md:mb-4">
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-500 blur-2xl opacity-80 animate-pulse"></div>
              {/* Sparkles */}
              <div className="absolute inset-0 w-24 h-24 sm:w-28 sm:h-28 md:w-32 md:h-32 -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2">
                <SparkleEffect color="#FFD700" density={20} size={6} />
              </div>
              {/* Avatar */}
              <div className="relative">
                <PrestigeAvatar
                  src={first.avatarUrl}
                  alt={first.login}
                  username={first.login}
                  size={window.innerWidth < 640 ? 'xl' : window.innerWidth < 768 ? '2xl' : '2xl'}
                  showBadge={true}
                  badgeScale={0.85}
                  onClick={handleAvatarClick}
                />
              </div>
            </div>

            {/* Username */}
            <div className="text-center mb-1 sm:mb-2">
              <h3 className="text-lg sm:text-xl md:text-2xl font-bold text-yellow-500 dark:text-yellow-400 truncate max-w-[100px] sm:max-w-none">
                {first.login}
              </h3>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400 font-semibold">
                {first.score?.toLocaleString() || first.contributions?.toLocaleString() || 0}
              </p>
            </div>

            {/* Podium Base (Tallest) */}
            <div className="relative w-20 h-24 sm:w-24 sm:h-28 md:w-32 md:h-36 bg-gradient-to-b from-yellow-400 to-yellow-600 rounded-t-lg shadow-2xl border-t-2 sm:border-t-4 border-yellow-300">
              <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent rounded-t-lg"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-4xl sm:text-5xl md:text-6xl drop-shadow-lg animate-bounce">🏆</span>
              </div>
              {/* Glow at base */}
              <div className="absolute -inset-2 bg-gradient-to-b from-transparent via-yellow-400/50 to-yellow-500/50 rounded-t-lg blur-xl -z-10 animate-pulse"></div>
            </div>
          </div>
        )}

        {/* 3rd Place - Right */}
        {third && (
          <div
            className={`flex flex-col items-center transition-all duration-700 transform ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'
            }`}
            style={{ transitionDelay: '300ms' }}
          >
            {/* Avatar with Prestige Badge */}
            <div className="relative mb-2 sm:mb-3 md:mb-4">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 blur-lg opacity-60 animate-pulse"></div>
              <PrestigeAvatar
                src={third.avatarUrl}
                alt={third.login}
                username={third.login}
                size={window.innerWidth < 640 ? 'md' : window.innerWidth < 768 ? 'lg' : 'xl'}
                showBadge={true}
                onClick={handleAvatarClick}
              />
            </div>

            {/* Username */}
            <div className="text-center mb-1 sm:mb-2">
              <h3 className="text-base sm:text-lg md:text-xl font-bold text-gray-800 dark:text-gray-200 truncate max-w-[80px] sm:max-w-none">
                {third.login}
              </h3>
              <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                {third.score?.toLocaleString() || third.contributions?.toLocaleString() || 0}
              </p>
            </div>

            {/* Podium Base */}
            <div className="relative w-20 h-14 sm:w-24 sm:h-16 md:w-32 md:h-20 bg-gradient-to-b from-orange-400 to-orange-600 rounded-t-lg shadow-2xl border-t-2 sm:border-t-4 border-orange-300 dark:from-orange-600 dark:to-orange-700 dark:border-orange-500">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-t-lg"></div>
              <div className="absolute inset-0 flex items-center justify-center">
                <span className="text-3xl sm:text-4xl md:text-5xl drop-shadow-lg">🥉</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Background glow effect */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-radial from-yellow-400/20 via-transparent to-transparent blur-3xl animate-pulse"></div>
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

export default HighscorePodium;
