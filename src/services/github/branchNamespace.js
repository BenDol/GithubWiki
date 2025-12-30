/**
 * Branch Namespace Service
 * Detects current git branch and provides branch-based isolation
 */

let cachedBranch = null;

/**
 * Detect current git branch at runtime
 * @param {Object} config - Wiki configuration
 * @returns {Promise<string>} The current branch name
 */
export async function detectCurrentBranch(config) {
  // Return cached value if available
  if (cachedBranch) {
    return cachedBranch;
  }

  const namespaceConfig = config?.wiki?.repository?.namespaces;

  // Feature disabled - use static config
  if (!namespaceConfig?.enabled) {
    cachedBranch = config.wiki.repository.branch;
    console.log(`[Branch] Namespaces disabled, using static config: ${cachedBranch}`);
    return cachedBranch;
  }

  const allowedBranches = namespaceConfig.allowedBranches || [];
  const defaultBranch = namespaceConfig.defaultBranch || 'main';

  // Try runtime detection
  try {
    // Development mode - try dev server API endpoint
    const isDev = typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
    if (isDev) {
      try {
        const response = await fetch('/api/git-branch');
        if (response.ok) {
          const data = await response.json();
          if (data.branch && validateBranch(data.branch, allowedBranches)) {
            cachedBranch = data.branch;
            console.log(`[Branch] Detected from dev server: ${cachedBranch}`);
            return cachedBranch;
          } else if (data.branch) {
            console.warn(`[Branch] "${data.branch}" not in allowed branches, using default: ${defaultBranch}`);
          }
        }
      } catch (devError) {
        console.warn('[Branch] Dev server detection failed:', devError.message);
      }
    }

    // Production mode - try build-time embedded file
    try {
      const baseUrl = typeof import.meta !== 'undefined' && import.meta.env
        ? import.meta.env.BASE_URL
        : '/';
      const response = await fetch(`${baseUrl}runtime-branch.json`);
      if (response.ok) {
        const data = await response.json();
        if (data.branch && validateBranch(data.branch, allowedBranches)) {
          cachedBranch = data.branch;
          console.log(`[Branch] Detected from build-time: ${cachedBranch} (${data.detectedAt})`);
          return cachedBranch;
        } else if (data.branch) {
          console.warn(`[Branch] "${data.branch}" not in allowed branches, using default: ${defaultBranch}`);
        }
      }
    } catch (prodError) {
      console.warn('[Branch] Build-time detection failed:', prodError.message);
    }
  } catch (error) {
    console.error('[Branch] Detection failed:', error);
  }

  // Fallback to default branch
  cachedBranch = defaultBranch;
  console.warn(`[Branch] Using default fallback: ${cachedBranch}`);
  return cachedBranch;
}

/**
 * Validate that branch is in the allowed list
 * @param {string} branch - Branch name to validate
 * @param {string[]} allowedBranches - List of allowed branches
 * @returns {boolean} True if branch is allowed
 */
export function validateBranch(branch, allowedBranches) {
  // If no restrictions, all branches are allowed
  if (!allowedBranches || allowedBranches.length === 0) {
    return true;
  }

  const isAllowed = allowedBranches.includes(branch);

  if (!isAllowed) {
    console.warn(`[Branch] "${branch}" is not in allowed branches: [${allowedBranches.join(', ')}]`);
  }

  return isAllowed;
}

/**
 * Get GitHub label for the branch
 * @param {string} branch - Branch name
 * @returns {string} Label in format "branch:xxx"
 */
export function getBranchLabel(branch) {
  return `branch:${branch}`;
}

/**
 * Clear cached branch (useful for testing)
 */
export function clearBranchCache() {
  cachedBranch = null;
  console.log('[Branch] Cache cleared');
}

/**
 * Get current branch synchronously (requires cache to be populated)
 * @returns {string|null} Cached branch or null
 */
export function getCurrentBranch() {
  return cachedBranch;
}
