/**
 * Contribution Achievement Deciders
 * Deciders for PR and contribution-based achievements
 */

/**
 * First Edit - User made their first wiki edit (same as first PR)
 */
export async function firstEdit(userData, context) {
  return userData.stats?.totalPRs > 0;
}

/**
 * First PR - User created their first pull request
 */
export async function firstPr(userData, context) {
  return userData.stats?.totalPRs > 0;
}

/**
 * PR Novice - User created 10+ pull requests
 */
export async function prNovice(userData, context) {
  return userData.stats?.totalPRs >= 10;
}

/**
 * PR Expert - User created 50+ pull requests
 */
export async function prExpert(userData, context) {
  return userData.stats?.totalPRs >= 50;
}

/**
 * PR Master - User created 100+ pull requests
 */
export async function prMaster(userData, context) {
  return userData.stats?.totalPRs >= 100;
}

/**
 * PR Legend - User created 500+ pull requests
 */
export async function prLegend(userData, context) {
  return userData.stats?.totalPRs >= 500;
}

/**
 * First Merge - User had their first PR merged
 */
export async function firstMerge(userData, context) {
  return userData.stats?.mergedPRs > 0;
}

/**
 * Merge Novice - User had 10+ PRs merged
 */
export async function mergeNovice(userData, context) {
  return userData.stats?.mergedPRs >= 10;
}

/**
 * Merge Expert - User had 50+ PRs merged
 */
export async function mergeExpert(userData, context) {
  return userData.stats?.mergedPRs >= 50;
}

/**
 * Merge Master - User had 100+ PRs merged
 */
export async function mergeMaster(userData, context) {
  return userData.stats?.mergedPRs >= 100;
}

/**
 * Lines Apprentice - User added 100+ lines of code
 */
export async function linesApprentice(userData, context) {
  return userData.stats?.totalAdditions >= 100;
}

/**
 * Lines Journeyman - User added 1,000+ lines of code
 */
export async function linesJourneyman(userData, context) {
  return userData.stats?.totalAdditions >= 1000;
}

/**
 * Lines Master - User added 10,000+ lines of code
 */
export async function linesMaster(userData, context) {
  return userData.stats?.totalAdditions >= 10000;
}

/**
 * Lines Legend - User added 100,000+ lines of code
 */
export async function linesLegend(userData, context) {
  return userData.stats?.totalAdditions >= 100000;
}

/**
 * Files Novice - User edited 10+ different files
 */
export async function filesNovice(userData, context) {
  return userData.stats?.totalFiles >= 10;
}

/**
 * Files Expert - User edited 100+ different files
 */
export async function filesExpert(userData, context) {
  return userData.stats?.totalFiles >= 100;
}

/**
 * Files Master - User edited 1,000+ different files
 */
export async function filesMaster(userData, context) {
  return userData.stats?.totalFiles >= 1000;
}

/**
 * Anonymous Contributor - User has linked anonymous contributions
 */
export async function anonymousContributor(userData, context) {
  const { octokit, owner, repo, userId } = context;

  try {
    // Check if user has any PRs with 'anonymous-edit' and user-id labels
    const { data: prs } = await octokit.rest.pulls.list({
      owner,
      repo,
      state: 'all',
      per_page: 1,
    });

    // Filter for PRs with both labels
    for (const pr of prs) {
      const labels = pr.labels.map(l => l.name);
      if (labels.includes('anonymous-edit') && labels.includes(`user-id:${userId}`)) {
        return true;
      }
    }

    return false;
  } catch (error) {
    console.error('Failed to check anonymous contributions:', error);
    return false;
  }
}

/**
 * Prolific Editor - User edited 10+ different pages/topics
 */
export async function prolificEditor(userData, context) {
  // Count unique file paths from PRs
  if (!userData.pullRequests || userData.pullRequests.length === 0) {
    return false;
  }

  const uniqueFiles = new Set();

  for (const pr of userData.pullRequests) {
    if (pr.files) {
      for (const file of pr.files) {
        uniqueFiles.add(file.filename);
      }
    }
  }

  return uniqueFiles.size >= 10;
}

/**
 * First PR Closed - User had their first PR closed (not merged)
 */
export async function firstPrClosed(userData, context) {
  return userData.stats?.closedPRs > 0;
}
