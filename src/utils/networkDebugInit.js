import { createLogger } from './logger';
import { isNetworkDebugEnabled, logCacheControlRecommendations, clearBrowserCaches, clearLocalStorageCaches } from './networkDebugConfig';
import { initializeOctokitProxy } from './octokitProxy';
import { initializeFetchProxy } from './fetchProxy';
import { useNetworkDebugStore } from '../store/networkDebugStore';

const logger = createLogger('NetworkDebugInit');

/**
 * Network Debug Initialization
 *
 * Orchestrates the initialization of the network debug system:
 * - Starts network tracking
 * - Initializes Octokit proxy
 * - Initializes Fetch proxy
 * - Clears caches for accurate cold load testing
 * - Logs cache control recommendations
 */

let isInitialized = false;

/**
 * Check if this page load is from an auto-reload
 * @returns {boolean} True if auto-reload
 */
const isAutoReload = () => {
  try {
    if (typeof sessionStorage === 'undefined') return false;

    const flag = sessionStorage.getItem('networkDebugAutoReload');
    // Clear the flag immediately after reading
    if (flag) {
      sessionStorage.removeItem('networkDebugAutoReload');
    }

    const isReload = flag === 'true';
    logger.info('Auto-reload check', { isReload, flagValue: flag });
    return isReload;
  } catch (error) {
    logger.warn('Failed to check auto-reload flag', { error });
    return false;
  }
};

/**
 * Check if this is the first page load (no session data exists)
 * @returns {boolean} True if first load
 */
const isFirstPageLoadInSession = () => {
  try {
    if (typeof sessionStorage === 'undefined') return true;

    const stored = sessionStorage.getItem('networkDebugSession');
    const isFirstLoad = !stored;

    logger.info('Session check', { isFirstLoad, hasStoredData: !!stored });
    return isFirstLoad;
  } catch (error) {
    logger.warn('Failed to check session storage', { error });
    return true;
  }
};

/**
 * Initialize network debug system
 * Call this once at app startup
 */
export const initializeNetworkDebug = async () => {
  // Check if already initialized
  if (isInitialized) {
    logger.debug('Network debug already initialized, skipping');
    return;
  }

  // Check if debug mode is enabled
  if (!isNetworkDebugEnabled()) {
    logger.debug('Network debug mode not enabled, skipping initialization');
    return;
  }

  logger.info('Initializing network debug system');

  try {
    // Get store instance
    const store = useNetworkDebugStore.getState();

    // Check if this is an auto-reload (triggered by our system)
    const isReload = isAutoReload();
    const isFirstLoad = isFirstPageLoadInSession();

    logger.info('Reload detection', { isAutoReload: isReload, isFirstLoad });

    // If auto-reload detected, reset current route's autoReloadCompleted flag
    // This ensures the warm load phase code will execute and trigger auto-save
    if (isReload) {
      const currentRoute = window.location.pathname;
      logger.info('Auto-reload detected - resetting route state for warm load', { currentRoute });

      // Reset the route's autoReloadCompleted flag so handleRouteChange enters warm load phase
      const currentRouteData = store.routeData[currentRoute];
      if (currentRouteData) {
        store.routeData[currentRoute] = {
          ...currentRouteData,
          autoReloadCompleted: false  // Reset to allow warm load phase entry
        };

        // Save the updated state immediately
        const sessionData = {
          routeData: store.routeData,
          currentRoute: store.currentRoute,
          currentLoadPhase: store.currentLoadPhase,
          sessionId: store.sessionId,
          sessionStartTime: store.sessionStartTime,
          lastSaveTime: Date.now()
        };

        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('networkDebugSession', JSON.stringify(sessionData));
          }
        } catch (error) {
          logger.warn('Failed to save updated session data', { error });
        }

        logger.debug('Reset autoReloadCompleted flag for route', { currentRoute });
      }
    }

    // Check if user enabled "Purge Cache on Load" option
    const shouldPurgeCache = (() => {
      try {
        return typeof localStorage !== 'undefined' &&
               localStorage.getItem('networkDebug:purgeCacheOnLoad') === 'true';
      } catch {
        return false;
      }
    })();

    if (shouldPurgeCache) {
      logger.info('Purging cache: localStorage entries (user option enabled)');
      clearLocalStorageCaches();
    }

    // ONLY reset on actual first load (no session data exists)
    // Don't reset on manual reload or SPA navigation - preserve session across page changes
    if (isFirstLoad) {
      logger.info('First session - clearing caches for accurate cold load testing');

      // Clear browser caches (Cache API + localStorage)
      await clearBrowserCaches();
      clearLocalStorageCaches();

      console.log(
        '%c🧹 Caches Cleared - New Session',
        'background: #FF9800; color: white; padding: 4px 8px; font-size: 12px; border-radius: 3px;'
      );
    } else if (isReload) {
      logger.info('Auto-reload detected - continuing debug session with warm load tracking');
      console.log(
        '%c🔥 Warm Load - Auto-Reload Complete',
        'background: #4CAF50; color: white; padding: 4px 8px; font-size: 12px; border-radius: 3px;'
      );
    } else {
      // Check if this is a manual reload (F5) or direct navigation (URL bar) vs SPA navigation
      const navigationInfo = (() => {
        try {
          if (typeof performance === 'undefined') return { type: null, isManualReload: false, isNavigate: false };
          const navEntries = performance.getEntriesByType('navigation');
          if (navEntries.length > 0) {
            const navEntry = navEntries[0];
            return {
              type: navEntry.type,
              isManualReload: navEntry.type === 'reload',
              isNavigate: navEntry.type === 'navigate'
            };
          }
          // Fallback to deprecated API
          if (performance.navigation) {
            const type = performance.navigation.type;
            return {
              type: type,
              isManualReload: type === 1, // TYPE_RELOAD
              isNavigate: type === 0 // TYPE_NAVIGATE
            };
          }
          return { type: null, isManualReload: false, isNavigate: false };
        } catch (error) {
          logger.warn('Failed to detect navigation type', { error });
          return { type: null, isManualReload: false, isNavigate: false };
        }
      })();

      if (navigationInfo.isManualReload) {
        // Manual reload (F5) - reset all route flags to allow retesting
        logger.info('Manual reload detected - resetting route tracking flags for fresh cycles', {
          navigationType: navigationInfo.type
        });

        // Reset all routes' autoReloadCompleted and visitedInSession flags
        // This allows users to test routes again after a manual reload
        const updatedRouteData = {};
        Object.keys(store.routeData).forEach((route) => {
          updatedRouteData[route] = {
            ...store.routeData[route],
            autoReloadCompleted: false,
            visitedInSession: false
          };
        });

        // Update store with reset flags
        Object.assign(store.routeData, updatedRouteData);

        // Get current route from URL
        const currentPath = window.location.pathname;

        // Save the updated state immediately
        const sessionData = {
          routeData: store.routeData,
          currentRoute: null,  // Reset current route to trigger fresh tracking
          currentLoadPhase: 'cold',
          sessionId: store.sessionId,
          sessionStartTime: store.sessionStartTime,
          lastSaveTime: Date.now()
        };

        try {
          if (typeof sessionStorage !== 'undefined') {
            sessionStorage.setItem('networkDebugSession', JSON.stringify(sessionData));
          }
        } catch (error) {
          logger.warn('Failed to save updated session data after manual reload', { error });
        }

        console.log(
          '%c🔄 Manual Reload - Route Tracking Reset',
          'background: #9C27B0; color: white; padding: 4px 8px; font-size: 12px; border-radius: 3px;'
        );

        logger.info('Reset tracking flags for all routes', {
          routes: Object.keys(store.routeData).length
        });

        // Note: handleRouteChange will be called immediately after initialization (line 292)
        // No need for setTimeout here - the immediate call handles route tracking
      } else if (navigationInfo.isNavigate) {
        // Direct navigation (URL bar, bookmark, link) - preserve completed routes
        logger.info('Direct navigation detected - preserving completed routes', {
          navigationType: navigationInfo.type,
          trackedRoutes: Object.keys(store.routeData).length
        });

        console.log(
          '%c🌐 Direct Navigation - Session Preserved',
          'background: #2196F3; color: white; padding: 4px 8px; font-size: 12px; border-radius: 3px;'
        );

        // Don't reset any flags - let handleRouteChange naturally handle:
        // - Untracked routes: Start cold load
        // - Tracked routes: Set to 'completed' and skip tracking
      } else {
        // SPA navigation (pushState/popState) - preserve all state
        logger.info('Continuing existing debug session (SPA navigation)');
        console.log(
          '%c📊 Session Active - Data Preserved',
          'background: #2196F3; color: white; padding: 4px 8px; font-size: 12px; border-radius: 3px;'
        );
      }
    }

    // Start tracking
    store.startTracking();

    // CRITICAL: Always call handleRouteChange for initial route
    // This ensures route state is properly set (cold/warm/completed)
    // handleRouteChange will determine if tracking is needed or if route is already completed
    const initialRoute = window.location.pathname;
    if (initialRoute) {
      logger.info('Processing initial route', {
        route: initialRoute,
        hasExistingRouteData: !!store.routeData[initialRoute]
      });
      store.handleRouteChange(initialRoute);
    }

    // Initialize Octokit proxy
    logger.debug('Initializing Octokit proxy');
    await initializeOctokitProxy();

    // Initialize Fetch proxy
    logger.debug('Initializing Fetch proxy');
    initializeFetchProxy();

    // Log cache control recommendations
    logCacheControlRecommendations();

    // Mark as initialized
    isInitialized = true;

    logger.info('Network debug system initialized successfully', {
      tracking: true,
      octokitProxy: true,
      fetchProxy: true,
      isFirstLoad
    });

    // Log instructions to console
    console.log(
      '%c🔍 Network Debug Mode Active',
      'background: #4CAF50; color: white; padding: 8px 12px; font-size: 14px; font-weight: bold; border-radius: 4px;'
    );
    console.log(
      '%c📊 Visit /debug/network to view statistics and charts',
      'color: #2196F3; font-size: 12px; padding: 4px;'
    );
    console.log(
      '%c⚠️  Enable "Disable cache" in DevTools Network tab for accurate cold load testing',
      'color: #FF9800; font-size: 12px; padding: 4px;'
    );

  } catch (error) {
    logger.error('Failed to initialize network debug system', { error });
  }
};

/**
 * Shutdown network debug system
 * Cleanup and restore original functions
 */
export const shutdownNetworkDebug = () => {
  if (!isInitialized) {
    logger.debug('Network debug not initialized, nothing to shutdown');
    return;
  }

  logger.info('Shutting down network debug system');

  try {
    // Stop tracking
    const store = useNetworkDebugStore.getState();
    store.stopTracking();

    // Restore original fetch (Octokit proxy can't be easily unwrapped)
    const { restoreOriginalFetch } = require('./fetchProxy');
    restoreOriginalFetch();

    isInitialized = false;

    logger.info('Network debug system shut down successfully');

  } catch (error) {
    logger.error('Failed to shutdown network debug system', { error });
  }
};

/**
 * Check if network debug is initialized
 * @returns {boolean} True if initialized
 */
export const isNetworkDebugInitialized = () => {
  return isInitialized;
};

/**
 * Toggle network debug mode
 * Useful for runtime enable/disable
 */
export const toggleNetworkDebug = () => {
  if (isInitialized) {
    shutdownNetworkDebug();
  } else {
    initializeNetworkDebug();
  }
};

export default {
  initializeNetworkDebug,
  shutdownNetworkDebug,
  isNetworkDebugInitialized,
  toggleNetworkDebug
};
