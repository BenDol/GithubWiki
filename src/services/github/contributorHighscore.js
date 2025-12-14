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
 * Fetch fresh contributor statistics from GitHub API
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
 * Update the cache issue with fresh data
 */
async function updateCacheIssue(owner, repo, issueNumber, contributors) {
  const octokit = getOctokit();

  try {
    const cacheData = {
      lastUpdated: new Date().toISOString(),
      contributors,
    };

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
export async function getContributorHighscore(owner, repo, config) {
  const cacheMinutes = config?.features?.contributorHighscore?.cacheMinutes ?? 30;
  const enabled = config?.features?.contributorHighscore?.enabled ?? false;

  if (!enabled) {
    throw new Error('Contributor highscore feature is not enabled');
  }

  console.log('[Highscore] Fetching contributor highscore (cache: ' + cacheMinutes + ' minutes)');

  // Step 1: Check browser localStorage cache
  const localCache = localStorage.getItem(HIGHSCORE_CACHE_KEY);
  if (localCache) {
    const localData = JSON.parse(localCache);
    if (isCacheValid(localData.lastUpdated, cacheMinutes)) {
      console.log('[Highscore] Using browser cache (age: ' +
        Math.round((new Date() - new Date(localData.lastUpdated)) / 1000 / 60) + ' minutes)');

      // Apply filters to cached data before returning
      const filteredContributors = await applyContributorFilters(localData.contributors, owner, repo, config);
      return {
        ...localData,
        contributors: filteredContributors
      };
    }
    console.log('[Highscore] Browser cache expired');
  }

  // Step 2: Check GitHub issue cache (if accessible)
  const cacheIssue = await getHighscoreCacheIssue(owner, repo);

  if (cacheIssue) {
    const githubCacheData = parseCacheData(cacheIssue.body);

    if (githubCacheData && isCacheValid(githubCacheData.lastUpdated, cacheMinutes)) {
      console.log('[Highscore] Using GitHub cache (age: ' +
        Math.round((new Date() - new Date(githubCacheData.lastUpdated)) / 1000 / 60) + ' minutes)');

      // Apply filters to cached data before returning
      const filteredContributors = await applyContributorFilters(githubCacheData.contributors, owner, repo, config);
      const filteredData = {
        ...githubCacheData,
        contributors: filteredContributors
      };

      // Update browser cache with unfiltered data (filters are applied at read time)
      localStorage.setItem(HIGHSCORE_CACHE_KEY, JSON.stringify(githubCacheData));
      return filteredData;
    }

    console.log('[Highscore] GitHub cache expired, fetching fresh data...');
  } else {
    console.log('[Highscore] No access to GitHub cache, fetching fresh data...');
  }

  // Step 3: Fetch fresh data
  const freshContributors = await fetchFreshContributorStats(owner, repo, config);

  // Try to update GitHub cache if we have access (requires write permissions)
  let freshData;
  if (cacheIssue) {
    try {
      freshData = await updateCacheIssue(owner, repo, cacheIssue.number, freshContributors);
    } catch (error) {
      // If permission denied (403), continue without updating GitHub cache
      // Only repo admins can update the cache issue
      if (error.status === 403) {
        console.warn('[Highscore] Cannot update GitHub cache (requires admin permissions)');
        console.log('[Highscore] Using fresh data without updating GitHub cache');

        freshData = {
          lastUpdated: new Date().toISOString(),
          contributors: freshContributors,
        };
      } else {
        throw error;
      }
    }
  } else {
    // No cache issue available, just use fresh data
    freshData = {
      lastUpdated: new Date().toISOString(),
      contributors: freshContributors,
    };
  }

  // Update browser cache with unfiltered data
  localStorage.setItem(HIGHSCORE_CACHE_KEY, JSON.stringify(freshData));

  // Apply filters before returning
  const filteredContributors = await applyContributorFilters(freshData.contributors, owner, repo, config);
  return {
    ...freshData,
    contributors: filteredContributors
  };
}

/**
 * Force refresh the highscore cache
 */
export async function refreshHighscoreCache(owner, repo, config = {}) {
  console.log('[Highscore] Force refreshing cache...');

  // Clear browser cache
  localStorage.removeItem(HIGHSCORE_CACHE_KEY);

  // Fetch fresh data
  const freshContributors = await fetchFreshContributorStats(owner, repo, config);

  // Try to update GitHub cache if we have access (requires write permissions)
  let freshData;
  const cacheIssue = await getHighscoreCacheIssue(owner, repo);

  if (cacheIssue) {
    try {
      freshData = await updateCacheIssue(owner, repo, cacheIssue.number, freshContributors);
    } catch (error) {
      // If permission denied (403), continue without updating GitHub cache
      // Only repo admins can update the cache issue
      if (error.status === 403) {
        console.warn('[Highscore] Cannot update GitHub cache (requires admin permissions)');
        console.log('[Highscore] Using fresh data without updating GitHub cache');

        freshData = {
          lastUpdated: new Date().toISOString(),
          contributors: freshContributors,
        };
      } else {
        throw error;
      }
    }
  } else {
    // No cache issue available, just use fresh data
    console.log('[Highscore] No access to GitHub cache');
    freshData = {
      lastUpdated: new Date().toISOString(),
      contributors: freshContributors,
    };
  }

  // Update browser cache with unfiltered data
  localStorage.setItem(HIGHSCORE_CACHE_KEY, JSON.stringify(freshData));

  // Apply filters before returning
  const filteredContributors = await applyContributorFilters(freshData.contributors, owner, repo, config);
  return {
    ...freshData,
    contributors: filteredContributors
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
