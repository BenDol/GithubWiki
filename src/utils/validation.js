/**
 * Client-Side Validation Utilities (Framework)
 * Generic validation functions - extendable by parent projects
 *
 * NOTE: Client-side validation is for UX only - server-side is the source of truth
 */

/**
 * Base string length limits (can be extended by parent projects)
 */
export const BASE_STRING_LIMITS = {
  USERNAME_MIN: 1,
  USERNAME_MAX: 39,
  DISPLAY_NAME_MIN: 2,
  DISPLAY_NAME_MAX: 50,
  EDIT_REASON_MAX: 500,
  PAGE_CONTENT_MAX: 1048576, // 1MB
};

/**
 * Base validation patterns (can be extended by parent projects)
 */
export const BASE_VALIDATION_PATTERNS = {
  EMAIL: /^[^\s@]+@[^\s@]+\.[^\s@]+$/,
};

/**
 * Base validation error messages (can be extended by parent projects)
 */
export const BASE_VALIDATION_MESSAGES = {
  REQUIRED_FIELD: (field) => `${field} is required`,
  TOO_SHORT: (field, min) => `${field} must be at least ${min} characters`,
  TOO_LONG: (field, max) => `${field} must be no more than ${max} characters`,
  INVALID_FORMAT: (field) => `${field} has an invalid format`,
  EMAIL_INVALID: 'Invalid email address format',
  DISPLAY_NAME_TOO_SHORT: `Display name must be at least ${BASE_STRING_LIMITS.DISPLAY_NAME_MIN} characters`,
  DISPLAY_NAME_TOO_LONG: `Display name must be no more than ${BASE_STRING_LIMITS.DISPLAY_NAME_MAX} characters`,
  CONTENT_TOO_LARGE: `Content is too large (max ${BASE_STRING_LIMITS.PAGE_CONTENT_MAX / 1024}KB)`,
};

/**
 * Validation result type
 * @typedef {Object} ValidationResult
 * @property {boolean} valid - Whether validation passed
 * @property {string} [error] - Error message if validation failed
 * @property {*} [sanitized] - Sanitized value
 */

/**
 * Validate string length
 * @param {string} value - Value to validate
 * @param {number} min - Minimum length
 * @param {number} max - Maximum length
 * @param {string} fieldName - Field name for error messages
 * @param {Object} messages - Optional custom messages object
 * @returns {ValidationResult}
 */
export function validateStringLength(value, min, max, fieldName, messages = BASE_VALIDATION_MESSAGES) {
  if (typeof value !== 'string') {
    return {
      valid: false,
      error: `${fieldName} must be a string`,
    };
  }

  const trimmed = value.trim();

  if (min > 0 && trimmed.length < min) {
    return {
      valid: false,
      error: messages.TOO_SHORT(fieldName, min),
    };
  }

  if (trimmed.length > max) {
    return {
      valid: false,
      error: messages.TOO_LONG(fieldName, max),
    };
  }

  return {
    valid: true,
    sanitized: trimmed,
  };
}

/**
 * Validate email address
 * @param {string} email - Email address
 * @param {Object} patterns - Optional custom patterns object
 * @param {Object} messages - Optional custom messages object
 * @returns {ValidationResult}
 */
export function validateEmail(email, patterns = BASE_VALIDATION_PATTERNS, messages = BASE_VALIDATION_MESSAGES) {
  if (!email || email.trim().length === 0) {
    return {
      valid: false,
      error: 'Email is required',
    };
  }

  const trimmed = email.trim();

  if (!patterns.EMAIL.test(trimmed)) {
    return {
      valid: false,
      error: messages.EMAIL_INVALID,
    };
  }

  return {
    valid: true,
    sanitized: trimmed,
  };
}

/**
 * Validate display name (for anonymous edits)
 * @param {string} name - Display name
 * @param {Object} limits - Optional custom limits object
 * @param {Object} messages - Optional custom messages object
 * @returns {ValidationResult}
 */
export function validateDisplayName(name, limits = BASE_STRING_LIMITS, messages = BASE_VALIDATION_MESSAGES) {
  const result = validateStringLength(
    name,
    limits.DISPLAY_NAME_MIN,
    limits.DISPLAY_NAME_MAX,
    'Display name',
    messages
  );

  if (!result.valid) return result;

  // Strip HTML tags for safety
  const sanitized = result.sanitized.replace(/<[^>]*>/g, '');

  if (sanitized.length < limits.DISPLAY_NAME_MIN) {
    return {
      valid: false,
      error: messages.DISPLAY_NAME_TOO_SHORT,
    };
  }

  return {
    valid: true,
    sanitized,
  };
}

/**
 * Format character count for display
 * @param {number} current - Current character count
 * @param {number} max - Maximum character count
 * @returns {string} - Formatted count (e.g., "45/100")
 */
export function formatCharCount(current, max) {
  return `${current}/${max}`;
}

/**
 * Check if character count is near limit (for warning styling)
 * @param {number} current - Current character count
 * @param {number} max - Maximum character count
 * @param {number} warningThreshold - Percentage threshold (default 80%)
 * @returns {boolean} - True if near limit
 */
export function isNearLimit(current, max, warningThreshold = 0.8) {
  return current / max >= warningThreshold;
}

/**
 * Check if character count exceeds limit (for error styling)
 * @param {number} current - Current character count
 * @param {number} max - Maximum character count
 * @returns {boolean} - True if over limit
 */
export function isOverLimit(current, max) {
  return current > max;
}
