import React, { useState, useEffect } from 'react';
import { isNetworkDebugEnabled } from '../../utils/networkDebugConfig';
import { useNetworkDebugStore } from '../../store/networkDebugStore';
import { createLogger } from '../../utils/logger';

const logger = createLogger('NetworkDebugBanner');

/**
 * Network Debug Banner
 *
 * Displays a banner at the top of the page when network debug mode is active.
 * Provides quick stats and a link to the debug dashboard.
 */
const NetworkDebugBanner = () => {
  const {
    routeData,
    currentRoute,
    currentLoadPhase,
    clearSession,
    retrackRoute,
    autoSaveStatus,
    autoSaveError,
    warmReloadPending
  } = useNetworkDebugStore();
  const [isVisible, setIsVisible] = useState(true);
  const [stats, setStats] = useState({ totalCalls: 0, totalRoutes: 0 });
  const [purgeCacheOnLoad, setPurgeCacheOnLoad] = useState(() => {
    try {
      const saved = localStorage.getItem('networkDebug:purgeCacheOnLoad');
      // Default to true if not set, otherwise use saved value
      return saved === null ? true : saved === 'true';
    } catch {
      return true;
    }
  });


  // Calculate stats
  useEffect(() => {
    const calculateStats = () => {
      const totalRoutes = Object.keys(routeData).length;
      const totalCalls = Object.values(routeData).reduce((sum, route) => {
        return sum + route.coldLoad.calls.length + route.warmLoad.calls.length;
      }, 0);

      setStats({ totalCalls, totalRoutes });
    };

    calculateStats();

    // Update stats every 2 seconds
    const interval = setInterval(calculateStats, 2000);

    return () => clearInterval(interval);
  }, [routeData]);

  // Only show banner if debug mode is enabled
  if (!isNetworkDebugEnabled()) {
    return null;
  }

  // Allow user to temporarily hide banner
  if (!isVisible) {
    return (
      <button
        onClick={() => setIsVisible(true)}
        className="fixed bottom-0 right-0 z-50 bg-yellow-500 text-black px-3 py-1 text-xs font-medium hover:bg-yellow-600 transition-colors rounded-tl-lg shadow-lg"
        title="Show network debug banner"
      >
        Show Debug Info
      </button>
    );
  }

  return (
    <div
      className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-yellow-400 to-orange-400 text-black shadow-lg"
      style={{
        position: 'fixed',
        bottom: 0,
        left: 0,
        right: 0,
        zIndex: 9999,
        background: 'linear-gradient(to right, #fbbf24, #fb923c)',
        color: '#000',
        boxShadow: '0 -4px 6px -1px rgba(0, 0, 0, 0.1)'
      }}
    >
      <div className="container mx-auto px-3 py-1.5 flex items-center justify-between gap-3 flex-wrap text-sm">
        {/* Left side - Status */}
        <div className="flex items-center gap-2">
          <div className="flex items-center gap-1.5">
            <div className="relative">
              <div className="w-2 h-2 bg-green-600 rounded-full animate-pulse"></div>
              <div className="absolute top-0 left-0 w-2 h-2 bg-green-600 rounded-full animate-ping"></div>
            </div>
            <span className="font-bold text-xs">Network Debug</span>
          </div>

          {/* Stats */}
          <div className="flex items-center gap-2 text-xs">
            <div className="flex items-center gap-1">
              <span className="font-medium">{stats.totalCalls}</span>
              <span className="text-black/70">calls</span>
            </div>
            <div className="flex items-center gap-1">
              <span className="font-medium">{stats.totalRoutes}</span>
              <span className="text-black/70">routes</span>
            </div>
          </div>

          {/* Current route and phase */}
          {currentRoute && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-black/70">|</span>
              <span className="font-medium truncate max-w-[150px]" title={currentRoute}>
                {currentRoute}
              </span>
              <span
                className={`px-1.5 py-0.5 rounded text-xs font-bold ${
                  currentLoadPhase === 'cold'
                    ? 'bg-blue-600 text-white'
                    : currentLoadPhase === 'warm'
                    ? 'bg-green-600 text-white'
                    : 'bg-gray-600 text-white'
                }`}
              >
                {currentLoadPhase}
              </span>
            </div>
          )}

          {/* Warm Reload Pending Indicator */}
          {warmReloadPending && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-black/70">|</span>
              <div className="flex items-center gap-1 bg-yellow-600 text-white px-2 py-0.5 rounded">
                <div className="w-2 h-2 bg-white rounded-full animate-pulse"></div>
                <span className="font-medium">Waiting for reload...</span>
              </div>
            </div>
          )}

          {/* Auto-save Status Indicators */}
          {autoSaveStatus === 'pending' && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-black/70">|</span>
              <div className="flex items-center gap-1 bg-gray-600 text-white px-2 py-0.5 rounded">
                <span className="font-medium">Auto-save pending</span>
              </div>
            </div>
          )}

          {autoSaveStatus === 'saving' && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-black/70">|</span>
              <div className="flex items-center gap-1 bg-blue-600 text-white px-2 py-0.5 rounded">
                <div className="w-2 h-2 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                <span className="font-medium">Saving...</span>
              </div>
            </div>
          )}

          {autoSaveStatus === 'completed' && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-black/70">|</span>
              <div className="flex items-center gap-1 bg-green-600 text-white px-2 py-0.5 rounded">
                <span className="font-bold">✓</span>
                <span className="font-medium">Saved</span>
              </div>
            </div>
          )}

          {autoSaveStatus === 'error' && (
            <div className="flex items-center gap-1.5 text-xs">
              <span className="text-black/70">|</span>
              <div
                className="flex items-center gap-1 bg-red-600 text-white px-2 py-0.5 rounded cursor-help"
                title={autoSaveError || 'Save failed'}
              >
                <span className="font-bold">✗</span>
                <span className="font-medium">Save failed</span>
              </div>
            </div>
          )}
        </div>

        {/* Right side - Actions */}
        <div className="flex items-center gap-1.5">
          {/* Purge cache checkbox */}
          <label className="flex items-center gap-1 cursor-pointer" title="Clear localStorage cache: entries on each page load">
            <input
              type="checkbox"
              checked={purgeCacheOnLoad}
              onChange={(e) => {
                const checked = e.target.checked;
                setPurgeCacheOnLoad(checked);
                try {
                  localStorage.setItem('networkDebug:purgeCacheOnLoad', checked.toString());
                } catch (error) {
                  logger.warn('Failed to save purge cache preference', { error });
                }
                logger.info('Purge cache on load', { enabled: checked });
              }}
              className="w-3 h-3"
            />
            <span className="text-xs hidden lg:inline">Purge Cache</span>
          </label>

          {/* DevTools reminder */}
          <span className="text-xs text-black/70 hidden xl:block">
            Enable "Disable cache" in DevTools
          </span>

          {/* View Dashboard button */}
          <a
            href="/debug/network"
            className="bg-black/20 hover:bg-black/30 px-2 py-0.5 rounded text-xs font-medium transition-colors"
          >
            Dashboard
          </a>

          {/* Retrack button - only show if current route is fully tracked */}
          {currentRoute && currentLoadPhase === 'completed' && routeData[currentRoute]?.autoReloadCompleted && (
            <button
              onClick={() => {
                if (confirm(`Retrack route "${currentRoute}"? This will reload the page and track it again.`)) {
                  retrackRoute(currentRoute);
                }
              }}
              className="bg-blue-600 hover:bg-blue-700 text-white px-2 py-0.5 rounded text-xs font-medium transition-colors"
              title="Clear tracking data for this route and reload to retrack"
            >
              Retrack
            </button>
          )}

          {/* Clear session button */}
          <button
            onClick={() => {
              if (confirm('Clear network debug session? This will reset all tracked data.')) {
                clearSession();
                logger.info('Network debug session cleared by user');
              }
            }}
            className="bg-black/20 hover:bg-black/30 px-2 py-0.5 rounded text-xs font-medium transition-colors"
            title="Clear session data"
          >
            Clear
          </button>

          {/* Hide button */}
          <button
            onClick={() => setIsVisible(false)}
            className="bg-black/20 hover:bg-black/30 px-1.5 py-0.5 rounded text-xs font-medium transition-colors"
            title="Hide banner (temporary)"
          >
            ✕
          </button>
        </div>
      </div>
    </div>
  );
};

export default NetworkDebugBanner;
