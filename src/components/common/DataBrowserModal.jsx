import React, { useState, useEffect } from 'react';
import { X, Database } from 'lucide-react';
import DataBrowser from './DataBrowser';
import { getRegisteredDataFiles, hasRegisteredDataFiles } from '../../utils/dataBrowserRegistry';

/**
 * DataBrowserModal - Modal wrapper for DataBrowser
 *
 * Opens with Ctrl+Shift+B keyboard shortcut
 * Auto-discovers data files from:
 * 1. Registered data files (via registerDataFiles() in main.jsx)
 * 2. /data/data-files-index.json (if it exists)
 * 3. Empty list if neither exist
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
      // Priority 1: Use registered data files from parent project
      if (hasRegisteredDataFiles()) {
        const registered = getRegisteredDataFiles();
        console.log('[DataBrowserModal] Using registered data files:', registered.length);

        // Verify files actually exist
        const existingFiles = [];
        for (const file of registered) {
          try {
            const response = await fetch(file.path, { method: 'HEAD' });
            if (response.ok) {
              existingFiles.push(file);
            }
          } catch (err) {
            // File doesn't exist, skip
          }
        }

        setDataFiles(existingFiles);
        setLoading(false);
        return;
      }

      // Priority 2: Try to load data-files-index.json (if it exists)
      try {
        const response = await fetch('/data/data-files-index.json');
        if (response.ok) {
          const index = await response.json();
          console.log('[DataBrowserModal] Using data-files-index.json');
          setDataFiles(index.files || []);
          setLoading(false);
          return;
        }
      } catch (err) {
        // Index doesn't exist, continue
      }

      // Priority 3: No files registered or indexed
      console.warn('[DataBrowserModal] No data files registered. Use registerDataFiles() in main.jsx to register your data files.');
      setDataFiles([]);
    } catch (error) {
      console.error('[DataBrowserModal] Failed to discover data files:', error);
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
      <div className="relative bg-white dark:bg-gray-800 rounded-none md:rounded-lg shadow-2xl w-full h-full md:w-[90vw] md:h-[85vh] md:max-w-7xl border-0 md:border border-gray-200 dark:border-gray-700 flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-3 sm:p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 sm:gap-3 flex-1 min-w-0">
            <Database className="w-5 h-5 sm:w-6 sm:h-6 text-blue-600 flex-shrink-0" />
            <div className="min-w-0">
              <h2 className="text-lg sm:text-xl font-semibold text-gray-900 dark:text-white truncate">
                Data Browser
              </h2>
              <p className="hidden sm:block text-sm text-gray-600 dark:text-gray-400">
                Explore and query JSON data files
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 flex-shrink-0">
            <kbd className="hidden md:inline-block px-2 py-1 text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-700 border border-gray-300 dark:border-gray-600 rounded">
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
        <div className="p-2 sm:p-3 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-2 text-xs text-gray-600 dark:text-gray-400">
            <div className="flex items-center gap-2 sm:gap-4">
              <span>{dataFiles.length} data files</span>
              <span className="hidden sm:inline">•</span>
              <span className="hidden sm:inline">Press <kbd className="px-1.5 py-0.5 bg-gray-200 dark:bg-gray-700 rounded">ESC</kbd> to close</span>
            </div>
            <div className="hidden sm:block">
              Click any value to copy to clipboard
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};

export default DataBrowserModal;
