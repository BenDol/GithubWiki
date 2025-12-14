import { getOctokit } from './api';

/**
 * GitHub Issue Label Management
 * Ensures all wiki-related labels exist with proper colors and descriptions
 */

/**
 * Label definitions for wiki operations
 */
export const WIKI_LABELS = {
  // Type labels (what kind of issue)
  types: [
    {
      name: 'wiki:anonymous-edit',
      description: 'Anonymous wiki edit request - processed automatically',
      color: 'fbca04', // Yellow
    },
    {
      name: 'wiki:comment',
      description: 'Wiki page comment or discussion',
      color: '0075ca', // Blue
    },
    {
      name: 'wiki:edit',
      description: 'Wiki edit or content contribution',
      color: '7057ff', // Purple
    },
    {
      name: 'wiki-comments',
      description: 'Issue used for collecting page comments',
      color: '0075ca', // Blue
    },
    {
      name: 'wiki-edit',
      description: 'Pull request for wiki content edits',
      color: '7057ff', // Purple
    },
  ],

  // Section labels (which section of wiki)
  sections: [
    {
      name: 'section:getting-started',
      description: 'Getting Started section',
      color: 'c2e0c6', // Light green
    },
    {
      name: 'section:characters',
      description: 'Characters section',
      color: 'f9d0c4', // Light red
    },
    {
      name: 'section:equipment',
      description: 'Equipment section',
      color: 'd4c5f9', // Light purple
    },
    {
      name: 'section:companions',
      description: 'Companions section',
      color: 'fef2c0', // Light yellow
    },
    {
      name: 'section:skills',
      description: 'Skills section',
      color: 'bfdadc', // Light cyan
    },
    {
      name: 'section:content',
      description: 'Content section',
      color: 'c5def5', // Light blue
    },
    {
      name: 'section:progression',
      description: 'Progression section',
      color: 'f9c5d1', // Light pink
    },
    {
      name: 'section:resources',
      description: 'Resources section',
      color: 'd1f5c5', // Lime green
    },
    {
      name: 'section:guides',
      description: 'Guides section',
      color: 'e6c5f5', // Lavender
    },
    {
      name: 'section:database',
      description: 'Database section',
      color: 'c5e5f5', // Sky blue
    },
    {
      name: 'section:tools',
      description: 'Tools section',
      color: 'f5d9c5', // Peach
    },
    {
      name: 'section:meta',
      description: 'Meta section (wiki information and guidelines)',
      color: 'e0e0e0', // Light gray
    },
  ],

  // Status labels (processing state)
  status: [
    {
      name: 'status:processing',
      description: 'Currently being processed by automation',
      color: 'fbca04', // Yellow
    },
    {
      name: 'status:completed',
      description: 'Successfully processed and completed',
      color: '0e8a16', // Green
    },
    {
      name: 'status:failed',
      description: 'Processing failed - needs attention',
      color: 'd73a4a', // Red
    },
  ],

  // Additional labels
  additional: [
    {
      name: 'anonymous',
      description: 'Anonymous contribution (no user attribution)',
      color: '6f42c1', // Purple
    },
    {
      name: 'documentation',
      description: 'Documentation updates or improvements',
      color: '0075ca', // Blue
    },
    {
      name: 'automated',
      description: 'Created and managed by automation',
      color: 'e99695', // Light red
    },
  ],
};

/**
 * Get all wiki labels in flat array
 */
export const getAllWikiLabels = () => {
  return [
    ...WIKI_LABELS.types,
    ...WIKI_LABELS.sections,
    ...WIKI_LABELS.status,
    ...WIKI_LABELS.additional,
  ];
};

/**
 * Check if a label exists
 */
export const labelExists = async (owner, repo, labelName) => {
  const octokit = getOctokit();

  try {
    await octokit.rest.issues.getLabel({
      owner,
      repo,
      name: labelName,
    });
    return true;
  } catch (error) {
    if (error.status === 404) {
      return false;
    }
    throw error;
  }
};

/**
 * Create a single label
 */
export const createLabel = async (owner, repo, label) => {
  const octokit = getOctokit();

  try {
    await octokit.rest.issues.createLabel({
      owner,
      repo,
      name: label.name,
      description: label.description,
      color: label.color,
    });

    console.log(`[Labels] Created label: ${label.name}`);
    return true;
  } catch (error) {
    if (error.status === 422) {
      // Label already exists
      console.log(`[Labels] Label already exists: ${label.name}`);
      return false;
    }
    console.error(`[Labels] Failed to create label ${label.name}:`, error.message);
    throw error;
  }
};

/**
 * Ensure all wiki labels exist
 * Creates missing labels, skips existing ones
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string[]} allowedBranches - Optional list of allowed branches for namespace labels
 */
export const ensureAllWikiLabels = async (owner, repo, allowedBranches = []) => {
  console.log(`\n${'='.repeat(60)}`);
  console.log('[Labels] Ensuring all wiki labels exist...');
  console.log(`${'='.repeat(60)}\n`);

  const allLabels = getAllWikiLabels();
  let created = 0;
  let existing = 0;
  let failed = 0;

  for (const label of allLabels) {
    try {
      const exists = await labelExists(owner, repo, label.name);

      if (!exists) {
        await createLabel(owner, repo, label);
        created++;
      } else {
        existing++;
      }
    } catch (error) {
      console.error(`[Labels] Error with label ${label.name}:`, error.message);
      failed++;
    }
  }

  // Create branch labels if allowedBranches provided
  if (allowedBranches && allowedBranches.length > 0) {
    const branchResult = await ensureBranchLabels(owner, repo, allowedBranches);
    created += branchResult.created;
    existing += branchResult.existing;
  }

  console.log(`\n${'='.repeat(60)}`);
  console.log(`[Labels] Summary:`);
  console.log(`[Labels] - Created: ${created}`);
  console.log(`[Labels] - Already existed: ${existing}`);
  console.log(`[Labels] - Failed: ${failed}`);
  console.log(`[Labels] - Total: ${allLabels.length + (allowedBranches?.length || 0)}`);
  console.log(`${'='.repeat(60)}\n`);

  return { created, existing, failed, total: allLabels.length + (allowedBranches?.length || 0) };
};

/**
 * Get section label name from section ID
 */
export const getSectionLabel = (sectionId) => {
  return `section:${sectionId}`;
};

/**
 * Get labels for anonymous edit request
 * @param {string} sectionId - Section identifier
 * @param {string|null} branch - Branch name for namespace (optional)
 */
export const getAnonymousEditLabels = (sectionId, branch = null) => {
  const labels = [
    'wiki:anonymous-edit',
    'wiki:edit',
    getSectionLabel(sectionId),
    'anonymous',
    'automated',
    'status:processing',
  ];

  if (branch) {
    labels.push(`branch:${branch}`);
  }

  return labels;
};

/**
 * Get labels for wiki comment
 * @param {string} sectionId - Section identifier
 * @param {string|null} branch - Branch name for namespace (optional)
 */
export const getWikiCommentLabels = (sectionId, branch = null) => {
  const labels = [
    'wiki:comment',
    'wiki-comments',
    getSectionLabel(sectionId),
    'automated',
  ];

  if (branch) {
    labels.push(`branch:${branch}`);
  }

  return labels;
};

/**
 * Update issue labels (add status label, remove old status)
 */
export const updateIssueStatus = async (owner, repo, issueNumber, newStatus) => {
  const octokit = getOctokit();

  try {
    // Get current labels
    const { data: issue } = await octokit.rest.issues.get({
      owner,
      repo,
      issue_number: issueNumber,
    });

    const currentLabels = issue.labels.map(l => l.name);

    // Remove old status labels
    const statusLabels = ['status:processing', 'status:completed', 'status:failed'];
    const labelsToKeep = currentLabels.filter(l => !statusLabels.includes(l));

    // Add new status label
    const newLabels = [...labelsToKeep, `status:${newStatus}`];

    // Update labels
    await octokit.rest.issues.setLabels({
      owner,
      repo,
      issue_number: issueNumber,
      labels: newLabels,
    });

    console.log(`[Labels] Updated issue #${issueNumber} status to: ${newStatus}`);
    return true;
  } catch (error) {
    console.error(`[Labels] Failed to update issue status:`, error.message);
    return false;
  }
};

/**
 * Generate branch labels from allowed branches list
 * @param {string[]} allowedBranches - List of allowed branch names
 * @returns {Array} Array of label objects
 */
export const generateBranchLabels = (allowedBranches) => {
  const branchColors = {
    main: '0e8a16',    // Green
    dev: '0075ca',     // Blue
    staging: 'fbca04', // Yellow
  };

  return allowedBranches.map(branch => ({
    name: `branch:${branch}`,
    description: `Items for ${branch} branch namespace`,
    color: branchColors[branch] || 'bfd4f2', // Default light blue
  }));
};

/**
 * Ensure branch labels exist
 * @param {string} owner - Repository owner
 * @param {string} repo - Repository name
 * @param {string[]} allowedBranches - List of allowed branches
 * @returns {Promise<{created: number, existing: number}>}
 */
export const ensureBranchLabels = async (owner, repo, allowedBranches) => {
  console.log('[Labels] Ensuring branch labels exist...');

  const branchLabels = generateBranchLabels(allowedBranches);
  let created = 0;
  let existing = 0;

  for (const label of branchLabels) {
    try {
      const exists = await labelExists(owner, repo, label.name);
      if (!exists) {
        await createLabel(owner, repo, label);
        created++;
      } else {
        existing++;
      }
    } catch (error) {
      console.error(`[Labels] Error with branch label ${label.name}:`, error.message);
    }
  }

  console.log(`[Labels] Branch labels: ${created} created, ${existing} existing`);
  return { created, existing };
};
