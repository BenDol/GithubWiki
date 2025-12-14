import { getOctokit, getAuthenticatedUser } from './api';
import { updateFileContent } from './content';

/**
 * GitHub Pull Request operations
 */

/**
 * Create a pull request (same repository)
 */
export const createPullRequest = async (
  owner,
  repo,
  title,
  body,
  headBranch,
  baseBranch = 'main'
) => {
  const octokit = getOctokit();

  const { data } = await octokit.rest.pulls.create({
    owner,
    repo,
    title,
    body,
    head: headBranch,
    base: baseBranch,
  });

  return {
    number: data.number,
    url: data.html_url,
    state: data.state,
    title: data.title,
    body: data.body,
    createdAt: data.created_at,
    user: {
      login: data.user.login,
      avatar: data.user.avatar_url,
      url: data.user.html_url,
    },
  };
};

/**
 * Create a cross-repository pull request (fork to upstream)
 * @param {string} upstreamOwner - Upstream repository owner
 * @param {string} upstreamRepo - Upstream repository name
 * @param {string} forkOwner - Fork owner (username)
 * @param {string} headBranch - Branch name on fork
 * @param {string} title - PR title
 * @param {string} body - PR body
 * @param {string} baseBranch - Base branch on upstream (default: 'main')
 * @returns {Promise<Object>} PR object
 */
export const createCrossRepoPR = async (
  upstreamOwner,
  upstreamRepo,
  forkOwner,
  headBranch,
  title,
  body,
  baseBranch = 'main'
) => {
  const octokit = getOctokit();

  console.log(`[PR] Creating cross-repo PR from ${forkOwner}:${headBranch} to ${upstreamOwner}/${upstreamRepo}:${baseBranch}`);

  try {
    const { data } = await octokit.rest.pulls.create({
      owner: upstreamOwner,
      repo: upstreamRepo,
      title,
      body,
      head: `${forkOwner}:${headBranch}`, // Format: "username:branch-name"
      base: baseBranch,
    });

    console.log(`[PR] Cross-repo PR created successfully: #${data.number}`);

    return {
      number: data.number,
      url: data.html_url,
      state: data.state,
      title: data.title,
      body: data.body,
      createdAt: data.created_at,
      user: {
        login: data.user.login,
        avatar: data.user.avatar_url,
        url: data.user.html_url,
      },
    };
  } catch (error) {
    console.error('[PR] Failed to create cross-repo PR:', error);
    throw error;
  }
};

/**
 * Generate PR title for page edit
 */
export const generatePRTitle = (pageTitle, sectionTitle) => {
  return `Update ${pageTitle}${sectionTitle ? ` in ${sectionTitle}` : ''}`;
};

/**
 * Get content from a PR's branch
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name (can be fork branch like "user:branch-name")
 * @param {string} filePath - File path to fetch
 * @returns {Promise<Object>} File content and metadata
 */
export const getPRBranchContent = async (owner, repo, branch, filePath) => {
  const octokit = getOctokit();

  try {
    console.log(`[PR Branch] Fetching content from branch: ${branch}, file: ${filePath}`);

    // Handle fork branches (format: "username:branch-name")
    let targetOwner = owner;
    let targetBranch = branch;

    if (branch.includes(':')) {
      const [forkOwner, forkBranch] = branch.split(':');
      targetOwner = forkOwner;
      targetBranch = forkBranch;
      console.log(`[PR Branch] Using fork: ${targetOwner}/${repo}:${targetBranch}`);
    }

    const { data } = await octokit.rest.repos.getContent({
      owner: targetOwner,
      repo,
      path: filePath,
      ref: targetBranch,
    });

    if (data.type !== 'file') {
      throw new Error('Path is not a file');
    }

    // Decode base64 content
    const content = Buffer.from(data.content, 'base64').toString('utf-8');

    console.log(`[PR Branch] Successfully fetched content (${content.length} bytes)`);

    return {
      content,
      sha: data.sha,
      branch: branch,
    };
  } catch (error) {
    console.error('[PR Branch] Failed to fetch content:', error);
    throw error;
  }
};

/**
 * Get all pull requests for a user in a repository
 */
export const getUserPullRequests = async (owner, repo, username, baseBranch = null) => {
  const octokit = getOctokit();

  const listParams = {
    owner,
    repo,
    state: 'all',
    sort: 'created',
    direction: 'desc',
    per_page: 100,
  };

  // Add base branch filter if provided
  if (baseBranch) {
    listParams.base = baseBranch;
    console.log(`[PR Filter] Filtering PRs by base branch: ${baseBranch}`);
  }

  // Get all pull requests (filtered by base if provided)
  const { data } = await octokit.rest.pulls.list(listParams);

  // Filter to only PRs created by the current user
  const userPRs = data.filter(pr => pr.user.login === username);

  console.log(`[PR Filter] Found ${userPRs.length} PRs by ${username}${baseBranch ? ` targeting ${baseBranch}` : ''}`);

  // Fetch detailed information for each PR to get diff stats
  const detailedPRs = await Promise.all(
    userPRs.map(async (pr) => {
      try {
        const { data: detailedPR } = await octokit.rest.pulls.get({
          owner,
          repo,
          pull_number: pr.number,
        });

        return {
          number: detailedPR.number,
          title: detailedPR.title,
          body: detailedPR.body,
          state: detailedPR.state,
          html_url: detailedPR.html_url,
          created_at: detailedPR.created_at,
          updated_at: detailedPR.updated_at,
          merged_at: detailedPR.merged_at,
          additions: detailedPR.additions,
          deletions: detailedPR.deletions,
          changed_files: detailedPR.changed_files,
          user: {
            login: detailedPR.user.login,
            avatar_url: detailedPR.user.avatar_url,
          },
          labels: detailedPR.labels,
        };
      } catch (error) {
        console.error(`Failed to fetch details for PR #${pr.number}:`, error);
        // Return basic info if detailed fetch fails
        return {
          number: pr.number,
          title: pr.title,
          body: pr.body,
          state: pr.state,
          html_url: pr.html_url,
          created_at: pr.created_at,
          updated_at: pr.updated_at,
          merged_at: pr.merged_at,
          additions: 0,
          deletions: 0,
          changed_files: 0,
          user: {
            login: pr.user.login,
            avatar_url: pr.user.avatar_url,
          },
          labels: pr.labels,
        };
      }
    })
  );

  return detailedPRs;
};

/**
 * Close a pull request
 */
export const closePullRequest = async (owner, repo, pullNumber) => {
  const octokit = getOctokit();

  const { data } = await octokit.rest.pulls.update({
    owner,
    repo,
    pull_number: pullNumber,
    state: 'closed',
  });

  return {
    number: data.number,
    state: data.state,
    closed_at: data.closed_at,
  };
};

/**
 * Generate PR body with edit details
 */
export const generatePRBody = async (pageTitle, sectionId, pageId, summary = null) => {
  try {
    const user = await getAuthenticatedUser();

    let body = `## Page Edit\n\n`;
    body += `**Page:** ${pageTitle}\n`;
    body += `**Section:** ${sectionId}\n`;
    body += `**Page ID:** ${pageId}\n`;
    body += `**Author:** @${user.login}\n\n`;

    if (summary) {
      body += `### Changes\n\n${summary}\n\n`;
    }

    body += `---\n\n`;
    body += `🤖 Generated with [GitHub Wiki Framework](https://github.com)\n\n`;
    body += `This pull request was created through the wiki's web editor.\n`;

    return body;
  } catch (error) {
    console.error('Failed to generate PR body:', error);
    return `Page edit for ${pageTitle}`;
  }
};

/**
 * Get pull request by number
 */
export const getPullRequest = async (owner, repo, number) => {
  const octokit = getOctokit();

  const { data } = await octokit.rest.pulls.get({
    owner,
    repo,
    pull_number: number,
  });

  return {
    number: data.number,
    url: data.html_url,
    state: data.state,
    title: data.title,
    body: data.body,
    createdAt: data.created_at,
    updatedAt: data.updated_at,
    mergedAt: data.merged_at,
    user: {
      login: data.user.login,
      avatar: data.user.avatar_url,
    },
    head: {
      ref: data.head.ref,
      sha: data.head.sha,
    },
    base: {
      ref: data.base.ref,
      sha: data.base.sha,
    },
  };
};

/**
 * List pull requests for a repository
 */
export const listPullRequests = async (owner, repo, state = 'open', page = 1, perPage = 10) => {
  const octokit = getOctokit();

  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state,
    page,
    per_page: perPage,
    sort: 'created',
    direction: 'desc',
  });

  return data.map((pr) => ({
    number: pr.number,
    url: pr.html_url,
    state: pr.state,
    title: pr.title,
    createdAt: pr.created_at,
    user: {
      login: pr.user.login,
      avatar: pr.user.avatar_url,
    },
  }));
};

/**
 * Add labels to a pull request
 */
export const addPRLabels = async (owner, repo, number, labels) => {
  const octokit = getOctokit();

  try {
    await octokit.rest.issues.addLabels({
      owner,
      repo,
      issue_number: number,
      labels,
    });
  } catch (error) {
    // Labels might not exist, that's okay
    console.warn('Failed to add labels:', error.message);
  }
};

/**
 * Create pull request with standard wiki edit labels
 */
export const createWikiEditPR = async (
  owner,
  repo,
  pageTitle,
  sectionTitle,
  sectionId,
  pageId,
  headBranch,
  summary = null,
  baseBranch = 'main'
) => {
  // Generate PR details
  const title = generatePRTitle(pageTitle, sectionTitle);
  const body = await generatePRBody(pageTitle, sectionId, pageId, summary);

  // Create PR
  const pr = await createPullRequest(owner, repo, title, body, headBranch, baseBranch);

  // Try to add labels
  try {
    await addPRLabels(owner, repo, pr.number, ['wiki-edit', 'documentation']);
  } catch (error) {
    // Labels might not exist, continue anyway
    console.warn('Could not add labels to PR:', error);
  }

  return pr;
};

/**
 * Find existing open PR for a page ID
 * Searches for PRs with branch name matching pattern: wiki-edit/<section>/<page-id>-*
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} sectionId - Section ID
 * @param {string} pageIdFromMetadata - Page ID from metadata
 * @param {string} username - Current user's username
 * @returns {Promise<Object|null>} PR object if found, null otherwise
 */
export const findExistingPRForPage = async (owner, repo, sectionId, pageIdFromMetadata, username, currentPageId = null) => {
  const octokit = getOctokit();

  try {
    // Get all open PRs
    const { data: prs } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'open',
      per_page: 100,
    });

    console.log(`[PR Search] Looking for existing PR by user: ${username}`);
    console.log(`[PR Search] Section: ${sectionId}, Page ID: ${pageIdFromMetadata}, Filename: ${currentPageId}`);
    console.log(`[PR Search] Found ${prs.length} total open PRs`);

    // Filter to PRs created by current user
    const userPRs = prs.filter(pr => pr.user.login === username);
    console.log(`[PR Search] Found ${userPRs.length} PRs by user ${username}`);

    if (userPRs.length > 0) {
      console.log('[PR Search] User PRs:', userPRs.map(pr => ({ number: pr.number, branch: pr.head.ref })));
    }

    // Try multiple patterns to find matching PR
    // Need to check both direct branches and fork branches (username:branch-name)
    const patterns = [
      // Direct branch patterns (for users with write access)
      `wiki-edit/${sectionId}/${pageIdFromMetadata}-`,
      currentPageId && currentPageId !== pageIdFromMetadata ? `wiki-edit/${sectionId}/${currentPageId}-` : null,

      // Fork branch patterns (for users without write access)
      `${username}:wiki-edit/${sectionId}/${pageIdFromMetadata}-`,
      currentPageId && currentPageId !== pageIdFromMetadata ? `${username}:wiki-edit/${sectionId}/${currentPageId}-` : null,
    ].filter(Boolean);

    console.log('[PR Search] Trying patterns:', patterns);

    let matchingPR = null;
    let matchedPattern = null;

    for (const pattern of patterns) {
      matchingPR = userPRs.find(pr => pr.head.ref.startsWith(pattern));
      if (matchingPR) {
        matchedPattern = pattern;
        console.log(`[PR Search] Found match with pattern "${pattern}": PR #${matchingPR.number} (branch: ${matchingPR.head.ref})`);
        break;
      } else {
        console.log(`[PR Search] No match found for pattern: ${pattern}`);
      }
    }

    if (!matchingPR) {
      console.log('[PR Search] No existing PR found for this page');
      return null;
    }

    // Get full PR details
    const { data: fullPR } = await octokit.rest.pulls.get({
      owner,
      repo,
      pull_number: matchingPR.number,
    });

    console.log(`[PR Search] Returning PR #${fullPR.number}: ${fullPR.title}`);

    // Use fullPR.head.label for fork branches (format: "username:branch-name")
    // Use fullPR.head.ref for direct branches (format: "branch-name")
    const branchRef = fullPR.head.label || fullPR.head.ref;

    console.log(`[PR Search] PR head.ref: ${fullPR.head.ref}`);
    console.log(`[PR Search] PR head.label: ${fullPR.head.label}`);
    console.log(`[PR Search] Using branch ref: ${branchRef}`);

    return {
      number: fullPR.number,
      url: fullPR.html_url,
      state: fullPR.state,
      title: fullPR.title,
      body: fullPR.body,
      head: {
        ref: branchRef,
        sha: fullPR.head.sha,
      },
      base: {
        ref: fullPR.base.ref,
        sha: fullPR.base.sha,
      },
    };
  } catch (error) {
    console.error('[PR Search] Failed to find existing PR:', error);
    return null;
  }
};

/**
 * Commit changes to an existing PR's branch
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} branchName - Branch name to commit to
 * @param {string} filePath - Path to file
 * @param {string} content - New file content
 * @param {string} commitMessage - Commit message
 * @param {string} fileSha - Current file SHA (null for new files)
 * @returns {Promise<Object>} Commit result
 */
export const commitToExistingBranch = async (
  owner,
  repo,
  branchName,
  filePath,
  content,
  commitMessage,
  fileSha = null
) => {
  try {
    console.log(`[PR] Committing to existing branch: ${branchName}`);
    console.log(`[PR] File path: ${filePath}`);
    console.log(`[PR] Provided file SHA: ${fileSha || 'none (new file)'}`);

    // Get the current file SHA from the PR branch (not main branch)
    // This is important because the file in the PR branch might be different from main
    const { getFileContent } = await import('./content.js');

    let branchFileSha = fileSha;

    try {
      console.log(`[PR] Fetching current file SHA from branch: ${branchName}`);
      const fileData = await getFileContent(owner, repo, filePath, branchName);
      if (fileData?.sha) {
        branchFileSha = fileData.sha;
        console.log(`[PR] Using file SHA from branch: ${branchFileSha}`);
      }
    } catch (error) {
      // File might not exist in the branch yet (new file)
      console.log('[PR] File does not exist in branch (new file or error):', error.message);
      branchFileSha = null;
    }

    // Use the existing updateFileContent function to commit to the branch
    const result = await updateFileContent(
      owner,
      repo,
      filePath,
      content,
      commitMessage,
      branchName,
      branchFileSha
    );

    console.log('[PR] Successfully committed to existing branch');
    return result;
  } catch (error) {
    console.error('[PR] Failed to commit to existing branch:', error);
    throw error;
  }
};
