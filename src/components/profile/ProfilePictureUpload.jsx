/**
 * Profile Picture Upload Component
 *
 * Handles file selection, cropping (1:1 aspect ratio), and client-side
 * image processing (resize to 512x512, convert to WebP).
 */

import React, { useState, useCallback } from 'react';
import Cropper from 'react-easy-crop';
import { createLogger } from '../../utils/logger';

const logger = createLogger('ProfilePictureUpload');

// Constants
const PROFILE_PICTURE_MAX_SIZE_MB = 3;
const PROFILE_PICTURE_MAX_SIZE_BYTES = PROFILE_PICTURE_MAX_SIZE_MB * 1024 * 1024;
const PROFILE_PICTURE_ALLOWED_FORMATS = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
const OUTPUT_SIZE = 512; // 512x512 output

/**
 * Create cropped image blob using Canvas API
 * @param {string} imageSrc - Source image data URL
 * @param {Object} croppedAreaPixels - Crop area from react-easy-crop
 * @returns {Promise<Blob>} Cropped and processed image as WebP blob
 */
async function getCroppedImage(imageSrc, croppedAreaPixels) {
  const image = await createImage(imageSrc);
  const canvas = document.createElement('canvas');
  const ctx = canvas.getContext('2d');

  // Set canvas to output size (512x512)
  canvas.width = OUTPUT_SIZE;
  canvas.height = OUTPUT_SIZE;

  // Draw cropped area resized to 512x512
  ctx.drawImage(
    image,
    croppedAreaPixels.x,
    croppedAreaPixels.y,
    croppedAreaPixels.width,
    croppedAreaPixels.height,
    0,
    0,
    OUTPUT_SIZE,
    OUTPUT_SIZE
  );

  // Convert to WebP blob
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Canvas toBlob failed'));
        }
      },
      'image/webp',
      0.85 // 85% quality
    );
  });
}

/**
 * Helper to create image element from src
 */
function createImage(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.addEventListener('load', () => resolve(image));
    image.addEventListener('error', (error) => reject(error));
    image.src = url;
  });
}

/**
 * Resize image to fit within size limit
 * @param {string} imageSrc - Source image data URL
 * @param {number} maxSizeBytes - Maximum size in bytes
 * @returns {Promise<string>} Resized image as data URL
 */
async function resizeImageToFit(imageSrc, maxSizeBytes) {
  const image = await createImage(imageSrc);

  // Start with original dimensions
  let width = image.width;
  let height = image.height;
  let quality = 0.9;
  let dataUrl = imageSrc;

  // Keep reducing size until we're under the limit
  while (true) {
    // Create canvas and draw resized image
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(image, 0, 0, width, height);

    // Convert to JPEG with quality setting
    dataUrl = canvas.toDataURL('image/jpeg', quality);

    // Calculate size (data URL format: "data:image/jpeg;base64,...")
    const base64Length = dataUrl.split(',')[1].length;
    const sizeBytes = (base64Length * 3) / 4; // Base64 to bytes conversion

    // If we're under the limit, we're done
    if (sizeBytes <= maxSizeBytes) {
      break;
    }

    // Reduce dimensions by 10% each iteration
    width = Math.floor(width * 0.9);
    height = Math.floor(height * 0.9);

    // Also reduce quality slightly
    quality = Math.max(0.5, quality - 0.05);

    // Safety check: don't go below 512px on the smallest side
    if (Math.min(width, height) < 512) {
      // If we can't get it small enough, just return what we have
      break;
    }
  }

  return dataUrl;
}

/**
 * Profile Picture Upload Component
 */
export function ProfilePictureUpload({ onImageProcessed, onCancel }) {
  const [imageSrc, setImageSrc] = useState(null);
  const [crop, setCrop] = useState({ x: 0, y: 0 });
  const [zoom, setZoom] = useState(1);
  const [croppedAreaPixels, setCroppedAreaPixels] = useState(null);
  const [error, setError] = useState(null);
  const [processing, setProcessing] = useState(false);
  const [dragActive, setDragActive] = useState(false);
  const [resizing, setResizing] = useState(false);

  const onCropComplete = useCallback((croppedArea, croppedAreaPixels) => {
    setCroppedAreaPixels(croppedAreaPixels);
  }, []);

  const handleFileSelect = async (file) => {
    setError(null);

    // Validate file type
    if (!PROFILE_PICTURE_ALLOWED_FORMATS.includes(file.type)) {
      setError('Invalid format. Please use JPG, PNG, WebP, or GIF');
      return;
    }

    // Read file
    const reader = new FileReader();
    reader.addEventListener('load', async () => {
      const originalDataUrl = reader.result;

      // Check if file size exceeds limit
      if (file.size > PROFILE_PICTURE_MAX_SIZE_BYTES) {
        logger.info('Image too large, automatically resizing', {
          originalSize: file.size,
          limit: PROFILE_PICTURE_MAX_SIZE_BYTES
        });

        try {
          setResizing(true);
          // Automatically resize to fit within limit
          const resizedDataUrl = await resizeImageToFit(originalDataUrl, PROFILE_PICTURE_MAX_SIZE_BYTES);
          setImageSrc(resizedDataUrl);
          setResizing(false);

          logger.debug('Image automatically resized', {
            originalSize: file.size,
            newSize: Math.floor((resizedDataUrl.split(',')[1].length * 3) / 4)
          });
        } catch (err) {
          setResizing(false);
          logger.error('Failed to resize image', { error: err });
          setError('Failed to process image. Please try a smaller file.');
          return;
        }
      } else {
        // File size is OK, use as-is
        setImageSrc(originalDataUrl);
        logger.debug('File selected for cropping', { name: file.name, size: file.size, type: file.type });
      }
    });
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);

    const file = e.dataTransfer.files?.[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(true);
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setDragActive(false);
  };

  const handleCropAndUpload = async () => {
    if (!croppedAreaPixels || !imageSrc) {
      return;
    }

    try {
      setProcessing(true);
      setError(null);

      logger.debug('Processing image', { croppedArea: croppedAreaPixels });

      // Create cropped and processed image (512x512 WebP)
      const croppedBlob = await getCroppedImage(imageSrc, croppedAreaPixels);

      logger.info('Image processed successfully', {
        outputSize: croppedBlob.size,
        mimeType: croppedBlob.type
      });

      // Pass blob to parent component for upload
      onImageProcessed(croppedBlob);
    } catch (err) {
      logger.error('Failed to process image', { error: err.message });
      setError('Failed to process image. Please try again.');
      setProcessing(false);
    }
  };

  const handleCancel = () => {
    setImageSrc(null);
    setCrop({ x: 0, y: 0 });
    setZoom(1);
    setError(null);
    setResizing(false);
    onCancel();
  };

  return (
    <div className="space-y-4">
      {resizing ? (
        /* Resizing indicator */
        <div className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-8 text-center">
          <div className="space-y-3">
            <svg className="animate-spin h-12 w-12 text-blue-500 mx-auto" fill="none" viewBox="0 0 24 24">
              <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
              <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
            </svg>
            <p className="text-lg font-medium text-gray-900 dark:text-white">
              Optimizing image...
            </p>
            <p className="text-sm text-gray-600 dark:text-gray-400">
              Your image is being automatically resized to meet size requirements
            </p>
          </div>
        </div>
      ) : !imageSrc ? (
        /* File picker */
        <div
          className={`relative border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
            dragActive
              ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
              : 'border-gray-300 dark:border-gray-600 hover:border-gray-400 dark:hover:border-gray-500'
          }`}
          onDrop={handleDrop}
          onDragOver={handleDragOver}
          onDragLeave={handleDragLeave}
        >
          <input
            type="file"
            accept={PROFILE_PICTURE_ALLOWED_FORMATS.join(',')}
            onChange={handleFileInputChange}
            className="absolute inset-0 w-full h-full opacity-0 cursor-pointer"
          />

          <div className="space-y-3">
            <div className="text-6xl">📸</div>
            <div>
              <p className="text-lg font-medium text-gray-900 dark:text-white mb-1">
                Choose a profile picture
              </p>
              <p className="text-sm text-gray-600 dark:text-gray-400">
                Drag and drop or click to select
              </p>
            </div>
            <div className="text-xs text-gray-500 dark:text-gray-400">
              <p>JPG, PNG, WebP, or GIF</p>
              <p>Maximum size: {PROFILE_PICTURE_MAX_SIZE_MB}MB</p>
              <p className="text-blue-500 dark:text-blue-400 mt-1">Large images will be automatically optimized</p>
            </div>
          </div>
        </div>
      ) : (
        /* Cropper */
        <div className="space-y-4">
          {/* Crop area */}
          <div className="relative w-full h-96 bg-gray-100 dark:bg-gray-900 rounded-lg overflow-hidden">
            <Cropper
              image={imageSrc}
              crop={crop}
              zoom={zoom}
              aspect={1} // 1:1 square
              onCropChange={setCrop}
              onCropComplete={onCropComplete}
              onZoomChange={setZoom}
              cropShape="round" // Circular crop preview
              showGrid={true}
            />
          </div>

          {/* Zoom slider */}
          <div className="flex items-center gap-3">
            <svg className="w-5 h-5 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM13 10H7" />
            </svg>
            <input
              type="range"
              min={1}
              max={3}
              step={0.1}
              value={zoom}
              onChange={(e) => setZoom(Number(e.target.value))}
              className="flex-1 h-2 bg-gray-200 dark:bg-gray-700 rounded-lg appearance-none cursor-pointer slider"
            />
            <svg className="w-6 h-6 text-gray-600 dark:text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0zM10 7v6m3-3H7" />
            </svg>
          </div>

          {/* Info text */}
          <p className="text-sm text-gray-600 dark:text-gray-400 text-center">
            Drag to reposition • Scroll to zoom
          </p>

          {/* Action buttons */}
          <div className="flex justify-end gap-3">
            <button
              onClick={handleCancel}
              disabled={processing}
              className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
            >
              Cancel
            </button>
            <button
              onClick={handleCropAndUpload}
              disabled={processing}
              className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              {processing ? (
                <>
                  <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                  Processing...
                </>
              ) : (
                'Upload & Save'
              )}
            </button>
          </div>
        </div>
      )}

      {/* Error message */}
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-sm text-red-600 dark:text-red-400">{error}</p>
        </div>
      )}
    </div>
  );
}
