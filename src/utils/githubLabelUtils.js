/**
 * GitHub Label Utilities
 *
 * GitHub labels have a maximum length of 50 characters.
 * These utilities ensure labels never exceed this limit.
 */

const MAX_LABEL_LENGTH = 50;

/**
 * Create a GitHub label with automatic truncation
 * @param {string} prefix - Label prefix (e.g., "user-id:", "section:")
 * @param {string|number} value - Label value
 * @returns {string} Truncated label that fits within GitHub's 50-char limit
 */
export function createLabel(prefix, value) {
  const maxValueLength = MAX_LABEL_LENGTH - prefix.length;
  const valueStr = String(value);

  // Truncate value if too long
  const truncatedValue = valueStr.length > maxValueLength
    ? valueStr.substring(0, maxValueLength)
    : valueStr;

  return `${prefix}${truncatedValue}`;
}

/**
 * Create a user-id label
 * @param {string|number} userId - User ID (can be numeric or hash)
 * @returns {string} Truncated user-id label
 */
export function createUserIdLabel(userId) {
  return createLabel('user-id:', userId);
}

/**
 * Create a section label
 * @param {string} sectionId - Section identifier
 * @returns {string} Truncated section label
 */
export function createSectionLabel(sectionId) {
  return createLabel('section:', sectionId);
}

/**
 * Create a branch label
 * @param {string} branch - Branch name
 * @returns {string} Truncated branch label
 */
export function createBranchLabel(branch) {
  return createLabel('branch:', branch);
}

/**
 * Create a page label
 * @param {string} sectionId - Section identifier
 * @param {string} pageId - Page identifier
 * @returns {string} Truncated page label
 */
export function createPageLabel(sectionId, pageId) {
  return createLabel('page:', `${sectionId}/${pageId}`);
}

/**
 * Create a name label (for display names)
 * @param {string} name - Display name
 * @returns {string} Truncated name label
 */
export function createNameLabel(name) {
  return createLabel('name:', name);
}

/**
 * Create a weapon label
 * @param {string} weaponName - Weapon name
 * @returns {string} Truncated weapon label
 */
export function createWeaponLabel(weaponName) {
  return createLabel('weapon:', weaponName);
}

/**
 * Create a weapon-id label
 * @param {string} weaponId - Weapon ID
 * @returns {string} Truncated weapon-id label
 */
export function createWeaponIdLabel(weaponId) {
  return createLabel('weapon-id:', weaponId);
}

/**
 * Create a reference hash label (for anonymous edit linking)
 * @param {string} refHash - Reference hash (e.g., email hash)
 * @param {number} maxHashLength - Maximum hash length to include (default: 16)
 * @returns {string} Truncated ref label
 */
export function createEmailLabel(refHash, maxHashLength = 16) {
  const truncatedHash = refHash.substring(0, maxHashLength);
  return createLabel('ref:', truncatedHash);
}

/**
 * Create a status label
 * @param {string} status - Status value
 * @returns {string} Truncated status label
 */
export function createStatusLabel(status) {
  return createLabel('status:', status);
}
