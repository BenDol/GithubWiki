/**
 * CDNProvider - Abstract base class for CDN implementations
 * Defines the contract that all CDN providers must implement
 */

import { createLogger } from '../../utils/logger';

const logger = createLogger('CDNProvider');

/**
 * Base class for CDN providers
 * All CDN implementations must extend this class and implement its methods
 */
class CDNProvider {
  /**
   * @param {Object} config - CDN configuration from wiki-config.json
   */
  constructor(config) {
    if (this.constructor === CDNProvider) {
      throw new Error('CDNProvider is an abstract class and cannot be instantiated directly');
    }
    this.config = config;
    logger.debug('CDN Provider initialized', { provider: this.constructor.name });
  }

  /**
   * Upload a video file to the CDN
   * Creates a PR in the CDN repository with the video file
   *
   * @param {Object} file - Video file data
   * @param {Buffer|string} file.content - File content (Buffer or base64 string)
   * @param {string} file.filename - Original filename
   * @param {string} file.mimeType - MIME type (e.g., 'video/mp4')
   * @param {number} file.size - File size in bytes
   * @param {Object} metadata - Video metadata
   * @param {string} metadata.title - Video title
   * @param {string} metadata.description - Video description
   * @param {string} metadata.uploadedBy - GitHub username or 'anonymous'
   * @param {string} [metadata.creator] - Content creator name
   * @param {Object} [thumbnail] - Optional thumbnail file
   * @param {Buffer|string} thumbnail.content - Thumbnail content
   * @param {string} thumbnail.filename - Thumbnail filename
   * @param {string} thumbnail.mimeType - Thumbnail MIME type
   * @param {Object} auth - Authentication info
   * @param {string} [auth.token] - User GitHub token (for authenticated uploads)
   * @param {string} [auth.botToken] - Bot token (for anonymous uploads)
   * @returns {Promise<Object>} Upload result
   * @returns {string} result.videoId - Unique video identifier
   * @returns {string} result.videoUrl - Public URL to access the video
   * @returns {string} result.thumbnailUrl - Public URL to access the thumbnail
   * @returns {Object} result.prInfo - PR information
   * @returns {number} result.prInfo.number - PR number
   * @returns {string} result.prInfo.url - PR URL
   * @returns {string} result.prInfo.branch - Branch name
   */
  async uploadVideo(file, metadata, thumbnail, auth) {
    throw new Error('uploadVideo() must be implemented by CDN provider');
  }

  /**
   * Delete a video from the CDN
   * Creates a PR to remove the video file
   *
   * @param {string} videoId - Video identifier
   * @param {Object} auth - Authentication info
   * @param {string} auth.token - User or bot token
   * @returns {Promise<Object>} Deletion result
   * @returns {Object} result.prInfo - PR information for deletion
   */
  async deleteVideo(videoId, auth) {
    throw new Error('deleteVideo() must be implemented by CDN provider');
  }

  /**
   * Get the public URL for a video
   *
   * @param {string} videoId - Video identifier
   * @param {string} [ref='main'] - Git ref (branch, tag, or commit)
   * @returns {string} Public URL to access the video
   */
  getVideoUrl(videoId, ref = 'main') {
    throw new Error('getVideoUrl() must be implemented by CDN provider');
  }

  /**
   * Get the public URL for a video thumbnail
   *
   * @param {string} videoId - Video identifier
   * @param {string} [ref='main'] - Git ref (branch, tag, or commit)
   * @returns {string} Public URL to access the thumbnail
   */
  getThumbnailUrl(videoId, ref = 'main') {
    throw new Error('getThumbnailUrl() must be implemented by CDN provider');
  }

  /**
   * Get the metadata URL for a video
   *
   * @param {string} videoId - Video identifier
   * @param {string} [ref='main'] - Git ref (branch, tag, or commit)
   * @returns {string} Public URL to access the metadata JSON
   */
  getMetadataUrl(videoId, ref = 'main') {
    throw new Error('getMetadataUrl() must be implemented by CDN provider');
  }

  /**
   * Validate a video file
   * Checks file size, type, and format
   *
   * @param {Object} file - File to validate
   * @param {Buffer|string} file.content - File content
   * @param {string} file.filename - Filename
   * @param {string} file.mimeType - MIME type
   * @param {number} file.size - File size in bytes
   * @returns {Object} Validation result
   * @returns {boolean} result.valid - Whether the file is valid
   * @returns {string} [result.error] - Error message if invalid
   */
  validateFile(file) {
    throw new Error('validateFile() must be implemented by CDN provider');
  }

  /**
   * Get the maximum allowed file size in bytes
   *
   * @returns {number} Max file size in bytes
   */
  getMaxFileSize() {
    throw new Error('getMaxFileSize() must be implemented by CDN provider');
  }

  /**
   * Get the list of allowed file formats
   *
   * @returns {Array<string>} Allowed file extensions (e.g., ['mp4', 'webm'])
   */
  getAllowedFormats() {
    throw new Error('getAllowedFormats() must be implemented by CDN provider');
  }

  /**
   * Get the provider name
   *
   * @returns {string} Provider name (e.g., 'github', 'cloudflare-r2', 'aws-s3')
   */
  getProviderName() {
    throw new Error('getProviderName() must be implemented by CDN provider');
  }
}

export default CDNProvider;
