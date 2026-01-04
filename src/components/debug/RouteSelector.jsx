import React from 'react';

/**
 * Route Selector Component
 *
 * Dropdown selector for choosing which route to view detailed network stats for.
 */
const RouteSelector = ({ routes, currentRoute, onRouteChange }) => {
  if (!routes || routes.length === 0) {
    return (
      <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-yellow-800">
        <p className="text-sm">No routes tracked yet. Navigate to some pages to start tracking network activity.</p>
      </div>
    );
  }

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow p-4">
      <label htmlFor="route-select" className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
        Select Route
      </label>
      <select
        id="route-select"
        value={currentRoute || ''}
        onChange={(e) => onRouteChange(e.target.value)}
        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-md shadow-sm focus:outline-none focus:ring-blue-500 focus:border-blue-500 dark:bg-gray-700 dark:text-white"
      >
        {!currentRoute && <option value="">-- Select a route --</option>}
        {routes.map((route) => (
          <option key={route} value={route}>
            {route}
          </option>
        ))}
      </select>
      <p className="mt-2 text-xs text-gray-500 dark:text-gray-400">
        {routes.length} route{routes.length !== 1 ? 's' : ''} tracked in this session
      </p>
    </div>
  );
};

export default RouteSelector;
