# Modular Architecture Guide

This document explains how to use the GitHub Wiki Framework as a reusable submodule across multiple wiki projects.

## Architecture Overview

The framework is designed to be used as a **git submodule** in parent wiki projects. This allows you to:

- ✅ Maintain one framework codebase
- ✅ Create unlimited wiki projects
- ✅ Update all wikis by updating the framework
- ✅ Keep content and configuration separate from framework code

## Project Structure

### Framework Repository (This Repo)

```
wiki-framework/                    # This repository
├── src/                           # React components
│   ├── components/
│   ├── pages/
│   ├── services/
│   ├── hooks/
│   └── store/
├── scripts/                       # Build scripts
│   ├── buildSearchIndex.js
│   └── create-wiki.js            # Script to create new wikis
├── example-parent-wiki/           # Template for new wikis
├── vite.config.base.js           # Base Vite config to extend
├── framework.config.js            # Framework configuration
├── vite-plugin-*.js              # Vite plugins
├── package.json                   # Framework dependencies
└── README.md                      # Framework documentation
```

### Parent Wiki Project

```
my-game-wiki/                      # Your wiki project
├── wiki-framework/                # This repo as submodule
├── content/                       # YOUR content (not in framework!)
│   ├── getting-started/
│   ├── guides/
│   └── reference/
├── public/                        # YOUR static assets
│   └── logo.svg
├── wiki-config.json              # YOUR configuration
├── package.json                   # Extends framework dependencies
├── vite.config.js                # Extends framework config
├── index.html                     # Entry HTML
├── main.jsx                       # Entry JS (imports framework)
└── .env.local                     # YOUR environment variables
```

## Creating a New Wiki

### Method 1: Using the Setup Script (Recommended)

```bash
# From the framework repository
node scripts/create-wiki.js my-awesome-wiki

# Follow the prompts
cd my-awesome-wiki
npm install
npm run dev
```

### Method 2: Manual Setup

1. **Create new project directory**

```bash
mkdir my-awesome-wiki
cd my-awesome-wiki
git init
```

2. **Add framework as submodule**

```bash
git submodule add <framework-repo-url> wiki-framework
```

3. **Copy template files**

```bash
cp wiki-framework/example-parent-wiki/* .
```

4. **Install dependencies**

```bash
npm install
```

5. **Configure your wiki**

Edit `wiki-config.json`:

```json
{
  "wiki": {
    "title": "My Awesome Wiki",
    "repository": {
      "owner": "yourusername",
      "repo": "my-awesome-wiki"
    }
  }
}
```

6. **Start development**

```bash
npm run dev
```

## How It Works

### Configuration Extension

Your wiki's `vite.config.js` extends the framework's base configuration:

```javascript
// my-wiki/vite.config.js
import { createWikiConfigSync } from './wiki-framework/vite.config.base.js';
import { loggerPlugin } from './wiki-framework/vite-plugin-logger.js';
import { githubProxyPlugin } from './wiki-framework/vite-plugin-github-proxy.js';

export default createWikiConfigSync({
  base: '/my-wiki/',              // Your base URL
  contentPath: './content',       // Your content location
  plugins: [                      // Your additional plugins
    loggerPlugin(),
    githubProxyPlugin(),
  ],
});
```

### Entry Point

Your `main.jsx` imports the framework's App component:

```javascript
// my-wiki/main.jsx
import App from './wiki-framework/src/App.jsx';
import './wiki-framework/src/styles/index.css';

ReactDOM.createRoot(document.getElementById('root')).render(
  <ErrorBoundary>
    <App />
  </ErrorBoundary>
);
```

### Content Loading

The framework looks for content in the parent project's `content/` directory (configurable in `vite.config.js`).

### Configuration Loading

The framework loads `wiki-config.json` from the parent project's root.

## Updating the Framework

When you want to update the framework in your wikis:

```bash
cd my-wiki/wiki-framework
git pull origin main
cd ..
git add wiki-framework
git commit -m "Update wiki framework to latest version"
git push
```

All your wikis can be updated independently by pulling the latest framework.

## Best Practices

### 1. Don't Edit Framework Files

Never edit files inside `wiki-framework/`. All customizations should be in your parent project.

```
✅ DO:
my-wiki/content/           # Your content
my-wiki/wiki-config.json   # Your config
my-wiki/vite.config.js     # Your overrides

❌ DON'T:
my-wiki/wiki-framework/src/  # Framework code
```

### 2. Version Control Strategy

**Framework Repository:**
- Contains only framework code
- No wiki-specific content
- Tagged releases for stability

**Your Wiki Repositories:**
- Pin framework to specific commit/tag for stability
- Track your content and configuration
- Independent deployment

### 3. Pinning Framework Versions

For production wikis, pin the framework to a specific version:

```bash
cd wiki-framework
git checkout v1.0.0  # Or specific commit hash
cd ..
git add wiki-framework
git commit -m "Pin framework to v1.0.0"
```

### 4. Testing Framework Updates

Before updating production wikis:

1. Create a test wiki
2. Update framework to latest
3. Test all features
4. If stable, update production wikis

## Multiple Wiki Workflow

### Example: Managing 3 Wikis

```
frameworks/
└── wiki-framework/           # Shared framework (this repo)

wikis/
├── game-wiki/
│   └── wiki-framework/       # Submodule → frameworks/wiki-framework
├── project-wiki/
│   └── wiki-framework/       # Submodule → frameworks/wiki-framework
└── docs-wiki/
    └── wiki-framework/       # Submodule → frameworks/wiki-framework
```

**Update all wikis:**

```bash
# Update framework once
cd frameworks/wiki-framework
git pull origin main
git push

# Update each wiki
for wiki in game-wiki project-wiki docs-wiki; do
  cd wikis/$wiki/wiki-framework
  git pull
  cd ../..
  git add wiki-framework
  git commit -m "Update framework"
  git push
done
```

## Customization

### Custom Components

Add custom components in your parent project:

```
my-wiki/
├── components/
│   └── CustomComponent.jsx
└── main.jsx  # Import and use custom component
```

### Custom Styles

Override framework styles in your parent project:

```javascript
// my-wiki/main.jsx
import './wiki-framework/src/styles/index.css';
import './custom-styles.css';  // Your overrides
```

### Custom Plugins

Add Vite plugins in your `vite.config.js`:

```javascript
import customPlugin from './my-plugin.js';

export default createWikiConfigSync({
  plugins: [customPlugin()],
});
```

## Deployment

Each wiki deploys independently to its own GitHub Pages:

- `game-wiki` → `yourusername.github.io/game-wiki/`
- `project-wiki` → `yourusername.github.io/project-wiki/`
- `docs-wiki` → `yourusername.github.io/docs-wiki/`

See [DEPLOYMENT.md](./DEPLOYMENT.md) for deployment instructions.

## Troubleshooting

### Submodule Not Initialized

```bash
git submodule update --init --recursive
```

### Framework Changes Not Applied

```bash
cd wiki-framework
git pull
cd ..
npm run dev  # Restart dev server
```

### Build Errors After Framework Update

```bash
# Clear node_modules and reinstall
rm -rf node_modules package-lock.json
npm install
```

### Conflicts During Framework Update

```bash
cd wiki-framework
git fetch origin
git reset --hard origin/main  # WARNING: Discards local changes
cd ..
git add wiki-framework
```

## Migration Guide

### Converting Existing Wiki to Use Framework as Submodule

If you have an existing wiki built with the framework:

1. **Backup your content and config**

```bash
cp -r public/content ../content-backup
cp public/wiki-config.json ../wiki-config-backup.json
```

2. **Remove framework code**

```bash
rm -rf src/ scripts/ vite.config.js package.json
```

3. **Add framework as submodule**

```bash
git submodule add <framework-repo-url> wiki-framework
```

4. **Copy template files**

```bash
cp wiki-framework/example-parent-wiki/* .
```

5. **Restore your content and config**

```bash
mkdir content
cp -r ../content-backup/* content/
cp ../wiki-config-backup.json wiki-config.json
```

6. **Update and test**

```bash
npm install
npm run dev
```

## Support

- [Framework README](./README.md)
- [Deployment Guide](./DEPLOYMENT.md)
- [Report Issues](https://github.com/yourusername/wiki-framework/issues)
