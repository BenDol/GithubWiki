import React, { useState, useRef, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { Palette, X } from 'lucide-react';

/**
 * ColorPicker - Color picker with site-style preset colors
 *
 * Features:
 * - Preset colors matching site design system
 * - Light/dark mode support
 * - Dropdown interface
 * - Clear color option
 */
const ColorPicker = ({ isOpen, onClose, onSelect, anchorEl }) => {
  const pickerRef = useRef(null);
  const [position, setPosition] = useState(null); // Start as null to indicate not ready
  const [isReady, setIsReady] = useState(false);

  // Debug: Track isOpen changes
  useEffect(() => {
    console.log('[ColorPicker] isOpen changed to:', isOpen);
  }, [isOpen]);

  // Calculate position based on anchor element
  useEffect(() => {
    console.log('[ColorPicker] useEffect triggered', { isOpen, hasAnchorEl: !!anchorEl });
    if (isOpen && anchorEl) {
      const rect = anchorEl.getBoundingClientRect();
      const pickerWidth = 280; // min-w-[280px]
      const pickerHeight = 400; // Approximate height
      const gap = 8;
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const padding = 16; // Minimum padding from viewport edges

      let top = rect.bottom + gap;
      let left = rect.left;

      // Check if picker would overflow right edge
      if (left + pickerWidth + padding > viewportWidth) {
        // Try aligning to right edge of anchor
        left = rect.right - pickerWidth;

        // If still overflowing, align to right edge of viewport
        if (left < padding) {
          left = viewportWidth - pickerWidth - padding;
        }
      }

      // Ensure minimum padding from left edge
      if (left < padding) {
        left = padding;
      }

      // Check if picker would overflow bottom edge
      if (top + pickerHeight + padding > viewportHeight) {
        // Position above anchor instead
        top = rect.top - pickerHeight - gap;

        // If still overflowing top, align to bottom of viewport
        if (top < padding) {
          top = viewportHeight - pickerHeight - padding;
        }
      }

      // Ensure minimum padding from top edge
      if (top < padding) {
        top = padding;
      }

      const newPosition = { top, left };
      console.log('[ColorPicker] Positioning:');
      console.log('  - rect:', rect);
      console.log('  - viewport:', { width: viewportWidth, height: viewportHeight });
      console.log('  - newPosition:', newPosition);
      setPosition(newPosition);
      setIsReady(true);
    } else {
      setIsReady(false);
      if (isOpen) {
        console.warn('[ColorPicker] isOpen but no anchorEl', { isOpen, anchorEl });
      }
    }
  }, [isOpen, anchorEl]);

  // Preset colors based on site design system (Tailwind colors)
  const colorPresets = [
    { name: 'Primary', light: '#3b82f6', dark: '#60a5fa', class: 'text-blue-600 dark:text-blue-400' },
    { name: 'Secondary', light: '#6b7280', dark: '#9ca3af', class: 'text-gray-600 dark:text-gray-400' },
    { name: 'Success', light: '#10b981', dark: '#34d399', class: 'text-green-600 dark:text-green-400' },
    { name: 'Warning', light: '#f59e0b', dark: '#fbbf24', class: 'text-amber-600 dark:text-amber-400' },
    { name: 'Danger', light: '#ef4444', dark: '#f87171', class: 'text-red-600 dark:text-red-400' },
    { name: 'Info', light: '#06b6d4', dark: '#22d3ee', class: 'text-cyan-600 dark:text-cyan-400' },
    { name: 'Purple', light: '#a855f7', dark: '#c084fc', class: 'text-purple-600 dark:text-purple-400' },
    { name: 'Pink', light: '#ec4899', dark: '#f472b6', class: 'text-pink-600 dark:text-pink-400' },
    { name: 'Indigo', light: '#6366f1', dark: '#818cf8', class: 'text-indigo-600 dark:text-indigo-400' },
    { name: 'Emerald', light: '#059669', dark: '#10b981', class: 'text-emerald-600 dark:text-emerald-400' },
    { name: 'Orange', light: '#f97316', dark: '#fb923c', class: 'text-orange-600 dark:text-orange-400' },
    { name: 'Teal', light: '#14b8a6', dark: '#2dd4bf', class: 'text-teal-600 dark:text-teal-400' },
  ];

  // Close on outside click
  useEffect(() => {
    if (!isOpen) return;

    const handleClickOutside = (e) => {
      if (pickerRef.current && !pickerRef.current.contains(e.target) &&
          anchorEl && !anchorEl.contains(e.target)) {
        console.log('[ColorPicker] Click outside detected, closing');
        onClose?.();
      }
    };

    // Delay adding the listener to avoid closing immediately from the opening click
    const timeoutId = setTimeout(() => {
      console.log('[ColorPicker] Adding click outside listener');
      document.addEventListener('mousedown', handleClickOutside);
    }, 300); // Increased to 300ms

    return () => {
      clearTimeout(timeoutId);
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen, anchorEl, onClose]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  const handleColorSelect = (color) => {
    onSelect?.(color);
    onClose?.();
  };

  // Don't render until we have position calculated
  if (!isOpen || !isReady || !position) return null;

  const picker = (
    <div
      ref={pickerRef}
      className="fixed bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-2xl p-3 min-w-[280px]"
      style={{
        top: `${position.top}px`,
        left: `${position.left}px`,
        zIndex: 9999,
      }}
    >
      {/* Header */}
      <div className="flex items-center justify-between mb-3 pb-2 border-b border-gray-200 dark:border-gray-700">
        <div className="flex items-center gap-2">
          <Palette className="w-4 h-4 text-gray-600 dark:text-gray-400" />
          <span className="text-sm font-semibold text-gray-900 dark:text-white">
            Text Color
          </span>
        </div>
        <button
          onClick={onClose}
          className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
        >
          <X className="w-4 h-4 text-gray-500 dark:text-gray-400" />
        </button>
      </div>

      {/* Color Grid */}
      <div className="grid grid-cols-3 gap-2 mb-3">
        {colorPresets.map((color) => (
          <button
            key={color.name}
            onClick={() => handleColorSelect(color)}
            className="flex flex-col items-center gap-1.5 p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors group"
            title={color.name}
          >
            <div className="flex gap-1">
              <div
                className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600"
                style={{ backgroundColor: color.light }}
              />
              <div
                className="w-5 h-5 rounded border border-gray-300 dark:border-gray-600"
                style={{ backgroundColor: color.dark }}
              />
            </div>
            <span className="text-xs text-gray-600 dark:text-gray-400 group-hover:text-gray-900 dark:group-hover:text-white">
              {color.name}
            </span>
          </button>
        ))}
      </div>

      {/* Clear Color */}
      <button
        onClick={() => handleColorSelect(null)}
        className="w-full px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors border-t border-gray-200 dark:border-gray-700 pt-3"
      >
        Clear Color
      </button>
    </div>
  );

  // Render as portal to avoid clipping by parent overflow
  return createPortal(picker, document.body);
};

export default ColorPicker;
