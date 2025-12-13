import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import remarkFrontmatter from 'remark-frontmatter';
import rehypeHighlight from 'rehype-highlight';
import rehypeSlug from 'rehype-slug';
import rehypeAutolinkHeadings from 'rehype-autolink-headings';
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
 */
const PageViewer = ({ content, metadata, className = '' }) => {
  // Process content to remove duplicate header
  const processedContent = removeDuplicateHeader(content, metadata?.title);

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
                        // For hash routing, preserve the route hash and append anchor
                        const currentPath = window.location.pathname + window.location.hash;
                        window.history.replaceState(null, '', `${currentPath}#${id}`);
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
                        // For hash routing, preserve the route hash and append anchor
                        const currentPath = window.location.pathname + window.location.hash;
                        window.history.replaceState(null, '', `${currentPath}#${id}`);
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
            img: ({ node, alt, src, ...props }) => (
              <figure className="my-6">
                <img
                  src={src}
                  alt={alt}
                  className="rounded-lg shadow-lg w-full"
                  loading="lazy"
                  {...props}
                />
                {alt && (
                  <figcaption className="mt-2 text-center text-sm text-gray-600 dark:text-gray-400">
                    {alt}
                  </figcaption>
                )}
              </figure>
            ),
            // Custom table rendering
            table: ({ node, ...props }) => (
              <div className="overflow-x-auto my-6">
                <table className="min-w-full divide-y divide-gray-200 dark:divide-gray-700" {...props} />
              </div>
            ),
          }}
        >
          {processedContent}
        </ReactMarkdown>
      </div>
    </article>
  );
};

export default PageViewer;
