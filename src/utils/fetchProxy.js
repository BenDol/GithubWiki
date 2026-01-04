import { createLogger } from './logger';
import { isNetworkDebugEnabled, getCacheBustingHeaders, applyCacheBusting } from './networkDebugConfig';

const logger = createLogger('FetchProxy');

/**
 * Fetch Proxy - Network Interception for Fetch API Calls
 *
 * Wraps the global fetch function to intercept all HTTP requests
 * and track timing, caching, and response data for performance analysis.
 */

// Store original fetch before wrapping
let originalFetch = null;

// Generate unique ID for network calls
const generateId = () => {
  return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
};

/**
 * Check if a URL should be tracked
 * @param {string} url - URL to check
 * @returns {boolean} True if should be tracked
 */
const shouldTrackUrl = (url) => {
  // Don't track if debug mode not enabled
  if (!isNetworkDebugEnabled()) {
    return false;
  }

  // Convert relative URLs to absolute
  let fullUrl;
  try {
    fullUrl = new URL(url, window.location.origin).toString();
  } catch (error) {
    return false;
  }

  // Don't track the debug endpoint itself to avoid infinite loops
  if (fullUrl.includes('/api/debug/save-network-data')) {
    return false;
  }

  // Don't track remote logging endpoint
  if (fullUrl.includes('/api/log')) {
    return false;
  }

  // Don't track Vite HMR and dev server requests
  if (fullUrl.includes('/@vite/') ||
      fullUrl.includes('/@fs/') ||
      fullUrl.includes('/__vite_ping') ||
      fullUrl.includes('/@react-refresh')) {
    return false;
  }

  // Track all other URLs (serverless functions, external APIs, etc.)
  return true;
};

/**
 * Check if a fetch response was cached
 * @param {Response} response - Fetch response
 * @returns {boolean} True if cached
 */
const checkIfCached = (response) => {
  try {
    // Check cache-related headers
    const cacheControl = response.headers.get('cache-control');
    const xCache = response.headers.get('x-cache');
    const age = response.headers.get('age');

    // x-cache: HIT indicates cache hit
    if (xCache === 'HIT') {
      return true;
    }

    // age header present means served from cache
    if (age && parseInt(age, 10) > 0) {
      return true;
    }

    // 304 Not Modified means cache validation success
    if (response.status === 304) {
      return true;
    }

    // Check if from Service Worker cache
    if (response.headers.get('x-from-cache') === 'true') {
      return true;
    }

    return false;
  } catch (error) {
    logger.warn('Error checking cache status', { error });
    return false;
  }
};

/**
 * Get cache type from response
 * @param {Response} response - Fetch response
 * @returns {string|null} Cache type or null
 */
const getCacheType = (response) => {
  if (!checkIfCached(response)) {
    return null;
  }

  const xCache = response.headers.get('x-cache');
  if (xCache) {
    return `http-cache (${xCache})`;
  }

  if (response.status === 304) {
    return 'http-cache (304)';
  }

  const age = response.headers.get('age');
  if (age) {
    return 'http-cache';
  }

  return 'unknown-cache';
};

/**
 * Initialize fetch proxy
 * Wraps the global fetch function to intercept all requests
 */
export const initializeFetchProxy = () => {
  if (!isNetworkDebugEnabled()) {
    logger.debug('Network debug mode not enabled, skipping fetch proxy initialization');
    return;
  }

  if (typeof window === 'undefined' || typeof window.fetch !== 'function') {
    logger.warn('Fetch API not available');
    return;
  }

  // Store original fetch if not already stored
  if (!originalFetch) {
    originalFetch = window.fetch.bind(window);
    logger.info('Original fetch function stored');
  }

  // Check if already wrapped
  if (window.fetch.__networkDebugWrapped__) {
    logger.debug('Fetch already wrapped, skipping');
    return;
  }

  logger.info('Initializing fetch proxy for network debug tracking');

  // Replace global fetch with wrapped version
  window.fetch = async (url, options = {}) => {
    // CRITICAL: Capture stack trace SYNCHRONOUSLY before any async operations
    // Increase stack trace limit to capture more frames
    const originalLimit = Error.stackTraceLimit;
    Error.stackTraceLimit = 50; // Capture up to 50 frames

    let capturedStack = new Error().stack;

    // Restore original limit
    Error.stackTraceLimit = originalLimit;

    // Check if this is a GitHub API call that should be tracked as 'octokit' type
    const urlString = typeof url === 'string' ? url : url.toString();
    const isGitHubApi = urlString.includes('api.github.com');
    const callType = isGitHubApi ? 'octokit' : 'fetch';

    /**
     * NETWORK DEBUG: Stack Trace Retrieval
     *
     * For GitHub API calls, retrieve the stack trace captured at the source
     * (e.g., getFileContent, loadDynamicPage, getDonatorStatus).
     *
     * TWO RETRIEVAL STRATEGIES:
     *
     * 1. EXACT PATH MATCH (for /contents/ endpoints):
     *    - Extract path from URL: /repos/owner/repo/contents/public/content/path/file.md
     *    - Look up stored stack by exact path key
     *    - Best for content fetching operations
     *
     * 2. MOST RECENT STACK FALLBACK (for all other endpoints):
     *    - Find the most recent stack entry (within 3 seconds)
     *    - Use for /issues, /search, /pulls, etc.
     *    - Covers 95% of cases without explicit capture
     *
     * RESULT:
     * - If found: Stack shows application code (PageViewer.jsx, etc.)
     * - If not found: Stack shows only Octokit internals (Job.doExecute)
     *
     * TO DEBUG:
     * 1. Open network debug dashboard (/debug/network)
     * 2. Click on any call row to expand
     * 3. View "Call Initiator (Stack Trace)" section
     * 4. Stack should show application code, not just library internals
     */
    if (isGitHubApi && typeof window !== 'undefined' && window.__apiCallStacks__) {
      try {
        let storedTrace = null;

        // Strategy 1: Try to match by content path (for /contents/ endpoints)
        const match = urlString.match(/\/contents\/([^?]+)/);
        if (match) {
          const contentPath = decodeURIComponent(match[1]);
          storedTrace = window.__apiCallStacks__.get(contentPath);
        }

        // Strategy 2: Use the most recent stack (for any GitHub API call)
        if (!storedTrace) {
          // Find the most recent stack entry (within last 3 seconds)
          let mostRecent = null;
          for (const [key, value] of window.__apiCallStacks__.entries()) {
            const age = Date.now() - value.timestamp;
            if (age < 3000) { // Within 3 seconds
              if (!mostRecent || value.timestamp > mostRecent.timestamp) {
                mostRecent = value;
              }
            }
          }
          storedTrace = mostRecent;
        }

        // Use the stored stack if found and recent
        if (storedTrace) {
          const age = Date.now() - storedTrace.timestamp;
          if (age < 5000) { // Use if within 5 seconds
            capturedStack = storedTrace.stack;
          }
        }
      } catch (error) {
        logger.warn('Failed to retrieve stored stack trace', { error });
      }
    }

    // If this URL shouldn't be tracked, pass through
    if (!shouldTrackUrl(url)) {
      return originalFetch(url, options);
    }

    // Get network debug store
    const store = window.__networkDebugStore__?.getState();
    if (!store) {
      logger.warn('Network debug store not available');
      return originalFetch(url, options);
    }

    const callId = generateId();
    const startTime = performance.now();

    // Get current page context if available (for calls with lost stack traces)
    const pageContext = typeof window !== 'undefined' && window.__currentPageContext__;

    // Process captured stack trace to extract application code
    const stackLines = capturedStack ? (() => {
      const allLines = capturedStack.split('\n').map(line => line.trim());

      // If we have a page context and very few frames (Octokit job queue), add context
      if (pageContext && allLines.length <= 10 && isGitHubApi) {
        allLines.unshift(`[Page Context] ${pageContext.page || 'unknown'} (${pageContext.component || 'unknown'})`);
      }

      // Helper to check if a line is application code
      const isApplicationCode = (line) => {
        // Page context lines are always included
        if (line.includes('[Page Context]')) return true;

        // Must be a stack frame
        if (!line.includes('at ') && !line.includes('http')) return false;

        // Exclude library/framework code
        if (!line || line.startsWith('Error')) return false;
        if (line.includes('fetchProxy.js')) return false;
        if (line.includes('octokitProxy.js')) return false;
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

      // If no application frames found, return raw stack for debugging
      if (filtered.length === 0 && allLines.length > 0) {
        logger.trace('[Fetch] No application frames found, using raw stack', {
          url: urlString.substring(0, 80),
          callType,
          totalFrames: allLines.length
        });
        return allLines;
      }

      if (filtered.length > 0) {
        logger.trace('[Fetch] Found application frames', {
          url: urlString.substring(0, 80),
          callType,
          applicationFrames: filtered.length
        });
      }

      return filtered.slice(0, 15);
    })() : [];

    // Only apply cache-busting to same-origin requests (not external APIs like GitHub)
    let finalUrl = url;
    let mergedOptions = { ...options };

    try {
      const urlObj = new URL(url, window.location.origin);
      const isSameOrigin = urlObj.origin === window.location.origin;

      if (isSameOrigin) {
        // Apply cache-busting headers for same-origin requests only
        const cacheBustingHeaders = getCacheBustingHeaders();
        mergedOptions = {
          ...options,
          headers: {
            ...options.headers,
            ...cacheBustingHeaders
          }
        };

        // Apply cache-busting to URL
        finalUrl = applyCacheBusting(url);
      }
    } catch (error) {
      // If URL parsing fails, use original URL and options
      logger.warn('Failed to parse URL for cache-busting', { url, error });
    }

    logger.trace('Intercepted fetch request', {
      callId,
      url: finalUrl,
      method: mergedOptions.method || 'GET',
      stackFrames: stackLines.length
    });

    try {
      // Make the actual request
      const response = await originalFetch(finalUrl, mergedOptions);
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Clone response to read body (original response must remain intact)
      const clonedResponse = response.clone();

      // Try to read response body for size calculation
      let responseSize = 0;
      try {
        const text = await clonedResponse.text();
        responseSize = new Blob([text]).size;
      } catch (error) {
        // If body can't be read (e.g., already consumed), estimate from content-length
        const contentLength = response.headers.get('content-length');
        if (contentLength) {
          responseSize = parseInt(contentLength, 10);
        }
      }

      // Check if cached
      const cached = checkIfCached(response);
      const cacheType = getCacheType(response);

      // Calculate request size
      const requestSize = options.body ? new Blob([options.body]).size : 0;

      // Get full URL
      const fullUrl = new URL(finalUrl, window.location.origin).toString();

      // Record the call
      store.recordCall({
        id: callId,
        timestamp: Date.now(),
        type: callType, // 'octokit' for GitHub API, 'fetch' for others
        method: mergedOptions.method || 'GET',
        url: fullUrl,
        route: store.currentRoute,
        loadPhase: store.currentLoadPhase,

        // Timing
        startTime,
        endTime,
        duration,

        // Size
        requestSize,
        responseSize,

        // Cache
        cached,
        cacheType,

        // Response
        status: response.status,
        success: response.ok,
        error: null,

        // Octokit-specific (for GitHub API calls)
        rateLimitRemaining: response.headers.get('x-ratelimit-remaining')
          ? parseInt(response.headers.get('x-ratelimit-remaining'), 10)
          : null,
        rateLimitReset: response.headers.get('x-ratelimit-reset')
          ? parseInt(response.headers.get('x-ratelimit-reset'), 10)
          : null,

        // Initiator tracking
        stackTrace: stackLines
      });

      logger.debug('Fetch call recorded', {
        callId,
        url: fullUrl,
        duration: `${duration.toFixed(2)}ms`,
        cached,
        status: response.status
      });

      return response;

    } catch (error) {
      const endTime = performance.now();
      const duration = endTime - startTime;

      // Get full URL for error recording
      const fullUrl = new URL(finalUrl, window.location.origin).toString();

      // Record the error
      store.recordCall({
        id: callId,
        timestamp: Date.now(),
        type: callType, // 'octokit' for GitHub API, 'fetch' for others
        method: mergedOptions.method || 'GET',
        url: fullUrl,
        route: store.currentRoute,
        loadPhase: store.currentLoadPhase,

        // Timing
        startTime,
        endTime,
        duration,

        // Size
        requestSize: options.body ? new Blob([options.body]).size : 0,
        responseSize: 0,

        // Cache
        cached: false,
        cacheType: null,

        // Response
        status: 0,
        success: false,
        error: error.message || 'Network error',

        // Octokit-specific
        rateLimitRemaining: null,
        rateLimitReset: null,

        // Initiator tracking
        stackTrace: stackLines
      });

      logger.warn('Fetch call failed', {
        callId,
        url: fullUrl,
        error: error.message,
        duration: `${duration.toFixed(2)}ms`
      });

      // Re-throw the error
      throw error;
    }
  };

  // Mark as wrapped to prevent double-wrapping
  window.fetch.__networkDebugWrapped__ = true;

  logger.info('Fetch proxy initialized successfully');
};

/**
 * Restore original fetch function
 * Useful for cleanup or disabling debug mode
 */
export const restoreOriginalFetch = () => {
  if (originalFetch && typeof window !== 'undefined') {
    window.fetch = originalFetch;
    delete window.fetch.__networkDebugWrapped__;
    logger.info('Original fetch function restored');
  }
};

export default {
  initializeFetchProxy,
  restoreOriginalFetch
};
