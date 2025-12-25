import React, { useState, useRef, useEffect } from 'react';
import { Upload, X, Film, Image as ImageIcon, AlertCircle, CheckCircle, Loader } from 'lucide-react';
import { createLogger } from '../../utils/logger';

const logger = createLogger('VideoFileUpload');

const MAX_VIDEO_SIZE = 100 * 1024 * 1024; // 100MB (server-side upload limit)
const MAX_THUMBNAIL_SIZE = 5 * 1024 * 1024; // 5MB
const ALLOWED_VIDEO_TYPES = ['video/mp4', 'video/webm', 'video/quicktime', 'video/x-msvideo'];
const ALLOWED_IMAGE_TYPES = ['image/jpeg', 'image/png', 'image/webp'];

/**
 * VideoFileUpload Component
 * Handles video file upload with drag-and-drop, preview, and thumbnail extraction
 *
 * Upload Strategy:
 * - Server-side upload for files up to 100MB
 * - Files are uploaded on form submit (not immediately)
 */
const VideoFileUpload = ({
  onVideoChange,
  onThumbnailChange,
  disabled = false,
  maxVideoSize = MAX_VIDEO_SIZE,
  maxThumbnailSize = MAX_THUMBNAIL_SIZE,
}) => {
  const [videoFile, setVideoFile] = useState(null);
  const [videoPreviewUrl, setVideoPreviewUrl] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);
  const [thumbnailPreviewUrl, setThumbnailPreviewUrl] = useState(null);
  const [isDragging, setIsDragging] = useState(false);
  const [videoError, setVideoError] = useState(null);
  const [thumbnailError, setThumbnailError] = useState(null);
  const [extractingThumbnail, setExtractingThumbnail] = useState(false);

  const videoInputRef = useRef(null);
  const thumbnailInputRef = useRef(null);
  const videoRef = useRef(null);

  // Clean up object URLs on unmount
  useEffect(() => {
    return () => {
      if (videoPreviewUrl) URL.revokeObjectURL(videoPreviewUrl);
      if (thumbnailPreviewUrl) URL.revokeObjectURL(thumbnailPreviewUrl);
    };
  }, [videoPreviewUrl, thumbnailPreviewUrl]);

  /**
   * Validate video file
   */
  const validateVideoFile = (file) => {
    if (!ALLOWED_VIDEO_TYPES.includes(file.type)) {
      return 'Invalid video format. Allowed: MP4, WebM, MOV, AVI';
    }
    if (file.size > maxVideoSize) {
      const sizeMB = (maxVideoSize / 1024 / 1024).toFixed(0);
      return `Video file too large. Maximum size: ${sizeMB}MB`;
    }
    return null;
  };

  /**
   * Validate thumbnail file
   */
  const validateThumbnailFile = (file) => {
    if (!ALLOWED_IMAGE_TYPES.includes(file.type)) {
      return 'Invalid image format. Allowed: JPEG, PNG, WebP';
    }
    if (file.size > maxThumbnailSize) {
      const sizeMB = (maxThumbnailSize / 1024 / 1024).toFixed(0);
      return `Thumbnail file too large. Maximum size: ${sizeMB}MB`;
    }
    return null;
  };

  /**
   * Handle video file selection
   */
  const handleVideoSelect = async (file) => {
    setVideoError(null);

    const error = validateVideoFile(file);
    if (error) {
      setVideoError(error);
      logger.warn('Video validation failed', { error, filename: file.name });
      return;
    }

    // Clean up previous preview URL
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setVideoFile(file);
    setVideoPreviewUrl(previewUrl);

    logger.info('Video file selected', {
      filename: file.name,
      size: file.size,
      type: file.type,
    });

    // Notify parent
    if (onVideoChange) {
      onVideoChange(file);
    }

    // Auto-extract thumbnail after video loads
    setExtractingThumbnail(true);
  };

  /**
   * Handle thumbnail file selection
   */
  const handleThumbnailSelect = (file) => {
    setThumbnailError(null);

    const error = validateThumbnailFile(file);
    if (error) {
      setThumbnailError(error);
      logger.warn('Thumbnail validation failed', { error, filename: file.name });
      return;
    }

    // Clean up previous preview URL
    if (thumbnailPreviewUrl) {
      URL.revokeObjectURL(thumbnailPreviewUrl);
    }

    // Create preview URL
    const previewUrl = URL.createObjectURL(file);
    setThumbnailFile(file);
    setThumbnailPreviewUrl(previewUrl);

    logger.info('Thumbnail file selected', {
      filename: file.name,
      size: file.size,
      type: file.type,
    });

    // Notify parent
    if (onThumbnailChange) {
      onThumbnailChange(file);
    }
  };

  /**
   * Extract thumbnail from video at current time
   */
  const extractThumbnailFromVideo = () => {
    if (!videoRef.current) {
      logger.warn('Cannot extract thumbnail: video element not ready');
      return;
    }

    try {
      const video = videoRef.current;
      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;

      const ctx = canvas.getContext('2d');
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      canvas.toBlob((blob) => {
        if (blob) {
          const file = new File([blob], 'thumbnail.jpg', { type: 'image/jpeg' });
          handleThumbnailSelect(file);
          logger.info('Thumbnail extracted from video', { size: blob.size });
        }
        setExtractingThumbnail(false);
      }, 'image/jpeg', 0.9);
    } catch (error) {
      logger.error('Failed to extract thumbnail', { error: error.message });
      setExtractingThumbnail(false);
    }
  };

  /**
   * Handle video metadata loaded
   */
  const handleVideoLoaded = () => {
    if (extractingThumbnail && videoRef.current && !thumbnailFile) {
      // Seek to 1 second (or 10% of duration) for better thumbnail
      const video = videoRef.current;
      const seekTime = Math.min(1, video.duration * 0.1);
      video.currentTime = seekTime;
    }
  };

  /**
   * Handle video seeked (after seeking to extract frame)
   */
  const handleVideoSeeked = () => {
    if (extractingThumbnail && !thumbnailFile) {
      extractThumbnailFromVideo();
    }
  };

  /**
   * Handle drag events
   */
  const handleDragEnter = (e) => {
    e.preventDefault();
    e.stopPropagation();
    if (!disabled) {
      setIsDragging(true);
    }
  };

  const handleDragLeave = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);
  };

  const handleDragOver = (e) => {
    e.preventDefault();
    e.stopPropagation();
  };

  const handleDrop = (e) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragging(false);

    if (disabled) return;

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      const file = files[0];
      if (file.type.startsWith('video/')) {
        handleVideoSelect(file);
      } else if (file.type.startsWith('image/')) {
        handleThumbnailSelect(file);
      }
    }
  };

  /**
   * Handle file input change
   */
  const handleVideoInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleVideoSelect(files[0]);
    }
  };

  const handleThumbnailInputChange = (e) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleThumbnailSelect(files[0]);
    }
  };

  /**
   * Clear video
   */
  const clearVideo = () => {
    if (videoPreviewUrl) {
      URL.revokeObjectURL(videoPreviewUrl);
    }
    setVideoFile(null);
    setVideoPreviewUrl(null);
    setVideoError(null);

    if (videoInputRef.current) {
      videoInputRef.current.value = '';
    }
    if (onVideoChange) {
      onVideoChange(null);
    }

    // Also clear thumbnail
    clearThumbnail();
  };

  /**
   * Clear thumbnail
   */
  const clearThumbnail = () => {
    if (thumbnailPreviewUrl) {
      URL.revokeObjectURL(thumbnailPreviewUrl);
    }
    setThumbnailFile(null);
    setThumbnailPreviewUrl(null);
    setThumbnailError(null);
    if (thumbnailInputRef.current) {
      thumbnailInputRef.current.value = '';
    }
    if (onThumbnailChange) {
      onThumbnailChange(null);
    }
  };

  /**
   * Format file size
   */
  const formatSize = (bytes) => {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
  };

  return (
    <div className="space-y-4">
      {/* Video Upload */}
      <div>
        <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
          Video File <span className="text-red-500">*</span>
        </label>

        {!videoFile ? (
          <div
            onDragEnter={handleDragEnter}
            onDragOver={handleDragOver}
            onDragLeave={handleDragLeave}
            onDrop={handleDrop}
            onClick={() => !disabled && videoInputRef.current?.click()}
            className={`
              border-2 border-dashed rounded-lg p-8 text-center cursor-pointer transition-colors
              ${isDragging
                ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20'
                : 'border-gray-300 dark:border-gray-600 hover:border-blue-400 dark:hover:border-blue-500'
              }
              ${disabled ? 'opacity-50 cursor-not-allowed' : ''}
            `}
          >
            <Upload className="mx-auto mb-4 text-gray-400" size={48} />
            <p className="text-lg font-medium text-gray-900 dark:text-white mb-2">
              Drop video here or click to browse
            </p>
            <p className="text-sm text-gray-500 dark:text-gray-400">
              MP4, WebM, MOV, AVI • Max {(maxVideoSize / 1024 / 1024).toFixed(0)}MB
            </p>
          </div>
        ) : (
          <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4">
            <div className="flex items-start gap-4">
              {/* Video Preview */}
              <div className="flex-shrink-0">
                <video
                  ref={videoRef}
                  src={videoPreviewUrl}
                  controls
                  onLoadedMetadata={handleVideoLoaded}
                  onSeeked={handleVideoSeeked}
                  className="w-64 h-36 bg-black rounded"
                />
              </div>

              {/* Video Info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-start justify-between">
                  <div className="flex items-center gap-2 flex-1 min-w-0">
                    <Film className="text-blue-500 flex-shrink-0" size={20} />
                    <div className="min-w-0 flex-1">
                      <p className="font-medium text-gray-900 dark:text-white truncate">
                        {videoFile.name}
                      </p>
                      <p className="text-sm text-gray-500 dark:text-gray-400">
                        {formatSize(videoFile.size)} • {videoFile.type}
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={clearVideo}
                    disabled={disabled}
                    className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                    title="Remove video"
                  >
                    <X size={20} className="text-gray-600 dark:text-gray-400" />
                  </button>
                </div>

                {/* Video Ready */}
                {videoFile && (
                  <div className="mt-2 flex items-center gap-2 text-sm text-gray-600 dark:text-gray-400">
                    <CheckCircle size={16} />
                    <span>Video ready to upload on submit</span>
                  </div>
                )}
              </div>
            </div>
          </div>
        )}

        {/* Video Error */}
        {videoError && (
          <div className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
            <AlertCircle size={16} />
            <span>{videoError}</span>
          </div>
        )}

        {/* Hidden file input */}
        <input
          ref={videoInputRef}
          type="file"
          accept="video/mp4,video/webm,video/quicktime,video/x-msvideo"
          onChange={handleVideoInputChange}
          disabled={disabled}
          className="hidden"
        />
      </div>

      {/* Thumbnail Upload */}
      {videoFile && (
        <div>
          <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
            Thumbnail (optional)
          </label>

          {!thumbnailFile ? (
            <div>
              <button
                onClick={() => thumbnailInputRef.current?.click()}
                disabled={disabled}
                className="w-full border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-6 text-center hover:border-blue-400 dark:hover:border-blue-500 transition-colors disabled:opacity-50"
              >
                <ImageIcon className="mx-auto mb-2 text-gray-400" size={32} />
                <p className="text-sm font-medium text-gray-900 dark:text-white">
                  Click to upload custom thumbnail
                </p>
                <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                  JPEG, PNG, WebP • Max {(maxThumbnailSize / 1024 / 1024).toFixed(0)}MB
                  <br />
                  Or use auto-generated thumbnail from video
                </p>
              </button>
            </div>
          ) : (
            <div className="border border-gray-300 dark:border-gray-600 rounded-lg p-4">
              <div className="flex items-start gap-4">
                {/* Thumbnail Preview */}
                <div className="flex-shrink-0">
                  <img
                    src={thumbnailPreviewUrl}
                    alt="Thumbnail preview"
                    className="w-32 h-24 object-cover rounded"
                  />
                </div>

                {/* Thumbnail Info */}
                <div className="flex-1 min-w-0">
                  <div className="flex items-start justify-between">
                    <div className="flex items-center gap-2 flex-1 min-w-0">
                      <ImageIcon className="text-green-500 flex-shrink-0" size={20} />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-gray-900 dark:text-white truncate">
                          {thumbnailFile.name}
                        </p>
                        <p className="text-sm text-gray-500 dark:text-gray-400">
                          {formatSize(thumbnailFile.size)}
                        </p>
                      </div>
                    </div>
                    <button
                      onClick={clearThumbnail}
                      disabled={disabled}
                      className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
                      title="Remove thumbnail"
                    >
                      <X size={20} className="text-gray-600 dark:text-gray-400" />
                    </button>
                  </div>
                </div>
              </div>
            </div>
          )}

          {/* Thumbnail Error */}
          {thumbnailError && (
            <div className="mt-2 flex items-center gap-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle size={16} />
              <span>{thumbnailError}</span>
            </div>
          )}

          {/* Hidden file input */}
          <input
            ref={thumbnailInputRef}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            onChange={handleThumbnailInputChange}
            disabled={disabled}
            className="hidden"
          />
        </div>
      )}
    </div>
  );
};

export default VideoFileUpload;
