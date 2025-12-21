/**
 * Generic Entity Type Registry
 *
 * Provides a centralized system for registering custom entity types that can be
 * managed through generic CRUD services. This replaces game-specific services
 * (like skillBuilds.js, battleLoadouts.js) with a flexible registry that allows
 * parent projects to define their own entity types.
 *
 * @example
 * // Parent project registration
 * import { entityTypeRegistry } from 'github-wiki-framework';
 *
 * entityTypeRegistry.registerType('skill-build', {
 *   label: 'Skill Build',
 *   pluralLabel: 'Skill Builds',
 *   fields: ['name', 'slots', 'maxSlots', 'description'],
 *   validation: skillBuildSchema,
 *   storage: 'github-issues',
 *   icon: '⚔️',
 *   listLabel: 'issue.title'
 * });
 *
 * // Usage with EntityService
 * import { EntityService } from 'github-wiki-framework';
 * const skillBuildService = new EntityService('skill-build');
 * await skillBuildService.create({ name: 'My Build', slots: [...] });
 */

class EntityTypeRegistry {
  constructor() {
    this.types = {};
  }

  /**
   * Register a new entity type
   * @param {string} typeName - Unique identifier for the entity type (e.g., 'skill-build')
   * @param {Object} config - Entity type configuration
   * @param {string} config.label - Singular display name (e.g., 'Skill Build')
   * @param {string} config.pluralLabel - Plural display name (e.g., 'Skill Builds')
   * @param {string[]} config.fields - Array of field names this entity has
   * @param {Object} [config.validation] - Validation schema (optional)
   * @param {string} [config.storage='github-issues'] - Storage backend type
   * @param {string} [config.icon] - Icon/emoji for UI display
   * @param {string} [config.listLabel='issue.title'] - Path to label field for list views
   * @param {Object} [config.metadata] - Additional metadata (optional)
   */
  registerType(typeName, config) {
    if (!typeName || typeof typeName !== 'string') {
      console.error('[EntityTypeRegistry] Type name must be a non-empty string');
      return;
    }

    if (!config || typeof config !== 'object') {
      console.error('[EntityTypeRegistry] Config must be an object');
      return;
    }

    // Validate required fields
    if (!config.label || typeof config.label !== 'string') {
      console.error(`[EntityTypeRegistry] Entity type '${typeName}' must have a label`);
      return;
    }

    if (!config.pluralLabel || typeof config.pluralLabel !== 'string') {
      console.error(`[EntityTypeRegistry] Entity type '${typeName}' must have a pluralLabel`);
      return;
    }

    if (!Array.isArray(config.fields)) {
      console.error(`[EntityTypeRegistry] Entity type '${typeName}' must have a fields array`);
      return;
    }

    // Register the type with defaults
    this.types[typeName] = {
      label: config.label,
      pluralLabel: config.pluralLabel,
      fields: config.fields,
      validation: config.validation || null,
      storage: config.storage || 'github-issues',
      icon: config.icon || '📄',
      listLabel: config.listLabel || 'issue.title',
      metadata: config.metadata || {}
    };

    console.log(`[EntityTypeRegistry] Registered entity type: ${typeName} (${config.label})`);
  }

  /**
   * Get configuration for an entity type
   * @param {string} typeName - The entity type name
   * @returns {Object|null} The entity type configuration or null if not found
   */
  getType(typeName) {
    if (!this.types[typeName]) {
      console.warn(`[EntityTypeRegistry] Entity type '${typeName}' not found`);
      return null;
    }

    return this.types[typeName];
  }

  /**
   * Get all registered entity types
   * @returns {Object} Object containing all entity type configurations
   */
  getAllTypes() {
    return { ...this.types };
  }

  /**
   * Get array of all registered type names
   * @returns {string[]} Array of entity type names
   */
  getTypeNames() {
    return Object.keys(this.types);
  }

  /**
   * Check if an entity type exists
   * @param {string} typeName - The entity type name
   * @returns {boolean} True if type exists
   */
  hasType(typeName) {
    return !!this.types[typeName];
  }

  /**
   * Get the label for an entity type
   * @param {string} typeName - The entity type name
   * @param {boolean} [plural=false] - Whether to return plural label
   * @returns {string|null} The label or null if not found
   */
  getLabel(typeName, plural = false) {
    const type = this.getType(typeName);
    if (!type) return null;
    return plural ? type.pluralLabel : type.label;
  }

  /**
   * Get the icon for an entity type
   * @param {string} typeName - The entity type name
   * @returns {string|null} The icon or null if not found
   */
  getIcon(typeName) {
    const type = this.getType(typeName);
    if (!type) return null;
    return type.icon;
  }

  /**
   * Get the storage backend for an entity type
   * @param {string} typeName - The entity type name
   * @returns {string|null} The storage type or null if not found
   */
  getStorage(typeName) {
    const type = this.getType(typeName);
    if (!type) return null;
    return type.storage;
  }

  /**
   * Get the fields for an entity type
   * @param {string} typeName - The entity type name
   * @returns {string[]|null} Array of field names or null if not found
   */
  getFields(typeName) {
    const type = this.getType(typeName);
    if (!type) return null;
    return [...type.fields];
  }

  /**
   * Get the validation schema for an entity type
   * @param {string} typeName - The entity type name
   * @returns {Object|null} The validation schema or null if not found/not defined
   */
  getValidation(typeName) {
    const type = this.getType(typeName);
    if (!type) return null;
    return type.validation;
  }

  /**
   * Check if an entity type has a specific field
   * @param {string} typeName - The entity type name
   * @param {string} fieldName - The field name to check
   * @returns {boolean} True if the type has the field
   */
  hasField(typeName, fieldName) {
    const type = this.getType(typeName);
    if (!type) return false;
    return type.fields.includes(fieldName);
  }

  /**
   * Unregister an entity type (useful for testing)
   * @param {string} typeName - The entity type to remove
   */
  unregisterType(typeName) {
    if (this.types[typeName]) {
      delete this.types[typeName];
      console.log(`[EntityTypeRegistry] Unregistered entity type: ${typeName}`);
    }
  }

  /**
   * Clear all registered entity types (useful for testing)
   */
  clear() {
    this.types = {};
    console.log('[EntityTypeRegistry] Cleared all entity types');
  }
}

// Export singleton instance
export const entityTypeRegistry = new EntityTypeRegistry();
