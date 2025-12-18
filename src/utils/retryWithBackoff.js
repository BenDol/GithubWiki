import React from 'react';

/**
 * Exponential Backoff Retry Utility
 *
 * Automatically retries failed operations with exponential backoff
 * Especially useful for handling API rate limits (403, 429)
 *
 * @example
 * const result = await retryWithBackoff(
 *   async () => await octokit.rest.issues.listComments(...),
 *   {
 *     maxRetries: 3,
 *     initialDelay: 1000,
 *     maxDelay: 30000,
 *     onRetry: (attempt, delay) => console.log(`Retry ${attempt} in ${delay}ms`)
 *   }
 * );
 */

/**
 * Default retry configuration
 */
const DEFAULT_CONFIG = {
  maxRetries: 3,           // Maximum number of retry attempts
  initialDelay: 1000,      // Initial delay in ms (1 second)
  maxDelay: 30000,         // Maximum delay in ms (30 seconds)
  backoffMultiplier: 2,    // Exponential backoff multiplier
  retryableStatuses: [403, 429, 500, 502, 503, 504], // HTTP status codes to retry
  onRetry: null,           // Callback: (attempt, delay, error) => void
};

/**
 * Sleep for a specified duration
 * @param {number} ms - Milliseconds to sleep
 * @returns {Promise<void>}
 */
const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));

/**
 * Check if an error is retryable
 * @param {Error} error - Error object
 * @param {Array<number>} retryableStatuses - HTTP status codes to retry
 * @returns {boolean}
 */
const isRetryableError = (error, retryableStatuses) => {
  // Check for HTTP status code
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
 * Calculate delay for next retry attempt
 * @param {number} attempt - Current attempt number (0-indexed)
 * @param {number} initialDelay - Initial delay in ms
 * @param {number} maxDelay - Maximum delay in ms
 * @param {number} backoffMultiplier - Exponential backoff multiplier
 * @returns {number} Delay in milliseconds
 */
const calculateDelay = (attempt, initialDelay, maxDelay, backoffMultiplier) => {
  // Exponential backoff: initialDelay * (multiplier ^ attempt)
  const exponentialDelay = initialDelay * Math.pow(backoffMultiplier, attempt);

  // Add jitter (±25%) to prevent thundering herd
  const jitter = exponentialDelay * 0.25 * (Math.random() * 2 - 1);
  const delayWithJitter = exponentialDelay + jitter;

  // Cap at maxDelay
  return Math.min(delayWithJitter, maxDelay);
};

/**
 * Retry an async operation with exponential backoff
 *
 * @param {Function} operation - Async function to retry
 * @param {Object} config - Retry configuration
 * @param {number} config.maxRetries - Maximum number of retry attempts (default: 3)
 * @param {number} config.initialDelay - Initial delay in ms (default: 1000)
 * @param {number} config.maxDelay - Maximum delay in ms (default: 30000)
 * @param {number} config.backoffMultiplier - Exponential backoff multiplier (default: 2)
 * @param {Array<number>} config.retryableStatuses - HTTP status codes to retry (default: [403, 429, 500, 502, 503, 504])
 * @param {Function} config.onRetry - Callback called before each retry: (attempt, delay, error) => void
 * @returns {Promise<any>} Result of the operation
 * @throws {Error} Last error if all retries fail
 */
export const retryWithBackoff = async (operation, config = {}) => {
  const {
    maxRetries,
    initialDelay,
    maxDelay,
    backoffMultiplier,
    retryableStatuses,
    onRetry,
  } = { ...DEFAULT_CONFIG, ...config };

  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      // Execute the operation
      const result = await operation();

      // Dispatch success event if this was a retry after rate limit
      if (attempt > 0 && lastError && (lastError.status === 403 || lastError.status === 429)) {
        const event = new CustomEvent('rate-limit-success', {
          detail: {
            message: 'Request succeeded after retry',
            attempts: attempt + 1
          }
        });
        window.dispatchEvent(event);
      }

      return result;
    } catch (error) {
      lastError = error;

      // Check if we should retry
      const shouldRetry = attempt < maxRetries && isRetryableError(error, retryableStatuses);

      if (!shouldRetry) {
        // No more retries or error is not retryable
        throw error;
      }

      // Calculate delay for next attempt
      const delay = calculateDelay(attempt, initialDelay, maxDelay, backoffMultiplier);

      // Dispatch rate limit event if it's a rate limit error
      if (error.status === 403 || error.status === 429) {
        const event = new CustomEvent('rate-limit-hit', {
          detail: {
            message: error.status === 403
              ? 'GitHub API rate limit reached. Retrying...'
              : 'Too many requests. Retrying...',
            retrying: true,
            attempt: attempt + 1,
            maxRetries,
            delay: Math.round(delay),
            error: {
              status: error.status,
              message: error.message
            }
          }
        });
        window.dispatchEvent(event);
      }

      // Call onRetry callback if provided
      if (onRetry) {
        onRetry(attempt + 1, delay, error);
      }

      // Log retry attempt
      console.warn(`[Retry] Attempt ${attempt + 1}/${maxRetries} failed. Retrying in ${Math.round(delay)}ms...`, {
        status: error.status,
        message: error.message,
      });

      // Wait before next attempt
      await sleep(delay);
    }
  }

  // All retries failed
  throw lastError;
};

/**
 * Retry with default configuration optimized for GitHub API rate limits
 *
 * @param {Function} operation - Async function to retry
 * @param {Function} onRetry - Optional callback: (attempt, delay, error) => void
 * @returns {Promise<any>} Result of the operation
 */
export const retryGitHubAPI = async (operation, onRetry = null) => {
  return retryWithBackoff(operation, {
    maxRetries: 3,
    initialDelay: 2000,    // Start with 2 seconds for rate limits
    maxDelay: 60000,       // Max 1 minute wait
    backoffMultiplier: 2,
    retryableStatuses: [403, 429, 500, 502, 503, 504],
    onRetry,
  });
};

/**
 * React hook for retry with backoff
 * Provides state management for retry operations
 *
 * @returns {Object} { execute, isRetrying, retryAttempt, error }
 */
export const useRetryWithBackoff = () => {
  const [isRetrying, setIsRetrying] = React.useState(false);
  const [retryAttempt, setRetryAttempt] = React.useState(0);
  const [error, setError] = React.useState(null);

  const execute = async (operation, config = {}) => {
    setIsRetrying(true);
    setRetryAttempt(0);
    setError(null);

    try {
      const result = await retryWithBackoff(operation, {
        ...config,
        onRetry: (attempt, delay, err) => {
          setRetryAttempt(attempt);
          if (config.onRetry) {
            config.onRetry(attempt, delay, err);
          }
        },
      });
      return result;
    } catch (err) {
      setError(err);
      throw err;
    } finally {
      setIsRetrying(false);
      setRetryAttempt(0);
    }
  };

  return { execute, isRetrying, retryAttempt, error };
};

export default retryWithBackoff;
