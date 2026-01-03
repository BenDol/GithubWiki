/**
 * Lazy loading wrapper with automatic retry for chunk loading failures
 *
 * When a dynamic import fails (typically due to stale chunk references after deployment),
 * this utility automatically reloads the page once to fetch the new chunk manifest.
 *
 * Common scenarios:
 * 1. User loads site with index.html referencing chunk-ABC123.js
 * 2. New deployment happens, generating chunk-XYZ789.js
 * 3. User navigates, browser tries to load old chunk-ABC123.js
 * 4. 404 error occurs, this utility detects it and reloads once
 *
 * @param {Function} importFunc - Dynamic import function (e.g., () => import('./Component'))
 * @param {string} componentName - Component name for debugging (optional)
 * @returns {Promise} Lazy-loaded component
 */
export function lazyWithRetry(importFunc, componentName = 'Component') {
  return new Promise((resolve, reject) => {
    // Check if we've already attempted reload for this component
    const hasRefreshed = sessionStorage.getItem(`retry-lazy-refresh-${componentName}`) === 'true';

    importFunc()
      .then(module => {
        // Clear the refresh flag on successful load
        sessionStorage.removeItem(`retry-lazy-refresh-${componentName}`);
        resolve(module);
      })
      .catch(error => {
        // Detect chunk loading failures
        const isChunkLoadError =
          error?.message?.includes('Failed to fetch dynamically imported module') ||
          error?.message?.includes('Failed to fetch module') ||
          error?.message?.includes('error loading dynamically imported module') ||
          error?.name === 'ChunkLoadError' ||
          (error?.message?.includes('fetch') && error?.message?.includes('import'));

        if (isChunkLoadError && !hasRefreshed) {
          console.warn(`[LazyRetry] Chunk load failed for ${componentName}, reloading page...`, error);

          // Mark that we've attempted refresh for this component
          sessionStorage.setItem(`retry-lazy-refresh-${componentName}`, 'true');

          // Reload the page to get fresh chunk references
          window.location.reload();
        } else {
          // Either not a chunk error, or already tried reload - reject normally
          if (hasRefreshed) {
            console.error(`[LazyRetry] Chunk load failed again for ${componentName} after reload`, error);
            // Clear the flag so user can try again later
            sessionStorage.removeItem(`retry-lazy-refresh-${componentName}`);
          }
          reject(error);
        }
      });
  });
}

/**
 * Enhanced lazy wrapper that integrates with React.lazy()
 *
 * Usage:
 *   const MyComponent = lazy(() => lazyWithRetry(
 *     () => import('./MyComponent'),
 *     'MyComponent'
 *   ));
 */
export default lazyWithRetry;
