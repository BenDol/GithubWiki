import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X, Video, ExternalLink, Loader, Upload as UploadIcon, Youtube } from 'lucide-react';
import {
  submitVideoGuide,
  submitUploadedVideoGuide,
  isValidYouTubeUrl
} from '../../services/contentCreators';
import { useAuthStore } from '../../store/authStore';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { createLogger } from '../../utils/logger';
import VideoFileUpload from './VideoFileUpload';
import {
  getCachedVerificationToken,
  cacheVerificationToken,
  clearCachedVerificationToken,
} from '../../services/anonymousEditService';

const logger = createLogger('VideoGuideSubmissionModal');

/**
 * VideoGuideSubmissionModal - Submit a video guide for approval
 * Creates a PR with the updated video-guides.json file
 * Supports both YouTube links and raw video uploads (up to 100MB)
 * Requires authentication
 */
const VideoGuideSubmissionModal = ({ isOpen, onClose, onSuccess }) => {
  const { isAuthenticated, user } = useAuthStore();
  const { config } = useWikiConfig();

  // Tab state
  const [activeTab, setActiveTab] = useState('youtube'); // 'youtube' or 'upload'

  // YouTube fields
  const [videoUrl, setVideoUrl] = useState('');

  // Upload fields
  const [videoFile, setVideoFile] = useState(null);
  const [thumbnailFile, setThumbnailFile] = useState(null);

  // Common fields
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [creator, setCreator] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState('');
  const [difficulty, setDifficulty] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState(null);
  const [success, setSuccess] = useState(null);

  // Email verification for anonymous uploads
  const [userEmail, setUserEmail] = useState('');
  const [verificationCode, setVerificationCode] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [emailSent, setEmailSent] = useState(false);
  const [sendingEmail, setSendingEmail] = useState(false);

  // Check for cached verification token when email changes
  useEffect(() => {
    if (userEmail && !isAuthenticated) {
      getCachedVerificationToken(userEmail).then(cached => {
        if (cached) {
          logger.debug('Found cached verification token', { email: userEmail });
          setVerificationToken(cached);
          setEmailSent(true); // Mark as verified
        } else {
          logger.debug('No cached token found', { email: userEmail });
          setVerificationToken('');
          setEmailSent(false);
        }
      });
    }
  }, [userEmail, isAuthenticated]);

  if (!isOpen) return null;

  // Check if video uploads are enabled
  const allowRawUpload = config?.features?.contentCreators?.videoGuides?.allowRawUpload === true;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      // Check authentication
      // Validate required fields
      if (!title || !description) {
        throw new Error('Please fill in all required fields (Title, Description)');
      }

      // Parse tags (comma-separated)
      const tagArray = tags
        .split(',')
        .map(t => t.trim())
        .filter(t => t.length > 0);

      // Build common metadata
      const metadata = {
        title,
        description,
      };

      // Add optional fields
      if (creator) metadata.creator = creator;
      if (category) metadata.category = category;
      if (tagArray.length > 0) metadata.tags = tagArray;
      if (difficulty) metadata.difficulty = difficulty;

      let result;

      if (activeTab === 'youtube') {
        // Validate YouTube URL
        if (!videoUrl) {
          throw new Error('Please enter a YouTube video URL');
        }

        if (!isValidYouTubeUrl(videoUrl)) {
          throw new Error('Please enter a valid YouTube video URL');
        }

        // For anonymous submissions, require email verification
        if (!isAuthenticated) {
          if (!userEmail) {
            throw new Error('Please enter your email address for verification');
          }
          if (!verificationToken) {
            throw new Error('Please verify your email address before submitting');
          }
        }

        logger.info('Submitting YouTube video guide', { title, videoUrl, authenticated: isAuthenticated });

        // Submit YouTube guide (creates PR)
        result = await submitVideoGuide(
          config.wiki.repository.owner,
          config.wiki.repository.repo,
          config,
          {
            videoUrl,
            ...metadata,
          },
          userEmail, // For anonymous submissions
          verificationToken // For anonymous submissions
        );

        logger.info('YouTube video guide submitted successfully', {
          prNumber: result.prNumber,
          prUrl: result.prUrl
        });

        setSuccess({
          message: 'Video guide submitted successfully!',
          prUrl: result.prUrl,
          prNumber: result.prNumber,
        });
      } else {
        // Upload tab
        // Validate video file
        if (!videoFile) {
          throw new Error('Please select a video file to upload');
        }

        // Server-side upload (up to 100MB)
        logger.info('Submitting uploaded video guide', { title, videoSize: videoFile.size });

        // For anonymous uploads, require email verification
        if (!isAuthenticated) {
          if (!userEmail) {
            throw new Error('Please enter your email address for verification');
          }
          if (!verificationToken) {
            throw new Error('Please verify your email address before submitting');
          }
        }

        // Submit uploaded video guide (creates CDN PR + content PR)
        result = await submitUploadedVideoGuide(
          config.wiki.repository.owner,
          config.wiki.repository.repo,
          config,
          videoFile,
          thumbnailFile,
          metadata,
          userEmail, // For anonymous uploads
          verificationToken // For anonymous uploads
        );

        logger.info('Uploaded video guide submitted successfully', {
          videoId: result.videoId,
          cdnPR: result.cdnPR.number,
          contentPR: result.contentPR.number,
        });

        setSuccess({
          message: 'Video uploaded successfully! Two PRs created for review.',
          videoId: result.videoId,
          cdnPR: result.cdnPR,
          contentPR: result.contentPR,
        });
      }

      // Call onSuccess callback
      if (onSuccess) {
        onSuccess(result);
      }

      // Clear form after 5 seconds
      setTimeout(() => {
        resetForm();
        onClose();
      }, 5000);
    } catch (err) {
      logger.error('Failed to submit video guide', { error: err.message, title, tab: activeTab });

      // Provide user-friendly error messages
      let errorMessage = err.message;
      if (errorMessage.includes('Validation Failed')) {
        errorMessage = 'Failed to create pull request. Please try again or contact support.';
      } else if (errorMessage.includes('rate limit')) {
        errorMessage = 'Rate limit exceeded. Please try again later.';
      } else if (errorMessage.includes('verification')) {
        errorMessage = 'Email verification failed. Please verify your email and try again.';
      }

      setError(errorMessage);
    } finally {
      setSubmitting(false);
    }
  };

  // Handle sending verification email for anonymous uploads
  const handleSendVerificationEmail = async () => {
    if (!userEmail || !userEmail.includes('@')) {
      setError('Please enter a valid email address');
      return;
    }

    setSendingEmail(true);
    setError(null);

    try {
      logger.debug('Sending verification email', { email: userEmail });

      // Get github-bot endpoint (platform-aware)
      const { getGithubBotEndpoint } = await import('../../utils/apiEndpoints');
      const endpoint = getGithubBotEndpoint();

      // Call github-bot API to send verification email
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'send-verification-email',
          owner: config.wiki.repository.owner,
          repo: config.wiki.repository.repo,
          email: userEmail,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Failed to send verification email');
      }

      setEmailSent(true);
      logger.info('Verification email sent successfully', { email: userEmail });
    } catch (err) {
      logger.error('Failed to send verification email', { error: err.message, email: userEmail });
      setError(err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  // Handle verifying email code
  const handleVerifyEmail = async () => {
    if (!verificationCode || verificationCode.length !== 6) {
      setError('Please enter the 6-digit verification code');
      return;
    }

    setSendingEmail(true);
    setError(null);

    try {
      logger.debug('Verifying email code', { email: userEmail, code: verificationCode });

      // Get github-bot endpoint (platform-aware)
      const { getGithubBotEndpoint } = await import('../../utils/apiEndpoints');
      const endpoint = getGithubBotEndpoint();

      // Call github-bot API to verify email
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          action: 'verify-email',
          owner: config.wiki.repository.owner,
          repo: config.wiki.repository.repo,
          email: userEmail,
          code: verificationCode,
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.error || 'Invalid or expired verification code');
      }

      const data = await response.json();
      setVerificationToken(data.token);

      // Cache token for 24 hours (same as anonymous edits)
      await cacheVerificationToken(userEmail, data.token);

      logger.info('Email verified successfully and token cached', { email: userEmail });
    } catch (err) {
      logger.error('Failed to verify email', { error: err.message, email: userEmail });
      setError(err.message);
    } finally {
      setSendingEmail(false);
    }
  };

  const resetForm = () => {
    setActiveTab('youtube');
    setVideoUrl('');
    setVideoFile(null);
    setThumbnailFile(null);
    setTitle('');
    setDescription('');
    setCreator('');
    setTags('');
    setCategory('');
    setDifficulty('');
    // Don't clear email/verification state - persist for 24 hours like anonymous edits
    // setUserEmail('');
    // setVerificationCode('');
    // setVerificationToken('');
    // setEmailSent(false);
    setVerificationCode(''); // Clear code but keep email and token
    setError(null);
    setSuccess(null);
  };

  const handleClose = () => {
    if (!submitting) {
      resetForm();
      onClose();
    }
  };

  const modalContent = (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-black bg-opacity-50 backdrop-blur-sm">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-2xl w-full max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Video className="text-blue-500" size={24} />
            <h2 className="text-xl font-bold text-gray-900 dark:text-white">
              Submit Video Guide
            </h2>
          </div>
          <button
            onClick={handleClose}
            disabled={submitting}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            title="Close"
          >
            <X size={24} className="text-gray-600 dark:text-gray-400" />
          </button>
        </div>

        {/* Form */}
        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {/* Tabs (if upload enabled) */}
          {allowRawUpload && (
            <div className="flex gap-2 border-b border-gray-200 dark:border-gray-700 -mt-2 mb-4">
              <button
                type="button"
                onClick={() => setActiveTab('youtube')}
                disabled={submitting}
                className={`
                  flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === 'youtube'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }
                  ${submitting ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <Youtube size={18} />
                YouTube Link
              </button>
              <button
                type="button"
                onClick={() => setActiveTab('upload')}
                disabled={submitting}
                className={`
                  flex items-center gap-2 px-4 py-2 border-b-2 font-medium text-sm transition-colors
                  ${activeTab === 'upload'
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400'
                    : 'border-transparent text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
                  }
                  ${submitting ? 'opacity-50 cursor-not-allowed' : ''}
                `}
              >
                <UploadIcon size={18} />
                Upload Video
              </button>
            </div>
          )}

          {/* Authentication Status */}
          {!isAuthenticated && (
            <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
              <p className="text-sm text-yellow-800 dark:text-yellow-200 font-medium">
                Anonymous Submission
              </p>
              <p className="text-xs text-yellow-700 dark:text-yellow-300 mt-1">
                You're not logged in. Your video guide will be submitted anonymously and reviewed by moderators.
                After approval, you can link it to your account by logging in.
              </p>
            </div>
          )}

          {/* YouTube Tab Content */}
          {activeTab === 'youtube' && (
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                YouTube Video URL <span className="text-red-500">*</span>
              </label>
              <input
                type="url"
                value={videoUrl}
                onChange={(e) => setVideoUrl(e.target.value)}
                placeholder="https://www.youtube.com/watch?v=..."
                required={activeTab === 'youtube'}
                disabled={submitting}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                Example: https://www.youtube.com/watch?v=dQw4w9WgXcQ
              </p>
            </div>
          )}

          {/* Upload Tab Content */}
          {activeTab === 'upload' && (
            <>
              <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg mb-4">
                <p className="text-sm text-blue-800 dark:text-blue-200 font-medium">
                  File Size Limit
                </p>
                <p className="text-xs text-blue-700 dark:text-blue-300 mt-1">
                  Maximum video size: 100MB. For larger videos, please use the YouTube Link option instead.
                </p>
              </div>

              <VideoFileUpload
                onVideoChange={setVideoFile}
                onThumbnailChange={setThumbnailFile}
                disabled={submitting}
              />
            </>
          )}

          {/* Title - Required */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Title <span className="text-red-500">*</span>
            </label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Ultimate Beginner's Guide"
              required
              disabled={submitting}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
          </div>

          {/* Description - Required */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Description <span className="text-red-500">*</span>
            </label>
            <textarea
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="A comprehensive guide covering everything new players need to know..."
              required
              disabled={submitting}
              rows={3}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50 resize-none"
            />
          </div>

          {/* Creator - Optional */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Creator Name (optional)
            </label>
            <input
              type="text"
              value={creator}
              onChange={(e) => setCreator(e.target.value)}
              placeholder="YourName or Channel Name"
              disabled={submitting}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
          </div>

          {/* Category and Difficulty */}
          <div className="grid grid-cols-2 gap-4">
            {/* Category - Optional */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Category (optional)
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">Select...</option>
                {(config?.features?.contentCreators?.videoGuides?.categories || []).map(cat => (
                  <option key={cat} value={cat}>
                    {cat.charAt(0).toUpperCase() + cat.slice(1)}
                  </option>
                ))}
              </select>
            </div>

            {/* Difficulty - Optional */}
            <div>
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                Difficulty (optional)
              </label>
              <select
                value={difficulty}
                onChange={(e) => setDifficulty(e.target.value)}
                disabled={submitting}
                className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
              >
                <option value="">Select...</option>
                {(config?.features?.contentCreators?.videoGuides?.difficulties || []).map(diff => (
                  <option key={diff} value={diff}>
                    {diff.charAt(0).toUpperCase() + diff.slice(1)}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Tags - Optional */}
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Tags (optional)
            </label>
            <input
              type="text"
              value={tags}
              onChange={(e) => setTags(e.target.value)}
              placeholder="tutorial, farming, spirits (comma-separated)"
              disabled={submitting}
              className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
              Separate multiple tags with commas
            </p>
          </div>

          {/* Email Verification for Anonymous Submissions */}
          {!isAuthenticated && (
            <div className="p-4 bg-orange-50 dark:bg-orange-900/20 border border-orange-200 dark:border-orange-800 rounded-lg space-y-3">
              <p className="text-sm font-medium text-orange-800 dark:text-orange-200">
                Email Verification Required
              </p>
              <p className="text-xs text-orange-700 dark:text-orange-300">
                To prevent spam, anonymous video guide submissions require email verification.
              </p>

              {/* Email Input */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                    Email Address <span className="text-red-500">*</span>
                  </label>
                  {verificationToken && (
                    <button
                      type="button"
                      onClick={async () => {
                        await clearCachedVerificationToken(userEmail);
                        setVerificationToken('');
                        setEmailSent(false);
                        setUserEmail('');
                        setVerificationCode('');
                        logger.debug('Cleared cached verification token');
                      }}
                      className="text-xs text-blue-600 dark:text-blue-400 hover:underline"
                    >
                      Change Email
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={userEmail}
                    onChange={(e) => setUserEmail(e.target.value)}
                    placeholder="your.email@example.com"
                    disabled={submitting || sendingEmail || verificationToken}
                    className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                  />
                  {!verificationToken && (
                    <button
                      type="button"
                      onClick={handleSendVerificationEmail}
                      disabled={submitting || sendingEmail || emailSent || !userEmail}
                      className="px-4 py-2 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {sendingEmail ? (
                        <><Loader size={14} className="inline animate-spin mr-1" /> Sending...</>
                      ) : emailSent ? (
                        '✓ Sent'
                      ) : (
                        'Send Code'
                      )}
                    </button>
                  )}
                </div>
              </div>

              {/* Verification Code Input */}
              {emailSent && !verificationToken && (
                <div>
                  <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                    Verification Code <span className="text-red-500">*</span>
                  </label>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      value={verificationCode}
                      onChange={(e) => setVerificationCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="Enter 6-digit code"
                      disabled={submitting || sendingEmail}
                      className="flex-1 px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400 focus:ring-2 focus:ring-blue-500 focus:border-transparent disabled:opacity-50"
                      maxLength={6}
                    />
                    <button
                      type="button"
                      onClick={handleVerifyEmail}
                      disabled={submitting || sendingEmail || verificationCode.length !== 6}
                      className="px-4 py-2 text-sm bg-orange-600 hover:bg-orange-700 text-white rounded disabled:opacity-50 transition-colors whitespace-nowrap"
                    >
                      {sendingEmail ? (
                        <><Loader size={14} className="inline animate-spin mr-1" /> Verifying...</>
                      ) : (
                        'Verify'
                      )}
                    </button>
                  </div>
                  <p className="text-xs text-gray-500 dark:text-gray-400 mt-1">
                    Check your email for the verification code (expires in 10 minutes)
                  </p>
                </div>
              )}

              {/* Verification Success */}
              {verificationToken && (
                <div className="p-2 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded">
                  <p className="text-sm text-green-700 dark:text-green-300 flex items-center gap-2">
                    <svg className="w-4 h-4 flex-shrink-0" fill="currentColor" viewBox="0 0 20 20">
                      <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.707-9.293a1 1 0 00-1.414-1.414L9 10.586 7.707 9.293a1 1 0 00-1.414 1.414l2 2a1 1 0 001.414 0l4-4z" clipRule="evenodd" />
                    </svg>
                    Email verified (valid for 24 hours)
                  </p>
                </div>
              )}
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
              <p className="text-red-600 dark:text-red-400 text-sm font-medium">
                {error}
              </p>
            </div>
          )}

          {/* Success Message */}
          {success && (
            <div className="p-3 bg-green-50 dark:bg-green-900/20 border border-green-200 dark:border-green-800 rounded-lg">
              <p className="text-green-600 dark:text-green-400 text-sm font-medium mb-2">
                {success.message}
              </p>
              {success.cdnPR && success.contentPR ? (
                // Upload submission - show both PRs
                <div className="space-y-2">
                  <a
                    href={success.cdnPR.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    View CDN PR #{success.cdnPR.number} (Video File)
                    <ExternalLink size={14} />
                  </a>
                  <br />
                  <a
                    href={success.contentPR.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                  >
                    View Content PR #{success.contentPR.number} (Metadata)
                    <ExternalLink size={14} />
                  </a>
                </div>
              ) : (
                // YouTube submission - show single PR
                <a
                  href={success.prUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 text-sm text-blue-600 dark:text-blue-400 hover:underline"
                >
                  View Pull Request #{success.prNumber}
                  <ExternalLink size={14} />
                </a>
              )}
            </div>
          )}

          {/* Info Note */}
          {!success && (
            <div className="p-3 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
              <p className="text-blue-800 dark:text-blue-400 text-sm">
                <strong>Note:</strong> {activeTab === 'upload'
                  ? 'Your upload will create two pull requests: one for the video file (CDN) and one for the metadata (content). Admins will review both before publishing.'
                  : 'Your submission will create a pull request for review. Admins will review your video guide before it\'s published.'
                }
                {!isAuthenticated && ' Anonymous submissions can be linked to your account later by logging in.'}
              </p>
            </div>
          )}
        </form>

        {/* Footer */}
        {!success && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 flex justify-end gap-2">
            <button
              type="button"
              onClick={handleClose}
              disabled={submitting}
              className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors disabled:opacity-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              onClick={handleSubmit}
              disabled={submitting}
              className="px-4 py-2 text-sm bg-blue-600 hover:bg-blue-700 text-white rounded disabled:opacity-50 transition-colors flex items-center gap-2"
            >
              {submitting ? (
                <>
                  <Loader size={16} className="animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit'
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
};

export default VideoGuideSubmissionModal;
