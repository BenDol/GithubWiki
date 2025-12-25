/**
 * Video Utilities
 * Helper functions for video file processing, validation, and ID generation
 */

import { createLogger } from './logger';

const logger = createLogger('VideoUtils');

/**
 * Generate a unique video ID
 * Format: video-{timestamp}-{random}
 *
 * @returns {string} Unique video ID
 */
export function generateVideoId() {
  const timestamp = Date.now();
  const random = Math.random().toString(36).substring(2, 8);
  return `video-${timestamp}-${random}`;
}

/**
 * Get file extension from filename or MIME type
 *
 * @param {string} filename - Filename
 * @param {string} [mimeType] - MIME type (fallback)
 * @returns {string} File extension (without dot)
 */
export function getFileExtension(filename, mimeType) {
  // Try to extract from filename first
  const match = filename.match(/\.([^.]+)$/);
  if (match) {
    return match[1].toLowerCase();
  }

  // Fallback to MIME type
  if (mimeType) {
    const mimeToExt = {
      'video/mp4': 'mp4',
      'video/webm': 'webm',
      'video/quicktime': 'mov',
      'video/x-msvideo': 'avi',
      'video/x-matroska': 'mkv',
      'image/jpeg': 'jpg',
      'image/png': 'png',
      'image/webp': 'webp',
    };
    return mimeToExt[mimeType] || 'mp4'; // Default to mp4
  }

  return 'mp4'; // Default
}

/**
 * Validate video file format
 *
 * @param {string} filename - Filename
 * @param {string} mimeType - MIME type
 * @param {Array<string>} allowedFormats - Allowed file extensions
 * @returns {Object} Validation result
 * @returns {boolean} result.valid - Whether format is valid
 * @returns {string} [result.error] - Error message if invalid
 */
export function validateVideoFormat(filename, mimeType, allowedFormats) {
  const extension = getFileExtension(filename, mimeType);

  if (!allowedFormats.includes(extension)) {
    return {
      valid: false,
      error: `Invalid video format: ${extension}. Allowed formats: ${allowedFormats.join(', ')}`,
    };
  }

  // Check MIME type matches extension
  const expectedMimes = {
    'mp4': ['video/mp4', 'video/x-m4v'],
    'webm': ['video/webm'],
    'mov': ['video/quicktime'],
    'avi': ['video/x-msvideo', 'video/avi'],
    'mkv': ['video/x-matroska'],
  };

  const validMimes = expectedMimes[extension] || [];
  if (mimeType && !validMimes.includes(mimeType)) {
    logger.warn('MIME type mismatch', { filename, mimeType, extension, expectedMimes: validMimes });
  }

  return { valid: true };
}

/**
 * Validate video file size
 *
 * @param {number} fileSize - File size in bytes
 * @param {number} maxSize - Maximum allowed size in bytes
 * @returns {Object} Validation result
 * @returns {boolean} result.valid - Whether size is valid
 * @returns {string} [result.error] - Error message if invalid
 */
export function validateVideoSize(fileSize, maxSize) {
  if (fileSize > maxSize) {
    const fileSizeMB = (fileSize / 1024 / 1024).toFixed(2);
    const maxSizeMB = (maxSize / 1024 / 1024).toFixed(2);
    return {
      valid: false,
      error: `File size ${fileSizeMB}MB exceeds maximum ${maxSizeMB}MB`,
    };
  }

  return { valid: true };
}

/**
 * Check file magic bytes (file signature) to verify actual file type
 * Helps prevent file extension spoofing
 *
 * @param {Buffer} buffer - File buffer (first few bytes)
 * @returns {Object} Detection result
 * @returns {string|null} result.type - Detected MIME type or null
 * @returns {string|null} result.extension - Detected extension or null
 */
export function detectFileType(buffer) {
  if (!buffer || buffer.length < 12) {
    return { type: null, extension: null };
  }

  // Convert buffer to hex string for comparison
  const hex = buffer.toString('hex', 0, Math.min(buffer.length, 12));

  // Video file signatures
  const signatures = {
    // MP4/M4V (ftyp box)
    '00000': { type: 'video/mp4', extension: 'mp4', pattern: /^0000001[48]66747970/ },
    // WebM/MKV (EBML header)
    '1a45dfa3': { type: 'video/webm', extension: 'webm' },
    // AVI (RIFF header)
    '52494646': { type: 'video/x-msvideo', extension: 'avi', pattern: /^52494646.{8}415649/ },
    // QuickTime (MOV)
    '00000014': { type: 'video/quicktime', extension: 'mov', pattern: /^0{8}1[48]66747970/ },
    // MPEG
    '000001': { type: 'video/mpeg', extension: 'mpeg', pattern: /^000001b[a3]/ },
  };

  // Check each signature
  for (const [prefix, info] of Object.entries(signatures)) {
    if (hex.startsWith(prefix)) {
      // If pattern exists, validate it
      if (info.pattern && !info.pattern.test(hex)) {
        continue;
      }
      return { type: info.type, extension: info.extension };
    }
  }

  // Check for WebM/MKV specifically (starts with 0x1a, 0x45, 0xdf, 0xa3)
  if (hex.startsWith('1a45dfa3')) {
    return { type: 'video/webm', extension: 'webm' };
  }

  return { type: null, extension: null };
}

/**
 * Validate file content matches declared type
 * Uses magic bytes detection
 *
 * @param {Buffer} buffer - File buffer (first few bytes)
 * @param {string} declaredMimeType - Declared MIME type
 * @param {string} declaredExtension - Declared file extension
 * @returns {Object} Validation result
 * @returns {boolean} result.valid - Whether file is valid
 * @returns {string} [result.warning] - Warning message if types don't match
 * @returns {string} [result.error] - Error message if completely invalid
 */
export function validateFileContent(buffer, declaredMimeType, declaredExtension) {
  const detected = detectFileType(buffer);

  // If we couldn't detect the type, return a warning
  if (!detected.type) {
    return {
      valid: true, // Allow it but warn
      warning: 'Could not detect file type from content. Relying on declared type.',
    };
  }

  // Check if detected type matches declared type
  const declaredTypes = {
    'mp4': 'video/mp4',
    'webm': 'video/webm',
    'mov': 'video/quicktime',
    'avi': 'video/x-msvideo',
    'mkv': 'video/x-matroska',
  };

  const expectedType = declaredTypes[declaredExtension];

  if (detected.type !== expectedType && detected.type !== declaredMimeType) {
    return {
      valid: false,
      error: `File content does not match declared type. Detected: ${detected.type} (${detected.extension}), Declared: ${declaredMimeType} (${declaredExtension})`,
    };
  }

  return { valid: true };
}

/**
 * Format file size to human-readable string
 *
 * @param {number} bytes - Size in bytes
 * @returns {string} Formatted size (e.g., "1.23 MB")
 */
export function formatFileSize(bytes) {
  if (bytes === 0) return '0 Bytes';

  const k = 1024;
  const sizes = ['Bytes', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));

  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

/**
 * Generate file path in CDN repository
 * Format: videos/{year}/{month}/{videoId}.{ext}
 *
 * @param {string} videoId - Video identifier
 * @param {string} extension - File extension
 * @returns {string} File path in repository
 */
export function generateVideoPath(videoId, extension) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  return `videos/${year}/${month}/${videoId}.${extension}`;
}

/**
 * Generate thumbnail path in CDN repository
 * Format: videos/{year}/{month}/{videoId}-thumb.{ext}
 *
 * @param {string} videoId - Video identifier
 * @param {string} extension - File extension (jpg, png, webp)
 * @returns {string} File path in repository
 */
export function generateThumbnailPath(videoId, extension = 'jpg') {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  return `videos/${year}/${month}/${videoId}-thumb.${extension}`;
}

/**
 * Generate metadata path in CDN repository
 * Format: videos/{year}/{month}/{videoId}-metadata.json
 *
 * @param {string} videoId - Video identifier
 * @returns {string} File path in repository
 */
export function generateMetadataPath(videoId) {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');

  return `videos/${year}/${month}/${videoId}-metadata.json`;
}

/**
 * Create video metadata JSON
 *
 * @param {string} videoId - Video identifier
 * @param {Object} file - File info
 * @param {string} file.filename - Original filename
 * @param {number} file.size - File size in bytes
 * @param {string} file.mimeType - MIME type
 * @param {Object} metadata - Upload metadata
 * @param {string} metadata.title - Video title
 * @param {string} metadata.uploadedBy - GitHub username
 * @param {number} [metadata.duration] - Video duration in seconds
 * @param {string} [metadata.resolution] - Video resolution (e.g., "1920x1080")
 * @returns {string} JSON string
 */
export function createVideoMetadata(videoId, file, metadata) {
  const extension = getFileExtension(file.filename, file.mimeType);

  const metadataObj = {
    videoId,
    originalFilename: file.filename,
    uploadedAt: new Date().toISOString(),
    uploadedBy: metadata.uploadedBy || 'anonymous',
    fileSize: file.size,
    format: extension,
    mimeType: file.mimeType,
    title: metadata.title,
    description: metadata.description || '',
  };

  // Add optional fields if present
  if (metadata.duration) {
    metadataObj.duration = metadata.duration;
  }
  if (metadata.resolution) {
    metadataObj.resolution = metadata.resolution;
  }
  if (metadata.creator) {
    metadataObj.creator = metadata.creator;
  }

  return JSON.stringify(metadataObj, null, 2);
}

/**
 * Encode file to base64 (for GitHub API)
 *
 * @param {Buffer|string} content - File content
 * @returns {string} Base64 encoded string
 */
export function encodeToBase64(content) {
  if (Buffer.isBuffer(content)) {
    return content.toString('base64');
  }
  if (typeof content === 'string') {
    return Buffer.from(content).toString('base64');
  }
  throw new Error('Content must be a Buffer or string');
}

/**
 * Decode base64 string to buffer
 *
 * @param {string} base64 - Base64 encoded string
 * @returns {Buffer} Decoded buffer
 */
export function decodeFromBase64(base64) {
  return Buffer.from(base64, 'base64');
}

// =============================================================================
// Git LFS Utilities
// =============================================================================

/**
 * Calculate SHA256 hash of file content (LFS OID)
 *
 * @param {Buffer} content - File content buffer
 * @returns {Promise<string>} SHA256 hash (hex)
 */
export async function calculateSHA256(content) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    // Browser environment
    const hashBuffer = await crypto.subtle.digest('SHA-256', content);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
  } else {
    // Node.js environment
    const crypto = await import('crypto');
    return crypto.createHash('sha256').update(content).digest('hex');
  }
}

/**
 * Generate Git LFS pointer file content
 *
 * @param {string} oid - SHA256 hash of the file
 * @param {number} size - File size in bytes
 * @returns {string} LFS pointer file content
 *
 * @example
 * version https://git-lfs.github.com/spec/v1
 * oid sha256:4d7a214614ab2935c943f9e0ff69d22eadbb8f32b1258daaa5e2ca24d17e2393
 * size 12345
 */
export function generateLFSPointer(oid, size) {
  return [
    'version https://git-lfs.github.com/spec/v1',
    `oid sha256:${oid}`,
    `size ${size}`,
    '' // Empty line at end
  ].join('\n');
}

/**
 * Create LFS batch API request payload
 *
 * @param {string} oid - SHA256 hash of the file
 * @param {number} size - File size in bytes
 * @param {string} operation - 'upload' or 'download'
 * @returns {Object} Batch API request payload
 */
export function createLFSBatchRequest(oid, size, operation = 'upload') {
  return {
    operation,
    transfers: ['basic'],
    ref: { name: 'refs/heads/main' },
    objects: [
      {
        oid,
        size
      }
    ]
  };
}

/**
 * Parse LFS batch API response
 *
 * @param {Object} response - Batch API response
 * @returns {Object} Parsed response with upload/download info
 * @throws {Error} If response indicates error
 */
export function parseLFSBatchResponse(response) {
  if (!response || !response.objects || response.objects.length === 0) {
    throw new Error('Invalid LFS batch response: no objects returned');
  }

  const obj = response.objects[0];

  if (obj.error) {
    throw new Error(`LFS batch error: ${obj.error.message || 'Unknown error'}`);
  }

  if (!obj.actions) {
    throw new Error('LFS batch response missing actions');
  }

  return {
    oid: obj.oid,
    size: obj.size,
    uploadUrl: obj.actions.upload?.href,
    uploadHeaders: obj.actions.upload?.header || {},
    downloadUrl: obj.actions.download?.href,
    downloadHeaders: obj.actions.download?.header || {},
    authenticated: obj.authenticated
  };
}

/**
 * Check if file should use LFS based on size and configuration
 *
 * @param {number} fileSizeBytes - File size in bytes
 * @param {Object} lfsConfig - LFS configuration from wiki-config.json
 * @returns {boolean} True if file should use LFS
 */
export function shouldUseLFS(fileSizeBytes, lfsConfig) {
  if (!lfsConfig || !lfsConfig.enabled) {
    return false;
  }

  if (lfsConfig.useByDefault) {
    return true;
  }

  const thresholdBytes = (lfsConfig.thresholdMB || 10) * 1024 * 1024;
  return fileSizeBytes >= thresholdBytes;
}
