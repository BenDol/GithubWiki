import { useRef, useEffect } from 'react';

/**
 * SearchResults component
 * Displays search results with highlighting
 */
const SearchResults = ({ results, query, onResultClick, selectedIndex = 0 }) => {
  const selectedRef = useRef(null);

  // Scroll selected item into view
  useEffect(() => {
    if (selectedRef.current) {
      selectedRef.current.scrollIntoView({
        block: 'nearest',
        behavior: 'smooth'
      });
    }
  }, [selectedIndex]);

  const highlightText = (text, query) => {
    if (!text || !query) return text;

    const regex = new RegExp(`(${query})`, 'gi');
    const parts = text.split(regex);

    return parts.map((part, index) =>
      regex.test(part) ? (
        <mark key={index} className="bg-yellow-200 dark:bg-yellow-900 text-gray-900 dark:text-white">
          {part}
        </mark>
      ) : (
        part
      )
    );
  };

  return (
    <div className="divide-y divide-gray-200 dark:divide-gray-700">
      {results.map((result, index) => (
        <button
          key={result.id}
          ref={index === selectedIndex ? selectedRef : null}
          onClick={() => onResultClick(result)}
          className={`w-full text-left p-4 transition-colors focus:outline-none ${
            index === selectedIndex
              ? 'bg-blue-50 dark:bg-blue-900/20 border-l-4 border-blue-500'
              : 'hover:bg-gray-50 dark:hover:bg-gray-700'
          }`}
        >
          <div className="flex items-start space-x-3">
            {/* Icon */}
            <div className="flex-shrink-0 mt-1">
              <svg className="w-5 h-5 text-blue-500" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
              </svg>
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              {/* Title */}
              <h3 className="text-base font-medium text-gray-900 dark:text-white mb-1">
                {highlightText(result.title, query)}
              </h3>

              {/* Breadcrumb */}
              <div className="flex items-center space-x-2 text-xs text-gray-500 dark:text-gray-400 mb-2">
                <span>{result.sectionTitle}</span>
                {result.category && (
                  <>
                    <span>•</span>
                    <span>{result.category}</span>
                  </>
                )}
              </div>

              {/* Description */}
              {result.description && (
                <p className="text-sm text-gray-600 dark:text-gray-400 line-clamp-2">
                  {highlightText(result.description, query)}
                </p>
              )}

              {/* Tags */}
              {result.tags && result.tags.length > 0 && (
                <div className="flex flex-wrap gap-1 mt-2">
                  {result.tags.slice(0, 3).map((tag) => (
                    <span
                      key={tag}
                      className="px-2 py-0.5 text-xs bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded-full"
                    >
                      {tag}
                    </span>
                  ))}
                  {result.tags.length > 3 && (
                    <span className="px-2 py-0.5 text-xs text-gray-500 dark:text-gray-400">
                      +{result.tags.length - 3} more
                    </span>
                  )}
                </div>
              )}
            </div>

            {/* Arrow */}
            <div className="flex-shrink-0">
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </div>
        </button>
      ))}
    </div>
  );
};

export default SearchResults;
