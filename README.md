# GitHub Wiki Framework

A powerful, customizable wiki framework built with React and powered by GitHub. Create beautiful documentation sites with markdown, GitHub authentication, and automatic deployment.

## Features

- 📝 **Markdown-Powered** - Write content in GitHub Flavored Markdown with frontmatter
- 🎨 **Modern UI** - Clean, responsive design with dark mode support
- 🔍 **Full-Text Search** - Fast client-side search powered by Fuse.js (Phase 2)
- 🔐 **GitHub Authentication** - Secure OAuth login with GitHub (Phase 3)
- ✏️ **Collaborative Editing** - Edit pages via pull requests (Phase 4)
- 📜 **Version History** - Track changes with Git commit history (Phase 3)
- 🚀 **Easy Deployment** - Deploy to GitHub Pages with GitHub Actions
- ⚙️ **Configuration-Driven** - Customize via JSON configuration
- 🌙 **Dark Mode** - Built-in dark mode with system preference detection
- 📱 **Responsive** - Works great on mobile, tablet, and desktop

## Quick Start

### Prerequisites

- Node.js 18+ and npm
- Git
- A GitHub account

### Installation

1. **Clone the repository**

```bash
git clone https://github.com/yourusername/wiki.git
cd wiki
```

2. **Install dependencies**

```bash
npm install
```

3. **Configure your wiki**

Edit `public/wiki-config.json` to customize your wiki:

```json
{
  "wiki": {
    "title": "My Wiki",
    "description": "My awesome documentation",
    "repository": {
      "owner": "yourusername",
      "repo": "wiki",
      "branch": "main"
    }
  },
  "sections": [
    {
      "id": "getting-started",
      "title": "Getting Started",
      "path": "getting-started",
      "showInHeader": true,
      "allowContributions": true,
      "order": 1
    }
  ]
}
```

4. **Start development server**

```bash
npm run dev
```

Visit `http://localhost:5173` to see your wiki!

## Project Structure

```
wiki/
├── .github/
│   └── workflows/
│       └── deploy.yml           # GitHub Actions deployment
├── public/
│   ├── wiki-config.json         # Wiki configuration
│   └── content/                 # Markdown content files
│       ├── getting-started/
│       ├── guides/
│       └── reference/
├── src/
│   ├── components/
│   │   ├── layout/              # Header, Sidebar, Footer, Layout
│   │   ├── wiki/                # PageViewer, PageEditor, etc.
│   │   ├── search/              # Search components
│   │   ├── auth/                # Authentication components
│   │   └── common/              # Reusable components
│   ├── hooks/                   # Custom React hooks
│   │   ├── useWikiConfig.js     # Configuration loader
│   │   ├── useAuth.js           # Authentication
│   │   └── useSearch.js         # Search functionality
│   ├── pages/                   # Route pages
│   │   ├── HomePage.jsx
│   │   ├── PageViewerPage.jsx
│   │   └── SectionPage.jsx
│   ├── services/                # External services
│   │   ├── github/              # GitHub API integration
│   │   ├── markdown/            # Markdown processing
│   │   └── search/              # Search indexing
│   ├── store/                   # State management (Zustand)
│   │   ├── authStore.js
│   │   ├── wikiStore.js
│   │   └── uiStore.js
│   ├── utils/                   # Utility functions
│   ├── App.jsx                  # Root component
│   └── main.jsx                 # Entry point
├── vite.config.js
├── tailwind.config.js
└── package.json
```

## Creating Content

### 1. Create a Markdown File

Create a new file in `public/content/{section}/`:

```
public/content/getting-started/my-page.md
```

### 2. Add Frontmatter

Every page needs YAML frontmatter:

```markdown
---
title: My Page
description: A brief description
tags: [tag1, tag2]
category: Documentation
date: 2025-12-12
---

# My Page

Your content here...
```

### 3. Access Your Page

Navigate to `/#/getting-started/my-page` to view your page.

### 4. Build Search Index

After creating or updating content, rebuild the search index:

```bash
npm run build:search
```

This creates a search index at `public/search-index.json` that powers the search functionality.

## Using Search & Navigation

### Full-Text Search

1. **Quick Search** - Press `Ctrl+K` (or `Cmd+K` on Mac) anywhere to open the search modal
2. **Search Page** - Visit `/search` for the full search experience with filters

### Features

- **Fuzzy Search** - Finds results even with typos
- **Tag Filtering** - Browse content by tags
- **Real-time Results** - See results as you type
- **Keyboard Navigation** - Use arrow keys and Enter to navigate results

### Table of Contents

Every page automatically generates a table of contents from markdown headings:

- **Active Section Highlighting** - The current section is highlighted as you scroll
- **Smooth Scrolling** - Click headings to jump to that section
- **Desktop Only** - TOC appears on the right side on large screens

### Breadcrumb Navigation

Every page shows a breadcrumb trail at the top showing:
`Home > Section > Page`

Click any breadcrumb to navigate back up the hierarchy.

## Configuration

### Wiki Configuration

Edit `public/wiki-config.json`:

```json
{
  "wiki": {
    "title": "Wiki Title",
    "description": "Wiki description",
    "logo": "/logo.svg",
    "repository": {
      "owner": "username",
      "repo": "repo-name",
      "branch": "main",
      "contentPath": "public/content"
    }
  },
  "sections": [...],
  "features": {
    "search": true,
    "tableOfContents": true,
    "pageHistory": true,
    "editPages": true,
    "darkMode": true,
    "tags": true
  },
  "theme": {
    "primaryColor": "#3b82f6"
  }
}
```

### Environment Variables

Create `.env.local`:

```env
VITE_GITHUB_CLIENT_ID=your_github_oauth_client_id
VITE_GITHUB_REDIRECT_URI=https://yourusername.github.io/wiki/auth/callback
VITE_WIKI_REPO_OWNER=yourusername
VITE_WIKI_REPO_NAME=wiki
```

## GitHub Authentication

The wiki uses **GitHub Device Flow** for secure authentication without requiring a client secret in the frontend. This is perfect for static sites hosted on GitHub Pages!

### Setup Instructions

1. **Create a GitHub OAuth App**
   - Go to GitHub Settings → Developer settings → OAuth Apps
   - Click "New OAuth App"
   - Fill in:
     - **Application name**: Your Wiki Name
     - **Homepage URL**: `https://yourusername.github.io/wiki`
     - **Authorization callback URL**: `https://yourusername.github.io/wiki` (not used by Device Flow, but required)
   - Click "Register application"
   - Copy your **Client ID**

2. **Configure Environment Variable**

   Add to `.env.local`:
   ```bash
   VITE_GITHUB_CLIENT_ID=your_client_id_here
   ```

3. **How It Works**
   - User clicks "Sign in with GitHub"
   - Wiki displays a code (e.g., `ABCD-1234`)
   - User opens GitHub in a new tab and enters the code
   - Once authorized, user is automatically signed in
   - Token is encrypted and stored in localStorage
   - Session persists across page reloads

### Features When Signed In

- **View Page History**: See all commits for any page with author, date, and message
- **User Profile**: Your GitHub avatar and profile in the top right
- **Edit Pages**: Make changes and submit pull requests directly from the browser
- **Contribution Tracking**: All your edits are tracked and attributed to you

### Security

- No client secret needed (Device Flow)
- Tokens encrypted before localStorage
- Automatic token validation on load
- Secure API requests through Octokit

## Editing Pages

The wiki supports collaborative editing through GitHub pull requests! Here's how it works:

### How to Edit

1. **Sign in with GitHub** (see authentication section above)
2. **Navigate to any page** in a section that allows contributions
3. **Click the "✏️ Edit" button** at the top of the page
4. **Make your changes** in the markdown editor
5. **Preview in real-time** to see how it looks
6. **Add an edit summary** (optional but recommended)
7. **Click "Save Changes"** to create a pull request

### What Happens

- A new branch is created automatically (e.g., `wiki-edit/section/page-timestamp`)
- Your changes are committed to this branch
- A pull request is created with your changes
- Maintainers review and merge your PR
- Once merged, your changes appear on the wiki

### Editor Features

- **CodeMirror 6**: Professional-grade markdown editor
- **Live Preview**: See your changes in real-time
- **Syntax Highlighting**: Markdown syntax highlighting
- **Dark Mode**: Editor respects your theme preference
- **Split View**: Edit and preview side-by-side
- **Character Count**: Track content length
- **Edit Summary**: Add context for reviewers

### Permissions

- Editing is controlled per section via `allowContributions` in `wiki-config.json`
- Only authenticated users can edit
- All edits require review via pull requests
- No direct commits to main branch

### Conflict Detection

- Wiki checks if the page changed since you started editing
- If conflicts detected, you'll be warned
- You can choose to overwrite or cancel
- Helps prevent accidental overwrites

## Deployment

This wiki includes a complete GitHub Actions workflow for automatic deployment to GitHub Pages.

### Quick Deployment

1. **Configure your repository settings** in `vite.config.js` and `public/wiki-config.json`
2. **Set up GitHub OAuth** and add your Client ID to GitHub Secrets
3. **Enable GitHub Pages** in repository settings (Source: GitHub Actions)
4. **Push to GitHub** - deployment happens automatically!

### Detailed Instructions

See **[DEPLOYMENT.md](./DEPLOYMENT.md)** for complete step-by-step deployment instructions, including:

- Configuring repository settings
- Setting up GitHub OAuth for authentication
- Enabling GitHub Pages
- Troubleshooting common issues
- Custom domain setup
- Performance optimization

The wiki will be automatically deployed on every push to the `main` branch via the included GitHub Actions workflow.

## Development

### Available Commands

```bash
# Start development server
npm run dev

# Build for production
npm run build

# Preview production build
npm run preview

# Build search index
npm run build:search

# Lint code
npm run lint
```

### Tech Stack

- **Framework**: React 18
- **Build Tool**: Vite 5
- **Styling**: Tailwind CSS 3
- **Routing**: React Router v6 (hash-based)
- **State Management**: Zustand
- **Markdown**: react-markdown with remark/rehype plugins
- **Code Editor**: CodeMirror 6
- **Search**: Fuse.js
- **GitHub API**: Octokit.js

## Implementation Phases

### ✅ Phase 1: Foundation (Complete)
- Project setup and configuration
- Basic layout and navigation
- Markdown rendering with syntax highlighting
- Dark mode support

### ✅ Phase 2: Navigation & Search (Complete)
- Full-text search with Fuse.js
- Table of contents generation with active section highlighting
- Tag filtering and browsing
- Breadcrumb navigation
- Keyboard shortcuts (Ctrl+K for search)
- Search page with filters

### ✅ Phase 3: GitHub Integration (Complete)
- GitHub OAuth Device Flow authentication (no client secret needed!)
- User profile with avatar dropdown menu
- Page commit history from Git
- GitHub API integration with Octokit
- Rate limiting and error handling
- Secure token storage with encryption

### ✅ Phase 4: Editing (Complete)
- CodeMirror 6 markdown editor with syntax highlighting
- Live preview pane with real-time rendering
- Automatic branch creation for each edit
- Pull request generation with details
- Edit permissions checking per section
- Conflict detection and warnings
- Edit summary support

### ✅ Phase 5: Deployment & Polish (Complete)
- GitHub Actions workflow for automatic deployment
- Code splitting and bundle optimization
- Error boundaries for graceful error handling
- Toast notification system for user feedback
- Enhanced 404 page with navigation
- Comprehensive deployment documentation
- Performance optimization with lazy loading

### 📅 Phase 6: Framework Reusability (Future)
- Template repository
- CLI tool for project creation
- Plugin architecture

## Customization

### Adding a New Section

1. Edit `public/wiki-config.json`:

```json
{
  "sections": [
    {
      "id": "my-section",
      "title": "My Section",
      "path": "my-section",
      "showInHeader": true,
      "allowContributions": true,
      "order": 4
    }
  ]
}
```

2. Create content directory:

```bash
mkdir public/content/my-section
```

3. Add an index page:

```bash
echo "# My Section" > public/content/my-section/index.md
```

### Customizing Theme

Edit `tailwind.config.js` to customize colors, fonts, and more.

## Contributing

Contributions are welcome! Please feel free to submit a Pull Request.

1. Fork the repository
2. Create your feature branch (`git checkout -b feature/amazing-feature`)
3. Commit your changes (`git commit -m 'Add some amazing feature'`)
4. Push to the branch (`git push origin feature/amazing-feature`)
5. Open a Pull Request

## License

MIT License - feel free to use this project for your own wikis!

## Acknowledgments

- Built with [React](https://react.dev/)
- Styled with [Tailwind CSS](https://tailwindcss.com/)
- Markdown powered by [react-markdown](https://github.com/remarkjs/react-markdown)
- Search by [Fuse.js](https://fusejs.io/)
- Hosted on [GitHub Pages](https://pages.github.com/)

## Support

- 📖 [Documentation](https://yourusername.github.io/wiki)
- 🐛 [Report a Bug](https://github.com/yourusername/wiki/issues)
- 💡 [Request a Feature](https://github.com/yourusername/wiki/issues)
- 💬 [Discussions](https://github.com/yourusername/wiki/discussions)

---

**Made with ❤️ using GitHub Wiki Framework**
