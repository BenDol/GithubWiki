import { getOctokit } from './api';
import { getBuildTypeRoute, getRegisteredBuildTypes } from '../../utils/buildTypeRegistry.js';
import { retryPlugin } from './octokitRetryPlugin.js';
import { getGithubBotEndpoint } from '../../utils/apiEndpoints.js';

/**
 * Build Share Service
 * URL shortening system for sharing builds using GitHub Issues as storage
 *
 * This service is fully generic and works with any build types registered via buildTypeRegistry.
 * Parent projects must register their build types before using this service.
 *
 * @see buildTypeRegistry.js for build type registration
 *
 * Architecture:
 * - Single issue per repository with label "build-share-index"
 * - Issue body contains a checksum-to-comment-ID map
 * - Each build is stored as a comment on the issue
 * - Checksum ensures no duplicate builds are stored
 * - In-memory cache for loaded builds (immutable, cached forever)
 *
 * Caching:
 * - Builds are cached by checksum after first load
 * - Cache never expires (builds are immutable)
 * - Reduces GitHub API calls and improves load times
 * - Cache persists for the session lifetime
 *
 * Issue Body Format:
 * ```
 * # Build Share Index
 *
 * [checksum1]=comment-id-1
 * [checksum2]=comment-id-2
 * ```
 *
 * Comment Format:
 * ```json
 * {
 *   "type": "battle-loadouts" | "skill-builds" | "spirit-builds",
 *   "checksum": "abc123...",
 *   "data": { ... build data ... },
 *   "createdAt": "ISO date"
 * }
 * ```
 */

const BUILD_SHARE_LABEL = 'build-share-index';
const BUILD_SHARE_TITLE = '[Build Share Index]';
const INDEX_HEADER = '# Build Share Index\n\n';

/**
 * In-memory cache for loaded builds
 * Key: checksum, Value: { type, data, createdAt }
 * Builds are immutable, so no expiration needed
 */
const buildCache = new Map();

/**
 * In-flight request tracking to prevent race conditions
 * Prevents multiple concurrent calls from creating duplicate index issues
 */
const pendingIndexIssueRequests = new Map();

/**
 * Generate SHA-256 checksum for build data
 * @param {Object} buildData - Build data object
 * @param {number} length - Length of checksum to return (default: 12, max: 64)
 * @returns {Promise<string>} Hex checksum string
 */
export async function generateChecksum(buildData, length = 12) {
  // Helper function to recursively sort object keys
  const sortObjectKeys = (obj) => {
    if (Array.isArray(obj)) {
      return obj.map(sortObjectKeys);
    }
    if (obj !== null && typeof obj === 'object') {
      return Object.keys(obj)
        .sort()
        .reduce((sorted, key) => {
          sorted[key] = sortObjectKeys(obj[key]);
          return sorted;
        }, {});
    }
    return obj;
  };

  // Sort all keys recursively for consistent hashing
  const sortedData = sortObjectKeys(buildData);

  // Normalize JSON (no whitespace)
  const normalized = JSON.stringify(sortedData);

  // Generate SHA-256 hash
  const encoder = new TextEncoder();
  const data = encoder.encode(normalized);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);

  // Convert to hex string
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  const hashHex = hashArray.map(b => b.toString(16).padStart(2, '0')).join('');

  // Return truncated hash (default 12 chars = 48 bits)
  // This is safe for thousands of builds (Git uses 7-8 chars for commits)
  return hashHex.substring(0, Math.min(length, 64));
}

/**
 * Parse the index map from issue body
 * @param {string} body - Issue body text
 * @returns {Map<string, number>} Map of checksums to comment IDs
 */
function parseIndexMap(body) {
  const map = new Map();

  if (!body) return map;

  // Match lines like: [checksum]=comment-id
  // Checksum can be 8-64 hex characters (we use 12 by default)
  const regex = /\[([a-f0-9]{8,64})\]=(\d+)/gi;
  let match;

  while ((match = regex.exec(body)) !== null) {
    const checksum = match[1];
    const commentId = parseInt(match[2], 10);
    map.set(checksum, commentId);
  }

  return map;
}

/**
 * Serialize index map to issue body format
 * @param {Map<string, number>} map - Map of checksums to comment IDs
 * @returns {string} Formatted issue body
 */
function serializeIndexMap(map) {
  let body = INDEX_HEADER;

  for (const [checksum, commentId] of map.entries()) {
    body += `[${checksum}]=${commentId}\n`;
  }

  return body;
}

/**
 * Get or create the build share index issue
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {boolean} bustCache - Force fresh fetch from API
 * @returns {Promise<Object>} Issue object with { number, body }
 */
async function getOrCreateIndexIssue(owner, repo, bustCache = false) {
  const cacheKey = `${owner}/${repo}`;

  try {
    // Bust cache if requested
    if (bustCache) {
      pendingIndexIssueRequests.delete(cacheKey);
    }

    // Cache the issue number globally to avoid repeated searches
    if (!bustCache && window.__BUILD_SHARE_INDEX_NUMBER) {
      // Fetch issue directly by number (bypasses list cache)
      if (import.meta.env.DEV && import.meta.env.VITE_WIKI_BOT_TOKEN) {
        const { Octokit } = await import('octokit');
        const OctokitWithRetry = Octokit.plugin(retryPlugin);
        const botToken = import.meta.env.VITE_WIKI_BOT_TOKEN;
        const octokit = new OctokitWithRetry({
          auth: botToken,
          userAgent: 'GitHub-Wiki-Bot/1.0',
          throttle: { enabled: false }, // Disable built-in throttling
        });

        const { data: issue } = await octokit.rest.issues.get({
          owner,
          repo,
          issue_number: window.__BUILD_SHARE_INDEX_NUMBER,
        });

        return {
          number: issue.number,
          body: issue.body || '',
        };
      }
    }

    // Check if there's already a request in-flight for this repo
    if (pendingIndexIssueRequests.has(cacheKey)) {
      console.log('[Build Share] Waiting for in-flight index issue request...');
      return pendingIndexIssueRequests.get(cacheKey);
    }

    // Create promise placeholder and track it IMMEDIATELY (before any async work)
    // This prevents race condition where multiple calls check pendingIndexIssueRequests
    // at the same time before any of them set it
    let resolvePromise, rejectPromise;
    const requestPromise = new Promise((resolve, reject) => {
      resolvePromise = resolve;
      rejectPromise = reject;
    });

    // Set in map IMMEDIATELY
    pendingIndexIssueRequests.set(cacheKey, requestPromise);

    // Now do the actual async work
    (async () => {
      let hasError = false;
      try {
        // Search for existing index issue
        let issues = [];

        if (import.meta.env.DEV && import.meta.env.VITE_WIKI_BOT_TOKEN) {
          // Development: Use bot token directly
          const { Octokit } = await import('octokit');
          const OctokitWithRetry = Octokit.plugin(retryPlugin);
          const botToken = import.meta.env.VITE_WIKI_BOT_TOKEN;
          const octokit = new OctokitWithRetry({
            auth: botToken,
            userAgent: 'GitHub-Wiki-Bot/1.0',
            throttle: { enabled: false }, // Disable built-in throttling
          });

          const { data } = await octokit.rest.issues.listForRepo({
            owner,
            repo,
            labels: BUILD_SHARE_LABEL,
            state: 'open',
            per_page: 100, // Fetch more to detect duplicates
          });

          issues = data;
        } else {
          // Production: Use Netlify Function
          const response = await fetch(getGithubBotEndpoint(), {
            method: 'POST',
            headers: {
              'Content-Type': 'application/json',
            },
            body: JSON.stringify({
              action: 'list-issues',
              owner,
              repo,
              labels: BUILD_SHARE_LABEL,
              state: 'open',
              per_page: 100, // Fetch more to detect duplicates
            }),
          });

          const data = await response.json();

          if (!response.ok) {
            throw new Error(data.message || data.error || 'Failed to list issues');
          }

          issues = data.issues || [];
        }

        if (issues.length > 0) {
          // If multiple index issues exist (race condition), use the oldest one
          if (issues.length > 1) {
            console.warn('[Build Share] ⚠️ Multiple index issues found!', {
              count: issues.length,
              numbers: issues.map(i => i.number)
            });
            // Sort by issue number (oldest first)
            issues.sort((a, b) => a.number - b.number);
          }

          // Cache the issue number for future use
          window.__BUILD_SHARE_INDEX_NUMBER = issues[0].number;

          resolvePromise({
            number: issues[0].number,
            body: issues[0].body || '',
          });
          return;
        }

        // Create new index issue using bot service
        const { createCommentIssueWithBot } = await import('./botService.js');

        console.log('[Build Share] Creating new index issue...');

        const issue = await createCommentIssueWithBot(
          owner,
          repo,
          BUILD_SHARE_TITLE,
          INDEX_HEADER,
          [BUILD_SHARE_LABEL, 'automated'],
          true // preventDuplicates - check for existing issue before creating
        );

        console.log('[Build Share] ✓ Index issue created:', issue.number);

        // Cache the issue number for future use
        window.__BUILD_SHARE_INDEX_NUMBER = issue.number;

        resolvePromise({
          number: issue.number,
          body: issue.body || INDEX_HEADER,
        });
      } catch (error) {
        console.error('[Build Share] Error getting/creating index issue:', error);
        hasError = true;
        rejectPromise(error);
        // On error, clear immediately so retry is possible
        pendingIndexIssueRequests.delete(cacheKey);
      } finally {
        // On success, keep in-flight entry for 5 seconds to prevent race conditions during GitHub's eventual consistency
        // This ensures concurrent requests during this window get the same result
        if (!hasError) {
          setTimeout(() => {
            pendingIndexIssueRequests.delete(cacheKey);
          }, 5000);
        }
      }
    })();

    // Promise already tracked above (line 199) - return it
    return requestPromise;
  } catch (error) {
    console.error('[Build Share] Error in getOrCreateIndexIssue:', error);
    throw error;
  }
}

/**
 * Save a build and get its short URL checksum
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} buildType - Build type ("battle-loadouts", "skill-builds", "spirit-builds")
 * @param {Object} buildData - Build data object
 * @returns {Promise<string>} Checksum to use in URL
 */
export async function saveBuild(owner, repo, buildType, buildData) {
  try {
    console.log('[Build Share] Saving build...', { buildType });

    // Generate short checksum (12 chars) and full checksum for verification
    const shortChecksum = await generateChecksum(buildData, 12);
    const fullChecksum = await generateChecksum(buildData, 64);
    console.log('[Build Share] Generated checksum:', shortChecksum);

    // Get or create index issue
    const indexIssue = await getOrCreateIndexIssue(owner, repo);
    console.log('[Build Share] Index issue:', indexIssue.number);

    // Parse existing index map
    const indexMap = parseIndexMap(indexIssue.body);

    // Check if build already exists
    if (indexMap.has(shortChecksum)) {
      const commentId = indexMap.get(shortChecksum);
      console.log('[Build Share] ✓ Build already exists, reusing comment:', commentId);
      return shortChecksum;
    }

    // Create comment with build data using bot service
    const commentBody = JSON.stringify({
      type: buildType,
      checksum: shortChecksum,
      fullChecksum: fullChecksum, // Store full hash for verification
      data: buildData,
      createdAt: new Date().toISOString(),
    }, null, 2);

    console.log('[Build Share] Creating comment with build data...');

    // Import bot service dynamically to avoid circular dependencies
    const { createCommentOnIssueWithBot } = await import('./botService.js');

    const comment = await createCommentOnIssueWithBot(
      owner,
      repo,
      indexIssue.number,
      commentBody
    );

    console.log('[Build Share] ✓ Comment created:', comment.id);

    // Update index map
    indexMap.set(shortChecksum, comment.id);
    const newBody = serializeIndexMap(indexMap);

    // Update issue body with new map using bot
    console.log('[Build Share] Updating index map...');

    const { updateIssueWithBot } = await import('./botService.js');

    await updateIssueWithBot(
      owner,
      repo,
      indexIssue.number,
      newBody
    );

    // Bust the index cache to ensure next load gets fresh data
    if (window.__BUILD_SHARE_INDEX_NUMBER) {
      console.log('[Build Share] Busting index cache after update');
      delete window.__BUILD_SHARE_INDEX_NUMBER;
    }

    // Also clear pending request cache to force fresh fetch
    const cacheKey = `${owner}/${repo}`;
    pendingIndexIssueRequests.delete(cacheKey);
    console.log('[Build Share] Cleared pending request cache');

    console.log('[Build Share] ✓ Build saved successfully!');

    return shortChecksum;
  } catch (error) {
    console.error('[Build Share] Error saving build:', error);
    throw error;
  }
}

/**
 * Load a build by its checksum
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} checksum - Build checksum from URL
 * @returns {Promise<Object>} Build data object with { type, data }
 */
export async function loadBuild(owner, repo, checksum) {
  try {
    console.log('[Build Share] Loading build...', { checksum });

    // Check cache first
    if (buildCache.has(checksum)) {
      console.log('[Build Share] ✓ Build loaded from cache!');
      return buildCache.get(checksum);
    }

    console.log('[Build Share] Cache miss, fetching from GitHub...');

    // Get index issue
    const indexIssue = await getOrCreateIndexIssue(owner, repo);

    // Parse index map
    const indexMap = parseIndexMap(indexIssue.body);

    // Find comment ID for checksum
    let commentId = indexMap.get(checksum);

    // If not found, try refreshing the index (might be cached)
    if (!commentId) {
      console.warn('[Build Share] Checksum not found in cached index, refreshing...');

      // Bust cache and fetch fresh index
      const freshIndexIssue = await getOrCreateIndexIssue(owner, repo, true);
      const freshIndexMap = parseIndexMap(freshIndexIssue.body);

      commentId = freshIndexMap.get(checksum);

      if (!commentId) {
        console.error('[Build Share] Build not found for checksum:', checksum);
        throw new Error(`Build not found for checksum: ${checksum}`);
      }

      console.log('[Build Share] ✓ Found after cache refresh');
    }

    // Fetch comment data using bot token to avoid rate limits
    let comment;

    if (import.meta.env.DEV && import.meta.env.VITE_WIKI_BOT_TOKEN) {
      // Development: Use bot token directly
      const { Octokit } = await import('octokit');
      const OctokitWithRetry = Octokit.plugin(retryPlugin);
      const botToken = import.meta.env.VITE_WIKI_BOT_TOKEN;
      const octokit = new OctokitWithRetry({
        auth: botToken,
        userAgent: 'GitHub-Wiki-Bot/1.0',
        throttle: { enabled: false }, // Disable built-in throttling
      });

      const { data } = await octokit.rest.issues.getComment({
        owner,
        repo,
        comment_id: commentId,
      });

      comment = data;
    } else {
      // Production: Use serverless function
      const response = await fetch(getGithubBotEndpoint(), {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'get-comment',
          owner,
          repo,
          commentId,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[Build Share] Error response:', errorText);
        throw new Error(`Failed to fetch comment: ${response.status} ${response.statusText}`);
      }

      const data = await response.json();
      comment = data.comment;
    }

    // Parse build data from comment body
    const buildInfo = JSON.parse(comment.body);

    // Verify checksum matches
    if (buildInfo.checksum !== checksum) {
      console.warn('[Build Share] ⚠️ Checksum mismatch!', {
        expected: checksum,
        actual: buildInfo.checksum,
      });
    }

    console.log('[Build Share] ✓ Build loaded successfully!');

    const result = {
      type: buildInfo.type,
      data: buildInfo.data,
      createdAt: buildInfo.createdAt,
    };

    // Cache the build (immutable, so cache forever)
    buildCache.set(checksum, result);

    return result;
  } catch (error) {
    console.error('[Build Share] Error loading build:', error);
    console.error('[Build Share] Error stack:', error.stack);
    throw error;
  }
}

/**
 * Generate a shareable URL for a build
 * @param {string} baseUrl - Base URL of the site
 * @param {string} buildType - Build type (must be registered via registerBuildTypes)
 * @param {string} checksum - Build checksum
 * @returns {string} Shareable URL
 */
export function generateShareUrl(baseUrl, buildType, checksum) {
  // Get route from registry (parent project registers build types in main.jsx)
  const route = getBuildTypeRoute(buildType);

  if (!route) {
    const registeredTypes = Object.keys(getRegisteredBuildTypes());
    console.error('[Build Share] Unknown build type:', buildType);
    console.error('[Build Share] Registered types:', registeredTypes);
    throw new Error(`Unknown build type: ${buildType}. Registered types: ${registeredTypes.join(', ')}. Make sure to register build types in main.jsx using registerBuildTypes().`);
  }

  return `${baseUrl}#${route}?share=${checksum}`;
}

/**
 * Clear all build share caches
 * Useful for debugging or manual cache management
 */
export function clearBuildCache() {
  const buildCacheSize = buildCache.size;
  const pendingRequestsSize = pendingIndexIssueRequests.size;

  buildCache.clear();
  pendingIndexIssueRequests.clear();

  if (window.__BUILD_SHARE_INDEX_NUMBER) {
    delete window.__BUILD_SHARE_INDEX_NUMBER;
  }

  console.log(`[Build Share] All caches cleared. Removed ${buildCacheSize} cached builds and ${pendingRequestsSize} pending requests.`);
}

/**
 * Get cache statistics for all build share caches
 * @returns {Object} Cache statistics
 */
export function getCacheStats() {
  return {
    buildCache: {
      size: buildCache.size,
      checksums: Array.from(buildCache.keys()),
    },
    pendingRequests: {
      size: pendingIndexIssueRequests.size,
      cacheKeys: Array.from(pendingIndexIssueRequests.keys()),
    },
    indexIssueNumber: window.__BUILD_SHARE_INDEX_NUMBER || null,
  };
}

