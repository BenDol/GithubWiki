/**
 * Custom Avatar Service
 *
 * Manages user custom profile pictures with caching and API integration.
 * Mirrors displayNames.js structure.
 */

import { createLogger } from '../utils/logger';
import { getCacheValue, setCacheValue, clearCacheValue } from '../utils/timeCache';
import { cacheName } from '../utils/storageManager';
import { getProfilePictureEndpoint } from '../utils/apiEndpoints';
import { emitAvatarUpdated } from '../utils/avatarEvents';

const logger = createLogger('CustomAvatars');

// In-memory cache for custom avatars (client-side only, 24-hour TTL)
// Cache for 24 hours to reduce API calls, purged on upload
const CUSTOM_AVATAR_CACHE_TTL = 86400000; // 24 hours
const REGISTRY_CACHE_TTL = 60000; // 1 minute for full registry

/**
 * Get custom avatar data with metadata for a user
 * @param {number} userId - GitHub user ID
 * @returns {Promise<Object|null>} Avatar data object (customAvatarUrl, uploadDate, etc.) or null if not set
 */
export async function getCustomAvatarData(userId) {
  try {
    // Check cache first
    const cacheKey = cacheName('custom_avatar_data', userId);
    const cached = getCacheValue(cacheKey);
    if (cached !== null) {
      logger.info('✅ Avatar cache HIT - using cached data', { userId, ttl: '24 hours' });
      return cached;
    }

    // Cache miss - fetch from API
    logger.info('❌ Avatar cache MISS - fetching from API', { userId });
    const response = await fetch(`${getProfilePictureEndpoint()}?userId=${userId}`);
    if (!response.ok) {
      throw new Error(`Failed to fetch custom avatar data: ${response.status}`);
    }

    const data = await response.json();
    const avatarData = data.profilePicture || null;

    // Cache result (full data object) for 24 hours
    setCacheValue(cacheKey, avatarData, CUSTOM_AVATAR_CACHE_TTL);

    logger.info('✅ Avatar data cached', { userId, hasData: !!avatarData, ttl: '24 hours' });
    return avatarData;
  } catch (error) {
    logger.error('Failed to get custom avatar data', { userId, error });
    return null;
  }
}

/**
 * Get custom avatar URL for a user
 * @param {number} userId - GitHub user ID
 * @returns {Promise<string|null>} Custom avatar URL or null if not set
 */
export async function getCustomAvatar(userId) {
  try {
    // Use getCustomAvatarData and extract just the URL
    const avatarData = await getCustomAvatarData(userId);
    return avatarData?.customAvatarUrl || null;
  } catch (error) {
    logger.error('Failed to get custom avatar', { userId, error });
    return null;
  }
}

/**
 * Get custom avatar URL or fallback to GitHub avatar
 * @param {number} userId - GitHub user ID
 * @param {string} githubAvatarUrl - GitHub avatar URL as fallback
 * @returns {Promise<string>} Custom avatar URL or GitHub avatar URL
 */
export async function getCustomAvatarOrFallback(userId, githubAvatarUrl) {
  if (!userId) {
    return githubAvatarUrl || '';
  }

  const customAvatar = await getCustomAvatar(userId);
  return customAvatar || githubAvatarUrl;
}

/**
 * Load full custom avatar registry (for admin panel)
 * @returns {Promise<Object>} Registry object keyed by userId
 */
export async function loadCustomAvatarRegistry() {
  try {
    // Check cache first
    const cacheKey = cacheName('custom_avatar_registry', 'all');
    const cached = getCacheValue(cacheKey);
    if (cached !== null) {
      logger.debug('Custom avatar registry cache hit');
      return cached;
    }

    // Fetch from API
    const response = await fetch(`${getProfilePictureEndpoint()}?all=true`);
    if (!response.ok) {
      throw new Error(`Failed to fetch custom avatar registry: ${response.status}`);
    }

    const data = await response.json();
    const registry = data.profilePictures || {};

    // Cache result (shorter TTL for full registry)
    setCacheValue(cacheKey, registry, REGISTRY_CACHE_TTL);

    logger.debug('Fetched custom avatar registry', { count: Object.keys(registry).length });
    return registry;
  } catch (error) {
    logger.error('Failed to load custom avatar registry', { error });
    return {};
  }
}

/**
 * Upload custom profile picture for authenticated user
 * @param {number} userId - GitHub user ID
 * @param {string} username - GitHub username
 * @param {Blob} imageBlob - Processed image blob (512x512 WebP)
 * @param {string} token - User's OAuth token
 * @returns {Promise<Object>} Result object with success/error/avatarUrl
 */
export async function uploadCustomAvatar(userId, username, imageBlob, token) {
  try {
    logger.info('Uploading custom avatar', { userId, size: imageBlob.size });

    // Create FormData for multipart upload
    const formData = new FormData();
    formData.append('imageFile', imageBlob, 'avatar.webp');
    formData.append('userId', userId.toString());
    formData.append('username', username);
    formData.append('token', token);

    const response = await fetch(getProfilePictureEndpoint(), {
      method: 'POST',
      body: formData
    });

    const data = await response.json();

    if (!response.ok) {
      logger.warn('Failed to upload custom avatar', { userId, error: data.error });
      return { success: false, error: data.error };
    }

    // Clear caches to force re-fetch
    clearCacheValue(cacheName('custom_avatar_data', userId));
    clearCacheValue(cacheName('custom_avatar_registry', 'all'));

    // Pre-populate cache with new avatar data to avoid extra fetch
    const newAvatarData = {
      customAvatarUrl: data.avatarUrl,
      uploadDate: new Date().toISOString(),
      userId
    };
    setCacheValue(cacheName('custom_avatar_data', userId), newAvatarData, CUSTOM_AVATAR_CACHE_TTL);

    // Emit global event to refresh all avatar instances
    // Using GitHub raw URLs (not jsDelivr) so cache busting works quickly
    logger.debug('Scheduling avatar refresh events');
    setTimeout(() => {
      logger.debug('Emitting first avatar update event');
      emitAvatarUpdated(userId, data.avatarUrl);

      // Emit again after short delay to ensure all components update
      setTimeout(() => {
        logger.debug('Emitting second avatar update event');
        emitAvatarUpdated(userId, data.avatarUrl);
      }, 1500);
    }, 1500);

    logger.info('Custom avatar uploaded successfully', { userId, avatarUrl: data.avatarUrl });
    return { success: true, avatarUrl: data.avatarUrl, profilePicture: data.profilePicture };
  } catch (error) {
    logger.error('Failed to upload custom avatar', { userId, error });
    return { success: false, error: 'Failed to upload profile picture. Please try again.' };
  }
}

/**
 * Delete custom profile picture for authenticated user
 * @param {number} userId - GitHub user ID
 * @param {string} token - User's OAuth token
 * @returns {Promise<Object>} Result object with success/error
 */
export async function deleteCustomAvatar(userId, token) {
  try {
    logger.info('Deleting custom avatar', { userId });

    const response = await fetch(getProfilePictureEndpoint(), {
      method: 'DELETE',
      headers: {
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        userId,
        token
      })
    });

    const data = await response.json();

    if (!response.ok) {
      logger.warn('Failed to delete custom avatar', { userId, error: data.error });
      return { success: false, error: data.error };
    }

    // Clear caches
    clearCacheValue(cacheName('custom_avatar', userId));
    clearCacheValue(cacheName('custom_avatar_data', userId));
    clearCacheValue(cacheName('custom_avatar_registry', 'all'));

    logger.info('Custom avatar deleted successfully', { userId });
    return { success: true };
  } catch (error) {
    logger.error('Failed to delete custom avatar', { userId, error });
    return { success: false, error: 'Failed to delete profile picture. Please try again.' };
  }
}
