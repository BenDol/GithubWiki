import { useState, useEffect, useCallback, useRef, useMemo } from 'react';
import { useBeforeUnload, useNavigate, useLocation } from 'react-router-dom';
import matter from 'gray-matter';
import MarkdownEditor from './MarkdownEditor';
import MarkdownFormatToolbar from './MarkdownFormatToolbar';
import PageViewer from './PageViewer';
import ImagePicker from './ImagePicker';
import LinkDialog from './LinkDialog';
import ColorPicker from './ColorPicker';
import { useUIStore } from '../../store/uiStore';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import Button from '../common/Button';
import TagInput from '../common/TagInput';
import { isValidPageId } from '../../utils/pageIdUtils';
import { getDataSelector, hasDataSelector } from '../../utils/dataSelectorRegistry';
import { getPicker, hasPicker, getAllPickers } from '../../utils/contentRendererRegistry';
import { Image as ImageIcon, Database } from 'lucide-react';

/**
 * PageEditor component with live preview
 * Provides markdown editing with real-time preview
 */
const PageEditor = ({
  initialContent,
  initialMetadata,
  onSave,
  onCancel,
  isSaving = false,
  isConfiguringPR = false,
  contentProcessor = null,
  customComponents = {},
  renderSkillPreview = null,
  renderEquipmentPreview = null,
  dataAutocompleteSearch = null
}) => {
  const [content, setContent] = useState(initialContent || '');
  const [viewMode, setViewMode] = useState('split'); // 'split', 'edit', 'preview'
  const [editSummary, setEditSummary] = useState('');
  const [metadataExpanded, setMetadataExpanded] = useState(true);
  const [validationErrors, setValidationErrors] = useState([]);
  const [isToolbarStuck, setIsToolbarStuck] = useState(false);
  const [showFrontmatter, setShowFrontmatter] = useState(false);
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false);
  const [shakeValidationError, setShakeValidationError] = useState(false);
  const [showSkillPicker, setShowSkillPicker] = useState(false);
  const [showEquipmentPicker, setShowEquipmentPicker] = useState(false);
  const [showSpiritPicker, setShowSpiritPicker] = useState(false);
  const [showImagePicker, setShowImagePicker] = useState(false);
  const [showDataSelector, setShowDataSelector] = useState(false);
  const [showLinkDialog, setShowLinkDialog] = useState(false);
  const [linkDialogText, setLinkDialogText] = useState('');
  const [showColorPicker, setShowColorPicker] = useState(false);
  const [boldActive, setBoldActive] = useState(false);
  const [italicActive, setItalicActive] = useState(false);
  const [savedSelection, setSavedSelection] = useState(null);

  // Debug: Track showColorPicker state changes
  useEffect(() => {
    console.log('[PageEditor] showColorPicker state changed to:', showColorPicker);
  }, [showColorPicker]);

  // Metadata fields
  const [metadata, setMetadata] = useState({
    id: '',
    title: '',
    description: '',
    tags: [],
    category: '',
    date: '',
    order: 0,
  });

  const { darkMode } = useUIStore();
  const { config } = useWikiConfig();

  // Get registered picker components from parent project
  const SpiritPicker = getPicker('spirit');
  const SkillPicker = getPicker('skill');
  const EquipmentPicker = getPicker('equipment');

  // Build content pickers array for toolbar (generic + registered)
  const contentPickers = useMemo(() => {
    const pickers = [];

    // Add generic image picker
    pickers.push({
      icon: ImageIcon,
      label: 'Insert Image',
      action: 'image',
      handler: () => setShowImagePicker(true)
    });

    // Add generic data selector (if available)
    if (hasDataSelector()) {
      pickers.push({
        icon: Database,
        label: 'Insert Data',
        action: 'data',
        handler: () => setShowDataSelector(true)
      });
    }

    // Add registered pickers (skill, equipment, spirit, etc.) from parent project
    const registeredPickers = getAllPickers();
    registeredPickers.forEach(picker => {
      const pickerComponent = getPicker(picker.name);
      if (pickerComponent) {
        // Determine which state to toggle based on picker name
        let handler;
        if (picker.name === 'spirit') {
          handler = () => setShowSpiritPicker(true);
        } else if (picker.name === 'skill') {
          handler = () => setShowSkillPicker(true);
        } else if (picker.name === 'equipment') {
          handler = () => setShowEquipmentPicker(true);
        }

        if (handler) {
          pickers.push({
            icon: picker.icon,
            label: picker.label,
            action: picker.action,
            handler
          });
        }
      }
    });

    return pickers;
  }, []);

  // Refs for sticky detection and scrolling
  const sentinelRef = useRef(null);
  const toolbarRef = useRef(null);
  const validationErrorsRef = useRef(null);
  const editorApiRef = useRef(null);
  const colorButtonRef = useRef(null);
  const metadataRef = useRef(metadata); // Track latest metadata to prevent loss during race conditions

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
    // console.log('[PageEditor] Initializing with:', {
    //   hasInitialContent: !!initialContent,
    //   hasInitialMetadata: !!initialMetadata,
    //   initialMetadataKeys: initialMetadata ? Object.keys(initialMetadata) : []
    // });

    // Prefer initialMetadata if provided, otherwise parse from content
    if (initialMetadata && Object.keys(initialMetadata).length > 0) {
      const newMetadata = {
        ...initialMetadata, // Preserve all existing fields
        id: initialMetadata.id || '',
        title: initialMetadata.title || '',
        description: initialMetadata.description || '',
        tags: Array.isArray(initialMetadata.tags) ? initialMetadata.tags : [],
        category: initialMetadata.category || '',
        date: initialMetadata.date || '',
        order: initialMetadata.order ?? 0,
      };

      // console.log('[PageEditor] Setting metadata from initialMetadata:', newMetadata);
      setMetadata(newMetadata);
      metadataRef.current = newMetadata; // Keep ref in sync

      // Ensure content has the metadata in frontmatter
      if (initialContent) {
        try {
          const parsed = matter(initialContent);
          const contentWithMetadata = matter.stringify(parsed.content, newMetadata);
          // console.log('[PageEditor] Reconstructed content with metadata');
          setContent(contentWithMetadata);
        } catch (err) {
          console.error('[PageEditor] Failed to reconstruct content with metadata:', err);
          setContent(initialContent);
        }
      }
    } else if (initialContent) {
      try {
        const parsed = matter(initialContent);
        const newMetadata = {
          ...parsed.data, // Preserve all existing fields
          id: parsed.data.id || '',
          title: parsed.data.title || '',
          description: parsed.data.description || '',
          tags: Array.isArray(parsed.data.tags) ? parsed.data.tags : [],
          category: parsed.data.category || '',
          date: parsed.data.date || '',
          order: parsed.data.order ?? 0,
        };

        // console.log('[PageEditor] Setting metadata from content:', newMetadata);
        setMetadata(newMetadata);
        metadataRef.current = newMetadata; // Keep ref in sync

        // Also ensure content is set (in case it wasn't set yet)
        if (!content || content !== initialContent) {
          // console.log('[PageEditor] Setting content from initialContent');
          setContent(initialContent);
        }
      } catch (err) {
        console.error('[PageEditor] Failed to parse frontmatter:', err);
      }
    }
  }, [initialContent, initialMetadata]);

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
    // console.log('[PageEditor] updateContentWithMetadata called', { newMetadata });

    try {
      const parsed = matter(content);
      // console.log('[PageEditor] Current parsed data from content:', parsed.data);

      // CRITICAL: Ensure we never save empty metadata
      // Merge with existing parsed metadata to preserve any fields not in newMetadata
      const safeMetadata = {
        ...parsed.data, // Keep any existing fields from content
        ...newMetadata, // Override with new values
      };
      // console.log('[PageEditor] Safe merged metadata:', safeMetadata);

      // Extra safety: ensure required fields are never empty
      if (!safeMetadata.title?.trim() || !safeMetadata.category?.trim() ||
          !Array.isArray(safeMetadata.tags) || safeMetadata.tags.length === 0) {
        console.error('[PageEditor] BLOCKED metadata update: required fields missing', {
          newMetadata,
          parsedData: parsed.data,
          safeMetadata
        });
        return; // Don't update content if metadata would be invalid
      }

      const updatedContent = matter.stringify(parsed.content, safeMetadata);
      // console.log('[PageEditor] Content updated with metadata, new length:', updatedContent.length);

      // Verify the updated content
      const verifyParsed = matter(updatedContent);
      // console.log('[PageEditor] Verified updated content has metadata:', verifyParsed.data);

      setContent(updatedContent);
    } catch (err) {
      console.error('[PageEditor] Failed to update frontmatter:', err);
    }
  };

  // Validate metadata format
  const validateMetadata = useCallback(() => {
    const errors = [];

    // Check for unknown/invalid metadata fields in the raw content
    try {
      const parsed = matter(content);
      const allowedFields = ['id', 'title', 'description', 'tags', 'category', 'date', 'order'];
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

    // Order validation (optional field)
    if (metadata.order !== undefined && metadata.order !== null && metadata.order !== '') {
      const orderNum = Number(metadata.order);
      if (isNaN(orderNum)) {
        errors.push('Order must be a number');
      } else if (!Number.isInteger(orderNum)) {
        errors.push('Order must be an integer');
      } else if (orderNum < -1000 || orderNum > 1000) {
        errors.push('Order must be between -1000 and 1000');
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
    // console.log('[PageEditor] handleMetadataChange called', { field, value, currentMetadata: metadata });
    const newMetadata = { ...metadata, [field]: value };
    // console.log('[PageEditor] New metadata:', newMetadata);
    setMetadata(newMetadata);
    metadataRef.current = newMetadata; // Keep ref in sync
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
    // console.log('[PageEditor] handleContentChange called', {
    //   showFrontmatter,
    //   hasNewContent: !!newContent,
    //   newContentLength: newContent?.length,
    //   currentMetadata: metadata,
    //   metadataRef: metadataRef.current
    // });

    // If frontmatter is hidden, reconstruct full content with existing metadata
    if (!showFrontmatter) {
      try {
        // CRITICAL FIX: Parse CURRENT content to get existing metadata
        // Don't rely on metadata state which may be stale/empty
        const currentParsed = matter(content);
        const existingMetadata = currentParsed.data || {};

        // console.log('[PageEditor] Frontmatter hidden - existing metadata from content:', existingMetadata);
        // console.log('[PageEditor] Current metadata state:', metadata);
        // console.log('[PageEditor] Metadata from ref (latest):', metadataRef.current);

        // CRITICAL: Use metadataRef as source of truth since it has the latest values
        // The metadata state might be stale during rapid edits, but metadataRef is always current
        // Merge: start with existing, then override with latest from ref (if non-empty)
        const mergedMetadata = { ...existingMetadata };

        // Override with latest metadata from form (via ref) for non-empty values
        for (const [key, value] of Object.entries(metadataRef.current)) {
          if (value !== '' && value !== null) {
            if (Array.isArray(value)) {
              if (value.length > 0) {
                mergedMetadata[key] = value;
              }
            } else {
              mergedMetadata[key] = value;
            }
          }
        }

        // console.log('[PageEditor] Merged metadata (existing + latest from ref):', mergedMetadata);

        const fullContent = matter.stringify(newContent, mergedMetadata);
        // console.log('[PageEditor] Reconstructed content length:', fullContent.length);

        // Verify reconstructed content has frontmatter
        const verifyParsed = matter(fullContent);
        // console.log('[PageEditor] Verified reconstructed frontmatter:', verifyParsed.data);

        setContent(fullContent);
      } catch (err) {
        console.error('[PageEditor] Failed to reconstruct content with metadata:', err);
        setContent(newContent);
      }
    } else {
      // console.log('[PageEditor] Frontmatter visible - setting content directly');
      setContent(newContent);

      // Try to parse frontmatter and update metadata state
      try {
        const parsed = matter(newContent);
        // console.log('[PageEditor] Parsed frontmatter from content:', parsed.data);

        if (parsed.data && Object.keys(parsed.data).length > 0) {
          // CRITICAL: Only update fields that exist in parsed data
          // Preserve existing metadata for missing fields to prevent data loss
          setMetadata((prevMetadata) => {
            const newMetadata = {
              id: parsed.data.id?.trim() || prevMetadata.id || '',
              title: parsed.data.title?.trim() || prevMetadata.title || '',
              description: parsed.data.description?.trim() || prevMetadata.description || '',
              tags: Array.isArray(parsed.data.tags) && parsed.data.tags.length > 0 ? parsed.data.tags : prevMetadata.tags || [],
              category: parsed.data.category?.trim() || prevMetadata.category || '',
              date: parsed.data.date || prevMetadata.date || '',
              order: parsed.data.order !== undefined && parsed.data.order !== null ? parsed.data.order : (prevMetadata.order ?? 0),
            };
            // console.log('[PageEditor] Updated metadata state:', newMetadata);
            return newMetadata;
          });
        }
      } catch (err) {
        // If parsing fails, keep existing metadata
        console.error('[PageEditor] Failed to sync metadata from content:', err);
      }
    }
  };

  const handleSave = () => {
    console.log('[PageEditor] ========== SAVE CLICKED ==========');
    console.log('[PageEditor] Current metadata state:', metadata);
    console.log('[PageEditor] Current content length:', content.length);
    console.log('[PageEditor] Content preview (first 500 chars):', content.substring(0, 500));

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
    console.log('[PageEditor] Validation errors:', validationErrors);

    if (validationErrors.length > 0) {
      // Trigger shake animation
      setShakeValidationError(true);
      setTimeout(() => setShakeValidationError(false), 500);
      return;
    }

    // CRITICAL: Final safety check - ensure content has valid frontmatter with metadata
    console.log('[PageEditor] Starting final safety check...');
    try {
      const parsed = matter(content);
      console.log('[PageEditor] Parsed content data:', parsed.data);
      console.log('[PageEditor] Parsed content keys:', Object.keys(parsed.data || {}));

      // Verify all required fields are present and non-empty
      if (!parsed.data || Object.keys(parsed.data).length === 0) {
        alert('CRITICAL ERROR: No metadata found in content. Cannot save to prevent data loss.');
        console.error('[PageEditor] BLOCKED SAVE: No metadata in content', { content, metadata });
        return;
      }

      if (!parsed.data.title?.trim()) {
        alert('CRITICAL ERROR: Title is missing from metadata. Cannot save to prevent data loss.');
        console.error('[PageEditor] BLOCKED SAVE: Missing title', {
          parsedData: parsed.data,
          metadata,
          contentPreview: content.substring(0, 1000)
        });
        return;
      }

      if (!parsed.data.category?.trim()) {
        alert('CRITICAL ERROR: Category is missing from metadata. Cannot save to prevent data loss.');
        console.error('[PageEditor] BLOCKED SAVE: Missing category', { parsedData: parsed.data, metadata });
        return;
      }

      if (!Array.isArray(parsed.data.tags) || parsed.data.tags.length === 0) {
        alert('CRITICAL ERROR: Tags are missing from metadata. Cannot save to prevent data loss.');
        console.error('[PageEditor] BLOCKED SAVE: Missing tags', { parsedData: parsed.data, metadata });
        return;
      }

      console.log('[PageEditor] Final metadata validation passed:', parsed.data);
    } catch (err) {
      alert('CRITICAL ERROR: Failed to parse frontmatter. Cannot save to prevent data loss.');
      console.error('[PageEditor] BLOCKED SAVE: Frontmatter parsing failed', err);
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

  // Scroll to validation errors
  const scrollToValidationErrors = () => {
    if (validationErrorsRef.current) {
      validationErrorsRef.current.scrollIntoView({
        behavior: 'smooth',
        block: 'center'
      });
    }
  };

  // Handle skill selection from picker
  const handleSkillSelect = ({ skill, mode, alignment }) => {
    if (!editorApiRef.current) return;

    // Insert skill syntax into content
    // Format: {{skill:Fire Slash:detailed}} or {{skill:1:compact}}
    let skillSyntax = `{{skill:${skill.name}:${mode}}}`;

    // Apply alignment wrapper if needed
    if (alignment && alignment !== 'none') {
      let style;
      if (alignment === 'center') {
        style = 'display: flex; justify-content: center;';
      } else if (alignment === 'left') {
        style = 'display: flex; justify-content: flex-start;';
      } else if (alignment === 'right') {
        style = 'display: flex; justify-content: flex-end;';
      }
      skillSyntax = `<div style="${style}">\n\n${skillSyntax}\n\n</div>`;
    }

    // Insert at cursor position with trailing spaces and paragraph breaks
    // Two spaces at end of line create hard break, blank line separates blocks
    editorApiRef.current.insertAtCursor(`\n\n${skillSyntax}  \n\n`);
  };

  // Handle equipment selection from picker
  const handleEquipmentSelect = ({ equipment, mode, alignment }) => {
    if (!editorApiRef.current) return;

    // Insert equipment syntax into content
    // Format: {{equipment:Innocence:detailed}} or {{equipment:1:compact}}
    let equipmentSyntax = `{{equipment:${equipment.name}:${mode}}}`;

    // Apply alignment wrapper if needed
    if (alignment && alignment !== 'none') {
      let style;
      if (alignment === 'center') {
        style = 'display: flex; justify-content: center;';
      } else if (alignment === 'left') {
        style = 'display: flex; justify-content: flex-start;';
      } else if (alignment === 'right') {
        style = 'display: flex; justify-content: flex-end;';
      }
      equipmentSyntax = `<div style="${style}">\n\n${equipmentSyntax}\n\n</div>`;
    }

    // Insert at cursor position with trailing spaces and paragraph breaks
    // Two spaces at end of line create hard break, blank line separates blocks
    editorApiRef.current.insertAtCursor(`\n\n${equipmentSyntax}  \n\n`);
  };

  // Handle spirit selection from picker
  const handleSpiritSelect = ({ spirit, mode, alignment, level, inline = true }) => {
    if (!editorApiRef.current) return;

    // Insert spirit syntax into content
    // Format: {{spirit:Loar:detailed:4:inline}} or {{spirit:Loar:compact:4:block}}
    const displayType = inline ? 'inline' : 'block';
    let spiritSyntax = `{{spirit:${spirit.name}:${mode}:${level}:${displayType}}}`;

    // Apply alignment wrapper if needed
    if (alignment && alignment !== 'none') {
      let style;
      if (alignment === 'center') {
        style = 'display: flex; justify-content: center;';
      } else if (alignment === 'left') {
        style = 'display: flex; justify-content: flex-start;';
      } else if (alignment === 'right') {
        style = 'display: flex; justify-content: flex-end;';
      }
      spiritSyntax = `<div style="${style}">\n\n${spiritSyntax}\n\n</div>`;
    }

    // Insert at cursor position with trailing spaces and paragraph breaks
    // Two spaces at end of line create hard break, blank line separates blocks
    editorApiRef.current.insertAtCursor(`\n\n${spiritSyntax}  \n\n`);
  };

  // Handle image selection from picker
  const handleImageSelect = (markdownSyntax, image) => {
    if (!editorApiRef.current) return;

    // Insert image markdown into content
    // Format: ![alt text](path)
    // Insert at cursor position with trailing spaces and paragraph breaks
    // Two spaces at end of line create hard break, blank line separates blocks
    editorApiRef.current.insertAtCursor(`\n\n${markdownSyntax}  \n\n`);
  };

  // Handle data selection from data selector
  const handleDataSelect = (source, id, field, template) => {
    if (!editorApiRef.current) return;

    // Insert data syntax into content
    // Format: {{data:SOURCE:ID:FIELD:TEMPLATE}} or {{data:SOURCE:ID:TEMPLATE}}
    let dataSyntax;
    if (field && template === 'field') {
      // Specific field reference
      dataSyntax = `{{data:${source}:${id}:${field}}}`;
    } else {
      // Full object with template
      dataSyntax = `{{data:${source}:${id}:${template}}}`;
    }

    // Insert at cursor position with trailing spaces and paragraph breaks
    // Two spaces at end of line create hard break, blank line separates blocks
    editorApiRef.current.insertAtCursor(`\n\n${dataSyntax}  \n\n`);

    // Close the data selector
    setShowDataSelector(false);
  };

  // Handle markdown formatting actions
  const handleFormat = (action, param) => {
    if (!editorApiRef.current) return;

    const api = editorApiRef.current;
    const selection = api.getSelection();

    switch (action) {
      case 'align':
        // Handle alignment
        if (param && param !== 'none') {
          let style;
          if (param === 'center') {
            style = 'text-align: center;';
          } else if (param === 'left') {
            style = 'text-align: left;';
          } else if (param === 'right') {
            style = 'text-align: right;';
          }

          if (selection.empty) {
            // Insert alignment wrapper at cursor
            api.insertAtCursor(`\n\n<div style="${style}">\nYour content here\n</div>\n\n`);
          } else {
            // Check if selection contains card syntax (<!-- skill: or <!-- equipment:)
            const isCard = /<!--\s*(skill|equipment):/.test(selection.text);

            if (isCard) {
              // Use flexbox for cards
              let flexStyle;
              if (param === 'center') {
                flexStyle = 'display: flex; justify-content: center;';
              } else if (param === 'left') {
                flexStyle = 'display: flex; justify-content: flex-start;';
              } else if (param === 'right') {
                flexStyle = 'display: flex; justify-content: flex-end;';
              }
              api.replaceSelection(`\n\n<div style="${flexStyle}">\n\n${selection.text}\n\n</div>\n\n`);
            } else {
              // Use text-align for text content
              api.replaceSelection(`\n\n<div style="${style}">\n${selection.text}\n</div>\n\n`);
            }
          }
        }
        break;

      case 'bold':
        if (selection.empty) {
          // Toggle mode
          setBoldActive(!boldActive);
          if (!boldActive) {
            api.insertAtCursor('****');
            // Move cursor between asterisks (would need cursor positioning API)
          }
        } else {
          // Wrap selection
          api.replaceSelection(`**${selection.text}**`);
        }
        break;

      case 'italic':
        if (selection.empty) {
          // Toggle mode
          setItalicActive(!italicActive);
          if (!italicActive) {
            api.insertAtCursor('**');
          }
        } else {
          // Wrap selection
          api.replaceSelection(`*${selection.text}*`);
        }
        break;

      case 'h1':
        {
          const line = api.getCurrentLine();
          // Remove existing header markers
          const cleanLine = line.text.replace(/^#+\s*/, '');
          api.replaceLine(`# ${cleanLine}`);
        }
        break;

      case 'h2':
        {
          const line = api.getCurrentLine();
          const cleanLine = line.text.replace(/^#+\s*/, '');
          api.replaceLine(`## ${cleanLine}`);
        }
        break;

      case 'ul':
        if (selection.empty) {
          api.insertAtCursor('\n- List item');
        } else {
          const lines = selection.text.split('\n');
          const formatted = lines.map(line => `- ${line}`).join('\n');
          api.replaceSelection(formatted);
        }
        break;

      case 'ol':
        if (selection.empty) {
          api.insertAtCursor('\n1. List item');
        } else {
          const lines = selection.text.split('\n');
          const formatted = lines.map((line, i) => `${i + 1}. ${line}`).join('\n');
          api.replaceSelection(formatted);
        }
        break;

      case 'link':
        // Open link dialog
        setLinkDialogText(selection.text);
        setShowLinkDialog(true);
        break;

      case 'code':
        if (selection.empty) {
          api.insertAtCursor('\n```\ncode block\n```\n');
        } else {
          api.replaceSelection(`\`\`\`\n${selection.text}\n\`\`\``);
        }
        break;

      case 'quote':
        if (selection.empty) {
          api.insertAtCursor('\n> Quote text');
        } else {
          const lines = selection.text.split('\n');
          const formatted = lines.map(line => `> ${line}`).join('\n');
          api.replaceSelection(formatted);
        }
        break;

      case 'table':
        // Insert a basic 3x3 table template
        const tableTemplate = `
| Header 1 | Header 2 | Header 3 |
|----------|----------|----------|
| Cell 1   | Cell 2   | Cell 3   |
| Cell 4   | Cell 5   | Cell 6   |
`;
        api.insertAtCursor(tableTemplate);
        break;

      default:
        return;
    }
  };

  // Handle link insertion from dialog
  const handleLinkInsert = (text, url) => {
    if (!editorApiRef.current) return;
    const markdown = `[${text}](${url})`;
    editorApiRef.current.replaceSelection(markdown);
  };

  // Handle color picker open
  const handleOpenColorPicker = () => {
    console.log('[PageEditor] Opening color picker');
    console.log('  - colorButtonRef.current:', colorButtonRef.current);
    console.log('  - showColorPicker before:', showColorPicker);

    // Save current selection before opening picker (selection may be lost when picker opens)
    if (editorApiRef.current) {
      const selection = editorApiRef.current.getSelection();
      console.log('  - Saving selection:', selection);
      console.log('  - Selection details:', {
        text: selection.text,
        from: selection.from,
        to: selection.to,
        empty: selection.empty,
        length: selection.text?.length
      });

      // Create a deep copy of the selection to ensure it persists
      setSavedSelection({
        text: selection.text,
        from: selection.from,
        to: selection.to,
        empty: selection.empty
      });
    }

    setShowColorPicker(true);
  };

  // Handle color selection
  const handleColorSelect = (color) => {
    console.log('[PageEditor] handleColorSelect called');
    console.log('  - color:', color);
    console.log('  - editorApiRef.current exists:', !!editorApiRef.current);

    if (!editorApiRef.current) {
      console.error('[PageEditor] Editor API not available!');
      return;
    }

    const api = editorApiRef.current;
    console.log('  - API methods available:', {
      replaceRange: typeof api.replaceRange,
      replaceSelection: typeof api.replaceSelection,
      getSelection: typeof api.getSelection
    });

    // Use saved selection instead of current selection (which may be empty)
    const selection = savedSelection || api.getSelection();
    console.log('[PageEditor] Selection to use:', {
      source: savedSelection ? 'saved' : 'current',
      text: selection.text,
      from: selection.from,
      to: selection.to,
      empty: selection.empty
    });

    if (color === null) {
      // Clear color - detect and remove color span tags
      console.log('[PageEditor] Clearing color');

      // Get the full content and cursor position
      const content = api.getContent();
      const cursorPos = savedSelection?.from ?? api.getCursorPosition();

      console.log('[PageEditor] Content length:', content.length, 'Cursor position:', cursorPos);

      // Find color span tags that contain the cursor position
      // Pattern: <span class="text-[color]-[shade]...">...</span>
      const spanRegex = /<span\s+class="[^"]*text-[^"]*"[^>]*>(.*?)<\/span>/gs;
      let match;
      let foundSpan = null;

      // Reset regex lastIndex to start from beginning
      spanRegex.lastIndex = 0;

      while ((match = spanRegex.exec(content)) !== null) {
        const spanStart = match.index;
        const spanEnd = match.index + match[0].length;

        // Check if cursor is inside this span
        if (cursorPos >= spanStart && cursorPos <= spanEnd) {
          foundSpan = {
            start: spanStart,
            end: spanEnd,
            fullMatch: match[0],
            innerText: match[1]
          };
          console.log('[PageEditor] Found color span containing cursor:', foundSpan);
          break;
        }
      }

      if (foundSpan) {
        // Remove the span wrapper, keep only inner text
        console.log('[PageEditor] Removing span wrapper, keeping inner text:', foundSpan.innerText);
        try {
          api.replaceRange(foundSpan.start, foundSpan.end, foundSpan.innerText);
          console.log('[PageEditor] Color span removed successfully');
        } catch (error) {
          console.error('[PageEditor] Failed to remove color span:', error);
        }
      } else if (!selection.empty && selection.text) {
        // Fallback: if no span found but there's a selection, just clear any potential wrapper
        console.log('[PageEditor] No span found at cursor, clearing selection text:', selection.text);
        if (savedSelection && savedSelection.from !== undefined && savedSelection.to !== undefined) {
          console.log('[PageEditor] Using replaceRange with saved positions');
          try {
            api.replaceRange(savedSelection.from, savedSelection.to, selection.text);
            console.log('[PageEditor] replaceRange succeeded');
          } catch (error) {
            console.error('[PageEditor] replaceRange failed:', error);
          }
        } else {
          console.log('[PageEditor] Using replaceSelection');
          try {
            api.replaceSelection(selection.text);
            console.log('[PageEditor] replaceSelection succeeded');
          } catch (error) {
            console.error('[PageEditor] replaceSelection failed:', error);
          }
        }
      } else {
        console.warn('[PageEditor] No color span found at cursor position and no text selected');
      }
    } else {
      // Apply color using span with Tailwind class
      const text = selection.empty ? 'colored text' : selection.text;
      const coloredText = `<span class="${color.class}">${text}</span>`;
      console.log('[PageEditor] Applying color:', {
        originalText: text,
        coloredText: coloredText,
        colorClass: color.class
      });

      // If we have a saved selection with positions, use direct replacement at those positions
      if (savedSelection && savedSelection.from !== undefined && savedSelection.to !== undefined) {
        console.log('[PageEditor] Using replaceRange with positions:', {
          from: savedSelection.from,
          to: savedSelection.to
        });
        try {
          api.replaceRange(savedSelection.from, savedSelection.to, coloredText);
          console.log('[PageEditor] Color applied successfully via replaceRange');
        } catch (error) {
          console.error('[PageEditor] replaceRange failed:', error);
          // Fallback to replaceSelection
          console.log('[PageEditor] Falling back to replaceSelection');
          try {
            api.replaceSelection(coloredText);
            console.log('[PageEditor] Color applied successfully via replaceSelection fallback');
          } catch (error2) {
            console.error('[PageEditor] replaceSelection fallback also failed:', error2);
          }
        }
      } else {
        console.log('[PageEditor] Using replaceSelection (no saved positions)');
        try {
          api.replaceSelection(coloredText);
          console.log('[PageEditor] Color applied successfully via replaceSelection');
        } catch (error) {
          console.error('[PageEditor] replaceSelection failed:', error);
        }
      }
    }

    // Clear saved selection after use
    console.log('[PageEditor] Clearing saved selection');
    setSavedSelection(null);
  };

  return (
    <div className="space-y-4">
      {/* Sentinel for detecting when toolbar becomes stuck */}
      <div ref={sentinelRef} className="h-0" />

      {/* Toolbar - Sticky */}
      <div
        ref={toolbarRef}
        className={`sticky top-16 z-30 bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 shadow-md transition-all ${
          isToolbarStuck ? 'rounded-b-lg' : 'rounded-lg'
        }`}
      >
        {/* Mobile Layout - Compact Horizontal */}
        <div className="md:hidden p-2.5">
          <div className="flex items-center justify-between gap-2">
            {/* View Mode Buttons - Horizontal */}
            <div className="flex items-center space-x-1 bg-gray-100 dark:bg-gray-700 rounded-lg p-0.5">
              <button
                onClick={() => setViewMode('edit')}
                className={`px-2.5 py-2 text-base rounded-md transition-colors ${
                  viewMode === 'edit'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
                title="Edit Only"
              >
                📝
              </button>
              <button
                onClick={() => setViewMode('split')}
                className={`px-2.5 py-2 text-base rounded-md transition-colors ${
                  viewMode === 'split'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
                title="Split View"
              >
                ⚡
              </button>
              <button
                onClick={() => setViewMode('preview')}
                className={`px-2.5 py-2 text-base rounded-md transition-colors ${
                  viewMode === 'preview'
                    ? 'bg-white dark:bg-gray-600 text-gray-900 dark:text-white shadow-sm'
                    : 'text-gray-600 dark:text-gray-400'
                }`}
                title="Preview Only"
              >
                👁️
              </button>
            </div>

            {/* Status Indicator - Compact */}
            {hasUnsavedChanges && (
              <div className="flex items-center text-xs text-amber-600 dark:text-amber-400 font-medium">
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
              </div>
            )}

            {validationErrors.length > 0 && (
              <button
                onClick={scrollToValidationErrors}
                className={`flex items-center text-xs text-red-600 dark:text-red-400 font-medium hover:text-red-700 dark:hover:text-red-300 transition-colors cursor-pointer ${
                  shakeValidationError ? 'animate-shake' : ''
                }`}
                title="Click to view validation errors"
              >
                <svg className="w-3.5 h-3.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                </svg>
                <span className="ml-1">{validationErrors.length}</span>
              </button>
            )}

            {/* Action Buttons - Icon Only */}
            <div className="flex items-center gap-1.5">
              <button
                onClick={handleCancel}
                disabled={isSaving}
                className="p-2.5 bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title="Cancel"
              >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
              <button
                onClick={handleSave}
                disabled={isSaving}
                className="p-2.5 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                title={
                  isConfiguringPR
                    ? 'Configuring your edit request... please wait'
                    : validationErrors.length > 0
                    ? 'Click to view validation errors'
                    : 'Save changes'
                }
              >
                {isSaving ? (
                  <svg className="w-5 h-5 animate-spin" fill="none" viewBox="0 0 24 24">
                    <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                    <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
                  </svg>
                ) : (
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M5 13l4 4L19 7" />
                  </svg>
                )}
              </button>
            </div>
          </div>
        </div>

        {/* Desktop Layout - Horizontal */}
        <div className="hidden md:flex items-center justify-between p-3">
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
                📝 Edit
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
                👁️ Preview
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
              <button
                onClick={scrollToValidationErrors}
                className={`text-xs text-red-600 dark:text-red-400 font-medium hover:text-red-700 dark:hover:text-red-300 transition-colors cursor-pointer ${
                  shakeValidationError ? 'animate-shake' : ''
                }`}
                title="Click to view validation errors"
              >
                {validationErrors.length} validation {validationErrors.length === 1 ? 'error' : 'errors'}
              </button>
            )}
            <Button variant="secondary" size="sm" onClick={handleCancel} disabled={isSaving}>
              Cancel
            </Button>
            <Button
              variant="primary"
              size="sm"
              onClick={handleSave}
              disabled={isSaving || !hasUnsavedChanges}
              title={
                isConfiguringPR
                  ? 'Configuring your edit request... please wait'
                  : !hasUnsavedChanges
                  ? 'No changes to save'
                  : validationErrors.length > 0
                    ? 'Click to view validation errors'
                    : 'Save changes'
              }
            >
              {isConfiguringPR ? 'Configuring...' : isSaving ? 'Saving...' : 'Save Changes'}
            </Button>
          </div>
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

              {/* Order */}
              <div className="space-y-1.5 md:col-span-1">
                <label className="block text-xs font-medium text-gray-700 dark:text-gray-300">
                  Sort Order
                </label>
                <input
                  type="number"
                  value={metadata.order ?? 0}
                  onChange={(e) => handleMetadataChange('order', e.target.value === '' ? 0 : parseInt(e.target.value, 10))}
                  className="block w-full px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
                  min="-1000"
                  max="1000"
                  step="1"
                />
                <p className="text-xs text-gray-500 dark:text-gray-400">
                  Controls page position in section list (lower numbers appear first)
                </p>
              </div>
            </div>
          </div>
        )}
      </div>

      {/* Markdown Format Toolbar - Sits below action panel when sticky */}
      <div className={`bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 overflow-hidden transition-all duration-200 ${
        isToolbarStuck
          ? 'sticky top-[7.75rem] z-30 shadow-lg rounded-none border-t-0'
          : 'rounded-lg'
      }`}>
        <div className="relative">
          <MarkdownFormatToolbar
            contentPickers={contentPickers}
            onFormat={handleFormat}
            onColorPicker={handleOpenColorPicker}
            colorButtonRef={colorButtonRef}
            boldActive={boldActive}
            italicActive={italicActive}
          />
          <ColorPicker
            isOpen={showColorPicker}
            onClose={() => setShowColorPicker(false)}
            onSelect={handleColorSelect}
            anchorEl={colorButtonRef.current}
          />
        </div>
      </div>

      {/* Validation Status - Only show when there are errors */}
      {validationErrors.length > 0 && (
        <div ref={validationErrorsRef} className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-3 md:p-4">
          <div className="flex items-start space-x-2 md:space-x-3">
            <svg className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
            </svg>
            <div className="flex-1 min-w-0">
              <h4 className="text-xs md:text-sm font-semibold text-red-900 dark:text-red-200 mb-1.5 md:mb-2">
                Validation Errors ({validationErrors.length})
              </h4>
              <ul className="text-xs md:text-sm text-red-800 dark:text-red-300 space-y-0.5 md:space-y-1 list-disc list-inside">
                {validationErrors.map((error, index) => (
                  <li key={index} className="break-words">{error}</li>
                ))}
              </ul>
              <p className="text-xs text-red-700 dark:text-red-400 mt-2 md:mt-3">
                Please fix these errors before saving.
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
                {showFrontmatter ? 'Hide Frontmatter' : 'Show Frontmatter'}
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
              editorApi={editorApiRef}
              dataAutocompleteSearch={dataAutocompleteSearch}
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
                  contentProcessor={contentProcessor}
                  customComponents={customComponents}
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

      {/* Skill Picker Modal */}
      {SkillPicker && (
        <SkillPicker
          isOpen={showSkillPicker}
          onClose={() => setShowSkillPicker(false)}
          onSelect={handleSkillSelect}
          renderPreview={renderSkillPreview}
        />
      )}

      {/* Equipment Picker Modal */}
      {EquipmentPicker && (
        <EquipmentPicker
          isOpen={showEquipmentPicker}
          onClose={() => setShowEquipmentPicker(false)}
          onSelect={handleEquipmentSelect}
          renderPreview={renderEquipmentPreview}
        />
      )}

      {/* Spirit Picker Modal */}
      {SpiritPicker && (
        <SpiritPicker
          isOpen={showSpiritPicker}
          onClose={() => setShowSpiritPicker(false)}
          onSelect={handleSpiritSelect}
        />
      )}

      {/* Image Picker Modal */}
      <ImagePicker
        isOpen={showImagePicker}
        onClose={() => setShowImagePicker(false)}
        onSelect={handleImageSelect}
      />

      {/* Data Selector Modal */}
      {hasDataSelector() && showDataSelector && (() => {
        const DataSelectorComponent = getDataSelector();
        return (
          <DataSelectorComponent
            onSelect={handleDataSelect}
            onClose={() => setShowDataSelector(false)}
          />
        );
      })()}

      {/* Link Dialog */}
      <LinkDialog
        isOpen={showLinkDialog}
        onClose={() => setShowLinkDialog(false)}
        onInsert={handleLinkInsert}
        selectedText={linkDialogText}
      />
    </div>
  );
};

export default PageEditor;
