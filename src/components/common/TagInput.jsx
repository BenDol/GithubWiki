import { useState, useEffect, useRef } from 'react';

/**
 * TagInput component with autocomplete
 * Shows existing tags as suggestions and allows creating new tags
 */
const TagInput = ({ value = [], onChange, placeholder = 'Add tags...' }) => {
  const [inputValue, setInputValue] = useState('');
  const [suggestions, setSuggestions] = useState([]);
  const [allTags, setAllTags] = useState([]);
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [selectedIndex, setSelectedIndex] = useState(0);
  const inputRef = useRef(null);
  const containerRef = useRef(null);

  // Load all existing tags from search index
  useEffect(() => {
    const loadTags = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}search-index.json`);
        if (response.ok) {
          const searchIndex = await response.json();

          // Extract all unique tags from the search index
          const tagSet = new Set();
          searchIndex.forEach(page => {
            if (page.tags && Array.isArray(page.tags)) {
              page.tags.forEach(tag => tagSet.add(tag));
            }
          });

          setAllTags(Array.from(tagSet).sort());
        }
      } catch (err) {
        console.error('Failed to load tags:', err);
      }
    };

    loadTags();
  }, []);

  // Update suggestions based on input
  useEffect(() => {
    if (inputValue.trim()) {
      const filtered = allTags.filter(tag =>
        tag.toLowerCase().includes(inputValue.toLowerCase()) &&
        !value.includes(tag)
      );
      setSuggestions(filtered);
      setShowSuggestions(filtered.length > 0);
      setSelectedIndex(0); // Reset selection when suggestions change
    } else {
      setSuggestions([]);
      setShowSuggestions(false);
      setSelectedIndex(0);
    }
  }, [inputValue, allTags, value]);

  // Close suggestions when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (containerRef.current && !containerRef.current.contains(event.target)) {
        setShowSuggestions(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const addTag = (tag) => {
    const trimmedTag = tag.trim();
    if (trimmedTag && !value.includes(trimmedTag)) {
      onChange([...value, trimmedTag]);
      setInputValue('');
      setShowSuggestions(false);
      setSelectedIndex(0);
      inputRef.current?.focus();
    }
  };

  const removeTag = (tagToRemove) => {
    onChange(value.filter(tag => tag !== tagToRemove));
  };

  const handleKeyDown = (e) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0 && selectedIndex >= 0) {
        // Select the highlighted suggestion
        addTag(suggestions[selectedIndex]);
      } else if (inputValue.trim()) {
        // Create a new tag from input
        addTag(inputValue);
      }
    } else if (e.key === ',') {
      e.preventDefault();
      if (inputValue.trim()) {
        addTag(inputValue);
      }
    } else if (e.key === 'Backspace' && !inputValue && value.length > 0) {
      // Remove last tag when backspace is pressed on empty input
      removeTag(value[value.length - 1]);
    } else if (e.key === 'Escape') {
      setShowSuggestions(false);
      setSelectedIndex(0);
    } else if (e.key === 'ArrowDown') {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        setSelectedIndex(prev => (prev + 1) % suggestions.length);
      }
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      if (showSuggestions && suggestions.length > 0) {
        setSelectedIndex(prev => (prev - 1 + suggestions.length) % suggestions.length);
      }
    }
  };

  const handleInputChange = (e) => {
    const newValue = e.target.value;
    // Don't allow commas in the input (they trigger tag creation)
    if (!newValue.includes(',')) {
      setInputValue(newValue);
    } else {
      // If comma is typed, add the tag
      addTag(newValue.replace(',', ''));
    }
  };

  return (
    <div ref={containerRef} className="relative">
      {/* Tags Container */}
      <div className="flex flex-wrap gap-2 p-2 border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 min-h-[42px] focus-within:ring-2 focus-within:ring-blue-500 focus-within:border-transparent">
        {/* Existing Tags */}
        {value.map((tag, index) => (
          <span
            key={index}
            className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900/40 text-blue-800 dark:text-blue-200 text-xs font-medium rounded-md"
          >
            <span>{tag}</span>
            <button
              type="button"
              onClick={() => removeTag(tag)}
              className="hover:bg-blue-200 dark:hover:bg-blue-800 rounded-full p-0.5 transition-colors"
              aria-label={`Remove ${tag}`}
            >
              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
              </svg>
            </button>
          </span>
        ))}

        {/* Input Field */}
        <input
          ref={inputRef}
          type="text"
          value={inputValue}
          onChange={handleInputChange}
          onKeyDown={handleKeyDown}
          onFocus={() => {
            if (inputValue.trim()) {
              const filtered = allTags.filter(tag =>
                tag.toLowerCase().includes(inputValue.toLowerCase()) &&
                !value.includes(tag)
              );
              setSuggestions(filtered);
              setShowSuggestions(filtered.length > 0);
            }
          }}
          placeholder={value.length === 0 ? placeholder : ''}
          className="flex-1 min-w-[120px] outline-none bg-transparent text-sm text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400"
        />
      </div>

      {/* Suggestions Dropdown */}
      {showSuggestions && suggestions.length > 0 && (
        <div className="absolute z-50 w-full mt-1 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-md shadow-lg max-h-60 overflow-y-auto">
          {suggestions.map((tag, index) => (
            <button
              key={index}
              type="button"
              onClick={() => addTag(tag)}
              onMouseEnter={() => setSelectedIndex(index)}
              className={`w-full px-3 py-2 text-left text-sm text-gray-900 dark:text-white transition-colors ${
                index === selectedIndex
                  ? 'bg-blue-100 dark:bg-blue-900/40'
                  : 'hover:bg-blue-50 dark:hover:bg-blue-900/20'
              }`}
            >
              <span className="font-medium">{tag}</span>
              <span className="ml-2 text-xs text-gray-500 dark:text-gray-400">
                (existing tag)
              </span>
            </button>
          ))}
        </div>
      )}

      {/* Help Text */}
      <div className="mt-1 flex items-center justify-between">
        <p className="text-xs text-gray-500 dark:text-gray-400">
          Press Enter or comma to add. Use ↑↓ arrows to navigate. Backspace to remove.
        </p>
        {inputValue.trim() && !allTags.includes(inputValue.trim()) && (
          <span className="text-xs text-green-600 dark:text-green-400 font-medium">
            New tag
          </span>
        )}
      </div>
    </div>
  );
};

export default TagInput;
