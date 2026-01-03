import React from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { defaultSchema } from 'rehype-sanitize';
import PageBackground from '../common/PageBackground';
import { rehypeResolveImages } from '../../utils/rehypeResolveImages.js';
import { rehypeAddSourcePositions } from '../../utils/rehypeAddSourcePositions.js';
import { createLogger } from '../../utils/logger';
import 'highlight.js/styles/github-dark.css';

const logger = createLogger('PageViewer');

/**
 * Remove duplicate first header if it matches the page title
 * @param {string} content - Markdown content
 * @param {string} title - Page title from metadata
 * @returns {string} - Content with duplicate header removed if found
 */
const removeDuplicateHeader = (content, title) => {
  if (!content || !title) return content;

  // Match first header (# Header or ## Header, etc.)
  const headerMatch = content.match(/^(#+)\s+(.+?)$/m);

  if (headerMatch) {
    const headerText = headerMatch[2].trim();

    // Case-insensitive comparison
    if (headerText.toLowerCase() === title.toLowerCase()) {
      // Remove the entire header line (including trailing newlines)
      return content.replace(/^#+\s+.+$/m, '').replace(/^\n+/, '');
    }
  }

  return content;
};

/**
 * PageViewer component for rendering markdown content
 * Uses react-markdown with syntax highlighting and enhanced features
 *
 * @param {string} content - Markdown content to render
 * @param {object} metadata - Page metadata (title, description, etc.)
 * @param {string} className - Additional CSS classes
 * @param {function} contentProcessor - Optional function to process content before rendering
 * @param {object} customComponents - Optional custom ReactMarkdown components
 */
/**
 * URL-encode spaces in image URLs to fix markdown parsing
 * Matches both markdown ![alt](url) and HTML <img src="url"> syntax
 */
const encodeImageSpaces = (content) => {
  if (!content) return content;

  // Encode spaces in markdown image syntax: ![alt](url with spaces)
  content = content.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, (match, alt, url) => {
    const encodedUrl = url.replace(/ /g, '%20');
    return `![${alt}](${encodedUrl})`;
  });

  // Encode spaces in HTML img src attributes: <img src="url with spaces">
  content = content.replace(/<img([^>]*?)src="([^"]*)"([^>]*?)>/gi, (match, before, url, after) => {
    const encodedUrl = url.replace(/ /g, '%20');
    return `<img${before}src="${encodedUrl}"${after}>`;
  });

  return content;
};

/**
 * Custom sanitization schema for rehype-sanitize
 * Extends the default schema to allow specific HTML elements needed for wiki features
 * while blocking dangerous elements and attributes
 */
const sanitizeSchema = {
  ...defaultSchema,
  attributes: {
    ...defaultSchema.attributes,
    // Allow source position data on ALL elements for cursor highlighting
    '*': [
      ...(defaultSchema.attributes?.['*'] || []),
      'dataSourceStart',
      'dataSourceEnd',
      'data-source-start',  // kebab-case version for DOM
      'data-source-end'
    ],
    // Allow class and style attributes on span (needed for text colors and custom styling)
    span: [...(defaultSchema.attributes?.span || []), 'className', 'class', 'style'],
    // Allow src, alt, style, and data attributes on img
    // Keep className restricted to inline-image for security, allow general class attribute
    img: ['src', 'alt', 'title', 'width', 'height', 'style', ['className', /^inline-image$/], 'class', ['dataInline', /^true$/]],
    // Allow align attribute on div for text alignment (with validation), plus class/style
    div: [...(defaultSchema.attributes?.div || []), ['align', /^(left|center|right)$/], 'style', 'className', 'class'],
    // Allow id on headings for anchor links
    h1: [...(defaultSchema.attributes?.h1 || []), 'id', 'className', 'class'],
    h2: [...(defaultSchema.attributes?.h2 || []), 'id', 'className', 'class'],
    h3: [...(defaultSchema.attributes?.h3 || []), 'id', 'className', 'class'],
    h4: [...(defaultSchema.attributes?.h4 || []), 'id', 'className', 'class'],
    h5: [...(defaultSchema.attributes?.h5 || []), 'id', 'className', 'class'],
    h6: [...(defaultSchema.attributes?.h6 || []), 'id', 'className', 'class'],
    // Allow all default anchor attributes plus class
    a: [...(defaultSchema.attributes?.a || []), 'className', 'class'],
  },
  // Explicitly allow safe protocols only
  protocols: {
    ...defaultSchema.protocols,
    src: ['http', 'https', '/'], // Allow only http, https, and relative URLs for images
    href: ['http', 'https', 'mailto', '/', '#'], // Safe protocols for links
  },
  // Allow specific tag names (default schema + our custom ones)
  tagNames: [
    ...(defaultSchema.tagNames || []),
    'span',
    'div',
    'u', // Allow underline tags
  ],
};

const PageViewer = ({
  content,
  metadata,
  className = '',
  contentProcessor = null,
  customComponents = {},
  isPreview = false // Flag to indicate if rendering in editor preview
}) => {
  // Log renders to detect if preview is re-rendering constantly (reduced to trace)
  logger.trace('PageViewer render', {
    isPreview,
    contentLength: content?.length
  });

  // Process content to remove duplicate header
  let processedContent = removeDuplicateHeader(content, metadata?.title);

  // Encode spaces in image URLs (must happen before other processing)
  processedContent = encodeImageSpaces(processedContent);

  // Allow parent to process content further (e.g., for game-specific syntax)
  if (contentProcessor) {
    processedContent = contentProcessor(processedContent);
  }

  // Extract background configuration from metadata
  const background = metadata?.background;

  // Frosted glass styles for light mode - COMMENTED OUT FOR NOW
  // const articleStyles = !darkMode ? {
  //   zIndex: 1,
  //   backgroundColor: 'rgba(255, 255, 255, 0.2)',
  //   backdropFilter: 'blur(24px)',
  //   WebkitBackdropFilter: 'blur(24px)',
  //   borderRadius: '12px',
  //   padding: '2rem',
  //   margin: '-2rem',
  //   marginLeft: 'auto',
  //   marginRight: 'auto',
  //   marginTop: '0',
  //   marginBottom: '0',
  //   boxShadow: '0 8px 32px rgba(0, 0, 0, 0.1)'
  // } : {
  //   zIndex: 1
  // };

  // Ensure content sits above background and vignette with proper stacking context
  const articleStyles = {
    zIndex: 2,
    isolation: 'isolate' // Creates stacking context to ensure all children stay above vignette
  };

  return (
    <div className={`page-viewer relative ${isPreview ? 'min-h-full' : 'min-h-screen'}`}>
      {/* Background - only renders if custom background in metadata, otherwise uses global CSS default */}
      <PageBackground
        background={background}
        isPreview={isPreview}
      />

      {/* Vignette overlay for light mode - COMMENTED OUT FOR NOW */}
      {/* {!darkMode && (
        <div
          className={`page-vignette ${isPreview ? 'absolute' : 'fixed'} top-0 left-0 right-0 bottom-0 pointer-events-none`}
          style={{
            zIndex: 0,
            background: 'radial-gradient(ellipse at center, rgba(255, 255, 255, 0) 0%, rgba(255, 255, 255, 0.3) 50%, rgba(255, 255, 255, 0.85) 100%)'
          }}
          aria-hidden="true"
        />
      )} */}

      {/* Content overlay */}
      <article className={`${className || 'max-w-4xl mx-auto'} relative`} style={articleStyles}>
      {/* Page metadata */}
      {metadata && (
        <div className="mb-8 pb-6 border-b border-gray-200 dark:border-gray-800">
          {metadata.title && (
            <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
              {metadata.title}
            </h1>
          )}

          {metadata.description && (
            <p className="text-lg text-gray-600 dark:text-gray-400 mb-4">
              {metadata.description}
            </p>
          )}

          <div className="flex flex-wrap items-center gap-4 text-sm text-gray-500 dark:text-gray-500">
            {metadata.date && (
              <div className="flex items-center space-x-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 7V3m8 4V3m-9 8h10M5 21h14a2 2 0 002-2V7a2 2 0 00-2-2H5a2 2 0 00-2 2v12a2 2 0 002 2z" />
                </svg>
                <span>{new Date(metadata.date).toLocaleDateString()}</span>
              </div>
            )}

            {metadata.author && (
              <div className="flex items-center space-x-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z" />
                </svg>
                <span>{metadata.author}</span>
              </div>
            )}

            {metadata.category && (
              <div className="flex items-center space-x-1">
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M7 7h.01M7 3h5c.512 0 1.024.195 1.414.586l7 7a2 2 0 010 2.828l-7 7a2 2 0 01-2.828 0l-7-7A1.994 1.994 0 013 12V7a4 4 0 014-4z" />
                </svg>
                <span>{metadata.category}</span>
              </div>
            )}
          </div>

          {metadata.tags && metadata.tags.length > 0 && (
            <div className="flex flex-wrap gap-2 mt-4">
              {metadata.tags.map((tag) => (
                <span
                  key={tag}
                  className="px-2 py-1 text-xs font-medium bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-200 rounded-full"
                >
                  {tag}
                </span>
              ))}
            </div>
          )}
        </div>
      )}

      {/* Markdown content */}
      <div className="prose prose-lg dark:prose-dark max-w-none prose-headings:scroll-mt-20">
        <ReactMarkdown
          remarkPlugins={[remarkGfm, remarkFrontmatter]}
          rehypePlugins={[
            rehypeRaw, // Must be first to parse HTML in markdown
            rehypeAddSourcePositions, // Inject source position data for cursor highlighting
            [rehypeSanitize, sanitizeSchema], // Sanitize HTML to prevent XSS attacks
            rehypeResolveImages, // Resolve image paths to CDN URLs
            rehypeHighlight,
            rehypeSlug,
            [
              rehypeAutolinkHeadings,
              {
                behavior: 'wrap',
                properties: {
                  className: ['anchor'],
                },
              },
            ],
          ]}
          components={{
            // Custom link rendering
            a: ({ node, ...props }) => {
              // Check if this is a heading anchor link
              const isHeadingAnchor = props.className?.includes('anchor');

              // Handle heading anchor links
              if (isHeadingAnchor) {
                return (
                  <a
                    {...props}
                    className="anchor"
                    onClick={(e) => {
                      e.preventDefault();
                      const id = props.href.slice(1);
                      const element = document.getElementById(id);
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        // Update URL with anchor without triggering route change
                        const newUrl = `${window.location.pathname}#${id}`;
                        window.history.replaceState(null, '', newUrl);
                      }
                    }}
                  />
                );
              }

              // Handle anchor links (same-page navigation)
              const isAnchor = props.href?.startsWith('#');

              if (isAnchor) {
                return (
                  <a
                    {...props}
                    className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                    onClick={(e) => {
                      e.preventDefault();
                      const id = props.href.slice(1);
                      const element = document.getElementById(id);
                      if (element) {
                        element.scrollIntoView({ behavior: 'smooth', block: 'start' });
                        // Update URL with anchor without triggering route change
                        const newUrl = `${window.location.pathname}#${id}`;
                        window.history.replaceState(null, '', newUrl);
                      }
                    }}
                  />
                );
              }

              return (
                <a
                  {...props}
                  className="text-blue-600 hover:text-blue-800 dark:text-blue-400 dark:hover:text-blue-300"
                  target={props.href?.startsWith('http') ? '_blank' : undefined}
                  rel={props.href?.startsWith('http') ? 'noopener noreferrer' : undefined}
                />
              );
            },
            // Custom code block rendering
            code: ({ node, inline, className, children, ...props }) => {
              return inline ? (
                <code
                  className="px-1.5 py-0.5 text-sm bg-gray-100 dark:bg-gray-800 text-gray-800 dark:text-gray-200 rounded"
                  {...props}
                >
                  {children}
                </code>
              ) : (
                <code className={className} {...props}>
                  {children}
                </code>
              );
            },
            // Custom image rendering with zoom and captions
            img: ({ node, alt, src, width, height, className, ...props }) => {
              // Check if this is an inline image (has inline-image class or data-inline attribute)
              const isInline = className === 'inline-image' ||
                              props['data-inline'] === 'true' ||
                              props.dataInline === 'true';

              // If inline, render directly without figure wrapper
              if (isInline) {
                return (
                  <img
                    src={src}
                    alt={alt}
                    className={className}
                    loading="lazy"
                    {...props}
                  />
                );
              }

              // Block images: wrap in figure with styling
              const hasCustomSize = width || height;
              const imgClassName = hasCustomSize
                ? ""
                : "w-full";

              return (
                <figure className="my-2">
                  <img
                    src={src}
                    alt={alt}
                    width={width}
                    height={height}
                    className={imgClassName}
                    loading="lazy"
                    {...props}
                  />
                  {alt && (
                    <figcaption className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
                      {alt}
                    </figcaption>
                  )}
                </figure>
              );
            },
            // Custom table rendering
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto my-8">
                <table className="min-w-full border-collapse border border-gray-300 dark:border-gray-600 rounded-lg overflow-hidden" {...props} />
              </div>
            ),
            thead: ({ node, ...props }) => (
              <thead {...props} />
            ),
            tbody: ({ node, ...props }) => (
              <tbody {...props} />
            ),
            tr: ({ node, ...props }) => (
              <tr {...props} />
            ),
            th: ({ node, ...props }) => (
              <th
                className="px-6 py-4 text-left text-sm font-bold text-white dark:text-white bg-blue-600 dark:bg-blue-700 border-b-2 border-blue-700 dark:border-blue-800"
                {...props}
              />
            ),
            td: ({ node, ...props }) => (
              <td
                className="px-6 py-4 text-sm text-gray-900 dark:text-gray-100 bg-white dark:bg-gray-800 border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-750 transition-colors"
                {...props}
              />
            ),
            // Merge in custom components from parent
            ...customComponents,
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    </article>
    </div>
  );
};

// Wrap in React.memo to prevent re-renders when parent re-renders
// Only re-render if content or metadata actually changes
export default React.memo(PageViewer, (prevProps, nextProps) => {
  // Return true if props are equal (don't re-render)
  // Return false if props changed (do re-render)
  return prevProps.content === nextProps.content &&
         prevProps.metadata === nextProps.metadata &&
         prevProps.className === nextProps.className;
});
