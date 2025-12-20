import React, { useState, useEffect } from 'react';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { cacheName, getItem, setItem, removeItem } from '../../utils/storageManager';

/**
 * Development Banner Component
 *
 * Displays a dismissible banner at the bottom of the page warning users
 * that the site is in early development.
 *
 * Features:
 * - Dismissible with X button
 * - Remembers dismissal in localStorage (expires after configured minutes)
 * - Compact design
 * - Responsive
 * - Auto-reappears after expiry time
 * - Can be enabled/disabled via wiki-config.json
 *
 * Configuration:
 * - features.developmentBanner.enabled - Enable/disable the banner
 * - features.developmentBanner.expiryMinutes - Minutes until dismissal expires
 */

const DevelopmentBanner = () => {
  const { config } = useWikiConfig();
  const [visible, setVisible] = useState(false);
  const STORAGE_KEY = cacheName('dev_banner_dismissed');

  // Get config values with defaults
  const bannerEnabled = config?.features?.developmentBanner?.enabled ?? false;
  const expiryMinutes = config?.features?.developmentBanner?.expiryMinutes ?? 60;

  useEffect(() => {
    // Don't show banner if disabled in config
    if (!bannerEnabled) {
      setVisible(false);
      return;
    }

    // Check if banner was previously dismissed
    const dismissedData = getItem(STORAGE_KEY);

    if (!dismissedData) {
      // Never dismissed before - show banner
      setVisible(true);
      return;
    }

    try {
      const { timestamp } = dismissedData;
      const now = Date.now();
      const expiryTime = timestamp + (expiryMinutes * 60 * 1000);

      if (now > expiryTime) {
        // Expired - remove from storage and show banner
        removeItem(STORAGE_KEY);
        setVisible(true);
      } else {
        // Still within expiry time - keep hidden
        setVisible(false);
      }
    } catch (error) {
      // Invalid data - remove and show banner
      removeItem(STORAGE_KEY);
      setVisible(true);
    }
  }, [bannerEnabled, expiryMinutes, STORAGE_KEY]);

  const handleDismiss = () => {
    setVisible(false);
    const dismissalData = {
      timestamp: Date.now()
    };
    setItem(STORAGE_KEY, dismissalData);
  };

  // Don't render if disabled or not visible
  if (!bannerEnabled || !visible) return null;

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gradient-to-r from-amber-50 to-yellow-50 dark:from-amber-900/90 dark:to-yellow-900/90 border-t-2 border-amber-500 dark:border-amber-400 shadow-lg">
      <div className="max-w-7xl mx-auto px-4 py-2.5 flex items-center justify-between gap-4">
        {/* Icon */}
        <div className="flex-shrink-0">
          <svg className="w-5 h-5 text-amber-600 dark:text-amber-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
          </svg>
        </div>

        {/* Message */}
        <div className="flex-1 min-w-0">
          <p className="text-xs sm:text-sm text-amber-800 dark:text-amber-200">
            <span className="font-semibold">Early Development:</span> This site is actively being built. Some features may break, and you'll see placeholder content as we finish things off.
          </p>
        </div>

        {/* Dismiss button */}
        <button
          onClick={handleDismiss}
          className="flex-shrink-0 text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 transition-colors"
          aria-label="Dismiss banner"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>
    </div>
  );
};

export default DevelopmentBanner;
