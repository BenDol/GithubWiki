import { getOctokit } from './api';

/**
 * Battle Loadouts Storage System
 * Stores user battle loadouts in GitHub Issues as a database
 *
 * Issue Format:
 * - Title: [Battle Loadouts] username
 * - Labels: battle-loadouts, user-id:12345, automated
 * - Body: JSON array of loadouts
 *
 * Loadout Format:
 * {
 *   id: "unique-loadout-id",
 *   name: "Loadout Name",
 *   skillBuild: {...},
 *   spirit: {...},
 *   skillStone: {...},
 *   promotionAbility: {...},
 *   familiar: {...},
 *   createdAt: "ISO date",
 *   updatedAt: "ISO date"
 * }
 *
 * Indexing:
 * - Primary: User ID label (user-id:12345) - permanent
 * - Fallback: Username in title - for legacy
 */

const LOADOUTS_LABEL = 'battle-loadouts';
const LOADOUTS_TITLE_PREFIX = '[Battle Loadouts]';
const MAX_LOADOUTS_PER_USER = 10; // Limit to prevent issue size bloat

/**
 * Get all loadouts for a specific user
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} [userId] - Optional GitHub user ID for faster lookup
 * @returns {Array} Array of loadouts or empty array if not found
 */
export async function getUserLoadouts(owner, repo, username, userId = null) {
  try {
    const octokit = getOctokit();

    // Search for the user's loadouts issue
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: LOADOUTS_LABEL,
      state: 'open',
      per_page: 100,
    });

    let loadoutsIssue = null;

    // First try: Search by user ID label (permanent identifier, preferred)
    if (userId) {
      loadoutsIssue = issues.find(issue =>
        issue.labels.some(label =>
          (typeof label === 'string' && label === `user-id:${userId}`) ||
          (typeof label === 'object' && label.name === `user-id:${userId}`)
        )
      );

      if (loadoutsIssue) {
        console.log(`[BattleLoadouts] Found loadouts for user ${username} by ID: ${userId}`);
      }
    }

    // Second try: Search by username in title (legacy or no user ID provided)
    if (!loadoutsIssue) {
      loadoutsIssue = issues.find(
        issue => issue.title === `${LOADOUTS_TITLE_PREFIX} ${username}`
      );

      if (loadoutsIssue) {
        console.log(`[BattleLoadouts] Found legacy loadouts for ${username} by title`);
      }
    }

    if (!loadoutsIssue) {
      console.log(`[BattleLoadouts] No loadouts found for user: ${username}`);
      return [];
    }

    // Parse JSON from issue body
    try {
      const loadouts = JSON.parse(loadoutsIssue.body || '[]');
      console.log(`[BattleLoadouts] Loaded ${loadouts.length} loadouts for ${username}`);
      return Array.isArray(loadouts) ? loadouts : [];
    } catch (parseError) {
      console.error(`[BattleLoadouts] Failed to parse loadouts data for ${username}:`, parseError);
      return [];
    }
  } catch (error) {
    console.error(`[BattleLoadouts] Failed to get loadouts for ${username}:`, error);
    return [];
  }
}

/**
 * Save loadouts for a user (create or update issue)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} userId - GitHub user ID
 * @param {Array} loadouts - Array of loadouts to save
 * @returns {Object} Created/updated issue
 */
export async function saveUserLoadouts(owner, repo, username, userId, loadouts) {
  try {
    const octokit = getOctokit();

    // Validate loadouts array
    if (!Array.isArray(loadouts)) {
      throw new Error('Loadouts must be an array');
    }

    // Limit number of loadouts
    if (loadouts.length > MAX_LOADOUTS_PER_USER) {
      throw new Error(`Maximum ${MAX_LOADOUTS_PER_USER} loadouts allowed per user`);
    }

    // Search for existing loadouts issue
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: LOADOUTS_LABEL,
      state: 'open',
      per_page: 100,
    });

    let existingIssue = null;

    // First try: Search by user ID label
    if (userId) {
      existingIssue = issues.find(issue =>
        issue.labels.some(label =>
          (typeof label === 'string' && label === `user-id:${userId}`) ||
          (typeof label === 'object' && label.name === `user-id:${userId}`)
        )
      );
    }

    // Second try: Search by username in title
    if (!existingIssue) {
      existingIssue = issues.find(
        issue => issue.title === `${LOADOUTS_TITLE_PREFIX} ${username}`
      );
    }

    const issueTitle = `${LOADOUTS_TITLE_PREFIX} ${username}`;
    const issueBody = JSON.stringify(loadouts, null, 2);
    const userIdLabel = userId ? `user-id:${userId}` : null;

    if (existingIssue) {
      // Update existing loadouts
      console.log(`[BattleLoadouts] Updating loadouts for ${username} (issue #${existingIssue.number})`);

      const { data: updatedIssue } = await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: existingIssue.number,
        title: issueTitle,
        body: issueBody,
      });

      // Add user ID label if missing (migration for legacy)
      if (userIdLabel) {
        const hasUserIdLabel = existingIssue.labels.some(label =>
          (typeof label === 'string' && label.startsWith('user-id:')) ||
          (typeof label === 'object' && label.name?.startsWith('user-id:'))
        );

        if (!hasUserIdLabel) {
          console.log(`[BattleLoadouts] Adding user-id label to legacy loadouts for ${username}`);
          await octokit.rest.issues.addLabels({
            owner,
            repo,
            issue_number: existingIssue.number,
            labels: [userIdLabel],
          });
        }
      }

      return updatedIssue;
    } else {
      // Create new loadouts issue
      console.log(`[BattleLoadouts] Creating new loadouts issue for ${username}${userIdLabel ? ` (ID: ${userId})` : ''}`);

      const labels = [LOADOUTS_LABEL];
      if (userIdLabel) {
        labels.push(userIdLabel);
      }

      const { data: newIssue } = await octokit.rest.issues.create({
        owner,
        repo,
        title: issueTitle,
        body: issueBody,
        labels,
      });

      // Lock the issue to prevent unwanted comments
      try {
        await octokit.rest.issues.lock({
          owner,
          repo,
          issue_number: newIssue.number,
          lock_reason: 'off-topic',
        });
        console.log(`[BattleLoadouts] Locked loadouts issue for ${username} to collaborators only`);
      } catch (lockError) {
        console.warn(`[BattleLoadouts] Failed to lock issue for ${username}:`, lockError.message);
      }

      return newIssue;
    }
  } catch (error) {
    console.error(`[BattleLoadouts] Failed to save loadouts for ${username}:`, error);
    throw error;
  }
}

/**
 * Delete a loadout for a user
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} userId - GitHub user ID
 * @param {string} loadoutId - Loadout ID to delete
 * @returns {Object} Updated loadouts array
 */
export async function deleteUserLoadout(owner, repo, username, userId, loadoutId) {
  const loadouts = await getUserLoadouts(owner, repo, username, userId);

  const filteredLoadouts = loadouts.filter(l => l.id !== loadoutId);

  if (filteredLoadouts.length === loadouts.length) {
    throw new Error(`Loadout with ID ${loadoutId} not found`);
  }

  await saveUserLoadouts(owner, repo, username, userId, filteredLoadouts);
  console.log(`[BattleLoadouts] Deleted loadout ${loadoutId} for ${username}`);

  return filteredLoadouts;
}
