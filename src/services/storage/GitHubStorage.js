/**
 * GitHub Storage Adapter
 *
 * Generic storage implementation using GitHub Issues and Comments.
 * This adapter is framework-level and contains NO wiki-specific business logic.
 *
 * Storage Model:
 * - Issues: Generic containers identified by labels
 * - Issue body: JSON array of items
 * - Comments: Individual items for comment-based storage
 * - Labels: Generic key-value labels for filtering/indexing
 *
 * The parent project defines:
 * - What labels to use
 * - What data structure to store
 * - Business logic (max items, validation, etc.)
 */

import { Octokit } from '@octokit/rest';
import StorageAdapter from './StorageAdapter.js';
import { createUserIdLabel, createWeaponIdLabel } from '../../utils/githubLabelUtils.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('GitHubStorage');

class GitHubStorage extends StorageAdapter {
  /**
   * Create a GitHub storage adapter
   * @param {Object} config
   * @param {string} config.botToken - GitHub bot token
   * @param {string} config.owner - Repository owner
   * @param {string} config.repo - Repository name
   * @param {string} config.version - Data version (default: "v1")
   */
  constructor(config) {
    super(config);

    if (!config.botToken) {
      throw new Error('GitHubStorage requires botToken');
    }
    if (!config.owner) {
      throw new Error('GitHubStorage requires owner');
    }
    if (!config.repo) {
      throw new Error('GitHubStorage requires repo');
    }

    this.octokit = new Octokit({ auth: config.botToken });
    this.owner = config.owner;
    this.repo = config.repo;
    this.dataVersion = config.version || 'v1';

    // In-flight request tracking to prevent race conditions
    this._pendingVerificationIssueRequest = null;
    this._pendingSaveRequests = new Map(); // Map of "type:userId" -> Promise
  }

  /**
   * Find issues by labels
   * @private
   */
  async _findIssuesByLabels(labels) {
    const { data: issues } = await this.octokit.rest.issues.listForRepo({
      owner: this.owner,
      repo: this.repo,
      labels: Array.isArray(labels) ? labels.join(',') : labels,
      state: 'open',
      per_page: 100,
    });
    return issues;
  }

  /**
   * Find issue by exact label match
   * @private
   */
  _findIssueByLabel(issues, targetLabel) {
    return issues.find(issue =>
      issue.labels.some(label =>
        (typeof label === 'string' && label === targetLabel) ||
        (typeof label === 'object' && label.name === targetLabel)
      )
    ) || null;
  }

  /**
   * Parse JSON from issue body or comment
   * @private
   */
  _parseJSON(text) {
    if (!text || text.trim() === '') {
      return null;
    }
    try {
      return JSON.parse(text);
    } catch (error) {
      logger.warn('Failed to parse JSON', { error });
      return null;
    }
  }

  /**
   * Create a user label, truncating if necessary to fit GitHub's 50-char limit
   * @private
   */
  _createUserLabel(userId) {
    return createUserIdLabel(userId);
  }

  /**
   * Create an entity label (e.g., weapon-id), truncating if necessary
   * @private
   */
  _createEntityLabel(entityId) {
    return createWeaponIdLabel(entityId);
  }

  // ===== Generic CRUD Operations =====

  /**
   * Load data from an issue identified by labels
   * Returns the parsed JSON from the issue body
   */
  async load(type, userId) {
    try {
      // Search for issue with type label, user label, and version label
      const typeLabel = type;
      const userLabel = this._createUserLabel(userId);
      const versionLabel = `data-version:${this.dataVersion}`;

      const issues = await this._findIssuesByLabels([typeLabel, versionLabel]);
      const userIssue = this._findIssueByLabel(issues, userLabel);

      if (userIssue) {
        const data = this._parseJSON(userIssue.body);
        return Array.isArray(data) ? data : [];
      }

      // Fallback: Try without version label (for version migration)
      const legacyIssues = await this._findIssuesByLabels([typeLabel]);
      const legacyIssue = this._findIssueByLabel(legacyIssues, userLabel);

      if (legacyIssue) {
        logger.debug(`Found issue without version label for user ${userId}`);
        const data = this._parseJSON(legacyIssue.body);
        return Array.isArray(data) ? data : [];
      }

      return [];
    } catch (error) {
      logger.error('Load error', { error });
      throw new Error(`Failed to load ${type} for user ${userId}: ${error.message}`);
    }
  }

  /**
   * Load public data from all users
   * Returns all items from all users with owner metadata
   */
  async loadPublic(type) {
    try {
      // Search for all issues with type label
      const typeLabel = type;
      const versionLabel = `data-version:${this.dataVersion}`;

      const issues = await this._findIssuesByLabels([typeLabel, versionLabel]);

      // Combine all items from all users
      const allItems = [];

      for (const issue of issues) {
        const data = this._parseJSON(issue.body);
        if (Array.isArray(data)) {
          // Extract userId and username from issue
          const userIdLabel = issue.labels.find(label => {
            const name = typeof label === 'string' ? label : label.name;
            return name.startsWith('user-id:');
          });

          const userId = userIdLabel
            ? (typeof userIdLabel === 'string' ? userIdLabel : userIdLabel.name).replace('user-id:', '')
            : null;

          // Extract username from issue title (format: "Username's TYPE")
          const username = issue.title.split("'s ")[0] || null;

          // Add owner metadata to each item
          const itemsWithOwner = data.map(item => ({
            ...item,
            userId,
            username
          }));

          allItems.push(...itemsWithOwner);
        }
      }

      return allItems;
    } catch (error) {
      logger.error('LoadPublic error', { error });
      throw new Error(`Failed to load public ${type}: ${error.message}`);
    }
  }

  /**
   * Save data to an issue
   * Creates or updates an issue with the provided data
   *
   * @param {string} type - Type label
   * @param {string} username - Username (for issue title)
   * @param {string|number} userId - User ID (for user-id label)
   * @param {Object} item - Single item to save (must have id field)
   * @returns {Promise<Array>} Updated full array after saving this item
   */
  async save(type, username, userId, item) {
    if (!item.id) {
      throw new Error('Item must have an id field');
    }

    // Create a unique key for this save operation
    const saveKey = `${type}:${userId}`;

    // Check if there's already a save in progress for this user+type
    if (this._pendingSaveRequests.has(saveKey)) {
      logger.debug(`Waiting for in-flight save request for ${saveKey}...`);
      // Wait for the in-flight request to complete, then retry
      try {
        await this._pendingSaveRequests.get(saveKey);
      } catch (error) {
        // Ignore errors from the previous request, we'll try again
      }
      // Clear the pending request and try again (the second request may have different data)
      this._pendingSaveRequests.delete(saveKey);
      return this.save(type, username, userId, item);
    }

    // Create a new save promise and track it
    const savePromise = (async () => {
      try {
        // Load existing items
        const items = await this.load(type, userId);

        // Find existing item
        const existingIndex = items.findIndex(i => i.id === item.id);

        if (existingIndex >= 0) {
          // Update existing
          items[existingIndex] = {
            ...item,
            updatedAt: new Date().toISOString(),
          };
        } else {
          // Add new (NO max items check - that's business logic)
          items.push({
            ...item,
            createdAt: item.createdAt || new Date().toISOString(),
            updatedAt: new Date().toISOString(),
          });
        }

        const issueBody = JSON.stringify(items, null, 2);

        // Find existing issue (with or without version label)
        const typeLabel = type;
        const userLabel = this._createUserLabel(userId);
        const versionLabel = `data-version:${this.dataVersion}`;

        // Try modern issues first (with version label) to avoid 100-issue limit
        let allIssues = await this._findIssuesByLabels([typeLabel, versionLabel]);
        let existingIssue = this._findIssueByLabel(allIssues, userLabel);

        // Fallback: search without version label for legacy issues
        if (!existingIssue) {
          allIssues = await this._findIssuesByLabels([typeLabel]);
          existingIssue = this._findIssueByLabel(allIssues, userLabel);
        }

        if (existingIssue) {
          // Update existing issue (add version label if missing)
          await this.octokit.rest.issues.update({
            owner: this.owner,
            repo: this.repo,
            issue_number: existingIssue.number,
            body: issueBody,
            labels: [typeLabel, userLabel, versionLabel],
          });

          logger.info(`Updated issue for ${username}`);
        } else {
          // Create new issue
          await this.octokit.rest.issues.create({
            owner: this.owner,
            repo: this.repo,
            title: `${type} - ${username}`, // Generic title format
            body: issueBody,
            labels: [typeLabel, userLabel, versionLabel],
          });

          logger.info(`Created issue for ${username}`);
        }

        return items;
      } catch (error) {
        logger.error('Save error', { error });
        throw new Error(`Failed to save ${type} for user ${userId}: ${error.message}`);
      } finally {
        // Clean up the pending request after a short delay to handle eventual consistency
        setTimeout(() => {
          this._pendingSaveRequests.delete(saveKey);
        }, 2000);
      }
    })();

    // Track this save request
    this._pendingSaveRequests.set(saveKey, savePromise);

    return savePromise;
  }

  /**
   * Delete an item from an issue
   */
  async delete(type, username, userId, deleteId) {
    try {
      // Load existing items
      const items = await this.load(type, userId);

      // Find and remove
      const itemIndex = items.findIndex(item => item.id === deleteId);
      if (itemIndex === -1) {
        throw new Error('Item not found');
      }

      items.splice(itemIndex, 1);

      // Find user's issue
      const typeLabel = type;
      const userLabel = this._createUserLabel(userId);
      const versionLabel = `data-version:${this.dataVersion}`;

      // Try modern issues first (with version label) to avoid 100-issue limit
      let allIssues = await this._findIssuesByLabels([typeLabel, versionLabel]);
      let existingIssue = this._findIssueByLabel(allIssues, userLabel);

      // Fallback: search without version label for legacy issues
      if (!existingIssue) {
        allIssues = await this._findIssuesByLabels([typeLabel]);
        existingIssue = this._findIssueByLabel(allIssues, userLabel);
      }

      if (!existingIssue) {
        throw new Error('Issue not found');
      }

      if (items.length === 0) {
        // Close empty issue
        await this.octokit.rest.issues.update({
          owner: this.owner,
          repo: this.repo,
          issue_number: existingIssue.number,
          state: 'closed',
        });

        logger.info(`Closed empty issue for ${username}`);
      } else {
        // Update issue with remaining items
        await this.octokit.rest.issues.update({
          owner: this.owner,
          repo: this.repo,
          issue_number: existingIssue.number,
          body: JSON.stringify(items, null, 2),
          labels: [typeLabel, userLabel, versionLabel],
        });

        logger.info(`Updated issue for ${username}`);
      }

      return items;
    } catch (error) {
      logger.error('Delete error', { error });
      throw new Error(`Failed to delete ${type} for user ${userId}: ${error.message}`);
    }
  }

  // ===== Comment-Based Storage (Generic) =====

  /**
   * Load items stored as comments on an issue
   * Identified by entity-id label (e.g., weapon-id:abc)
   * @param {string} entityId - Entity ID
   * @param {Object} config - Optional configuration
   * @param {string} config.typeLabel - Type label to narrow search (e.g., 'soul-weapon-grids')
   */
  async loadGridSubmissions(entityId, config = {}) {
    try {
      const entityLabel = this._createEntityLabel(entityId);
      const versionLabel = `data-version:${this.dataVersion}`;
      const typeLabel = config.typeLabel;

      // Find entity's issue - include typeLabel if provided to avoid 100-issue limit
      const searchLabels = typeLabel ? [typeLabel, versionLabel] : [versionLabel];
      const issues = await this._findIssuesByLabels(searchLabels);
      const entityIssue = this._findIssueByLabel(issues, entityLabel);

      if (!entityIssue) {
        return [];
      }

      // Get comments
      const { data: comments } = await this.octokit.rest.issues.listComments({
        owner: this.owner,
        repo: this.repo,
        issue_number: entityIssue.number,
        per_page: 100,
      });

      return comments.map(comment => this._parseJSON(comment.body)).filter(Boolean);
    } catch (error) {
      logger.error('Load comments error', { error });
      throw new Error(`Failed to load comments for entity ${entityId}: ${error.message}`);
    }
  }

  /**
   * Save item as a comment
   *
   * @param {string} username - Username
   * @param {string|number} userId - User ID
   * @param {string} entityId - Entity ID (e.g., weapon-id, character-id)
   * @param {Object} item - Item to save
   * @param {Object} config - Optional configuration for entity-specific storage
   * @param {string} config.typeLabel - Type label (e.g., 'grid-submissions')
   * @param {string} config.titlePrefix - Title prefix (e.g., '[Grid]')
   * @param {string} config.entityType - Entity type name (e.g., 'weapon', 'character')
   */
  async saveGridSubmission(username, userId, entityId, item, config = {}) {
    if (!item.id) {
      throw new Error('Item must have an id field');
    }

    try {
      // Use provided config or defaults
      const typeLabel = config.typeLabel || 'grid-submissions';
      const titlePrefix = config.titlePrefix || '[Grid]';
      const entityType = config.entityType || 'entity';

      const entityLabel = this._createEntityLabel(entityId);
      const versionLabel = `data-version:${this.dataVersion}`;

      // Find entity's issue - search with typeLabel and versionLabel to avoid hitting the 100-issue limit
      const allIssues = await this._findIssuesByLabels([typeLabel, versionLabel]);
      let entityIssue = this._findIssueByLabel(allIssues, entityLabel);

      if (!entityIssue) {
        // Create entity issue
        const { data: newIssue } = await this.octokit.rest.issues.create({
          owner: this.owner,
          repo: this.repo,
          title: `${titlePrefix} ${entityType}-${entityId}`,
          body: `Storage for ${entityType} grid submissions: ${entityId}`,
          labels: [entityLabel, versionLabel, typeLabel],
        });
        entityIssue = newIssue;

        logger.info(`Created entity issue for ${entityId}`);
      }

      const submissionData = {
        ...item,
        username,
        userId,
        entityId,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Get existing comments
      const { data: comments } = await this.octokit.rest.issues.listComments({
        owner: this.owner,
        repo: this.repo,
        issue_number: entityIssue.number,
        per_page: 100,
      });

      // Find user's comment
      const userComment = comments.find(comment => {
        const data = this._parseJSON(comment.body);
        return data && data.userId === userId && data.id === item.id;
      });

      if (userComment) {
        // Update existing comment
        await this.octokit.rest.issues.updateComment({
          owner: this.owner,
          repo: this.repo,
          comment_id: userComment.id,
          body: JSON.stringify(submissionData, null, 2),
        });

        logger.info(`Updated comment for ${username} on entity ${entityId}`);
      } else {
        // Create new comment
        await this.octokit.rest.issues.createComment({
          owner: this.owner,
          repo: this.repo,
          issue_number: entityIssue.number,
          body: JSON.stringify(submissionData, null, 2),
        });

        logger.info(`Created comment for ${username} on entity ${entityId}`);
      }

      return submissionData;
    } catch (error) {
      logger.error('Save comment error', { error });
      throw new Error(`Failed to save comment for entity ${entityId}: ${error.message}`);
    }
  }

  // ===== Versioning =====

  async getVersion(type) {
    return this.dataVersion;
  }

  async migrateVersion(type, userId, fromVersion, toVersion, transformer) {
    // TODO: Implement version migration
    throw new Error('Version migration not yet implemented for GitHubStorage');
  }

  // ===== Email Verification =====

  /**
   * Get or create the [Email Verification] issue
   * @private
   */
  async _getOrCreateVerificationIssue() {
    // Check if there's already a request in-flight
    if (this._pendingVerificationIssueRequest) {
      logger.debug('Waiting for in-flight verification issue request...');
      return this._pendingVerificationIssueRequest;
    }

    // Start a new request and track it
    this._pendingVerificationIssueRequest = (async () => {
      try {
        const issueTitle = '[Email Verification]';
        const issues = await this._findIssuesByLabels(['email-verification']);
        let verificationIssue = issues.find(issue => issue.title === issueTitle);

        if (!verificationIssue) {
          logger.debug('Creating email verification issue...');
          const initialBody = `# Email Verification Codes

This issue stores email verification codes as comments. Each comment is automatically purged after expiration.

## Index
\`\`\`json
{}
\`\`\`

⚠️ **This issue is managed by the wiki bot.**

🤖 *Automated verification system*`;

          const { data: newIssue } = await this.octokit.rest.issues.create({
            owner: this.owner,
            repo: this.repo,
            title: issueTitle,
            body: initialBody,
            labels: ['email-verification', 'automated'],
          });

          // Lock the issue
          try {
            await this.octokit.rest.issues.lock({
              owner: this.owner,
              repo: this.repo,
              issue_number: newIssue.number,
              lock_reason: 'off-topic',
            });
          } catch (lockError) {
            logger.warn('Failed to lock verification issue', { error: lockError.message });
          }

          verificationIssue = newIssue;
        }

        return verificationIssue;
      } catch (error) {
        logger.error('Error getting/creating verification issue', { error });
        throw error;
      } finally {
        // Keep in-flight entry for 5 seconds after completion to prevent race conditions during GitHub's eventual consistency
        setTimeout(() => {
          this._pendingVerificationIssueRequest = null;
        }, 5000);
      }
    })();

    return this._pendingVerificationIssueRequest;
  }

  /**
   * Parse index map from verification issue body
   * @private
   */
  _parseIndexMap(issueBody) {
    try {
      const match = issueBody.match(/```json\n([\s\S]*?)\n```/);
      if (match) {
        return JSON.parse(match[1]);
      }
    } catch (error) {
      logger.warn('Failed to parse index map', { error: error.message });
    }
    return {};
  }

  /**
   * Update index map in verification issue body
   * @private
   */
  async _updateIndexMap(issueNumber, issueBody, indexMap) {
    const updatedBody = issueBody.replace(
      /```json\n[\s\S]*?\n```/,
      `\`\`\`json\n${JSON.stringify(indexMap, null, 2)}\n\`\`\``
    );

    await this.octokit.rest.issues.update({
      owner: this.owner,
      repo: this.repo,
      issue_number: issueNumber,
      body: updatedBody,
    });
  }

  async storeVerificationCode(emailHash, encryptedCode, expiresAt) {
    try {
      const verificationIssue = await this._getOrCreateVerificationIssue();

      // Parse index map
      const indexMap = this._parseIndexMap(verificationIssue.body);

      // Create comment with verification data
      const commentBody = JSON.stringify({
        emailHash,
        code: encryptedCode,
        timestamp: Date.now(),
        expiresAt,
      }, null, 2);

      const { data: comment } = await this.octokit.rest.issues.createComment({
        owner: this.owner,
        repo: this.repo,
        issue_number: verificationIssue.number,
        body: commentBody,
      });

      // Update index map
      indexMap[emailHash] = comment.id;
      await this._updateIndexMap(verificationIssue.number, verificationIssue.body, indexMap);

      logger.debug(`Stored verification code for ${emailHash.substring(0, 8)}...`);
    } catch (error) {
      logger.error('Store verification code error', { error });
      throw new Error(`Failed to store verification code: ${error.message}`);
    }
  }

  async getVerificationCode(emailHash) {
    try {
      const verificationIssue = await this._getOrCreateVerificationIssue();

      // Parse index map for O(1) lookup
      const indexMap = this._parseIndexMap(verificationIssue.body);
      const commentId = indexMap[emailHash];

      if (!commentId) {
        return null; // Not found
      }

      // Fetch the specific comment
      let comment;
      try {
        const { data } = await this.octokit.rest.issues.getComment({
          owner: this.owner,
          repo: this.repo,
          comment_id: commentId,
        });
        comment = data;
      } catch (error) {
        // Comment not found or deleted
        return null;
      }

      const storedData = this._parseJSON(comment.body);
      if (!storedData) {
        return null;
      }

      // Check expiration
      if (Date.now() > storedData.expiresAt) {
        // Delete expired comment
        await this.deleteVerificationCode(emailHash);
        return null;
      }

      return storedData;
    } catch (error) {
      logger.error('Get verification code error', { error });
      throw new Error(`Failed to get verification code: ${error.message}`);
    }
  }

  async deleteVerificationCode(emailHash) {
    try {
      const verificationIssue = await this._getOrCreateVerificationIssue();

      // Parse index map
      const indexMap = this._parseIndexMap(verificationIssue.body);
      const commentId = indexMap[emailHash];

      if (!commentId) {
        return; // Nothing to delete
      }

      // Delete comment
      try {
        await this.octokit.rest.issues.deleteComment({
          owner: this.owner,
          repo: this.repo,
          comment_id: commentId,
        });
      } catch (error) {
        logger.warn('Failed to delete comment', { error: error.message });
      }

      // Remove from index map
      delete indexMap[emailHash];
      await this._updateIndexMap(verificationIssue.number, verificationIssue.body, indexMap);

      logger.debug(`Deleted verification code for ${emailHash.substring(0, 8)}...`);
    } catch (error) {
      logger.error('Delete verification code error', { error });
      throw new Error(`Failed to delete verification code: ${error.message}`);
    }
  }

  // ===== Health Check =====

  async healthCheck() {
    try {
      await this.octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo,
      });
      return true;
    } catch (error) {
      logger.error('Health check failed', { error });
      return false;
    }
  }
}

export default GitHubStorage;
