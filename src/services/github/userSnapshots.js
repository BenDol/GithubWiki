import { getOctokit } from './api';

/**
 * User Profile Snapshot System
 * Stores comprehensive user profile data in GitHub Issues as a database
 *
 * Issue Format:
 * - Title: [User Snapshot] username (human-readable, updated on username changes)
 * - Labels: user-snapshot, user-id:12345, automated
 * - Body: JSON snapshot data (includes userId and stats for prestige calculation)
 *
 * Indexing:
 * - Primary: User ID label (user-id:12345) - permanent, immune to username changes
 * - Fallback: Username in title - for legacy snapshots (automatically migrated on update)
 *
 * Limitations:
 * - GitHub issues have a ~65KB body size limit
 * - Snapshots store up to 100 most recent PRs to stay within limits
 * - Full stats are always accurate (calculated from all PRs)
 */

const SNAPSHOT_LABEL = 'user-snapshot';
const SNAPSHOT_TITLE_PREFIX = '[User Snapshot]';
const MAX_PRS_IN_SNAPSHOT = 100;

/**
 * Get snapshot data for a specific user
 * Searches by user ID label (permanent) first, falls back to username title match (legacy)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} [userId] - Optional GitHub user ID for faster lookup
 * @returns {Object|null} Snapshot data or null if not found
 */
export async function getUserSnapshot(owner, repo, username, userId = null) {
  try {
    const octokit = getOctokit();

    // Search for the user's snapshot issue
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: SNAPSHOT_LABEL,
      state: 'open',
      per_page: 100,
    });

    let snapshotIssue = null;

    // First try: Search by user ID label (permanent identifier, preferred)
    if (userId) {
      snapshotIssue = issues.find(issue =>
        issue.labels.some(label =>
          (typeof label === 'string' && label === `user-id:${userId}`) ||
          (typeof label === 'object' && label.name === `user-id:${userId}`)
        )
      );

      if (snapshotIssue) {
        console.log(`[UserSnapshot] Found snapshot for user ${username} by ID: ${userId}`);
      }
    }

    // Second try: Search by username in title (legacy snapshots or no user ID provided)
    if (!snapshotIssue) {
      snapshotIssue = issues.find(
        issue => issue.title === `${SNAPSHOT_TITLE_PREFIX} ${username}`
      );

      if (snapshotIssue) {
        console.log(`[UserSnapshot] Found legacy snapshot for ${username} by title`);
      }
    }

    if (!snapshotIssue) {
      console.log(`[UserSnapshot] No snapshot found for user: ${username}`);
      return null;
    }

    // Parse JSON from issue body
    try {
      const snapshotData = JSON.parse(snapshotIssue.body);
      console.log(`[UserSnapshot] Loaded snapshot for ${username}, last updated: ${snapshotData.lastUpdated}`);
      return snapshotData;
    } catch (parseError) {
      console.error(`[UserSnapshot] Failed to parse snapshot data for ${username}:`, parseError);
      return null;
    }
  } catch (error) {
    console.error(`[UserSnapshot] Failed to get snapshot for ${username}:`, error);
    return null;
  }
}

/**
 * Save or update snapshot data for a user
 * Uses user ID for permanent identification (usernames can change)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {Object} snapshotData - Profile snapshot data (must include userId)
 * @returns {Object} Created/updated issue
 */
export async function saveUserSnapshot(owner, repo, username, snapshotData) {
  try {
    const octokit = getOctokit();

    // Search for existing snapshot issue
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: SNAPSHOT_LABEL,
      state: 'open',
      per_page: 100,
    });

    let existingIssue = null;

    // First try: Search by user ID label (permanent identifier, preferred)
    if (snapshotData.userId) {
      existingIssue = issues.find(issue =>
        issue.labels.some(label =>
          (typeof label === 'string' && label === `user-id:${snapshotData.userId}`) ||
          (typeof label === 'object' && label.name === `user-id:${snapshotData.userId}`)
        )
      );

      if (existingIssue) {
        console.log(`[UserSnapshot] Found existing snapshot for user ${username} by ID: ${snapshotData.userId}`);
      }
    }

    // Second try: Search by username in title (legacy snapshots)
    if (!existingIssue) {
      existingIssue = issues.find(
        issue => issue.title === `${SNAPSHOT_TITLE_PREFIX} ${username}`
      );

      if (existingIssue) {
        console.log(`[UserSnapshot] Found legacy snapshot for ${username} by title, will migrate to user ID label`);
      }
    }

    const issueTitle = `${SNAPSHOT_TITLE_PREFIX} ${username}`;
    const issueBody = JSON.stringify(snapshotData, null, 2);
    const userIdLabel = snapshotData.userId ? `user-id:${snapshotData.userId}` : null;

    if (existingIssue) {
      // Update existing snapshot (update both title and labels in case username changed or migration needed)
      console.log(`[UserSnapshot] Updating snapshot for ${username} (issue #${existingIssue.number})`);

      // Update title and body
      const { data: updatedIssue } = await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: existingIssue.number,
        title: issueTitle, // Update title to reflect current username
        body: issueBody,
      });

      // Add user ID label if missing (migration for legacy snapshots)
      if (userIdLabel) {
        const hasUserIdLabel = existingIssue.labels.some(label =>
          (typeof label === 'string' && label.startsWith('user-id:')) ||
          (typeof label === 'object' && label.name?.startsWith('user-id:'))
        );

        if (!hasUserIdLabel) {
          console.log(`[UserSnapshot] Adding user-id label to legacy snapshot for ${username}`);
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
      // Create new snapshot with user ID label
      console.log(`[UserSnapshot] Creating new snapshot for ${username}${userIdLabel ? ` (ID: ${snapshotData.userId})` : ''}`);

      const labels = [SNAPSHOT_LABEL, 'automated'];
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
      return newIssue;
    }
  } catch (error) {
    console.error(`[UserSnapshot] Failed to save snapshot for ${username}:`, error);
    throw error;
  }
}

/**
 * Build snapshot data from user's pull requests
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @returns {Object} Snapshot data
 */
export async function buildUserSnapshot(owner, repo, username) {
  try {
    const octokit = getOctokit();

    console.log(`[UserSnapshot] Building snapshot for ${username}...`);

    // Fetch user data
    const { data: userData } = await octokit.rest.users.getByUsername({
      username,
    });

    // Fetch all PRs by this user
    const allPRs = [];
    let page = 1;
    let hasMore = true;

    while (hasMore) {
      const { data: prs } = await octokit.rest.pulls.list({
        owner,
        repo,
        state: 'all',
        per_page: 100,
        page,
      });

      // Filter PRs by this user
      const userPRs = prs.filter(pr => pr.user.login === username);
      allPRs.push(...userPRs);

      hasMore = prs.length === 100;
      page++;
    }

    console.log(`[UserSnapshot] Found ${allPRs.length} PRs for ${username}`);

    // Fetch detailed data for each PR (additions, deletions, changed_files)
    // pulls.list() doesn't include these fields, need pulls.get() for each PR
    console.log(`[UserSnapshot] Fetching detailed PR data (additions, deletions, files)...`);
    const detailedPRs = [];

    for (const pr of allPRs) {
      try {
        const { data: detailedPR } = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: pr.number,
        });

        detailedPRs.push(detailedPR);
      } catch (error) {
        console.warn(`[UserSnapshot] Failed to fetch details for PR #${pr.number}:`, error.message);
        // Use the basic PR data as fallback (will have 0 for additions/deletions/files)
        detailedPRs.push(pr);
      }
    }

    console.log(`[UserSnapshot] Fetched detailed data for ${detailedPRs.length} PRs`);

    // Calculate statistics (use detailedPRs which has additions/deletions/files)
    const stats = {
      totalPRs: detailedPRs.length,
      openPRs: detailedPRs.filter(pr => pr.state === 'open').length,
      mergedPRs: detailedPRs.filter(pr => pr.merged_at || pr.state === 'merged').length,
      closedPRs: detailedPRs.filter(pr => (pr.state === 'closed' || pr.state === 'merged') && !pr.merged_at).length,
      totalAdditions: detailedPRs.reduce((sum, pr) => sum + (pr.additions || 0), 0),
      totalDeletions: detailedPRs.reduce((sum, pr) => sum + (pr.deletions || 0), 0),
      totalFiles: detailedPRs.reduce((sum, pr) => sum + (pr.changed_files || 0), 0),
      mostRecentEdit: detailedPRs.length > 0
        ? new Date(Math.max(...detailedPRs.map(pr => new Date(pr.created_at).getTime()))).toISOString()
        : null,
    };

    // Build pull requests list (store essential data)
    // Limit to most recent PRs to stay within GitHub issue size limits (~65KB)
    const recentPRs = detailedPRs
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, MAX_PRS_IN_SNAPSHOT);

    console.log(`[UserSnapshot] Storing ${recentPRs.length} most recent PRs (out of ${detailedPRs.length} total)`);

    const pullRequests = recentPRs.map(pr => ({
      number: pr.number,
      title: pr.title,
      state: pr.state,
      created_at: pr.created_at,
      updated_at: pr.updated_at,
      merged_at: pr.merged_at,
      closed_at: pr.closed_at,
      additions: pr.additions,
      deletions: pr.deletions,
      changed_files: pr.changed_files,
      html_url: pr.html_url,
      labels: pr.labels.map(label => ({
        name: label.name,
        color: label.color,
      })),
    }));

    // Build snapshot object (use user ID as primary identifier)
    const snapshot = {
      userId: userData.id, // Permanent identifier (usernames can change!)
      username: userData.login, // Current username (may change)
      lastUpdated: new Date().toISOString(),
      stats,
      pullRequests,
      pullRequestsCount: detailedPRs.length,
      pullRequestsStored: recentPRs.length,
      pullRequestsTruncated: detailedPRs.length > MAX_PRS_IN_SNAPSHOT,
      user: {
        id: userData.id, // Store ID here too for easy access
        login: userData.login,
        name: userData.name,
        avatar_url: userData.avatar_url,
        bio: userData.bio,
      },
    };

    console.log(`[UserSnapshot] Snapshot built for ${username}:`, {
      totalPRs: stats.totalPRs,
      additions: stats.totalAdditions,
      deletions: stats.totalDeletions,
    });

    return snapshot;
  } catch (error) {
    console.error(`[UserSnapshot] Failed to build snapshot for ${username}:`, error);
    throw error;
  }
}

/**
 * Get all user snapshots
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Array} Array of snapshot data
 */
export async function getAllUserSnapshots(owner, repo) {
  try {
    const octokit = getOctokit();

    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: SNAPSHOT_LABEL,
      state: 'open',
      per_page: 100,
    });

    const snapshots = [];
    for (const issue of issues) {
      try {
        const snapshotData = JSON.parse(issue.body);
        snapshots.push(snapshotData);
      } catch (parseError) {
        console.warn(`[UserSnapshot] Failed to parse snapshot in issue #${issue.number}`);
      }
    }

    console.log(`[UserSnapshot] Loaded ${snapshots.length} user snapshots`);
    return snapshots;
  } catch (error) {
    console.error('[UserSnapshot] Failed to get all snapshots:', error);
    return [];
  }
}

/**
 * Update snapshot for a user (build and save)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @returns {Object} Updated snapshot data
 */
export async function updateUserSnapshot(owner, repo, username) {
  console.log(`[UserSnapshot] Updating snapshot for ${username}...`);
  const snapshot = await buildUserSnapshot(owner, repo, username);
  await saveUserSnapshot(owner, repo, username, snapshot);
  console.log(`[UserSnapshot] Snapshot updated successfully for ${username}`);
  return snapshot;
}
