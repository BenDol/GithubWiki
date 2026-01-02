import { getOctokit, deduplicatedRequest } from './api';

/**
 * GitHub permissions and repository access operations
 *
 * Handles username changes:
 * - Tracks user ID to username mapping
 * - Automatically invalidates old permission cache entries when username changes detected
 */

/**
 * Check user's permission level on a repository
 * OPTIMIZED: Uses cache with 10-minute TTL and de-duplicates concurrent requests
 * Automatically handles username changes by tracking user IDs
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - Username to check
 * @param {number} [userId] - Optional user ID for tracking username changes
 * @returns {Promise<string>} Permission level: 'admin', 'write', 'read', 'none'
 */
export const getUserPermission = async (owner, repo, username, userId = null) => {
  // Try to get store, but don't fail if unavailable
  let store = null;
  try {
    const githubDataStoreModule = await import('../../store/githubDataStore');
    if (githubDataStoreModule?.useGitHubDataStore && typeof githubDataStoreModule.useGitHubDataStore.getState === 'function') {
      store = githubDataStoreModule.useGitHubDataStore.getState();
    } else {
      console.warn('[Permissions] githubDataStore module loaded but useGitHubDataStore.getState is not available');
    }
  } catch (err) {
    console.warn('[Permissions] Could not access githubDataStore (will continue without cache):', err.message);
  }

  const cacheKey = `${owner}/${repo}/${username}`;

  // Track username changes if user ID provided (if store is available)
  if (userId && store) {
    store.updateUserMapping(userId, username);
  }

  // Check cache first (if store is available)
  if (store) {
    const cached = store.getCachedPermission(cacheKey);
    if (cached) {
      console.log(`[Permissions] ✓ Cache hit for ${username}: ${cached}`);
      return cached;
    }
    console.log(`[Permissions] ✗ Cache miss for ${username} - checking API`);
  } else {
    console.log(`[Permissions] No cache available - checking API`);
  }

  // Use de-duplication to prevent concurrent duplicate requests
  const dedupKey = `getUserPermission:${cacheKey}`;

  return deduplicatedRequest(dedupKey, async () => {
    // Double-check cache in case another request completed while we were waiting (if store is available)
    if (store) {
      const recentCache = store.getCachedPermission(cacheKey);
      if (recentCache) {
        console.log(`[Permissions] ✓ Cache populated by concurrent request`);
        return recentCache;
      }
    }

    const octokit = getOctokit();
    if (store) {
      store.incrementAPICall();
    }

    let permission;

    try {
      console.log(`[Permissions] Checking ${username}'s permission on ${owner}/${repo}`);

      const { data } = await octokit.rest.repos.getCollaboratorPermissionLevel({
        owner,
        repo,
        username,
      });

      permission = data.permission; // 'admin', 'write', 'read', 'none'
      console.log(`[Permissions] ${username} has '${permission}' permission`);
    } catch (error) {
      if (error.status === 404) {
        console.log(`[Permissions] ${username} has no access to ${owner}/${repo} (404)`);
        permission = 'none';
      } else if (error.status === 403) {
        // 403 means user cannot check permissions, which means they don't have push access
        // This is the expected behavior for users without write access
        console.log(`[Permissions] ${username} cannot check permissions (no push access) - assuming 'read' or 'none'`);

        if (store) {
          store.incrementAPICall(); // Count the fallback call
        }

        // Try to check if repo is accessible at all by getting repo info
        try {
          await octokit.rest.repos.get({ owner, repo });
          console.log(`[Permissions] ${username} can view the repository - has 'read' permission`);
          permission = 'read';
        } catch (repoError) {
          if (repoError.status === 404) {
            console.log(`[Permissions] ${username} cannot view the repository - has 'none' permission`);
            permission = 'none';
          } else {
            // If we get another error, assume 'read' (can authenticate but no push access)
            console.log(`[Permissions] Assuming 'read' permission for ${username}`);
            permission = 'read';
          }
        }
      } else {
        throw error;
      }
    }

    // Cache the permission level (if store is available)
    if (store) {
      store.cachePermission(cacheKey, permission);
      console.log(`[Permissions] Cached permission for ${username}: ${permission}`);
    }

    return permission;
  });
};

/**
 * Check if user has write access to repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - Username to check
 * @param {number} [userId] - Optional user ID for tracking username changes
 * @returns {Promise<boolean>} True if user has write or admin access
 */
export const hasWriteAccess = async (owner, repo, username, userId = null) => {
  const permission = await getUserPermission(owner, repo, username, userId);
  return permission === 'write' || permission === 'admin';
};

/**
 * Check if user has admin access to repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - Username to check
 * @param {number} [userId] - Optional user ID for tracking username changes
 * @returns {Promise<boolean>} True if user has admin access
 */
export const hasAdminAccess = async (owner, repo, username, userId = null) => {
  const permission = await getUserPermission(owner, repo, username, userId);
  return permission === 'admin';
};
