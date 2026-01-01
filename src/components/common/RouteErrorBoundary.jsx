import { useRouteError, useNavigate } from 'react-router-dom';
import { useEffect } from 'react';

/**
 * Route Error Boundary component for React Router
 * Catches errors in route components and displays user-friendly error UI
 * Integrates with debug logging system
 *
 * This is different from the class-based ErrorBoundary - this component
 * specifically handles routing errors using React Router's errorElement prop
 */
const RouteErrorBoundary = () => {
  const error = useRouteError();
  const navigate = useNavigate();

  // Log error to debug system
  useEffect(() => {
    if (error) {
      const logError = async () => {
        try {
          // Only call log endpoint in development (if enabled in config)
          const isLoggingEnabled = window.__WIKI_CONFIG__?.features?.enableRemoteLoggingInDev ?? false;
          if (import.meta.env.DEV && isLoggingEnabled) {
            await fetch('/api/log', {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                type: 'error',
                message: `Route Error: ${error.message || error.statusText || 'Unknown error'}`,
                data: {
                  status: error.status,
                  statusText: error.statusText,
                  path: window.location.pathname + window.location.search + window.location.hash,
                },
                stack: error.stack || error.error?.stack,
              }),
            });
          }
        } catch (err) {
          console.error('Failed to log error:', err);
        }
      };
      logError();
    }
  }, [error]);

  // Determine error type and message
  const getErrorInfo = () => {
    if (error?.status === 404) {
      return {
        title: '404 - Page Not Found',
        message: 'The page you are looking for does not exist.',
        icon: '🔍',
        showBackButton: true,
      };
    }

    if (error?.status === 403) {
      return {
        title: '403 - Access Denied',
        message: 'You do not have permission to access this resource.',
        icon: '🔒',
        showBackButton: true,
      };
    }

    if (error?.status === 500) {
      return {
        title: '500 - Server Error',
        message: 'An internal server error occurred. Please try again later.',
        icon: '⚠️',
        showBackButton: true,
      };
    }

    // Generic error
    return {
      title: 'Something Went Wrong',
      message: error?.message || error?.statusText || 'An unexpected error occurred.',
      icon: '⚠️',
      showBackButton: true,
    };
  };

  const errorInfo = getErrorInfo();

  const handleGoBack = () => {
    if (window.history.length > 1) {
      navigate(-1);
    } else {
      navigate('/');
    }
  };

  const handleGoHome = () => {
    navigate('/');
  };

  const handleReload = () => {
    window.location.reload();
  };

  return (
    <div className="min-h-[calc(100vh-64px)] flex items-center justify-center bg-gray-50 dark:bg-gray-900 p-4">
      <div className="max-w-2xl w-full">
        {/* Error Card */}
        <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 overflow-hidden">
          {/* Header */}
          <div className="bg-red-50 dark:bg-red-900/20 border-b border-red-100 dark:border-red-800/30 p-6">
            <div className="flex items-center gap-4">
              <div className="text-6xl">{errorInfo.icon}</div>
              <div className="flex-1">
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-1">
                  {errorInfo.title}
                </h1>
                <p className="text-gray-600 dark:text-gray-400">
                  {errorInfo.message}
                </p>
              </div>
            </div>
          </div>

          {/* Error Details (for development) */}
          {import.meta.env.DEV && (error?.stack || error?.error?.stack) && (
            <div className="border-b border-gray-200 dark:border-gray-700 p-6 bg-gray-50 dark:bg-gray-900/50">
              <details className="group">
                <summary className="cursor-pointer font-medium text-gray-900 dark:text-white mb-2 flex items-center gap-2">
                  <span className="group-open:rotate-90 transition-transform">▶</span>
                  Error Details (Development Only)
                </summary>
                <div className="mt-2 p-4 bg-gray-900 dark:bg-gray-950 rounded-md overflow-x-auto">
                  <pre className="text-xs text-red-400 whitespace-pre-wrap font-mono">
                    {error.stack || error.error?.stack}
                  </pre>
                </div>
              </details>
            </div>
          )}

          {/* Actions */}
          <div className="p-6 space-y-3">
            <div className="flex flex-wrap gap-3">
              {errorInfo.showBackButton && (
                <button
                  onClick={handleGoBack}
                  className="flex-1 min-w-[120px] px-4 py-2 bg-blue-500 hover:bg-blue-600 text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
                >
                  <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                  </svg>
                  Go Back
                </button>
              )}
              <button
                onClick={handleGoHome}
                className="flex-1 min-w-[120px] px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6" />
                </svg>
                Go Home
              </button>
              <button
                onClick={handleReload}
                className="flex-1 min-w-[120px] px-4 py-2 bg-gray-200 hover:bg-gray-300 dark:bg-gray-700 dark:hover:bg-gray-600 text-gray-900 dark:text-white font-medium rounded-lg transition-colors duration-200 flex items-center justify-center gap-2"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Reload Page
              </button>
            </div>

            {/* Help Text */}
            <div className="mt-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-100 dark:border-blue-800/30 rounded-lg">
              <p className="text-sm text-blue-900 dark:text-blue-200">
                <span className="font-semibold">Need help?</span> Try checking the{' '}
                <button
                  onClick={() => {
                    // Open dev tools with Ctrl+Shift+D
                    window.dispatchEvent(new KeyboardEvent('keydown', {
                      key: 'D',
                      code: 'KeyD',
                      ctrlKey: true,
                      shiftKey: true,
                      bubbles: true,
                    }));
                  }}
                  className="underline hover:text-blue-700 dark:hover:text-blue-100"
                >
                  Developer Tools (Ctrl+Shift+D)
                </button>
                {' '}for more details about this error.
              </p>
            </div>
          </div>
        </div>

        {/* Additional Info */}
        <div className="mt-4 text-center text-sm text-gray-500 dark:text-gray-400">
          Error occurred at: {new Date().toLocaleString()}
        </div>
      </div>
    </div>
  );
};

export default RouteErrorBoundary;
