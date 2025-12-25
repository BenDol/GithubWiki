import React, { useState, useEffect } from 'react';
import { ExternalLink, Play } from 'lucide-react';
import { getVideoGuideById, getVideoGuideByTitle, extractYouTubeVideoId, getYouTubeThumbnail } from '../../services/contentCreators';
import VideoPlayerModal from './VideoPlayerModal';
import VideoPlayer from './VideoPlayer';
import { createLogger } from '../../utils/logger';

const logger = createLogger('VideoGuideCard');

/**
 * Video Guide Card Component
 * Displays video guides in card mode (grid) or embed mode (markdown injection)
 *
 * @param {Object} guide - Full guide object (if available)
 * @param {string} identifier - Guide ID or title (if guide not provided)
 * @param {string} findBy - 'id' or 'title' (how to look up identifier)
 * @param {string} mode - 'card' or 'embed'
 * @param {boolean} showId - Show guide ID in embed mode (for debugging)
 */
const VideoGuideCard = ({
  guide,
  identifier,
  findBy = 'id',
  mode = 'card',
  showId = false
}) => {
  const [loadedGuide, setLoadedGuide] = useState(guide);
  const [loading, setLoading] = useState(!guide);
  const [error, setError] = useState(null);
  const [showPlayer, setShowPlayer] = useState(false);

  useEffect(() => {
    if (!guide && identifier) {
      loadGuide();
    }
  }, [identifier, findBy, guide]);

  async function loadGuide() {
    setLoading(true);
    setError(null);

    try {
      logger.debug('Loading video guide', { identifier, findBy });
      const data = findBy === 'id'
        ? await getVideoGuideById(identifier)
        : await getVideoGuideByTitle(identifier);

      if (!data) {
        throw new Error(`Video guide not found: ${identifier}`);
      }

      setLoadedGuide(data);
      logger.debug('Video guide loaded successfully', { id: data.id, title: data.title });
    } catch (err) {
      logger.error('Failed to load video guide', { error: err.message, identifier });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center p-8">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
        <span className="ml-3 text-gray-600 dark:text-gray-400">Loading video guide...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-red-600 dark:text-red-400 text-sm font-medium">
          Error loading video guide
        </p>
        <p className="text-red-500 dark:text-red-500 text-xs mt-1">{error}</p>
      </div>
    );
  }

  if (!loadedGuide) {
    return (
      <div className="p-4 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
        <p className="text-yellow-800 dark:text-yellow-400 text-sm">
          Video guide not found: {identifier}
        </p>
      </div>
    );
  }

  const videoId = extractYouTubeVideoId(loadedGuide.videoUrl);
  const thumbnailUrl = loadedGuide.thumbnailUrl || getYouTubeThumbnail(loadedGuide.videoUrl);

  // Embed mode - full video player with metadata
  if (mode === 'embed') {
    return (
      <div className="video-guide-embed not-prose my-6">
        {/* Video Player (handles both YouTube and uploaded videos) */}
        <div className="mb-4">
          <VideoPlayer guide={loadedGuide} />
        </div>

        {/* Metadata */}
        <VideoGuideMetadata guide={loadedGuide} showId={showId} />
      </div>
    );
  }

  // Card mode - thumbnail with info (for grid view)
  return (
    <>
      <div className="video-guide-card group bg-white dark:bg-gray-800 rounded-lg shadow-md hover:shadow-xl transition-all overflow-hidden cursor-pointer">
        {/* Thumbnail */}
        <div
          className="relative w-full pb-[56.25%] bg-gray-200 dark:bg-gray-700 overflow-hidden"
          onClick={() => setShowPlayer(true)}
        >
          {thumbnailUrl ? (
            <>
              <img
                src={thumbnailUrl}
                alt={loadedGuide.title}
                className="absolute top-0 left-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                loading="lazy"
              />
              {/* Play Button Overlay */}
              <div className="absolute inset-0 flex items-center justify-center bg-black bg-opacity-0 group-hover:bg-opacity-30 transition-all">
                <div className="w-16 h-16 sm:w-20 sm:h-20 bg-red-600 rounded-full flex items-center justify-center opacity-0 group-hover:opacity-100 transform scale-75 group-hover:scale-100 transition-all">
                  <Play size={32} className="text-white ml-1" fill="white" />
                </div>
              </div>
            </>
          ) : (
            <div className="absolute inset-0 flex items-center justify-center">
              <span className="text-gray-400">No thumbnail</span>
            </div>
          )}
        </div>

        {/* Content */}
        <div className="p-3 sm:p-4">
          {/* Title */}
          <h3
            className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-2 line-clamp-2 cursor-pointer hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            onClick={() => setShowPlayer(true)}
          >
            {loadedGuide.title}
          </h3>

          {/* Description */}
          <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-400 mb-3 line-clamp-2">
            {loadedGuide.description}
          </p>

          {/* Creator */}
          {loadedGuide.creator && (
            <p className="text-xs text-gray-500 dark:text-gray-500 mb-3">
              By <span className="font-medium">{loadedGuide.creator}</span>
            </p>
          )}

          {/* Badges */}
          <div className="flex flex-wrap gap-1.5 sm:gap-2 mb-3">
            {loadedGuide.category && (
              <Badge variant="primary">{loadedGuide.category}</Badge>
            )}
            {loadedGuide.difficulty && (
              <Badge variant={getDifficultyColor(loadedGuide.difficulty)}>
                {loadedGuide.difficulty}
              </Badge>
            )}
            {loadedGuide.duration && (
              <Badge variant="neutral">{loadedGuide.duration}</Badge>
            )}
          </div>

          {/* Tags - Show only first 3 on mobile */}
          {loadedGuide.tags && loadedGuide.tags.length > 0 && (
            <div className="flex flex-wrap gap-1 mb-3">
              {loadedGuide.tags.slice(0, 3).map(tag => (
                <span
                  key={tag}
                  className="text-xs px-2 py-0.5 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
                >
                  #{tag}
                </span>
              ))}
              {loadedGuide.tags.length > 3 && (
                <span className="text-xs px-2 py-0.5 text-gray-500 dark:text-gray-500">
                  +{loadedGuide.tags.length - 3}
                </span>
              )}
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex items-center gap-2 sm:gap-3">
            <button
              onClick={() => setShowPlayer(true)}
              className="flex-1 sm:flex-none px-3 sm:px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs sm:text-sm font-medium rounded transition-colors flex items-center justify-center gap-1.5"
            >
              <Play size={14} fill="white" />
              Watch
            </button>
            <a
              href={loadedGuide.videoUrl}
              target="_blank"
              rel="noopener noreferrer"
              onClick={(e) => e.stopPropagation()}
              className="flex items-center gap-1 px-2 py-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
              title="Open on YouTube"
            >
              <ExternalLink size={16} />
            </a>
          </div>
        </div>
      </div>

      {/* Video Player Modal */}
      <VideoPlayerModal
        guide={loadedGuide}
        isOpen={showPlayer}
        onClose={() => setShowPlayer(false)}
      />
    </>
  );
};

/**
 * Video Guide Metadata Component
 * Shows title, description, and badges below embedded video
 */
const VideoGuideMetadata = ({ guide, showId }) => (
  <div className="space-y-2">
    {showId && (
      <p className="text-xs font-mono text-gray-500 dark:text-gray-500">
        ID: {guide.id}
      </p>
    )}

    <h3 className="text-xl font-bold text-gray-900 dark:text-white">
      {guide.title}
    </h3>

    <p className="text-gray-700 dark:text-gray-300">
      {guide.description}
    </p>

    {guide.creator && (
      <p className="text-sm text-gray-600 dark:text-gray-400">
        By <span className="font-medium">{guide.creator}</span>
      </p>
    )}

    {/* Badges */}
    <div className="flex flex-wrap gap-2">
      {guide.category && (
        <Badge variant="primary">{guide.category}</Badge>
      )}
      {guide.difficulty && (
        <Badge variant={getDifficultyColor(guide.difficulty)}>
          {guide.difficulty}
        </Badge>
      )}
      {guide.duration && (
        <Badge variant="neutral">{guide.duration}</Badge>
      )}
    </div>

    {/* Tags */}
    {guide.tags && guide.tags.length > 0 && (
      <div className="flex flex-wrap gap-1.5">
        {guide.tags.map(tag => (
          <span
            key={tag}
            className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded"
          >
            #{tag}
          </span>
        ))}
      </div>
    )}

    {/* Link to video (show appropriate text based on source) */}
    <a
      href={guide.videoUrl}
      target="_blank"
      rel="noopener noreferrer"
      className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
    >
      {guide.sourceType === 'uploaded' ? 'Open Video' : 'Watch on YouTube'}
      <ExternalLink size={14} />
    </a>
  </div>
);

/**
 * Badge Component
 * Simple colored badge for categories, difficulty, etc.
 */
const Badge = ({ variant = 'neutral', children }) => {
  const variants = {
    primary: 'bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200',
    success: 'bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200',
    warning: 'bg-yellow-100 dark:bg-yellow-900 text-yellow-800 dark:text-yellow-200',
    danger: 'bg-red-100 dark:bg-red-900 text-red-800 dark:text-red-200',
    neutral: 'bg-gray-100 dark:bg-gray-700 text-gray-800 dark:text-gray-200',
  };

  return (
    <span className={`text-xs px-2 py-1 rounded font-medium ${variants[variant] || variants.neutral}`}>
      {children}
    </span>
  );
};

/**
 * Get difficulty badge color
 */
function getDifficultyColor(difficulty) {
  const colors = {
    beginner: 'success',
    intermediate: 'warning',
    advanced: 'danger',
    expert: 'danger',
  };
  return colors[difficulty?.toLowerCase()] || 'neutral';
}

export default VideoGuideCard;
