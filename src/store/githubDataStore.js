import { create } from 'zustand';

const CACHE_TTL = 10 * 60 * 1000; // 10 minutes

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

  // Permission Data: { username: { level, cachedAt } }
  permissions: {},

  // Fork Data: { owner/repo: { status, cachedAt } }
  forks: {},

  // Metrics for monitoring cache efficiency
  metrics: {
    cacheHits: 0,
    cacheMisses: 0,
    apiCalls: 0,
  },

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

  getCachedPR: (key) => {
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

    // Check if expired
    if (Date.now() - cached.cachedAt > CACHE_TTL) {
      console.log(`[GitHub Cache] PR cache expired: ${key}`);
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

    console.log(`[GitHub Cache] PR cache hit: ${key}`);
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

  // ===== Global Cache Methods =====

  invalidateAll: () => {
    console.log('[GitHub Cache] Invalidating ALL caches');
    set({
      pullRequests: {},
      branches: {},
      permissions: {},
      forks: {},
    });
  },

  // Clean up expired entries across all caches
  cleanupExpired: () => {
    console.log('[GitHub Cache] Running cleanup of expired entries');
    const now = Date.now();

    set(state => {
      // Clean PRs
      const newPRs = {};
      Object.entries(state.pullRequests).forEach(([key, value]) => {
        if (now - value.cachedAt <= CACHE_TTL) {
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

      return {
        pullRequests: newPRs,
        branches: newBranches,
        permissions: newPermissions,
        forks: newForks,
      };
    });
  },

  // ===== Metrics Methods =====

  incrementAPICall: () => {
    set(state => ({
      metrics: {
        ...state.metrics,
        apiCalls: state.metrics.apiCalls + 1
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
