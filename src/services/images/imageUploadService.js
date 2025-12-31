/**
 * Image Upload Service (Client-Side)
 *
 * Handles API communication for uploading images to the server
 */

import { createLogger } from '../../utils/logger.js';
const logger = createLogger('ImageUploadService');

/**
 * Upload processed images to server
 * @param {Object} params - Upload parameters
 * @param {Blob} params.originalBlob - Original image blob
 * @param {string} params.originalFilename - Original filename
 * @param {Blob} params.webpBlob - WebP image blob
 * @param {Object} params.dimensions - Image dimensions { width, height }
 * @param {string} params.name - Image name/title
 * @param {string} params.description - Image description
 * @param {string} params.category - Image category
 * @param {Array<string>} params.tags - Image tags
 * @param {string} [params.userEmail] - Email (for anonymous)
 * @param {string} [params.verificationToken] - Verification token (for anonymous)
 * @param {string} [params.userToken] - GitHub user token (for authenticated)
 * @param {boolean} [params.dryRun] - If true, skip CDN upload (for testing moderation)
 * @param {Function} [params.onProgress] - Progress callback (0-100)
 * @returns {Promise<Object>} Upload result
 */
export async function uploadImage(params) {
  const {
    originalBlob,
    originalFilename,
    webpBlob,
    dimensions,
    name,
    description,
    category,
    tags,
    userEmail,
    verificationToken,
    userToken,
    dryRun = false,
    onProgress
  } = params;

  try {
    logger.info('Starting image upload', {
      filename: originalFilename,
      originalSize: originalBlob.size,
      webpSize: webpBlob.size,
      category,
      authenticated: !!userToken,
      dryRun
    });

    // Create FormData
    const formData = new FormData();

    // Add image files
    formData.append('originalFile', originalBlob, originalFilename);
    formData.append('webpFile', webpBlob, `${getBasename(originalFilename)}.webp`);

    // Add metadata
    formData.append('name', name);
    formData.append('description', description || '');
    formData.append('category', category);
    formData.append('tags', JSON.stringify(tags || []));
    formData.append('dryRun', dryRun.toString());

    // Debug: Check if dimensions exists before appending
    logger.debug('Appending dimensions to FormData', {
      dimensions,
      hasDimensions: !!dimensions,
      json: JSON.stringify(dimensions)
    });

    if (dimensions) {
      formData.append('dimensions', JSON.stringify(dimensions));
    }

    // Debug: Log all FormData entries
    const formDataEntries = [];
    for (const [key, value] of formData.entries()) {
      formDataEntries.push({
        key,
        type: typeof value,
        isFile: value instanceof File || value instanceof Blob,
        value: value instanceof File || value instanceof Blob ? `[${value.constructor.name}]` : value
      });
    }
    logger.info('FormData entries before upload', { entries: formDataEntries });

    // Add authentication info
    if (userEmail && verificationToken) {
      formData.append('userEmail', userEmail);
      formData.append('verificationToken', verificationToken);
    }

    // Prepare headers
    const headers = {};
    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`;
    }

    // Track progress if callback provided
    if (onProgress) {
      onProgress(0);
    }

    // Make upload request
    const response = await fetch('/api/image-upload', {
      method: 'POST',
      headers,
      body: formData
    });

    if (onProgress) {
      onProgress(100);
    }

    if (!response.ok) {
      const error = await response.json().catch(() => ({ error: response.statusText }));
      throw new Error(error.error || `Upload failed with status ${response.status}`);
    }

    const result = await response.json();

    logger.info('Image upload successful - RAW RESPONSE', {
      imageId: result.imageId,
      originalUrl: result.originalUrl,
      webpUrl: result.webpUrl,
      fullResult: result
    });

    return result;

  } catch (error) {
    logger.error('Image upload failed', { error: error.message });
    throw error;
  }
}

/**
 * Get basename from filename (without extension)
 * @param {string} filename - Filename
 * @returns {string} Basename
 */
function getBasename(filename) {
  if (!filename) return 'image';
  const lastDot = filename.lastIndexOf('.');
  return lastDot > 0 ? filename.substring(0, lastDot) : filename;
}

/**
 * Estimate upload time based on file sizes and connection speed
 * @param {number} totalBytes - Total bytes to upload
 * @returns {number} Estimated time in milliseconds
 */
export function estimateUploadTime(totalBytes) {
  // Rough estimate based on average connection speed (5 Mbps = 625 KB/s)
  const bytesPerSecond = 625 * 1024;
  const seconds = totalBytes / bytesPerSecond;
  return Math.ceil(seconds * 1000);
}

/**
 * Check if user is authenticated
 * @returns {Promise<boolean>} True if authenticated
 */
export async function isAuthenticated() {
  try {
    // Check if auth store is available (dynamic import to avoid circular deps)
    const { useAuthStore } = await import('../../store/authStore.js');
    const { user, getToken } = useAuthStore.getState();
    return !!(user && getToken());
  } catch (error) {
    return false;
  }
}

/**
 * Get user token for authenticated uploads
 * @returns {Promise<string|null>} User token or null
 */
export async function getUserToken() {
  try {
    const { useAuthStore } = await import('../../store/authStore.js');
    const { getToken } = useAuthStore.getState();
    return getToken();
  } catch (error) {
    return null;
  }
}
