import { useParams, Link } from 'react-router-dom';
import PageHistory from '../components/wiki/PageHistory';
import { useSection, useWikiConfig } from '../hooks/useWikiConfig';
import { formatPageTitle } from '../utils/textUtils';

/**
 * Page history page
 * Shows commit history for a wiki page
 */
const PageHistoryPage = ({ sectionId }) => {
  const { pageId } = useParams();
  const { config } = useWikiConfig();
  const section = useSection(sectionId);
  const autoFormatTitles = config?.features?.autoFormatPageTitles ?? false;

  return (
    <div className="max-w-4xl mx-auto">
      {/* Breadcrumb */}
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
        <Link to={`/${sectionId}/${pageId}`} className="hover:text-blue-600 dark:hover:text-blue-400">
          {autoFormatTitles ? formatPageTitle(pageId) : pageId}
        </Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-900 dark:text-white font-medium">History</span>
      </nav>

      {/* Back button */}
      <div className="mb-6">
        <Link
          to={`/${sectionId}/${pageId}`}
          className="inline-flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-white dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
        >
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
          </svg>
          Back to Page
        </Link>
      </div>

      {/* Page history */}
      <PageHistory sectionId={sectionId} pageId={pageId} />
    </div>
  );
};

export default PageHistoryPage;
