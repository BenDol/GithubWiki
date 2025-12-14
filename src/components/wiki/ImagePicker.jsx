import React, { useState, useEffect, useRef } from 'react';
import { X, Search, Image as ImageIcon, ChevronLeft, ChevronRight, AlignLeft, AlignCenter, AlignRight } from 'lucide-react';

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
  const [customWidth, setCustomWidth] = useState('');
  const [customHeight, setCustomHeight] = useState('');
  const [maintainAspectRatio, setMaintainAspectRatio] = useState(true);
  const [scalePercentage, setScalePercentage] = useState(100);
  const [alignment, setAlignment] = useState('none');
  const imagesPerPage = 24;
  const isScalingRef = useRef(false);

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

  // Filter images based on search and category
  useEffect(() => {
    let filtered = images;

    // Filter by category
    if (selectedCategory !== 'all') {
      filtered = filtered.filter(img => img.category === selectedCategory);
    }

    // Filter by search query (filename and keywords)
    if (searchQuery.trim()) {
      const query = searchQuery.toLowerCase();
      filtered = filtered.filter(img => {
        const filenameMatch = img.filename.toLowerCase().includes(query);
        const keywordsMatch = img.keywords?.some(kw => kw.toLowerCase().includes(query));
        const pathMatch = img.path.toLowerCase().includes(query);
        return filenameMatch || keywordsMatch || pathMatch;
      });
    }

    setFilteredImages(filtered);
    setCurrentPage(1); // Reset to first page on filter change
  }, [searchQuery, selectedCategory, images]);

  // Pagination
  const totalPages = Math.ceil(filteredImages.length / imagesPerPage);
  const startIndex = (currentPage - 1) * imagesPerPage;
  const endIndex = startIndex + imagesPerPage;
  const currentImages = filteredImages.slice(startIndex, endIndex);

  // Handle image selection
  const handleImageSelect = (image) => {
    setSelectedImage(image);
    // Reset dimensions when selecting new image
    setCustomWidth('');
    setCustomHeight('');
    setMaintainAspectRatio(true);
    setScalePercentage(100);
    setAlignment('none');
  };

  // Handle width change with aspect ratio
  const handleWidthChange = (value) => {
    setCustomWidth(value);
    if (maintainAspectRatio && selectedImage && value) {
      const aspectRatio = selectedImage.dimensions.height / selectedImage.dimensions.width;
      const newHeight = Math.round(parseInt(value) * aspectRatio);
      setCustomHeight(newHeight.toString());
    }
    // Update scale percentage based on width (but not if we're currently scaling)
    if (selectedImage && !isScalingRef.current) {
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
    if (maintainAspectRatio && selectedImage && value) {
      const aspectRatio = selectedImage.dimensions.width / selectedImage.dimensions.height;
      const newWidth = Math.round(parseInt(value) * aspectRatio);
      setCustomWidth(newWidth.toString());
    }
    // Update scale percentage based on height (but not if we're currently scaling)
    if (selectedImage && !isScalingRef.current) {
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
    if (selectedImage) {
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
    if (!selectedImage) return;

    let markdown;
    // If custom dimensions are specified, use HTML img tag
    if (customWidth || customHeight) {
      const widthAttr = customWidth ? ` width="${customWidth}"` : '';
      const heightAttr = customHeight ? ` height="${customHeight}"` : '';
      markdown = `<img src="${selectedImage.path}" alt=""${widthAttr}${heightAttr} />`;
    } else {
      // Otherwise use standard markdown syntax
      markdown = `![](${selectedImage.path})`;
    }

    // Apply alignment wrapper if needed
    if (alignment !== 'none') {
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

    onSelect?.(markdown, selectedImage);

    // Reset and close
    setSelectedImage(null);
    setCustomWidth('');
    setCustomHeight('');
    setAlignment('none');
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

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Modal */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-6xl max-h-[90vh] border border-gray-200 dark:border-gray-700 flex flex-col">
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
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
              {currentImages.map(image => (
                <button
                  key={image.id}
                  onClick={() => handleImageSelect(image)}
                  className={`group relative aspect-square rounded-lg overflow-hidden border-2 transition-all hover:scale-105 ${
                    selectedImage?.id === image.id
                      ? 'border-blue-500 ring-2 ring-blue-500 ring-offset-2'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-400'
                  }`}
                  title={image.filename}
                >
                  <img
                    src={image.path}
                    alt={image.filename}
                    className="w-full h-full object-contain bg-gray-100 dark:bg-gray-900"
                    loading="lazy"
                  />
                  {/* Hover overlay */}
                  <div className="absolute inset-0 bg-black bg-opacity-0 group-hover:bg-opacity-70 transition-opacity flex items-end p-2">
                    <p className="text-white text-xs truncate opacity-0 group-hover:opacity-100 transition-opacity">
                      {image.filename}
                    </p>
                  </div>
                  {/* Selected checkmark */}
                  {selectedImage?.id === image.id && (
                    <div className="absolute top-2 right-2 bg-blue-500 rounded-full p-1">
                      <svg className="w-4 h-4 text-white" fill="currentColor" viewBox="0 0 20 20">
                        <path fillRule="evenodd" d="M16.707 5.293a1 1 0 010 1.414l-8 8a1 1 0 01-1.414 0l-4-4a1 1 0 011.414-1.414L8 12.586l7.293-7.293a1 1 0 011.414 0z" clipRule="evenodd" />
                      </svg>
                    </div>
                  )}
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Image Details (if selected) */}
        {selectedImage && (
          <div className="border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900 p-4">
            {/* Mobile: Stack vertically, Desktop: Side-by-side */}
            <div className="flex flex-col lg:flex-row gap-4">
              {/* Left: Image Preview and Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start gap-3">
                  <img
                    src={selectedImage.path}
                    alt={selectedImage.filename}
                    className="w-16 h-16 flex-shrink-0 object-contain bg-white dark:bg-gray-800 rounded border border-gray-200 dark:border-gray-700"
                  />
                  <div className="flex-1 min-w-0">
                    <h3 className="font-semibold text-gray-900 dark:text-white text-sm truncate">
                      {selectedImage.filename}
                    </h3>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-1 truncate">
                      <span className="font-medium">Path:</span> {selectedImage.path}
                    </p>
                    <p className="text-xs text-gray-600 dark:text-gray-400 mt-0.5">
                      <span className="font-medium">Size:</span> {selectedImage.dimensions.width}×{selectedImage.dimensions.height} • {Math.round(selectedImage.filesize / 1024)}KB
                    </p>
                  </div>
                </div>
                {selectedImage.keywords && selectedImage.keywords.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-2">
                    {selectedImage.keywords.map((kw, idx) => (
                      <span key={idx} className="px-2 py-0.5 text-xs bg-gray-200 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded">
                        {kw}
                      </span>
                    ))}
                  </div>
                )}
              </div>

              {/* Right: Dimensions Configuration */}
              <div className="lg:w-52 border-t lg:border-t-0 lg:border-l border-gray-200 dark:border-gray-700 pt-2 lg:pt-0 lg:pl-3">
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

                {/* Alignment Options */}
                <div className="mb-3">
                  <label className="block text-[10px] font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wide mb-1.5">
                    Align
                  </label>
                  <div className="grid grid-cols-4 gap-1">
                    <button
                      onClick={() => setAlignment('none')}
                      title="No Alignment"
                      className={`px-2.5 py-1.5 rounded transition-all flex items-center justify-center ${
                        alignment === 'none'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
                      }`}
                    >
                      <X className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setAlignment('left')}
                      title="Align Left"
                      className={`px-2.5 py-1.5 rounded transition-all flex items-center justify-center ${
                        alignment === 'left'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
                      }`}
                    >
                      <AlignLeft className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setAlignment('center')}
                      title="Align Center"
                      className={`px-2.5 py-1.5 rounded transition-all flex items-center justify-center ${
                        alignment === 'center'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
                      }`}
                    >
                      <AlignCenter className="w-3.5 h-3.5" />
                    </button>
                    <button
                      onClick={() => setAlignment('right')}
                      title="Align Right"
                      className={`px-2.5 py-1.5 rounded transition-all flex items-center justify-center ${
                        alignment === 'right'
                          ? 'bg-blue-500 text-white'
                          : 'bg-white dark:bg-gray-800 text-gray-700 dark:text-gray-300 border border-gray-200 dark:border-gray-700 hover:border-blue-400'
                      }`}
                    >
                      <AlignRight className="w-3.5 h-3.5" />
                    </button>
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

                <div className="space-y-1.5">
                  <div>
                    <label className="block text-[10px] text-gray-600 dark:text-gray-400 mb-0.5">
                      Width
                    </label>
                    <input
                      type="number"
                      value={customWidth}
                      onChange={(e) => handleWidthChange(e.target.value)}
                      placeholder={selectedImage.dimensions.width.toString()}
                      className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
                  <div>
                    <label className="block text-[10px] text-gray-600 dark:text-gray-400 mb-0.5">
                      Height
                    </label>
                    <input
                      type="number"
                      value={customHeight}
                      onChange={(e) => handleHeightChange(e.target.value)}
                      placeholder={selectedImage.dimensions.height.toString()}
                      className="w-full px-2 py-1 text-xs border border-gray-300 dark:border-gray-600 rounded focus:outline-none focus:ring-1 focus:ring-blue-500 bg-white dark:bg-gray-800 text-gray-900 dark:text-white"
                    />
                  </div>
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
    </div>
  );
};

export default ImagePicker;
