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
  getAllDonators,
  assignDonatorBadge,
  removeDonatorBadge,
} from '../services/adminActions';

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
  const [reportedIssues, setReportedIssues] = useState([]);
  const [issuesLoading, setIssuesLoading] = useState(false);

  const [activeTab, setActiveTab] = useState('banned-users'); // 'banned-users', 'admins', 'reported-issues', or 'donators'

  // Ban user form
  const [banUsername, setBanUsername] = useState('');
  const [banReason, setBanReason] = useState('');
  const [banLoading, setBanLoading] = useState(false);

  // Add admin form
  const [addAdminUsername, setAddAdminUsername] = useState('');
  const [addAdminLoading, setAddAdminLoading] = useState(false);

  // Donator management
  const [donators, setDonators] = useState([]);
  const [donatorUsername, setDonatorUsername] = useState('');
  const [donatorAmount, setDonatorAmount] = useState('');
  const [donatorReason, setDonatorReason] = useState('');
  const [donatorLoading, setDonatorLoading] = useState(false);

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

        console.log('[AdminPanel] Checking access', {
          username: user?.login,
          isAuthenticated
        });

        // Check if user is admin or owner
        const status = await getCurrentUserAdminStatus();
        console.log('[AdminPanel] Admin status result:', status);
        setAdminStatus(status);

        if (!status.isAdmin) {
          // Not authorized, redirect to home
          console.error('[AdminPanel] Access denied:', {
            username: status.username,
            isOwner: status.isOwner,
            isAdmin: status.isAdmin,
            repoOwner: owner
          });
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

  // Load donators when tab is active
  useEffect(() => {
    if (activeTab === 'donators' && config) {
      loadDonators();
    }
  }, [activeTab, config]);

  // Load reported issues when tab is active
  useEffect(() => {
    if (activeTab === 'reported-issues' && config) {
      loadReportedIssues();
    }
  }, [activeTab, config]);

  const loadData = async () => {
    try {
      const [adminsData, bannedData] = await Promise.all([
        getAdmins(),
        getBannedUsers(),
      ]);
      setAdmins(adminsData);
      setBannedUsers(bannedData);
    } catch (error) {
      console.error('Failed to load admin data:', error);
      alert('❌ Failed to load data: ' + error.message);
    }
  };

  const loadDonators = async () => {
    try {
      const donatorsData = await getAllDonators();
      setDonators(donatorsData);
    } catch (error) {
      console.error('Failed to load donators:', error);
      alert('❌ Failed to load donators: ' + error.message);
    }
  };

  const loadReportedIssues = async () => {
    if (!config?.wiki?.repository) return;

    try {
      setIssuesLoading(true);
      const { owner, repo } = config.wiki.repository;

      const response = await fetch(
        `https://api.github.com/repos/${owner}/${repo}/issues?labels=user-report&state=open&per_page=100`,
        {
          headers: {
            'Accept': 'application/vnd.github.v3+json'
          }
        }
      );

      if (!response.ok) {
        throw new Error(`Failed to fetch issues: ${response.statusText}`);
      }

      const issues = await response.json();
      setReportedIssues(issues);
    } catch (error) {
      console.error('Failed to load reported issues:', error);
      alert('❌ Failed to load reported issues: ' + error.message);
    } finally {
      setIssuesLoading(false);
    }
  };

  const handleAssignDonatorBadge = async (e) => {
    e.preventDefault();
    if (!donatorUsername.trim()) {
      alert('Please enter a username');
      return;
    }

    try {
      setDonatorLoading(true);
      const amount = donatorAmount.trim() ? parseFloat(donatorAmount.trim()) : null;
      const result = await assignDonatorBadge(donatorUsername.trim(), amount, donatorReason.trim() || null);

      alert(`✅ ${result.message}`);
      setDonatorUsername('');
      setDonatorAmount('');
      setDonatorReason('');
      await loadDonators();
    } catch (error) {
      console.error('Failed to assign donator badge:', error);
      alert('❌ Failed to assign donator badge: ' + error.message);
    } finally {
      setDonatorLoading(false);
    }
  };

  const handleRemoveDonatorBadge = async (username) => {
    if (!confirm(`Are you sure you want to remove the donator badge from ${username}?`)) {
      return;
    }

    try {
      const result = await removeDonatorBadge(username);
      alert(`✅ ${result.message}`);
      await loadDonators();
    } catch (error) {
      console.error('Failed to remove donator badge:', error);
      alert('❌ Failed to remove donator badge: ' + error.message);
    }
  };

  const handleBanUser = async (e) => {
    e.preventDefault();
    if (!banUsername.trim() || !banReason.trim()) {
      alert('Please enter both username and reason');
      return;
    }

    try {
      setBanLoading(true);
      const result = await banUser(banUsername.trim(), banReason.trim());

      alert(`✅ ${result.message}`);
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

    try {
      const result = await unbanUser(username);

      alert(`✅ ${result.message}`);
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

    try {
      setAddAdminLoading(true);
      const result = await addAdmin(addAdminUsername.trim());

      alert(`✅ ${result.message}`);
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

    try {
      const result = await removeAdmin(username);

      alert(`✅ ${result.message}`);
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
          <button
            onClick={() => setActiveTab('reported-issues')}
            className={`pb-3 px-4 font-medium border-b-2 transition-colors ${
              activeTab === 'reported-issues'
                ? 'border-orange-500 text-orange-600 dark:text-orange-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            🐛 Reported Issues ({reportedIssues.length})
          </button>
          <button
            onClick={() => setActiveTab('donators')}
            className={`pb-3 px-4 font-medium border-b-2 transition-colors ${
              activeTab === 'donators'
                ? 'border-cyan-500 text-cyan-600 dark:text-cyan-400'
                : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            💎 Donators ({donators.length})
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

      {/* Reported Issues Tab */}
      {activeTab === 'reported-issues' && (
        <div className="space-y-6">
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Reported Issues
              </h2>
              <button
                onClick={loadReportedIssues}
                disabled={issuesLoading}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium text-sm"
              >
                {issuesLoading ? 'Refreshing...' : 'Refresh'}
              </button>
            </div>

            {issuesLoading ? (
              <div className="text-center py-12">
                <LoadingSpinner />
                <p className="mt-4 text-gray-500 dark:text-gray-400">Loading reported issues...</p>
              </div>
            ) : reportedIssues.length === 0 ? (
              <div className="text-center py-12">
                <p className="text-gray-500 dark:text-gray-400 text-lg">
                  🎉 No open reported issues
                </p>
                <p className="text-gray-400 dark:text-gray-500 text-sm mt-2">
                  All user reports have been resolved or there are no reports yet.
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                {reportedIssues.map((issue) => {
                  // Extract category from labels
                  const categoryLabel = issue.labels?.find(label =>
                    ['bug-report', 'suggestion', 'content-issue', 'other'].includes(label.name)
                  );
                  const categoryColors = {
                    'bug-report': 'bg-red-100 dark:bg-red-900/30 text-red-800 dark:text-red-200',
                    'suggestion': 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200',
                    'content-issue': 'bg-orange-100 dark:bg-orange-900/30 text-orange-800 dark:text-orange-200',
                    'other': 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200'
                  };

                  // Extract reporter from title (format: [Issue Report] Username - Title)
                  const titleMatch = issue.title.match(/\[Issue Report\]\s*(.+?)\s*-\s*(.+)/);
                  const reporter = titleMatch ? titleMatch[1] : 'Unknown';
                  const issueTitle = titleMatch ? titleMatch[2] : issue.title;

                  return (
                    <div
                      key={issue.id}
                      className="p-4 bg-gray-50 dark:bg-gray-900/50 border border-gray-200 dark:border-gray-700 rounded-lg"
                    >
                      {/* Header: Category, Issue Number, Date */}
                      <div className="flex items-start justify-between mb-3">
                        <div className="flex items-center gap-2 flex-wrap">
                          {categoryLabel && (
                            <span className={`px-2 py-1 rounded text-xs font-medium ${categoryColors[categoryLabel.name]}`}>
                              {categoryLabel.name.split('-').map(w =>
                                w.charAt(0).toUpperCase() + w.slice(1)
                              ).join(' ')}
                            </span>
                          )}
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            #{issue.number}
                          </span>
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            {new Date(issue.created_at).toLocaleDateString()}
                          </span>
                        </div>
                      </div>

                      {/* Title */}
                      <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
                        {issueTitle}
                      </h3>

                      {/* Body Preview */}
                      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-3">
                        {issue.body ? issue.body.split('\n').slice(0, 3).join(' ') : 'No description provided.'}
                      </p>

                      {/* Reporter Info */}
                      <div className="flex items-center gap-2 mb-3">
                        <span className="text-xs text-gray-500 dark:text-gray-400">
                          Reported by:
                        </span>
                        <span className="text-xs font-medium text-gray-700 dark:text-gray-300">
                          {reporter}
                        </span>
                      </div>

                      {/* Labels */}
                      {issue.labels && issue.labels.length > 0 && (
                        <div className="flex items-center gap-2 mb-3 flex-wrap">
                          {issue.labels
                            .filter(label => label.name !== 'user-report') // Hide user-report label (redundant)
                            .map((label) => (
                              <span
                                key={label.id}
                                className="px-2 py-0.5 rounded-full text-xs"
                                style={{
                                  backgroundColor: `#${label.color}20`,
                                  color: `#${label.color}`,
                                  border: `1px solid #${label.color}40`
                                }}
                              >
                                {label.name}
                              </span>
                            ))}
                        </div>
                      )}

                      {/* View on GitHub Link */}
                      <a
                        href={issue.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex items-center gap-2 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        View on GitHub
                        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
                        </svg>
                      </a>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      )}

      {/* Donators Tab */}
      {activeTab === 'donators' && (
        <div className="space-y-6">
          {/* Info Box */}
          <div className="bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-lg p-4">
            <p className="text-sm text-cyan-900 dark:text-cyan-200">
              <strong>💎 Donator Badge:</strong> Manually assign donator badges to users who have supported the wiki.
              Badges are permanent and display alongside prestige badges on user profiles.
            </p>
          </div>

          {/* Assign Donator Badge Form */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Assign Donator Badge
            </h2>
            <form onSubmit={handleAssignDonatorBadge} className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  GitHub Username *
                </label>
                <input
                  type="text"
                  value={donatorUsername}
                  onChange={(e) => setDonatorUsername(e.target.value)}
                  placeholder="username"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  disabled={donatorLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Donation Amount (optional)
                </label>
                <input
                  type="number"
                  step="0.01"
                  min="0"
                  value={donatorAmount}
                  onChange={(e) => setDonatorAmount(e.target.value)}
                  placeholder="25.00"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500"
                  disabled={donatorLoading}
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Reason / Notes (optional)
                </label>
                <textarea
                  value={donatorReason}
                  onChange={(e) => setDonatorReason(e.target.value)}
                  placeholder="e.g., Ko-fi donation, PayPal donation, etc."
                  rows={3}
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-cyan-500 resize-none"
                  disabled={donatorLoading}
                />
              </div>
              <button
                type="submit"
                disabled={donatorLoading || !donatorUsername.trim()}
                className="px-4 py-2 bg-cyan-500 text-white rounded-lg hover:bg-cyan-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors font-medium"
              >
                {donatorLoading ? 'Assigning...' : 'Assign Badge'}
              </button>
            </form>
          </div>

          {/* Donators List */}
          <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
            <h2 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Donators List
            </h2>
            {donators.length === 0 ? (
              <p className="text-gray-500 dark:text-gray-400 text-center py-8">
                No donators yet
              </p>
            ) : (
              <div className="space-y-3">
                {donators.map((donator) => (
                  <div
                    key={donator.username}
                    className="flex items-start justify-between p-4 bg-cyan-50 dark:bg-cyan-900/20 border border-cyan-200 dark:border-cyan-800 rounded-lg"
                  >
                    <div className="flex-1">
                      <div className="flex items-center gap-2 mb-1">
                        <a
                          href={`https://github.com/${donator.username}`}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-gray-900 dark:text-white hover:underline"
                        >
                          @{donator.username}
                        </a>
                        <span className="text-xl animate-glow-pulse" title="Donator">
                          💎
                        </span>
                      </div>
                      {donator.amount && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          <strong>Amount:</strong> ${donator.amount.toFixed(2)}
                        </p>
                      )}
                      {donator.reason && (
                        <p className="text-sm text-gray-600 dark:text-gray-400 mb-1">
                          <strong>Notes:</strong> {donator.reason}
                        </p>
                      )}
                      <p className="text-xs text-gray-500 dark:text-gray-500">
                        Assigned by {donator.assignedBy} on{' '}
                        {new Date(donator.donatedAt).toLocaleDateString()}
                      </p>
                    </div>
                    <button
                      onClick={() => handleRemoveDonatorBadge(donator.username)}
                      className="ml-4 px-3 py-1 bg-red-500 text-white rounded hover:bg-red-600 transition-colors text-sm font-medium"
                    >
                      Remove
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default AdminPanel;
