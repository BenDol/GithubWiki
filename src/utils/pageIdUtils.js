/**
 * Page ID utility functions
 * Page IDs are stable identifiers generated from titles that never change
 */

/**
 * Generate a page ID from a title
 * Converts to lowercase and replaces spaces with hyphens
 * @param {string} title - The page title
 * @returns {string} The generated page ID
 */
export const generatePageId = (title) => {
  if (!title) return '';

  return title
    .toLowerCase()
    .trim()
    .replace(/\s+/g, '-')           // Replace spaces with hyphens
    .replace(/[^a-z0-9-]/g, '')     // Remove non-alphanumeric characters except hyphens
    .replace(/-+/g, '-')            // Replace multiple hyphens with single hyphen
    .replace(/^-|-$/g, '');         // Remove leading/trailing hyphens
};

/**
 * Validate page ID format
 * @param {string} id - The page ID to validate
 * @returns {boolean} True if valid
 */
export const isValidPageId = (id) => {
  if (!id) return false;

  // Must contain only lowercase letters, numbers, and hyphens
  // Cannot start or end with hyphen
  const idRegex = /^[a-z0-9]([a-z0-9-]*[a-z0-9])?$/;
  return idRegex.test(id);
};

/**
 * Get all page IDs from content directory
 * Used for duplicate detection
 * @param {string} contentPath - Base URL for content
 * @returns {Promise<Map<string, string>>} Map of page ID to file path
 */
export const getAllPageIds = async (contentPath) => {
  // This will be implemented to scan all markdown files and extract IDs
  // For now, return empty map
  const pageIds = new Map();

  try {
    // TODO: Implement scanning logic
    // This would need to fetch all markdown files and parse their frontmatter
    // For now, validation will happen at save time
  } catch (error) {
    console.error('Failed to get all page IDs:', error);
  }

  return pageIds;
};

/**
 * Check if a page ID is unique across all pages
 * @param {string} id - The page ID to check
 * @param {string} currentFilePath - The current file path (to exclude from check)
 * @param {Map<string, string>} allPageIds - Map of all page IDs to file paths
 * @returns {boolean} True if unique
 */
export const isUniquePageId = (id, currentFilePath, allPageIds) => {
  if (!allPageIds.has(id)) {
    return true;
  }

  // If the ID exists, check if it's the current file
  const existingPath = allPageIds.get(id);
  return existingPath === currentFilePath;
};
