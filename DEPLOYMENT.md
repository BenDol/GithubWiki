# Deployment Guide

This guide will walk you through deploying your wiki to GitHub Pages with automatic deployment via GitHub Actions.

## Prerequisites

- A GitHub account
- Your wiki repository on GitHub
- Node.js 18+ installed locally (for testing)

## Step 1: Configure Repository Settings

### 1.1 Update vite.config.js

Open `vite.config.js` and update the `base` path to match your repository name:

```javascript
export default defineConfig({
  // ... other config
  base: '/your-repo-name/', // Replace with your actual repo name
});
```

**Example**: If your repository is `https://github.com/username/my-wiki`, use `/my-wiki/`

### 1.2 Update wiki-config.json

Open `public/wiki-config.json` and update the repository information:

```json
{
  "wiki": {
    "title": "Your Wiki Title",
    "description": "Your wiki description",
    "repository": {
      "owner": "your-github-username",
      "repo": "your-repo-name",
      "branch": "main",
      "contentPath": "public/content"
    }
  }
}
```

## Step 2: Set Up GitHub OAuth (Required for Editing Features)

### 2.1 Create GitHub OAuth App

1. Go to [GitHub Developer Settings](https://github.com/settings/developers)
2. Click **"OAuth Apps"** → **"New OAuth App"**
3. Fill in the application details:
   - **Application name**: `Your Wiki Name`
   - **Homepage URL**: `https://your-username.github.io/your-repo-name/`
   - **Authorization callback URL**: `https://your-username.github.io/your-repo-name/`
     - (Note: Device Flow doesn't actually use this, but GitHub requires it)
4. Click **"Register application"**
5. Copy your **Client ID**

### 2.2 Add Client ID to GitHub Secrets

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Secrets and variables** → **Actions**
3. Click **"New repository secret"**
4. Name: `GITHUB_CLIENT_ID`
5. Value: Paste your Client ID from step 2.1
6. Click **"Add secret"**

### 2.3 Create .env.local for Local Development

For local development, create a `.env.local` file in your project root:

```bash
cp .env.example .env.local
```

Edit `.env.local` and add your Client ID:

```env
VITE_GITHUB_CLIENT_ID=your_actual_client_id
VITE_WIKI_REPO_OWNER=your-username
VITE_WIKI_REPO_NAME=your-repo-name
```

**Important**: `.env.local` is gitignored and will not be committed.

## Step 3: Enable GitHub Pages

### 3.1 Configure GitHub Pages Source

1. Go to your repository on GitHub
2. Navigate to **Settings** → **Pages**
3. Under **"Source"**, select **"GitHub Actions"**
4. Click **"Save"**

That's it! GitHub will now use the Actions workflow to deploy your site.

## Step 4: Deploy Your Wiki

### 4.1 Initial Deployment

Simply push your code to the `main` branch:

```bash
git add .
git commit -m "Initial wiki deployment"
git push origin main
```

### 4.2 Monitor Deployment

1. Go to the **Actions** tab in your repository
2. You should see a workflow run called "Deploy to GitHub Pages"
3. Click on it to view progress
4. Wait for the workflow to complete (usually 2-3 minutes)

### 4.3 Access Your Wiki

Once deployment is complete, your wiki will be available at:

```
https://your-username.github.io/your-repo-name/
```

## Step 5: Verify Everything Works

### 5.1 Test Basic Functionality

- ✅ Homepage loads correctly
- ✅ Navigation between sections works
- ✅ Pages render markdown properly
- ✅ Search functionality works (press `Ctrl+K`)
- ✅ Dark mode toggle works
- ✅ Table of contents appears on pages

### 5.2 Test Authentication Features

1. Click **"Sign in with GitHub"** in the top right
2. Follow the device authorization flow
3. After signing in, verify:
   - ✅ Your profile picture appears in the top right
   - ✅ "Edit" buttons appear on pages (if contributions are allowed)
   - ✅ "History" button shows commit history

### 5.3 Test Editing Workflow

1. Navigate to any page in a section with `allowContributions: true`
2. Click **"Edit"**
3. Make a change and add an edit summary
4. Click **"Save Changes"**
5. Verify a pull request was created successfully
6. Check that the PR appears in your repository

## Continuous Deployment

Your wiki is now set up for continuous deployment! Every time you push to the `main` branch:

1. GitHub Actions automatically runs
2. Search index is rebuilt
3. Site is compiled and optimized
4. New version is deployed to GitHub Pages

This means when you (or contributors) merge pull requests that modify content, the wiki automatically updates within minutes.

## Troubleshooting

### Build Fails in GitHub Actions

**Check the workflow logs:**
1. Go to **Actions** tab
2. Click the failed workflow run
3. Expand the step that failed to see error details

**Common issues:**
- Missing `GITHUB_CLIENT_ID` secret → Go back to Step 2.2
- Wrong `base` path in `vite.config.js` → Go back to Step 1.1
- Invalid `wiki-config.json` → Check JSON syntax

### OAuth Login Not Working

**Verify Client ID is set correctly:**
1. Check GitHub Actions secrets (Step 2.2)
2. Ensure OAuth App callback URL matches your deployed URL
3. Clear browser cache and try again

**Check browser console for errors:**
- Press F12 → Console tab
- Look for authentication-related errors

### Pages Not Rendering

**Check file paths:**
- Markdown files should be in `public/content/{section}/{page}.md`
- Verify `wiki-config.json` section paths match directory names

**Rebuild search index:**
```bash
npm run build:search
git add public/search-index.json
git commit -m "Update search index"
git push
```

### Images Not Loading

**Use absolute paths from the public directory:**

```markdown
![Image](/content/images/my-image.png)
```

Not:
```markdown
![Image](./my-image.png)  ❌
```

### Custom Domain (Optional)

To use a custom domain like `wiki.yourdomain.com`:

1. Add a `CNAME` file to the `public/` directory:
   ```
   wiki.yourdomain.com
   ```

2. Configure DNS with your domain provider:
   - Add a CNAME record pointing to `your-username.github.io`

3. Go to repository **Settings** → **Pages**
4. Enter your custom domain
5. Enable **"Enforce HTTPS"** (wait for certificate)

6. Update `vite.config.js`:
   ```javascript
   base: '/', // Use root path for custom domain
   ```

## Performance Optimization

### Optimize Images

Use compressed images for faster loading:

```bash
# Using ImageMagick
magick convert input.png -quality 85 -resize 1200x output.jpg
```

### Reduce Bundle Size

The build is already optimized with:
- Code splitting (separate chunks for React, markdown, editor, etc.)
- Lazy loading of page components
- Tree shaking of unused code

You can analyze bundle size:

```bash
npm run build
# Check dist/ folder sizes
```

### CDN Caching

GitHub Pages automatically caches static assets via CDN. No additional configuration needed.

## Updating Your Wiki

### Adding New Content

1. Create new markdown files in `public/content/{section}/`
2. Add proper frontmatter (title, description, tags, etc.)
3. Rebuild search index: `npm run build:search`
4. Commit and push changes

### Adding New Sections

1. Add directory: `mkdir public/content/new-section`
2. Update `public/wiki-config.json`:
   ```json
   {
     "sections": [
       {
         "id": "new-section",
         "title": "New Section",
         "path": "new-section",
         "showInHeader": true,
         "allowContributions": true,
         "order": 4
       }
     ]
   }
   ```
3. Add index page: `public/content/new-section/index.md`
4. Commit and push

### Accepting Contributions

When contributors submit pull requests:

1. Review changes in the PR
2. Check the "Files changed" tab
3. Test locally if needed:
   ```bash
   gh pr checkout <pr-number>
   npm run dev
   ```
4. Merge the PR
5. Wiki automatically redeploys with changes

## Backup and Version Control

### Your Wiki is Already Backed Up!

- **Content**: Stored in Git repository (full history)
- **Versions**: Every change is a Git commit
- **Backups**: GitHub stores everything
- **Recovery**: Revert to any previous version anytime

### Export Your Wiki

To create a backup archive:

```bash
git archive --format=zip --output=wiki-backup.zip HEAD
```

## Next Steps

- 📝 Add more content pages
- 🎨 Customize theme in `tailwind.config.js`
- 🔧 Configure features in `wiki-config.json`
- 👥 Invite contributors to submit improvements
- 📊 Monitor analytics (add Google Analytics if desired)
- 🌐 Set up custom domain (optional)

## Additional Resources

- [GitHub Pages Documentation](https://docs.github.com/en/pages)
- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [Vite Documentation](https://vitejs.dev/)
- [Markdown Guide](https://www.markdownguide.org/)

---

**Need Help?** Open an issue in your repository or check the main wiki framework documentation.
