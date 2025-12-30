/**
 * Admin Actions Service (Client-side)
 * Calls server-side API endpoints for admin operations
 * All actions are authenticated and authorized server-side
 */

import { useAuthStore } from '../store/authStore';

/**
 * Get admin-actions endpoint with platform detection
 * @returns {string} - Endpoint URL
 */
function getAdminActionsEndpoint() {
  // Development mode - use Netlify dev server path
  if (import.meta.env.DEV) {
    return '/.netlify/functions/admin-actions';
  }

  // Check for explicit platform configuration
  const platform = import.meta.env.VITE_PLATFORM;

  // Cloudflare Pages or explicit cloudflare
  if (platform === 'cloudflare' || import.meta.env.VITE_CF_PAGES === '1') {
    return '/api/admin-actions';
  }

  // Netlify (default)
  return '/.netlify/functions/admin-actions';
}

const API_BASE = getAdminActionsEndpoint();

/**
 * Make authenticated request to admin actions API
 * @param {string} endpoint - API endpoint path
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>} API response
 */
async function makeRequest(endpoint, options = {}) {
  const token = useAuthStore.getState().getToken();
  if (!token) {
    throw new Error('Authentication required');
  }

  const response = await fetch(endpoint, {
    ...options,
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`,
      ...options.headers
    }
  });

  const data = await response.json();

  if (!response.ok) {
    throw new Error(data.error || `HTTP ${response.status}`);
  }

  return data;
}

/**
 * Get list of admins
 * @returns {Promise<Array>} Array of admin objects
 */
export async function getAdmins() {
  const data = await makeRequest(`${API_BASE}?action=get-admins`);
  return data.admins;
}

/**
 * Get list of banned users
 * @returns {Promise<Array>} Array of banned user objects
 */
export async function getBannedUsers() {
  const data = await makeRequest(`${API_BASE}?action=get-banned-users`);
  return data.bannedUsers;
}

/**
 * Get current user's admin status
 * @returns {Promise<Object>} Object with isOwner, isAdmin, username
 */
export async function getCurrentUserAdminStatus() {
  return await makeRequest(`${API_BASE}?action=get-admin-status`);
}

/**
 * Add admin (owner only)
 * @param {string} username - Username to add as admin
 * @returns {Promise<Object>} Response with success message and updated admins list
 */
export async function addAdmin(username) {
  return await makeRequest(API_BASE, {
    method: 'POST',
    body: JSON.stringify({
      action: 'add-admin',
      username
    })
  });
}

/**
 * Remove admin (owner only)
 * @param {string} username - Username to remove from admins
 * @returns {Promise<Object>} Response with success message and updated admins list
 */
export async function removeAdmin(username) {
  return await makeRequest(API_BASE, {
    method: 'POST',
    body: JSON.stringify({
      action: 'remove-admin',
      username
    })
  });
}

/**
 * Ban user (owner or admin)
 * @param {string} username - Username to ban
 * @param {string} reason - Reason for ban
 * @returns {Promise<Object>} Response with success message and updated banned users list
 */
export async function banUser(username, reason) {
  return await makeRequest(API_BASE, {
    method: 'POST',
    body: JSON.stringify({
      action: 'ban-user',
      username,
      reason
    })
  });
}

/**
 * Unban user (owner or admin)
 * @param {string} username - Username to unban
 * @returns {Promise<Object>} Response with success message and updated banned users list
 */
export async function unbanUser(username) {
  return await makeRequest(API_BASE, {
    method: 'POST',
    body: JSON.stringify({
      action: 'unban-user',
      username
    })
  });
}

/**
 * Get all donators
 * @returns {Promise<Array>} Array of donator objects
 */
export async function getAllDonators() {
  const data = await makeRequest(`${API_BASE}?action=get-all-donators`);
  return data.donators;
}

/**
 * Assign donator badge to a user (owner or admin)
 * @param {string} username - Username to assign badge to
 * @param {number} amount - Optional donation amount
 * @param {string} reason - Optional reason for assignment
 * @returns {Promise<Object>} Response with success message and donator data
 */
export async function assignDonatorBadge(username, amount = null, reason = null) {
  return await makeRequest(API_BASE, {
    method: 'POST',
    body: JSON.stringify({
      action: 'assign-donator-badge',
      username,
      amount,
      reason
    })
  });
}

/**
 * Remove donator badge from a user (owner or admin)
 * @param {string} username - Username to remove badge from
 * @param {string} reason - Optional reason for removal
 * @returns {Promise<Object>} Response with success message
 */
export async function removeDonatorBadge(username, reason = null) {
  return await makeRequest(API_BASE, {
    method: 'POST',
    body: JSON.stringify({
      action: 'remove-donator-badge',
      username,
      reason
    })
  });
}
