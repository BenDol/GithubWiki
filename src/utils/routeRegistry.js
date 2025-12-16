/**
 * Route Registry
 *
 * Allows parent projects to register custom routes without modifying framework router
 * Similar pattern to contentRendererRegistry.js
 */

let customRoutes = [];

/**
 * Register custom routes to be added to the router
 * @param {Array} routes - Array of route objects with path and component
 *
 * Example:
 * registerCustomRoutes([
 *   {
 *     path: 'my-tool',
 *     component: MyToolComponent,
 *     suspense: true  // Optional, defaults to true
 *   }
 * ]);
 */
export const registerCustomRoutes = (routes) => {
  if (!Array.isArray(routes)) {
    console.error('[RouteRegistry] Routes must be an array');
    return;
  }

  customRoutes = [...customRoutes, ...routes];
  console.log(`[RouteRegistry] Registered ${routes.length} custom route(s)`);
};

/**
 * Get all registered custom routes
 * @returns {Array} Array of registered routes
 */
export const getCustomRoutes = () => {
  return customRoutes;
};

/**
 * Clear all registered routes (mainly for testing)
 */
export const clearCustomRoutes = () => {
  customRoutes = [];
};
