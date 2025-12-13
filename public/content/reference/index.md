---
title: Reference
description: Technical reference documentation for GitHub Wiki Framework
tags: [reference, api, documentation]
category: Documentation
date: 2025-12-12
---

# Reference Documentation

Complete technical reference for the GitHub Wiki Framework.

## Configuration Reference

### wiki-config.json

The main configuration file that controls your wiki's behavior and appearance.

```json
{
  "wiki": {
    "title": "string",
    "description": "string",
    "logo": "string | null",
    "baseUrl": "string",
    "repository": {
      "owner": "string",
      "repo": "string",
      "branch": "string",
      "contentPath": "string"
    }
  },
  "sections": "Array<Section>",
  "features": "Object",
  "theme": "Object"
}
```

### Section Configuration

Each section in your wiki has the following properties:

| Property | Type | Description |
|----------|------|-------------|
| `id` | string | Unique identifier for the section |
| `title` | string | Display name in navigation |
| `path` | string | URL path for the section |
| `icon` | string | Icon identifier (optional) |
| `showInHeader` | boolean | Show in header navigation |
| `allowContributions` | boolean | Allow editing pages in this section |
| `order` | number | Sort order in navigation |

### Feature Flags

Control which features are enabled:

```json
{
  "features": {
    "search": true,
    "tableOfContents": true,
    "pageHistory": true,
    "editPages": true,
    "darkMode": true,
    "tags": true
  }
}
```

## Frontmatter Reference

All wiki pages use YAML frontmatter for metadata:

```yaml
---
title: Page Title
description: Brief description
tags: [tag1, tag2]
category: Category Name
author: Author Name
date: YYYY-MM-DD
---
```

### Frontmatter Fields

| Field | Required | Type | Description |
|-------|----------|------|-------------|
| `title` | Yes | string | Page title |
| `description` | No | string | Brief description for search |
| `tags` | No | array | Tags for categorization |
| `category` | No | string | Category name |
| `author` | No | string | Author name |
| `date` | No | date | Publication date (YYYY-MM-DD) |

## Markdown Support

The wiki supports GitHub Flavored Markdown (GFM) with additional features:

### Basic Syntax

- **Headings**: `# H1`, `## H2`, `### H3`, etc.
- **Bold**: `**bold text**`
- **Italic**: `*italic text*`
- **Strikethrough**: `~~strikethrough~~`
- **Links**: `[text](url)`
- **Images**: `![alt](url)`
- **Code**: `` `inline code` ``
- **Lists**: Numbered (`1.`) and bullet (`-`)

### Code Blocks

Code blocks support syntax highlighting for 180+ languages:

````markdown
```javascript
function example() {
  return "Hello!";
}
```
````

### Tables

Create tables with pipes and hyphens:

```markdown
| Column 1 | Column 2 |
|----------|----------|
| Data 1   | Data 2   |
```

### Task Lists

- [x] Completed task
- [ ] Incomplete task

### Blockquotes

> This is a blockquote
> It can span multiple lines

## API Reference

### Hooks

#### `useWikiConfig()`

Access the wiki configuration.

```javascript
const { config, loading, error } = useWikiConfig();
```

#### `useHeaderSections()`

Get sections that should appear in the header.

```javascript
const sections = useHeaderSections();
```

#### `useSection(sectionId)`

Get a specific section by ID.

```javascript
const section = useSection('getting-started');
```

#### `useFeature(featureName)`

Check if a feature is enabled.

```javascript
const isSearchEnabled = useFeature('search');
```

### Stores

#### `useAuthStore`

Manage authentication state.

```javascript
const { user, isAuthenticated, login, logout } = useAuthStore();
```

#### `useWikiStore`

Manage wiki content state.

```javascript
const { currentPage, pageContent, setPageContent } = useWikiStore();
```

#### `useUIStore`

Manage UI state.

```javascript
const { darkMode, sidebarOpen, toggleDarkMode, toggleSidebar } = useUIStore();
```

## File Structure

```
wiki/
├── public/
│   ├── wiki-config.json
│   └── content/
│       ├── section1/
│       │   ├── index.md
│       │   └── page1.md
│       └── section2/
│           └── index.md
├── src/
│   ├── components/
│   ├── hooks/
│   ├── pages/
│   ├── services/
│   ├── store/
│   └── utils/
└── package.json
```

## Environment Variables

Required environment variables:

| Variable | Description | Example |
|----------|-------------|---------|
| `VITE_GITHUB_CLIENT_ID` | GitHub OAuth Client ID | `abc123...` |
| `VITE_GITHUB_REDIRECT_URI` | OAuth callback URL | `https://...` |
| `VITE_WIKI_REPO_OWNER` | Repository owner | `username` |
| `VITE_WIKI_REPO_NAME` | Repository name | `wiki` |

---

*For more detailed information, check the individual guide pages or explore the source code on GitHub.*
