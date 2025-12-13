import React, { useState } from 'react';
import useProgressStore from '../../store/progressStore';
import Button from '../common/Button';

const ProgressTracker = ({ category, items }) => {
  const {
    isCompleted,
    toggleItem,
    getCategoryProgress,
    exportProgress,
    importProgress,
    clearProgress,
  } = useProgressStore();

  const [showExport, setShowExport] = useState(false);
  const [importText, setImportText] = useState('');

  const progress = getCategoryProgress(category, items.length);

  const handleExport = () => {
    const exported = exportProgress();
    navigator.clipboard.writeText(exported);
    setShowExport(true);
    setTimeout(() => setShowExport(false), 2000);
  };

  const handleImport = () => {
    if (importProgress(importText)) {
      alert('Progress imported successfully!');
      setImportText('');
    } else {
      alert('Failed to import progress. Please check the format.');
    }
  };

  const handleClearAll = () => {
    if (window.confirm('Are you sure you want to clear all progress? This cannot be undone.')) {
      clearProgress();
    }
  };

  return (
    <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg p-6">
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-xl font-bold">{category} Progress</h3>
          <span className="text-lg font-semibold text-blue-600 dark:text-blue-400">
            {progress}%
          </span>
        </div>
        <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-4 overflow-hidden">
          <div
            className="bg-blue-600 h-full transition-all duration-300"
            style={{ width: `${progress}%` }}
          />
        </div>
      </div>

      <div className="space-y-2 mb-6">
        {items.map((item, index) => (
          <label
            key={index}
            className="flex items-center gap-3 p-3 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer transition-colors"
          >
            <input
              type="checkbox"
              checked={isCompleted(category, item)}
              onChange={() => toggleItem(category, item)}
              className="w-5 h-5 text-blue-600 rounded focus:ring-2 focus:ring-blue-500"
            />
            <span
              className={`flex-1 ${
                isCompleted(category, item)
                  ? 'line-through text-gray-500 dark:text-gray-400'
                  : ''
              }`}
            >
              {item}
            </span>
          </label>
        ))}
      </div>

      <div className="border-t border-gray-200 dark:border-gray-700 pt-6 space-y-4">
        <div className="flex gap-2">
          <Button onClick={handleExport} variant="secondary" className="flex-1">
            {showExport ? '✓ Copied!' : 'Export Progress'}
          </Button>
          <Button onClick={handleClearAll} variant="secondary" className="flex-1">
            Clear All
          </Button>
        </div>

        <div>
          <label className="block text-sm font-medium mb-2">Import Progress</label>
          <textarea
            value={importText}
            onChange={(e) => setImportText(e.target.value)}
            placeholder="Paste exported progress JSON here..."
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500 text-sm font-mono"
            rows={3}
          />
          <Button onClick={handleImport} className="w-full mt-2">
            Import
          </Button>
        </div>
      </div>
    </div>
  );
};

export default ProgressTracker;
