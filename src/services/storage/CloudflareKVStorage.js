/**
 * Cloudflare KV Storage Adapter
 *
 * Generic storage implementation using Cloudflare Workers KV.
 * This adapter is framework-level and contains NO wiki-specific business logic.
 *
 * Key Structure:
 * - Generic format: `${prefix}:${scope}:${id}:${type}:${version}`
 * - Example: "myapp:user:123456:builds:v1"
 *
 * The parent project defines:
 * - What types to use
 * - What data structure to store
 * - Business logic (max items, validation, etc.)
 */

import StorageAdapter from './StorageAdapter.js';

class CloudflareKVStorage extends StorageAdapter {
  /**
   * Create a Cloudflare KV storage adapter
   * @param {Object} config
   * @param {Object} config.namespace - KV namespace binding
   * @param {string} config.version - Data version (default: "v1")
   * @param {string} config.keyPrefix - Key prefix (default: "app")
   */
  constructor(config) {
    super(config);

    if (!config.namespace) {
      throw new Error('CloudflareKVStorage requires namespace binding');
    }

    this.namespace = config.namespace;
    this.dataVersion = config.version || 'v1';
    this.keyPrefix = config.keyPrefix || 'app';
  }

  /**
   * Generate KV key for user data
   * Format: ${prefix}:user:${userId}:${type}:${version}
   * @private
   */
  _getUserKey(type, userId) {
    return `${this.keyPrefix}:user:${userId}:${type}:${this.dataVersion}`;
  }

  /**
   * Generate KV key for entity data
   * Format: ${prefix}:entity:${entityId}:${type}:${version}
   * @private
   */
  _getEntityKey(entityId, type = 'data') {
    return `${this.keyPrefix}:entity:${entityId}:${type}:${this.dataVersion}`;
  }

  // ===== Generic CRUD Operations =====

  async load(type, userId) {
    try {
      const key = this._getUserKey(type, userId);
      const data = await this.namespace.get(key, { type: 'json' });

      if (!data) {
        return [];
      }

      if (!Array.isArray(data)) {
        console.warn(`[CloudflareKVStorage] Data for key ${key} is not an array`);
        return [];
      }

      return data;
    } catch (error) {
      console.error('[CloudflareKVStorage] Load error:', error);
      throw new Error(`Failed to load ${type} for user ${userId}: ${error.message}`);
    }
  }

  async save(type, username, userId, item) {
    if (!item.id) {
      throw new Error('Item must have an id field');
    }

    try {
      // Get existing items
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

      const key = this._getUserKey(type, userId);
      await this.namespace.put(key, JSON.stringify(items));

      console.log(`[CloudflareKVStorage] Saved ${type} for user ${userId}`);

      return items;
    } catch (error) {
      console.error('[CloudflareKVStorage] Save error:', error);
      throw new Error(`Failed to save ${type} for user ${userId}: ${error.message}`);
    }
  }

  async delete(type, username, userId, deleteId) {
    try {
      // Get existing items
      const items = await this.load(type, userId);

      // Find and remove
      const itemIndex = items.findIndex(item => item.id === deleteId);
      if (itemIndex === -1) {
        throw new Error('Item not found');
      }

      items.splice(itemIndex, 1);

      const key = this._getUserKey(type, userId);

      if (items.length === 0) {
        // Delete key if empty
        await this.namespace.delete(key);
        console.log(`[CloudflareKVStorage] Deleted empty key for user ${userId}`);
      } else {
        // Update key with remaining items
        await this.namespace.put(key, JSON.stringify(items));
        console.log(`[CloudflareKVStorage] Updated ${type} for user ${userId}`);
      }

      return items;
    } catch (error) {
      console.error('[CloudflareKVStorage] Delete error:', error);
      throw new Error(`Failed to delete ${type} for user ${userId}: ${error.message}`);
    }
  }

  // ===== Entity-Centric Operations =====

  async loadGridSubmissions(entityId) {
    try {
      const key = this._getEntityKey(entityId, 'submissions');
      const data = await this.namespace.get(key, { type: 'json' });

      if (!data) {
        return [];
      }

      if (!Array.isArray(data)) {
        console.warn(`[CloudflareKVStorage] Entity data for ${entityId} is not an array`);
        return [];
      }

      return data;
    } catch (error) {
      console.error('[CloudflareKVStorage] Load entity error:', error);
      throw new Error(`Failed to load submissions for entity ${entityId}: ${error.message}`);
    }
  }

  async saveGridSubmission(username, userId, entityId, item) {
    if (!item.id) {
      throw new Error('Item must have an id field');
    }

    try {
      const submissions = await this.loadGridSubmissions(entityId);

      const submissionData = {
        ...item,
        username,
        userId,
        entityId,
        createdAt: item.createdAt || new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      // Find existing submission
      const existingIndex = submissions.findIndex(
        s => s.userId === userId && s.id === item.id
      );

      if (existingIndex >= 0) {
        // Update existing
        submissions[existingIndex] = submissionData;
      } else {
        // Add new
        submissions.push(submissionData);
      }

      const key = this._getEntityKey(entityId, 'submissions');
      await this.namespace.put(key, JSON.stringify(submissions));

      console.log(`[CloudflareKVStorage] Saved submission for user ${userId} on entity ${entityId}`);

      return submissionData;
    } catch (error) {
      console.error('[CloudflareKVStorage] Save submission error:', error);
      throw new Error(`Failed to save submission for entity ${entityId}: ${error.message}`);
    }
  }

  // ===== Versioning =====

  async getVersion(type) {
    return this.dataVersion;
  }

  async migrateVersion(type, userId, fromVersion, toVersion, transformer) {
    try {
      // Generate old and new keys
      const oldKey = `${this.keyPrefix}:user:${userId}:${type}:${fromVersion}`;
      const newKey = `${this.keyPrefix}:user:${userId}:${type}:${toVersion}`;

      // Load old data
      const oldData = await this.namespace.get(oldKey, { type: 'json' });

      if (!oldData) {
        console.log(`[CloudflareKVStorage] No data to migrate for user ${userId} (${type} ${fromVersion} → ${toVersion})`);
        return false;
      }

      // Transform data
      const newData = transformer(oldData);

      // Save new version
      await this.namespace.put(newKey, JSON.stringify(newData));

      // Delete old version
      await this.namespace.delete(oldKey);

      console.log(`[CloudflareKVStorage] Migrated ${type} for user ${userId} from ${fromVersion} to ${toVersion}`);

      return true;
    } catch (error) {
      console.error('[CloudflareKVStorage] Migration error:', error);
      throw new Error(`Failed to migrate ${type} for user ${userId}: ${error.message}`);
    }
  }

  // ===== Email Verification =====

  /**
   * Generate KV key for email verification
   * Format: ${prefix}:verification:${emailHash}
   * @private
   */
  _getVerificationKey(emailHash) {
    return `${this.keyPrefix}:verification:${emailHash}`;
  }

  async storeVerificationCode(emailHash, encryptedCode, expiresAt) {
    try {
      const key = this._getVerificationKey(emailHash);
      const data = {
        code: encryptedCode,
        timestamp: Date.now(),
        expiresAt,
      };

      // Calculate TTL in seconds (KV expects seconds, not milliseconds)
      const ttlSeconds = Math.ceil((expiresAt - Date.now()) / 1000);

      // Store with automatic expiration
      await this.namespace.put(key, JSON.stringify(data), {
        expirationTtl: ttlSeconds, // Auto-expire after TTL
      });

      console.log(`[CloudflareKVStorage] Stored verification code with ${ttlSeconds}s TTL`);
    } catch (error) {
      console.error('[CloudflareKVStorage] Store verification code error:', error);
      throw new Error(`Failed to store verification code: ${error.message}`);
    }
  }

  async getVerificationCode(emailHash) {
    try {
      const key = this._getVerificationKey(emailHash);
      const data = await this.namespace.get(key, { type: 'json' });

      if (!data) {
        return null; // Not found or expired (KV auto-deleted it)
      }

      // Double-check expiration (KV TTL should handle this, but be safe)
      if (Date.now() > data.expiresAt) {
        await this.namespace.delete(key);
        return null;
      }

      return data;
    } catch (error) {
      console.error('[CloudflareKVStorage] Get verification code error:', error);
      throw new Error(`Failed to get verification code: ${error.message}`);
    }
  }

  async deleteVerificationCode(emailHash) {
    try {
      const key = this._getVerificationKey(emailHash);
      await this.namespace.delete(key);

      console.log(`[CloudflareKVStorage] Deleted verification code for ${emailHash.substring(0, 8)}...`);
    } catch (error) {
      console.error('[CloudflareKVStorage] Delete verification code error:', error);
      throw new Error(`Failed to delete verification code: ${error.message}`);
    }
  }

  // ===== Health Check =====

  async healthCheck() {
    try {
      // Try to read a test key
      await this.namespace.get('__health_check__');
      return true;
    } catch (error) {
      console.error('[CloudflareKVStorage] Health check failed:', error);
      return false;
    }
  }

  // ===== Utility Methods =====

  /**
   * List all keys with a prefix (useful for debugging/admin)
   * @param {string} prefix - Key prefix to search
   * @returns {Promise<Array<string>>} List of keys
   */
  async listKeys(prefix = null) {
    try {
      const searchPrefix = prefix || this.keyPrefix;
      const { keys } = await this.namespace.list({ prefix: searchPrefix });
      return keys.map(k => k.name);
    } catch (error) {
      console.error('[CloudflareKVStorage] List keys error:', error);
      return [];
    }
  }

  /**
   * Delete all data for a user (useful for GDPR compliance)
   * @param {string|number} userId - User ID
   * @returns {Promise<number>} Number of keys deleted
   */
  async deleteAllUserData(userId) {
    try {
      const prefix = `${this.keyPrefix}:user:${userId}:`;
      const { keys } = await this.namespace.list({ prefix });

      let deleted = 0;
      for (const key of keys) {
        await this.namespace.delete(key.name);
        deleted++;
      }

      console.log(`[CloudflareKVStorage] Deleted ${deleted} keys for user ${userId}`);

      return deleted;
    } catch (error) {
      console.error('[CloudflareKVStorage] Delete all user data error:', error);
      throw new Error(`Failed to delete all data for user ${userId}: ${error.message}`);
    }
  }
}

export default CloudflareKVStorage;
