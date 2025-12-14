import React, { useState, useEffect, useRef } from 'react';

/**
 * ImageDimensionWidget - Floating widget for editing image dimensions
 *
 * Appears above cursor when hovering over markdown images or HTML img tags
 * Allows quick editing of width/height dimensions inline
 */
const ImageDimensionWidget = ({
  visible,
  position,
  currentWidth,
  currentHeight,
  onUpdate,
  onClose
}) => {
  const [width, setWidth] = useState('');
  const [height, setHeight] = useState('');
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const widgetRef = useRef(null);

  // Initialize dimensions when widget becomes visible
  useEffect(() => {
    if (visible) {
      setWidth(currentWidth || '');
      setHeight(currentHeight || '');
    }
  }, [visible, currentWidth, currentHeight]);

  // Close on outside click
  useEffect(() => {
    if (!visible) return;

    const handleClickOutside = (e) => {
      if (widgetRef.current && !widgetRef.current.contains(e.target)) {
        onClose?.();
      }
    };

    // Delay adding the listener to avoid closing immediately from the opening click
    const timeoutId = setTimeout(() => {
      document.addEventListener('mousedown', handleClickOutside);
    }, 100);

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [visible, onClose]);

  // Handle width change with aspect ratio
  const handleWidthChange = (value) => {
    setWidth(value);
    if (maintainAspectRatio && currentWidth && currentHeight && value) {
      const aspectRatio = parseInt(currentHeight) / parseInt(currentWidth);
      const newHeight = Math.round(parseInt(value) * aspectRatio);
      setHeight(newHeight.toString());
    }
  };

  // Handle height change with aspect ratio
  const handleHeightChange = (value) => {
    setHeight(value);
    if (maintainAspectRatio && currentWidth && currentHeight && value) {
      const aspectRatio = parseInt(currentWidth) / parseInt(currentHeight);
      const newWidth = Math.round(parseInt(value) * aspectRatio);
      setWidth(newWidth.toString());
    }
  };

  // Apply changes
  const handleApply = () => {
    onUpdate?.(width, height);
    onClose?.();
  };

  // Remove dimensions
  const handleRemove = () => {
    onUpdate?.('', '');
    onClose?.();
  };

  if (!visible) return null;

  return (
    <div
      ref={widgetRef}
      className="fixed bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded shadow-lg p-2"
      style={{
        top: `${position.top - 90}px`, // Position above line end
        left: `${position.left - 200}px`, // Offset to left so it doesn't go offscreen
        width: '200px',
        zIndex: 9999,
      }}
      onMouseDown={(e) => e.stopPropagation()} // Prevent editor losing focus
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-1.5">
        <div className="flex items-center gap-1.5">
          <svg className="w-3.5 h-3.5 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z" />
          </svg>
          <span className="text-xs font-semibold text-gray-700 dark:text-gray-300">
            Dimensions
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-0.5 hover:bg-gray-200 dark:hover:bg-gray-700 rounded transition-colors"
          title="Close"
        >
          <svg className="w-3 h-3 text-gray-500 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
          </svg>
        </button>
      </div>

      {/* Dimension Inputs */}
      <div className="flex items-center gap-1.5 mb-1.5">
        <label className="text-xs text-gray-600 dark:text-gray-400">W</label>
        <input
          type="number"
          value={width}
          onChange={(e) => handleWidthChange(e.target.value)}
          placeholder="Auto"
          className="w-14 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
        <span className="text-xs text-gray-400">×</span>
        <label className="text-xs text-gray-600 dark:text-gray-400">H</label>
        <input
          type="number"
          value={height}
          onChange={(e) => handleHeightChange(e.target.value)}
          placeholder="Auto"
          className="w-14 px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
        />
        <button
          onClick={() => setMaintainAspectRatio(!maintainAspectRatio)}
          className={`p-0.5 rounded transition-colors ${
            maintainAspectRatio
              ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
              : 'bg-gray-200 dark:bg-gray-700 text-gray-500 dark:text-gray-400'
          }`}
          title={maintainAspectRatio ? 'Aspect ratio locked' : 'Aspect ratio unlocked'}
        >
          <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            {maintainAspectRatio ? (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 15v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2zm10-10V7a4 4 0 00-8 0v4h8z" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 11V7a4 4 0 118 0m-4 8v2m-6 4h12a2 2 0 002-2v-6a2 2 0 00-2-2H6a2 2 0 00-2 2v6a2 2 0 002 2z" />
            )}
          </svg>
        </button>
      </div>

      {/* Action Buttons */}
      <div className="flex gap-1">
        <button
          onClick={handleApply}
          className="flex-1 px-2 py-0.5 text-xs font-medium text-white bg-blue-500 hover:bg-blue-600 rounded transition-colors"
        >
          Apply
        </button>
        <button
          onClick={handleRemove}
          className="px-2 py-0.5 text-xs font-medium text-gray-700 dark:text-gray-300 bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 rounded transition-colors"
          title="Remove dimensions"
        >
          ↺
        </button>
      </div>
    </div>
  );
};

export default ImageDimensionWidget;
