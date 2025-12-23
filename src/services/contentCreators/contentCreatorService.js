/**
 * Content Creator Service
 * Manages community-submitted content creators (Twitch/YouTube streamers)
 * Uses GitHub Issues as database with checkbox-based admin approval
 *
 * Architecture (similar to Build Share Index):
 * - Single issue per repository with label "content-creator-index"
 * - Issue body contains creatorId-to-comment-ID map + pending approvals section
 * - Each submission is stored as a comment on the issue
 * - Admin approval via checkbox in issue body
 * - In-flight request caching for race condition prevention
 *
 * Issue Body Format:
 * ```
 * # Content Creator Index
 *
 * ## Approved Creators
 * [twitch-username-abc123]=comment-id-1
 * [youtube-channelid-def456]=comment-id-2
 *
 * ## Pending Approvals
 * - [ ] [Streamer Name](https://github.com/.../issues/123#issuecomment-456) - Twitch - submitted by @user
 * - [x] [Another Stream](https://github.com/.../issues/123#issuecomment-789) - YouTube - submitted by @user2
 *
 * ---
 * 🤖 Managed by wiki bot
 * ```
 *
 * Comment Format:
 * ```json
 * {
 *   "creatorId": "twitch-username-abc123",
 *   "platform": "twitch",
 *   "channelUrl": "https://twitch.tv/username",
 *   "channelName": "Display Name",
 *   "submittedBy": "github-username",
 *   "submittedAt": "2024-01-01T00:00:00.000Z",
 *   "approved": false,
 *   "approvedBy": null,
 *   "approvedAt": null
 * }
 * ```
 */

import { createLogger } from '../../utils/logger';
import { getGithubBotEndpoint } from '../../utils/apiEndpoints';

const logger = createLogger('ContentCreatorService');

const CREATOR_INDEX_LABEL = 'content-creator-index';
const CREATOR_INDEX_TITLE = '[Content Creator Index]';
const INDEX_HEADER = '# Content Creator Index\n\n';
const APPROVED_SECTION_HEADER = '## Approved Creators\n';
const PENDING_SECTION_HEADER = '\n## Pending Approvals\n';
const FOOTER = '\n---\n🤖 Managed by wiki bot\n';

/**
 * In-memory cache for approved creators (5-minute TTL)
 * Key: 'approved', Value: { creators: [...], timestamp: number }
 */
const creatorCache = new Map();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * In-flight request tracking to prevent race conditions
 */
const pendingIndexIssueRequests = new Map();

/**
 * Rate limiting for submissions (5 per hour per user)
 * Key: username, Value: array of submission timestamps
 */
const RATE_LIMIT_WINDOW = 60 * 60 * 1000; // 1 hour
const RATE_LIMIT_MAX = 5;

/**
 * Check if the content creators feature is enabled in config
 * @param {Object} config - Wiki config
 * @returns {boolean} True if feature is enabled
 */
export function isContentCreatorsEnabled(config) {
  return config?.features?.contentCreators?.enabled === true;
}

/**
 * Check if streamer submissions are allowed
 * @param {Object} config - Wiki config
 * @returns {boolean} True if submissions are allowed
 */
export function areStreamerSubmissionsAllowed(config) {
  return (
    config?.features?.contentCreators?.enabled === true &&
    config?.features?.contentCreators?.streamers?.enabled === true &&
    config?.features?.contentCreators?.streamers?.allowSubmissions === true
  );
}

/**
 * Get rate limit for streamer submissions from config
 * @param {Object} config - Wiki config
 * @returns {number} Max submissions per hour
 */
export function getStreamerRateLimit(config) {
  return config?.features?.contentCreators?.streamers?.rateLimit?.maxSubmissionsPerHour || RATE_LIMIT_MAX;
}

/**
 * Get allowed platforms from config
 * @param {Object} config - Wiki config
 * @returns {Array<string>} Allowed platforms
 */
export function getAllowedPlatforms(config) {
  return config?.features?.contentCreators?.streamers?.platforms || ['twitch', 'youtube'];
}

/**
 * Check if user has exceeded rate limit
 * @param {string} username - GitHub username
 * @param {Object} config - Wiki config
 * @returns {boolean} True if rate limit exceeded
 */
export function hasExceededRateLimit(username, config) {
  const rateLimit = getStreamerRateLimit(config);
  const key = `creator_submissions_${username}`;
  const storedData = localStorage.getItem(key);

  if (!storedData) return false;

  try {
    const submissions = JSON.parse(storedData);
    const now = Date.now();

    // Filter submissions within the rate limit window
    const recentSubmissions = submissions.filter(ts => now - ts < RATE_LIMIT_WINDOW);

    // Update localStorage with filtered submissions
    localStorage.setItem(key, JSON.stringify(recentSubmissions));

    return recentSubmissions.length >= rateLimit;
  } catch (error) {
    logger.error('Failed to check rate limit', { error, username });
    return false;
  }
}

/**
 * Record a submission timestamp for rate limiting
 * @param {string} username - GitHub username
 */
export function recordSubmission(username) {
  const key = `creator_submissions_${username}`;
  const storedData = localStorage.getItem(key);

  try {
    const submissions = storedData ? JSON.parse(storedData) : [];
    submissions.push(Date.now());
    localStorage.setItem(key, JSON.stringify(submissions));
  } catch (error) {
    logger.error('Failed to record submission', { error, username });
  }
}

/**
 * Generate unique creator ID from channel URL and platform
 * Uses SHA-256 hash of "platform:url" normalized string
 * @param {string} channelUrl - Channel URL
 * @param {string} platform - Platform (twitch/youtube)
 * @returns {Promise<string>} Creator ID
 */
export async function generateCreatorId(channelUrl, platform) {
  const normalized = `${platform}:${channelUrl.toLowerCase().trim()}`;
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Return platform prefix + first 16 chars of hash
  return `${platform}-${hashHex.substring(0, 16)}`;
}

/**
 * Validate channel URL format
 * @param {string} url - Channel URL
 * @param {string} platform - Platform (twitch/youtube)
 * @returns {boolean} True if valid
 */
export function isValidChannelUrl(url, platform) {
  if (!url || !platform) return false;

  if (platform === 'twitch') {
    return /^https?:\/\/(www\.)?twitch\.tv\/[a-zA-Z0-9_]{4,25}\/?$/.test(url);
  } else if (platform === 'youtube') {
    return /^https?:\/\/(www\.)?youtube\.com\/((@|c\/|channel\/|user\/)[a-zA-Z0-9_-]+)\/?$/.test(url);
  }

  return false;
}

/**
 * Extract channel name from URL
 * @param {string} url - Channel URL
 * @returns {string} Channel name
 */
export function extractChannelName(url) {
  try {
    const urlObj = new URL(url);
    const pathname = urlObj.pathname;

    // Twitch: /username
    if (urlObj.hostname.includes('twitch.tv')) {
      return pathname.substring(1); // Remove leading slash
    }

    // YouTube: /@username, /c/username, /channel/ID, /user/username
    if (urlObj.hostname.includes('youtube.com')) {
      const parts = pathname.split('/').filter(Boolean);
      return parts[parts.length - 1];
    }

    return '';
  } catch (error) {
    logger.error('Failed to extract channel name', { error, url });
    return '';
  }
}

/**
 * Get approved creators
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config
 * @returns {Promise<Array>} Array of approved creators
 */
export async function getApprovedCreators(owner, repo, config) {
  // Check cache
  const cacheKey = 'approved';
  const cached = creatorCache.get(cacheKey);

  if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
    logger.debug('Returning cached creators', { count: cached.creators.length });
    return cached.creators;
  }

  try {
    const endpoint = getGithubBotEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'get-approved-creators',
        owner,
        repo
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch approved creators: ${response.status}`);
    }

    const data = await response.json();
    const creators = data.creators || [];

    // Update cache
    creatorCache.set(cacheKey, {
      creators,
      timestamp: Date.now()
    });

    logger.info('Fetched approved creators', { count: creators.length });
    return creators;
  } catch (error) {
    logger.error('Failed to get approved creators', { error: error.message });
    throw error;
  }
}

/**
 * Get all creator submissions (for admin panel)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config
 * @returns {Promise<Array>} Array of all submissions
 */
export async function getAllCreatorSubmissions(owner, repo, config) {
  try {
    const endpoint = getGithubBotEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'get-all-creator-submissions',
        owner,
        repo
      })
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch submissions: ${response.status}`);
    }

    const data = await response.json();
    return data.submissions || [];
  } catch (error) {
    logger.error('Failed to get all submissions', { error: error.message });
    throw error;
  }
}

/**
 * Submit content creator
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config
 * @param {Object} submissionData - Submission data
 * @returns {Promise<Object>} Result { creatorId, commentId, issueNumber, issueUrl }
 */
export async function submitContentCreator(owner, repo, config, submissionData) {
  const { platform, channelUrl, channelName, submittedBy } = submissionData;

  // Validate required fields
  if (!platform || !channelUrl || !submittedBy) {
    throw new Error('Missing required fields: platform, channelUrl, submittedBy');
  }

  // Validate URL
  if (!isValidChannelUrl(channelUrl, platform)) {
    throw new Error('Invalid channel URL for selected platform');
  }

  // Check rate limit
  if (hasExceededRateLimit(submittedBy, config)) {
    const rateLimit = getStreamerRateLimit(config);
    throw new Error(`Rate limit exceeded. Maximum ${rateLimit} submissions per hour.`);
  }

  // Generate creator ID
  const creatorId = await generateCreatorId(channelUrl, platform);

  try {
    const endpoint = getGithubBotEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        action: 'submit-content-creator',
        owner,
        repo,
        creatorId,
        channelUrl,
        channelName: channelName || extractChannelName(channelUrl),
        platform,
        submittedBy
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Submission failed: ${response.status}`);
    }

    const result = await response.json();

    // Record submission for rate limiting
    recordSubmission(submittedBy);

    // Bust cache
    creatorCache.delete('approved');

    logger.info('Content creator submitted', { creatorId, platform });
    return result;
  } catch (error) {
    logger.error('Failed to submit content creator', { error: error.message });
    throw error;
  }
}

/**
 * Sync creator approvals from GitHub Issue checkboxes
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config
 * @param {string} adminUsername - Admin username
 * @param {string} userToken - User token
 * @returns {Promise<Object>} Result { updatesCount, message }
 */
export async function syncCreatorApprovals(owner, repo, config, adminUsername, userToken) {
  try {
    const endpoint = getGithubBotEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        action: 'sync-creator-approvals',
        owner,
        repo,
        adminUsername,
        userToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Sync failed: ${response.status}`);
    }

    const result = await response.json();

    // Bust cache
    creatorCache.delete('approved');

    logger.info('Synced creator approvals', result);
    return result;
  } catch (error) {
    logger.error('Failed to sync approvals', { error: error.message });
    throw error;
  }
}

/**
 * Approve creator manually
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config
 * @param {string} creatorId - Creator ID
 * @param {string} adminUsername - Admin username
 * @param {string} userToken - User token
 * @returns {Promise<Object>} Result { message, creatorId }
 */
export async function approveCreator(owner, repo, config, creatorId, adminUsername, userToken) {
  try {
    const endpoint = getGithubBotEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        action: 'approve-creator',
        owner,
        repo,
        creatorId,
        adminUsername,
        userToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Approval failed: ${response.status}`);
    }

    const result = await response.json();

    // Bust cache
    creatorCache.delete('approved');

    logger.info('Approved creator', { creatorId });
    return result;
  } catch (error) {
    logger.error('Failed to approve creator', { error: error.message, creatorId });
    throw error;
  }
}

/**
 * Delete creator submission
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config
 * @param {string} creatorId - Creator ID
 * @param {string} adminUsername - Admin username
 * @param {string} userToken - User token
 * @returns {Promise<Object>} Result { message, creatorId }
 */
export async function deleteCreatorSubmission(owner, repo, config, creatorId, adminUsername, userToken) {
  try {
    const endpoint = getGithubBotEndpoint();
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${userToken}`
      },
      body: JSON.stringify({
        action: 'delete-creator-submission',
        owner,
        repo,
        creatorId,
        adminUsername,
        userToken
      })
    });

    if (!response.ok) {
      const errorData = await response.json().catch(() => ({}));
      throw new Error(errorData.error || `Deletion failed: ${response.status}`);
    }

    const result = await response.json();

    // Bust cache
    creatorCache.delete('approved');

    logger.info('Deleted creator submission', { creatorId });
    return result;
  } catch (error) {
    logger.error('Failed to delete submission', { error: error.message, creatorId });
    throw error;
  }
}

/**
 * Bust the creator cache
 */
export function bustCreatorCache() {
  creatorCache.clear();
  logger.debug('Creator cache busted');
}
