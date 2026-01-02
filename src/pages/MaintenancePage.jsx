import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWikiConfig } from '../hooks/useWikiConfig';

/**
 * Maintenance Mode Page
 * Displayed when wiki is in maintenance mode
 * Supports Markdown content, custom HTML, estimated return times
 */
const MaintenancePage = () => {
  const { config } = useWikiConfig();

  if (!config?.features?.maintenance) {
    return <DefaultMaintenanceView />;
  }

  const {
    title = "Maintenance in Progress",
    message = "We're currently performing scheduled maintenance.",
    details,
    estimatedReturn,
    contactEmail,
    showContactInfo = true,
    customHtml
  } = config.features.maintenance;

  // If custom HTML provided, render it (should sanitize in production)
  if (customHtml) {
    return (
      <div className="min-h-[80vh] flex items-center justify-center px-4">
        <div
          className="max-w-4xl w-full maintenance-custom-content"
          dangerouslySetInnerHTML={{ __html: customHtml }}
        />
      </div>
    );
  }

  return (
    <div className="min-h-[80vh] flex items-center justify-center px-4 bg-gray-50 dark:bg-gray-900">
      <div className="max-w-2xl w-full text-center">
        {/* Maintenance Icon */}
        <div className="mb-8">
          <div className="inline-flex items-center justify-center w-24 h-24 rounded-full bg-yellow-100 dark:bg-yellow-900/30">
            <svg
              className="w-12 h-12 text-yellow-600 dark:text-yellow-400"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
              aria-hidden="true"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"
              />
            </svg>
          </div>
        </div>

        {/* Title */}
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-4">
          {title}
        </h1>

        {/* Main Message (supports Markdown) */}
        <div className="text-lg text-gray-600 dark:text-gray-400 mb-6">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>{message}</ReactMarkdown>
        </div>

        {/* Extended Details (supports Markdown) */}
        {details && (
          <div className="bg-white dark:bg-gray-800 rounded-lg p-6 mb-6 border border-gray-200 dark:border-gray-700">
            <div className="text-gray-700 dark:text-gray-300 prose dark:prose-invert max-w-none text-left">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>{details}</ReactMarkdown>
            </div>
          </div>
        )}

        {/* Estimated Return Time */}
        {estimatedReturn && (
          <div className="mb-6">
            <EstimatedReturnTime time={estimatedReturn} />
          </div>
        )}

        {/* Contact Info */}
        {showContactInfo && contactEmail && (
          <div className="mt-8 pt-6 border-t border-gray-200 dark:border-gray-700">
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">
              Need urgent assistance?
            </p>
            <a
              href={`mailto:${contactEmail}`}
              className="text-blue-600 dark:text-blue-400 hover:underline font-medium"
            >
              {contactEmail}
            </a>
          </div>
        )}

        {/* Check Status Button */}
        <button
          onClick={() => window.location.reload()}
          className="mt-8 px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
        >
          Check Status
        </button>
      </div>
    </div>
  );
};

/**
 * Default maintenance view when no config provided
 */
const DefaultMaintenanceView = () => (
  <div className="min-h-[80vh] flex items-center justify-center px-4 bg-gray-50 dark:bg-gray-900">
    <div className="text-center max-w-md">
      <div className="text-6xl mb-4" role="img" aria-label="Maintenance">
        🔧
      </div>
      <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-4">
        Under Maintenance
      </h1>
      <p className="text-gray-600 dark:text-gray-400 mb-6">
        We'll be back shortly. Thank you for your patience!
      </p>
      <button
        onClick={() => window.location.reload()}
        className="px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium focus:outline-none focus:ring-2 focus:ring-blue-500 focus:ring-offset-2 dark:focus:ring-offset-gray-900"
      >
        Reload Page
      </button>
    </div>
  </div>
);

/**
 * Estimated return time component
 * Handles both ISO 8601 timestamps and plain text
 * Shows only time if return is same day, otherwise shows full date + time
 */
const EstimatedReturnTime = ({ time }) => {
  // Try to parse as ISO 8601 timestamp
  const date = new Date(time);
  const isValidDate = !isNaN(date.getTime());

  if (isValidDate) {
    // Check if the return time is on the same day as today
    const now = new Date();
    const isSameDay =
      date.getFullYear() === now.getFullYear() &&
      date.getMonth() === now.getMonth() &&
      date.getDate() === now.getDate();

    // Format: Show only time if same day, otherwise show full date + time (without seconds)
    const formattedTime = isSameDay
      ? date.toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' })
      : date.toLocaleString([], {
          year: 'numeric',
          month: 'numeric',
          day: 'numeric',
          hour: 'numeric',
          minute: '2-digit'
        });

    return (
      <div className="inline-flex items-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
        <svg
          className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          aria-hidden="true"
        >
          <path
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth={2}
            d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
          />
        </svg>
        <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
          Expected back: {formattedTime}
        </span>
      </div>
    );
  }

  // Fallback: render as plain text
  return (
    <div className="inline-flex items-center px-4 py-2 bg-blue-50 dark:bg-blue-900/20 rounded-lg">
      <svg
        className="w-5 h-5 text-blue-600 dark:text-blue-400 mr-2"
        fill="none"
        stroke="currentColor"
        viewBox="0 0 24 24"
        aria-hidden="true"
      >
        <path
          strokeLinecap="round"
          strokeLinejoin="round"
          strokeWidth={2}
          d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z"
        />
      </svg>
      <span className="text-sm font-medium text-blue-900 dark:text-blue-200">
        {time}
      </span>
    </div>
  );
};

export default MaintenancePage;
