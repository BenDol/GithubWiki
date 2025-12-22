/**
 * Achievement Card Component
 *
 * Displays a single achievement with icon, title, description, rarity, and statistics
 */

import PropTypes from 'prop-types';

// Tailwind color classes for dynamic colors (must be in template for Tailwind to pick them up)
const RARITY_COLORS = {
  common: {
    border: 'border-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-900/20',
    badge: 'bg-gray-500',
    text: 'text-gray-700 dark:text-gray-300',
  },
  rare: {
    border: 'border-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900/20',
    badge: 'bg-blue-500',
    text: 'text-blue-700 dark:text-blue-300',
  },
  epic: {
    border: 'border-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-900/20',
    badge: 'bg-purple-500',
    text: 'text-purple-700 dark:text-purple-300',
  },
  legendary: {
    border: 'border-yellow-400',
    bg: 'bg-yellow-50 dark:bg-yellow-900/20',
    badge: 'bg-yellow-500',
    text: 'text-yellow-700 dark:text-yellow-300',
  },
};

const CATEGORY_COLORS = {
  contribution: 'bg-blue-100 dark:bg-blue-900/30 text-blue-800 dark:text-blue-200',
  social: 'bg-green-100 dark:bg-green-900/30 text-green-800 dark:text-green-200',
  game: 'bg-purple-100 dark:bg-purple-900/30 text-purple-800 dark:text-purple-200',
  milestone: 'bg-yellow-100 dark:bg-yellow-900/30 text-yellow-800 dark:text-yellow-200',
};

export default function AchievementCard({ achievement, definitions, stats, unlocked }) {
  if (!achievement || !definitions) {
    return null;
  }

  const rarity = definitions.rarities?.[achievement.rarity] || definitions.rarities?.common;
  const category = definitions.categories?.[achievement.category];
  const percentage = stats?.achievements?.[achievement.id]?.percentage || 0;

  const rarityColors = RARITY_COLORS[achievement.rarity] || RARITY_COLORS.common;
  const categoryColor = CATEGORY_COLORS[achievement.category] || CATEGORY_COLORS.milestone;

  return (
    <div
      className={`
        relative p-4 rounded-lg border-2 transition-all
        ${unlocked ? `${rarityColors.border} ${rarityColors.bg}` : 'border-gray-300 dark:border-gray-700 bg-gray-100 dark:bg-gray-800 opacity-50'}
        hover:shadow-lg
      `}
      title={unlocked ? `Unlocked: ${new Date(achievement.unlockedAt).toLocaleString()}` : 'Locked'}
    >
      {/* Icon - top left */}
      <div className="absolute top-2 left-2 text-4xl select-none">{achievement.icon}</div>

      {/* Rarity badge - top right */}
      <div
        className={`
          absolute top-2 right-2 px-2 py-1 rounded text-xs font-semibold
          ${rarityColors.badge} text-white
        `}
      >
        {achievement.rarity.toUpperCase()}
      </div>

      {/* Title */}
      <h4 className="font-semibold text-gray-900 dark:text-white mb-1 pr-16 pt-12">
        {achievement.title}
      </h4>

      {/* Description */}
      <p className="text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
        {achievement.description}
      </p>

      {/* Percentage earned - only show if unlocked */}
      {unlocked && percentage > 0 && (
        <div className="mb-3 text-xs text-gray-600 dark:text-gray-400 font-medium">
          <span title={`${percentage.toFixed(1)}% of users have unlocked this achievement`}>
            {percentage.toFixed(1)}% of users earned this
          </span>
        </div>
      )}

      {/* Unlock date - only show if unlocked */}
      {unlocked && achievement.unlockedAt && (
        <div className="mb-3 pb-3 border-b border-gray-200 dark:border-gray-700">
          <p className="text-xs text-gray-500 dark:text-gray-400">
            <span className="font-medium">Unlocked:</span>{' '}
            {new Date(achievement.unlockedAt).toLocaleDateString()}
          </p>
        </div>
      )}

      {/* Category badge - bottom left */}
      <div className={`absolute bottom-2 left-2 px-2 py-1 rounded ${categoryColor} font-medium text-xs`}>
        {category?.icon && <span className="mr-1">{category.icon}</span>}
        {category?.label || achievement.category}
      </div>

      {/* Points indicator - bottom right */}
      {achievement.points && (
        <div className={`absolute bottom-2 right-2 text-xs font-semibold ${rarityColors.text} bg-white/80 dark:bg-gray-800/80 px-2 py-1 rounded`}>
          +{achievement.points} pts
        </div>
      )}

      {/* Locked overlay indicator */}
      {!unlocked && (
        <div className="absolute inset-0 flex items-center justify-center bg-gray-900/10 dark:bg-gray-900/30 rounded-lg">
          <svg
            className="w-8 h-8 text-gray-400 dark:text-gray-600"
            fill="currentColor"
            viewBox="0 0 20 20"
          >
            <path
              fillRule="evenodd"
              d="M5 9V7a5 5 0 0110 0v2a2 2 0 012 2v5a2 2 0 01-2 2H5a2 2 0 01-2-2v-5a2 2 0 012-2zm8-2v2H7V7a3 3 0 016 0z"
              clipRule="evenodd"
            />
          </svg>
        </div>
      )}
    </div>
  );
}

AchievementCard.propTypes = {
  achievement: PropTypes.shape({
    id: PropTypes.string.isRequired,
    title: PropTypes.string.isRequired,
    description: PropTypes.string.isRequired,
    icon: PropTypes.string.isRequired,
    category: PropTypes.string.isRequired,
    rarity: PropTypes.string.isRequired,
    points: PropTypes.number,
    unlockedAt: PropTypes.string,
  }).isRequired,
  definitions: PropTypes.shape({
    categories: PropTypes.object,
    rarities: PropTypes.object,
  }).isRequired,
  stats: PropTypes.object,
  unlocked: PropTypes.bool.isRequired,
};
