import { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useWikiConfig } from '../hooks/useWikiConfig';
import { useAuthStore } from '../store/authStore';
import LoadingSpinner from '../components/common/LoadingSpinner';
import {
  getCurrentUserAdminStatus,
  getAdmins,
  getBannedUsers,
  addAdmin,
  removeAdmin,
  banUser,
  unbanUser,
} from '../services/github/admin';

/**
 * Admin Panel Component
 * Repository owner and admins can manage users
 * Only repository owner can manage admins
 */
const AdminPanel = () => {
  const { config } = useWikiConfig();
  const navigate = useNavigate();
  const { isAuthenticated, user, isLoading: authLoading } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [adminStatus, setAdminStatus] = useState({ isOwner: false, isAdmin: false, username: null });
  const [admins, setAdmins] = useState([]);
  const [bannedUsers, setBannedUsers] = useState([]);

  const [activeTab, setActiveTab] = useState('banned-users'); // 'banned-users' or 'admins'

  // Ban user form
  const [banUsername, setBanUsername] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banLoading, setBanLoading] = useState(false);

  // Add admin form
  const [addAdminUsername, setAddAdminUsername] = useState('');
  const [addAdminLoading, setAddAdminLoading] = useState(false);

  useEffect(() => {
    // Wait for auth to finish loading before checking access
    if (authLoading) {
      console.log('[AdminPanel] Waiting for auth to complete...');
      return;
    }

    if (!config || !isAuthenticated) {
      setLoading(false);
      return;
    }

    if (!config.wiki?.repository) {
      console.error('[Admin] Config missing wiki.repository');
      return;
    }

    const checkAccess = async () => {
      try {
        setLoading(true);
        const { owner, repo } = config.wiki.repository;

        // Check if user is admin or owner
        const status = await getCurrentUserAdminStatus(owner, repo);
        setAdminStatus(status);

        if (!status.isAdmin) {
          // Not authorized, redirect to home
          alert('❌ Access Denied\n\nYou must be a repository owner or admin to access this page.');
          navigate('/');
          return;
        }

        // Load data
        await loadData();
      } catch (error) {
        console.error('Failed to check admin access:', error);
        alert('❌ Failed to load admin panel: ' + error.message);
        navigate('/');
      } finally {
        setLoading(false);
      }
    };

    checkAccess();
  }, [config, isAuthenticated, authLoading, navigate]);

  const loadData = async () => {
    if (!config?.wiki?.repository) return;

    try {
      const { owner, repo } = config.wiki.repository;
      const [adminsData, bannedData] = await Promise.all([
        getAdmins(owner, repo),
        getBannedUsers(owner, repo),
      ]);
      setAdmins(adminsData);
      setBannedUsers(bannedData);
    } catch (error) {
      console.error('Failed to load admin data:', error);
      alert('❌ Failed to load data: ' + error.message);
    }
  };

  const handleBanUser = async (e) => {
    e.preventDefault();
    if (!banUsername.trim() || !banReason.trim()) {
      alert('Please enter both username and reason');
      return;
    }

    if (!config?.wiki?.repository) {
      alert('❌ Configuration error');
      return;
    }

    try {
      setBanLoading(true);
      const { owner, repo } = config.wiki.repository;
      await banUser(banUsername.trim(), banReason.trim(), owner, repo, adminStatus.username);

      alert(`✅ Successfully banned ${banUsername}`);
      setBanUsername('');
      setBanReason('');
      await loadData();
    } catch (error) {
      console.error('Failed to ban user:', error);
      alert('❌ Failed to ban user: ' + error.message);
    } finally {
      setBanLoading(false);
    }
  };

  const handleUnbanUser = async (username) => {
    if (!confirm(`Are you sure you want to unban ${username}?`)) {
      return;
    }

    if (!config?.wiki?.repository) {
      alert('❌ Configuration error');
      return;
    }

    try {
      const { owner, repo } = config.wiki.repository;
      await unbanUser(username, owner, repo, adminStatus.username);

      alert(`✅ Successfully unbanned ${username}`);
      await loadData();
    } catch (error) {
      console.error('Failed to unban user:', error);
      alert('❌ Failed to unban user: ' + error.message);
    }
  };

  const handleAddAdmin = async (e) => {
    e.preventDefault();
    if (!addAdminUsername.trim()) {
      alert('Please enter a username');
      return;
    }

    if (!adminStatus.isOwner) {
      alert('❌ Only the repository owner can add admins');
      return;
    }

    if (!config?.wiki?.repository) {
      alert('❌ Configuration error');
      return;
    }

    try {
      setAddAdminLoading(true);
      const { owner, repo } = config.wiki.repository;
      await addAdmin(addAdminUsername.trim(), owner, repo, adminStatus.username);

      alert(`✅ Successfully added ${addAdminUsername} as admin`);
      setAddAdminUsername('');
      await loadData();
    } catch (error) {
      console.error('Failed to add admin:', error);
      alert('❌ Failed to add admin: ' + error.message);
    } finally {
      setAddAdminLoading(false);
    }
  };

  const handleRemoveAdmin = async (username) => {
    if (!adminStatus.isOwner) {
      alert('❌ Only the repository owner can remove admins');
      return;
    }

    if (!confirm(`Are you sure you want to remove ${username} as admin?`)) {
      return;
    }

    if (!config?.wiki?.repository) {
      alert('❌ Configuration error');
      return;
    }

    try {
      const { owner, repo } = config.wiki.repository;
      await removeAdmin(username, owner, repo, adminStatus.username);

      alert(`✅ Successfully removed ${username} as admin`);
      await loadData();
    } catch (error) {
      console.error('Failed to remove admin:', error);
      alert('❌ Failed to remove admin: ' + error.message);
    }
  };

  // ✅ CORRECT - Check loading states FIRST before authentication
  if (authLoading || loading) {
    return (
      <div className="max-w-4xl mx-auto px-2 sm:px-4 py-8">
        <LoadingSpinner />
      </div>
    );
  }

  if (!isAuthenticated) {
    return (
      <div className="max-w-4xl mx-auto px-2 sm:px-4 py-8">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6 text-center">
          <p className="text-yellow-900 dark:text-yellow-200">
            Please sign in to access the admin panel.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto px-2 sm:px-4 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          🔐 Admin Panel
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Manage wiki users and administrators
        </p>
        <div className="mt-4 flex items-center gap-2">
          <span className="px-3 py-1 bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200 rounded-full text-sm font-medium">
            {adminStatus.isOwner ? '👑 Repository Owner' : '🛡️ Administrator'}
          </span>
          <span className="text-gray-500 dark:text-gray-400 text-sm">
            Signed in as {adminStatus.username}
          </span>
        </div>
      </div>

      {/* Tabs */}
      <div className="mb-6 border-b border-gray-200 dark:border-gray-700">
        <div className="flex gap-4">
          <button
            onClick={() => setActiveTab('banned-users')}
            className={`pb-3 px-4 font-medium border-b-2 transition-colors ${
              activeTab === 'banned-users'
                ? 'border-red-500 text-red-600 dark:text-red-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            🚫 Banned Users ({bannedUsers.length})
          </button>
          {adminStatus.isOwner && (
            <button
              onClick={() => setActiveTab('admins')}
              className={`pb-3 px-4 font-medium border-b-2 transition-colors ${
                activeTab === 'admins'
                  ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
              }`}
            >
              👥 Administrators ({admins.length})
            </button>
          )}
        </div>
      </div>

      {/* Banned Users Tab */}
      {activeTab === 'banned-users' && (
        <div className="space-y-6">
          {/* Ban User Form */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Ban User
            </h2>
            <form onSubmit={handleBanUser} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  GitHub Username
                </label>
                <input
                  type="text"
                  value={banUsername}
                  onChange={(e) => setBanUsername(e.target.value)}
                  placeholder="username"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500"
                  disabled={banLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reason
                </label>
                <textarea
                  value={banReason}
                  onChange={(e) => setBanReason(e.target.value)}
                  placeholder="Reason for ban..."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-red-500 resize-none"
                  disabled={banLoading}
                />
              </div>
              <button
                type="submit"
                disabled={banLoading || !banUsername.trim() || !banReason.trim()}
                className="px-4 py-2 bg-red-500 text-white rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {banLoading ? 'Banning...' : 'Ban User'}
              </button>
            </form>
          </div>

          {/* Banned Users List */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Banned Users List
            </h2>
            {bannedUsers.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No banned users
              </p>
            ) : (
              <div className="space-y-3">
                {bannedUsers.map((banned) => (
                  <div
                    key={banned.username}
                    className="flex items-start justify-between p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <a
                          href={`https://github.com/${banned.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-gray-900 dark:text-white hover:underline"
                        >
                          @{banned.username}
                        </a>
                      </div>
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
                        <strong>Reason:</strong> {banned.reason}
                      </p>
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        Banned by {banned.bannedBy} on{' '}
                        {new Date(banned.bannedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleUnbanUser(banned.username)}
                      className="ml-4 px-3 py-1 bg-green-500 text-white rounded hover:bg-green-600 transition-colors text-sm font-medium"
                    >
                      Unban
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Admins Tab (Owner Only) */}
      {activeTab === 'admins' && adminStatus.isOwner && (
        <div className="space-y-6">
          {/* Add Admin Form */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Add Administrator
            </h2>
            <form onSubmit={handleAddAdmin} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  GitHub Username
                </label>
                <input
                  type="text"
                  value={addAdminUsername}
                  onChange={(e) => setAddAdminUsername(e.target.value)}
                  placeholder="username"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500"
                  disabled={addAdminLoading}
                />
                <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
                  ⚠️ Admins can ban/unban users but cannot manage other admins.
                </p>
              </div>
              <button
                type="submit"
                disabled={addAdminLoading || !addAdminUsername.trim()}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {addAdminLoading ? 'Adding...' : 'Add Admin'}
              </button>
            </form>
          </div>

          {/* Admins List */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Administrators List
            </h2>
            {admins.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No additional administrators. Only the repository owner has admin access.
              </p>
            ) : (
              <div className="space-y-3">
                {admins.map((admin) => (
                  <div
                    key={admin.username}
                    className="flex items-start justify-between p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <a
                          href={`https://github.com/${admin.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-gray-900 dark:text-white hover:underline"
                        >
                          @{admin.username}
                        </a>
                      </div>
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        Added by {admin.addedBy} on{' '}
                        {new Date(admin.addedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveAdmin(admin.username)}
                      className="ml-4 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Owner Info Box */}
          <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
            <p className="text-sm text-yellow-900 dark:text-yellow-200">
              <strong>👑 Repository Owner:</strong> The repository owner (you) always has admin access and cannot be removed.
            </p>
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
