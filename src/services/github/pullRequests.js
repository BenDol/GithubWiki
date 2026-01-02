import { getOctokit, getAuthenticatedUser, deduplicatedRequest } from './api';
import { updateFileContent } from './content';
import { isBanned } from './admin';
import { filterByReleaseDate } from '../../utils/releaseDate';
import { queueAchievementCheck } from '../achievements/achievementQueue';
import { createLogger } from '../../utils/logger';

const logger = createLogger('PullRequests');

/**
 * GitHub Pull Request operations
 */

/**
 * Create a pull request (same repository)
 */
export const createPullRequest = async (
  owner,
  repo,
  title,
  body,
  headBranch,
  baseBranch = 'main',
  config = null
) => {
  const octokit = getOctokit();

  // DISABLED: githubDataStore access temporarily disabled due to circular dependency
  let store = null;
  // try {
  //   const githubDataStoreModule = await import('../../store/githubDataStore');
  //   if (githubDataStoreModule?.useGitHubDataStore && typeof githubDataStoreModule.useGitHubDataStore.getState === 'function') {
  //     store = githubDataStoreModule.useGitHubDataStore.getState();
  //   } else {
  //     console.warn('[PR] githubDataStore module loaded but useGitHubDataStore.getState is not available');
  //   }
  // } catch (err) {
  //   console.warn('[PR] Could not access githubDataStore (will continue without cache):', err.message);
  // }

  // Check if user is banned
  if (config) {
    try {
      const user = await getAuthenticatedUser();
      const userIsBanned = await isBanned(user.login, owner, repo, config);

      if (userIsBanned) {
        console.warn(`[PR] Banned user ${user.login} attempted to create pull request`);
        throw new Error('You are banned from creating edit requests on this wiki');
      }
    } catch (error) {
      // If error is our ban message, re-throw it
      if (error.message === 'You are banned from creating edit requests on this wiki') {
        throw error;
      }
      // Otherwise, log and continue (might be authentication error)
      console.warn('[PR] Failed to check ban status:', error);
    }
  }

  if (store) {
    store.incrementAPICall();
  }

  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head: headBranch,
    base: baseBranch,
  });

  // Invalidate PR cache for this user (if store is available)
  if (store) {
    console.log(`[PR Cache] Invalidating cache for user: ${data.user.login}`);
    store.invalidatePRsForUser(data.user.login);
  }

  // Queue achievement checks for all PR-related achievements
  if (data.user.id && data.user.login) {
    const prAchievements = [
      'first-pr',              // First PR created
      'first-edit',            // Same as first-pr
      'pr-novice',             // 10 PRs
      'pr-expert',             // 50 PRs
      'pr-master',             // 100 PRs
      'pr-legend',             // 500 PRs
    ];

    logger.info('Queueing PR achievement checks', { userId: data.user.id, username: data.user.login, count: prAchievements.length });

    prAchievements.forEach(achievementId => {
      queueAchievementCheck(achievementId, {
        owner,
        repo,
        userId: data.user.id,
        username: data.user.login,
        delay: 5000, // Wait 5 seconds for GitHub API to sync
        retryDelay: 10000,
        maxRetries: 3,
      }).catch(error => {
        logger.error(`Failed to queue ${achievementId} achievement check`, { error: error.message });
      });
    });
  }

  return {
    number: data.number,
    url: data.html_url,
    state: data.state,
    title: data.title,
    body: data.body,
    createdAt: data.created_at,
    user: {
      login: data.user.login,
      avatar: data.user.avatar_url,
      url: data.user.html_url,
    },
  };
};

/**
 * Create a cross-repository pull request (fork to upstream)
 * @param {string} upstreamOwner - Upstream repository owner
 * @param {string} upstreamRepo - Upstream repository name
 * @param {string} forkOwner - Fork owner (username)
 * @param {string} headBranch - Branch name on fork
 * @param {string} title - PR title
 * @param {string} body - PR body
 * @param {string} baseBranch - Base branch on upstream (default: 'main')
 * @returns {Promise<Object>} PR object
 */
export const createCrossRepoPR = async (
  upstreamOwner,
  upstreamRepo,
  forkOwner,
  headBranch,
  title,
  body,
  baseBranch = 'main'
) => {
  const octokit = getOctokit();

  // DISABLED: githubDataStore access temporarily disabled due to circular dependency
  let store = null;
  // try {
  //   const githubDataStoreModule = await import('../../store/githubDataStore');
  //   if (githubDataStoreModule?.useGitHubDataStore && typeof githubDataStoreModule.useGitHubDataStore.getState === 'function') {
  //     store = githubDataStoreModule.useGitHubDataStore.getState();
  //   } else {
  //     console.warn('[PR] githubDataStore module loaded but useGitHubDataStore.getState is not available');
  //   }
  // } catch (err) {
  //   console.warn('[PR] Could not access githubDataStore (will continue without cache):', err.message);
  // }

  if (store) {
    store.incrementAPICall();
  }

  console.log(`[PR] Creating cross-repo PR from ${forkOwner}:${headBranch} to ${upstreamOwner}/${upstreamRepo}:${baseBranch}`);

  try {
    const { data } = await octokit.rest.pulls.create({
      owner: upstreamOwner,
      repo: upstreamRepo,
      title,
      body,
      head: `${forkOwner}:${headBranch}`, // Format: "username:branch-name"
      base: baseBranch,
    });

    console.log(`[PR] Cross-repo PR created successfully: #${data.number}`);

    // Invalidate PR cache for this user (if store is available)
    if (store) {
      console.log(`[PR Cache] Invalidating cache for user: ${data.user.login}`);
      store.invalidatePRsForUser(data.user.login);
    }

    return {
      number: data.number,
      url: data.html_url,
      state: data.state,
      title: data.title,
      body: data.body,
      createdAt: data.created_at,
      user: {
        login: data.user.login,
        avatar: data.user.avatar_url,
        url: data.user.html_url,
      },
    };
  } catch (error) {
    console.error('[PR] Failed to create cross-repo PR:', error);
    throw error;
  }
};

/**
 * Generate PR title for page edit
 * @param {string} pageTitle - The page title
 * @param {string} sectionTitle - The section title (optional)
 * @param {boolean} isNewPage - Whether this is a new page (create) or existing (edit)
 * @param {string} pageId - The page ID (used for create operations)
 */
export const generatePRTitle = (pageTitle, sectionTitle, isNewPage = false, pageId = null) => {
  const action = isNewPage ? 'Create' : 'Edit';
  const pageName = pageTitle || pageId || 'Untitled';
  const pageIdSuffix = isNewPage && pageId ? ` (${pageId})` : '';

  return `[${action}] ${pageName}${pageIdSuffix}`;
};

/**
 * Get content from a PR's branch
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name (can be fork branch like "user:branch-name")
 * @param {string} filePath - File path to fetch
 * @returns {Promise<Object>} File content and metadata
 */
export const getPRBranchContent = async (owner, repo, branch, filePath, sha = null, bustCache = true) => {
  const octokit = getOctokit();

  try {
    console.log(`[PR Branch] Fetching content from ${owner}/${repo}, branch: ${branch}, file: ${filePath}`);

    // Handle fork branches (format: "username:branch-name")
    // When the branch is "username:branch-name", we need to strip the "username:" part
    // since we're already fetching from the correct owner's repo
    let targetBranch = branch;
    if (branch.includes(':')) {
      const parts = branch.split(':');
      targetBranch = parts[1]; // Get just the branch name, not the "username:" prefix
      console.log(`[PR Branch] Stripped fork prefix: ${branch} → ${targetBranch}`);
    }

    const params = {
      owner,  // This should already be the fork owner from PageEditorPage
      repo,   // This should already be the fork repo name
      path: filePath,
      ref: targetBranch,  // Use the branch name without prefix
    };

    // Note: Cache busting with custom headers causes CORS errors with GitHub API
    // GitHub's CDN may cache content for 2-3 minutes, but custom Cache-Control
    // headers are not allowed in browser CORS requests to GitHub API
    if (bustCache) {
      console.log('[PR Branch] Cache-busting requested (GitHub CDN may still cache for 2-3 minutes)');
    }

    console.log(`[PR Branch] Final request: GET /repos/${owner}/${repo}/contents/${filePath}?ref=${targetBranch}`);

    const { data } = await octokit.rest.repos.getContent(params);

    if (data.type !== 'file') {
      throw new Error('Path is not a file');
    }

    // Decode base64 content
    const content = Buffer.from(data.content, 'base64').toString('utf-8');

    console.log(`[PR Branch] Successfully fetched content (${content.length} bytes)`);

    return {
      content,
      sha: data.sha,
      branch: branch,
    };
  } catch (error) {
    console.error('[PR Branch] Failed to fetch content:', error);
    throw error;
  }
};

/**
 * CENTRALIZED: Check if a PR belongs to a user (direct or linked anonymous)
 * @param {Object} pr - PR object from GitHub API
 * @param {string} username - GitHub username
 * @param {number} userId - GitHub user ID
 * @returns {boolean} True if PR belongs to user
 */
export const isPRForUser = (pr, username, userId) => {
  // Direct PR from user
  const isDirectPR = pr.user.login === username;

  // Linked anonymous PR (has user-id label)
  const isLinkedPR = pr.labels && pr.labels.some(label => {
    const labelName = typeof label === 'string' ? label : label?.name;
    return labelName === `user-id:${userId}`;
  });

  return Boolean(isDirectPR || isLinkedPR);
};

/**
 * Get pull requests for a user in a repository with pagination support
 * OPTIMIZED: Uses cache, eliminates N+1 query pattern, and de-duplicates concurrent requests
 * INCLUDES: Direct PRs + Linked Anonymous PRs (via user-id label)
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - Username to filter PRs by
 * @param {number} userId - User ID to filter linked anonymous PRs
 * @param {string} baseBranch - Base branch to filter by (optional)
 * @param {number} page - Page number (1-indexed, default: 1)
 * @param {number} perPage - Items per page (default: 10)
 * @returns {Promise<{prs: Array, hasMore: boolean, totalCount: number}>}
 */
export const getUserPullRequests = async (owner, repo, username, userId, baseBranch = null, page = 1, perPage = 10) => {
  // DISABLED: githubDataStore access temporarily disabled due to circular dependency
  let store = null;
  // try {
  //   const githubDataStoreModule = await import('../../store/githubDataStore');
  //   if (githubDataStoreModule?.useGitHubDataStore && typeof githubDataStoreModule.useGitHubDataStore.getState === 'function') {
  //     store = githubDataStoreModule.useGitHubDataStore.getState();
  //   } else {
  //     console.warn('[PR] githubDataStore module loaded but useGitHubDataStore.getState is not available');
  //   }
  // } catch (err) {
  //   console.warn('[PR] Could not access githubDataStore (will continue without cache):', err.message);
  // }

  const cacheKey = `${owner}/${repo}/user/${username}${baseBranch ? `/${baseBranch}` : ''}/page/${page}/per/${perPage}`;

  // DISABLED: Authentication check temporarily disabled due to circular dependency
  // const { isAuthenticated } = await import('../../store/authStore').then(m => m.useAuthStore.getState());
  const isAuthenticated = false; // Assume not authenticated for cache purposes

  // Check cache first (if store is available)
  if (store) {
    const cached = store.getCachedPR(cacheKey, isAuthenticated);
    if (cached) {
      console.log(`[PR Cache] ✓ Cache hit for user PRs: ${username} (page ${page})`);
      return cached;
    }
    console.log(`[PR Cache] ✗ Cache miss for user PRs: ${username} (page ${page}) - fetching from API`);
  } else {
    console.log(`[PR] No cache available - fetching from API`);
  }

  // Use de-duplication to prevent concurrent duplicate requests
  const dedupKey = `getUserPullRequests:${cacheKey}`;

  return deduplicatedRequest(dedupKey, async () => {
    // Double-check cache in case another request completed while we were waiting (if store is available)
    if (store) {
      const recentCache = store.getCachedPR(cacheKey, isAuthenticated);
      if (recentCache) {
        console.log(`[PR Cache] ✓ Cache populated by concurrent request`);
        return recentCache;
      }
    }

    const octokit = getOctokit();
    if (store) {
      store.incrementAPICall();
    }

    // Fetch more than requested to account for filtering by username
    // We'll fetch pages until we have enough user PRs or run out
    const fetchPerPage = 100; // GitHub's max
    let allUserPRs = [];
    let currentFetchPage = 1;
    let hasMorePages = true;

    console.log(`[PR Fetch] Fetching PRs for ${username}, page ${page}, ${perPage} per page`);

    // Calculate how many PRs to skip (for pagination)
    const skipCount = (page - 1) * perPage;
    const needCount = skipCount + perPage;

    // Keep fetching until we have enough PRs for the requested page + 1 more to check hasMore
    while (hasMorePages && allUserPRs.length < needCount + 1) {
      const listParams = {
        owner,
        repo,
        state: 'all',
        sort: 'updated',
        direction: 'desc',
        per_page: fetchPerPage,
        page: currentFetchPage,
      };

      // Add base branch filter if provided
      if (baseBranch) {
        listParams.base = baseBranch;
      }

      const { data } = await octokit.rest.pulls.list(listParams);

      if (data.length === 0) {
        hasMorePages = false;
        break;
      }

      // Filter to only PRs created by the current user (direct + linked anonymous)
      const userPRsFromPage = data.filter(pr => isPRForUser(pr, username, userId));
      allUserPRs = [...allUserPRs, ...userPRsFromPage];

      console.log(`[PR Fetch] API page ${currentFetchPage}: Found ${userPRsFromPage.length}/${data.length} PRs by ${username}`);

      // If we got fewer than fetchPerPage, we've reached the end
      if (data.length < fetchPerPage) {
        hasMorePages = false;
      }

      currentFetchPage++;
    }

    console.log(`[PR Fetch] Total PRs found for ${username}: ${allUserPRs.length}`);

    // Filter PRs by release date (respects VITE_RELEASE_DATE)
    allUserPRs = filterByReleaseDate(allUserPRs, 'created_at');
    console.log(`[PR Fetch] After release date filter: ${allUserPRs.length} PRs`);

    // Slice to get the requested page
    const paginatedPRs = allUserPRs.slice(skipCount, skipCount + perPage);
    const hasMore = allUserPRs.length > skipCount + perPage;

    console.log(`[PR Pagination] Returning ${paginatedPRs.length} PRs for page ${page}, hasMore: ${hasMore}`);

    // NOTE: pulls.list() does NOT include additions, deletions, and changed_files
    // We need to fetch detailed PR data with pulls.get() for each PR
    // OPTIMIZATION: Fetch all in parallel to avoid sequential N+1 bottleneck
    console.log(`[PR Details] Fetching detailed data for ${paginatedPRs.length} PRs in parallel...`);

    const detailedPRs = await Promise.all(
      paginatedPRs.map(async (pr) => {
        try {
          // Fetch detailed PR data
          const { data: detailedPR } = await octokit.rest.pulls.get({
            owner,
            repo,
            pull_number: pr.number,
          });

          return {
            number: detailedPR.number,
            title: detailedPR.title,
            body: detailedPR.body,
            state: detailedPR.state,
            html_url: detailedPR.html_url,
            created_at: detailedPR.created_at,
            updated_at: detailedPR.updated_at,
            merged_at: detailedPR.merged_at,
            // These fields are only in pulls.get() response
            additions: detailedPR.additions || 0,
            deletions: detailedPR.deletions || 0,
            changed_files: detailedPR.changed_files || 0,
            commits: detailedPR.commits || 0,
            user: {
              login: detailedPR.user.login,
              avatar_url: detailedPR.user.avatar_url,
            },
            head: {
              ref: detailedPR.head.ref,
              sha: detailedPR.head.sha,
            },
            base: {
              ref: detailedPR.base.ref,
            },
            labels: detailedPR.labels || [],
          };
        } catch (error) {
          console.error(`[PR Details] Failed to fetch details for PR #${pr.number}:`, error);
          // Return basic data from list if detailed fetch fails
          return {
            number: pr.number,
            title: pr.title,
            body: pr.body,
            state: pr.state,
            html_url: pr.html_url,
            created_at: pr.created_at,
            updated_at: pr.updated_at,
            merged_at: pr.merged_at,
            additions: 0,
            deletions: 0,
            changed_files: 0,
            user: {
              login: pr.user.login,
              avatar_url: pr.user.avatar_url,
            },
            labels: pr.labels || [],
          };
        }
      })
    );

    // Increment API call count for the additional .get() calls (if store is available)
    if (store) {
      store.incrementAPICall(paginatedPRs.length);
    }

    // Prepare result with pagination metadata
    const result = {
      prs: detailedPRs,
      hasMore,
      totalCount: allUserPRs.length, // Total count we know about (may be incomplete if we stopped fetching)
    };

    // Cache the results (if store is available)
    if (store) {
      store.cachePR(cacheKey, result);
      console.log(`[PR Cache] Cached ${detailedPRs.length} PRs with detailed stats for user: ${username} (page ${page})`);
    }

    return result;
  });
};

/**
 * Close a pull request
 */
export const closePullRequest = async (owner, repo, pullNumber) => {
  const octokit = getOctokit();

  // DISABLED: githubDataStore access temporarily disabled due to circular dependency
  let store = null;
  // try {
  //   const githubDataStoreModule = await import('../../store/githubDataStore');
  //   if (githubDataStoreModule?.useGitHubDataStore && typeof githubDataStoreModule.useGitHubDataStore.getState === 'function') {
  //     store = githubDataStoreModule.useGitHubDataStore.getState();
  //   } else {
  //     console.warn('[PR] githubDataStore module loaded but useGitHubDataStore.getState is not available');
  //   }
  // } catch (err) {
  //   console.warn('[PR] Could not access githubDataStore (will continue without cache):', err.message);
  // }

  if (store) {
    store.incrementAPICall();
  }

  const { data } = await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: pullNumber,
    state: 'closed',
  });

  // Invalidate PR cache for this user (if store is available)
  if (store) {
    console.log(`[PR Cache] Invalidating cache for user: ${data.user.login}`);
    store.invalidatePRsForUser(data.user.login);
  }

  return {
    number: data.number,
    state: data.state,
    closed_at: data.closed_at,
  };
};

/**
 * Generate PR body with edit details
 */
export const generatePRBody = async (pageTitle, sectionId, pageId, summary = null) => {
  try {
    const user = await getAuthenticatedUser();

    let body = `## Page Edit\n\n`;
    body += `**Page:** ${pageTitle}\n`;
    body += `**Section:** ${sectionId}\n`;
    body += `**Page ID:** ${pageId}\n`;
    body += `**Author:** @${user.login}\n\n`;

    if (summary) {
      body += `### Changes\n\n${summary}\n\n`;
    }

    body += `---\n\n`;
    body += `🤖 Generated with [GitHub Wiki Framework](https://github.com)\n\n`;
    body += `This pull request was created through the wiki's web editor.\n`;

    return body;
  } catch (error) {
    console.error('Failed to generate PR body:', error);
    return `Page edit for ${pageTitle}`;
  }
};

/**
 * Get pull request by number
 */
export const getPullRequest = async (owner, repo, number) => {
  const octokit = getOctokit();

  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: number,
  });

  return {
    number: data.number,
    url: data.html_url,
    state: data.state,
    title: data.title,
    body: data.body,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    mergedAt: data.merged_at,
    user: {
      login: data.user.login,
      avatar: data.user.avatar_url,
    },
    head: {
      ref: data.head.ref,
      sha: data.head.sha,
    },
    base: {
      ref: data.base.ref,
      sha: data.base.sha,
    },
  };
};

/**
 * List pull requests for a repository
 */
export const listPullRequests = async (owner, repo, state = 'open', page = 1, perPage = 10) => {
  const octokit = getOctokit();

  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state,
    page,
    per_page: perPage,
    sort: 'created',
    direction: 'desc',
  });

  return data.map((pr) => ({
    number: pr.number,
    url: pr.html_url,
    state: pr.state,
    title: pr.title,
    createdAt: pr.created_at,
    user: {
      login: pr.user.login,
      avatar: pr.user.avatar_url,
    },
  }));
};

/**
 * Add labels to a pull request
 */
export const addPRLabels = async (owner, repo, number, labels) => {
  const octokit = getOctokit();

  try {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: number,
      labels,
    });
  } catch (error) {
    // Labels might not exist, that's okay
    console.warn('Failed to add labels:', error.message);
  }
};

/**
 * Create pull request with standard wiki edit labels
 */
export const createWikiEditPR = async (
  owner,
  repo,
  pageTitle,
  sectionTitle,
  sectionId,
  pageId,
  headBranch,
  summary = null,
  baseBranch = 'main',
  isNewPage = false,
  isFirstContribution = false,
  config = null
) => {
  // Generate PR details
  const title = generatePRTitle(pageTitle, sectionTitle, isNewPage, pageId);
  const body = await generatePRBody(pageTitle, sectionId, pageId, summary);

  // Create PR
  const pr = await createPullRequest(owner, repo, title, body, headBranch, baseBranch, config);

  // DISABLED: PR cache invalidation temporarily disabled due to circular dependency
  // try {
  //   const githubDataStoreModule = await import('../../store/githubDataStore');
  //   if (githubDataStoreModule?.useGitHubDataStore) {
  //     const store = githubDataStoreModule.useGitHubDataStore.getState();
  //     if (store) {
  //       store.invalidatePRCache();
  //       console.log('[PR] Invalidated PR cache after PR creation');
  //     }
  //   }
  // } catch (err) {
  //   console.warn('[PR] Could not invalidate cache (will continue):', err.message);
  // }

  // Build label list
  const labels = ['wiki-edit', 'documentation'];
  if (isFirstContribution) {
    labels.push('first-contribution');
    console.log('[PR] Adding first-contribution label');
  }

  // Try to add labels
  try {
    await addPRLabels(owner, repo, pr.number, labels);
  } catch (error) {
    // Labels might not exist, continue anyway
    console.warn('Could not add labels to PR:', error);
  }

  return pr;
};

/**
 * Find existing open PR for a page ID
 * Searches for PRs with branch name matching pattern: wiki-edit/<section>/<page-id>-*
 * INCLUDES: Direct PRs + Linked Anonymous PRs (via user-id label)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} sectionId - Section ID
 * @param {string} pageIdFromMetadata - Page ID from metadata
 * @param {string} username - Current user's username
 * @param {number} userId - Current user's ID
 * @param {string} currentPageId - Current page ID (optional)
 * @returns {Promise<Object|null>} PR object if found, null otherwise
 */
export const findExistingPRForPage = async (owner, repo, sectionId, pageIdFromMetadata, username, userId, currentPageId = null) => {
  const octokit = getOctokit();

  try {
    // Get all open PRs
    const { data: prs } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 100,
    });

    console.log(`[PR Search] Looking for existing PR by user: ${username}`);
    console.log(`[PR Search] Section: ${sectionId}, Page ID: ${pageIdFromMetadata}, Filename: ${currentPageId}`);
    console.log(`[PR Search] Found ${prs.length} total open PRs`);

    // Filter to PRs created by current user (direct + linked anonymous)
    const userPRs = prs.filter(pr => isPRForUser(pr, username, userId));
    console.log(`[PR Search] Found ${userPRs.length} PRs by user ${username} (including linked anonymous edits)`);

    if (userPRs.length > 0) {
      console.log('[PR Search] User PRs:', userPRs.map(pr => ({ number: pr.number, branch: pr.head.ref })));
    }

    // Try multiple patterns to find matching PR
    // Need to check both direct branches and fork branches (username:branch-name)
    const patterns = [
      // Direct branch patterns (for users with write access)
      `wiki-edit/${sectionId}/${pageIdFromMetadata}-`,
      currentPageId && currentPageId !== pageIdFromMetadata ? `wiki-edit/${sectionId}/${currentPageId}-` : null,

      // Fork branch patterns (for users without write access)
      `${username}:wiki-edit/${sectionId}/${pageIdFromMetadata}-`,
      currentPageId && currentPageId !== pageIdFromMetadata ? `${username}:wiki-edit/${sectionId}/${currentPageId}-` : null,
    ].filter(Boolean);

    console.log('[PR Search] Trying patterns:', patterns);

    let matchingPR = null;
    let matchedPattern = null;

    for (const pattern of patterns) {
      // Check both head.ref (branch name) and head.label (username:branch for forks)
      matchingPR = userPRs.find(pr => {
        const branchRef = pr.head.label || pr.head.ref;
        return branchRef.includes(pattern);
      });

      if (matchingPR) {
        matchedPattern = pattern;
        const branchRef = matchingPR.head.label || matchingPR.head.ref;
        console.log(`[PR Search] Found match with pattern "${pattern}": PR #${matchingPR.number} (branch: ${branchRef})`);
        break;
      } else {
        console.log(`[PR Search] No match found for pattern: ${pattern}`);
      }
    }

    if (!matchingPR) {
      console.log('[PR Search] No existing PR found for this page');
      return null;
    }

    // Get full PR details
    const { data: fullPR } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: matchingPR.number,
    });

    console.log(`[PR Search] Returning PR #${fullPR.number}: ${fullPR.title}`);

    // Use fullPR.head.label for fork branches (format: "username:branch-name")
    // Use fullPR.head.ref for direct branches (format: "branch-name")
    const branchRef = fullPR.head.label || fullPR.head.ref;

    console.log(`[PR Search] PR head.ref: ${fullPR.head.ref}`);
    console.log(`[PR Search] PR head.label: ${fullPR.head.label}`);
    console.log(`[PR Search] Using branch ref: ${branchRef}`);

    return {
      number: fullPR.number,
      url: fullPR.html_url,
      state: fullPR.state,
      title: fullPR.title,
      body: fullPR.body,
      head: {
        ref: branchRef,
        sha: fullPR.head.sha,
        repo: fullPR.head.repo, // Include fork repo info for content fetching
      },
      base: {
        ref: fullPR.base.ref,
        sha: fullPR.base.sha,
      },
    };
  } catch (error) {
    console.error('[PR Search] Failed to find existing PR:', error);
    return null;
  }
};

/**
 * Commit changes to an existing PR's branch
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} branchName - Branch name to commit to
 * @param {string} filePath - Path to file
 * @param {string} content - New file content
 * @param {string} commitMessage - Commit message
 * @param {string} fileSha - Current file SHA (null for new files)
 * @returns {Promise<Object>} Commit result
 */
export const commitToExistingBranch = async (
  owner,
  repo,
  branchName,
  filePath,
  content,
  commitMessage,
  fileSha = null
) => {
  try {
    console.log(`[PR] Committing to existing branch: ${branchName}`);
    console.log(`[PR] File path: ${filePath}`);
    console.log(`[PR] Provided file SHA: ${fileSha || 'none (new file)'}`);

    // Get the current file SHA from the PR branch (not main branch)
    // This is important because the file in the PR branch might be different from main
    const { getFileContent } = await import('./content.js');

    let branchFileSha = fileSha;

    try {
      console.log(`[PR] Fetching current file SHA from branch: ${branchName}`);
      const fileData = await getFileContent(owner, repo, filePath, branchName);
      if (fileData?.sha) {
        branchFileSha = fileData.sha;
        console.log(`[PR] Using file SHA from branch: ${branchFileSha}`);
      }
    } catch (error) {
      // File might not exist in the branch yet (new file)
      console.log('[PR] File does not exist in branch (new file or error):', error.message);
      branchFileSha = null;
    }

    // Use the existing updateFileContent function to commit to the branch
    const result = await updateFileContent(
      owner,
      repo,
      filePath,
      content,
      commitMessage,
      branchName,
      branchFileSha
    );

    console.log('[PR] Successfully committed to existing branch');
    return result;
  } catch (error) {
    console.error('[PR] Failed to commit to existing branch:', error);
    throw error;
  }
};
