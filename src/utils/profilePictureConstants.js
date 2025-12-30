/**
 * Profile Picture Constants
 *
 * Constants for profile picture validation and error messages.
 */

export const PROFILE_PICTURE_MAX_SIZE_MB = 3;
export const PROFILE_PICTURE_MAX_SIZE_BYTES = PROFILE_PICTURE_MAX_SIZE_MB * 1024 * 1024;
export const PROFILE_PICTURE_ALLOWED_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
export const PROFILE_PICTURE_OUTPUT_DIMENSIONS = { width: 512, height: 512 };
export const PROFILE_PICTURE_OUTPUT_FORMAT = 'webp';
export const PROFILE_PICTURE_OUTPUT_QUALITY = 0.85; // 85%

export const PROFILE_PICTURE_ERROR_MESSAGES = {
  TOO_LARGE: `Image too large (max ${PROFILE_PICTURE_MAX_SIZE_MB}MB)`,
  INVALID_FORMAT: 'Invalid format. Must be WebP',
  UPLOAD_FAILED: 'Upload failed. Please try again',
  MODERATION_FAILED: 'Image rejected by moderation',
  UNAUTHORIZED: 'You must be logged in to upload a profile picture',
  INVALID_TOKEN: 'Invalid authentication token',
  PROCESSING_FAILED: 'Failed to process image. Please try again',
};
