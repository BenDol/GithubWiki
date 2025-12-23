import { useEffect, useMemo } from 'react';
import { RouterProvider } from 'react-router-dom';
import { useWikiConfig } from './hooks/useWikiConfig';
import { useAuthStore } from './store/authStore';
import { useUIStore } from './store/uiStore';
import { createWikiRouter } from './router';
import { BranchProvider } from './hooks/useBranchNamespace';
import RateLimitNotification from './components/common/RateLimitNotification';
import DevelopmentBanner from './components/common/DevelopmentBanner';
import AchievementUnlockedToast from './components/achievements/AchievementUnlockedToast';
import { initializeVersionSystem } from './utils/versionManager';
import { initializeAchievementChecker } from './services/achievements/achievementChecker';

function App() {
  const { config, loading, error } = useWikiConfig();
  const { restoreSession } = useAuthStore();
  const { addToast } = useUIStore();

  // Create router with loaded config (memoized to prevent recreation on every render)
  // MUST be before early returns to comply with hooks rules
  const router = useMemo(() => {
    if (!config) return null;
    console.log('[App] Creating router with config');
    return createWikiRouter(config);
  }, [config]);

  // Restore authentication session on mount
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

  // Listen for session expiration events
  useEffect(() => {
    const handleSessionExpired = (event) => {
      const { message, username } = event.detail;
      console.warn('[App] Session expired event received', { username });

      addToast(
        message || 'Your session has expired. Please log in again.',
        'warning',
        10000 // Show for 10 seconds
      );
    };

    window.addEventListener('auth:session-expired', handleSessionExpired);

    // Handle network errors during auth (non-fatal)
    const handleAuthNetworkError = (event) => {
      const { message, error } = event.detail;

      // Show warning toast (not error)
      addToast(
        message || 'Unable to verify session due to network issue.',
        'warning',
        5000 // Show for 5 seconds
      );

      console.warn('[App] Auth network error:', error);
    };

    window.addEventListener('auth:network-error', handleAuthNetworkError);

    return () => {
      window.removeEventListener('auth:session-expired', handleSessionExpired);
      window.removeEventListener('auth:network-error', handleAuthNetworkError);
    };
  }, [addToast]);

  // Initialize version system (migration, cache purging)
  useEffect(() => {
    if (config) {
      initializeVersionSystem(config).then(result => {
        if (result.migrationRan) {
          console.log('[App] Storage migration completed');
        }
        if (result.cachesPurged) {
          console.log('[App] Temporary caches purged due to version update');

          // Show notification in dev mode
          if (import.meta.env.DEV) {
            addToast(
              `Caches cleared - Updated to version ${result.currentVersion}`,
              'info',
              5000
            );
          }
        }
        if (result.versionChanged) {
          console.log('[App] Version updated:', {
            from: result.previousVersion,
            to: result.currentVersion,
          });
        }
      });
    }
  }, [config, addToast]);

  // Initialize achievement checker (calls server-side endpoint)
  useEffect(() => {
    if (config?.wiki?.repository) {
      const { owner, repo } = config.wiki.repository;
      console.log('[App] Initializing server-side achievement checker', { owner, repo });
      initializeAchievementChecker(owner, repo);
    }
  }, [config]);

  // Expose config globally for utilities that need it (e.g., devStore)
  useEffect(() => {
    if (config) {
      window.__WIKI_CONFIG__ = config;
    }
  }, [config]);

  // Expose debug function to test achievement toasts (development only)
  useEffect(() => {
    if (import.meta.env.DEV) {
      window.testAchievementToast = (achievementIds) => {
        const ids = Array.isArray(achievementIds) ? achievementIds : [achievementIds || 'first-login'];
        const achievements = ids.map((id, index) => ({
          id,
          unlockedAt: new Date().toISOString(),
          progress: 100,
        }));

        console.log('[DEBUG] Triggering test achievement toast:', achievements);

        // Import eventBus dynamically to trigger the event
        import('./services/eventBus.js').then(({ eventBus, EventNames }) => {
          eventBus.emit(EventNames.ACHIEVEMENTS_UNLOCKED, { achievements });
        });
      };

      console.log('[DEBUG] Test achievement toast available: window.testAchievementToast()');
      console.log('[DEBUG] Usage: testAchievementToast("first-login") or testAchievementToast(["first-login", "first-pr"])');
    }

    return () => {
      if (import.meta.env.DEV) {
        delete window.testAchievementToast;
      }
    };
  }, []);

  // Set document title from config
  useEffect(() => {
    if (config?.wiki?.title) {
      document.title = config.wiki.title;
    }
  }, [config]);

  // Set favicon from config
  useEffect(() => {
    if (config?.wiki?.favicon) {
      // Find existing favicon link element
      let faviconLink = document.querySelector("link[rel*='icon']");

      // If no favicon link exists, create one
      if (!faviconLink) {
        faviconLink = document.createElement('link');
        faviconLink.rel = 'icon';
        document.head.appendChild(faviconLink);
      }

      // Update href to configured favicon path
      faviconLink.href = config.wiki.favicon;

      // Set type based on file extension
      const ext = config.wiki.favicon.split('.').pop().toLowerCase();
      if (ext === 'svg') {
        faviconLink.type = 'image/svg+xml';
      } else if (ext === 'png') {
        faviconLink.type = 'image/png';
      } else if (ext === 'ico') {
        faviconLink.type = 'image/x-icon';
      } else if (ext === 'jpg' || ext === 'jpeg') {
        faviconLink.type = 'image/jpeg';
      }
    }
  }, [config]);

  // Set web app manifest from config
  useEffect(() => {
    if (config?.wiki?.manifest) {
      // Find existing manifest link element
      let manifestLink = document.querySelector("link[rel='manifest']");

      // If no manifest link exists, create one
      if (!manifestLink) {
        manifestLink = document.createElement('link');
        manifestLink.rel = 'manifest';
        document.head.appendChild(manifestLink);
      }

      // Update href to configured manifest path
      manifestLink.href = config.wiki.manifest;
    }
  }, [config]);

  // Set theme color from config
  useEffect(() => {
    if (config?.wiki?.themeColor) {
      // Find existing theme-color meta tag
      let themeColorMeta = document.querySelector("meta[name='theme-color']");

      // If no theme-color meta exists, create one
      if (!themeColorMeta) {
        themeColorMeta = document.createElement('meta');
        themeColorMeta.name = 'theme-color';
        document.head.appendChild(themeColorMeta);
      }

      // Update content to configured theme color
      themeColorMeta.content = config.wiki.themeColor;
    }
  }, [config]);

  // Loading state
  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading wiki configuration...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center max-w-md p-6">
          <div className="text-red-500 text-5xl mb-4">⚠️</div>
          <h1 className="text-2xl font-bold text-gray-900 dark:text-white mb-2">Configuration Error</h1>
          <p className="text-gray-600 dark:text-gray-400 mb-4">{error}</p>
          <button
            onClick={() => window.location.reload()}
            className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
          >
            Reload
          </button>
        </div>
      </div>
    );
  }

  // Router is created above (before early returns) to comply with hooks rules
  if (!router) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-900">
        <div className="text-center">
          <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
          <p className="mt-4 text-gray-600 dark:text-gray-400">Initializing router...</p>
        </div>
      </div>
    );
  }

  return (
    <BranchProvider>
      <RouterProvider router={router} />
      <RateLimitNotification />
      <DevelopmentBanner />
      <AchievementUnlockedToast />
    </BranchProvider>
  );
}

export default App;
