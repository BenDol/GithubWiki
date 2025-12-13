import { getOctokit } from './api';

/**
 * GitHub permissions and repository access operations
 */

/**
 * Check user's permission level on a repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - Username to check
 * @returns {Promise<string>} Permission level: 'admin', 'write', 'read', 'none'
 */
export const getUserPermission = async (owner, repo, username) => {
  const octokit = getOctokit();

  try {
    console.log(`[Permissions] Checking ${username}'s permission on ${owner}/${repo}`);

    const { data } = await octokit.rest.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username,
    });

    console.log(`[Permissions] ${username} has '${data.permission}' permission`);
    return data.permission; // 'admin', 'write', 'read', 'none'
  } catch (error) {
    if (error.status === 404) {
      console.log(`[Permissions] ${username} has no access to ${owner}/${repo} (404)`);
      return 'none';
    }

    if (error.status === 403) {
      // 403 means user cannot check permissions, which means they don't have push access
      // This is the expected behavior for users without write access
      console.log(`[Permissions] ${username} cannot check permissions (no push access) - assuming 'read' or 'none'`);

      // Try to check if repo is accessible at all by getting repo info
      try {
        await octokit.rest.repos.get({ owner, repo });
        console.log(`[Permissions] ${username} can view the repository - has 'read' permission`);
        return 'read';
      } catch (repoError) {
        if (repoError.status === 404) {
          console.log(`[Permissions] ${username} cannot view the repository - has 'none' permission`);
          return 'none';
        }
        // If we get another error, assume 'read' (can authenticate but no push access)
        console.log(`[Permissions] Assuming 'read' permission for ${username}`);
        return 'read';
      }
    }

    throw error;
  }
};

/**
 * Check if user has write access to repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - Username to check
 * @returns {Promise<boolean>} True if user has write or admin access
 */
export const hasWriteAccess = async (owner, repo, username) => {
  const permission = await getUserPermission(owner, repo, username);
  return permission === 'write' || permission === 'admin';
};

/**
 * Check if user has admin access to repository
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - Username to check
 * @returns {Promise<boolean>} True if user has admin access
 */
export const hasAdminAccess = async (owner, repo, username) => {
  const permission = await getUserPermission(owner, repo, username);
  return permission === 'admin';
};
