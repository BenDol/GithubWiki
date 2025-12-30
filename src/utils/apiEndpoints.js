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
  // Serverless context detection (no import.meta in Workers/Functions)
  if (typeof import.meta === 'undefined' || !import.meta.env) {
    // In serverless context, default to cloudflare (can be overridden)
    return 'cloudflare';
  }

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
      // In dev mode, check which dev server is running
      // VITE_DEV_PLATFORM set by dev script to indicate dev environment
      const devPlatform = (typeof import.meta !== 'undefined' && import.meta.env)
        ? import.meta.env.VITE_DEV_PLATFORM || 'cloudflare'
        : 'cloudflare';
      return devPlatform === 'cloudflare' ? '/api' : '/.netlify/functions';

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

/**
 * Get video-upload endpoint
 * @returns {string} - Endpoint URL
 */
export function getVideoUploadEndpoint() {
  return `${getFunctionsBaseUrl()}/video-upload`;
}

/**
 * Get display-name endpoint
 * @returns {string} - Endpoint URL
 */
export function getDisplayNameEndpoint() {
  return `${getFunctionsBaseUrl()}/display-name`;
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
if (typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV) {
  console.log('[Framework API Endpoints] VITE_DEV_PLATFORM:', import.meta.env.VITE_DEV_PLATFORM);
  console.log('[Framework API Endpoints] Platform detected:', detectPlatform());
  console.log('[Framework API Endpoints] Functions base URL:', getFunctionsBaseUrl());
  console.log('[Framework API Endpoints] OAuth base URL:', getOAuthBaseUrl());
}
