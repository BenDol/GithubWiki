import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import matter from 'gray-matter';
import { useWikiConfig } from '../hooks/useWikiConfig';
import PageViewer from '../components/wiki/PageViewer';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { getContentProcessor, getCustomComponents } from '../utils/contentRendererRegistry';
import { getApprovedCreators, isContentCreatorsEnabled } from '../services/contentCreators/contentCreatorService';
import { loadVideoGuides, areVideoGuidesEnabled } from '../services/contentCreators/videoGuideService';
import StreamEmbed from '../components/contentCreators/StreamEmbed';
import VideoGuideCard from '../components/contentCreators/VideoGuideCard';

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
  const [streamers, setStreamers] = useState([]);
  const [videoGuides, setVideoGuides] = useState([]);
  const [loadingCreators, setLoadingCreators] = useState(true);

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

  // Load content creators data for homepage
  useEffect(() => {
    const loadContentCreators = async () => {
      if (!config) return;

      try {
        setLoadingCreators(true);

        const owner = config.wiki?.repository?.owner;
        const repo = config.wiki?.repository?.repo;

        // Load streamers if enabled
        if (isContentCreatorsEnabled(config) &&
            config.features?.contentCreators?.streamers?.enabled &&
            config.features?.contentCreators?.streamers?.showOnHomePage &&
            owner && repo) {
          const approvedStreamers = await getApprovedCreators(owner, repo, config);
          const limit = config.features?.contentCreators?.streamers?.homePageLimit || 3;
          setStreamers(approvedStreamers.slice(0, limit));
        }

        // Load video guides if enabled
        if (areVideoGuidesEnabled(config) &&
            config.features?.contentCreators?.videoGuides?.showOnHomePage) {
          const guides = await loadVideoGuides();
          const limit = config.features?.contentCreators?.videoGuides?.homePageLimit || 6;
          setVideoGuides(guides.slice(0, limit));
        }
      } catch (err) {
        console.error('Error loading content creators for homepage:', err);
      } finally {
        setLoadingCreators(false);
      }
    };

    loadContentCreators();
  }, [config]);

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
    <div className="relative min-h-screen">
      {/* Background - global default from CSS, no component needed */}

      <div className="max-w-5xl mx-auto relative" style={{ zIndex: 2 }}>
        {/* Hero section */}
        <div className="text-center mb-12">
          <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
            {config.wiki.title}
          </h1>
          <p className="text-xl text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
            {config.wiki.description}
          </p>
        </div>

      {/* Featured Live Streams */}
      {!loadingCreators && streamers.length > 0 && (
        <div className="mb-8 sm:mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-3">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">
                🎥 Live Streams
              </h2>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                Watch community streamers playing live
              </p>
            </div>
            <Link
              to="/creators"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-2 group text-sm sm:text-base"
            >
              View All
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {streamers.map((creator) => (
              <div key={creator.creatorId} className="bg-white dark:bg-gray-800 rounded-lg overflow-hidden border border-gray-200 dark:border-gray-700 hover:border-blue-500 dark:hover:border-blue-500 transition-all hover:shadow-xl">
                <StreamEmbed creator={creator} />
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Featured Video Guides */}
      {!loadingCreators && videoGuides.length > 0 && (
        <div className="mb-8 sm:mb-12">
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between mb-4 sm:mb-6 gap-3">
            <div>
              <h2 className="text-2xl sm:text-3xl font-bold text-gray-900 dark:text-white mb-1 sm:mb-2">
                📚 Video Guides
              </h2>
              <p className="text-sm sm:text-base text-gray-600 dark:text-gray-400">
                Learn from community tutorials and guides
              </p>
            </div>
            <Link
              to="/creators"
              className="text-blue-600 dark:text-blue-400 hover:text-blue-700 dark:hover:text-blue-300 font-medium flex items-center gap-2 group text-sm sm:text-base"
            >
              View All
              <svg className="w-3.5 h-3.5 sm:w-4 sm:h-4 group-hover:translate-x-1 transition-transform" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
              </svg>
            </Link>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4 sm:gap-6">
            {videoGuides.map((guide) => (
              <VideoGuideCard key={guide.id} guide={guide} mode="card" />
            ))}
          </div>
        </div>
      )}

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
    </div>
  );
};

export default HomePage;
