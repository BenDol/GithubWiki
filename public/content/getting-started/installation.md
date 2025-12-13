---
title: Installation Guide
description: Step-by-step guide to set up your GitHub Wiki Framework
tags: [installation, setup, npm]
category: Getting Started
author: Wiki Team
date: 2025-12-12
---

# Installation Guide

This guide will walk you through setting up the GitHub Wiki Framework on your local machine.

## Prerequisites

Before you begin, ensure you have the following installed:

- **Node.js** (version 18 or higher)
- **npm** or **yarn** package manager
- **Git** for version control
- A **GitHub account** for authentication and hosting

## Installation Steps

### 1. Clone the Repository

```bash
git clone https://github.com/yourusername/wiki.git
cd wiki
```

### 2. Install Dependencies

Using npm:

```bash
npm install
```

Or using yarn:

```bash
yarn install
```

### 3. Configure Environment Variables

Create a `.env.local` file in the root directory:

```bash
cp .env.example .env.local
```

Edit `.env.local` with your configuration:

```env
VITE_GITHUB_CLIENT_ID=your_github_oauth_app_client_id
VITE_GITHUB_REDIRECT_URI=http://localhost:5173/auth/callback
VITE_WIKI_REPO_OWNER=yourusername
VITE_WIKI_REPO_NAME=wiki
```

### 4. Set Up GitHub OAuth

1. Go to GitHub Settings → Developer settings → OAuth Apps
2. Click "New OAuth App"
3. Fill in the details:
   - **Application name**: Your Wiki Name
   - **Homepage URL**: `http://localhost:5173`
   - **Authorization callback URL**: `http://localhost:5173/auth/callback`
4. Copy the **Client ID** to your `.env.local` file

### 5. Start Development Server

```bash
npm run dev
```

Your wiki should now be running at `http://localhost:5173`!

## Verify Installation

To verify everything is working correctly:

1. Open `http://localhost:5173` in your browser
2. You should see the wiki homepage
3. Navigate through the sections in the sidebar
4. Toggle dark mode to test theme switching

## Troubleshooting

### Port Already in Use

If port 5173 is already in use, Vite will automatically try the next available port. Check the terminal output for the actual URL.

### Module Not Found Errors

Try removing `node_modules` and reinstalling:

```bash
rm -rf node_modules
npm install
```

### GitHub OAuth Issues

Make sure your OAuth App callback URL exactly matches the one in your `.env.local` file, including the protocol (http/https).

## Next Steps

Now that you have the wiki running locally, you can:

- [Customize the configuration](../reference/configuration)
- [Create your first page](../guides/creating-pages)
- [Learn about deployment](../guides/deployment)

## Development Commands

| Command | Description |
|---------|-------------|
| `npm run dev` | Start development server |
| `npm run build` | Build for production |
| `npm run preview` | Preview production build |
| `npm run lint` | Run ESLint |

---

*Need help? Check out the [troubleshooting guide](../guides/troubleshooting) or open an issue on GitHub.*
