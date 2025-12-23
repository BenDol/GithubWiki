import React, { useMemo } from 'react';
import { ExternalLink } from 'lucide-react';
import { createLogger } from '../../utils/logger';

const logger = createLogger('StreamEmbed');

/**
 * StreamEmbed Component
 * Embeds Twitch or YouTube live streams
 *
 * @param {Object} creator - Creator object with platform, channelUrl, channelName
 */
const StreamEmbed = ({ creator }) => {
  const embedUrl = useMemo(() => {
    if (!creator || !creator.platform || !creator.channelUrl) {
      logger.error('Invalid creator data', { creator });
      return null;
    }

    if (creator.platform === 'twitch') {
      // Extract Twitch username from URL
      const usernameMatch = creator.channelUrl.match(/twitch\.tv\/([a-zA-Z0-9_]{4,25})/);
      if (!usernameMatch) {
        logger.error('Failed to extract Twitch username', { url: creator.channelUrl });
        return null;
      }

      const username = usernameMatch[1];
      const hostname = window.location.hostname || 'localhost';

      // Twitch embed URL with parent parameter
      return `https://player.twitch.tv/?channel=${username}&parent=${hostname}&muted=false`;
    } else if (creator.platform === 'youtube') {
      // Extract YouTube channel ID/name from URL
      const channelMatch = creator.channelUrl.match(/youtube\.com\/((@|c\/|channel\/|user\/)([a-zA-Z0-9_-]+))/);
      if (!channelMatch) {
        logger.error('Failed to extract YouTube channel', { url: creator.channelUrl });
        return null;
      }

      const channelPart = channelMatch[1];

      // YouTube live stream embed
      // Note: This will show the channel's live stream if they're streaming, or a placeholder if not
      return `https://www.youtube.com/embed/live_stream?channel=${encodeURIComponent(channelPart)}`;
    }

    logger.error('Unsupported platform', { platform: creator.platform });
    return null;
  }, [creator]);

  if (!embedUrl) {
    return (
      <div className="stream-embed-error p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
        <p className="text-red-600 dark:text-red-400 text-sm">
          Failed to load stream embed
        </p>
        {creator?.channelUrl && (
          <a
            href={creator.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline mt-2"
          >
            Visit channel
            <ExternalLink size={12} />
          </a>
        )}
      </div>
    );
  }

  return (
    <div className="stream-embed bg-white dark:bg-gray-800 rounded-lg shadow-md overflow-hidden">
      {/* Embed Container - 16:9 aspect ratio */}
      <div className="relative w-full pb-[56.25%] bg-gray-900">
        <iframe
          src={embedUrl}
          title={`${creator.channelName || 'Stream'} - ${creator.platform}`}
          allowFullScreen
          allow="autoplay; encrypted-media; fullscreen"
          className="absolute top-0 left-0 w-full h-full"
          loading="lazy"
        />
      </div>

      {/* Stream Info */}
      <div className="p-4">
        <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
          {creator.channelName || 'Unknown Channel'}
        </h3>

        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xs px-2 py-1 bg-gray-100 dark:bg-gray-700 text-gray-600 dark:text-gray-400 rounded capitalize">
              {creator.platform}
            </span>
          </div>

          <a
            href={creator.channelUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 text-sm text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium transition-colors"
          >
            Visit Channel
            <ExternalLink size={14} />
          </a>
        </div>
      </div>
    </div>
  );
};

export default StreamEmbed;
