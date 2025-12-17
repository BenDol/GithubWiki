import { useState, useEffect, useRef } from 'react';

/**
 * DataAutocomplete - Autocomplete dropdown for {{data: syntax
 * Shows suggestions as user types and allows selection
 */
const DataAutocomplete = ({ visible, position, query, suggestions, onSelect, onClose }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef(null);

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions]);

  // Handle keyboard navigation
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e) => {
      if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex(prev => Math.min(prev + 1, suggestions.length - 1));
      } else if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex(prev => Math.max(prev - 1, 0));
      } else if (e.key === 'Enter') {
        e.preventDefault();
        if (suggestions[selectedIndex]) {
          onSelect(suggestions[selectedIndex]);
        }
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [visible, selectedIndex, suggestions, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (containerRef.current && visible) {
      const selected = containerRef.current.querySelector('.selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, visible]);

  if (!visible || suggestions.length === 0) return null;

  return (
    <div
      ref={containerRef}
      className="fixed bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg shadow-2xl z-[10000] max-h-64 overflow-y-auto"
      style={{
        top: `${position.top + 20}px`,
        left: `${position.left}px`,
        minWidth: '400px',
        maxWidth: '600px'
      }}
    >
      {/* Header */}
      <div className="sticky top-0 bg-gray-50 dark:bg-gray-900 px-3 py-2 border-b border-gray-200 dark:border-gray-700">
        <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center justify-between">
          <span>Data Suggestions {query && `for "${query}"`}</span>
          <span className="text-[10px] text-gray-500">↑↓ Navigate • Enter Select • Esc Close</span>
        </div>
      </div>

      {/* Suggestions */}
      <div className="py-1">
        {suggestions.map((suggestion, idx) => (
          <button
            key={idx}
            onClick={() => onSelect(suggestion)}
            onMouseEnter={() => setSelectedIndex(idx)}
            className={`w-full px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors ${
              idx === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/30 selected' : ''
            }`}
          >
            <div className="flex items-start gap-2">
              {/* Icon */}
              <span className="text-lg flex-shrink-0 mt-0.5">{suggestion.icon}</span>

              {/* Content */}
              <div className="flex-1 min-w-0">
                {/* Source and Field Path */}
                <div className="text-xs font-medium text-gray-900 dark:text-white mb-0.5">
                  <span className="text-blue-600 dark:text-blue-400">{suggestion.sourceLabel}</span>
                  {suggestion.fieldPath && (
                    <>
                      <span className="text-gray-400 mx-1">›</span>
                      <span className="font-mono text-gray-700 dark:text-gray-300">{suggestion.fieldPath}</span>
                    </>
                  )}
                </div>

                {/* Primary Display */}
                <div className="text-sm text-gray-800 dark:text-gray-200 truncate">
                  {suggestion.primaryDisplay}
                </div>

                {/* Preview Value */}
                {suggestion.previewValue && (
                  <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                    Preview: {suggestion.previewValue}
                  </div>
                )}

                {/* Insert Syntax */}
                <div className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mt-1 truncate">
                  Will insert: {suggestion.insertSyntax}
                </div>
              </div>

              {/* Match Score (debug) */}
              {suggestion.matchScore !== undefined && (
                <div className="text-[9px] text-gray-400 flex-shrink-0">
                  {Math.round(suggestion.matchScore)}%
                </div>
              )}
            </div>
          </button>
        ))}
      </div>

      {/* Footer */}
      {suggestions.length > 10 && (
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 px-3 py-1 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-500 dark:text-gray-400 text-center">
          Showing {suggestions.length} result{suggestions.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default DataAutocomplete;
