/**
 * Email-User Mapping Service
 * Permanent mapping between hashed emails and user IDs
 * Uses GitHub Issue as database with comment-based storage
 *
 * Architecture (similar to Build Share Index):
 * - Single issue per repository with label "user-index"
 * - Issue body contains emailHash-to-comment-ID index
 * - Each mapping is stored as a comment on the issue
 * - Index enables O(1) lookups without hitting GitHub's issue body size limits
 *
 * Issue Body Format:
 * ```
 * # User Index
 *
 * [emailHash1]=comment-id-1
 * [emailHash2]=comment-id-2
 * ```
 *
 * Comment Format:
 * ```json
 * {
 *   "emailHash": "abc123...",
 *   "userId": 12345,
 *   "username": "testuser",
 *   "linkedAt": "ISO date"
 * }
 * ```
 */

import { createLogger } from '../../utils/logger';
const logger = createLogger('EmailUserMapping');

const USER_INDEX_LABEL = 'user-index';
const USER_INDEX_TITLE = '[User Index]';
const INDEX_HEADER = '# User Index\n\n';

/**
 * Parse the index map from issue body
 * @param {string} body - Issue body text
 * @returns {Map<string, number>} Map of emailHashes to comment IDs
 */
function parseIndexMap(body) {
  const map = new Map();

  if (!body) return map;

  // Match lines like: [emailHash]=comment-id
  // EmailHash is 46-64 hex characters (we use 46 for labels, 64 for full hash)
  const regex = /\[([a-f0-9]{46,64})\]=(\d+)/gi;
  let match;

  while ((match = regex.exec(body)) !== null) {
    const emailHash = match[1];
    const commentId = parseInt(match[2], 10);
    map.set(emailHash, commentId);
  }

  return map;
}

/**
 * Serialize index map to issue body format
 * @param {Map<string, number>} map - Map of emailHashes to comment IDs
 * @returns {string} Formatted issue body
 */
function serializeIndexMap(map) {
  let body = INDEX_HEADER;

  for (const [emailHash, commentId] of map.entries()) {
    body += `[${emailHash}]=${commentId}\n`;
  }

  return body;
}

/**
 * Get or create the user index issue
 * @param {Octokit} octokit - Authenticated Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Object>} GitHub issue object with { number, body }
 */
async function getUserIndexIssue(octokit, owner, repo) {
  try {
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: USER_INDEX_LABEL,
      state: 'open',
      per_page: 1,
    });

    if (issues.length > 0) {
      logger.debug('Found existing user index issue', { issueNumber: issues[0].number });
      return {
        number: issues[0].number,
        body: issues[0].body || INDEX_HEADER,
      };
    }

    // Create new user index issue
    logger.info('Creating new user index issue');
    const { data: newIssue } = await octokit.rest.issues.create({
      owner,
      repo,
      title: USER_INDEX_TITLE,
      body: INDEX_HEADER,
      labels: [USER_INDEX_LABEL, 'automated'],
    });

    logger.info('Created user index issue', { issueNumber: newIssue.number });
    return {
      number: newIssue.number,
      body: newIssue.body || INDEX_HEADER,
    };
  } catch (error) {
    logger.error('Failed to get/create user index issue', { error });
    throw error;
  }
}

/**
 * Add or update email→userId mapping
 * @param {Octokit} octokit - Authenticated Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} emailHash - SHA-256 hash of email (64 chars)
 * @param {number} userId - GitHub user ID
 * @param {string} username - GitHub username
 * @param {boolean} updateLinkTime - Whether to update lastLinkedAt timestamp (for cooldown tracking)
 * @returns {Promise<{success: boolean}>}
 */
export async function addEmailUserMapping(octokit, owner, repo, emailHash, userId, username, updateLinkTime = false) {
  try {
    logger.debug('Adding email-user mapping', { emailHash: emailHash.substring(0, 8), userId, username });

    // Get user index issue
    const indexIssue = await getUserIndexIssue(octokit, owner, repo);
    logger.debug('User index issue', { issueNumber: indexIssue.number });

    // Parse existing index map
    const indexMap = parseIndexMap(indexIssue.body);

    // Check if mapping already exists
    if (indexMap.has(emailHash)) {
      const commentId = indexMap.get(emailHash);
      logger.debug('Mapping already exists, updating comment', { commentId, emailHash: emailHash.substring(0, 8) });

      // Fetch existing comment to update username
      const { data: existingComment } = await octokit.rest.issues.getComment({
        owner,
        repo,
        comment_id: commentId,
      });

      const existingData = JSON.parse(existingComment.body);

      // Update username if changed, or update link time if requested
      if (existingData.username !== username || updateLinkTime) {
        existingData.username = username;
        existingData.lastUpdated = new Date().toISOString();

        if (updateLinkTime) {
          existingData.lastLinkedAt = new Date().toISOString();
          logger.debug('Updated lastLinkedAt timestamp', { emailHash: emailHash.substring(0, 8) });
        }

        await octokit.rest.issues.updateComment({
          owner,
          repo,
          comment_id: commentId,
          body: JSON.stringify(existingData, null, 2),
        });

        logger.info('Updated mapping', { emailHash: emailHash.substring(0, 8), username });
      } else {
        logger.debug('No changes needed, skipping update', { emailHash: emailHash.substring(0, 8) });
      }

      return { success: true };
    }

    // Create new mapping comment
    const commentBody = JSON.stringify({
      emailHash,
      userId,
      username,
      linkedAt: new Date().toISOString(),
      lastLinkedAt: updateLinkTime ? new Date().toISOString() : undefined,
    }, null, 2);

    logger.debug('Creating new mapping comment', { emailHash: emailHash.substring(0, 8) });

    const { data: comment } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: indexIssue.number,
      body: commentBody,
    });

    logger.debug('Comment created', { commentId: comment.id });

    // Update index map
    indexMap.set(emailHash, comment.id);
    const newBody = serializeIndexMap(indexMap);

    // Update issue body with new index
    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: indexIssue.number,
      body: newBody,
    });

    logger.info('Email-user mapping saved successfully', { emailHash: emailHash.substring(0, 8), userId, commentId: comment.id });
    return { success: true };
  } catch (error) {
    logger.error('Failed to add email-user mapping', { error, emailHash: emailHash?.substring(0, 8), userId });
    throw error;
  }
}

/**
 * Check linking cooldown for a user
 * @param {Octokit} octokit - Authenticated Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} emailHash - SHA-256 hash of email (64 chars)
 * @param {number} cooldownMinutes - Cooldown period in minutes (default: 60)
 * @returns {Promise<{allowed: boolean, remainingSeconds?: number, lastLinkedAt?: string}>}
 */
export async function checkLinkingCooldown(octokit, owner, repo, emailHash, cooldownMinutes = 60) {
  try {
    logger.debug('Checking linking cooldown', { emailHash: emailHash.substring(0, 8) });

    // Get user index issue
    const indexIssue = await getUserIndexIssue(octokit, owner, repo);

    // Parse index map
    const indexMap = parseIndexMap(indexIssue.body);

    // Find comment ID for email hash
    const commentId = indexMap.get(emailHash);

    if (!commentId) {
      // No mapping exists, no cooldown applies
      logger.debug('No mapping found, cooldown check passed', { emailHash: emailHash.substring(0, 8) });
      return { allowed: true };
    }

    // Fetch comment data
    const { data: comment } = await octokit.rest.issues.getComment({
      owner,
      repo,
      comment_id: commentId,
    });

    // Parse mapping data from comment body
    const mappingData = JSON.parse(comment.body);

    if (!mappingData.lastLinkedAt) {
      // No previous link attempt, cooldown doesn't apply
      logger.debug('No lastLinkedAt timestamp, cooldown check passed', { emailHash: emailHash.substring(0, 8) });
      return { allowed: true };
    }

    // Check if cooldown period has passed
    const lastLinkedAt = new Date(mappingData.lastLinkedAt);
    const now = new Date();
    const elapsedMs = now - lastLinkedAt;
    const elapsedMinutes = elapsedMs / (1000 * 60);

    if (elapsedMinutes >= cooldownMinutes) {
      logger.debug('Cooldown period has passed', {
        emailHash: emailHash.substring(0, 8),
        elapsedMinutes: Math.floor(elapsedMinutes)
      });
      return { allowed: true, lastLinkedAt: mappingData.lastLinkedAt };
    }

    // Still in cooldown
    const remainingMs = (cooldownMinutes * 60 * 1000) - elapsedMs;
    const remainingSeconds = Math.ceil(remainingMs / 1000);

    logger.debug('Cooldown active', {
      emailHash: emailHash.substring(0, 8),
      remainingSeconds,
      lastLinkedAt: mappingData.lastLinkedAt
    });

    return {
      allowed: false,
      remainingSeconds,
      lastLinkedAt: mappingData.lastLinkedAt
    };
  } catch (error) {
    logger.error('Failed to check linking cooldown', { error, emailHash: emailHash?.substring(0, 8) });
    // On error, allow the request (fail open for better UX)
    return { allowed: true };
  }
}

/**
 * Get userId for a hashed email
 * @param {Octokit} octokit - Authenticated Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} emailHash - SHA-256 hash of email (64 chars)
 * @returns {Promise<number|null>} User ID or null if not found
 */
export async function getUserIdForEmail(octokit, owner, repo, emailHash) {
  try {
    logger.debug('Looking up user ID for email', { emailHash: emailHash.substring(0, 8) });

    // Get user index issue
    const indexIssue = await getUserIndexIssue(octokit, owner, repo);

    // Parse index map
    const indexMap = parseIndexMap(indexIssue.body);

    // Find comment ID for email hash
    const commentId = indexMap.get(emailHash);

    if (!commentId) {
      logger.debug('No mapping found', { emailHash: emailHash.substring(0, 8) });
      return null;
    }

    // Fetch comment data
    const { data: comment } = await octokit.rest.issues.getComment({
      owner,
      repo,
      comment_id: commentId,
    });

    // Parse mapping data from comment body
    const mappingData = JSON.parse(comment.body);

    logger.debug('Found mapping', { emailHash: emailHash.substring(0, 8), userId: mappingData.userId, username: mappingData.username });
    return mappingData.userId;
  } catch (error) {
    logger.error('Failed to get user ID for email', { error, emailHash: emailHash?.substring(0, 8) });
    return null;
  }
}

/**
 * Get all mappings for a user ID
 * @param {Octokit} octokit - Authenticated Octokit instance
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} userId - GitHub user ID
 * @returns {Promise<Array>} Array of email hashes mapped to this user
 */
export async function getEmailHashesForUser(octokit, owner, repo, userId) {
  try {
    logger.debug('Looking up email hashes for user', { userId });

    // Get user index issue
    const indexIssue = await getUserIndexIssue(octokit, owner, repo);

    // Fetch all comments on the issue
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: indexIssue.number,
      per_page: 100, // Adjust if more mappings expected
    });

    // Filter comments by userId
    const emailHashes = [];
    for (const comment of comments) {
      try {
        const mappingData = JSON.parse(comment.body);
        if (mappingData.userId === userId) {
          emailHashes.push(mappingData.emailHash);
        }
      } catch (parseError) {
        logger.warn('Failed to parse mapping comment', { commentId: comment.id, error: parseError });
      }
    }

    logger.debug('Found mappings for user', { userId, count: emailHashes.length });
    return emailHashes;
  } catch (error) {
    logger.error('Failed to get email hashes for user', { error, userId });
    return [];
  }
}
