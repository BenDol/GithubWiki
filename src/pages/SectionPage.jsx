import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useSection, useWikiConfig } from '../hooks/useWikiConfig';
import { useAuthStore } from '../store/authStore';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { getDisplayTitle } from '../utils/textUtils';

/**
 * Section page component
 * Displays a list of pages in a section
 */
const SectionPage = ({ sectionId }) => {
  const section = useSection(sectionId);
  const { config } = useWikiConfig();
  const { isAuthenticated } = useAuthStore();
  const [loading, setLoading] = useState(true);
  const [indexContent, setIndexContent] = useState(null);
  const [indexMetadata, setIndexMetadata] = useState(null);
  const [pages, setPages] = useState([]);

  const autoFormatTitles = config?.features?.autoFormatPageTitles ?? false;
  const canCreatePage = section?.allowContributions && isAuthenticated;

  useEffect(() => {
    const loadSectionData = async () => {
      try {
        setLoading(true);

        // Load search index to get list of pages
        const searchResponse = await fetch(`${import.meta.env.BASE_URL}search-index.json`);
        console.log('Search index response:', searchResponse.status, searchResponse.ok);
        if (searchResponse.ok) {
          const searchIndex = await searchResponse.json();
          console.log('Total pages in search index:', searchIndex.length);
          const sectionPages = searchIndex
            .filter(page => page.section === sectionId && page.pageId !== 'index')
            .sort((a, b) => a.title.localeCompare(b.title));
          console.log(`Pages found for section "${sectionId}":`, sectionPages.length, sectionPages);
          setPages(sectionPages);
        } else {
          console.error('Failed to load search index:', searchResponse.status);
        }
      } catch (err) {
        console.error('Error loading section data:', err);
        console.error('Error message:', err?.message);
        console.error('Error stack:', err?.stack);
      } finally {
        setLoading(false);
      }
    };

    loadSectionData();
  }, [sectionId]);

  // Scroll to top when section changes
  useEffect(() => {
    if (!loading) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [loading, sectionId]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading section...</p>
        </div>
      </div>
    );
  }

  if (!section) {
    return (
      <div className="text-center py-12">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Section Not Found
        </h1>
      </div>
    );
  }

  return (
    <div className="max-w-5xl mx-auto">
      {/* Section header */}
      <div className="mb-8">
        <div className="flex items-center justify-between mb-3">
          <h1 className="text-4xl font-bold text-gray-900 dark:text-white">
            {section.title}
          </h1>
          {canCreatePage && (
            <Link
              to={`/${sectionId}/new`}
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create New Page
            </Link>
          )}
        </div>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Browse all pages in this section
        </p>
      </div>

      {/* Dynamic page list */}
      {pages.length > 0 ? (
        <div className="space-y-3">
          <h2 className="text-2xl font-semibold text-gray-900 dark:text-white mb-4">
            Pages in this section
          </h2>
          {pages.map((page) => (
            <Link
              key={page.id}
              to={`/${page.section}/${page.pageId}`}
              className="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
            >
              <div className="flex items-center justify-between">
                <div>
                  <h3 className="font-medium text-gray-900 dark:text-white">
                    {getDisplayTitle(page.pageId, page.title, autoFormatTitles)}
                  </h3>
                  {page.description && (
                    <p className="text-sm text-gray-600 dark:text-gray-400 mt-1">
                      {page.description}
                    </p>
                  )}
                  {page.tags && page.tags.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      {page.tags.map((tag) => (
                        <span
                          key={tag}
                          className="px-2 py-0.5 text-xs font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                <svg className="w-5 h-5 text-gray-400 flex-shrink-0" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
                </svg>
              </div>
            </Link>
          ))}
        </div>
      ) : (
        <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
            No pages yet
          </h2>
          <p className="text-gray-700 dark:text-gray-300 mb-4">
            This section doesn't have any pages yet.
            {canCreatePage ? ' Click the button below to create the first page!' : ' Create markdown files to populate this section.'}
          </p>
          {canCreatePage && (
            <Link
              to={`/${sectionId}/new`}
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create First Page
            </Link>
          )}
          {!canCreatePage && (
            <p className="text-sm text-gray-600 dark:text-gray-400 mt-2">
              Create markdown files in <code className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 rounded text-sm">
                /public/content/{section.path}/
              </code> to populate this section.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default SectionPage;
