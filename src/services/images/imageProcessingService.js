/**
 * Image Processing Service (Client-Side)
 *
 * Handles client-side image processing using Canvas API:
 * - Load and decode images
 * - Resize to fit within max dimensions
 * - Generate WebP version
 * - Extract dimensions
 *
 * All processing happens in the browser to work with Cloudflare Workers
 */

import { createLogger } from '../../utils/logger.js';
const logger = createLogger('ImageProcessingService');

/**
 * Process image file client-side
 * @param {File} file - Image file from file input
 * @param {Object} config - Image upload configuration
 * @returns {Promise<Object>} Processed images { original, webp, dimensions }
 */
export async function processImageClientSide(file, config) {
  try {
    logger.debug('Processing image client-side', {
      filename: file.name,
      size: file.size,
      type: file.type
    });

    // Load image
    const img = await loadImageFromFile(file);

    // Get max dimensions from config
    const maxWidth = config?.imageUploads?.processing?.maxDimensions?.width || 2048;
    const maxHeight = config?.imageUploads?.processing?.maxDimensions?.height || 2048;

    // Calculate resize if needed
    let { width, height } = img;
    let needsResize = false;

    if (width > maxWidth || height > maxHeight) {
      const ratio = Math.min(maxWidth / width, maxHeight / height);
      width = Math.floor(width * ratio);
      height = Math.floor(height * ratio);
      needsResize = true;

      logger.debug('Resizing image', {
        original: { width: img.width, height: img.height },
        resized: { width, height },
        ratio
      });
    }

    // Create canvas
    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');

    // Draw image to canvas
    ctx.drawImage(img, 0, 0, width, height);

    // Generate original format
    const originalQuality = config?.imageUploads?.processing?.originalQuality || 0.9;
    const originalBlob = await canvasToBlob(canvas, file.type, originalQuality);

    // Generate WebP version
    const webpQuality = config?.imageUploads?.processing?.webpQuality || 85;
    const webpBlob = await canvasToBlob(canvas, 'image/webp', webpQuality / 100);

    logger.debug('Processing complete', {
      dimensions: { width, height },
      originalSize: originalBlob.size,
      webpSize: webpBlob.size,
      saved: originalBlob.size - webpBlob.size
    });

    return {
      original: {
        blob: originalBlob,
        mimeType: file.type
      },
      webp: {
        blob: webpBlob,
        mimeType: 'image/webp'
      },
      dimensions: {
        width,
        height
      }
    };
  } catch (error) {
    logger.error('Image processing failed', { error: error.message });
    throw new Error(`Failed to process image: ${error.message}`);
  }
}

/**
 * Load image from file
 * @param {File} file - Image file
 * @returns {Promise<HTMLImageElement>} Loaded image element
 */
function loadImageFromFile(file) {
  return new Promise((resolve, reject) => {
    const img = new Image();
    const url = URL.createObjectURL(file);

    img.onload = () => {
      URL.revokeObjectURL(url);
      resolve(img);
    };

    img.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('Failed to load image'));
    };

    img.src = url;
  });
}

/**
 * Convert canvas to blob
 * @param {HTMLCanvasElement} canvas - Canvas element
 * @param {string} mimeType - Output MIME type
 * @param {number} quality - Quality (0-1)
 * @returns {Promise<Blob>} Image blob
 */
function canvasToBlob(canvas, mimeType, quality) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => {
        if (blob) {
          resolve(blob);
        } else {
          reject(new Error('Failed to convert canvas to blob'));
        }
      },
      mimeType,
      quality
    );
  });
}

/**
 * Extract dimensions from image file without processing
 * @param {File} file - Image file
 * @returns {Promise<Object>} Dimensions { width, height }
 */
export async function extractDimensions(file) {
  try {
    const img = await loadImageFromFile(file);
    return {
      width: img.width,
      height: img.height
    };
  } catch (error) {
    logger.error('Failed to extract dimensions', { error: error.message });
    return { width: 0, height: 0 };
  }
}

/**
 * Validate image file before processing
 * @param {File} file - Image file
 * @param {Object} config - Image upload configuration
 * @returns {Object} Validation result { valid, error }
 */
export function validateImageFile(file, config) {
  // Check if file exists
  if (!file) {
    return { valid: false, error: 'No file provided' };
  }

  // Check file size
  const maxSizeMB = config?.imageUploads?.maxFileSizeMB || 10;
  const maxSizeBytes = maxSizeMB * 1024 * 1024;

  if (file.size > maxSizeBytes) {
    return {
      valid: false,
      error: `File size exceeds ${maxSizeMB}MB limit`
    };
  }

  // Check file type
  const allowedFormats = config?.imageUploads?.allowedFormats || ['jpg', 'jpeg', 'png', 'webp', 'gif'];
  const mimeTypes = allowedFormats.map(fmt => {
    switch (fmt) {
      case 'jpg':
      case 'jpeg':
        return 'image/jpeg';
      case 'png':
        return 'image/png';
      case 'webp':
        return 'image/webp';
      case 'gif':
        return 'image/gif';
      default:
        return `image/${fmt}`;
    }
  });

  if (!mimeTypes.includes(file.type)) {
    return {
      valid: false,
      error: `Unsupported file format. Allowed: ${allowedFormats.join(', ')}`
    };
  }

  return { valid: true };
}

/**
 * Estimate processing time based on file size
 * @param {number} fileSize - File size in bytes
 * @returns {number} Estimated time in milliseconds
 */
export function estimateProcessingTime(fileSize) {
  // Rough estimate: ~500ms per MB
  const sizeMB = fileSize / (1024 * 1024);
  return Math.ceil(sizeMB * 500);
}

/**
 * Check if browser supports required Canvas APIs
 * @returns {boolean} True if supported
 */
export function isProcessingSupported() {
  try {
    const canvas = document.createElement('canvas');
    const ctx = canvas.getContext('2d');
    return !!(ctx && canvas.toBlob);
  } catch (error) {
    return false;
  }
}
