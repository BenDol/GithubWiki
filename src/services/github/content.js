import { getOctokit } from './api';

/**
 * GitHub content/file operations
 */

/**
 * Get file content with SHA
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} path - File path
 * @param {string} branch - Branch name or commit SHA
 * @param {boolean} bustCache - If true, adds cache-busting to get latest content (for recent PRs)
 */
export const getFileContent = async (owner, repo, path, branch = 'main', bustCache = false) => {
  // DISABLED: githubDataStore access temporarily disabled due to circular dependency
  let store = null;
  // try {
  //   const githubDataStoreModule = await import('../../store/githubDataStore');
  //   if (githubDataStoreModule?.useGitHubDataStore && typeof githubDataStoreModule.useGitHubDataStore.getState === 'function') {
  //     store = githubDataStoreModule.useGitHubDataStore.getState();
  //   } else {
  //     console.warn('[Content] githubDataStore module loaded but useGitHubDataStore.getState is not available');
  //   }
  // } catch (err) {
  //   console.warn('[Content] Could not access githubDataStore (will continue without cache):', err.message);
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

  const cacheKey = `${owner}/${repo}/${path}:${branch}`;

  // Check cache first (skip if bustCache is true or in serverless context or store unavailable)
  if (!bustCache && typeof window !== 'undefined' && store) {
    const cached = store.getCachedFileContent(cacheKey, isAuthenticated);
    if (cached) {
      console.log(`[Content] ✓ Cache hit - using cached content for ${path}`);
      return cached;
    }
  }

  console.log(`[Content] Cache miss - fetching from GitHub API: ${path}`);
  const octokit = getOctokit();

  try {
    const params = {
      owner,
      repo,
      path,
      ref: branch,
    };

    // Note: Cache busting with custom headers causes CORS errors with GitHub API
    // GitHub's CDN may cache content for 2-3 minutes, but custom Cache-Control
    // headers are not allowed in browser CORS requests to GitHub API
    if (bustCache) {
      console.log('[Content] Cache-busting requested (GitHub CDN may still cache for 2-3 minutes)');
    }

    // Increment API call counter (only in browser context and if store is available)
    if (typeof window !== 'undefined' && store) {
      store.incrementAPICall();
    }

    const { data } = await octokit.rest.repos.getContent(params);

    if (data.type !== 'file') {
      throw new Error('Path is not a file');
    }

    // Decode base64 content with proper UTF-8 handling for emojis and special characters
    const base64Content = data.content.replace(/\n/g, '');
    const binaryString = atob(base64Content);

    // Convert binary string to UTF-8 using TextDecoder (modern approach)
    // This properly handles multi-byte UTF-8 characters like emojis
    const bytes = new Uint8Array(binaryString.length);
    for (let i = 0; i < binaryString.length; i++) {
      bytes[i] = binaryString.charCodeAt(i);
    }
    const utf8Content = new TextDecoder('utf-8').decode(bytes);

    const result = {
      content: utf8Content,
      sha: data.sha,
      path: data.path,
      size: data.size,
      url: data.html_url,
    };

    // Cache the result (only in browser context and if store is available)
    if (typeof window !== 'undefined' && store) {
      store.cacheFileContent(cacheKey, result);
    }

    return result;
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
};

/**
 * Update or create file content
 */
export const updateFileContent = async (
  owner,
  repo,
  path,
  content,
  message,
  branch,
  sha = null
) => {
  const octokit = getOctokit();

  // Encode content to base64 with proper UTF-8 handling
  // Use TextEncoder for proper multi-byte UTF-8 character handling (emojis, etc.)
  const utf8Bytes = new TextEncoder().encode(content);
  let binaryString = '';
  for (let i = 0; i < utf8Bytes.length; i++) {
    binaryString += String.fromCharCode(utf8Bytes[i]);
  }
  const encodedContent = btoa(binaryString);

  const params = {
    owner,
    repo,
    path,
    message,
    content: encodedContent,
    branch,
  };

  // Include SHA if updating existing file
  if (sha) {
    params.sha = sha;
  }

  const { data } = await octokit.rest.repos.createOrUpdateFileContents(params);

  return {
    commit: {
      sha: data.commit.sha,
      message: data.commit.message,
      url: data.commit.html_url,
    },
    content: {
      sha: data.content.sha,
      path: data.content.path,
      url: data.content.html_url,
    },
  };
};

/**
 * Delete file content
 */
export const deleteFileContent = async (
  owner,
  repo,
  path,
  message,
  branch,
  sha
) => {
  const octokit = getOctokit();

  const { data } = await octokit.rest.repos.deleteFile({
    owner,
    repo,
    path,
    message,
    branch,
    sha,
  });

  return {
    commit: {
      sha: data.commit.sha,
      message: data.commit.message,
      url: data.commit.html_url,
    },
  };
};

/**
 * Check if file has been modified since a given SHA
 */
export const hasFileChanged = async (owner, repo, path, originalSha, branch = 'main') => {
  const currentFile = await getFileContent(owner, repo, path, branch);

  if (!currentFile) {
    // File was deleted
    return true;
  }

  return currentFile.sha !== originalSha;
};

/**
 * Get file metadata without content
 */
export const getFileMetadata = async (owner, repo, path, branch = 'main') => {
  const octokit = getOctokit();

  try {
    const { data } = await octokit.rest.repos.getContent({
      owner,
      repo,
      path,
      ref: branch,
    });

    return {
      sha: data.sha,
      path: data.path,
      size: data.size,
      url: data.html_url,
      lastModified: data._links.self, // Contains last modified info
    };
  } catch (error) {
    if (error.status === 404) {
      return null;
    }
    throw error;
  }
};
