/**
 * Prestige system utilities
 * Calculates user prestige based on contributions
 */

/**
 * Get user's prestige tier based on their statistics
 * @param {Object} stats - User contribution statistics
 * @param {Array} tiers - Prestige tier configuration from wiki-config
 * @param {string} username - Username to check (optional)
 * @param {string} repoOwner - Repository owner username (optional)
 * @returns {Object} The prestige tier object
 */
export const getPrestigeTier = (stats, tiers, username = null, repoOwner = null) => {
  if (!tiers || tiers.length === 0) {
    return null;
  }

  // Check if user is the repository owner - assign owner tier if it exists
  if (username && repoOwner && username === repoOwner) {
    const ownerTier = tiers.find(tier => tier.id === 'owner');
    if (ownerTier) {
      console.log(`[Prestige] User ${username} is repository owner, assigning owner tier`);
      return ownerTier;
    }
  }

  // Calculate contribution score based on line changes only
  // Additions are heavily weighted as they represent new content creation
  // Deletions are lightly weighted as they represent cleanup/maintenance
  const additions = stats.totalAdditions || 0;
  const deletions = stats.totalDeletions || 0;

  const score =
    (additions * 10) +  // Additions worth 10x (new content)
    (deletions * 1);     // Deletions worth 1x (cleanup)

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

  // Calculate current score based on line changes only
  const additions = stats.totalAdditions || 0;
  const deletions = stats.totalDeletions || 0;

  const score =
    (additions * 10) +  // Additions worth 10x (new content)
    (deletions * 1);     // Deletions worth 1x (cleanup)

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
