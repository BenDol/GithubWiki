/**
 * Achievements Section Component
 *
 * Displays all achievements with filtering, statistics, and progress tracking
 */

import { useState } from 'react';
import PropTypes from 'prop-types';
import { useAchievements } from '../../hooks/useAchievements';
import AchievementCard from './AchievementCard';

export default function AchievementsSection({ owner, repo, userId, username }) {
  const {
    achievements,
    definitions,
    stats,
    loading,
    error,
    unlockedIds,
    unlockedCount,
    totalCount,
    totalPoints,
    maxPoints,
    completionPercentage,
  } = useAchievements(owner, repo, userId, username);

  const [selectedCategory, setSelectedCategory] = useState('all');
  const [selectedRarity, setSelectedRarity] = useState('all');
  const [showLocked, setShowLocked] = useState(true);

  if (loading) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <div className="flex items-center justify-center py-8">
          <svg
            className="animate-spin h-8 w-8 text-blue-600"
            fill="none"
            viewBox="0 0 24 24"
          >
            <circle
              className="opacity-25"
              cx="12"
              cy="12"
              r="10"
              stroke="currentColor"
              strokeWidth="4"
            />
            <path
              className="opacity-75"
              fill="currentColor"
              d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
            />
          </svg>
          <span className="ml-3 text-gray-600 dark:text-gray-400">
            Loading achievements...
          </span>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-red-200 dark:border-red-800 p-6 mb-6">
        <div className="flex items-center text-red-600 dark:text-red-400">
          <svg className="w-5 h-5 mr-2" fill="currentColor" viewBox="0 0 20 20">
            <path
              fillRule="evenodd"
              d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
              clipRule="evenodd"
            />
          </svg>
          <span>Error loading achievements: {error}</span>
        </div>
      </div>
    );
  }

  if (!definitions || !definitions.achievements || definitions.achievements.length === 0) {
    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6">
        <p className="text-gray-600 dark:text-gray-400 text-center">
          No achievements configured for this wiki.
        </p>
      </div>
    );
  }

  // Filter achievements
  let displayAchievements = definitions.achievements;

  if (selectedCategory !== 'all') {
    displayAchievements = displayAchievements.filter(
      (a) => a.category === selectedCategory
    );
  }

  if (selectedRarity !== 'all') {
    displayAchievements = displayAchievements.filter((a) => a.rarity === selectedRarity);
  }

  if (!showLocked) {
    displayAchievements = displayAchievements.filter((a) => unlockedIds.has(a.id));
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-6 mb-6 overflow-visible">
      {/* Header with stats */}
      <div className="mb-6">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          Achievements
        </h3>

        {/* Stats row */}
        <div className="flex flex-wrap gap-4 text-sm text-gray-600 dark:text-gray-400">
          <div className="flex items-center">
            <svg
              className="w-4 h-4 mr-1 text-yellow-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M9.049 2.927c.3-.921 1.603-.921 1.902 0l1.07 3.292a1 1 0 00.95.69h3.462c.969 0 1.371 1.24.588 1.81l-2.8 2.034a1 1 0 00-.364 1.118l1.07 3.292c.3.921-.755 1.688-1.54 1.118l-2.8-2.034a1 1 0 00-1.175 0l-2.8 2.034c-.784.57-1.838-.197-1.539-1.118l1.07-3.292a1 1 0 00-.364-1.118L2.98 8.72c-.783-.57-.38-1.81.588-1.81h3.461a1 1 0 00.951-.69l1.07-3.292z" />
            </svg>
            <span>
              <strong>{unlockedCount}</strong> / {totalCount} unlocked
            </span>
          </div>

          <div className="flex items-center">
            <svg
              className="w-4 h-4 mr-1 text-blue-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path d="M2 11a1 1 0 011-1h2a1 1 0 011 1v5a1 1 0 01-1 1H3a1 1 0 01-1-1v-5zM8 7a1 1 0 011-1h2a1 1 0 011 1v9a1 1 0 01-1 1H9a1 1 0 01-1-1V7zM14 4a1 1 0 011-1h2a1 1 0 011 1v12a1 1 0 01-1 1h-2a1 1 0 01-1-1V4z" />
            </svg>
            <span>
              <strong>{totalPoints}</strong> / {maxPoints} points
            </span>
          </div>

          <div className="flex items-center">
            <svg
              className="w-4 h-4 mr-1 text-green-500"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z"
                clipRule="evenodd"
              />
            </svg>
            <span>
              <strong>{completionPercentage.toFixed(1)}%</strong> complete
            </span>
          </div>
        </div>

        {/* Progress bar */}
        <div className="mt-3 w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2">
          <div
            className="bg-blue-600 h-2 rounded-full transition-all"
            style={{ width: `${completionPercentage}%` }}
          />
        </div>
      </div>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-6 pb-6 border-b border-gray-200 dark:border-gray-700">
        {/* Category filter */}
        <select
          value={selectedCategory}
          onChange={(e) => setSelectedCategory(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                   text-sm focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="all">All Categories</option>
          {definitions.categories &&
            Object.entries(definitions.categories).map(([key, category]) => (
              <option key={key} value={key}>
                {category.icon} {category.label}
              </option>
            ))}
        </select>

        {/* Rarity filter */}
        <select
          value={selectedRarity}
          onChange={(e) => setSelectedRarity(e.target.value)}
          className="px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600
                   bg-white dark:bg-gray-700 text-gray-900 dark:text-white
                   text-sm focus:ring-2 focus:ring-blue-500/20"
        >
          <option value="all">All Rarities</option>
          {definitions.rarities &&
            Object.keys(definitions.rarities).map((rarity) => (
              <option key={rarity} value={rarity}>
                {rarity.charAt(0).toUpperCase() + rarity.slice(1)}
              </option>
            ))}
        </select>

        {/* Show locked toggle */}
        <label className="flex items-center gap-2 px-3 py-2 rounded-lg border border-gray-300 dark:border-gray-600 bg-white dark:bg-gray-700 text-sm cursor-pointer hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors">
          <input
            type="checkbox"
            checked={showLocked}
            onChange={(e) => setShowLocked(e.target.checked)}
            className="w-4 h-4 text-blue-600 border-gray-300 rounded focus:ring-blue-500"
          />
          <span className="text-gray-900 dark:text-white">Show locked</span>
        </label>

        {/* Results count */}
        <div className="flex items-center text-sm text-gray-600 dark:text-gray-400 ml-auto">
          Showing {displayAchievements.length} achievement{displayAchievements.length !== 1 ? 's' : ''}
        </div>
      </div>

      {/* Achievement Grid - Scrollable Container */}
      <div className="max-h-[600px] overflow-y-auto overflow-x-visible pr-2 scrollbar-thin scrollbar-thumb-gray-300 dark:scrollbar-thumb-gray-600 scrollbar-track-transparent">
        {displayAchievements.length > 0 ? (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 pt-2 px-6 pb-6">
            {displayAchievements.map((achievement) => {
              const userAchievement = achievements.find((a) => a.id === achievement.id);
              const unlocked = !!userAchievement;

              return (
                <AchievementCard
                  key={achievement.id}
                  achievement={{ ...achievement, ...userAchievement }}
                  definitions={definitions}
                  stats={stats}
                  unlocked={unlocked}
                />
              );
            })}
          </div>
        ) : (
          <div className="text-center py-8 text-gray-600 dark:text-gray-400">
            <svg
              className="w-12 h-12 mx-auto mb-3 opacity-50"
              fill="currentColor"
              viewBox="0 0 20 20"
            >
              <path
                fillRule="evenodd"
                d="M10 18a8 8 0 100-16 8 8 0 000 16zM8.707 7.293a1 1 0 00-1.414 1.414L8.586 10l-1.293 1.293a1 1 0 101.414 1.414L10 11.414l1.293 1.293a1 1 0 001.414-1.414L11.414 10l1.293-1.293a1 1 0 00-1.414-1.414L10 8.586 8.707 7.293z"
                clipRule="evenodd"
              />
            </svg>
            <p>No achievements match the selected filters.</p>
            <button
              onClick={() => {
                setSelectedCategory('all');
                setSelectedRarity('all');
                setShowLocked(true);
              }}
              className="mt-2 text-blue-600 dark:text-blue-400 hover:underline text-sm"
            >
              Clear filters
            </button>
          </div>
        )}
      </div>
    </div>
  );
}

AchievementsSection.propTypes = {
  owner: PropTypes.string.isRequired,
  repo: PropTypes.string.isRequired,
  userId: PropTypes.number,
  username: PropTypes.string,
};
