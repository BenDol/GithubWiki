/**
 * Generic Entity Service
 *
 * Provides CRUD operations for any entity type registered in the entityTypeRegistry.
 * This replaces game-specific services (skillBuilds.js, battleLoadouts.js) with a
 * generic service that can handle any entity type.
 *
 * @example
 * // Parent project usage
 * import { EntityService } from 'github-wiki-framework';
 * import { entityTypeRegistry } from 'github-wiki-framework';
 *
 * // Register entity type first
 * entityTypeRegistry.registerType('skill-build', {
 *   label: 'Skill Build',
 *   pluralLabel: 'Skill Builds',
 *   fields: ['name', 'slots', 'maxSlots'],
 *   validation: skillBuildSchema
 * });
 *
 * // Create service
 * const skillBuildService = new EntityService('skill-build');
 *
 * // Use service
 * await skillBuildService.create({ name: 'My Build', slots: [...] });
 * const builds = await skillBuildService.list();
 * await skillBuildService.update(id, { name: 'Updated Build' });
 * await skillBuildService.delete(id);
 */

import { entityTypeRegistry } from '../../utils/entityTypeRegistry.js';

export class EntityService {
  /**
   * Create a new EntityService for a specific entity type
   * @param {string} entityType - The entity type name (must be registered)
   * @param {Object} [options={}] - Additional service options
   * @param {Object} [options.octokit] - Octokit instance for GitHub API calls
   * @param {Object} [options.config] - Configuration options
   */
  constructor(entityType, options = {}) {
    if (!entityType || typeof entityType !== 'string') {
      throw new Error('[EntityService] Entity type must be a non-empty string');
    }

    this.entityType = entityType;
    this.config = entityTypeRegistry.getType(entityType);

    if (!this.config) {
      throw new Error(
        `[EntityService] Entity type '${entityType}' not registered. ` +
        `Please register it using entityTypeRegistry.registerType() before creating a service.`
      );
    }

    this.octokit = options.octokit || null;
    this.options = options.config || {};

    console.log(`[EntityService] Created service for entity type: ${entityType}`);
  }

  /**
   * Get the entity type configuration
   * @returns {Object} The entity type configuration
   */
  getConfig() {
    return { ...this.config };
  }

  /**
   * Validate entity data against the registered validation schema
   * @param {Object} data - The entity data to validate
   * @returns {Object} Validation result { valid: boolean, errors: string[] }
   */
  validate(data) {
    if (!this.config.validation) {
      // No validation schema defined, consider valid
      return { valid: true, errors: [] };
    }

    try {
      // Assuming validation is a function that returns { valid, errors }
      // or throws an error
      if (typeof this.config.validation === 'function') {
        return this.config.validation(data);
      }

      // If validation is a schema object (like Joi, Yup, etc.)
      // Parent project should provide a validator function
      console.warn('[EntityService] Validation schema provided but no validator function found');
      return { valid: true, errors: [] };
    } catch (error) {
      console.error('[EntityService] Validation error:', error);
      return {
        valid: false,
        errors: [error.message || 'Validation failed']
      };
    }
  }

  /**
   * Create a new entity
   * @param {Object} data - The entity data
   * @returns {Promise<Object>} The created entity
   */
  async create(data) {
    console.log(`[EntityService] Creating ${this.config.label}...`);

    // Validate data
    const validation = this.validate(data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // TODO: Implement actual storage logic based on this.config.storage
    // For now, this is a placeholder that child implementations can override
    throw new Error(
      `[EntityService] create() not implemented for storage type: ${this.config.storage}. ` +
      `Please override this method or implement storage adapter.`
    );
  }

  /**
   * Read/fetch a single entity by ID
   * @param {string|number} id - The entity ID
   * @returns {Promise<Object>} The entity data
   */
  async read(id) {
    console.log(`[EntityService] Reading ${this.config.label} (ID: ${id})...`);

    // TODO: Implement actual storage logic
    throw new Error(
      `[EntityService] read() not implemented for storage type: ${this.config.storage}. ` +
      `Please override this method or implement storage adapter.`
    );
  }

  /**
   * Update an existing entity
   * @param {string|number} id - The entity ID
   * @param {Object} data - The updated entity data
   * @returns {Promise<Object>} The updated entity
   */
  async update(id, data) {
    console.log(`[EntityService] Updating ${this.config.label} (ID: ${id})...`);

    // Validate data
    const validation = this.validate(data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // TODO: Implement actual storage logic
    throw new Error(
      `[EntityService] update() not implemented for storage type: ${this.config.storage}. ` +
      `Please override this method or implement storage adapter.`
    );
  }

  /**
   * Delete an entity
   * @param {string|number} id - The entity ID
   * @returns {Promise<boolean>} True if deleted successfully
   */
  async delete(id) {
    console.log(`[EntityService] Deleting ${this.config.label} (ID: ${id})...`);

    // TODO: Implement actual storage logic
    throw new Error(
      `[EntityService] delete() not implemented for storage type: ${this.config.storage}. ` +
      `Please override this method or implement storage adapter.`
    );
  }

  /**
   * List all entities, optionally filtered
   * @param {Object} [filter={}] - Filter criteria
   * @returns {Promise<Array>} Array of entities
   */
  async list(filter = {}) {
    console.log(`[EntityService] Listing ${this.config.pluralLabel}...`);

    // TODO: Implement actual storage logic
    throw new Error(
      `[EntityService] list() not implemented for storage type: ${this.config.storage}. ` +
      `Please override this method or implement storage adapter.`
    );
  }

  /**
   * Search entities by query
   * @param {string} query - Search query
   * @param {Object} [options={}] - Search options
   * @returns {Promise<Array>} Array of matching entities
   */
  async search(query, options = {}) {
    console.log(`[EntityService] Searching ${this.config.pluralLabel} for: ${query}`);

    // TODO: Implement actual storage logic
    throw new Error(
      `[EntityService] search() not implemented for storage type: ${this.config.storage}. ` +
      `Please override this method or implement storage adapter.`
    );
  }

  /**
   * Count entities, optionally filtered
   * @param {Object} [filter={}] - Filter criteria
   * @returns {Promise<number>} Count of entities
   */
  async count(filter = {}) {
    console.log(`[EntityService] Counting ${this.config.pluralLabel}...`);

    // TODO: Implement actual storage logic
    throw new Error(
      `[EntityService] count() not implemented for storage type: ${this.config.storage}. ` +
      `Please override this method or implement storage adapter.`
    );
  }

  /**
   * Check if an entity exists
   * @param {string|number} id - The entity ID
   * @returns {Promise<boolean>} True if entity exists
   */
  async exists(id) {
    console.log(`[EntityService] Checking if ${this.config.label} exists (ID: ${id})...`);

    try {
      await this.read(id);
      return true;
    } catch (error) {
      return false;
    }
  }
}

/**
 * Factory function to create an EntityService
 * @param {string} entityType - The entity type name
 * @param {Object} [options={}] - Service options
 * @returns {EntityService} A new EntityService instance
 */
export function createEntityService(entityType, options = {}) {
  return new EntityService(entityType, options);
}
