/**
 * Octokit Retry Plugin with Rate Limit Detection
 *
 * Automatically intercepts all GitHub API requests and applies
 * exponential backoff retry on rate limit errors (403, 429).
 *
 * Features:
 * - Transparent to calling code (requests just work after retry)
 * - Dispatches events for UI notifications
 * - Per-request opt-out via skipRetry option
 * - Configurable retry parameters
 *
 * Usage:
 *   import { Octokit } from 'octokit';
 *   import { retryPlugin } from './octokitRetryPlugin';
 *
 *   const octokit = new Octokit({
 *     auth: token,
 *     plugins: [retryPlugin]
 *   });
 *
 *   // Automatically retries on rate limit
 *   const { data } = await octokit.rest.issues.list(...);
 *
 *   // Opt-out per request
 *   const { data } = await octokit.rest.issues.list({
 *     ...params,
 *     request: { skipRetry: true }
 *   });
 */

// Default retry configuration
const DEFAULT_CONFIG = {
  maxRetries: 3,
  initialDelay: 2000,       // 2 seconds
  maxDelay: 60000,          // 1 minute
  backoffMultiplier: 2,
  retryableStatuses: [403, 429, 500, 502, 503, 504],
};

/**
 * Sleep for specified duration
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Calculate exponential backoff delay with jitter
 */
const calculateDelay = (attempt, config) => {
  const exponentialDelay = config.initialDelay * Math.pow(config.backoffMultiplier, attempt);
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  const delayWithJitter = exponentialDelay + jitter;
  return Math.min(delayWithJitter, config.maxDelay);
};

/**
 * Check if error is retryable
 */
const isRetryableError = (error, retryableStatuses) => {
  // Check HTTP status
  if (error.status && retryableStatuses.includes(error.status)) {
    return true;
  }

  // Check for network errors
  if (error.message && (
    error.message.includes('network') ||
    error.message.includes('timeout') ||
    error.message.includes('ECONNRESET') ||
    error.message.includes('ETIMEDOUT')
  )) {
    return true;
  }

  return false;
};

/**
 * Dispatch rate limit event for UI notifications
 */
const dispatchRateLimitEvent = (type, detail) => {
  const event = new CustomEvent(type, { detail });
  window.dispatchEvent(event);
};

/**
 * Octokit plugin for automatic retry with rate limit detection
 */
export const retryPlugin = (octokit, options = {}) => {
  const config = { ...DEFAULT_CONFIG, ...options };

  console.log('[Octokit Retry Plugin] Initializing plugin on octokit instance');
  console.log('[Octokit Retry Plugin] Original request type:', typeof octokit.request);
  console.log('[Octokit Retry Plugin] Original request is function:', typeof octokit.request === 'function');

  // Wrap the request method to add retry logic
  const originalRequest = octokit.request;

  const requestWithRetry = async function(route, requestOptions = {}) {
    console.log('[Octokit Retry Plugin] Intercepting request:', route);

    // Check if retry is disabled for this request
    if (requestOptions.request?.skipRetry === true) {
      console.log('[Octokit Retry Plugin] Retry skipped for request:', route);
      return originalRequest.call(this, route, requestOptions);
    }

    let lastError;
    const startTime = Date.now();

    for (let attempt = 0; attempt <= config.maxRetries; attempt++) {
      try {
        // Execute the request
        const result = await originalRequest.call(this, route, requestOptions);

        // Dispatch success event if this was a retry after rate limit
        if (attempt > 0 && lastError && (lastError.status === 403 || lastError.status === 429)) {
          console.log(`[Octokit Retry Plugin] Request succeeded after ${attempt} retries (${Date.now() - startTime}ms)`);
          dispatchRateLimitEvent('rate-limit-success', {
            message: 'Request succeeded after retry',
            attempts: attempt + 1,
            route,
            duration: Date.now() - startTime
          });
        }

        return result;
      } catch (error) {
        lastError = error;

        // Check if we should retry
        const shouldRetry = attempt < config.maxRetries && isRetryableError(error, config.retryableStatuses);

        if (!shouldRetry) {
          // No more retries or error is not retryable
          console.error(`[Octokit Retry Plugin] Request failed permanently:`, {
            route,
            status: error.status,
            message: error.message,
            attempts: attempt + 1
          });

          // Dispatch final failure event for rate limits
          if (error.status === 403 || error.status === 429) {
            dispatchRateLimitEvent('rate-limit-hit', {
              message: error.status === 403
                ? 'GitHub API rate limit exceeded. Please try again later.'
                : 'Too many requests. Please slow down.',
              retrying: false,
              attempt: 0,
              maxRetries: 0,
              route,
              error: {
                status: error.status,
                message: error.message
              }
            });
          }

          throw error;
        }

        // Calculate delay for next attempt
        const delay = calculateDelay(attempt, config);

        // Dispatch rate limit event
        if (error.status === 403 || error.status === 429) {
          console.warn(`[Octokit Retry Plugin] Rate limit hit, retry ${attempt + 1}/${config.maxRetries} in ${Math.round(delay)}ms`, {
            route,
            status: error.status
          });

          dispatchRateLimitEvent('rate-limit-hit', {
            message: error.status === 403
              ? 'GitHub API rate limit reached. Retrying...'
              : 'Too many requests. Retrying...',
            retrying: true,
            attempt: attempt + 1,
            maxRetries: config.maxRetries,
            delay: Math.round(delay),
            route,
            error: {
              status: error.status,
              message: error.message
            }
          });
        } else {
          console.warn(`[Octokit Retry Plugin] Retryable error, attempt ${attempt + 1}/${config.maxRetries}`, {
            route,
            status: error.status,
            message: error.message
          });
        }

        // Wait before next attempt
        await sleep(delay);
      }
    }

    // All retries failed
    throw lastError;
  };

  // Copy all properties from originalRequest to preserve methods like defaults(), endpoint(), etc.
  Object.keys(originalRequest).forEach(key => {
    requestWithRetry[key] = originalRequest[key];
  });

  // Preserve prototype chain
  Object.setPrototypeOf(requestWithRetry, Object.getPrototypeOf(originalRequest));

  // Replace octokit.request with our wrapped version
  octokit.request = requestWithRetry;

  console.log('[Octokit Retry Plugin] ✓ Plugin installed successfully');
  console.log('[Octokit Retry Plugin] Has auth:', !!octokit.auth);
  console.log('[Octokit Retry Plugin] Request function replaced:', octokit.request === requestWithRetry);

  return octokit;
};

/**
 * Helper to create Octokit instance with retry plugin
 */
export const createOctokitWithRetry = (options = {}) => {
  const { Octokit } = require('octokit');
  return new Octokit({
    ...options,
    plugins: [retryPlugin, ...(options.plugins || [])]
  });
};

export default retryPlugin;
