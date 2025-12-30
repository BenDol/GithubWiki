import { getOctokit } from './api';
import { getCachedUserProfile } from './githubCache';
import { saveUserSnapshotWithBot } from './botService';
import { filterByReleaseDate } from '../../utils/releaseDate';

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
 * Track in-progress snapshot updates to prevent concurrent duplicates
 * Key: username, Value: Promise
 */
const snapshotUpdatesInProgress = new Map();

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

    // Security: Verify issue was created by github-actions or wiki bot
    // Note: We allow user-created snapshots temporarily for backward compatibility
    const botUsername = typeof import.meta !== 'undefined' && import.meta.env ? import.meta.env.VITE_WIKI_BOT_USERNAME : undefined;
    const validCreators = ['github-actions[bot]', botUsername, username].filter(Boolean);
    if (!validCreators.includes(snapshotIssue.user.login)) {
      console.warn(`[UserSnapshot] Security: Snapshot issue created by ${snapshotIssue.user.login}, expected github-actions or bot`);
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
 * Save or update snapshot data for a user using the bot
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

    // Check for duplicate snapshots (should not happen with proper locking)
    const allMatchingSnapshots = issues.filter(issue => {
      const matchesTitle = issue.title === `${SNAPSHOT_TITLE_PREFIX} ${username}`;
      const matchesUserId = snapshotData.userId && issue.labels.some(label =>
        (typeof label === 'string' && label === `user-id:${snapshotData.userId}`) ||
        (typeof label === 'object' && label.name === `user-id:${snapshotData.userId}`)
      );
      return matchesTitle || matchesUserId;
    });

    if (allMatchingSnapshots.length > 1) {
      console.warn(`[UserSnapshot] WARNING: Found ${allMatchingSnapshots.length} duplicate snapshots for ${username}!`, {
        issueNumbers: allMatchingSnapshots.map(i => i.number),
        titles: allMatchingSnapshots.map(i => i.title)
      });
      console.warn(`[UserSnapshot] This indicates a race condition occurred. Using first match: #${allMatchingSnapshots[0].number}`);
      // Use the first one found (oldest)
      if (!existingIssue) {
        existingIssue = allMatchingSnapshots[0];
      }
    }

    // Use bot service to create/update the snapshot
    const existingIssueNumber = existingIssue?.number || null;
    console.log(`[UserSnapshot] ${existingIssueNumber ? 'Updating' : 'Creating'} snapshot for ${username} using bot...`);

    const issue = await saveUserSnapshotWithBot(owner, repo, username, snapshotData, existingIssueNumber);
    console.log(`[UserSnapshot] ✓ Snapshot ${existingIssueNumber ? 'updated' : 'created'} for ${username} (issue #${issue.number})`);

    return issue;
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

    // Fetch user data (with caching to prevent rate limiting)
    const userData = await getCachedUserProfile(username);

    // Fetch all PRs by this user (including linked anonymous edits)
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

      // Filter PRs by this user (direct PRs + linked anonymous edits)
      const userPRs = prs.filter(pr => {
        // Direct PR from user
        const isDirectPR = pr.user.login === username;

        // Linked anonymous PR (has user-id label)
        const isLinkedPR = pr.labels.some(label => {
          const labelName = typeof label === 'string' ? label : label.name;
          return labelName === `user-id:${userData.id}`;
        });

        return isDirectPR || isLinkedPR;
      });
      allPRs.push(...userPRs);

      hasMore = prs.length === 100;
      page++;
    }

    console.log(`[UserSnapshot] Found ${allPRs.length} PRs for ${username} (including linked anonymous edits)`);

    // Filter PRs by release date (respects VITE_RELEASE_DATE)
    const filteredPRs = filterByReleaseDate(allPRs, 'created_at');
    console.log(`[UserSnapshot] After release date filter: ${filteredPRs.length} PRs`);

    // Fetch detailed data for each PR (additions, deletions, changed_files)
    // For bot-created PRs, we need to get stats from commits, not just PR summary
    console.log(`[UserSnapshot] Fetching detailed PR data (additions, deletions, files)...`);
    const detailedPRs = [];

    for (const pr of filteredPRs) {
      try {
        const { data: detailedPR } = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: pr.number,
        });

        // If additions/deletions are missing or zero (can happen with bot PRs),
        // fetch from commits within the PR
        if (!detailedPR.additions && !detailedPR.deletions) {
          console.log(`[UserSnapshot] PR #${pr.number} missing stats, fetching from commits...`);
          try {
            const { data: commits } = await octokit.rest.pulls.listCommits({
              owner,
              repo,
              pull_number: pr.number,
              per_page: 100,
            });

            // Sum up additions/deletions from all commits
            let totalAdditions = 0;
            let totalDeletions = 0;
            let totalFiles = 0;

            for (const commit of commits) {
              // Fetch detailed commit data to get stats
              const { data: commitData } = await octokit.rest.repos.getCommit({
                owner,
                repo,
                ref: commit.sha,
              });

              totalAdditions += commitData.stats?.additions || 0;
              totalDeletions += commitData.stats?.deletions || 0;
              totalFiles += commitData.files?.length || 0;
            }

            // Update PR with calculated stats
            detailedPR.additions = totalAdditions;
            detailedPR.deletions = totalDeletions;
            detailedPR.changed_files = totalFiles;

            console.log(`[UserSnapshot] PR #${pr.number} stats from commits: +${totalAdditions}/-${totalDeletions}, ${totalFiles} files`);
          } catch (commitError) {
            console.warn(`[UserSnapshot] Failed to fetch commits for PR #${pr.number}:`, commitError.message);
          }
        }

        detailedPRs.push(detailedPR);
      } catch (error) {
        console.warn(`[UserSnapshot] Failed to fetch details for PR #${pr.number}:`, error.message);
        // Use the basic PR data as fallback (will have 0 for additions/deletions/files)
        detailedPRs.push(pr);
      }
    }

    console.log(`[UserSnapshot] Fetched detailed data for ${detailedPRs.length} PRs`);

    // Calculate statistics (use detailedPRs which has additions/deletions/files)
    // ONLY count additions/deletions/files from MERGED PRs (not closed without merging)
    const mergedPRs = detailedPRs.filter(pr => pr.merged_at || pr.state === 'merged');
    const stats = {
      totalPRs: detailedPRs.length,
      openPRs: detailedPRs.filter(pr => pr.state === 'open').length,
      mergedPRs: mergedPRs.length,
      closedPRs: detailedPRs.filter(pr => (pr.state === 'closed' || pr.state === 'merged') && !pr.merged_at).length,
      totalAdditions: mergedPRs.reduce((sum, pr) => sum + (pr.additions || 0), 0),
      totalDeletions: mergedPRs.reduce((sum, pr) => sum + (pr.deletions || 0), 0),
      totalFiles: mergedPRs.reduce((sum, pr) => sum + (pr.changed_files || 0), 0),
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
      user: {
        login: pr.user.login,
        id: pr.user.id,
        avatar_url: pr.user.avatar_url,
        html_url: pr.user.html_url,
      },
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
 * Prevents concurrent updates for the same user (race condition protection)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @returns {Object} Updated snapshot data
 */
export async function updateUserSnapshot(owner, repo, username) {
  // Check if an update is already in progress for this user
  if (snapshotUpdatesInProgress.has(username)) {
    console.log(`[UserSnapshot] Update already in progress for ${username}, waiting for existing update...`);
    return snapshotUpdatesInProgress.get(username);
  }

  // Create and store the update promise
  const updatePromise = (async () => {
    try {
      console.log(`[UserSnapshot] Updating snapshot for ${username}...`);
      const snapshot = await buildUserSnapshot(owner, repo, username);
      await saveUserSnapshot(owner, repo, username, snapshot);
      console.log(`[UserSnapshot] Snapshot updated successfully for ${username}`);
      return snapshot;
    } finally {
      // Always remove from in-progress map when done (success or error)
      snapshotUpdatesInProgress.delete(username);
    }
  })();

  snapshotUpdatesInProgress.set(username, updatePromise);
  return updatePromise;
}
