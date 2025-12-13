import { useState, useEffect, useCallback, useRef } from 'react';
import { useBeforeUnload, useNavigate, useLocation } from 'react-router-dom';
import matter from 'gray-matter';
import MarkdownEditor from './MarkdownEditor';
import PageViewer from './PageViewer';
import { useUIStore } from '../../store/uiStore';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import Button from '../common/Button';
import TagInput from '../common/TagInput';
import { isValidPageId } from '../../utils/pageIdUtils';

/**
 * PageEditor component with live preview
 * Provides markdown editing with real-time preview
 */
const PageEditor = ({
  initialContent,
  initialMetadata,
  onSave,
  onCancel,
  isSaving = false
}) => {
  const [content, setContent] = useState(initialContent || '');
  const [viewMode, setViewMode] = useState('split'); // 'split', 'edit', 'preview'
  const [editSummary, setEditSummary] = useState('');
  const [metadataExpanded, setMetadataExpanded] = useState(true);
  const [validationErrors, setValidationErrors] = useState([]);
  const [isToolbarStuck, setIsToolbarStuck] = useState(false);
  const [showFrontmatter, setShowFrontmatter] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);

  // Metadata fields
  const [metadata, setMetadata] = useState({
    id: '',
    title: '',
    description: '',
    tags: [],
    category: '',
    date: '',
  });

  const { darkMode } = useUIStore();
  const { config } = useWikiConfig();

  // Refs for sticky detection
  const sentinelRef = useRef(null);
  const toolbarRef = useRef(null);

  // Get available categories from sections
  const availableCategories = config?.sections
    ?.map(section => section.title)
    .filter(Boolean)
    .sort() || [];

  // Detect when toolbar becomes stuck
  useEffect(() => {
    const sentinel = sentinelRef.current;
    if (!sentinel) return;

    const observer = new IntersectionObserver(
      ([entry]) => {
        // When sentinel is not visible (scrolled past), toolbar is stuck
        setIsToolbarStuck(!entry.isIntersecting);
      },
      {
        threshold: 0,
        rootMargin: '-64px 0px 0px 0px', // Account for header height
      }
    );

    observer.observe(sentinel);

    return () => {
      observer.disconnect();
    };
  }, []);

  // Parse initial content to extract metadata and body
  useEffect(() => {
    if (initialContent) {
      try {
        const parsed = matter(initialContent);
        setMetadata({
          id: parsed.data.id || '',
          title: parsed.data.title || '',
          description: parsed.data.description || '',
          tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
          category: parsed.data.category || '',
          date: parsed.data.date || '',
        });
      } catch (err) {
        console.error('Failed to parse frontmatter:', err);
      }
    }
  }, [initialContent]);

  // Track if content has been modified
  useEffect(() => {
    // Normalize content for comparison (trim whitespace, normalize line endings)
    const normalizeContent = (str) => {
      if (!str) return '';
      return str.trim().replace(/\r\n/g, '\n');
    };

    const currentNormalized = normalizeContent(content);
    const initialNormalized = normalizeContent(initialContent);

    const hasChanged = currentNormalized !== initialNormalized;
    setHasUnsavedChanges(hasChanged);
  }, [content, initialContent]);

  // Block browser navigation (refresh, close tab, etc.)
  useBeforeUnload(
    useCallback((event) => {
      if (hasUnsavedChanges && !isSaving) {
        event.preventDefault();
        return (event.returnValue = 'You have unsaved changes. Are you sure you want to leave?');
      }
    }, [hasUnsavedChanges, isSaving])
  );

  // Block React Router navigation (back button, links)
  useEffect(() => {
    if (!hasUnsavedChanges || isSaving) return;

    const handleBeforeUnload = (e) => {
      if (hasUnsavedChanges && !isSaving) {
        e.preventDefault();
        e.returnValue = '';
      }
    };

    // Block back/forward browser navigation
    const handlePopState = (e) => {
      if (hasUnsavedChanges && !isSaving) {
        const confirmLeave = window.confirm(
          'You have unsaved changes. Are you sure you want to leave this page?'
        );
        if (!confirmLeave) {
          // Push current state back to prevent navigation
          window.history.pushState(null, '', window.location.href);
        }
      }
    };

    // Intercept all link clicks to confirm navigation
    const handleLinkClick = (e) => {
      // Check if the click target is a link or inside a link
      const link = e.target.closest('a');
      if (link && hasUnsavedChanges && !isSaving) {
        // Only intercept internal links (React Router links)
        const href = link.getAttribute('href');
        if (href && !href.startsWith('http') && !href.startsWith('mailto:')) {
          const confirmLeave = window.confirm(
            'You have unsaved changes. Are you sure you want to leave this page?'
          );
          if (!confirmLeave) {
            e.preventDefault();
            e.stopPropagation();
          }
        }
      }
    };

    // Push a dummy state to enable popstate detection
    window.history.pushState(null, '', window.location.href);

    window.addEventListener('beforeunload', handleBeforeUnload);
    window.addEventListener('popstate', handlePopState);
    document.addEventListener('click', handleLinkClick, true);

    return () => {
      window.removeEventListener('beforeunload', handleBeforeUnload);
      window.removeEventListener('popstate', handlePopState);
      document.removeEventListener('click', handleLinkClick, true);
    };
  }, [hasUnsavedChanges, isSaving]);

  // Update content when metadata changes
  const updateContentWithMetadata = (newMetadata) => {
    try {
      const parsed = matter(content);
      const updatedContent = matter.stringify(parsed.content, newMetadata);
      setContent(updatedContent);
    } catch (err) {
      console.error('Failed to update frontmatter:', err);
    }
  };

  // Validate metadata format
  const validateMetadata = useCallback(() => {
    const errors = [];

    // Check for unknown/invalid metadata fields in the raw content
    try {
      const parsed = matter(content);
      const allowedFields = ['id', 'title', 'description', 'tags', 'category', 'date'];
      const actualFields = Object.keys(parsed.data);

      const unknownFields = actualFields.filter(field => !allowedFields.includes(field));
      if (unknownFields.length > 0) {
        unknownFields.forEach(field => {
          errors.push(`Unknown metadata field: "${field}". Did you mean one of: ${allowedFields.join(', ')}?`);
        });
      }

      // Validate content body (markdown content without frontmatter)
      const bodyContent = parsed.content?.trim() || '';
      if (!bodyContent) {
        errors.push('Page content cannot be empty - please write some content');
      } else if (bodyContent.length < 10) {
        errors.push('Page content is too short - please write at least 10 characters');
      } else {
        // Check for placeholder content
        if (/write your content here/i.test(bodyContent)) {
          errors.push('Page content appears to be placeholder text - please write real content');
        }
        // Check if content is just headings with no actual content
        const contentWithoutHeadings = bodyContent.replace(/^#+\s+.*$/gm, '').trim();
        if (contentWithoutHeadings.length < 20) {
          errors.push('Page content must include more than just headings - please add actual content');
        }
      }
    } catch (err) {
      errors.push(`Failed to parse frontmatter: ${err.message}`);
    }

    // Title validation
    if (!metadata.title || !metadata.title.trim()) {
      errors.push('Title is required and cannot be empty');
    } else {
      const title = metadata.title.trim();
      if (title.length < 3) {
        errors.push('Title must be at least 3 characters long');
      }
      if (title.length > 200) {
        errors.push('Title must be 200 characters or less');
      }
      // Check for invalid characters that might break YAML
      if (/[\n\r\t]/.test(metadata.title)) {
        errors.push('Title cannot contain newlines or tabs');
      }
      // Check for placeholder text
      if (/your (page )?title/i.test(title)) {
        errors.push('Title appears to be placeholder text - please enter a real title');
      }
    }

    // ID validation (optional field, but must be valid if present)
    if (metadata.id && metadata.id.trim()) {
      const id = metadata.id.trim();
      if (!isValidPageId(id)) {
        errors.push('Page ID must contain only lowercase letters, numbers, and hyphens (cannot start or end with hyphen)');
      }
      if (id.length > 100) {
        errors.push('Page ID must be 100 characters or less');
      }
    }

    // Description validation
    if (!metadata.description || !metadata.description.trim()) {
      errors.push('Description is required and cannot be empty');
    } else {
      const description = metadata.description.trim();
      if (description.length < 10) {
        errors.push('Description must be at least 10 characters long');
      }
      if (description.length > 500) {
        errors.push('Description must be 500 characters or less');
      }
      if (/[\n\r\t]/.test(metadata.description)) {
        errors.push('Description cannot contain newlines or tabs');
      }
      // Check for placeholder text
      if (/brief description/i.test(description)) {
        errors.push('Description appears to be placeholder text - please enter a real description');
      }
    }

    // Tags validation
    if (!metadata.tags || !Array.isArray(metadata.tags) || metadata.tags.length === 0) {
      errors.push('At least one tag is required - tags help with search and organization');
    } else if (metadata.tags && Array.isArray(metadata.tags)) {
      if (metadata.tags.length > 20) {
        errors.push('Maximum 20 tags allowed');
      }
      metadata.tags.forEach((tag, index) => {
        if (typeof tag !== 'string') {
          errors.push(`Tag at position ${index + 1} must be a string`);
        } else if (!tag.trim()) {
          errors.push(`Tag at position ${index + 1} is empty`);
        } else if (tag.length > 50) {
          errors.push(`Tag "${tag}" exceeds 50 character limit`);
        } else if (/[\n\r\t,]/.test(tag)) {
          errors.push(`Tag "${tag}" contains invalid characters (newlines, tabs, or commas)`);
        }
      });

      // Check for duplicate tags
      const uniqueTags = new Set(metadata.tags.map(t => t.toLowerCase()));
      if (uniqueTags.size !== metadata.tags.length) {
        errors.push('Duplicate tags detected (case-insensitive)');
      }
    } else if (metadata.tags && !Array.isArray(metadata.tags)) {
      errors.push('Tags must be an array');
    }

    // Category validation
    if (!metadata.category || !metadata.category.trim()) {
      errors.push('Category is required and cannot be empty');
    } else {
      if (metadata.category.length > 100) {
        errors.push('Category must be 100 characters or less');
      }
      if (/[\n\r\t]/.test(metadata.category)) {
        errors.push('Category cannot contain newlines or tabs');
      }
    }

    // Date validation
    if (!metadata.date) {
      errors.push('Date is required');
    } else {
      const dateStr = metadata.date.toString();
      if (dateStr) {
        try {
          const parsedDate = new Date(dateStr);
          if (isNaN(parsedDate.getTime())) {
            errors.push('Date format is invalid');
          } else {
            // Check if date is in a reasonable range (not before 1900 or too far in future)
            const year = parsedDate.getFullYear();
            if (year < 1900 || year > 2100) {
              errors.push('Date year must be between 1900 and 2100');
            }
          }
        } catch (err) {
          errors.push('Date format is invalid');
        }
      } else {
        errors.push('Date is required');
      }
    }

    // Validate that frontmatter can be properly serialized
    try {
      matter.stringify('', metadata);
    } catch (err) {
      errors.push(`Frontmatter serialization error: ${err.message}`);
    }

    // Validate that content with metadata can be parsed back
    try {
      const testContent = matter.stringify(content.split('---').slice(2).join('---').trim() || '', metadata);
      const parsed = matter(testContent);

      // Verify critical fields are preserved
      if (parsed.data.title !== metadata.title) {
        errors.push('Title cannot be properly serialized - may contain special characters');
      }
    } catch (err) {
      errors.push(`Content validation error: ${err.message}`);
    }

    return errors;
  }, [metadata, content]);

  const handleMetadataChange = (field, value) => {
    const newMetadata = { ...metadata, [field]: value };
    setMetadata(newMetadata);
    updateContentWithMetadata(newMetadata);
  };

  // Validate metadata whenever it changes
  useEffect(() => {
    const errors = validateMetadata();
    setValidationErrors(errors);
  }, [validateMetadata]);

  // Get editor content (body only or full content with frontmatter)
  const getEditorContent = () => {
    if (showFrontmatter) {
      return content;
    }
    // Extract only the body without frontmatter
    try {
      const parsed = matter(content);
      return parsed.content.trim();
    } catch (err) {
      return content;
    }
  };

  // When content is manually edited in the markdown editor, sync back to metadata state
  const handleContentChange = (newContent) => {
    // If frontmatter is hidden, reconstruct full content with existing metadata
    if (!showFrontmatter) {
      try {
        const fullContent = matter.stringify(newContent, metadata);
        setContent(fullContent);
      } catch (err) {
        console.error('Failed to reconstruct content with metadata:', err);
        setContent(newContent);
      }
    } else {
      setContent(newContent);

      // Try to parse frontmatter and update metadata state
      try {
        const parsed = matter(newContent);
        if (parsed.data) {
          setMetadata({
            id: parsed.data.id || '',
            title: parsed.data.title || '',
            description: parsed.data.description || '',
            tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
            category: parsed.data.category || '',
            date: parsed.data.date || '',
          });
        }
      } catch (err) {
        // If parsing fails, keep existing metadata
        console.error('Failed to sync metadata from content:', err);
      }
    }
  };

  const handleSave = () => {
    if (!content.trim()) {
      alert('Content cannot be empty');
      return;
    }

    // Check if content has actually changed (using same normalization as unsaved changes detection)
    const normalizeContent = (str) => {
      if (!str) return '';
      return str.trim().replace(/\r\n/g, '\n');
    };

    if (normalizeContent(content) === normalizeContent(initialContent)) {
      alert('No changes detected. Please make changes before saving.');
      return;
    }

    // Run validation
    const validationErrors = validateMetadata();

    if (validationErrors.length > 0) {
      // Show validation errors in a formatted alert
      const errorMessage = 'Cannot save page due to metadata validation errors:\n\n' +
        validationErrors.map((err, idx) => `${idx + 1}. ${err}`).join('\n');
      alert(errorMessage);
      return;
    }

    onSave?.(content, editSummary);
  };

  // Handle cancel with confirmation if there are unsaved changes
  const handleCancel = () => {
    if (hasUnsavedChanges && !isSaving) {
      const confirmLeave = window.confirm(
        'You have unsaved changes. Are you sure you want to leave this page?'
      );
      if (!confirmLeave) {
        return;
      }
    }
    onCancel?.();
  };

  return (
    <div className="space-y-4">
      {/* Sentinel for detecting when toolbar becomes stuck */}
      <div ref={sentinelRef} className="h-0" />

      {/* Toolbar - Sticky */}
      <div
        ref={toolbarRef}
        className={`sticky top-16 z-40 flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 p-3 shadow-md transition-all ${
          isToolbarStuck ? 'rounded-b-lg' : 'rounded-lg'
        }`}
      >
        <div className="flex items-center space-x-2">
          {/* View Mode Buttons */}
          <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-1">
            <button
              onClick={() => setViewMode('edit')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'edit'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              📝 Edit Only
            </button>
            <button
              onClick={() => setViewMode('split')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'split'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              ⚡ Split View
            </button>
            <button
              onClick={() => setViewMode('preview')}
              className={`px-3 py-1.5 text-sm font-medium rounded-md transition-colors ${
                viewMode === 'preview'
                  ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                  : 'text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white'
              }`}
            >
              👁️ Preview Only
            </button>
          </div>

          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

          <span className="text-sm text-gray-600 dark:text-gray-400">
            {content.length} characters
          </span>

          {hasUnsavedChanges && (
            <>
              <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />
              <span className="flex items-center text-sm text-amber-600 dark:text-amber-400 font-medium">
                <svg className="w-4 h-4 mr-1" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                Unsaved changes
              </span>
            </>
          )}
        </div>

        <div className="flex items-center space-x-2">
          {validationErrors.length > 0 && (
            <span className="text-xs text-red-600 dark:text-red-400 font-medium">
              {validationErrors.length} validation {validationErrors.length === 1 ? 'error' : 'errors'}
            </span>
          )}
          <Button variant="secondary" size="sm" onClick={handleCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button
            variant="primary"
            size="sm"
            onClick={handleSave}
            disabled={isSaving || validationErrors.length > 0}
            title={validationErrors.length > 0 ? 'Fix validation errors before saving' : 'Save changes'}
          >
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Metadata Section - Collapsible */}
      <div className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg overflow-visible">
        <button
          onClick={() => setMetadataExpanded(!metadataExpanded)}
          className="w-full flex items-center justify-between p-3 hover:bg-gray-50 dark:hover:bg-gray-700/50 transition-colors"
        >
          <div className="flex items-center space-x-2">
            <svg
              className={`w-5 h-5 text-gray-500 dark:text-gray-400 transition-transform ${
                metadataExpanded ? 'rotate-90' : ''
              }`}
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Page Metadata
            </h3>
          </div>
          <span className="text-xs text-gray-500 dark:text-gray-400">
            {metadataExpanded ? 'Click to collapse' : 'Click to expand'}
          </span>
        </button>

        {metadataExpanded && (
          <div className="p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-800/50">
            <p className="text-xs text-gray-600 dark:text-gray-400 mb-4">
              Fields marked with <span className="text-red-600 dark:text-red-400 font-semibold">*</span> are required
            </p>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              {/* Title */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Title *
                </label>
                <input
                  type="text"
                  value={metadata.title}
                  onChange={(e) => handleMetadataChange('title', e.target.value)}
                  placeholder="Page title"
                  className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Category */}
              <div className="space-y-1.5">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Category *
                </label>
                <select
                  value={metadata.category}
                  onChange={(e) => handleMetadataChange('category', e.target.value)}
                  className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                >
                  <option value="">-- Select a category --</option>
                  {availableCategories.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </div>

              {/* Description */}
              <div className="space-y-1.5 md:col-span-2">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Description *
                </label>
                <input
                  type="text"
                  value={metadata.description}
                  onChange={(e) => handleMetadataChange('description', e.target.value)}
                  placeholder="Brief description of the page"
                  className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                />
              </div>

              {/* Tags - Full width on mobile, half on desktop */}
              <div className="space-y-1.5 md:col-span-1">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Tags *
                </label>
                <TagInput
                  value={metadata.tags}
                  onChange={(tags) => handleMetadataChange('tags', tags)}
                  placeholder="Type to search or add tags..."
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  At least one tag is required
                </p>
              </div>

              {/* Date */}
              <div className="space-y-1.5 md:col-span-1">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Creation Date
                </label>
                <input
                  type="date"
                  value={(() => {
                    if (!metadata.date) return '';
                    try {
                      const date = new Date(metadata.date);
                      return isNaN(date.getTime()) ? '' : date.toISOString().split('T')[0];
                    } catch {
                      return '';
                    }
                  })()}
                  onChange={(e) => handleMetadataChange('date', e.target.value)}
                  disabled
                  className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-gray-100 dark:bg-gray-900 text-gray-600 dark:text-gray-400 cursor-not-allowed"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Automatically set on page creation
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Validation Status - Only show when there are errors */}
      {validationErrors.length > 0 && (
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-4">
          <div className="flex items-start space-x-3">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1">
              <h4 className="text-sm font-semibold text-red-900 dark:text-red-200 mb-2">
                Metadata Validation Errors
              </h4>
              <ul className="text-sm text-red-800 dark:text-red-300 space-y-1 list-disc list-inside">
                {validationErrors.map((error, index) => (
                  <li key={index}>{error}</li>
                ))}
              </ul>
              <p className="text-xs text-red-700 dark:text-red-400 mt-3">
                Please fix these errors before saving. The page cannot be saved with invalid metadata.
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Editor and Preview */}
      <div className={`grid gap-4 ${
        viewMode === 'split' ? 'grid-cols-1 lg:grid-cols-2' : 'grid-cols-1'
      }`}>
        {/* Editor */}
        {(viewMode === 'edit' || viewMode === 'split') && (
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Editor
            </h3>
            <div className="flex items-center gap-3">
              <button
                onClick={() => setShowFrontmatter(!showFrontmatter)}
                className="text-xs text-blue-600 dark:text-blue-400 hover:text-blue-800 dark:hover:text-blue-300 font-medium"
              >
                {showFrontmatter ? '📄 Hide Frontmatter' : '📄 Show Frontmatter'}
              </button>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Markdown supported
              </span>
            </div>
          </div>

          <div className="h-[600px]">
            <MarkdownEditor
              key={showFrontmatter ? 'with-frontmatter' : 'body-only'}
              value={getEditorContent()}
              onChange={handleContentChange}
              darkMode={darkMode}
              placeholder="Write your content in Markdown..."
            />
          </div>

          {/* Edit summary - Only show in edit and split modes */}
          {viewMode !== 'preview' && (
            <div className="space-y-2">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
                Edit Summary (optional)
              </label>
              <input
                type="text"
                value={editSummary}
                onChange={(e) => setEditSummary(e.target.value)}
                placeholder="Briefly describe your changes..."
                className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <p className="text-xs text-gray-500 dark:text-gray-400">
                This will be included in the edit request description
              </p>
            </div>
          )}
        </div>
        )}

        {/* Preview */}
        {(viewMode === 'preview' || viewMode === 'split') && (
          <div className={`space-y-3 ${viewMode === 'preview' ? 'max-w-full' : ''}`}>
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Preview
              </h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Live preview
              </span>
            </div>

            <div className={`h-[600px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 ${
              viewMode === 'preview' ? 'p-6 md:p-8' : 'p-6'
            }`}>
              {content ? (
                <PageViewer
                  content={content}
                  metadata={metadata}
                  className={viewMode === 'preview' ? 'max-w-full' : ''}
                />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-600">
                  <div className="text-center">
                    <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <p className="text-sm">Preview will appear here</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
          Editing Guidelines
        </h4>
        <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside">
          <li>Your changes will create an edit request for review</li>
          <li>Use the metadata fields above to edit page properties</li>
          <li>Use standard Markdown syntax for formatting</li>
          <li>Preview your changes before saving</li>
          <li>Add a clear edit summary to help reviewers</li>
        </ul>
      </div>
    </div>
  );
};

export default PageEditor;
