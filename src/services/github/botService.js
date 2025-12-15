/**
 * Bot Service - Secure server-side bot operations
 * Calls Netlify Functions to perform bot actions without exposing token
 *
 * SECURITY: In production, ONLY uses Netlify Functions (no tokens in client code)
 * In development, can optionally use direct API calls for local testing
 */

import { useAuthStore } from '../../store/authStore';

// Development-only imports - tree-shaken in production builds
let Octokit;
if (import.meta.env.DEV) {
  // Only import Octokit in development mode
  const module = await import('octokit');
  Octokit = module.Octokit;
}

/**
 * Create issue directly with bot token (DEVELOPMENT ONLY - TREE-SHAKEN IN PRODUCTION)
 * This fallback allows local development without running Netlify Functions locally
 */
const createIssueDirectly = async (owner, repo, title, body, labels) => {
  // This entire function is removed from production builds by Vite
  if (!import.meta.env.DEV) {
    throw new Error('Direct API calls are disabled in production builds');
  }

  const botToken = import.meta.env.VITE_WIKI_BOT_TOKEN;

  if (!botToken) {
    throw new Error('Bot token not configured. Add VITE_WIKI_BOT_TOKEN to .env.local for local development.');
  }

  console.log('[Bot Service] 🔧 Using direct API call (development mode)');

  const octokit = new Octokit({
    auth: botToken,
    userAgent: 'GitHub-Wiki-Bot/1.0',
  });

  const { data: issue } = await octokit.rest.issues.create({
    owner,
    repo,
    title,
    body,
    labels,
  });

  return {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    body: issue.body,
    labels: issue.labels,
    created_at: issue.created_at,
    state: issue.state,
  };
};

/**
 * Create a comment issue using the bot via Netlify Function
 * - Production: ONLY uses Netlify Function (secure)
 * - Development: Can use direct API for local testing
 *
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} title - Issue title
 * @param {string} body - Issue body
 * @param {string[]} labels - Issue labels
 * @returns {Promise<Object>} Created issue data
 */
export const createCommentIssueWithBot = async (owner, repo, title, body, labels) => {
  try {
    // Development mode: Try direct API call first (if token available), then fall back to function
    if (import.meta.env.DEV) {
      const hasLocalToken = !!import.meta.env.VITE_WIKI_BOT_TOKEN;

      if (hasLocalToken) {
        console.log('[Bot Service] Development mode: Using direct API call');
        return await createIssueDirectly(owner, repo, title, body, labels);
      } else {
        console.log('[Bot Service] Development mode: No local token, trying Netlify Dev function...');
      }
    }

    // Production mode OR development without local token: Use Netlify Function
    console.log('[Bot Service] Creating comment issue via Netlify Function...');

    const response = await fetch('/.netlify/functions/create-comment-issue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        owner,
        repo,
        title,
        body,
        labels,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Bot Service] Failed to create issue:', data);
      throw new Error(data.message || data.error || 'Failed to create comment issue');
    }

    console.log('[Bot Service] ✓ Comment issue created:', data.issue);
    return data.issue;
  } catch (error) {
    console.error('[Bot Service] Error:', error);
    throw error;
  }
};

/**
 * Update issue directly with bot token (DEVELOPMENT ONLY - TREE-SHAKEN IN PRODUCTION)
 */
const updateIssueDirectly = async (owner, repo, issueNumber, body) => {
  if (!import.meta.env.DEV) {
    throw new Error('Direct API calls are disabled in production builds');
  }

  const botToken = import.meta.env.VITE_WIKI_BOT_TOKEN;

  if (!botToken) {
    throw new Error('Bot token not configured. Add VITE_WIKI_BOT_TOKEN to .env.local for local development.');
  }

  console.log('[Bot Service] 🔧 Using direct API call for update (development mode)');

  const octokit = new Octokit({
    auth: botToken,
    userAgent: 'GitHub-Wiki-Bot/1.0',
  });

  const { data: issue } = await octokit.rest.issues.update({
    owner,
    repo,
    issue_number: issueNumber,
    body,
  });

  return {
    number: issue.number,
    title: issue.title,
    url: issue.html_url,
    body: issue.body,
    labels: issue.labels,
    updated_at: issue.updated_at,
    state: issue.state,
  };
};

/**
 * Lock issue directly with bot token (DEVELOPMENT ONLY - TREE-SHAKEN IN PRODUCTION)
 */
const lockIssueDirectly = async (owner, repo, issueNumber) => {
  if (!import.meta.env.DEV) {
    throw new Error('Direct API calls are disabled in production builds');
  }

  const botToken = import.meta.env.VITE_WIKI_BOT_TOKEN;

  if (!botToken) {
    throw new Error('Bot token not configured. Add VITE_WIKI_BOT_TOKEN to .env.local for local development.');
  }

  console.log('[Bot Service] 🔧 Using direct API call for lock (development mode)');

  const octokit = new Octokit({
    auth: botToken,
    userAgent: 'GitHub-Wiki-Bot/1.0',
  });

  await octokit.rest.issues.lock({
    owner,
    repo,
    issue_number: issueNumber,
    lock_reason: 'off-topic',
  });

  return { locked: true };
};

/**
 * Create an admin/ban list issue using the bot
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} title - Issue title
 * @param {string} body - Issue body
 * @param {string[]} labels - Issue labels
 * @param {boolean} lock - Whether to lock the issue
 * @returns {Promise<Object>} Created issue data
 */
export const createAdminIssueWithBot = async (owner, repo, title, body, labels, lock = true) => {
  try {
    // Get user credentials for server-side permission verification
    const { user, getToken } = useAuthStore.getState();
    const userToken = getToken();
    const username = user?.login;

    if (!userToken || !username) {
      throw new Error('Authentication required to perform admin actions');
    }

    // Development mode: Try direct API call first
    if (import.meta.env.DEV) {
      const hasLocalToken = !!import.meta.env.VITE_WIKI_BOT_TOKEN;

      if (hasLocalToken) {
        console.log('[Bot Service] Development mode: Using direct API call for admin issue');
        const issue = await createIssueDirectly(owner, repo, title, body, labels);

        // Lock the issue if requested
        if (lock) {
          await lockIssueDirectly(owner, repo, issue.number);
        }

        return issue;
      } else {
        console.log('[Bot Service] Development mode: No local token, trying Netlify Dev function...');
      }
    }

    // Production mode OR development without local token: Use Netlify Function
    console.log('[Bot Service] Creating admin issue via Netlify Function...');

    const response = await fetch('/.netlify/functions/create-admin-issue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        owner,
        repo,
        title,
        body,
        labels,
        lock,
        userToken,
        username,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Bot Service] Failed to create admin issue:', data);
      throw new Error(data.message || data.error || 'Failed to create admin issue');
    }

    console.log('[Bot Service] ✓ Admin issue created:', data.issue);
    return data.issue;
  } catch (error) {
    console.error('[Bot Service] Error:', error);
    throw error;
  }
};

/**
 * Update an admin/ban list issue using the bot
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number to update
 * @param {string} body - New issue body
 * @returns {Promise<Object>} Updated issue data
 */
export const updateAdminIssueWithBot = async (owner, repo, issueNumber, body) => {
  try {
    // Get user credentials for server-side permission verification
    const { user, getToken } = useAuthStore.getState();
    const userToken = getToken();
    const username = user?.login;

    if (!userToken || !username) {
      throw new Error('Authentication required to perform admin actions');
    }

    // Development mode: Try direct API call first
    if (import.meta.env.DEV) {
      const hasLocalToken = !!import.meta.env.VITE_WIKI_BOT_TOKEN;

      if (hasLocalToken) {
        console.log('[Bot Service] Development mode: Using direct API call for admin issue update');
        return await updateIssueDirectly(owner, repo, issueNumber, body);
      } else {
        console.log('[Bot Service] Development mode: No local token, trying Netlify Dev function...');
      }
    }

    // Production mode OR development without local token: Use Netlify Function
    console.log('[Bot Service] Updating admin issue via Netlify Function...');

    const response = await fetch('/.netlify/functions/update-admin-issue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        owner,
        repo,
        issueNumber,
        body,
        userToken,
        username,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Bot Service] Failed to update admin issue:', data);
      throw new Error(data.message || data.error || 'Failed to update admin issue');
    }

    console.log('[Bot Service] ✓ Admin issue updated:', data.issue);
    return data.issue;
  } catch (error) {
    console.error('[Bot Service] Error:', error);
    throw error;
  }
};

/**
 * Check if bot service is available
 * @returns {Promise<boolean>} True if bot is configured
 */
export const isBotAvailable = async () => {
  try {
    // Try a test call to see if bot is configured
    // We don't actually create anything, just check for 400 (missing fields) or 503 (no token)
    const response = await fetch('/.netlify/functions/create-comment-issue', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}), // Empty body to trigger validation
    });

    // If we get 400 (validation error), bot is available but request was invalid
    // If we get 503, bot token is not configured
    return response.status === 400;
  } catch (error) {
    console.error('[Bot Service] Failed to check bot availability:', error);
    return false;
  }
};
