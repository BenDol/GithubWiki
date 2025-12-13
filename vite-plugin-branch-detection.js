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
        const branch = execSync('git rev-parse --abbrev-ref HEAD', {
          encoding: 'utf-8',
          cwd: join(__dirname, '..'),
        }).trim();

        const runtimeBranch = {
          branch,
          source: 'build-time',
          detectedAt: new Date().toISOString(),
        };

        // Write to parent project's public directory
        const publicDir = join(__dirname, '..', 'public');
        const runtimeBranchPath = join(publicDir, 'runtime-branch.json');

        writeFileSync(runtimeBranchPath, JSON.stringify(runtimeBranch, null, 2));

        console.log(`\n[Branch Detection] Embedded branch at build time: ${branch}`);
        console.log(`[Branch Detection] Written to: ${runtimeBranchPath}\n`);
      } catch (error) {
        console.error('[Branch Detection] Failed to detect branch at build time:', error.message);
        console.error('[Branch Detection] Branch detection will fall back to config at runtime');
      }
    },
  };
}
