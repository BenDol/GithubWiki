# Framework Achievement Deciders

This directory contains **default achievement deciders** provided by the wiki framework.

These deciders work for any wiki project and handle common achievements like:
- **Contributions** - Pull requests, lines of code, merges
- **Milestones** - First login, account age

## Architecture

Deciders are organized by category:

```
deciders/
├── index.js          # Registry of all default deciders
├── contribution.js   # PR and contribution achievements
├── milestone.js      # Time-based and account achievements
└── README.md         # This file
```

## Available Default Deciders

### Contribution Achievements
- `first-pr` - User created their first pull request
- `pr-novice` - User created 10+ pull requests
- `pr-expert` - User created 50+ pull requests
- `pr-master` - User created 100+ pull requests
- `first-merge` - User had their first PR merged
- `lines-apprentice` - User added 100+ lines of code
- `lines-journeyman` - User added 1,000+ lines of code
- `lines-master` - User added 10,000+ lines of code

### Milestone Achievements
- `first-login` - User logged in for the first time
- `veteran` - User's GitHub account is 1+ year old

## Extending with Custom Deciders

Parent projects can:
1. **Add new deciders** - Create custom achievement deciders in their project
2. **Override defaults** - Define a custom decider with the same ID to override

See the parent project's `src/services/achievements/deciders/README.md` for details on adding custom deciders.

## Decider Function Signature

All deciders follow this signature:

```javascript
/**
 * @param {Object} userData - User data from snapshot (already filtered by releaseDate)
 * @param {Object} context - Server context { octokit, owner, repo, userId, username, releaseDate }
 * @returns {Promise<boolean>} - True if achievement should be unlocked
 */
async function deciderName(userData, context) {
  // Check conditions
  return true; // or false
}
```

**Important:** `userData.pullRequests` and `userData.stats` are automatically filtered by `context.releaseDate` (from `VITE_RELEASE_DATE` environment variable) server-side. You don't need to filter PRs again, but you should respect the release date for any additional data you fetch (builds, loadouts, etc.).

See `.claude/release-date-filtering.md` for complete documentation on the release date system.

## Adding Framework Deciders

To add a new default decider:

1. **Add to appropriate file** (e.g., `contribution.js`):
```javascript
export async function myNewDecider(userData, context) {
  return userData.stats?.totalPRs > 5;
}
```

2. **Register in `index.js`**:
```javascript
import * as contribution from './contribution.js';

export const defaultDeciders = {
  // ... existing deciders
  'my-new-achievement': contribution.myNewDecider,
};
```

3. **Document in this README**
4. **Add achievement definition** to example `achievements.json`

## Design Principles

Framework deciders should:
- ✅ Work for **any** wiki project
- ✅ Use **only** GitHub user data (PRs, account info, etc.)
- ✅ Be **deterministic** - Same input = same output
- ✅ Handle errors gracefully
- ❌ **NOT** access game-specific data (builds, loadouts, etc.)
- ❌ **NOT** make assumptions about parent project structure
