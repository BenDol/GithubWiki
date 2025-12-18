import { getOctokit, getAuthenticatedUser } from './api';
import { createAdminIssueWithBot, updateAdminIssueWithBot } from './botService';
import { detectCurrentBranch } from './branchNamespace';
import { getCacheValue, setCacheValue, clearCacheValue } from '../../utils/timeCache.js';

/**
 * GitHub Admin Service
 * Manages admins and banned users via GitHub issues
 * Uses bot service for secure token handling (similar to comments system)
 */

const ADMIN_LIST_LABEL = 'wiki-admin-list';
const BANNED_USERS_LABEL = 'wiki-ban-list';
const AUTOMATED_LABEL = 'automated';

/**
 * Check if a user is the repository owner
 * @param {string} username - Username to check
 * @param {string} owner - Repository owner
 * @returns {boolean} True if user is the owner
 */
export const isRepositoryOwner = (username, owner) => {
  return username.toLowerCase() === owner.toLowerCase();
};

/**
 * Get or create the admins list issue
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config for branch detection
 * @returns {Promise<Object>} Issue object containing admins list
 */
export const getOrCreateAdminsIssue = async (owner, repo, config) => {
  const octokit = getOctokit();

  // Detect current branch for namespace isolation
  const branch = await detectCurrentBranch(config);
  const branchLabel = `branch:${branch}`;

  try {
    // Search for existing admins issue using listForRepo (fast, reliable)
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: `${ADMIN_LIST_LABEL},${branchLabel}`,
      state: 'open',
      per_page: 1,
    });

    const existingIssue = issues.find(
      issue => issue.title === '[Admin List]'
    );

    if (existingIssue) {
      console.log(`[Admin] Found existing admin list issue #${existingIssue.number}`);
      return existingIssue;
    }

    // Create new admins issue using bot service
    console.log('[Admin] Creating admins list issue with bot...');
    const newIssue = await createAdminIssueWithBot(
      owner,
      repo,
      '[Admin List]',
      `🔐 **Wiki Administrators**\n\nThis issue stores the list of wiki administrators who have permission to manage users and content.\n\n**Admin List:**\n\`\`\`json\n[]\n\`\`\`\n\n---\n\n⚠️ **This issue is managed by the wiki bot.** Only the repository owner can modify the admin list via the Admin Panel.\n\n🤖 *This issue is managed by the wiki bot.*`,
      [ADMIN_LIST_LABEL, branchLabel, AUTOMATED_LABEL],
      true // Lock the issue
    );

    console.log(`[Admin] Created admins list issue #${newIssue.number}`);
    return newIssue;
  } catch (error) {
    console.error('Failed to get/create admins issue:', error);
    throw error;
  }
};

/**
 * Get or create the banned users issue
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config for branch detection
 * @returns {Promise<Object>} Issue object containing banned users list
 */
export const getOrCreateBannedUsersIssue = async (owner, repo, config) => {
  const octokit = getOctokit();

  // Detect current branch for namespace isolation
  const branch = await detectCurrentBranch(config);
  const branchLabel = `branch:${branch}`;

  try {
    // Search for existing banned users issue using listForRepo (fast, reliable)
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: `${BANNED_USERS_LABEL},${branchLabel}`,
      state: 'open',
      per_page: 1,
    });

    const existingIssue = issues.find(
      issue => issue.title === '[Ban List]'
    );

    if (existingIssue) {
      console.log(`[Admin] Found existing ban list issue #${existingIssue.number}`);
      return existingIssue;
    }

    // Create new banned users issue using bot service
    console.log('[Admin] Creating banned users issue with bot...');
    const newIssue = await createAdminIssueWithBot(
      owner,
      repo,
      '[Ban List]',
      `🚫 **Banned Users**\n\nThis issue stores the list of users who are banned from commenting and contributing to the wiki.\n\n**Banned Users:**\n\`\`\`json\n[]\n\`\`\`\n\n---\n\n⚠️ **This issue is managed by the wiki bot.** Repository owner and admins can manage the ban list via the Admin Panel.\n\n🤖 *This issue is managed by the wiki bot.*`,
      [BANNED_USERS_LABEL, branchLabel, AUTOMATED_LABEL],
      true // Lock the issue
    );

    console.log(`[Admin] Created banned users issue #${newIssue.number}`);
    return newIssue;
  } catch (error) {
    console.error('Failed to get/create banned users issue:', error);
    throw error;
  }
};

/**
 * Parse user list from issue body
 * @param {string} body - Issue body containing JSON list
 * @returns {Array<Object>} Array of user objects
 */
const parseUserListFromIssue = (body) => {
  try {
    // Extract JSON from code block
    const jsonMatch = body.match(/```json\n([\s\S]*?)\n```/);
    if (!jsonMatch) {
      console.warn('[Admin] No JSON found in issue body');
      return [];
    }

    const jsonStr = jsonMatch[1];
    const users = JSON.parse(jsonStr);
    return Array.isArray(users) ? users : [];
  } catch (error) {
    console.error('[Admin] Failed to parse user list:', error);
    return [];
  }
};

/**
 * Update user list in issue body
 * @param {string} body - Current issue body
 * @param {Array<Object>} users - New user list
 * @returns {string} Updated issue body
 */
const updateUserListInIssue = (body, users) => {
  const jsonStr = JSON.stringify(users, null, 2);
  return body.replace(
    /```json\n[\s\S]*?\n```/,
    `\`\`\`json\n${jsonStr}\n\`\`\``
  );
};

/**
 * Get list of admins
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config for branch detection
 * @returns {Promise<Array<Object>>} Array of admin objects
 */
export const getAdmins = async (owner, repo, config) => {
  try {
    const issue = await getOrCreateAdminsIssue(owner, repo, config);
    return parseUserListFromIssue(issue.body);
  } catch (error) {
    console.error('Failed to get admins:', error);
    return [];
  }
};

/**
 * Get list of banned users
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config for branch detection
 * @returns {Promise<Array<Object>>} Array of banned user objects
 */
export const getBannedUsers = async (owner, repo, config) => {
  try {
    const issue = await getOrCreateBannedUsersIssue(owner, repo, config);
    return parseUserListFromIssue(issue.body);
  } catch (error) {
    console.error('Failed to get banned users:', error);
    return [];
  }
};

/**
 * Check if user is an admin
 * @param {string} username - Username to check
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config for branch detection
 * @returns {Promise<boolean>} True if user is admin or owner
 */
export const isAdmin = async (username, owner, repo, config) => {
  // Owner is always admin
  if (isRepositoryOwner(username, owner)) {
    return true;
  }

  // Fetch user ID for comparison
  const octokit = getOctokit();
  let userId;
  try {
    const { data: userData } = await octokit.rest.users.getByUsername({
      username,
    });
    userId = userData.id;
  } catch (error) {
    console.warn(`[Admin] Failed to fetch user ID for ${username}:`, error);
    // Continue without userId, will fallback to username comparison
  }

  // Check admin list (prefer userId, fallback to username for backwards compatibility)
  const admins = await getAdmins(owner, repo, config);
  return admins.some(admin => {
    // Primary check: userId (immutable, survives username changes)
    if (userId && admin.userId && admin.userId === userId) {
      return true;
    }
    // Fallback: username (for old entries without userId)
    return admin.username.toLowerCase() === username.toLowerCase();
  });
};

/**
 * Check if user is banned
 * @param {string} username - Username to check
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config for branch detection
 * @returns {Promise<boolean>} True if user is banned
 */
export const isBanned = async (username, owner, repo, config) => {
  // Check cache first (10-minute TTL to reduce GitHub API calls)
  const cacheKey = `ban-check:${username}:${owner}/${repo}`;
  const cached = getCacheValue(cacheKey);
  if (cached !== null) {
    console.log(`[Admin] Ban check cache hit for ${username}`);
    return cached;
  }

  console.log(`[Admin] Ban check cache miss for ${username}, fetching from GitHub...`);

  // Fetch user ID for comparison
  const octokit = getOctokit();
  let userId;
  try {
    const { data: userData } = await octokit.rest.users.getByUsername({
      username,
    });
    userId = userData.id;
  } catch (error) {
    console.warn(`[Admin] Failed to fetch user ID for ${username}:`, error);
    // Continue without userId, will fallback to username comparison
  }

  // Check ban list (prefer userId, fallback to username for backwards compatibility)
  const bannedUsers = await getBannedUsers(owner, repo, config);
  const isBannedResult = bannedUsers.some(user => {
    // Primary check: userId (immutable, survives username changes)
    if (userId && user.userId && user.userId === userId) {
      return true;
    }
    // Fallback: username (for old entries without userId)
    return user.username.toLowerCase() === username.toLowerCase();
  });

  // Cache the result for 10 minutes (600000ms)
  setCacheValue(cacheKey, isBannedResult, 600000);
  console.log(`[Admin] Cached ban check result for ${username}: ${isBannedResult}`);

  return isBannedResult;
};

/**
 * Add admin (owner only)
 * @param {string} username - Username to add as admin
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} addedBy - Username of person adding admin
 * @param {Object} config - Wiki config for branch detection
 * @returns {Promise<Object>} Updated admins list
 */
export const addAdmin = async (username, owner, repo, addedBy, config) => {
  // Verify the person adding is the owner
  if (!isRepositoryOwner(addedBy, owner)) {
    throw new Error('Only the repository owner can add admins');
  }

  const issue = await getOrCreateAdminsIssue(owner, repo, config);
  const admins = parseUserListFromIssue(issue.body);

  // Fetch user info from GitHub to get their ID
  const octokit = getOctokit();
  let userId;
  try {
    const { data: userData } = await octokit.rest.users.getByUsername({
      username,
    });
    userId = userData.id;
    console.log(`[Admin] Fetched userId ${userId} for ${username}`);
  } catch (error) {
    console.error(`[Admin] Failed to fetch user ID for ${username}:`, error);
    throw new Error(`User ${username} not found on GitHub`);
  }

  // Check if user is banned
  const userIsBanned = await isBanned(username, owner, repo, config);
  if (userIsBanned) {
    console.warn(`[Admin] Cannot add banned user ${username} as admin`);
    throw new Error(`Cannot add ${username} as admin - user is banned`);
  }

  // Check if already admin (by userId or username)
  const alreadyAdmin = admins.some(admin => {
    if (admin.userId && admin.userId === userId) {
      return true;
    }
    return admin.username.toLowerCase() === username.toLowerCase();
  });

  if (alreadyAdmin) {
    throw new Error(`${username} is already an admin`);
  }

  // Add new admin with userId
  const newAdmin = {
    username,
    userId, // Store GitHub user ID (immutable, survives username changes)
    addedBy,
    addedAt: new Date().toISOString(),
  };

  admins.push(newAdmin);

  // Update issue using bot service
  const newBody = updateUserListInIssue(issue.body, admins);
  await updateAdminIssueWithBot(owner, repo, issue.number, newBody);

  console.log(`[Admin] Added admin: ${username} (ID: ${userId})`);
  return admins;
};

/**
 * Remove admin (owner only)
 * @param {string} username - Username to remove from admins
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} removedBy - Username of person removing admin
 * @param {Object} config - Wiki config for branch detection
 * @returns {Promise<Object>} Updated admins list
 */
export const removeAdmin = async (username, owner, repo, removedBy, config) => {
  // Verify the person removing is the owner
  if (!isRepositoryOwner(removedBy, owner)) {
    throw new Error('Only the repository owner can remove admins');
  }

  const issue = await getOrCreateAdminsIssue(owner, repo, config);
  const admins = parseUserListFromIssue(issue.body);

  // Fetch user ID for comparison
  const octokit = getOctokit();
  let userId;
  try {
    const { data: userData } = await octokit.rest.users.getByUsername({
      username,
    });
    userId = userData.id;
    console.log(`[Admin] Fetched userId ${userId} for ${username}`);
  } catch (error) {
    console.warn(`[Admin] Failed to fetch user ID for ${username}:`, error);
    // Continue without userId, will use username comparison
  }

  // Filter out the admin (by userId or username)
  const updatedAdmins = admins.filter(admin => {
    // Primary check: userId (immutable, survives username changes)
    if (userId && admin.userId && admin.userId === userId) {
      return false; // Remove this admin
    }
    // Fallback: username (for old entries without userId)
    if (admin.username.toLowerCase() === username.toLowerCase()) {
      return false; // Remove this admin
    }
    return true; // Keep this admin
  });

  if (updatedAdmins.length === admins.length) {
    throw new Error(`${username} is not an admin`);
  }

  // Update issue using bot service
  const newBody = updateUserListInIssue(issue.body, updatedAdmins);
  await updateAdminIssueWithBot(owner, repo, issue.number, newBody);

  console.log(`[Admin] Removed admin: ${username} (ID: ${userId})`);
  return updatedAdmins;
};

/**
 * Ban user (owner or admin)
 * @param {string} username - Username to ban
 * @param {string} reason - Reason for ban
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} bannedBy - Username of person banning
 * @param {Object} config - Wiki config for branch detection
 * @returns {Promise<Object>} Updated banned users list
 */
export const banUser = async (username, reason, owner, repo, bannedBy, config) => {
  // Verify the person banning is admin or owner
  const userIsAdmin = await isAdmin(bannedBy, owner, repo, config);
  if (!userIsAdmin) {
    throw new Error('Only repository owner or admins can ban users');
  }

  // Cannot ban the owner
  if (isRepositoryOwner(username, owner)) {
    throw new Error('Cannot ban the repository owner');
  }

  // Cannot ban other admins (unless you're the owner)
  const targetIsAdmin = await isAdmin(username, owner, repo, config);
  if (targetIsAdmin && !isRepositoryOwner(bannedBy, owner)) {
    throw new Error('Only the repository owner can ban admins');
  }

  // Fetch user info from GitHub to get their ID (do this once upfront)
  const octokit = getOctokit();
  let userId;
  try {
    const { data: userData } = await octokit.rest.users.getByUsername({
      username,
    });
    userId = userData.id;
    console.log(`[Admin] Fetched userId ${userId} for ${username}`);
  } catch (error) {
    console.error(`[Admin] Failed to fetch user ID for ${username}:`, error);
    throw new Error(`User ${username} not found on GitHub`);
  }

  // If target is an admin and owner is banning them, remove them from admin list first
  if (targetIsAdmin && isRepositoryOwner(bannedBy, owner)) {
    console.log(`[Admin] Target is an admin, removing from admin list before banning...`);
    try {
      // Get admin list issue
      const adminIssue = await getOrCreateAdminsIssue(owner, repo, config);
      const admins = parseUserListFromIssue(adminIssue.body);

      // Remove from admin list (by userId or username)
      const updatedAdmins = admins.filter(admin => {
        if (userId && admin.userId && admin.userId === userId) {
          return false;
        }
        if (admin.username.toLowerCase() === username.toLowerCase()) {
          return false;
        }
        return true;
      });

      // Update admin list
      if (updatedAdmins.length < admins.length) {
        const newAdminBody = updateUserListInIssue(adminIssue.body, updatedAdmins);
        await updateAdminIssueWithBot(owner, repo, adminIssue.number, newAdminBody);
        console.log(`[Admin] Removed ${username} from admin list before banning`);
      }
    } catch (error) {
      console.error(`[Admin] Failed to remove admin before banning:`, error);
      throw new Error(`Failed to remove ${username} from admin list: ${error.message}`);
    }
  }

  const issue = await getOrCreateBannedUsersIssue(owner, repo, config);
  const bannedUsers = parseUserListFromIssue(issue.body);

  // Check if already banned (by userId or username)
  const alreadyBanned = bannedUsers.some(user => {
    if (user.userId && user.userId === userId) {
      return true;
    }
    return user.username.toLowerCase() === username.toLowerCase();
  });

  if (alreadyBanned) {
    throw new Error(`${username} is already banned`);
  }

  // Add banned user with userId
  const bannedUser = {
    username,
    userId, // Store GitHub user ID (immutable, survives username changes)
    reason,
    bannedBy,
    bannedAt: new Date().toISOString(),
  };

  bannedUsers.push(bannedUser);

  // Update issue using bot service
  const newBody = updateUserListInIssue(issue.body, bannedUsers);
  await updateAdminIssueWithBot(owner, repo, issue.number, newBody);

  // Clear cache for this user so next check gets fresh data
  const cacheKey = `ban-check:${username}:${owner}/${repo}`;
  clearCacheValue(cacheKey);
  console.log(`[Admin] Cleared ban check cache for ${username}`);

  console.log(`[Admin] Banned user: ${username} (ID: ${userId})`);
  return bannedUsers;
};

/**
 * Unban user (owner or admin)
 * @param {string} username - Username to unban
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} unbannedBy - Username of person unbanning
 * @param {Object} config - Wiki config for branch detection
 * @returns {Promise<Object>} Updated banned users list
 */
export const unbanUser = async (username, owner, repo, unbannedBy, config) => {
  // Verify the person unbanning is admin or owner
  const userIsAdmin = await isAdmin(unbannedBy, owner, repo, config);
  if (!userIsAdmin) {
    throw new Error('Only repository owner or admins can unban users');
  }

  const issue = await getOrCreateBannedUsersIssue(owner, repo, config);
  const bannedUsers = parseUserListFromIssue(issue.body);

  // Fetch user ID for comparison
  const octokit = getOctokit();
  let userId;
  try {
    const { data: userData } = await octokit.rest.users.getByUsername({
      username,
    });
    userId = userData.id;
    console.log(`[Admin] Fetched userId ${userId} for ${username}`);
  } catch (error) {
    console.warn(`[Admin] Failed to fetch user ID for ${username}:`, error);
    // Continue without userId, will use username comparison
  }

  // Filter out the unbanned user (by userId or username)
  const updatedBannedUsers = bannedUsers.filter(user => {
    // Primary check: userId (immutable, survives username changes)
    if (userId && user.userId && user.userId === userId) {
      return false; // Remove this user
    }
    // Fallback: username (for old entries without userId)
    if (user.username.toLowerCase() === username.toLowerCase()) {
      return false; // Remove this user
    }
    return true; // Keep this user
  });

  if (updatedBannedUsers.length === bannedUsers.length) {
    throw new Error(`${username} is not banned`);
  }

  // Update issue using bot service
  const newBody = updateUserListInIssue(issue.body, updatedBannedUsers);
  await updateAdminIssueWithBot(owner, repo, issue.number, newBody);

  // Clear cache for this user so next check gets fresh data
  const cacheKey = `ban-check:${username}:${owner}/${repo}`;
  clearCacheValue(cacheKey);
  console.log(`[Admin] Cleared ban check cache for ${username}`);

  console.log(`[Admin] Unbanned user: ${username} (ID: ${userId})`);
  return updatedBannedUsers;
};

/**
 * Check current user's admin status
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config for branch detection
 * @returns {Promise<Object>} Object with isOwner, isAdmin, username
 */
export const getCurrentUserAdminStatus = async (owner, repo, config) => {
  try {
    const user = await getAuthenticatedUser();
    const username = user.login;

    const isOwner = isRepositoryOwner(username, owner);
    const userIsAdmin = isOwner || await isAdmin(username, owner, repo, config);

    return {
      isOwner,
      isAdmin: userIsAdmin,
      username,
    };
  } catch (error) {
    return {
      isOwner: false,
      isAdmin: false,
      username: null,
    };
  }
};
