import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { X, Tv, ExternalLink, Loader } from 'lucide-react';
import { submitContentCreator, isValidChannelUrl, extractChannelName } from '../../services/contentCreators';
import { useAuthStore } from '../../store/authStore';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ContentCreatorSubmissionModal');

/**
 * ContentCreatorSubmissionModal - Submit a content creator for approval
 * Creates a comment in GitHub Issue and adds pending approval checkbox
 */
const ContentCreatorSubmissionModal = ({ isOpen, onClose, onSuccess }) => {
  const { user } = useAuthStore();
  const { config } = useWikiConfig();

  const [platform, setPlatform] = useState('twitch');
  const [channelUrl, setChannelUrl] = useState('');
  const [channelName, setChannelName] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // Validate channel URL
      if (!isValidChannelUrl(channelUrl, platform)) {
        throw new Error(`Invalid ${platform === 'twitch' ? 'Twitch' : 'YouTube'} channel URL`);
      }

      logger.info('Submitting content creator', { platform, channelUrl });

      // Submit creator
      const result = await submitContentCreator(
        config.wiki.repository.owner,
        config.wiki.repository.repo,
        config,
        {
          platform,
          channelUrl,
          channelName: channelName || extractChannelName(channelUrl),
          submittedBy: user.login
        }
      );

      logger.info('Content creator submitted successfully', { creatorId: result.creatorId });

      setSuccess({
        message: 'Content creator submitted successfully!',
        issueUrl: result.issueUrl
      });

      // Call onSuccess callback
      if (onSuccess) {
        onSuccess(result);
      }

      // Clear form and close after 2 seconds
      setTimeout(() => {
        resetForm();
        onClose();
      }, 2000);
    } catch (err) {
      logger.error('Failed to submit content creator', { error: err.message, platform });
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const resetForm = () => {
    setPlatform('twitch');
    setChannelUrl('');
    setChannelName('');
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    if (!submitting) {
      resetForm();
      onClose();
    }
  };

  const placeholderUrl = platform === 'twitch'
    ? 'https://twitch.tv/username'
    : 'https://youtube.com/@channelname';

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Tv className="text-purple-500" size={24} />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Submit Content Creator
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={submitting}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            title="Close"
          >
            <X size={24} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Platform Selection */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Platform <span className="text-red-500">*</span>
            </label>
            <div className="grid grid-cols-2 gap-3">
              <button
                type="button"
                onClick={() => setPlatform('twitch')}
                disabled={submitting}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  platform === 'twitch'
                    ? 'border-purple-500 bg-purple-50 dark:bg-purple-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-purple-300 dark:hover:border-purple-700'
                } disabled:opacity-50`}
              >
                <div className="text-center">
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    Twitch
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Live streaming
                  </div>
                </div>
              </button>

              <button
                type="button"
                onClick={() => setPlatform('youtube')}
                disabled={submitting}
                className={`px-4 py-3 rounded-lg border-2 transition-all ${
                  platform === 'youtube'
                    ? 'border-red-500 bg-red-50 dark:bg-red-900/20'
                    : 'border-gray-300 dark:border-gray-600 hover:border-red-300 dark:hover:border-red-700'
                } disabled:opacity-50`}
              >
                <div className="text-center">
                  <div className="text-lg font-semibold text-gray-900 dark:text-white">
                    YouTube
                  </div>
                  <div className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Video platform
                  </div>
                </div>
              </button>
            </div>
          </div>

          {/* Channel URL */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Channel URL <span className="text-red-500">*</span>
            </label>
            <input
              type="url"
              value={channelUrl}
              onChange={(e) => setChannelUrl(e.target.value)}
              placeholder={placeholderUrl}
              required
              disabled={submitting}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              {platform === 'twitch'
                ? 'Example: https://twitch.tv/username'
                : 'Example: https://youtube.com/@channelname'}
            </p>
          </div>

          {/* Channel Name (Optional) */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Channel Name (optional)
            </label>
            <input
              type="text"
              value={channelName}
              onChange={(e) => setChannelName(e.target.value)}
              placeholder="Auto-detected if left blank"
              disabled={submitting}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Display name for the channel (extracted from URL if not provided)
            </p>
          </div>

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400 text-sm font-medium">
                {error}
              </p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-green-600 dark:text-green-400 text-sm font-medium mb-2">
                {success.message}
              </p>
              {success.issueUrl && (
                <a
                  href={success.issueUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View submission
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          )}

          {/* Info Note */}
          {!success && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-blue-800 dark:text-blue-400 text-sm">
                <strong>Note:</strong> Your submission will be reviewed by admins before appearing on the Content Creators page.
              </p>
            </div>
          )}
        </form>

        {/* Footer */}
        {!success && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default ContentCreatorSubmissionModal;
