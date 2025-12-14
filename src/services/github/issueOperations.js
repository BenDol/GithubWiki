import { getOctokit } from './api';

/**
 * GitHub Issue Operations
 * Direct issue access functions (bypasses search API)
 */

/**
 * Get an issue by number (direct access, no search delay)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number
 * @returns {Promise<Object>} Issue object
 */
export const getIssue = async (owner, repo, issueNumber) => {
  const octokit = getOctokit();

  try {
    const { data: issue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    console.log(`[Issue] Loaded issue #${issueNumber}: ${issue.title}`);

    return {
      number: issue.number,
      title: issue.title,
      body: issue.body,
      state: issue.state,
      html_url: issue.html_url,
      created_at: issue.created_at,
      updated_at: issue.updated_at,
      labels: issue.labels,
      user: issue.user,
    };
  } catch (error) {
    if (error.status === 404) {
      console.warn(`[Issue] Issue #${issueNumber} not found (404)`);
      return null;
    }
    console.error(`[Issue] Failed to get issue #${issueNumber}:`, error);
    throw error;
  }
};

/**
 * Check if an issue exists by number
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number
 * @returns {Promise<boolean>} True if issue exists
 */
export const issueExists = async (owner, repo, issueNumber) => {
  try {
    const issue = await getIssue(owner, repo, issueNumber);
    return issue !== null;
  } catch (error) {
    return false;
  }
};
