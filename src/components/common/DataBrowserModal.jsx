import React, { useState, useEffect } from 'react';
import { X, Database } from 'lucide-react';
import DataBrowser from './DataBrowser';

/**
 * DataBrowserModal - Modal wrapper for DataBrowser
 *
 * Opens with Ctrl+Shift+B keyboard shortcut
 * Auto-discovers data files from /public/data/
 */
const DataBrowserModal = ({ isOpen, onClose }) => {
  const [dataFiles, setDataFiles] = useState([]);
  const [loading, setLoading] = useState(true);

  // Auto-discover data files
  useEffect(() => {
    if (isOpen) {
      discoverDataFiles();
    }
  }, [isOpen]);

  const discoverDataFiles = async () => {
    setLoading(true);
    try {
      // Try to load data-files-index.json (if it exists)
      try {
        const response = await fetch('/data/data-files-index.json');
        if (response.ok) {
          const index = await response.json();
          setDataFiles(index.files || []);
          setLoading(false);
          return;
        }
      } catch (err) {
        // Index doesn't exist, use fallback
      }

      // Fallback: known data files
      const knownFiles = [
        'companions.json',
        'equipment.json',
        'skills.json',
        'promotions.json',
        'relics.json',
        'quests.json',
        'classes.json',
        'drop-tables.json',
        'formulas.json',
        'adventures.json',
        'appearance-clothing.json',
        'campaigns.json',
        'companion-characters.json',
        'equipment-drops.json',
        'stages.json',
        'image-index.json',
        'image-search-index.json',
      ];

      // Check which files actually exist
      const existingFiles = [];
      for (const filename of knownFiles) {
        const path = `/data/${filename}`;
        try {
          const response = await fetch(path, { method: 'HEAD' });
          if (response.ok) {
            existingFiles.push({
              name: filename,
              path: path,
            });
          }
        } catch (err) {
          // File doesn't exist, skip
        }
      }

      setDataFiles(existingFiles);
    } catch (error) {
      console.error('Failed to discover data files:', error);
      setDataFiles([]);
    } finally {
      setLoading(false);
    }
  };

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-[90vw] h-[85vh] max-w-7xl border border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <Database className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Data Browser
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Explore and query JSON data files
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <kbd className="px-2 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">
              Ctrl+Shift+B
            </kbd>
            <button
              onClick={onClose}
              className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
              aria-label="Close"
            >
              <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
            </button>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-hidden">
          {loading ? (
            <div className="flex items-center justify-center h-full">
              <div className="text-center">
                <Database className="w-12 h-12 mx-auto mb-3 text-gray-400 animate-pulse" />
                <p className="text-gray-600 dark:text-gray-400">Discovering data files...</p>
              </div>
            </div>
          ) : (
            <DataBrowser dataFiles={dataFiles} />
          )}
        </div>

        {/* Footer */}
        <div className="p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex items-center justify-between text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-4">
              <span>{dataFiles.length} data files available</span>
              <span>•</span>
              <span>Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">ESC</kbd> to close</span>
            </div>
            <div>
              Click any value to copy to clipboard
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataBrowserModal;
