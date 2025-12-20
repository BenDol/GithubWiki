/**
 * Storage Adapter - Abstract Base Class
 *
 * Defines the interface that all storage backends must implement.
 * This abstraction allows the wiki to support multiple persistence layers
 * (GitHub Issues/Comments, Cloudflare KV, Netlify Blobs, databases, etc.)
 * without changing application code.
 *
 * Key Concepts:
 * - User-centric data: Stored per user (skill-builds, loadouts, spirits)
 * - Weapon-centric data: Stored per weapon (grid submissions)
 * - Versioning: Data models can evolve with version labels/keys
 * - Migration: Adapters can migrate data between versions or backends
 *
 * @abstract
 */
class StorageAdapter {
  /**
   * Create a storage adapter
   * @param {Object} config - Adapter configuration
   */
  constructor(config) {
    if (new.target === StorageAdapter) {
      throw new TypeError('Cannot instantiate abstract class StorageAdapter directly');
    }
    this.config = config;
  }

  // ===== User-Centric Data Operations =====

  /**
   * Load all items of a type for a user
   *
   * @param {string} type - Data type (e.g., 'skill-builds', 'battle-loadouts')
   * @param {string|number} userId - User ID
   * @returns {Promise<Array<Object>>} Array of items
   * @throws {Error} If type is unknown or operation fails
   *
   * @example
   * const builds = await storage.load('skill-builds', 123456);
   * // Returns: [{ id: '...', name: 'Boss Build', slots: [...], ... }]
   */
  async load(type, userId) {
    throw new Error('load() must be implemented by subclass');
  }

  /**
   * Save (create or update) an item for a user
   *
   * If item.id exists in storage, updates it.
   * If item.id is new, creates it (subject to max items limit).
   *
   * @param {string} type - Data type
   * @param {string} username - Username (for display/logging)
   * @param {string|number} userId - User ID
   * @param {Object} item - Item to save (must have id field)
   * @returns {Promise<Array<Object>>} Updated array of all items
   * @throws {Error} If max items exceeded, validation fails, or operation fails
   *
   * @example
   * const builds = await storage.save('skill-builds', 'player123', 456, {
   *   id: 'build-12345',
   *   name: 'Boss Build',
   *   slots: [...]
   * });
   */
  async save(type, username, userId, item) {
    throw new Error('save() must be implemented by subclass');
  }

  /**
   * Delete a specific item for a user
   *
   * @param {string} type - Data type
   * @param {string} username - Username (for logging)
   * @param {string|number} userId - User ID
   * @param {string} deleteId - Item ID to delete
   * @returns {Promise<Array<Object>>} Updated array of remaining items
   * @throws {Error} If item not found or operation fails
   *
   * @example
   * const builds = await storage.delete('skill-builds', 'player123', 456, 'build-12345');
   */
  async delete(type, username, userId, deleteId) {
    throw new Error('delete() must be implemented by subclass');
  }

  // ===== Weapon-Centric Data Operations =====

  /**
   * Load all grid submissions for a weapon
   *
   * Grid submissions are weapon-centric (not user-centric).
   * Multiple users can submit grids for the same weapon.
   *
   * @param {string} weaponId - Weapon ID
   * @returns {Promise<Array<Object>>} Array of grid submissions
   * @throws {Error} If operation fails
   *
   * @example
   * const submissions = await storage.loadGridSubmissions('soulWeapon42');
   * // Returns: [{ weaponId: '...', userId: 123, username: '...', grid: {...}, ... }]
   */
  async loadGridSubmissions(weaponId) {
    throw new Error('loadGridSubmissions() must be implemented by subclass');
  }

  /**
   * Save a grid submission for a weapon
   *
   * If the same user+item.id exists, updates it.
   * Otherwise creates a new submission.
   *
   * @param {string} username - Username (for attribution)
   * @param {string|number} userId - User ID
   * @param {string} weaponId - Weapon ID
   * @param {Object} item - Grid submission data
   * @returns {Promise<Object>} Saved submission
   * @throws {Error} If validation fails or operation fails
   *
   * @example
   * const submission = await storage.saveGridSubmission(
   *   'player123', 456, 'soulWeapon42',
   *   { id: 'grid-1', gridType: '4x4', activeSlots: [...], ... }
   * );
   */
  async saveGridSubmission(username, userId, weaponId, item) {
    throw new Error('saveGridSubmission() must be implemented by subclass');
  }

  // ===== Versioning Support =====

  /**
   * Get the current data version for a type
   *
   * Versions allow data model evolution without breaking changes.
   * Example: v1 might use simple arrays, v2 might add metadata fields.
   *
   * @param {string} type - Data type
   * @returns {Promise<string>} Version string (e.g., "v1", "v2")
   *
   * @example
   * const version = await storage.getVersion('skill-builds');
   * // Returns: "v1"
   */
  async getVersion(type) {
    throw new Error('getVersion() must be implemented by subclass');
  }

  /**
   * Migrate data from one version to another
   *
   * @param {string} type - Data type
   * @param {string|number} userId - User ID
   * @param {string} fromVersion - Source version (e.g., "v1")
   * @param {string} toVersion - Target version (e.g., "v2")
   * @param {Function} transformer - Migration function (oldData => newData)
   * @returns {Promise<boolean>} Success status
   * @throws {Error} If migration fails
   *
   * @example
   * const success = await storage.migrateVersion(
   *   'skill-builds', 456, 'v1', 'v2',
   *   (v1Data) => ({ ...v1Data, newField: 'default' })
   * );
   */
  async migrateVersion(type, userId, fromVersion, toVersion, transformer) {
    throw new Error('migrateVersion() must be implemented by subclass');
  }

  // ===== Email Verification =====

  /**
   * Store an email verification code with expiration
   *
   * @param {string} emailHash - Hashed email address (for privacy)
   * @param {string} encryptedCode - Encrypted verification code
   * @param {number} expiresAt - Expiration timestamp (milliseconds since epoch)
   * @returns {Promise<void>}
   * @throws {Error} If storage fails
   *
   * @example
   * await storage.storeVerificationCode(
   *   'abc123...',
   *   'encrypted-code',
   *   Date.now() + 10 * 60 * 1000
   * );
   */
  async storeVerificationCode(emailHash, encryptedCode, expiresAt) {
    throw new Error('storeVerificationCode() must be implemented by subclass');
  }

  /**
   * Retrieve an email verification code
   *
   * Returns null if not found or expired.
   * Automatically deletes expired codes.
   *
   * @param {string} emailHash - Hashed email address
   * @returns {Promise<{code: string, expiresAt: number, timestamp: number}|null>}
   *
   * @example
   * const data = await storage.getVerificationCode('abc123...');
   * if (data && data.code === decryptedUserInput) {
   *   // Code is valid
   * }
   */
  async getVerificationCode(emailHash) {
    throw new Error('getVerificationCode() must be implemented by subclass');
  }

  /**
   * Delete an email verification code
   *
   * Called after successful verification or expiration.
   *
   * @param {string} emailHash - Hashed email address
   * @returns {Promise<void>}
   *
   * @example
   * await storage.deleteVerificationCode('abc123...');
   */
  async deleteVerificationCode(emailHash) {
    throw new Error('deleteVerificationCode() must be implemented by subclass');
  }

  // ===== Health Check =====

  /**
   * Check if the storage backend is available and accessible
   *
   * Useful for monitoring, health checks, and graceful degradation.
   *
   * @returns {Promise<boolean>} True if backend is healthy
   *
   * @example
   * if (await storage.healthCheck()) {
   *   console.log('Storage backend is operational');
   * } else {
   *   console.error('Storage backend is down!');
   * }
   */
  async healthCheck() {
    throw new Error('healthCheck() must be implemented by subclass');
  }
}

export default StorageAdapter;

