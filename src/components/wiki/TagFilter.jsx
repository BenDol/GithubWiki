import { useState } from 'react';
import clsx from 'clsx';

/**
 * Tag filter component for browsing content by tags
 */
const TagFilter = ({ tags, selectedTag, onTagSelect }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  if (!tags || tags.length === 0) return null;

  const displayedTags = isExpanded ? tags : tags.slice(0, 10);
  const hasMore = tags.length > 10;

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
          Filter by Tag
        </h3>
        {selectedTag && (
          <button
            onClick={() => onTagSelect(null)}
            className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
          >
            Clear
          </button>
        )}
      </div>

      <div className="flex flex-wrap gap-2">
        {displayedTags.map((tag) => (
          <button
            key={tag}
            onClick={() => onTagSelect(tag === selectedTag ? null : tag)}
            className={clsx(
              'px-3 py-1.5 text-sm rounded-full transition-colors',
              tag === selectedTag
                ? 'bg-blue-500 text-white'
                : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
            )}
          >
            {tag}
          </button>
        ))}

        {hasMore && (
          <button
            onClick={() => setIsExpanded(!isExpanded)}
            className="px-3 py-1.5 text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            {isExpanded ? 'Show less' : `+${tags.length - 10} more`}
          </button>
        )}
      </div>
    </div>
  );
};

export default TagFilter;
