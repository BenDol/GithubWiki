import React, { useState, useEffect } from 'react';
import { X, AlertCircle, CheckCircle } from 'lucide-react';
import { createIssueReport } from '../../services/github/botService.js';
import { createIssue } from '../../services/github/issueOperations.js';
import { validateEmailFormat } from '../../utils/emailValidation.js';
import { collectSystemInfo } from '../../utils/systemInfo.js';
import { useAuthStore } from '../../store/authStore.js';
import { useUIStore } from '../../store/uiStore.js';
import { useWikiConfig } from '../../hooks/useWikiConfig.js';

const CATEGORY_OPTIONS = [
  { value: 'bug-report', label: 'Bug Report', description: 'Report a technical issue or bug' },
  { value: 'suggestion', label: 'Suggestion', description: 'Suggest a new feature or improvement' },
  { value: 'content-issue', label: 'Content Issue', description: 'Report inaccurate or outdated content' },
  { value: 'other', label: 'Other', description: 'Other feedback or questions' },
];

const MIN_TITLE_LENGTH = 10;
const MAX_TITLE_LENGTH = 100;
const MIN_DESCRIPTION_LENGTH = 20;
const MAX_DESCRIPTION_LENGTH = 2000;

/**
 * Issue Report Modal
 * Allows users to submit bug reports, suggestions, content issues, and other feedback
 * Supports both anonymous and authenticated submissions
 */
export const IssueReportModal = ({ isOpen, onClose }) => {
  const [category, setCategory] = useState('bug-report');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [email, setEmail] = useState('');
  const [includeSystemInfo, setIncludeSystemInfo] = useState(true);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [errors, setErrors] = useState({});

  const user = useAuthStore((state) => state.user);
  const addToast = useUIStore((state) => state.addToast);
  const { config } = useWikiConfig();

  // Reset form when modal opens/closes
  useEffect(() => {
    if (!isOpen) {
      // Reset form after a short delay to avoid visual glitch
      setTimeout(() => {
        setCategory('bug-report');
        setTitle('');
        setDescription('');
        setEmail('');
        setIncludeSystemInfo(true);
        setErrors({});
      }, 300);
    }
  }, [isOpen]);

  // Close on Escape key
  useEffect(() => {
    const handleEscape = (e) => {
      if (e.key === 'Escape' && isOpen) {
        onClose();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, onClose]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = 'unset';
    }

    return () => {
      document.body.style.overflow = 'unset';
    };
  }, [isOpen]);

  /**
   * Validate form fields
   * @returns {boolean} True if form is valid
   */
  const validateForm = () => {
    const newErrors = {};

    // Validate title
    if (!title.trim()) {
      newErrors.title = 'Title is required';
    } else if (title.length < MIN_TITLE_LENGTH) {
      newErrors.title = `Title must be at least ${MIN_TITLE_LENGTH} characters`;
    } else if (title.length > MAX_TITLE_LENGTH) {
      newErrors.title = `Title must not exceed ${MAX_TITLE_LENGTH} characters`;
    }

    // Validate description
    if (!description.trim()) {
      newErrors.description = 'Description is required';
    } else if (description.length < MIN_DESCRIPTION_LENGTH) {
      newErrors.description = `Description must be at least ${MIN_DESCRIPTION_LENGTH} characters`;
    } else if (description.length > MAX_DESCRIPTION_LENGTH) {
      newErrors.description = `Description must not exceed ${MAX_DESCRIPTION_LENGTH} characters`;
    }

    // Validate email if provided
    if (email && !validateEmailFormat(email)) {
      newErrors.email = 'Please enter a valid email address';
    }

    setErrors(newErrors);
    return Object.keys(newErrors).length === 0;
  };

  /**
   * Handle form submission
   */
  const handleSubmit = async (e) => {
    e.preventDefault();

    if (!validateForm()) {
      return;
    }

    setIsSubmitting(true);

    try {
      // Get repository info from config
      if (!config?.wiki?.repository) {
        throw new Error('Repository configuration not found');
      }

      const { owner, repo } = config.wiki.repository;

      // Collect system information if enabled
      const systemInfo = includeSystemInfo ? collectSystemInfo() : null;

      // Build issue title and body
      const reporterName = user?.login || 'Anonymous';
      const issueTitle = `[Issue Report] ${reporterName} - ${title.trim()}`;

      const categoryDisplay = category.split('-').map(w =>
        w.charAt(0).toUpperCase() + w.slice(1)
      ).join(' ');

      let issueBody = `**Category**: ${categoryDisplay}\n`;
      issueBody += `**Submitted by**: ${reporterName}\n`;
      if (email.trim()) {
        issueBody += `**Email**: ${email.trim()}\n`;
      }
      issueBody += `**Page URL**: ${window.location.href}\n\n`;
      issueBody += `## Description\n\n${description.trim()}\n\n`;

      if (includeSystemInfo && systemInfo) {
        issueBody += `---\n\n**System Information**\n`;
        issueBody += `- **Browser**: ${systemInfo.browser}\n`;
        issueBody += `- **OS**: ${systemInfo.os}\n`;
        issueBody += `- **Screen**: ${systemInfo.screen}\n`;
        issueBody += `- **Timestamp**: ${systemInfo.timestamp}\n`;
      }

      const labels = ['user-report', category];

      let result;

      // If user is authenticated, create issue with their account
      // If anonymous, use bot service
      if (user) {
        console.log('[IssueReportModal] Creating issue as authenticated user:', user.login);
        const issue = await createIssue(owner, repo, issueTitle, issueBody, labels);
        result = {
          issue: {
            number: issue.number,
            url: issue.html_url,
            title: issue.title,
          },
        };
      } else {
        console.log('[IssueReportModal] Creating issue anonymously via bot');
        const report = {
          owner,
          repo,
          category,
          title: title.trim(),
          description: description.trim(),
          email: email.trim() || undefined,
          pageUrl: window.location.href,
          includeSystemInfo,
          systemInfo,
        };
        result = await createIssueReport(report);
      }

      // Show success toast with link to issue
      addToast(
        <>
          Issue submitted successfully!{' '}
          <a
            href={result.issue.url}
            target="_blank"
            rel="noopener noreferrer"
            className="underline font-semibold hover:text-white"
          >
            View Issue #{result.issue.number}
          </a>
        </>,
        'success',
        8000
      );

      // Close modal after short delay
      setTimeout(() => {
        onClose();
      }, 1500);
    } catch (error) {
      console.error('[IssueReportModal] Submission failed:', error);
      addToast(
        error.message || 'Failed to submit issue report. Please try again.',
        'error',
        5000
      );
    } finally {
      setIsSubmitting(false);
    }
  };

  /**
   * Handle input change with character counter
   */
  const handleTitleChange = (e) => {
    const value = e.target.value;
    if (value.length <= MAX_TITLE_LENGTH) {
      setTitle(value);
      // Clear error when user starts typing
      if (errors.title) {
        setErrors({ ...errors, title: undefined });
      }
    }
  };

  /**
   * Handle description change with character counter
   */
  const handleDescriptionChange = (e) => {
    const value = e.target.value;
    if (value.length <= MAX_DESCRIPTION_LENGTH) {
      setDescription(value);
      // Clear error when user starts typing
      if (errors.description) {
        setErrors({ ...errors, description: undefined });
      }
    }
  };

  /**
   * Handle email change
   */
  const handleEmailChange = (e) => {
    const value = e.target.value;
    setEmail(value);
    // Clear error when user starts typing
    if (errors.email) {
      setErrors({ ...errors, email: undefined });
    }
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/50 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Modal Content */}
      <div className="relative max-w-2xl w-full bg-gradient-to-br from-slate-900 to-slate-800 rounded-lg shadow-2xl max-h-[90vh] overflow-hidden flex flex-col">
        {/* Header */}
        <div className="flex items-center justify-between p-6 border-b border-slate-700">
          <div>
            <h2 className="text-2xl font-bold text-white">Report an Issue</h2>
            <p className="text-sm text-slate-400 mt-1">
              {user ? `Submitting as ${user.login}` : 'Submitting anonymously'}
            </p>
          </div>
          <button
            onClick={onClose}
            className="text-slate-400 hover:text-white transition-colors"
            aria-label="Close modal"
          >
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Scrollable Form Content */}
        <div className="flex-1 overflow-y-auto">
          {/* Form */}
          <form onSubmit={handleSubmit} className="p-6 space-y-6">
          {/* Category Selection */}
          <div>
            <label htmlFor="category" className="block text-sm font-medium text-slate-300 mb-2">
              Category
            </label>
            <select
              id="category"
              value={category}
              onChange={(e) => setCategory(e.target.value)}
              className="w-full px-4 py-2 bg-slate-800 border border-slate-700 rounded-lg text-white focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            >
              {CATEGORY_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label} - {option.description}
                </option>
              ))}
            </select>
          </div>

          {/* Title */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="title" className="block text-sm font-medium text-slate-300">
                Title <span className="text-red-400">*</span>
              </label>
              <span className={`text-xs ${title.length > MAX_TITLE_LENGTH ? 'text-red-400' : 'text-slate-500'}`}>
                {title.length} / {MAX_TITLE_LENGTH}
              </span>
            </div>
            <input
              id="title"
              type="text"
              value={title}
              onChange={handleTitleChange}
              placeholder="Brief summary of the issue"
              className={`w-full px-4 py-2 bg-slate-800 border ${
                errors.title ? 'border-red-500' : 'border-slate-700'
              } rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            />
            {errors.title && (
              <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.title}
              </p>
            )}
          </div>

          {/* Description */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="description" className="block text-sm font-medium text-slate-300">
                Description <span className="text-red-400">*</span>
              </label>
              <span className={`text-xs ${description.length > MAX_DESCRIPTION_LENGTH ? 'text-red-400' : 'text-slate-500'}`}>
                {description.length} / {MAX_DESCRIPTION_LENGTH}
              </span>
            </div>
            <textarea
              id="description"
              value={description}
              onChange={handleDescriptionChange}
              placeholder="Detailed description of the issue, including steps to reproduce if applicable"
              rows={6}
              className={`w-full px-4 py-2 bg-slate-800 border ${
                errors.description ? 'border-red-500' : 'border-slate-700'
              } rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent resize-vertical`}
            />
            {errors.description && (
              <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.description}
              </p>
            )}
          </div>

          {/* Email (Optional) */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <label htmlFor="email" className="block text-sm font-medium text-slate-300">
                Email <span className="text-slate-500 text-xs">(optional)</span>
              </label>
            </div>
            <input
              id="email"
              type="email"
              value={email}
              onChange={handleEmailChange}
              placeholder="your.email@example.com"
              className={`w-full px-4 py-2 bg-slate-800 border ${
                errors.email ? 'border-red-500' : 'border-slate-700'
              } rounded-lg text-white placeholder-slate-500 focus:ring-2 focus:ring-blue-500 focus:border-transparent`}
            />
            {errors.email && (
              <p className="mt-1 text-sm text-red-400 flex items-center gap-1">
                <AlertCircle className="w-4 h-4" />
                {errors.email}
              </p>
            )}
            <p className="mt-1 text-xs text-slate-500">
              We'll use this to follow up on your report (if needed)
            </p>
          </div>

          {/* System Info Opt-out */}
          <div className="flex items-start gap-3">
            <input
              id="includeSystemInfo"
              type="checkbox"
              checked={includeSystemInfo}
              onChange={(e) => setIncludeSystemInfo(e.target.checked)}
              className="mt-1 w-4 h-4 bg-slate-800 border-slate-700 rounded text-blue-500 focus:ring-2 focus:ring-blue-500 focus:ring-offset-slate-900"
            />
            <div>
              <label htmlFor="includeSystemInfo" className="text-sm font-medium text-slate-300 cursor-pointer">
                Include system information
              </label>
              <p className="text-xs text-slate-500 mt-1">
                Browser, OS, screen resolution, and timestamp. Helps us reproduce and fix issues faster.
              </p>
            </div>
          </div>

          {/* Action Buttons */}
          <div className="flex items-center justify-end gap-3 pt-4 border-t border-slate-700">
            <button
              type="button"
              onClick={onClose}
              disabled={isSubmitting}
              className="px-4 py-2 text-slate-300 hover:text-white transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white font-medium rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
            >
              {isSubmitting ? (
                <>
                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin" />
                  Submitting...
                </>
              ) : (
                <>
                  <CheckCircle className="w-4 h-4" />
                  Submit Report
                </>
              )}
            </button>
          </div>
        </form>
        </div>
      </div>
    </div>
  );
};
