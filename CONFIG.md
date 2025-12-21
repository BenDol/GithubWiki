# Framework Configuration

## Overview

This directory contains a minimal `wiki-config.json` used **exclusively for framework tests**. This configuration is NOT used in production.

## Purpose

The framework tests need a valid wiki configuration to test adapters and utilities. This config provides:
- Minimal valid structure for ConfigAdapter tests
- Test-specific repository references (`test-owner/test-repo`)
- Storage configuration for GitHub backend testing
- Generic wiki metadata (no game-specific content)

## Production Configuration

**The actual production configuration lives in the parent project**: `../wiki-config.json`

Parent projects using this framework as a dependency will have their own `wiki-config.json` at the root level, which is what the framework loads at runtime.

## Configuration Flow

### Development (Parent Project)
```
wiki/                           # Parent project
├── wiki-config.json           # ← Production config (loaded at runtime)
└── wiki-framework/            # Framework submodule
    ├── wiki-config.json       # ← Framework test config (tests only)
    └── serverless/shared/adapters/
        └── ConfigAdapter.js   # Loads from process.cwd() = parent's config
```

### Framework Tests
```
wiki-framework/                # Framework directory
├── wiki-config.json          # ← Test config (loaded by tests)
├── vitest.config.js          # Sets root: __dirname
└── tests/
    └── serverless/adapters/
        └── ConfigAdapter.test.js  # Tests use framework's config
```

## Key Differences: Framework vs Parent Config

### Framework Config (this file)
- **Purpose**: Testing only
- **Repository**: `test-owner/test-repo` (fake)
- **Sections**: 2 minimal sections (getting-started, guides)
- **Features**: Basic features only
- **Storage**: Test GitHub backend
- **Title**: "Framework Test Wiki"

### Parent Config (`../wiki-config.json`)
- **Purpose**: Production
- **Repository**: Real repository (e.g., `BenDol/SlayerLegendWiki`)
- **Sections**: Full section tree with categories
- **Features**: Full feature set (buildSharing, calculators, etc.)
- **Storage**: Production GitHub + Cloudflare KV config
- **Title**: Project-specific (e.g., "Slayer Legend Wiki")

## How ConfigAdapter Works

### On Netlify (Runtime)
```javascript
const adapter = new ConfigAdapter('netlify');
adapter.getWikiConfig();
// Loads from: process.cwd() + '/wiki-config.json'
// Result: Parent project's wiki-config.json
```

### On Cloudflare (Runtime)
```javascript
const adapter = new ConfigAdapter('cloudflare');
adapter.getWikiConfig();
// Returns: Embedded default config with runtime env overrides
// Parent project can embed config at build time
```

### In Framework Tests
```javascript
const adapter = new ConfigAdapter('netlify');
adapter.getWikiConfig();
// Loads from: wiki-framework/wiki-config.json
// Result: This test config
```

## Required Fields

The framework tests require these minimum fields:

```json
{
  "wiki": {
    "title": "string",
    "repository": {
      "owner": "string",
      "repo": "string"
    }
  },
  "sections": [],
  "storage": {
    "backend": "github",
    "version": "v1",
    "github": {
      "owner": "string",
      "repo": "string"
    }
  }
}
```

## DO NOT

- ❌ Add game-specific or project-specific content to this config
- ❌ Reference production repositories
- ❌ Use this config in production code
- ❌ Copy parent project sections/features here
- ❌ Modify this config for parent project needs

## DO

- ✅ Keep this config minimal and generic
- ✅ Use test-specific values (`test-owner/test-repo`)
- ✅ Maintain only fields required for framework tests
- ✅ Update this config if framework adds required fields
- ✅ Document any changes to required structure

## Testing

To verify the config is working:

```bash
cd wiki-framework
npm test
```

All adapter tests should pass using this test configuration.

## See Also

- Parent project config: `../wiki-config.json`
- ConfigAdapter implementation: `./serverless/shared/adapters/ConfigAdapter.js`
- ConfigAdapter tests: `./tests/serverless/adapters/ConfigAdapter.test.js`
