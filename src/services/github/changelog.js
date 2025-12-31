/**
 * Changelog Service
 * Fetches and processes commits for the site changelog page with caching
 */

import { getOctokit } from './api';
import { createLogger } from '../../utils/logger';
import { getCacheValue, setCacheValue, clearCacheValue } from '../../utils/timeCache';
import { cacheName } from '../../utils/storageManager';

const logger = createLogger('Changelog');

// Cache TTL: 1 week (commits don't change frequently)
const CHANGELOG_CACHE_TTL = 604800000; // 1 week in milliseconds (7 * 24 * 60 * 60 * 1000)

// Bot usernames to filter out
const BOT_USERNAMES = [
  'github-actions[bot]',
  'dependabot[bot]',
  'renovate[bot]',
  'imgbot[bot]',
];

/**
 * Check if a commit is from a bot
 * @param {Object} commit - GitHub commit object
 * @returns {boolean} True if commit is from a bot
 */
function isBotCommit(commit) {
  const author = commit.author?.login || commit.commit?.author?.name || '';
  return BOT_USERNAMES.some(bot => author.toLowerCase().includes(bot.toLowerCase()));
}

/**
 * Check if commit message is too short to be meaningful
 * @param {Object} commit - GitHub commit object
 * @returns {boolean} True if commit message is too short (1-2 words)
 */
function isShortCommit(commit) {
  const message = commit.message || commit.commit?.message || '';
  // Get first line (title) only
  const title = message.split('\n')[0].trim();

  // Count words (split by whitespace, filter empty strings)
  const words = title.split(/\s+/).filter(word => word.length > 0);

  // Filter out commits with 1-2 words (e.g., "fix", "update", "wip")
  return words.length <= 2;
}

/**
 * Check if commit is a merge commit
 * @param {Object} commit - GitHub commit object
 * @returns {boolean} True if commit is a merge commit
 */
function isMergeCommit(commit) {
  const message = commit.message || commit.commit?.message || '';
  const title = message.split('\n')[0].trim();

  // Filter out merge commits (e.g., "Merge branch 'main' into dev")
  return title.startsWith('Merge branch') || title.startsWith('Merge pull request');
}

/**
 * Check if commit message contains "dev" keyword
 * @param {Object} commit - GitHub commit object
 * @returns {boolean} True if commit contains "dev" keyword
 */
function isDevCommit(commit) {
  const message = commit.message || commit.commit?.message || '';
  const title = message.split('\n')[0].trim();

  // Filter out commits with "dev" keyword (case-insensitive)
  return /\bdev\b/i.test(title);
}

/**
 * Check if commit affects wiki content
 * @param {Array} files - Array of file objects from commit
 * @returns {boolean} True if commit affects wiki content
 */
function isWikiCommit(files) {
  if (!files || files.length === 0) return false;
  return files.some(file => file.filename.startsWith('public/content/'));
}

/**
 * Get the start of the week (Sunday) for a given date
 * @param {Date} date - Date to get week start for
 * @returns {Date} Start of the week (midnight UTC)
 */
function getWeekStart(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = d.getDate() - day;

  // Create a new date for the week start (don't mutate original)
  const weekStart = new Date(d);
  weekStart.setDate(diff);

  // Set to midnight to ensure consistent grouping
  weekStart.setHours(0, 0, 0, 0);

  return weekStart;
}

/**
 * Format week label (e.g., "Week of Jan 1, 2024")
 * @param {Date} weekStart - Start of the week
 * @returns {string} Formatted week label
 */
function formatWeekLabel(weekStart) {
  const options = { month: 'short', day: 'numeric', year: 'numeric' };
  return `Week of ${weekStart.toLocaleDateString('en-US', options)}`;
}

/**
 * Fetch commits for changelog with file information
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} weeksBack - Number of weeks back to fetch (default: 4)
 * @returns {Promise<Array>} Array of commits with metadata
 */
export async function fetchChangelogCommits(owner, repo, weeksBack = 4) {
  const octokit = getOctokit();

  try {
    // Calculate date range
    const since = new Date();
    since.setDate(since.getDate() - (weeksBack * 7));

    logger.debug('Fetching changelog commits', { owner, repo, since: since.toISOString(), weeksBack });

    // Fetch commits from main branch
    const { data: commits } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: 'main',
      since: since.toISOString(),
      per_page: 100,
    });

    logger.debug('Fetched commits', { count: commits.length });

    // Filter out bot commits, short commits, merge commits, and dev commits
    const nonBotCommits = commits.filter(commit => !isBotCommit(commit));
    logger.debug('Filtered bot commits', { nonBot: nonBotCommits.length });

    const nonShortCommits = nonBotCommits.filter(commit => !isShortCommit(commit));
    logger.debug('Filtered short commits', { nonShort: nonShortCommits.length });

    const nonMergeCommits = nonShortCommits.filter(commit => !isMergeCommit(commit));
    logger.debug('Filtered merge commits', { nonMerge: nonMergeCommits.length });

    const meaningfulCommits = nonMergeCommits.filter(commit => !isDevCommit(commit));
    logger.debug('Filtered dev commits', { meaningful: meaningfulCommits.length });

    // Fetch file details for each commit (in parallel with rate limiting)
    const commitsWithFiles = await Promise.all(
      meaningfulCommits.map(async (commit) => {
        try {
          const { data: commitDetail } = await octokit.rest.repos.getCommit({
            owner,
            repo,
            ref: commit.sha,
          });

          return {
            sha: commit.sha,
            message: commit.commit.message,
            author: {
              login: commit.author?.login || commit.commit.author.name,
              avatar_url: commit.author?.avatar_url || null,
              id: commit.author?.id || null,
            },
            date: new Date(commit.commit.author.date),
            url: commit.html_url,
            files: commitDetail.files || [],
            stats: {
              additions: commitDetail.stats.additions,
              deletions: commitDetail.stats.deletions,
              total: commitDetail.stats.total,
            },
          };
        } catch (error) {
          logger.warn('Failed to fetch commit details', { sha: commit.sha, error: error.message });
          return null;
        }
      })
    );

    // Filter out failed fetches
    const validCommits = commitsWithFiles.filter(c => c !== null);

    logger.info('Fetched changelog commits', { total: validCommits.length });
    return validCommits;
  } catch (error) {
    logger.error('Failed to fetch changelog commits', { error });
    throw error;
  }
}

/**
 * Group commits by week and category (site vs wiki)
 * @param {Array} commits - Array of commit objects
 * @returns {Array} Array of week objects with categorized commits
 */
export function groupCommitsByWeek(commits) {
  const weeks = new Map();

  commits.forEach(commit => {
    const weekStart = getWeekStart(commit.date);
    const weekKey = weekStart.toISOString();

    if (!weeks.has(weekKey)) {
      weeks.set(weekKey, {
        weekStart,
        weekLabel: formatWeekLabel(weekStart),
        siteUpdates: [],
        wikiUpdates: [],
      });
    }

    const week = weeks.get(weekKey);
    const isWiki = isWikiCommit(commit.files);

    if (isWiki) {
      week.wikiUpdates.push(commit);
    } else {
      week.siteUpdates.push(commit);
    }
  });

  // Convert to array and sort by week (newest first)
  const weekArray = Array.from(weeks.values()).sort((a, b) =>
    b.weekStart.getTime() - a.weekStart.getTime()
  );

  logger.debug('Grouped commits by week', { weeks: weekArray.length });
  return weekArray;
}

/**
 * Get formatted changelog data with caching
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} weeksBack - Number of weeks back to fetch (default: 4)
 * @param {boolean} forceRefresh - Force refresh cache (default: false)
 * @returns {Promise<Array>} Array of week objects with categorized commits
 */
export async function getChangelog(owner, repo, weeksBack = 4, forceRefresh = false) {
  try {
    const cacheKey = cacheName('changelog', `${owner}/${repo}`);

    // Check cache first (unless force refresh)
    if (!forceRefresh) {
      const cached = getCacheValue(cacheKey);
      if (cached && cached.commits && cached.commits.length > 0) {
        // Hydrate cached commits - convert date strings back to Date objects
        const hydratedCommits = cached.commits.map(commit => ({
          ...commit,
          date: new Date(commit.date)
        }));

        logger.info('✅ Changelog cache HIT', {
          commits: hydratedCommits.length,
          latestCommit: hydratedCommits[0]?.date
        });

        // Check if we need to fetch new commits
        const latestCachedDate = hydratedCommits[0].date;
        const now = new Date();
        const timeSinceLatest = now - latestCachedDate;

        // If latest commit is less than 5 minutes old, return cached data
        if (timeSinceLatest < 300000) { // 5 minutes
          logger.debug('Recent commits in cache, returning cached data');
          const weeks = groupCommitsByWeek(hydratedCommits);
          return weeks;
        }

        // Fetch only new commits since the latest cached commit
        logger.info('Fetching new commits since last cache', { since: latestCachedDate.toISOString() });
        try {
          const newCommits = await fetchChangelogCommitsSince(owner, repo, latestCachedDate);

          if (newCommits.length > 0) {
            logger.info('Found new commits, merging with cache', { newCommits: newCommits.length });

            // Merge new commits with cached (avoid duplicates by SHA)
            const cachedShas = new Set(hydratedCommits.map(c => c.sha));
            const uniqueNewCommits = newCommits.filter(c => !cachedShas.has(c.sha));

            // Combine and sort by date (newest first)
            const allCommits = [...uniqueNewCommits, ...hydratedCommits]
              .sort((a, b) => b.date - a.date);

            // Update cache with merged commits
            setCacheValue(cacheKey, { commits: allCommits }, CHANGELOG_CACHE_TTL);

            const weeks = groupCommitsByWeek(allCommits);
            return weeks;
          } else {
            logger.debug('No new commits, returning cached data');
            const weeks = groupCommitsByWeek(hydratedCommits);
            return weeks;
          }
        } catch (fetchError) {
          logger.warn('Failed to fetch new commits, returning cached data', { error: fetchError });
          const weeks = groupCommitsByWeek(hydratedCommits);
          return weeks;
        }
      }
    }

    // Cache miss or force refresh - fetch all commits
    logger.info('❌ Changelog cache MISS - fetching all commits', { weeksBack, forceRefresh });
    const commits = await fetchChangelogCommits(owner, repo, weeksBack);

    // Cache the results
    setCacheValue(cacheKey, { commits }, CHANGELOG_CACHE_TTL);
    logger.info('✅ Changelog cached', { commits: commits.length, ttl: '1 week' });

    const weeks = groupCommitsByWeek(commits);
    return weeks;
  } catch (error) {
    logger.error('Failed to get changelog', { error });
    throw error;
  }
}

/**
 * Fetch new commits since a specific date (for incremental updates)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {Date} since - Fetch commits after this date
 * @returns {Promise<Array>} Array of commits with metadata
 */
async function fetchChangelogCommitsSince(owner, repo, since) {
  const octokit = getOctokit();

  try {
    logger.debug('Fetching commits since', { owner, repo, since: since.toISOString() });

    // Fetch commits from main branch
    const { data: commits } = await octokit.rest.repos.listCommits({
      owner,
      repo,
      sha: 'main',
      since: since.toISOString(),
      per_page: 50, // Limit to 50 new commits
    });

    logger.debug('Fetched new commits', { count: commits.length });

    // Filter out bot commits, short commits, merge commits, and dev commits
    const nonBotCommits = commits.filter(commit => !isBotCommit(commit));
    const nonShortCommits = nonBotCommits.filter(commit => !isShortCommit(commit));
    const nonMergeCommits = nonShortCommits.filter(commit => !isMergeCommit(commit));
    const meaningfulCommits = nonMergeCommits.filter(commit => !isDevCommit(commit));
    logger.debug('Filtered bot, short, merge, and dev commits', { meaningful: meaningfulCommits.length });

    // Fetch file details for each commit (in parallel)
    const commitsWithFiles = await Promise.all(
      meaningfulCommits.map(async (commit) => {
        try {
          const { data: commitDetail } = await octokit.rest.repos.getCommit({
            owner,
            repo,
            ref: commit.sha,
          });

          return {
            sha: commit.sha,
            message: commit.commit.message,
            author: {
              login: commit.author?.login || commit.commit.author.name,
              avatar_url: commit.author?.avatar_url || null,
              id: commit.author?.id || null,
            },
            date: new Date(commit.commit.author.date),
            url: commit.html_url,
            files: commitDetail.files || [],
            stats: {
              additions: commitDetail.stats.additions,
              deletions: commitDetail.stats.deletions,
              total: commitDetail.stats.total,
            },
          };
        } catch (error) {
          logger.warn('Failed to fetch commit details', { sha: commit.sha, error: error.message });
          return null;
        }
      })
    );

    // Filter out failed fetches
    const validCommits = commitsWithFiles.filter(c => c !== null);

    logger.info('Fetched new changelog commits', { total: validCommits.length });
    return validCommits;
  } catch (error) {
    logger.error('Failed to fetch new changelog commits', { error });
    throw error;
  }
}

/**
 * Clear changelog cache (useful for debugging or force refresh)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 */
export function clearChangelogCache(owner, repo) {
  const cacheKey = cacheName('changelog', `${owner}/${repo}`);
  clearCacheValue(cacheKey);
  logger.info('Changelog cache cleared', { owner, repo });
}
