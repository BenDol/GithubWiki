import React, { useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, ExternalLink } from 'lucide-react';
import VideoPlayer from './VideoPlayer';
import { createLogger } from '../../utils/logger';

const logger = createLogger('VideoPlayerModal');

/**
 * VideoPlayerModal - Full-screen video player modal
 * Displays YouTube video in an embedded player with metadata
 * Mobile-friendly with responsive design
 */
const VideoPlayerModal = ({ guide, isOpen, onClose }) => {
  // Close on Escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    // Prevent body scroll when modal is open
    document.body.style.overflow = 'hidden';

    return () => {
      document.removeEventListener('keydown', handleEscape);
      document.body.style.overflow = 'unset';
    };
  }, [isOpen, onClose]);

  if (!isOpen || !guide) return null;

  const handleBackdropClick = (e) => {
    // Only close if clicking the backdrop itself (not the modal content)
    if (e.target === e.currentTarget) {
      onClose();
    }
  };

  const handleContentClick = (e) => {
    // Prevent backdrop click from closing when clicking content
    e.stopPropagation();
  };

  const modalContent = (
    <>
      <style>{`
        /* Fullscreen iframe styles */
        .video-iframe:fullscreen,
        .video-iframe:-webkit-full-screen,
        .video-iframe:-moz-full-screen {
          width: 100vw !important;
          height: 100vh !important;
          max-width: 100vw !important;
          max-height: 100vh !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
          object-fit: contain;
        }

        /* Fullscreen container styles */
        .video-container:fullscreen,
        .video-container:-webkit-full-screen,
        .video-container:-moz-full-screen {
          width: 100vw !important;
          height: 100vh !important;
          padding-bottom: 0 !important;
          position: fixed !important;
          top: 0 !important;
          left: 0 !important;
        }

        .video-container:fullscreen .video-iframe,
        .video-container:-webkit-full-screen .video-iframe,
        .video-container:-moz-full-screen .video-iframe {
          width: 100vw !important;
          height: 100vh !important;
          max-width: 100vw !important;
          max-height: 100vh !important;
        }
      `}</style>
      <div
        className="fixed inset-0 z-[9999] flex items-center justify-center bg-black bg-opacity-90 backdrop-blur-sm p-0 sm:p-4"
        onClick={handleBackdropClick}
      >
      <div
        className="relative w-full h-full sm:h-auto sm:max-w-6xl sm:max-h-[95vh] bg-gray-900 sm:rounded-lg overflow-hidden shadow-2xl flex flex-col"
        onClick={handleContentClick}
      >
        {/* Close Button */}
        <button
          onClick={onClose}
          className="absolute top-2 right-2 sm:top-4 sm:right-4 z-10 p-2 bg-black bg-opacity-50 hover:bg-opacity-70 rounded-full transition-colors"
          aria-label="Close video player"
        >
          <X size={24} className="text-white" />
        </button>

        {/* Video Container - Responsive */}
        <div className="relative w-full bg-black video-container flex-shrink-0">
          <VideoPlayer guide={guide} className="w-full" />
        </div>

        {/* Video Info - Scrollable on mobile */}
        <div className="flex-1 overflow-y-auto bg-gray-800 p-3 sm:p-6 min-h-0">
          {/* Title */}
          <h2 className="text-xl sm:text-2xl font-bold text-white mb-3">
            {guide.title}
          </h2>

          {/* Creator */}
          {guide.creator && (
            <p className="text-sm sm:text-base text-gray-300 mb-4">
              By <span className="font-medium text-white">{guide.creator}</span>
              {guide.submittedBy && guide.submittedBy !== guide.creator && (
                <span className="text-gray-400"> • Submitted by @{guide.submittedBy}</span>
              )}
            </p>
          )}

          {/* Description */}
          <p className="text-sm sm:text-base text-gray-300 mb-4 leading-relaxed">
            {guide.description}
          </p>

          {/* Badges */}
          <div className="flex flex-wrap gap-2 mb-4">
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
            <div className="flex flex-wrap gap-1.5 mb-4">
              {guide.tags.map(tag => (
                <span
                  key={tag}
                  className="text-xs px-2 py-1 bg-gray-700 text-gray-300 rounded"
                >
                  #{tag}
                </span>
              ))}
            </div>
          )}

          {/* External Link */}
          <a
            href={guide.videoUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-2 text-sm text-blue-400 hover:text-blue-300 font-medium transition-colors"
          >
            <ExternalLink size={16} />
            {guide.sourceType === 'uploaded' ? 'Open Video' : 'Watch on YouTube'}
          </a>

          {/* Submission Info */}
          {guide.submittedAt && (
            <div className="mt-4 pt-4 border-t border-gray-700 text-xs text-gray-500">
              Submitted {new Date(guide.submittedAt).toLocaleDateString()}
            </div>
          )}
        </div>
      </div>
    </div>
    </>
  );

  return createPortal(modalContent, document.body);
};

/**
 * Badge Component
 * Simple colored badge for categories, difficulty, etc.
 */
const Badge = ({ variant = 'neutral', children }) => {
  const variants = {
    primary: 'bg-blue-600 text-blue-100',
    success: 'bg-green-600 text-green-100',
    warning: 'bg-yellow-600 text-yellow-100',
    danger: 'bg-red-600 text-red-100',
    neutral: 'bg-gray-600 text-gray-100',
  };

  return (
    <span className={`text-xs sm:text-sm px-2.5 py-1 rounded-full font-medium ${variants[variant] || variants.neutral}`}>
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

export default VideoPlayerModal;
