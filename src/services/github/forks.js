import { getOctokit } from './api';

/**
 * GitHub fork management operations
 */

/**
 * Check if user has a fork of the repository
 * @param {string} owner - Upstream repository owner
 * @param {string} repo - Upstream repository name
 * @param {string} username - Username to check
 * @returns {Promise<Object|null>} Fork repository object if exists, null otherwise
 */
export const getUserFork = async (owner, repo, username) => {
  const octokit = getOctokit();

  try {
    console.log(`[Forks] Checking if ${username} has a fork of ${owner}/${repo}`);

    // Try to get the fork directly
    const { data } = await octokit.rest.repos.get({
      owner: username,
      repo: repo,
    });

    // Verify it's actually a fork of the upstream repo
    if (data.fork && data.parent) {
      const isCorrectFork =
        data.parent.owner.login.toLowerCase() === owner.toLowerCase() &&
        data.parent.name.toLowerCase() === repo.toLowerCase();

      if (isCorrectFork) {
        console.log(`[Forks] Found fork: ${data.full_name}`);
        return {
          owner: data.owner.login,
          repo: data.name,
          fullName: data.full_name,
          defaultBranch: data.default_branch,
          htmlUrl: data.html_url,
          cloneUrl: data.clone_url,
        };
      }
    }

    console.log(`[Forks] Repository ${username}/${repo} exists but is not a fork of ${owner}/${repo}`);
    return null;
  } catch (error) {
    if (error.status === 404) {
      console.log(`[Forks] No fork found for ${username}`);
      return null;
    }
    throw error;
  }
};

/**
 * Create a fork of the repository for the user
 * @param {string} owner - Upstream repository owner
 * @param {string} repo - Upstream repository name
 * @returns {Promise<Object>} Fork repository object
 */
export const createFork = async (owner, repo) => {
  const octokit = getOctokit();

  try {
    console.log(`[Forks] Creating fork of ${owner}/${repo}`);

    const { data } = await octokit.rest.repos.createFork({
      owner,
      repo,
    });

    console.log(`[Forks] Fork created: ${data.full_name}`);

    // GitHub may take a moment to fully initialize the fork
    // Wait a bit before returning
    await new Promise(resolve => setTimeout(resolve, 2000));

    return {
      owner: data.owner.login,
      repo: data.name,
      fullName: data.full_name,
      defaultBranch: data.default_branch,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
    };
  } catch (error) {
    console.error('[Forks] Failed to create fork:', error);
    throw error;
  }
};

/**
 * Sync fork's default branch with upstream repository
 * @param {string} forkOwner - Fork owner (usually the user)
 * @param {string} forkRepo - Fork repository name
 * @param {string} upstreamOwner - Upstream repository owner
 * @param {string} upstreamRepo - Upstream repository name
 * @returns {Promise<Object>} Merge result
 */
export const syncForkWithUpstream = async (forkOwner, forkRepo, upstreamOwner, upstreamRepo) => {
  const octokit = getOctokit();

  try {
    console.log(`[Forks] Syncing ${forkOwner}/${forkRepo} with upstream ${upstreamOwner}/${upstreamRepo}`);

    // Get the fork's default branch
    const { data: forkData } = await octokit.rest.repos.get({
      owner: forkOwner,
      repo: forkRepo,
    });

    const defaultBranch = forkData.default_branch;

    // Get the latest commit from upstream's default branch
    const { data: upstreamBranch } = await octokit.rest.repos.getBranch({
      owner: upstreamOwner,
      repo: upstreamRepo,
      branch: defaultBranch,
    });

    const upstreamSha = upstreamBranch.commit.sha;

    // Update the fork's default branch to point to upstream's commit
    const { data: mergeResult } = await octokit.rest.repos.mergeUpstream({
      owner: forkOwner,
      repo: forkRepo,
      branch: defaultBranch,
    });

    console.log(`[Forks] Fork synced successfully. Merge status: ${mergeResult.merge_type}`);

    return {
      merged: true,
      mergeType: mergeResult.merge_type,
      baseBranch: defaultBranch,
      message: mergeResult.message,
    };
  } catch (error) {
    if (error.status === 409) {
      // Already up to date
      console.log('[Forks] Fork is already up to date with upstream');
      return {
        merged: false,
        alreadyUpToDate: true,
        message: 'Fork is already up to date',
      };
    }

    console.error('[Forks] Failed to sync fork:', error);
    throw error;
  }
};

/**
 * Get or create fork for user
 * Checks if fork exists, creates if not, optionally syncs
 * @param {string} owner - Upstream repository owner
 * @param {string} repo - Upstream repository name
 * @param {string} username - Username
 * @param {boolean} autoSync - Whether to sync fork if it exists
 * @returns {Promise<Object>} Fork object with metadata
 */
export const getOrCreateFork = async (owner, repo, username, autoSync = true) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Forks] Getting or creating fork for ${username}`);
  console.log(`[Forks] Upstream: ${owner}/${repo}`);
  console.log(`${'='.repeat(60)}\n`);

  // Check if fork exists
  let fork = await getUserFork(owner, repo, username);

  if (!fork) {
    // Create fork
    console.log('[Forks] Fork does not exist, creating...');
    fork = await createFork(owner, repo);
    console.log(`[Forks] ✓ Fork created: ${fork.fullName}`);
  } else {
    console.log(`[Forks] ✓ Fork already exists: ${fork.fullName}`);

    // Sync if requested
    if (autoSync) {
      console.log('[Forks] Syncing fork with upstream...');
      const syncResult = await syncForkWithUpstream(fork.owner, fork.repo, owner, repo);

      if (syncResult.merged) {
        console.log(`[Forks] ✓ Fork synced (${syncResult.mergeType})`);
      } else if (syncResult.alreadyUpToDate) {
        console.log('[Forks] ✓ Fork already up to date');
      }
    }
  }

  console.log(`\n[Forks] ✓ Fork ready: ${fork.fullName}\n`);

  return fork;
};
