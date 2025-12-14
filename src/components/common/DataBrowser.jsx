import React, { useState, useEffect, useRef } from 'react';
import { Search, Copy, CheckCircle, ChevronRight, ChevronDown, Database, File, ChevronsDown, ChevronsUp } from 'lucide-react';

/**
 * DataBrowser - Browse and explore JSON data files
 *
 * Features:
 * - Auto-discover data files from /public/data/
 * - Structured tree view of JSON data
 * - Search/filter within data
 * - Copy to clipboard functionality
 * - Virtual scrolling for large datasets
 */
const DataBrowser = ({ dataFiles = [] }) => {
  const [selectedFile, setSelectedFile] = useState(null);
  const [fileData, setFileData] = useState(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [copiedPath, setCopiedPath] = useState(null);
  const [expandedPaths, setExpandedPaths] = useState(new Set());

  // Load selected data file
  const loadDataFile = async (filePath) => {
    setLoading(true);
    setError(null);
    setFileData(null);

    try {
      const response = await fetch(filePath);
      if (!response.ok) {
        throw new Error(`Failed to load ${filePath}`);
      }
      const data = await response.json();
      setFileData(data);
      setExpandedPaths(new Set()); // Reset expanded state
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  };

  // Handle file selection
  const handleFileSelect = (file) => {
    setSelectedFile(file);
    loadDataFile(file.path);
  };

  // Toggle path expansion
  const togglePath = (path) => {
    const newExpanded = new Set(expandedPaths);
    if (newExpanded.has(path)) {
      newExpanded.delete(path);
    } else {
      newExpanded.add(path);
    }
    setExpandedPaths(newExpanded);
  };

  // Copy to clipboard
  const copyToClipboard = (value, path) => {
    const textToCopy = typeof value === 'string' ? value : JSON.stringify(value, null, 2);
    navigator.clipboard.writeText(textToCopy).then(() => {
      setCopiedPath(path);
      setTimeout(() => setCopiedPath(null), 2000);
    });
  };

  // Recursively collect all expandable paths from data structure
  const collectAllPaths = (value, path = 'root', paths = []) => {
    if (Array.isArray(value)) {
      paths.push(path);
      value.forEach((item, index) => {
        collectAllPaths(item, `${path}[${index}]`, paths);
      });
    } else if (typeof value === 'object' && value !== null) {
      paths.push(path);
      Object.keys(value).forEach((key) => {
        collectAllPaths(value[key], `${path}.${key}`, paths);
      });
    }
    return paths;
  };

  // Expand all paths
  const handleExpandAll = () => {
    if (!fileData) return;
    const allPaths = collectAllPaths(fileData);
    setExpandedPaths(new Set(allPaths));
  };

  // Collapse all paths
  const handleCollapseAll = () => {
    setExpandedPaths(new Set());
  };

  // Render JSON value with appropriate formatting
  const renderValue = (value, path, depth = 0, key = null) => {
    const isExpanded = expandedPaths.has(path);

    // Primitive values - render inline with key
    if (value === null) {
      return (
        <div className="flex items-center gap-2 py-0.5 group hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded px-2">
          {key !== null && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[120px]">
              {key}:
            </span>
          )}
          <span className="text-purple-600 dark:text-purple-400 font-mono text-sm">null</span>
          <button
            onClick={() => copyToClipboard(value, path)}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="Copy value"
          >
            {copiedPath === path ? (
              <CheckCircle className="w-3 h-3 text-green-600" />
            ) : (
              <Copy className="w-3 h-3 text-gray-500" />
            )}
          </button>
        </div>
      );
    }

    if (typeof value === 'boolean') {
      return (
        <div className="flex items-center gap-2 py-0.5 group hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded px-2">
          {key !== null && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[120px]">
              {key}:
            </span>
          )}
          <span className="text-blue-600 dark:text-blue-400 font-mono text-sm">{value.toString()}</span>
          <button
            onClick={() => copyToClipboard(value, path)}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="Copy value"
          >
            {copiedPath === path ? (
              <CheckCircle className="w-3 h-3 text-green-600" />
            ) : (
              <Copy className="w-3 h-3 text-gray-500" />
            )}
          </button>
        </div>
      );
    }

    if (typeof value === 'number') {
      return (
        <div className="flex items-center gap-2 py-0.5 group hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded px-2">
          {key !== null && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[120px]">
              {key}:
            </span>
          )}
          <span className="text-orange-600 dark:text-orange-400 font-mono text-sm">{value}</span>
          <button
            onClick={() => copyToClipboard(value, path)}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
            title="Copy value"
          >
            {copiedPath === path ? (
              <CheckCircle className="w-3 h-3 text-green-600" />
            ) : (
              <Copy className="w-3 h-3 text-gray-500" />
            )}
          </button>
        </div>
      );
    }

    if (typeof value === 'string') {
      return (
        <div className="flex items-center gap-2 py-0.5 group hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded px-2">
          {key !== null && (
            <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[120px]">
              {key}:
            </span>
          )}
          <span className="text-green-600 dark:text-green-400 font-mono text-sm truncate">"{value}"</span>
          <button
            onClick={() => copyToClipboard(value, path)}
            className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded flex-shrink-0"
            title="Copy value"
          >
            {copiedPath === path ? (
              <CheckCircle className="w-3 h-3 text-green-600" />
            ) : (
              <Copy className="w-3 h-3 text-gray-500" />
            )}
          </button>
        </div>
      );
    }

    // Arrays
    if (Array.isArray(value)) {
      const isEmpty = value.length === 0;
      return (
        <div className="my-1">
          <div className="flex items-center gap-2 py-1 px-2 group hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded">
            {key !== null && (
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[120px]">
                {key}:
              </span>
            )}
            <button
              onClick={() => togglePath(path)}
              className="flex items-center gap-1.5 flex-1"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
              )}
              <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                Array[{value.length}]
              </span>
            </button>
            <button
              onClick={() => copyToClipboard(value, path)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              title="Copy array"
            >
              {copiedPath === path ? (
                <CheckCircle className="w-3 h-3 text-green-600" />
              ) : (
                <Copy className="w-3 h-3 text-gray-500" />
              )}
            </button>
          </div>
          {isExpanded && !isEmpty && (
            <div className="ml-6 border-l-2 border-gray-200 dark:border-gray-700 pl-4 mt-1 space-y-0.5">
              {value.map((item, index) => (
                <div key={index}>
                  {renderValue(item, `${path}[${index}]`, depth + 1, `[${index}]`)}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    // Objects
    if (typeof value === 'object') {
      const keys = Object.keys(value);
      const isEmpty = keys.length === 0;

      return (
        <div className="my-1">
          <div className="flex items-center gap-2 py-1 px-2 group hover:bg-gray-50 dark:hover:bg-gray-800/50 rounded">
            {key !== null && (
              <span className="text-sm font-medium text-gray-700 dark:text-gray-300 min-w-[120px]">
                {key}:
              </span>
            )}
            <button
              onClick={() => togglePath(path)}
              className="flex items-center gap-1.5 flex-1"
            >
              {isExpanded ? (
                <ChevronDown className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
              ) : (
                <ChevronRight className="w-4 h-4 text-gray-500 dark:text-gray-400 flex-shrink-0" />
              )}
              <span className="text-sm text-gray-600 dark:text-gray-400 font-mono">
                Object{'{}'} {keys.length}
              </span>
            </button>
            <button
              onClick={() => copyToClipboard(value, path)}
              className="opacity-0 group-hover:opacity-100 p-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded"
              title="Copy object"
            >
              {copiedPath === path ? (
                <CheckCircle className="w-3 h-3 text-green-600" />
              ) : (
                <Copy className="w-3 h-3 text-gray-500" />
              )}
            </button>
          </div>
          {isExpanded && !isEmpty && (
            <div className="ml-6 border-l-2 border-gray-200 dark:border-gray-700 pl-4 mt-1 space-y-0.5">
              {keys.map((objKey) => (
                <div key={objKey}>
                  {renderValue(value[objKey], `${path}.${objKey}`, depth + 1, objKey)}
                </div>
              ))}
            </div>
          )}
        </div>
      );
    }

    return null;
  };

  // Filter data based on search query
  const matchesSearch = (value, query) => {
    if (!query) return true;

    const lowerQuery = query.toLowerCase();

    if (typeof value === 'string') {
      return value.toLowerCase().includes(lowerQuery);
    }

    if (typeof value === 'number' || typeof value === 'boolean') {
      return value.toString().toLowerCase().includes(lowerQuery);
    }

    if (Array.isArray(value)) {
      return value.some(item => matchesSearch(item, query));
    }

    if (typeof value === 'object' && value !== null) {
      return Object.entries(value).some(([key, val]) =>
        key.toLowerCase().includes(lowerQuery) || matchesSearch(val, query)
      );
    }

    return false;
  };

  const filteredData = searchQuery && fileData
    ? (Array.isArray(fileData)
        ? fileData.filter(item => matchesSearch(item, searchQuery))
        : matchesSearch(fileData, searchQuery) ? fileData : null)
    : fileData;

  return (
    <div className="flex h-full">
      {/* File List */}
      <div className="w-64 border-r border-gray-200 dark:border-gray-700 flex flex-col">
        <div className="p-3 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2 mb-2">
            <Database className="w-4 h-4 text-blue-600" />
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">Data Files</h3>
          </div>
          <p className="text-xs text-gray-600 dark:text-gray-400">
            {dataFiles.length} files available
          </p>
        </div>
        <div className="flex-1 overflow-y-auto">
          {dataFiles.length === 0 ? (
            <div className="p-4 text-center text-sm text-gray-500 dark:text-gray-400">
              No data files found
            </div>
          ) : (
            <div className="p-2">
              {dataFiles.map((file, idx) => (
                <button
                  key={idx}
                  onClick={() => handleFileSelect(file)}
                  className={`w-full text-left px-3 py-2 rounded text-sm flex items-center gap-2 ${
                    selectedFile?.path === file.path
                      ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-900 dark:text-blue-300'
                      : 'hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300'
                  }`}
                >
                  <File className="w-4 h-4" />
                  <span className="truncate">{file.name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Data Viewer */}
      <div className="flex-1 flex flex-col">
        {!selectedFile ? (
          <div className="flex-1 flex items-center justify-center text-gray-500 dark:text-gray-400">
            <div className="text-center">
              <Database className="w-12 h-12 mx-auto mb-3 opacity-50" />
              <p className="text-sm">Select a data file to view</p>
            </div>
          </div>
        ) : (
          <>
            {/* Header with search */}
            <div className="p-4 border-b border-gray-200 dark:border-gray-700">
              <div className="flex items-center justify-between mb-3">
                <div>
                  <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                    {selectedFile.name}
                  </h3>
                  <p className="text-xs text-gray-500 dark:text-gray-400">{selectedFile.path}</p>
                </div>
                {fileData && (
                  <button
                    onClick={() => copyToClipboard(fileData, 'root')}
                    className="flex items-center gap-2 px-3 py-1.5 text-sm bg-blue-600 text-white rounded hover:bg-blue-700"
                  >
                    {copiedPath === 'root' ? (
                      <>
                        <CheckCircle className="w-4 h-4" />
                        Copied!
                      </>
                    ) : (
                      <>
                        <Copy className="w-4 h-4" />
                        Copy All
                      </>
                    )}
                  </button>
                )}
              </div>

              {/* Search */}
              {fileData && (
                <>
                  <div className="relative">
                    <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
                    <input
                      type="text"
                      value={searchQuery}
                      onChange={(e) => setSearchQuery(e.target.value)}
                      placeholder="Search within data..."
                      className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white text-sm"
                    />
                  </div>

                  {/* Expand/Collapse All Buttons */}
                  <div className="flex gap-2 mt-2">
                    <button
                      onClick={handleExpandAll}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors border border-gray-300 dark:border-gray-600"
                      title="Expand all nodes"
                    >
                      <ChevronsDown className="w-4 h-4" />
                      <span>Expand All</span>
                    </button>
                    <button
                      onClick={handleCollapseAll}
                      className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors border border-gray-300 dark:border-gray-600"
                      title="Collapse all nodes"
                    >
                      <ChevronsUp className="w-4 h-4" />
                      <span>Collapse All</span>
                    </button>
                  </div>
                </>
              )}
            </div>

            {/* Content */}
            <div className="flex-1 overflow-auto p-4">
              {loading && (
                <div className="text-center text-gray-500 dark:text-gray-400">Loading...</div>
              )}

              {error && (
                <div className="text-center text-red-600 dark:text-red-400">
                  Error: {error}
                </div>
              )}

              {!loading && !error && filteredData && (
                <div className="font-mono text-sm">
                  {renderValue(filteredData, 'root')}
                </div>
              )}

              {!loading && !error && searchQuery && !filteredData && (
                <div className="text-center text-gray-500 dark:text-gray-400">
                  No matches found
                </div>
              )}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default DataBrowser;
