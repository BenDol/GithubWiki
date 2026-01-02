import { create } from 'zustand';

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes
const PR_CACHE_TTL = 30 * 60 * 1000; // 30 minutes (for anonymous users to reduce abuse detection)
const COMMIT_CACHE_TTL = 3 * 60 * 1000; // 3 minutes (for authenticated users)
const COMMIT_CACHE_TTL_ANON = 30 * 60 * 1000; // 30 minutes (for anonymous users)
const CONTENT_CACHE_TTL = 3 * 60 * 1000; // 3 minutes (for authenticated users)
const CONTENT_CACHE_TTL_ANON = 8 * 60 * 1000; // 8 minutes (for anonymous users)

/**
 * GitHub Data Store
 * Centralized caching for GitHub API data with TTL-based invalidation
 *
 * Caches:
 * - Pull Requests (lists and detailed PR data)
 * - Branches (branch information)
 * - Permissions (user permission levels)
 * - Forks (fork status and information)
 */
export const useGitHubDataStore = create((set, get) => ({
  // ===== State =====

  // PR Data: { cacheKey: { data, cachedAt } }
  pullRequests: {},

  // Branch Data: { branchName: { data, cachedAt } }
  branches: {},

  // Permission Data: { owner/repo/username: { level, cachedAt } }
  // Note: Indexed by username because GitHub API requires username for permission checks
  // When username changes are detected, use invalidatePermissionsForUser() to clean up
  permissions: {},

  // User ID to username mapping for handling username changes
  // Format: { userId: currentUsername }
  userIdToUsername: {},

  // Fork Data: { owner/repo: { status, cachedAt } }
  forks: {},

  // Commit Data: { cacheKey: { data, cachedAt } }
  // Cache key format: owner/repo/path:page:perPage
  commits: {},

  // Star Contributor Data: { cacheKey: { data, cachedAt } }
  // Cache key format: owner/repo/sectionId/pageId
  starContributors: {},

  // Donator Status Data: { cacheKey: { data, cachedAt, cachingDisabled } }
  // Cache key format: owner/repo/userId
  donatorStatus: {},

  // File Content Data: { cacheKey: { data, cachedAt } }
  // Cache key format: owner/repo/path:branch
  fileContent: {},

  // Metrics for monitoring cache efficiency
  metrics: {
    cacheHits: 0,
    cacheMisses: 0,
    apiCalls: 0,
  },

  // Request throttling: track last PR list fetch time by cache key
  // Format: { cacheKey: timestamp }
  lastPRFetchTimes: {},

  // ===== Pull Request Cache Methods =====

  cachePR: (key, data) => {
    console.log(`[GitHub Cache] Caching PR data: ${key}`);
    set(state => ({
      pullRequests: {
        ...state.pullRequests,
        [key]: { data, cachedAt: Date.now() }
      }
    }));
  },

  /**
   * Get cached PR data
   * @param {string} key - Cache key
   * @param {boolean} isAuthenticated - Whether user is authenticated (affects TTL)
   * @returns {any|null} Cached data or null if expired/missing
   */
  getCachedPR: (key, isAuthenticated = false) => {
    const cached = get().pullRequests[key];

    if (!cached) {
      console.log(`[GitHub Cache] PR cache miss: ${key}`);
      set(state => ({
        metrics: {
          ...state.metrics,
          cacheMisses: state.metrics.cacheMisses + 1
        }
      }));
      return null;
    }

    // Use longer TTL for anonymous users (60 req/hr) vs authenticated (5000 req/hr)
    // Anonymous: 30min cache = max 2 fetches/hr
    // Authenticated: 10min cache = max 6 fetches/hr (still well within limits)
    const ttl = isAuthenticated ? CACHE_TTL : PR_CACHE_TTL;

    // Check if expired
    if (Date.now() - cached.cachedAt > ttl) {
      console.log(`[GitHub Cache] PR cache expired: ${key} (TTL: ${ttl / 60000}min)`);
      // Clean up expired cache
      set(state => {
        const newPRs = { ...state.pullRequests };
        delete newPRs[key];
        return {
          pullRequests: newPRs,
          metrics: {
            ...state.metrics,
            cacheMisses: state.metrics.cacheMisses + 1
          }
        };
      });
      return null;
    }

    console.log(`[GitHub Cache] PR cache hit: ${key} (TTL: ${ttl / 60000}min)`);
    set(state => ({
      metrics: {
        ...state.metrics,
        cacheHits: state.metrics.cacheHits + 1
      }
    }));
    return cached.data;
  },

  invalidatePRCache: (key) => {
    if (key) {
      console.log(`[GitHub Cache] Invalidating PR cache: ${key}`);
      set(state => {
        const newPRs = { ...state.pullRequests };
        delete newPRs[key];
        return { pullRequests: newPRs };
      });
    } else {
      console.log('[GitHub Cache] Invalidating ALL PR cache');
      set({ pullRequests: {} });
    }
  },

  invalidatePRsForUser: (username) => {
    console.log(`[GitHub Cache] Invalidating PRs for user: ${username}`);
    set(state => {
      const newPRs = {};
      Object.keys(state.pullRequests).forEach(key => {
        if (!key.includes(username)) {
          newPRs[key] = state.pullRequests[key];
        }
      });
      return { pullRequests: newPRs };
    });
  },

  // ===== Request Throttling Methods =====

  /**
   * Check if enough time has passed since last PR fetch
   * Returns true if request should be allowed
   */
  canFetchPRs: (key) => {
    const MIN_FETCH_INTERVAL = 5000; // 5 seconds minimum between fetches
    const lastFetch = get().lastPRFetchTimes[key];

    if (!lastFetch) {
      return true; // No previous fetch, allow
    }

    const timeSinceLastFetch = Date.now() - lastFetch;
    if (timeSinceLastFetch < MIN_FETCH_INTERVAL) {
      console.log(`[GitHub Cache] Throttling PR fetch for ${key} (${timeSinceLastFetch}ms < ${MIN_FETCH_INTERVAL}ms)`);
      return false;
    }

    return true;
  },

  /**
   * Record that a PR fetch was made
   */
  recordPRFetch: (key) => {
    set(state => ({
      lastPRFetchTimes: {
        ...state.lastPRFetchTimes,
        [key]: Date.now()
      }
    }));
  },

  // ===== Branch Cache Methods =====

  cacheBranch: (key, data) => {
    console.log(`[GitHub Cache] Caching branch data: ${key}`);
    set(state => ({
      branches: {
        ...state.branches,
        [key]: { data, cachedAt: Date.now() }
      }
    }));
  },

  getCachedBranch: (key) => {
    const cached = get().branches[key];

    if (!cached) {
      console.log(`[GitHub Cache] Branch cache miss: ${key}`);
      set(state => ({
        metrics: {
          ...state.metrics,
          cacheMisses: state.metrics.cacheMisses + 1
        }
      }));
      return null;
    }

    // Check if expired
    if (Date.now() - cached.cachedAt > CACHE_TTL) {
      console.log(`[GitHub Cache] Branch cache expired: ${key}`);
      set(state => {
        const newBranches = { ...state.branches };
        delete newBranches[key];
        return {
          branches: newBranches,
          metrics: {
            ...state.metrics,
            cacheMisses: state.metrics.cacheMisses + 1
          }
        };
      });
      return null;
    }

    console.log(`[GitHub Cache] Branch cache hit: ${key}`);
    set(state => ({
      metrics: {
        ...state.metrics,
        cacheHits: state.metrics.cacheHits + 1
      }
    }));
    return cached.data;
  },

  invalidateBranchCache: (key) => {
    if (key) {
      console.log(`[GitHub Cache] Invalidating branch cache: ${key}`);
      set(state => {
        const newBranches = { ...state.branches };
        delete newBranches[key];
        return { branches: newBranches };
      });
    } else {
      console.log('[GitHub Cache] Invalidating ALL branch cache');
      set({ branches: {} });
    }
  },

  // ===== Permission Cache Methods =====

  cachePermission: (key, level) => {
    console.log(`[GitHub Cache] Caching permission: ${key} = ${level}`);
    set(state => ({
      permissions: {
        ...state.permissions,
        [key]: { level, cachedAt: Date.now() }
      }
    }));
  },

  getCachedPermission: (key) => {
    const cached = get().permissions[key];

    if (!cached) {
      console.log(`[GitHub Cache] Permission cache miss: ${key}`);
      set(state => ({
        metrics: {
          ...state.metrics,
          cacheMisses: state.metrics.cacheMisses + 1
        }
      }));
      return null;
    }

    // Check if expired
    if (Date.now() - cached.cachedAt > CACHE_TTL) {
      console.log(`[GitHub Cache] Permission cache expired: ${key}`);
      set(state => {
        const newPermissions = { ...state.permissions };
        delete newPermissions[key];
        return {
          permissions: newPermissions,
          metrics: {
            ...state.metrics,
            cacheMisses: state.metrics.cacheMisses + 1
          }
        };
      });
      return null;
    }

    console.log(`[GitHub Cache] Permission cache hit: ${key}`);
    set(state => ({
      metrics: {
        ...state.metrics,
        cacheHits: state.metrics.cacheHits + 1
      }
    }));
    return cached.level;
  },

  invalidatePermissionCache: (key) => {
    if (key) {
      console.log(`[GitHub Cache] Invalidating permission cache: ${key}`);
      set(state => {
        const newPermissions = { ...state.permissions };
        delete newPermissions[key];
        return { permissions: newPermissions };
      });
    } else {
      console.log('[GitHub Cache] Invalidating ALL permission cache');
      set({ permissions: {} });
    }
  },

  // Handle username changes: invalidate old cache entries and update mapping
  handleUsernameChange: (userId, oldUsername, newUsername) => {
    console.log(`[GitHub Cache] Username changed for user ID ${userId}: ${oldUsername} → ${newUsername}`);

    set(state => {
      const newPermissions = {};
      const newPRs = {};

      // Invalidate old permission cache entries
      Object.keys(state.permissions).forEach(key => {
        // If key contains old username, don't copy it (invalidate)
        if (key.includes(`/${oldUsername}`)) {
          console.log(`[GitHub Cache] Invalidating old permission entry: ${key}`);
        } else {
          newPermissions[key] = state.permissions[key];
        }
      });

      // Invalidate old PR cache entries
      Object.keys(state.pullRequests).forEach(key => {
        // If key contains old username, don't copy it (invalidate)
        if (key.includes(`/user/${oldUsername}`)) {
          console.log(`[GitHub Cache] Invalidating old PR cache entry: ${key}`);
        } else {
          newPRs[key] = state.pullRequests[key];
        }
      });

      // Update user ID to username mapping
      const newMapping = { ...state.userIdToUsername };
      newMapping[userId] = newUsername;

      return {
        permissions: newPermissions,
        pullRequests: newPRs,
        userIdToUsername: newMapping
      };
    });
  },

  // Track user ID to username mapping (helps detect username changes)
  updateUserMapping: (userId, username) => {
    const currentMapping = get().userIdToUsername[userId];

    // Detect username change
    if (currentMapping && currentMapping !== username) {
      console.log(`[GitHub Cache] Detected username change for ID ${userId}: ${currentMapping} → ${username}`);
      get().handleUsernameChange(userId, currentMapping, username);
    } else {
      // Just update mapping
      set(state => ({
        userIdToUsername: {
          ...state.userIdToUsername,
          [userId]: username
        }
      }));
    }
  },

  // ===== Fork Cache Methods =====

  cacheFork: (key, data) => {
    console.log(`[GitHub Cache] Caching fork data: ${key}`);
    set(state => ({
      forks: {
        ...state.forks,
        [key]: { data, cachedAt: Date.now() }
      }
    }));
  },

  getCachedFork: (key) => {
    const cached = get().forks[key];

    if (!cached) {
      console.log(`[GitHub Cache] Fork cache miss: ${key}`);
      set(state => ({
        metrics: {
          ...state.metrics,
          cacheMisses: state.metrics.cacheMisses + 1
        }
      }));
      return null;
    }

    // Check if expired (forks have longer TTL - 30 minutes)
    const FORK_TTL = 30 * 60 * 1000;
    if (Date.now() - cached.cachedAt > FORK_TTL) {
      console.log(`[GitHub Cache] Fork cache expired: ${key}`);
      set(state => {
        const newForks = { ...state.forks };
        delete newForks[key];
        return {
          forks: newForks,
          metrics: {
            ...state.metrics,
            cacheMisses: state.metrics.cacheMisses + 1
          }
        };
      });
      return null;
    }

    console.log(`[GitHub Cache] Fork cache hit: ${key}`);
    set(state => ({
      metrics: {
        ...state.metrics,
        cacheHits: state.metrics.cacheHits + 1
      }
    }));
    return cached.data;
  },

  invalidateForkCache: (key) => {
    if (key) {
      console.log(`[GitHub Cache] Invalidating fork cache: ${key}`);
      set(state => {
        const newForks = { ...state.forks };
        delete newForks[key];
        return { forks: newForks };
      });
    } else {
      console.log('[GitHub Cache] Invalidating ALL fork cache');
      set({ forks: {} });
    }
  },

  // ===== Commit Cache Methods =====

  cacheCommits: (key, data) => {
    console.log(`[GitHub Cache] Caching commits data: ${key}`);
    set(state => ({
      commits: {
        ...state.commits,
        [key]: { data, cachedAt: Date.now() }
      }
    }));
  },

  /**
   * Get cached commit data
   * @param {string} key - Cache key (format: owner/repo/path:page:perPage)
   * @param {boolean} isAuthenticated - Whether user is authenticated (affects TTL)
   * @returns {any|null} Cached data or null if expired/missing
   */
  getCachedCommits: (key, isAuthenticated = false) => {
    const cached = get().commits[key];

    if (!cached) {
      console.log(`[GitHub Cache] Commits cache miss: ${key}`);
      set(state => ({
        metrics: {
          ...state.metrics,
          cacheMisses: state.metrics.cacheMisses + 1
        }
      }));
      return null;
    }

    // Use longer TTL for anonymous users (60 req/hr) vs authenticated (5000 req/hr)
    // Anonymous: 30min cache = max 2 fetches/hr per file
    // Authenticated: 3min cache = max 20 fetches/hr per file (still well within 5000 limit)
    const ttl = isAuthenticated ? COMMIT_CACHE_TTL : COMMIT_CACHE_TTL_ANON;

    // Check if expired
    if (Date.now() - cached.cachedAt > ttl) {
      console.log(`[GitHub Cache] Commits cache expired: ${key} (TTL: ${ttl / 60000}min)`);
      // Clean up expired cache
      set(state => {
        const newCommits = { ...state.commits };
        delete newCommits[key];
        return {
          commits: newCommits,
          metrics: {
            ...state.metrics,
            cacheMisses: state.metrics.cacheMisses + 1
          }
        };
      });
      return null;
    }

    console.log(`[GitHub Cache] Commits cache hit: ${key} (TTL: ${ttl / 60000}min)`);
    set(state => ({
      metrics: {
        ...state.metrics,
        cacheHits: state.metrics.cacheHits + 1
      }
    }));
    return cached.data;
  },

  invalidateCommitsCache: (key) => {
    if (key) {
      console.log(`[GitHub Cache] Invalidating commits cache: ${key}`);
      set(state => {
        const newCommits = { ...state.commits };
        delete newCommits[key];
        return { commits: newCommits };
      });
    } else {
      console.log('[GitHub Cache] Invalidating ALL commits cache');
      set({ commits: {} });
    }
  },

  // ===== File Content Cache Methods =====

  cacheFileContent: (key, data) => {
    console.log(`[GitHub Cache] Caching file content: ${key}`);
    set(state => ({
      fileContent: {
        ...state.fileContent,
        [key]: { data, cachedAt: Date.now() }
      }
    }));
  },

  /**
   * Get cached file content data
   * @param {string} key - Cache key (format: owner/repo/path:branch)
   * @param {boolean} isAuthenticated - Whether user is authenticated (affects TTL)
   * @returns {any|null} Cached data or null if expired/missing
   */
  getCachedFileContent: (key, isAuthenticated = false) => {
    const cached = get().fileContent[key];

    if (!cached) {
      console.log(`[GitHub Cache] File content cache miss: ${key}`);
      set(state => ({
        metrics: {
          ...state.metrics,
          cacheMisses: state.metrics.cacheMisses + 1
        }
      }));
      return null;
    }

    // Use longer TTL for anonymous users (60 req/hr) vs authenticated (5000 req/hr)
    // Anonymous: 8min cache to reduce API calls
    // Authenticated: 3min cache for fresher content
    const ttl = isAuthenticated ? CONTENT_CACHE_TTL : CONTENT_CACHE_TTL_ANON;

    // Check if expired
    if (Date.now() - cached.cachedAt > ttl) {
      console.log(`[GitHub Cache] File content cache expired: ${key} (TTL: ${ttl / 60000}min)`);
      // Clean up expired cache
      set(state => {
        const newFileContent = { ...state.fileContent };
        delete newFileContent[key];
        return {
          fileContent: newFileContent,
          metrics: {
            ...state.metrics,
            cacheMisses: state.metrics.cacheMisses + 1
          }
        };
      });
      return null;
    }

    console.log(`[GitHub Cache] File content cache hit: ${key} (TTL: ${ttl / 60000}min)`);
    set(state => ({
      metrics: {
        ...state.metrics,
        cacheHits: state.metrics.cacheHits + 1
      }
    }));
    return cached.data;
  },

  invalidateFileContentCache: (key) => {
    if (key) {
      console.log(`[GitHub Cache] Invalidating file content cache: ${key}`);
      set(state => {
        const newFileContent = { ...state.fileContent };
        delete newFileContent[key];
        return { fileContent: newFileContent };
      });
    } else {
      console.log('[GitHub Cache] Invalidating ALL file content cache');
      set({ fileContent: {} });
    }
  },

  // ===== Star Contributor Cache Methods =====

  cacheStarContributor: (key, data) => {
    console.log(`[GitHub Cache] Caching star contributor data: ${key}`);
    set(state => ({
      starContributors: {
        ...state.starContributors,
        [key]: { data, cachedAt: Date.now() }
      }
    }));
  },

  /**
   * Get cached star contributor data
   * @param {string} key - Cache key (format: owner/repo/sectionId/pageId)
   * @param {boolean} isAuthenticated - Whether user is authenticated (affects TTL)
   * @returns {any|null} Cached data or null if expired/missing
   */
  getCachedStarContributor: (key, isAuthenticated = false) => {
    const cached = get().starContributors[key];

    if (!cached) {
      console.log(`[GitHub Cache] Star contributor cache miss: ${key}`);
      set(state => ({
        metrics: {
          ...state.metrics,
          cacheMisses: state.metrics.cacheMisses + 1
        }
      }));
      return null;
    }

    // Use longer TTL for anonymous users
    // Anonymous: 10min cache
    // Authenticated: 5min cache
    const STAR_CONTRIBUTOR_TTL = isAuthenticated ? 5 * 60 * 1000 : 10 * 60 * 1000;
    const ttl = STAR_CONTRIBUTOR_TTL;

    // Check if expired
    if (Date.now() - cached.cachedAt > ttl) {
      console.log(`[GitHub Cache] Star contributor cache expired: ${key} (TTL: ${ttl / 60000}min)`);
      // Clean up expired cache
      set(state => {
        const newStarContributors = { ...state.starContributors };
        delete newStarContributors[key];
        return {
          starContributors: newStarContributors,
          metrics: {
            ...state.metrics,
            cacheMisses: state.metrics.cacheMisses + 1
          }
        };
      });
      return null;
    }

    console.log(`[GitHub Cache] Star contributor cache hit: ${key} (TTL: ${ttl / 60000}min)`);
    set(state => ({
      metrics: {
        ...state.metrics,
        cacheHits: state.metrics.cacheHits + 1
      }
    }));
    return cached.data;
  },

  invalidateStarContributorCache: (key) => {
    if (key) {
      console.log(`[GitHub Cache] Invalidating star contributor cache: ${key}`);
      set(state => {
        const newStarContributors = { ...state.starContributors };
        delete newStarContributors[key];
        return { starContributors: newStarContributors };
      });
    } else {
      console.log('[GitHub Cache] Invalidating ALL star contributor cache');
      set({ starContributors: {} });
    }
  },

  // ===== Donator Status Cache Methods =====

  cacheDonatorStatus: (key, data) => {
    console.log(`[GitHub Cache] Caching donator status: ${key}`);
    set(state => ({
      donatorStatus: {
        ...state.donatorStatus,
        [key]: { data, cachedAt: Date.now(), cachingDisabled: false }
      }
    }));
  },

  /**
   * Get cached donator status
   * @param {string} key - Cache key (format: owner/repo/userId)
   * @param {boolean} isAuthenticated - Whether user is authenticated (affects TTL)
   * @returns {any|null} Cached data or null if expired/missing/disabled
   */
  getCachedDonatorStatus: (key, isAuthenticated = false) => {
    const cached = get().donatorStatus[key];

    if (!cached) {
      console.log(`[GitHub Cache] Donator status cache miss: ${key}`);
      set(state => ({
        metrics: {
          ...state.metrics,
          cacheMisses: state.metrics.cacheMisses + 1
        }
      }));
      return null;
    }

    // Check if caching is temporarily disabled (after donation)
    if (cached.cachingDisabled && Date.now() - cached.cachedAt < 5 * 60 * 1000) {
      console.log(`[GitHub Cache] Donator status caching disabled: ${key} (${Math.round((5 * 60 * 1000 - (Date.now() - cached.cachedAt)) / 1000)}s remaining)`);
      return null;
    }

    // Re-enable caching after 5 minutes
    if (cached.cachingDisabled && Date.now() - cached.cachedAt >= 5 * 60 * 1000) {
      console.log(`[GitHub Cache] Re-enabling donator status caching: ${key}`);
      set(state => ({
        donatorStatus: {
          ...state.donatorStatus,
          [key]: { ...cached, cachingDisabled: false }
        }
      }));
    }

    // Use longer TTL for anonymous users
    // Anonymous: 30min cache
    // Authenticated: 10min cache
    const DONATOR_STATUS_TTL = isAuthenticated ? 10 * 60 * 1000 : 30 * 60 * 1000;
    const ttl = DONATOR_STATUS_TTL;

    // Check if expired
    if (Date.now() - cached.cachedAt > ttl) {
      console.log(`[GitHub Cache] Donator status cache expired: ${key} (TTL: ${ttl / 60000}min)`);
      // Clean up expired cache
      set(state => {
        const newDonatorStatus = { ...state.donatorStatus };
        delete newDonatorStatus[key];
        return {
          donatorStatus: newDonatorStatus,
          metrics: {
            ...state.metrics,
            cacheMisses: state.metrics.cacheMisses + 1
          }
        };
      });
      return null;
    }

    console.log(`[GitHub Cache] Donator status cache hit: ${key} (TTL: ${ttl / 60000}min)`);
    set(state => ({
      metrics: {
        ...state.metrics,
        cacheHits: state.metrics.cacheHits + 1
      }
    }));
    return cached.data;
  },

  invalidateDonatorStatusCache: (key) => {
    if (key) {
      console.log(`[GitHub Cache] Invalidating donator status cache: ${key}`);
      set(state => {
        const newDonatorStatus = { ...state.donatorStatus };
        delete newDonatorStatus[key];
        return { donatorStatus: newDonatorStatus };
      });
    } else {
      console.log('[GitHub Cache] Invalidating ALL donator status cache');
      set({ donatorStatus: {} });
    }
  },

  /**
   * Invalidate donator status cache and disable caching for 5 minutes
   * Call this after a successful donation to allow badge state to update
   * @param {string} key - Cache key (format: owner/repo/userId)
   */
  invalidateDonatorStatusAndDisable: (key) => {
    console.log(`[GitHub Cache] Invalidating donator status and disabling caching for 5 minutes: ${key}`);
    set(state => ({
      donatorStatus: {
        ...state.donatorStatus,
        [key]: { data: null, cachedAt: Date.now(), cachingDisabled: true }
      }
    }));
  },

  // ===== Global Cache Methods =====

  invalidateAll: () => {
    console.log('[GitHub Cache] Invalidating ALL caches');
    set({
      pullRequests: {},
      branches: {},
      permissions: {},
      forks: {},
      commits: {},
      starContributors: {},
      donatorStatus: {},
    });
  },

  // Clean up expired entries across all caches
  cleanupExpired: () => {
    console.log('[GitHub Cache] Running cleanup of expired entries');
    const now = Date.now();

    set(state => {
      // Clean PRs (use longest TTL to be safe - anonymous user cache)
      const newPRs = {};
      Object.entries(state.pullRequests).forEach(([key, value]) => {
        if (now - value.cachedAt <= PR_CACHE_TTL) {
          newPRs[key] = value;
        }
      });

      // Clean branches
      const newBranches = {};
      Object.entries(state.branches).forEach(([key, value]) => {
        if (now - value.cachedAt <= CACHE_TTL) {
          newBranches[key] = value;
        }
      });

      // Clean permissions
      const newPermissions = {};
      Object.entries(state.permissions).forEach(([key, value]) => {
        if (now - value.cachedAt <= CACHE_TTL) {
          newPermissions[key] = value;
        }
      });

      // Clean forks (30 minute TTL)
      const FORK_TTL = 30 * 60 * 1000;
      const newForks = {};
      Object.entries(state.forks).forEach(([key, value]) => {
        if (now - value.cachedAt <= FORK_TTL) {
          newForks[key] = value;
        }
      });

      // Clean commits (use longest TTL to be safe - anonymous user cache)
      const newCommits = {};
      Object.entries(state.commits).forEach(([key, value]) => {
        if (now - value.cachedAt <= COMMIT_CACHE_TTL_ANON) {
          newCommits[key] = value;
        }
      });

      // Clean star contributors (10 minute TTL - anonymous user cache)
      const STAR_CONTRIBUTOR_TTL_ANON = 10 * 60 * 1000;
      const newStarContributors = {};
      Object.entries(state.starContributors).forEach(([key, value]) => {
        if (now - value.cachedAt <= STAR_CONTRIBUTOR_TTL_ANON) {
          newStarContributors[key] = value;
        }
      });

      // Clean donator status (30 minute TTL - anonymous user cache)
      const DONATOR_STATUS_TTL_ANON = 30 * 60 * 1000;
      const newDonatorStatus = {};
      Object.entries(state.donatorStatus).forEach(([key, value]) => {
        // Keep entries with caching disabled (they have their own 5-minute timer)
        if (value.cachingDisabled || now - value.cachedAt <= DONATOR_STATUS_TTL_ANON) {
          newDonatorStatus[key] = value;
        }
      });

      return {
        pullRequests: newPRs,
        branches: newBranches,
        permissions: newPermissions,
        forks: newForks,
        commits: newCommits,
        starContributors: newStarContributors,
        donatorStatus: newDonatorStatus,
      };
    });
  },

  // ===== Metrics Methods =====

  incrementAPICall: (count = 1) => {
    set(state => ({
      metrics: {
        ...state.metrics,
        apiCalls: state.metrics.apiCalls + count
      }
    }));
  },

  getMetrics: () => {
    const state = get();
    const hits = state.metrics.cacheHits;
    const misses = state.metrics.cacheMisses;
    const total = hits + misses;
    const hitRate = total > 0 ? ((hits / total) * 100).toFixed(1) : 0;

    return {
      ...state.metrics,
      total,
      hitRate: `${hitRate}%`
    };
  },

  resetMetrics: () => {
    console.log('[GitHub Cache] Resetting metrics');
    set({
      metrics: {
        cacheHits: 0,
        cacheMisses: 0,
        apiCalls: 0,
      }
    });
  },

  // ===== Debug Methods =====

  getCacheStats: () => {
    const state = get();
    return {
      pullRequests: Object.keys(state.pullRequests).length,
      branches: Object.keys(state.branches).length,
      permissions: Object.keys(state.permissions).length,
      forks: Object.keys(state.forks).length,
      commits: Object.keys(state.commits).length,
      starContributors: Object.keys(state.starContributors).length,
      donatorStatus: Object.keys(state.donatorStatus).length,
      metrics: get().getMetrics(),
    };
  },
}));

// Auto-cleanup expired entries every 5 minutes
if (typeof window !== 'undefined') {
  setInterval(() => {
    useGitHubDataStore.getState().cleanupExpired();
  }, 5 * 60 * 1000);
}
