/**
 * Video Guide Service
 * Handles loading, filtering, and submission of video guides
 */

import { createLogger } from '../../utils/logger';
import { getOctokit, getAuthenticatedUser } from '../github/api';
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
 * @returns {Promise<Object>} PR details { prNumber, prUrl }
 */
export async function submitVideoGuide(owner, repo, config, guideData) {
  try {
    logger.info('Submitting video guide', { title: guideData.title });

    // Validate required fields
    if (!guideData.videoUrl || !guideData.title || !guideData.description) {
      throw new Error('Missing required fields: videoUrl, title, and description are required');
    }

    // Validate YouTube URL
    if (!isValidYouTubeUrl(guideData.videoUrl)) {
      throw new Error('Invalid YouTube URL');
    }

    // Get authenticated user
    const user = await getAuthenticatedUser();
    logger.debug('User authenticated', { username: user.login });

    // Fetch current video-guides.json
    const octokit = getOctokit();
    const { data: fileData } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path: 'public/data/video-guides.json',
      ref: 'main'
    });

    // Decode and parse current content
    const currentContent = Buffer.from(fileData.content, 'base64').toString('utf8');
    const videoGuidesData = JSON.parse(currentContent);
    const existingGuides = videoGuidesData.videoGuides || [];

    // Check for duplicate video URL
    const duplicateUrl = existingGuides.find(g => g.videoUrl === guideData.videoUrl);
    if (duplicateUrl) {
      throw new Error('This video has already been submitted');
    }

    // Generate unique ID
    const id = generateGuideId(guideData.title, existingGuides);
    const videoId = extractYouTubeVideoId(guideData.videoUrl);

    // Build new guide entry
    const newGuide = {
      id,
      videoUrl: guideData.videoUrl,
      title: guideData.title,
      description: guideData.description,
      thumbnailUrl: getYouTubeThumbnail(guideData.videoUrl),
      submittedBy: user.login,
      submittedAt: new Date().toISOString(),
      featured: false
    };

    // Add optional fields
    if (guideData.creator) newGuide.creator = guideData.creator;
    if (guideData.category) newGuide.category = guideData.category;
    if (guideData.tags && guideData.tags.length > 0) newGuide.tags = guideData.tags;
    if (guideData.difficulty) newGuide.difficulty = guideData.difficulty;

    // Add to guides array
    existingGuides.push(newGuide);
    videoGuidesData.videoGuides = existingGuides;

    // Serialize updated content
    const updatedContent = JSON.stringify(videoGuidesData, null, 2);

    // Create branch name
    const branchName = `video-guide-${id}-${Date.now()}`;

    // Create branch and commit file
    logger.debug('Creating branch and committing changes', { branchName });
    await updateFileContent(
      owner,
      repo,
      'public/data/video-guides.json',
      updatedContent,
      `Add video guide: ${guideData.title}`,
      branchName
    );

    // Create PR
    const prTitle = `[Video Guide] ${guideData.title}`;
    const prBody = `## Video Guide Submission

**Title:** ${guideData.title}
**Video:** ${guideData.videoUrl}
**Description:** ${guideData.description}
${guideData.creator ? `**Creator:** ${guideData.creator}` : ''}
${guideData.category ? `**Category:** ${guideData.category}` : ''}
${guideData.difficulty ? `**Difficulty:** ${guideData.difficulty}` : ''}
${guideData.tags && guideData.tags.length > 0 ? `**Tags:** ${guideData.tags.join(', ')}` : ''}

---

Submitted by @${user.login}

**For reviewers:** Please review the video content before merging to ensure it's appropriate and follows community guidelines.`;

    const pr = await createPullRequest(
      owner,
      repo,
      prTitle,
      prBody,
      branchName,
      'main',
      config
    );

    logger.info('Video guide PR created successfully', {
      prNumber: pr.number,
      prUrl: pr.url,
      guideId: id
    });

    return {
      prNumber: pr.number,
      prUrl: pr.url,
      guideId: id
    };
  } catch (error) {
    logger.error('Failed to submit video guide', {
      error: error.message,
      title: guideData?.title
    });
    throw error;
  }
}
