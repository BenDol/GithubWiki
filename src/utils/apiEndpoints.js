/**
 * API Endpoint Configuration (Framework)
 * Provides correct endpoints for OAuth and bot operations
 * Supports both Netlify and Cloudflare Pages deployments
 *
 * Platform Detection:
 * - VITE_PLATFORM env variable (set at build time)
 * - Netlify: Functions at /.netlify/functions/
 * - Cloudflare: Functions at /api/
 * - Development: Uses Vite proxy (/api/github/*)
 */

/**
 * Detect the current platform
 * @returns {'netlify' | 'cloudflare' | 'dev'} - Current platform
 */
function detectPlatform() {
  // Development mode
  if (import.meta.env.DEV) {
    return 'dev';
  }

  // Check for explicit platform configuration
  const explicitPlatform = import.meta.env.VITE_PLATFORM;
  if (explicitPlatform === 'netlify' || explicitPlatform === 'cloudflare') {
    return explicitPlatform;
  }

  // Auto-detect based on environment
  // Cloudflare Pages sets CF_PAGES=1
  if (import.meta.env.VITE_CF_PAGES === '1') {
    return 'cloudflare';
  }

  // Default to Netlify for backward compatibility
  return 'netlify';
}

/**
 * Get OAuth proxy base URL
 * In development, OAuth goes through Vite proxy to avoid CORS
 * In production, uses platform-specific functions
 * @returns {string} - OAuth base URL
 */
function getOAuthBaseUrl() {
  const platform = detectPlatform();

  switch (platform) {
    case 'dev':
      // Vite proxy for OAuth in development
      return '/api/github';

    case 'cloudflare':
      return '/api';

    case 'netlify':
    default:
      return '/.netlify/functions';
  }
}

/**
 * Get base URL for serverless functions
 * @returns {string} - Base URL
 */
function getFunctionsBaseUrl() {
  const platform = detectPlatform();

  switch (platform) {
    case 'dev':
      // In development with Netlify dev server, functions are at /.netlify/functions
      return '/.netlify/functions';

    case 'cloudflare':
      return '/api';

    case 'netlify':
    default:
      return '/.netlify/functions';
  }
}

// ===== OAUTH ENDPOINTS =====

/**
 * Get device-code endpoint (OAuth)
 * @returns {string} - Endpoint URL
 */
export function getDeviceCodeEndpoint() {
  return `${getOAuthBaseUrl()}/device-code`;
}

/**
 * Get access-token endpoint (OAuth)
 * @returns {string} - Endpoint URL
 */
export function getAccessTokenEndpoint() {
  return `${getOAuthBaseUrl()}/access-token`;
}

// ===== GITHUB BOT ENDPOINTS =====

/**
 * Get github-bot endpoint
 * @returns {string} - Endpoint URL
 */
export function getGithubBotEndpoint() {
  return `${getFunctionsBaseUrl()}/github-bot`;
}

/**
 * Get create-comment-issue endpoint (legacy)
 * @returns {string} - Endpoint URL
 */
export function getCreateCommentIssueEndpoint() {
  return `${getFunctionsBaseUrl()}/create-comment-issue`;
}

// ===== PLATFORM INFO =====

/**
 * Get current platform name
 * @returns {'netlify' | 'cloudflare' | 'dev'} - Platform name
 */
export function getPlatform() {
  return detectPlatform();
}

/**
 * Check if running on Netlify
 * @returns {boolean}
 */
export function isNetlify() {
  return detectPlatform() === 'netlify';
}

/**
 * Check if running on Cloudflare Pages
 * @returns {boolean}
 */
export function isCloudflare() {
  return detectPlatform() === 'cloudflare';
}

/**
 * Check if running in development
 * @returns {boolean}
 */
export function isDevelopment() {
  return detectPlatform() === 'dev';
}

// ===== DEBUG =====

// Log platform detection in development
if (import.meta.env.DEV) {
  console.log('[Framework API Endpoints] Platform detected:', detectPlatform());
  console.log('[Framework API Endpoints] Functions base URL:', getFunctionsBaseUrl());
  console.log('[Framework API Endpoints] OAuth base URL:', getOAuthBaseUrl());
}
