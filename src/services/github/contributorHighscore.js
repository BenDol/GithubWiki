import { getOctokit } from './api';

/**
 * Contributor Highscore Service
 * Manages fetching and caching contributor statistics using GitHub Issues as a data store
 */

const HIGHSCORE_ISSUE_TITLE = 'Contributor Highscore Cache [DO NOT DELETE]';
const HIGHSCORE_CACHE_KEY = 'contributor_highscore_cache';

/**
 * Get or create the highscore cache issue
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

    // Create cache issue if it doesn't exist
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
 * Fetch fresh contributor statistics from GitHub API
 */
async function fetchFreshContributorStats(owner, repo) {
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
    }));

    // Sort by contributions (descending)
    formattedContributors.sort((a, b) => b.contributions - a.contributions);

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
      return localData;
    }
    console.log('[Highscore] Browser cache expired');
  }

  // Step 2: Check GitHub issue cache
  const cacheIssue = await getHighscoreCacheIssue(owner, repo);
  const githubCacheData = parseCacheData(cacheIssue.body);

  if (githubCacheData && isCacheValid(githubCacheData.lastUpdated, cacheMinutes)) {
    console.log('[Highscore] Using GitHub cache (age: ' +
      Math.round((new Date() - new Date(githubCacheData.lastUpdated)) / 1000 / 60) + ' minutes)');

    // Update browser cache
    localStorage.setItem(HIGHSCORE_CACHE_KEY, JSON.stringify(githubCacheData));
    return githubCacheData;
  }

  console.log('[Highscore] GitHub cache expired, fetching fresh data...');

  // Step 3: Fetch fresh data
  const freshContributors = await fetchFreshContributorStats(owner, repo);
  const freshData = await updateCacheIssue(owner, repo, cacheIssue.number, freshContributors);

  // Update browser cache
  localStorage.setItem(HIGHSCORE_CACHE_KEY, JSON.stringify(freshData));

  return freshData;
}

/**
 * Force refresh the highscore cache
 */
export async function refreshHighscoreCache(owner, repo) {
  console.log('[Highscore] Force refreshing cache...');

  // Clear browser cache
  localStorage.removeItem(HIGHSCORE_CACHE_KEY);

  // Fetch fresh data
  const freshContributors = await fetchFreshContributorStats(owner, repo);

  // Update GitHub cache
  const cacheIssue = await getHighscoreCacheIssue(owner, repo);
  const freshData = await updateCacheIssue(owner, repo, cacheIssue.number, freshContributors);

  // Update browser cache
  localStorage.setItem(HIGHSCORE_CACHE_KEY, JSON.stringify(freshData));

  return freshData;
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
