/**
 * GitHub API Cache Service
 *
 * Provides intelligent caching for semi-static GitHub API data to prevent rate limiting.
 *
 * CACHING STRATEGY:
 * - User Profiles: 24 hour TTL (rarely change)
 * - Collaborators: 24 hour TTL (rarely change)
 * - Repository Info: 6 hour TTL (somewhat dynamic)
 *
 * STORAGE:
 * - localStorage for persistence across sessions
 * - In-memory cache for fast access within session
 * - LRU eviction to prevent unbounded growth
 *
 * WHY THIS MATTERS:
 * Without caching, fetching user profiles for prestige calculations can quickly
 * exhaust GitHub's rate limit (60 requests/hour unauthenticated, 5000/hour authenticated).
 * With caching, we make 1 request per user per day instead of every page load.
 */

import { getOctokit } from './api';
import { cacheName } from '../../utils/storageManager';

// Cache configuration
const CACHE_CONFIG = {
  userProfile: {
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    storageKey: cacheName('github_users'),
    maxSize: 200, // Max 200 user profiles cached
  },
  collaborators: {
    ttl: 24 * 60 * 60 * 1000, // 24 hours
    storageKey: cacheName('github_collaborators'),
    maxSize: 50, // Max 50 repo collaborator lists
  },
  repository: {
    ttl: 6 * 60 * 60 * 1000, // 6 hours
    storageKey: cacheName('github_repositories'),
    maxSize: 10, // Max 10 repo info cached
  },
};

/**
 * Generic cache class with localStorage persistence and LRU eviction
 */
class GitHubCache {
  constructor(config) {
    this.config = config;
    this.memoryCache = new Map();
    this.accessTimes = new Map();
    this.loadFromStorage();
  }

  /**
   * Load cache from localStorage
   */
  loadFromStorage() {
    try {
      const stored = localStorage.getItem(this.config.storageKey);
      if (stored) {
        const data = JSON.parse(stored);
        console.log(`[GitHub Cache] Loaded ${data.length} entries from localStorage (${this.config.storageKey})`);

        // Restore to memory cache
        data.forEach(({ key, value, timestamp }) => {
          this.memoryCache.set(key, { value, timestamp });
          this.accessTimes.set(key, timestamp);
        });

        // Clean up expired entries
        this.cleanupExpired();
      }
    } catch (error) {
      console.error('[GitHub Cache] Failed to load from localStorage:', error);
    }
  }

  /**
   * Save cache to localStorage
   */
  saveToStorage() {
    try {
      const data = [];
      this.memoryCache.forEach((cacheEntry, key) => {
        data.push({
          key,
          value: cacheEntry.value,
          timestamp: cacheEntry.timestamp,
        });
      });

      localStorage.setItem(this.config.storageKey, JSON.stringify(data));
    } catch (error) {
      console.error('[GitHub Cache] Failed to save to localStorage:', error);
    }
  }

  /**
   * Get cached value if valid
   * @param {string} key - Cache key
   * @returns {any|null} Cached value or null if expired/missing
   */
  get(key) {
    const cached = this.memoryCache.get(key);
    if (!cached) return null;

    const now = Date.now();
    const age = now - cached.timestamp;

    // Check if expired
    if (age > this.config.ttl) {
      console.log(`[GitHub Cache] Entry expired: ${key} (age: ${Math.round(age / 1000 / 60)} minutes)`);
      this.delete(key);
      return null;
    }

    // Update access time for LRU
    this.accessTimes.set(key, now);

    console.log(`[GitHub Cache] Cache hit: ${key} (age: ${Math.round(age / 1000 / 60)} minutes)`);
    return cached.value;
  }

  /**
   * Set cache value
   * @param {string} key - Cache key
   * @param {any} value - Value to cache
   */
  set(key, value) {
    const now = Date.now();

    // Check if we need to evict old entries
    if (this.memoryCache.size >= this.config.maxSize && !this.memoryCache.has(key)) {
      this.evictLRU();
    }

    this.memoryCache.set(key, { value, timestamp: now });
    this.accessTimes.set(key, now);

    console.log(`[GitHub Cache] Cached: ${key}`);

    // Persist to localStorage
    this.saveToStorage();
  }

  /**
   * Delete cache entry
   * @param {string} key - Cache key
   */
  delete(key) {
    this.memoryCache.delete(key);
    this.accessTimes.delete(key);
    this.saveToStorage();
  }

  /**
   * Clear all cache entries
   */
  clear() {
    this.memoryCache.clear();
    this.accessTimes.clear();
    localStorage.removeItem(this.config.storageKey);
    console.log(`[GitHub Cache] Cleared all entries for ${this.config.storageKey}`);
  }

  /**
   * Clean up expired entries
   */
  cleanupExpired() {
    const now = Date.now();
    let expiredCount = 0;

    this.memoryCache.forEach((cacheEntry, key) => {
      const age = now - cacheEntry.timestamp;
      if (age > this.config.ttl) {
        this.delete(key);
        expiredCount++;
      }
    });

    if (expiredCount > 0) {
      console.log(`[GitHub Cache] Cleaned up ${expiredCount} expired entries`);
    }
  }

  /**
   * Evict least recently used entries (20% of max size)
   */
  evictLRU() {
    const sortedByAccess = Array.from(this.accessTimes.entries())
      .sort((a, b) => a[1] - b[1]); // Sort by access time (oldest first)

    const evictCount = Math.max(1, Math.floor(this.config.maxSize * 0.2));
    const toEvict = sortedByAccess.slice(0, evictCount);

    toEvict.forEach(([key]) => {
      this.delete(key);
    });

    console.log(`[GitHub Cache] LRU eviction: removed ${evictCount} entries, ${this.memoryCache.size} remaining`);
  }

  /**
   * Get cache statistics
   * @returns {Object} Cache stats
   */
  getStats() {
    const now = Date.now();
    let validCount = 0;
    let expiredCount = 0;

    this.memoryCache.forEach((cacheEntry) => {
      const age = now - cacheEntry.timestamp;
      if (age > this.config.ttl) {
        expiredCount++;
      } else {
        validCount++;
      }
    });

    return {
      size: this.memoryCache.size,
      validEntries: validCount,
      expiredEntries: expiredCount,
      maxSize: this.config.maxSize,
      utilization: `${((this.memoryCache.size / this.config.maxSize) * 100).toFixed(1)}%`,
      ttl: `${this.config.ttl / 1000 / 60 / 60} hours`,
    };
  }
}

// Create cache instances
const userProfileCache = new GitHubCache(CACHE_CONFIG.userProfile);
const collaboratorsCache = new GitHubCache(CACHE_CONFIG.collaborators);
const repositoryCache = new GitHubCache(CACHE_CONFIG.repository);

/**
 * Get user profile with caching
 * @param {string} username - GitHub username
 * @returns {Promise<Object>} User profile data
 */
export async function getCachedUserProfile(username) {
  // Check cache first
  const cached = userProfileCache.get(username);
  if (cached) {
    return cached;
  }

  // Fetch from API
  console.log(`[GitHub Cache] Fetching user profile from API: ${username}`);
  const octokit = getOctokit();

  try {
    const { data } = await octokit.rest.users.getByUsername({ username });

    // Cache the result
    userProfileCache.set(username, data);

    return data;
  } catch (error) {
    console.error(`[GitHub Cache] Failed to fetch user profile for ${username}:`, error);
    throw error;
  }
}

/**
 * Get user ID from username
 * Uses cached profile data to avoid unnecessary API calls
 * @param {string} username - GitHub username
 * @returns {Promise<number>} User ID
 */
export async function getUserIdFromUsername(username) {
  try {
    const profile = await getCachedUserProfile(username);
    return profile.id;
  } catch (error) {
    console.error(`[GitHub Cache] Failed to get user ID for ${username}:`, error);
    throw error;
  }
}

/**
 * Get repository collaborators with caching
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Array>} List of collaborators
 */
export async function getCachedCollaborators(owner, repo) {
  const cacheKey = `${owner}/${repo}`;

  // Check cache first
  const cached = collaboratorsCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from API
  console.log(`[GitHub Cache] Fetching collaborators from API: ${cacheKey}`);
  const octokit = getOctokit();

  try {
    const { data } = await octokit.rest.repos.listCollaborators({
      owner,
      repo,
      per_page: 100,
    });

    // Cache the result
    collaboratorsCache.set(cacheKey, data);

    return data;
  } catch (error) {
    console.error(`[GitHub Cache] Failed to fetch collaborators for ${cacheKey}:`, error);
    throw error;
  }
}

/**
 * Get repository information with caching
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @returns {Promise<Object>} Repository data
 */
export async function getCachedRepository(owner, repo) {
  const cacheKey = `${owner}/${repo}`;

  // Check cache first
  const cached = repositoryCache.get(cacheKey);
  if (cached) {
    return cached;
  }

  // Fetch from API
  console.log(`[GitHub Cache] Fetching repository info from API: ${cacheKey}`);
  const octokit = getOctokit();

  try {
    const { data } = await octokit.rest.repos.get({ owner, repo });

    // Cache the result
    repositoryCache.set(cacheKey, data);

    return data;
  } catch (error) {
    console.error(`[GitHub Cache] Failed to fetch repository info for ${cacheKey}:`, error);
    throw error;
  }
}

/**
 * Invalidate user profile cache for a specific user
 * Call this when user profile changes (e.g., avatar update, name change)
 * @param {string} username - GitHub username
 */
export function invalidateUserProfile(username) {
  console.log(`[GitHub Cache] Invalidating user profile: ${username}`);
  userProfileCache.delete(username);
}

/**
 * Invalidate collaborators cache for a repository
 * Call this when collaborators are added/removed
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 */
export function invalidateCollaborators(owner, repo) {
  const cacheKey = `${owner}/${repo}`;
  console.log(`[GitHub Cache] Invalidating collaborators: ${cacheKey}`);
  collaboratorsCache.delete(cacheKey);
}

/**
 * Invalidate repository cache
 * Call this when repository info changes (e.g., description, settings)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 */
export function invalidateRepository(owner, repo) {
  const cacheKey = `${owner}/${repo}`;
  console.log(`[GitHub Cache] Invalidating repository: ${cacheKey}`);
  repositoryCache.delete(cacheKey);
}

/**
 * Clear all GitHub caches
 * Useful for testing or forcing fresh data
 */
export function clearAllGitHubCaches() {
  console.log('[GitHub Cache] Clearing all GitHub caches');
  userProfileCache.clear();
  collaboratorsCache.clear();
  repositoryCache.clear();
}

/**
 * Get statistics for all caches
 * @returns {Object} Cache statistics
 */
export function getGitHubCacheStats() {
  return {
    userProfiles: userProfileCache.getStats(),
    collaborators: collaboratorsCache.getStats(),
    repositories: repositoryCache.getStats(),
  };
}

/**
 * Clean up expired entries in all caches
 */
export function cleanupExpiredGitHubCaches() {
  console.log('[GitHub Cache] Cleaning up expired entries');
  userProfileCache.cleanupExpired();
  collaboratorsCache.cleanupExpired();
  repositoryCache.cleanupExpired();
}
