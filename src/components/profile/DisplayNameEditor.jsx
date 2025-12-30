/**
 * Display Name Editor Component
 *
 * Inline editor for profile page that allows users to set/change
 * their display name with validation, cooldown enforcement, and feedback.
 */

import React, { useState, useEffect } from 'react';
import { useAuthStore } from '../../store/authStore';
import {
  setDisplayName,
  validateDisplayName,
  validateDisplayNameFormat,
  canChangeDisplayName,
  getDaysUntilNextChange,
  getDisplayNameData
} from '../../services/displayNames';
import {
  DISPLAY_NAME_MAX_LENGTH,
  DISPLAY_NAME_CHANGE_COOLDOWN_DAYS
} from '../../utils/displayNameConstants';
import { createLogger } from '../../utils/logger';

const logger = createLogger('DisplayNameEditor');

export function DisplayNameEditor({ currentDisplayName, onUpdate }) {
  const { user } = useAuthStore();
  const [isEditing, setIsEditing] = useState(false);
  const [inputValue, setInputValue] = useState(currentDisplayName || '');
  const [validationError, setValidationError] = useState(null);
  const [isValidating, setIsValidating] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isVerified, setIsVerified] = useState(false); // Track if name has been verified
  const [lastChangedInfo, setLastChangedInfo] = useState(null);
  const [canChange, setCanChange] = useState(true);

  useEffect(() => {
    // Load current display name data (uses cached service)
    const loadDisplayNameInfo = async () => {
      if (!user || !user.id) return;

      try {
        const displayNameData = await getDisplayNameData(user.id);
        if (displayNameData) {
          setLastChangedInfo(displayNameData);
          setCanChange(canChangeDisplayName(displayNameData.lastChanged));
        }
      } catch (error) {
        logger.error('Failed to load display name data', { error });
      }
    };

    loadDisplayNameInfo();
  }, [user]);

  const handleEditClick = () => {
    if (!canChange) {
      const daysRemaining = getDaysUntilNextChange(lastChangedInfo?.lastChanged);
      setValidationError(`You can change your display name again in ${daysRemaining} day(s)`);
      return;
    }
    setIsEditing(true);
    setInputValue(currentDisplayName || user.login);
    setValidationError(null);
    setIsVerified(false);
  };

  const handleCancel = () => {
    setIsEditing(false);
    setInputValue(currentDisplayName || '');
    setValidationError(null);
    setIsVerified(false);
  };

  const handleInputChange = (e) => {
    const value = e.target.value;
    setInputValue(value);

    // Clear validation error and verified state on input change
    setValidationError(null);
    setIsVerified(false);

    // Immediate format validation (no API call)
    const formatValidation = validateDisplayNameFormat(value);
    if (!formatValidation.valid) {
      setValidationError(formatValidation.error);
    }
  };

  const handleVerifyOrSave = async () => {
    if (!inputValue.trim()) {
      setValidationError('Display name cannot be empty');
      return;
    }

    // If not verified yet, validate first
    if (!isVerified) {
      setIsValidating(true);
      const validation = await validateDisplayName(inputValue, user.id);
      setIsValidating(false);

      if (!validation.valid) {
        setValidationError(validation.error);
        return;
      }

      // Validation successful - mark as verified
      setIsVerified(true);
      logger.debug('Display name verified successfully');
      return;
    }

    // Already verified - now save
    setIsSaving(true);
    const token = useAuthStore.getState().getToken();
    const result = await setDisplayName(user.id, user.login, inputValue, token);
    setIsSaving(false);

    if (result.success) {
      logger.info('Display name updated successfully');
      setIsEditing(false);
      setValidationError(null);
      setIsVerified(false);

      // Notify parent component
      if (onUpdate) {
        onUpdate(inputValue);
      }
    } else {
      setValidationError(result.error);
      setIsVerified(false); // Reset verification on save error
    }
  };

  const daysRemaining = lastChangedInfo ? getDaysUntilNextChange(lastChangedInfo.lastChanged) : 0;

  return (
    <div className="flex items-center space-x-2">
      {!isEditing ? (
        <>
          <span className="text-lg font-semibold text-gray-900 dark:text-white">
            {currentDisplayName || user.login}
          </span>

          {/* Edit button */}
          <button
            onClick={handleEditClick}
            disabled={!canChange}
            className={`p-1 rounded-lg transition-colors ${
              canChange
                ? 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-gray-700'
                : 'text-gray-400 dark:text-gray-600 cursor-not-allowed'
            }`}
            title={canChange ? 'Edit display name' : `Can change in ${daysRemaining} day(s)`}
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M15.232 5.232l3.536 3.536m-2.036-5.036a2.5 2.5 0 113.536 3.536L6.5 21.036H3v-3.572L16.732 3.732z" />
            </svg>
          </button>

          {/* Cooldown indicator */}
          {!canChange && daysRemaining > 0 && (
            <span className="text-xs text-gray-500 dark:text-gray-400">
              ({daysRemaining}d cooldown)
            </span>
          )}
        </>
      ) : (
        <div className="flex flex-col space-y-2 w-full max-w-md">
          {/* Input field */}
          <div className="flex items-center space-x-2">
            <div className="relative flex-1">
              <input
                type="text"
                value={inputValue}
                onChange={handleInputChange}
                maxLength={DISPLAY_NAME_MAX_LENGTH}
                className={`w-full px-3 py-1.5 text-sm border rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white ${
                  validationError
                    ? 'border-red-500 focus:ring-red-500'
                    : isVerified
                    ? 'border-green-500 focus:ring-green-500'
                    : 'border-gray-300 dark:border-gray-600 focus:ring-blue-500'
                } focus:outline-none focus:ring-2 ${isVerified ? 'pr-10' : ''}`}
                placeholder="Enter display name"
                autoFocus
              />
              {/* Checkmark indicator when verified */}
              {isVerified && (
                <div className="absolute right-3 top-1/2 -translate-y-1/2">
                  <svg className="w-5 h-5 text-green-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                </div>
              )}
            </div>

            {/* Verify/Save button */}
            <button
              onClick={handleVerifyOrSave}
              disabled={isSaving || isValidating || !!validationError}
              className={`px-3 py-1.5 text-sm font-medium text-white rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors ${
                isVerified
                  ? 'bg-green-500 hover:bg-green-600'
                  : 'bg-blue-500 hover:bg-blue-600'
              }`}
            >
              {isSaving ? 'Saving...' : isValidating ? 'Verifying...' : isVerified ? 'Save' : 'Verify'}
            </button>

            {/* Cancel button */}
            <button
              onClick={handleCancel}
              disabled={isSaving}
              className="px-3 py-1.5 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
          </div>

          {/* Character counter and status */}
          <div className="flex items-center justify-between text-xs text-gray-500 dark:text-gray-400">
            <span>
              {inputValue.length}/{DISPLAY_NAME_MAX_LENGTH} characters
            </span>
            {isValidating && (
              <span className="text-blue-500">Verifying...</span>
            )}
          </div>

          {/* Validation error */}
          {validationError && (
            <div className="text-sm text-red-600 dark:text-red-400">
              {validationError}
            </div>
          )}

          {/* Cooldown info */}
          {lastChangedInfo && (
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <p>Last changed: {new Date(lastChangedInfo.lastChanged).toLocaleDateString()}</p>
              <p>You can change your display name once every {DISPLAY_NAME_CHANGE_COOLDOWN_DAYS} days.</p>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
