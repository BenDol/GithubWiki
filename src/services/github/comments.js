import { getOctokit, getBotOctokit, hasBotToken } from './api';

/**
 * GitHub Comments API functions
 * Uses GitHub Issues as a comment system for wiki pages
 */

/**
 * Search for an existing issue for a specific wiki page (read-only, no auth required for public repos)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} pageTitle - Page title
 * @param {string} branch - Branch name for namespace filtering
 * @returns {Promise<Object|null>} Issue object or null if not found
 */
export const findPageIssue = async (owner, repo, pageTitle, branch) => {
  const octokit = getOctokit();

  // Search for existing issue with this page title AND branch label
  const branchLabel = `branch:${branch}`;
  const searchQuery = `repo:${owner}/${repo} is:issue label:"${branchLabel}" in:title "${pageTitle}"`;

  console.log(`[Comments] Searching for page issue in branch: ${branch}`);

  try {
    const { data: searchResults } = await octokit.rest.search.issuesAndPullRequests({
      q: searchQuery,
    });

    // Check if we found an exact match
    const existingIssue = searchResults.items.find(
      issue => issue.title === `[Comments] ${pageTitle}`
    );

    return existingIssue || null;
  } catch (error) {
    console.error('Failed to search for page issue:', error);
    return null;
  }
};

/**
 * Get or create an issue for a specific wiki page (requires authentication)
 * Uses bot token if available, falls back to user token
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} pageTitle - Page title
 * @param {string} pageUrl - Page URL
 * @param {string} branch - Branch name for namespace
 * @returns {Promise<Object>} Issue object
 */
export const getOrCreatePageIssue = async (owner, repo, pageTitle, pageUrl, branch) => {
  // First try to find existing issue
  const existingIssue = await findPageIssue(owner, repo, pageTitle, branch);
  if (existingIssue) {
    return existingIssue;
  }

  // Create new issue for this page
  // Requires bot token (prevents users from closing the issue)
  // Will throw error if bot token not configured
  const octokit = getBotOctokit();

  console.log('[Comments] Creating page issue with bot token (users cannot close)');

  const branchLabel = `branch:${branch}`;

  try {
    const { data: newIssue } = await octokit.rest.issues.create({
      owner,
      repo,
      title: `[Comments] ${pageTitle}`,
      body: `💬 **Comments for:** ${pageTitle}\n🔗 **Page URL:** ${pageUrl}\n🔀 **Branch:** ${branch}\n\n---\n\nThis issue is used to collect comments for the wiki page. Feel free to leave your thoughts, questions, or feedback below!\n\n🤖 *This issue is managed by the wiki bot.*`,
      labels: ['wiki-comments', branchLabel],
    });

    console.log(`[Comments] Created page issue #${newIssue.number} for ${pageTitle} in branch: ${branch} (bot)`);

    return newIssue;
  } catch (error) {
    console.error('Failed to create page issue:', error);
    throw error;
  }
};

/**
 * Get comments for a page issue
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number
 * @returns {Promise<Array>} Array of comments
 */
export const getIssueComments = async (owner, repo, issueNumber) => {
  const octokit = getOctokit();

  try {
    const { data: comments } = await octokit.rest.issues.listComments({
      owner,
      repo,
      issue_number: issueNumber,
      per_page: 100,
    });

    return comments.map(comment => ({
      id: comment.id,
      body: comment.body,
      user: {
        login: comment.user.login,
        avatar_url: comment.user.avatar_url,
        html_url: comment.user.html_url,
      },
      created_at: comment.created_at,
      updated_at: comment.updated_at,
      reactions: comment.reactions,
      html_url: comment.html_url,
    }));
  } catch (error) {
    console.error('Failed to get issue comments:', error);
    throw error;
  }
};

/**
 * Create a new comment on a page issue
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number
 * @param {string} body - Comment body
 * @returns {Promise<Object>} Created comment
 */
export const createIssueComment = async (owner, repo, issueNumber, body) => {
  const octokit = getOctokit();

  try {
    const { data: comment } = await octokit.rest.issues.createComment({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });

    return comment;
  } catch (error) {
    console.error('Failed to create comment:', error);
    throw error;
  }
};

/**
 * Add a reaction to a comment
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} commentId - Comment ID
 * @param {string} reaction - Reaction type (+1, -1, laugh, confused, heart, hooray, rocket, eyes)
 * @returns {Promise<Object>} Created reaction
 */
export const addCommentReaction = async (owner, repo, commentId, reaction) => {
  const octokit = getOctokit();

  try {
    const { data: reactionData } = await octokit.rest.reactions.createForIssueComment({
      owner,
      repo,
      comment_id: commentId,
      content: reaction,
    });

    return reactionData;
  } catch (error) {
    console.error('Failed to add reaction:', error);
    throw error;
  }
};

/**
 * Delete a reaction from a comment
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} commentId - Comment ID
 * @param {number} reactionId - Reaction ID to delete
 * @returns {Promise<void>}
 */
export const deleteCommentReaction = async (owner, repo, commentId, reactionId) => {
  const octokit = getOctokit();

  try {
    await octokit.rest.reactions.deleteForIssueComment({
      owner,
      repo,
      comment_id: commentId,
      reaction_id: reactionId,
    });
  } catch (error) {
    console.error('Failed to delete reaction:', error);
    throw error;
  }
};

/**
 * Get reactions for a comment
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} commentId - Comment ID
 * @returns {Promise<Array>} Array of reactions
 */
export const getCommentReactions = async (owner, repo, commentId, bustCache = false) => {
  const octokit = getOctokit();

  try {
    // Note: We can't reliably bust GitHub's cache with headers through Octokit
    // Instead, we rely on the delay (1 second) before fetching to let GitHub's
    // cache update naturally. This is the most reliable approach.
    const { data: reactions } = await octokit.rest.reactions.listForIssueComment({
      owner,
      repo,
      comment_id: commentId,
      per_page: 100,
    });

    return reactions;
  } catch (error) {
    console.error('Failed to get reactions:', error);
    throw error;
  }
};
