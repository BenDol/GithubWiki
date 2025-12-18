import { Octokit } from 'octokit';

/**
 * GitHub API client wrapper using Octokit
 * Provides methods for interacting with GitHub repositories
 */

let octokitInstance = null;
let botOctokitInstance = null;

// Request de-duplication tracking
// Prevents multiple concurrent requests for the same data
const pendingRequests = new Map();

/**
 * Initialize Octokit with authentication token
 */
export const initializeOctokit = (token) => {
  octokitInstance = new Octokit({
    auth: token,
    userAgent: 'GitHub-Wiki-Framework/1.0',
  });

  return octokitInstance;
};

/**
 * Get Octokit instance
 * Creates an unauthenticated instance for public repo access if not logged in
 */
export const getOctokit = () => {
  if (!octokitInstance) {
    // Create unauthenticated instance for public repo read-only access
    octokitInstance = new Octokit({
      userAgent: 'GitHub-Wiki-Framework/1.0',
    });
  }
  return octokitInstance;
};

/**
 * Clear Octokit instance (for logout)
 */
export const clearOctokit = () => {
  octokitInstance = null;
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
    console.info('[Bot] Bot token not configured');
    console.info('[Bot] Comment issues will be created by authenticated users.');
    return null;
  }

  botOctokitInstance = new Octokit({
    auth: botToken,
    userAgent: 'GitHub-Wiki-Bot/1.0',
  });

  console.log('[Bot] ✓ Bot Octokit initialized successfully');
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
    console.warn('[Bot] Bot token not configured, falling back to user token');
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
    console.log(`[Request Dedup] ⏳ Waiting for in-flight request: ${key}`);
    return pendingRequests.get(key);
  }

  console.log(`[Request Dedup] ▶️ Starting new request: ${key}`);

  // Execute request and track it
  const requestPromise = requestFn()
    .then(result => {
      console.log(`[Request Dedup] ✓ Request completed: ${key}`);
      return result;
    })
    .catch(error => {
      console.error(`[Request Dedup] ✗ Request failed: ${key}`, error);
      throw error;
    })
    .finally(() => {
      // Clean up after completion (success or failure)
      pendingRequests.delete(key);
      console.log(`[Request Dedup] 🧹 Cleaned up request: ${key}`);
    });

  pendingRequests.set(key, requestPromise);

  return requestPromise;
};

/**
 * Check if user is authenticated (has token)
 */
export const isAuthenticated = () => {
  // Check if we have an authenticated instance with a token
  return octokitInstance !== null &&
         octokitInstance.auth !== undefined &&
         (typeof octokitInstance.auth === 'string' || typeof octokitInstance.auth === 'function');
};

/**
 * Get authenticated user
 * Requires login
 */
export const getAuthenticatedUser = async () => {
  if (!isAuthenticated()) {
    throw new Error('Authentication required. Please login first.');
  }
  const octokit = getOctokit();
  const { data } = await octokit.rest.users.getAuthenticated();
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
 * Get commit history for a file
 */
export const getFileCommits = async (owner, repo, path, page = 1, perPage = 10) => {
  const octokit = getOctokit();
  try {
    const { data } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      path,
      page,
      per_page: perPage,
    });

    return data.map(commit => ({
      sha: commit.sha,
      message: commit.commit.message,
      author: {
        name: commit.commit.author.name,
        email: commit.commit.author.email,
        date: commit.commit.author.date,
        avatar: commit.author?.avatar_url,
        username: commit.author?.login,
      },
      committer: {
        name: commit.commit.committer.name,
        date: commit.commit.committer.date,
      },
      url: commit.html_url,
      parents: commit.parents,
    }));
  } catch (error) {
    // Handle 404 (file not in repo) or 500 (file path doesn't exist)
    if (error.status === 404 || error.status === 500 || error.status === 409) {
      return []; // Return empty array for files not yet in repo
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

  console.log(`[API] Creating PR: ${head} -> ${base}`);

  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base,
  });

  console.log(`[API] PR created #${data.number} targeting ${base}`);

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
    console.error('Error creating GitHub issue:', error);
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
    console.error('Error searching GitHub issues:', error);
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
  } else if (error.status === 422) {
    return 'Invalid request. Please check your input.';
  } else {
    return error.message || 'An error occurred while communicating with GitHub.';
  }
};
