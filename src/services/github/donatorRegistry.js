import { getOctokit } from './api.js';
import { saveUserSnapshotWithBot } from './botService.js';

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

    // First try: Search by user ID label (permanent identifier, preferred)
    if (userId) {
      donatorIssue = issues.find(issue =>
        issue.labels.some(label =>
          (typeof label === 'string' && label === `user-id:${userId}`) ||
          (typeof label === 'object' && label.name === `user-id:${userId}`)
        )
      );

      if (donatorIssue) {
        console.log(`[DonatorRegistry] Found donator status for user ${username} by ID: ${userId}`);
      }
    }

    // Second try: Search by username in title (legacy entries or no user ID provided)
    if (!donatorIssue) {
      donatorIssue = issues.find(
        issue => issue.title === `${DONATOR_TITLE_PREFIX} ${username}`
      );

      if (donatorIssue) {
        console.log(`[DonatorRegistry] Found legacy donator status for ${username} by title`);
      }
    }

    if (!donatorIssue) {
      console.log(`[DonatorRegistry] No donator status found for user: ${username}`);
      return null;
    }

    // Parse JSON from issue body
    try {
      const donatorData = JSON.parse(donatorIssue.body);
      console.log(`[DonatorRegistry] Loaded donator status for ${username}`);
      return donatorData;
    } catch (parseError) {
      console.error(`[DonatorRegistry] Failed to parse donator data for ${username}:`, parseError);
      return null;
    }
  } catch (error) {
    console.error(`[DonatorRegistry] Failed to get donator status for ${username}:`, error);
    return null;
  }
}

/**
 * Save or update donator status for a user using the bot
 * Uses user ID for permanent identification (usernames can change)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} userId - GitHub user ID
 * @param {Object} donatorStatus - Donator status object
 * @returns {Object} Created/updated issue
 */
export async function saveDonatorStatus(owner, repo, username, userId, donatorStatus) {
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
        console.log(`[DonatorRegistry] Found existing donator status for user ${username} by ID: ${userId}`);
      }
    }

    // Second try: Search by username in title (legacy entries)
    if (!existingIssue) {
      existingIssue = issues.find(
        issue => issue.title === `${DONATOR_TITLE_PREFIX} ${username}`
      );

      if (existingIssue) {
        console.log(`[DonatorRegistry] Found legacy donator status for ${username} by title, will migrate to user ID label`);
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
      console.log(`[DonatorRegistry] Updating donator status for ${username}...`);

      // Update using bot token
      const botToken = process.env.WIKI_BOT_TOKEN || import.meta.env.VITE_WIKI_BOT_TOKEN;
      const botOctokit = new (await import('@octokit/rest')).Octokit({ auth: botToken });

      const { data: updatedIssue } = await botOctokit.rest.issues.update({
        owner,
        repo,
        issue_number: existingIssue.number,
        title: issueTitle,
        body: issueBody,
        labels: issueLabels,
      });

      console.log(`[DonatorRegistry] ✓ Donator status updated for ${username} (issue #${updatedIssue.number})`);
      return updatedIssue;
    } else {
      console.log(`[DonatorRegistry] Creating donator status for ${username}...`);

      // Create using bot token
      const botToken = process.env.WIKI_BOT_TOKEN || import.meta.env.VITE_WIKI_BOT_TOKEN;
      const botOctokit = new (await import('@octokit/rest')).Octokit({ auth: botToken });

      const { data: createdIssue } = await botOctokit.rest.issues.create({
        owner,
        repo,
        title: issueTitle,
        body: issueBody,
        labels: issueLabels,
      });

      console.log(`[DonatorRegistry] ✓ Donator status created for ${username} (issue #${createdIssue.number})`);
      return createdIssue;
    }
  } catch (error) {
    console.error(`[DonatorRegistry] Failed to save donator status for ${username}:`, error);
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
        console.warn(`[DonatorRegistry] Failed to parse donator status in issue #${issue.number}`);
      }
    }

    console.log(`[DonatorRegistry] Loaded ${donators.length} donator statuses`);
    return donators;
  } catch (error) {
    console.error('[DonatorRegistry] Failed to get all donators:', error);
    return [];
  }
}

/**
 * Remove donator status for a user
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} [userId] - Optional GitHub user ID
 * @returns {boolean} True if removed successfully
 */
export async function removeDonatorStatus(owner, repo, username, userId = null) {
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
      console.log(`[DonatorRegistry] No donator status found to remove for ${username}`);
      return false;
    }

    // Close the issue using bot token
    const botToken = process.env.WIKI_BOT_TOKEN || import.meta.env.VITE_WIKI_BOT_TOKEN;
    const botOctokit = new (await import('@octokit/rest')).Octokit({ auth: botToken });

    await botOctokit.rest.issues.update({
      owner,
      repo,
      issue_number: donatorIssue.number,
      state: 'closed',
    });

    console.log(`[DonatorRegistry] ✓ Donator status removed for ${username} (closed issue #${donatorIssue.number})`);
    return true;
  } catch (error) {
    console.error(`[DonatorRegistry] Failed to remove donator status for ${username}:`, error);
    throw error;
  }
}
