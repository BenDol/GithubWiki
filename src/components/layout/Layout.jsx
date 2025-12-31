import { useState } from 'react';
import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import ToastContainer from '../common/ToastContainer';
import DevPanel from '../common/DevPanel';
import BranchIndicator from '../common/BranchIndicator';
import DataBrowserModal from '../common/DataBrowserModal';
import MaintenancePage from '../../pages/MaintenancePage';
import MaintenanceBypassBanner from '../common/MaintenanceBypassBanner';
import { useDevStore } from '../../store/devStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAdminStatus } from '../../hooks/useAdminStatus';
import { LayoutProvider, useLayout } from '../../contexts/LayoutContext';

/**
 * Inner Layout component that uses layout context
 */
const LayoutInner = () => {
  const { containerClasses, maxWidthClass, marginClass } = useLayout();
  const { toggleDevPanel } = useDevStore();
  const { config } = useWikiConfig();
  const { isAdmin, loading: adminLoading } = useAdminStatus();
  const [isDataBrowserOpen, setIsDataBrowserOpen] = useState(false);

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'd',
      ctrl: true,
      shift: true,
      handler: () => toggleDevPanel(),
    },
    {
      key: 'b',
      ctrl: true,
      shift: true,
      handler: () => setIsDataBrowserOpen(prev => !prev),
    },
  ]);

  // Check maintenance mode status
  const maintenanceEnabled = config?.features?.maintenance?.enabled === true;
  const allowAdminBypass = config?.features?.maintenance?.allowAdminBypass !== false;
  const shouldShowMaintenance = maintenanceEnabled && !(allowAdminBypass && isAdmin);

  // Show loading while checking admin status (prevents flicker)
  if (maintenanceEnabled && adminLoading) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <Header onOpenDataBrowser={() => setIsDataBrowserOpen(true)} />
        <div className="flex-1 flex items-center justify-center">
          <div className="text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-blue-500"></div>
            <p className="mt-4 text-gray-600 dark:text-gray-400">Loading...</p>
          </div>
        </div>
      </div>
    );
  }

  // Show maintenance page if conditions met
  if (shouldShowMaintenance) {
    return (
      <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
        <Header onOpenDataBrowser={() => setIsDataBrowserOpen(true)} />
        <main className="flex-1 w-full flex flex-col min-w-0">
          <div className="flex-1">
            <MaintenancePage />
          </div>
          <Footer />
        </main>
        <ToastContainer />
      </div>
    );
  }

  // Normal layout
  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Header onOpenDataBrowser={() => setIsDataBrowserOpen(true)} />
      <MaintenanceBypassBanner />

      <div className="flex-1 flex flex-col lg:flex-row">
        <Sidebar />

        <main className="flex-1 w-full flex flex-col min-w-0">
          <div className={`flex-1 container ${marginClass} ${containerClasses} py-8 ${maxWidthClass} w-full`}>
            <Outlet />
          </div>

          <Footer />
        </main>
      </div>

      {/* Toast notifications */}
      <ToastContainer />

      {/* Developer Tools Panel */}
      <DevPanel />

      {/* Branch Indicator */}
      <BranchIndicator />

      {/* Data Browser Modal */}
      <DataBrowserModal
        isOpen={isDataBrowserOpen}
        onClose={() => setIsDataBrowserOpen(false)}
      />
    </div>
  );
};

/**
 * Layout wrapper that provides layout context
 */
const Layout = () => {
  return (
    <LayoutProvider>
      <LayoutInner />
    </LayoutProvider>
  );
};

export default Layout;
