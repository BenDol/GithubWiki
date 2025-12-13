/**
 * Vite plugin to provide image database management API endpoints
 * Handles file system operations for managing wiki images
 */
import { imageDbHandlers } from './src/api/imageDatabase.js';

export function imageDbPlugin() {
  return {
    name: 'image-db-api',
    configureServer(server) {
      // GET /api/image-db/scan-orphans
      server.middlewares.use('/api/image-db/scan-orphans', async (req, res) => {
        if (req.method === 'GET') {
          await imageDbHandlers.scanOrphans(req, res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      });

      // POST /api/image-db/remove-orphans
      server.middlewares.use('/api/image-db/remove-orphans', async (req, res) => {
        if (req.method === 'POST') {
          let body = '';

          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              req.body = JSON.parse(body);
              await imageDbHandlers.removeOrphans(req, res);
            } catch (error) {
              console.error('[Image DB] Remove orphans error:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      });

      // POST /api/image-db/move-images
      server.middlewares.use('/api/image-db/move-images', async (req, res) => {
        if (req.method === 'POST') {
          let body = '';

          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              req.body = JSON.parse(body);
              await imageDbHandlers.moveImages(req, res);
            } catch (error) {
              console.error('[Image DB] Move images error:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      });

      // POST /api/image-db/delete-images
      server.middlewares.use('/api/image-db/delete-images', async (req, res) => {
        if (req.method === 'POST') {
          let body = '';

          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              req.body = JSON.parse(body);
              await imageDbHandlers.deleteImages(req, res);
            } catch (error) {
              console.error('[Image DB] Delete images error:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      });

      // GET /api/image-db/stats
      server.middlewares.use('/api/image-db/stats', async (req, res) => {
        if (req.method === 'GET') {
          await imageDbHandlers.getStats(req, res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      });

      // GET /api/image-db/list-directories
      server.middlewares.use('/api/image-db/list-directories', async (req, res) => {
        if (req.method === 'GET') {
          await imageDbHandlers.listDirectories(req, res);
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      });

      // POST /api/image-db/lower-quality
      server.middlewares.use('/api/image-db/lower-quality', async (req, res) => {
        if (req.method === 'POST') {
          let body = '';

          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              req.body = JSON.parse(body);
              await imageDbHandlers.lowerQuality(req, res);
            } catch (error) {
              console.error('[Image DB] Lower quality error:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      });
    },
  };
}
