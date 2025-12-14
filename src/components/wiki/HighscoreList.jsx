import PrestigeAvatar from '../common/PrestigeAvatar';

/**
 * HighscoreList Component
 * Displays remaining contributors in a ranked list
 */
const HighscoreList = ({ contributors, startRank = 4 }) => {
  if (!contributors || contributors.length === 0) {
    return null;
  }

  return (
    <div className="w-full max-w-4xl mx-auto mt-6 sm:mt-8 md:mt-12 px-4 sm:px-6">
      <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 text-center">
        All Contributors
      </h2>

      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
        {/* Header - Hidden on mobile */}
        <div className="hidden md:grid grid-cols-12 gap-4 px-6 py-3 bg-gray-50 dark:bg-gray-900 border-b border-gray-200 dark:border-gray-700 font-semibold text-sm text-gray-600 dark:text-gray-400">
          <div className="col-span-1 text-center">Rank</div>
          <div className="col-span-7">Contributor</div>
          <div className="col-span-4 text-right">Contributions</div>
        </div>

        {/* Contributors List */}
        <div className="divide-y divide-gray-200 dark:divide-gray-700">
          {contributors.map((contributor, index) => {
            const rank = startRank + index;
            const isTopTen = rank <= 10;

            return (
              <a
                key={contributor.login}
                href={contributor.profileUrl}
                target="_blank"
                rel="noopener noreferrer"
                className={`grid grid-cols-12 gap-2 sm:gap-3 md:gap-4 px-3 sm:px-4 md:px-6 py-3 sm:py-4 hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors ${
                  isTopTen ? 'bg-blue-50/30 dark:bg-blue-900/10' : ''
                }`}
              >
                {/* Rank */}
                <div className="col-span-2 md:col-span-1 flex items-center justify-center">
                  <span
                    className={`text-sm sm:text-base md:text-lg font-bold ${
                      isTopTen
                        ? 'text-blue-600 dark:text-blue-400'
                        : 'text-gray-600 dark:text-gray-400'
                    }`}
                  >
                    #{rank}
                  </span>
                </div>

                {/* Contributor Info */}
                <div className="col-span-6 md:col-span-7 flex items-center space-x-2 sm:space-x-3">
                  <PrestigeAvatar
                    user={contributor}
                    size={window.innerWidth < 640 ? 36 : 48}
                    showPrestigeBadge={true}
                  />
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center space-x-1 sm:space-x-2">
                      <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white truncate">
                        {contributor.login}
                      </h3>
                      {isTopTen && (
                        <span className="hidden sm:inline-flex text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 px-2 py-0.5 rounded-full font-medium">
                          Top 10
                        </span>
                      )}
                    </div>
                  </div>
                </div>

                {/* Contributions */}
                <div className="col-span-4 md:col-span-4 flex items-center justify-end">
                  <div className="text-right">
                    <div className="text-base sm:text-lg font-bold text-gray-900 dark:text-white">
                      {contributor.contributions.toLocaleString()}
                    </div>
                    <div className="hidden sm:block text-xs text-gray-500 dark:text-gray-400">
                      contributions
                    </div>
                  </div>
                </div>
              </a>
            );
          })}
        </div>
      </div>
    </div>
  );
};

export default HighscoreList;
