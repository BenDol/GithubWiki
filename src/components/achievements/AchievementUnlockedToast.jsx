/**
 * Achievement Unlocked Toast
 *
 * Displays a celebratory notification when achievements are unlocked
 */

import { useState, useEffect } from 'react';
import { eventBus, EventNames } from '../../services/eventBus.js';
import { achievementService } from '../../services/achievements/achievementService.js';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('AchievementUnlockedToast');

const RARITY_COLORS = {
  common: {
    border: 'border-gray-400',
    bg: 'bg-gray-50 dark:bg-gray-900',
    glow: 'shadow-gray-400/50',
  },
  rare: {
    border: 'border-blue-400',
    bg: 'bg-blue-50 dark:bg-blue-900',
    glow: 'shadow-blue-400/50',
  },
  epic: {
    border: 'border-purple-400',
    bg: 'bg-purple-50 dark:bg-purple-900',
    glow: 'shadow-purple-400/50',
  },
  legendary: {
    border: 'border-yellow-400',
    bg: 'bg-yellow-50 dark:bg-yellow-900',
    glow: 'shadow-yellow-400/50',
  },
};

export default function AchievementUnlockedToast() {
  const [toasts, setToasts] = useState([]);
  const [definitions, setDefinitions] = useState(null);

  // Load achievement definitions on mount
  useEffect(() => {
    async function loadDefinitions() {
      try {
        const defs = await achievementService.loadAchievementDefinitions();
        setDefinitions(defs);
      } catch (error) {
        logger.error('Failed to load achievement definitions', { error });
      }
    }
    loadDefinitions();
  }, []);

  // Listen for achievement unlock events
  useEffect(() => {
    const handleAchievementsUnlocked = ({ achievements }) => {
      if (!achievements || achievements.length === 0) return;

      logger.info('Achievements unlocked', { count: achievements.length });

      // Add each achievement as a toast
      achievements.forEach((achievement, index) => {
        const toastId = `${achievement.id}-${Date.now()}-${index}`;

        // Stagger the appearance of multiple achievements
        setTimeout(() => {
          setToasts(prev => [...prev, { ...achievement, toastId }]);

          // Auto-remove after 5 seconds
          setTimeout(() => {
            setToasts(prev => prev.filter(t => t.toastId !== toastId));
          }, 5000);
        }, index * 300); // 300ms delay between each
      });
    };

    eventBus.on(EventNames.ACHIEVEMENTS_UNLOCKED, handleAchievementsUnlocked);

    return () => {
      eventBus.off(EventNames.ACHIEVEMENTS_UNLOCKED, handleAchievementsUnlocked);
    };
  }, []);

  if (!definitions) return null;

  return (
    <div className="fixed bottom-6 left-1/2 transform -translate-x-1/2 z-50 pointer-events-none">
      <div className="flex flex-col-reverse gap-3 items-center">
        {toasts.map((achievement) => {
          const definition = definitions.achievements.find(a => a.id === achievement.id);
          if (!definition) return null;

          const rarity = definition.rarity || 'common';
          const colors = RARITY_COLORS[rarity] || RARITY_COLORS.common;

          return (
            <div
              key={achievement.toastId}
              className={`
                pointer-events-auto
                min-w-[320px] max-w-md
                ${colors.bg} ${colors.border}
                border-2 rounded-lg shadow-2xl ${colors.glow}
                p-4
                animate-slide-up-fade
                backdrop-blur-sm
              `}
            >
              <div className="flex items-center gap-4">
                {/* Icon */}
                <div className="text-5xl flex-shrink-0 animate-bounce-once">
                  {definition.icon}
                </div>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    <span className="text-xs font-bold text-yellow-600 dark:text-yellow-400 uppercase tracking-wide">
                      Achievement Unlocked!
                    </span>
                    <span className={`text-xs font-semibold px-2 py-0.5 rounded ${colors.border} ${colors.bg}`}>
                      {rarity.toUpperCase()}
                    </span>
                  </div>

                  <h4 className="font-bold text-gray-900 dark:text-white text-lg leading-tight mb-1">
                    {definition.title}
                  </h4>

                  <p className="text-sm text-gray-600 dark:text-gray-300 leading-snug">
                    {definition.description}
                  </p>

                  {definition.points && (
                    <div className="mt-2 text-xs font-semibold text-gray-700 dark:text-gray-300">
                      +{definition.points} points
                    </div>
                  )}
                </div>

                {/* Close button */}
                <button
                  onClick={() => setToasts(prev => prev.filter(t => t.toastId !== achievement.toastId))}
                  className="flex-shrink-0 text-gray-400 hover:text-gray-600 dark:hover:text-gray-200 transition-colors"
                  aria-label="Dismiss"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
