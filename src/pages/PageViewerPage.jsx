import { useEffect, useState, useRef } from 'react';
import { useParams, Link, useNavigate } from 'react-router-dom';
import matter from 'gray-matter';
import PageViewer from '../components/wiki/PageViewer';
import TableOfContents from '../components/wiki/TableOfContents';
import LoadingSpinner from '../components/common/LoadingSpinner';
import StarContributor from '../components/wiki/StarContributor';
import PendingEditRequests from '../components/wiki/PendingEditRequests';
import Comments from '../components/wiki/Comments';
import { useWikiStore } from '../store/wikiStore';
import { useSection, useWikiConfig } from '../hooks/useWikiConfig';
import { useFeature } from '../hooks/useWikiConfig';
import { useBranchNamespace } from '../hooks/useBranchNamespace';
import { getDisplayTitle } from '../utils/textUtils';
import { useAuthStore } from '../store/authStore';
import { getFileContent } from '../services/github/content';
import { isBanned } from '../services/github/admin';
import { getContentProcessor, getCustomComponents } from '../utils/contentRendererRegistry';
import { loadDynamicPage, shouldUseDynamicLoading, invalidatePageCache } from '../services/github/dynamicPageLoader';
import { createLogger } from '../utils/logger';

const logger = createLogger('PageViewer');

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
  const [existsOnGitHub, setExistsOnGitHub] = useState(false);

  const { cachePage, getCachedPage, clearPageCache } = useWikiStore();
  const { config } = useWikiConfig();
  const section = useSection(sectionId);
  const showToc = useFeature('tableOfContents');
  const autoFormatTitles = config?.features?.autoFormatPageTitles ?? false;
  const { isAuthenticated, user } = useAuthStore();
  const { branch } = useBranchNamespace();
  const [userIsBanned, setUserIsBanned] = useState(false);
  const [checkingBanStatus, setCheckingBanStatus] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [loadingSource, setLoadingSource] = useState(null);
  const [cacheWarning, setCacheWarning] = useState(null);
  const contentRef = useRef(null);

  // Check if this is a framework/hardcoded page (no editing allowed)
  const isFrameworkPage = section?.allowContributions === false;

  // Check if anonymous editing is available
  const anonymousEnabled = config?.features?.editRequestCreator?.anonymous?.enabled ?? false;
  const requireAuth = config?.features?.editRequestCreator?.permissions?.requireAuth ?? true;

  // Determine if edit button should be shown
  // Show if: page allows contributions AND (user is authenticated OR anonymous mode is available) AND user is not banned AND not checking ban status
  const canShowEditButton = !isFrameworkPage && (isAuthenticated || (anonymousEnabled && !requireAuth)) && !userIsBanned && !checkingBanStatus;

  /**
   * Force refresh page content by clearing cache and fetching with cache-busting
   */
  const handleRefreshContent = async () => {
    try {
      setRefreshing(true);
      setCacheWarning(null);

      // Clear in-memory cache for this page
      const cacheKey = `${sectionId}/${pageId}`;
      clearPageCache(cacheKey);

      const useDynamic = shouldUseDynamicLoading(config);

      if (useDynamic) {
        // Invalidate cache and fetch fresh from GitHub
        invalidatePageCache(sectionId, pageId, null);

        const result = await loadDynamicPage(sectionId, pageId, config, branch, true);

        if (result.warning) {
          setCacheWarning(result.warning);
        }

        // Apply auto-formatting to title if enabled
        const formattedMetadata = {
          ...result.metadata,
          title: getDisplayTitle(pageId, result.metadata.title, autoFormatTitles)
        };

        setContent(result.content);
        setMetadata(formattedMetadata);
        setLoadingSource(result.source);
      } else {
        // Fetch with cache-busting query parameter to bypass browser cache
        const timestamp = Date.now();
        const response = await fetch(`${import.meta.env.BASE_URL}content/${sectionId}/${pageId}.md?t=${timestamp}`);

        if (!response.ok) {
          throw new Error('Failed to refresh content');
        }

        const markdownText = await response.text();

        // Parse frontmatter and content
        const { data, content: markdownContent } = matter(markdownText);

        // Apply auto-formatting to title if enabled
        const formattedMetadata = {
          ...data,
          title: getDisplayTitle(pageId, data.title, autoFormatTitles)
        };

        setMetadata(formattedMetadata);
        setContent(markdownContent);

        // Cache the refreshed page
        cachePage(cacheKey, markdownContent, formattedMetadata);
      }

      logger.info('Content refreshed successfully');
    } catch (error) {
      logger.error('Failed to refresh content', { error });
      // Show error notification or toast (could be enhanced)
      alert('Failed to refresh content. The page may not be deployed yet. Please try again in a moment.');
    } finally {
      setRefreshing(false);
    }
  };

  /**
   * Toggle fullscreen mode
   * On mobile: Use CSS-based fullscreen (fixed positioning)
   * On desktop: Use native fullscreen API
   */
  const toggleFullscreen = async () => {
    if (!contentRef.current) return;

    try {
      const isMobile = window.innerWidth < 1024;

      if (!isFullscreen) {
        // Enter fullscreen
        if (isMobile) {
          // Mobile: Use CSS-based fullscreen
          setIsFullscreen(true);
          document.body.style.overflow = 'hidden';
        } else {
          // Desktop: Use native fullscreen API
          if (contentRef.current.requestFullscreen) {
            await contentRef.current.requestFullscreen();
          }
          setIsFullscreen(true);
        }
      } else {
        // Exit fullscreen
        if (isMobile) {
          // Mobile: Exit CSS-based fullscreen
          setIsFullscreen(false);
          document.body.style.overflow = '';
        } else {
          // Desktop: Exit native fullscreen
          if (document.fullscreenElement && document.exitFullscreen) {
            await document.exitFullscreen();
          }
          setIsFullscreen(false);
        }
      }
    } catch (error) {
      logger.error('Fullscreen error', { error });
    }
  };

  /**
   * Listen for fullscreen changes (e.g., ESC key) - desktop only
   */
  useEffect(() => {
    const handleFullscreenChange = () => {
      const isMobile = window.innerWidth < 1024;
      // Only update from native fullscreen events on desktop
      if (!isMobile) {
        setIsFullscreen(!!document.fullscreenElement);
      }
    };

    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => {
      document.removeEventListener('fullscreenchange', handleFullscreenChange);
    };
  }, []);

  /**
   * Cleanup body overflow on unmount
   */
  useEffect(() => {
    return () => {
      document.body.style.overflow = '';
    };
  }, []);

  useEffect(() => {
    const loadPage = async () => {
      try {
        setLoading(true);
        setError(null);
        setExistsOnGitHub(false); // Reset GitHub existence state on each page load
        setCacheWarning(null); // Reset cache warning

        const useDynamic = shouldUseDynamicLoading(config);

        if (useDynamic) {
          // Use dynamic page loading from GitHub
          logger.debug('Using dynamic page loading');

          const result = await loadDynamicPage(sectionId, pageId, config, branch, false);

          if (result.warning) {
            setCacheWarning(result.warning);
          }

          // Apply auto-formatting to title if enabled
          const formattedMetadata = {
            ...result.metadata,
            title: getDisplayTitle(pageId, result.metadata.title, autoFormatTitles)
          };

          setContent(result.content);
          setMetadata(formattedMetadata);
          setLoadingSource(result.source);
        } else {
          // Use static page loading (original behavior)
          logger.debug('Using static page loading');

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

          // Check if we got HTML instead of markdown (dev server returns index.html for missing files)
          if (markdownText.trim().startsWith('<!DOCTYPE') || markdownText.trim().startsWith('<html') || markdownText.includes('<script type="module" src="/@vite/client">')) {
            throw new Error('Page not found');
          }

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
        }
      } catch (err) {
        logger.error('Error loading page', { error: err, message: err?.message });

        // Check if the file exists on GitHub but hasn't been deployed yet
        if (config?.wiki?.repository?.owner && config?.wiki?.repository?.repo && branch) {
          try {
            logger.debug('Checking if file exists on GitHub', {
              path: `public/content/${sectionId}/${pageId}.md`,
              branch
            });
            const filePath = `public/content/${sectionId}/${pageId}.md`;
            // Use cache-busting to get fresh content (especially important for recent PRs)
            const fileData = await getFileContent(
              config.wiki.repository.owner,
              config.wiki.repository.repo,
              filePath,
              branch,
              true // bustCache = true for fresh content
            );

            // getFileContent returns null for 404 errors instead of throwing
            if (fileData === null) {
              logger.debug('File does NOT exist on GitHub (returned null)');
              setExistsOnGitHub(false);
            } else {
              // If we get here, the file exists on GitHub
              logger.debug('File EXISTS on GitHub but not deployed yet');
              setExistsOnGitHub(true);
            }
          } catch (githubErr) {
            logger.debug('File does NOT exist on GitHub (error)', { error: githubErr.message });
            setExistsOnGitHub(false);
          }
        } else {
          logger.debug('Cannot check GitHub - missing config or branch');
          setExistsOnGitHub(false);
        }

        setError(err.message || 'Failed to load page');
      } finally {
        setLoading(false);
      }
    };

    loadPage();
  }, [sectionId, pageId, cachePage, getCachedPage, autoFormatTitles, config, branch]);

  // Check if user is banned
  useEffect(() => {
    const checkBanStatus = async () => {
      if (!isAuthenticated || !user || !config?.wiki?.repository) {
        setUserIsBanned(false);
        setCheckingBanStatus(false);
        return;
      }

      try {
        setCheckingBanStatus(true);
        const { owner, repo } = config.wiki.repository;
        const banned = await isBanned(user.login, owner, repo, config);
        setUserIsBanned(banned);

        if (banned) {
          logger.info('User is banned - hiding edit button', { username: user.login });
        }
      } catch (error) {
        logger.error('Failed to check ban status', { error });
        setUserIsBanned(false); // Fail open - allow access on error
      } finally {
        setCheckingBanStatus(false);
      }
    };

    checkBanStatus();
  }, [isAuthenticated, user, config]);

  // Scroll to anchor or top after page loads
  useEffect(() => {
    if (!loading && content) {
      // Check if there's an anchor in the URL
      // For browser routing, URL format is: /route/path#anchor-id
      // window.location.hash gives us: '#anchor-id'
      const anchor = window.location.hash.slice(1); // Remove the '#' prefix

      logger.trace('Anchor navigation', {
        fullHash: window.location.hash,
        anchor
      });

      if (anchor) {
        // Decode the anchor in case it's URL-encoded
        const decodedAnchor = decodeURIComponent(anchor);
        logger.trace('Looking for element with ID', { anchor: decodedAnchor });

        // Use MutationObserver to wait for the element to be added to the DOM
        let attempts = 0;
        const maxAttempts = 50; // 5 seconds max (50 * 100ms)

        const checkElement = () => {
          const element = document.getElementById(decodedAnchor);

          if (element) {
            logger.trace('Found element for anchor', { anchor: decodedAnchor });
            element.scrollIntoView({ behavior: 'smooth', block: 'start' });
          } else {
            attempts++;
            if (attempts >= maxAttempts) {
              logger.warn('Element not found after max attempts', {
                anchor: decodedAnchor,
                maxAttempts,
                availableIds: Array.from(document.querySelectorAll('[id]')).map(el => el.id)
              });
            } else {
              // Try again
              requestAnimationFrame(checkElement);
            }
          }
        };

        // Start checking
        checkElement();
      } else {
        // No anchor, scroll to top
        window.scrollTo({ top: 0, behavior: 'smooth' });
      }
    }
  }, [loading, content, location]);

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
    // If file exists on GitHub but not deployed → Show "deploying" message with comments
    if (existsOnGitHub) {
      return (
        <div>
          <div className="max-w-2xl mx-auto text-center py-12">
            <div className="text-gray-400 text-6xl mb-4">⏳</div>
            <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
              Page Is Deploying
            </h1>
            <p className="text-gray-600 dark:text-gray-400 mb-4">
              This page exists but is currently being deployed. It will be available shortly.
            </p>
            <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4 mb-6 text-left">
              <h3 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
                What's happening?
              </h3>
              <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside">
                <li>The wiki is currently deploying new content</li>
                <li>This page will be available in about 1-2 minutes</li>
                <li>Try refreshing the page after waiting a moment</li>
              </ul>
            </div>
            <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
              <button
                onClick={() => window.location.reload()}
                className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                </svg>
                Refresh Page
              </button>
              <Link
                to={`/${sectionId}`}
                className="inline-flex items-center px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
              >
                <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
                </svg>
                Back to Section
              </Link>
            </div>
            <p className="mt-6 text-xs text-gray-500 dark:text-gray-400">
              If this page still doesn't load after a few minutes, please contact support.
            </p>
          </div>

          {/* Comments section - show even when page is deploying */}
          <div className="max-w-4xl mx-auto mt-12">
            <div className="border-t border-gray-200 dark:border-gray-700 pt-8">
              <Comments
                pageTitle={getDisplayTitle(pageId, null, autoFormatTitles)}
                sectionId={sectionId}
                pageId={pageId}
              />
            </div>
          </div>
        </div>
      );
    }

    // Otherwise, file doesn't exist → Show "not found" message with create button
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">📄</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Page Not Found
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-4">
          The page "{pageId}" doesn't exist in this section yet.
        </p>
        <div className="bg-gray-50 dark:bg-gray-900/20 border border-gray-200 dark:border-gray-700 rounded-lg p-4 mb-6 text-left">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-200 mb-2">
            What can I do?
          </h3>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-1 list-disc list-inside">
            <li>Create this page if you have write access</li>
            <li>Check if the URL is correct</li>
            <li>Browse other pages in this section</li>
          </ul>
        </div>
        <div className="flex flex-col sm:flex-row gap-3 justify-center items-center">
          {canShowEditButton && (
            <Link
              to={`/${sectionId}/${pageId}/edit?new=true`}
              className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
            >
              <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
              </svg>
              Create Page
            </Link>
          )}
          <Link
            to={`/${sectionId}`}
            className="inline-flex items-center px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            <svg className="w-5 h-5 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 19l-7-7m0 0l7-7m-7 7h18" />
            </svg>
            Back to Section
          </Link>
        </div>
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
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ← Back
          </button>
        ) : (
          <Link
            to={`/${sectionId}`}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ← Back to {section?.title || sectionId}
          </Link>
        )}

        {/* Refresh button - force reload content from server */}
        <button
          onClick={handleRefreshContent}
          disabled={refreshing}
          className="inline-flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          title="Refresh page content from server"
        >
          {refreshing ? (
            <>
              <svg className="animate-spin -ml-1 sm:mr-2 h-4 w-4" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
              <span className="hidden sm:inline">Refreshing...</span>
            </>
          ) : (
            <>
              <svg className="w-4 h-4 sm:mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
              </svg>
              <span className="hidden sm:inline">Refresh</span>
            </>
          )}
        </button>

        {/* Edit button - only show if user is authenticated or anonymous editing is enabled */}
        {canShowEditButton && (
          <Link
            to={`/${sectionId}/${pageId}/edit`}
            className="inline-flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            ✏️ Edit
          </Link>
        )}

        {/* History button - only show for pages that allow contributions */}
        {!isFrameworkPage && (
          <Link
            to={`/${sectionId}/${pageId}/history`}
            className="inline-flex items-center px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-50 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
          >
            📜 History
          </Link>
        )}
      </div>

      {/* Warning banner for cache/GitHub issues */}
      {cacheWarning && (
        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg">
          <p className="text-sm text-yellow-800 dark:text-yellow-200">
            {cacheWarning === 'rate-limited' && '⚠️ GitHub rate limit reached. Showing cached content.'}
            {cacheWarning === 'github-unavailable' && '⚠️ GitHub unavailable. Showing bundled version.'}
          </p>
        </div>
      )}

      {/* Page content with TOC */}
      <div className="flex gap-8">
        {/* Main content */}
        <div className="flex-1 min-w-0 space-y-12">
          <div
            ref={contentRef}
            className={`page-viewer-container relative group ${
              isFullscreen
                ? 'lg:pt-8 fixed inset-0 z-50 lg:relative lg:inset-auto lg:z-auto bg-white dark:bg-gray-900 overflow-y-auto p-4 lg:p-0'
                : ''
            }`}
          >
            {/* Fullscreen toggle button - hidden on mobile, hover on desktop */}
            <button
              onClick={toggleFullscreen}
              className={`hidden lg:block absolute top-4 right-4 z-20 p-2 bg-white/90 dark:bg-gray-800/70 text-gray-700 dark:text-white border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-white dark:hover:bg-gray-800/90 transition-all duration-200 shadow-lg backdrop-blur-sm ${
                isFullscreen ? '' : 'lg:opacity-0 lg:group-hover:opacity-100'
              }`}
              title={isFullscreen ? 'Exit fullscreen (ESC)' : 'Enter fullscreen'}
              aria-label={isFullscreen ? 'Exit fullscreen' : 'Enter fullscreen'}
            >
              {isFullscreen ? (
                // Exit fullscreen icon
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              ) : (
                // Enter fullscreen icon
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 8V4m0 0h4M4 4l5 5m11-5h-4m4 0v4m0-4l-5 5M4 16v4m0 0h4m-4 0l5-5m11 5l-5-5m5 5v-4m0 4h-4" />
                </svg>
              )}
            </button>

            <PageViewer
              content={content}
              metadata={metadata}
              contentProcessor={getContentProcessor()}
              customComponents={getCustomComponents()}
            />
          </div>

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

          {/* Pending edit requests */}
          {!isFrameworkPage && (
            <PendingEditRequests sectionId={sectionId} pageId={pageId} />
          )}

          {/* Table of Contents */}
          {showToc && <TableOfContents content={content} />}
        </aside>
      </div>
    </div>
  );
};

export default PageViewerPage;
