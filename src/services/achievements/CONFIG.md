# Achievement System Configuration

The achievement system can be configured through `wiki-config.json` under `features.achievements`.

## Configuration Reference

### Master Switch

```json
"achievements": {
  "enabled": true
}
```

Set to `false` to completely disable the achievement system.

---

## Core Settings

### `definitionsPath` (string)
Path to the achievement definitions JSON file.

**Default:** `"/achievements.json"`

**Example:**
```json
"definitionsPath": "/data/achievements.json"
```

## Release Date Filtering

**IMPORTANT:** The achievement system respects the `VITE_RELEASE_DATE` environment variable, which is used globally across the wiki for filtering pre-launch activity.

All achievement calculations will only count contributions, PRs, and activity **after the release date**.

This ensures that:
- Pre-launch development work doesn't count toward achievements
- The "Early Adopter" achievement works correctly (first 30 days after release)
- Statistics are accurate for the public wiki period

### Configuration

Set the `VITE_RELEASE_DATE` environment variable in:

1. **Local development** (`.env` file):
```bash
VITE_RELEASE_DATE=2024-01-01T00:00:00Z
```

2. **GitHub Actions** (Repository Variables):
   - Go to Settings → Secrets and variables → Actions → Variables
   - Create variable: `VITE_RELEASE_DATE`
   - Value: `2024-01-01T00:00:00Z`

3. **Cloudflare Pages** (Environment Variables):
   - Add `VITE_RELEASE_DATE` to your build environment variables

**Format:** ISO 8601 date string (e.g., `2024-01-01T00:00:00Z`)

**Default:** If not set, no date filtering occurs (all contributions count)

**Impact:**
- PRs created before this date are excluded from achievement checks
- User stats (totalPRs, mergedPRs, etc.) are recalculated excluding pre-release data
- The "early-adopter" achievement requires this to be set

**⚠️ Warning:** Changing this date after launch will recalculate all achievements!

See `.claude/release-date-filtering.md` for complete documentation on the release date system.

---

## Checking Configuration

Controls when the system checks for new achievement unlocks.

### `checking.checkOnLogin` (boolean)
Check achievements when user logs in.

**Default:** `true`

### `checking.checkOnSnapshotUpdate` (boolean)
Check achievements when user snapshot is updated (PR merged, stats recalculated).

**Default:** `true`

### `checking.checkOnBuildSave` (boolean)
Check achievements when user saves a skill build.

**Default:** `false` (enable if you have build-related achievements)

### `checking.checkOnLoadoutSave` (boolean)
Check achievements when user saves a battle loadout.

**Default:** `false` (enable if you have loadout-related achievements)

### `checking.autoCheckInterval` (number)
Automatically check achievements at regular intervals (in minutes). Set to `0` to disable.

**Default:** `0` (disabled)

**Example:**
```json
"checking": {
  "checkOnLogin": true,
  "checkOnSnapshotUpdate": true,
  "checkOnBuildSave": true,
  "checkOnLoadoutSave": true,
  "autoCheckInterval": 0
}
```

---

## Category Configuration

Enable or disable entire achievement categories.

### `categories.<category>.enabled` (boolean)
Enable/disable a specific achievement category.

**Available Categories:**
- `contribution` - PR and edit-based achievements
- `milestone` - Time-based and account milestones
- `social` - Community engagement achievements
- `game` - Game-specific progress achievements

**Example:**
```json
"categories": {
  "contribution": { "enabled": true },
  "milestone": { "enabled": true },
  "social": { "enabled": false },  // Disable social achievements
  "game": { "enabled": true }
}
```

---

## UI Configuration

Controls how achievements are displayed to users.

### `ui.showInProfile` (boolean)
Display achievements section in user profile page.

**Default:** `true`

### `ui.showInHeader` (boolean)
Show achievement indicator/button in header navigation.

**Default:** `false`

### `ui.showProgressBars` (boolean)
Display progress bars for progressive achievements (e.g., "Create 10 PRs").

**Default:** `true`

### `ui.showRarityBadges` (boolean)
Show rarity badges (common, rare, epic, legendary) on achievement cards.

**Default:** `true`

### `ui.showPercentages` (boolean)
Display what % of users have unlocked each achievement.

**Default:** `true`

### `ui.showPoints` (boolean)
Show achievement points on cards and total points in profile.

**Default:** `true`

### `ui.showHiddenAchievements` (boolean)
Show hidden achievements before they're unlocked. When `false`, hidden achievements remain secret until unlocked.

**Default:** `false`

### `ui.defaultView` (string)
Default view when opening achievements page.

**Options:** `"all"`, `"unlocked"`, `"locked"`

**Default:** `"all"`

### `ui.filterOptions.*` (boolean)
Enable/disable filter controls.

- `allowCategoryFilter` - Filter by category
- `allowRarityFilter` - Filter by rarity
- `allowLockedToggle` - Toggle locked/unlocked
- `allowSorting` - Sort achievements

**Default:** All `true`

### `ui.grid.columns.*` (number)
Number of achievement card columns per screen size.

**Example:**
```json
"grid": {
  "columns": {
    "mobile": 1,
    "tablet": 2,
    "desktop": 3,
    "wide": 4
  },
  "cardSize": "medium"
}
```

**Card Sizes:** `"small"`, `"medium"`, `"large"`

---

## Notifications

Configure how users are notified of new achievements.

### `notifications.enabled` (boolean)
Master switch for all achievement notifications.

**Default:** `true`

### `notifications.showToast` (boolean)
Show toast notification when achievements unlock.

**Default:** `true`

### `notifications.showModal` (boolean)
Show modal/popup when achievements unlock (more prominent than toast).

**Default:** `false`

### `notifications.playSound` (boolean)
Play sound effect when achievements unlock.

**Default:** `false`

### `notifications.toastDuration` (number)
How long toast notifications stay visible (milliseconds).

**Default:** `5000` (5 seconds)

### `notifications.toastPosition` (string)
Where to show toast notifications.

**Options:** `"top-right"`, `"top-left"`, `"bottom-right"`, `"bottom-left"`, `"top-center"`, `"bottom-center"`

**Default:** `"top-right"`

### `notifications.groupMultiple` (boolean)
Group multiple achievements unlocked at once into a single notification.

**Default:** `true`

### `notifications.maxGroupSize` (number)
Maximum number of achievements to show in a grouped notification.

**Default:** `3`

**Example:**
```json
"notifications": {
  "enabled": true,
  "showToast": true,
  "showModal": false,
  "playSound": true,
  "toastDuration": 7000,
  "toastPosition": "bottom-right",
  "groupMultiple": true,
  "maxGroupSize": 5
}
```

---

## Statistics

Global achievement statistics (% of users who have each achievement).

### `stats.enabled` (boolean)
Enable achievement statistics tracking.

**Default:** `true`

### `stats.cacheMinutes` (number)
How long to cache statistics before re-fetching.

**Default:** `60` (1 hour)

### `stats.showGlobalPercentages` (boolean)
Show percentage of users who have unlocked each achievement.

**Default:** `true`

### `stats.showRarityDistribution` (boolean)
Show distribution of achievements by rarity tier.

**Default:** `true`

### `stats.showCategoryBreakdown` (boolean)
Show achievement completion by category.

**Default:** `true`

### `stats.calculateOnSchedule` (boolean)
Automatically recalculate stats on a schedule (requires GitHub Action).

**Default:** `true`

### `stats.scheduleInterval` (string)
How often to recalculate stats.

**Options:** `"hourly"`, `"daily"`, `"weekly"`

**Default:** `"daily"`

---

## Storage

GitHub Issues storage configuration.

### `storage.issueTitle` (string)
Title prefix for achievement issues.

**Default:** `"[Achievements]"`

### `storage.issueLabel` (string)
Label used for achievement issues.

**Default:** `"achievements"`

### `storage.statsLabel` (string)
Label used for statistics cache issue.

**Default:** `"achievement-stats"`

### `storage.autoBackup` (boolean)
Automatically create backup issues (not yet implemented).

**Default:** `false`

**Example:**
```json
"storage": {
  "issueTitle": "[User Achievements]",
  "issueLabel": "user-achievements",
  "statsLabel": "achievement-statistics",
  "autoBackup": false
}
```

---

## Rate Limits

Prevent excessive API calls and processing.

### `limits.maxAchievementsPerUser` (number)
Maximum achievements a single user can have.

**Default:** `1000`

### `limits.maxChecksPerHour` (number)
Maximum achievement checks per user per hour. This automatically calculates cooldown time.

**Default:** `10` (= 6 minute cooldown between checks)

**Example:**
- `10` checks/hour = 6 minute cooldown
- `20` checks/hour = 3 minute cooldown
- `5` checks/hour = 12 minute cooldown

### `limits.maxDeciderExecutionTime` (number)
Maximum time a decider function can run (milliseconds).

**Default:** `5000` (5 seconds)

**Example:**
```json
"limits": {
  "maxAchievementsPerUser": 1000,
  "maxChecksPerHour": 20,
  "maxDeciderExecutionTime": 3000
}
```

---

## Debug Options

Development and troubleshooting options.

### `debug.enabled` (boolean)
Enable all debug features.

**Default:** `false`

### `debug.logDeciders` (boolean)
Log decider function execution (verbose).

**Default:** `false`

### `debug.logChecks` (boolean)
Log all achievement check attempts.

**Default:** `false`

### `debug.logNotifications` (boolean)
Log notification events.

**Default:** `false`

### `debug.verboseErrors` (boolean)
Include full error stack traces in logs.

**Default:** `false`

**Example:**
```json
"debug": {
  "enabled": true,
  "logDeciders": true,
  "logChecks": true,
  "logNotifications": false,
  "verboseErrors": true
}
```

---

## Complete Example Configuration

```json
{
  "features": {
    "achievements": {
      "enabled": true,
      "definitionsPath": "/achievements.json",
      "checking": {
        "checkOnLogin": true,
        "checkOnSnapshotUpdate": true,
        "checkOnBuildSave": true,
        "checkOnLoadoutSave": true,
        "autoCheckInterval": 0
      },
      "categories": {
        "contribution": { "enabled": true },
        "milestone": { "enabled": true },
        "social": { "enabled": true },
        "game": { "enabled": true }
      },
      "ui": {
        "showInProfile": true,
        "showInHeader": false,
        "showProgressBars": true,
        "showRarityBadges": true,
        "showPercentages": true,
        "showPoints": true,
        "showHiddenAchievements": false,
        "defaultView": "all",
        "filterOptions": {
          "allowCategoryFilter": true,
          "allowRarityFilter": true,
          "allowLockedToggle": true,
          "allowSorting": true
        },
        "grid": {
          "columns": {
            "mobile": 1,
            "tablet": 2,
            "desktop": 3,
            "wide": 4
          },
          "cardSize": "medium"
        }
      },
      "notifications": {
        "enabled": true,
        "showToast": true,
        "showModal": false,
        "playSound": false,
        "toastDuration": 5000,
        "toastPosition": "top-right",
        "groupMultiple": true,
        "maxGroupSize": 3
      },
      "stats": {
        "enabled": true,
        "cacheMinutes": 60,
        "showGlobalPercentages": true,
        "showRarityDistribution": true,
        "showCategoryBreakdown": true,
        "calculateOnSchedule": true,
        "scheduleInterval": "daily"
      },
      "storage": {
        "issueTitle": "[Achievements]",
        "issueLabel": "achievements",
        "statsLabel": "achievement-stats",
        "autoBackup": false,
        "backupInterval": 0
      },
      "limits": {
        "maxAchievementsPerUser": 1000,
        "maxChecksPerHour": 10,
        "maxDeciderExecutionTime": 5000
      },
      "debug": {
        "enabled": false,
        "logDeciders": false,
        "logChecks": false,
        "logNotifications": false,
        "verboseErrors": false
      }
    }
  }
}
```

---

## Common Configurations

### Minimal Configuration (Use Defaults)
```json
{
  "features": {
    "achievements": {
      "enabled": true
    }
  }
}
```

### Disable Social Achievements
```json
{
  "features": {
    "achievements": {
      "enabled": true,
      "categories": {
        "social": { "enabled": false }
      }
    }
  }
}
```

### High Frequency Checking (Testing)
```json
{
  "features": {
    "achievements": {
      "enabled": true,
      "checking": {
        "checkOnLogin": true,
        "checkOnBuildSave": true,
        "checkOnLoadoutSave": true
      },
      "limits": {
        "maxChecksPerHour": 60
      },
      "debug": {
        "enabled": true,
        "logChecks": true
      }
    }
  }
}
```

### Production Configuration (Conservative)
```json
{
  "features": {
    "achievements": {
      "enabled": true,
      "checking": {
        "checkOnLogin": true,
        "checkOnSnapshotUpdate": true,
        "checkOnBuildSave": false,
        "checkOnLoadoutSave": false
      },
      "limits": {
        "maxChecksPerHour": 5
      },
      "notifications": {
        "enabled": true,
        "showToast": true,
        "showModal": false
      }
    }
  }
}
```

---

## Migration Notes

If migrating from an older version of the achievement system:

1. **Labels changed?** Update `storage.issueLabel` to match your existing issues
2. **Check frequency:** Adjust `limits.maxChecksPerHour` based on your API rate limit headroom
3. **Category filters:** Use `categories` to disable incomplete achievement types
4. **Debug mode:** Enable `debug` options during initial rollout to catch issues

---

## Performance Considerations

- **Lower `maxChecksPerHour`** if you're hitting GitHub API rate limits
- **Disable `checkOnBuildSave`/`checkOnLoadoutSave`** if users save builds/loadouts frequently
- **Increase `stats.cacheMinutes`** to reduce GitHub API calls
- **Set `ui.showPercentages: false`** to skip loading statistics on profile page

---

## Security Considerations

- All achievement checking happens **server-side** - users cannot manipulate unlocks
- Rate limiting prevents abuse of the checking system
- Decider execution timeout prevents infinite loops or expensive operations
- User tokens are validated before any achievement operations
