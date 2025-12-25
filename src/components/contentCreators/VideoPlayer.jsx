import React from 'react';
import { createLogger } from '../../utils/logger';

const logger = createLogger('VideoPlayer');

/**
 * VideoPlayer Component
 * Displays videos based on their source type (YouTube or uploaded)
 */
const VideoPlayer = ({ guide, className = '' }) => {
  if (!guide || !guide.videoUrl) {
    logger.warn('VideoPlayer rendered without valid guide', { guide });
    return null;
  }

  const sourceType = guide.sourceType || 'youtube'; // Default to youtube for backward compatibility

  // Uploaded video - use HTML5 video element
  if (sourceType === 'uploaded') {
    return (
      <div className={`video-player uploaded-video ${className}`}>
        <video
          controls
          poster={guide.thumbnailUrl}
          className="w-full rounded-lg bg-black"
          preload="metadata"
        >
          <source src={guide.videoUrl} type="video/mp4" />
          <source src={guide.videoUrl} type="video/webm" />
          <source src={guide.videoUrl} type="video/quicktime" />
          Your browser does not support HTML5 video playback.
        </video>
      </div>
    );
  }

  // YouTube video - use iframe embed
  // Extract video ID from URL
  const videoId = extractYouTubeVideoId(guide.videoUrl);
  if (!videoId) {
    logger.error('Invalid YouTube URL', { url: guide.videoUrl });
    return (
      <div className={`video-player error ${className}`}>
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
          <p className="text-red-600 dark:text-red-400 text-sm">
            Invalid YouTube video URL
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className={`video-player youtube-video ${className}`}>
      <div className="relative w-full" style={{ paddingBottom: '56.25%' }}> {/* 16:9 aspect ratio */}
        <iframe
          src={`https://www.youtube.com/embed/${videoId}`}
          title={guide.title || 'Video guide'}
          allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
          allowFullScreen
          className="absolute top-0 left-0 w-full h-full rounded-lg"
        />
      </div>
    </div>
  );
};

/**
 * Extract YouTube video ID from various URL formats
 * @param {string} url - YouTube video URL
 * @returns {string|null} Video ID or null if invalid
 */
function extractYouTubeVideoId(url) {
  if (!url) return null;

  const patterns = [
    /(?:youtube\.com\/watch\?v=|youtu\.be\/|youtube\.com\/embed\/)([a-zA-Z0-9_-]{11})/,
    /^([a-zA-Z0-9_-]{11})$/, // Direct video ID
  ];

  for (const pattern of patterns) {
    const match = url.match(pattern);
    if (match && match[1]) {
      return match[1];
    }
  }

  return null;
}

export default VideoPlayer;
