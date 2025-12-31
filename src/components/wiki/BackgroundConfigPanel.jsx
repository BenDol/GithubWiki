import React, { useState, useEffect } from 'react';
import { X } from 'lucide-react';
import { createPortal } from 'react-dom';

/**
 * BackgroundConfigPanel - Configuration panel for background image properties
 *
 * Features:
 * - Live preview of background settings
 * - Opacity slider (0-100%)
 * - Repeat mode dropdown
 * - Size dropdown
 * - Position dropdown
 * - Attachment mode dropdown
 * - Blend mode dropdown
 */
const BackgroundConfigPanel = ({ imagePath, initialConfig, onApply, onCancel }) => {
  const [config, setConfig] = useState({
    path: imagePath,
    opacity: initialConfig?.opacity !== undefined ? initialConfig.opacity : 1,
    repeat: initialConfig?.repeat || 'no-repeat',
    size: initialConfig?.size || 'cover',
    position: initialConfig?.position || 'center',
    attachment: initialConfig?.attachment || 'scroll',
    blendMode: initialConfig?.blendMode || 'normal'
  });

  // Update path when imagePath prop changes (e.g., when user selects a new image)
  useEffect(() => {
    setConfig(prev => ({ ...prev, path: imagePath }));
  }, [imagePath]);

  const handleApply = () => {
    onApply(config);
  };

  const handleEscape = (e) => {
    if (e.key === 'Escape') {
      onCancel();
    }
  };

  // Add escape key listener
  React.useEffect(() => {
    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, []);

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onCancel}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-y-auto border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-gray-200 dark:border-gray-700">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
            Background Configuration
          </h2>
          <button
            onClick={onCancel}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="p-6 space-y-6">
          {/* Preview */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Preview
            </label>
            <div
              className="w-full h-48 rounded-lg border border-gray-200 dark:border-gray-700"
              style={{
                // Encode the URL to handle spaces and special characters
                backgroundImage: `url(${encodeURI(config.path).replace(/\(/g, '%28').replace(/\)/g, '%29')})`,
                backgroundRepeat: config.repeat,
                backgroundSize: config.size,
                backgroundPosition: config.position,
                backgroundAttachment: 'scroll', // Always use scroll in preview
                opacity: config.opacity,
                mixBlendMode: config.blendMode
              }}
            />
          </div>

          {/* Opacity Slider */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Opacity
              </label>
              <span className="text-sm font-medium text-gray-900 dark:text-white">
                {Math.round(config.opacity * 100)}%
              </span>
            </div>
            <input
              type="range"
              min="0"
              max="100"
              value={config.opacity * 100}
              onChange={(e) => setConfig({ ...config, opacity: e.target.value / 100 })}
              className="w-full h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
            />
            <div className="flex justify-between text-xs text-gray-500 dark:text-gray-400 mt-1">
              <span>Transparent</span>
              <span>Opaque</span>
            </div>
          </div>

          {/* Repeat Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Repeat
            </label>
            <select
              value={config.repeat}
              onChange={(e) => setConfig({ ...config, repeat: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer"
            >
              <option value="no-repeat">No Repeat</option>
              <option value="repeat">Repeat</option>
              <option value="repeat-x">Repeat X</option>
              <option value="repeat-y">Repeat Y</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Control how the image tiles across the page
            </p>
          </div>

          {/* Size Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Size
            </label>
            <select
              value={config.size}
              onChange={(e) => setConfig({ ...config, size: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer"
            >
              <option value="cover">Cover (Fill entire page)</option>
              <option value="contain">Contain (Fit within page)</option>
              <option value="auto">Auto (Original size)</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              How the image fills the space
            </p>
          </div>

          {/* Position */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Position
            </label>
            <select
              value={config.position}
              onChange={(e) => setConfig({ ...config, position: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer"
            >
              <option value="center">Center</option>
              <option value="top">Top</option>
              <option value="bottom">Bottom</option>
              <option value="left">Left</option>
              <option value="right">Right</option>
              <option value="top left">Top Left</option>
              <option value="top right">Top Right</option>
              <option value="bottom left">Bottom Left</option>
              <option value="bottom right">Bottom Right</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Where the image is anchored
            </p>
          </div>

          {/* Attachment Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Attachment
            </label>
            <select
              value={config.attachment}
              onChange={(e) => setConfig({ ...config, attachment: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer"
            >
              <option value="scroll">Scroll (Moves with page)</option>
              <option value="fixed">Fixed (Stays in place)</option>
              <option value="local">Local (Scrolls with element)</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              How the background behaves when scrolling
            </p>
          </div>

          {/* Blend Mode */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
              Blend Mode
            </label>
            <select
              value={config.blendMode}
              onChange={(e) => setConfig({ ...config, blendMode: e.target.value })}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white cursor-pointer"
            >
              <option value="normal">Normal</option>
              <option value="multiply">Multiply</option>
              <option value="screen">Screen</option>
              <option value="overlay">Overlay</option>
              <option value="darken">Darken</option>
              <option value="lighten">Lighten</option>
              <option value="color-dodge">Color Dodge</option>
              <option value="color-burn">Color Burn</option>
              <option value="soft-light">Soft Light</option>
              <option value="hard-light">Hard Light</option>
              <option value="difference">Difference</option>
              <option value="exclusion">Exclusion</option>
            </select>
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              How the background blends with content
            </p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-3 p-6 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleApply}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-600 hover:bg-blue-700 rounded-lg transition-colors"
          >
            Apply
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
};

export default BackgroundConfigPanel;
