/**
 * Bot Service - Secure server-side bot operations
 * Calls serverless functions to perform bot actions without exposing token
 *
 * SECURITY: In production, ONLY uses serverless functions (no tokens in client code)
 * In development, can optionally use direct API calls for local testing
 * Supports both Netlify and Cloudflare Pages platforms
 */

import { retryPlugin } from './octokitRetryPlugin.js';
import { getGithubBotEndpoint, getCreateCommentIssueEndpoint } from '../../utils/apiEndpoints.js';
import { createUserIdLabel } from '../../utils/githubLabelUtils.js';

// Lazy-load authStore to avoid importing browser-only modules in serverless context
let authStoreModule = null;
const getAuthStore = async () => {
  if (!authStoreModule) {
    authStoreModule = await import('../../store/authStore.js');
  }
  return authStoreModule.useAuthStore;
};

// Helper to safely check environment (works in both browser and serverless contexts)
const isDev = () => {
  return typeof import.meta !== 'undefined' && import.meta.env && import.meta.env.DEV;
};

const getEnv = (key) => {
  if (typeof import.meta !== 'undefined' && import.meta.env) {
    return import.meta.env[key];
  }
  // Fallback to process.env for serverless contexts
  if (typeof process !== 'undefined' && process.env) {
    return process.env[key];
  }
  return undefined;
};

// Helper to check if running in serverless/server context
const isServerContext = () => {
  return typeof window === 'undefined';
};

// Development-only imports - tree-shaken in production builds
let Octokit;
if (isDev()) {
  // Only import Octokit in development mode
  const module = await import('octokit');
  Octokit = module.Octokit;
}

/**
 * Create issue directly with bot token (DEVELOPMENT ONLY - TREE-SHAKEN IN PRODUCTION)
 * This fallback allows local development without running Netlify Functions locally
 */
const createIssueDirectly = async (owner, repo, title, body, labels, preventDuplicates = false) => {
  // This entire function is removed from production builds by Vite
  if (!isDev()) {
    throw new Error('Direct API calls are disabled in production builds');
  }

  const botToken = getEnv("VITE_WIKI_BOT_TOKEN");

  if (!botToken) {
    throw new Error('Bot token not configured. Add VITE_WIKI_BOT_TOKEN to .env.local for local development.');
  }

  console.log('[Bot Service] 🔧 Using direct API call (development mode)');

  const OctokitWithRetry = Octokit.plugin(retryPlugin);
  const octokit = new OctokitWithRetry({
    auth: botToken,
    userAgent: 'GitHub-Wiki-Bot/1.0',
    throttle: { enabled: false }, // Disable built-in throttling
  });

  // Check for existing issue if preventDuplicates is enabled
  if (preventDuplicates) {
    const { data: existingIssues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: Array.isArray(labels) ? labels.join(',') : labels,
      state: 'open',
      per_page: 100,
    });

    // Filter to only bot-created issues
    const botLogin = getEnv("VITE_WIKI_BOT_USERNAME");
    const botIssues = existingIssues.filter(issue => issue.user.login === botLogin);

    // If issue already exists, return it instead of creating duplicate
    if (botIssues.length > 0) {
      const existingIssue = botIssues[0];
      console.log(`[Bot Service] Issue already exists with labels ${labels}, returning existing issue #${existingIssue.number}`);

      return {
        number: existingIssue.number,
        title: existingIssue.title,
        url: existingIssue.html_url,
        body: existingIssue.body,
        labels: existingIssue.labels,
        created_at: existingIssue.created_at,
        state: existingIssue.state,
        wasExisting: true, // Indicate this was an existing issue
      };
    }
  }

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
 * @param {boolean} preventDuplicates - If true, checks for existing issue with same labels before creating
 * @returns {Promise<Object>} Created issue data
 */
export const createCommentIssueWithBot = async (owner, repo, title, body, labels, preventDuplicates = false) => {
  try {
    // Get current user for server-side ban checking (lazy-load to avoid serverless issues)
    const useAuthStore = await getAuthStore();
    const authStore = useAuthStore.getState();
    const currentUser = authStore.user;
    const requestedBy = currentUser?.login || null;
    const requestedByUserId = currentUser?.id || null;

    // Development mode: Try direct API call first (if token available), then fall back to function
    if (isDev()) {
      const hasLocalToken = !!getEnv("VITE_WIKI_BOT_TOKEN");

      if (hasLocalToken) {
        console.log('[Bot Service] Development mode: Using direct API call');
        return await createIssueDirectly(owner, repo, title, body, labels, preventDuplicates);
      } else {
        console.log('[Bot Service] Development mode: No local token, trying Netlify Dev function...');
      }
    }

    // Production mode OR development without local token: Use Netlify Function
    console.log('[Bot Service] Creating comment issue via Netlify Function...');

    const response = await fetch(getGithubBotEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create-comment-issue',
        owner,
        repo,
        title,
        body,
        labels,
        requestedBy,
        requestedByUserId,
        preventDuplicates,
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
  if (!isDev()) {
    throw new Error('Direct API calls are disabled in production builds');
  }

  const botToken = getEnv("VITE_WIKI_BOT_TOKEN");

  if (!botToken) {
    throw new Error('Bot token not configured. Add VITE_WIKI_BOT_TOKEN to .env.local for local development.');
  }

  console.log('[Bot Service] 🔧 Using direct API call for update (development mode)');

  const OctokitWithRetry = Octokit.plugin(retryPlugin);
  const octokit = new OctokitWithRetry({
    auth: botToken,
    userAgent: 'GitHub-Wiki-Bot/1.0',
    throttle: { enabled: false }, // Disable built-in throttling
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
  if (!isDev()) {
    throw new Error('Direct API calls are disabled in production builds');
  }

  const botToken = getEnv("VITE_WIKI_BOT_TOKEN");

  if (!botToken) {
    throw new Error('Bot token not configured. Add VITE_WIKI_BOT_TOKEN to .env.local for local development.');
  }

  console.log('[Bot Service] 🔧 Using direct API call for lock (development mode)');

  const OctokitWithRetry = Octokit.plugin(retryPlugin);
  const octokit = new OctokitWithRetry({
    auth: botToken,
    userAgent: 'GitHub-Wiki-Bot/1.0',
    throttle: { enabled: false }, // Disable built-in throttling
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
    // Check if running in server context (no window/browser)
    const inServerContext = isServerContext();

    let userToken, username;

    if (inServerContext) {
      // Server context: Use GITHUB_TOKEN set by the handler
      userToken = process.env.GITHUB_TOKEN;
      // Username is not needed in server context as authentication is already done by handler
      username = 'server';
      console.log('[Bot Service] Server context: Using handler-provided token');
    } else {
      // Browser context: Get user credentials from authStore
      const useAuthStore = await getAuthStore();
      const { user, getToken } = useAuthStore.getState();
      userToken = getToken();
      username = user?.login;

      if (!userToken || !username) {
        throw new Error('Authentication required to perform admin actions');
      }
    }

    // Server context: Use Octokit directly with bot token
    if (inServerContext) {
      console.log('[Bot Service] Server context: Creating admin issue directly with Octokit');

      // Get bot token from environment
      // In server context, try multiple sources
      const botToken = getEnv('WIKI_BOT_TOKEN') ||
                       getEnv('VITE_WIKI_BOT_TOKEN') ||
                       process.env.WIKI_BOT_TOKEN ||
                       process.env.VITE_WIKI_BOT_TOKEN;

      console.log('[Bot Service] Bot token check:', {
        hasToken: !!botToken,
        tokenLength: botToken?.length,
        envKeys: Object.keys(process.env).filter(k => k.includes('WIKI') || k.includes('BOT'))
      });

      if (!botToken) {
        throw new Error('Bot token not configured - check WIKI_BOT_TOKEN environment variable');
      }

      // Dynamically import Octokit for server context
      const { Octokit } = await import('octokit');
      const octokit = new Octokit({ auth: botToken });

      // Create the issue
      const { data: issue } = await octokit.rest.issues.create({
        owner,
        repo,
        title,
        body,
        labels,
      });

      // Lock the issue if requested
      if (lock) {
        await octokit.rest.issues.lock({
          owner,
          repo,
          issue_number: issue.number,
          lock_reason: 'resolved',
        });
      }

      console.log(`[Bot Service] ✓ Admin issue created in server context: #${issue.number}`);
      return issue;
    }

    // Development mode: Try direct API call first
    if (isDev()) {
      const hasLocalToken = !!getEnv("VITE_WIKI_BOT_TOKEN");

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

    const response = await fetch(getGithubBotEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create-admin-issue',
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
    // Check if running in server context (no window/browser)
    const inServerContext = isServerContext();

    let userToken, username;

    if (inServerContext) {
      // Server context: Use GITHUB_TOKEN set by the handler
      userToken = process.env.GITHUB_TOKEN;
      username = 'server';
      console.log('[Bot Service] Server context: Using handler-provided token for update');
    } else {
      // Browser context: Get user credentials from authStore
      const useAuthStore = await getAuthStore();
      const { user, getToken } = useAuthStore.getState();
      userToken = getToken();
      username = user?.login;

      if (!userToken || !username) {
        throw new Error('Authentication required to perform admin actions');
      }
    }

    // Server context: Use Octokit directly with bot token
    if (inServerContext) {
      console.log('[Bot Service] Server context: Updating admin issue directly with Octokit');

      // Get bot token from environment
      // In server context, try multiple sources
      const botToken = getEnv('WIKI_BOT_TOKEN') ||
                       getEnv('VITE_WIKI_BOT_TOKEN') ||
                       process.env.WIKI_BOT_TOKEN ||
                       process.env.VITE_WIKI_BOT_TOKEN;

      console.log('[Bot Service] Bot token check:', {
        hasToken: !!botToken,
        tokenLength: botToken?.length,
        envKeys: Object.keys(process.env).filter(k => k.includes('WIKI') || k.includes('BOT'))
      });

      if (!botToken) {
        throw new Error('Bot token not configured - check WIKI_BOT_TOKEN environment variable');
      }

      // Dynamically import Octokit for server context
      const { Octokit } = await import('octokit');
      const octokit = new Octokit({ auth: botToken });

      // Update the issue
      const { data: issue } = await octokit.rest.issues.update({
        owner,
        repo,
        issue_number: issueNumber,
        body,
      });

      console.log(`[Bot Service] ✓ Admin issue updated in server context: #${issue.number}`);
      return issue;
    }

    // Development mode: Try direct API call first
    if (isDev()) {
      const hasLocalToken = !!getEnv("VITE_WIKI_BOT_TOKEN");

      if (hasLocalToken) {
        console.log('[Bot Service] Development mode: Using direct API call for admin issue update');
        return await updateIssueDirectly(owner, repo, issueNumber, body);
      } else {
        console.log('[Bot Service] Development mode: No local token, trying Netlify Dev function...');
      }
    }

    // Production mode OR development without local token: Use Netlify Function
    console.log('[Bot Service] Updating admin issue via Netlify Function...');

    const response = await fetch(getGithubBotEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'update-admin-issue',
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
 * Create a comment on an existing issue using the bot
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number to comment on
 * @param {string} body - Comment body
 * @returns {Promise<Object>} Created comment data
 */
export const createCommentOnIssueWithBot = async (owner, repo, issueNumber, body) => {
  try {
    // Development mode: Try direct API call first
    if (isDev()) {
      const hasLocalToken = !!getEnv("VITE_WIKI_BOT_TOKEN");

      if (hasLocalToken) {
        console.log('[Bot Service] Development mode: Using direct API call for comment');

        const botToken = getEnv("VITE_WIKI_BOT_TOKEN");
        const OctokitWithRetry = Octokit.plugin(retryPlugin);
        const octokit = new OctokitWithRetry({
          auth: botToken,
          userAgent: 'GitHub-Wiki-Bot/1.0',
          throttle: { enabled: false }, // Disable built-in throttling
        });

        const { data: comment } = await octokit.rest.issues.createComment({
          owner,
          repo,
          issue_number: issueNumber,
          body,
        });

        return {
          id: comment.id,
          body: comment.body,
          created_at: comment.created_at,
          html_url: comment.html_url,
        };
      }
    }

    // Production mode: Use Netlify Function
    console.log('[Bot Service] Creating comment via Netlify Function...');

    const response = await fetch(getGithubBotEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create-comment',
        owner,
        repo,
        issueNumber,
        body,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Bot Service] Failed to create comment:', data);
      throw new Error(data.message || data.error || 'Failed to create comment');
    }

    console.log('[Bot Service] ✓ Comment created:', data.comment);
    return data.comment;
  } catch (error) {
    console.error('[Bot Service] Error creating comment:', error);
    throw error;
  }
};

/**
 * Update an issue body using the bot
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {number} issueNumber - Issue number to update
 * @param {string} body - New issue body
 * @returns {Promise<Object>} Updated issue data
 */
export const updateIssueWithBot = async (owner, repo, issueNumber, body) => {
  try {
    // Development mode: Try direct API call first
    if (isDev()) {
      const hasLocalToken = !!getEnv("VITE_WIKI_BOT_TOKEN");

      if (hasLocalToken) {
        console.log('[Bot Service] Development mode: Using direct API call for issue update');
        return await updateIssueDirectly(owner, repo, issueNumber, body);
      }
    }

    // Production mode: Use Netlify Function
    console.log('[Bot Service] Updating issue via Netlify Function...');

    const response = await fetch(getGithubBotEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'update-issue',
        owner,
        repo,
        issueNumber,
        body,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Bot Service] Failed to update issue:', data);
      throw new Error(data.message || data.error || 'Failed to update issue');
    }

    console.log('[Bot Service] ✓ Issue updated:', data.issue);
    return data.issue;
  } catch (error) {
    console.error('[Bot Service] Error updating issue:', error);
    throw error;
  }
};

/**
 * Generic function to call bot service with any action
 * @param {string} action - The action to perform
 * @param {Object} body - Request body (will have action, owner, repo added)
 * @param {string} [userToken] - Optional user auth token (for authenticated endpoints)
 * @returns {Promise<Object>} Response data
 */
export const callBotService = async (action, body, userToken = null) => {
  try {
    const headers = {
      'Content-Type': 'application/json',
    };

    // Add Authorization header if user token provided
    if (userToken) {
      headers['Authorization'] = `Bearer ${userToken}`;
    }

    const response = await fetch(getGithubBotEndpoint(), {
      method: 'POST',
      headers,
      body: JSON.stringify({
        action,
        ...body,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error(`[Bot Service] Failed to call ${action}:`, data);
      throw new Error(data.message || data.error || `Failed to ${action}`);
    }

    console.log(`[Bot Service] ✓ ${action} completed:`, data);
    return data;
  } catch (error) {
    console.error(`[Bot Service] Error calling ${action}:`, error);
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
    const response = await fetch(getCreateCommentIssueEndpoint(), {
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

/**
 * Save or update user snapshot issue with bot token (DEVELOPMENT ONLY)
 */
const saveUserSnapshotDirectly = async (owner, repo, username, snapshotData, existingIssueNumber = null) => {
  if (!isDev()) {
    throw new Error('Direct API calls are disabled in production builds');
  }

  const botToken = getEnv("VITE_WIKI_BOT_TOKEN");
  if (!botToken) {
    throw new Error('Bot token not configured');
  }

  const OctokitWithRetry = Octokit.plugin(retryPlugin);
  const octokit = new OctokitWithRetry({
    auth: botToken,
    userAgent: 'GitHub-Wiki-Bot/1.0',
    throttle: { enabled: false },
  });

  const issueTitle = `[User Snapshot] ${username}`;
  const issueBody = JSON.stringify(snapshotData, null, 2);
  const userIdLabel = snapshotData.userId ? createUserIdLabel(snapshotData.userId) : null;

  if (existingIssueNumber) {
    // Update existing snapshot
    const { data: updatedIssue } = await octokit.rest.issues.update({
      owner,
      repo,
      issue_number: existingIssueNumber,
      title: issueTitle,
      body: issueBody,
    });

    // Add user ID label if missing
    if (userIdLabel) {
      try {
        await octokit.rest.issues.addLabels({
          owner,
          repo,
          issue_number: existingIssueNumber,
          labels: [userIdLabel],
        });
      } catch (err) {
        console.warn('[Bot Service] Failed to add user-id label:', err.message);
      }
    }

    return updatedIssue;
  } else {
    // Create new snapshot
    const labels = ['user-snapshot', 'automated'];
    if (userIdLabel) {
      labels.push(userIdLabel);
    }

    const { data: newIssue } = await octokit.rest.issues.create({
      owner,
      repo,
      title: issueTitle,
      body: issueBody,
      labels,
    });

    // Lock the issue
    try {
      await octokit.rest.issues.lock({
        owner,
        repo,
        issue_number: newIssue.number,
        lock_reason: 'off-topic',
      });
    } catch (lockError) {
      console.warn('[Bot Service] Failed to lock user snapshot:', lockError.message);
    }

    return newIssue;
  }
};

/**
 * Save or update user snapshot using the bot token
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} username - GitHub username
 * @param {Object} snapshotData - Snapshot data to save
 * @param {number} [existingIssueNumber] - Existing issue number to update
 * @returns {Promise<Object>} Created/updated issue data
 */
export const saveUserSnapshotWithBot = async (owner, repo, username, snapshotData, existingIssueNumber = null) => {
  try {
    // Get user credentials for server-side verification (lazy-load to avoid serverless issues)
    const useAuthStore = await getAuthStore();
    const { user, getToken } = useAuthStore.getState();
    const userToken = getToken();
    const requestingUsername = user?.login;

    if (!userToken || !requestingUsername) {
      throw new Error('Authentication required to save user snapshot');
    }

    // Development mode: Try direct API call first
    if (isDev()) {
      const hasLocalToken = !!getEnv("VITE_WIKI_BOT_TOKEN");

      if (hasLocalToken) {
        console.log('[Bot Service] Development mode: Using direct API call for user snapshot');
        return await saveUserSnapshotDirectly(owner, repo, username, snapshotData, existingIssueNumber);
      } else {
        console.log('[Bot Service] Development mode: No local token, trying Netlify Dev function...');
      }
    }

    // Production mode OR development without local token: Use Netlify Function
    console.log('[Bot Service] Saving user snapshot via Netlify Function...');

    const response = await fetch(getGithubBotEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'save-user-snapshot',
        owner,
        repo,
        username,
        snapshotData,
        existingIssueNumber,
        userToken,
        requestingUsername,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Bot Service] Failed to save user snapshot:', data);
      throw new Error(data.message || data.error || 'Failed to save user snapshot');
    }

    console.log('[Bot Service] ✓ User snapshot saved:', data.issue);
    return data.issue;
  } catch (error) {
    console.error('[Bot Service] Error saving user snapshot:', error);
    throw error;
  }
};

/**
 * Create issue report directly with bot token (DEVELOPMENT ONLY)
 */
const createIssueReportDirectly = async (report) => {
  if (!isDev()) {
    throw new Error('Direct API calls are disabled in production builds');
  }

  const botToken = getEnv("VITE_WIKI_BOT_TOKEN");
  if (!botToken) {
    throw new Error('Bot token not configured');
  }

  const OctokitWithRetry = Octokit.plugin(retryPlugin);
  const octokit = new OctokitWithRetry({
    auth: botToken,
    userAgent: 'GitHub-Wiki-Bot/1.0',
    throttle: { enabled: false },
  });

  const { owner, repo, category, title, description, email, pageUrl, includeSystemInfo, systemInfo, requestedBy } = report;

  // Build issue title
  const reporterName = requestedBy || 'Anonymous';
  const issueTitle = `[Issue Report] ${reporterName} - ${title}`;

  // Build issue body
  const categoryDisplay = category.split('-').map(w =>
    w.charAt(0).toUpperCase() + w.slice(1)
  ).join(' ');

  let issueBody = `**Category**: ${categoryDisplay}\n`;
  issueBody += `**Submitted by**: ${reporterName}\n`;
  if (email) {
    issueBody += `**Email**: ${email}\n`;
  }
  issueBody += `**Page URL**: ${pageUrl}\n\n`;
  issueBody += `## Description\n\n${description}\n\n`;

  if (includeSystemInfo && systemInfo) {
    issueBody += `---\n\n**System Information**\n`;
    issueBody += `- **Browser**: ${systemInfo.browser}\n`;
    issueBody += `- **OS**: ${systemInfo.os}\n`;
    issueBody += `- **Screen**: ${systemInfo.screen}\n`;
    issueBody += `- **Timestamp**: ${systemInfo.timestamp}\n`;
  }

  // Create issue
  const { data: issue } = await octokit.rest.issues.create({
    owner,
    repo,
    title: issueTitle,
    body: issueBody,
    labels: ['user-report', category],
  });

  console.log(`[Bot Service] Created issue report #${issue.number}`);

  return {
    success: true,
    issue: {
      number: issue.number,
      url: issue.html_url,
      title: issue.title,
    },
  };
};

/**
 * Creates an issue report (anonymous or authenticated)
 * @param {Object} report - Issue report data
 * @returns {Promise<Object>} Created issue details with URL
 */
export const createIssueReport = async (report) => {
  try {
    // Lazy-load authStore to avoid serverless issues
    const useAuthStore = await getAuthStore();
    const authStore = useAuthStore.getState();
    const requestedBy = authStore.user?.login || null;

    // Get repository info from report or use defaults
    const owner = report.owner;
    const repo = report.repo;

    const requestBody = {
      ...report,
      owner,
      repo,
      requestedBy,
    };

    // Development mode: Try direct API call first
    if (isDev()) {
      const hasLocalToken = !!getEnv("VITE_WIKI_BOT_TOKEN");

      if (hasLocalToken) {
        console.log('[Bot Service] Development mode: Using direct API call for issue report');
        return await createIssueReportDirectly(requestBody);
      } else {
        console.log('[Bot Service] Development mode: No local token, trying Netlify Dev function...');
      }
    }

    // Production mode OR development without local token: Use serverless function
    console.log('[Bot Service] Creating issue report via serverless function...');

    const response = await fetch(getGithubBotEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        action: 'create-issue-report',
        ...requestBody,
      }),
    });

    const data = await response.json();

    if (!response.ok) {
      console.error('[Bot Service] Failed to create issue report:', data);
      throw new Error(data.error || 'Failed to create issue report');
    }

    console.log('[Bot Service] ✓ Issue report created:', data.issue);
    return data;
  } catch (error) {
    console.error('[Bot Service] Error creating issue report:', error);
    throw error;
  }
};
