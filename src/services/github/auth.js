/**
 * GitHub OAuth authentication service
 * Uses Device Flow for secure authentication without client secret
 */

const GITHUB_CLIENT_ID = import.meta.env.VITE_GITHUB_CLIENT_ID;

// Use proxy endpoints in development to avoid CORS issues
const DEVICE_CODE_URL = import.meta.env.DEV
  ? '/api/github/device-code'
  : 'https://github.com/login/device/code';

const TOKEN_URL = import.meta.env.DEV
  ? '/api/github/access-token'
  : 'https://github.com/login/oauth/access_token';

const USER_URL = 'https://api.github.com/user';

// Debug: Log environment variables
console.log('GitHub Auth Configuration:', {
  VITE_GITHUB_CLIENT_ID: import.meta.env.VITE_GITHUB_CLIENT_ID,
  DEV_MODE: import.meta.env.DEV,
  USING_PROXY: import.meta.env.DEV ? 'YES (via /api/github/*)' : 'NO (direct to GitHub)',
  DEVICE_CODE_URL,
  TOKEN_URL,
});

/**
 * Test GitHub connectivity
 */
const testGitHubConnectivity = async () => {
  try {
    console.log('Testing GitHub connectivity...');
    const response = await fetch('https://api.github.com/zen', { method: 'GET' });
    const text = await response.text();
    console.log('GitHub connectivity test SUCCESS:', text);
    return true;
  } catch (error) {
    console.error('GitHub connectivity test FAILED:', error);
    return false;
  }
};

/**
 * Start GitHub Device Flow authentication
 * Returns device code and user verification URL
 */
export const initiateDeviceFlow = async () => {
  console.log('Attempting to initiate device flow with Client ID:', GITHUB_CLIENT_ID);

  if (!GITHUB_CLIENT_ID) {
    console.error('GITHUB_CLIENT_ID is undefined or empty!');
    console.error('All env vars:', import.meta.env);
    throw new Error('GitHub Client ID not configured. Please set VITE_GITHUB_CLIENT_ID in .env.local');
  }

  // Test connectivity first
  await testGitHubConnectivity();

  let response;
  try {
    response = await fetch(DEVICE_CODE_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify({
        client_id: GITHUB_CLIENT_ID,
        // Use public_repo instead of repo for more limited access
        // This only grants access to public repositories (not private ones)
        // Removed 'workflow' scope for security - fork may be slightly out of date
        scope: 'public_repo read:user user:email',
      }),
    });
  } catch (fetchError) {
    console.error('Fetch error details:', fetchError);
    console.error('Error name:', fetchError.name);
    console.error('Error message:', fetchError.message);
    throw new Error(
      `Network error: Unable to connect to GitHub. This could be due to:\n` +
      `1. CORS blocking (browser security)\n` +
      `2. Network connectivity issues\n` +
      `3. Ad blocker or security extension\n` +
      `4. Firewall blocking GitHub API\n\n` +
      `Original error: ${fetchError.message}`
    );
  }

  if (!response.ok) {
    const errorText = await response.text();
    console.error('GitHub API Error:', errorText);
    throw new Error(`Failed to initiate device flow: ${response.status} ${response.statusText}`);
  }

  const data = await response.json();

  // Log the response for debugging
  console.log('Device flow initiated:', {
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
  });

  return {
    deviceCode: data.device_code,
    userCode: data.user_code,
    verificationUri: data.verification_uri,
    expiresIn: data.expires_in,
    interval: data.interval,
  };
};

/**
 * Poll for access token
 * Continuously checks if user has authorized the device
 */
export const pollForToken = async (deviceCode, interval = 5) => {
  const response = await fetch(TOKEN_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Accept': 'application/json',
    },
    body: JSON.stringify({
      client_id: GITHUB_CLIENT_ID,
      device_code: deviceCode,
      grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
    }),
  });

  const data = await response.json();

  // Handle different response states
  if (data.error) {
    if (data.error === 'authorization_pending') {
      // User hasn't authorized yet, caller should retry
      return { pending: true };
    } else if (data.error === 'slow_down') {
      // Need to slow down polling
      return { pending: true, slowDown: true };
    } else if (data.error === 'expired_token') {
      throw new Error('Device code expired. Please try again.');
    } else if (data.error === 'access_denied') {
      throw new Error('Access denied by user.');
    } else {
      throw new Error(data.error_description || 'Authentication failed');
    }
  }

  // Successfully got token
  return {
    accessToken: data.access_token,
    tokenType: data.token_type,
    scope: data.scope,
  };
};

/**
 * Wait for user to authorize and get token
 * Polls GitHub until user completes authorization
 */
export const waitForAuthorization = async (deviceCode, expiresIn, interval = 5) => {
  const startTime = Date.now();
  const expiresAt = startTime + expiresIn * 1000;
  let pollInterval = interval * 1000;

  while (Date.now() < expiresAt) {
    await new Promise(resolve => setTimeout(resolve, pollInterval));

    try {
      const result = await pollForToken(deviceCode, interval);

      if (result.pending) {
        // If we need to slow down, increase interval
        if (result.slowDown) {
          pollInterval += 1000;
        }
        continue;
      }

      // Got token!
      return result.accessToken;
    } catch (error) {
      throw error;
    }
  }

  throw new Error('Authorization timed out. Please try again.');
};

/**
 * Fetch user information from GitHub
 */
export const fetchGitHubUser = async (token) => {
  const response = await fetch(USER_URL, {
    headers: {
      'Authorization': `Bearer ${token}`,
      'Accept': 'application/vnd.github.v3+json',
    },
  });

  if (!response.ok) {
    throw new Error('Failed to fetch user information');
  }

  return await response.json();
};

/**
 * Encrypt token before storing in localStorage
 * Basic encryption to avoid storing plain text tokens
 */
export const encryptToken = (token) => {
  // Simple base64 encoding with a salt
  // In production, use a proper encryption library
  const salt = 'wiki-auth-salt-v1';
  return btoa(`${salt}:${token}`);
};

/**
 * Decrypt token from localStorage
 */
export const decryptToken = (encryptedToken) => {
  try {
    const decoded = atob(encryptedToken);
    const [salt, token] = decoded.split(':');

    if (salt !== 'wiki-auth-salt-v1') {
      throw new Error('Invalid token format');
    }

    return token;
  } catch (error) {
    console.error('Failed to decrypt token:', error);
    return null;
  }
};

/**
 * Validate token by making a test API call
 */
export const validateToken = async (token) => {
  try {
    const user = await fetchGitHubUser(token);
    return { valid: true, user };
  } catch (error) {
    return { valid: false, error: error.message };
  }
};
