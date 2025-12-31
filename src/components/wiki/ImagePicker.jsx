import React, { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Search, Image as ImageIcon, ChevronLeft, ChevronRight, AlignLeft, AlignCenter, AlignRight, Upload, Loader } from 'lucide-react';
import ImageUploadModal from './ImageUploadModal.jsx';
import { createLogger } from '../../utils/logger.js';

const logger = createLogger('ImagePicker');

/**
 * ImagePicker - Modal for browsing and selecting images from the image database
 *
 * Features:
 * - Browse images with thumbnail grid
 * - Search by filename or keywords
 * - Filter by category
 * - Pagination for large datasets
 * - Insert markdown syntax for selected image
 */
const ImagePicker = ({ isOpen, onClose, onSelect }) => {
  const [images, setImages] = useState([]);
  const [filteredImages, setFilteredImages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('all');
  const [categories, setCategories] = useState([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [selectedImage, setSelectedImage] = useState(null);
  const [selectedImageList, setSelectedImageList] = useState([]); // For multiselect
  const [multiselectMode, setMultiselectMode] = useState(false);
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [scalePercentage, setScalePercentage] = useState(100);
  const [alignment, setAlignment] = useState('none');
  const [displayMode, setDisplayMode] = useState('block');
  const [isMobile, setIsMobile] = useState(false);
  const [cdnImages, setCdnImages] = useState([]);
  const [activeTab, setActiveTab] = useState('static'); // 'static' or 'cdn'
  const [showUploadModal, setShowUploadModal] = useState(false);
  const [pendingImages, setPendingImages] = useState([]); // Images waiting for index
  const imagesPerPage = 24;
  const isScalingRef = useRef(false);

  // Detect mobile viewport
  useEffect(() => {
    const checkMobile = () => {
      setIsMobile(window.innerWidth < 768);
    };
    checkMobile();
    window.addEventListener('resize', checkMobile);
    return () => window.removeEventListener('resize', checkMobile);
  }, []);

  // Load image index
  useEffect(() => {
    if (!isOpen) return;

    const loadImages = async () => {
      setLoading(true);
      setError(null);

      try {
        const response = await fetch('/data/image-index.json');
        if (!response.ok) {
          throw new Error('Failed to load image database');
        }

        const data = await response.json();
        setImages(data.images || []);

        // Extract unique categories
        const uniqueCategories = [...new Set(data.images.map(img => img.category))].sort();
        setCategories(uniqueCategories);

        setFilteredImages(data.images || []);
      } catch (err) {
        console.error('Failed to load images:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadImages();
  }, [isOpen]);

  // Load CDN images
  const loadCdnImages = async () => {
    try {
      logger.debug('Loading CDN image index from GitHub API');
      const cdnBaseUrl = 'https://raw.githubusercontent.com/BenDol/SlayerLegendCDN/main';

      // Use GitHub Contents API to get the latest version (always returns HEAD)
      const apiUrl = 'https://api.github.com/repos/BenDol/SlayerLegendCDN/contents/user-content/images/image-index.json';
      const response = await fetch(apiUrl, {
        headers: {
          'Accept': 'application/vnd.github.v3+json'
        },
        cache: 'no-store'
      });

      if (!response.ok) {
        throw new Error('Failed to load CDN image index from GitHub API');
      }

      const apiData = await response.json();

      // Decode base64 content
      const content = atob(apiData.content.replace(/\s/g, '')); // Remove whitespace from base64
      const data = JSON.parse(content);

      logger.debug('Fetched image index', {
        sha: apiData.sha,
        size: apiData.size,
        imageCount: data.images?.length
      });

      // Prepend CDN base URL to relative paths
      const imagesWithCdnUrls = (data.images || []).map(img => ({
        ...img,
        path: img.path?.startsWith('http') ? img.path : `${cdnBaseUrl}/${img.path}`,
        webpPath: img.webpPath?.startsWith('http') ? img.webpPath : `${cdnBaseUrl}/${img.webpPath}`
      }));

      setCdnImages(imagesWithCdnUrls);
      logger.info('Loaded CDN images', { count: imagesWithCdnUrls.length, sha: apiData.sha });

      // Extract unique categories from CDN images and merge with static categories
      const cdnCategories = [...new Set(imagesWithCdnUrls.map(img => img.category))].sort();
      const allCategories = [...new Set([...categories, ...cdnCategories])].sort();
      setCategories(allCategories);

      return imagesWithCdnUrls;
    } catch (error) {
      logger.error('Failed to load CDN images', { error: error.message });
      setCdnImages([]);
      return [];
    }
  };

  useEffect(() => {
    if (!isOpen || activeTab !== 'cdn') return;
    loadCdnImages();
  }, [isOpen, activeTab]);

  // Poll for newly uploaded image to appear in index
  const pollForImage = async (imageId, uploadResult) => {
    const maxAttempts = 90; // 90 attempts = 3 minutes (2 sec intervals)
    let attempts = 0;

    logger.info('Starting to poll for image in index (using GitHub API for fresh data)', { imageId });

    const poll = async () => {
      attempts++;
      const elapsed = attempts * 2;
      logger.debug('Polling for image in index', {
        imageId,
        attempt: attempts,
        maxAttempts,
        elapsedSeconds: elapsed
      });

      const latestImages = await loadCdnImages();
      logger.debug('Polled index', {
        totalImages: latestImages.length,
        lookingFor: imageId,
        imageIds: latestImages.map(img => img.id)
      });

      const foundImage = latestImages.find(img => img.id === imageId);

      if (foundImage) {
        logger.info('Image found in index!', { imageId, afterSeconds: elapsed });
        // Remove from pending
        setPendingImages(prev => prev.filter(p => p.id !== imageId));
        return;
      }

      if (attempts >= maxAttempts) {
        logger.warn('Image polling timed out after 3 minutes - GitHub Action may still be running', { imageId });
        // Remove from pending after timeout
        setPendingImages(prev => prev.filter(p => p.id !== imageId));
        return;
      }

      // Continue polling
      setTimeout(poll, 2000); // Poll every 2 seconds
    };

    // Start polling after 1 second
    setTimeout(poll, 1000);
  };

  // Filter images based on search and category
  useEffect(() => {
    // Use appropriate image source based on active tab
    // Combine actual CDN images with pending images
    const sourceImages = activeTab === 'static' ? images : [...pendingImages, ...cdnImages];
    let filtered = sourceImages;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(img => img.category === selectedCategory);
    }

    // Filter by search query (filename, keywords, name, tags, description)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(img => {
        const filenameMatch = img.filename?.toLowerCase().includes(query);
        const keywordsMatch = img.keywords?.some(kw => kw.toLowerCase().includes(query));
        const pathMatch = img.path?.toLowerCase().includes(query);
        const nameMatch = img.name?.toLowerCase().includes(query);
        const tagsMatch = img.tags?.some(tag => tag.toLowerCase().includes(query));
        const descriptionMatch = img.description?.toLowerCase().includes(query);
        return filenameMatch || keywordsMatch || pathMatch || nameMatch || tagsMatch || descriptionMatch;
      });
    }

    setFilteredImages(filtered);
    setCurrentPage(1); // Reset to first page on filter change
  }, [searchQuery, selectedCategory, images, cdnImages, pendingImages, activeTab]);

  // Pagination
  const totalPages = Math.ceil(filteredImages.length / imagesPerPage);
  const startIndex = (currentPage - 1) * imagesPerPage;
  const endIndex = startIndex + imagesPerPage;
  const currentImages = filteredImages.slice(startIndex, endIndex);

  // Handle image selection
  const handleImageSelect = (image, event) => {
    const isCtrlClick = event?.ctrlKey || event?.metaKey; // Ctrl on Windows/Linux, Cmd on Mac

    // Enable multiselect mode automatically on Ctrl+Click
    if (isCtrlClick && !multiselectMode) {
      setMultiselectMode(true);
    }

    if (multiselectMode || isCtrlClick) {
      // Multiselect mode: toggle selection in array
      setSelectedImageList(prev => {
        const existing = prev.find(img => img.path === image.path);
        if (existing) {
          // Remove from selection
          return prev.filter(img => img.path !== image.path);
        } else {
          // Add to selection
          return [...prev, image];
        }
      });

      // Update primary selection for preview
      setSelectedImage(image);
    } else {
      // Single select mode
      setSelectedImage(image);
      setSelectedImageList([image]);
      // Reset dimensions when selecting new image
      setCustomWidth('');
      setCustomHeight('');
      setMaintainAspectRatio(true);
      setScalePercentage(100);
      setAlignment('none');
      setDisplayMode('block');
    }
  };

  // Handle width change with aspect ratio
  const handleWidthChange = (value) => {
    setCustomWidth(value);
    if (maintainAspectRatio && selectedImage?.dimensions && value) {
      const aspectRatio = selectedImage.dimensions.height / selectedImage.dimensions.width;
      const newHeight = Math.round(parseInt(value) * aspectRatio);
      setCustomHeight(newHeight.toString());
    }
    // Update scale percentage based on width (but not if we're currently scaling)
    if (selectedImage?.dimensions && !isScalingRef.current) {
      if (!value || value === '') {
        setScalePercentage(100);
      } else {
        const percentage = Math.round((parseInt(value) / selectedImage.dimensions.width) * 100);
        setScalePercentage(percentage);
      }
    }
  };

  // Handle height change with aspect ratio
  const handleHeightChange = (value) => {
    setCustomHeight(value);
    if (maintainAspectRatio && selectedImage?.dimensions && value) {
      const aspectRatio = selectedImage.dimensions.width / selectedImage.dimensions.height;
      const newWidth = Math.round(parseInt(value) * aspectRatio);
      setCustomWidth(newWidth.toString());
    }
    // Update scale percentage based on height (but not if we're currently scaling)
    if (selectedImage?.dimensions && !isScalingRef.current) {
      if (!value || value === '') {
        setScalePercentage(100);
      } else {
        const percentage = Math.round((parseInt(value) / selectedImage.dimensions.height) * 100);
        setScalePercentage(percentage);
      }
    }
  };

  // Handle scale percentage change
  const handleScaleChange = (percentage) => {
    isScalingRef.current = true;
    setScalePercentage(percentage);
    if (selectedImage?.dimensions) {
      if (percentage === 100) {
        // At 100%, clear the custom dimensions to use original
        setCustomWidth('');
        setCustomHeight('');
      } else {
        const newWidth = Math.round((selectedImage.dimensions.width * percentage) / 100);
        const newHeight = Math.round((selectedImage.dimensions.height * percentage) / 100);
        setCustomWidth(newWidth.toString());
        setCustomHeight(newHeight.toString());
      }
    }
    // Reset flag after a brief delay to allow state updates to complete
    setTimeout(() => {
      isScalingRef.current = false;
    }, 0);
  };

  // Insert image markdown
  const handleInsert = () => {
    // Handle multiselect mode with multiple images
    if (multiselectMode && selectedImageList.length > 0) {
      // For multiselect, insert all images with scaled dimensions
      const markdownArray = selectedImageList.map(img => {
        let markdown;

        // Calculate scaled dimensions from original dimensions and scale percentage
        const originalWidth = img.dimensions?.width;
        const originalHeight = img.dimensions?.height;
        const scaledWidth = originalWidth ? Math.round(originalWidth * scalePercentage / 100) : null;
        const scaledHeight = originalHeight ? Math.round(originalHeight * scalePercentage / 100) : null;

        // Build inline style and attributes
        if (displayMode === 'inline') {
          const inlineClass = ' class="inline-image"';
          const dataAttr = ' data-inline="true"';

          if (scaledWidth || scaledHeight) {
            // Has dimensions: include them in style
            const widthStyle = scaledWidth ? `width: ${scaledWidth}px; ` : '';
            const heightStyle = scaledHeight ? `height: ${scaledHeight}px; ` : '';
            const inlineStyle = ` style="display: inline-block; vertical-align: middle; ${widthStyle}${heightStyle}margin: 0 0.25em;"`;
            markdown = `<img src="${img.path}" alt=""${inlineClass}${inlineStyle}${dataAttr} />`;
          } else {
            // No dimensions: auto-size to text height
            const inlineStyle = ' style="display: inline-block; vertical-align: middle; max-height: 1.5em; width: auto; margin: 0 0.25em;"';
            markdown = `<img src="${img.path}" alt=""${inlineClass}${inlineStyle}${dataAttr} />`;
          }
        } else if (scaledWidth || scaledHeight) {
          // Block mode with dimensions
          const widthAttr = scaledWidth ? ` width="${scaledWidth}"` : '';
          const heightAttr = scaledHeight ? ` height="${scaledHeight}"` : '';
          markdown = `<img src="${img.path}" alt=""${widthAttr}${heightAttr} />`;
        } else {
          // Block mode without dimensions - use standard markdown
          markdown = `![](${img.path})`;
        }

        // Apply alignment wrapper if needed (only for block mode)
        if (alignment !== 'none' && displayMode === 'block') {
          let style;
          if (alignment === 'center') {
            style = 'display: flex; justify-content: center;';
          } else if (alignment === 'left') {
            style = 'display: flex; justify-content: flex-start;';
          } else if (alignment === 'right') {
            style = 'display: flex; justify-content: flex-end;';
          }
          markdown = `<div style="${style}">\n${markdown}\n</div>`;
        }

        return markdown;
      });

      const combinedMarkdown = markdownArray.join('\n\n');
      onSelect?.(combinedMarkdown, selectedImageList, { mode: displayMode, alignment, multiselect: true });

      // Reset and close
      setSelectedImage(null);
      setSelectedImageList([]);
      setMultiselectMode(false);
      setCustomWidth('');
      setCustomHeight('');
      setAlignment('none');
      setDisplayMode('block');
      setSearchQuery('');
      setSelectedCategory('all');
      onClose?.();
      return;
    }

    // Single select mode
    if (!selectedImage) return;

    let markdown;

    // Determine which dimensions to use (custom or original)
    const finalWidth = customWidth || selectedImage.dimensions?.width;
    const finalHeight = customHeight || selectedImage.dimensions?.height;

    // Build inline style and attributes
    if (displayMode === 'inline') {
      const inlineClass = ' class="inline-image"';
      const dataAttr = ' data-inline="true"';

      // Check if we have any dimensions (custom or original)
      const width = customWidth || finalWidth;
      const height = customHeight || finalHeight;

      if (width || height) {
        // Has dimensions: include them in style for higher specificity
        const widthStyle = width ? `width: ${width}px; ` : '';
        const heightStyle = height ? `height: ${height}px; ` : '';
        const inlineStyle = ` style="display: inline-block; vertical-align: middle; ${widthStyle}${heightStyle}margin: 0 0.25em;"`;
        markdown = `<img src="${selectedImage.path}" alt=""${inlineClass}${inlineStyle}${dataAttr} />`;
      } else {
        // No dimensions at all: auto-size to text height
        const inlineStyle = ' style="display: inline-block; vertical-align: middle; max-height: 1.5em; width: auto; margin: 0 0.25em;"';
        markdown = `<img src="${selectedImage.path}" alt=""${inlineClass}${inlineStyle}${dataAttr} />`;
      }
    } else if (finalWidth || finalHeight) {
      // Block mode with dimensions
      const widthAttr = finalWidth ? ` width="${finalWidth}"` : '';
      const heightAttr = finalHeight ? ` height="${finalHeight}"` : '';
      markdown = `<img src="${selectedImage.path}" alt=""${widthAttr}${heightAttr} />`;
    } else {
      // Block mode without dimensions - use standard markdown
      markdown = `![](${selectedImage.path})`;
    }

    // Apply alignment wrapper if needed (only for block mode)
    if (alignment !== 'none' && displayMode === 'block') {
      let style;
      if (alignment === 'center') {
        style = 'display: flex; justify-content: center;';
      } else if (alignment === 'left') {
        style = 'display: flex; justify-content: flex-start;';
      } else if (alignment === 'right') {
        style = 'display: flex; justify-content: flex-end;';
      }
      markdown = `<div style="${style}">\n${markdown}\n</div>`;
    }

    onSelect?.(markdown, selectedImage, { mode: displayMode, alignment });

    // Reset and close
    setSelectedImage(null);
    setSelectedImageList([]);
    setCustomWidth('');
    setCustomHeight('');
    setAlignment('none');
    setDisplayMode('block');
    setSearchQuery('');
    setSelectedCategory('all');
    onClose?.();
  };

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

  if (!isOpen) return null;

  const modal = (
    <div className={`fixed inset-0 ${isMobile ? 'z-[9999]' : 'z-50'} flex ${isMobile ? 'items-start' : 'items-center justify-center p-4'} ${isMobile ? 'p-0' : ''}`}>
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className={`relative bg-white dark:bg-gray-800 shadow-2xl w-full border border-gray-200 dark:border-gray-700 flex flex-col ${
        isMobile
          ? 'h-full'
          : 'rounded-lg max-w-6xl max-h-[90vh]'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-3">
            <ImageIcon className="w-6 h-6 text-blue-600" />
            <div>
              <h2 className="text-xl font-semibold text-gray-900 dark:text-white">
                Image Picker
              </h2>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                {filteredImages.length} images available
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded-lg transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Tab System */}
        <div className="flex items-center justify-between px-4 pt-4 pb-2 border-b border-gray-200 dark:border-gray-700">
          <div className="flex gap-1">
            <button
              onClick={() => setActiveTab('static')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'static'
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              Static Assets ({images.length})
            </button>
            <button
              onClick={() => setActiveTab('cdn')}
              className={`px-4 py-2 font-medium transition-colors ${
                activeTab === 'cdn'
                  ? 'border-b-2 border-blue-500 text-blue-600 dark:text-blue-400'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-gray-200'
              }`}
            >
              User Uploads ({cdnImages.length + pendingImages.length})
            </button>
          </div>

          <button
            onClick={() => setShowUploadModal(true)}
            className="flex items-center gap-2 px-4 py-2 bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors text-sm"
          >
            <Upload className="w-4 h-4" />
            Upload
          </button>
        </div>

        {/* Search and Filters */}
        <div className="p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex flex-col sm:flex-row gap-3">
            {/* Search Bar */}
            <div className="relative flex-1">
              <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search images..."
                className="w-full pl-10 pr-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
              />
            </div>

            {/* Category Filter Dropdown */}
            <div className="w-full sm:w-56">
              <select
                value={selectedCategory}
                onChange={(e) => setSelectedCategory(e.target.value)}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm cursor-pointer"
              >
                <option value="all">All Categories ({images.length})</option>
                {categories.map(category => {
                  const count = images.filter(img => img.category === category).length;
                  return (
                    <option key={category} value={category}>
                      {category.charAt(0).toUpperCase() + category.slice(1)} ({count})
                    </option>
                  );
                })}
              </select>
            </div>
          </div>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-auto p-4">
          {loading && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 text-gray-400 animate-pulse" />
                <p className="text-gray-600 dark:text-gray-400">Loading images...</p>
              </div>
            </div>
          )}

          {error && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center text-red-600 dark:text-red-400">
                <p className="font-semibold mb-2">Error loading images</p>
                <p className="text-sm">{error}</p>
              </div>
            </div>
          )}

          {!loading && !error && filteredImages.length === 0 && (
            <div className="flex items-center justify-center h-64">
              <div className="text-center text-gray-500 dark:text-gray-400">
                <ImageIcon className="w-12 h-12 mx-auto mb-3 opacity-50" />
                <p className="font-semibold mb-1">No images found</p>
                <p className="text-sm">Try adjusting your search or filters</p>
              </div>
            </div>
          )}

          {!loading && !error && currentImages.length > 0 && (
            <>
              {/* Multiselect Toggle - Above Grid - Compact */}
              <div className="flex items-center justify-between mb-2 pb-1.5 border-b border-gray-200 dark:border-gray-700">
                <div className="flex items-center gap-1.5">
                  <span className="text-xs text-gray-600 dark:text-gray-400">Mode:</span>
                  <div className="flex items-center gap-0.5 bg-gray-100 dark:bg-gray-700 rounded p-0.5">
                    <button
                      onClick={() => {
                        setMultiselectMode(false);
                        setSelectedImageList(selectedImage ? [selectedImage] : []);
                      }}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                        !multiselectMode
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      Single
                    </button>
                    <button
                      onClick={() => {
                        setMultiselectMode(true);
                        setSelectedImageList(selectedImage ? [selectedImage] : []);
                      }}
                      className={`px-2 py-0.5 rounded text-xs font-medium transition-all ${
                        multiselectMode
                          ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow'
                          : 'text-gray-600 dark:text-gray-400'
                      }`}
                    >
                      Multi
                    </button>
                  </div>
                </div>
                {multiselectMode && selectedImageList.length > 0 && (
                  <div className="text-xs text-gray-600 dark:text-gray-400">
                    <span className="font-medium text-blue-600 dark:text-blue-400">{selectedImageList.length}</span> selected
                  </div>
                )}
              </div>

              <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
                {currentImages.map(image => {
                  const isSelected = multiselectMode
                    ? selectedImageList.some(img => img.path === image.path)
                    : selectedImage?.path === image.path;

                  const isPending = image.isPending; // Check if this is a pending upload

                  return (
                    <button
                      key={image.path || image.id}
                      onClick={(e) => !isPending && handleImageSelect(image, e)}
                      className={`group relative aspect-square rounded-lg overflow-hidden border-2 transition-all ${
                        isPending ? 'opacity-60 cursor-wait' : 'hover:scale-105'
                      } ${
                        isSelected
                          ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-2'
                          : 'border-gray-200 dark:border-gray-700 hover:border-blue-400'
                      }`}
                      title={isPending ? 'Processing upload...' : image.filename}
                      disabled={isPending}
                    >
                      <img
                        src={image.path}
                        alt={image.filename || image.name}
                        className="w-full h-full object-contain bg-gray-100 dark:bg-gray-900"
                        loading="lazy"
                      />

                      {/* Loading spinner for pending uploads */}
                      {isPending && (
                        <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-50">
                          <Loader className="w-8 h-8 animate-spin text-white" />
                        </div>
                      )}

                      {/* Hover overlay */}
                      {!isPending && (
                        <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-70 transition-opacity flex items-end p-2">
                          <p className="text-white text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
                            {image.filename}
                          </p>
                        </div>
                      )}

                      {/* Selected checkmark */}
                      {isSelected && !isPending && (
                        <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
                          <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                            <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                          </svg>
                        </div>
                      )}
                    </button>
                  );
                })}
              </div>
            </>
          )}
        </div>

        {/* Image Details (if selected) - Compact */}
        {selectedImage && (
          <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-2">
            {/* Mobile: Stack vertically, Desktop: Side-by-side */}
            <div className="flex flex-col lg:flex-row gap-2">
              {/* Left: Image Preview and Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-2">
                  <img
                    src={selectedImage.path}
                    alt={selectedImage.filename}
                    className="w-12 h-12 flex-shrink-0 object-contain bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-xs truncate">
                      {selectedImage.filename}
                    </h3>
                    <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5 truncate">
                      <span className="font-medium">Path:</span> {selectedImage.path}
                    </p>
                    <p className="text-[10px] text-gray-600 dark:text-gray-400 mt-0.5">
                      <span className="font-medium">Size:</span> {selectedImage.dimensions ? `${selectedImage.dimensions.width}×${selectedImage.dimensions.height} • ` : ''}{Math.round(selectedImage.filesize / 1024)}KB
                    </p>
                  </div>
                </div>
                {selectedImage.keywords && selectedImage.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1.5">
                    {selectedImage.keywords.map((kw, idx) => (
                      <span key={idx} className="px-1.5 py-0.5 text-[10px] bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Dimensions Configuration - Scrollable */}
              <div className="lg:w-52 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700 pt-2 lg:pt-0 lg:pl-2 pr-2 max-h-32 overflow-y-auto">
                {/* Display Mode */}
                <div className="mb-2">
                  <label className="block text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1">
                    Display
                  </label>
                  <div className="flex gap-0.5">
                    {[
                      { value: 'inline', label: 'Inline' },
                      { value: 'block', label: 'Block' }
                    ].map(mode => (
                      <button
                        key={mode.value}
                        onClick={() => setDisplayMode(mode.value)}
                        className={`px-1.5 py-0.5 rounded text-[10px] font-medium transition-all ${
                          displayMode === mode.value
                            ? 'bg-blue-500 text-white'
                            : 'bg-white dark:bg-gray-800 text-gray-900 dark:text-white border border-gray-200 dark:border-gray-700 hover:border-blue-400'
                        }`}
                        title={mode.value === 'inline' ? 'Small image that flows with text' : 'Full-size block image'}
                      >
                        {mode.label}
                      </button>
                    ))}
                  </div>
                </div>

                {/* Alignment Options (only for block mode) */}
                <div className="mb-2">
                  <label className={`block text-[10px] font-semibold uppercase tracking-wide mb-1 ${
                    displayMode === 'inline'
                      ? 'text-gray-400 dark:text-gray-600'
                      : 'text-gray-700 dark:text-gray-300'
                  }`}>
                    Align {displayMode === 'inline' && '(Block only)'}
                  </label>
                  <div className="grid grid-cols-4 gap-0.5">
                    <button
                      onClick={() => displayMode === 'block' && setAlignment('none')}
                      disabled={displayMode === 'inline'}
                      title={displayMode === 'inline' ? 'Only available in Block mode' : 'No Alignment'}
                      className={`px-1.5 py-1 rounded transition-all flex items-center justify-center ${
                        displayMode === 'inline'
                          ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                          : alignment === 'none'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
                      }`}
                    >
                      <X className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => displayMode === 'block' && setAlignment('left')}
                      disabled={displayMode === 'inline'}
                      title={displayMode === 'inline' ? 'Only available in Block mode' : 'Align Left'}
                      className={`px-1.5 py-1 rounded transition-all flex items-center justify-center ${
                        displayMode === 'inline'
                          ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                          : alignment === 'left'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
                      }`}
                    >
                      <AlignLeft className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => displayMode === 'block' && setAlignment('center')}
                      disabled={displayMode === 'inline'}
                      title={displayMode === 'inline' ? 'Only available in Block mode' : 'Align Center'}
                      className={`px-1.5 py-1 rounded transition-all flex items-center justify-center ${
                        displayMode === 'inline'
                          ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                          : alignment === 'center'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
                      }`}
                    >
                      <AlignCenter className="w-3 h-3" />
                    </button>
                    <button
                      onClick={() => displayMode === 'block' && setAlignment('right')}
                      disabled={displayMode === 'inline'}
                      title={displayMode === 'inline' ? 'Only available in Block mode' : 'Align Right'}
                      className={`px-1.5 py-1 rounded transition-all flex items-center justify-center ${
                        displayMode === 'inline'
                          ? 'opacity-50 cursor-not-allowed bg-gray-100 dark:bg-gray-700 text-gray-400 dark:text-gray-500'
                          : alignment === 'right'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
                      }`}
                    >
                      <AlignRight className="w-3 h-3" />
                    </button>
                  </div>
                </div>

                {/* Dimensions Header */}
                <div className="flex items-center justify-between mb-1.5">
                  <label className="text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide">
                    Dimensions
                  </label>
                  <button
                    onClick={() => setMaintainAspectRatio(!maintainAspectRatio)}
                    className={`p-1 rounded transition-colors ${
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

                <div className="space-y-1 mb-2">
                  <div>
                    <label className="block text-[10px] mb-0.5 text-gray-600 dark:text-gray-400">
                      Width {displayMode === 'inline' && '(auto if empty)'}
                    </label>
                    <input
                      type="number"
                      value={customWidth}
                      onChange={(e) => handleWidthChange(e.target.value)}
                      placeholder={displayMode === 'inline' ? 'Auto' : (selectedImage.dimensions?.width?.toString() || 'Width')}
                      className="w-full px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] mb-0.5 text-gray-600 dark:text-gray-400">
                      Height {displayMode === 'inline' && '(auto if empty)'}
                    </label>
                    <input
                      type="number"
                      value={customHeight}
                      onChange={(e) => handleHeightChange(e.target.value)}
                      placeholder={displayMode === 'inline' ? 'Auto' : (selectedImage.dimensions?.height?.toString() || 'Height')}
                      className="w-full px-1.5 py-0.5 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                </div>

                {/* Scale Slider */}
                <div className="mb-2">
                  <div className="flex items-center justify-between mb-0.5">
                    <label className="text-[10px] text-gray-600 dark:text-gray-400">
                      Scale
                    </label>
                    <span className="text-[10px] font-medium text-gray-700 dark:text-gray-300">
                      {scalePercentage}%
                    </span>
                  </div>
                  <input
                    type="range"
                    min="10"
                    max="200"
                    value={scalePercentage}
                    onChange={(e) => handleScaleChange(parseInt(e.target.value))}
                    className="w-full h-1.5 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer accent-blue-500"
                  />
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Footer */}
        <div className="flex items-center justify-between p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          {/* Pagination */}
          <div className="flex items-center gap-2">
            <button
              onClick={() => setCurrentPage(p => Math.max(1, p - 1))}
              disabled={currentPage === 1}
              className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronLeft className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
            <span className="text-sm text-gray-600 dark:text-gray-400">
              Page {currentPage} of {totalPages || 1}
            </span>
            <button
              onClick={() => setCurrentPage(p => Math.min(totalPages, p + 1))}
              disabled={currentPage === totalPages || totalPages === 0}
              className="p-2 rounded hover:bg-gray-200 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              <ChevronRight className="w-4 h-4 text-gray-600 dark:text-gray-400" />
            </button>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center gap-2">
            <button
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleInsert}
              disabled={!selectedImage}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Insert Image
            </button>
          </div>
        </div>
      </div>

      {/* Image Upload Modal */}
      {showUploadModal && (
        <ImageUploadModal
          isOpen={showUploadModal}
          onClose={() => setShowUploadModal(false)}
          onSuccess={(result) => {
            logger.info('Image uploaded successfully', {
              imageId: result.imageId,
              originalUrl: result.originalUrl,
              webpUrl: result.webpUrl,
              name: result.name,
              category: result.category
            });
            setShowUploadModal(false);

            // Add to pending images with loading state
            const pendingImage = {
              id: result.imageId,
              filename: result.name || 'Uploading...',
              name: result.name || 'Uploading...',
              path: result.webpUrl || result.originalUrl,
              webpPath: result.webpUrl,
              category: result.category || 'other',
              dimensions: result.dimensions,
              isPending: true // Flag for rendering loading state
            };

            logger.debug('Created pending image', { pendingImage });
            setPendingImages(prev => [pendingImage, ...prev]);

            // Switch to CDN tab to show the pending image
            setActiveTab('cdn');

            // Start polling for the image to appear in index
            pollForImage(result.imageId, result);
          }}
        />
      )}
    </div>
  );

  return createPortal(modal, document.body);
};

export default ImagePicker;
