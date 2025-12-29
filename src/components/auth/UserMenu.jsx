import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { Trash2 } from 'lucide-react';
import { useAuthStore } from '../../store/authStore';
import { useDisplayName } from '../../hooks/useDisplayName';
import PrestigeAvatar from '../common/PrestigeAvatar';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useUserPrestige } from '../../hooks/usePrestige';
import { getCurrentUserAdminStatus } from '../../services/github/admin';

/**
 * UserMenu component with profile dropdown
 * Shows user avatar and provides logout option
 * Prestige badge auto-loads for authenticated user
 */
const UserMenu = () => {
  const { user, logout, isLoading: authLoading } = useAuthStore();
  const { config } = useWikiConfig();
  const [isOpen, setIsOpen] = useState(false);
  const [isAdmin, setIsAdmin] = useState(false);
  const [adminCheckLoading, setAdminCheckLoading] = useState(true);
  const menuRef = useRef(null);

  // Load display name for current user
  const { displayName } = useDisplayName(user ? { id: user.id, login: user.login } : null);

  // Load prestige data for current user
  const { tier: prestigeTier } = useUserPrestige(user?.login);

  // Check if user is admin (only after auth is ready)
  useEffect(() => {
    // Wait for auth loading to complete before checking admin status
    if (authLoading) {
      return;
    }

    if (!config || !user) {
      setIsAdmin(false);
      setAdminCheckLoading(false);
      return;
    }

    const checkAdmin = async () => {
      try {
        const { owner, repo } = config.wiki.repository;
        const status = await getCurrentUserAdminStatus(owner, repo, config);
        setIsAdmin(status.isAdmin);
      } catch (error) {
        console.error('Failed to check admin status:', error);
        setIsAdmin(false);
      } finally {
        setAdminCheckLoading(false);
      }
    };

    checkAdmin();
  }, [config, user, authLoading]);

  // Close menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!user) return null;

  const handleLogout = () => {
    logout();
    setIsOpen(false);
  };

  const handleClearCacheAndLogout = (e) => {
    e.stopPropagation(); // Prevent triggering parent button

    const confirmed = window.confirm(
      'Clear all cache storage and log out?\n\n' +
      'This will remove all cached data (prestige, highscores, emails, etc.) and require fresh API calls on next login.\n\n' +
      'Are you sure?'
    );

    if (confirmed) {
      // Clear all cache: prefixed localStorage items
      const keys = Object.keys(localStorage);
      const cacheKeys = keys.filter(key => key.startsWith('cache:') || key.startsWith('github_'));

      cacheKeys.forEach(key => {
        localStorage.removeItem(key);
      });

      console.log(`[UserMenu] Cleared ${cacheKeys.length} cache entries`);

      // Then logout
      logout();
      setIsOpen(false);
    }
  };

  return (
    <div className="relative" ref={menuRef}>
      {/* User button */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-2 p-1 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 transition-colors"
      >
        <PrestigeAvatar
          src={user.avatar_url}
          alt={user.name || user.login}
          size="sm"
          username={user.login}
          showBadge={true}
          className="ring-2 ring-gray-200 dark:ring-gray-700 rounded-full"
        />
        <svg
          className={`w-4 h-4 text-gray-600 dark:text-gray-400 transition-transform ${
            isOpen ? 'rotate-180' : ''
          }`}
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* Dropdown menu */}
      {isOpen && (
        <div className="absolute right-0 mt-2 w-64 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
          {/* User info */}
          <div className="px-4 py-3 border-b border-gray-200 dark:border-gray-700">
            <div className="flex items-center space-x-3">
              <PrestigeAvatar
                src={user.avatar_url}
                alt={user.name || user.login}
                size="md"
                username={user.login}
                showBadge={true}
              />
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
                  {displayName || user.login}
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
                  @{user.login}
                </p>
                {prestigeTier && (
                  <p className="text-xs font-medium truncate mt-0.5" style={{ color: prestigeTier.color }}>
                    {prestigeTier.title}
                  </p>
                )}
              </div>
            </div>

            {user.bio && (
              <p className="mt-2 text-xs text-gray-600 dark:text-gray-400 line-clamp-2">
                {user.bio}
              </p>
            )}
          </div>

          {/* Menu items */}
          <div className="py-1">
            <Link
              to="/profile"
              onClick={() => setIsOpen(false)}
              className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              My Profile
            </Link>

            <Link
              to="/my-collections"
              onClick={() => setIsOpen(false)}
              className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 012-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
              My Collections
            </Link>

            {/* Admin Panel - only show for admins and owner */}
            {!adminCheckLoading && isAdmin && (
              <Link
                to="/admin"
                onClick={() => setIsOpen(false)}
                className="flex items-center px-4 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
                </svg>
                Admin Panel
              </Link>
            )}

            {/* Dev Tools - only show in development */}
            {import.meta.env.DEV && (
              <Link
                to="/dev-tools"
                onClick={() => setIsOpen(false)}
                className="flex items-center px-4 py-2 text-sm text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors"
              >
                <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10.325 4.317c.426-1.756 2.924-1.756 3.35 0a1.724 1.724 0 002.573 1.066c1.543-.94 3.31.826 2.37 2.37a1.724 1.724 0 001.065 2.572c1.756.426 1.756 2.924 0 3.35a1.724 1.724 0 00-1.066 2.573c.94 1.543-.826 3.31-2.37 2.37a1.724 1.724 0 00-2.572 1.065c-.426 1.756-2.924 1.756-3.35 0a1.724 1.724 0 00-2.573-1.066c-1.543.94-3.31-.826-2.37-2.37a1.724 1.724 0 00-1.065-2.572c-1.756-.426-1.756-2.924 0-3.35a1.724 1.724 0 001.066-2.573c-.94-1.543.826-3.31 2.37-2.37.996.608 2.296.07 2.572-1.065z" />
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15 12a3 3 0 11-6 0 3 3 0 016 0z" />
                </svg>
                Developer Tools
              </Link>
            )}

            <a
              href={`https://github.com/${user.login}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
            >
              <svg className="w-4 h-4 mr-3" fill="currentColor" viewBox="0 0 24 24">
                <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
              </svg>
              View GitHub Profile
            </a>
          </div>

          {/* Logout */}
          <div className="border-t border-gray-200 dark:border-gray-700 py-1">
            <div className="relative">
              <button
                onClick={handleLogout}
                className="flex items-center w-full px-4 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors"
              >
                <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 16l4-4m0 0l-4-4m4 4H7m6 4v1a3 3 0 01-3 3H6a3 3 0 01-3-3V7a3 3 0 013-3h4a3 3 0 013 3v1" />
                </svg>
                Sign Out
              </button>
              <button
                onClick={handleClearCacheAndLogout}
                className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-gray-400 hover:text-red-600 dark:hover:text-red-400 transition-colors"
                title="Clear cache & sign out"
              >
                <Trash2 className="w-3.5 h-3.5" />
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default UserMenu;
