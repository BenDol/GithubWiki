/**
 * ProfilePicture - Unified component for displaying user profile pictures
 *
 * Automatically handles:
 * - Custom profile pictures via useCustomAvatar hook
 * - Prestige badges
 * - Donator badges
 * - Display names
 *
 * Use this component everywhere you need to display a user's avatar
 * to ensure consistency across the entire application.
 */

import PrestigeAvatar from './PrestigeAvatar';

/**
 * ProfilePicture component with automatic custom avatar loading
 *
 * @param {Object} props
 * @param {string} props.username - GitHub username
 * @param {number} props.userId - GitHub user ID (required for custom avatars)
 * @param {string} props.avatarUrl - GitHub avatar URL (fallback)
 * @param {string} [props.alt] - Alt text for image
 * @param {string} [props.size='md'] - Size: sm, md, lg, xl, 2xl
 * @param {Object} [props.stats] - User prestige stats
 * @param {boolean} [props.showBadge=true] - Show prestige/donator badges
 * @param {boolean} [props.showPrestigeBadge=true] - Show prestige badge
 * @param {boolean} [props.showDonatorBadge=true] - Show donator badge
 * @param {number} [props.badgeScale=1.0] - Badge scale multiplier
 * @param {Function} [props.onClick] - Click handler
 * @param {boolean} [props.enableUserActions=false] - Enable user action menu on click
 * @param {any} [props.avatarRefreshTrigger] - Force refresh custom avatar
 * @param {string} [props.className] - Additional CSS classes
 *
 * @example
 * // Basic usage
 * <ProfilePicture
 *   username="octocat"
 *   userId={123456}
 *   avatarUrl="https://avatars.githubusercontent.com/u/123456"
 * />
 *
 * @example
 * // With size and badges
 * <ProfilePicture
 *   username="octocat"
 *   userId={123456}
 *   avatarUrl="https://avatars.githubusercontent.com/u/123456"
 *   size="lg"
 *   showBadge={true}
 * />
 *
 * @example
 * // Simple avatar (no badges, no user actions)
 * <ProfilePicture
 *   username="octocat"
 *   userId={123456}
 *   avatarUrl="https://avatars.githubusercontent.com/u/123456"
 *   size="sm"
 *   showBadge={false}
 * />
 */
const ProfilePicture = ({
  username,
  userId,
  avatarUrl,
  alt,
  size = 'md',
  stats = null,
  showBadge = true,
  showPrestigeBadge = true,
  showDonatorBadge = true,
  badgeScale = 1.0,
  onClick = null,
  enableUserActions = false,
  avatarRefreshTrigger = null,
  className = '',
}) => {
  return (
    <PrestigeAvatar
      src={avatarUrl}
      alt={alt || username}
      username={username}
      userId={userId}
      stats={stats}
      size={size}
      showBadge={showBadge}
      showPrestigeBadge={showPrestigeBadge}
      showDonatorBadge={showDonatorBadge}
      badgeScale={badgeScale}
      onClick={onClick}
      enableUserActions={enableUserActions}
      avatarRefreshTrigger={avatarRefreshTrigger}
      className={className}
    />
  );
};

export default ProfilePicture;
