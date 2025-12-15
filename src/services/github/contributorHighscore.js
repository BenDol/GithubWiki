import { getOctokit } from './api';

/**
 * Contributor Highscore Service
 * Manages fetching and caching contributor statistics using GitHub Issues as a data store
 */

const HIGHSCORE_ISSUE_TITLE = 'Contributor Highscore Cache [DO NOT DELETE]';
const HIGHSCORE_CACHE_KEY = 'contributor_highscore_cache';

/**
 * Get or create the highscore cache issue
 * Returns null if user doesn't have permission to access issues
 */
async function getHighscoreCacheIssue(owner, repo) {
  const octokit = getOctokit();

  try {
    // Search for existing cache issue
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      state: 'open',
      labels: 'highscore-cache',
      per_page: 1,
    });

    if (issues.length > 0) {
      return issues[0];
    }

    // Create cache issue if it doesn't exist (requires write permissions)
    console.log('[Highscore] Creating highscore cache issue...');
    const { data: newIssue } = await octokit.rest.issues.create({
      owner,
      repo,
      title: HIGHSCORE_ISSUE_TITLE,
      body: JSON.stringify({
        lastUpdated: null,
        contributors: [],
      }, null, 2),
      labels: ['highscore-cache', 'automation'],
    });

    return newIssue;
  } catch (error) {
    if (error.status === 403 || error.status === 401) {
      console.warn('[Highscore] Cannot access/create cache issue (no permissions)');
      return null;
    }
    console.error('[Highscore] Failed to get/create cache issue:', error);
    throw error;
  }
}

/**
 * Parse cache data from issue body
 */
function parseCacheData(issueBody) {
  try {
    return JSON.parse(issueBody);
  } catch (error) {
    console.error('[Highscore] Failed to parse cache data:', error);
    return null;
  }
}

/**
 * Fetch repository collaborators (users with contributor role)
 */
async function fetchRepositoryCollaborators(owner, repo) {
  const octokit = getOctokit();

  try {
    console.log('[Highscore] Fetching repository collaborators...');
    const { data: collaborators } = await octokit.rest.repos.listCollaborators({
      owner,
      repo,
      per_page: 100,
    });

    const collaboratorLogins = collaborators.map(c => c.login);
    console.log('[Highscore] Found collaborators:', collaboratorLogins);
    return new Set(collaboratorLogins);
  } catch (error) {
    console.error('[Highscore] Failed to fetch collaborators:', error);
    // Return empty set if we can't fetch collaborators (permission issue)
    return new Set();
  }
}

/**
 * Apply filters to contributor list based on config
 */
async function applyContributorFilters(contributors, owner, repo, config = {}) {
  let filteredContributors = [...contributors];

  // Apply filters based on config
  const ignoreOwner = config?.features?.contributorHighscore?.ignoreRepositoryOwner ?? false;
  const ignoreMainContributors = config?.features?.contributorHighscore?.ignoreMainContributors ?? false;

  // Track which users to exclude
  const excludedUsers = new Set();

  if (ignoreOwner) {
    console.log('[Highscore] Filtering out repository owner:', owner);
    excludedUsers.add(owner);
  }

  if (ignoreMainContributors) {
    console.log('[Highscore] Filtering out main contributors (repository collaborators)');
    // Fetch all collaborators (users with contributor role on the repo)
    const collaborators = await fetchRepositoryCollaborators(owner, repo);

    if (collaborators.size > 0) {
      collaborators.forEach(login => excludedUsers.add(login));
      console.log('[Highscore] Will filter out collaborators:', Array.from(collaborators));
    } else {
      console.log('[Highscore] No collaborators to filter (or permission denied)');
    }
  }

  // Apply all filters at once
  if (excludedUsers.size > 0) {
    const beforeCount = filteredContributors.length;
    filteredContributors = filteredContributors.filter(c => !excludedUsers.has(c.login));
    console.log(`[Highscore] Filtered out ${beforeCount - filteredContributors.length} users:`, Array.from(excludedUsers));
  }

  // Sort by contributions (descending)
  filteredContributors.sort((a, b) => b.contributions - a.contributions);

  return filteredContributors;
}

/**
 * Fetch commits within a date range and aggregate by author
 */
async function fetchCommitsInDateRange(owner, repo, since, until) {
  const octokit = getOctokit();

  try {
    console.log(`[Highscore] Fetching commits from ${since} to ${until}...`);

    const commits = [];
    let page = 1;
    const perPage = 100;

    // Fetch all commits in date range (with pagination)
    while (true) {
      const { data } = await octokit.rest.repos.listCommits({
        owner,
        repo,
        since,
        until,
        per_page: perPage,
        page,
      });

      if (data.length === 0) break;
      commits.push(...data);

      // If we got fewer than perPage, we've reached the end
      if (data.length < perPage) break;
      page++;
    }

    console.log(`[Highscore] Found ${commits.length} commits in date range`);

    // Aggregate commits by author
    const contributorMap = new Map();

    for (const commit of commits) {
      const author = commit.author || commit.commit.author;
      const login = author?.login;

      // Skip commits without a GitHub user (e.g., local git commits)
      if (!login) continue;

      if (contributorMap.has(login)) {
        contributorMap.get(login).contributions++;
      } else {
        contributorMap.set(login, {
          login,
          avatarUrl: author.avatar_url,
          contributions: 1,
          profileUrl: author.html_url,
          prestige: 0,
          type: author.type || 'User',
        });
      }
    }

    // Convert map to array and sort by contributions
    const contributors = Array.from(contributorMap.values());
    contributors.sort((a, b) => b.contributions - a.contributions);

    console.log(`[Highscore] Found ${contributors.length} unique contributors in date range`);
    return contributors;
  } catch (error) {
    console.error('[Highscore] Failed to fetch commits in date range:', error);
    throw error;
  }
}

/**
 * Fetch fresh contributor statistics from GitHub API (all-time)
 */
async function fetchFreshContributorStats(owner, repo, config = {}) {
  const octokit = getOctokit();

  try {
    console.log('[Highscore] Fetching fresh contributor stats...');

    // Get all contributors with their contribution counts
    const { data: contributors } = await octokit.rest.repos.listContributors({
      owner,
      repo,
      per_page: 100,
    });

    // Format contributor data
    const formattedContributors = contributors.map(contributor => ({
      login: contributor.login,
      avatarUrl: contributor.avatar_url,
      contributions: contributor.contributions,
      profileUrl: contributor.html_url,
      prestige: 0, // Will be calculated separately if needed
      type: contributor.type, // 'User' or 'Bot'
    }));

    // Don't apply filters here - they'll be applied when data is returned
    // This keeps cached data unfiltered so filters can be changed dynamically
    return formattedContributors;
  } catch (error) {
    console.error('[Highscore] Failed to fetch contributor stats:', error);
    throw error;
  }
}

/**
 * Fetch all category data (all-time, this month, this week)
 */
async function fetchAllCategoryData(owner, repo, config = {}) {
  console.log('[Highscore] Fetching all category data...');

  const now = new Date();
  const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
  const oneMonthAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

  // Fetch all three categories in parallel
  const [allTimeContributors, thisMonthContributors, thisWeekContributors] = await Promise.all([
    fetchFreshContributorStats(owner, repo, config),
    fetchCommitsInDateRange(owner, repo, oneMonthAgo.toISOString(), now.toISOString()),
    fetchCommitsInDateRange(owner, repo, oneWeekAgo.toISOString(), now.toISOString()),
  ]);

  return {
    lastUpdated: now.toISOString(),
    categories: {
      allTime: {
        contributors: allTimeContributors,
      },
      thisMonth: {
        startDate: oneMonthAgo.toISOString(),
        endDate: now.toISOString(),
        contributors: thisMonthContributors,
      },
      thisWeek: {
        startDate: oneWeekAgo.toISOString(),
        endDate: now.toISOString(),
        contributors: thisWeekContributors,
      },
    },
  };
}

/**
 * Update the cache issue with fresh data
 */
async function updateCacheIssue(owner, repo, issueNumber, cacheData) {
  const octokit = getOctokit();

  try {
    await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      body: JSON.stringify(cacheData, null, 2),
    });

    console.log('[Highscore] Cache issue updated successfully');
    return cacheData;
  } catch (error) {
    console.error('[Highscore] Failed to update cache issue:', error);
    throw error;
  }
}

/**
 * Detect if cache data is old format (pre-categories)
 */
function isOldCacheFormat(cacheData) {
  return cacheData && cacheData.contributors && !cacheData.categories;
}

/**
 * Migrate old cache format to new format
 */
function migrateOldCacheFormat(oldData) {
  console.log('[Highscore] Migrating old cache format to new format...');
  return {
    lastUpdated: oldData.lastUpdated,
    categories: {
      allTime: {
        contributors: oldData.contributors || [],
      },
      thisMonth: {
        startDate: null,
        endDate: null,
        contributors: [],
      },
      thisWeek: {
        startDate: null,
        endDate: null,
        contributors: [],
      },
    },
  };
}

/**
 * Check if cache is still valid
 */
function isCacheValid(lastUpdated, cacheMinutes) {
  if (!lastUpdated) return false;

  const lastUpdate = new Date(lastUpdated);
  const now = new Date();
  const diffMinutes = (now - lastUpdate) / 1000 / 60;

  return diffMinutes < cacheMinutes;
}

/**
 * Get contributor highscore with intelligent caching
 * 1. Check browser localStorage cache
 * 2. If expired, check GitHub issue cache
 * 3. If expired, fetch fresh data and update both caches
 */
export async function getContributorHighscore(owner, repo, config, category = 'allTime') {
  const cacheMinutes = config?.features?.contributorHighscore?.cacheMinutes ?? 30;
  const enabled = config?.features?.contributorHighscore?.enabled ?? false;

  if (!enabled) {
    throw new Error('Contributor highscore feature is not enabled');
  }

  console.log(`[Highscore] Fetching contributor highscore for category: ${category} (cache: ${cacheMinutes} minutes)`);

  // Step 1: Check browser localStorage cache
  const localCache = localStorage.getItem(HIGHSCORE_CACHE_KEY);
  if (localCache) {
    let localData = JSON.parse(localCache);

    // Migrate old format if needed
    if (isOldCacheFormat(localData)) {
      localData = migrateOldCacheFormat(localData);
    }

    if (isCacheValid(localData.lastUpdated, cacheMinutes)) {
      console.log('[Highscore] Using browser cache (age: ' +
        Math.round((new Date() - new Date(localData.lastUpdated)) / 1000 / 60) + ' minutes)');

      // Get contributors for the requested category
      const categoryData = localData.categories?.[category];
      if (categoryData && categoryData.contributors) {
        // Apply filters to cached data before returning
        const filteredContributors = await applyContributorFilters(categoryData.contributors, owner, repo, config);
        return {
          lastUpdated: localData.lastUpdated,
          category,
          contributors: filteredContributors,
          allCategories: localData.categories,
        };
      }
    }
    console.log('[Highscore] Browser cache expired or category missing');
  }

  // Step 2: Check GitHub issue cache (if accessible)
  const cacheIssue = await getHighscoreCacheIssue(owner, repo);

  if (cacheIssue) {
    let githubCacheData = parseCacheData(cacheIssue.body);

    // Migrate old format if needed
    if (isOldCacheFormat(githubCacheData)) {
      githubCacheData = migrateOldCacheFormat(githubCacheData);
    }

    if (githubCacheData && isCacheValid(githubCacheData.lastUpdated, cacheMinutes)) {
      console.log('[Highscore] Using GitHub cache (age: ' +
        Math.round((new Date() - new Date(githubCacheData.lastUpdated)) / 1000 / 60) + ' minutes)');

      // Get contributors for the requested category
      const categoryData = githubCacheData.categories?.[category];
      if (categoryData && categoryData.contributors) {
        // Apply filters to cached data before returning
        const filteredContributors = await applyContributorFilters(categoryData.contributors, owner, repo, config);
        const filteredData = {
          lastUpdated: githubCacheData.lastUpdated,
          category,
          contributors: filteredContributors,
          allCategories: githubCacheData.categories,
        };

        // Update browser cache with unfiltered data (filters are applied at read time)
        localStorage.setItem(HIGHSCORE_CACHE_KEY, JSON.stringify(githubCacheData));
        return filteredData;
      }
    }

    console.log('[Highscore] GitHub cache expired or category missing, fetching fresh data...');
  } else {
    console.log('[Highscore] No access to GitHub cache, fetching fresh data...');
  }

  // Step 3: Fetch fresh data for all categories
  const freshData = await fetchAllCategoryData(owner, repo, config);

  // Try to update GitHub cache if we have access (requires write permissions)
  if (cacheIssue) {
    try {
      await updateCacheIssue(owner, repo, cacheIssue.number, freshData);
    } catch (error) {
      // If permission denied (403), continue without updating GitHub cache
      // Only repo admins can update the cache issue
      if (error.status === 403) {
        console.warn('[Highscore] Cannot update GitHub cache (requires admin permissions)');
        console.log('[Highscore] Using fresh data without updating GitHub cache');
      } else {
        throw error;
      }
    }
  }

  // Update browser cache with unfiltered data
  localStorage.setItem(HIGHSCORE_CACHE_KEY, JSON.stringify(freshData));

  // Get contributors for the requested category
  const categoryData = freshData.categories[category];
  const filteredContributors = await applyContributorFilters(categoryData.contributors, owner, repo, config);

  return {
    lastUpdated: freshData.lastUpdated,
    category,
    contributors: filteredContributors,
    allCategories: freshData.categories,
  };
}

/**
 * Force refresh the highscore cache (fetches all categories)
 */
export async function refreshHighscoreCache(owner, repo, config = {}, category = 'allTime') {
  console.log('[Highscore] Force refreshing cache for all categories...');

  // Clear browser cache
  localStorage.removeItem(HIGHSCORE_CACHE_KEY);

  // Fetch fresh data for all categories
  const freshData = await fetchAllCategoryData(owner, repo, config);

  // Try to update GitHub cache if we have access (requires write permissions)
  const cacheIssue = await getHighscoreCacheIssue(owner, repo);

  if (cacheIssue) {
    try {
      await updateCacheIssue(owner, repo, cacheIssue.number, freshData);
    } catch (error) {
      // If permission denied (403), continue without updating GitHub cache
      // Only repo admins can update the cache issue
      if (error.status === 403) {
        console.warn('[Highscore] Cannot update GitHub cache (requires admin permissions)');
        console.log('[Highscore] Using fresh data without updating GitHub cache');
      } else {
        throw error;
      }
    }
  } else {
    console.log('[Highscore] No access to GitHub cache');
  }

  // Update browser cache with unfiltered data
  localStorage.setItem(HIGHSCORE_CACHE_KEY, JSON.stringify(freshData));

  // Get contributors for the requested category and apply filters
  const categoryData = freshData.categories[category];
  const filteredContributors = await applyContributorFilters(categoryData.contributors, owner, repo, config);

  return {
    lastUpdated: freshData.lastUpdated,
    category,
    contributors: filteredContributors,
    allCategories: freshData.categories,
  };
}

/**
 * Get time until next cache refresh
 */
export function getTimeUntilRefresh(lastUpdated, cacheMinutes) {
  if (!lastUpdated) return 0;

  const lastUpdate = new Date(lastUpdated);
  const nextRefresh = new Date(lastUpdate.getTime() + cacheMinutes * 60 * 1000);
  const now = new Date();
  const diffMs = nextRefresh - now;

  return Math.max(0, diffMs);
}

/**
 * Fetch a specific user's contribution stats directly from GitHub API
 */
async function fetchUserContributionsFromAPI(owner, repo, username) {
  const octokit = getOctokit();

  try {
    console.log(`[Highscore] Fetching ${username}'s contributions from GitHub API...`);

    // Fetch all contributors and find the user
    const { data: contributors } = await octokit.rest.repos.listContributors({
      owner,
      repo,
      per_page: 100,
      anon: 'true', // Include anonymous contributors
    });

    // GitHub API may paginate, let's check all pages
    let allContributors = [...contributors];
    let page = 2;
    while (contributors.length === 100) {
      const { data: nextPage } = await octokit.rest.repos.listContributors({
        owner,
        repo,
        per_page: 100,
        page,
        anon: 'true',
      });
      if (nextPage.length === 0) break;
      allContributors = [...allContributors, ...nextPage];
      page++;
    }

    // Find the user in the contributors list
    const userContribution = allContributors.find(
      c => c.login && c.login.toLowerCase() === username.toLowerCase()
    );

    if (!userContribution) {
      console.log(`[Highscore] User ${username} has no contributions to ${owner}/${repo}`);
      return {
        totalPRs: 0,
        mergedPRs: 0,
        openPRs: 0,
        closedPRs: 0,
        totalAdditions: 0,
        totalDeletions: 0,
        totalFiles: 0,
        mostRecentEdit: null,
      };
    }

    console.log(`[Highscore] Found ${userContribution.contributions} contributions for ${username}`);

    return {
      totalPRs: userContribution.contributions || 0,
      mergedPRs: userContribution.contributions || 0, // Contributions are merged commits
      openPRs: 0,
      closedPRs: 0,
      totalAdditions: 0, // Not available in contributors API
      totalDeletions: 0,
      totalFiles: 0,
      mostRecentEdit: null,
    };
  } catch (error) {
    console.error(`[Highscore] Failed to fetch contributions from API for ${username}:`, error);
    throw error;
  }
}

/**
 * Get a specific user's contribution stats
 * Tries highscore cache first, falls back to GitHub API
 */
export async function getUserContributionStats(owner, repo, username, config, category = 'allTime') {
  try {
    console.log(`[Highscore] Fetching stats for user: ${username} (category: ${category})`);

    // Try to fetch from highscore cache first (faster, includes filtering)
    if (config?.features?.contributorHighscore?.enabled) {
      try {
        const highscoreData = await getContributorHighscore(owner, repo, config, category);

        // Find the user in the contributors list
        const userStats = highscoreData.contributors.find(
          contributor => contributor.login.toLowerCase() === username.toLowerCase()
        );

        if (userStats) {
          console.log(`[Highscore] Found stats for ${username} in cache:`, userStats);

          // Convert to prestige-compatible format
          return {
            totalPRs: userStats.contributions || 0,
            mergedPRs: userStats.contributions || 0,
            openPRs: 0,
            closedPRs: 0,
            totalAdditions: 0,
            totalDeletions: 0,
            totalFiles: 0,
            mostRecentEdit: null,
          };
        }

        console.log(`[Highscore] User ${username} not in cache (may not be in top 100), fetching from API...`);
      } catch (error) {
        console.warn('[Highscore] Failed to fetch from cache, falling back to API:', error);
      }
    }

    // Fall back to direct API fetch
    return await fetchUserContributionsFromAPI(owner, repo, username);
  } catch (error) {
    console.error(`[Highscore] Failed to fetch stats for user ${username}:`, error);
    return null;
  }
}
