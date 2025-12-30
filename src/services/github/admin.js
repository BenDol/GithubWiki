import { getOctokit, getAuthenticatedUser } from './api';
import { createAdminIssueWithBot, updateAdminIssueWithBot } from './botService';
import { detectCurrentBranch } from './branchNamespace';
import { getCacheValue, setCacheValue, clearCacheValue } from '../../utils/timeCache.js';
import { cacheName } from '../../utils/storageManager';
import { getCachedUserId } from './userCache.js';

/**
 * GitHub Admin Service
 * Manages admins and banned users via GitHub issues
 * Uses bot service for secure token handling (similar to comments system)
 */

const ADMIN_LIST_LABEL = 'wiki-admin-list';
const BANNED_USERS_LABEL = 'wiki-ban-list';
const AUTOMATED_LABEL = 'automated';

// In-flight request tracking to prevent race conditions
const pendingAdminIssueRequests = new Map();
const pendingBanIssueRequests = new Map();

/**
 * Check if a user is the repository owner
 * @param {number} userId - User ID to check
 * @param {string} owner - Repository owner username
 * @param {string} repo - Repository name
 * @returns {Promise<boolean>} True if user is the owner
 */
export const isRepositoryOwner = async (userId, owner, repo) => {
  try {
    // Get repository info to get owner's user ID
    const octokit = getOctokit();
    const { data: repoData } = await octokit.rest.repos.get({
      owner,
      repo
    });

    const ownerUserId = repoData.owner.id;
    console.log('[Admin] Owner check:', { userId, ownerUserId, match: userId === ownerUserId });
    return userId === ownerUserId;
  } catch (error) {
    console.error('[Admin] Failed to fetch repository owner ID:', error);
    // Fallback: return false for security
    return false;
  }
};

/**
 * Get or create the admins list issue
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config for branch detection
 * @returns {Promise<Object>} Issue object containing admins list
 */
export const getOrCreateAdminsIssue = async (owner, repo, config) => {
  // Detect current branch for namespace isolation
  const branch = await detectCurrentBranch(config);
  const branchLabel = `branch:${branch}`;
  const cacheKey = `${owner}/${repo}/${branch}`;
  console.log(`[Admin] getOrCreateAdminsIssue called - branch: ${branch}, cacheKey: ${cacheKey}`);

  // Check cache first (1-minute TTL to reduce GitHub API calls and prevent race conditions)
  const cached = getCacheValue(cacheName('admin_issue', cacheKey));
  if (cached) {
    console.log(`[Admin] Using cached admin list issue #${cached.number}`);
    return cached;
  }

  // Check if there's already a request in-flight for this key
  if (pendingAdminIssueRequests.has(cacheKey)) {
    console.log('[Admin] Waiting for in-flight admin list issue request...');
    return pendingAdminIssueRequests.get(cacheKey);
  }

  // Create promise placeholder and track it IMMEDIATELY (before any async work)
  // This prevents race condition where multiple calls check pendingAdminIssueRequests
  // at the same time before any of them set it
  let resolvePromise, rejectPromise;
  const requestPromise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  // Set in map IMMEDIATELY
  pendingAdminIssueRequests.set(cacheKey, requestPromise);

  // Now do the actual async work
  (async () => {
    try {
      const octokit = getOctokit();

      // Search for existing admins issue using listForRepo (fast, reliable)
      console.log(`[Admin] Searching for admin list with labels: "${ADMIN_LIST_LABEL},${branchLabel}" in ${owner}/${repo}`);
      const { data: issues } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        labels: `${ADMIN_LIST_LABEL},${branchLabel}`,
        state: 'open',
        per_page: 1,
      });
      console.log(`[Admin] Search returned ${issues.length} issue(s)`);
      if (issues.length > 0) {
        console.log(`[Admin] Found issues:`, issues.map(i => ({ number: i.number, title: i.title, labels: i.labels.map(l => l.name) })));
      }

      const existingIssue = issues.find(
        issue => issue.title === '[Admin List]'
      );

      if (existingIssue) {
        // Security: Verify issue was created by wiki bot (admin issues are bot-managed)
        const botUsername = import.meta.env.VITE_WIKI_BOT_USERNAME;
        if (existingIssue.user.login !== botUsername) {
          console.warn(`[Admin] Security: Admin list issue created by ${existingIssue.user.login}, expected ${botUsername}`);
          throw new Error('Invalid admin list issue - not created by bot');
        }
        console.log(`[Admin] Found existing admin list issue #${existingIssue.number}`);

        // Cache for 1 minute
        setCacheValue(cacheName('admin_issue', cacheKey), existingIssue, 60000);
        resolvePromise(existingIssue);
        return;
      }

      // Create new admins issue using bot service
      console.log(`[Admin] Creating admins list issue with bot... Labels: [${ADMIN_LIST_LABEL}, ${branchLabel}, ${AUTOMATED_LABEL}]`);
      const newIssue = await createAdminIssueWithBot(
        owner,
        repo,
        '[Admin List]',
        `🔐 **Wiki Administrators**\n\nThis issue stores the list of wiki administrators who have permission to manage users and content.\n\n**Admin List:**\n\`\`\`json\n[]\n\`\`\`\n\n---\n\n⚠️ **This issue is managed by the wiki bot.** Only the repository owner can modify the admin list via the Admin Panel.\n\n🤖 *This issue is managed by the wiki bot.*`,
        [ADMIN_LIST_LABEL, branchLabel, AUTOMATED_LABEL],
        true // Lock the issue
      );

      console.log(`[Admin] Created admins list issue #${newIssue.number}`);

      // Cache for 1 minute
      setCacheValue(cacheName('admin_issue', cacheKey), newIssue, 60000);

      resolvePromise(newIssue);
    } catch (error) {
      console.error('Failed to get/create admins issue:', error);
      rejectPromise(error);
    } finally {
      // Keep in-flight entry for 5 seconds after completion to prevent race conditions during GitHub's eventual consistency
      setTimeout(() => {
        pendingAdminIssueRequests.delete(cacheKey);
      }, 5000);
    }
  })();

  // Promise already tracked above (line 69) - return it
  return requestPromise;
};

/**
 * Get or create the banned users issue
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} config - Wiki config for branch detection
 * @returns {Promise<Object>} Issue object containing banned users list
 */
export const getOrCreateBannedUsersIssue = async (owner, repo, config) => {
  // Detect current branch for namespace isolation
  const branch = await detectCurrentBranch(config);
  const branchLabel = `branch:${branch}`;
  const cacheKey = `${owner}/${repo}/${branch}`;
  console.log(`[Admin] getOrCreateBannedUsersIssue called - branch: ${branch}, cacheKey: ${cacheKey}`);

  // Check cache first (1-minute TTL to reduce GitHub API calls and prevent race conditions)
  const cached = getCacheValue(cacheName('ban_issue', cacheKey));
  if (cached) {
    console.log(`[Admin] Using cached ban list issue #${cached.number}`);
    return cached;
  }

  // Check if there's already a request in-flight for this key
  if (pendingBanIssueRequests.has(cacheKey)) {
    console.log('[Admin] Waiting for in-flight ban list issue request...');
    return pendingBanIssueRequests.get(cacheKey);
  }

  // Create promise placeholder and track it IMMEDIATELY (before any async work)
  // This prevents race condition where multiple calls check pendingBanIssueRequests
  // at the same time before any of them set it
  let resolvePromise, rejectPromise;
  const requestPromise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  // Set in map IMMEDIATELY
  pendingBanIssueRequests.set(cacheKey, requestPromise);

  // Now do the actual async work
  (async () => {
    try {
      const octokit = getOctokit();

      // Search for existing banned users issue using listForRepo (fast, reliable)
      console.log(`[Admin] Searching for ban list with labels: "${BANNED_USERS_LABEL},${branchLabel}" in ${owner}/${repo}`);
      const { data: issues } = await octokit.rest.issues.listForRepo({
        owner,
        repo,
        labels: `${BANNED_USERS_LABEL},${branchLabel}`,
        state: 'open',
        per_page: 1,
      });
      console.log(`[Admin] Search returned ${issues.length} issue(s)`);
      if (issues.length > 0) {
        console.log(`[Admin] Found issues:`, issues.map(i => ({ number: i.number, title: i.title, labels: i.labels.map(l => l.name) })));
      }

      const existingIssue = issues.find(
        issue => issue.title === '[Ban List]'
      );

      if (existingIssue) {
        // Security: Verify issue was created by wiki bot (admin issues are bot-managed)
        const botUsername = import.meta.env.VITE_WIKI_BOT_USERNAME;
        if (existingIssue.user.login !== botUsername) {
          console.warn(`[Admin] Security: Ban list issue created by ${existingIssue.user.login}, expected ${botUsername}`);
          throw new Error('Invalid ban list issue - not created by bot');
        }
        console.log(`[Admin] Found existing ban list issue #${existingIssue.number}`);

        // Cache for 1 minute
        setCacheValue(cacheName('ban_issue', cacheKey), existingIssue, 60000);
        resolvePromise(existingIssue);
        return;
      }

      // Create new banned users issue using bot service
      console.log(`[Admin] Creating banned users issue with bot... Labels: [${BANNED_USERS_LABEL}, ${branchLabel}, ${AUTOMATED_LABEL}]`);
      const newIssue = await createAdminIssueWithBot(
        owner,
        repo,
        '[Ban List]',
        `🚫 **Banned Users**\n\nThis issue stores the list of users who are banned from commenting and contributing to the wiki.\n\n**Banned Users:**\n\`\`\`json\n[]\n\`\`\`\n\n---\n\n⚠️ **This issue is managed by the wiki bot.** Repository owner and admins can manage the ban list via the Admin Panel.\n\n🤖 *This issue is managed by the wiki bot.*`,
        [BANNED_USERS_LABEL, branchLabel, AUTOMATED_LABEL],
        true // Lock the issue
      );

      console.log(`[Admin] Created banned users issue #${newIssue.number}`);

      // Cache for 1 minute
      setCacheValue(cacheName('ban_issue', cacheKey), newIssue, 60000);

      resolvePromise(newIssue);
    } catch (error) {
      console.error('Failed to get/create banned users issue:', error);
      rejectPromise(error);
    } finally {
      // Keep in-flight entry for 5 seconds after completion to prevent race conditions during GitHub's eventual consistency
      setTimeout(() => {
        pendingBanIssueRequests.delete(cacheKey);
      }, 5000);
    }
  })();

  // Promise already tracked above (line 166) - return it
  return requestPromise;
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
  // Fetch user ID for comparison (cached)
  let userId;
  try {
    userId = await getCachedUserId(username);
  } catch (error) {
    console.warn(`[Admin] Failed to fetch user ID for ${username}:`, error);
    // Continue without userId, will fallback to username comparison
  }

  // Owner is always admin (check by userId)
  if (userId && await isRepositoryOwner(userId, owner, repo)) {
    return true;
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
  console.log(`[Admin] Checking if ${username} is banned...`);

  // Fetch user ID for cache key and comparison (cached - prevents redundant API calls)
  let userId;
  try {
    userId = await getCachedUserId(username);
  } catch (error) {
    console.warn(`[Admin] Failed to fetch user ID for ${username}:`, error);
    // Continue without userId, will fallback to username comparison
  }

  // Check cache first (10-minute TTL to reduce GitHub API calls)
  // Use userId as cache key (permanent identifier, survives username changes)
  const cacheKey = cacheName(`ban_check_${owner}_${repo}`, userId || username);
  const cached = getCacheValue(cacheKey);
  if (cached !== null) {
    console.log(`[Admin] Ban check cache hit for user ${userId || username}`);
    return cached;
  }

  console.log(`[Admin] Ban check cache miss for user ${userId || username}, fetching from GitHub...`);

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
  console.log(`[Admin] Cached ban check result for user ${userId || username}: ${isBannedResult}`);

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
  // Fetch userId for addedBy to verify owner
  let addedByUserId;
  try {
    addedByUserId = await getCachedUserId(addedBy);
  } catch (error) {
    console.error(`[Admin] Failed to fetch user ID for ${addedBy}:`, error);
    throw new Error('Failed to verify user identity');
  }

  // Verify the person adding is the owner
  if (!await isRepositoryOwner(addedByUserId, owner, repo)) {
    throw new Error('Only the repository owner can add admins');
  }

  const issue = await getOrCreateAdminsIssue(owner, repo, config);
  const admins = parseUserListFromIssue(issue.body);

  // Fetch user info from GitHub to get their ID (cached)
  let userId;
  try {
    userId = await getCachedUserId(username);
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

  // Clear issue cache to force refresh on next read
  const branch = await detectCurrentBranch(config);
  const issueCacheKey = `${owner}/${repo}/${branch}`;
  clearCacheValue(cacheName('admin_issue', issueCacheKey));
  console.log(`[Admin] Cleared admin issue cache after adding ${username}`);

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
  // Fetch userId for removedBy to verify owner
  let removedByUserId;
  try {
    removedByUserId = await getCachedUserId(removedBy);
  } catch (error) {
    console.error(`[Admin] Failed to fetch user ID for ${removedBy}:`, error);
    throw new Error('Failed to verify user identity');
  }

  // Verify the person removing is the owner
  if (!await isRepositoryOwner(removedByUserId, owner, repo)) {
    throw new Error('Only the repository owner can remove admins');
  }

  const issue = await getOrCreateAdminsIssue(owner, repo, config);
  const admins = parseUserListFromIssue(issue.body);

  // Fetch user ID for comparison (cached)
  let userId;
  try {
    userId = await getCachedUserId(username);
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

  // Clear issue cache to force refresh on next read
  const branch = await detectCurrentBranch(config);
  const issueCacheKey = `${owner}/${repo}/${branch}`;
  clearCacheValue(cacheName('admin_issue', issueCacheKey));
  console.log(`[Admin] Cleared admin issue cache after removing ${username}`);

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

  // Fetch user IDs for both target and banner
  let userId;
  try {
    userId = await getCachedUserId(username);
    console.log(`[Admin] Fetched userId ${userId} for ${username}`);
  } catch (error) {
    console.error(`[Admin] Failed to fetch user ID for ${username}:`, error);
    throw new Error(`User ${username} not found on GitHub`);
  }

  let bannedByUserId;
  try {
    bannedByUserId = await getCachedUserId(bannedBy);
    console.log(`[Admin] Fetched userId ${bannedByUserId} for ${bannedBy}`);
  } catch (error) {
    console.error(`[Admin] Failed to fetch user ID for ${bannedBy}:`, error);
    throw new Error(`Failed to verify banner identity`);
  }

  // Cannot ban the owner
  if (await isRepositoryOwner(userId, owner, repo)) {
    throw new Error('Cannot ban the repository owner');
  }

  // Cannot ban other admins (unless you're the owner)
  const targetIsAdmin = await isAdmin(username, owner, repo, config);
  if (targetIsAdmin && !await isRepositoryOwner(bannedByUserId, owner, repo)) {
    throw new Error('Only the repository owner can ban admins');
  }

  // If target is an admin and owner is banning them, remove them from admin list first
  if (targetIsAdmin && await isRepositoryOwner(bannedByUserId, owner, repo)) {
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

        // Clear admin issue cache
        const branch = await detectCurrentBranch(config);
        const issueCacheKey = `${owner}/${repo}/${branch}`;
        clearCacheValue(cacheName('admin_issue', issueCacheKey));

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

  // Clear issue cache to force refresh on next read
  const branch = await detectCurrentBranch(config);
  const issueCacheKey = `${owner}/${repo}/${branch}`;
  clearCacheValue(cacheName('ban_issue', issueCacheKey));
  console.log(`[Admin] Cleared ban issue cache after banning ${username}`);

  // Clear cache for this user so next check gets fresh data (use userId)
  const cacheKey = cacheName(`ban_check_${owner}_${repo}`, userId);
  clearCacheValue(cacheKey);
  console.log(`[Admin] Cleared ban check cache for user ${userId}`);

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

  // Fetch user ID for comparison (cached)
  let userId;
  try {
    userId = await getCachedUserId(username);
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

  // Clear issue cache to force refresh on next read
  const branch = await detectCurrentBranch(config);
  const issueCacheKey = `${owner}/${repo}/${branch}`;
  clearCacheValue(cacheName('ban_issue', issueCacheKey));
  console.log(`[Admin] Cleared ban issue cache after unbanning ${username}`);

  // Clear cache for this user so next check gets fresh data (use userId)
  const cacheKey = cacheName(`ban_check_${owner}_${repo}`, userId);
  clearCacheValue(cacheKey);
  console.log(`[Admin] Cleared ban check cache for user ${userId}`);

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
    console.log('[Admin] Getting authenticated user...');
    const user = await getAuthenticatedUser();
    console.log('[Admin] Got user:', { login: user?.login, id: user?.id });
    const username = user.login;
    const userId = user.id;

    const isOwner = await isRepositoryOwner(userId, owner, repo);
    const userIsAdmin = isOwner || await isAdmin(username, owner, repo, config);

    return {
      isOwner,
      isAdmin: userIsAdmin,
      username,
    };
  } catch (error) {
    console.error('[Admin] Error getting admin status:', error.message, error.stack);
    return {
      isOwner: false,
      isAdmin: false,
      username: null,
    };
  }
};
