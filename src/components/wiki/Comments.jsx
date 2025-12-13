import { useState, useEffect } from 'react';
import { formatDistance } from 'date-fns';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAuthStore } from '../../store/authStore';
import PrestigeAvatar from '../common/PrestigeAvatar';
import LoadingSpinner from '../common/LoadingSpinner';
import {
  findPageIssue,
  getOrCreatePageIssue,
  getIssueComments,
  createIssueComment,
  addCommentReaction,
  deleteCommentReaction,
  getCommentReactions,
} from '../../services/github/comments';

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

  const pageUrl = `${window.location.origin}${window.location.pathname}#/${sectionId}/${pageId}`;

  // Load issue and comments
  useEffect(() => {
    const loadComments = async () => {
      if (!config) return;

      try {
        setLoading(true);
        setError(null);

        const { owner, repo } = config.wiki.repository;

        // Always try to find existing issue (read-only, works without auth for public repos)
        const pageIssue = await findPageIssue(owner, repo, pageTitle);

        if (pageIssue) {
          setIssue(pageIssue);

          // Load comments for the issue
          const issueComments = await getIssueComments(owner, repo, pageIssue.number);
          setComments(issueComments);

          // Load reactions for each comment
          const reactions = {};
          for (const comment of issueComments) {
            const commentReactionList = await getCommentReactions(owner, repo, comment.id);
            reactions[comment.id] = commentReactionList;
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

  const handleSubmitComment = async () => {
    if (!newComment.trim()) return;

    try {
      setIsSubmitting(true);
      const { owner, repo } = config.wiki.repository;

      // If no issue exists yet, create it (first comment on the page)
      let pageIssue = issue;
      if (!pageIssue) {
        pageIssue = await getOrCreatePageIssue(owner, repo, pageTitle, pageUrl);
        setIssue(pageIssue);
      }

      await createIssueComment(owner, repo, pageIssue.number, newComment);

      // Reload comments
      const updatedComments = await getIssueComments(owner, repo, pageIssue.number);
      setComments(updatedComments);
      setNewComment('');
    } catch (err) {
      console.error('Failed to submit comment:', err);
      alert('Failed to submit comment: ' + err.message);
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleReaction = async (commentId, reactionType) => {
    if (!isAuthenticated) {
      alert('Please sign in to react to comments');
      return;
    }

    const loadingKey = `${commentId}-${reactionType}`;

    try {
      // Set loading state for this specific button
      setReactionLoading(prev => ({ ...prev, [loadingKey]: true }));

      const { owner, repo } = config.wiki.repository;
      const reactions = commentReactions[commentId] || [];

      // Check if user already reacted with this type
      const existingReaction = reactions.find(
        r => r.user.login === user.login && r.content === reactionType
      );

      // Check if user has the opposite reaction (thumbs up/down are mutually exclusive)
      const oppositeType = reactionType === '+1' ? '-1' : '+1';
      const oppositeReaction = reactions.find(
        r => r.user.login === user.login && r.content === oppositeType
      );

      if (existingReaction) {
        // Remove reaction (toggle off)
        await deleteCommentReaction(owner, repo, commentId, existingReaction.id);
      } else {
        // If opposite reaction exists, remove it first
        if (oppositeReaction) {
          await deleteCommentReaction(owner, repo, commentId, oppositeReaction.id);
        }
        // Add new reaction
        await addCommentReaction(owner, repo, commentId, reactionType);
      }

      // Reload reactions for this comment
      const updatedReactions = await getCommentReactions(owner, repo, commentId);
      setCommentReactions(prev => ({
        ...prev,
        [commentId]: updatedReactions,
      }));
    } catch (err) {
      console.error('Failed to handle reaction:', err);
      alert('Failed to update reaction: ' + err.message);
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

      {/* Comment input */}
      {isAuthenticated ? (
        <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <PrestigeAvatar
              src={user.avatar_url}
              alt={user.name || user.login}
              username={user.login}
              size="md"
              showBadge={true}
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
      ) : (
        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 text-center">
          <p className="text-blue-900 dark:text-blue-200 text-sm">
            Sign in with GitHub to leave a comment
          </p>
        </div>
      )}

      {/* Comments list */}
      <div className="space-y-4">
        {comments.length === 0 ? (
          <div className="text-center py-8 text-gray-500 dark:text-gray-400">
            <p>No comments yet. Be the first to comment!</p>
          </div>
        ) : (
          comments.map((comment) => (
            <div
              key={comment.id}
              className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-4"
            >
              <div className="flex items-start space-x-3">
                <PrestigeAvatar
                  src={comment.user.avatar_url}
                  alt={comment.user.login}
                  username={comment.user.login}
                  size="md"
                  showBadge={true}
                />
                <div className="flex-1 min-w-0">
                  {/* Comment header */}
                  <div className="flex items-center justify-between mb-2">
                    <div className="flex items-center space-x-2">
                      <a
                        href={comment.user.html_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="font-medium text-gray-900 dark:text-white hover:underline"
                      >
                        {comment.user.login}
                      </a>
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

                  {/* Comment body */}
                  <div className="prose prose-sm dark:prose-invert max-w-none mb-3">
                    <p className="text-gray-700 dark:text-gray-300 whitespace-pre-wrap">
                      {comment.body}
                    </p>
                  </div>

                  {/* Reactions */}
                  <div className="flex items-center space-x-2">
                    <button
                      onClick={() => handleReaction(comment.id, '+1')}
                      disabled={reactionLoading[`${comment.id}-+1`]}
                      className={`flex items-center space-x-1 px-2 py-1 rounded text-sm transition-colors ${
                        hasUserReacted(comment.id, '+1')
                          ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      } ${reactionLoading[`${comment.id}-+1`] ? 'opacity-70 cursor-wait' : ''}`}
                      title="Thumbs up"
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
                      disabled={reactionLoading[`${comment.id}--1`]}
                      className={`flex items-center space-x-1 px-2 py-1 rounded text-sm transition-colors ${
                        hasUserReacted(comment.id, '-1')
                          ? 'bg-red-100 dark:bg-red-900/30 text-red-700 dark:text-red-300'
                          : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                      } ${reactionLoading[`${comment.id}--1`] ? 'opacity-70 cursor-wait' : ''}`}
                      title="Thumbs down"
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
                  </div>
                </div>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
};

export default Comments;
