/**
 * System Information Utility
 *
 * Provides functions to detect browser, OS, and collect system information
 * for issue reporting and debugging purposes.
 */

/**
 * Detects browser name and version from user agent
 * @param {string} userAgent - Navigator user agent string
 * @returns {string} Browser name and version (e.g., "Chrome 120.0.0")
 */
export const detectBrowser = (userAgent) => {
  // Chrome (must be before Safari check as Chrome includes Safari in UA)
  if (/Chrome\/(\d+\.\d+\.\d+)/.test(userAgent) && !/Edg/.test(userAgent)) {
    const version = userAgent.match(/Chrome\/(\d+\.\d+\.\d+)/)[1];
    return `Chrome ${version}`;
  }

  // Edge (Chromium-based)
  if (/Edg\/(\d+\.\d+\.\d+)/.test(userAgent)) {
    const version = userAgent.match(/Edg\/(\d+\.\d+\.\d+)/)[1];
    return `Edge ${version}`;
  }

  // Firefox
  if (/Firefox\/(\d+\.\d+)/.test(userAgent)) {
    const version = userAgent.match(/Firefox\/(\d+\.\d+)/)[1];
    return `Firefox ${version}`;
  }

  // Safari (must be after Chrome check)
  if (/Safari\/(\d+\.\d+)/.test(userAgent) && !/Chrome/.test(userAgent)) {
    const version = userAgent.match(/Version\/(\d+\.\d+)/)?.[1] || 'Unknown';
    return `Safari ${version}`;
  }

  // Opera
  if (/OPR\/(\d+\.\d+\.\d+)/.test(userAgent)) {
    const version = userAgent.match(/OPR\/(\d+\.\d+\.\d+)/)[1];
    return `Opera ${version}`;
  }

  return 'Unknown Browser';
};

/**
 * Detects operating system from user agent
 * @param {string} userAgent - Navigator user agent string
 * @returns {string} OS name (e.g., "Windows 10", "macOS", "Linux")
 */
export const detectOS = (userAgent) => {
  // Windows
  if (/Windows NT 10.0/.test(userAgent)) return 'Windows 10';
  if (/Windows NT 11.0/.test(userAgent)) return 'Windows 11';
  if (/Windows NT 6.3/.test(userAgent)) return 'Windows 8.1';
  if (/Windows NT 6.2/.test(userAgent)) return 'Windows 8';
  if (/Windows NT 6.1/.test(userAgent)) return 'Windows 7';
  if (/Windows/.test(userAgent)) return 'Windows';

  // macOS
  if (/Mac OS X/.test(userAgent)) {
    const version = userAgent.match(/Mac OS X (\d+[._]\d+)/)?.[1].replace('_', '.') || '';
    return version ? `macOS ${version}` : 'macOS';
  }

  // Mobile
  if (/Android/.test(userAgent)) {
    const version = userAgent.match(/Android (\d+\.\d+)/)?.[1] || '';
    return version ? `Android ${version}` : 'Android';
  }
  if (/iOS/.test(userAgent) || (/iPhone|iPad|iPod/.test(userAgent))) {
    const version = userAgent.match(/OS (\d+_\d+)/)?.[1].replace('_', '.') || '';
    return version ? `iOS ${version}` : 'iOS';
  }

  // Linux
  if (/Linux/.test(userAgent)) return 'Linux';

  return 'Unknown OS';
};

/**
 * Collects all system information
 * @returns {Object} System info object with browser, OS, screen, and timestamp
 */
export const collectSystemInfo = () => {
  const ua = navigator.userAgent;
  return {
    browser: detectBrowser(ua),
    os: detectOS(ua),
    screen: `${window.screen.width}x${window.screen.height}`,
    timestamp: new Date().toISOString()
  };
};
