import { getOctokit, deduplicatedRequest } from './api';

/**
 * GitHub fork management operations
 */

/**
 * Check if user has a fork of the repository
 * OPTIMIZED: Uses cache with 30-minute TTL and de-duplicates concurrent requests
 * @param {string} owner - Upstream repository owner
 * @param {string} repo - Upstream repository name
 * @param {string} username - Username to check
 * @returns {Promise<Object|null>} Fork repository object if exists, null otherwise
 */
export const getUserFork = async (owner, repo, username) => {
  // DISABLED: githubDataStore access temporarily disabled due to circular dependency
  let store = null;
  // try {
  //   const githubDataStoreModule = await import('../../store/githubDataStore');
  //   if (githubDataStoreModule?.useGitHubDataStore && typeof githubDataStoreModule.useGitHubDataStore.getState === 'function') {
  //     store = githubDataStoreModule.useGitHubDataStore.getState();
  //   } else {
  //     console.warn('[Forks] githubDataStore module loaded but useGitHubDataStore.getState is not available');
  //   }
  // } catch (err) {
  //   console.warn('[Forks] Could not access githubDataStore (will continue without cache):', err.message);
  // }

  const cacheKey = `${username}/${repo}`;

  // Check cache first (if store is available)
  if (store) {
    const cached = store.getCachedFork(cacheKey);
    if (cached) {
      console.log(`[Forks] ✓ Cache hit for fork: ${username}/${repo}`);
      return cached;
    }
    console.log(`[Forks] ✗ Cache miss for fork - checking API`);
  } else {
    console.log(`[Forks] No cache available - checking API`);
  }

  // Use de-duplication to prevent concurrent duplicate requests
  const dedupKey = `getUserFork:${cacheKey}`;

  return deduplicatedRequest(dedupKey, async () => {
    // Double-check cache in case another request completed while we were waiting (if store is available)
    if (store) {
      const recentCache = store.getCachedFork(cacheKey);
      if (recentCache) {
        console.log(`[Forks] ✓ Cache populated by concurrent request`);
        return recentCache;
      }
    }

    const octokit = getOctokit();
    if (store) {
      store.incrementAPICall();
    }

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
          const forkData = {
            owner: data.owner.login,
            repo: data.name,
            fullName: data.full_name,
            defaultBranch: data.default_branch,
            htmlUrl: data.html_url,
            cloneUrl: data.clone_url,
          };

          // Cache the fork data (if store is available)
          if (store) {
            store.cacheFork(cacheKey, forkData);
            console.log(`[Forks] Cached fork data for ${username}/${repo}`);
          }

          return forkData;
        }
      }

      console.log(`[Forks] Repository ${username}/${repo} exists but is not a fork of ${owner}/${repo}`);

      // Cache null result to avoid repeated checks (if store is available)
      if (store) {
        store.cacheFork(cacheKey, null);
      }

      return null;
    } catch (error) {
      if (error.status === 404) {
        console.log(`[Forks] No fork found for ${username}`);

        // Cache null result to avoid repeated checks
        store.cacheFork(cacheKey, null);

        return null;
      }
      throw error;
    }
  });
};

/**
 * Create a fork of the repository for the user
 * @param {string} owner - Upstream repository owner
 * @param {string} repo - Upstream repository name
 * @returns {Promise<Object>} Fork repository object
 */
export const createFork = async (owner, repo) => {
  const octokit = getOctokit();

  // DISABLED: githubDataStore access temporarily disabled due to circular dependency
  let store = null;
  // try {
  //   const githubDataStoreModule = await import('../../store/githubDataStore');
  //   if (githubDataStoreModule?.useGitHubDataStore && typeof githubDataStoreModule.useGitHubDataStore.getState === 'function') {
  //     store = githubDataStoreModule.useGitHubDataStore.getState();
  //   } else {
  //     console.warn('[Forks] githubDataStore module loaded but useGitHubDataStore.getState is not available');
  //   }
  // } catch (err) {
  //   console.warn('[Forks] Could not access githubDataStore (will continue without cache):', err.message);
  // }

  if (store) {
    store.incrementAPICall();
  }

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

    const forkData = {
      owner: data.owner.login,
      repo: data.name,
      fullName: data.full_name,
      defaultBranch: data.default_branch,
      htmlUrl: data.html_url,
      cloneUrl: data.clone_url,
    };

    // Cache the newly created fork
    const cacheKey = `${data.owner.login}/${repo}`;
    store.cacheFork(cacheKey, forkData);
    console.log(`[Forks] Cached new fork: ${cacheKey}`);

    return forkData;
  } catch (error) {
    console.error('[Forks] Failed to create fork:', error);
    throw error;
  }
};

/**
 * Check if fork is behind upstream (doesn't require workflow scope)
 * @param {string} forkOwner - Fork owner
 * @param {string} forkRepo - Fork repository name
 * @param {string} upstreamOwner - Upstream repository owner
 * @param {string} upstreamRepo - Upstream repository name
 * @returns {Promise<Object>} Status information
 */
export const checkForkStatus = async (forkOwner, forkRepo, upstreamOwner, upstreamRepo) => {
  const octokit = getOctokit();

  try {
    console.log(`[Forks] Checking if ${forkOwner}/${forkRepo} is behind ${upstreamOwner}/${upstreamRepo}`);

    // Get default branches
    const { data: forkData } = await octokit.rest.repos.get({
      owner: forkOwner,
      repo: forkRepo,
    });

    const { data: upstreamData } = await octokit.rest.repos.get({
      owner: upstreamOwner,
      repo: upstreamRepo,
    });

    const defaultBranch = forkData.default_branch;

    // Compare fork with upstream using GitHub's compare API
    // Format: base...head where base is fork, head is upstream
    const { data: comparison } = await octokit.rest.repos.compareCommitsWithBasehead({
      owner: upstreamOwner,
      repo: upstreamRepo,
      basehead: `${forkOwner}:${defaultBranch}...${upstreamOwner}:${defaultBranch}`,
    });

    const status = {
      behind: comparison.behind_by > 0,
      ahead: comparison.ahead_by > 0,
      behindBy: comparison.behind_by,
      aheadBy: comparison.ahead_by,
      status: comparison.status, // 'identical', 'ahead', 'behind', or 'diverged'
      upToDate: comparison.status === 'identical',
      diverged: comparison.status === 'diverged',
    };

    console.log(`[Forks] Fork status: ${status.status}`);
    console.log(`[Forks] Behind by ${status.behindBy} commits, ahead by ${status.aheadBy} commits`);

    return status;
  } catch (error) {
    console.error('[Forks] Failed to check fork status:', error);
    // Non-fatal - return unknown status
    return {
      unknown: true,
      error: error.message,
    };
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

    if (error.status === 422 && error.message?.includes('workflow')) {
      // OAuth token lacks workflow scope - this is expected and non-critical
      console.warn('[Forks] Cannot sync workflow files (OAuth token lacks workflow scope)');
      console.warn('[Forks] This is expected behavior - fork can still be used for content edits');
    } else {
      console.error('[Forks] Failed to sync fork:', error);
    }

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

    // Try to auto-sync, fall back to manual instructions if workflow scope missing
    if (autoSync) {
      console.log('[Forks] Attempting to sync fork with upstream...');

      try {
        // Try automated sync first
        const syncResult = await syncForkWithUpstream(fork.owner, fork.repo, owner, repo);

        if (syncResult.merged) {
          console.log('[Forks] ✓ Fork synced successfully');
          fork.upToDate = true;
          fork.justSynced = true;
        } else if (syncResult.alreadyUpToDate) {
          console.log('[Forks] ✓ Fork is already up to date');
          fork.upToDate = true;
        }
      } catch (syncError) {
        // If sync fails due to workflow scope, check status and provide manual sync option
        if (syncError.status === 422 && syncError.message?.includes('workflow')) {
          console.warn('[Forks] ⚠ Cannot auto-sync (workflow files changed)');
          console.warn('[Forks] Checking fork status for manual sync...');

          const status = await checkForkStatus(fork.owner, fork.repo, owner, repo);

          if (status.unknown) {
            console.warn('[Forks] ⚠ Could not determine fork status');
            fork.statusUnknown = true;
          } else if (status.upToDate) {
            console.log('[Forks] ✓ Fork is up to date (despite workflow changes)');
            fork.upToDate = true;
          } else if (status.behind) {
            console.warn('[Forks] ⚠ Fork is behind upstream by', status.behindBy, 'commits');
            console.warn('[Forks] Manual sync required');

            fork.outOfDate = true;
            fork.behindBy = status.behindBy;
            fork.syncUrl = `https://github.com/${fork.fullName}`;
            fork.needsManualSync = true; // Flag for UI to show sync button

            if (status.diverged) {
              console.warn('[Forks] ⚠ Fork has diverged from upstream');
              fork.diverged = true;
            }
          } else if (status.ahead) {
            console.log('[Forks] ℹ Fork is ahead of upstream by', status.aheadBy, 'commits');
            fork.ahead = true;
            fork.upToDate = true; // Ahead is fine
          }
        } else {
          // Other sync error - check status as fallback
          console.error('[Forks] Sync failed:', syncError.message);
          const status = await checkForkStatus(fork.owner, fork.repo, owner, repo);

          if (status.behind) {
            fork.outOfDate = true;
            fork.behindBy = status.behindBy;
            fork.syncUrl = `https://github.com/${fork.fullName}`;
            fork.needsManualSync = true;
            fork.diverged = status.diverged;
          } else {
            fork.upToDate = status.upToDate;
          }
        }
      }
    }
  }

  console.log(`\n[Forks] ✓ Fork ready: ${fork.fullName}\n`);

  return fork;
};
