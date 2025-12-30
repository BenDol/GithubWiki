import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAuthStore } from '../../store/authStore';
import { getPrestigeTier, formatPrestigeTitle } from '../../utils/prestige';
import { useUserPrestige } from '../../hooks/usePrestige';
import { useDonatorStatus } from '../../hooks/useDonatorStatus';

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
  userId = null,
  className = '',
  showBadge = true,
  showPrestigeBadge = true,
  showDonatorBadge = true,
  badgeScale = 1.0,
  onClick = null,
  enableUserActions = false,
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

  // Load donator status for this user
  const shouldLoadDonator = showBadge && showDonatorBadge && targetUsername && config?.features?.donation?.badge?.enabled;
  const { isDonator, donatorData } = useDonatorStatus(shouldLoadDonator ? targetUsername : null, userId);

  // Size classes
  const sizeClasses = {
    sm: 'w-8 h-8',
    md: 'w-10 h-10',
    lg: 'w-12 h-12',
    xl: 'w-16 h-16',
    '2xl': 'w-20 h-20',
  };

  const badgeSizeClasses = {
    sm: 'w-3.5 h-3.5 text-[9px]',
    md: 'w-4 h-4 text-[10px]',
    lg: 'w-5 h-5 text-xs',
    xl: 'w-6 h-6 text-sm',
    '2xl': 'w-8 h-8 text-base',
  };

  // Use loaded tier if available, otherwise calculate from stats
  const finalStats = stats || loadedStats;
  const prestigeTier =
    showBadge && showPrestigeBadge && config?.prestige?.enabled === true
      ? loadedTier ||
        (finalStats && config?.prestige?.tiers?.length > 0
          ? getPrestigeTier(finalStats, config.prestige.tiers)
          : null)
      : null;

  // Debug logging disabled for performance
  // Uncomment if debugging prestige issues:
  // console.log('PrestigeAvatar Debug:', { prestigeTier, finalStats });

  const handleClick = (e) => {
    if (onClick) {
      onClick(e, targetUsername, userId);
    }
  };

  const isClickable = onClick !== null || enableUserActions;

  return (
    <div
      className={`relative inline-block ${className} ${isClickable ? 'cursor-pointer' : ''}`}
      onClick={isClickable ? handleClick : undefined}
      role={isClickable ? 'button' : undefined}
      tabIndex={isClickable ? 0 : undefined}
    >
      <img
        src={src}
        alt={alt}
        className={`${sizeClasses[size]} rounded-full object-cover ${isClickable ? 'transition-opacity hover:opacity-80' : ''}`}
      />

      {/* Prestige badge overlay (bottom-right) */}
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

      {/* Donator badge overlay (bottom-center) */}
      {isDonator && donatorData && (
        <div
          className="absolute left-1/2 -translate-x-1/2 flex items-center justify-center z-10"
          style={{
            bottom: '-3.5px',
            transform: `translateX(-50%) scale(${badgeScale})`,
          }}
          title={`${donatorData.badge} Donator - Thank you for your support!`}
        >
          <span className="leading-none select-none text-[11px] animate-glow-pulse">
            {donatorData.badge}
          </span>
        </div>
      )}
    </div>
  );
};

export default PrestigeAvatar;
