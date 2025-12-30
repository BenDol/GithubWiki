/**
 * Release Date Utility
 *
 * Centralized utility for filtering commits and activity by release date.
 * All date filtering should go through this utility to ensure consistency.
 *
 * Configuration:
 * - Set VITE_RELEASE_DATE environment variable (ISO 8601 format)
 * - Example: VITE_RELEASE_DATE=2025-01-01T00:00:00Z
 * - If not set, all dates are considered valid (no filtering)
 *
 * Usage:
 * ```js
 * import { getReleaseDate, isAfterRelease, filterByReleaseDate } from './utils/releaseDate';
 *
 * // Check if a date is after release
 * if (isAfterRelease(commit.date)) {
 *   // Process commit
 * }
 *
 * // Filter an array of objects by date field
 * const validCommits = filterByReleaseDate(commits, 'date');
 * ```
 */

let cachedReleaseDate = undefined; // undefined = not yet checked, null = no release date

/**
 * Get the configured release date from environment variable
 * @returns {Date|null} Release date or null if not configured
 */
export function getReleaseDate() {
  // Return cached value if available
  if (cachedReleaseDate !== undefined) {
    return cachedReleaseDate;
  }

  // Read from environment variable (safe for both browser and serverless)
  const envReleaseDateStr = typeof import.meta !== 'undefined' && import.meta.env
    ? import.meta.env.VITE_RELEASE_DATE
    : process.env.VITE_RELEASE_DATE;
  if (envReleaseDateStr && envReleaseDateStr.trim() !== '') {
    try {
      const date = new Date(envReleaseDateStr);
      if (!isNaN(date.getTime())) {
        cachedReleaseDate = date;
        console.log('[ReleaseDate] Using release date from VITE_RELEASE_DATE:', date.toISOString());
        return cachedReleaseDate;
      } else {
        console.warn('[ReleaseDate] Invalid VITE_RELEASE_DATE format:', envReleaseDateStr);
      }
    } catch (error) {
      console.warn('[ReleaseDate] Failed to parse VITE_RELEASE_DATE:', envReleaseDateStr, error);
    }
  }

  // No release date configured
  cachedReleaseDate = null;
  return null;
}

/**
 * Clear the cached release date (useful for testing or config reloads)
 */
export function clearReleaseDateCache() {
  cachedReleaseDate = undefined;
}

/**
 * Check if a date is after the release date
 * @param {Date|string|number} date - Date to check (Date object, ISO string, or timestamp)
 * @returns {boolean} True if date is after release date (or no release date configured)
 */
export function isAfterRelease(date) {
  const releaseDate = getReleaseDate();

  // No release date configured - all dates valid
  if (!releaseDate) {
    return true;
  }

  // Parse input date
  let checkDate;
  if (date instanceof Date) {
    checkDate = date;
  } else if (typeof date === 'string' || typeof date === 'number') {
    checkDate = new Date(date);
  } else {
    console.warn('[ReleaseDate] Invalid date format:', date);
    return false;
  }

  // Check validity
  if (isNaN(checkDate.getTime())) {
    console.warn('[ReleaseDate] Invalid date:', date);
    return false;
  }

  return checkDate >= releaseDate;
}

/**
 * Filter an array of objects by release date
 * @param {Array} items - Array of objects to filter
 * @param {string} dateField - Field name containing the date (e.g., 'created_at', 'date')
 * @returns {Array} Filtered array containing only items after release date
 */
export function filterByReleaseDate(items, dateField = 'date') {
  if (!Array.isArray(items)) {
    console.warn('[ReleaseDate] filterByReleaseDate expects an array, got:', typeof items);
    return [];
  }

  const releaseDate = getReleaseDate();

  // No release date configured - return all items
  if (!releaseDate) {
    return items;
  }

  const beforeCount = items.length;
  const filtered = items.filter(item => {
    const date = item[dateField];
    if (!date) {
      console.warn(`[ReleaseDate] Item missing date field '${dateField}':`, item);
      return false;
    }
    return isAfterRelease(date);
  });

  const afterCount = filtered.length;
  const filteredCount = beforeCount - afterCount;

  if (filteredCount > 0) {
    console.log(`[ReleaseDate] Filtered out ${filteredCount} item(s) before release date (${releaseDate.toISOString()})`);
  }

  return filtered;
}

/**
 * Get a human-readable description of the release date filter
 * @returns {string|null} Description or null if no filter configured
 */
export function getReleaseDateDescription() {
  const releaseDate = getReleaseDate();
  if (!releaseDate) {
    return null;
  }
  return `Showing activity since ${releaseDate.toLocaleDateString()} (release date)`;
}

/**
 * Check if release date filtering is enabled
 * @returns {boolean} True if release date is configured
 */
export function isReleaseDateFilterEnabled() {
  return getReleaseDate() !== null;
}
