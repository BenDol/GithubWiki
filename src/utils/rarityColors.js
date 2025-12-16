/**
 * Centralized rarity color configuration for skills and equipment
 * Provides consistent color schemes across the application
 */

/**
 * Skill grade colors
 * Used for skill cards and selectors
 */
export const SKILL_GRADE_COLORS = {
  Common: {
    name: 'Common',
    background: 'bg-gray-500',
    border: 'border-gray-500',
    glow: 'shadow-[0_0_10px_rgba(107,114,128,0.5)] dark:shadow-[0_0_10px_rgba(156,163,175,0.5)]',
    glowHover: 'hover:shadow-[0_0_15px_rgba(107,114,128,0.7)] dark:hover:shadow-[0_0_15px_rgba(156,163,175,0.7)]',
  },
  Great: {
    name: 'Great',
    background: 'bg-green-500',
    border: 'border-green-500',
    glow: 'shadow-[0_0_10px_rgba(34,197,94,0.5)] dark:shadow-[0_0_10px_rgba(74,222,128,0.5)]',
    glowHover: 'hover:shadow-[0_0_15px_rgba(34,197,94,0.7)] dark:hover:shadow-[0_0_15px_rgba(74,222,128,0.7)]',
  },
  Rare: {
    name: 'Rare',
    background: 'bg-orange-500',
    border: 'border-orange-500',
    glow: 'shadow-[0_0_10px_rgba(249,115,22,0.5)] dark:shadow-[0_0_10px_rgba(251,146,60,0.5)]',
    glowHover: 'hover:shadow-[0_0_15px_rgba(249,115,22,0.7)] dark:hover:shadow-[0_0_15px_rgba(251,146,60,0.7)]',
  },
  Epic: {
    name: 'Epic',
    background: 'bg-purple-500',
    border: 'border-purple-500',
    glow: 'shadow-[0_0_10px_rgba(168,85,247,0.5)] dark:shadow-[0_0_10px_rgba(192,132,252,0.5)]',
    glowHover: 'hover:shadow-[0_0_15px_rgba(168,85,247,0.7)] dark:hover:shadow-[0_0_15px_rgba(192,132,252,0.7)]',
  },
  Legendary: {
    name: 'Legendary',
    background: 'bg-red-500',
    border: 'border-red-500',
    glow: 'shadow-[0_0_10px_rgba(239,68,68,0.5)] dark:shadow-[0_0_10px_rgba(248,113,113,0.5)]',
    glowHover: 'hover:shadow-[0_0_15px_rgba(239,68,68,0.7)] dark:hover:shadow-[0_0_15px_rgba(248,113,113,0.7)]',
  },
  Mythic: {
    name: 'Mythic',
    background: 'bg-teal-500',
    border: 'border-teal-500',
    glow: 'shadow-[0_0_10px_rgba(20,184,166,0.5)] dark:shadow-[0_0_10px_rgba(45,212,191,0.5)]',
    glowHover: 'hover:shadow-[0_0_15px_rgba(20,184,166,0.7)] dark:hover:shadow-[0_0_15px_rgba(45,212,191,0.7)]',
  },
};

/**
 * Equipment rarity colors
 * Used for equipment/weapon cards and selectors
 */
export const EQUIPMENT_RARITY_COLORS = {
  Common: {
    name: 'Common',
    background: 'bg-gray-500',
    border: 'border-gray-500',
    glow: 'shadow-[0_0_10px_rgba(107,114,128,0.5)] dark:shadow-[0_0_10px_rgba(156,163,175,0.5)]',
    glowHover: 'hover:shadow-[0_0_15px_rgba(107,114,128,0.7)] dark:hover:shadow-[0_0_15px_rgba(156,163,175,0.7)]',
  },
  Great: {
    name: 'Great',
    background: 'bg-green-500',
    border: 'border-green-500',
    glow: 'shadow-[0_0_10px_rgba(34,197,94,0.5)] dark:shadow-[0_0_10px_rgba(74,222,128,0.5)]',
    glowHover: 'hover:shadow-[0_0_15px_rgba(34,197,94,0.7)] dark:hover:shadow-[0_0_15px_rgba(74,222,128,0.7)]',
  },
  Rare: {
    name: 'Rare',
    background: 'bg-orange-500',
    border: 'border-orange-500',
    glow: 'shadow-[0_0_10px_rgba(249,115,22,0.5)] dark:shadow-[0_0_10px_rgba(251,146,60,0.5)]',
    glowHover: 'hover:shadow-[0_0_15px_rgba(249,115,22,0.7)] dark:hover:shadow-[0_0_15px_rgba(251,146,60,0.7)]',
  },
  Epic: {
    name: 'Epic',
    background: 'bg-purple-500',
    border: 'border-purple-500',
    glow: 'shadow-[0_0_10px_rgba(168,85,247,0.5)] dark:shadow-[0_0_10px_rgba(192,132,252,0.5)]',
    glowHover: 'hover:shadow-[0_0_15px_rgba(168,85,247,0.7)] dark:hover:shadow-[0_0_15px_rgba(192,132,252,0.7)]',
  },
  Legendary: {
    name: 'Legendary',
    background: 'bg-red-500',
    border: 'border-red-500',
    glow: 'shadow-[0_0_10px_rgba(239,68,68,0.5)] dark:shadow-[0_0_10px_rgba(248,113,113,0.5)]',
    glowHover: 'hover:shadow-[0_0_15px_rgba(239,68,68,0.7)] dark:hover:shadow-[0_0_15px_rgba(248,113,113,0.7)]',
  },
  Mythic: {
    name: 'Mythic',
    background: 'bg-blue-500',
    border: 'border-blue-500',
    glow: 'shadow-[0_0_10px_rgba(59,130,246,0.5)] dark:shadow-[0_0_10px_rgba(96,165,250,0.5)]',
    glowHover: 'hover:shadow-[0_0_15px_rgba(59,130,246,0.7)] dark:hover:shadow-[0_0_15px_rgba(96,165,250,0.7)]',
  },
  Immortal: {
    name: 'Immortal',
    background: 'bg-yellow-400',
    border: 'border-yellow-400',
    glow: 'shadow-[0_0_10px_rgba(250,204,21,0.5)] dark:shadow-[0_0_10px_rgba(253,224,71,0.5)]',
    glowHover: 'hover:shadow-[0_0_15px_rgba(250,204,21,0.7)] dark:hover:shadow-[0_0_15px_rgba(253,224,71,0.7)]',
  },
};

/**
 * Get skill grade color configuration
 * @param {string} grade - The skill grade (Common, Great, Rare, Epic, Legendary, Mythic)
 * @returns {object} Color configuration object
 */
export const getSkillGradeColor = (grade) => {
  return SKILL_GRADE_COLORS[grade] || SKILL_GRADE_COLORS.Common;
};

/**
 * Get equipment rarity color configuration
 * @param {string} rarity - The equipment rarity (Common, Great, Rare, Epic, Legendary, Mythic, Immortal)
 * @returns {object} Color configuration object
 */
export const getEquipmentRarityColor = (rarity) => {
  return EQUIPMENT_RARITY_COLORS[rarity] || EQUIPMENT_RARITY_COLORS.Common;
};

/**
 * Legacy color mapping for backward compatibility
 * Returns only the background color class
 */
export const getGradeBackgroundColor = (grade) => {
  return getSkillGradeColor(grade).background;
};

export const getRarityBackgroundColor = (rarity) => {
  return getEquipmentRarityColor(rarity).background;
};
