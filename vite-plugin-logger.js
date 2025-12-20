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
  const MAX_LOG_SIZE = 500 * 1024; // 500KB max log file size

  // Ensure logs directory exists
  if (!fs.existsSync(logsDir)) {
    fs.mkdirSync(logsDir, { recursive: true });
  }

  // Initialize log file
  if (!fs.existsSync(logFile)) {
    fs.writeFileSync(logFile, '=== Wiki Debug Log ===\n\n', 'utf-8');
  }

  /**
   * Rotate log file if it exceeds max size
   * Keeps only the most recent 50% of the log
   */
  const rotateLogIfNeeded = () => {
    try {
      const stats = fs.statSync(logFile);
      if (stats.size > MAX_LOG_SIZE) {
        const content = fs.readFileSync(logFile, 'utf-8');
        const lines = content.split('\n');
        // Keep the last 50% of lines
        const keepLines = Math.floor(lines.length / 2);
        const newContent = '=== Wiki Debug Log (Rotated) ===\n\n' + lines.slice(-keepLines).join('\n');
        fs.writeFileSync(logFile, newContent, 'utf-8');
      }
    } catch (error) {
      console.error('Error rotating log file:', error);
    }
  };

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
              const payload = JSON.parse(body);

              // Rotate log if needed before appending
              rotateLogIfNeeded();

              // Handle batch format (new) or single log (backward compatibility)
              const logs = payload.logs ? payload.logs : [payload];
              let allLogLines = '';

              // Process each log entry
              for (const logData of logs) {
                const timestamp = logData.timestamp || new Date().toISOString();
                const logEntry = `[${timestamp}] [${logData.type.toUpperCase()}] ${logData.message}\n`;

                let logLine = logEntry;

                if (logData.data) {
                  logLine += `Data: ${JSON.stringify(logData.data, null, 2)}\n`;
                }

                if (logData.stack) {
                  logLine += `Stack: ${logData.stack}\n`;
                }

                logLine += '\n---\n\n';
                allLogLines += logLine;
              }

              // Append all logs to file in one operation
              fs.appendFileSync(logFile, allLogLines, 'utf-8');

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({
                success: true,
                logsWritten: logs.length
              }));
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
