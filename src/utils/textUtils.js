/**
 * Text formatting utilities
 */

/**
 * Format a page title by replacing hyphens with spaces and capitalizing each word
 * @param {string} title - The title to format (e.g., "getting-started")
 * @returns {string} Formatted title (e.g., "Getting Started")
 */
export const formatPageTitle = (title) => {
  if (!title) return '';

  return title
    .split('-')
    .map(word => word.charAt(0).toUpperCase() + word.slice(1).toLowerCase())
    .join(' ');
};

/**
 * Get display title for a page
 * If autoFormat is enabled and no explicit title exists, format the pageId
 * Otherwise return the original title
 *
 * @param {string} pageId - The page ID (e.g., "getting-started")
 * @param {string} explicitTitle - The explicit title from metadata
 * @param {boolean} autoFormat - Whether to auto-format titles
 * @returns {string} Display title
 */
export const getDisplayTitle = (pageId, explicitTitle, autoFormat = false) => {
  // If auto-format is not enabled, return as-is
  if (!autoFormat) {
    return explicitTitle || pageId;
  }

  // If there's an explicit title that differs from the pageId (case-insensitive, ignoring hyphens),
  // use the explicit title as-is (user intentionally set a custom title)
  if (explicitTitle) {
    const normalizedPageId = pageId.toLowerCase().replace(/-/g, '');
    const normalizedTitle = explicitTitle.toLowerCase().replace(/[\s-]/g, '');

    if (normalizedPageId !== normalizedTitle) {
      // Explicit title is different from pageId, respect it
      return explicitTitle;
    }
  }

  // Either no explicit title, or explicit title matches pageId
  // Apply formatting
  return formatPageTitle(pageId);
};
