import { getOctokit } from './api';

/**
 * GitHub branch operations
 */

/**
 * Generate a unique branch name for wiki edits
 */
export const generateEditBranchName = (sectionId, pageId) => {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `wiki-edit/${sectionId}/${pageId}-${timestamp}-${random}`;
};

/**
 * Create a new branch from base branch
 */
export const createBranch = async (owner, repo, branchName, baseBranch = 'main') => {
  const octokit = getOctokit();

  try {
    // Get the SHA of the base branch
    const { data: refData } = await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${baseBranch}`,
    });

    const baseSha = refData.object.sha;

    // Create the new branch
    const { data } = await octokit.rest.git.createRef({
      owner,
      repo,
      ref: `refs/heads/${branchName}`,
      sha: baseSha,
    });

    return {
      name: branchName,
      sha: data.object.sha,
      url: data.url,
    };
  } catch (error) {
    if (error.status === 422) {
      throw new Error('Branch already exists or invalid branch name');
    }
    throw error;
  }
};

/**
 * Check if a branch exists
 */
export const branchExists = async (owner, repo, branchName) => {
  const octokit = getOctokit();

  try {
    await octokit.rest.git.getRef({
      owner,
      repo,
      ref: `heads/${branchName}`,
    });
    return true;
  } catch (error) {
    if (error.status === 404) {
      return false;
    }
    throw error;
  }
};

/**
 * Delete a branch
 */
export const deleteBranch = async (owner, repo, branchName) => {
  const octokit = getOctokit();

  await octokit.rest.git.deleteRef({
    owner,
    repo,
    ref: `heads/${branchName}`,
  });
};

/**
 * Get branch information
 */
export const getBranch = async (owner, repo, branchName) => {
  const octokit = getOctokit();

  const { data } = await octokit.rest.repos.getBranch({
    owner,
    repo,
    branch: branchName,
  });

  return {
    name: data.name,
    sha: data.commit.sha,
    protected: data.protected,
  };
};
