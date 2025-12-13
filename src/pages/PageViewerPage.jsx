import { useEffect, useState } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import matter from 'gray-matter';
import PageViewer from '../components/wiki/PageViewer';
import TableOfContents from '../components/wiki/TableOfContents';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StarContributor from '../components/wiki/StarContributor';
import Comments from '../components/wiki/Comments';
import { useWikiStore } from '../store/wikiStore';
import { useSection, useWikiConfig } from '../hooks/useWikiConfig';
import { useFeature } from '../hooks/useWikiConfig';
import { getDisplayTitle } from '../utils/textUtils';

/**
 * Page viewer page component
 * Loads and displays markdown content from /public/content/
 */
const PageViewerPage = ({ sectionId }) => {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [content, setContent] = useState('');
  const [metadata, setMetadata] = useState(null);

  const { cachePage, getCachedPage } = useWikiStore();
  const { config } = useWikiConfig();
  const section = useSection(sectionId);
  const showToc = useFeature('tableOfContents');
  const autoFormatTitles = config?.features?.autoFormatPageTitles ?? false;

  // Check if this is a framework/hardcoded page (no editing allowed)
  const isFrameworkPage = section?.allowContributions === false;

  useEffect(() => {
    const loadPage = async () => {
      try {
        setLoading(true);
        setError(null);

        // Check cache first
        const cacheKey = `${sectionId}/${pageId}`;
        const cached = getCachedPage(cacheKey);

        if (cached) {
          setContent(cached.content);
          setMetadata(cached.metadata);
          setLoading(false);
          return;
        }

        // Load markdown file from public/content/
        // Use import.meta.env.BASE_URL to respect Vite's base path
        const response = await fetch(`${import.meta.env.BASE_URL}content/${sectionId}/${pageId}.md`);

        if (!response.ok) {
          throw new Error('Page not found');
        }

        const markdownText = await response.text();

        // Parse frontmatter and content
        const { data, content: markdownContent } = matter(markdownText);

        // Apply auto-formatting to title if enabled and no explicit title exists
        const formattedMetadata = {
          ...data,
          title: getDisplayTitle(pageId, data.title, autoFormatTitles)
        };

        setMetadata(formattedMetadata);
        setContent(markdownContent);

        // Cache the page with formatted metadata
        cachePage(cacheKey, markdownContent, formattedMetadata);
      } catch (err) {
        console.error('Error loading page:', err);
        console.error('Error message:', err?.message);
        console.error('Error stack:', err?.stack);
        console.error('Error name:', err?.name);
        setError(err.message || 'Failed to load page');
      } finally {
        setLoading(false);
      }
    };

    loadPage();
  }, [sectionId, pageId, cachePage, getCachedPage, autoFormatTitles]);

  // Scroll to anchor or top after page loads
  useEffect(() => {
    if (!loading && content) {
      // Check if there's an anchor in the URL
      // For hash routing, URL format is: #/route/path#anchor-id
      // Split by '#' to get: ['', '/route/path', 'anchor-id']
      const hashParts = window.location.hash.split('#');
      const anchor = hashParts[2]; // The anchor is the 3rd element (index 2)

      if (anchor) {
        // Wait a bit for the content to render
        setTimeout(() => {
          const element = document.getElementById(anchor);
          if (element) {
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          }
        }, 100);
      } else {
        // No anchor, scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [loading, content]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading page...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">📄</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Page Not Found
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <Link
          to={`/${sectionId}`}
          className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
        >
          <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Section
        </Link>
      </div>
    );
  }

  return (
    <div>
      {/* Breadcrumb navigation */}
      <nav className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-6">
        <Link to="/" className="hover:text-blue-600 dark:hover:text-blue-400">
          Home
        </Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <Link to={`/${sectionId}`} className="hover:text-blue-600 dark:hover:text-blue-400">
          {section?.title || sectionId}
        </Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-900 dark:text-white font-medium">
          {getDisplayTitle(pageId, metadata?.title, autoFormatTitles)}
        </span>
      </nav>

      {/* Page actions */}
      <div className="flex justify-end mb-6 space-x-2">
        {/* Back button - uses browser history for framework pages, link for user content */}
        {isFrameworkPage ? (
          <button
            onClick={() => navigate(-1)}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            ← Back
          </button>
        ) : (
          <Link
            to={`/${sectionId}`}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            ← Back to {section?.title || sectionId}
          </Link>
        )}

        {/* Edit button - only show for pages that allow contributions */}
        {!isFrameworkPage && (
          <Link
            to={`/${sectionId}/${pageId}/edit`}
            className="inline-flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            ✏️ Edit
          </Link>
        )}

        {/* History button - only show for pages that allow contributions */}
        {!isFrameworkPage && (
          <Link
            to={`/${sectionId}/${pageId}/history`}
            className="inline-flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            📜 History
          </Link>
        )}
      </div>

      {/* Page content with TOC */}
      <div className="flex gap-8">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-12">
          <PageViewer content={content} metadata={metadata} />

          {/* Comments section */}
          <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
            <Comments
              pageTitle={metadata?.title || pageId}
              sectionId={sectionId}
              pageId={pageId}
            />
          </div>
        </div>

        {/* Right sidebar - desktop only */}
        <aside className="hidden xl:block w-64 flex-shrink-0 space-y-4">
          {/* Star contributor - only show for user content pages */}
          {!isFrameworkPage && (
            <StarContributor sectionId={sectionId} pageId={pageId} />
          )}

          {/* Table of Contents */}
          {showToc && <TableOfContents content={content} />}
        </aside>
      </div>
    </div>
  );
};

export default PageViewerPage;
