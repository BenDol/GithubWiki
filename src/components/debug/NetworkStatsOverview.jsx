import React from 'react';

/**
 * Network Stats Overview Component
 *
 * Displays statistics comparison between cold and warm loads for a route.
 */
const NetworkStatsOverview = ({ coldLoad, warmLoad }) => {
  if (!coldLoad && !warmLoad) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-6 text-center">
        <p className="text-gray-600 dark:text-gray-400">Select a route to view statistics</p>
      </div>
    );
  }

  // Calculate stats on-demand if not already calculated
  const calculateStats = (calls) => {
    if (!calls || calls.length === 0) {
      return {
        totalCalls: 0,
        totalDuration: 0,
        totalSize: 0,
        cacheHits: 0,
        cacheMisses: 0,
        errors: 0,
        avgDuration: 0,
        cacheHitRate: 0
      };
    }

    const totalCalls = calls.length;
    const totalDuration = calls.reduce((sum, call) => sum + call.duration, 0);
    const totalSize = calls.reduce((sum, call) => sum + (call.responseSize || 0) + (call.requestSize || 0), 0);
    const cacheHits = calls.filter(call => call.cached).length;
    const cacheMisses = totalCalls - cacheHits;
    const errors = calls.filter(call => !call.success).length;
    const avgDuration = totalDuration / totalCalls;
    const cacheHitRate = totalCalls > 0 ? (cacheHits / totalCalls) * 100 : 0;

    return {
      totalCalls,
      totalDuration,
      totalSize,
      cacheHits,
      cacheMisses,
      errors,
      avgDuration,
      cacheHitRate
    };
  };

  const coldStats = coldLoad?.stats || calculateStats(coldLoad?.calls);
  const warmStats = warmLoad?.stats || calculateStats(warmLoad?.calls);

  const formatDuration = (ms) => {
    if (!ms && ms !== 0) return 'N/A';
    return `${ms.toFixed(2)}ms`;
  };

  const formatSize = (bytes) => {
    if (!bytes && bytes !== 0) return 'N/A';
    if (bytes < 1024) return `${bytes}B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(2)}KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)}MB`;
  };

  const formatPercentage = (value) => {
    if (!value && value !== 0) return 'N/A';
    return `${value.toFixed(1)}%`;
  };

  const StatCard = ({ title, coldValue, warmValue, formatter = (v) => v, improvement }) => {
    const improvementPercent = coldValue && warmValue
      ? ((coldValue - warmValue) / coldValue * 100)
      : null;

    return (
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
        <h3 className="text-sm font-medium text-gray-500 dark:text-gray-400 mb-3">{title}</h3>
        <div className="space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-400">Cold:</span>
            <span className="text-sm font-semibold text-blue-600 dark:text-blue-400">
              {formatter(coldValue)}
            </span>
          </div>
          <div className="flex items-center justify-between">
            <span className="text-xs text-gray-600 dark:text-gray-400">Warm:</span>
            <span className="text-sm font-semibold text-green-600 dark:text-green-400">
              {formatter(warmValue)}
            </span>
          </div>
          {improvement && improvementPercent !== null && improvementPercent !== 0 && (
            <div className="pt-2 border-t border-gray-200 dark:border-gray-700">
              <span className={`text-xs font-medium ${improvementPercent > 0 ? 'text-green-600' : 'text-red-600'}`}>
                {improvementPercent > 0 ? '↓' : '↑'} {Math.abs(improvementPercent).toFixed(1)}% {improvementPercent > 0 ? 'faster' : 'slower'}
              </span>
            </div>
          )}
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      {/* Summary Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
        <StatCard
          title="Total Duration"
          coldValue={coldStats?.totalDuration}
          warmValue={warmStats?.totalDuration}
          formatter={formatDuration}
          improvement
        />
        <StatCard
          title="Total Calls"
          coldValue={coldStats?.totalCalls}
          warmValue={warmStats?.totalCalls}
        />
        <StatCard
          title="Cache Hit Rate"
          coldValue={coldStats?.cacheHitRate}
          warmValue={warmStats?.cacheHitRate}
          formatter={formatPercentage}
        />
        <StatCard
          title="Total Size"
          coldValue={coldStats?.totalSize}
          warmValue={warmStats?.totalSize}
          formatter={formatSize}
        />
      </div>

      {/* Detailed Stats */}
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
        <div className="px-4 py-3 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
          <h3 className="text-sm font-medium text-gray-900 dark:text-white">Detailed Comparison</h3>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
            <thead className="bg-gray-50 dark:bg-gray-700">
              <tr>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Metric
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Cold Load
                </th>
                <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase tracking-wider">
                  Warm Load
                </th>
              </tr>
            </thead>
            <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">Total Calls</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{coldStats?.totalCalls || 0}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{warmStats?.totalCalls || 0}</td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">Total Duration</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDuration(coldStats?.totalDuration)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDuration(warmStats?.totalDuration)}</td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">Average Duration</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDuration(coldStats?.avgDuration)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatDuration(warmStats?.avgDuration)}</td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">Cache Hits</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{coldStats?.cacheHits || 0}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{warmStats?.cacheHits || 0}</td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">Cache Misses</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{coldStats?.cacheMisses || 0}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{warmStats?.cacheMisses || 0}</td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">Cache Hit Rate</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatPercentage(coldStats?.cacheHitRate)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatPercentage(warmStats?.cacheHitRate)}</td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">Errors</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{coldStats?.errors || 0}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{warmStats?.errors || 0}</td>
              </tr>
              <tr>
                <td className="px-6 py-4 whitespace-nowrap text-sm font-medium text-gray-900 dark:text-white">Total Size</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatSize(coldStats?.totalSize)}</td>
                <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{formatSize(warmStats?.totalSize)}</td>
              </tr>
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
};

export default NetworkStatsOverview;
