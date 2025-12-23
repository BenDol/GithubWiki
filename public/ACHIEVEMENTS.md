# Framework Achievement Definitions

This directory contains a sample achievement configuration for the GitHub Wiki Framework.

## Files

- **`achievements.sample.json`** - Complete reference with all 40+ framework-provided achievements

## Achievement Categories

### Contribution (21 achievements)
Track user edits, pull requests, lines added, and files changed:
- First edit, PR, and merge
- PR milestones: 10, 50, 100, 500
- Merge milestones: 10, 50, 100
- Lines added: 100, 1K, 10K, 100K
- Files edited: 10, 100, 500
- Anonymous contributions

### Milestone (10 achievements)
Track login patterns and account age:
- First login
- Account age (veteran: 1+ year)
- Early adopter (join within first month)
- Login streaks: 7 days, 30 days
- Total contribution days: 100, 365
- Time-based: weekend warrior, night owl

### Social (10 achievements)
Track community engagement:
- Comments on others' PRs: 1, 10, 50
- Reviews: 10, 50
- Reactions received: 10, 100
- Discussion starter
- Community builder, Mentor, Ambassador

## Usage in Parent Project

### 1. Copy to Parent Project

```bash
cp wiki-framework/public/achievements.sample.json public/achievements.json
```

### 2. Customize Categories & Rarities

Edit `public/achievements.json` to add game-specific categories:

```json
{
  "categories": {
    "contribution": { ... },
    "social": { ... },
    "milestone": { ... },
    "game": {
      "label": "Game Progress",
      "icon": "🎮",
      "color": "purple"
    }
  }
}
```

### 3. Add Custom Achievements

Add game-specific achievements to the `achievements` array:

```json
{
  "id": "first-build",
  "title": "First Build",
  "description": "Save your first skill build",
  "icon": "⚔️",
  "category": "game",
  "rarity": "common",
  "deciderId": "first-build",
  "hidden": false,
  "points": 10
}
```

### 4. Create Custom Deciders

Create `src/services/achievements/deciders/gameProgress.js`:

```javascript
export async function firstBuild(userData, context) {
  const { octokit, owner, repo, userId } = context;

  const { data: issues } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    labels: `skill-builds,user-id:${userId}`,
    state: 'open',
  });

  return issues.length > 0;
}
```

### 5. Export Custom Deciders

Update `src/services/achievements/deciders/index.js`:

```javascript
import * as gameProgress from './gameProgress.js';

export const customDeciders = {
  'first-build': gameProgress.firstBuild,
  // ... more custom deciders
};
```

## Decider API

All deciders receive two parameters:

### userData
```javascript
{
  user: {           // GitHub user object
    login: string,
    id: number,
    avatar_url: string,
    created_at: string,
    // ... more GitHub fields
  },
  stats: {          // Pre-calculated statistics
    totalPRs: number,
    mergedPRs: number,
    openPRs: number,
    closedPRs: number,
    totalAdditions: number,
    totalDeletions: number,
    totalFiles: number,
  },
  pullRequests: [], // Array of PR objects
  userId: number,   // User ID
  username: string  // Username
}
```

### context
```javascript
{
  octokit: Octokit,    // Authenticated bot instance (5000/hr limit)
  owner: string,       // Repository owner
  repo: string,        // Repository name
  userId: number,      // User ID (same as userData.userId)
  username: string,    // Username (same as userData.username)
  releaseDate: Date    // Wiki release date (for filtering pre-launch data)
}
```

## Configuration

Configure achievements in `public/wiki-config.json`:

```json
{
  "features": {
    "achievements": {
      "enabled": true,
      "definitionsPath": "/achievements.json",
      "categories": {
        "contribution": { "enabled": true },
        "social": { "enabled": true },
        "milestone": { "enabled": true },
        "game": { "enabled": true }
      },
      "ui": {
        "showHiddenAchievements": false
      },
      "storage": {
        "issueLabel": "achievements",
        "statsLabel": "achievement-stats"
      },
      "stats": {
        "enabled": true,
        "cacheMinutes": 60
      },
      "checking": {
        "checkOnLogin": true,
        "checkOnBuildSave": true,
        "checkOnLoadoutSave": true,
        "checkOnSnapshotUpdate": true
      },
      "limits": {
        "maxChecksPerHour": 10
      }
    }
  }
}
```

## Best Practices

1. **Start with framework achievements** - Copy the sample file and build from there
2. **Use consistent categories** - Keep categories organized (contribution, social, milestone, game)
3. **Balance difficulty** - Mix common, rare, epic, and legendary achievements
4. **Meaningful icons** - Use emojis that clearly represent the achievement
5. **Clear descriptions** - Make it obvious what the user needs to do
6. **Test deciders thoroughly** - Achievements should unlock reliably
7. **Consider progression** - Create achievement chains (novice → expert → master)

## Framework Deciders

All framework deciders are automatically available. Located in:
- `wiki-framework/src/services/achievements/deciders/contribution.js`
- `wiki-framework/src/services/achievements/deciders/milestone.js`
- `wiki-framework/src/services/achievements/deciders/social.js`

Parent projects can override any framework decider by using the same achievement ID in their custom deciders.

## Automatic Merging

The bot service automatically merges deciders:
1. Loads framework default deciders
2. Loads custom deciders from parent project
3. Merges with custom deciders overriding defaults

No manual registration needed - just export from `src/services/achievements/deciders/index.js`!

## Example: Complete Custom Achievement

**1. Add to `public/achievements.json`:**
```json
{
  "id": "spirit-collector",
  "title": "Spirit Collector",
  "description": "Collect 10 unique spirits",
  "icon": "👻",
  "category": "game",
  "rarity": "rare",
  "deciderId": "spirit-collector",
  "hidden": false,
  "points": 25
}
```

**2. Create decider in `src/services/achievements/deciders/gameProgress.js`:**
```javascript
export async function spiritCollector(userData, context) {
  const { octokit, owner, repo, userId } = context;

  const { data: issues } = await octokit.rest.issues.listForRepo({
    owner,
    repo,
    labels: `my-spirits,user-id:${userId}`,
    state: 'open',
    per_page: 100,
  });

  const spirits = [];
  for (const issue of issues) {
    try {
      const data = JSON.parse(issue.body);
      if (Array.isArray(data)) {
        spirits.push(...data);
      }
    } catch (error) {
      console.error('Failed to parse spirits:', error);
    }
  }

  // Count unique spirit IDs
  const uniqueSpirits = new Set();
  for (const spirit of spirits) {
    if (spirit.spiritId) {
      uniqueSpirits.add(spirit.spiritId);
    }
  }

  return uniqueSpirits.size >= 10;
}
```

**3. Export in `src/services/achievements/deciders/index.js`:**
```javascript
import * as gameProgress from './gameProgress.js';

export const customDeciders = {
  'spirit-collector': gameProgress.spiritCollector,
};
```

**Done!** The achievement will automatically work once deployed.
