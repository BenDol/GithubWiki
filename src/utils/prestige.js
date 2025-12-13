/**
 * Prestige system utilities
 * Calculates user prestige based on contributions
 */

/**
 * Get user's prestige tier based on their statistics
 * @param {Object} stats - User contribution statistics
 * @param {Array} tiers - Prestige tier configuration from wiki-config
 * @returns {Object} The prestige tier object
 */
export const getPrestigeTier = (stats, tiers) => {
  if (!tiers || tiers.length === 0) {
    return null;
  }

  // Calculate contribution score
  // Weight: merged PRs are worth more than open/closed
  const score =
    (stats.mergedPRs * 3) +  // Merged PRs worth 3x
    (stats.openPRs * 1) +     // Open PRs worth 1x
    (stats.closedPRs * 0.5);  // Closed PRs worth 0.5x

  // Sort tiers by minContributions descending
  const sortedTiers = [...tiers].sort((a, b) => b.minContributions - a.minContributions);

  // Find the highest tier the user qualifies for
  for (const tier of sortedTiers) {
    if (score >= tier.minContributions) {
      return tier;
    }
  }

  // Return the lowest tier if nothing matches
  return tiers[0];
};

/**
 * Get progress to next tier
 * @param {Object} stats - User contribution statistics
 * @param {Object} currentTier - Current prestige tier
 * @param {Array} tiers - All prestige tiers
 * @returns {Object} Progress information { nextTier, current, required, percentage }
 */
export const getProgressToNextTier = (stats, currentTier, tiers) => {
  if (!tiers || !currentTier) {
    return null;
  }

  // Calculate current score
  const score =
    (stats.mergedPRs * 3) +
    (stats.openPRs * 1) +
    (stats.closedPRs * 0.5);

  // Find next tier
  const sortedTiers = [...tiers].sort((a, b) => a.minContributions - b.minContributions);
  const currentIndex = sortedTiers.findIndex(t => t.id === currentTier.id);

  if (currentIndex === -1 || currentIndex === sortedTiers.length - 1) {
    // Already at max tier
    return null;
  }

  const nextTier = sortedTiers[currentIndex + 1];
  const required = nextTier.minContributions - currentTier.minContributions;
  const current = score - currentTier.minContributions;
  const percentage = Math.min(100, Math.round((current / required) * 100));

  return {
    nextTier,
    current,
    required,
    percentage,
  };
};

/**
 * Format prestige title with badge emoji
 * @param {Object} tier - Prestige tier object
 * @returns {String} Formatted title with emoji
 */
export const formatPrestigeTitle = (tier) => {
  if (!tier) return '';
  return `${tier.badge} ${tier.title}`;
};
