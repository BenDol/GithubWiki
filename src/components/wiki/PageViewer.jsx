import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import rehypeRaw from 'rehype-raw';
import rehypeSanitize from 'rehype-sanitize';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
import { defaultSchema } from 'rehype-sanitize';
import 'highlight.js/styles/github-dark.css';

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
    // Allow class attribute on span for text colors (Tailwind CSS classes starting with 'text-')
    span: [...(defaultSchema.attributes.span || []), ['className', /^text-/]],
    // Allow src and alt on img, but sanitize the src
    img: ['src', 'alt', 'title', 'width', 'height'],
    // Allow align attribute on div for text alignment
    div: [...(defaultSchema.attributes.div || []), ['align', /^(left|center|right)$/]],
    // Allow id on headings for anchor links
    h1: [...(defaultSchema.attributes.h1 || []), 'id'],
    h2: [...(defaultSchema.attributes.h2 || []), 'id'],
    h3: [...(defaultSchema.attributes.h3 || []), 'id'],
    h4: [...(defaultSchema.attributes.h4 || []), 'id'],
    h5: [...(defaultSchema.attributes.h5 || []), 'id'],
    h6: [...(defaultSchema.attributes.h6 || []), 'id'],
    // Allow all default anchor attributes
    a: [...(defaultSchema.attributes.a || [])],
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
  ],
};

const PageViewer = ({
  content,
  metadata,
  className = '',
  contentProcessor = null,
  customComponents = {}
}) => {
  // Process content to remove duplicate header
  let processedContent = removeDuplicateHeader(content, metadata?.title);

  // Encode spaces in image URLs (must happen before other processing)
  processedContent = encodeImageSpaces(processedContent);

  // Allow parent to process content further (e.g., for game-specific syntax)
  if (contentProcessor) {
    processedContent = contentProcessor(processedContent);
  }

  return (
    <article className={className || 'max-w-4xl mx-auto'}>
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
            [rehypeSanitize, sanitizeSchema], // Sanitize HTML to prevent XSS attacks
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
                        // Update URL without triggering route change
                        // For hash routing: #/route/path#anchor (max 2 hash symbols)
                        // Extract just the route part (before any existing anchor)
                        const hashParts = window.location.hash.split('#');
                        // hashParts: ['', '/route/path', 'old-anchor'?]
                        // We want: #/route/path#new-anchor
                        const routePath = hashParts[1] || '';
                        const newUrl = `${window.location.pathname}#${routePath}#${id}`;
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
                        // Update URL without triggering route change
                        // For hash routing: #/route/path#anchor (max 2 hash symbols)
                        // Extract just the route part (before any existing anchor)
                        const hashParts = window.location.hash.split('#');
                        // hashParts: ['', '/route/path', 'old-anchor'?]
                        // We want: #/route/path#new-anchor
                        const routePath = hashParts[1] || '';
                        const newUrl = `${window.location.pathname}#${routePath}#${id}`;
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
            img: ({ node, alt, src, width, height, ...props }) => {
              // If width or height is specified, use them; otherwise default to full width
              const hasCustomSize = width || height;
              const imgClassName = hasCustomSize
                ? "rounded-lg shadow-lg"
                : "rounded-lg shadow-lg w-full";

              return (
                <figure className="my-6">
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
              <div className="overflow-x-auto my-6">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700 border border-gray-200 dark:border-gray-700 rounded-lg" {...props} />
              </div>
            ),
            thead: ({ node, ...props }) => (
              <thead className="bg-gray-50 dark:bg-gray-800" {...props} />
            ),
            tbody: ({ node, ...props }) => (
              <tbody className="bg-white dark:bg-gray-900 divide-y divide-gray-200 dark:divide-gray-700" {...props} />
            ),
            tr: ({ node, ...props }) => (
              <tr className="hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors" {...props} />
            ),
            th: ({ node, ...props }) => (
              <th className="px-4 py-3 text-left text-xs font-semibold text-gray-700 dark:text-gray-300 uppercase tracking-wider" {...props} />
            ),
            td: ({ node, ...props }) => (
              <td className="px-4 py-3 text-sm text-gray-900 dark:text-gray-100" {...props} />
            ),
            // Merge in custom components from parent
            ...customComponents,
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    </article>
  );
};

export default PageViewer;
