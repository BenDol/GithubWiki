import { useEffect } from 'react';
import { RouterProvider } from 'react-router-dom';
import { useWikiConfig } from './hooks/useWikiConfig';
import { useAuthStore } from './store/authStore';
import { createWikiRouter } from './router';
import { BranchProvider } from './hooks/useBranchNamespace';

function App() {
  const { config, loading, error } = useWikiConfig();
  const { restoreSession } = useAuthStore();

  // Restore authentication session on mount
  useEffect(() => {
    restoreSession();
  }, [restoreSession]);

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

  // Create router with loaded config
  const router = createWikiRouter(config);

  return (
    <BranchProvider>
      <RouterProvider router={router} />
    </BranchProvider>
  );
}

export default App;
