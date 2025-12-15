/**
 * Netlify Function: Update Admin Issue (Bot)
 * Updates GitHub issues for admin/ban lists using bot token (server-side only)
 * This keeps the bot token secure and prevents users from tampering with admin lists
 */

import { Octokit } from 'octokit';

export const handler = async function(event) {
  // Only allow POST requests
  if (event.httpMethod !== 'POST') {
    return {
      statusCode: 405,
      body: JSON.stringify({ error: 'Method not allowed' }),
    };
  }

  // Check if bot token is configured
  const botToken = process.env.WIKI_BOT_TOKEN;
  if (!botToken) {
    return {
      statusCode: 503,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: 'Bot token not configured',
        message: 'Wiki administrator needs to configure WIKI_BOT_TOKEN in Netlify environment variables',
      }),
    };
  }

  try {
    // Parse the request body
    const { owner, repo, issueNumber, body, userToken, username } = JSON.parse(event.body);

    // Validate required fields
    if (!owner || !repo || !issueNumber || !body || !userToken || !username) {
      return {
        statusCode: 400,
        headers: {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        },
        body: JSON.stringify({
          error: 'Missing required fields',
          required: ['owner', 'repo', 'issueNumber', 'body', 'userToken', 'username'],
        }),
      };
    }

    // Initialize Octokit with user token to verify permissions
    const userOctokit = new Octokit({
      auth: userToken,
      userAgent: 'GitHub-Wiki-Bot/1.0',
    });

    // SERVER-SIDE SECURITY CHECK: Verify user has admin permissions
    console.log(`[Bot Function] Verifying permissions for ${username} on ${owner}/${repo}`);

    // Check 1: Is user the repository owner?
    const isOwner = username.toLowerCase() === owner.toLowerCase();

    if (!isOwner) {
      // Check 2: Is user in the admin list?
      console.log(`[Bot Function] User is not owner, checking admin list...`);

      // Fetch user ID for comparison (immutable, survives username changes)
      let userId;
      try {
        const { data: userData } = await userOctokit.rest.users.getByUsername({
          username,
        });
        userId = userData.id;
        console.log(`[Bot Function] Fetched userId ${userId} for ${username}`);
      } catch (error) {
        console.warn(`[Bot Function] Failed to fetch user ID for ${username}:`, error.message);
        // Continue without userId, will fallback to username comparison
      }

      // Fetch the admin list issue to verify user is an admin
      // Use cache-busting headers to ensure fresh data
      const { data: issues } = await userOctokit.rest.issues.listForRepo({
        owner,
        repo,
        labels: 'wiki-admin-list',
        state: 'open',
        per_page: 1,
        headers: {
          'If-None-Match': '', // Bypass GitHub's ETag cache
          'Cache-Control': 'no-cache',
        },
      });

      if (issues.length === 0) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            error: 'Forbidden',
            message: 'Only the repository owner or admins can update admin lists',
          }),
        };
      }

      // Parse admin list to check if user is an admin
      const adminIssue = issues[0];
      const adminListMatch = adminIssue.body.match(/```json\n([\s\S]*?)\n```/);

      if (!adminListMatch) {
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            error: 'Forbidden',
            message: 'Only the repository owner or admins can update admin lists',
          }),
        };
      }

      const admins = JSON.parse(adminListMatch[1]);

      // Check admin list (prefer userId, fallback to username for backwards compatibility)
      const isAdmin = admins.some(admin => {
        // Primary check: userId (immutable, survives username changes)
        if (userId && admin.userId && admin.userId === userId) {
          return true;
        }
        // Fallback: username (for old entries without userId)
        return admin.username.toLowerCase() === username.toLowerCase();
      });

      if (!isAdmin) {
        console.log(`[Bot Function] Permission denied: ${username} (ID: ${userId}) is not an admin`);
        return {
          statusCode: 403,
          headers: {
            'Content-Type': 'application/json',
            'Access-Control-Allow-Origin': '*',
          },
          body: JSON.stringify({
            error: 'Forbidden',
            message: 'Only the repository owner or admins can update admin lists',
          }),
        };
      }

      console.log(`[Bot Function] Permission granted: ${username} (ID: ${userId}) is an admin`);
    } else {
      console.log(`[Bot Function] Permission granted: ${username} is the repository owner`);
    }

    // Initialize Octokit with bot token (server-side only!)
    const botOctokit = new Octokit({
      auth: botToken,
      userAgent: 'GitHub-Wiki-Bot/1.0',
    });

    // SERVER-SIDE VALIDATION: Check if adding admins when this is an admin list update
    // Extract the issue title to determine which list is being updated
    const { data: existingIssue } = await botOctokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    const isAdminList = existingIssue.title === '[Admin List]';

    if (isAdminList) {
      console.log('[Bot Function] Validating admin list update...');

      // Parse new admin list from request body
      const newAdminListMatch = body.match(/```json\n([\s\S]*?)\n```/);
      if (newAdminListMatch) {
        const newAdmins = JSON.parse(newAdminListMatch[1]);

        // Parse current admin list
        const currentAdminListMatch = existingIssue.body.match(/```json\n([\s\S]*?)\n```/);
        const currentAdmins = currentAdminListMatch ? JSON.parse(currentAdminListMatch[1]) : [];

        // Find newly added admins (by userId or username)
        const currentAdminIds = new Set(currentAdmins.map(a => a.userId).filter(Boolean));
        const currentAdminNames = new Set(currentAdmins.map(a => a.username.toLowerCase()));

        const newlyAddedAdmins = newAdmins.filter(admin => {
          const isNew = !(
            (admin.userId && currentAdminIds.has(admin.userId)) ||
            currentAdminNames.has(admin.username.toLowerCase())
          );
          return isNew;
        });

        // Check if any newly added admins are banned
        if (newlyAddedAdmins.length > 0) {
          console.log(`[Bot Function] Checking ${newlyAddedAdmins.length} newly added admins for ban status...`);

          // Fetch ban list
          const { data: banIssues } = await botOctokit.rest.issues.listForRepo({
            owner,
            repo,
            labels: 'wiki-ban-list',
            state: 'open',
            per_page: 1,
          });

          if (banIssues.length > 0) {
            const banIssue = banIssues.find(issue => issue.title === '[Ban List]');
            if (banIssue) {
              const banListMatch = banIssue.body.match(/```json\n([\s\S]*?)\n```/);
              if (banListMatch) {
                const bannedUsers = JSON.parse(banListMatch[1]);

                // Check each new admin against ban list
                for (const newAdmin of newlyAddedAdmins) {
                  const isBanned = bannedUsers.some(banned => {
                    if (newAdmin.userId && banned.userId && newAdmin.userId === banned.userId) {
                      return true;
                    }
                    return banned.username.toLowerCase() === newAdmin.username.toLowerCase();
                  });

                  if (isBanned) {
                    console.warn(`[Bot Function] BLOCKED: Cannot add banned user ${newAdmin.username} as admin`);
                    return {
                      statusCode: 403,
                      headers: {
                        'Content-Type': 'application/json',
                        'Access-Control-Allow-Origin': '*',
                      },
                      body: JSON.stringify({
                        error: 'Forbidden',
                        message: `Cannot add ${newAdmin.username} as admin - user is banned`,
                      }),
                    };
                  }
                }

                console.log('[Bot Function] All new admins are not banned - proceeding with update');
              }
            }
          }
        }
      }
    }

    // Update the issue using bot token
    const { data: issue } = await botOctokit.rest.issues.update({
      owner,
      repo,
      issue_number: issueNumber,
      body,
    });

    console.log(`[Bot Function] Updated admin issue #${issue.number} for ${owner}/${repo}`);

    // Return the updated issue
    return {
      statusCode: 200,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Headers': 'Content-Type',
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
      },
      body: JSON.stringify({
        issue: {
          number: issue.number,
          title: issue.title,
          url: issue.html_url,
          body: issue.body,
          labels: issue.labels,
          updated_at: issue.updated_at,
          state: issue.state,
        },
      }),
    };
  } catch (error) {
    console.error('[Bot Function] Error updating admin issue:', error);

    // Handle specific GitHub API errors
    let statusCode = 500;
    let errorMessage = 'Failed to update admin issue';

    if (error.status === 401) {
      statusCode = 401;
      errorMessage = 'Invalid bot token';
    } else if (error.status === 403) {
      statusCode = 403;
      errorMessage = 'Bot does not have permission to update issues';
    } else if (error.status === 404) {
      statusCode = 404;
      errorMessage = 'Issue not found';
    } else if (error.status === 422) {
      statusCode = 422;
      errorMessage = 'Invalid issue data';
    }

    return {
      statusCode,
      headers: {
        'Content-Type': 'application/json',
        'Access-Control-Allow-Origin': '*',
      },
      body: JSON.stringify({
        error: errorMessage,
        message: error.message,
      }),
    };
  }
};
