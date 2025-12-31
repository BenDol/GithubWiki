# Profile Picture & Display Name Components

This document describes the unified components for displaying user profile pictures and display names throughout the application.

## Components Overview

### ProfilePicture
**Location:** `wiki-framework/src/components/common/ProfilePicture.jsx`

Unified wrapper around `PrestigeAvatar` that automatically handles:
- ✅ Custom profile pictures (via `useCustomAvatar` hook)
- ✅ Prestige badges
- ✅ Donator badges
- ✅ Consistent sizing and styling

### DisplayName
**Location:** `wiki-framework/src/components/common/DisplayName.jsx`

Unified component for displaying user names that automatically handles:
- ✅ Custom display names (via `useDisplayName` hook)
- ✅ Fallback to GitHub username
- ✅ Optional @username display
- ✅ Optional profile links

## Usage

### Basic ProfilePicture

```jsx
import ProfilePicture from '../components/common/ProfilePicture';

<ProfilePicture
  username="octocat"
  userId={123456}
  avatarUrl="https://avatars.githubusercontent.com/u/123456"
/>
```

### ProfilePicture with Badges

```jsx
<ProfilePicture
  username="octocat"
  userId={123456}
  avatarUrl="https://avatars.githubusercontent.com/u/123456"
  size="lg"
  showBadge={true}
  stats={userStats}
/>
```

### Basic DisplayName

```jsx
import DisplayName from '../components/common/DisplayName';

<DisplayName
  username="octocat"
  userId={123456}
/>
```

### DisplayName with Username Tag

```jsx
<DisplayName
  username="octocat"
  userId={123456}
  showUsername={true}
/>
// Renders: "John Doe @octocat" (if custom name is set)
```

### DisplayName with Profile Link

```jsx
<DisplayName
  username="octocat"
  userId={123456}
  link={true}
/>
```

### Combined: Avatar + Name

```jsx
import { DisplayNameWithAvatar } from '../components/common/DisplayName';

<DisplayNameWithAvatar
  username="octocat"
  userId={123456}
  avatarUrl="https://avatars.githubusercontent.com/u/123456"
  avatarSize="sm"
  showUsername={true}
  showBadge={false}
/>
```

## Migration Guide

### Before (Inconsistent)

```jsx
// Old way - manual avatar and name handling
{comment.author.avatar_url ? (
  <img
    src={comment.author.avatar_url}
    alt={comment.author.login}
    className="w-8 h-8 rounded-full"
  />
) : (
  <div className="w-8 h-8 rounded-full bg-gray-300">...</div>
)}

<span>{displayNames[comment.user.id] || comment.user.login}</span>
```

### After (Unified)

```jsx
// New way - automatic handling of custom avatars and names
<ProfilePicture
  username={comment.author.login}
  userId={comment.author.id}
  avatarUrl={comment.author.avatar_url}
  size="sm"
  showBadge={false}
/>

<DisplayName
  username={comment.author.login}
  userId={comment.author.id}
/>
```

## Where to Use

Use these components **everywhere** you display:
- ✅ User avatars in comments
- ✅ Author info in commit cards
- ✅ Contributor lists
- ✅ Highscore boards
- ✅ Profile pages
- ✅ User menus
- ✅ Edit history
- ✅ Pull request lists
- ✅ Any other user-related UI

## Benefits

### Consistency
- All avatars automatically use custom profile pictures
- All names automatically use custom display names
- Uniform sizing and styling across the app

### Maintainability
- Single source of truth for user display logic
- Easy to add new features (e.g., verified badges, status indicators)
- Simple to update styling globally

### Performance
- Automatic caching via hooks
- Optimized loading of custom data
- No duplicate API calls

## Component Props Reference

### ProfilePicture Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `username` | `string` | Required | GitHub username |
| `userId` | `number` | Required | GitHub user ID (for custom avatars) |
| `avatarUrl` | `string` | Required | GitHub avatar URL (fallback) |
| `alt` | `string` | `username` | Alt text for image |
| `size` | `string` | `'md'` | Size: sm, md, lg, xl, 2xl |
| `stats` | `object` | `null` | User prestige stats |
| `showBadge` | `boolean` | `true` | Show prestige/donator badges |
| `showPrestigeBadge` | `boolean` | `true` | Show prestige badge |
| `showDonatorBadge` | `boolean` | `true` | Show donator badge |
| `badgeScale` | `number` | `1.0` | Badge scale multiplier |
| `onClick` | `function` | `null` | Click handler |
| `enableUserActions` | `boolean` | `false` | Enable user action menu |
| `avatarRefreshTrigger` | `any` | `null` | Force refresh trigger |
| `className` | `string` | `''` | Additional CSS classes |

### DisplayName Props

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `username` | `string` | Required | GitHub username |
| `userId` | `number` | Required | GitHub user ID |
| `showUsername` | `boolean` | `false` | Show @username below name |
| `className` | `string` | `''` | CSS classes for name |
| `usernameClassName` | `string` | `'text-xs text-gray-500'` | CSS classes for @username |
| `link` | `boolean` | `false` | Wrap in profile link |
| `onClick` | `function` | `null` | Click handler |

## Examples from the Codebase

### ChangelogPage
```jsx
<ProfilePicture
  username={commit.author.login}
  userId={commit.author.id}
  avatarUrl={commit.author.avatar_url}
  size="sm"
  showBadge={false}
/>

<DisplayName
  username={commit.author.login}
  userId={commit.author.id}
  className="text-xs"
/>
```

### Comments Component
```jsx
<ProfilePicture
  username={comment.user.login}
  userId={comment.user.id}
  avatarUrl={comment.user.avatar_url}
  size="md"
  showBadge={true}
  onClick={handleAvatarClick}
/>

<DisplayName
  username={comment.user.login}
  userId={comment.user.id}
  showUsername={true}
  link={true}
/>
```

## Future Enhancements

Potential additions to these components:
- 🔮 Online status indicators
- 🔮 Verified user badges
- 🔮 Role badges (admin, moderator, etc.)
- 🔮 Hover cards with user info
- 🔮 Loading states
- 🔮 Error states with fallback
