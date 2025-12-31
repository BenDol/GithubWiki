/**
 * Profile Picture Editor Component
 *
 * Clickable avatar with hover effect that allows users to upload/change
 * their profile picture with client-side cropping and processing.
 */

import React, { useState } from 'react';
import { useAuthStore } from '../../store/authStore';
import PrestigeAvatar from '../common/PrestigeAvatar';
import { ProfilePictureUpload } from './ProfilePictureUpload';
import { uploadCustomAvatar } from '../../services/customAvatars';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ProfilePictureEditor');

export function ProfilePictureEditor({ user, stats, onSuccess }) {
  const { getToken } = useAuthStore();
  const [showModal, setShowModal] = useState(false);
  const [isHovered, setIsHovered] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [uploadError, setUploadError] = useState(null);
  const [uploadSuccess, setUploadSuccess] = useState(false);
  const [avatarRefreshTrigger, setAvatarRefreshTrigger] = useState(Date.now());
  const [dryRun, setDryRun] = useState(false);

  const handleClick = () => {
    logger.debug('Profile picture editor clicked');
    setShowModal(true);
    setUploadError(null);
    setUploadSuccess(false);
  };

  const handleCloseModal = () => {
    if (uploading) return; // Prevent closing while uploading
    setShowModal(false);
    setUploadError(null);
    setUploadSuccess(false);
    setDryRun(false);
  };

  const handleImageProcessed = async (imageBlob) => {
    try {
      setUploading(true);
      setUploadError(null);

      logger.info('Uploading profile picture', { size: imageBlob.size, dryRun });

      const token = getToken();
      const result = await uploadCustomAvatar(user.id, user.login, imageBlob, token, dryRun);

      if (result.success) {
        logger.info('Profile picture uploaded successfully', { avatarUrl: result.avatarUrl });
        setUploadSuccess(true);

        // Wait for GitHub to propagate the file change
        // Using GitHub raw URLs (not jsDelivr) so cache busting works immediately
        logger.debug('Waiting for GitHub file propagation...');

        setTimeout(() => {
          logger.debug('Triggering avatar refresh');
          setAvatarRefreshTrigger(Date.now());

          // Second refresh to ensure complete update
          setTimeout(() => {
            logger.debug('Secondary avatar refresh');
            setAvatarRefreshTrigger(Date.now());
          }, 1500);
        }, 1500);

        // Close modal after short delay
        setTimeout(() => {
          setShowModal(false);
          setUploadSuccess(false);
          if (onSuccess) {
            onSuccess(result.avatarUrl);
          }
        }, 1500);
      } else {
        setUploadError(result.error || 'Upload failed. Please try again.');
        setUploading(false);
      }
    } catch (error) {
      logger.error('Failed to upload profile picture', { error });
      setUploadError('An unexpected error occurred. Please try again.');
      setUploading(false);
    }
  };

  const handleCancelUpload = () => {
    if (!uploading) {
      handleCloseModal();
    }
  };

  if (!user) return null;

  return (
    <>
      {/* Clickable Avatar with Hover Effect */}
      <div
        className="relative cursor-pointer group"
        onClick={handleClick}
        onMouseEnter={() => setIsHovered(true)}
        onMouseLeave={() => setIsHovered(false)}
      >
        <PrestigeAvatar
          src={user.avatar_url}
          alt={user.name || user.login}
          username={user.login}
          userId={user.id}
          stats={stats}
          size="2xl"
          showBadge={true}
          avatarRefreshTrigger={avatarRefreshTrigger}
        />

        {/* Hover Overlay with Pencil Icon */}
        <div className={`
          absolute inset-0 rounded-full bg-black/50 flex items-center justify-center
          transition-opacity duration-200
          ${isHovered ? 'opacity-100' : 'opacity-0'}
        `}>
          <div className="text-white flex flex-col items-center">
            <svg className="w-8 h-8 mb-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
            <span className="text-xs font-medium">Edit</span>
          </div>
        </div>
      </div>

      {/* Upload Modal */}
      {showModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-2xl w-full p-6">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-xl font-bold text-gray-900 dark:text-white">
                Change Profile Picture
              </h2>
              <button
                onClick={handleCloseModal}
                disabled={uploading}
                className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>

            {/* Upload component */}
            <ProfilePictureUpload
              onImageProcessed={handleImageProcessed}
              onCancel={handleCancelUpload}
            />

            {/* Dry Run Mode (for testing moderation) - DEV ONLY */}
            {import.meta.env.DEV && (
              <div className="border-t pt-4 mt-4">
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={dryRun}
                    onChange={(e) => setDryRun(e.target.checked)}
                    disabled={uploading}
                    className="w-4 h-4 text-blue-600 rounded focus:ring-2 focus:ring-blue-500 disabled:opacity-50 disabled:cursor-not-allowed"
                  />
                  <span className="text-sm font-medium text-gray-900 dark:text-white">
                    Dry Run Mode (Testing)
                  </span>
                </label>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1 ml-6">
                  Test validation and moderation without uploading to CDN. Useful for testing the content moderation system.
                </p>
              </div>
            )}

            {/* Upload error */}
            {uploadError && (
              <div className="mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                <p className="text-sm text-red-600 dark:text-red-400">{uploadError}</p>
              </div>
            )}

            {/* Upload success */}
            {uploadSuccess && (
              <div className="mt-4 p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
                <p className="text-sm text-green-600 dark:text-green-400 flex items-center gap-2">
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                  Profile picture updated successfully!
                </p>
              </div>
            )}

            {/* Upload progress indicator */}
            {uploading && (
              <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
                <div className="flex items-center gap-3">
                  <svg className="animate-spin h-5 w-5 text-blue-600 dark:text-blue-400" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  <span className="text-sm text-blue-600 dark:text-blue-400 font-medium">
                    Uploading profile picture...
                  </span>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </>
  );
}
