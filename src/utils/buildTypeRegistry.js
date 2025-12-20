/**
 * Build Type Registry
 *
 * Allows parent projects to register their build types and routes for the build sharing system.
 * The framework provides the sharing infrastructure, but the parent project defines the types.
 */

let registeredBuildTypes = {};

/**
 * Register build types for the build sharing system
 * @param {Object} buildTypes - Object mapping type IDs to route paths
 *
 * @example
 * registerBuildTypes({
 *   'skill-builds': '/skill-builder',
 *   'spirit-builds': '/spirit-builder',
 *   'battle-loadouts': '/battle-loadouts',
 *   'soul-weapon-engraving': '/soul-weapon-engraving'
 * });
 */
export function registerBuildTypes(buildTypes) {
  if (typeof buildTypes !== 'object' || buildTypes === null) {
    console.error('[BuildTypeRegistry] registerBuildTypes expects an object');
    return;
  }

  registeredBuildTypes = { ...buildTypes };
  console.log('[BuildTypeRegistry] Registered', Object.keys(buildTypes).length, 'build types:', Object.keys(buildTypes));
}

/**
 * Get the route for a build type
 * @param {string} buildType - Build type ID
 * @returns {string|null} Route path or null if not found
 */
export function getBuildTypeRoute(buildType) {
  return registeredBuildTypes[buildType] || null;
}

/**
 * Get all registered build types
 * @returns {Object} Object mapping type IDs to routes
 */
export function getRegisteredBuildTypes() {
  return { ...registeredBuildTypes };
}

/**
 * Check if a build type is registered
 * @param {string} buildType - Build type ID
 * @returns {boolean}
 */
export function isBuildTypeRegistered(buildType) {
  return buildType in registeredBuildTypes;
}

/**
 * Clear all registered build types (mainly for testing)
 */
export function clearRegisteredBuildTypes() {
  registeredBuildTypes = {};
}

