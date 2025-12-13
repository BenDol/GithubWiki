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
