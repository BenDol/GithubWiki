import { Octokit } from 'octokit';

/**
 * GitHub API client wrapper using Octokit
 * Provides methods for interacting with GitHub repositories
 */

let octokitInstance = null;

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

  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head,
    base,
  });

  return {
    number: data.number,
    url: data.html_url,
    state: data.state,
    title: data.title,
    body: data.body,
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
