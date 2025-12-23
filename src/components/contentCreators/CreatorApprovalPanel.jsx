import React, { useState, useEffect } from 'react';
import { RefreshCw, Check, Trash2, ExternalLink } from 'lucide-react';
import { getAllCreatorSubmissions, syncCreatorApprovals, approveCreator, deleteCreatorSubmission } from '../../services/contentCreators';
import { useAuthStore } from '../../store/authStore';
import { createLogger } from '../../utils/logger';

const logger = createLogger('CreatorApprovalPanel');

/**
 * CreatorApprovalPanel - Admin panel for approving/rejecting content creator submissions
 * Shows pending and approved creators with admin actions
 */
const CreatorApprovalPanel = ({ owner, repo, config }) => {
  const { user } = useAuthStore();
  const [submissions, setSubmissions] = useState([]);
  const [loading, setLoading] = useState(true);
  const [syncing, setSyncing] = useState(false);
  const [error, setError] = useState(null);
  const [actionInProgress, setActionInProgress] = useState(null);

  useEffect(() => {
    loadSubmissions();
  }, []);

  async function loadSubmissions() {
    setLoading(true);
    setError(null);

    try {
      logger.debug('Loading creator submissions');
      const data = await getAllCreatorSubmissions(owner, repo, config);
      setSubmissions(data);
      logger.debug('Submissions loaded', { count: data.length });
    } catch (err) {
      logger.error('Failed to load submissions', { error: err.message });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  async function handleSync() {
    setSyncing(true);
    setError(null);

    try {
      logger.info('Syncing checkbox approvals');
      await syncCreatorApprovals(owner, repo, config);
      await loadSubmissions();
      logger.info('Sync completed');
    } catch (err) {
      logger.error('Failed to sync approvals', { error: err.message });
      setError(err.message);
    } finally {
      setSyncing(false);
    }
  }

  async function handleApprove(creatorId) {
    setActionInProgress(creatorId);
    setError(null);

    try {
      logger.info('Approving creator', { creatorId });
      await approveCreator(owner, repo, config, creatorId, user.login);
      await loadSubmissions();
      logger.info('Creator approved', { creatorId });
    } catch (err) {
      logger.error('Failed to approve creator', { error: err.message, creatorId });
      setError(err.message);
    } finally {
      setActionInProgress(null);
    }
  }

  async function handleDelete(creatorId, channelName) {
    if (!confirm(`Delete submission for "${channelName}"?`)) {
      return;
    }

    setActionInProgress(creatorId);
    setError(null);

    try {
      logger.info('Deleting creator submission', { creatorId });
      await deleteCreatorSubmission(owner, repo, config, creatorId, user.login);
      await loadSubmissions();
      logger.info('Creator submission deleted', { creatorId });
    } catch (err) {
      logger.error('Failed to delete submission', { error: err.message, creatorId });
      setError(err.message);
    } finally {
      setActionInProgress(null);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading submissions...</span>
      </div>
    );
  }

  const pending = submissions.filter(s => !s.approved);
  const approved = submissions.filter(s => s.approved);

  return (
    <div className="creator-approval-panel space-y-6">
      {/* Header Actions */}
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
          Creator Approvals
        </h3>
        <button
          onClick={handleSync}
          disabled={syncing}
          className="flex items-center gap-2 px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 transition-colors"
        >
          <RefreshCw size={16} className={syncing ? 'animate-spin' : ''} />
          {syncing ? 'Syncing...' : 'Sync Checkbox Approvals'}
        </button>
      </div>

      {/* Error Message */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400 text-sm font-medium">
            {error}
          </p>
        </div>
      )}

      {/* Info Note */}
      <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
        <p className="text-blue-800 dark:text-blue-400 text-sm">
          <strong>Note:</strong> You can approve creators by either clicking the "Approve" button below,
          or by checking the checkbox in the GitHub Issue and clicking "Sync Checkbox Approvals".
        </p>
      </div>

      {/* Pending Approvals */}
      <div>
        <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">
          Pending Approvals ({pending.length})
        </h4>

        {pending.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No pending submissions
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                    Platform
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                    Channel
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                    Submitted By
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {pending.map(submission => (
                  <tr key={submission.creatorId}>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex px-2 py-1 text-xs font-medium bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200 rounded capitalize">
                        {submission.platform}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <a
                        href={submission.channelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {submission.channelName}
                        <ExternalLink size={12} />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      @{submission.submittedBy}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => handleApprove(submission.creatorId)}
                          disabled={actionInProgress === submission.creatorId}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-green-600 hover:bg-green-700 text-white rounded disabled:opacity-50 transition-colors"
                          title="Approve"
                        >
                          <Check size={14} />
                          Approve
                        </button>
                        <button
                          onClick={() => handleDelete(submission.creatorId, submission.channelName)}
                          disabled={actionInProgress === submission.creatorId}
                          className="flex items-center gap-1 px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50 transition-colors"
                          title="Delete"
                        >
                          <Trash2 size={14} />
                          Delete
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Approved Creators */}
      <div>
        <h4 className="text-md font-semibold text-gray-900 dark:text-white mb-3">
          Approved Creators ({approved.length})
        </h4>

        {approved.length === 0 ? (
          <p className="text-gray-500 dark:text-gray-400 text-sm">
            No approved creators yet
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
              <thead className="bg-gray-50 dark:bg-gray-800">
                <tr>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                    Platform
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                    Channel
                  </th>
                  <th className="px-4 py-2 text-left text-xs font-medium text-gray-700 dark:text-gray-300">
                    Approved By
                  </th>
                  <th className="px-4 py-2 text-right text-xs font-medium text-gray-700 dark:text-gray-300">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700">
                {approved.map(submission => (
                  <tr key={submission.creatorId}>
                    <td className="px-4 py-3 text-sm">
                      <span className="inline-flex px-2 py-1 text-xs font-medium bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200 rounded capitalize">
                        {submission.platform}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-sm">
                      <a
                        href={submission.channelUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex items-center gap-1 text-blue-600 dark:text-blue-400 hover:underline"
                      >
                        {submission.channelName}
                        <ExternalLink size={12} />
                      </a>
                    </td>
                    <td className="px-4 py-3 text-sm text-gray-700 dark:text-gray-300">
                      {submission.approvedBy ? `@${submission.approvedBy}` : 'N/A'}
                    </td>
                    <td className="px-4 py-3 text-sm text-right">
                      <button
                        onClick={() => handleDelete(submission.creatorId, submission.channelName)}
                        disabled={actionInProgress === submission.creatorId}
                        className="flex items-center gap-1 px-3 py-1 text-xs bg-red-600 hover:bg-red-700 text-white rounded disabled:opacity-50 transition-colors ml-auto"
                        title="Delete"
                      >
                        <Trash2 size={14} />
                        Delete
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
};

export default CreatorApprovalPanel;
