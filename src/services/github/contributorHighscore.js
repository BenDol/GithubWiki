import { getOctokit } from './api';
import { getBannedUsers } from './admin';
import { getCachedCollaborators } from './githubCache';

/**
 * Contributor Highscore Service
 * Manages fetching and caching contributor statistics using GitHub Issues as a data store
 *
 * ARCHITECTURE (Updated):
 * - GitHub Actions workflow calculates ALL highscore data (additions/deletions/scores)
 * - Calculations include detailed commit stats from the main branch
 * - Client ONLY reads from cache (localStorage → GitHub Issue cache)
 * - Client NEVER calculates highscores (too expensive, rate limit concerns)
 * - If no cache exists, user must run GitHub Actions workflow first
 *
 * Indexing:
 * - Primary: User ID (permanent, immune to username changes)
 * - Fallback: Username (for display and legacy data)
 * - All contributor objects include both userId and login fields
 *
 * Scoring Formula (calculated by GitHub Actions):
 * - score = (contributions * 100) + ((additions + deletions) / contributions * 2)
 * - Heavily weights contribution count (100x)
 * - Quality bonus from average lines per contribution (2x)
 * - Prevents gaming through spam contributions
 */

const HIGHSCORE_ISSUE_TITLE = '[Cache] Contributor Highscore';
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
      per_page: 100,
    });

    // Find issue with exact title match
    const existingIssue = issues.find(issue => issue.title === HIGHSCORE_ISSUE_TITLE);

    if (existingIssue) {
      return existingIssue;
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
      labels: ['highscore-cache', 'automated'],
    });

    // Lock the issue to prevent unwanted comments
    try {
      await octokit.rest.issues.lock({
        owner,
        repo,
        issue_number: newIssue.number,
        lock_reason: 'off-topic',
      });
      console.log('[Highscore] Locked cache issue to collaborators only');
    } catch (lockError) {
      console.warn('[Highscore] Failed to lock issue (may not have permissions):', lockError.message);
    }

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
 * Uses caching to prevent rate limiting (24 hour TTL)
 */
async function fetchRepositoryCollaborators(owner, repo) {
  try {
    console.log('[Highscore] Fetching repository collaborators (with caching)...');
    const collaborators = await getCachedCollaborators(owner, repo);

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
 * Calculate a fair contributor score that prevents gaming
 * Formula: (contributions * 100) + (quality_bonus * 2)
 *
 * - Base score from contributions (heavily weighted at 100x)
 * - Quality bonus from average lines per contribution (2x weight)
 * - This rewards both volume AND quality, preventing spam contributions
 *
 * @param {Object} contributor - Contributor data
 * @returns {number} Calculated score
 */
function calculateContributorScore(contributor) {
  const contributions = contributor.contributions || 0;
  const additions = contributor.additions || 0;
  const deletions = contributor.deletions || 0;

  // Base score: contributions heavily weighted
  const baseScore = contributions * 100;

  // Quality bonus: average lines changed per contribution
  // High value = meaningful contributions, Low value = spam
  const totalLines = additions + deletions;
  const averageLinesPerContribution = contributions > 0 ? totalLines / contributions : 0;
  const qualityBonus = averageLinesPerContribution * 2;

  // Final score
  const score = baseScore + qualityBonus;

  return Math.round(score);
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
  const excludedUserIds = new Set();

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

  // ALWAYS filter out banned users
  try {
    console.log('[Highscore] Fetching banned users list...');
    const bannedUsers = await getBannedUsers(owner, repo, config);

    if (bannedUsers.length > 0) {
      bannedUsers.forEach(user => {
        excludedUsers.add(user.username);
        if (user.userId) {
          excludedUserIds.add(user.userId);
        }
      });
      console.log(`[Highscore] Filtering out ${bannedUsers.length} banned users:`, bannedUsers.map(u => u.username));
    } else {
      console.log('[Highscore] No banned users to filter');
    }
  } catch (error) {
    console.error('[Highscore] Failed to fetch banned users:', error);
    // Continue without filtering banned users if fetch fails
  }

  // Apply all filters at once
  if (excludedUsers.size > 0 || excludedUserIds.size > 0) {
    const beforeCount = filteredContributors.length;
    filteredContributors = filteredContributors.filter(c => {
      // Check both userId and username for maximum coverage
      if (c.userId && excludedUserIds.has(c.userId)) {
        return false;
      }
      if (excludedUsers.has(c.login)) {
        return false;
      }
      return true;
    });
    console.log(`[Highscore] Filtered out ${beforeCount - filteredContributors.length} total users`);
  }

  // Calculate scores for all contributors
  filteredContributors = filteredContributors.map(contributor => ({
    ...contributor,
    score: calculateContributorScore(contributor),
  }));

  // Sort by score (descending), fallback to contributions if scores are equal
  filteredContributors.sort((a, b) => {
    if (b.score !== a.score) {
      return b.score - a.score;
    }
    return b.contributions - a.contributions;
  });

  console.log(`[Highscore] Calculated scores for ${filteredContributors.length} contributors`);

  return filteredContributors;
}

// NOTE: Client-side highscore calculation has been removed.
// All highscore data is now calculated by GitHub Actions and stored in the cache issue.
// The client only reads from the cache - it never calculates fresh data.

// All client-side calculation functions have been removed.
// Highscore data is now ONLY calculated by GitHub Actions.
// The client reads from cache only - never calculates fresh data.

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
 * Get contributor highscore from cache ONLY
 * The client never calculates highscores - only reads from cache
 * 1. Check browser localStorage cache
 * 2. If expired/missing, check GitHub issue cache
 * 3. If no cache available, return error (user must trigger GitHub Actions)
 */
export async function getContributorHighscore(owner, repo, config, category = 'allTime') {
  const cacheMinutes = config?.features?.contributorHighscore?.cacheMinutes ?? 1440; // 24 hours default
  const enabled = config?.features?.contributorHighscore?.enabled ?? false;

  if (!enabled) {
    throw new Error('Contributor highscore feature is not enabled');
  }

  console.log(`[Highscore] Fetching contributor highscore for category: ${category} (cache only)`);

  // Step 1: Check browser localStorage cache
  const localCache = localStorage.getItem(HIGHSCORE_CACHE_KEY);
  if (localCache) {
    let localData = JSON.parse(localCache);

    // Migrate old format if needed
    if (isOldCacheFormat(localData)) {
      localData = migrateOldCacheFormat(localData);
    }

    // Always use localStorage cache if it exists (even if "expired")
    // The cache is updated by GitHub Actions on a schedule
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

  // Step 2: Check GitHub issue cache (always, since we don't generate fresh)
  console.log('[Highscore] No browser cache, checking GitHub issue cache...');
  const cacheIssue = await getHighscoreCacheIssue(owner, repo);

  if (cacheIssue) {
    let githubCacheData = parseCacheData(cacheIssue.body);

    // Migrate old format if needed
    if (isOldCacheFormat(githubCacheData)) {
      githubCacheData = migrateOldCacheFormat(githubCacheData);
    }

    if (githubCacheData) {
      console.log('[Highscore] Using GitHub issue cache (age: ' +
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

        // Update browser cache for faster future access
        localStorage.setItem(HIGHSCORE_CACHE_KEY, JSON.stringify(githubCacheData));
        return filteredData;
      }
    }
  }

  // Step 3: No cache available - return error
  console.error('[Highscore] No cache data available. GitHub Actions workflow must be run first.');
  throw new Error(
    'Highscore data not available. The repository administrator needs to run the "Update Contributor Highscore Cache" GitHub Actions workflow to generate the initial cache.'
  );
}

/**
 * Force refresh the highscore cache from GitHub issue
 * Clears browser cache and re-fetches from GitHub issue cache only
 * Does NOT calculate fresh data - that's done by GitHub Actions
 */
export async function refreshHighscoreCache(owner, repo, config = {}, category = 'allTime') {
  console.log('[Highscore] Refreshing cache from GitHub issue...');

  // Clear browser cache to force re-fetch from GitHub
  localStorage.removeItem(HIGHSCORE_CACHE_KEY);

  // Re-fetch from GitHub issue cache (will also update localStorage)
  return getContributorHighscore(owner, repo, config, category);
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
 * Returns user ID along with stats for permanent identification
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
        userId: null,
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

    console.log(`[Highscore] Found ${userContribution.contributions} contributions for ${username} (ID: ${userContribution.id})`);

    return {
      userId: userContribution.id, // Permanent identifier
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

          // Convert to prestige-compatible format (include userId)
          return {
            userId: userStats.userId || null, // Permanent identifier
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
