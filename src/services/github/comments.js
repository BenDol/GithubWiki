import { getOctokit } from './api';
import { createCommentIssueWithBot } from './botService';

/**
 * GitHub Comments API functions
 * Uses GitHub Issues as a comment system for wiki pages
 */

/**
 * Search for an existing issue for a specific wiki page (read-only, no auth required for public repos)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} sectionId - Section ID
 * @param {string} pageId - Page ID
 * @param {string} branch - Branch name for namespace filtering
 * @returns {Promise<Object|null>} Issue object or null if not found
 */
export const findPageIssue = async (owner, repo, sectionId, pageId, branch) => {
  const octokit = getOctokit();

  // Search by unique page ID label (more reliable than title)
  const pageLabel = `page:${sectionId}/${pageId}`;
  const branchLabel = `branch:${branch}`;

  console.log(`[Comments] Searching for page issue: ${pageLabel} in branch: ${branch}`);

  try {
    // Search for issues with both the page label and branch label
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: `${pageLabel},${branchLabel}`,
      state: 'open',
      per_page: 1,
    });

    if (issues.length > 0) {
      console.log(`[Comments] Found existing issue #${issues[0].number} for ${pageLabel}`);
      return issues[0];
    }

    console.log(`[Comments] No issue found for ${pageLabel}`);
    return null;
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
 * @param {string} sectionId - Section ID
 * @param {string} pageId - Page ID
 * @param {string} pageTitle - Page title (for display)
 * @param {string} pageUrl - Page URL
 * @param {string} branch - Branch name for namespace
 * @returns {Promise<Object>} Issue object
 */
export const getOrCreatePageIssue = async (owner, repo, sectionId, pageId, pageTitle, pageUrl, branch) => {
  // First try to find existing issue by page ID
  const existingIssue = await findPageIssue(owner, repo, sectionId, pageId, branch);
  if (existingIssue) {
    return existingIssue;
  }

  // Create new issue for this page using bot (server-side via Netlify Function)
  // This keeps the bot token secure and prevents users from closing comment issues
  const pageLabel = `page:${sectionId}/${pageId}`;
  const branchLabel = `branch:${branch}`;

  console.log(`[Comments] Creating page issue for ${sectionId}/${pageId} with bot (server-side)`);

  try {
    // Call secure Netlify Function to create issue with bot token
    const newIssue = await createCommentIssueWithBot(
      owner,
      repo,
      `[Comments] ${pageTitle}`,
      `💬 **Comments for:** ${pageTitle}\n📄 **Page ID:** \`${sectionId}/${pageId}\`\n🔗 **Page URL:** ${pageUrl}\n🔀 **Branch:** ${branch}\n\n---\n\nThis issue is used to collect comments for the wiki page. Feel free to leave your thoughts, questions, or feedback below!\n\n🤖 *This issue is managed by the wiki bot.*`,
      ['wiki-comments', pageLabel, branchLabel]
    );

    console.log(`[Comments] ✓ Created page issue #${newIssue.number} for ${sectionId}/${pageId} in branch: ${branch} (bot)`);

    return newIssue;
  } catch (error) {
    console.error('[Comments] Failed to create page issue with bot:', error);

    // If bot service fails, throw a helpful error
    if (error.message?.includes('Bot token not configured')) {
      throw new Error('Comment system requires bot token configuration. Please contact the wiki administrator.');
    }

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
