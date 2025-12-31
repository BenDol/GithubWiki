/**
 * DisplayName - Unified component for displaying user display names
 *
 * Automatically handles:
 * - Custom display names via useDisplayName hook
 * - Fallback to GitHub username
 * - Optional GitHub username display (@username)
 *
 * Use this component everywhere you need to display a user's name
 * to ensure consistency across the entire application.
 */

import { useDisplayName } from '../../hooks/useDisplayName';

/**
 * DisplayName component with automatic display name loading
 *
 * @param {Object} props
 * @param {string} props.username - GitHub username
 * @param {number} props.userId - GitHub user ID
 * @param {boolean} [props.showUsername=false] - Show @username below display name
 * @param {string} [props.className] - CSS classes for the display name
 * @param {string} [props.usernameClassName] - CSS classes for the @username
 * @param {boolean} [props.link=false] - Wrap in profile link
 * @param {Function} [props.onClick] - Click handler (if not using link)
 *
 * @example
 * // Basic usage
 * <DisplayName username="octocat" userId={123456} />
 *
 * @example
 * // With username shown
 * <DisplayName
 *   username="octocat"
 *   userId={123456}
 *   showUsername={true}
 * />
 *
 * @example
 * // As a link to profile
 * <DisplayName
 *   username="octocat"
 *   userId={123456}
 *   link={true}
 * />
 *
 * @example
 * // Custom styling
 * <DisplayName
 *   username="octocat"
 *   userId={123456}
 *   className="text-lg font-bold"
 *   showUsername={true}
 *   usernameClassName="text-sm text-gray-500"
 * />
 */
const DisplayName = ({
  username,
  userId,
  showUsername = false,
  className = '',
  usernameClassName = 'text-xs text-gray-500 dark:text-gray-400',
  link = false,
  onClick = null,
}) => {
  const { displayName } = useDisplayName(userId && username ? { id: userId, login: username } : null);

  const finalDisplayName = displayName || username;
  const showUsernameTag = showUsername && displayName && displayName !== username;

  // Render content
  const content = (
    <>
      <span className={className}>
        {finalDisplayName}
      </span>
      {showUsernameTag && (
        <span className={usernameClassName}>
          @{username}
        </span>
      )}
    </>
  );

  // Wrap in link if requested
  if (link) {
    return (
      <a
        href={`#/profile/${username}`}
        className="hover:underline"
        onClick={(e) => {
          if (onClick) {
            e.preventDefault();
            onClick();
          }
        }}
      >
        {content}
      </a>
    );
  }

  // Wrap in button if onClick provided
  if (onClick) {
    return (
      <button
        onClick={onClick}
        className="text-left hover:underline"
      >
        {content}
      </button>
    );
  }

  // Just render content
  return content;
};

/**
 * DisplayNameWithAvatar - Combined component for displaying avatar + name
 *
 * Common pattern used throughout the app. Combines ProfilePicture + DisplayName.
 *
 * @example
 * <DisplayNameWithAvatar
 *   username="octocat"
 *   userId={123456}
 *   avatarUrl="https://avatars.githubusercontent.com/u/123456"
 *   avatarSize="sm"
 *   showUsername={true}
 * />
 */
export const DisplayNameWithAvatar = ({
  username,
  userId,
  avatarUrl,
  avatarSize = 'sm',
  showUsername = false,
  showBadge = false,
  link = false,
  onClick = null,
  className = 'flex items-center gap-2',
}) => {
  // Import here to avoid circular dependency
  const ProfilePicture = require('./ProfilePicture').default;

  return (
    <div className={className}>
      <ProfilePicture
        username={username}
        userId={userId}
        avatarUrl={avatarUrl}
        size={avatarSize}
        showBadge={showBadge}
      />
      <div className="flex flex-col min-w-0">
        <DisplayName
          username={username}
          userId={userId}
          showUsername={showUsername}
          link={link}
          onClick={onClick}
        />
      </div>
    </div>
  );
};

export default DisplayName;
