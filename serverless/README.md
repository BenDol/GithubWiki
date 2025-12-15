# Serverless Functions

This directory contains serverless function implementations for various cloud providers. The wiki framework provides these functions as core integrations that can be deployed to your preferred serverless platform.

## Directory Structure

```
serverless/
├── netlify/          # Netlify Functions
│   └── functions/    # Function implementations
├── vercel/           # Vercel Functions (future)
├── aws-lambda/       # AWS Lambda (future)
└── README.md         # This file
```

## Supported Platforms

### Netlify (Current)

**Location**: `serverless/netlify/functions/`

**Functions Provided**:
- `access-token.js` - GitHub OAuth access token proxy (CORS bypass)
- `device-code.js` - GitHub Device Flow proxy (CORS bypass)
- `create-comment-issue.js` - Create comment issues with bot token
- `create-admin-issue.js` - Create admin/ban list issues with bot token
- `update-admin-issue.js` - Update admin/ban list issues with bot token

**Required Environment Variables**:
- `WIKI_BOT_TOKEN` - GitHub Personal Access Token for bot operations

**Security Features**:
- Server-side permission validation for admin actions
- Bot token never exposed to client
- User authentication verification

### Future Platforms

The architecture is designed to support multiple serverless platforms:
- **Vercel** - Edge Functions / Serverless Functions
- **AWS Lambda** - Lambda Functions with API Gateway
- **Cloudflare Workers** - Edge Workers
- **Azure Functions** - Serverless functions

## Parent Project Setup

Parent wiki projects should reference these functions rather than duplicating them. See platform-specific setup instructions below.

### Netlify Setup

**Option 1: Symlinks (Recommended for development)**

From your parent project root:
```bash
# Remove old functions directory if it exists
rm -rf netlify/functions

# Create symlink to framework functions
ln -s wiki-framework/serverless/netlify/functions netlify/functions
```

**Option 2: Build Script (Recommended for deployment)**

Add to your `package.json`:
```json
{
  "scripts": {
    "setup:functions": "cp -r wiki-framework/serverless/netlify/functions netlify/"
  }
}
```

Then run before deployment:
```bash
npm run setup:functions
```

**Option 3: Netlify Configuration**

In `netlify.toml`:
```toml
[build]
  functions = "wiki-framework/serverless/netlify/functions"
```

## Adding New Functions

When adding new serverless functions:

1. **Add to framework** (if it's core wiki functionality):
   - Create function in appropriate platform directory
   - Document in this README
   - Add any required environment variables to documentation

2. **Add to parent project** (if it's project-specific):
   - Keep custom functions in parent `netlify/functions/` (or equivalent)
   - Netlify will merge both directories

## Function Architecture

All functions follow these principles:

1. **Security-first**: Server-side validation, no client-side trust
2. **Platform-agnostic core**: Business logic separated from platform code
3. **Minimal dependencies**: Keep functions lightweight
4. **Error handling**: Comprehensive error responses
5. **CORS support**: Proper headers for client-side calls

## Development vs Production

**Development Mode**:
- Framework's `botService.js` can use direct API calls with `VITE_WIKI_BOT_TOKEN`
- Faster iteration without running serverless functions locally

**Production Mode**:
- Always uses serverless functions
- Bot tokens never exposed to client
- Full security validation

## Migration Guide

If you have existing Netlify functions in your parent project:

1. **Identify which are framework-core**: Admin, comments, OAuth functions
2. **Remove from parent project**: Delete these files
3. **Set up linking**: Use one of the setup options above
4. **Keep custom functions**: Any project-specific functions stay in parent

## Security Notes

⚠️ **Important**:
- Never commit bot tokens or secrets to the repository
- Always use environment variables for sensitive data
- Server-side functions are the **only** place bot tokens should exist
- All admin operations must validate permissions server-side

## Support

For issues or questions about serverless functions:
- Check framework documentation
- Review function comments for specific implementation details
- See `CLAUDE.md` for development guidelines
