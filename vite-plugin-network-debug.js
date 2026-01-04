/**
 * Vite plugin to provide network debug save API endpoint
 * Handles file system operations for saving network debug data (dev only)
 */
import { promises as fs } from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function networkDebugPlugin() {
  return {
    name: 'network-debug-api',
    configureServer(server) {
      // POST /api/debug/save-network-data
      server.middlewares.use('/api/debug/save-network-data', async (req, res) => {
        if (req.method === 'POST') {
          let body = '';

          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const { sessionData, sessionId, date } = JSON.parse(body);

              // Validate required fields
              if (!sessionData || !sessionId || !date) {
                res.writeHead(400, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  error: 'Missing required fields: sessionData, sessionId, date'
                }));
                return;
              }

              // Get version from config (assumes wiki-config.json is in parent directory)
              const configPath = path.resolve(__dirname, '../wiki-config.json');
              let version = 'unknown';
              try {
                const configContent = await fs.readFile(configPath, 'utf8');
                const config = JSON.parse(configContent);
                version = config?.version?.commit || 'unknown';
              } catch (error) {
                console.warn('[NetworkDebug] Could not read version from config:', error.message);
              }

              // Generate file path: debug/network/<version>/<date>-<sessionId>.json
              const relativeDir = `debug/network/${version}`;
              const fileName = `${date}-${sessionId}.json`;
              const projectRoot = path.resolve(__dirname, '..');
              const absoluteDir = path.join(projectRoot, relativeDir);
              const absolutePath = path.join(absoluteDir, fileName);
              const relativePath = path.join(relativeDir, fileName);

              console.log('[NetworkDebug] Saving network debug data to local disk', {
                relativePath,
                absolutePath,
                sessionId,
                dataSize: JSON.stringify(sessionData).length
              });

              try {
                // Ensure directory exists (create if needed)
                await fs.mkdir(absoluteDir, { recursive: true });

                // Prepare file content
                const content = JSON.stringify(sessionData, null, 2);

                // Write file to disk
                await fs.writeFile(absolutePath, content, 'utf8');

                console.log('[NetworkDebug] Network debug data saved successfully', {
                  relativePath,
                  absolutePath
                });

                res.writeHead(200, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  success: true,
                  filePath: relativePath,
                  absolutePath
                }));

              } catch (error) {
                console.error('[NetworkDebug] Failed to save network debug data to disk', {
                  error: error.message,
                  relativePath,
                  absolutePath
                });

                res.writeHead(500, { 'Content-Type': 'application/json' });
                res.end(JSON.stringify({
                  error: 'Failed to save to disk',
                  message: error.message
                }));
              }

            } catch (error) {
              console.error('[NetworkDebug] Error processing save network data request', {
                error: error.message,
                stack: error.stack
              });

              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                error: 'Internal server error',
                message: error.message
              }));
            }
          });
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      });
    }
  };
}
