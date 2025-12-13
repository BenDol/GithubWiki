import { getOctokit } from './api';
import { getAnonymousEditLabels, ensureAllWikiLabels } from './issueLabels';

/**
 * GitHub Issues-based anonymous edit service
 * Uses GitHub Issues + Actions workflow to process anonymous edits serverlessly
 */

/**
 * Submit anonymous edit via GitHub Issues
 * Creates an issue that triggers GitHub Actions workflow
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} editData - Edit data
 * @param {string} branch - Branch name for namespace
 * @returns {Promise<Object>} Issue and polling information
 */
export const submitAnonymousEditViaIssues = async (owner, repo, editData, branch) => {
  const octokit = getOctokit();

  console.log(`[Anonymous Edit - Serverless] Creating issue for branch: ${branch}`);

  // Ensure labels exist first (will be fast after first run - labels are cached)
  try {
    await ensureAllWikiLabels(owner, repo);
  } catch (error) {
    console.warn('[Anonymous Edit - Serverless] Could not ensure labels:', error.message);
    // Continue anyway - workflow can still work
  }

  // Prepare structured issue body
  const pageTitle = editData.metadata?.title || editData.pageId;
  const sectionTitle = editData.section.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase());

  const issueBody = `## 🕶️ Anonymous Wiki Edit Request

> **This is an automated issue** created by the wiki editor.
> **DO NOT EDIT** - Will be processed automatically by GitHub Actions.

### 📄 Page Information

| Field | Value |
|-------|-------|
| **Page Title** | ${pageTitle} |
| **Section** | ${sectionTitle} (\`${editData.section}\`) |
| **Page ID** | \`${editData.pageId}\` |
| **File Path** | \`${editData.filePath}\` |

### 📝 Edit Summary

${editData.editSummary || '*No summary provided*'}

### 📊 Content Stats

- **Content Length**: ${editData.content.length} bytes
- **Lines**: ${editData.content.split('\n').length}
- **Timestamp**: ${new Date().toISOString()}

---

### 🤖 Edit Data (For Automation)

\`\`\`json
${JSON.stringify(editData, null, 2)}
\`\`\`

---

⚙️ **Status**: 🟡 Waiting for GitHub Actions to process...

This issue will be automatically processed and closed once the edit request is created.`;

  try {
    // Get appropriate labels with branch namespace
    const labels = getAnonymousEditLabels(editData.section, branch);

    // Create issue with comprehensive labels
    const { data: issue } = await octokit.rest.issues.create({
      owner,
      repo,
      title: `🕶️ [${sectionTitle}] ${pageTitle}`,
      body: issueBody,
      labels: labels,
    });

    console.log(`[Anonymous Edit - Serverless] Issue created: #${issue.number}`);
    console.log(`[Anonymous Edit - Serverless] URL: ${issue.html_url}`);
    console.log(`[Anonymous Edit - Serverless] Labels applied: ${labels.join(', ')}`);
    console.log(`[Anonymous Edit - Serverless] Branch namespace: ${branch}`);

    return {
      issueNumber: issue.number,
      issueUrl: issue.html_url,
      createdAt: issue.created_at,
    };
  } catch (error) {
    console.error('[Anonymous Edit - Serverless] Failed to create issue:', error);
    throw new Error('Failed to submit anonymous edit request');
  }
};

/**
 * Poll issue for PR result
 * Checks issue comments for PR link from GitHub Actions
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number to poll
 * @param {number} maxAttempts - Maximum polling attempts (default: 30)
 * @param {number} interval - Polling interval in ms (default: 2000)
 * @returns {Promise<Object>} PR information
 */
export const pollIssueForResult = async (
  owner,
  repo,
  issueNumber,
  maxAttempts = 30,
  interval = 2000
) => {
  const octokit = getOctokit();

  console.log(`[Anonymous Edit - Serverless] Polling issue #${issueNumber}...`);

  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      // Get issue comments
      const { data: comments } = await octokit.rest.issues.listComments({
        owner,
        repo,
        issue_number: issueNumber,
      });

      // Look for success comment from GitHub Actions
      const successComment = comments.find(
        comment =>
          comment.user.login === 'github-actions[bot]' &&
          comment.body.includes('Edit request processed successfully')
      );

      if (successComment) {
        // Extract PR number and URL from comment
        const prNumberMatch = successComment.body.match(/Pull Request:\*\* #(\d+)/);
        const prUrlMatch = successComment.body.match(/\*\*URL:\*\* (https:\/\/[^\s]+)/);

        if (prNumberMatch && prUrlMatch) {
          const prNumber = parseInt(prNumberMatch[1], 10);
          const prUrl = prUrlMatch[1];

          console.log(`[Anonymous Edit - Serverless] ✓ PR created: #${prNumber}`);
          console.log(`[Anonymous Edit - Serverless] URL: ${prUrl}`);

          return {
            success: true,
            prNumber,
            prUrl,
            message: 'Edit request created successfully',
          };
        }
      }

      // Look for error comment
      const errorComment = comments.find(
        comment =>
          comment.user.login === 'github-actions[bot]' &&
          comment.body.includes('Failed to process edit request')
      );

      if (errorComment) {
        console.error('[Anonymous Edit - Serverless] Processing failed');
        throw new Error('GitHub Actions failed to process edit request');
      }

      // Check if issue is still open (Actions might still be processing)
      const { data: issue } = await octokit.rest.issues.get({
        owner,
        repo,
        issue_number: issueNumber,
      });

      if (issue.state === 'closed' && !successComment && !errorComment) {
        // Issue closed but no result comment (unexpected)
        console.error('[Anonymous Edit - Serverless] Issue closed without result');
        throw new Error('Edit request processing incomplete');
      }

      console.log(
        `[Anonymous Edit - Serverless] Attempt ${attempt}/${maxAttempts} - Still processing...`
      );

      // Wait before next attempt
      await new Promise(resolve => setTimeout(resolve, interval));
    } catch (error) {
      if (error.status === 404) {
        throw new Error('Issue not found');
      }
      throw error;
    }
  }

  // Timeout
  console.error('[Anonymous Edit - Serverless] Polling timeout');
  throw new Error(
    'Edit request processing timeout. Please check the issue for updates manually.'
  );
};

/**
 * Submit anonymous edit and wait for result
 * Combines submitAnonymousEditViaIssues and pollIssueForResult
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Object} editData - Edit data
 * @param {Function} onProgress - Progress callback (optional)
 * @returns {Promise<Object>} PR information
 */
export const submitAnonymousEdit = async (owner, repo, editData, onProgress = null) => {
  // Step 1: Create issue
  if (onProgress) onProgress('Creating edit request...');
  const { issueNumber, issueUrl } = await submitAnonymousEditViaIssues(owner, repo, editData);

  // Step 2: Wait a bit for Actions to start
  if (onProgress) onProgress('Waiting for GitHub Actions to process...');
  await new Promise(resolve => setTimeout(resolve, 3000));

  // Step 3: Poll for result
  if (onProgress) onProgress('Processing edit request...');
  const result = await pollIssueForResult(owner, repo, issueNumber);

  return {
    ...result,
    issueNumber,
    issueUrl,
  };
};

/**
 * Check if anonymous-edit-request label exists
 * Creates it if missing
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 */
export const ensureAnonymousEditLabel = async (owner, repo) => {
  const octokit = getOctokit();

  try {
    // Try to get the label
    await octokit.rest.issues.getLabel({
      owner,
      repo,
      name: 'anonymous-edit-request',
    });

    console.log('[Anonymous Edit - Serverless] Label exists');
  } catch (error) {
    if (error.status === 404) {
      // Label doesn't exist, create it
      console.log('[Anonymous Edit - Serverless] Creating label...');

      try {
        await octokit.rest.issues.createLabel({
          owner,
          repo,
          name: 'anonymous-edit-request',
          description: 'Automated anonymous edit request - processed by GitHub Actions',
          color: 'fbca04', // Yellow
        });

        console.log('[Anonymous Edit - Serverless] Label created');
      } catch (createError) {
        console.warn('[Anonymous Edit - Serverless] Could not create label:', createError.message);
      }
    } else {
      console.warn('[Anonymous Edit - Serverless] Could not check label:', error.message);
    }
  }
};
