import { lazy, Suspense } from 'react';
import { createBrowserRouter, Navigate } from 'react-router-dom';
import Layout from './components/layout/Layout';
import LoadingSpinner from './components/common/LoadingSpinner';
import RouteErrorBoundary from './components/common/RouteErrorBoundary';
import { getCustomRoutes } from './utils/routeRegistry';
import lazyWithRetry from './utils/lazyWithRetry';

// Lazy load page components for code splitting with automatic retry on chunk load failure
const HomePage = lazy(() => lazyWithRetry(() => import('./pages/HomePage'), 'HomePage'));
const PageViewerPage = lazy(() => lazyWithRetry(() => import('./pages/PageViewerPage'), 'PageViewerPage'));
const PageHistoryPage = lazy(() => lazyWithRetry(() => import('./pages/PageHistoryPage'), 'PageHistoryPage'));
const PageEditorPage = lazy(() => lazyWithRetry(() => import('./pages/PageEditorPage'), 'PageEditorPage'));
const SectionPage = lazy(() => lazyWithRetry(() => import('./pages/SectionPage'), 'SectionPage'));
const SearchPage = lazy(() => lazyWithRetry(() => import('./pages/SearchPage'), 'SearchPage'));
const BuildViewerPage = lazy(() => lazyWithRetry(() => import('./pages/BuildViewerPage'), 'BuildViewerPage'));
const ProfilePage = lazy(() => lazyWithRetry(() => import('./pages/ProfilePage'), 'ProfilePage'));
const DevToolsPage = lazy(() => lazyWithRetry(() => import('./pages/DevToolsPage'), 'DevToolsPage'));
const ContributorHighscorePage = lazy(() => lazyWithRetry(() => import('./pages/ContributorHighscorePage'), 'ContributorHighscorePage'));
const AdminPanel = lazy(() => lazyWithRetry(() => import('./pages/AdminPanel'), 'AdminPanel'));
const DonatePage = lazy(() => lazyWithRetry(() => import('./pages/DonatePage'), 'DonatePage'));
const DonationSuccessPage = lazy(() => lazyWithRetry(() => import('./pages/DonationSuccessPage'), 'DonationSuccessPage'));
const NotFoundPage = lazy(() => lazyWithRetry(() => import('./pages/NotFoundPage'), 'NotFoundPage'));

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
 * Uses browser routing for proper SEO and indexing
 */
export const createWikiRouter = (config) => {
  return createBrowserRouter([
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
          path: 'profile',
          children: [
            {
              index: true,
              element: (
                <SuspenseWrapper>
                  <ProfilePage />
                </SuspenseWrapper>
              ),
            },
            {
              path: ':username',
              element: (
                <SuspenseWrapper>
                  <ProfilePage />
                </SuspenseWrapper>
              ),
            },
          ],
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
        {
          path: 'admin',
          element: (
            <SuspenseWrapper>
              <AdminPanel />
            </SuspenseWrapper>
          ),
        },
        {
          path: 'donate',
          element: (
            <SuspenseWrapper>
              <DonatePage />
            </SuspenseWrapper>
          ),
        },
        {
          path: 'donation-success',
          element: (
            <SuspenseWrapper>
              <DonationSuccessPage />
            </SuspenseWrapper>
          ),
        },
        // Custom routes registered by parent project
        ...getCustomRoutes().map((route) => ({
          path: route.path,
          element: route.suspense !== false ? (
            <SuspenseWrapper>
              {route.component}
            </SuspenseWrapper>
          ) : route.component,
        })),
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
