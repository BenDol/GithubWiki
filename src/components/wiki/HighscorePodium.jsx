import { useState, useEffect } from 'react';
import PrestigeAvatar from '../common/PrestigeAvatar';
import SparkleEffect from '../effects/SparkleEffect';

/**
 * HighscorePodium Component
 * Displays top 3 contributors on an arc-aligned podium with animations
 */
const HighscorePodium = ({ topThree }) => {
  const [isVisible, setIsVisible] = useState(false);

  useEffect(() => {
    // Trigger entrance animation
    setTimeout(() => setIsVisible(true), 100);
  }, []);

  if (!topThree || topThree.length === 0) {
    return null;
  }

  // Ensure we have exactly 3 positions (fill with nulls if needed)
  const [first, second, third] = topThree;

  return (
    <div className="relative w-full max-w-5xl mx-auto py-12">
      {/* Podium Container */}
      <div className="relative flex items-end justify-center gap-8 px-4">
        {/* 2nd Place - Left */}
        {second && (
          <div
            className={`flex flex-col items-center transition-all duration-700 transform ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'
            }`}
            style={{ transitionDelay: '200ms' }}
          >
            {/* Trophy/Medal */}
            <div className="relative mb-4">
              <div className="absolute inset-0 blur-xl bg-gray-300 opacity-50 rounded-full animate-pulse"></div>
              <div className="relative text-6xl">🥈</div>
            </div>

            {/* Avatar with Prestige Badge */}
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-gray-300 to-gray-500 blur-lg opacity-60 animate-pulse"></div>
              <PrestigeAvatar
                user={second}
                size={96}
                showPrestigeBadge={true}
              />
            </div>

            {/* Username */}
            <div className="text-center mb-2">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                {second.login}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {second.contributions.toLocaleString()} contributions
              </p>
            </div>

            {/* Podium Base */}
            <div className="relative w-32 h-24 bg-gradient-to-b from-gray-300 to-gray-400 rounded-t-lg shadow-2xl border-t-4 border-gray-200 dark:from-gray-600 dark:to-gray-700 dark:border-gray-500">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-t-lg"></div>
              <div className="absolute inset-x-0 bottom-0 h-1/2 flex items-center justify-center">
                <span className="text-4xl font-bold text-white drop-shadow-lg">2</span>
              </div>
            </div>
          </div>
        )}

        {/* 1st Place - Center (Highest) */}
        {first && (
          <div
            className={`flex flex-col items-center transition-all duration-700 transform ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'
            }`}
            style={{ transitionDelay: '100ms' }}
          >
            {/* Trophy/Medal */}
            <div className="relative mb-4">
              <div className="absolute inset-0 blur-2xl bg-yellow-400 opacity-70 rounded-full animate-pulse"></div>
              <div className="relative text-7xl animate-bounce">🏆</div>
            </div>

            {/* Avatar with Prestige Badge and Glow */}
            <div className="relative mb-4">
              {/* Glow effect */}
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-yellow-300 via-yellow-400 to-yellow-500 blur-2xl opacity-80 animate-pulse"></div>
              {/* Sparkles */}
              <div className="absolute inset-0 w-32 h-32 -translate-x-1/2 -translate-y-1/2 left-1/2 top-1/2">
                <SparkleEffect color="#FFD700" density={20} size={6} />
              </div>
              {/* Avatar */}
              <div className="relative">
                <PrestigeAvatar
                  user={first}
                  size={128}
                  showPrestigeBadge={true}
                />
              </div>
            </div>

            {/* Banner */}
            <div className="relative mb-4">
              <div className="bg-gradient-to-r from-yellow-400 via-yellow-300 to-yellow-400 px-6 py-2 rounded-lg shadow-xl border-2 border-yellow-500 transform -rotate-2">
                <span className="text-sm font-bold text-yellow-900 uppercase tracking-wider">
                  Champion
                </span>
              </div>
            </div>

            {/* Username */}
            <div className="text-center mb-2">
              <h3 className="text-2xl font-bold text-yellow-500 dark:text-yellow-400">
                {first.login}
              </h3>
              <p className="text-base text-gray-600 dark:text-gray-400 font-semibold">
                {first.contributions.toLocaleString()} contributions
              </p>
            </div>

            {/* Podium Base (Tallest) */}
            <div className="relative w-32 h-36 bg-gradient-to-b from-yellow-400 to-yellow-600 rounded-t-lg shadow-2xl border-t-4 border-yellow-300">
              <div className="absolute inset-0 bg-gradient-to-br from-white/30 to-transparent rounded-t-lg"></div>
              <div className="absolute inset-x-0 bottom-0 h-1/2 flex items-center justify-center">
                <span className="text-5xl font-bold text-white drop-shadow-lg">1</span>
              </div>
              {/* Glow at base */}
              <div className="absolute -inset-2 bg-gradient-to-b from-transparent via-yellow-400/50 to-yellow-500/50 rounded-t-lg blur-xl -z-10 animate-pulse"></div>
            </div>
          </div>
        )}

        {/* 3rd Place - Right */}
        {third && (
          <div
            className={`flex flex-col items-center transition-all duration-700 transform ${
              isVisible ? 'translate-y-0 opacity-100' : 'translate-y-20 opacity-0'
            }`}
            style={{ transitionDelay: '300ms' }}
          >
            {/* Trophy/Medal */}
            <div className="relative mb-4">
              <div className="absolute inset-0 blur-xl bg-orange-400 opacity-50 rounded-full animate-pulse"></div>
              <div className="relative text-6xl">🥉</div>
            </div>

            {/* Avatar with Prestige Badge */}
            <div className="relative mb-4">
              <div className="absolute inset-0 rounded-full bg-gradient-to-br from-orange-400 to-orange-600 blur-lg opacity-60 animate-pulse"></div>
              <PrestigeAvatar
                user={third}
                size={96}
                showPrestigeBadge={true}
              />
            </div>

            {/* Username */}
            <div className="text-center mb-2">
              <h3 className="text-xl font-bold text-gray-800 dark:text-gray-200">
                {third.login}
              </h3>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {third.contributions.toLocaleString()} contributions
              </p>
            </div>

            {/* Podium Base */}
            <div className="relative w-32 h-20 bg-gradient-to-b from-orange-400 to-orange-600 rounded-t-lg shadow-2xl border-t-4 border-orange-300 dark:from-orange-600 dark:to-orange-700 dark:border-orange-500">
              <div className="absolute inset-0 bg-gradient-to-br from-white/20 to-transparent rounded-t-lg"></div>
              <div className="absolute inset-x-0 bottom-0 h-1/2 flex items-center justify-center">
                <span className="text-4xl font-bold text-white drop-shadow-lg">3</span>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Background glow effect */}
      <div className="absolute inset-0 -z-10 overflow-hidden">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-96 h-96 bg-gradient-radial from-yellow-400/20 via-transparent to-transparent blur-3xl animate-pulse"></div>
      </div>
    </div>
  );
};

export default HighscorePodium;
