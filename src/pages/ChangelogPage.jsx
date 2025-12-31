import { useState, useEffect } from 'react';
import { useWikiConfig } from '../hooks/useWikiConfig';
import { getChangelog } from '../services/github/changelog';
import LoadingSpinner from '../components/common/LoadingSpinner';
import ProfilePicture from '../components/common/ProfilePicture';
import DisplayName from '../components/common/DisplayName';
import { createLogger } from '../utils/logger';

const logger = createLogger('ChangelogPage');

// Constants
const MAX_COMMITS_PER_SECTION = 10; // Show max 10 commits per section before truncating
const MAX_TITLE_LENGTH = 100; // Truncate commit titles longer than this
const MAX_DESCRIPTION_LENGTH = 300; // Truncate commit descriptions longer than this
const MAX_GROUPED_COMMITS_DISPLAY = 5; // Show max 5 commits in a group before truncating
const MAX_LIST_ITEMS_DISPLAY = 5; // Show max 5 list items before truncating

/**
 * Sanitize commit message to remove sensitive or unnecessary information
 * @param {string} message - Raw commit message
 * @returns {string} Sanitized commit message
 */
function sanitizeCommitMessage(message) {
  let sanitized = message;

  // Remove email addresses (Email: xxx@xxx.com or just email addresses)
  sanitized = sanitized.replace(/Email:\s*[^\s@]+@[^\s@]+\.[^\s@]+/gi, '[Email removed]');
  sanitized = sanitized.replace(/\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g, '[Email removed]');

  // Remove password/token/api key references
  sanitized = sanitized.replace(/Password:\s*\S+/gi, '[Password removed]');
  sanitized = sanitized.replace(/Token:\s*\S+/gi, '[Token removed]');
  sanitized = sanitized.replace(/API[_\s]?Key:\s*\S+/gi, '[API Key removed]');
  sanitized = sanitized.replace(/Secret:\s*\S+/gi, '[Secret removed]');
  sanitized = sanitized.replace(/Bearer\s+\S+/gi, '[Token removed]');

  // Remove credit card patterns (simple pattern: 4+ digits groups)
  sanitized = sanitized.replace(/\b\d{4}[\s-]?\d{4}[\s-]?\d{4}[\s-]?\d{4}\b/g, '[Card removed]');

  // Remove phone numbers (common patterns)
  sanitized = sanitized.replace(/Phone:\s*[\d\s\-\(\)]+/gi, '[Phone removed]');
  sanitized = sanitized.replace(/\b\d{3}[-.\s]?\d{3}[-.\s]?\d{4}\b/g, '[Phone removed]');

  // Remove IP addresses
  sanitized = sanitized.replace(/\b\d{1,3}\.\d{1,3}\.\d{1,3}\.\d{1,3}\b/g, '[IP removed]');

  // Remove Co-Authored-By lines (GitHub convention, already shown in author field)
  sanitized = sanitized.replace(/Co-authored-by:.*$/gim, '');

  // Remove Signed-off-by lines
  sanitized = sanitized.replace(/Signed-off-by:.*$/gim, '');

  // Remove generic "Generated with Claude Code" footers
  sanitized = sanitized.replace(/🤖 Generated with \[Claude Code\].*$/gim, '');

  // Remove CI command postfixes (e.g., [skip tests], [no-ci], [skip-tests])
  sanitized = sanitized.replace(/\s+\[[^\]]+\]\s*$/gim, '');

  // Remove multiple consecutive blank lines
  sanitized = sanitized.replace(/\n\s*\n\s*\n/g, '\n\n');

  // Trim leading and trailing spaces from each line
  sanitized = sanitized.split('\n').map(line => line.trim()).join('\n');

  // Trim extra whitespace from entire message
  sanitized = sanitized.trim();

  // Capitalize first letter of message and first letter after newlines
  if (sanitized.length > 0) {
    // Capitalize first character
    sanitized = sanitized.charAt(0).toUpperCase() + sanitized.slice(1);

    // Capitalize first character after newlines
    sanitized = sanitized.replace(/\n(.)/g, (match, char) => '\n' + char.toUpperCase());
  }

  return sanitized;
}

/**
 * Check if text contains list-style formatting (lines starting with * or -)
 * @param {string} text - Text to check
 * @returns {boolean} True if text has list formatting
 */
function hasListFormatting(text) {
  const lines = text.split('\n').filter(line => line.trim().length > 0);
  return lines.some(line => /^\s*[-*]\s+/.test(line));
}

/**
 * Parse list items from text
 * @param {string} text - Text with list formatting
 * @returns {Array} Array of list item strings
 */
function parseListItems(text) {
  const lines = text.split('\n');
  const items = [];

  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.length === 0) continue;

    // Check if line starts with * or -
    const match = trimmed.match(/^[-*]\s+(.+)$/);
    if (match) {
      const itemText = match[1].trim();

      // Exclude separator lines (e.g., ---------, ********, =========, etc.)
      const isSeparator = /^[-*_=]{2,}$/.test(itemText);
      if (!isSeparator && itemText.length > 0) {
        items.push(itemText);
      }
    } else {
      // Also check if the whole line is a separator
      const isSeparator = /^[-*_=]{2,}$/.test(trimmed);
      if (!isSeparator && trimmed.length > 0) {
        items.push(trimmed);
      }
    }
  }

  // Filter out any empty items that might have slipped through
  return items.filter(item => item && item.trim().length > 0);
}

/**
 * Group consecutive single-line commits from the same author
 * @param {Array} commits - Array of commit objects
 * @returns {Array} Array of grouped commit objects
 */
function groupCommitsByAuthor(commits) {
  if (!commits || commits.length === 0) return [];

  const grouped = [];
  let i = 0;

  while (i < commits.length) {
    const commit = commits[i];
    const lines = commit.message.split('\n');
    const description = lines.slice(1).join('\n').trim();
    const isSingleLine = description === '';

    // If single-line commit, check if we can merge with next commits
    if (isSingleLine) {
      const group = {
        isGroup: false,
        author: commit.author,
        commits: [commit],
        stats: {
          additions: commit.stats.additions,
          deletions: commit.stats.deletions,
          total: commit.stats.total,
        },
        startDate: commit.date,
        endDate: commit.date,
      };

      // Look ahead for more single-line commits from same author
      let j = i + 1;
      while (j < commits.length) {
        const nextCommit = commits[j];
        const nextLines = nextCommit.message.split('\n');
        const nextDescription = nextLines.slice(1).join('\n').trim();
        const nextIsSingleLine = nextDescription === '';

        // Check if next commit is single-line and from same author
        if (nextIsSingleLine && nextCommit.author.login === commit.author.login) {
          group.commits.push(nextCommit);
          group.stats.additions += nextCommit.stats.additions;
          group.stats.deletions += nextCommit.stats.deletions;
          group.stats.total += nextCommit.stats.total;
          group.endDate = nextCommit.date;
          group.isGroup = true; // Mark as group if we found at least 2 commits
          j++;
        } else {
          break;
        }
      }

      // Deduplicate commits with same message (case-insensitive)
      if (group.commits.length > 1) {
        const seenMessages = new Map();
        const uniqueCommits = [];

        for (const commit of group.commits) {
          const sanitizedMessage = sanitizeCommitMessage(commit.message);
          const messageLower = sanitizedMessage.split('\n')[0].trim().toLowerCase();

          if (!seenMessages.has(messageLower)) {
            seenMessages.set(messageLower, true);
            uniqueCommits.push(commit);
          }
        }

        group.commits = uniqueCommits;
      }

      grouped.push(group);
      i = j; // Skip all merged commits
    } else {
      // Multi-line commit - add as single commit
      grouped.push({
        isGroup: false,
        author: commit.author,
        commits: [commit],
        stats: commit.stats,
        startDate: commit.date,
        endDate: commit.date,
      });
      i++;
    }
  }

  return grouped;
}

/**
 * ChangelogPage - Display weekly site and wiki updates
 * Shows commits grouped by week, separated into site updates and wiki content updates
 */
const ChangelogPage = () => {
  const { config } = useWikiConfig();
  const [weeks, setWeeks] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [weeksToShow, setWeeksToShow] = useState(4);
  const [expandedSections, setExpandedSections] = useState({});
  const [filter, setFilter] = useState('all'); // 'all', 'site', 'wiki'

  useEffect(() => {
    const loadChangelog = async () => {
      if (!config?.wiki?.repository) {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { owner, repo } = config.wiki.repository;
        logger.debug('Loading changelog', { owner, repo, weeksToShow });

        const weekData = await getChangelog(owner, repo, weeksToShow);
        setWeeks(weekData);

        logger.info('Changelog loaded', { weeks: weekData.length });
      } catch (err) {
        logger.error('Failed to load changelog', { error: err });
        setError('Failed to load changelog. Please try again later.');
      } finally {
        setLoading(false);
      }
    };

    loadChangelog();
  }, [config, weeksToShow]);

  const handleLoadMore = () => {
    setWeeksToShow(prev => prev + 4);
  };

  const toggleSection = (weekKey, sectionType) => {
    const key = `${weekKey}-${sectionType}`;
    setExpandedSections(prev => ({
      ...prev,
      [key]: !prev[key]
    }));
  };

  const isSectionExpanded = (weekKey, sectionType) => {
    const key = `${weekKey}-${sectionType}`;
    return expandedSections[key] || false;
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading changelog...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto px-4 sm:px-6">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
            Error Loading Changelog
          </h3>
          <p className="text-red-700 dark:text-red-300">{error}</p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-4xl mx-auto px-4 sm:px-6 py-8">
      {/* Header */}
      <div className="mb-8">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          📋 Changelog
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Recent updates to the site and wiki content
        </p>
      </div>

      {/* Filter Buttons */}
      <div className="mb-6 flex items-center gap-2 flex-wrap">
        <span className="text-sm font-medium text-gray-700 dark:text-gray-300 mr-2">
          Show:
        </span>
        <button
          onClick={() => setFilter('all')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors ${
            filter === 'all'
              ? 'bg-blue-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          All Updates
        </button>
        <button
          onClick={() => setFilter('site')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
            filter === 'site'
              ? 'bg-purple-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
          </svg>
          Site Updates
        </button>
        <button
          onClick={() => setFilter('wiki')}
          className={`px-4 py-2 text-sm font-medium rounded-lg transition-colors flex items-center gap-2 ${
            filter === 'wiki'
              ? 'bg-green-600 text-white'
              : 'bg-gray-100 dark:bg-gray-800 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700'
          }`}
        >
          <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
          </svg>
          Wiki Content
        </button>
      </div>

      {/* Weeks */}
      {weeks.length === 0 ? (
        <div className="bg-gray-50 dark:bg-gray-800 rounded-lg p-12 text-center">
          <div className="text-gray-400 text-6xl mb-4">📝</div>
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-2">
            No Updates Yet
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            No commits found in the selected time range.
          </p>
        </div>
      ) : (
        <div className="space-y-12">
          {weeks.map((week, weekIndex) => (
            <div key={week.weekStart.toISOString()} className="relative">
              {/* Week Header */}
              <div className="sticky top-0 z-10 bg-white dark:bg-gray-900 border-b-2 border-blue-500 pb-2 mb-6">
                <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
                  {week.weekLabel}
                </h2>
                <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                  {(() => {
                    let count = 0;
                    if (filter === 'all') {
                      count = week.siteUpdates.length + week.wikiUpdates.length;
                    } else if (filter === 'site') {
                      count = week.siteUpdates.length;
                    } else if (filter === 'wiki') {
                      count = week.wikiUpdates.length;
                    }
                    return `${count} update${count !== 1 ? 's' : ''}`;
                  })()}
                </p>
              </div>

              {/* Site Updates Section */}
              {week.siteUpdates.length > 0 && (filter === 'all' || filter === 'site') && (
                <div className="mb-8">
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center justify-center w-8 h-8 bg-purple-100 dark:bg-purple-900/30 rounded-lg">
                      <svg className="w-5 h-5 text-purple-600 dark:text-purple-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 20l4-16m4 4l4 4-4 4M6 16l-4-4 4-4" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Site Updates
                    </h3>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ({week.siteUpdates.length})
                    </span>
                  </div>

                  <div className="space-y-3">
                    {(() => {
                      const weekKey = week.weekStart.toISOString();
                      const isExpanded = isSectionExpanded(weekKey, 'site');
                      const groupedCommits = groupCommitsByAuthor(week.siteUpdates);
                      const commitsToShow = isExpanded ? groupedCommits : groupedCommits.slice(0, MAX_COMMITS_PER_SECTION);
                      const hasMore = groupedCommits.length > MAX_COMMITS_PER_SECTION;

                      return (
                        <>
                          {commitsToShow.map((group) => (
                            <CommitCard key={group.commits[0].sha} group={group} />
                          ))}
                          {hasMore && (
                            <button
                              onClick={() => toggleSection(weekKey, 'site')}
                              className="w-full py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                            >
                              {isExpanded ? (
                                <>Show Less ↑</>
                              ) : (
                                <>Show {groupedCommits.length - MAX_COMMITS_PER_SECTION} More ↓</>
                              )}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Wiki Updates Section */}
              {week.wikiUpdates.length > 0 && (filter === 'all' || filter === 'wiki') && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="flex items-center justify-center w-8 h-8 bg-green-100 dark:bg-green-900/30 rounded-lg">
                      <svg className="w-5 h-5 text-green-600 dark:text-green-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 6.253v13m0-13C10.832 5.477 9.246 5 7.5 5S4.168 5.477 3 6.253v13C4.168 18.477 5.754 18 7.5 18s3.332.477 4.5 1.253m0-13C13.168 5.477 14.754 5 16.5 5c1.747 0 3.332.477 4.5 1.253v13C19.832 18.477 18.247 18 16.5 18c-1.746 0-3.332.477-4.5 1.253" />
                      </svg>
                    </div>
                    <h3 className="text-lg font-semibold text-gray-900 dark:text-white">
                      Wiki Content Updates
                    </h3>
                    <span className="text-sm text-gray-500 dark:text-gray-400">
                      ({week.wikiUpdates.length})
                    </span>
                  </div>

                  <div className="space-y-3">
                    {(() => {
                      const weekKey = week.weekStart.toISOString();
                      const isExpanded = isSectionExpanded(weekKey, 'wiki');
                      const groupedCommits = groupCommitsByAuthor(week.wikiUpdates);
                      const commitsToShow = isExpanded ? groupedCommits : groupedCommits.slice(0, MAX_COMMITS_PER_SECTION);
                      const hasMore = groupedCommits.length > MAX_COMMITS_PER_SECTION;

                      return (
                        <>
                          {commitsToShow.map((group) => (
                            <CommitCard key={group.commits[0].sha} group={group} isWiki />
                          ))}
                          {hasMore && (
                            <button
                              onClick={() => toggleSection(weekKey, 'wiki')}
                              className="w-full py-2 text-sm font-medium text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 transition-colors"
                            >
                              {isExpanded ? (
                                <>Show Less ↑</>
                              ) : (
                                <>Show {groupedCommits.length - MAX_COMMITS_PER_SECTION} More ↓</>
                              )}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>
                </div>
              )}

              {/* Show separator if not last week */}
              {weekIndex < weeks.length - 1 && (
                <div className="mt-12 border-t border-gray-200 dark:border-gray-700"></div>
              )}
            </div>
          ))}
        </div>
      )}

      {/* Load More Button */}
      {weeks.length > 0 && (
        <div className="mt-8 text-center">
          <button
            onClick={handleLoadMore}
            className="px-6 py-3 text-sm font-medium text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-600 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            Load More Weeks
          </button>
        </div>
      )}
    </div>
  );
};

/**
 * CommitCard - Display individual commit or grouped commits information
 */
const CommitCard = ({ group, isWiki = false }) => {
  const [isExpanded, setIsExpanded] = useState(false);

  const isGroup = group.isGroup;
  const commit = group.commits[0]; // First commit for single commits or groups

  // For single commits, extract title and description
  let title, description, needsTruncation, descriptionHasList, descriptionListItems;
  if (!isGroup) {
    const sanitizedMessage = sanitizeCommitMessage(commit.message);
    const lines = sanitizedMessage.split('\n');
    let rawTitle = lines[0];

    // Remove list marker from title if present
    const titleMatch = rawTitle.match(/^\s*[-*]\s+(.+)$/);
    if (titleMatch) {
      title = titleMatch[1].trim();
      // Capitalize first letter
      if (title.length > 0) {
        title = title.charAt(0).toUpperCase() + title.slice(1);
      }
    } else {
      title = rawTitle;
    }

    // Ensure title is not empty after processing
    if (!title || title.trim().length === 0) {
      title = 'Update';
    }

    description = lines.slice(1).join('\n').trim();
    needsTruncation = description.length > MAX_DESCRIPTION_LENGTH;

    // Check if description has list formatting
    descriptionHasList = hasListFormatting(description);
    if (descriptionHasList) {
      const items = parseListItems(description).map(item => {
        // Capitalize first letter of each list item
        if (item.length > 0) {
          return item.charAt(0).toUpperCase() + item.slice(1);
        }
        return item;
      });

      // Deduplicate list items (case-insensitive)
      const seenItems = new Map();
      descriptionListItems = [];
      for (const item of items) {
        // Skip empty items
        if (!item || item.trim().length === 0) continue;

        const itemLower = item.toLowerCase();
        if (!seenItems.has(itemLower)) {
          seenItems.set(itemLower, true);
          descriptionListItems.push(item);
        }
      }

      // If all items were filtered out, treat as no list
      if (descriptionListItems.length === 0) {
        descriptionHasList = false;
      }
    }
  }

  // For grouped commits, check if all are list-style
  let groupHasListFormat = false;
  if (isGroup) {
    groupHasListFormat = group.commits.every(c => {
      const sanitizedMessage = sanitizeCommitMessage(c.message);
      const commitTitle = sanitizedMessage.split('\n')[0];
      return /^\s*[-*]\s+/.test(commitTitle);
    });
  }

  // Format date (use start date for groups, commit date for single)
  const dateStr = group.startDate.toLocaleDateString('en-US', {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });

  // Build commit URL (range for groups, single for individual)
  const commitUrl = isGroup
    ? `${group.commits[0].url.split('/commit/')[0]}/compare/${group.commits[group.commits.length - 1].sha}...${group.commits[0].sha}`
    : commit.url;

  return (
    <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 hover:border-blue-500 dark:hover:border-blue-500 transition-colors">
      <div className="flex items-start gap-3">
        {/* Author Avatar with Custom Profile Picture Support */}
        <ProfilePicture
          username={group.author.login}
          userId={group.author.id}
          avatarUrl={group.author.avatar_url}
          size="sm"
          showBadge={false}
          className="flex-shrink-0"
        />

        {/* Commit Info */}
        <div className="flex-1 min-w-0">
          {/* Title or Grouped Messages */}
          {isGroup ? (
            <div className="space-y-1">
              <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                {(() => {
                  // Process ALL commits first for deduplication
                  const seenMessages = new Map();
                  const allUniqueCommits = [];

                  for (const c of group.commits) {
                    const sanitizedMessage = sanitizeCommitMessage(c.message);
                    const commitTitle = sanitizedMessage.split('\n')[0];

                    // Strip list marker if all commits are list-style
                    let displayText = groupHasListFormat
                      ? commitTitle.replace(/^\s*[-*]\s+/, '')
                      : commitTitle;

                    // Capitalize first letter
                    if (displayText.length > 0) {
                      displayText = displayText.charAt(0).toUpperCase() + displayText.slice(1);
                    }

                    // Skip empty items
                    if (!displayText || displayText.trim().length === 0) continue;

                    // Deduplicate (case-insensitive)
                    const textLower = displayText.toLowerCase();
                    if (!seenMessages.has(textLower)) {
                      seenMessages.set(textLower, true);
                      allUniqueCommits.push({ sha: c.sha, text: displayText });
                    }
                  }

                  // Now apply truncation to the deduplicated list
                  const itemsToShow = isExpanded ? allUniqueCommits : allUniqueCommits.slice(0, MAX_LIST_ITEMS_DISPLAY);

                  return itemsToShow.filter(item => item.text && item.text.trim().length > 0).map((item) => (
                    <li key={item.sha} className="ml-1">
                      {item.text}
                    </li>
                  ));
                })()}
              </ul>
              {(() => {
                // Process ALL commits first for deduplication (repeat logic to get allUniqueCommits)
                const seenMessages = new Map();
                const allUniqueCommits = [];

                for (const c of group.commits) {
                  const sanitizedMessage = sanitizeCommitMessage(c.message);
                  const commitTitle = sanitizedMessage.split('\n')[0];

                  let displayText = groupHasListFormat
                    ? commitTitle.replace(/^\s*[-*]\s+/, '')
                    : commitTitle;

                  if (displayText.length > 0) {
                    displayText = displayText.charAt(0).toUpperCase() + displayText.slice(1);
                  }

                  if (!displayText || displayText.trim().length === 0) continue;

                  const textLower = displayText.toLowerCase();
                  if (!seenMessages.has(textLower)) {
                    seenMessages.set(textLower, true);
                    allUniqueCommits.push({ sha: c.sha, text: displayText });
                  }
                }

                const hasMoreItems = allUniqueCommits.length > MAX_LIST_ITEMS_DISPLAY;
                if (!hasMoreItems) return null;

                return (
                  <button
                    onClick={() => setIsExpanded(!isExpanded)}
                    className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 flex items-center gap-1 ml-6"
                  >
                    {isExpanded ? (
                      <>
                        Show less
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                        </svg>
                      </>
                    ) : (
                      <>
                        +{allUniqueCommits.length - MAX_LIST_ITEMS_DISPLAY} more items
                        <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                      </>
                    )}
                  </button>
                );
              })()}
            </div>
          ) : (
            <>
              <h4 className="text-base font-medium text-gray-900 dark:text-white mb-1">
                {title}
              </h4>

              {/* Description (if exists) with gradient fade and expansion */}
              {description && (
                <div className="relative mt-2">
                  {descriptionHasList ? (
                    // Render as list if description has list formatting
                    <>
                      <ul className="list-disc list-inside space-y-1 text-sm text-gray-600 dark:text-gray-400">
                        {(() => {
                          const itemsToShow = isExpanded ? descriptionListItems : descriptionListItems.slice(0, MAX_LIST_ITEMS_DISPLAY);
                          return itemsToShow.filter(item => item && item.trim().length > 0).map((item, idx) => (
                            <li key={idx} className="ml-1">
                              {item}
                            </li>
                          ));
                        })()}
                      </ul>
                      {(() => {
                        const hasMoreItems = descriptionListItems.length > MAX_LIST_ITEMS_DISPLAY;
                        if (!hasMoreItems) return null;

                        return (
                          <button
                            onClick={() => setIsExpanded(!isExpanded)}
                            className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 flex items-center gap-1 ml-6"
                          >
                            {isExpanded ? (
                              <>
                                Show less
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                                </svg>
                              </>
                            ) : (
                              <>
                                +{descriptionListItems.length - MAX_LIST_ITEMS_DISPLAY} more items
                                <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                                </svg>
                              </>
                            )}
                          </button>
                        );
                      })()}
                    </>
                  ) : (
                    // Regular text rendering with truncation
                    <>
                      <div
                        className={`text-sm text-gray-600 dark:text-gray-400 whitespace-pre-wrap overflow-hidden transition-all duration-200 ${
                          isExpanded ? 'max-h-none' : 'max-h-[4.5rem]'
                        }`}
                        style={!isExpanded && needsTruncation ? {
                          maskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)',
                          WebkitMaskImage: 'linear-gradient(to bottom, black 50%, transparent 100%)'
                        } : {}}
                      >
                        {description}
                      </div>
                      {needsTruncation && (
                        <button
                          onClick={() => setIsExpanded(!isExpanded)}
                          className="text-xs text-blue-600 dark:text-blue-400 hover:underline mt-1 flex items-center gap-1 relative z-10"
                        >
                          {isExpanded ? (
                            <>
                              Show less
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 15l7-7 7 7" />
                              </svg>
                            </>
                          ) : (
                            <>
                              Show more
                              <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                              </svg>
                            </>
                          )}
                        </button>
                      )}
                    </>
                  )}
                </div>
              )}
            </>
          )}

          {/* Metadata */}
          <div className="flex flex-wrap items-center gap-3 text-xs text-gray-500 dark:text-gray-400 mt-2">
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
              </svg>
              <DisplayName
                username={group.author.login}
                userId={group.author.id}
                className="text-xs"
              />
            </span>
            <span className="flex items-center gap-1">
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
              {dateStr}
            </span>
            {isGroup && (
              <span className="flex items-center gap-1 text-blue-600 dark:text-blue-400 font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 20l4-16m2 16l4-16M6 9h14M4 15h14" />
                </svg>
                {group.commits.length} commits
              </span>
            )}
            <span className="flex items-center gap-1">
              <span className="text-green-600 dark:text-green-400">+{group.stats.additions}</span>
              <span className="text-red-600 dark:text-red-400">-{group.stats.deletions}</span>
            </span>
            <a
              href={commitUrl}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center gap-1 hover:text-blue-600 dark:hover:text-blue-400 transition-colors"
            >
              <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
              </svg>
              {isGroup ? 'View commits' : 'View commit'}
            </a>
          </div>
        </div>
      </div>
    </div>
  );
};

export default ChangelogPage;
