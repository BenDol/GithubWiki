import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * Vite plugin to create a logging endpoint
 * Allows the app to write logs to logs/debug.log
 */
export function loggerPlugin() {
  const logsDir = path.join(__dirname, 'logs');
  const logFile = path.join(logsDir, 'debug.log');

  // Ensure logs directory exists
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Initialize log file
  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, '=== Wiki Debug Log ===\n\n', 'utf-8');
  }

  return {
    name: 'wiki-logger',
    configureServer(server) {
      server.middlewares.use('/api/log', async (req, res) => {
        if (req.method === 'POST') {
          let body = '';

          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', () => {
            try {
              const logData = JSON.parse(body);
              const timestamp = new Date().toISOString();
              const logEntry = `[${timestamp}] [${logData.type.toUpperCase()}] ${logData.message}\n`;

              let logLine = logEntry;

              if (logData.data) {
                logLine += `Data: ${JSON.stringify(logData.data, null, 2)}\n`;
              }

              if (logData.stack) {
                logLine += `Stack: ${logData.stack}\n`;
              }

              logLine += '\n---\n\n';

              // Append to log file
              fs.appendFileSync(logFile, logLine, 'utf-8');

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ success: true }));
            } catch (error) {
              console.error('Error writing log:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: 'Failed to write log' }));
            }
          });
        } else if (req.method === 'DELETE') {
          // Clear log file
          fs.writeFileSync(logFile, '=== Wiki Debug Log (Cleared) ===\n\n', 'utf-8');
          res.writeHead(200, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ success: true }));
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      });

      // Endpoint to check if logging is available
      server.middlewares.use('/api/log/status', (req, res) => {
        res.writeHead(200, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({
          available: true,
          logFile: logFile
        }));
      });
    },
  };
}
