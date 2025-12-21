# Registry System Documentation

**Version**: 2.0-alpha
**Status**: Phase 1 Complete - New abstractions available
**Date**: 2025-12-21

---

## Overview

The wiki framework now provides a **generic registry system** that allows parent projects to define custom entity types, styles, and behaviors without modifying framework code. This document explains how to use the new registry system.

---

## Available Registries

### 1. Style Registry

**File**: `src/utils/styleRegistry.js`
**Purpose**: Register color schemes, CSS classes, and visual styles

#### API

```javascript
import { styleRegistry } from './wiki-framework/src/utils/styleRegistry.js';

// Register a category of styles
styleRegistry.registerCategory(categoryName, styles);

// Get a specific style
const style = styleRegistry.getStyles(category, key);

// Get all styles in a category
const allStyles = styleRegistry.getAllStyles(category);

// Check if category exists
const exists = styleRegistry.hasCategory(category);

// Get all categories
const categories = styleRegistry.getCategories();
```

#### Example: Registering Rarity Colors

```javascript
// In parent project's main.jsx or config file
import { styleRegistry } from './wiki-framework/src/utils/styleRegistry.js';

styleRegistry.registerCategory('skill-rarity', {
  Common: {
    background: 'bg-gray-500',
    border: 'border-gray-500',
    text: 'text-white',
    glow: 'shadow-[0_0_10px_rgba(107,114,128,0.5)]'
  },
  Great: {
    background: 'bg-green-500',
    border: 'border-green-500',
    text: 'text-white',
    glow: 'shadow-[0_0_10px_rgba(34,197,94,0.5)]'
  },
  Rare: {
    background: 'bg-blue-500',
    border: 'border-blue-500',
    text: 'text-white',
    glow: 'shadow-[0_0_10px_rgba(59,130,246,0.5)]'
  },
  Epic: {
    background: 'bg-purple-500',
    border: 'border-purple-500',
    text: 'text-white',
    glow: 'shadow-[0_0_10px_rgba(168,85,247,0.5)]'
  },
  Legendary: {
    background: 'bg-red-500',
    border: 'border-red-500',
    text: 'text-white',
    glow: 'shadow-[0_0_10px_rgba(220,38,38,0.5)]'
  },
  Mythic: {
    background: 'bg-yellow-500',
    border: 'border-yellow-500',
    text: 'text-black',
    glow: 'shadow-[0_0_10px_rgba(234,179,8,0.5)]'
  }
});
```

#### Example: Using Styles in Components

```javascript
import { styleRegistry } from './wiki-framework/src/utils/styleRegistry.js';

function SkillCard({ skill }) {
  const styles = styleRegistry.getStyles('skill-rarity', skill.rarity);

  if (!styles) {
    console.warn(`No styles found for rarity: ${skill.rarity}`);
    return null;
  }

  return (
    <div className={`${styles.background} ${styles.border} ${styles.glow}`}>
      <h3 className={styles.text}>{skill.name}</h3>
    </div>
  );
}
```

---

### 2. Entity Type Registry

**File**: `src/utils/entityTypeRegistry.js`
**Purpose**: Register custom entity types with their fields, validation, and storage configuration

#### API

```javascript
import { entityTypeRegistry } from './wiki-framework/src/utils/entityTypeRegistry.js';

// Register an entity type
entityTypeRegistry.registerType(typeName, config);

// Get entity type configuration
const config = entityTypeRegistry.getType(typeName);

// Get all entity types
const allTypes = entityTypeRegistry.getAllTypes();

// Check if type exists
const exists = entityTypeRegistry.hasType(typeName);

// Get type label
const label = entityTypeRegistry.getLabel(typeName, plural);

// Get type fields
const fields = entityTypeRegistry.getFields(typeName);
```

#### Entity Type Configuration

```typescript
{
  label: string;              // Singular display name (e.g., 'Skill Build')
  pluralLabel: string;        // Plural display name (e.g., 'Skill Builds')
  fields: string[];           // Array of field names
  validation?: Object;        // Validation schema (optional)
  storage?: string;           // Storage backend type (default: 'github-issues')
  icon?: string;              // Icon/emoji for UI display
  listLabel?: string;         // Path to label field for list views
  metadata?: Object;          // Additional metadata (optional)
}
```

#### Example: Registering Entity Types

```javascript
// In parent project's main.jsx or config file
import { entityTypeRegistry } from './wiki-framework/src/utils/entityTypeRegistry.js';

// Register a skill build entity
entityTypeRegistry.registerType('skill-build', {
  label: 'Skill Build',
  pluralLabel: 'Skill Builds',
  fields: ['name', 'description', 'slots', 'maxSlots', 'author', 'createdAt'],
  validation: validateSkillBuild, // Your validation function
  storage: 'github-issues',
  icon: '⚔️',
  listLabel: 'issue.title',
  metadata: {
    maxSlots: 12,
    allowedSkillTypes: ['attack', 'defense', 'support']
  }
});

// Register a battle loadout entity
entityTypeRegistry.registerType('battle-loadout', {
  label: 'Battle Loadout',
  pluralLabel: 'Battle Loadouts',
  fields: ['name', 'description', 'equipment', 'stats', 'author', 'createdAt'],
  validation: validateLoadout,
  storage: 'github-issues',
  icon: '🛡️',
  listLabel: 'issue.title',
  metadata: {
    equipmentSlots: ['weapon', 'armor', 'accessory']
  }
});
```

---

### 3. Entity Service

**File**: `src/services/github/entityService.js`
**Purpose**: Generic CRUD service that works with any registered entity type

#### API

```javascript
import { EntityService } from './wiki-framework/src/services/github/entityService.js';

// Create a service for a specific entity type
const service = new EntityService(entityType, options);

// CRUD operations
await service.create(data);
await service.read(id);
await service.update(id, data);
await service.delete(id);
await service.list(filter);
await service.search(query, options);
await service.count(filter);
await service.exists(id);

// Validation
const result = service.validate(data); // { valid: boolean, errors: string[] }

// Get configuration
const config = service.getConfig();
```

#### Example: Creating Entity Services

```javascript
// In parent project's services/
import { EntityService } from './wiki-framework/src/services/github/entityService.js';
import { entityTypeRegistry } from './wiki-framework/src/utils/entityTypeRegistry.js';

// Register the entity type first (usually in main.jsx)
entityTypeRegistry.registerType('skill-build', {
  label: 'Skill Build',
  pluralLabel: 'Skill Builds',
  fields: ['name', 'slots', 'maxSlots'],
  validation: (data) => {
    const errors = [];
    if (!data.name) errors.push('Name is required');
    if (!data.slots || !Array.isArray(data.slots)) errors.push('Slots must be an array');
    if (data.slots.length > data.maxSlots) errors.push('Too many slots');
    return { valid: errors.length === 0, errors };
  }
});

// Create the service
const skillBuildService = new EntityService('skill-build');

// Use the service
try {
  const newBuild = await skillBuildService.create({
    name: 'My Awesome Build',
    slots: [
      { id: 'skill-1', type: 'attack' },
      { id: 'skill-2', type: 'defense' }
    ],
    maxSlots: 12
  });
  console.log('Build created:', newBuild);
} catch (error) {
  console.error('Failed to create build:', error);
}
```

#### Extending EntityService

The `EntityService` provides a base class with validation and structure. For actual storage implementation (GitHub Issues, localStorage, etc.), you can extend it:

```javascript
import { EntityService } from './wiki-framework/src/services/github/entityService.js';

export class GitHubEntityService extends EntityService {
  constructor(entityType, octokit, repoConfig) {
    super(entityType, { octokit, config: repoConfig });
    this.octokit = octokit;
    this.repoConfig = repoConfig;
  }

  async create(data) {
    // Validate first
    const validation = this.validate(data);
    if (!validation.valid) {
      throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
    }

    // Create GitHub issue
    const response = await this.octokit.rest.issues.create({
      owner: this.repoConfig.owner,
      repo: this.repoConfig.repo,
      title: data.name,
      body: JSON.stringify(data),
      labels: [this.entityType]
    });

    return response.data;
  }

  async list(filter = {}) {
    const response = await this.octokit.rest.issues.listForRepo({
      owner: this.repoConfig.owner,
      repo: this.repoConfig.repo,
      labels: this.entityType,
      state: 'open'
    });

    return response.data;
  }

  // Implement other methods...
}
```

---

## Migration Guide

### Migrating from Hard-Coded Styles

**Before (Framework - rarityColors.js)**:
```javascript
import { SKILL_GRADE_COLORS } from './wiki-framework/src/utils/rarityColors.js';

const style = SKILL_GRADE_COLORS.Legendary.background;
```

**After (Parent Project)**:
```javascript
// 1. Register styles in main.jsx
import { styleRegistry } from './wiki-framework/src/utils/styleRegistry.js';

styleRegistry.registerCategory('skill-rarity', {
  Legendary: { background: 'bg-red-500', /* ... */ }
});

// 2. Use in components
import { styleRegistry } from './wiki-framework/src/utils/styleRegistry.js';

const style = styleRegistry.getStyles('skill-rarity', 'Legendary')?.background;
```

### Migrating from Game-Specific Services

**Before (Framework - skillBuilds.js)**:
```javascript
import { skillBuildsService } from './wiki-framework/src/services/github/skillBuilds.js';

await skillBuildsService.create({ name: 'My Build', /* ... */ });
```

**After (Parent Project)**:
```javascript
// 1. Register entity type in main.jsx
import { entityTypeRegistry } from './wiki-framework/src/utils/entityTypeRegistry.js';

entityTypeRegistry.registerType('skill-build', {
  label: 'Skill Build',
  pluralLabel: 'Skill Builds',
  fields: ['name', 'slots', 'maxSlots'],
  validation: validateSkillBuild
});

// 2. Create service
import { EntityService } from './wiki-framework/src/services/github/entityService.js';

const skillBuildService = new EntityService('skill-build');

// 3. Use service (extend it for actual storage implementation)
await skillBuildService.create({ name: 'My Build', /* ... */ });
```

---

## Best Practices

### 1. Register Early

Register all entity types and style categories in your `main.jsx` **before** rendering your app:

```javascript
// main.jsx
import { styleRegistry } from './wiki-framework/src/utils/styleRegistry.js';
import { entityTypeRegistry } from './wiki-framework/src/utils/entityTypeRegistry.js';

// Register everything first
styleRegistry.registerCategory('skill-rarity', { /* ... */ });
styleRegistry.registerCategory('item-quality', { /* ... */ });

entityTypeRegistry.registerType('skill-build', { /* ... */ });
entityTypeRegistry.registerType('battle-loadout', { /* ... */ });

// Then render app
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
```

### 2. Centralize Registrations

Create a dedicated config file for registrations:

```javascript
// src/config/registries.js
import { styleRegistry } from './wiki-framework/src/utils/styleRegistry.js';
import { entityTypeRegistry } from './wiki-framework/src/utils/entityTypeRegistry.js';

export function initializeRegistries() {
  // Style registrations
  styleRegistry.registerCategory('skill-rarity', {
    /* ... */
  });

  // Entity type registrations
  entityTypeRegistry.registerType('skill-build', {
    /* ... */
  });
}

// main.jsx
import { initializeRegistries } from './config/registries.js';

initializeRegistries();
ReactDOM.createRoot(document.getElementById('root')).render(<App />);
```

### 3. Validate Registration

Always check if a registry entry exists before using it:

```javascript
function SkillCard({ skill }) {
  const styles = styleRegistry.getStyles('skill-rarity', skill.rarity);

  if (!styles) {
    console.warn(`No styles registered for rarity: ${skill.rarity}`);
    return <div>Unknown rarity</div>;
  }

  return <div className={styles.background}>{skill.name}</div>;
}
```

### 4. Use TypeScript for Type Safety (Optional)

If using TypeScript, create type definitions:

```typescript
// types/registries.d.ts
export interface StyleConfig {
  background: string;
  border: string;
  text: string;
  glow: string;
}

export interface EntityTypeConfig {
  label: string;
  pluralLabel: string;
  fields: string[];
  validation?: (data: any) => { valid: boolean; errors: string[] };
  storage?: string;
  icon?: string;
  listLabel?: string;
  metadata?: Record<string, any>;
}
```

---

## Testing

### Testing Registry Usage

```javascript
import { describe, it, expect, beforeEach } from 'vitest';
import { styleRegistry } from './wiki-framework/src/utils/styleRegistry.js';

describe('Style Registry', () => {
  beforeEach(() => {
    styleRegistry.clear(); // Clear before each test
  });

  it('should register and retrieve styles', () => {
    styleRegistry.registerCategory('test-rarity', {
      Common: { background: 'bg-gray-500' }
    });

    const style = styleRegistry.getStyles('test-rarity', 'Common');
    expect(style.background).toBe('bg-gray-500');
  });

  it('should return null for non-existent styles', () => {
    const style = styleRegistry.getStyles('non-existent', 'Common');
    expect(style).toBeNull();
  });
});
```

---

## Troubleshooting

### Issue: "Entity type 'X' not registered"

**Cause**: Trying to create an `EntityService` before registering the entity type.

**Solution**: Register the entity type before creating the service:

```javascript
// Register FIRST
entityTypeRegistry.registerType('my-entity', config);

// Then create service
const service = new EntityService('my-entity');
```

### Issue: Styles returning null

**Cause**: Category or style key not registered.

**Solution**: Check that the category and key match exactly:

```javascript
// Register
styleRegistry.registerCategory('skill-rarity', { Common: { /* ... */ } });

// Use - make sure category and key match exactly
const style = styleRegistry.getStyles('skill-rarity', 'Common'); // ✅
const style = styleRegistry.getStyles('Skill-Rarity', 'common'); // ❌ Case mismatch
```

### Issue: Validation not working

**Cause**: Validation function not properly defined or returning wrong format.

**Solution**: Ensure validation returns `{ valid: boolean, errors: string[] }`:

```javascript
entityTypeRegistry.registerType('my-entity', {
  // ...
  validation: (data) => {
    const errors = [];
    if (!data.name) errors.push('Name required');
    return { valid: errors.length === 0, errors }; // ✅ Correct format
  }
});
```

---

## Status

### Phase 1: Complete ✅

- ✅ `styleRegistry.js` created
- ✅ `entityTypeRegistry.js` created
- ✅ `entityService.js` created
- ✅ Documentation complete

### Phase 2: Pending (Update Framework)

- [ ] Update existing framework components to support both old and new APIs
- [ ] Add deprecation warnings to old APIs
- [ ] Update framework documentation

### Phase 3: Pending (Migrate Parent)

- [ ] Create registration configs in parent project
- [ ] Update parent imports to use new registries
- [ ] Test thoroughly

### Phase 4: Pending (v2.0 Release)

- [ ] Remove deprecated code
- [ ] Publish framework v2.0

---

## See Also

- [REFACTORING_V2.md](./REFACTORING_V2.md) - Full refactoring plan
- [FRAMEWORK_CLEANUP_ANALYSIS.md](./.claude/memory/FRAMEWORK_CLEANUP_ANALYSIS.md) - Analysis of game-specific code
- [API Documentation](./API.md) - Framework API reference
