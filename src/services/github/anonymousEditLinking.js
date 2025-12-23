/**
 * Anonymous Edit Linking Service
 * Automatically links anonymous edits when user creates account
 */

import { createLogger } from '../../utils/logger';
import { getGithubBotEndpoint } from '../../utils/apiEndpoints';
import { persistName, getItem, setItem, removeItem } from '../../utils/storageManager';
const logger = createLogger('AnonymousEditLinking');

/**
 * Hash email using same algorithm as backend (SHA-256)
 * @param {string} email - Email address to hash
 * @returns {Promise<string>} 64-character hex hash
 */
async function hashEmail(email) {
  const encoder = new TextEncoder();
  const data = encoder.encode(email);
  const hashBuffer = await crypto.subtle.digest('SHA-256', data);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

/**
 * Check and link anonymous edits on first login
 * @param {Object} user - GitHub user object (with id, login, email)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} token - User's GitHub OAuth token (for authentication)
 * @returns {Promise<{linked: boolean, linkedCount?: number, reason?: string, error?: string}>}
 */
export async function linkAnonymousEditsOnLogin(user, owner, repo, token) {
  if (!token) {
    logger.error('No token provided for linking', { userId: user.id });
    return { linked: false, reason: 'no_token' };
  }

  if (!user.email) {
    logger.debug('User has no email, skipping linking', { userId: user.id });
    return { linked: false, reason: 'no_email' };
  }

  try {
    logger.info('Attempting to link anonymous edits', { userId: user.id, username: user.login });

    // Call backend to perform linking with authentication token
    // Backend will verify token, fetch user data, and validate identity
    const response = await fetch(getGithubBotEndpoint(), {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`, // Send user's OAuth token for verification
      },
      body: JSON.stringify({
        action: 'link-anonymous-edits',
        owner,
        repo,
        // Don't send userId/username/email - backend will get from token
      }),
    });

    const result = await response.json();

    if (!response.ok) {
      logger.error('Linking request failed', { userId: user.id, status: response.status, error: result.error });
      return { linked: false, error: result.error || 'Failed to link edits' };
    }

    logger.info('Linking completed', { userId: user.id, linkedCount: result.linkedCount });
    return result;
  } catch (error) {
    logger.error('Linking failed', { error, userId: user.id });
    return { linked: false, error: error.message };
  }
}

/**
 * Check if user has been checked for linking (prevents redundant calls)
 * Uses persistent storage: `<userId>:anonymous_edits_linked`
 *
 * @param {number} userId - GitHub user ID
 * @returns {boolean} True if already checked
 */
export function hasBeenCheckedForLinking(userId) {
  if (!userId || typeof userId !== 'number') {
    logger.warn('Invalid userId for linking check', { userId });
    return false;
  }

  try {
    // Use persistent storage (survives cache purges): <userId>:anonymous_edits_linked
    const key = persistName('anonymous_edits_linked', userId);
    const checked = getItem(key);
    return checked === true;
  } catch (error) {
    logger.error('Failed to check linking status', { error, userId });
    return false;
  }
}

/**
 * Mark user as checked for linking
 * Uses persistent storage: `<userId>:anonymous_edits_linked`
 *
 * @param {number} userId - GitHub user ID
 */
export function markAsCheckedForLinking(userId) {
  if (!userId || typeof userId !== 'number') {
    logger.warn('Invalid userId for marking linking check', { userId });
    return;
  }

  try {
    // Use persistent storage (survives cache purges): <userId>:anonymous_edits_linked
    const key = persistName('anonymous_edits_linked', userId);
    setItem(key, true);
    logger.debug('Marked user as checked for linking', { userId });
  } catch (error) {
    logger.error('Failed to mark as checked', { error, userId });
  }
}

/**
 * Clear linking check status (for testing/debugging)
 * Uses persistent storage: `<userId>:anonymous_edits_linked`
 *
 * @param {number} userId - GitHub user ID
 */
export function clearLinkingCheckStatus(userId) {
  if (!userId || typeof userId !== 'number') {
    logger.warn('Invalid userId for clearing linking check', { userId });
    return;
  }

  try {
    // Use persistent storage (survives cache purges): <userId>:anonymous_edits_linked
    const key = persistName('anonymous_edits_linked', userId);
    removeItem(key);
    logger.debug('Cleared linking check status', { userId });
  } catch (error) {
    logger.error('Failed to clear check status', { error, userId });
  }
}

/**
 * Manually trigger anonymous edit linking (for Link button)
 * @param {Object} user - GitHub user object (with id, login, email)
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string} token - User's GitHub OAuth token (for authentication)
 * @returns {Promise<{success: boolean, linkedCount?: number, message?: string, error?: string, cooldown?: number}>}
 */
export async function manualLinkAnonymousEdits(user, owner, repo, token) {
  if (!token) {
    logger.error('No token provided for manual linking', { userId: user.id });
    return { success: false, error: 'Authentication required' };
  }

  if (!user.email) {
    logger.debug('User has no email, cannot link', { userId: user.id });
    return { success: false, error: 'Email not available from GitHub account' };
  }

  try {
    logger.info('Manual link requested', { userId: user.id, username: user.login });

    const endpoint = getGithubBotEndpoint();
    logger.debug('Sending request to endpoint', { endpoint });

    const response = await fetch(endpoint, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${token}`,
      },
      body: JSON.stringify({
        action: 'link-anonymous-edits',
        owner,
        repo,
        manual: true, // Flag to indicate manual trigger
      }),
    });

    logger.debug('Response received', { status: response.status, ok: response.ok });

    let result;
    try {
      result = await response.json();
      logger.debug('Response parsed', { result });
    } catch (parseError) {
      const responseText = await response.text();
      logger.error('Failed to parse response as JSON', {
        status: response.status,
        responseText: responseText.substring(0, 500),
        parseError: parseError.message
      });
      throw new Error(`Server returned invalid response: ${responseText.substring(0, 100)}`);
    }

    if (!response.ok) {
      // Check for cooldown error
      if (response.status === 429 && result.cooldown) {
        logger.warn('Link request rate limited', {
          userId: user.id,
          cooldownSeconds: result.cooldown
        });
        return {
          success: false,
          error: result.error || 'Please wait before trying again',
          cooldown: result.cooldown,
          cooldownMinutes: Math.ceil(result.cooldown / 60)
        };
      }

      logger.error('Manual linking failed', {
        userId: user.id,
        status: response.status,
        error: result.error
      });
      return { success: false, error: result.error || 'Failed to link edits' };
    }

    logger.info('Manual linking completed', {
      userId: user.id,
      linkedCount: result.linkedCount
    });

    return {
      success: true,
      linkedCount: result.linkedCount,
      message: result.linkedCount > 0
        ? `Linked ${result.linkedCount} anonymous edit${result.linkedCount !== 1 ? 's' : ''}!`
        : 'No linkable anonymous edits found'
    };
  } catch (error) {
    logger.error('Manual linking failed with exception', {
      error: error.message,
      errorName: error.name,
      errorStack: error.stack,
      userId: user.id
    });
    return {
      success: false,
      error: error.message || 'An unexpected error occurred. Check console for details.'
    };
  }
}
