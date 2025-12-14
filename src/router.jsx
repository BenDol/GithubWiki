import { lazy, Suspense } from 'react';
import { createHashRouter, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import LoadingSpinner from './components/common/LoadingSpinner';
import RouteErrorBoundary from './components/common/RouteErrorBoundary';

// Lazy load page components for code splitting
const HomePage = lazy(() => import('./pages/HomePage'));
const PageViewerPage = lazy(() => import('./pages/PageViewerPage'));
const PageHistoryPage = lazy(() => import('./pages/PageHistoryPage'));
const PageEditorPage = lazy(() => import('./pages/PageEditorPage'));
const SectionPage = lazy(() => import('./pages/SectionPage'));
const SearchPage = lazy(() => import('./pages/SearchPage'));
const BuildViewerPage = lazy(() => import('./pages/BuildViewerPage'));
const MyEditsPage = lazy(() => import('./pages/MyEditsPage'));
const DevToolsPage = lazy(() => import('./pages/DevToolsPage'));
const ContributorHighscorePage = lazy(() => import('./pages/ContributorHighscorePage'));
const NotFoundPage = lazy(() => import('./pages/NotFoundPage'));

// Suspense wrapper component for lazy-loaded pages
const SuspenseWrapper = ({ children }) => (
  <Suspense
    fallback={
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
        </div>
      </div>
    }
  >
    {children}
  </Suspense>
);

/**
 * Create dynamic routes based on wiki configuration
 * Uses hash-based routing for GitHub Pages compatibility
 */
export const createWikiRouter = (config) => {
  return createHashRouter([
    {
      path: '/',
      element: <Layout />,
      errorElement: <RouteErrorBoundary />,
      children: [
        {
          index: true,
          element: (
            <SuspenseWrapper>
              <HomePage />
            </SuspenseWrapper>
          ),
        },
        {
          path: 'search',
          element: (
            <SuspenseWrapper>
              <SearchPage />
            </SuspenseWrapper>
          ),
        },
        {
          path: 'build',
          element: (
            <SuspenseWrapper>
              <BuildViewerPage />
            </SuspenseWrapper>
          ),
        },
        {
          path: 'my-edits',
          element: (
            <SuspenseWrapper>
              <MyEditsPage />
            </SuspenseWrapper>
          ),
        },
        {
          path: 'dev-tools',
          element: (
            <SuspenseWrapper>
              <DevToolsPage />
            </SuspenseWrapper>
          ),
        },
        {
          path: 'highscore',
          element: (
            <SuspenseWrapper>
              <ContributorHighscorePage />
            </SuspenseWrapper>
          ),
        },
        // Dynamic routes for each section
        ...( config?.sections || []).map((section) => ({
          path: section.path,
          children: [
            {
              index: true,
              element: (
                <SuspenseWrapper>
                  <SectionPage sectionId={section.id} />
                </SuspenseWrapper>
              ),
            },
            {
              path: 'new',
              element: (
                <SuspenseWrapper>
                  <PageEditorPage sectionId={section.id} isNewPage={true} />
                </SuspenseWrapper>
              ),
            },
            {
              path: ':pageId',
              element: (
                <SuspenseWrapper>
                  <PageViewerPage sectionId={section.id} />
                </SuspenseWrapper>
              ),
            },
            {
              path: ':pageId/edit',
              element: (
                <SuspenseWrapper>
                  <PageEditorPage sectionId={section.id} />
                </SuspenseWrapper>
              ),
            },
            {
              path: ':pageId/history',
              element: (
                <SuspenseWrapper>
                  <PageHistoryPage sectionId={section.id} />
                </SuspenseWrapper>
              ),
            },
          ],
        })),
        {
          path: '404',
          element: (
            <SuspenseWrapper>
              <NotFoundPage />
            </SuspenseWrapper>
          ),
        },
        {
          path: '*',
          element: <Navigate to="/404" replace />,
        },
      ],
    },
  ]);
};
