/**
 * Generic Style Registry
 *
 * Provides a centralized system for registering and retrieving style configurations.
 * This replaces hard-coded style definitions (like rarityColors.js) with a flexible
 * registry that allows parent projects to define their own style categories.
 *
 * @example
 * // Parent project registration
 * import { styleRegistry } from 'github-wiki-framework';
 *
 * styleRegistry.registerCategory('skill-rarity', {
 *   Common: {
 *     background: 'bg-gray-500',
 *     border: 'border-gray-500',
 *     glow: 'shadow-[0_0_10px_rgba(107,114,128,0.5)]'
 *   },
 *   Legendary: {
 *     background: 'bg-red-500',
 *     border: 'border-red-500',
 *     glow: 'shadow-[0_0_10px_rgba(220,38,38,0.5)]'
 *   }
 * });
 *
 * // Usage in components
 * const styles = styleRegistry.getStyles('skill-rarity', 'Legendary');
 */

class StyleRegistry {
  constructor() {
    this.categories = {};
  }

  /**
   * Register a category of styles
   * @param {string} categoryName - The category identifier (e.g., 'skill-rarity', 'item-quality')
   * @param {Object} styles - Object mapping style keys to style configurations
   */
  registerCategory(categoryName, styles) {
    if (!categoryName || typeof categoryName !== 'string') {
      console.error('[StyleRegistry] Category name must be a non-empty string');
      return;
    }

    if (!styles || typeof styles !== 'object') {
      console.error('[StyleRegistry] Styles must be an object');
      return;
    }

    this.categories[categoryName] = styles;
    console.log(`[StyleRegistry] Registered category: ${categoryName} with ${Object.keys(styles).length} styles`);
  }

  /**
   * Get a specific style from a category
   * @param {string} category - The category name
   * @param {string} key - The style key within the category
   * @returns {Object|null} The style configuration or null if not found
   */
  getStyles(category, key) {
    if (!this.categories[category]) {
      console.warn(`[StyleRegistry] Category '${category}' not found`);
      return null;
    }

    if (!this.categories[category][key]) {
      console.warn(`[StyleRegistry] Style '${key}' not found in category '${category}'`);
      return null;
    }

    return this.categories[category][key];
  }

  /**
   * Get all styles in a category
   * @param {string} category - The category name
   * @returns {Object} Object containing all styles in the category, or empty object if not found
   */
  getAllStyles(category) {
    if (!this.categories[category]) {
      console.warn(`[StyleRegistry] Category '${category}' not found`);
      return {};
    }

    return this.categories[category];
  }

  /**
   * Get all style keys in a category
   * @param {string} category - The category name
   * @returns {string[]} Array of style keys
   */
  getStyleKeys(category) {
    if (!this.categories[category]) {
      return [];
    }

    return Object.keys(this.categories[category]);
  }

  /**
   * Check if a category exists
   * @param {string} category - The category name
   * @returns {boolean} True if category exists
   */
  hasCategory(category) {
    return !!this.categories[category];
  }

  /**
   * Check if a specific style exists
   * @param {string} category - The category name
   * @param {string} key - The style key
   * @returns {boolean} True if style exists
   */
  hasStyle(category, key) {
    return !!(this.categories[category] && this.categories[category][key]);
  }

  /**
   * Get all registered categories
   * @returns {string[]} Array of category names
   */
  getCategories() {
    return Object.keys(this.categories);
  }

  /**
   * Unregister a category (useful for testing)
   * @param {string} categoryName - The category to remove
   */
  unregisterCategory(categoryName) {
    if (this.categories[categoryName]) {
      delete this.categories[categoryName];
      console.log(`[StyleRegistry] Unregistered category: ${categoryName}`);
    }
  }

  /**
   * Clear all registered categories (useful for testing)
   */
  clear() {
    this.categories = {};
    console.log('[StyleRegistry] Cleared all categories');
  }
}

// Export singleton instance
export const styleRegistry = new StyleRegistry();
