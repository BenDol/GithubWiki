import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import ToastContainer from '../common/ToastContainer';
import DevPanel from '../common/DevPanel';
import BranchIndicator from '../common/BranchIndicator';
import { useDevStore } from '../../store/devStore';
import { useKeyboardShortcuts } from '../../hooks/useKeyboardShortcuts';

/**
 * Main layout component that wraps all pages
 */
const Layout = () => {
  const { toggleDevPanel } = useDevStore();

  // Keyboard shortcuts
  useKeyboardShortcuts([
    {
      key: 'd',
      ctrl: true,
      shift: true,
      handler: () => toggleDevPanel(),
    },
  ]);

  return (
    <div className="min-h-screen flex flex-col bg-gray-50 dark:bg-gray-900">
      <Header />

      <div className="flex-1 flex flex-col lg:flex-row">
        <Sidebar />

        <main className="flex-1 w-full flex flex-col min-w-0">
          <div className="flex-1 container mx-auto px-4 py-8 max-w-7xl w-full">
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
    </div>
  );
};

export default Layout;
