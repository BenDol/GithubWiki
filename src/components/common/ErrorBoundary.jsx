import { Component } from 'react';
import { Link } from 'react-router-dom';

/**
 * Error Boundary component
 * Catches JavaScript errors in the component tree and displays a fallback UI
 */
class ErrorBoundary extends Component {
  constructor(props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error) {
    return { hasError: true };
  }

  componentDidCatch(error, errorInfo) {
    console.error('Error caught by boundary:', error, errorInfo);

    // Check if this is a chunk loading error
    const isChunkLoadError =
      error?.message?.includes('Failed to fetch dynamically imported module') ||
      error?.message?.includes('Failed to fetch module') ||
      error?.message?.includes('error loading dynamically imported module') ||
      error?.name === 'ChunkLoadError';

    if (isChunkLoadError) {
      const hasRefreshed = sessionStorage.getItem('chunk-load-error-refreshed') === 'true';

      if (!hasRefreshed) {
        console.warn('[ErrorBoundary] Chunk load error detected, reloading page...', error);
        sessionStorage.setItem('chunk-load-error-refreshed', 'true');
        window.location.reload();
        return; // Don't set error state, page will reload
      } else {
        // Already tried reload, clear flag and show error
        console.error('[ErrorBoundary] Chunk load error persists after reload', error);
        sessionStorage.removeItem('chunk-load-error-refreshed');
      }
    }

    this.setState({
      hasError: true,
      error,
      errorInfo,
    });

    // Log error to debug system (development only, if enabled in config)
    const isLoggingEnabled = window.__WIKI_CONFIG__?.features?.enableRemoteLoggingInDev ?? false;
    if (import.meta.env.DEV && isLoggingEnabled) {
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'error',
          message: `Component Error: ${error.message || 'Unknown error'}`,
          data: {
            componentStack: errorInfo.componentStack,
            path: window.location.pathname + window.location.search + window.location.hash,
          },
          stack: error.stack,
        }),
      }).catch(err => {
        console.error('Failed to log error:', err);
      });
    }
  }

  handleReset = () => {
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
    window.location.href = '/';
  };

  render() {
    if (this.state.hasError) {
      return (
        <div className="min-h-screen bg-gray-50 dark:bg-gray-900 flex items-center justify-center px-4">
          <div className="max-w-2xl w-full">
            <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-8">
              <div className="flex items-center space-x-3 mb-6">
                <div className="flex-shrink-0">
                  <svg
                    className="w-12 h-12 text-red-500"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
                    />
                  </svg>
                </div>
                <div>
                  <h1 className="text-2xl font-bold text-gray-900 dark:text-white">
                    Something went wrong
                  </h1>
                  <p className="text-gray-600 dark:text-gray-400 mt-1">
                    An unexpected error occurred
                  </p>
                </div>
              </div>

              {this.state.error && (
                <div className="mb-6 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
                  <h3 className="text-sm font-semibold text-red-900 dark:text-red-200 mb-2">
                    Error Details:
                  </h3>
                  <p className="text-sm text-red-800 dark:text-red-300 font-mono">
                    {this.state.error.toString()}
                  </p>
                </div>
              )}

              <div className="space-y-4">
                <p className="text-gray-700 dark:text-gray-300">
                  We apologize for the inconvenience. This error has been logged and we'll look into it.
                </p>

                <div className="flex flex-col sm:flex-row gap-3">
                  <button
                    onClick={this.handleReset}
                    className="inline-flex items-center justify-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M3 12l2-2m0 0l7-7 7 7M5 10v10a1 1 0 001 1h3m10-11l2 2m-2-2v10a1 1 0 01-1 1h-3m-6 0a1 1 0 001-1v-4a1 1 0 011-1h2a1 1 0 011 1v4a1 1 0 001 1m-6 0h6"
                      />
                    </svg>
                    Go to Homepage
                  </button>

                  <button
                    onClick={() => window.location.reload()}
                    className="inline-flex items-center justify-center px-6 py-3 bg-white dark:bg-gray-700 text-gray-700 dark:text-gray-300 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-600 transition-colors font-medium"
                  >
                    <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path
                        strokeLinecap="round"
                        strokeLinejoin="round"
                        strokeWidth={2}
                        d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15"
                      />
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

              {process.env.NODE_ENV === 'development' && this.state.errorInfo && (
                <details className="mt-6 p-4 bg-gray-100 dark:bg-gray-900 rounded-lg">
                  <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-white mb-2">
                    Component Stack (Development Only)
                  </summary>
                  <pre className="text-xs text-gray-700 dark:text-gray-300 overflow-x-auto">
                    {this.state.errorInfo.componentStack}
                  </pre>
                </details>
              )}
            </div>
          </div>
        </div>
      );
    }

    return this.props.children;
  }
}

export default ErrorBoundary;
