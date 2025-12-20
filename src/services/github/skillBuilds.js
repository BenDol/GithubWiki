import { getOctokit } from './api';

/**
 * Skill Builds Storage System
 * Stores user skill builds in GitHub Issues as a database
 *
 * Issue Format:
 * - Title: [Skill Builds] username
 * - Labels: skill-builds, user-id:12345, automated
 * - Body: JSON array of builds
 *
 * Build Format:
 * {
 *   id: "unique-build-id",
 *   name: "Build Name",
 *   maxSlots: 10,
 *   slots: [...],
 *   createdAt: "ISO date",
 *   updatedAt: "ISO date"
 * }
 *
 * Indexing:
 * - Primary: User ID label (user-id:12345) - permanent
 * - Fallback: Username in title - for legacy
 */

const BUILDS_LABEL = 'skill-builds'; // Must match the type used in storage
const BUILDS_TITLE_PREFIX = '[Skill Builds]';
const MAX_BUILDS_PER_USER = 10; // Limit to prevent issue size bloat

/**
 * Get all builds for a specific user
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} [userId] - Optional GitHub user ID for faster lookup
 * @returns {Array} Array of builds or empty array if not found
 */
export async function getUserBuilds(owner, repo, username, userId = null) {
  try {
    const octokit = getOctokit();

    // Search for the user's builds issue
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: BUILDS_LABEL,
      state: 'open',
      per_page: 100,
    });

    let buildsIssue = null;

    // First try: Search by user ID label (permanent identifier, preferred)
    if (userId) {
      buildsIssue = issues.find(issue =>
        issue.labels.some(label =>
          (typeof label === 'string' && label === `user-id:${userId}`) ||
          (typeof label === 'object' && label.name === `user-id:${userId}`)
        )
      );

      if (buildsIssue) {
        console.log(`[SkillBuilds] Found builds for user ${username} by ID: ${userId}`);
      }
    }

    // Second try: Search by username in title (legacy or no user ID provided)
    if (!buildsIssue) {
      buildsIssue = issues.find(
        issue => issue.title === `${BUILDS_TITLE_PREFIX} ${username}`
      );

      if (buildsIssue) {
        console.log(`[SkillBuilds] Found legacy builds for ${username} by title`);
      }
    }

    if (!buildsIssue) {
      console.log(`[SkillBuilds] No builds found for user: ${username}`);
      return [];
    }

    // Parse JSON from issue body
    try {
      const builds = JSON.parse(buildsIssue.body || '[]');
      console.log(`[SkillBuilds] Loaded ${builds.length} builds for ${username}`);
      return Array.isArray(builds) ? builds : [];
    } catch (parseError) {
      console.error(`[SkillBuilds] Failed to parse builds data for ${username}:`, parseError);
      return [];
    }
  } catch (error) {
    console.error(`[SkillBuilds] Failed to get builds for ${username}:`, error);
    return [];
  }
}

/**
 * Save builds for a user (create or update issue)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} userId - GitHub user ID
 * @param {Array} builds - Array of builds to save
 * @returns {Object} Created/updated issue
 */
export async function saveUserBuilds(owner, repo, username, userId, builds) {
  try {
    const octokit = getOctokit();

    // Validate builds array
    if (!Array.isArray(builds)) {
      throw new Error('Builds must be an array');
    }

    // Limit number of builds
    if (builds.length > MAX_BUILDS_PER_USER) {
      throw new Error(`Maximum ${MAX_BUILDS_PER_USER} builds allowed per user`);
    }

    // Search for existing builds issue
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: BUILDS_LABEL,
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
        issue => issue.title === `${BUILDS_TITLE_PREFIX} ${username}`
      );
    }

    const issueTitle = `${BUILDS_TITLE_PREFIX} ${username}`;
    const issueBody = JSON.stringify(builds, null, 2);
    const userIdLabel = userId ? `user-id:${userId}` : null;

    if (existingIssue) {
      // Update existing builds
      console.log(`[SkillBuilds] Updating builds for ${username} (issue #${existingIssue.number})`);

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
          console.log(`[SkillBuilds] Adding user-id label to legacy builds for ${username}`);
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
      // Create new builds issue
      console.log(`[SkillBuilds] Creating new builds issue for ${username}${userIdLabel ? ` (ID: ${userId})` : ''}`);

      const labels = [BUILDS_LABEL];
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
        console.log(`[SkillBuilds] Locked builds issue for ${username} to collaborators only`);
      } catch (lockError) {
        console.warn(`[SkillBuilds] Failed to lock issue for ${username}:`, lockError.message);
      }

      return newIssue;
    }
  } catch (error) {
    console.error(`[SkillBuilds] Failed to save builds for ${username}:`, error);
    throw error;
  }
}

/**
 * Add a build for a user
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} userId - GitHub user ID
 * @param {Object} build - Build to add
 * @returns {Object} Updated builds array
 */
export async function addUserBuild(owner, repo, username, userId, build) {
  const builds = await getUserBuilds(owner, repo, username, userId);

  // Generate unique ID if not provided
  if (!build.id) {
    build.id = `build-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  }

  // Add timestamps
  build.createdAt = new Date().toISOString();
  build.updatedAt = new Date().toISOString();

  // Check limit
  if (builds.length >= MAX_BUILDS_PER_USER) {
    throw new Error(`Maximum ${MAX_BUILDS_PER_USER} builds allowed. Please delete an old build first.`);
  }

  builds.push(build);
  await saveUserBuilds(owner, repo, username, userId, builds);
  console.log(`[SkillBuilds] Added build "${build.name}" for ${username}`);

  return builds;
}

/**
 * Update a build for a user
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} userId - GitHub user ID
 * @param {string} buildId - Build ID to update
 * @param {Object} updatedBuild - Updated build data
 * @returns {Object} Updated builds array
 */
export async function updateUserBuild(owner, repo, username, userId, buildId, updatedBuild) {
  const builds = await getUserBuilds(owner, repo, username, userId);

  const buildIndex = builds.findIndex(b => b.id === buildId);
  if (buildIndex === -1) {
    throw new Error(`Build with ID ${buildId} not found`);
  }

  // Preserve original timestamps, update the updatedAt
  builds[buildIndex] = {
    ...updatedBuild,
    id: buildId,
    createdAt: builds[buildIndex].createdAt || new Date().toISOString(),
    updatedAt: new Date().toISOString(),
  };

  await saveUserBuilds(owner, repo, username, userId, builds);
  console.log(`[SkillBuilds] Updated build "${updatedBuild.name}" for ${username}`);

  return builds;
}

/**
 * Delete a build for a user
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {number} userId - GitHub user ID
 * @param {string} buildId - Build ID to delete
 * @returns {Object} Updated builds array
 */
export async function deleteUserBuild(owner, repo, username, userId, buildId) {
  const builds = await getUserBuilds(owner, repo, username, userId);

  const filteredBuilds = builds.filter(b => b.id !== buildId);

  if (filteredBuilds.length === builds.length) {
    throw new Error(`Build with ID ${buildId} not found`);
  }

  await saveUserBuilds(owner, repo, username, userId, filteredBuilds);
  console.log(`[SkillBuilds] Deleted build ${buildId} for ${username}`);

  return filteredBuilds;
}

