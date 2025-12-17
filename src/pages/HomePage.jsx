import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import matter from 'gray-matter';
import { useWikiConfig } from '../hooks/useWikiConfig';
import PageViewer from '../components/wiki/PageViewer';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { getContentProcessor, getCustomComponents } from '../utils/contentRendererRegistry';

/**
 * Home page component
 * Supports custom markdown page or default home page
 */
const HomePage = () => {
  const { config } = useWikiConfig();
  const [loading, setLoading] = useState(false);
  const [content, setContent] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [error, setError] = useState(null);

  const customHomePageEnabled = config?.features?.customHomePage?.enabled ?? false;
  const customHomePagePath = config?.features?.customHomePage?.path ?? 'home.md';

  // Load custom home page markdown if enabled
  useEffect(() => {
    const loadCustomHomePage = async () => {
      if (!customHomePageEnabled || !config) {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        // Load markdown file from public/content/
        const response = await fetch(`${import.meta.env.BASE_URL}content/${customHomePagePath}`);

        if (!response.ok) {
          throw new Error('Custom home page not found');
        }

        const markdownText = await response.text();
        const { data, content: markdownContent } = matter(markdownText);

        setMetadata(data);
        setContent(markdownContent);
      } catch (err) {
        console.error('Error loading custom home page:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadCustomHomePage();
  }, [customHomePageEnabled, customHomePagePath, config]);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  if (!config) return null;

  // Show custom markdown home page if enabled
  if (customHomePageEnabled) {
    if (loading) {
      return (
        <div className="flex justify-center items-center min-h-[400px]">
          <div className="text-center">
            <LoadingSpinner size="lg" />
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading home page...</p>
          </div>
        </div>
      );
    }

    if (error) {
      return (
        <div className="max-w-2xl mx-auto text-center py-12">
          <div className="text-gray-400 text-6xl mb-4">📄</div>
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            Home Page Not Found
          </h1>
          <p className="text-gray-600 dark:text-gray-400 mb-6">
            The custom home page could not be loaded. Please check the configuration.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500">
            Error: {error}
          </p>
        </div>
      );
    }

    return (
      <div className="max-w-4xl mx-auto">
        <PageViewer
          content={content}
          metadata={metadata}
          contentProcessor={getContentProcessor()}
          customComponents={getCustomComponents()}
        />
      </div>
    );
  }

  // Default home page
  if (!config) return null;

  return (
    <div className="max-w-5xl mx-auto">
      {/* Hero section */}
      <div className="text-center mb-12">
        <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
          {config.wiki.title}
        </h1>
        <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          {config.wiki.description}
        </p>
      </div>

      {/* Sections grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 mb-12">
        {config.sections.map((section) => (
          <Link
            key={section.id}
            to={`/${section.path}`}
            className="group p-6 bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 hover:shadow-lg transition-all"
          >
            <div className="flex items-start space-x-4">
              <div className="flex-shrink-0 p-3 bg-blue-100 dark:bg-blue-900 rounded-lg group-hover:bg-blue-500 transition-colors">
                <svg className="w-6 h-6 text-blue-600 dark:text-blue-300 group-hover:text-white" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                </svg>
              </div>

              <div className="flex-1 min-w-0">
                <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2 group-hover:text-blue-600 dark:group-hover:text-blue-400">
                  {section.title}
                </h3>
                <p className="text-sm text-gray-600 dark:text-gray-400">
                  Explore {section.title.toLowerCase()} documentation
                </p>
              </div>

              <svg className="w-5 h-5 text-gray-400 group-hover:text-blue-500 group-hover:translate-x-1 transition-all" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </div>
          </Link>
        ))}
      </div>

      {/* Quick links */}
      <div className="bg-blue-50 dark:bg-blue-900/20 rounded-lg p-6 border border-blue-200 dark:border-blue-800">
        <h2 className="text-xl font-semibold text-gray-900 dark:text-white mb-4">
          Getting Started
        </h2>
        <div className="space-y-2">
          <p className="text-gray-700 dark:text-gray-300">
            Welcome to the wiki! Browse through the sections above to find the documentation you need.
          </p>
          <ul className="list-disc list-inside text-gray-700 dark:text-gray-300 space-y-1 ml-4">
            <li>Browse sections from the sidebar or header navigation</li>
            <li>Use the search function (Ctrl+K) to quickly find content</li>
            <li>Toggle dark mode with the theme button in the header</li>
            {config.features?.editPages && (
              <li>Sign in with GitHub to edit pages and contribute</li>
            )}
          </ul>
        </div>
      </div>
    </div>
  );
};

export default HomePage;
