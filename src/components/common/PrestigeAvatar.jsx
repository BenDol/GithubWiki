import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAuthStore } from '../../store/authStore';
import { getPrestigeTier, formatPrestigeTitle } from '../../utils/prestige';
import { useUserPrestige } from '../../hooks/usePrestige';

/**
 * Avatar component with optional prestige badge overlay
 * Shows user prestige badge on their avatar image
 *
 * Usage:
 * 1. Pass stats directly: <PrestigeAvatar src="..." stats={statsObj} />
 * 2. Pass username to auto-load: <PrestigeAvatar src="..." username="githubuser" />
 * 3. No params for current user: <PrestigeAvatar src="..." /> (if logged in)
 *
 * Currently only shows badges for the authenticated user.
 * Future: Will support showing badges for any user via central cache.
 */
const PrestigeAvatar = ({
  src,
  alt,
  size = 'md',
  stats = null,
  username = null,
  className = '',
  showBadge = true,
  badgeScale = 1.0,
}) => {
  const { config } = useWikiConfig();
  const { user } = useAuthStore();

  // Determine which username to use
  const targetUsername = username || (stats ? user?.login : null);

  // Load prestige data if username provided and no stats
  // Only call hook if we actually need to load data
  const shouldLoadPrestige = !stats && showBadge && targetUsername && config?.prestige?.enabled;
  const prestigeHookResult = useUserPrestige(shouldLoadPrestige ? targetUsername : null);
  const { tier: loadedTier, stats: loadedStats } = prestigeHookResult || {};

  // Size classes
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
    '2xl': 'w-20 h-20',
  };

  const badgeSizeClasses = {
    sm: 'w-4 h-4 text-[10px]',
    md: 'w-5 h-5 text-xs',
    lg: 'w-6 h-6 text-sm',
    xl: 'w-7 h-7 text-base',
    '2xl': 'w-10 h-10 text-lg',
  };

  // Use loaded tier if available, otherwise calculate from stats
  const finalStats = stats || loadedStats;
  const prestigeTier =
    showBadge && config?.prestige?.enabled === true
      ? loadedTier ||
        (finalStats && config?.prestige?.tiers?.length > 0
          ? getPrestigeTier(finalStats, config.prestige.tiers)
          : null)
      : null;

  // Debug logging disabled for performance
  // Uncomment if debugging prestige issues:
  // console.log('PrestigeAvatar Debug:', { prestigeTier, finalStats });

  return (
    <div className={`relative inline-block ${className}`}>
      <img
        src={src}
        alt={alt}
        className={`${sizeClasses[size]} rounded-full object-cover`}
      />

      {/* Prestige badge overlay */}
      {prestigeTier && (
        <div
          className={`absolute -bottom-0.5 -right-0.5 ${badgeSizeClasses[size]} rounded-full flex items-center justify-center shadow-xl ring-2 ring-white dark:ring-gray-900 z-10`}
          style={{
            backgroundColor: prestigeTier.color,
            transform: `scale(${badgeScale})`,
          }}
          title={formatPrestigeTitle(prestigeTier)}
        >
          <span className="leading-none select-none">{prestigeTier.badge}</span>
        </div>
      )}
    </div>
  );
};

export default PrestigeAvatar;
