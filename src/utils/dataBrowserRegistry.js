/**
 * Data Browser Registry
 *
 * Allows parent projects to register their data files for the Data Browser modal.
 * The framework provides the UI, but the parent project provides the list of files.
 */

let registeredDataFiles = [];

/**
 * Register data files for the Data Browser
 * @param {Array<string|Object>} files - Array of filenames or file objects with {name, path}
 *
 * @example
 * // Simple filenames (will be prefixed with /data/)
 * registerDataFiles([
 *   'skills.json',
 *   'companions.json',
 *   'equipment.json'
 * ]);
 *
 * @example
 * // Full file objects with custom paths
 * registerDataFiles([
 *   { name: 'skills.json', path: '/data/skills.json' },
 *   { name: 'config.json', path: '/config.json' }
 * ]);
 */
export function registerDataFiles(files) {
  if (!Array.isArray(files)) {
    console.error('[DataBrowserRegistry] registerDataFiles expects an array');
    return;
  }

  // Normalize file entries
  registeredDataFiles = files.map(file => {
    if (typeof file === 'string') {
      return {
        name: file,
        path: `/data/${file}`
      };
    }
    return file;
  });

  console.log('[DataBrowserRegistry] Registered', registeredDataFiles.length, 'data files');
}

/**
 * Get all registered data files
 * @returns {Array<Object>} Array of file objects with {name, path}
 */
export function getRegisteredDataFiles() {
  return registeredDataFiles;
}

/**
 * Check if any data files are registered
 * @returns {boolean}
 */
export function hasRegisteredDataFiles() {
  return registeredDataFiles.length > 0;
}

/**
 * Clear all registered data files (mainly for testing)
 */
export function clearRegisteredDataFiles() {
  registeredDataFiles = [];
}
