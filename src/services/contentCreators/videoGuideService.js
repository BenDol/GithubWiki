/**
 * Video Guide Service
 * Handles loading, filtering, and submission of video guides
 */

import { createLogger } from '../../utils/logger';
import { getOctokit, getAuthenticatedUser, createBranch } from '../github/api';
import { updateFileContent } from '../github/content';
import { createPullRequest } from '../github/pullRequests';

const logger = createLogger('VideoGuideService');

// Cache for video guides (5-minute TTL)
let videoGuidesCache = null;
let cacheTimestamp = null;
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Check if video guides feature is enabled
 * @param {Object} config - Wiki config
 * @returns {boolean} True if enabled
 */
export function areVideoGuidesEnabled(config) {
  return (
    config?.features?.contentCreators?.enabled === true &&
    config?.features?.contentCreators?.videoGuides?.enabled === true
  );
}

/**
 * Check if video guide submissions are allowed
 * @param {Object} config - Wiki config
 * @returns {boolean} True if submissions are allowed
 */
export function areVideoGuideSubmissionsAllowed(config) {
  return (
    areVideoGuidesEnabled(config) &&
    config?.features?.contentCreators?.videoGuides?.allowSubmissions === true
  );
}

/**
 * Check if authentication is required for submissions
 * @param {Object} config - Wiki config
 * @returns {boolean} True if authentication is required
 */
export function isAuthenticationRequired(config) {
  return config?.features?.contentCreators?.videoGuides?.requireAuthentication !== false;
}

/**
 * Get video guide data file path from config
 * @param {Object} config - Wiki config
 * @returns {string} Data file path
 */
export function getVideoGuideDataFile(config) {
  return config?.features?.contentCreators?.videoGuides?.dataFile || 'public/data/video-guides.json';
}

/**
 * Get allowed categories from config
 * @param {Object} config - Wiki config
 * @returns {Array<string>} Allowed categories
 */
export function getAllowedCategories(config) {
  return config?.features?.contentCreators?.videoGuides?.categories || [];
}

/**
 * Get allowed difficulties from config
 * @param {Object} config - Wiki config
 * @returns {Array<string>} Allowed difficulties
 */
export function getAllowedDifficulties(config) {
  return config?.features?.contentCreators?.videoGuides?.difficulties || [];
}

/**
 * Get allowed tags from config
 * @param {Object} config - Wiki config
 * @returns {Array<string>} Allowed tags
 */
export function getAllowedTags(config) {
  return config?.features?.contentCreators?.videoGuides?.tags || [];
}

/**
 * Generate a URL-safe ID from title
 * Example: "Ultimate Beginner's Guide" → "ultimate-beginners-guide"
 * @param {string} title - Video guide title
 * @param {Array} existingGuides - Existing guides to check for duplicates
 * @returns {string} Unique slug ID
 */
export function generateGuideId(title, existingGuides = []) {
  // Convert to lowercase and replace spaces with dashes
  let slug = title
    .toLowerCase()
    .trim()
    .replace(/[^\w\s-]/g, '') // Remove special characters
    .replace(/[\s_]+/g, '-') // Replace spaces and underscores with dashes
    .replace(/^-+|-+$/g, ''); // Remove leading/trailing dashes

  // Check for duplicates and append number if needed
  let finalSlug = slug;
  let counter = 1;
  while (existingGuides.some(g => g.id === finalSlug)) {
    finalSlug = `${slug}-${counter}`;
    counter++;
  }

  return finalSlug;
}

/**
 * Extract YouTube video ID from various URL formats
 * Supports: youtube.com/watch?v=ID, youtu.be/ID, youtube.com/embed/ID
 * @param {string} url - YouTube video URL
 * @returns {string|null} Video ID or null if invalid
 */
export function extractYouTubeVideoId(url) {
  if (!url) return null;

  // Match various YouTube URL patterns
  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  logger.warn('Failed to extract YouTube video ID', { url });
  return null;
}

/**
 * Generate YouTube thumbnail URL
 * @param {string} videoUrl - YouTube video URL or ID
 * @param {string} quality - Thumbnail quality (default, mqdefault, hqdefault, sddefault, maxresdefault)
 * @returns {string} Thumbnail URL
 */
export function getYouTubeThumbnail(videoUrl, quality = 'maxresdefault') {
  const videoId = extractYouTubeVideoId(videoUrl);
  if (!videoId) {
    logger.error('Cannot generate thumbnail for invalid video URL', { videoUrl });
    return '';
  }

  return `https://i.ytimg.com/vi/${videoId}/${quality}.jpg`;
}

/**
 * Validate YouTube URL
 * @param {string} url - URL to validate
 * @returns {boolean} True if valid YouTube URL
 */
export function isValidYouTubeUrl(url) {
  return extractYouTubeVideoId(url) !== null;
}

/**
 * Load video guides from JSON file (with caching)
 * @returns {Promise<Array>} Array of video guide objects
 */
export async function loadVideoGuides() {
  // Check cache first
  if (videoGuidesCache && cacheTimestamp && Date.now() - cacheTimestamp < CACHE_TTL) {
    logger.debug('Returning cached video guides', { count: videoGuidesCache.length });
    return videoGuidesCache;
  }

  try {
    logger.debug('Loading video guides from file');
    const response = await fetch('/data/video-guides.json');

    if (!response.ok) {
      throw new Error(`Failed to load video guides: ${response.status} ${response.statusText}`);
    }

    const data = await response.json();
    const guides = data.videoGuides || [];

    // Update cache
    videoGuidesCache = guides;
    cacheTimestamp = Date.now();

    logger.info('Video guides loaded', { count: guides.length });
    return guides;
  } catch (error) {
    logger.error('Failed to load video guides', { error: error.message });
    throw error;
  }
}

/**
 * Bust the video guides cache
 */
export function bustVideoGuidesCache() {
  videoGuidesCache = null;
  cacheTimestamp = null;
  logger.debug('Video guides cache busted');
}

/**
 * Get video guide by ID
 * @param {string} id - Guide ID
 * @returns {Promise<Object|null>} Video guide or null if not found
 */
export async function getVideoGuideById(id) {
  const guides = await loadVideoGuides();
  const guide = guides.find(g => g.id === id);

  if (guide) {
    logger.debug('Found video guide by ID', { id, title: guide.title });
  } else {
    logger.warn('Video guide not found by ID', { id });
  }

  return guide || null;
}

/**
 * Get video guide by title (case-insensitive)
 * @param {string} title - Guide title
 * @returns {Promise<Object|null>} Video guide or null if not found
 */
export async function getVideoGuideByTitle(title) {
  const guides = await loadVideoGuides();
  const normalizedTitle = title.toLowerCase().trim();
  const guide = guides.find(g => g.title.toLowerCase().trim() === normalizedTitle);

  if (guide) {
    logger.debug('Found video guide by title', { title, id: guide.id });
  } else {
    logger.warn('Video guide not found by title', { title });
  }

  return guide || null;
}

/**
 * Search and filter video guides
 * @param {Object} filters - Filter options
 * @param {string} filters.searchQuery - Search in title/description
 * @param {string} filters.category - Filter by category
 * @param {Array<string>} filters.tags - Filter by tags (any match)
 * @param {string} filters.difficulty - Filter by difficulty
 * @param {string} filters.creator - Filter by creator name
 * @returns {Promise<Array>} Filtered video guides
 */
export async function searchVideoGuides(filters = {}) {
  const guides = await loadVideoGuides();
  let results = [...guides];

  // Search query (title or description)
  if (filters.searchQuery) {
    const query = filters.searchQuery.toLowerCase().trim();
    results = results.filter(g =>
      g.title.toLowerCase().includes(query) ||
      g.description.toLowerCase().includes(query)
    );
  }

  // Category filter
  if (filters.category) {
    results = results.filter(g => g.category === filters.category);
  }

  // Tags filter (any match)
  if (filters.tags && filters.tags.length > 0) {
    results = results.filter(g =>
      g.tags && g.tags.some(tag => filters.tags.includes(tag))
    );
  }

  // Difficulty filter
  if (filters.difficulty) {
    results = results.filter(g => g.difficulty === filters.difficulty);
  }

  // Creator filter
  if (filters.creator) {
    const creator = filters.creator.toLowerCase().trim();
    results = results.filter(g =>
      g.creator && g.creator.toLowerCase().includes(creator)
    );
  }

  logger.debug('Video guide search completed', {
    filters,
    totalGuides: guides.length,
    resultsCount: results.length
  });

  return results;
}

/**
 * Submit a video guide (creates PR with updated video-guides.json)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config
 * @param {Object} guideData - Video guide data
 * @param {string} guideData.videoUrl - YouTube video URL (required)
 * @param {string} guideData.title - Guide title (required)
 * @param {string} guideData.description - Guide description (required)
 * @param {string} guideData.creator - Creator name (optional)
 * @param {string} guideData.category - Category (optional)
 * @param {Array<string>} guideData.tags - Tags (optional)
 * @param {string} guideData.difficulty - Difficulty level (optional)
 * @param {string} [userEmail] - Email for anonymous submissions
 * @param {string} [verificationToken] - Verification token for anonymous submissions
 * @returns {Promise<Object>} PR details { prNumber, prUrl }
 */
export async function submitVideoGuide(owner, repo, config, guideData, userEmail, verificationToken) {
  try {
    logger.info('Submitting video guide', { title: guideData.title, authenticated: !!userEmail ? false : true });

    // Validate required fields
    if (!guideData.videoUrl || !guideData.title || !guideData.description) {
      throw new Error('Missing required fields: videoUrl, title, and description are required');
    }

    // Validate YouTube URL
    if (!isValidYouTubeUrl(guideData.videoUrl)) {
      throw new Error('Invalid YouTube URL');
    }

    // Get github-bot endpoint
    const { getGithubBotEndpoint } = await import('../../utils/apiEndpoints');
    const endpoint = getGithubBotEndpoint();

    // Get user token for authenticated submissions
    const { useAuthStore } = await import('../../store/authStore');
    const userToken = useAuthStore.getState().getToken();

    // Prepare request body
    const requestBody = {
      action: 'submit-video-guide',
      owner,
      repo,
      guideData,
    };

    // Add authentication info
    if (userToken) {
      requestBody.userToken = userToken;
    } else if (userEmail && verificationToken) {
      requestBody.userEmail = userEmail;
      requestBody.verificationToken = verificationToken;
    }

    // Submit via server-side endpoint
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(requestBody),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.error || 'Failed to submit video guide');
    }

    const result = await response.json();

    logger.info('Video guide PR created successfully', {
      prNumber: result.prNumber,
      prUrl: result.prUrl,
      guideId: result.guideId
    });

    return {
      prNumber: result.prNumber,
      prUrl: result.prUrl,
      guideId: result.guideId
    };
  } catch (error) {
    logger.error('Failed to submit video guide', {
      error: error.message,
      title: guideData?.title
    });
    throw error;
  }
}

/**
 * Submit an uploaded video guide
 * Uploads video file to CDN and creates PRs for approval
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config
 * @param {File} videoFile - Video file to upload
 * @param {File} [thumbnailFile] - Optional thumbnail file
 * @param {Object} metadata - Video metadata
 * @param {string} metadata.title - Video title
 * @param {string} metadata.description - Video description
 * @param {string} [metadata.creator] - Creator name
 * @param {string} [metadata.category] - Category
 * @param {Array<string>} [metadata.tags] - Tags array
 * @param {string} [metadata.difficulty] - Difficulty level
 * @param {string} [userEmail] - Email for anonymous uploads
 * @param {string} [verificationToken] - Verification token for anonymous uploads
 * @returns {Promise<Object>} Upload result with videoId and PR info
 */
export async function submitUploadedVideoGuide(owner, repo, config, videoFile, thumbnailFile, metadata, userEmail, verificationToken) {
  try {
    logger.info('Submitting uploaded video guide', {
      title: metadata.title,
      videoSize: videoFile.size,
      hasThumbnail: !!thumbnailFile,
    });

    // Validate required fields
    if (!videoFile || !metadata.title || !metadata.description) {
      throw new Error('Missing required fields: videoFile, title, description');
    }

    // Get video upload endpoint
    const { getVideoUploadEndpoint } = await import('../../utils/apiEndpoints');
    const endpoint = getVideoUploadEndpoint();

    // Create FormData
    const formData = new FormData();
    formData.append('videoFile', videoFile);
    if (thumbnailFile) {
      formData.append('thumbnailFile', thumbnailFile);
    }
    formData.append('title', metadata.title);
    formData.append('description', metadata.description);

    // Add optional fields
    if (metadata.creator) formData.append('creator', metadata.creator);
    if (metadata.category) formData.append('category', metadata.category);
    if (metadata.tags && metadata.tags.length > 0) {
      formData.append('tags', metadata.tags.join(','));
    }
    if (metadata.difficulty) formData.append('difficulty', metadata.difficulty);

    // Add email verification fields for anonymous uploads
    if (userEmail) formData.append('userEmail', userEmail);
    if (verificationToken) formData.append('verificationToken', verificationToken);

    // Get user token for authentication (if logged in)
    const { useAuthStore } = await import('../../store/authStore');
    const userToken = useAuthStore.getState().getToken();

    logger.debug('Uploading video to API', {
      endpoint,
      authenticated: !!userToken,
    });

    // Upload video with user's token if authenticated
    const headers = {};
    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`;
    }

    const response = await fetch(endpoint, {
      method: 'POST',
      headers,
      body: formData,
      // Note: Don't set Content-Type header - browser will set it with boundary
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Upload failed: ${response.status}`);
    }

    const result = await response.json();

    logger.info('Video upload successful', {
      videoId: result.videoId,
      cdnPR: result.cdnPR.number,
      contentPR: result.contentPR.number,
    });

    return result;
  } catch (error) {
    // Detect Netlify CLI body size limitation
    if (error.message && error.message.includes('Failed to fetch')) {
      const isLocalDev = typeof window !== 'undefined' &&
        (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1');

      if (isLocalDev) {
        throw new Error(
          'Upload failed. This may be due to Netlify CLI file size limitations in local development. ' +
          'Videos larger than 6MB cannot be tested locally. Please test in production or use a smaller test file.'
        );
      }
    }

    logger.error('Failed to upload video guide', {
      error: error.message,
      title: metadata.title,
    });
    throw error;
  }
}

/**
 * Convert File to base64 string
 * @private
 */
async function fileToBase64(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const base64 = reader.result.split(',')[1]; // Remove data:image/...;base64, prefix
      resolve(base64);
    };
    reader.onerror = reject;
    reader.readAsDataURL(file);
  });
}

/**
 * Delete a video guide (admin only)
 * Creates a PR to remove the guide from video-guides.json via bot handler
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config
 * @param {string} guideId - Guide ID to delete
 * @param {string} adminUsername - Admin username
 * @param {string} userToken - User authentication token
 * @returns {Promise<Object>} PR details { prNumber, prUrl }
 */
export async function deleteVideoGuide(owner, repo, config, guideId, adminUsername, userToken) {
  try {
    logger.info('Deleting video guide', { guideId, adminUsername });

    // Validate required fields
    if (!guideId || !adminUsername || !userToken) {
      throw new Error('Missing required fields: guideId, adminUsername, userToken');
    }

    const { getGithubBotEndpoint } = await import('../../utils/apiEndpoints');
    const endpoint = getGithubBotEndpoint();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        action: 'delete-video-guide',
        owner,
        repo,
        guideId,
        adminUsername,
        userToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Deletion failed: ${response.status}`);
    }

    const result = await response.json();

    logger.info('Video guide deletion PR created', {
      prNumber: result.prNumber,
      prUrl: result.prUrl,
      guideId
    });

    return result;
  } catch (error) {
    logger.error('Failed to delete video guide', {
      error: error.message,
      guideId
    });
    throw error;
  }
}

/**
 * Get pending video guide deletion PRs (admin only)
 * Fetches open PRs with 'delete-video-guide' label
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config
 * @param {string} userToken - User authentication token
 * @returns {Promise<Array>} Array of pending deletion PRs with guide IDs
 */
export async function getPendingVideoGuideDeletions(owner, repo, config, userToken) {
  try {
    logger.debug('Fetching pending video guide deletion PRs');

    // Validate required fields
    if (!userToken) {
      throw new Error('Missing required field: userToken');
    }

    const { getGithubBotEndpoint } = await import('../../utils/apiEndpoints');
    const endpoint = getGithubBotEndpoint();

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        action: 'get-pending-video-guide-deletions',
        owner,
        repo
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Failed to fetch pending deletions: ${response.status}`);
    }

    const result = await response.json();
    logger.debug('Pending deletions fetched', { count: result.deletions?.length || 0 });

    return result.deletions || [];
  } catch (error) {
    logger.error('Failed to fetch pending video guide deletions', {
      error: error.message
    });
    throw error;
  }
}
