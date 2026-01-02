import React, { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { formatDistance } from 'date-fns';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAuthStore } from '../../store/authStore';
import { useDisplayNames } from '../../hooks/useDisplayName';
import PrestigeAvatar from '../common/PrestigeAvatar';
import LoadingSpinner from '../common/LoadingSpinner';
import UserActionMenu from '../common/UserActionMenu';
import {
  findPageIssue,
  getOrCreatePageIssue,
  getIssueComments,
  createIssueComment,
  addCommentReaction,
  deleteCommentReaction,
  getCommentReactions,
} from '../../services/github/comments';
import { detectCurrentBranch } from '../../services/github/branchNamespace';
import { isBanned } from '../../services/github/admin';
import { addAdmin } from '../../services/adminActions';

/**
 * Comments component using GitHub Issues
 * Shows comments for a wiki page with reaction support
 */
const Comments = ({ pageTitle, sectionId, pageId }) => {
  const { config } = useWikiConfig();
  const { isAuthenticated, user } = useAuthStore();

  const [issue, setIssue] = useState(null);
  const [comments, setComments] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [newComment, setNewComment] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [commentReactions, setCommentReactions] = useState({});
  const [reactionLoading, setReactionLoading] = useState({});
  const [userIsBanned, setUserIsBanned] = useState(false);

  // Reply and edit state
  const [replyingTo, setReplyingTo] = useState(null); // {id, username, body, user}
  const replyTextareaRef = useRef(null);
  const [editingComment, setEditingComment] = useState(null); // {id, body}
  const [editedBody, setEditedBody] = useState('');

  // Extract unique comment authors for display name fetching
  const commentAuthors = useMemo(() =>
    comments.map(c => ({ id: c.user.id, login: c.user.login })),
    [comments]
  );
  const { displayNames } = useDisplayNames(commentAuthors);

  // User action menu state
  const [showUserActionMenu, setShowUserActionMenu] = useState(false);
  const [selectedUser, setSelectedUser] = useState(null);
  const [userMenuPosition, setUserMenuPosition] = useState({ x: 0, y: 0 });

  // Lazy loading state
  const [currentPage, setCurrentPage] = useState(1);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const sentinelRef = useRef(null);
  const PER_PAGE = 10;

  // Rate limiting state
  const reactionTimestamps = useRef([]);
  const commentTimestamps = useRef([]);

  const REACTION_RATE_LIMIT = {
    perSecond: 1,       // Max 1 reaction per second
    perMinute: 10,      // Max 10 reactions per minute
    cooldownMs: 1000,   // 1 second cooldown between reactions
  };

  const COMMENT_RATE_LIMIT = {
    perMinute: 5,       // Max 5 comments per minute
    per5Minutes: 10,    // Max 10 comments per 5 minutes
    cooldownMs: 5000,   // 5 second cooldown between comments
  };

  // Use configured production URL if available, otherwise fall back to current location
  const baseUrl = config?.wiki?.url || window.location.origin;
  const pageUrl = `${baseUrl}/${sectionId}/${pageId}`;

  // DEV: Enable fake comments for testing lazy loading (development only)
  const ENABLE_FAKE_COMMENTS = false; // Set to true to enable fake test data
  const FAKE_COMMENT_ID_START = 8000000; // Fake comment IDs start from this number

  // Issue caching helpers (fixes GitHub search API indexing delay)
  const getIssueCacheKey = (owner, repo, sectionId, pageId, branch) => {
    return `wiki-issue:${owner}/${repo}/${sectionId}/${pageId}/${branch}`;
  };

  const getCachedIssueNumber = (owner, repo, sectionId, pageId, branch) => {
    try {
      const key = getIssueCacheKey(owner, repo, sectionId, pageId, branch);
      const cached = sessionStorage.getItem(key);
      return cached ? parseInt(cached, 10) : null;
    } catch (err) {
      console.warn('[Comments] Failed to get cached issue number:', err);
      return null;
    }
  };

  const cacheIssueNumber = (owner, repo, sectionId, pageId, branch, issueNumber) => {
    try {
      const key = getIssueCacheKey(owner, repo, sectionId, pageId, branch);
      sessionStorage.setItem(key, String(issueNumber));
      console.log(`[Comments] Cached issue #${issueNumber} for page`);
    } catch (err) {
      console.warn('[Comments] Failed to cache issue number:', err);
    }
  };

  // Cache TTL configuration based on authentication status
  const CACHE_TTL = {
    // Authenticated users get shorter cache (they can see updates faster)
    authenticated: {
      comments: 3 * 60 * 1000,   // 3 minutes
      reactions: 2 * 60 * 1000,  // 2 minutes
    },
    // Anonymous users get longer cache (reduces API calls, they can't interact anyway)
    anonymous: {
      comments: 15 * 60 * 1000,  // 15 minutes
      reactions: 10 * 60 * 1000, // 10 minutes
    }
  };

  // Get appropriate cache TTL based on authentication status
  const getCacheTTL = (type) => {
    return isAuthenticated
      ? CACHE_TTL.authenticated[type]
      : CACHE_TTL.anonymous[type];
  };

  // Comment caching helpers (reduces API calls for comment lists)
  const getCommentsCacheKey = (issueNumber, page) => {
    return `cache:comments:${issueNumber}:page:${page}`;
  };

  const getCachedComments = (issueNumber, page) => {
    try {
      const key = getCommentsCacheKey(issueNumber, page);
      const cached = localStorage.getItem(key);
      if (cached) {
        const { comments, hasMore, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        const ttl = getCacheTTL('comments');

        if (age < ttl) {
          console.log(`[Comments] Using cached comments for issue #${issueNumber} page ${page} (age: ${Math.round(age / 1000)}s, auth: ${isAuthenticated})`);
          return { comments, hasMore };
        } else {
          console.log(`[Comments] Cache expired for issue #${issueNumber} page ${page} (age: ${Math.round(age / 1000)}s > ttl: ${Math.round(ttl / 1000)}s)`);
        }
      }
      return null;
    } catch (err) {
      console.warn('[Comments] Failed to get cached comments:', err);
      return null;
    }
  };

  const cacheComments = (issueNumber, page, comments, hasMore) => {
    try {
      const key = getCommentsCacheKey(issueNumber, page);
      const data = {
        comments,
        hasMore,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(data));
      console.log(`[Comments] Cached ${comments.length} comments for issue #${issueNumber} page ${page}`);
    } catch (err) {
      console.warn('[Comments] Failed to cache comments:', err);
    }
  };

  // Invalidate comment cache when a new comment is posted
  const invalidateCommentCache = (issueNumber) => {
    try {
      const keys = Object.keys(localStorage);
      const prefix = `cache:comments:${issueNumber}:`;
      keys.forEach(key => {
        if (key.startsWith(prefix)) {
          localStorage.removeItem(key);
          console.log(`[Comments] Invalidated cache: ${key}`);
        }
      });
    } catch (err) {
      console.warn('[Comments] Failed to invalidate comment cache:', err);
    }
  };

  // Reaction caching helpers (prevents stale reactions after page reload)
  const getReactionsCacheKey = (commentId) => {
    return `cache:reactions:${commentId}`;
  };

  const getCachedReactions = (commentId) => {
    try {
      const key = getReactionsCacheKey(commentId);
      const cached = localStorage.getItem(key);
      if (cached) {
        const { reactions, timestamp } = JSON.parse(cached);
        const age = Date.now() - timestamp;
        const ttl = getCacheTTL('reactions');

        if (age < ttl) {
          console.log(`[Comments] Using cached reactions for comment ${commentId} (age: ${Math.round(age / 1000)}s, auth: ${isAuthenticated})`);
          return reactions;
        } else {
          console.log(`[Comments] Reaction cache expired for comment ${commentId} (age: ${Math.round(age / 1000)}s > ttl: ${Math.round(ttl / 1000)}s)`);
        }
      }
      return null;
    } catch (err) {
      console.warn('[Comments] Failed to get cached reactions:', err);
      return null;
    }
  };

  const cacheReactions = (commentId, reactions) => {
    try {
      const key = getReactionsCacheKey(commentId);
      const data = {
        reactions,
        timestamp: Date.now(),
      };
      localStorage.setItem(key, JSON.stringify(data));
      console.log(`[Comments] Cached ${reactions.length} reactions for comment ${commentId}`);
    } catch (err) {
      console.warn('[Comments] Failed to cache reactions:', err);
    }
  };

  // Invalidate single comment's reaction cache when reaction is added/removed
  const invalidateReactionCache = (commentId) => {
    try {
      const key = getReactionsCacheKey(commentId);
      localStorage.removeItem(key);
      console.log(`[Comments] Invalidated reaction cache for comment ${commentId}`);
    } catch (err) {
      console.warn('[Comments] Failed to invalidate reaction cache:', err);
    }
  };

  // Load issue and comments
  useEffect(() => {
    const loadComments = async () => {
      if (!config) return;

      try {
        setLoading(true);
        setError(null);

        const { owner, repo } = config.wiki.repository;

        // Check if current user is banned
        if (isAuthenticated && user) {
          const banned = await isBanned(user.login, owner, repo, config);
          setUserIsBanned(banned);
          if (banned) {
            console.warn(`[Comments] User ${user.login} is banned from commenting`);
          }
        }

        // Detect current branch for namespace isolation
        const branch = await detectCurrentBranch(config);

        // Try to load issue from cache first (avoids GitHub search API indexing delay)
        const cachedIssueNumber = getCachedIssueNumber(owner, repo, sectionId, pageId, branch);
        let pageIssue = null;

        if (cachedIssueNumber) {
          console.log(`[Comments] Found cached issue #${cachedIssueNumber}, loading directly...`);
          try {
            const { getIssue } = await import('../../services/github/issueOperations');
            const cachedIssue = await getIssue(owner, repo, cachedIssueNumber);

            // Validate that cached issue is still open (ignore closed issues)
            if (cachedIssue.state === 'open') {
              pageIssue = cachedIssue;
              console.log('[Comments] Loaded issue from cache:', pageIssue);
            } else {
              console.log(`[Comments] Cached issue #${cachedIssueNumber} is closed, ignoring and searching for new issue`);
              pageIssue = null;
            }
          } catch (err) {
            console.warn('[Comments] Failed to load cached issue, falling back to search:', err);
            pageIssue = null;
          }
        }

        // If no cached issue or loading failed, search for it
        if (!pageIssue) {
          console.log('[Comments] Searching for page issue...');
          pageIssue = await findPageIssue(owner, repo, sectionId, pageId, branch);

          // Cache the issue number if found
          if (pageIssue) {
            cacheIssueNumber(owner, repo, sectionId, pageId, branch, pageIssue.number);
          }
        }

        if (pageIssue) {
          setIssue(pageIssue);

          // Try to load comments from cache first
          const cachedResult = getCachedComments(pageIssue.number, 1);
          let result;
          let issueComments;

          if (cachedResult) {
            // Use cached comments
            result = cachedResult;
            issueComments = cachedResult.comments;
          } else {
            // Load first page of comments for the issue from API
            result = await getIssueComments(owner, repo, pageIssue.number, 1, PER_PAGE);
            issueComments = result.comments;
            // Cache the fetched comments
            cacheComments(pageIssue.number, 1, result.comments, result.hasMore);
          }

          // DEV: Add 100 fake comments for testing lazy loading
          if (import.meta.env.DEV && ENABLE_FAKE_COMMENTS) {
            const fakeComments = Array.from({ length: 100 }, (_, i) => ({
              id: 8000000 + i,
              body: `[TEST] This is fake test comment number ${i + 1} for testing lazy loading pagination. Lorem ipsum dolor sit amet, consectetur adipiscing elit.`,
              user: {
                login: 'TestUser' + (i % 5),
                avatar_url: `https://avatars.githubusercontent.com/u/${1000000 + i}?v=4`,
                html_url: `https://github.com/TestUser${i % 5}`
              },
              created_at: new Date(Date.now() - i * 3600000).toISOString(),
              updated_at: new Date(Date.now() - i * 3600000).toISOString(),
              reactions: {
                url: `https://api.github.com/repos/${owner}/${repo}/issues/comments/${8000000 + i}/reactions`,
                total_count: 0,
                '+1': 0,
                '-1': 0,
                laugh: 0,
                hooray: 0,
                confused: 0,
                heart: 0,
                rocket: 0,
                eyes: 0
              },
              html_url: `https://github.com/${owner}/${repo}/issues/4#issuecomment-${8000000 + i}`
            }));
            issueComments = [...issueComments, ...fakeComments];
            setHasMore(true); // Always show "more" with fake comments
            console.log('[Comments] Added 100 fake comments for testing');
          } else {
            setHasMore(result.hasMore);
          }

          setComments(issueComments);
          setCurrentPage(1);

          // Load reactions for all comments on first page
          const reactions = {};
          for (const comment of issueComments) {
            // Skip loading reactions for fake test comments (dev only)
            const isFakeComment = ENABLE_FAKE_COMMENTS && comment.id >= FAKE_COMMENT_ID_START;
            if (!isFakeComment) {
              // Try to load from cache first
              const cachedReactions = getCachedReactions(comment.id);
              if (cachedReactions) {
                reactions[comment.id] = cachedReactions;
              } else {
                // If not cached, fetch from GitHub and cache the result
                const commentReactionList = await getCommentReactions(owner, repo, comment.id);
                reactions[comment.id] = commentReactionList;
                cacheReactions(comment.id, commentReactionList);
              }
            } else {
              reactions[comment.id] = [];
            }
          }
          setCommentReactions(reactions);
        }
        // If no issue exists, it will be created when the first comment is posted
      } catch (err) {
        console.error('Failed to load comments:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadComments();
  }, [config, pageTitle, pageUrl, sectionId, pageId, isAuthenticated]);

  // Lazy load more comments when sentinel is visible
  const loadMore = useCallback(async () => {
    if (loadingMore || !hasMore || !config || !issue) return;

    setLoadingMore(true);

    try {
      const { owner, repo } = config.wiki.repository;
      const nextPage = currentPage + 1;

      console.log(`[Comments] Loading more comments, page ${nextPage}`);

      // Try to load from cache first
      const cachedResult = getCachedComments(issue.number, nextPage);
      let result;
      let newComments;

      if (cachedResult) {
        // Use cached comments
        result = cachedResult;
        newComments = cachedResult.comments;
      } else {
        // Load from API
        result = await getIssueComments(owner, repo, issue.number, nextPage, PER_PAGE);
        newComments = result.comments;
        // Cache the fetched comments
        cacheComments(issue.number, nextPage, result.comments, result.hasMore);
      }

      // Append new comments to existing list
      setComments(prev => [...prev, ...newComments]);
      setHasMore(result.hasMore);
      setCurrentPage(nextPage);

      // Load reactions for newly loaded comments
      const newReactions = { ...commentReactions };
      for (const comment of newComments) {
        // Skip loading reactions for fake test comments (dev only)
        const isFakeComment = ENABLE_FAKE_COMMENTS && comment.id >= FAKE_COMMENT_ID_START;
        if (!isFakeComment) {
          // Try to load from cache first
          const cachedReactions = getCachedReactions(comment.id);
          if (cachedReactions) {
            newReactions[comment.id] = cachedReactions;
          } else {
            // If not cached, fetch from GitHub and cache the result
            const commentReactionList = await getCommentReactions(owner, repo, comment.id);
            newReactions[comment.id] = commentReactionList;
            cacheReactions(comment.id, commentReactionList);
          }
        } else {
          newReactions[comment.id] = [];
        }
      }

      setCommentReactions(newReactions);
    } catch (err) {
      console.error('Failed to load more comments:', err);
    } finally {
      setLoadingMore(false);
    }
  }, [loadingMore, hasMore, currentPage, config, issue, commentReactions, PER_PAGE]);

  // Set up IntersectionObserver for lazy loading
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;
    if (!hasMore) return; // All loaded

    const observer = new IntersectionObserver(
      (entries) => {
        if (entries[0].isIntersecting) {
          loadMore();
        }
      },
      { threshold: 0.1, rootMargin: '100px' }
    );

    observer.observe(sentinel);

    return () => {
      if (sentinel) {
        observer.unobserve(sentinel);
      }
    };
  }, [loadMore, hasMore]);

  /**
   * Generate quote block for reply
   * Truncates to 3 lines or 200 chars, whichever comes first
   */
  const generateQuoteBlock = (comment) => {
    const username = displayNames[comment.user.id] || comment.user.login;
    const lines = comment.body.split('\n');
    let quoteText = comment.body;
    let wasTruncated = false;

    // Truncate by line count (max 3 lines)
    if (lines.length > 3) {
      quoteText = lines.slice(0, 3).join('\n');
      wasTruncated = true;
    }

    // Truncate by character count (max 200 chars)
    if (quoteText.length > 200) {
      quoteText = quoteText.substring(0, 200);
      wasTruncated = true;
    }

    // Remove trailing whitespace and add ellipsis if truncated
    quoteText = quoteText.trim();
    if (wasTruncated) {
      quoteText += '...';
    }

    // Format as blockquote with each line prefixed with '>'
    const quotedLines = quoteText.split('\n').map(line => `> ${line}`).join('\n');

    // Return formatted quote block with link and double newline for cursor positioning
    return `> [@${username}](#comment-${comment.id}) said:\n${quotedLines}\n\n`;
  };

  const handleSubmitComment = async (commentText = null) => {
    // Use provided commentText or fall back to newComment state
    const textToSubmit = commentText !== null ? commentText : newComment;
    if (!textToSubmit.trim()) return;

    // Check if user is banned
    if (userIsBanned) {
      alert('❌ You are banned from commenting on this wiki.\n\nIf you believe this is an error, please contact the repository owner.');
      return;
    }

    // Check client-side rate limiting
    const rateLimitCheck = checkCommentRateLimit();
    if (rateLimitCheck.isLimited) {
      console.warn('[Comments] Rate limited:', rateLimitCheck.reason);
      alert(`⏱️ ${rateLimitCheck.reason}`);
      return;
    }

    try {
      setIsSubmitting(true);

      // Record comment timestamp for rate limiting
      commentTimestamps.current.push(Date.now());

      const { owner, repo } = config.wiki.repository;

      console.log('[Comments] Submitting comment...');
      console.log('[Comments] Current issue:', issue);

      // Detect current branch for namespace isolation
      const branch = await detectCurrentBranch(config);

      // If no issue exists yet, create it (first comment on the page)
      let pageIssue = issue;
      if (!pageIssue) {
        console.log('[Comments] No issue exists, creating new issue...');
        pageIssue = await getOrCreatePageIssue(owner, repo, sectionId, pageId, pageTitle, pageUrl, branch);
        console.log('[Comments] Created/found issue:', pageIssue);
        setIssue(pageIssue);

        // Cache the issue number to avoid GitHub search API indexing delay
        cacheIssueNumber(owner, repo, sectionId, pageId, branch, pageIssue.number);
      }

      console.log('[Comments] Creating comment on issue #', pageIssue.number);
      const createdComment = await createIssueComment(owner, repo, pageIssue.number, textToSubmit, config);
      console.log('[Comments] Comment created:', createdComment);

      // Invalidate comment cache since we added a new comment
      invalidateCommentCache(pageIssue.number);

      // Reload first page of comments (reset pagination)
      console.log('[Comments] Reloading first page of comments...');
      const result = await getIssueComments(owner, repo, pageIssue.number, 1, PER_PAGE);
      let updatedComments = result.comments;

      // GitHub API may have stale cache - ensure the new comment is included
      const commentExists = updatedComments.some(c => c.id === createdComment.id);
      if (!commentExists) {
        console.log('[Comments] New comment not in list yet (API cache), adding manually');
        // Add the created comment to the end of the list
        updatedComments.push({
          id: createdComment.id,
          body: createdComment.body,
          user: createdComment.user,
          created_at: createdComment.created_at,
          updated_at: createdComment.updated_at,
          reactions: createdComment.reactions,
          html_url: createdComment.html_url
        });
      }

      setComments(updatedComments);
      setHasMore(result.hasMore);
      setCurrentPage(1);
      setNewComment('');

      // Load reactions for all comments on the page
      console.log('[Comments] Loading reactions for', updatedComments.length, 'comments');
      const newReactions = {};
      for (const comment of updatedComments) {
        // Skip loading reactions for fake test comments (dev only)
        const isFakeComment = ENABLE_FAKE_COMMENTS && comment.id >= FAKE_COMMENT_ID_START;
        if (!isFakeComment) {
          const commentReactionList = await getCommentReactions(owner, repo, comment.id);
          newReactions[comment.id] = commentReactionList;
        } else {
          newReactions[comment.id] = [];
        }
      }
      console.log('[Comments] Loaded reactions:', newReactions);
      setCommentReactions(newReactions);
      console.log('[Comments] Comment submission complete!');
    } catch (err) {
      console.error('Failed to submit comment:', err);

      // Handle bot token not configured error
      if (err.message?.includes('Bot token not configured') || err.message?.includes('Comment system requires bot token')) {
        alert('❌ Comments system requires configuration.\n\n' +
              'The wiki administrator needs to configure the bot token in Netlify.\n' +
              'See BOT.md for setup instructions.');
      }
      // Handle GitHub API rate limit errors
      else if (err.status === 403 && err.message?.includes('rate limit')) {
        alert('⏱️ GitHub API rate limit exceeded. Please wait a moment and try again.');
      } else if (err.status === 403) {
        alert('❌ Permission denied. Please check:\n\n' +
              '1. You are signed in\n' +
              '2. Bot token is configured in Netlify\n' +
              '3. Bot has permission to create issues');
      } else if (err.status === 422) {
        alert('❌ Invalid comment. Please check your input.');
      } else {
        alert('❌ Failed to submit comment: ' + err.message);
      }

      // Remove the timestamp we just added since the comment failed
      commentTimestamps.current.pop();
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Handle reply button click
   */
  const handleReplyClick = (comment) => {
    setReplyingTo({
      id: comment.id,
      username: displayNames[comment.user.id] || comment.user.login,
      body: comment.body,
      user: comment.user,
    });

    // Scroll to inline form after state updates
    setTimeout(() => {
      if (replyTextareaRef.current) {
        replyTextareaRef.current.focus();
        // Position cursor at end (after quote)
        const length = replyTextareaRef.current.value.length;
        replyTextareaRef.current.setSelectionRange(length, length);
      }
    }, 100);
  };

  /**
   * Handle cancel reply
   */
  const handleCancelReply = () => {
    setReplyingTo(null);
  };

  /**
   * Handle submit reply (uses existing submit logic with quote block)
   */
  const handleSubmitReply = async () => {
    // Prepend quote block to the user's comment text
    const quoteBlock = generateQuoteBlock(replyingTo);
    const fullCommentText = quoteBlock + (newComment || '');

    // Use existing submit logic with the full comment text (quote + reply)
    await handleSubmitComment(fullCommentText);

    // Clear reply state after successful submission
    setReplyingTo(null);
  };

  /**
   * Handle edit button click
   */
  const handleEditClick = (comment) => {
    setEditingComment(comment);
    setEditedBody(comment.body);
  };

  /**
   * Handle cancel edit
   */
  const handleCancelEdit = () => {
    setEditingComment(null);
    setEditedBody('');
  };

  /**
   * Handle save edited comment
   */
  const handleSaveEdit = async () => {
    if (!editedBody.trim()) {
      alert('Comment cannot be empty');
      return;
    }

    if (editedBody === editingComment.body) {
      // No changes made
      setEditingComment(null);
      return;
    }

    try {
      setIsSubmitting(true);
      const { owner, repo } = config.wiki.repository;

      console.log('[Comments] Updating comment #', editingComment.id);

      // Call GitHub API to update comment
      const { updateIssueComment } = await import('../../services/github/comments');
      const updatedComment = await updateIssueComment(owner, repo, editingComment.id, editedBody, config);

      console.log('[Comments] Comment updated:', updatedComment);

      // Update the comment in local state
      setComments(prevComments =>
        prevComments.map(c =>
          c.id === editingComment.id
            ? { ...c, body: updatedComment.body, updated_at: updatedComment.updated_at }
            : c
        )
      );

      // Invalidate comment cache so edited version shows on refresh
      if (pageIssue?.number) {
        invalidateCommentCache(pageIssue.number);
      }

      setEditingComment(null);
      setEditedBody('');
    } catch (err) {
      console.error('Failed to update comment:', err);

      if (err.status === 403) {
        alert('❌ Permission denied. You can only edit your own comments.');
      } else if (err.status === 404) {
        alert('❌ Comment not found. It may have been deleted.');
      } else {
        alert('❌ Failed to update comment: ' + err.message);
      }
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Scroll to specific comment and highlight it
   */
  const scrollToComment = useCallback((commentId) => {
    const element = document.getElementById(`comment-${commentId}`);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'center' });

      // Add temporary highlight effect
      element.classList.add('comment-highlight-flash');
      setTimeout(() => {
        element.classList.remove('comment-highlight-flash');
      }, 2000);
    }
  }, []);

  // Note: Click handling for #comment-* links is now handled by the custom
  // anchor component in ReactMarkdown rendering (see comment body section)

  /**
   * Check if user is rate limited for reactions
   * @returns {Object} { isLimited: boolean, reason: string, retryAfter: number }
   */
  const checkReactionRateLimit = () => {
    const now = Date.now();
    const timestamps = reactionTimestamps.current;

    // Clean up old timestamps (older than 1 minute)
    reactionTimestamps.current = timestamps.filter(ts => now - ts < 60000);

    // Check per-second limit
    const lastReaction = timestamps[timestamps.length - 1] || 0;
    const timeSinceLastReaction = now - lastReaction;
    if (timeSinceLastReaction < REACTION_RATE_LIMIT.cooldownMs) {
      const retryAfter = Math.ceil((REACTION_RATE_LIMIT.cooldownMs - timeSinceLastReaction) / 1000);
      return {
        isLimited: true,
        reason: 'Too fast! Please wait a moment between reactions.',
        retryAfter,
      };
    }

    // Check per-minute limit
    const recentReactions = timestamps.filter(ts => now - ts < 60000);
    if (recentReactions.length >= REACTION_RATE_LIMIT.perMinute) {
      return {
        isLimited: true,
        reason: `Rate limit: Maximum ${REACTION_RATE_LIMIT.perMinute} reactions per minute.`,
        retryAfter: 60,
      };
    }

    return { isLimited: false };
  };

  /**
   * Check if user is rate limited for comments
   * @returns {Object} { isLimited: boolean, reason: string, retryAfter: number }
   */
  const checkCommentRateLimit = () => {
    const now = Date.now();
    const timestamps = commentTimestamps.current;

    // Clean up old timestamps (older than 5 minutes)
    commentTimestamps.current = timestamps.filter(ts => now - ts < 300000);

    // Check cooldown period since last comment
    const lastComment = timestamps[timestamps.length - 1] || 0;
    const timeSinceLastComment = now - lastComment;
    if (timeSinceLastComment < COMMENT_RATE_LIMIT.cooldownMs) {
      const retryAfter = Math.ceil((COMMENT_RATE_LIMIT.cooldownMs - timeSinceLastComment) / 1000);
      return {
        isLimited: true,
        reason: `Please wait ${retryAfter} seconds before posting another comment.`,
        retryAfter,
      };
    }

    // Check per-minute limit
    const recentComments1min = timestamps.filter(ts => now - ts < 60000);
    if (recentComments1min.length >= COMMENT_RATE_LIMIT.perMinute) {
      return {
        isLimited: true,
        reason: `Rate limit: Maximum ${COMMENT_RATE_LIMIT.perMinute} comments per minute.`,
        retryAfter: 60,
      };
    }

    // Check per-5-minutes limit
    const recentComments5min = timestamps.filter(ts => now - ts < 300000);
    if (recentComments5min.length >= COMMENT_RATE_LIMIT.per5Minutes) {
      return {
        isLimited: true,
        reason: `Rate limit: Maximum ${COMMENT_RATE_LIMIT.per5Minutes} comments per 5 minutes.`,
        retryAfter: 300,
      };
    }

    return { isLimited: false };
  };

  const handleReaction = async (commentId, reactionType) => {
    if (!isAuthenticated) {
      alert('Please sign in to react to comments');
      return;
    }

    if (userIsBanned) {
      alert('You are banned from reacting to comments on this wiki');
      return;
    }

    const { owner, repo } = config.wiki.repository;
    const reactions = commentReactions[commentId] || [];

    // Check if user has the opposite reaction (thumbs up/down are mutually exclusive)
    const oppositeType = reactionType === '+1' ? '-1' : '+1';
    const oppositeReaction = reactions.find(
      r => r.user.login === user.login && r.content === oppositeType
    );

    // For switching reactions, be more lenient with rate limiting since it's a modification
    const isSwitchingReaction = !!oppositeReaction;

    // Check client-side rate limiting
    const rateLimitCheck = checkReactionRateLimit();
    if (rateLimitCheck.isLimited && !isSwitchingReaction) {
      // If switching reactions, allow it even if we're close to the rate limit
      console.warn('[Comments] Rate limited:', rateLimitCheck.reason);
      alert(`⏱️ ${rateLimitCheck.reason}`);
      return;
    }

    const loadingKey = `${commentId}-${reactionType}`;

    // Track the final reaction state for caching (can't rely on React state which updates async)
    let finalReactions = reactions;

    try {
      // Set loading state for this specific button
      setReactionLoading(prev => ({ ...prev, [loadingKey]: true }));

      // Record reaction timestamp for rate limiting
      reactionTimestamps.current.push(Date.now());

      // Check if user already reacted with this type
      const existingReaction = reactions.find(
        r => r.user.login === user.login && r.content === reactionType
      );

      // Optimistically update UI first (for immediate feedback)
      if (existingReaction) {
        // Remove reaction (toggle off) - optimistic update
        finalReactions = reactions.filter(r => r.id !== existingReaction.id);

        setCommentReactions(prev => ({
          ...prev,
          [commentId]: finalReactions,
        }));

        // Delete from GitHub - if this succeeds without error, we trust it worked
        await deleteCommentReaction(owner, repo, commentId, existingReaction.id);
        console.log('[Comments] ✓ Reaction removed successfully');
      } else {
        // Remove opposite reaction if exists (mutually exclusive)
        let updatedReactions = reactions;
        if (oppositeReaction) {
          console.log('[Comments] Switching reactions - removing opposite reaction first');
          updatedReactions = reactions.filter(r => r.id !== oppositeReaction.id);

          // Delete opposite reaction from GitHub
          await deleteCommentReaction(owner, repo, commentId, oppositeReaction.id);
          console.log('[Comments] ✓ Opposite reaction removed');

          // IMPORTANT: Add a small delay between delete and add to avoid GitHub rate limit
          // GitHub processes requests sequentially and may reject rapid successive calls
          await new Promise(resolve => setTimeout(resolve, 300));
          console.log('[Comments] Waited 300ms before adding new reaction');
        }

        // Add new reaction - optimistic update first for immediate UI feedback
        const optimisticReaction = {
          id: Date.now(), // Temporary ID (will be replaced with real ID)
          content: reactionType,
          user: { login: user.login },
        };

        // Calculate optimistic reactions state
        finalReactions = [...updatedReactions, optimisticReaction];

        // Update UI with optimistic reaction
        setCommentReactions(prev => ({
          ...prev,
          [commentId]: finalReactions,
        }));

        // Add new reaction to GitHub and get the real reaction data with real ID
        const realReaction = await addCommentReaction(owner, repo, commentId, reactionType);
        console.log('[Comments] ✓ Reaction added successfully, real ID:', realReaction.id);

        // Update with real reaction data (replace optimistic with real)
        finalReactions = [...updatedReactions, {
          id: realReaction.id,
          content: realReaction.content,
          user: realReaction.user,
        }];

        // Update UI again with real reaction data
        setCommentReactions(prev => ({
          ...prev,
          [commentId]: finalReactions,
        }));
      }

      // If we got here without errors, the API calls succeeded
      // We keep the optimistic update - no need to validate with slow GitHub cache
      console.log('[Comments] ✓ Reaction update complete - keeping optimistic UI state');

      // Invalidate the old cache and update with new reaction state
      invalidateReactionCache(commentId);
      cacheReactions(commentId, finalReactions);
    } catch (err) {
      console.error('Failed to handle reaction:', err);

      // Revert optimistic update by reloading actual state from server
      try {
        const actualReactions = await getCommentReactions(owner, repo, commentId);
        setCommentReactions(prev => ({
          ...prev,
          [commentId]: actualReactions,
        }));
        // Update cache with the correct state from server
        cacheReactions(commentId, actualReactions);
      } catch (reloadErr) {
        console.error('Failed to reload reactions after error:', reloadErr);
      }

      // Handle GitHub API rate limit (HTTP 403 with specific message)
      if (err.status === 403 && err.message?.includes('rate limit')) {
        alert('⏱️ GitHub API rate limit exceeded.\n\nWhen switching between like/dislike, please wait a moment between changes.');
      } else if (err.status === 403) {
        alert('❌ Permission denied. You may need to sign in again.');
      } else if (err.status === 422) {
        alert('❌ Failed to update reaction: The reaction could not be processed.\n\nThis can happen when switching reactions too quickly. Please try again in a moment.');
      } else {
        alert('❌ Failed to update reaction: ' + err.message);
      }

      // Remove the timestamp we just added since the reaction failed
      reactionTimestamps.current.pop();
    } finally {
      // Clear loading state
      setReactionLoading(prev => {
        const newState = { ...prev };
        delete newState[loadingKey];
        return newState;
      });
    }
  };

  const getReactionCount = (commentId, reactionType) => {
    const reactions = commentReactions[commentId] || [];
    return reactions.filter(r => r.content === reactionType).length;
  };

  const hasUserReacted = (commentId, reactionType) => {
    if (!user) return false;
    const reactions = commentReactions[commentId] || [];
    return reactions.some(r => r.user.login === user.login && r.content === reactionType);
  };

  // Handle avatar click to show user action menu
  const handleAvatarClick = (e, username) => {
    if (!username) return;

    e.stopPropagation();
    const rect = e.currentTarget.getBoundingClientRect();

    setSelectedUser(username);
    setUserMenuPosition({
      x: rect.left,
      y: rect.bottom - 20,
    });
    setShowUserActionMenu(true);
  };

  const handleUserMenuClose = () => {
    setShowUserActionMenu(false);
    setSelectedUser(null);
  };

  const handleUserBanned = () => {
    // Reload comments to reflect ban status changes (reset pagination)
    const loadComments = async () => {
      if (!config || !issue) return;
      try {
        const { owner, repo } = config.wiki.repository;
        const result = await getIssueComments(owner, repo, issue.number, 1, PER_PAGE);
        setComments(result.comments);
        setHasMore(result.hasMore);
        setCurrentPage(1);
      } catch (err) {
        console.error('Failed to reload comments:', err);
      }
    };
    loadComments();
  };

  const handleMakeAdmin = async (username) => {
    try {
      const result = await addAdmin(username);
      alert(`✅ ${result.message}`);
    } catch (error) {
      console.error('Failed to add admin:', error);
      alert('❌ Failed to add admin: ' + error.message);
    }
  };

  // Check if comments are enabled
  const commentsEnabled = config?.features?.comments?.enabled;
  if (!commentsEnabled) {
    return null;
  }

  if (loading) {
    return (
      <div className="flex justify-center items-center py-12">
        <LoadingSpinner size="lg" />
      </div>
    );
  }

  if (error) {
    // Check if this is a rate limit error
    const isRateLimit = error.includes('rate limit') || error.includes('403') || error.includes('429');

    if (isRateLimit) {
      return (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-4">
          <p className="text-yellow-700 dark:text-yellow-300 text-sm">
            Unable to load comments due to rate limiting. <a href="/login" className="underline hover:text-yellow-800 dark:hover:text-yellow-200 font-medium">Log in with GitHub</a> to remove this limitation.
          </p>
        </div>
      );
    }

    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
        <p className="text-red-700 dark:text-red-300 text-sm">
          Failed to load comments: {error}
        </p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
          Comments ({comments.length})
        </h2>
        {issue && (
          <a
            href={issue.html_url}
            target="_blank"
            rel="noopener noreferrer"
            className="text-sm text-blue-600 dark:text-blue-400 hover:underline"
          >
            View on GitHub →
          </a>
        )}
      </div>

      {/* Comment input (hide when replying) */}
      {!replyingTo && (
        <>
          {isAuthenticated ? (
            userIsBanned ? (
              <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4 text-center">
                <p className="text-red-900 dark:text-red-200 text-sm font-medium">
                  ❌ You are banned from commenting on this wiki
                </p>
                <p className="text-red-700 dark:text-red-300 text-xs mt-1">
                  If you believe this is an error, please contact the repository owner.
                </p>
              </div>
            ) : (
              <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <PrestigeAvatar
                    src={user.avatar_url}
                    alt={user.name || user.login}
                    username={user.login}
                    userId={user.id}
                    size="md"
                    showBadge={true}
                    onClick={handleAvatarClick}
                  />
                  <div className="flex-1">
                    <textarea
                      value={newComment}
                      onChange={(e) => setNewComment(e.target.value)}
                      placeholder="Leave a comment..."
                      rows={3}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <div className="mt-2 flex justify-end">
                      <button
                        onClick={handleSubmitComment}
                        disabled={!newComment.trim() || isSubmitting}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                      >
                        {isSubmitting ? 'Posting...' : 'Post Comment'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )
          ) : (
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
              <p className="text-blue-900 dark:text-blue-200 text-sm">
                Sign in with GitHub to leave a comment
              </p>
            </div>
          )}
        </>
      )}

      {/* Comments list */}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p>No comments yet. Be the first to comment!</p>
          </div>
        ) : (
          <>
            {comments.map((comment) => (
            <React.Fragment key={comment.id}>
            <div
              id={`comment-${comment.id}`}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4 transition-colors duration-300"
            >
              <div className="flex items-start space-x-3">
                <PrestigeAvatar
                  src={comment.user.avatar_url}
                  alt={comment.user.login}
                  username={comment.user.login}
                  userId={comment.user.id}
                  size="md"
                  showBadge={true}
                  onClick={handleAvatarClick}
                />
                <div className="flex-1 min-w-0">
                  {/* Comment header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <div className="flex flex-col">
                        <a
                          href={comment.user.html_url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="font-medium text-gray-900 dark:text-white hover:underline"
                        >
                          {displayNames[comment.user.id] || comment.user.login}
                        </a>
                        {displayNames[comment.user.id] && displayNames[comment.user.id] !== comment.user.login && (
                          <span className="text-xs text-gray-500 dark:text-gray-400">
                            @{comment.user.login}
                          </span>
                        )}
                      </div>
                      <span className="text-gray-500 dark:text-gray-400 text-sm">
                        {formatDistance(new Date(comment.created_at), new Date(), {
                          addSuffix: true,
                        })}
                      </span>
                      {comment.created_at !== comment.updated_at && (
                        <span className="text-gray-400 dark:text-gray-500 text-xs">(edited)</span>
                      )}
                    </div>
                    {/* Report button */}
                    <button
                      onClick={() => {
                        if (window.confirm('This will open the comment on GitHub where you can use the "..." menu to report inappropriate content. Continue?')) {
                          window.open(comment.html_url, '_blank', 'noopener,noreferrer');
                        }
                      }}
                      className="flex items-center space-x-1 px-2 py-1 rounded text-xs transition-colors text-gray-500 dark:text-gray-400 hover:bg-red-100 dark:hover:bg-red-900/30 hover:text-red-700 dark:hover:text-red-300"
                      title="Report inappropriate content"
                    >
                      <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 21v-4m0 0V5a2 2 0 012-2h6.5l1 1H21l-3 6 3 6h-8.5l-1-1H5a2 2 0 00-2 2zm9-13.5V9" />
                      </svg>
                      <span>Report</span>
                    </button>
                  </div>

                  {/* Comment body or edit form */}
                  {editingComment?.id === comment.id ? (
                    <div className="mb-3">
                      <textarea
                        value={editedBody}
                        onChange={(e) => setEditedBody(e.target.value)}
                        rows={5}
                        className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                        autoFocus
                      />
                      <div className="mt-2 flex justify-end space-x-2">
                        <button
                          onClick={handleCancelEdit}
                          className="px-3 py-1.5 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors text-sm"
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleSaveEdit}
                          disabled={!editedBody.trim() || isSubmitting}
                          className="px-3 py-1.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm"
                        >
                          {isSubmitting ? 'Saving...' : 'Save'}
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="prose prose-sm dark:prose-invert max-w-none mb-3 comment-body">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          // Customize anchor tags to handle #comment-* links
                          a: ({ node, href, children, ...props }) => {
                            // Check if this is a comment reference link
                            if (href && href.startsWith('#comment-')) {
                              return (
                                <a
                                  href={href}
                                  className="text-blue-600 dark:text-blue-400 font-medium not-italic"
                                  {...props}
                                >
                                  {children}
                                </a>
                              );
                            }
                            // Regular external link
                            return (
                              <a
                                href={href}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-blue-600 dark:text-blue-400 hover:underline"
                                {...props}
                              >
                                {children}
                              </a>
                            );
                          },
                          // Style blockquotes nicely - make entire quote clickable
                          blockquote: ({ node, children, ...props }) => {
                            // Try to extract comment ID from the quote block
                            let commentId = null;

                            // Check if the node contains a comment reference link
                            const findCommentId = (node) => {
                              if (node.type === 'element' && node.tagName === 'a') {
                                const href = node.properties?.href;
                                if (href && href.startsWith('#comment-')) {
                                  return href.substring(9); // Remove '#comment-'
                                }
                              }
                              if (node.children) {
                                for (const child of node.children) {
                                  const id = findCommentId(child);
                                  if (id) return id;
                                }
                              }
                              return null;
                            };

                            commentId = findCommentId(node);

                            // If this is a reply quote with a comment reference, make it clickable
                            if (commentId) {
                              return (
                                <blockquote
                                  onClick={() => scrollToComment(commentId)}
                                  className="border-l-4 border-blue-500 bg-blue-50 dark:bg-blue-900/20 pl-4 py-2 my-2 italic text-gray-700 dark:text-gray-300 cursor-pointer hover:bg-blue-100 dark:hover:bg-blue-900/30 transition-colors"
                                  title="Click to view original comment"
                                  {...props}
                                >
                                  {children}
                                </blockquote>
                              );
                            }

                            // Regular blockquote (not a reply)
                            return (
                              <blockquote
                                className="border-l-4 border-gray-400 dark:border-gray-600 bg-gray-50 dark:bg-gray-800/20 pl-4 py-2 my-2 italic text-gray-700 dark:text-gray-300"
                                {...props}
                              >
                                {children}
                              </blockquote>
                            );
                          },
                        }}
                      >
                        {comment.body}
                      </ReactMarkdown>
                    </div>
                  )}

                  {/* Reactions */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleReaction(comment.id, '+1')}
                      disabled={reactionLoading[`${comment.id}-+1`] || userIsBanned}
                      className={`flex items-center space-x-1 px-2 py-1 rounded text-sm transition-colors ${
                        hasUserReacted(comment.id, '+1')
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      } ${reactionLoading[`${comment.id}-+1`] || userIsBanned ? 'opacity-70 cursor-not-allowed' : ''}`}
                      title={userIsBanned ? 'You are banned from reacting' : 'Thumbs up'}
                    >
                      {reactionLoading[`${comment.id}-+1`] ? (
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <span>👍</span>
                      )}
                      <span>{getReactionCount(comment.id, '+1')}</span>
                    </button>
                    <button
                      onClick={() => handleReaction(comment.id, '-1')}
                      disabled={reactionLoading[`${comment.id}--1`] || userIsBanned}
                      className={`flex items-center space-x-1 px-2 py-1 rounded text-sm transition-colors ${
                        hasUserReacted(comment.id, '-1')
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      } ${reactionLoading[`${comment.id}--1`] || userIsBanned ? 'opacity-70 cursor-not-allowed' : ''}`}
                      title={userIsBanned ? 'You are banned from reacting' : 'Thumbs down'}
                    >
                      {reactionLoading[`${comment.id}--1`] ? (
                        <svg className="animate-spin h-4 w-4" fill="none" viewBox="0 0 24 24">
                          <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                          <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                        </svg>
                      ) : (
                        <span>👎</span>
                      )}
                      <span>{getReactionCount(comment.id, '-1')}</span>
                    </button>
                    <a
                      href={comment.html_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300 ml-2"
                    >
                      View on GitHub →
                    </a>
                    {/* Reply button (only show if authenticated and not banned) */}
                    {isAuthenticated && !userIsBanned && (
                      <button
                        onClick={() => handleReplyClick(comment)}
                        className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 ml-2 font-medium"
                      >
                        Reply
                      </button>
                    )}
                    {/* Edit button (only for user's own comments) */}
                    {isAuthenticated && user && comment.user.login === user.login && (
                      <button
                        onClick={() => handleEditClick(comment)}
                        className="text-xs text-gray-600 dark:text-gray-400 hover:text-gray-800 dark:hover:text-gray-300 ml-2 font-medium"
                      >
                        Edit
                      </button>
                    )}
                  </div>
                </div>
              </div>
            </div>

            {/* Inline reply form */}
            {replyingTo?.id === comment.id && (
              <div className="ml-8 mt-4 bg-blue-50 dark:bg-blue-900/10 border-l-4 border-blue-500 rounded-lg p-4">
                <div className="flex items-start space-x-3">
                  <PrestigeAvatar
                    src={user.avatar_url}
                    alt={user.name || user.login}
                    username={user.login}
                    userId={user.id}
                    size="md"
                    showBadge={true}
                    onClick={handleAvatarClick}
                  />
                  <div className="flex-1">
                    <textarea
                      ref={replyTextareaRef}
                      value={replyingTo.id === comment.id ? generateQuoteBlock(replyingTo) + (newComment || '') : newComment}
                      onChange={(e) => {
                        // Extract user's text after the quote block
                        const quoteBlock = generateQuoteBlock(replyingTo);
                        const value = e.target.value;
                        if (value.startsWith(quoteBlock)) {
                          setNewComment(value.substring(quoteBlock.length));
                        } else {
                          setNewComment(value);
                        }
                      }}
                      placeholder="Write your reply..."
                      rows={5}
                      className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-900 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 resize-none"
                    />
                    <div className="mt-2 flex justify-end space-x-2">
                      <button
                        onClick={handleCancelReply}
                        className="px-4 py-2 bg-gray-300 dark:bg-gray-600 text-gray-800 dark:text-gray-200 rounded-lg hover:bg-gray-400 dark:hover:bg-gray-500 transition-colors text-sm font-medium"
                      >
                        Cancel
                      </button>
                      <button
                        onClick={handleSubmitReply}
                        disabled={!newComment.trim() || isSubmitting}
                        className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 disabled:opacity-50 disabled:cursor-not-allowed transition-colors text-sm font-medium"
                      >
                        {isSubmitting ? 'Posting...' : 'Post Reply'}
                      </button>
                    </div>
                  </div>
                </div>
              </div>
            )}
            </React.Fragment>
          ))}

          {/* Sentinel element for IntersectionObserver */}
          {hasMore && (
            <div ref={sentinelRef} className="py-4">
              {loadingMore ? (
                <div className="flex justify-center">
                  <LoadingSpinner size="md" />
                </div>
              ) : (
                <button
                  onClick={loadMore}
                  className="w-full py-3 text-sm text-blue-600 dark:text-blue-400 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded-lg transition-colors border border-blue-200 dark:border-blue-800"
                >
                  Load More Comments
                </button>
              )}
            </div>
          )}
        </>
        )}
      </div>

      {/* User Action Menu */}
      {showUserActionMenu && selectedUser && (
        <UserActionMenu
          username={selectedUser}
          onClose={handleUserMenuClose}
          position={userMenuPosition}
          onBan={handleUserBanned}
          onMakeAdmin={handleMakeAdmin}
        />
      )}

      {/* CSS for highlight animation */}
      <style jsx>{`
        @keyframes comment-highlight {
          0%, 100% {
            background-color: transparent;
          }
          50% {
            background-color: rgba(59, 130, 246, 0.15);
          }
        }

        .comment-highlight-flash {
          animation: comment-highlight 2s ease-in-out;
        }
      `}</style>
    </div>
  );
};

export default Comments;
