import { Octokit } from 'octokit';
import { retryPlugin } from './octokitRetryPlugin.js';
import { filterByReleaseDate } from '../../utils/releaseDate.js';
import { createLogger } from '../../utils/logger';

const logger = createLogger('GitHubAPI');

/**
 * GitHub API client wrapper using Octokit
 * Provides methods for interacting with GitHub repositories
 *
 * All Octokit instances automatically include retry logic for rate limits.
 * To opt-out per request, use: { request: { skipRetry: true } }
 */

let octokitInstance = null;
let botOctokitInstance = null;

// Custom Octokit class with retry plugin
logger.debug('Loading module - creating OctokitWithRetry class', { retryPluginType: typeof retryPlugin });
const OctokitWithRetry = Octokit.plugin(retryPlugin);
logger.debug('OctokitWithRetry class created', { created: !!OctokitWithRetry });

// Request de-duplication tracking
// Prevents multiple concurrent requests for the same data
const pendingRequests = new Map();

// Cache for authenticated user data
// TTL: 5 minutes (user data rarely changes during a session)
let authenticatedUserCache = null;
let authenticatedUserCacheTime = 0;
const AUTHENTICATED_USER_CACHE_TTL = 5 * 60 * 1000; // 5 minutes

/**
 * Initialize Octokit with authentication token
 * Automatically includes retry plugin for rate limit handling
 */
export const initializeOctokit = (token) => {
  logger.debug('initializeOctokit called', {
    hasToken: !!token,
    tokenLength: token?.length
  });

  // Clear authenticated user cache on reinitialize
  authenticatedUserCache = null;
  authenticatedUserCacheTime = 0;

  octokitInstance = new OctokitWithRetry({
    auth: token,
    userAgent: 'GitHub-Wiki-Framework/1.0',
    throttle: {
      // Disable built-in throttling - we use our own retry plugin
      enabled: false,
    },
  });

  logger.info('Octokit initialized with automatic retry on rate limits', {
    hasAuth: !!octokitInstance.auth,
    requestType: typeof octokitInstance.request
  });

  return octokitInstance;
};

/**
 * Get Octokit instance
 * Creates an unauthenticated instance for public repo access if not logged in
 * Automatically includes retry plugin for rate limit handling
 */
export const getOctokit = () => {
  // Check if user is authenticated via global auth store (client-side)
  let userToken = null;
  if (typeof window !== 'undefined' && window.__authStore__?.getState) {
    try {
      const authState = window.__authStore__.getState();
      if (authState?.token && authState?.isAuthenticated) {
        // Token is stored encrypted - decrypt it
        const { decryptToken } = require('./auth');
        userToken = decryptToken(authState.token);
      }
    } catch (error) {
      // Ignore - auth store might not be ready yet
    }
  }

  // Server-side: Check for token in environment (for serverless functions)
  if (!userToken && typeof process !== 'undefined' && process.env?.GITHUB_TOKEN) {
    userToken = process.env.GITHUB_TOKEN;
  }

  // SECURITY: On server-side, ALWAYS create a new instance per-request
  // to prevent token leakage between requests in serverless environments
  const isServerSide = typeof window === 'undefined';

  // If we have a token, always create an authenticated instance
  if (userToken) {
    if (isServerSide) {
      // Server-side: NEVER cache - create fresh instance per request
      logger.debug('Creating server-side authenticated Octokit instance (no cache)');
      return new OctokitWithRetry({
        auth: userToken,
        userAgent: 'GitHub-Wiki-Framework/1.0',
        throttle: {
          enabled: false,
        },
      });
    } else {
      // Client-side: Can safely cache
      const instanceHasAuth = octokitInstance?.auth !== undefined;
      if (!instanceHasAuth) {
        logger.debug('Creating client-side authenticated Octokit instance');
        octokitInstance = new OctokitWithRetry({
          auth: userToken,
          userAgent: 'GitHub-Wiki-Framework/1.0',
          throttle: {
            enabled: false,
          },
        });
        logger.info('Authenticated Octokit initialized');
      }
      return octokitInstance;
    }
  }

  // No token - return unauthenticated instance
  if (!octokitInstance) {
    // Create unauthenticated instance for public repo read-only access
    octokitInstance = new OctokitWithRetry({
      userAgent: 'GitHub-Wiki-Framework/1.0',
      throttle: {
        enabled: false,
      },
    });
    logger.info('Unauthenticated Octokit created with automatic retry');
  }

  return octokitInstance;
};

/**
 * Clear Octokit instance (for logout)
 */
export const clearOctokit = () => {
  octokitInstance = null;
  // Clear authenticated user cache on logout
  authenticatedUserCache = null;
  authenticatedUserCacheTime = 0;
};

/**
 * Initialize Bot Octokit with bot token
 * Used for creating comment issues (so users can't close them)
 *
 * SECURITY: Bot token should NEVER be in client-side code.
 * Bot operations should only run server-side (GitHub Actions, Netlify Functions, etc.)
 *
 * For now, comment issues are created by authenticated users instead of bot.
 * This is safer and doesn't expose any tokens.
 *
 * @param {string} botToken - Bot token (server-side only, not from env vars)
 */
export const initializeBotOctokit = (botToken = null) => {
  // SECURITY: Do NOT read from import.meta.env - that bundles secrets into client code!
  // Bot token should only be passed explicitly from server-side code.

  if (!botToken) {
    logger.info('Bot token not configured - comment issues will be created by authenticated users');
    return null;
  }

  botOctokitInstance = new OctokitWithRetry({
    auth: botToken,
    userAgent: 'GitHub-Wiki-Bot/1.0',
    throttle: {
      // Disable built-in throttling - we use our own retry plugin
      enabled: false,
    },
  });

  logger.info('Bot Octokit initialized with automatic retry');
  return botOctokitInstance;
};

/**
 * Get Bot Octokit instance (for creating comment issues)
 * @param {boolean} fallbackToUser - Whether to fall back to user token if bot not available (default: false)
 * @returns {Octokit} Bot Octokit instance
 * @throws {Error} If bot token not configured and fallback disabled
 */
export const getBotOctokit = (fallbackToUser = false) => {
  if (botOctokitInstance) {
    return botOctokitInstance;
  }

  if (fallbackToUser) {
    logger.warn('Bot token not configured, falling back to user token');
    return getOctokit();
  }

  throw new Error('Bot token not configured. Please configure VITE_WIKI_BOT_TOKEN to enable comment functionality.');
};

/**
 * Check if bot token is configured
 * @returns {boolean} True if bot token is available
 */
export const hasBotToken = () => {
  return botOctokitInstance !== null;
};

/**
 * Clear Bot Octokit instance
 */
export const clearBotOctokit = () => {
  botOctokitInstance = null;
};

/**
 * Request de-duplication wrapper
 * Prevents multiple concurrent requests for the same data
 *
 * If a request with the same key is already in-flight, returns the existing promise
 * instead of making a duplicate API call.
 *
 * @param {string} key - Unique identifier for the request
 * @param {Function} requestFn - Async function that performs the actual API request
 * @returns {Promise} The result of the request
 *
 * @example
 * const data = await deduplicatedRequest('user-prs-username', async () => {
 *   return await octokit.rest.pulls.list({ owner, repo });
 * });
 */
export const deduplicatedRequest = async (key, requestFn) => {
  // Check if request already in flight
  if (pendingRequests.has(key)) {
    logger.debug('Waiting for in-flight request', { key });
    return pendingRequests.get(key);
  }

  logger.debug('Starting new request', { key });

  // Create promise placeholder and track it IMMEDIATELY (before any async work)
  // This prevents race condition where multiple calls check pendingRequests
  // at the same time before any of them set it
  let resolvePromise, rejectPromise;
  const requestPromise = new Promise((resolve, reject) => {
    resolvePromise = resolve;
    rejectPromise = reject;
  });

  // Set in map IMMEDIATELY
  pendingRequests.set(key, requestPromise);

  // Now execute the actual async work
  (async () => {
    try {
      const result = await requestFn();
      logger.debug('Request completed', { key });
      resolvePromise(result);
    } catch (error) {
      logger.error('Request failed', { key, error });
      rejectPromise(error);
    } finally {
      // Clean up after completion (success or failure)
      pendingRequests.delete(key);
      logger.trace('Cleaned up request', { key });
    }
  })();

  return requestPromise;
};

/**
 * Check if user is authenticated (has token)
 */
export const isAuthenticated = () => {
  // Server-side: Check process.env directly since we don't cache instances
  const isServerSide = typeof window === 'undefined';
  if (isServerSide && typeof process !== 'undefined' && process.env?.GITHUB_TOKEN) {
    return true;
  }

  // Client-side: Check if we have an authenticated instance with a token
  return octokitInstance !== null &&
         octokitInstance.auth !== undefined &&
         (typeof octokitInstance.auth === 'string' || typeof octokitInstance.auth === 'function');
};

/**
 * Get authenticated user (cached for 5 minutes)
 * Requires login
 * @returns {Promise<Object>} User data from GitHub API
 */
export const getAuthenticatedUser = async () => {
  // Call getOctokit() first to ensure instance is created (especially on server-side)
  const octokit = getOctokit();

  // Now check if we're authenticated
  if (!isAuthenticated()) {
    throw new Error('Authentication required. Please login first.');
  }

  // SECURITY: On server-side, NEVER cache user data - each request could be from different users
  const isServerSide = typeof window === 'undefined';

  // Check cache first (client-side only)
  if (!isServerSide) {
    const now = Date.now();
    if (authenticatedUserCache && (now - authenticatedUserCacheTime) < AUTHENTICATED_USER_CACHE_TTL) {
      return authenticatedUserCache;
    }
  }

  // Fetch from GitHub API
  const { data } = await octokit.rest.users.getAuthenticated();

  // Cache the result (client-side only)
  if (!isServerSide) {
    authenticatedUserCache = data;
    authenticatedUserCacheTime = Date.now();
  }

  return data;
};

/**
 * Get repository information
 */
export const getRepository = async (owner, repo) => {
  const octokit = getOctokit();
  const { data } = await octokit.rest.repos.get({
    owner,
    repo,
  });
  return data;
};

/**
 * Get file content from repository
 */
export const getFileContent = async (owner, repo, path, ref = 'main') => {
  const octokit = getOctokit();
  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref,
    });

    // Decode base64 content
    if (data.content) {
      return {
        content: atob(data.content),
        sha: data.sha,
        path: data.path,
        size: data.size,
      };
    }

    return null;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
};

/**
 * Get commit history for a file with pagination metadata
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - File path
 * @param {number} page - Page number (1-indexed, default: 1)
 * @param {number} perPage - Items per page (default: 10)
 * @returns {Promise<{commits: Array, hasMore: boolean}>}
 */
export const getFileCommits = async (owner, repo, path, page = 1, perPage = 10) => {
  // DISABLED: githubDataStore access temporarily disabled due to circular dependency
  let store = null;
  // try {
  //   const githubDataStoreModule = await import('../../store/githubDataStore');
  //   if (githubDataStoreModule?.useGitHubDataStore && typeof githubDataStoreModule.useGitHubDataStore.getState === 'function') {
  //     store = githubDataStoreModule.useGitHubDataStore.getState();
  //   } else {
  //     console.warn('[getFileCommits] githubDataStore module loaded but useGitHubDataStore.getState is not available');
  //   }
  // } catch (err) {
  //   console.warn('[getFileCommits] Could not access githubDataStore (will continue without cache):', err.message);
  // }

  // Lazy-load authStore only in browser context (avoid top-level await issues in serverless)
  let isAuthenticated = false;
  if (typeof window !== 'undefined') {
    try {
      const { useAuthStore } = await import('../../store/authStore');
      isAuthenticated = useAuthStore.getState().isAuthenticated;
    } catch (err) {
      // Silently fail if authStore can't be loaded
    }
  }

  const cacheKey = `${owner}/${repo}/${path}:${page}:${perPage}`;

  console.log(`[getFileCommits] Fetching commits for ${path} (page ${page})`);

  // Check cache first (pass auth status for appropriate TTL) - if store is available
  if (store) {
    const cached = store.getCachedCommits(cacheKey, isAuthenticated);
    if (cached) {
      console.log(`[getFileCommits] ✓ Cache hit - using cached commits (${cached.commits.length} commits)`);
      return cached;
    }
    console.log('[getFileCommits] Cache miss - fetching from GitHub API');
  } else {
    console.log('[getFileCommits] No cache available - fetching from GitHub API');
  }

  const octokit = getOctokit();

  try {
    // Increment API call counter for the list commits call (if store is available)
    if (store) {
      store.incrementAPICall();
    }

    const { data, headers } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      path,
      page,
      per_page: perPage,
    });

    // Fetch detailed commit info including stats (additions/deletions) in parallel
    const commitsWithStats = await Promise.all(
      data.map(async (commit) => {
        try {
          // Fetch full commit details to get stats (track if store is available)
          if (store) {
            store.incrementAPICall(); // Track each commit detail fetch
          }
          const { data: commitDetails } = await octokit.rest.repos.getCommit({
            owner,
            repo,
            ref: commit.sha,
          });

          // Check if this is a merge commit (has 2+ parents) OR a squash-merged PR
          const isMergeCommit = commit.parents && commit.parents.length >= 2;
          const commitMessage = commit.commit.message || '';
          const squashMergeMatch = commitMessage.match(/\(#(\d+)\)/);
          const isSquashMerge = squashMergeMatch !== null;

          let actualAuthor = {
            name: commit.commit.author.name,
            email: commit.commit.author.email,
            date: commit.commit.author.date,
            avatar: commit.author?.avatar_url,
            username: commit.author?.login,
            userId: commit.author?.id,
          };

          // For merge commits or squash merges, get the PR author
          if (isMergeCommit || isSquashMerge) {
            try {
              let pr = null;

              // If squash merge, we can get PR number directly from commit message
              if (isSquashMerge) {
                const prNumber = parseInt(squashMergeMatch[1], 10);
                try {
                  store.incrementAPICall(); // Track PR fetch
                  const { data: prData } = await octokit.rest.pulls.get({
                    owner,
                    repo,
                    pull_number: prNumber,
                  });
                  pr = prData;
                  logger.info('Found squash-merged PR from commit message', {
                    sha: commit.sha.substring(0, 7),
                    prNumber,
                    prAuthor: pr.user.login,
                    merger: commit.author?.login
                  });
                } catch (prErr) {
                  logger.warn('Failed to fetch PR by number', {
                    sha: commit.sha.substring(0, 7),
                    prNumber,
                    error: prErr.message
                  });
                }
              }

              // If not squash merge or PR fetch failed, try to find associated PR
              if (!pr) {
                store.incrementAPICall(); // Track associated PR fetch
                const { data: prs } = await octokit.rest.repos.listPullRequestsAssociatedWithCommit({
                  owner,
                  repo,
                  commit_sha: commit.sha,
                });

                if (prs && prs.length > 0) {
                  pr = prs[0];
                  logger.info('Found PR from associated commits', {
                    sha: commit.sha.substring(0, 7),
                    prNumber: pr.number
                  });
                }
              }

              // Use PR author if found
              if (pr) {
                actualAuthor = {
                  name: pr.user.login,
                  email: commit.commit.author.email, // Keep original email
                  date: commit.commit.author.date,
                  avatar: pr.user.avatar_url,
                  username: pr.user.login,
                  userId: pr.user.id,
                };
                logger.info('✅ Using PR author instead of merger', {
                  sha: commit.sha.substring(0, 7),
                  originalAuthor: commit.author?.login,
                  prAuthor: pr.user.login,
                  prNumber: pr.number,
                  isSquash: isSquashMerge,
                  isMerge: isMergeCommit
                });
              }
            } catch (prErr) {
              // If PR lookup fails, use commit author
              logger.warn('Failed to fetch PR, using commit author', {
                sha: commit.sha.substring(0, 7),
                error: prErr.message
              });
            }
          }

          // Extract stats for the specific file being viewed, not entire commit
          const fileStats = commitDetails.files?.find(file => file.filename === path);
          const stats = fileStats ? {
            additions: fileStats.additions || 0,
            deletions: fileStats.deletions || 0,
            total: fileStats.changes || 0,
          } : {
            additions: 0,
            deletions: 0,
            total: 0,
          };

          logger.debug('Extracted file-specific stats', {
            sha: commit.sha.substring(0, 7),
            path,
            fileFound: !!fileStats,
            fileStats: stats,
            totalCommitStats: {
              additions: commitDetails.stats?.additions || 0,
              deletions: commitDetails.stats?.deletions || 0,
            }
          });

          return {
            sha: commit.sha,
            message: commit.commit.message,
            date: commit.commit.author.date, // Flat date field for filtering
            author: actualAuthor,
            committer: {
              name: commit.commit.committer.name,
              date: commit.commit.committer.date,
            },
            url: commit.html_url,
            parents: commit.parents,
            stats,
          };
        } catch (err) {
          // If fetching stats fails for a commit, return without stats
          console.error(`Failed to fetch stats for commit ${commit.sha}:`, err);
          return {
            sha: commit.sha,
            message: commit.commit.message,
            date: commit.commit.author.date,
            author: {
              name: commit.commit.author.name,
              email: commit.commit.author.email,
              date: commit.commit.author.date,
              avatar: commit.author?.avatar_url,
              username: commit.author?.login,
              userId: commit.author?.id,
            },
            committer: {
              name: commit.commit.committer.name,
              date: commit.commit.committer.date,
            },
            url: commit.html_url,
            parents: commit.parents,
            stats: {
              additions: 0,
              deletions: 0,
              total: 0,
            },
          };
        }
      })
    );

    // Filter commits by release date (respects VITE_RELEASE_DATE)
    const commits = filterByReleaseDate(commitsWithStats, 'date');

    // Check if there are more pages
    // GitHub returns fewer than perPage if it's the last page
    const hasMore = data.length === perPage;

    const result = { commits, hasMore };

    // Cache the results (if store is available)
    if (store) {
      store.cacheCommits(cacheKey, result);
      console.log(`[getFileCommits] Cached ${commits.length} commits for ${path} (page ${page})`);
    }

    return result;
  } catch (error) {
    // Handle 404 (file not in repo) or 500 (file path doesn't exist)
    if (error.status === 404 || error.status === 500 || error.status === 409) {
      return { commits: [], hasMore: false }; // Return empty result for files not yet in repo
    }
    throw error;
  }
};

/**
 * Get single commit details
 */
export const getCommit = async (owner, repo, sha) => {
  const octokit = getOctokit();
  const { data } = await octokit.rest.repos.getCommit({
    owner,
    repo,
    ref: sha,
  });

  return {
    sha: data.sha,
    message: data.commit.message,
    author: {
      name: data.commit.author.name,
      email: data.commit.author.email,
      date: data.commit.author.date,
      avatar: data.author?.avatar_url,
      username: data.author?.login,
    },
    stats: data.stats,
    files: data.files,
    url: data.html_url,
  };
};

/**
 * Compare two commits
 */
export const compareCommits = async (owner, repo, base, head) => {
  const octokit = getOctokit();
  const { data } = await octokit.rest.repos.compareCommits({
    owner,
    repo,
    base,
    head,
  });

  return {
    status: data.status,
    aheadBy: data.ahead_by,
    behindBy: data.behind_by,
    totalCommits: data.total_commits,
    commits: data.commits,
    files: data.files,
  };
};

/**
 * Create a new branch
 * Requires login
 */
export const createBranch = async (owner, repo, branchName, fromRef = 'main') => {
  if (!isAuthenticated()) {
    throw new Error('Authentication required. Please login to create branches.');
  }
  const octokit = getOctokit();

  // Get the SHA of the ref we're branching from
  const { data: refData } = await octokit.rest.git.getRef({
    owner,
    repo,
    ref: `heads/${fromRef}`,
  });

  const sha = refData.object.sha;

  // Create new branch
  const { data } = await octokit.rest.git.createRef({
    owner,
    repo,
    ref: `refs/heads/${branchName}`,
    sha,
  });

  return data;
};

/**
 * Update file content (commit changes)
 * Requires login
 */
export const updateFile = async (owner, repo, path, content, message, branch = 'main', sha = null) => {
  if (!isAuthenticated()) {
    throw new Error('Authentication required. Please login to edit files.');
  }
  const octokit = getOctokit();

  const { data } = await octokit.rest.repos.createOrUpdateFileContents({
    owner,
    repo,
    path,
    message,
    content: btoa(content), // Base64 encode
    branch,
    ...(sha && { sha }), // Include SHA if updating existing file
  });

  return data;
};

/**
 * Create a pull request
 * Requires login
 */
export const createPullRequest = async (owner, repo, title, body, head, base = 'main') => {
  if (!isAuthenticated()) {
    throw new Error('Authentication required. Please login to create pull requests.');
  }
  const octokit = getOctokit();

  logger.debug('Creating PR', { head, base });

  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base,
  });

  logger.info('PR created', { number: data.number, base });

  return {
    number: data.number,
    url: data.html_url,
    state: data.state,
    title: data.title,
    body: data.body,
    base: data.base.ref,
    createdAt: data.created_at,
    user: {
      username: data.user.login,
      avatar: data.user.avatar_url,
    },
  };
};

/**
 * Get rate limit status
 */
export const getRateLimit = async () => {
  const octokit = getOctokit();
  const { data } = await octokit.rest.rateLimit.get();

  return {
    limit: data.rate.limit,
    remaining: data.rate.remaining,
    reset: new Date(data.rate.reset * 1000),
    used: data.rate.used,
  };
};

/**
 * Check if user has write access to repository
 */
export const checkWriteAccess = async (owner, repo) => {
  const octokit = getOctokit();

  try {
    const { data } = await octokit.rest.repos.getCollaboratorPermissionLevel({
      owner,
      repo,
      username: (await getAuthenticatedUser()).login,
    });

    return ['admin', 'write'].includes(data.permission);
  } catch (error) {
    // If we can't check permissions, assume no write access
    return false;
  }
};

/**
 * Create a GitHub issue
 * Requires login
 */
export const createGitHubIssue = async (owner, repo, title, body, labels = []) => {
  const octokit = getOctokit();

  // Check if we have authentication
  if (!octokitInstance || !octokitInstance.auth) {
    throw new Error('Authentication required. Please login to create issues.');
  }

  try {
    const { data } = await octokit.rest.issues.create({
      owner,
      repo,
      title,
      body,
      labels,
    });

    return {
      number: data.number,
      url: data.html_url,
      title: data.title,
      body: data.body,
      labels: data.labels,
      state: data.state,
      createdAt: data.created_at,
      user: {
        username: data.user.login,
        avatar: data.user.avatar_url,
      },
    };
  } catch (error) {
    logger.error('Error creating GitHub issue', { error });
    if (error.status === 401) {
      throw new Error('Authentication failed. Please logout and login again.');
    }
    throw error;
  }
};

/**
 * Search GitHub issues
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} query - Search query (e.g., "is:open label:bug")
 * @param {number} perPage - Results per page (default: 30)
 * @param {number} page - Page number (default: 1)
 * @returns {Promise<Array>} Array of issues
 */
export const searchGitHubIssues = async (owner, repo, query, perPage = 30, page = 1) => {
  const octokit = getOctokit();

  // Build full search query including repo
  const fullQuery = `repo:${owner}/${repo} ${query}`;

  try {
    const { data } = await octokit.rest.search.issuesAndPullRequests({
      q: fullQuery,
      per_page: perPage,
      page,
    });

    return data.items.map(issue => ({
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      labels: issue.labels,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      user: {
        login: issue.user.login,
        avatar_url: issue.user.avatar_url,
      },
      html_url: issue.html_url,
    }));
  } catch (error) {
    logger.error('Error searching GitHub issues', { error });
    throw error;
  }
};

/**
 * Update a GitHub issue
 * Requires login
 */
export const updateGitHubIssue = async (owner, repo, issueNumber, updates) => {
  if (!isAuthenticated()) {
    throw new Error('Authentication required. Please login to update issues.');
  }
  const octokit = getOctokit();

  const { data } = await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    ...updates,
  });

  return {
    number: data.number,
    url: data.html_url,
    title: data.title,
    body: data.body,
    labels: data.labels,
    state: data.state,
    updatedAt: data.updated_at,
  };
};

/**
 * Get a GitHub issue
 */
export const getGitHubIssue = async (owner, repo, issueNumber) => {
  const octokit = getOctokit();

  const { data } = await octokit.rest.issues.get({
    owner,
    repo,
    issue_number: issueNumber,
  });

  return {
    number: data.number,
    title: data.title,
    body: data.body,
    state: data.state,
    labels: data.labels,
    created_at: data.created_at,
    updated_at: data.updated_at,
    user: {
      login: data.user.login,
      avatar_url: data.user.avatar_url,
    },
    html_url: data.html_url,
  };
};

/**
 * Error handler with user-friendly messages
 */
export const handleGitHubError = (error) => {
  if (error.status === 401) {
    return 'Authentication failed. Please login again.';
  } else if (error.status === 403) {
    if (error.response?.headers?.['x-ratelimit-remaining'] === '0') {
      return 'Rate limit exceeded. Please try again later.';
    }
    return 'Permission denied. You may not have access to this resource.';
  } else if (error.status === 404) {
    return 'Resource not found.';
  } else if (error.status === 409 || error.status === 422) {
    // Check for SHA mismatch errors (file was updated by someone else)
    const message = error.message || '';
    if (message.includes('does not match') || message.includes('SHA')) {
      return 'This page was modified by someone else while you were editing. Please refresh the page and try again.';
    }
    return 'Invalid request. Please check your input.';
  } else {
    return error.message || 'An error occurred while communicating with GitHub.';
  }
};
