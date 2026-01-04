import React, { useState, useEffect } from 'react';
import { useNetworkDebugStore } from '../store/networkDebugStore';
import { isNetworkDebugEnabled } from '../utils/networkDebugConfig';
import NetworkStatsOverview from '../components/debug/NetworkStatsOverview';
import RouteSelector from '../components/debug/RouteSelector';
import { createLogger } from '../utils/logger';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell
} from 'recharts';

const logger = createLogger('NetworkDebugPage');

/**
 * Network Debug Page
 *
 * Main dashboard for viewing network debug statistics and charts.
 * Provides cold vs warm load comparison, call type distribution, and export functionality.
 */
const NetworkDebugPage = () => {
  // Use selector to only subscribe to specific state (avoids re-render on every network call)
  const routeData = useNetworkDebugStore(state => state.routeData);
  const storeCurrentRoute = useNetworkDebugStore(state => state.currentRoute);
  const downloadSessionData = useNetworkDebugStore(state => state.downloadSessionData);
  const clearSession = useNetworkDebugStore(state => state.clearSession);

  const [selectedRoute, setSelectedRoute] = useState(null);
  const [isExporting, setIsExporting] = useState(false);
  const [exportSuccess, setExportSuccess] = useState(false);
  const [exportError, setExportError] = useState(null);
  const [showOnlyNonCached, setShowOnlyNonCached] = useState(false);
  const [selectedLoadPhase, setSelectedLoadPhase] = useState('cold'); // 'cold' or 'warm'
  const [expandedCallId, setExpandedCallId] = useState(null); // Track which call row is expanded

  const routes = Object.keys(routeData);
  const currentRoute = selectedRoute || storeCurrentRoute || routes[0];
  const routeInfo = routeData[currentRoute];

  // Auto-select first route if none selected
  useEffect(() => {
    if (!selectedRoute && routes.length > 0) {
      setSelectedRoute(routes[0]);
    }
  }, [routes.length, selectedRoute]);

  // Check if debug mode is enabled
  if (!isNetworkDebugEnabled()) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
          <h2 className="text-lg font-semibold text-yellow-800 dark:text-yellow-200 mb-2">
            Network Debug Mode Disabled
          </h2>
          <p className="text-yellow-700 dark:text-yellow-300 mb-4">
            Enable network debug mode in <code className="bg-yellow-100 dark:bg-yellow-900/50 px-2 py-1 rounded">wiki-config.json</code>:
          </p>
          <pre className="bg-yellow-100 dark:bg-yellow-900/50 p-4 rounded overflow-x-auto text-sm">
            {`{
  "features": {
    "network": {
      "debugMode": {
        "enabled": true
      }
    }
  }
}`}
          </pre>
          <p className="text-yellow-700 dark:text-yellow-300 mt-4">
            Then restart the dev server.
          </p>
        </div>
      </div>
    );
  }

  // Handle download JSON
  const handleDownload = async () => {
    setIsExporting(true);
    setExportError(null);
    setExportSuccess(false);

    try {
      const result = await downloadSessionData();
      setExportSuccess(true);
      logger.info('Network debug data downloaded successfully', { filename: result.filename });

      // Clear success message after 5 seconds
      setTimeout(() => setExportSuccess(false), 5000);
    } catch (error) {
      setExportError(error.message);
      logger.error('Failed to download network debug data', { error });
    } finally {
      setIsExporting(false);
    }
  };

  // Prepare chart data
  const prepareCallTypeData = () => {
    if (!routeInfo) return [];

    const coldOctokit = routeInfo.coldLoad.calls.filter(c => c.type === 'octokit').length;
    const coldFetch = routeInfo.coldLoad.calls.filter(c => c.type === 'fetch').length;
    const warmOctokit = routeInfo.warmLoad.calls.filter(c => c.type === 'octokit').length;
    const warmFetch = routeInfo.warmLoad.calls.filter(c => c.type === 'fetch').length;

    return [
      { name: 'Octokit (Cold)', value: coldOctokit, fill: '#3b82f6' },
      { name: 'Fetch (Cold)', value: coldFetch, fill: '#60a5fa' },
      { name: 'Octokit (Warm)', value: warmOctokit, fill: '#10b981' },
      { name: 'Fetch (Warm)', value: warmFetch, fill: '#34d399' }
    ].filter(item => item.value > 0);
  };

  // Calculate stats on-demand (since warmLoad.stats is not automatically calculated)
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

  const prepareDurationComparisonData = () => {
    return routes.map(route => {
      const data = routeData[route];

      // Calculate stats on-demand if not available
      const coldStats = data.coldLoad.stats || calculateStats(data.coldLoad.calls);
      const warmStats = data.warmLoad.stats || calculateStats(data.warmLoad.calls);

      return {
        route: route.length > 20 ? route.substring(0, 20) + '...' : route,
        fullRoute: route,
        cold: parseFloat(coldStats.totalDuration.toFixed(2)),
        warm: parseFloat(warmStats.totalDuration.toFixed(2))
      };
    });
  };

  const callTypeData = prepareCallTypeData();
  const durationComparisonData = prepareDurationComparisonData();

  // Get current load phase data and filter calls
  const currentLoadData = selectedLoadPhase === 'cold' ? routeInfo?.coldLoad : routeInfo?.warmLoad;
  const allCalls = currentLoadData?.calls || [];
  const filteredCalls = showOnlyNonCached ? allCalls.filter(call => !call.cached) : allCalls;
  const nonCachedCount = allCalls.filter(call => !call.cached).length;
  const cachedCount = allCalls.filter(call => call.cached).length;

  return (
    <div className="container mx-auto px-4 py-8 space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white">Network Debug Dashboard</h1>
          <p className="mt-1 text-sm text-gray-500 dark:text-gray-400">
            Performance analysis and network call tracking
          </p>
        </div>
        <div className="flex items-center gap-3">
          <button
            onClick={() => {
              if (confirm('Clear all network debug data?')) {
                clearSession();
                setSelectedRoute(null);
              }
            }}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-md hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Clear Session
          </button>
          <button
            onClick={handleDownload}
            disabled={isExporting || routes.length === 0}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 rounded-md hover:bg-blue-700 disabled:bg-gray-400 disabled:cursor-not-allowed transition-colors"
          >
            {isExporting ? 'Downloading...' : 'Download JSON'}
          </button>
        </div>
      </div>

      {/* Download feedback */}
      {exportSuccess && (
        <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
          <p className="text-sm text-green-800 dark:text-green-200">
            Successfully downloaded network debug data!
          </p>
        </div>
      )}

      {exportError && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <p className="text-sm text-red-800 dark:text-red-200">
            Failed to download: {exportError}
          </p>
        </div>
      )}

      {/* Route Selector */}
      <RouteSelector
        routes={routes}
        currentRoute={currentRoute}
        onRouteChange={setSelectedRoute}
      />

      {/* Stats Overview */}
      {routeInfo && (
        <NetworkStatsOverview
          coldLoad={routeInfo.coldLoad}
          warmLoad={routeInfo.warmLoad}
        />
      )}

      {/* Charts */}
      {routeInfo && (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Call Type Distribution */}
          {callTypeData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Call Type Distribution
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <PieChart>
                  <Pie
                    data={callTypeData}
                    cx="50%"
                    cy="50%"
                    labelLine={false}
                    label={(entry) => `${entry.name}: ${entry.value}`}
                    outerRadius={80}
                    fill="#8884d8"
                    dataKey="value"
                  >
                    {callTypeData.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={entry.fill} />
                    ))}
                  </Pie>
                  <Tooltip />
                </PieChart>
              </ResponsiveContainer>
            </div>
          )}

          {/* Duration Comparison */}
          {durationComparisonData.length > 0 && (
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-6">
              <h3 className="text-lg font-medium text-gray-900 dark:text-white mb-4">
                Duration Comparison (All Routes)
              </h3>
              <ResponsiveContainer width="100%" height={300}>
                <BarChart data={durationComparisonData}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#374151" />
                  <XAxis dataKey="route" stroke="#9ca3af" />
                  <YAxis label={{ value: 'Duration (ms)', angle: -90, position: 'insideLeft' }} stroke="#9ca3af" />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#1f2937',
                      border: '1px solid #374151',
                      borderRadius: '0.375rem'
                    }}
                    labelStyle={{ color: '#f3f4f6' }}
                  />
                  <Legend />
                  <Bar dataKey="cold" fill="#3b82f6" name="Cold Load" />
                  <Bar dataKey="warm" fill="#10b981" name="Warm Load" />
                </BarChart>
              </ResponsiveContainer>
            </div>
          )}
        </div>
      )}

      {/* Call List */}
      {routeInfo && allCalls.length > 0 && (
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow overflow-hidden">
          <div className="px-6 py-4 bg-gray-50 dark:bg-gray-700 border-b border-gray-200 dark:border-gray-600">
            <div className="flex items-center justify-between flex-wrap gap-4">
              <div className="flex items-center gap-4">
                <h3 className="text-lg font-medium text-gray-900 dark:text-white">Network Calls</h3>

                {/* Load Phase Selector */}
                <div className="flex gap-2">
                  <button
                    onClick={() => setSelectedLoadPhase('cold')}
                    className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                      selectedLoadPhase === 'cold'
                        ? 'bg-blue-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                    }`}
                  >
                    Cold Load
                  </button>
                  <button
                    onClick={() => setSelectedLoadPhase('warm')}
                    className={`px-3 py-1 text-sm font-medium rounded transition-colors ${
                      selectedLoadPhase === 'warm'
                        ? 'bg-green-600 text-white'
                        : 'bg-gray-200 dark:bg-gray-600 text-gray-700 dark:text-gray-300 hover:bg-gray-300 dark:hover:bg-gray-500'
                    }`}
                  >
                    Warm Load
                  </button>
                </div>
              </div>

              {/* Filter and Stats */}
              <div className="flex items-center gap-4">
                <div className="text-sm text-gray-600 dark:text-gray-400">
                  <span className="font-semibold text-orange-600 dark:text-orange-400">{nonCachedCount}</span> non-cached
                  <span className="mx-2">|</span>
                  <span className="font-semibold text-green-600 dark:text-green-400">{cachedCount}</span> cached
                </div>
                <label className="flex items-center gap-2 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={showOnlyNonCached}
                    onChange={(e) => setShowOnlyNonCached(e.target.checked)}
                    className="w-4 h-4 rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                  />
                  <span className="text-sm text-gray-700 dark:text-gray-300">Show only non-cached</span>
                </label>
              </div>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700">
              <thead className="bg-gray-50 dark:bg-gray-700">
                <tr>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Type</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Method</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">URL</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Duration</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Status</th>
                  <th scope="col" className="px-6 py-3 text-left text-xs font-medium text-gray-500 dark:text-gray-300 uppercase">Cached</th>
                </tr>
              </thead>
              <tbody className="bg-white dark:bg-gray-800 divide-y divide-gray-200 dark:divide-gray-700">
                {filteredCalls.slice(0, 50).map((call) => {
                  const isExpanded = expandedCallId === call.id;
                  return (
                    <React.Fragment key={call.id}>
                      <tr
                        onClick={() => setExpandedCallId(isExpanded ? null : call.id)}
                        className={`cursor-pointer hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors ${!call.cached ? 'bg-orange-50 dark:bg-orange-900/10' : ''}`}
                      >
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <div className="flex items-center gap-2">
                            <span className={`transform transition-transform ${isExpanded ? 'rotate-90' : ''}`}>▶</span>
                            <span className={`px-2 py-1 rounded text-xs font-medium ${call.type === 'octokit' ? 'bg-blue-100 text-blue-800' : 'bg-purple-100 text-purple-800'}`}>
                              {call.type}
                            </span>
                          </div>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{call.method}</td>
                        <td className="px-6 py-4 text-sm text-gray-500 dark:text-gray-400 max-w-xs truncate" title={call.url}>{call.url}</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm text-gray-500 dark:text-gray-400">{call.duration.toFixed(2)}ms</td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          <span className={`px-2 py-1 rounded text-xs font-medium ${call.success ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}`}>
                            {call.status}
                          </span>
                        </td>
                        <td className="px-6 py-4 whitespace-nowrap text-sm">
                          {call.cached ? (
                            <span className="text-green-600 dark:text-green-400 font-medium">✓ Cached</span>
                          ) : (
                            <span className="text-orange-600 dark:text-orange-400 font-bold">✗ Full Request</span>
                          )}
                        </td>
                      </tr>
                      {isExpanded && (
                        <tr className="bg-gray-50 dark:bg-gray-900">
                          <td colSpan="6" className="px-6 py-4">
                            <div className="space-y-4">
                              <div>
                                <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Call Details</h4>
                                <div className="grid grid-cols-2 gap-4 text-sm">
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400">Call ID:</span>
                                    <span className="ml-2 font-mono text-xs">{call.id}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400">Timestamp:</span>
                                    <span className="ml-2">{new Date(call.timestamp).toLocaleTimeString()}</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400">Request Size:</span>
                                    <span className="ml-2">{(call.requestSize / 1024).toFixed(2)} KB</span>
                                  </div>
                                  <div>
                                    <span className="text-gray-500 dark:text-gray-400">Response Size:</span>
                                    <span className="ml-2">{(call.responseSize / 1024).toFixed(2)} KB</span>
                                  </div>
                                  {call.cacheType && (
                                    <div>
                                      <span className="text-gray-500 dark:text-gray-400">Cache Type:</span>
                                      <span className="ml-2">{call.cacheType}</span>
                                    </div>
                                  )}
                                </div>
                              </div>

                              {call.stackTrace && call.stackTrace.length > 0 && (
                                <div>
                                  <h4 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">Call Initiator (Stack Trace)</h4>
                                  <div className="bg-gray-900 dark:bg-black rounded-lg p-4 overflow-x-auto">
                                    <pre className="text-xs text-green-400 font-mono">
                                      {call.stackTrace.slice(0, 10).map((line, index) => (
                                        <div key={index} className="hover:bg-gray-800 px-2 py-0.5 rounded">
                                          {line}
                                        </div>
                                      ))}
                                      {call.stackTrace.length > 10 && (
                                        <div className="text-gray-500 mt-2">
                                          ... {call.stackTrace.length - 10} more lines
                                        </div>
                                      )}
                                    </pre>
                                  </div>
                                </div>
                              )}

                              {call.error && (
                                <div>
                                  <h4 className="text-sm font-semibold text-red-600 dark:text-red-400 mb-2">Error Details</h4>
                                  <div className="bg-red-50 dark:bg-red-900/20 rounded-lg p-3 text-sm text-red-800 dark:text-red-200">
                                    {call.error}
                                  </div>
                                </div>
                              )}
                            </div>
                          </td>
                        </tr>
                      )}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>
          {filteredCalls.length > 50 && (
            <div className="px-6 py-3 bg-gray-50 dark:bg-gray-700 text-sm text-gray-500 dark:text-gray-400">
              Showing 50 of {filteredCalls.length} calls
              {showOnlyNonCached && ` (${allCalls.length} total)`}
            </div>
          )}
          {filteredCalls.length === 0 && showOnlyNonCached && (
            <div className="px-6 py-8 text-center text-gray-500 dark:text-gray-400">
              No non-cached calls found in this load phase
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default NetworkDebugPage;
