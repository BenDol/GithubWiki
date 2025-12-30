/**
 * GitHub OAuth authentication service
 * Uses Device Flow for secure authentication without client secret
 */

import { getDeviceCodeEndpoint, getAccessTokenEndpoint, getPlatform } from '../../utils/apiEndpoints.js';
import { getCacheValue, setCacheValue, getSessionCacheValue, setSessionCacheValue } from '../../utils/timeCache.js';
import { cacheName } from '../../utils/storageManager.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('Auth');

// Helper to safely access environment (works in both browser and serverless)
const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  return undefined;
};

const GITHUB_CLIENT_ID = getEnv('VITE_GITHUB_CLIENT_ID');

// Use platform-aware endpoints (supports Netlify, Cloudflare Pages, and Dev)
const DEVICE_CODE_URL = getDeviceCodeEndpoint();
const TOKEN_URL = getAccessTokenEndpoint();
const USER_URL = 'https://api.github.com/user';

// Debug: Log environment variables (only in browser context)
if (typeof import.meta !== 'undefined' && import.meta.env) {
  logger.debug('GitHub Auth Configuration', {
    VITE_GITHUB_CLIENT_ID: getEnv('VITE_GITHUB_CLIENT_ID'),
    PLATFORM: getPlatform(),
    DEV_MODE: getEnv('DEV'),
    DEVICE_CODE_URL,
    TOKEN_URL,
  });
}

/**
 * Test GitHub connectivity
 */
const testGitHubConnectivity = async () => {
  try {
    logger.debug('Testing GitHub connectivity...');
    const response = await fetch('https://api.github.com/zen', { method: 'GET' });
    const text = await response.text();
    logger.debug('GitHub connectivity test SUCCESS', { text });
    return true;
  } catch (error) {
    logger.error('GitHub connectivity test FAILED', { error });
    return false;
  }
};

/**
 * Start GitHub Device Flow authentication
 * Returns device code and user verification URL
 */
export const initiateDeviceFlow = async () => {
  logger.debug('Attempting to initiate device flow with Client ID', { clientId: GITHUB_CLIENT_ID });

  if (!GITHUB_CLIENT_ID) {
    logger.error('GITHUB_CLIENT_ID is undefined or empty!');
    logger.error('All env vars', import.meta.env);
    throw new Error('GitHub Client ID not configured. Please set VITE_GITHUB_CLIENT_ID in .env.local');
  }

  // Test connectivity first
  await testGitHubConnectivity();

  let response;
  try {
    response = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        // Use public_repo instead of repo for more limited access
        // This only grants access to public repositories (not private ones)
        // Removed 'workflow' scope for security - fork may be slightly out of date
        scope: 'public_repo read:user user:email',
      }),
    });
  } catch (fetchError) {
    logger.error('Fetch error details', {
      error: fetchError,
      name: fetchError.name,
      message: fetchError.message
    });
    throw new Error(
      `Network error: Unable to connect to GitHub. This could be due to:\n` +
      `1. CORS blocking (browser security)\n` +
      `2. Network connectivity issues\n` +
      `3. Ad blocker or security extension\n` +
      `4. Firewall blocking GitHub API\n\n` +
      `Original error: ${fetchError.message}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    logger.error('GitHub API Error', { errorText });
    throw new Error(`Failed to initiate device flow: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Log the response for debugging
  logger.debug('Device flow initiated', {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
  });

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval,
  };
};

/**
 * Poll for access token
 * Continuously checks if user has authorized the device
 */
export const pollForToken = async (deviceCode, interval = 5) => {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  const data = await response.json();

  // Handle different response states
  if (data.error) {
    if (data.error === 'authorization_pending') {
      // User hasn't authorized yet, caller should retry
      return { pending: true };
    } else if (data.error === 'slow_down') {
      // Need to slow down polling
      return { pending: true, slowDown: true };
    } else if (data.error === 'expired_token') {
      throw new Error('Device code expired. Please try again.');
    } else if (data.error === 'access_denied') {
      throw new Error('Access denied by user.');
    } else {
      throw new Error(data.error_description || 'Authentication failed');
    }
  }

  // Successfully got token
  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    scope: data.scope,
  };
};

/**
 * Wait for user to authorize and get token
 * Polls GitHub until user completes authorization
 */
export const waitForAuthorization = async (deviceCode, expiresIn, interval = 5) => {
  const startTime = Date.now();
  const expiresAt = startTime + expiresIn * 1000;
  let pollInterval = interval * 1000;

  while (Date.now() < expiresAt) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    try {
      const result = await pollForToken(deviceCode, interval);

      if (result.pending) {
        // If we need to slow down, increase interval
        if (result.slowDown) {
          pollInterval += 1000;
        }
        continue;
      }

      // Got token!
      return result.accessToken;
    } catch (error) {
      throw error;
    }
  }

  throw new Error('Authorization timed out. Please try again.');
};

/**
 * Retry a fetch operation with exponential backoff
 * @param {Function} fn - Async function to retry
 * @param {number} maxRetries - Maximum attempts
 * @returns {Promise<any>}
 */
const retryFetch = async (fn, maxRetries = 3) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      // Don't retry on auth errors
      if (error.status === 401 || error.status === 403) {
        throw error;
      }

      // Check if network error
      const isNetworkError =
        error.message === 'Failed to fetch' ||
        error.message.includes('NetworkError') ||
        error.message.includes('fetch');

      if (isNetworkError && attempt < maxRetries) {
        const delay = Math.pow(2, attempt - 1) * 1000;
        logger.warn(`Network error, retrying in ${delay}ms...`, { attempt, maxRetries });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      throw error;
    }
  }

  throw lastError;
};

/**
 * Fetch user information from GitHub
 * Also fetches email from /user/emails if not available in user object
 * (needed when user has email set to private in GitHub settings)
 * Includes automatic retry on network errors
 *
 * Caching: Results cached in sessionStorage for 20 minutes to prevent duplicate API calls
 * sessionStorage is cleared when tab/window closes (doesn't persist across sessions)
 */
export const fetchGitHubUser = async (token) => {
  // Check session cache first (20 minute TTL)
  const cacheKey = cacheName('github_user_data', 'current');
  const cachedUser = getSessionCacheValue(cacheKey);

  if (cachedUser) {
    logger.debug('Using cached user data from sessionStorage (20min TTL)');
    return cachedUser;
  }

  // Cache miss - fetch from API
  logger.debug('Session cache miss - fetching user data from GitHub API');

  return retryFetch(async () => {
    const response = await fetch(USER_URL, {
      headers: {
        'Authorization': `Bearer ${token}`,
        'Accept': 'application/vnd.github.v3+json',
      },
    });

    if (!response.ok) {
      throw new Error('Failed to fetch user information');
    }

    const user = await response.json();

  // If email is null (private email setting), fetch from /user/emails
  if (!user.email) {
    try {
      const emailCacheKey = cacheName('github_user_emails', user.id);

      // Check cache first (30 day TTL since emails rarely change)
      const cachedEmail = getCacheValue(emailCacheKey);
      if (cachedEmail) {
        user.email = cachedEmail;
        logger.debug('Using cached primary email from localStorage');
      } else {
        // Cache miss - fetch from API
        const emailsResponse = await fetch('https://api.github.com/user/emails', {
          headers: {
            'Authorization': `Bearer ${token}`,
            'Accept': 'application/vnd.github.v3+json',
          },
        });

        if (emailsResponse.ok) {
          const emails = await emailsResponse.json();
          // Find primary verified email
          const primaryEmail = emails.find(e => e.primary && e.verified);
          if (primaryEmail && primaryEmail.email) {
            user.email = primaryEmail.email;

            // Cache for 30 days (30 * 24 * 60 * 60 * 1000 ms)
            // Only cache if we actually got an email (don't cache empty responses)
            const thirtyDaysMs = 30 * 24 * 60 * 60 * 1000;
            setCacheValue(emailCacheKey, primaryEmail.email, thirtyDaysMs);

            logger.debug('Fetched and cached primary email from /user/emails (private email setting detected)');
          } else if (emails.length === 0) {
            logger.warn('No emails found in /user/emails response (not caching)');
          } else {
            logger.warn('No primary verified email found (not caching)');
          }
        }
      }
    } catch (error) {
      logger.warn('Failed to fetch user emails', { error: error.message });
    }
  }

    // Cache the complete user data (with email) for 20 minutes in sessionStorage
    const twentyMinutesMs = 20 * 60 * 1000;
    const userCacheKey = cacheName('github_user_data', 'current');
    setSessionCacheValue(userCacheKey, user, twentyMinutesMs);
    logger.debug('Cached user data in sessionStorage (20min TTL)');

    return user;
  });
};

/**
 * Encrypt token before storing in localStorage
 * Basic encryption to avoid storing plain text tokens
 */
export const encryptToken = (token) => {
  // Simple base64 encoding with a salt
  // In production, use a proper encryption library
  const salt = 'wiki-auth-salt-v1';
  return btoa(`${salt}:${token}`);
};

/**
 * Decrypt token from localStorage
 */
export const decryptToken = (encryptedToken) => {
  try {
    const decoded = atob(encryptedToken);
    const [salt, token] = decoded.split(':');

    if (salt !== 'wiki-auth-salt-v1') {
      throw new Error('Invalid token format');
    }

    return token;
  } catch (error) {
    logger.error('Failed to decrypt token', { error });
    return null;
  }
};

/**
 * Validate token by making a test API call
 * Retries on network errors (not 401/403)
 * @param {string} token - Access token to validate
 * @param {number} maxRetries - Maximum retry attempts (default: 3)
 * @returns {Promise<{valid: boolean, user?: object, error?: string}>}
 */
export const validateToken = async (token, maxRetries = 3) => {
  let lastError;

  for (let attempt = 1; attempt <= maxRetries; attempt++) {
    try {
      logger.debug(`Validating token (attempt ${attempt}/${maxRetries})...`);
      const user = await fetchGitHubUser(token);
      logger.debug('Token validation successful');
      return { valid: true, user };
    } catch (error) {
      lastError = error;

      // Check if it's a network error (not an auth error)
      const isNetworkError =
        error.message === 'Failed to fetch' ||
        error.message.includes('NetworkError') ||
        error.message.includes('fetch') ||
        error.name === 'TypeError';

      // Don't retry on authentication errors (401/403)
      const isAuthError = error.status === 401 || error.status === 403;

      if (isAuthError) {
        logger.error('Token validation failed - authentication error', {
          status: error.status,
          message: error.message
        });
        return { valid: false, error: error.message };
      }

      if (isNetworkError && attempt < maxRetries) {
        // Exponential backoff: 1s, 2s, 4s
        const delay = Math.pow(2, attempt - 1) * 1000;
        logger.warn(`Network error during token validation, retrying in ${delay}ms...`, {
          attempt,
          maxRetries,
          error: error.message
        });
        await new Promise(resolve => setTimeout(resolve, delay));
        continue;
      }

      // Last attempt failed or non-retryable error
      logger.error('Token validation failed after all retries', {
        attempts: attempt,
        error: error.message,
        isNetworkError
      });
    }
  }

  return { valid: false, error: lastError.message };
};
