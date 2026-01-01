/**
 * Milestone Achievement Deciders
 * Deciders for time-based and account milestone achievements
 */

/**
 * First Login - User logged in for the first time
 */
export async function firstLogin(userData, context) {
  return userData.user !== null;
}

/**
 * Veteran - User's GitHub account is 1+ year old
 */
export async function veteran(userData, context) {
  if (!userData.user?.created_at) return false;

  const accountAge = Date.now() - new Date(userData.user.created_at).getTime();
  const oneYear = 365 * 24 * 60 * 60 * 1000;

  return accountAge >= oneYear;
}

/**
 * Early Adopter - User joined the wiki in its early days (within first 30 days)
 * Uses releaseDate from VITE_RELEASE_DATE environment variable
 */
export async function earlyAdopter(userData, context) {
  // Get release date from context (set via VITE_RELEASE_DATE env var)
  const releaseDate = context?.releaseDate;
  if (!releaseDate) {
    console.warn('earlyAdopter: No VITE_RELEASE_DATE configured, achievement disabled');
    return false;
  }

  if (!userData.pullRequests || userData.pullRequests.length === 0) return false;

  // Find the user's first PR (should already be filtered by release date in bot service)
  const firstPR = userData.pullRequests[0]; // PRs are sorted oldest first in snapshot
  if (!firstPR?.created_at) return false;

  const firstPRDate = new Date(firstPR.created_at);
  const timeDiff = firstPRDate.getTime() - releaseDate.getTime();
  const thirtyDays = 30 * 24 * 60 * 60 * 1000;

  return timeDiff >= 0 && timeDiff <= thirtyDays;
}

/**
 * Weekend Warrior - User made contributions on weekends
 */
export async function weekendWarrior(userData, context) {
  if (!userData.pullRequests || userData.pullRequests.length === 0) return false;

  for (const pr of userData.pullRequests) {
    if (pr.created_at) {
      const date = new Date(pr.created_at);
      const dayOfWeek = date.getDay();
      // 0 = Sunday, 6 = Saturday
      if (dayOfWeek === 0 || dayOfWeek === 6) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Night Owl - User made contributions late at night (10 PM - 4 AM UTC)
 */
export async function nightOwl(userData, context) {
  if (!userData.pullRequests || userData.pullRequests.length === 0) return false;

  for (const pr of userData.pullRequests) {
    if (pr.created_at) {
      const date = new Date(pr.created_at);
      const hour = date.getUTCHours();
      // Late night: 22:00 - 03:59 UTC
      if (hour >= 22 || hour <= 3) {
        return true;
      }
    }
  }

  return false;
}

/**
 * One Week Streak - User logged in for 7 days in a row
 * TODO: Requires login tracking data
 */
export async function oneWeekStreak(userData, context) {
  // Placeholder: Would need login tracking data
  // For now, check if user has contributions spanning 7 days
  return false; // TODO: Implement login tracking
}

/**
 * One Month Streak - User logged in for 30 days in a row
 * TODO: Requires login tracking data
 */
export async function oneMonthStreak(userData, context) {
  // Placeholder: Would need login tracking data
  return false; // TODO: Implement login tracking
}

/**
 * Persistent - User logged in on 100 different days
 * TODO: Requires login tracking data
 */
export async function persistent(userData, context) {
  // Placeholder: Would need login tracking data
  return false; // TODO: Implement login tracking
}

/**
 * Dedicated - User logged in on 365 different days
 * TODO: Requires login tracking data
 */
export async function dedicated(userData, context) {
  // Placeholder: Would need login tracking data
  return false; // TODO: Implement login tracking
}

/**
 * Consistent - User contributed for 7 days in a row
 */
export async function consistent(userData, context) {
  if (!userData.pullRequests || userData.pullRequests.length < 7) return false;

  // Get dates of PRs
  const dates = userData.pullRequests
    .map(pr => pr.created_at ? new Date(pr.created_at).toDateString() : null)
    .filter(d => d !== null);

  if (dates.length < 7) return false;

  // Sort dates
  const uniqueDates = [...new Set(dates)].sort();

  // Check for 7 consecutive days
  let streak = 1;
  for (let i = 1; i < uniqueDates.length; i++) {
    const prevDate = new Date(uniqueDates[i - 1]);
    const currDate = new Date(uniqueDates[i]);
    const dayDiff = (currDate - prevDate) / (1000 * 60 * 60 * 24);

    if (dayDiff === 1) {
      streak++;
      if (streak >= 7) return true;
    } else {
      streak = 1;
    }
  }

  return false;
}

/**
 * Donator - User has made a donation to support the wiki
 */
export async function donator(userData, context) {
  try {
    const { owner, repo, username, userId, octokit } = context;

    // Search for donator issue with user ID label
    const { data: issues } = await octokit.rest.issues.listForRepo({
      owner,
      repo,
      labels: 'donator',
      state: 'open',
      per_page: 100,
    });

    // First try: Search by user ID label (permanent identifier)
    if (userId) {
      const donatorIssue = issues.find(issue =>
        issue.labels.some(label =>
          (typeof label === 'string' && label === `user-id:${userId}`) ||
          (typeof label === 'object' && label.name === `user-id:${userId}`)
        )
      );

      if (donatorIssue) {
        try {
          const donatorData = JSON.parse(donatorIssue.body);
          return donatorData.isDonator === true;
        } catch (parseError) {
          console.error('Failed to parse donator data:', parseError);
          return false;
        }
      }
    }

    // Second try: Search by username in title (legacy entries)
    const donatorIssue = issues.find(
      issue => issue.title === `[Donator] ${username}`
    );

    if (donatorIssue) {
      try {
        const donatorData = JSON.parse(donatorIssue.body);
        return donatorData.isDonator === true;
      } catch (parseError) {
        console.error('Failed to parse donator data:', parseError);
        return false;
      }
    }

    return false;
  } catch (error) {
    console.error('Failed to check donator status:', error);
    return false;
  }
}
