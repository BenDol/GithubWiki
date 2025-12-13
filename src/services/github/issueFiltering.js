import { getOctokit } from './api';

/**
 * GitHub Issue Filtering Service
 * Provides server-side filtering of issues by branch namespace
 */

/**
 * Search issues by branch label using GitHub Search API
 * This provides server-side filtering for efficient branch isolation
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name for filtering
 * @param {Object} options - Search options
 * @param {string} options.state - Issue state ('open', 'closed', 'all')
 * @param {string[]} options.labels - Additional labels to filter by
 * @param {number} options.page - Page number for pagination
 * @param {number} options.perPage - Number of results per page
 * @param {string} options.sort - Sort field ('created', 'updated', 'comments')
 * @param {string} options.order - Sort order ('asc', 'desc')
 * @returns {Promise<{items: Array, total: number}>}
 */
export const searchIssuesByBranch = async (owner, repo, branch, options = {}) => {
  const octokit = getOctokit();

  const {
    state = 'open',
    labels = [],
    page = 1,
    perPage = 100,
    sort = 'created',
    order = 'desc',
  } = options;

  // Build search query
  const branchLabel = `branch:${branch}`;
  const allLabels = [branchLabel, ...labels];
  const labelQuery = allLabels.map(l => `label:"${l}"`).join(' ');

  const query = `repo:${owner}/${repo} is:issue ${labelQuery} state:${state}`;

  console.log(`[Issue Filter] Searching: ${query}`);

  try {
    const { data } = await octokit.rest.search.issuesAndPullRequests({
      q: query,
      page,
      per_page: perPage,
      sort,
      order,
    });

    console.log(`[Issue Filter] Found ${data.items.length}/${data.total_count} issues with branch:${branch}`);

    return {
      items: data.items,
      total: data.total_count,
    };
  } catch (error) {
    console.error('[Issue Filter] Search failed:', error);
    throw error;
  }
};

/**
 * List comment issues for current branch
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name
 * @param {number} page - Page number
 * @returns {Promise<{items: Array, total: number}>}
 */
export const listBranchComments = async (owner, repo, branch, page = 1) => {
  return searchIssuesByBranch(owner, repo, branch, {
    labels: ['wiki:comment'],
    state: 'open',
    page,
    perPage: 50,
  });
};

/**
 * List anonymous edit requests for current branch
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} branch - Branch name
 * @param {number} page - Page number
 * @returns {Promise<{items: Array, total: number}>}
 */
export const listBranchAnonymousEdits = async (owner, repo, branch, page = 1) => {
  return searchIssuesByBranch(owner, repo, branch, {
    labels: ['wiki:anonymous-edit'],
    state: 'all',
    page,
    perPage: 50,
  });
};
