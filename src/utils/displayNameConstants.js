/**
 * Display Name Constants
 *
 * Constants for display name validation, cooldown, and error messages.
 */

export const DISPLAY_NAME_MAX_LENGTH = 30;
export const DISPLAY_NAME_MIN_LENGTH = 1;
export const DISPLAY_NAME_CHANGE_COOLDOWN_DAYS = 30;

// Alphanumeric, spaces, hyphens, underscores only
export const DISPLAY_NAME_PATTERN = /^[a-zA-Z0-9\s\-_]+$/;

export const DISPLAY_NAME_ERROR_MESSAGES = {
  TOO_SHORT: `Display name must be at least ${DISPLAY_NAME_MIN_LENGTH} character`,
  TOO_LONG: `Display name must be at most ${DISPLAY_NAME_MAX_LENGTH} characters`,
  INVALID_CHARS: 'Display name can only contain letters, numbers, spaces, hyphens, and underscores',
  NOT_UNIQUE: 'This display name is already taken',
  COOLDOWN: 'You can only change your display name once per month',
  MODERATION_FAILED: 'Display name contains inappropriate content',
  BANNED: 'You cannot reuse this display name (previously banned)',
  UNAUTHORIZED: 'You must be logged in to change your display name',
  INVALID_TOKEN: 'Invalid authentication token',
};
