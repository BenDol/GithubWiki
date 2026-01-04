import { create } from 'zustand';
import { createLogger } from '../utils/logger';

const logger = createLogger('NetworkDebugStore');

/**
 * Network Debug Store
 *
 * Tracks all network calls (Octokit + fetch) during development for performance analysis.
 * Provides cold vs warm load comparison per route with auto-reload functionality.
 *
 * Development-only feature controlled by wiki-config.json:
 * features.network.debugMode.enabled = true
 */

// Get config from window
const getConfig = () => {
  if (typeof window === 'undefined') return null;
  return window.__WIKI_CONFIG__?.features?.network?.debugMode || {};
};

// Generate unique ID for network calls
const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

// Calculate statistics for a load phase
const calculateLoadStats = (calls) => {
  if (!calls || calls.length === 0) {
    return {
      totalCalls: 0,
      totalDuration: 0,
      totalSize: 0,
      cacheHits: 0,
      cacheMisses: 0,
      errors: 0,
      avgDuration: 0,
      cacheHitRate: 0
    };
  }

  const totalCalls = calls.length;
  const totalDuration = calls.reduce((sum, call) => sum + call.duration, 0);
  const totalSize = calls.reduce((sum, call) => sum + (call.responseSize || 0) + (call.requestSize || 0), 0);
  const cacheHits = calls.filter(call => call.cached).length;
  const cacheMisses = totalCalls - cacheHits;
  const errors = calls.filter(call => !call.success).length;
  const avgDuration = totalDuration / totalCalls;
  const cacheHitRate = totalCalls > 0 ? (cacheHits / totalCalls) * 100 : 0;

  return {
    totalCalls,
    totalDuration,
    totalSize,
    cacheHits,
    cacheMisses,
    errors,
    avgDuration,
    cacheHitRate
  };
};

// Restore session data from sessionStorage
// Note: The initialization logic (networkDebugInit.js) handles clearing stale sessions
// This just restores whatever data exists
const restoreSessionData = () => {
  try {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
      return null;
    }

    const stored = sessionStorage.getItem('networkDebugSession');
    if (!stored) {
      logger.debug('No stored session data found');
      return null;
    }

    const data = JSON.parse(stored);
    logger.debug('Restored session data from storage', {
      routes: Object.keys(data.routeData || {}).length,
      currentRoute: data.currentRoute,
      currentLoadPhase: data.currentLoadPhase
    });

    return data;
  } catch (error) {
    logger.warn('Failed to restore network debug session', { error });
    return null;
  }
};

// Save session data to sessionStorage
const saveSessionData = (state) => {
  try {
    if (typeof window === 'undefined' || typeof sessionStorage === 'undefined') {
      return;
    }

    const dataToSave = {
      routeData: state.routeData,
      currentRoute: state.currentRoute,
      currentLoadPhase: state.currentLoadPhase,
      sessionId: state.sessionId,
      sessionStartTime: state.sessionStartTime, // From store state (preserved across saves)
      lastSaveTime: Date.now() // Updated on every save
    };

    sessionStorage.setItem('networkDebugSession', JSON.stringify(dataToSave));
  } catch (error) {
    logger.warn('Failed to save network debug session', { error });
  }
};

export const useNetworkDebugStore = create((set, get) => {
  // Restore previous session if exists (survives page reloads)
  const restoredData = restoreSessionData();

  return {
    // ===== State =====

    // Unique session identifier
    sessionId: restoredData?.sessionId || generateId(),

    // Session start time (milliseconds since epoch)
    sessionStartTime: restoredData?.sessionStartTime || Date.now(),

    // Per-route tracking data
    // Format: { '/route': { coldLoad: {...}, warmLoad: {...}, visitedInSession: bool, autoReloadCompleted: bool } }
    routeData: restoredData?.routeData || {},

    // Current route being tracked
    currentRoute: restoredData?.currentRoute || null,

    // Current load phase: 'cold', 'warm', 'completed', or null
    currentLoadPhase: restoredData?.currentLoadPhase || null,

    // Whether tracking is active
    isTracking: false,

    // Pending auto-reload timeout ID
    autoReloadTimeout: null,

    // Auto-save status: null, 'pending', 'saving', 'completed', 'error'
    autoSaveStatus: null,
    autoSaveError: null,

    // Warm reload pending indicator
    warmReloadPending: false,

    // ===== Actions =====

    /**
     * Record a network call
     * @param {Object} callData - Network call data (id, type, method, url, duration, cached, etc.)
     */
    recordCall: (callData) => {
      // CRITICAL: Check if network debug is enabled
      const config = getConfig();
      if (!config || !config.enabled) {
        return; // Silently exit if debug mode is not enabled
      }

      const state = get();
      const { currentRoute, currentLoadPhase, routeData } = state;

      if (!currentRoute) {
        logger.debug('No current route, skipping call recording', { callData });
        return;
      }

      const maxCalls = config.maxCallsPerRoute || 1000;

      set((state) => {
        const route = state.routeData[currentRoute] || {
          coldLoad: { calls: [], stats: null },
          warmLoad: { calls: [], stats: null },
          visitedInSession: true,
          autoReloadCompleted: false
        };

        const loadPhase = currentLoadPhase === 'warm' ? 'warmLoad' : 'coldLoad';
        const calls = [...route[loadPhase].calls, callData];

        // Limit calls per route to prevent memory issues
        if (calls.length > maxCalls) {
          calls.shift();
          logger.warn('Max calls per route exceeded, dropping oldest call', {
            route: currentRoute,
            maxCalls
          });
        }

        const updatedRouteData = {
          ...state.routeData,
          [currentRoute]: {
            ...route,
            [loadPhase]: {
              ...route[loadPhase],
              calls
            }
          }
        };

        const newState = {
          routeData: updatedRouteData
        };

        // Save to sessionStorage
        saveSessionData({ ...state, ...newState });

        return newState;
      });

      logger.trace('Recorded network call', {
        route: currentRoute,
        phase: currentLoadPhase,
        type: callData.type,
        method: callData.method,
        url: callData.url,
        duration: callData.duration,
        cached: callData.cached
      });
    },

    /**
     * Handle route change - triggers cold/warm load logic
     * @param {string} newRoute - The new route path
     */
    handleRouteChange: (newRoute) => {
      // CRITICAL: Check if network debug is enabled
      // This prevents auto-reloads when debug mode is OFF
      const config = getConfig();
      if (!config || !config.enabled) {
        return; // Silently exit if debug mode is not enabled
      }

      const state = get();
      const { routeData, autoReloadTimeout } = state;

      logger.info('handleRouteChange called', {
        route: newRoute,
        existingRoutes: Object.keys(routeData),
        currentRoute: state.currentRoute,
        currentPhase: state.currentLoadPhase
      });

      // Clear any pending auto-reload
      if (autoReloadTimeout) {
        clearTimeout(autoReloadTimeout);
        logger.debug('Cleared pending auto-reload timeout');
      }

      const existingRoute = routeData[newRoute];

      // First visit to this route in session - cold load
      if (!existingRoute || !existingRoute.visitedInSession) {
        logger.info('First visit to route - starting cold load', {
          route: newRoute,
          routeExists: !!existingRoute,
          visitedInSession: existingRoute?.visitedInSession
        });

        set((state) => {
          const updatedRouteData = {
            ...state.routeData,
            [newRoute]: {
              coldLoad: { calls: [], stats: null },
              warmLoad: { calls: [], stats: null },
              visitedInSession: true,
              autoReloadCompleted: false
            }
          };

          const newState = {
            currentRoute: newRoute,
            currentLoadPhase: 'cold',
            routeData: updatedRouteData,
            autoReloadTimeout: null
          };

          // Save to sessionStorage
          saveSessionData({ ...state, ...newState });

          return newState;
        });

        // Schedule auto-reload after delay
        const delay = config.autoReloadDelay || 5000;
        logger.info('Scheduling auto-reload', { route: newRoute, delayMs: delay });

        const timeoutId = setTimeout(() => {
          const current = get();
          const routeInfo = current.routeData[newRoute];

          logger.info('Auto-reload timer fired', {
            route: newRoute,
            stillOnRoute: current.currentRoute === newRoute,
            autoReloadCompleted: routeInfo?.autoReloadCompleted
          });

          if (current.currentRoute === newRoute && !routeInfo?.autoReloadCompleted) {
            current.triggerAutoReload(newRoute);
          } else {
            logger.debug('Skipping auto-reload - conditions not met');
            set({ warmReloadPending: false });
          }
        }, delay);

        set({ autoReloadTimeout: timeoutId, warmReloadPending: true });

      } else if (!existingRoute.autoReloadCompleted) {
        // Warm load phase (after auto-reload)
        logger.info('After auto-reload - starting warm load', { route: newRoute });

        set((state) => {
          const updatedRouteData = {
            ...state.routeData,
            [newRoute]: {
              ...state.routeData[newRoute],
              autoReloadCompleted: true
            }
          };

          const newState = {
            currentRoute: newRoute,
            currentLoadPhase: 'warm',
            routeData: updatedRouteData,
            warmReloadPending: false,
            autoSaveStatus: 'pending'
          };

          // Save to sessionStorage
          saveSessionData({ ...state, ...newState });

          return newState;
        });

        // Auto-save to local disk after warm load completes (dev only)
        const autoSave = config.autoSaveOnWarmLoad ?? true;
        if (autoSave) {
          logger.info('Scheduling auto-save to local disk after warm load', { route: newRoute });
          setTimeout(async () => {
            try {
              set({ autoSaveStatus: 'saving' });
              const current = get();
              const result = await current.saveToLocalDisk();
              logger.info('Auto-save completed', { filePath: result?.filePath });
              set({ autoSaveStatus: 'completed', autoSaveError: null });
              // Clear completed status after 5 seconds
              setTimeout(() => set({ autoSaveStatus: null }), 5000);
            } catch (error) {
              logger.error('Auto-save failed (this is expected in production)', { error: error.message });
              set({ autoSaveStatus: 'error', autoSaveError: error.message });
              // Clear error status after 10 seconds
              setTimeout(() => set({ autoSaveStatus: null, autoSaveError: null }), 10000);
            }
          }, 3000); // Wait 3 seconds after warm load starts to capture all calls
        }

      } else {
        // Subsequent visits - route already fully tracked, no action needed
        logger.debug('Subsequent visit to already tracked route (no retracking)', { route: newRoute });
        set({ currentRoute: newRoute, currentLoadPhase: 'completed' });
      }
    },

    /**
     * Clear tracking data for a specific route and prepare for retracking
     * @param {string} route - The route to retrack
     */
    retrackRoute: (route) => {
      // CRITICAL: Check if network debug is enabled
      const config = getConfig();
      if (!config || !config.enabled) {
        return; // Silently exit if debug mode is not enabled
      }

      const state = get();

      if (!state.routeData[route]) {
        logger.warn('Cannot retrack - route not found', { route });
        return;
      }

      logger.info('Clearing route tracking data for retrack', { route });

      // Remove the route from routeData
      const updatedRouteData = { ...state.routeData };
      delete updatedRouteData[route];

      set((state) => {
        const newState = {
          routeData: updatedRouteData,
          currentRoute: null,
          currentLoadPhase: null
        };

        // Save to sessionStorage
        saveSessionData({ ...state, ...newState });

        return newState;
      });

      // Reload the page to start fresh tracking
      logger.info('Reloading page to start fresh tracking', { route });

      // Set flag in sessionStorage to indicate this is NOT an auto-reload
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('networkDebugManualRetrack', 'true');
        }
      } catch (error) {
        logger.warn('Failed to set manual retrack flag', { error });
      }

      window.location.reload();
    },

    /**
     * Trigger auto-reload for cold/warm comparison
     * @param {string} route - The route to reload
     */
    triggerAutoReload: (route) => {
      // CRITICAL: Check if network debug is enabled
      const config = getConfig();
      if (!config || !config.enabled) {
        return; // Silently exit if debug mode is not enabled
      }

      const state = get();
      const routeData = state.routeData[route];

      if (!routeData) {
        logger.warn('Cannot trigger auto-reload - route data not found', { route });
        return;
      }

      // Calculate stats for cold load
      const coldStats = calculateLoadStats(routeData.coldLoad.calls);

      logger.info('Triggering auto-reload for route', {
        route,
        coldStats
      });

      set((state) => {
        const updatedRouteData = {
          ...state.routeData,
          [route]: {
            ...state.routeData[route],
            coldLoad: {
              ...state.routeData[route].coldLoad,
              stats: coldStats
            }
          }
        };

        const newState = {
          routeData: updatedRouteData
        };

        // Save to sessionStorage
        saveSessionData({ ...state, ...newState });

        return newState;
      });

      // Set flag to indicate this is an auto-reload
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.setItem('networkDebugAutoReload', 'true');
        }
      } catch (error) {
        logger.warn('Failed to set auto-reload flag', { error });
      }

      // Trigger page reload
      window.location.reload();
    },

    /**
     * Calculate statistics for a route
     * @param {string} route - Route path
     * @param {string} phase - 'cold' or 'warm'
     * @returns {Object} Statistics object
     */
    calculateStats: (route, phase = 'cold') => {
      const state = get();
      const routeData = state.routeData[route];

      if (!routeData) {
        return null;
      }

      const loadPhase = phase === 'warm' ? 'warmLoad' : 'coldLoad';
      return calculateLoadStats(routeData[loadPhase].calls);
    },

    /**
     * Download session data as JSON file
     * @returns {Promise} Resolves with download result
     */
    downloadSessionData: async () => {
      const state = get();
      const config = window.__WIKI_CONFIG__;
      const version = config?.version?.commit || 'unknown';
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD
      const timestamp = new Date().toISOString().replace(/[:.]/g, '-');

      // Calculate stats for all routes
      const routesWithStats = {};
      Object.keys(state.routeData).forEach((route) => {
        const coldStats = calculateLoadStats(state.routeData[route].coldLoad.calls);
        const warmStats = calculateLoadStats(state.routeData[route].warmLoad.calls);

        routesWithStats[route] = {
          ...state.routeData[route],
          coldLoad: {
            ...state.routeData[route].coldLoad,
            stats: coldStats
          },
          warmLoad: {
            ...state.routeData[route].warmLoad,
            stats: warmStats
          }
        };
      });

      const sessionData = {
        sessionId: state.sessionId,
        version,
        date,
        timestamp: Date.now(),
        routes: routesWithStats,
        summary: {
          totalRoutes: Object.keys(state.routeData).length,
          totalCalls: Object.values(state.routeData).reduce((sum, route) =>
            sum + route.coldLoad.calls.length + route.warmLoad.calls.length, 0
          ),
          totalDuration: Object.values(state.routeData).reduce((sum, route) => {
            const coldStats = calculateLoadStats(route.coldLoad.calls);
            const warmStats = calculateLoadStats(route.warmLoad.calls);
            return sum + coldStats.totalDuration + warmStats.totalDuration;
          }, 0)
        }
      };

      logger.info('Downloading network debug session data', {
        sessionId: state.sessionId,
        routes: sessionData.summary.totalRoutes,
        totalCalls: sessionData.summary.totalCalls
      });

      try {
        // Create JSON blob
        const jsonString = JSON.stringify(sessionData, null, 2);
        const blob = new Blob([jsonString], { type: 'application/json' });

        // Create download link
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `network-debug_${version}_${date}_${state.sessionId}.json`;

        // Trigger download
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);

        // Clean up blob URL
        URL.revokeObjectURL(url);

        logger.info('Network debug session downloaded successfully', {
          filename: link.download,
          size: blob.size
        });

        return {
          success: true,
          filename: link.download,
          size: blob.size
        };
      } catch (error) {
        logger.error('Failed to download network debug session', { error: error.message });
        throw error;
      }
    },

    /**
     * Save session data to local disk (dev environment only)
     * This uses the serverless endpoint which only works in Wrangler dev with Node.js fs access
     * @returns {Promise} Resolves with save result
     */
    saveToLocalDisk: async () => {
      const state = get();
      const config = window.__WIKI_CONFIG__;
      const version = config?.version?.commit || 'unknown';
      const date = new Date().toISOString().split('T')[0]; // YYYY-MM-DD

      // Calculate stats for all routes
      const routesWithStats = {};
      Object.keys(state.routeData).forEach((route) => {
        const coldStats = calculateLoadStats(state.routeData[route].coldLoad.calls);
        const warmStats = calculateLoadStats(state.routeData[route].warmLoad.calls);

        routesWithStats[route] = {
          ...state.routeData[route],
          coldLoad: {
            ...state.routeData[route].coldLoad,
            stats: coldStats
          },
          warmLoad: {
            ...state.routeData[route].warmLoad,
            stats: warmStats
          }
        };
      });

      const sessionData = {
        sessionId: state.sessionId,
        version,
        date,
        timestamp: Date.now(),
        routes: routesWithStats,
        summary: {
          totalRoutes: Object.keys(state.routeData).length,
          totalCalls: Object.values(state.routeData).reduce((sum, route) =>
            sum + route.coldLoad.calls.length + route.warmLoad.calls.length, 0
          ),
          totalDuration: Object.values(state.routeData).reduce((sum, route) => {
            const coldStats = calculateLoadStats(route.coldLoad.calls);
            const warmStats = calculateLoadStats(route.warmLoad.calls);
            return sum + coldStats.totalDuration + warmStats.totalDuration;
          }, 0)
        }
      };

      logger.info('Saving network debug session to local disk', {
        sessionId: state.sessionId,
        routes: sessionData.summary.totalRoutes,
        totalCalls: sessionData.summary.totalCalls
      });

      try {
        const response = await fetch('/api/debug/save-network-data', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            sessionData,
            sessionId: state.sessionId,
            date
          })
        });

        if (!response.ok) {
          const errorData = await response.json().catch(() => ({ error: response.statusText }));
          throw new Error(errorData.error || `Save failed: ${response.statusText}`);
        }

        const result = await response.json();
        logger.info('Network debug session saved to local disk successfully', {
          filePath: result.filePath,
          absolutePath: result.absolutePath
        });

        return result;
      } catch (error) {
        logger.error('Failed to save network debug session to local disk', { error: error.message });
        throw error;
      }
    },

    /**
     * Clear session data (reset)
     */
    clearSession: () => {
      logger.info('Clearing network debug session');

      set({
        sessionId: generateId(),
        routeData: {},
        currentRoute: null,
        currentLoadPhase: 'cold',
        autoReloadTimeout: null
      });

      // Clear sessionStorage
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('networkDebugSession');
        }
      } catch (error) {
        logger.warn('Failed to clear sessionStorage', { error });
      }
    },

    /**
     * Start tracking
     */
    startTracking: () => {
      logger.info('Network debug tracking started');
      set({ isTracking: true });
    },

    /**
     * Stop tracking
     */
    stopTracking: () => {
      logger.info('Network debug tracking stopped');
      set({ isTracking: false });
    },

    /**
     * Reset session to fresh state (used on first page load)
     */
    resetToFreshSession: () => {
      logger.info('Resetting network debug to fresh session');

      set({
        sessionId: generateId(),
        sessionStartTime: Date.now(), // Reset to current time
        routeData: {},
        currentRoute: null,
        currentLoadPhase: 'cold',
        autoReloadTimeout: null
      });

      // Clear sessionStorage
      try {
        if (typeof sessionStorage !== 'undefined') {
          sessionStorage.removeItem('networkDebugSession');
        }
      } catch (error) {
        logger.warn('Failed to clear sessionStorage during reset', { error });
      }
    }
  };
});

// Expose store globally for proxy access
if (typeof window !== 'undefined') {
  window.__networkDebugStore__ = useNetworkDebugStore;
  logger.debug('Network debug store exposed globally');
}

export default useNetworkDebugStore;
