import { createLogger } from './logger';
import { isNetworkDebugEnabled } from './networkDebugConfig';

const logger = createLogger('OctokitProxy');

/**
 * Octokit Proxy - Network Interception for GitHub API Calls
 *
 * Wraps Octokit instances to intercept all GitHub API requests
 * and track timing, caching, and response data for performance analysis.
 */

// Generate unique ID for network calls
const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Estimate response size in bytes
 * @param {*} data - Response data
 * @returns {number} Estimated size in bytes
 */
const estimateResponseSize = (data) => {
  try {
    if (!data) return 0;

    // If it's a string, use its length
    if (typeof data === 'string') {
      return new Blob([data]).size;
    }

    // For objects, stringify and measure
    const jsonString = JSON.stringify(data);
    return new Blob([jsonString]).size;
  } catch (error) {
    logger.warn('Failed to estimate response size', { error });
    return 0;
  }
};

/**
 * Check if a call was cached
 * Looks at response headers and githubDataStore for cache hits
 * @param {string} route - GitHub API route
 * @param {Object} options - Request options
 * @param {Object} response - Response object
 * @returns {boolean} True if cached
 */
const checkIfCached = (route, options, response) => {
  try {
    // Check response headers for cache indicators
    if (response.headers) {
      // Check for GitHub cache headers
      if (response.headers['x-from-cache'] === 'true') {
        return true;
      }

      // Check for 304 Not Modified
      if (response.status === 304) {
        return true;
      }

      // Check for cache-control header indicating cache hit
      const cacheControl = response.headers['cache-control'];
      if (cacheControl && cacheControl.includes('max-age=0')) {
        return false; // Explicitly not cached
      }
    }

    // Check githubDataStore for cached data
    if (typeof window !== 'undefined' && window.__githubDataStore__) {
      const store = window.__githubDataStore__.getState();

      // Check PR cache
      if (route.includes('/pulls') && store.pullRequests) {
        const cached = Object.values(store.pullRequests).some(pr =>
          pr.cachedAt && (Date.now() - pr.cachedAt) < 600000 // 10 min
        );
        if (cached) return true;
      }

      // Check commit cache
      if (route.includes('/commits') && store.commits) {
        const cached = Object.values(store.commits).some(commit =>
          commit.cachedAt && (Date.now() - commit.cachedAt) < 180000 // 3 min
        );
        if (cached) return true;
      }

      // Check file content cache
      if (route.includes('/contents') && store.fileContent) {
        const cached = Object.values(store.fileContent).some(content =>
          content.cachedAt && (Date.now() - content.cachedAt) < 180000 // 3 min
        );
        if (cached) return true;
      }
    }

    // Check dynamic page loader cache (localStorage)
    if (typeof localStorage !== 'undefined' && route.includes('/contents')) {
      const pathMatch = route.match(/\/contents\/(.+)/);
      if (pathMatch) {
        const keys = Object.keys(localStorage);
        const cached = keys.some(key =>
          key.includes(':dynamic-pages:') &&
          key.includes(pathMatch[1])
        );
        if (cached) return true;
      }
    }

    return false;
  } catch (error) {
    logger.warn('Error checking cache status', { error });
    return false;
  }
};

/**
 * Wrap an Octokit instance to intercept all requests
 * @param {Object} octokit - Octokit instance
 * @returns {Object} Wrapped Octokit instance
 */
export const wrapOctokitInstance = (octokit) => {
  if (!octokit || typeof octokit.request !== 'function') {
    logger.warn('Invalid Octokit instance provided to wrapper');
    return octokit;
  }

  // Check if already wrapped
  if (octokit.__networkDebugWrapped__) {
    logger.debug('Octokit instance already wrapped, skipping');
    return octokit;
  }

  logger.info('Wrapping Octokit instance for network debug tracking');

  // Store original request method
  const originalRequest = octokit.request.bind(octokit);

  // Replace request method with wrapped version
  octokit.request = async (route, options = {}) => {
    // CRITICAL: Capture stack trace SYNCHRONOUSLY before any async operations
    // This preserves the original call site from application code
    const capturedStack = new Error().stack;

    // If debug mode not enabled, pass through
    if (!isNetworkDebugEnabled()) {
      return originalRequest(route, options);
    }

    // Get network debug store
    const store = window.__networkDebugStore__?.getState();
    if (!store) {
      logger.warn('Network debug store not available');
      return originalRequest(route, options);
    }

    const callId = generateId();
    const startTime = performance.now();

    // Process captured stack trace to extract application code
    const stackLines = capturedStack ? (() => {
      const allLines = capturedStack.split('\n').map(line => line.trim());

      // Helper to check if a line is application code
      const isApplicationCode = (line) => {
        // Must be a stack frame
        if (!line.includes('at ') && !line.includes('http')) return false;

        // Exclude library/framework code
        if (!line || line.startsWith('Error')) return false;
        if (line.includes('octokitProxy.js')) return false;
        if (line.includes('fetchProxy.js')) return false;
        if (line.includes('networkDebugInit.js')) return false;
        if (line.includes('node_modules')) return false;
        if (line.includes('.vite/deps/')) return false;
        if (line.includes('/@vite/')) return false;
        if (line.includes('/@fs/')) return false;

        // This is application code
        return true;
      };

      // Find application code frames (skip through library code)
      const filtered = allLines.filter(isApplicationCode);

      // Log for debugging - show FULL stack to diagnose
      if (filtered.length === 0 && allLines.length > 0) {
        logger.debug('[Octokit] No application frames found - showing full raw stack', {
          route: typeof route === 'string' ? route.substring(0, 80) : route,
          totalFrames: allLines.length,
          fullRawStack: allLines // Show ALL frames to see what we have
        });
        // Return ALL raw frames so we can see the full stack
        return allLines;
      }

      if (filtered.length > 0) {
        logger.debug('[Octokit] Found application frames', {
          route: typeof route === 'string' ? route.substring(0, 80) : route,
          totalRawFrames: allLines.length,
          applicationFrames: filtered.length,
          firstAppFrame: filtered[0]
        });
      }

      return filtered.slice(0, 15);
    })() : [];

    logger.trace('Intercepted Octokit request', {
      callId,
      route,
      method: options.method || 'GET',
      stackFrames: stackLines.length
    });

    try {
      // Make the actual request
      const response = await originalRequest(route, options);
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Check if cached
      const cached = checkIfCached(route, options, response);

      // Extract rate limit info
      const rateLimitRemaining = response.headers['x-ratelimit-remaining']
        ? parseInt(response.headers['x-ratelimit-remaining'], 10)
        : null;
      const rateLimitReset = response.headers['x-ratelimit-reset']
        ? parseInt(response.headers['x-ratelimit-reset'], 10)
        : null;

      // Record the call
      store.recordCall({
        id: callId,
        timestamp: Date.now(),
        type: 'octokit',
        method: options.method || 'GET',
        url: response.url || route,
        route: store.currentRoute,
        loadPhase: store.currentLoadPhase,

        // Timing
        startTime,
        endTime,
        duration,

        // Size
        requestSize: options.data ? estimateResponseSize(options.data) : 0,
        responseSize: estimateResponseSize(response.data),

        // Cache
        cached,
        cacheType: cached ? 'memory' : null,

        // Response
        status: response.status,
        success: response.status >= 200 && response.status < 300,
        error: null,

        // Octokit-specific
        rateLimitRemaining,
        rateLimitReset,

        // Initiator tracking
        stackTrace: stackLines
      });

      logger.debug('Octokit call recorded', {
        callId,
        route,
        duration: `${duration.toFixed(2)}ms`,
        cached,
        status: response.status
      });

      return response;

    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Record the error
      store.recordCall({
        id: callId,
        timestamp: Date.now(),
        type: 'octokit',
        method: options.method || 'GET',
        url: route,
        route: store.currentRoute,
        loadPhase: store.currentLoadPhase,

        // Timing
        startTime,
        endTime,
        duration,

        // Size
        requestSize: options.data ? estimateResponseSize(options.data) : 0,
        responseSize: 0,

        // Cache
        cached: false,
        cacheType: null,

        // Response
        status: error.status || 0,
        success: false,
        error: error.message || 'Unknown error',

        // Octokit-specific
        rateLimitRemaining: null,
        rateLimitReset: null,

        // Initiator tracking
        stackTrace: stackLines
      });

      logger.warn('Octokit call failed', {
        callId,
        route,
        error: error.message,
        duration: `${duration.toFixed(2)}ms`
      });

      // Re-throw the error
      throw error;
    }
  };

  // Mark as wrapped to prevent double-wrapping
  octokit.__networkDebugWrapped__ = true;

  return octokit;
};

/**
 * Initialize Octokit proxy
 * Wraps all Octokit instances created by the framework
 */
export const initializeOctokitProxy = async () => {
  logger.info('Octokit proxy initialization skipped - using fetchProxy for all tracking');

  // NOTE: Wrapping Octokit instances doesn't work reliably because:
  // 1. Imports are bound at import time, can't be replaced after
  // 2. Octokit uses job queues that break async call chains
  // 3. Stack traces are lost by the time fetch is called
  //
  // Solution: Capture deeper stack traces in fetchProxy with higher Error.stackTraceLimit
};

export default {
  wrapOctokitInstance,
  initializeOctokitProxy
};
