import { getOctokit, getAuthenticatedUser } from './api';

/**
 * GitHub Pull Request operations
 */

/**
 * Create a pull request
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
 * Generate PR title for page edit
 */
export const generatePRTitle = (pageTitle, sectionTitle) => {
  return `Update ${pageTitle}${sectionTitle ? ` in ${sectionTitle}` : ''}`;
};

/**
 * Get all pull requests for a user in a repository
 */
export const getUserPullRequests = async (owner, repo, username) => {
  const octokit = getOctokit();

  // Get all pull requests created by the user
  const { data } = await octokit.rest.pulls.list({
    owner,
    repo,
    state: 'all',
    sort: 'created',
    direction: 'desc',
    per_page: 100,
  });

  // Filter to only PRs created by the current user
  const userPRs = data.filter(pr => pr.user.login === username);

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
