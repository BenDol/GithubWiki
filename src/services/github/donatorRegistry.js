import { getOctokit } from './api.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('DonatorRegistry');

/**
 * Donator Registry System
 * Stores donator status in GitHub Issues as a permanent record
 *
 * Issue Format:
 * - Title: [Donator] username
 * - Labels: donator, user-id:12345
 * - Body: JSON donator data
 *
 * Indexing:
 * - Primary: User ID label (user-id:12345) - permanent, immune to username changes
 * - Fallback: Username in title - for legacy entries
 *
 * Why separate from user snapshots:
 * - User snapshots can be rebuilt/deleted (temporary cache)
 * - Donator status is permanent and should never be lost
 * - Easier to audit and manage separately
 */

const DONATOR_LABEL = 'donator';
const DONATOR_TITLE_PREFIX = '[Donator]';

// In-flight request tracking to prevent concurrent duplicate requests
const pendingDonatorRequests = new Map();

/**
 * Validate donator status object structure
 * @param {Object} donatorStatus - Donator status to validate
 * @returns {boolean} True if valid
 * @throws {Error} If invalid
 */
function validateDonatorStatus(donatorStatus) {
  if (!donatorStatus || typeof donatorStatus !== 'object') {
    throw new Error('Donator status must be an object');
  }

  // Required fields
  if (typeof donatorStatus.isDonator !== 'boolean') {
    throw new Error('isDonator must be a boolean');
  }

  if (!donatorStatus.isDonator) {
    // If isDonator is false, no other fields required
    return true;
  }

  // If isDonator is true, require these fields
  if (!donatorStatus.donatedAt || typeof donatorStatus.donatedAt !== 'string') {
    throw new Error('donatedAt must be an ISO 8601 date string');
  }

  if (!donatorStatus.badge || typeof donatorStatus.badge !== 'string') {
    throw new Error('badge must be a string (emoji)');
  }

  if (!donatorStatus.color || typeof donatorStatus.color !== 'string') {
    throw new Error('color must be a string (hex color)');
  }

  if (!donatorStatus.assignedBy || typeof donatorStatus.assignedBy !== 'string') {
    throw new Error('assignedBy must be a string (source of assignment)');
  }

  // Optional fields
  if (donatorStatus.amount !== undefined && typeof donatorStatus.amount !== 'number') {
    throw new Error('amount must be a number');
  }

  if (donatorStatus.transactionId !== undefined && typeof donatorStatus.transactionId !== 'string') {
    throw new Error('transactionId must be a string');
  }

  return true;
}

/**
 * Get donator status for a specific user
 * Searches by user ID label (permanent) first, falls back to username title match (legacy)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} [userId] - Optional GitHub user ID for faster lookup
 * @returns {Object|null} Donator status or null if not found
 */
export async function getDonatorStatus(owner, repo, username, userId = null) {
  // Capture stack trace for network debug tracking
  if (typeof window !== 'undefined') {
    const capturedStack = new Error().stack;
    if (!window.__apiCallStacks__) {
      window.__apiCallStacks__ = new Map();
    }
    window.__apiCallStacks__.set('getDonatorStatus', {
      stack: capturedStack,
      timestamp: Date.now()
    });
  }

  const cacheKey = userId ? `${owner}/${repo}/${userId}` : `${owner}/${repo}/${username}`;

  logger.debug('Getting donator status', { username, userId, cacheKey });

  // Check cache first (only in browser context)
  if (typeof window !== 'undefined') {
    try {
      const { useGitHubDataStore } = await import('../../store/githubDataStore');
      const { useAuthStore } = await import('../../store/authStore');

      const store = useGitHubDataStore.getState();
      const isAuthenticated = useAuthStore.getState().isAuthenticated;

      const cached = store.getCachedDonatorStatus(cacheKey, isAuthenticated);
      if (cached !== null) {
        logger.debug('Cache hit - using cached donator status', { username, cacheKey });
        return cached;
      } else {
        logger.debug('Cache miss - fetching from GitHub API', { username, cacheKey });
      }
    } catch (err) {
      logger.warn('Cache check failed', { error: err.message });
      // Silently fail if stores can't be loaded (serverless context)
    }
  }

  // Check if there's already a request in-flight for this user (prevent duplicate concurrent requests)
  if (pendingDonatorRequests.has(cacheKey)) {
    logger.debug('Request already in-flight, waiting', { username, cacheKey });
    return pendingDonatorRequests.get(cacheKey);
  }

  // Create the request promise
  const requestPromise = (async () => {
    try {
      const octokit = getOctokit();

      // Increment API call counter (only in browser)
      if (typeof window !== 'undefined') {
        try {
          const { useGitHubDataStore } = await import('../../store/githubDataStore');
          useGitHubDataStore.getState().incrementAPICall();
        } catch (err) {
          // Silently fail
        }
      }

      // Search for the user's donator issue
      const { data: issues } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        labels: DONATOR_LABEL,
        state: 'open',
        per_page: 100,
      });

      let donatorIssue = null;

      logger.debug('Searching for donator issue', {
        username,
        userId,
        totalIssues: issues.length
      });

      // First try: Search by user ID label (permanent identifier, preferred)
      if (userId) {
        donatorIssue = issues.find(issue =>
          issue.labels.some(label =>
            (typeof label === 'string' && label === `user-id:${userId}`) ||
            (typeof label === 'object' && label.name === `user-id:${userId}`)
          )
        );

        if (donatorIssue) {
          logger.debug('Found donator status by user ID', { username, userId, issueNumber: donatorIssue.number });
        }
      }

      // Second try: Search by username in title (legacy entries or no user ID provided)
      if (!donatorIssue) {
        const expectedTitle = `${DONATOR_TITLE_PREFIX} ${username}`;
        donatorIssue = issues.find(
          issue => issue.title === expectedTitle
        );

        if (donatorIssue) {
          logger.debug('Found legacy donator status by title', { username, issueNumber: donatorIssue.number });
        }
      }

      let donatorData = null;

      if (!donatorIssue) {
        logger.debug('No donator status found', { username });
      } else {
        // Parse JSON from issue body
        try {
          donatorData = JSON.parse(donatorIssue.body);
          logger.debug('Loaded donator status', { username, isDonator: donatorData?.isDonator });
        } catch (parseError) {
          logger.error('Failed to parse donator data', { username, error: parseError.message });
        }
      }

      // Cache the result (including null for non-donators) - only in browser context
      if (typeof window !== 'undefined') {
        try {
          const { useGitHubDataStore } = await import('../../store/githubDataStore');
          const store = useGitHubDataStore.getState();
          store.cacheDonatorStatus(cacheKey, donatorData);
          logger.debug('Cached donator status', { username, cacheKey });
        } catch (err) {
          // Silently fail if store can't be loaded
        }
      }

      return donatorData;
    } catch (error) {
      logger.error('Failed to get donator status', { username, error: error.message });
      return null;
    } finally {
      // Clear the in-flight request
      pendingDonatorRequests.delete(cacheKey);
    }
  })();

  // Track the in-flight request
  pendingDonatorRequests.set(cacheKey, requestPromise);

  return requestPromise;
}

/**
 * Save or update donator status for a user using the bot
 * Uses user ID for permanent identification (usernames can change)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} userId - GitHub user ID
 * @param {Object} donatorStatus - Donator status object
 * @param {string} [botToken] - Optional bot token (required in serverless context)
 * @returns {Object} Created/updated issue
 */
export async function saveDonatorStatus(owner, repo, username, userId, donatorStatus, botToken = null) {
  try {
    // Validate donator status
    validateDonatorStatus(donatorStatus);

    const octokit = getOctokit();

    // Search for existing donator issue
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: DONATOR_LABEL,
      state: 'open',
      per_page: 100,
    });

    let existingIssue = null;

    // First try: Search by user ID label (permanent identifier, preferred)
    if (userId) {
      existingIssue = issues.find(issue =>
        issue.labels.some(label =>
          (typeof label === 'string' && label === `user-id:${userId}`) ||
          (typeof label === 'object' && label.name === `user-id:${userId}`)
        )
      );

      if (existingIssue) {
        logger.debug('Found existing donator status by user ID', { username, userId });
      }
    }

    // Second try: Search by username in title (legacy entries)
    if (!existingIssue) {
      existingIssue = issues.find(
        issue => issue.title === `${DONATOR_TITLE_PREFIX} ${username}`
      );

      if (existingIssue) {
        logger.debug('Found legacy donator status by title, will migrate to user ID label', { username });
      }
    }

    // Prepare donator data with metadata
    const donatorData = {
      userId,
      username,
      lastUpdated: new Date().toISOString(),
      ...donatorStatus,
    };

    const issueTitle = `${DONATOR_TITLE_PREFIX} ${username}`;
    const issueBody = JSON.stringify(donatorData, null, 2);
    const issueLabels = [DONATOR_LABEL, `user-id:${userId}`];

    // Use bot service to create/update the donator issue
    if (existingIssue) {
      logger.info('Updating donator status', { username });

      // Update using bot token (use parameter if provided, otherwise try environment)
      const token = botToken || process.env.WIKI_BOT_TOKEN ||
        (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_WIKI_BOT_TOKEN : undefined);

      if (!token) {
        throw new Error('Bot token not available. Cannot update donator status.');
      }

      const botOctokit = new (await import('@octokit/rest')).Octokit({ auth: token });

      const { data: updatedIssue } = await botOctokit.rest.issues.update({
        owner,
        repo,
        issue_number: existingIssue.number,
        title: issueTitle,
        body: issueBody,
        labels: issueLabels,
      });

      logger.info('Donator status updated', { username, issueNumber: updatedIssue.number });

      // Invalidate cache (only in browser context)
      if (typeof window !== 'undefined') {
        try {
          const { useGitHubDataStore } = await import('../../store/githubDataStore');
          const store = useGitHubDataStore.getState();
          const cacheKey = `${owner}/${repo}/${userId}`;
          store.invalidateDonatorStatusCache(cacheKey);
          logger.debug('Invalidated donator status cache', { username });
        } catch (err) {
          // Silently fail if not in browser context
        }
      }

      return updatedIssue;
    } else {
      logger.info('Creating donator status', { username });

      // Create using bot token (use parameter if provided, otherwise try environment)
      const token = botToken || process.env.WIKI_BOT_TOKEN ||
        (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_WIKI_BOT_TOKEN : undefined);

      if (!token) {
        throw new Error('Bot token not available. Cannot create donator status.');
      }

      const botOctokit = new (await import('@octokit/rest')).Octokit({ auth: token });

      const { data: createdIssue } = await botOctokit.rest.issues.create({
        owner,
        repo,
        title: issueTitle,
        body: issueBody,
        labels: issueLabels,
      });

      logger.info('Donator status created', { username, issueNumber: createdIssue.number });

      // Invalidate cache (only in browser context)
      if (typeof window !== 'undefined') {
        try {
          const { useGitHubDataStore } = await import('../../store/githubDataStore');
          const store = useGitHubDataStore.getState();
          const cacheKey = `${owner}/${repo}/${userId}`;
          store.invalidateDonatorStatusCache(cacheKey);
          logger.debug('Invalidated donator status cache', { username });
        } catch (err) {
          // Silently fail if not in browser context
        }
      }

      return createdIssue;
    }
  } catch (error) {
    logger.error('Failed to save donator status', { username, error: error.message });
    throw error;
  }
}

/**
 * Get all donator statuses
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Array} Array of donator status objects
 */
export async function getAllDonators(owner, repo) {
  try {
    const octokit = getOctokit();

    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: DONATOR_LABEL,
      state: 'open',
      per_page: 100,
    });

    const donators = [];
    for (const issue of issues) {
      try {
        const donatorData = JSON.parse(issue.body);
        donators.push(donatorData);
      } catch (parseError) {
        logger.warn('Failed to parse donator status', { issueNumber: issue.number, error: parseError.message });
      }
    }

    logger.debug('Loaded donator statuses', { count: donators.length });
    return donators;
  } catch (error) {
    logger.error('Failed to get all donators', { error: error.message });
    return [];
  }
}

/**
 * Remove donator status for a user
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} [userId] - Optional GitHub user ID
 * @param {string} [botToken] - Optional bot token (required in serverless context)
 * @returns {boolean} True if removed successfully
 */
export async function removeDonatorStatus(owner, repo, username, userId = null, botToken = null) {
  try {
    const octokit = getOctokit();

    // Search for the user's donator issue
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: DONATOR_LABEL,
      state: 'open',
      per_page: 100,
    });

    let donatorIssue = null;

    // First try: Search by user ID label
    if (userId) {
      donatorIssue = issues.find(issue =>
        issue.labels.some(label =>
          (typeof label === 'string' && label === `user-id:${userId}`) ||
          (typeof label === 'object' && label.name === `user-id:${userId}`)
        )
      );
    }

    // Second try: Search by username in title
    if (!donatorIssue) {
      donatorIssue = issues.find(
        issue => issue.title === `${DONATOR_TITLE_PREFIX} ${username}`
      );
    }

    if (!donatorIssue) {
      logger.debug('No donator status found to remove', { username });
      return false;
    }

    // Close the issue using bot token (use parameter if provided, otherwise try environment)
    const token = botToken || process.env.WIKI_BOT_TOKEN ||
      (typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_WIKI_BOT_TOKEN : undefined);

    if (!token) {
      throw new Error('Bot token not available. Cannot remove donator status.');
    }

    const botOctokit = new (await import('@octokit/rest')).Octokit({ auth: token });

    await botOctokit.rest.issues.update({
      owner,
      repo,
      issue_number: donatorIssue.number,
      state: 'closed',
    });

    logger.info('Donator status removed', { username, issueNumber: donatorIssue.number });
    return true;
  } catch (error) {
    logger.error('Failed to remove donator status', { username, error: error.message });
    throw error;
  }
}
