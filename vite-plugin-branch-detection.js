import { execSync } from 'child_process';
import { writeFileSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));

/**
 * Vite plugin for detecting git branch at runtime and build time
 *
 * Development: Provides /api/git-branch endpoint
 * Production: Embeds branch in public/runtime-branch.json at build time
 */
export function branchDetectionPlugin() {
  return {
    name: 'branch-detection',

    /**
     * Configure dev server with /api/git-branch endpoint
     */
    configureServer(server) {
      server.middlewares.use('/api/git-branch', async (req, res) => {
        try {
          const branch = execSync('git rev-parse --abbrev-ref HEAD', {
            encoding: 'utf-8',
            cwd: join(__dirname, '..'),
          }).trim();

          console.log(`[Branch Detection] Dev server detected: ${branch}`);

          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 200;
          res.end(JSON.stringify({
            branch,
            source: 'dev-server',
            timestamp: new Date().toISOString()
          }));
        } catch (error) {
          console.error('[Branch Detection] Failed to detect branch:', error.message);
          res.setHeader('Content-Type', 'application/json');
          res.statusCode = 500;
          res.end(JSON.stringify({
            error: 'Failed to detect branch',
            message: error.message
          }));
        }
      });
    },

    /**
     * Build hook: Embed branch at build time
     */
    buildStart() {
      try {
        let branch = null;
        let source = 'build-time';

        // Try Netlify environment variables first (works in detached HEAD state)
        if (process.env.BRANCH) {
          branch = process.env.BRANCH;
          source = 'netlify-env';
          console.log(`[Branch Detection] Detected from Netlify env (BRANCH): ${branch}`);
        } else if (process.env.HEAD) {
          branch = process.env.HEAD;
          source = 'netlify-env';
          console.log(`[Branch Detection] Detected from Netlify env (HEAD): ${branch}`);
        }

        // Fall back to git command if env vars not available
        if (!branch) {
          branch = execSync('git rev-parse --abbrev-ref HEAD', {
            encoding: 'utf-8',
            cwd: join(__dirname, '..'),
          }).trim();

          // If git returns "HEAD" (detached state), try to get the actual branch
          if (branch === 'HEAD') {
            try {
              // Try to get branch from git symbolic-ref (suppress errors via Node.js)
              branch = execSync('git symbolic-ref --short HEAD', {
                encoding: 'utf-8',
                cwd: join(__dirname, '..'),
                stdio: ['pipe', 'pipe', 'ignore'], // Ignore stderr (cross-platform)
              }).trim();
            } catch (e) {
              // Fallback to rev-parse if symbolic-ref fails
              try {
                branch = execSync('git rev-parse --abbrev-ref HEAD', {
                  encoding: 'utf-8',
                  cwd: join(__dirname, '..'),
                  stdio: ['pipe', 'pipe', 'ignore'], // Ignore stderr (cross-platform)
                }).trim();
              } catch (e2) {
                // Still HEAD, use a default
                console.warn('[Branch Detection] Git in detached HEAD state, defaulting to "main"');
                branch = 'main';
                source = 'default-fallback';
              }
            }
          }
        }

        const runtimeBranch = {
          branch,
          source,
          detectedAt: new Date().toISOString(),
        };

        // Write to parent project's public directory
        const publicDir = join(__dirname, '..', 'public');
        const runtimeBranchPath = join(publicDir, 'runtime-branch.json');

        writeFileSync(runtimeBranchPath, JSON.stringify(runtimeBranch, null, 2));

        console.log(`\n[Branch Detection] Embedded branch at build time: ${branch} (source: ${source})`);
        console.log(`[Branch Detection] Written to: ${runtimeBranchPath}\n`);
      } catch (error) {
        console.error('[Branch Detection] Failed to detect branch at build time:', error.message);
        console.error('[Branch Detection] Branch detection will fall back to config at runtime');
      }
    },
  };
}
