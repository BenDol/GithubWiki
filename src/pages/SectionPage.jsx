import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import matter from 'gray-matter';
import { useSection } from '../hooks/useWikiConfig';
import LoadingSpinner from '../components/common/LoadingSpinner';

/**
 * Section page component
 * Displays a list of pages in a section
 */
const SectionPage = ({ sectionId }) => {
  const section = useSection(sectionId);
  const [loading, setLoading] = useState(true);
  const [indexContent, setIndexContent] = useState(null);
  const [indexMetadata, setIndexMetadata] = useState(null);

  useEffect(() => {
    const loadSectionIndex = async () => {
      try {
        setLoading(true);

        // Try to load index.md for the section
        const response = await fetch(`/content/${sectionId}/index.md`);

        if (response.ok) {
          const markdownText = await response.text();
          const { data, content } = matter(markdownText);
          setIndexMetadata(data);
          setIndexContent(content);
        }
      } catch (err) {
        console.error('Error loading section index:', err);
      } finally {
        setLoading(false);
      }
    };

    loadSectionIndex();
  }, [sectionId]);

  if (!section) {
    return (
      <div className="text-center py-12">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white">
          Section Not Found
        </h1>
      </div>
    );
  }

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

  return (
    <div className="max-w-5xl mx-auto">
      {/* Section header */}
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
          {indexMetadata?.title || section.title}
        </h1>
        {indexMetadata?.description && (
          <p className="text-lg text-gray-600 dark:text-gray-400">
            {indexMetadata.description}
          </p>
        )}
      </div>

      {/* Section content from index.md */}
      {indexContent && (
        <div className="prose prose-lg dark:prose-dark max-w-none mb-12">
          <p className="text-gray-700 dark:text-gray-300">{indexContent}</p>
        </div>
      )}

      {/* Placeholder for page list - will be enhanced in Phase 2 */}
      <div className="bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg p-6">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-3">
          Pages in this section
        </h2>
        <p className="text-gray-700 dark:text-gray-300 mb-4">
          Create markdown files in <code className="px-2 py-1 bg-yellow-100 dark:bg-yellow-900 rounded text-sm">
            /public/content/{section.path}/
          </code> to populate this section.
        </p>

        {/* Example pages - will be dynamically loaded in Phase 2 */}
        <div className="space-y-2">
          <Link
            to={`/${section.path}/index`}
            className="block p-4 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-colors"
          >
            <div className="flex items-center justify-between">
              <div>
                <h3 className="font-medium text-gray-900 dark:text-white">
                  {indexMetadata?.title || 'Introduction'}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  {indexMetadata?.description || 'Section overview'}
                </p>
              </div>
              <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        </div>
      </div>
    </div>
  );
};

export default SectionPage;
