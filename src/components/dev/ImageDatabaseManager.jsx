import React, { useState, useEffect } from 'react';
import { Search, Trash2, Move, RefreshCw, AlertTriangle, CheckCircle, FolderOpen, Database, Sparkles, HardDrive, ChevronRight, ChevronDown, Folder, File } from 'lucide-react';

/**
 * Image Database Manager - Dev Tool
 *
 * Manages the image database and keeps it in sync with the filesystem:
 * - Finds and removes orphaned entries (data exists but file doesn't)
 * - Searches image database
 * - Moves images in bulk
 * - Deletes images
 * - Updates database automatically
 */
const ImageDatabaseManager = () => {
  const [imageIndex, setImageIndex] = useState(null);
  const [searchIndex, setSearchIndex] = useState(null);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [selectedImages, setSelectedImages] = useState(new Set());
  const [orphanedImages, setOrphanedImages] = useState([]);
  const [scanning, setScanning] = useState(false);
  const [moveTarget, setMoveTarget] = useState('');
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [stats, setStats] = useState({
    total: 0,
    orphaned: 0,
    categories: 0
  });

  // Lower Quality state
  const [quality, setQuality] = useState(80);
  const [processingQuality, setProcessingQuality] = useState(false);
  const [qualityResult, setQualityResult] = useState(null);

  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [pageSize, setPageSize] = useState(50);

  // Table resize state
  const [tableHeight, setTableHeight] = useState(384); // Default: 96 * 4 = 384px (max-h-96)
  const [isResizing, setIsResizing] = useState(false);

  // Directory tree state
  const [directoryTree, setDirectoryTree] = useState([]);
  const [expandedDirs, setExpandedDirs] = useState(new Set());
  const [flattenedRows, setFlattenedRows] = useState([]);

  // Load image indexes
  useEffect(() => {
    loadImageIndexes();
  }, []);

  const loadImageIndexes = async () => {
    setLoading(true);
    try {
      // Load main index
      const mainIndexResponse = await fetch('/data/image-index.json');
      const mainIndex = await mainIndexResponse.json();
      setImageIndex(mainIndex);

      // Load search index
      const searchIndexResponse = await fetch('/data/image-search-index.json');
      const searchIndex = await searchIndexResponse.json();
      setSearchIndex(searchIndex);

      // Calculate stats
      const images = mainIndex.images || [];
      const categories = new Set(images.map(img => img.category));

      setStats({
        total: images.length,
        orphaned: 0,
        categories: categories.size
      });
    } catch (error) {
      console.error('Failed to load image indexes:', error);
    } finally {
      setLoading(false);
    }
  };

  // Build directory tree from flat image list
  const buildDirectoryTree = (images) => {
    const root = {};

    images.forEach(image => {
      // Extract directory path from image path
      // e.g., "/images/skills/fire/fireball.png" -> ["images", "skills", "fire"]
      const pathParts = image.path.split('/').filter(p => p);
      const filename = pathParts.pop();

      // Build directory tree structure
      let currentLevel = root;
      let currentPath = '';

      pathParts.forEach((part) => {
        currentPath += (currentPath ? '/' : '') + part;

        if (!currentLevel[part]) {
          currentLevel[part] = {
            type: 'directory',
            name: part,
            path: currentPath,
            children: {},
            files: [],
            fileCount: 0
          };
        }

        currentLevel = currentLevel[part];
        currentLevel = currentLevel.children;
      });

      // Add file to the deepest directory
      // Navigate back to the parent directory
      let parentDir = root;
      for (let i = 0; i < pathParts.length - 1; i++) {
        parentDir = parentDir[pathParts[i]].children;
      }

      // Get the final directory
      const lastDirName = pathParts[pathParts.length - 1];
      if (lastDirName && parentDir[lastDirName]) {
        const targetDir = parentDir[lastDirName];

        // Add file to this directory
        targetDir.files.push({
          type: 'file',
          name: filename,
          path: image.path,
          image: image
        });

        // Update file count for all parent directories
        let countDir = root;
        for (const part of pathParts) {
          if (countDir[part]) {
            countDir[part].fileCount++;
            countDir = countDir[part].children;
          }
        }
      }
    });

    // Convert nested object structure to array structure recursively
    const convertToArray = (obj) => {
      return Object.values(obj).map(node => {
        if (node.type === 'directory') {
          return {
            type: node.type,
            name: node.name,
            path: node.path,
            fileCount: node.fileCount,
            files: node.files,
            children: convertToArray(node.children)
          };
        }
        return node;
      });
    };

    return convertToArray(root);
  };

  // Flatten tree for display based on expanded directories
  const flattenTree = (tree, expanded, depth = 0) => {
    const result = [];

    tree.forEach(node => {
      if (node.type === 'directory') {
        // Add directory row
        result.push({
          ...node,
          depth,
          isExpanded: expanded.has(node.path)
        });

        // If expanded, add children (subdirectories) and files
        if (expanded.has(node.path)) {
          // Add subdirectories
          if (node.children && node.children.length > 0) {
            result.push(...flattenTree(node.children, expanded, depth + 1));
          }

          // Add files in this directory
          if (node.files && node.files.length > 0) {
            node.files.forEach(file => {
              result.push({
                ...file,
                depth: depth + 1
              });
            });
          }
        }
      }
    });

    return result;
  };

  // Scan for orphaned images
  const scanForOrphans = async () => {
    if (!imageIndex) return;

    setScanning(true);
    const orphans = [];
    const images = imageIndex.images || [];

    try {
      // Check each image in the database
      for (const image of images) {
        const imagePath = image.path;

        // Try to load the image to see if it exists
        try {
          const response = await fetch(imagePath, { method: 'HEAD' });
          if (!response.ok) {
            orphans.push(image);
          }
        } catch (error) {
          // If fetch fails, image doesn't exist
          orphans.push(image);
        }
      }

      setOrphanedImages(orphans);
      setStats(prev => ({ ...prev, orphaned: orphans.length }));
    } catch (error) {
      console.error('Error scanning for orphans:', error);
    } finally {
      setScanning(false);
    }
  };

  // Remove orphaned entries
  const removeOrphans = async () => {
    if (!imageIndex || orphanedImages.length === 0) return;

    // Filter out orphaned images
    const orphanedPaths = new Set(orphanedImages.map(img => img.path));
    const cleanedImages = imageIndex.images.filter(img => !orphanedPaths.has(img.path));

    // Update the index
    const updatedIndex = {
      ...imageIndex,
      images: cleanedImages,
      totalImages: cleanedImages.length
    };

    // In production, this would send to backend to save
    // For now, we'll just update state and log
    console.log('Would remove', orphanedImages.length, 'orphaned entries');
    console.log('Updated index:', updatedIndex);

    // Simulate saving
    alert(`Would remove ${orphanedImages.length} orphaned entries from database.\n\nIn production, this would update:\n- /data/image-index.json\n- /data/image-search-index.json`);

    setOrphanedImages([]);
    setStats(prev => ({ ...prev, orphaned: 0, total: cleanedImages.length }));
  };

  // Search images
  const handleSearch = () => {
    if (!imageIndex || !searchQuery.trim()) {
      setSearchResults([]);
      setDirectoryTree([]);
      setFlattenedRows([]);
      return;
    }

    const query = searchQuery.toLowerCase();
    const images = imageIndex.images || [];

    const results = images.filter(image => {
      const filename = (image.filename || '').toLowerCase();
      const category = (image.category || '').toLowerCase();
      const keywords = (image.keywords || []).map(k => k.toLowerCase());
      const path = (image.path || '').toLowerCase();

      return (
        filename.includes(query) ||
        category.includes(query) ||
        keywords.some(k => k.includes(query)) ||
        path.includes(query)
      );
    });

    setSearchResults(results);

    // Build directory tree from search results
    const tree = buildDirectoryTree(results);
    setDirectoryTree(tree);

    // Flatten tree for display
    const flattened = flattenTree(tree, expandedDirs);
    setFlattenedRows(flattened);

    setCurrentPage(1); // Reset to first page on new search
  };

  // Toggle directory expansion
  const toggleDirectory = (dirPath) => {
    const newExpanded = new Set(expandedDirs);
    if (newExpanded.has(dirPath)) {
      newExpanded.delete(dirPath);
    } else {
      newExpanded.add(dirPath);
    }
    setExpandedDirs(newExpanded);

    // Update flattened rows
    const flattened = flattenTree(directoryTree, newExpanded);
    setFlattenedRows(flattened);
  };

  // Get all file paths within a directory (recursive)
  const getDirectoryFiles = (dirNode) => {
    const files = [];

    // Add files in this directory
    if (dirNode.files) {
      files.push(...dirNode.files.map(f => f.path));
    }

    // Recursively add files from subdirectories
    if (dirNode.children) {
      dirNode.children.forEach(child => {
        if (child.type === 'directory') {
          files.push(...getDirectoryFiles(child));
        }
      });
    }

    return files;
  };

  // Toggle directory selection
  const toggleDirectorySelection = (dirNode) => {
    const dirFiles = getDirectoryFiles(dirNode);
    const newSelected = new Set(selectedImages);

    // Check if all files in directory are already selected
    const allSelected = dirFiles.every(path => newSelected.has(path));

    if (allSelected) {
      // Deselect all files in directory
      dirFiles.forEach(path => newSelected.delete(path));
    } else {
      // Select all files in directory
      dirFiles.forEach(path => newSelected.add(path));
    }

    setSelectedImages(newSelected);
  };

  // Get paginated results (use flattened rows if directory tree exists)
  const getPaginatedResults = () => {
    const dataToPage = flattenedRows.length > 0 ? flattenedRows : searchResults;
    const startIndex = (currentPage - 1) * pageSize;
    const endIndex = startIndex + pageSize;
    return dataToPage.slice(startIndex, endIndex);
  };

  const totalItems = flattenedRows.length > 0 ? flattenedRows.length : searchResults.length;
  const totalPages = Math.ceil(totalItems / pageSize);
  const paginatedResults = getPaginatedResults();

  // Pagination controls
  const goToPage = (page) => {
    setCurrentPage(Math.max(1, Math.min(page, totalPages)));
  };

  // Table resize handlers
  const handleResizeStart = (e) => {
    e.preventDefault();
    setIsResizing(true);
  };

  const handleResizeMove = (e) => {
    if (!isResizing) return;

    const container = e.currentTarget;
    const rect = container.getBoundingClientRect();
    const newHeight = e.clientY - rect.top;

    // Constrain height between 200px and 800px
    if (newHeight >= 200 && newHeight <= 800) {
      setTableHeight(newHeight);
    }
  };

  const handleResizeEnd = () => {
    setIsResizing(false);
  };

  // Add global mouse event listeners for resizing
  useEffect(() => {
    if (isResizing) {
      // Add cursor style to body
      document.body.style.cursor = 'ns-resize';
      document.body.style.userSelect = 'none';

      const handleMouseMove = (e) => {
        const table = document.getElementById('image-results-table');
        if (table) {
          const rect = table.getBoundingClientRect();
          const newHeight = e.clientY - rect.top;
          if (newHeight >= 200 && newHeight <= 800) {
            setTableHeight(newHeight);
          }
        }
      };

      const handleMouseUp = () => {
        setIsResizing(false);
      };

      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);

      return () => {
        document.removeEventListener('mousemove', handleMouseMove);
        document.removeEventListener('mouseup', handleMouseUp);
        document.body.style.cursor = '';
        document.body.style.userSelect = '';
      };
    }
  }, [isResizing]);

  // Toggle image selection
  const toggleSelection = (imagePath) => {
    const newSelected = new Set(selectedImages);
    if (newSelected.has(imagePath)) {
      newSelected.delete(imagePath);
    } else {
      newSelected.add(imagePath);
    }
    setSelectedImages(newSelected);
  };

  // Select all visible files (not directories)
  const selectAll = () => {
    const allFiles = flattenedRows.length > 0
      ? flattenedRows.filter(row => row.type === 'file').map(row => row.path)
      : searchResults.map(img => img.path);
    const newSelected = new Set(allFiles);
    setSelectedImages(newSelected);
  };

  // Clear selection
  const clearSelection = () => {
    setSelectedImages(new Set());
  };

  // Move selected images
  const moveSelectedImages = () => {
    if (selectedImages.size === 0) {
      alert('No images selected');
      return;
    }

    setShowMoveDialog(true);
  };

  // Execute move operation
  const executeMoveOperation = () => {
    if (!moveTarget.trim()) {
      alert('Please enter a target directory');
      return;
    }

    const imagesToMove = Array.from(selectedImages);

    console.log('Would move images:', imagesToMove);
    console.log('To directory:', moveTarget);

    alert(`Would move ${imagesToMove.length} images to: ${moveTarget}\n\nIn production, this would:\n1. Move physical files\n2. Update image-index.json\n3. Update image-search-index.json`);

    setShowMoveDialog(false);
    setMoveTarget('');
    clearSelection();
  };

  // Delete selected images
  const deleteSelectedImages = () => {
    if (selectedImages.size === 0) {
      alert('No images selected');
      return;
    }

    const imagesToDelete = Array.from(selectedImages);

    if (!confirm(`Are you sure you want to delete ${imagesToDelete.length} images? This cannot be undone.`)) {
      return;
    }

    console.log('Would delete images:', imagesToDelete);

    alert(`Would delete ${imagesToDelete.length} images.\n\nIn production, this would:\n1. Delete physical files\n2. Remove from image-index.json\n3. Remove from image-search-index.json`);

    clearSelection();
  };

  // Process lower quality on selected images
  const processLowerQuality = async () => {
    if (selectedImages.size === 0) {
      alert('Please select images or directories to process');
      return;
    }

    const imagePaths = Array.from(selectedImages);

    if (!confirm(`Lower quality of ${imagePaths.length} selected images to ${quality}%?\n\nOriginals will be backed up to external/image-backup/`)) {
      return;
    }

    setProcessingQuality(true);
    setQualityResult(null);

    try {
      const response = await fetch('/api/image-db/lower-quality', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imagePaths,
          quality
        })
      });

      // Check if response is OK before parsing JSON
      if (!response.ok) {
        const text = await response.text();
        console.error('API response error:', response.status, text);
        throw new Error(`API returned ${response.status}: ${text || 'Unknown error'}`);
      }

      const result = await response.json();

      setQualityResult(result);
      alert(`Success! Processed ${result.processed} images.\nTotal size saved: ${formatBytes(result.totalSizeSaved)} (${result.totalPercentSaved}%)`);

      // Clear selection after successful processing
      clearSelection();
    } catch (error) {
      console.error('Failed to lower quality:', error);
      alert(`Failed to lower quality: ${error.message}`);
    } finally {
      setProcessingQuality(false);
    }
  };

  // Format bytes to human readable
  const formatBytes = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <div className="text-center">
          <RefreshCw className="w-8 h-8 animate-spin mx-auto mb-2" />
          <p className="text-gray-900 dark:text-white">Loading image database...</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Database className="w-8 h-8 text-blue-600" />
              <div>
                <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Image Database Manager</h1>
                <p className="text-sm text-gray-600 dark:text-gray-400 dark:text-gray-400">Dev tool for managing image database and filesystem sync</p>
              </div>
            </div>
            <button
              onClick={loadImageIndexes}
              className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              <RefreshCw className="w-4 h-4" />
              Reload
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-4 p-6 bg-gray-50 dark:bg-gray-900">
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">Total Images</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.total.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">Orphaned Entries</div>
            <div className="text-2xl font-bold text-red-600 dark:text-red-400">{stats.orphaned.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <div className="text-sm text-gray-600 dark:text-gray-400">Categories</div>
            <div className="text-2xl font-bold text-gray-900 dark:text-white">{stats.categories}</div>
          </div>
        </div>

        {/* Orphan Scanner */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600" />
              <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Orphaned Images Scanner</h2>
            </div>
            <div className="flex gap-2">
              <button
                onClick={scanForOrphans}
                disabled={scanning}
                className="flex items-center gap-2 px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50"
              >
                {scanning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    Scanning...
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    Scan for Orphans
                  </>
                )}
              </button>
              {orphanedImages.length > 0 && (
                <button
                  onClick={removeOrphans}
                  className="flex items-center gap-2 px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700"
                >
                  <Trash2 className="w-4 h-4" />
                  Remove {orphanedImages.length} Orphans
                </button>
              )}
            </div>
          </div>

          {orphanedImages.length > 0 && (
            <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 max-h-64 overflow-y-auto">
              <p className="text-sm text-red-800 font-medium mb-2">
                Found {orphanedImages.length} orphaned entries (database entries with no physical file):
              </p>
              <ul className="text-sm text-red-700 space-y-1">
                {orphanedImages.slice(0, 10).map((img, idx) => (
                  <li key={idx} className="font-mono">{img.path}</li>
                ))}
                {orphanedImages.length > 10 && (
                  <li className="text-red-600">... and {orphanedImages.length - 10} more</li>
                )}
              </ul>
            </div>
          )}
        </div>

        {/* Lower Quality */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Sparkles className="w-5 h-5 text-purple-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Lower Image Quality</h2>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Select images or directories from the search results above, then reduce file size by lowering quality. Original images are automatically backed up to{' '}
            <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-gray-900 dark:text-white">external/image-backup/</code>{' '}
            before processing.
          </p>

          <div className="space-y-4">
            {/* Selection Info */}
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-3">
              <p className="text-sm text-blue-900 dark:text-blue-300">
                <strong>{selectedImages.size}</strong> images currently selected
              </p>
            </div>

            {/* Quality Slider */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Quality: {quality}%
              </label>
              <div className="flex items-center gap-4">
                <input
                  type="range"
                  min="1"
                  max="100"
                  value={quality}
                  onChange={(e) => setQuality(parseInt(e.target.value))}
                  className="flex-1"
                />
                <input
                  type="number"
                  min="1"
                  max="100"
                  value={quality}
                  onChange={(e) => setQuality(Math.min(100, Math.max(1, parseInt(e.target.value) || 80)))}
                  className="w-20 px-3 py-1 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-purple-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
                />
              </div>
              <p className="text-xs text-gray-500 mt-1">
                Lower values = smaller file size but lower quality. Recommended: 80-85 for web use.
              </p>
            </div>

            {/* Process Button */}
            <button
              onClick={processLowerQuality}
              disabled={processingQuality || selectedImages.size === 0}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-purple-600 text-white rounded-lg hover:bg-purple-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {processingQuality ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Processing images...
                </>
              ) : (
                <>
                  <HardDrive className="w-4 h-4" />
                  Lower Quality of Selected Images
                </>
              )}
            </button>

            {/* Results */}
            {qualityResult && (
              <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className="w-5 h-5 text-green-600" />
                  <h3 className="font-semibold text-gray-900 dark:text-white text-green-900">Processing Complete</h3>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Quality:</span>
                    <p className="font-semibold text-green-900 dark:text-green-300">{qualityResult.quality}%</p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Images Processed:</span>
                    <p className="font-semibold text-green-900 dark:text-green-300">{qualityResult.processed}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Failed:</span>
                    <p className="font-semibold text-red-600 dark:text-red-400">{qualityResult.failed}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Size Before:</span>
                    <p className="font-semibold text-gray-900 dark:text-white">{formatBytes(qualityResult.totalSizeBefore)}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Size After:</span>
                    <p className="font-semibold text-gray-900 dark:text-white">{formatBytes(qualityResult.totalSizeAfter)}</p>
                  </div>
                  <div className="col-span-2">
                    <span className="text-gray-600 dark:text-gray-400">Total Saved:</span>
                    <p className="font-semibold text-green-600 text-lg">
                      {formatBytes(qualityResult.totalSizeSaved)} ({qualityResult.totalPercentSaved}%)
                    </p>
                  </div>
                </div>
                <p className="text-xs text-gray-600 mt-3">
                  Originals backed up to: <code className="bg-gray-100 dark:bg-gray-700 px-1 py-0.5 rounded text-gray-900 dark:text-white">external/image-backup/</code>
                </p>
              </div>
            )}
          </div>
        </div>

        {/* Search */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-6">
          <div className="flex items-center gap-2 mb-4">
            <Search className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">Search Images</h2>
          </div>

          <div className="flex gap-2 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search by filename, category, keywords, or path..."
              className="flex-1 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            />
            <button
              onClick={handleSearch}
              className="px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              Search
            </button>
          </div>

          {searchResults.length > 0 && (
            <>
              {/* Bulk Actions */}
              <div className="flex items-center justify-between mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex items-center gap-4">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedImages.size} of {searchResults.length} files selected
                  </span>
                  <button
                    onClick={selectAll}
                    className="text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    Select All
                  </button>
                  <button
                    onClick={clearSelection}
                    className="text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Clear
                  </button>
                </div>
                {selectedImages.size > 0 && (
                  <div className="flex gap-2">
                    <button
                      onClick={moveSelectedImages}
                      className="flex items-center gap-1 px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      <Move className="w-4 h-4" />
                      Move
                    </button>
                    <button
                      onClick={deleteSelectedImages}
                      className="flex items-center gap-1 px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Results */}
              <div className="relative">
                <div
                  id="image-results-table"
                  className="border border-gray-200 dark:border-gray-700 rounded-t-lg overflow-y-auto"
                  style={{ height: `${tableHeight}px` }}
                >
                  <table className="w-full text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-20">
                    <tr>
                      <th className="w-12 p-3 text-left bg-gray-50 dark:bg-gray-700">
                        <input
                          type="checkbox"
                          checked={selectedImages.size === searchResults.length}
                          onChange={() => selectedImages.size === searchResults.length ? clearSelection() : selectAll()}
                          className="rounded"
                        />
                      </th>
                      <th className="p-3 text-left font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700">Preview</th>
                      <th className="p-3 text-left font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700">Filename</th>
                      <th className="p-3 text-left font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700">Category</th>
                      <th className="p-3 text-left font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700">Path</th>
                      <th className="p-3 text-left font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700">Size</th>
                    </tr>
                  </thead>
                  <tbody>
                    {paginatedResults.map((row, idx) => {
                      const isDirectory = row.type === 'directory';
                      const isFile = row.type === 'file';
                      const indentLevel = row.depth || 0;
                      const indentPx = indentLevel * 20;

                      if (isDirectory) {
                        const dirFiles = getDirectoryFiles(row);
                        const allFilesSelected = dirFiles.length > 0 && dirFiles.every(path => selectedImages.has(path));
                        const someFilesSelected = dirFiles.some(path => selectedImages.has(path)) && !allFilesSelected;

                        return (
                          <tr
                            key={`dir-${row.path}-${idx}`}
                            className="hover:bg-gray-100 dark:hover:bg-gray-700 sticky z-10"
                            style={{ top: '43px' }}
                          >
                            <td className="p-3 bg-gray-100 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-800">
                              <input
                                type="checkbox"
                                checked={allFilesSelected}
                                ref={(el) => {
                                  if (el) el.indeterminate = someFilesSelected;
                                }}
                                onChange={() => toggleDirectorySelection(row)}
                                className="rounded"
                              />
                            </td>
                            <td className="p-3 bg-gray-100 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-800" colSpan="5">
                              <div className="flex items-center gap-2" style={{ paddingLeft: `${indentPx}px` }}>
                                <button
                                  onClick={() => toggleDirectory(row.path)}
                                  className="flex items-center gap-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded p-1"
                                >
                                  {row.isExpanded ? (
                                    <ChevronDown className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                  ) : (
                                    <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
                                  )}
                                  <Folder className="w-5 h-5 text-blue-500" />
                                  <span className="font-semibold text-gray-900 dark:text-white">
                                    {row.name}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    ({row.fileCount} {row.fileCount === 1 ? 'file' : 'files'})
                                  </span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      if (isFile) {
                        const image = row.image;
                        return (
                          <tr
                            key={`file-${row.path}-${idx}`}
                            className={`border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 ${
                              selectedImages.has(row.path) ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                            }`}
                          >
                            <td className="p-3">
                              <div style={{ paddingLeft: `${indentPx}px` }}>
                                <input
                                  type="checkbox"
                                  checked={selectedImages.has(row.path)}
                                  onChange={() => toggleSelection(row.path)}
                                  className="rounded"
                                />
                              </div>
                            </td>
                            <td className="p-3">
                              <img
                                src={image.path}
                                alt={image.filename}
                                className="w-12 h-12 object-cover rounded"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'flex';
                                }}
                              />
                              <div className="w-12 h-12 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs hidden">
                                N/A
                              </div>
                            </td>
                            <td className="p-3 font-mono text-xs text-gray-900 dark:text-gray-200">{image.filename}</td>
                            <td className="p-3">
                              <span className="px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
                                {image.category}
                              </span>
                            </td>
                            <td className="p-3 font-mono text-xs text-gray-600 dark:text-gray-400">{image.path}</td>
                            <td className="p-3 text-gray-600 dark:text-gray-400">
                              {image.filesize ? `${(image.filesize / 1024).toFixed(1)} KB` : 'N/A'}
                            </td>
                          </tr>
                        );
                      }

                      return null;
                    })}
                  </tbody>
                </table>
              </div>

              {/* Resize Handle */}
              <div
                onMouseDown={handleResizeStart}
                className={`
                  relative h-2 bg-gray-200 dark:bg-gray-600 border-x border-b border-gray-200 dark:border-gray-700 rounded-b-lg
                  cursor-ns-resize hover:bg-gray-300 dark:hover:bg-gray-500 transition-colors
                  flex items-center justify-center group
                  ${isResizing ? 'bg-blue-400 dark:bg-blue-600' : ''}
                `}
              >
                <div className="w-12 h-0.5 bg-gray-400 dark:bg-gray-500 group-hover:bg-gray-500 dark:group-hover:bg-gray-400 rounded-full"></div>
                {isResizing && (
                  <div className="absolute -top-8 left-1/2 transform -translate-x-1/2 px-2 py-1 bg-gray-900 dark:bg-gray-700 text-white text-xs rounded shadow-lg">
                    {tableHeight}px
                  </div>
                )}
              </div>
            </div>

              {/* Pagination Controls */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600 dark:text-gray-400">
                      Page {currentPage} of {totalPages}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-500">
                      ({totalItems} total {flattenedRows.length > 0 ? 'rows' : 'files'}, showing {pageSize} per page)
                    </span>
                  </div>
                  <div className="flex items-center gap-2">
                    <button
                      onClick={() => goToPage(1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1 bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      First
                    </button>
                    <button
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="px-3 py-1 bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Previous
                    </button>
                    <button
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Next
                    </button>
                    <button
                      onClick={() => goToPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="px-3 py-1 bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed"
                    >
                      Last
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </div>

      {/* Move Dialog */}
      {showMoveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-4">
              <Move className="w-5 h-5 text-blue-600 dark:text-blue-400" />
              <h3 className="text-lg font-semibold text-gray-900 dark:text-white">Move Images</h3>
            </div>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Moving {selectedImages.size} images to a new directory.
            </p>
            <div className="mb-4">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Target Directory
              </label>
              <input
                type="text"
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
                placeholder="e.g., skills/fire/hellfire-slash"
                className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Relative to public/images/
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowMoveDialog(false)}
                className="px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600"
              >
                Cancel
              </button>
              <button
                onClick={executeMoveOperation}
                className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Move Images
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageDatabaseManager;
