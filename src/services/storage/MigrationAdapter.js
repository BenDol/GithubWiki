/**
 * Migration Adapter
 *
 * Wraps two storage backends to enable gradual, zero-downtime migration:
 * - Source: Old storage backend (e.g., GitHub Issues)
 * - Target: New storage backend (e.g., Cloudflare KV)
 *
 * Migration Modes:
 *
 * 1. Read-through Cache Mode (Gradual Migration):
 *    - Reads: Check target first → fallback to source → cache in target
 *    - Writes: Write to target → optionally write to source (dual-write)
 *    - Deletes: Delete from target → optionally delete from source
 *    - Safe to run indefinitely
 *    - Data migrates automatically as users access it
 *
 * 2. Cutover Mode (Post-Migration):
 *    - All operations only use target backend
 *    - Source backend is completely ignored
 *    - Use after bulk migration complete
 *
 * Benefits:
 * - Zero downtime migration
 * - Gradual data transfer
 * - Easy rollback (just switch config)
 * - Data consistency during migration
 */

import StorageAdapter from './StorageAdapter.js';

class MigrationAdapter extends StorageAdapter {
  /**
   * Create a migration adapter
   * @param {Object} config
   * @param {StorageAdapter} config.sourceAdapter - Source storage backend
   * @param {StorageAdapter} config.targetAdapter - Target storage backend
   * @param {string} config.mode - Migration mode: "read-through" or "cutover"
   */
  constructor(config) {
    super(config);

    if (!config.sourceAdapter) {
      throw new Error('MigrationAdapter requires sourceAdapter');
    }
    if (!config.targetAdapter) {
      throw new Error('MigrationAdapter requires targetAdapter');
    }

    this.sourceAdapter = config.sourceAdapter;
    this.targetAdapter = config.targetAdapter;
    this.mode = config.mode || 'read-through';

    if (this.mode !== 'read-through' && this.mode !== 'cutover') {
      throw new Error(`Invalid migration mode: ${this.mode}. Must be "read-through" or "cutover"`);
    }

    console.log(`[MigrationAdapter] Initialized in ${this.mode} mode`);
  }

  // ===== User-Centric Operations =====

  async load(type, userId) {
    if (this.mode === 'cutover') {
      // Cutover mode: Only use target
      return this.targetAdapter.load(type, userId);
    }

    // Read-through mode: Try target first, fallback to source
    try {
      const targetData = await this.targetAdapter.load(type, userId);

      if (targetData && targetData.length > 0) {
        // Found in target, return it
        return targetData;
      }

      // Not in target, try source
      console.log(`[MigrationAdapter] Data not in target, checking source for ${type} user ${userId}`);

      const sourceData = await this.sourceAdapter.load(type, userId);

      if (sourceData && sourceData.length > 0) {
        // Found in source, migrate to target
        console.log(`[MigrationAdapter] Migrating ${sourceData.length} item(s) from source to target for ${type} user ${userId}`);

        try {
          // Cache each item to target
          for (const item of sourceData) {
            await this.targetAdapter.save(type, item.username || 'unknown', userId, item);
          }

          console.log(`[MigrationAdapter] Successfully migrated ${type} for user ${userId}`);
        } catch (error) {
          console.error('[MigrationAdapter] Failed to cache to target during read-through:', error);
          // Still return source data even if caching fails
        }

        return sourceData;
      }

      // Not found in either backend
      return [];
    } catch (error) {
      console.error('[MigrationAdapter] Load error:', error);
      throw error;
    }
  }

  async save(type, username, userId, item) {
    if (this.mode === 'cutover') {
      // Cutover mode: Only use target
      return this.targetAdapter.save(type, username, userId, item);
    }

    // Read-through mode: Write to target, optionally write to source (dual-write)
    try {
      // Primary write to target
      const result = await this.targetAdapter.save(type, username, userId, item);

      // Dual-write to source (best effort)
      try {
        await this.sourceAdapter.save(type, username, userId, item);
        console.log(`[MigrationAdapter] Dual-write successful for ${type} user ${userId}`);
      } catch (error) {
        console.warn('[MigrationAdapter] Dual-write to source failed (continuing):', error);
        // Continue anyway, target is the primary
      }

      return result;
    } catch (error) {
      console.error('[MigrationAdapter] Save error:', error);
      throw error;
    }
  }

  async delete(type, username, userId, deleteId) {
    if (this.mode === 'cutover') {
      // Cutover mode: Only use target
      return this.targetAdapter.delete(type, username, userId, deleteId);
    }

    // Read-through mode: Delete from target, optionally delete from source
    try {
      // Primary delete from target
      const result = await this.targetAdapter.delete(type, username, userId, deleteId);

      // Dual-delete from source (best effort)
      try {
        await this.sourceAdapter.delete(type, username, userId, deleteId);
        console.log(`[MigrationAdapter] Dual-delete successful for ${type} user ${userId}`);
      } catch (error) {
        console.warn('[MigrationAdapter] Dual-delete from source failed (continuing):', error);
        // Continue anyway, target is the primary
      }

      return result;
    } catch (error) {
      console.error('[MigrationAdapter] Delete error:', error);
      throw error;
    }
  }

  // ===== Weapon-Centric Operations =====

  async loadGridSubmissions(weaponId) {
    if (this.mode === 'cutover') {
      // Cutover mode: Only use target
      return this.targetAdapter.loadGridSubmissions(weaponId);
    }

    // Read-through mode: Try target first, fallback to source
    try {
      const targetData = await this.targetAdapter.loadGridSubmissions(weaponId);

      if (targetData && targetData.length > 0) {
        // Found in target
        return targetData;
      }

      // Not in target, try source
      console.log(`[MigrationAdapter] Grid submissions not in target, checking source for weapon ${weaponId}`);

      const sourceData = await this.sourceAdapter.loadGridSubmissions(weaponId);

      if (sourceData && sourceData.length > 0) {
        // Found in source, migrate to target
        console.log(`[MigrationAdapter] Migrating ${sourceData.length} grid submission(s) from source to target for weapon ${weaponId}`);

        try {
          // Cache each submission to target
          for (const submission of sourceData) {
            await this.targetAdapter.saveGridSubmission(
              submission.username,
              submission.userId,
              weaponId,
              submission
            );
          }

          console.log(`[MigrationAdapter] Successfully migrated grid submissions for weapon ${weaponId}`);
        } catch (error) {
          console.error('[MigrationAdapter] Failed to cache grid submissions to target:', error);
          // Still return source data even if caching fails
        }

        return sourceData;
      }

      // Not found in either backend
      return [];
    } catch (error) {
      console.error('[MigrationAdapter] Load grid submissions error:', error);
      throw error;
    }
  }

  async saveGridSubmission(username, userId, weaponId, item) {
    if (this.mode === 'cutover') {
      // Cutover mode: Only use target
      return this.targetAdapter.saveGridSubmission(username, userId, weaponId, item);
    }

    // Read-through mode: Write to target, optionally write to source
    try {
      // Primary write to target
      const result = await this.targetAdapter.saveGridSubmission(username, userId, weaponId, item);

      // Dual-write to source (best effort)
      try {
        await this.sourceAdapter.saveGridSubmission(username, userId, weaponId, item);
        console.log(`[MigrationAdapter] Dual-write grid submission successful for weapon ${weaponId}`);
      } catch (error) {
        console.warn('[MigrationAdapter] Dual-write grid submission to source failed (continuing):', error);
        // Continue anyway, target is the primary
      }

      return result;
    } catch (error) {
      console.error('[MigrationAdapter] Save grid submission error:', error);
      throw error;
    }
  }

  // ===== Versioning =====

  async getVersion(type) {
    // Use target adapter's version
    return this.targetAdapter.getVersion(type);
  }

  async migrateVersion(type, userId, fromVersion, toVersion, transformer) {
    // Migrate on target adapter
    return this.targetAdapter.migrateVersion(type, userId, fromVersion, toVersion, transformer);
  }

  // ===== Health Check =====

  async healthCheck() {
    if (this.mode === 'cutover') {
      // Cutover mode: Only check target
      return this.targetAdapter.healthCheck();
    }

    // Read-through mode: Both backends should be healthy
    try {
      const [targetHealthy, sourceHealthy] = await Promise.all([
        this.targetAdapter.healthCheck(),
        this.sourceAdapter.healthCheck(),
      ]);

      if (!targetHealthy) {
        console.error('[MigrationAdapter] Target backend is unhealthy!');
        return false;
      }

      if (!sourceHealthy) {
        console.warn('[MigrationAdapter] Source backend is unhealthy (fallback unavailable)');
        // Target is still healthy, so we can continue
        return true;
      }

      return true;
    } catch (error) {
      console.error('[MigrationAdapter] Health check error:', error);
      return false;
    }
  }

  // ===== Migration Utilities =====

  /**
   * Get migration statistics
   * @returns {Object} Migration stats
   */
  getMigrationStats() {
    return {
      mode: this.mode,
      sourceBackend: this.sourceAdapter.constructor.name,
      targetBackend: this.targetAdapter.constructor.name,
    };
  }

  /**
   * Switch migration mode
   * @param {string} newMode - "read-through" or "cutover"
   */
  setMode(newMode) {
    if (newMode !== 'read-through' && newMode !== 'cutover') {
      throw new Error(`Invalid migration mode: ${newMode}`);
    }

    console.log(`[MigrationAdapter] Switching mode from ${this.mode} to ${newMode}`);
    this.mode = newMode;
  }
}

export default MigrationAdapter;
