/**
 * Vite plugin to proxy GitHub OAuth requests
 * This bypasses CORS issues by proxying through the dev server
 */
export function githubProxyPlugin() {
  return {
    name: 'github-proxy',
    configureServer(server) {
      // Proxy for device code request
      server.middlewares.use('/api/github/device-code', async (req, res) => {
        if (req.method === 'POST') {
          let body = '';

          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const data = JSON.parse(body);

              console.log('[GitHub Proxy] Requesting device code for client:', data.client_id);

              const response = await fetch('https://github.com/login/device/code', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                },
                body: JSON.stringify({
                  client_id: data.client_id,
                  scope: data.scope,
                }),
              });

              const responseData = await response.json();

              console.log('[GitHub Proxy] Device code response:', {
                user_code: responseData.user_code,
                device_code: responseData.device_code?.substring(0, 10) + '...',
              });

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(responseData));
            } catch (error) {
              console.error('[GitHub Proxy] Device code error:', error);
              res.writeHead(500, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify({ error: error.message }));
            }
          });
        } else {
          res.writeHead(405, { 'Content-Type': 'application/json' });
          res.end(JSON.stringify({ error: 'Method not allowed' }));
        }
      });

      // Proxy for token polling
      server.middlewares.use('/api/github/access-token', async (req, res) => {
        if (req.method === 'POST') {
          let body = '';

          req.on('data', (chunk) => {
            body += chunk.toString();
          });

          req.on('end', async () => {
            try {
              const data = JSON.parse(body);

              const response = await fetch('https://github.com/login/oauth/access_token', {
                method: 'POST',
                headers: {
                  'Content-Type': 'application/json',
                  'Accept': 'application/json',
                },
                body: JSON.stringify({
                  client_id: data.client_id,
                  device_code: data.device_code,
                  grant_type: data.grant_type,
                }),
              });

              const responseData = await response.json();

              // Don't log the actual token
              if (responseData.access_token) {
                console.log('[GitHub Proxy] Access token received successfully');
              } else if (responseData.error) {
                console.log('[GitHub Proxy] Token polling:', responseData.error);
              }

              res.writeHead(200, { 'Content-Type': 'application/json' });
              res.end(JSON.stringify(responseData));
            } catch (error) {
              console.error('[GitHub Proxy] Access token error:', error);
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
