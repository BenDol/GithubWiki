import React, { useState, useEffect } from 'react';
import { Search, Trash2, Move, RefreshCw, AlertTriangle, CheckCircle, FolderOpen, Database, Sparkles, HardDrive, ChevronRight, ChevronDown, Folder, File, Eye, Copy, CheckSquare, Square, Wrench } from 'lucide-react';
import { useConfigStore } from '../../store/configStore.js';

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

  // Resolve orphans state
  const [resolveResults, setResolveResults] = useState(null);
  const [resolving, setResolving] = useState(false);

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

  // Row selection for shift+click
  const [lastClickedIndex, setLastClickedIndex] = useState(null);

  // Context menu state
  const [contextMenu, setContextMenu] = useState(null);

  // Track if initial search has been performed
  const [initialSearchDone, setInitialSearchDone] = useState(false);

  // Fix missing data state
  const [fixingDimensions, setFixingDimensions] = useState(false);
  const [dimensionFixResult, setDimensionFixResult] = useState(null);

  // Load image indexes
  useEffect(() => {
    loadImageIndexes();
  }, []);

  // Auto-search "/" on mount to show all images by default
  useEffect(() => {
    if (imageIndex && !initialSearchDone) {
      setSearchQuery('/');
      setInitialSearchDone(true);
      // Trigger search with "/" query
      const query = '/'.toLowerCase();
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

      // Flatten tree for display (start with no directories expanded)
      const flattened = flattenTree(tree, new Set());
      setFlattenedRows(flattened);

      setCurrentPage(1);
      setLastClickedIndex(null);
    }
  }, [imageIndex, initialSearchDone]);

  // Close context menu on click outside, scroll, or escape
  useEffect(() => {
    const handleClickOutside = () => {
      setContextMenu(null);
    };

    const handleScroll = () => {
      setContextMenu(null);
    };

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        setContextMenu(null);
      }
    };

    if (contextMenu) {
      document.addEventListener('click', handleClickOutside);
      document.addEventListener('scroll', handleScroll, true);
      document.addEventListener('keydown', handleEscape);
      return () => {
        document.removeEventListener('click', handleClickOutside);
        document.removeEventListener('scroll', handleScroll, true);
        document.removeEventListener('keydown', handleEscape);
      };
    }
  }, [contextMenu]);

  const loadImageIndexes = async () => {
    setLoading(true);
    try {
      // Try to load from CDN first if configured
      let mainIndex;
      const config = await useConfigStore.getState().loadConfig();
      const gameAssets = config?.features?.gameAssets;
      const cdnConfig = gameAssets?.cdn;

      if (gameAssets?.enabled && cdnConfig?.github) {
        const { owner, repo, basePath, branch = 'main' } = cdnConfig.github;
        const cdnBaseUrl = `https://cdn.jsdelivr.net/gh/${owner}/${repo}@${branch}/${basePath}`;
        const cdnIndexUrl = `${cdnBaseUrl}/images/image-index.json`;

        try {
          const mainIndexResponse = await fetch(cdnIndexUrl);
          if (mainIndexResponse.ok) {
            mainIndex = await mainIndexResponse.json();
            console.log('Loaded image index from CDN');
          }
        } catch (cdnError) {
          console.warn('Failed to load from CDN, trying local fallback', cdnError);
        }
      }

      // Fallback to local if CDN failed or not configured
      if (!mainIndex) {
        const mainIndexResponse = await fetch('/data/image-index.json');
        mainIndex = await mainIndexResponse.json();
        console.log('Loaded image index from local fallback');
      }

      setImageIndex(mainIndex);

      // Calculate stats
      const images = mainIndex.images || [];
      const categories = new Set(images.map(img => img.category));

      setStats({
        total: images.length,
        orphaned: 0,
        categories: categories.size
      });

      return mainIndex; // Return for use in chained operations
    } catch (error) {
      console.error('Failed to load image index:', error);
      return null;
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

  // Resolve orphans - find moved images and missing entries
  const resolveOrphans = async (freshIndex = null) => {
    const indexToUse = freshIndex || imageIndex;
    if (!indexToUse) return;

    setResolving(true);
    setResolveResults(null);

    try {
      const images = indexToUse.images || [];

      // Step 1: Scan filesystem for all image files
      const response = await fetch('/api/image-db/scan-filesystem', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API returned ${response.status}: ${text || 'Unknown error'}`);
      }

      const { files: filesystemFiles } = await response.json();

      // Step 2: Find orphaned database entries (database has entry but file doesn't exist)
      const orphanedEntries = [];
      for (const image of images) {
        if (!filesystemFiles.includes(image.path)) {
          orphanedEntries.push(image);
        }
      }

      // Step 3: Find missing database entries (file exists but no database entry)
      const databasePaths = new Set(images.map(img => img.path));
      const missingEntries = filesystemFiles.filter(filePath => !databasePaths.has(filePath));

      // Step 4: Try to match orphaned entries to files by filename
      const resolved = [];
      const unresolvableOrphans = [];

      for (const orphan of orphanedEntries) {
        const orphanFilename = orphan.filename || orphan.path.split('/').pop();

        // Try to find a file with the same filename in missing entries
        const matchingFile = missingEntries.find(filePath => {
          const filename = filePath.split('/').pop();
          return filename === orphanFilename;
        });

        if (matchingFile) {
          // Found a match!
          resolved.push({
            orphan,
            oldPath: orphan.path,
            newPath: matchingFile,
            filename: orphanFilename
          });

          // Remove from missing entries since we found its match
          const idx = missingEntries.indexOf(matchingFile);
          if (idx !== -1) {
            missingEntries.splice(idx, 1);
          }
        } else {
          // No match found
          unresolvableOrphans.push(orphan);
        }
      }

      setResolveResults({
        resolved,
        unresolvableOrphans,
        missingEntries
      });

    } catch (error) {
      console.error('Failed to resolve orphans:', error);
      alert(`Failed to resolve orphans: ${error.message}`);
    } finally {
      setResolving(false);
    }
  };

  // Apply resolved orphan mappings
  const applyResolvedOrphans = async () => {
    if (!resolveResults || resolveResults.resolved.length === 0) return;

    if (!confirm(`Apply ${resolveResults.resolved.length} resolved orphan mappings?\n\nThis will update the database to point to the new file locations.`)) {
      return;
    }

    try {
      const response = await fetch('/api/image-db/resolve-orphans', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          resolved: resolveResults.resolved
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API returned ${response.status}: ${text || 'Unknown error'}`);
      }

      const result = await response.json();
      alert(`Success! Updated ${result.updated} database entries.`);

      // Reload the image indexes and get fresh data
      const freshIndex = await loadImageIndexes();

      // Re-run resolve with fresh data to update results
      await resolveOrphans(freshIndex);

    } catch (error) {
      console.error('Failed to apply resolved orphans:', error);
      alert(`Failed to apply resolved orphans: ${error.message}`);
    }
  };

  // Delete unresolvable orphans from database
  const deleteUnresolvableOrphans = async () => {
    if (!resolveResults || resolveResults.unresolvableOrphans.length === 0) return;

    if (!confirm(`⚠️ Delete ${resolveResults.unresolvableOrphans.length} unresolvable orphaned entries from the database?\n\nThis will permanently remove these entries. The files don't exist, so only database entries will be removed.`)) {
      return;
    }

    try {
      const orphanPaths = resolveResults.unresolvableOrphans.map(o => o.path);

      const response = await fetch('/api/image-db/delete-orphan-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paths: orphanPaths
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API returned ${response.status}: ${text || 'Unknown error'}`);
      }

      const result = await response.json();
      alert(`Success! Removed ${result.deleted} orphaned database entries.`);

      // Reload the image indexes and get fresh data
      const freshIndex = await loadImageIndexes();

      // Re-run resolve with fresh data to update results
      await resolveOrphans(freshIndex);

    } catch (error) {
      console.error('Failed to delete orphans:', error);
      alert(`Failed to delete orphans: ${error.message}`);
    }
  };

  // Add missing database entries
  const addMissingEntries = async () => {
    if (!resolveResults || resolveResults.missingEntries.length === 0) return;

    if (!confirm(`Add ${resolveResults.missingEntries.length} missing database entries?\n\nThis will create database entries for files that exist but aren't in the index.`)) {
      return;
    }

    try {
      const response = await fetch('/api/image-db/add-missing-entries', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          paths: resolveResults.missingEntries
        })
      });

      if (!response.ok) {
        const text = await response.text();
        throw new Error(`API returned ${response.status}: ${text || 'Unknown error'}`);
      }

      const result = await response.json();
      alert(`Success! Added ${result.added} missing database entries.`);

      // Reload the image indexes and get fresh data
      const freshIndex = await loadImageIndexes();

      // Re-run resolve with fresh data to update results
      await resolveOrphans(freshIndex);

    } catch (error) {
      console.error('Failed to add missing entries:', error);
      alert(`Failed to add missing entries: ${error.message}`);
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
    alert(`Would remove ${orphanedImages.length} orphaned entries from database.\n\nIn production, this would update:\n- /data/image-index.json`);

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
    setLastClickedIndex(null); // Reset shift+click tracking on new search
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

  // Handle row click with shift+click range selection support
  const handleRowClick = (imagePath, currentIndex, event) => {
    // If shift key is pressed and we have a last clicked index, select range
    if (event.shiftKey && lastClickedIndex !== null) {
      const fileRows = paginatedResults.filter(row => row.type === 'file');
      const startIndex = Math.min(lastClickedIndex, currentIndex);
      const endIndex = Math.max(lastClickedIndex, currentIndex);

      const newSelected = new Set(selectedImages);
      for (let i = startIndex; i <= endIndex; i++) {
        if (fileRows[i]) {
          newSelected.add(fileRows[i].path);
        }
      }

      setSelectedImages(newSelected);
    } else {
      // Normal click - toggle selection
      toggleSelection(imagePath);
      setLastClickedIndex(currentIndex);
    }
  };

  // Handle right-click context menu
  const handleContextMenu = (event, imagePath, imageData) => {
    event.preventDefault();
    event.stopPropagation();

    // If right-clicked image is not selected, select only it
    if (!selectedImages.has(imagePath)) {
      setSelectedImages(new Set([imagePath]));
    }

    // Calculate position to prevent menu from going off-screen
    const menuWidth = 200;
    const menuHeight = 300; // Approximate
    const x = event.clientX + menuWidth > window.innerWidth
      ? event.clientX - menuWidth
      : event.clientX;
    const y = event.clientY + menuHeight > window.innerHeight
      ? event.clientY - menuHeight
      : event.clientY;

    setContextMenu({
      x,
      y,
      imagePath,
      imageData,
      selectedCount: selectedImages.has(imagePath) ? selectedImages.size : 1
    });
  };

  // Context menu actions
  const handleContextMove = () => {
    setContextMenu(null);
    moveSelectedImages();
  };

  const handleContextDelete = () => {
    setContextMenu(null);
    deleteSelectedImages();
  };

  const handleContextSelectOnly = () => {
    if (contextMenu) {
      setSelectedImages(new Set([contextMenu.imagePath]));
    }
    setContextMenu(null);
  };

  const handleContextDeselect = () => {
    if (contextMenu) {
      const newSelected = new Set(selectedImages);
      newSelected.delete(contextMenu.imagePath);
      setSelectedImages(newSelected);
    }
    setContextMenu(null);
  };

  const handleContextViewImage = () => {
    if (contextMenu?.imageData) {
      window.open(contextMenu.imageData.path, '_blank');
    }
    setContextMenu(null);
  };

  const handleContextCopyPath = () => {
    if (contextMenu?.imagePath) {
      navigator.clipboard.writeText(contextMenu.imagePath);
      alert(`Copied to clipboard: ${contextMenu.imagePath}`);
    }
    setContextMenu(null);
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
    setLastClickedIndex(null);
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
  const executeMoveOperation = async () => {
    if (!moveTarget.trim()) {
      alert('Please enter a target directory');
      return;
    }

    const imagesToMove = Array.from(selectedImages);

    if (!confirm(`Move ${imagesToMove.length} images to: /images/${moveTarget}/\n\nThis will update both the filesystem and database.`)) {
      return;
    }

    setShowMoveDialog(false);

    try {
      const response = await fetch('/api/image-db/move-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imagePaths: imagesToMove,
          targetCategory: moveTarget
        })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('API response error:', response.status, text);
        throw new Error(`API returned ${response.status}: ${text || 'Unknown error'}`);
      }

      const result = await response.json();

      if (result.failed > 0) {
        alert(`Move completed with some issues:\n\nMoved: ${result.moved}\nFailed: ${result.failed}\n\nCheck console for details.`);
        console.error('Failed moves:', result.failedMoves);
      } else {
        alert(`Success! Moved ${result.moved} images to: /images/${moveTarget}/`);
      }

      // Reload the image indexes to reflect changes
      await loadImageIndexes();

      // Clear search to show updated state
      setSearchQuery('');
      setSearchResults([]);
      setDirectoryTree([]);
      setFlattenedRows([]);

    } catch (error) {
      console.error('Failed to move images:', error);
      alert(`Failed to move images: ${error.message}`);
    } finally {
      setMoveTarget('');
      clearSelection();
    }
  };

  // Delete selected images
  const deleteSelectedImages = async () => {
    if (selectedImages.size === 0) {
      alert('No images selected');
      return;
    }

    const imagesToDelete = Array.from(selectedImages);

    if (!confirm(`⚠️ WARNING: Delete ${imagesToDelete.length} images?\n\nThis will PERMANENTLY delete the files from the filesystem and remove them from the database.\n\nThis action CANNOT be undone!`)) {
      return;
    }

    try {
      const response = await fetch('/api/image-db/delete-images', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          imagePaths: imagesToDelete
        })
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('API response error:', response.status, text);
        throw new Error(`API returned ${response.status}: ${text || 'Unknown error'}`);
      }

      const result = await response.json();

      if (result.failed > 0) {
        alert(`Delete completed with some issues:\n\nDeleted: ${result.deleted}\nFailed: ${result.failed}\n\nCheck console for details.`);
        console.error('Failed deletes:', result.failedDeletes);
      } else {
        alert(`Success! Deleted ${result.deleted} images.`);
      }

      // Reload the image indexes to reflect changes
      await loadImageIndexes();

      // Clear search to show updated state
      setSearchQuery('');
      setSearchResults([]);
      setDirectoryTree([]);
      setFlattenedRows([]);

    } catch (error) {
      console.error('Failed to delete images:', error);
      alert(`Failed to delete images: ${error.message}`);
    } finally {
      clearSelection();
    }
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

  // Fix missing dimensions
  const fixMissingDimensions = async () => {
    if (!confirm('Scan all images and fix missing dimension data?\n\nThis will read image files and update the database with width and height information.')) {
      return;
    }

    setFixingDimensions(true);
    setDimensionFixResult(null);

    try {
      const response = await fetch('/api/image-db/fix-missing-dimensions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const text = await response.text();
        console.error('API response error:', response.status, text);
        throw new Error(`API returned ${response.status}: ${text || 'Unknown error'}`);
      }

      const result = await response.json();
      setDimensionFixResult(result);

      if (result.fixed > 0) {
        alert(`Success! Fixed ${result.fixed} images with missing dimensions.`);

        // Reload the image indexes to reflect changes
        await loadImageIndexes();
      } else {
        alert('No images with missing dimensions found. All images have dimension data!');
      }

    } catch (error) {
      console.error('Failed to fix missing dimensions:', error);
      alert(`Failed to fix missing dimensions: ${error.message}`);
    } finally {
      setFixingDimensions(false);
    }
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
    <div className="max-w-7xl mx-auto p-3 sm:p-4 md:p-6">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-lg">
        {/* Header */}
        <div className="border-b border-gray-200 dark:border-gray-700 p-3 sm:p-4 md:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
            <div className="flex items-start gap-2 sm:gap-3 flex-1 min-w-0">
              <Database className="w-6 h-6 sm:w-8 sm:h-8 text-blue-600 flex-shrink-0" />
              <div className="min-w-0">
                <h1 className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white">Image Database Manager</h1>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Dev tool for managing image database and filesystem sync</p>
              </div>
            </div>
            <button
              onClick={loadImageIndexes}
              className="flex items-center gap-2 px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base flex-shrink-0 w-full sm:w-auto justify-center"
            >
              <RefreshCw className="w-4 h-4" />
              Reload
            </button>
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3 md:gap-4 p-3 sm:p-4 md:p-6 bg-gray-50 dark:bg-gray-900">
          <div className="bg-white dark:bg-gray-800 p-2 sm:p-3 md:p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Total Images</div>
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{stats.total.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-2 sm:p-3 md:p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Orphaned</div>
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-red-600 dark:text-red-400">{stats.orphaned.toLocaleString()}</div>
          </div>
          <div className="bg-white dark:bg-gray-800 p-2 sm:p-3 md:p-4 rounded-lg shadow border border-gray-200 dark:border-gray-700">
            <div className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">Categories</div>
            <div className="text-lg sm:text-xl md:text-2xl font-bold text-gray-900 dark:text-white">{stats.categories}</div>
          </div>
        </div>

        {/* Orphan Scanner */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 sm:p-4 md:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-orange-600 flex-shrink-0" />
              <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Orphaned Images Scanner</h2>
            </div>
            <div className="flex flex-col sm:flex-row gap-2 w-full sm:w-auto">
              <button
                onClick={scanForOrphans}
                disabled={scanning}
                className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 text-sm sm:text-base"
              >
                {scanning ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span className="hidden sm:inline">Scanning...</span>
                    <span className="sm:hidden">Scan...</span>
                  </>
                ) : (
                  <>
                    <Search className="w-4 h-4" />
                    <span>Scan for Orphans</span>
                  </>
                )}
              </button>
              {orphanedImages.length > 0 && (
                <button
                  onClick={removeOrphans}
                  className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 text-sm sm:text-base"
                >
                  <Trash2 className="w-4 h-4" />
                  <span className="hidden sm:inline">Remove {orphanedImages.length} Orphans</span>
                  <span className="sm:hidden">Remove ({orphanedImages.length})</span>
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

        {/* Resolve Orphans */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 sm:p-4 md:p-6">
          <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4">
            <div className="flex items-start gap-2">
              <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
              <div>
                <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Resolve Orphans</h2>
                <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                  Find moved images and missing database entries
                </p>
              </div>
            </div>
            <button
              onClick={resolveOrphans}
              disabled={resolving}
              className="flex items-center justify-center gap-2 px-3 sm:px-4 py-2 bg-green-600 text-white rounded-lg hover:bg-green-700 disabled:opacity-50 text-sm sm:text-base w-full sm:w-auto"
            >
              {resolving ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>Resolving...</span>
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  <span>Resolve Orphans</span>
                </>
              )}
            </button>
          </div>

          {/* Results */}
          {resolveResults && (
            <div className="space-y-4">
              {/* Resolved Matches */}
              {resolveResults.resolved.length > 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <CheckCircle className="w-5 h-5 text-green-600" />
                      <h3 className="font-semibold text-green-900 dark:text-green-100">
                        Resolved Matches ({resolveResults.resolved.length})
                      </h3>
                    </div>
                    <button
                      onClick={applyResolvedOrphans}
                      className="px-3 py-1 bg-green-600 text-white text-sm rounded hover:bg-green-700"
                    >
                      Apply Mappings
                    </button>
                  </div>
                  <p className="text-xs text-green-800 dark:text-green-200 mb-2">
                    Found matching files for these orphaned database entries:
                  </p>
                  <div className="space-y-2 max-h-64 overflow-y-auto">
                    {resolveResults.resolved.map((match, idx) => (
                      <div key={idx} className="bg-white dark:bg-gray-800 border border-green-200 dark:border-green-700 rounded p-2 text-xs">
                        <div className="font-mono text-gray-600 dark:text-gray-400">
                          <span className="text-red-600 dark:text-red-400 line-through">{match.oldPath}</span>
                        </div>
                        <div className="font-mono text-green-700 dark:text-green-300 mt-1">
                          → {match.newPath}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {/* Unresolvable Orphans */}
              {resolveResults.unresolvableOrphans.length > 0 && (
                <div className="bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <AlertTriangle className="w-5 h-5 text-orange-600" />
                      <h3 className="font-semibold text-orange-900 dark:text-orange-100">
                        Unresolvable Orphans ({resolveResults.unresolvableOrphans.length})
                      </h3>
                    </div>
                    <button
                      onClick={deleteUnresolvableOrphans}
                      className="px-3 py-1 bg-red-600 text-white text-sm rounded hover:bg-red-700"
                    >
                      Delete Orphans
                    </button>
                  </div>
                  <p className="text-xs text-orange-800 dark:text-orange-200 mb-2">
                    Database entries with no matching files found:
                  </p>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {resolveResults.unresolvableOrphans.slice(0, 10).map((orphan, idx) => (
                      <div key={idx} className="font-mono text-xs text-orange-700 dark:text-orange-300 bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-700 rounded p-2">
                        {orphan.path}
                      </div>
                    ))}
                    {resolveResults.unresolvableOrphans.length > 10 && (
                      <div className="text-xs text-orange-600 dark:text-orange-400">
                        ... and {resolveResults.unresolvableOrphans.length - 10} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* Missing Entries */}
              {resolveResults.missingEntries.length > 0 && (
                <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                  <div className="flex items-center justify-between mb-3">
                    <div className="flex items-center gap-2">
                      <Database className="w-5 h-5 text-blue-600" />
                      <h3 className="font-semibold text-blue-900 dark:text-blue-100">
                        Missing Database Entries ({resolveResults.missingEntries.length})
                      </h3>
                    </div>
                    <button
                      onClick={addMissingEntries}
                      className="px-3 py-1 bg-blue-600 text-white text-sm rounded hover:bg-blue-700"
                    >
                      Add Entries
                    </button>
                  </div>
                  <p className="text-xs text-blue-800 dark:text-blue-200 mb-2">
                    Files exist but have no database entries:
                  </p>
                  <div className="space-y-1 max-h-64 overflow-y-auto">
                    {resolveResults.missingEntries.slice(0, 10).map((path, idx) => (
                      <div key={idx} className="font-mono text-xs text-blue-700 dark:text-blue-300 bg-white dark:bg-gray-800 border border-blue-200 dark:border-blue-700 rounded p-2">
                        {path}
                      </div>
                    ))}
                    {resolveResults.missingEntries.length > 10 && (
                      <div className="text-xs text-blue-600 dark:text-blue-400">
                        ... and {resolveResults.missingEntries.length - 10} more
                      </div>
                    )}
                  </div>
                </div>
              )}

              {/* All Clean */}
              {resolveResults.resolved.length === 0 &&
               resolveResults.unresolvableOrphans.length === 0 &&
               resolveResults.missingEntries.length === 0 && (
                <div className="bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg p-4 text-center">
                  <CheckCircle className="w-8 h-8 text-green-600 mx-auto mb-2" />
                  <p className="text-sm font-semibold text-green-900 dark:text-green-100">
                    All Clean!
                  </p>
                  <p className="text-xs text-green-700 dark:text-green-300 mt-1">
                    No orphaned entries or missing database entries found.
                  </p>
                </div>
              )}
            </div>
          )}
        </div>

        {/* Search */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 sm:p-4 md:p-6">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Search className="w-5 h-5 text-blue-600 flex-shrink-0" />
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Search Images</h2>
          </div>

          <div className="flex flex-col sm:flex-row gap-2 mb-4">
            <input
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
              placeholder="Search by filename, category, keywords, or path..."
              className="flex-1 px-3 sm:px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm sm:text-base"
            />
            <button
              onClick={handleSearch}
              className="px-4 sm:px-6 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base whitespace-nowrap"
            >
              Search
            </button>
          </div>

          {searchResults.length > 0 && (
            <>
              {/* Bulk Actions */}
              <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mb-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                <div className="flex flex-wrap items-center gap-2 sm:gap-4">
                  <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                    {selectedImages.size} of {searchResults.length} selected
                  </span>
                  <button
                    onClick={selectAll}
                    className="text-xs sm:text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300"
                  >
                    Select All
                  </button>
                  <button
                    onClick={clearSelection}
                    className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300"
                  >
                    Clear
                  </button>
                </div>
                {selectedImages.size > 0 && (
                  <div className="flex gap-2 w-full sm:w-auto">
                    <button
                      onClick={moveSelectedImages}
                      className="flex items-center justify-center gap-1 flex-1 sm:flex-initial px-3 py-1 bg-blue-600 text-white text-xs sm:text-sm rounded hover:bg-blue-700"
                    >
                      <Move className="w-3 h-3 sm:w-4 sm:h-4" />
                      Move
                    </button>
                    <button
                      onClick={deleteSelectedImages}
                      className="flex items-center justify-center gap-1 flex-1 sm:flex-initial px-3 py-1 bg-red-600 text-white text-xs sm:text-sm rounded hover:bg-red-700"
                    >
                      <Trash2 className="w-3 h-3 sm:w-4 sm:h-4" />
                      Delete
                    </button>
                  </div>
                )}
              </div>

              {/* Results */}
              <div className="relative overflow-x-auto">
                <div
                  id="image-results-table"
                  className="border border-gray-200 dark:border-gray-700 rounded-t-lg overflow-y-auto min-w-[640px]"
                  style={{ height: `${tableHeight}px` }}
                >
                  <table className="w-full text-xs sm:text-sm">
                  <thead className="bg-gray-50 dark:bg-gray-700 sticky top-0 z-20">
                    <tr>
                      <th className="w-8 sm:w-12 p-2 sm:p-3 text-left bg-gray-50 dark:bg-gray-700">
                        <input
                          type="checkbox"
                          checked={selectedImages.size === searchResults.length}
                          onChange={() => selectedImages.size === searchResults.length ? clearSelection() : selectAll()}
                          className="rounded"
                        />
                      </th>
                      <th className="p-2 sm:p-3 text-left font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 text-xs sm:text-sm">Preview</th>
                      <th className="p-2 sm:p-3 text-left font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 text-xs sm:text-sm">Filename</th>
                      <th className="p-2 sm:p-3 text-left font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 text-xs sm:text-sm">Category</th>
                      <th className="p-2 sm:p-3 text-left font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 text-xs sm:text-sm">Path</th>
                      <th className="p-2 sm:p-3 text-left font-medium text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-700 text-xs sm:text-sm">Size</th>
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
                            <td className="p-2 sm:p-3 bg-gray-100 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-800">
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
                            <td className="p-2 sm:p-3 bg-gray-100 dark:bg-gray-800 border-t border-gray-100 dark:border-gray-800" colSpan="5">
                              <div className="flex items-center gap-1 sm:gap-2" style={{ paddingLeft: `${indentPx}px` }}>
                                <button
                                  onClick={() => toggleDirectory(row.path)}
                                  className="flex items-center gap-1 hover:bg-gray-200 dark:hover:bg-gray-700 rounded p-1"
                                >
                                  {row.isExpanded ? (
                                    <ChevronDown className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" />
                                  ) : (
                                    <ChevronRight className="w-3 h-3 sm:w-4 sm:h-4 text-gray-600 dark:text-gray-400" />
                                  )}
                                  <Folder className="w-4 h-4 sm:w-5 sm:h-5 text-blue-500" />
                                  <span className="font-semibold text-gray-900 dark:text-white text-xs sm:text-sm">
                                    {row.name}
                                  </span>
                                  <span className="text-xs text-gray-500 dark:text-gray-400">
                                    ({row.fileCount})
                                  </span>
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      }

                      if (isFile) {
                        const image = row.image;
                        // Calculate the file row index for shift+click
                        const fileRows = paginatedResults.filter(r => r.type === 'file');
                        const fileRowIndex = fileRows.findIndex(r => r.path === row.path);

                        return (
                          <tr
                            key={`file-${row.path}-${idx}`}
                            className={`border-t border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-700 cursor-pointer ${
                              selectedImages.has(row.path) ? 'bg-blue-50 dark:bg-blue-900/30' : ''
                            }`}
                            onClick={(e) => handleRowClick(row.path, fileRowIndex, e)}
                            onContextMenu={(e) => handleContextMenu(e, row.path, image)}
                          >
                            <td className="p-2 sm:p-3">
                              <div style={{ paddingLeft: `${indentPx}px` }}>
                                <input
                                  type="checkbox"
                                  checked={selectedImages.has(row.path)}
                                  onChange={(e) => {
                                    e.stopPropagation();
                                    toggleSelection(row.path);
                                  }}
                                  className="rounded"
                                />
                              </div>
                            </td>
                            <td className="p-2 sm:p-3">
                              <img
                                src={image.path}
                                alt={image.filename}
                                className="w-10 h-10 sm:w-12 sm:h-12 object-cover rounded"
                                onError={(e) => {
                                  e.target.style.display = 'none';
                                  e.target.nextSibling.style.display = 'flex';
                                }}
                              />
                              <div className="w-10 h-10 sm:w-12 sm:h-12 bg-gray-200 rounded flex items-center justify-center text-gray-400 text-xs hidden">
                                N/A
                              </div>
                            </td>
                            <td className="p-2 sm:p-3 font-mono text-xs text-gray-900 dark:text-gray-200">{image.filename}</td>
                            <td className="p-2 sm:p-3">
                              <span className="px-1.5 sm:px-2 py-0.5 sm:py-1 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded text-xs">
                                {image.category}
                              </span>
                            </td>
                            <td className="p-2 sm:p-3 font-mono text-xs text-gray-600 dark:text-gray-400">{image.path}</td>
                            <td className="p-2 sm:p-3 text-xs text-gray-600 dark:text-gray-400">
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
                <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3 mt-4 p-3 bg-gray-50 dark:bg-gray-700 rounded-lg">
                  <div className="flex flex-col gap-1">
                    <span className="text-xs sm:text-sm text-gray-600 dark:text-gray-400">
                      Page {currentPage} of {totalPages}
                    </span>
                    <span className="text-xs text-gray-500 dark:text-gray-500">
                      ({totalItems} total, {pageSize} per page)
                    </span>
                  </div>
                  <div className="flex items-center gap-1 sm:gap-2 w-full sm:w-auto">
                    <button
                      onClick={() => goToPage(1)}
                      disabled={currentPage === 1}
                      className="flex-1 sm:flex-initial px-2 sm:px-3 py-1 bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                    >
                      First
                    </button>
                    <button
                      onClick={() => goToPage(currentPage - 1)}
                      disabled={currentPage === 1}
                      className="flex-1 sm:flex-initial px-2 sm:px-3 py-1 bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                    >
                      Prev
                    </button>
                    <button
                      onClick={() => goToPage(currentPage + 1)}
                      disabled={currentPage === totalPages}
                      className="flex-1 sm:flex-initial px-2 sm:px-3 py-1 bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                    >
                      Next
                    </button>
                    <button
                      onClick={() => goToPage(totalPages)}
                      disabled={currentPage === totalPages}
                      className="flex-1 sm:flex-initial px-2 sm:px-3 py-1 bg-white dark:bg-gray-600 text-gray-700 dark:text-gray-200 rounded border border-gray-300 dark:border-gray-500 hover:bg-gray-50 dark:hover:bg-gray-500 disabled:opacity-50 disabled:cursor-not-allowed text-xs sm:text-sm"
                    >
                      Last
                    </button>
                  </div>
                </div>
              )}
            </>
          )}
        </div>

        {/* Lower Quality */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 sm:p-4 md:p-6">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Sparkles className="w-5 h-5 text-purple-600 flex-shrink-0" />
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Lower Image Quality</h2>
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

        {/* Fix Missing Data */}
        <div className="border-t border-gray-200 dark:border-gray-700 p-3 sm:p-4 md:p-6">
          <div className="flex items-center gap-2 mb-3 sm:mb-4">
            <Wrench className="w-5 h-5 text-orange-600 flex-shrink-0" />
            <h2 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Fix Missing Data</h2>
          </div>

          <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
            Scan the image database for entries with missing metadata (like dimensions) and automatically fix them by reading the actual image files.
          </p>

          <div className="space-y-4">
            {/* Fix Dimensions Button */}
            <button
              onClick={fixMissingDimensions}
              disabled={fixingDimensions}
              className="w-full flex items-center justify-center gap-2 px-4 py-3 bg-orange-600 text-white rounded-lg hover:bg-orange-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {fixingDimensions ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  Scanning and fixing...
                </>
              ) : (
                <>
                  <Wrench className="w-4 h-4" />
                  Fix Missing Dimensions
                </>
              )}
            </button>

            {/* Results */}
            {dimensionFixResult && (
              <div className={`border rounded-lg p-4 ${
                dimensionFixResult.failed > 0
                  ? 'bg-orange-50 dark:bg-orange-900/20 border-orange-200 dark:border-orange-800'
                  : 'bg-green-50 dark:bg-green-900/20 border-green-200 dark:border-green-800'
              }`}>
                <div className="flex items-center gap-2 mb-2">
                  <CheckCircle className={`w-5 h-5 ${
                    dimensionFixResult.failed > 0 ? 'text-orange-600' : 'text-green-600'
                  }`} />
                  <h3 className={`font-semibold ${
                    dimensionFixResult.failed > 0
                      ? 'text-orange-900 dark:text-orange-100'
                      : 'text-green-900 dark:text-green-100'
                  }`}>
                    Scan Complete
                  </h3>
                </div>
                <div className="grid grid-cols-2 gap-4 text-sm">
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Total Images:</span>
                    <p className="font-semibold text-gray-900 dark:text-white">{dimensionFixResult.total}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Missing Dimensions:</span>
                    <p className="font-semibold text-orange-600 dark:text-orange-400">{dimensionFixResult.missingData}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Fixed:</span>
                    <p className="font-semibold text-green-600 dark:text-green-400">{dimensionFixResult.fixed}</p>
                  </div>
                  <div>
                    <span className="text-gray-600 dark:text-gray-400">Failed:</span>
                    <p className="font-semibold text-red-600 dark:text-red-400">{dimensionFixResult.failed}</p>
                  </div>
                </div>

                {/* Show failed images if any */}
                {dimensionFixResult.failedImages && dimensionFixResult.failedImages.length > 0 && (
                  <div className="mt-3 pt-3 border-t border-orange-200 dark:border-orange-700">
                    <p className="text-xs font-semibold text-orange-900 dark:text-orange-100 mb-2">
                      Failed to fix ({dimensionFixResult.failedImages.length}):
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {dimensionFixResult.failedImages.slice(0, 5).map((failed, idx) => (
                        <div key={idx} className="text-xs font-mono text-orange-700 dark:text-orange-300 bg-white dark:bg-gray-800 border border-orange-200 dark:border-orange-700 rounded p-2">
                          <div className="font-semibold">{failed.path}</div>
                          <div className="text-orange-600 dark:text-orange-400">{failed.error || failed.reason}</div>
                        </div>
                      ))}
                      {dimensionFixResult.failedImages.length > 5 && (
                        <div className="text-xs text-orange-600 dark:text-orange-400">
                          ... and {dimensionFixResult.failedImages.length - 5} more
                        </div>
                      )}
                    </div>
                  </div>
                )}

                {/* Show sample of fixed images */}
                {dimensionFixResult.fixedImages && dimensionFixResult.fixedImages.filter(f => !f.skipped).length > 0 && (
                  <div className="mt-3 pt-3 border-t border-green-200 dark:border-green-700">
                    <p className="text-xs font-semibold text-green-900 dark:text-green-100 mb-2">
                      Sample of fixed images:
                    </p>
                    <div className="space-y-1 max-h-32 overflow-y-auto">
                      {dimensionFixResult.fixedImages.filter(f => !f.skipped).slice(0, 5).map((fixed, idx) => (
                        <div key={idx} className="text-xs font-mono text-green-700 dark:text-green-300 bg-white dark:bg-gray-800 border border-green-200 dark:border-green-700 rounded p-2">
                          <div className="font-semibold">{fixed.path}</div>
                          {fixed.dimensions && (
                            <div className="text-green-600 dark:text-green-400">
                              {fixed.dimensions.width} × {fixed.dimensions.height}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* Move Dialog */}
      {showMoveDialog && (
        <div className="fixed inset-0 bg-black bg-opacity-50 flex items-center justify-center z-50 p-4">
          <div className="bg-white dark:bg-gray-800 rounded-lg shadow-xl max-w-md w-full p-4 sm:p-6 border border-gray-200 dark:border-gray-700">
            <div className="flex items-center gap-2 mb-3 sm:mb-4">
              <Move className="w-5 h-5 text-blue-600 dark:text-blue-400 flex-shrink-0" />
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white">Move Images</h3>
            </div>
            <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3 sm:mb-4">
              Moving {selectedImages.size} images to a new directory.
            </p>
            <div className="mb-4">
              <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Target Directory
              </label>
              <input
                type="text"
                value={moveTarget}
                onChange={(e) => setMoveTarget(e.target.value)}
                placeholder="e.g., skills/fire/hellfire-slash"
                className="w-full px-3 sm:px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm sm:text-base"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Relative to public/images/
              </p>
            </div>
            <div className="flex gap-2 justify-end">
              <button
                onClick={() => setShowMoveDialog(false)}
                className="px-3 sm:px-4 py-2 text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 text-sm sm:text-base"
              >
                Cancel
              </button>
              <button
                onClick={executeMoveOperation}
                className="px-3 sm:px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 text-sm sm:text-base"
              >
                Move Images
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Context Menu */}
      {contextMenu && (
        <div
          className="fixed bg-white dark:bg-gray-800 rounded-lg shadow-xl border border-gray-200 dark:border-gray-700 py-1 min-w-[200px] z-50"
          style={{
            top: `${contextMenu.y}px`,
            left: `${contextMenu.x}px`,
          }}
          onClick={(e) => e.stopPropagation()}
        >
          {/* Header */}
          <div className="px-3 py-2 border-b border-gray-200 dark:border-gray-700">
            <p className="text-xs font-semibold text-gray-500 dark:text-gray-400">
              {contextMenu.selectedCount > 1
                ? `${contextMenu.selectedCount} images selected`
                : contextMenu.imageData?.filename || 'Image Actions'
              }
            </p>
          </div>

          {/* Actions */}
          <div className="py-1">
            {/* View Image */}
            <button
              onClick={handleContextViewImage}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <Eye className="w-4 h-4" />
              View Image
            </button>

            {/* Copy Path */}
            <button
              onClick={handleContextCopyPath}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
            >
              <Copy className="w-4 h-4" />
              Copy Path
            </button>

            <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>

            {/* Select Only This */}
            {contextMenu.selectedCount > 1 && (
              <button
                onClick={handleContextSelectOnly}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <CheckSquare className="w-4 h-4" />
                Select Only This
              </button>
            )}

            {/* Deselect */}
            {selectedImages.has(contextMenu.imagePath) && (
              <button
                onClick={handleContextDeselect}
                className="w-full flex items-center gap-2 px-3 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 text-left"
              >
                <Square className="w-4 h-4" />
                Deselect
              </button>
            )}

            <div className="border-t border-gray-200 dark:border-gray-700 my-1"></div>

            {/* Move */}
            <button
              onClick={handleContextMove}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 text-left"
            >
              <Move className="w-4 h-4" />
              Move {contextMenu.selectedCount > 1 ? `(${contextMenu.selectedCount})` : ''}
            </button>

            {/* Delete */}
            <button
              onClick={handleContextDelete}
              className="w-full flex items-center gap-2 px-3 py-2 text-sm text-red-600 dark:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 text-left"
            >
              <Trash2 className="w-4 h-4" />
              Delete {contextMenu.selectedCount > 1 ? `(${contextMenu.selectedCount})` : ''}
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageDatabaseManager;
