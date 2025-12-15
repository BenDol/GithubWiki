import { getOctokit } from './api';

/**
 * User Profile Snapshot System
 * Stores comprehensive user profile data in GitHub Issues as a database
 *
 * Issue Format:
 * - Title: [User Snapshot] username
 * - Labels: user-snapshot, automated
 * - Body: JSON snapshot data (includes stats for prestige calculation)
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
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @returns {Object|null} Snapshot data or null if not found
 */
export async function getUserSnapshot(owner, repo, username) {
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

    // Find the specific user's snapshot
    const snapshotIssue = issues.find(
      issue => issue.title === `${SNAPSHOT_TITLE_PREFIX} ${username}`
    );

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
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {Object} snapshotData - Profile snapshot data
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

    const existingIssue = issues.find(
      issue => issue.title === `${SNAPSHOT_TITLE_PREFIX} ${username}`
    );

    const issueTitle = `${SNAPSHOT_TITLE_PREFIX} ${username}`;
    const issueBody = JSON.stringify(snapshotData, null, 2);

    if (existingIssue) {
      // Update existing snapshot
      console.log(`[UserSnapshot] Updating snapshot for ${username} (issue #${existingIssue.number})`);
      const { data: updatedIssue } = await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: existingIssue.number,
        body: issueBody,
      });
      return updatedIssue;
    } else {
      // Create new snapshot
      console.log(`[UserSnapshot] Creating new snapshot for ${username}`);
      const { data: newIssue } = await octokit.rest.issues.create({
        owner,
        repo,
        title: issueTitle,
        body: issueBody,
        labels: [SNAPSHOT_LABEL, 'automated'],
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

    // Calculate statistics
    const stats = {
      totalPRs: allPRs.length,
      openPRs: allPRs.filter(pr => pr.state === 'open').length,
      mergedPRs: allPRs.filter(pr => pr.merged_at || pr.state === 'merged').length,
      closedPRs: allPRs.filter(pr => (pr.state === 'closed' || pr.state === 'merged') && !pr.merged_at).length,
      totalAdditions: allPRs.reduce((sum, pr) => sum + (pr.additions || 0), 0),
      totalDeletions: allPRs.reduce((sum, pr) => sum + (pr.deletions || 0), 0),
      totalFiles: allPRs.reduce((sum, pr) => sum + (pr.changed_files || 0), 0),
      mostRecentEdit: allPRs.length > 0
        ? new Date(Math.max(...allPRs.map(pr => new Date(pr.created_at).getTime()))).toISOString()
        : null,
    };

    // Build pull requests list (store essential data)
    // Limit to most recent PRs to stay within GitHub issue size limits (~65KB)
    const recentPRs = allPRs
      .sort((a, b) => new Date(b.created_at) - new Date(a.created_at))
      .slice(0, MAX_PRS_IN_SNAPSHOT);

    console.log(`[UserSnapshot] Storing ${recentPRs.length} most recent PRs (out of ${allPRs.length} total)`);

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

    // Build snapshot object
    const snapshot = {
      username: username,
      lastUpdated: new Date().toISOString(),
      stats,
      pullRequests,
      pullRequestsCount: allPRs.length,
      pullRequestsStored: recentPRs.length,
      pullRequestsTruncated: allPRs.length > MAX_PRS_IN_SNAPSHOT,
      user: {
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
