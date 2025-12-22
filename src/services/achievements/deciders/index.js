/**
 * Framework Default Achievement Deciders
 *
 * These deciders are framework-provided and work for any wiki.
 * Parent projects can extend with custom deciders.
 */

import * as contribution from './contribution.js';
import * as milestone from './milestone.js';
import * as social from './social.js';

/**
 * Default decider registry
 * Maps achievement IDs to decider functions
 */
export const defaultDeciders = {
  // Contribution achievements
  'first-edit': contribution.firstEdit,
  'first-pr': contribution.firstPr,
  'pr-novice': contribution.prNovice,
  'pr-expert': contribution.prExpert,
  'pr-master': contribution.prMaster,
  'pr-legend': contribution.prLegend,
  'first-merge': contribution.firstMerge,
  'merge-novice': contribution.mergeNovice,
  'merge-expert': contribution.mergeExpert,
  'merge-master': contribution.mergeMaster,
  'lines-apprentice': contribution.linesApprentice,
  'lines-journeyman': contribution.linesJourneyman,
  'lines-master': contribution.linesMaster,
  'lines-legend': contribution.linesLegend,
  'files-novice': contribution.filesNovice,
  'files-expert': contribution.filesExpert,
  'files-master': contribution.filesMaster,
  'anonymous-contributor': contribution.anonymousContributor,
  'prolific-editor': contribution.prolificEditor,
  'first-pr-closed': contribution.firstPrClosed,

  // Milestone achievements
  'first-login': milestone.firstLogin,
  'veteran': milestone.veteran,
  'early-adopter': milestone.earlyAdopter,
  'one-week-streak': milestone.oneWeekStreak,
  'one-month-streak': milestone.oneMonthStreak,
  'persistent': milestone.persistent,
  'dedicated': milestone.dedicated,
  'weekend-warrior': milestone.weekendWarrior,
  'night-owl': milestone.nightOwl,
  'consistent': milestone.consistent,

  // Social achievements
  'first-comment': social.firstComment,
  'helpful': social.helpful,
  'very-helpful': social.veryHelpful,
  'reviewer': social.reviewer,
  'popular': social.popular,
  'famous': social.famous,
  'discussion-starter': social.discussionStarter,
  'community-builder': social.communityBuilder,
  'mentor': social.mentor,
  'ambassador': social.ambassador,
};

/**
 * Decider function signature:
 * @param {Object} userData - User data from snapshot { user, stats, pullRequests, userId, username }
 * @param {Object} context - Server context { octokit, owner, repo, userId, username }
 * @returns {Promise<boolean>} - True if achievement should be unlocked
 */
