/**
 * Battle Loadout Encoder/Decoder
 *
 * Encodes and decodes battle loadout data for URL sharing
 * Similar to BuildEncoder but for complete battle loadouts with multiple sections
 */

/**
 * Encode a battle loadout object to a base64 string
 * @param {object} loadout - Loadout object to encode
 * @returns {string|null} Base64 encoded string or null on error
 */
export const encodeLoadout = (loadout) => {
  try {
    const jsonString = JSON.stringify(loadout);
    const base64 = btoa(unescape(encodeURIComponent(jsonString)));
    return base64;
  } catch (error) {
    console.error('Failed to encode loadout:', error);
    return null;
  }
};

/**
 * Decode a base64 string to a battle loadout object
 * @param {string} encodedString - Base64 encoded loadout string
 * @returns {object|null} Loadout object or null on error
 */
export const decodeLoadout = (encodedString) => {
  try {
    const jsonString = decodeURIComponent(escape(atob(encodedString)));
    const loadout = JSON.parse(jsonString);
    return loadout;
  } catch (error) {
    console.error('Failed to decode loadout:', error);
    return null;
  }
};

/**
 * Generate a shareable URL for a battle loadout
 * @param {object} loadout - Loadout object
 * @param {string} basePath - Base path for the route (default: '/battle-loadouts')
 * @returns {string|null} Shareable URL or null on error
 */
export const generateLoadoutURL = (loadout, basePath = '/battle-loadouts') => {
  const encoded = encodeLoadout(loadout);
  if (!encoded) return null;

  const baseURL = window.location.origin + window.location.pathname;
  return `${baseURL}#${basePath}?data=${encoded}`;
};
