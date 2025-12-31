import { useState, useEffect, useRef } from 'react';
import { createLogger } from '../../utils/logger';

const logger = createLogger('DataAutocomplete');

/**
 * DataAutocomplete - Autocomplete dropdown for {{data: syntax
 * Shows suggestions as user types and allows hierarchical navigation
 */
const DataAutocomplete = ({ visible, position, query, suggestions, searchModule, onSelect, onClose }) => {
  const [selectedIndex, setSelectedIndex] = useState(0);
  const containerRef = useRef(null);

  // Navigation state
  const [navigationMode, setNavigationMode] = useState('search');
  const [navigationStack, setNavigationStack] = useState([]);
  const [currentContext, setCurrentContext] = useState({
    sourceKey: null,
    sourceLabel: null,
    itemId: null,
    itemName: null,
    query: ''
  });
  const [internalSuggestions, setInternalSuggestions] = useState([]);

  // Navigation helper functions
  const fetchDatasetItems = async (sourceKey, sourceLabel, query) => {
    if (!searchModule || !searchModule.getDatasetItems) {
      logger.error('searchModule.getDatasetItems not available');
      return;
    }

    try {
      const items = await searchModule.getDatasetItems(sourceKey, query);
      setInternalSuggestions(items);
      setSelectedIndex(0);
    } catch (err) {
      logger.error('Failed to fetch dataset items', { sourceKey, error: err });
      setInternalSuggestions([{
        type: 'error',
        message: `Failed to load items from ${sourceLabel}`,
        isError: true
      }]);
    }
  };

  const fetchItemFields = async (sourceKey, sourceLabel, itemId, itemName) => {
    if (!searchModule || !searchModule.getItemFields) {
      logger.error('searchModule.getItemFields not available');
      return;
    }

    try {
      const fields = await searchModule.getItemFields(sourceKey, itemId);
      setInternalSuggestions(fields);
      setSelectedIndex(0);
    } catch (err) {
      logger.error('Failed to fetch item fields', { sourceKey, itemId, error: err });
      setInternalSuggestions([{
        type: 'error',
        message: `Failed to load fields for ${itemName}`,
        isError: true
      }]);
    }
  };

  const handleDrillIn = (suggestion) => {
    // Save current state to stack
    const currentSuggestions = internalSuggestions.length > 0 ? internalSuggestions : suggestions;
    setNavigationStack(prev => [...prev, {
      mode: navigationMode,
      context: currentContext,
      suggestions: currentSuggestions,
      selectedIndex: selectedIndex
    }]);

    if (suggestion.type === 'dataset') {
      // Drilling into a dataset
      setNavigationMode('dataset-items');
      setCurrentContext({
        sourceKey: suggestion.sourceKey,
        sourceLabel: suggestion.sourceLabel,
        itemId: null,
        itemName: null,
        query: query
      });
      fetchDatasetItems(suggestion.sourceKey, suggestion.sourceLabel, query);
    } else if (suggestion.type === 'full-object' && suggestion.canDrillIn) {
      // Drilling into an item
      setNavigationMode('item-fields');
      setCurrentContext({
        sourceKey: suggestion.sourceKey,
        sourceLabel: suggestion.sourceLabel,
        itemId: suggestion.itemId,
        itemName: suggestion.primaryDisplay,
        query: query
      });
      fetchItemFields(suggestion.sourceKey, suggestion.sourceLabel, suggestion.itemId, suggestion.primaryDisplay);
    }
  };

  const goBack = () => {
    if (navigationStack.length === 0) return;

    const previousState = navigationStack[navigationStack.length - 1];
    setNavigationStack(prev => prev.slice(0, -1));
    setNavigationMode(previousState.mode);
    setCurrentContext(previousState.context);
    setInternalSuggestions(previousState.suggestions);
    setSelectedIndex(previousState.selectedIndex);
  };

  const resetNavigation = () => {
    setNavigationMode('search');
    setNavigationStack([]);
    setCurrentContext({
      sourceKey: null,
      sourceLabel: null,
      itemId: null,
      itemName: null,
      query: ''
    });
    setInternalSuggestions([]);
    setSelectedIndex(0);
  };

  // Reset selection when suggestions change
  useEffect(() => {
    setSelectedIndex(0);
  }, [suggestions]);

  // Handle query changes while drilled in - return to search mode
  useEffect(() => {
    if (navigationMode !== 'search' && query !== currentContext.query) {
      resetNavigation();
    }
  }, [query, navigationMode, currentContext.query]);

  // Handle keyboard navigation with capture phase to intercept before editor
  useEffect(() => {
    if (!visible) return;

    const handleKeyDown = (e) => {
      // Get current suggestions (internal if navigated, or external from search)
      const currentSuggestions = internalSuggestions.length > 0 ? internalSuggestions : suggestions;

      // Only handle keys when autocomplete is visible
      if (e.key === 'ArrowDown' || e.key === 'ArrowUp' || e.key === 'Enter' || e.key === 'Escape') {
        // Stop event from reaching editor
        e.preventDefault();
        e.stopPropagation();

        if (e.key === 'ArrowDown') {
          setSelectedIndex(prev => Math.min(prev + 1, currentSuggestions.length - 1));
        } else if (e.key === 'ArrowUp') {
          setSelectedIndex(prev => Math.max(prev - 1, 0));
        } else if (e.key === 'Enter') {
          const suggestion = currentSuggestions[selectedIndex];
          if (!suggestion) return;

          // Unified drill-in logic
          if (suggestion.canDrillIn) {
            handleDrillIn(suggestion);
          } else if (suggestion.insertSyntax) {
            // Final selection - insert syntax
            onSelect(suggestion);
            resetNavigation();
          } else if (suggestion.isError) {
            // Error message - do nothing, user should press Escape
            return;
          } else {
            logger.warn('Non-insertable, non-drillable suggestion', suggestion);
          }
        } else if (e.key === 'Escape') {
          if (navigationStack.length > 0) {
            // Go back one level
            goBack();
          } else {
            // Close autocomplete
            onClose();
          }
        }
      }
    };

    // Use capture phase to intercept events before they reach the editor
    window.addEventListener('keydown', handleKeyDown, true);
    return () => window.removeEventListener('keydown', handleKeyDown, true);
  }, [visible, selectedIndex, suggestions, internalSuggestions, navigationStack, onSelect, onClose]);

  // Scroll selected item into view
  useEffect(() => {
    if (containerRef.current && visible) {
      const selected = containerRef.current.querySelector('.selected');
      if (selected) {
        selected.scrollIntoView({ block: 'nearest' });
      }
    }
  }, [selectedIndex, visible]);

  // Use internal suggestions if navigated, otherwise use external suggestions
  const currentSuggestions = internalSuggestions.length > 0 ? internalSuggestions : suggestions;

  if (!visible || (currentSuggestions.length === 0 && navigationMode === 'search')) return null;

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
        {navigationStack.length > 0 ? (
          <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center gap-2">
            <button
              onClick={goBack}
              className="hover:text-blue-600 dark:hover:text-blue-400 flex items-center gap-1 transition-colors"
            >
              ← Back
            </button>
            <span className="text-gray-400">|</span>
            {/* Show breadcrumb path */}
            {navigationMode === 'dataset-items' && (
              <span>{currentContext.sourceLabel} › All items</span>
            )}
            {navigationMode === 'item-fields' && (
              <span>{currentContext.sourceLabel} › {currentContext.itemName} › Fields</span>
            )}
          </div>
        ) : (
          <div className="text-xs font-semibold text-gray-600 dark:text-gray-400 flex items-center justify-between">
            <span>{query ? `Searching: "${query}"` : 'Data Suggestions'}</span>
            <span className="text-[10px] text-gray-500">↑↓ Navigate • Enter Select/Drill • Esc Back/Close</span>
          </div>
        )}
      </div>

      {/* Suggestions */}
      <div className="py-1">
        {currentSuggestions.map((suggestion, idx) => {
          // Handle error messages
          if (suggestion.isError) {
            return (
              <div
                key={idx}
                className="px-3 py-4 text-center text-red-600 dark:text-red-400"
              >
                <div className="text-sm font-medium mb-1">{suggestion.message}</div>
                <div className="text-xs text-gray-500 dark:text-gray-400">
                  Press Escape to go back
                </div>
              </div>
            );
          }

          // Special styling for "Entire Card"
          if (suggestion.isEntireCard) {
            return (
              <button
                key={idx}
                onClick={() => { onSelect(suggestion); resetNavigation(); }}
                onMouseEnter={() => setSelectedIndex(idx)}
                className={`w-full px-3 py-3 text-left transition-colors ${
                  idx === selectedIndex ? 'bg-blue-100 dark:bg-blue-900/40 selected' : 'bg-blue-50 dark:bg-blue-900/20 hover:bg-blue-100 dark:hover:bg-blue-900/40'
                }`}
              >
                <div className="flex items-center gap-3">
                  <span className="text-2xl">{suggestion.icon}</span>
                  <div className="flex-1">
                    <div className="font-semibold text-blue-700 dark:text-blue-300">
                      Entire Card
                    </div>
                    <div className="text-xs text-blue-600 dark:text-blue-400 mt-0.5">
                      Insert complete data object with all fields
                    </div>
                  </div>
                </div>
              </button>
            );
          }

          // Regular suggestion rendering
          return (
            <button
              key={idx}
              onClick={() => {
                if (suggestion.canDrillIn) {
                  handleDrillIn(suggestion);
                } else {
                  onSelect(suggestion);
                  resetNavigation();
                }
              }}
              onMouseEnter={() => setSelectedIndex(idx)}
              className={`w-full px-3 py-2 text-left hover:bg-blue-50 dark:hover:bg-blue-900/30 transition-colors ${
                idx === selectedIndex ? 'bg-blue-50 dark:bg-blue-900/30 selected' : ''
              } ${suggestion.hasPrimaryMatch ? 'border-l-2 border-blue-500' : ''}`}
            >
              <div className="flex items-start gap-2">
                {/* Icon */}
                <span className="text-lg flex-shrink-0 mt-0.5">{suggestion.icon}</span>

                {/* Content */}
                <div className="flex-1 min-w-0">
                  {/* Source and Field Path */}
                  <div className="text-xs font-medium text-gray-900 dark:text-white mb-0.5 flex items-center gap-1.5">
                    <span className="text-blue-600 dark:text-blue-400">{suggestion.sourceLabel}</span>
                    {suggestion.fieldPath && (
                      <>
                        <span className="text-gray-400">›</span>
                        <span className="font-mono text-gray-700 dark:text-gray-300">{suggestion.fieldPath}</span>
                      </>
                    )}
                    {suggestion.hasPrimaryMatch && suggestion.type === 'field' && (
                      <span className="text-[9px] px-1.5 py-0.5 bg-blue-100 dark:bg-blue-900/50 text-blue-700 dark:text-blue-300 rounded font-semibold">
                        Related
                      </span>
                    )}
                  </div>

                  {/* Primary Display */}
                  <div className="text-sm text-gray-800 dark:text-gray-200 truncate font-medium">
                    {suggestion.primaryDisplay}
                  </div>

                  {/* Preview Value */}
                  {suggestion.previewValue && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 truncate mt-0.5">
                      Preview: {suggestion.previewValue}
                    </div>
                  )}

                  {/* Visual indicators for drillable items */}
                  {suggestion.type === 'dataset' && (
                    <div className="text-xs text-blue-600 dark:text-blue-400 flex items-center gap-1 mt-1">
                      <span>Press Enter to browse {suggestion.itemCount} items</span>
                      <span>→</span>
                    </div>
                  )}

                  {suggestion.canDrillIn && suggestion.type === 'full-object' && !suggestion.isEntireCard && (
                    <div className="text-xs text-gray-500 dark:text-gray-400 flex items-center gap-1 mt-1">
                      <span>Press Enter to see fields</span>
                      <span>→</span>
                    </div>
                  )}

                  {/* Insert Syntax - only show for non-drillable items */}
                  {!suggestion.canDrillIn && suggestion.insertSyntax && (
                    <div className="text-[10px] font-mono text-gray-400 dark:text-gray-500 mt-1 truncate">
                      Will insert: {suggestion.insertSyntax}
                    </div>
                  )}
                </div>

                {/* Match Score (debug) */}
                {suggestion.matchScore !== undefined && (
                  <div className="text-[9px] text-gray-400 flex-shrink-0">
                    {Math.round(suggestion.matchScore)}%
                  </div>
                )}
              </div>
            </button>
          );
        })}
      </div>

      {/* Footer */}
      {currentSuggestions.length > 10 && (
        <div className="sticky bottom-0 bg-gray-50 dark:bg-gray-900 px-3 py-1 border-t border-gray-200 dark:border-gray-700 text-[10px] text-gray-500 dark:text-gray-400 text-center">
          Showing {currentSuggestions.length} result{currentSuggestions.length !== 1 ? 's' : ''}
        </div>
      )}
    </div>
  );
};

export default DataAutocomplete;
