import { getOctokit, getBotOctokit, getAuthenticatedUser } from './api';

/**
 * GitHub Admin Service
 * Manages admins and banned users via GitHub issues
 */

const ADMIN_LIST_LABEL = 'wiki-admin:admins';
const BANNED_USERS_LABEL = 'wiki-admin:banned-users';

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
 * @returns {Promise<Object>} Issue object containing admins list
 */
export const getOrCreateAdminsIssue = async (owner, repo) => {
  const botOctokit = getBotOctokit();

  // Search for existing admins issue
  const searchQuery = `repo:${owner}/${repo} is:issue label:"${ADMIN_LIST_LABEL}"`;

  try {
    const { data: searchResults } = await botOctokit.rest.search.issuesAndPullRequests({
      q: searchQuery,
    });

    const existingIssue = searchResults.items.find(
      issue => issue.title === 'Wiki Admins List'
    );

    if (existingIssue) {
      return existingIssue;
    }

    // Create new admins issue
    console.log('[Admin] Creating admins list issue...');
    const { data: newIssue } = await botOctokit.rest.issues.create({
      owner,
      repo,
      title: 'Wiki Admins List',
      body: `🔐 **Wiki Administrators**\n\nThis issue stores the list of wiki administrators who have permission to manage users and content.\n\n**Admin List:**\n\`\`\`json\n[]\n\`\`\`\n\n---\n\n⚠️ **This issue is managed by the wiki bot.** Only the repository owner can modify the admin list via the Admin Panel.\n\n🤖 *Automated admin management system*`,
      labels: [ADMIN_LIST_LABEL],
    });

    // Lock the issue to prevent unauthorized edits
    await botOctokit.rest.issues.lock({
      owner,
      repo,
      issue_number: newIssue.number,
      lock_reason: 'off-topic',
    });

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
 * @returns {Promise<Object>} Issue object containing banned users list
 */
export const getOrCreateBannedUsersIssue = async (owner, repo) => {
  const botOctokit = getBotOctokit();

  // Search for existing banned users issue
  const searchQuery = `repo:${owner}/${repo} is:issue label:"${BANNED_USERS_LABEL}"`;

  try {
    const { data: searchResults } = await botOctokit.rest.search.issuesAndPullRequests({
      q: searchQuery,
    });

    const existingIssue = searchResults.items.find(
      issue => issue.title === 'Wiki Banned Users'
    );

    if (existingIssue) {
      return existingIssue;
    }

    // Create new banned users issue
    console.log('[Admin] Creating banned users issue...');
    const { data: newIssue } = await botOctokit.rest.issues.create({
      owner,
      repo,
      title: 'Wiki Banned Users',
      body: `🚫 **Banned Users**\n\nThis issue stores the list of users who are banned from commenting and contributing to the wiki.\n\n**Banned Users:**\n\`\`\`json\n[]\n\`\`\`\n\n---\n\n⚠️ **This issue is managed by the wiki bot.** Repository owner and admins can manage the ban list via the Admin Panel.\n\n🤖 *Automated user management system*`,
      labels: [BANNED_USERS_LABEL],
    });

    // Lock the issue to prevent unauthorized edits
    await botOctokit.rest.issues.lock({
      owner,
      repo,
      issue_number: newIssue.number,
      lock_reason: 'off-topic',
    });

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
 * @returns {Promise<Array<Object>>} Array of admin objects
 */
export const getAdmins = async (owner, repo) => {
  try {
    const issue = await getOrCreateAdminsIssue(owner, repo);
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
 * @returns {Promise<Array<Object>>} Array of banned user objects
 */
export const getBannedUsers = async (owner, repo) => {
  try {
    const issue = await getOrCreateBannedUsersIssue(owner, repo);
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
 * @returns {Promise<boolean>} True if user is admin or owner
 */
export const isAdmin = async (username, owner, repo) => {
  // Owner is always admin
  if (isRepositoryOwner(username, owner)) {
    return true;
  }

  // Check admin list
  const admins = await getAdmins(owner, repo);
  return admins.some(admin => admin.username.toLowerCase() === username.toLowerCase());
};

/**
 * Check if user is banned
 * @param {string} username - Username to check
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<boolean>} True if user is banned
 */
export const isBanned = async (username, owner, repo) => {
  const bannedUsers = await getBannedUsers(owner, repo);
  return bannedUsers.some(user => user.username.toLowerCase() === username.toLowerCase());
};

/**
 * Add admin (owner only)
 * @param {string} username - Username to add as admin
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} addedBy - Username of person adding admin
 * @returns {Promise<Object>} Updated admins list
 */
export const addAdmin = async (username, owner, repo, addedBy) => {
  // Verify the person adding is the owner
  if (!isRepositoryOwner(addedBy, owner)) {
    throw new Error('Only the repository owner can add admins');
  }

  const botOctokit = getBotOctokit();
  const issue = await getOrCreateAdminsIssue(owner, repo);
  const admins = parseUserListFromIssue(issue.body);

  // Check if already admin
  if (admins.some(admin => admin.username.toLowerCase() === username.toLowerCase())) {
    throw new Error(`${username} is already an admin`);
  }

  // Add new admin
  const newAdmin = {
    username,
    addedBy,
    addedAt: new Date().toISOString(),
  };

  admins.push(newAdmin);

  // Update issue
  const newBody = updateUserListInIssue(issue.body, admins);
  await botOctokit.rest.issues.update({
    owner,
    repo,
    issue_number: issue.number,
    body: newBody,
  });

  console.log(`[Admin] Added admin: ${username}`);
  return admins;
};

/**
 * Remove admin (owner only)
 * @param {string} username - Username to remove from admins
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} removedBy - Username of person removing admin
 * @returns {Promise<Object>} Updated admins list
 */
export const removeAdmin = async (username, owner, repo, removedBy) => {
  // Verify the person removing is the owner
  if (!isRepositoryOwner(removedBy, owner)) {
    throw new Error('Only the repository owner can remove admins');
  }

  const botOctokit = getBotOctokit();
  const issue = await getOrCreateAdminsIssue(owner, repo);
  const admins = parseUserListFromIssue(issue.body);

  // Filter out the admin
  const updatedAdmins = admins.filter(
    admin => admin.username.toLowerCase() !== username.toLowerCase()
  );

  if (updatedAdmins.length === admins.length) {
    throw new Error(`${username} is not an admin`);
  }

  // Update issue
  const newBody = updateUserListInIssue(issue.body, updatedAdmins);
  await botOctokit.rest.issues.update({
    owner,
    repo,
    issue_number: issue.number,
    body: newBody,
  });

  console.log(`[Admin] Removed admin: ${username}`);
  return updatedAdmins;
};

/**
 * Ban user (owner or admin)
 * @param {string} username - Username to ban
 * @param {string} reason - Reason for ban
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} bannedBy - Username of person banning
 * @returns {Promise<Object>} Updated banned users list
 */
export const banUser = async (username, reason, owner, repo, bannedBy) => {
  // Verify the person banning is admin or owner
  const userIsAdmin = await isAdmin(bannedBy, owner, repo);
  if (!userIsAdmin) {
    throw new Error('Only repository owner or admins can ban users');
  }

  // Cannot ban the owner
  if (isRepositoryOwner(username, owner)) {
    throw new Error('Cannot ban the repository owner');
  }

  // Cannot ban other admins
  const targetIsAdmin = await isAdmin(username, owner, repo);
  if (targetIsAdmin && !isRepositoryOwner(bannedBy, owner)) {
    throw new Error('Only the repository owner can ban admins');
  }

  const botOctokit = getBotOctokit();
  const issue = await getOrCreateBannedUsersIssue(owner, repo);
  const bannedUsers = parseUserListFromIssue(issue.body);

  // Check if already banned
  if (bannedUsers.some(user => user.username.toLowerCase() === username.toLowerCase())) {
    throw new Error(`${username} is already banned`);
  }

  // Add banned user
  const bannedUser = {
    username,
    reason,
    bannedBy,
    bannedAt: new Date().toISOString(),
  };

  bannedUsers.push(bannedUser);

  // Update issue
  const newBody = updateUserListInIssue(issue.body, bannedUsers);
  await botOctokit.rest.issues.update({
    owner,
    repo,
    issue_number: issue.number,
    body: newBody,
  });

  console.log(`[Admin] Banned user: ${username}`);
  return bannedUsers;
};

/**
 * Unban user (owner or admin)
 * @param {string} username - Username to unban
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} unbannedBy - Username of person unbanning
 * @returns {Promise<Object>} Updated banned users list
 */
export const unbanUser = async (username, owner, repo, unbannedBy) => {
  // Verify the person unbanning is admin or owner
  const userIsAdmin = await isAdmin(unbannedBy, owner, repo);
  if (!userIsAdmin) {
    throw new Error('Only repository owner or admins can unban users');
  }

  const botOctokit = getBotOctokit();
  const issue = await getOrCreateBannedUsersIssue(owner, repo);
  const bannedUsers = parseUserListFromIssue(issue.body);

  // Filter out the unbanned user
  const updatedBannedUsers = bannedUsers.filter(
    user => user.username.toLowerCase() !== username.toLowerCase()
  );

  if (updatedBannedUsers.length === bannedUsers.length) {
    throw new Error(`${username} is not banned`);
  }

  // Update issue
  const newBody = updateUserListInIssue(issue.body, updatedBannedUsers);
  await botOctokit.rest.issues.update({
    owner,
    repo,
    issue_number: issue.number,
    body: newBody,
  });

  console.log(`[Admin] Unbanned user: ${username}`);
  return updatedBannedUsers;
};

/**
 * Check current user's admin status
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Object>} Object with isOwner, isAdmin, username
 */
export const getCurrentUserAdminStatus = async (owner, repo) => {
  try {
    const user = await getAuthenticatedUser();
    const username = user.login;

    const isOwner = isRepositoryOwner(username, owner);
    const userIsAdmin = isOwner || await isAdmin(username, owner, repo);

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
