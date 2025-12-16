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

    const { data } = await octokit.rest.repos.getContent(params);

    if (data.type !== 'file') {
      throw new Error('Path is not a file');
    }

    return {
      content: atob(data.content.replace(/\n/g, '')),
      sha: data.sha,
      path: data.path,
      size: data.size,
      url: data.html_url,
    };
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

  // Encode content to base64
  const encodedContent = btoa(unescape(encodeURIComponent(content)));

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
