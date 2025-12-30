/**
 * Display Name Admin Controls Component
 *
 * Admin-only controls for managing user display names:
 * - Reset display name to GitHub username
 * - Ban specific display names for a user
 */

import React, { useState } from 'react';
import { resetDisplayName, banDisplayName } from '../../services/displayNames';
import { useAuthStore } from '../../store/authStore';
import { createLogger } from '../../utils/logger';

const logger = createLogger('DisplayNameAdminControls');

export function DisplayNameAdminControls({ targetUserId, currentDisplayName, onUpdate }) {
  const [isResetting, setIsResetting] = useState(false);
  const [isBanning, setIsBanning] = useState(false);
  const [showBanModal, setShowBanModal] = useState(false);
  const [banDisplayNameInput, setBanDisplayNameInput] = useState('');
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  const handleResetDisplayName = async () => {
    if (!window.confirm('Reset this user\'s display name to their GitHub username?')) {
      return;
    }

    setIsResetting(true);
    setError(null);
    setSuccess(null);

    const token = useAuthStore.getState().getToken();
    const result = await resetDisplayName(targetUserId, token);

    setIsResetting(false);

    if (result.success) {
      setSuccess('Display name reset successfully');
      logger.info('Display name reset by admin', { targetUserId });

      // Notify parent component
      if (onUpdate) {
        onUpdate(null);
      }
    } else {
      setError(result.error);
    }
  };

  const handleBanDisplayName = async () => {
    if (!banDisplayNameInput.trim()) {
      setError('Display name cannot be empty');
      return;
    }

    setIsBanning(true);
    setError(null);
    setSuccess(null);

    const token = useAuthStore.getState().getToken();
    const result = await banDisplayName(targetUserId, banDisplayNameInput, token);

    setIsBanning(false);

    if (result.success) {
      setSuccess(`Display name "${banDisplayNameInput}" banned successfully`);
      logger.info('Display name banned by admin', { targetUserId, displayName: banDisplayNameInput });

      // Close modal
      setShowBanModal(false);
      setBanDisplayNameInput('');

      // Notify parent component
      if (onUpdate) {
        onUpdate(null);
      }
    } else {
      setError(result.error);
    }
  };

  return (
    <div className="mt-4 p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
      <h4 className="text-sm font-semibold text-yellow-900 dark:text-yellow-200 mb-3">
        Admin Controls - Display Name
      </h4>

      {/* Success message */}
      {success && (
        <div className="mb-3 p-2 bg-green-100 dark:bg-green-900/30 border border-green-300 dark:border-green-700 rounded text-sm text-green-800 dark:text-green-200">
          {success}
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="mb-3 p-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-sm text-red-800 dark:text-red-200">
          {error}
        </div>
      )}

      <div className="flex flex-col space-y-2">
        {/* Current display name */}
        {currentDisplayName && (
          <div className="text-sm text-gray-700 dark:text-gray-300">
            Current display name: <strong>{currentDisplayName}</strong>
          </div>
        )}

        {/* Reset button */}
        <button
          onClick={handleResetDisplayName}
          disabled={isResetting || !currentDisplayName}
          className="px-3 py-1.5 text-sm font-medium text-white bg-orange-500 rounded-lg hover:bg-orange-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
        >
          {isResetting ? 'Resetting...' : 'Reset Display Name'}
        </button>

        {/* Ban button */}
        <button
          onClick={() => setShowBanModal(true)}
          className="px-3 py-1.5 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 transition-colors"
        >
          Ban Display Name
        </button>
      </div>

      {/* Ban Modal */}
      {showBanModal && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-[100]">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full mx-4 p-6">
            <h3 className="text-xl font-bold text-gray-900 dark:text-white mb-4">
              Ban Display Name
            </h3>

            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Enter the display name to ban for this user. The user will not be able to reuse this name in the future.
            </p>

            <input
              type="text"
              value={banDisplayNameInput}
              onChange={(e) => setBanDisplayNameInput(e.target.value)}
              placeholder="Enter display name to ban"
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white mb-4 focus:outline-none focus:ring-2 focus:ring-red-500"
            />

            {error && (
              <div className="mb-4 p-2 bg-red-100 dark:bg-red-900/30 border border-red-300 dark:border-red-700 rounded text-sm text-red-800 dark:text-red-200">
                {error}
              </div>
            )}

            <div className="flex justify-end space-x-2">
              <button
                onClick={() => {
                  setShowBanModal(false);
                  setBanDisplayNameInput('');
                  setError(null);
                }}
                disabled={isBanning}
                className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={handleBanDisplayName}
                disabled={isBanning || !banDisplayNameInput.trim()}
                className="px-4 py-2 text-sm font-medium text-white bg-red-500 rounded-lg hover:bg-red-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isBanning ? 'Banning...' : 'Ban Display Name'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
