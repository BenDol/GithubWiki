import { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAuthStore } from '../../store/authStore';
import { useDisplayName } from '../../hooks/useDisplayName';
import { getCurrentUserAdminStatus, banUser } from '../../services/github/admin';

/**
 * User Action Menu Component
 * Shows action menu when clicking on user avatars
 * Options based on current user's permissions
 */
const UserActionMenu = ({ username, userId, onClose, position, onBan, onMakeAdmin }) => {
  const navigate = useNavigate();
  const { config } = useWikiConfig();
  const { user, isAuthenticated } = useAuthStore();

  // Fetch display name if userId is provided
  const { displayName } = useDisplayName(userId ? { id: userId, login: username } : null);
  const displayNameOrUsername = displayName || username;

  const [adminStatus, setAdminStatus] = useState({ isOwner: false, isAdmin: false });
  const [loading, setLoading] = useState(true);
  const [showBanModal, setShowBanModal] = useState(false);
  const [banReason, setBanReason] = useState('');
  const [banning, setBanning] = useState(false);
  const menuRef = useRef(null);

  // Check admin status
  useEffect(() => {
    if (!config || !isAuthenticated) {
      setLoading(false);
      return;
    }

    const checkStatus = async () => {
      try {
        const { owner, repo } = config.wiki.repository;
        const status = await getCurrentUserAdminStatus(owner, repo, config);
        setAdminStatus(status);
      } catch (error) {
        console.error('Failed to check admin status:', error);
      } finally {
        setLoading(false);
      }
    };

    checkStatus();
  }, [config, isAuthenticated]);

  // Close on click outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (menuRef.current && !menuRef.current.contains(event.target)) {
        if (!showBanModal) {
          onClose();
        }
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [onClose, showBanModal]);

  // Can't perform actions on yourself
  const isSelf = user?.login?.toLowerCase() === username?.toLowerCase();

  const handleViewProfile = () => {
    navigate(`/profile/${username}`);
    onClose();
  };

  const handleBanClick = () => {
    setShowBanModal(true);
  };

  const handleBanSubmit = async (e) => {
    e.preventDefault();
    if (!banReason.trim()) {
      alert('Please enter a ban reason');
      return;
    }

    try {
      setBanning(true);
      const { owner, repo } = config.wiki.repository;
      await banUser(username, banReason.trim(), owner, repo, adminStatus.username, config);

      alert(`✅ Successfully banned ${username}`);
      setBanReason('');
      setShowBanModal(false);
      onClose();

      if (onBan) onBan();
    } catch (error) {
      console.error('Failed to ban user:', error);
      alert('❌ Failed to ban user: ' + error.message);
    } finally {
      setBanning(false);
    }
  };

  const handleMakeAdmin = async () => {
    if (!confirm(`Are you sure you want to make ${username} an administrator?`)) {
      return;
    }

    onClose();
    if (onMakeAdmin) {
      onMakeAdmin(username);
    }
  };

  if (loading) {
    return (
      <div
        ref={menuRef}
        style={{ top: position.y, left: position.x }}
        className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 p-2"
      >
        <div className="px-4 py-2 text-sm text-gray-500 dark:text-gray-400">
          Loading...
        </div>
      </div>
    );
  }

  return (
    <>
      {/* Action Menu */}
      <div
        ref={menuRef}
        style={{ top: position.y, left: position.x }}
        className="fixed z-50 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 min-w-[180px]"
      >
        {/* User Header */}
        <div className="px-4 py-2 border-b border-gray-200 dark:border-gray-700">
          <p className="text-sm font-medium text-gray-900 dark:text-white truncate">
            {displayNameOrUsername}
          </p>
          {displayName && displayName !== username && (
            <p className="text-xs text-gray-500 dark:text-gray-400 truncate">
              @{username}
            </p>
          )}
        </div>

        {/* View Profile */}
        <button
          onClick={handleViewProfile}
          className="w-full text-left px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors flex items-center"
        >
          <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
          </svg>
          View Profile
        </button>

        {/* Admin Actions */}
        {isAuthenticated && !isSelf && adminStatus.isAdmin && (
          <>
            <div className="border-t border-gray-200 dark:border-gray-700 my-1" />

            {/* Ban User (Admin or Owner) */}
            <button
              onClick={handleBanClick}
              className="w-full text-left px-4 py-2 text-sm text-red-700 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 transition-colors flex items-center"
            >
              <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M18.364 18.364A9 9 0 005.636 5.636m12.728 12.728A9 9 0 015.636 5.636m12.728 12.728L5.636 5.636" />
              </svg>
              Ban User
            </button>

            {/* Make Admin (Owner Only) */}
            {adminStatus.isOwner && (
              <button
                onClick={handleMakeAdmin}
                className="w-full text-left px-4 py-2 text-sm text-blue-700 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 transition-colors flex items-center"
              >
                <svg className="w-4 h-4 mr-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4.354a4 4 0 110 5.292M15 21H3v-1a6 6 0 0112 0v1zm0 0h6v-1a6 6 0 00-9-5.197M13 7a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
                Make Administrator
              </button>
            )}
          </>
        )}
      </div>

      {/* Ban Modal */}
      {showBanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4">
            <div className="p-6">
              <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
                Ban User: {displayNameOrUsername}
                {displayName && displayName !== username && (
                  <span className="text-sm text-gray-500 dark:text-gray-400 font-normal"> (@{username})</span>
                )}
              </h3>

              <form onSubmit={handleBanSubmit}>
                <div className="mb-4">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                    Reason for ban
                  </label>
                  <textarea
                    value={banReason}
                    onChange={(e) => setBanReason(e.target.value)}
                    placeholder="Explain why this user is being banned..."
                    rows={4}
                    className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                    autoFocus
                    disabled={banning}
                  />
                </div>

                <div className="flex justify-end gap-3">
                  <button
                    type="button"
                    onClick={() => {
                      setShowBanModal(false);
                      setBanReason('');
                    }}
                    className="px-4 py-2 text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
                    disabled={banning}
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={!banReason.trim() || banning}
                    className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
                  >
                    {banning ? 'Banning...' : 'Ban User'}
                  </button>
                </div>
              </form>
            </div>
          </div>
        </div>
      )}
    </>
  );
};

export default UserActionMenu;
