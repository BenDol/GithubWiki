import { useEffect, useState } from 'react';
import { useParams, Link } from 'react-router-dom';
import matter from 'gray-matter';
import PageViewer from '../components/wiki/PageViewer';
import TableOfContents from '../components/wiki/TableOfContents';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { useWikiStore } from '../store/wikiStore';
import { useSection } from '../hooks/useWikiConfig';
import { useFeature } from '../hooks/useWikiConfig';

/**
 * Page viewer page component
 * Loads and displays markdown content from /public/content/
 */
const PageViewerPage = ({ sectionId }) => {
  const { pageId } = useParams();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [content, setContent] = useState('');
  const [metadata, setMetadata] = useState(null);

  const { cachePage, getCachedPage } = useWikiStore();
  const section = useSection(sectionId);
  const showToc = useFeature('tableOfContents');

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
        const response = await fetch(`/content/${sectionId}/${pageId}.md`);

        if (!response.ok) {
          throw new Error('Page not found');
        }

        const markdownText = await response.text();

        // Parse frontmatter and content
        const { data, content: markdownContent } = matter(markdownText);

        setMetadata(data);
        setContent(markdownContent);

        // Cache the page
        cachePage(cacheKey, markdownContent, data);
      } catch (err) {
        console.error('Error loading page:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadPage();
  }, [sectionId, pageId, cachePage, getCachedPage]);

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
          {metadata?.title || pageId}
        </span>
      </nav>

      {/* Page actions */}
      <div className="flex justify-end mb-6 space-x-2">
        <Link
          to={`/${sectionId}`}
          className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          ← Back to Section
        </Link>

        {/* Edit button - enabled if contributions allowed and user authenticated */}
        {section?.allowContributions ? (
          <Link
            to={`/${sectionId}/${pageId}/edit`}
            className="inline-flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
          >
            ✏️ Edit
          </Link>
        ) : (
          <button
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg opacity-50 cursor-not-allowed"
            disabled
            title="Editing not allowed for this section"
          >
            ✏️ Edit
          </button>
        )}

        {/* History button */}
        <Link
          to={`/${sectionId}/${pageId}/history`}
          className="inline-flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          📜 History
        </Link>
      </div>

      {/* Page content with TOC */}
      <div className="flex gap-8">
        {/* Main content */}
        <div className="flex-1 min-w-0">
          <PageViewer content={content} metadata={metadata} />
        </div>

        {/* Table of Contents - desktop only */}
        {showToc && (
          <aside className="hidden xl:block w-64 flex-shrink-0">
            <TableOfContents content={content} />
          </aside>
        )}
      </div>
    </div>
  );
};

export default PageViewerPage;
