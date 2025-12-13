import { Outlet } from 'react-router-dom';
import Header from './Header';
import Sidebar from './Sidebar';
import Footer from './Footer';
import ToastContainer from '../common/ToastContainer';
import DevPanel from '../common/DevPanel';
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

      <div className="flex flex-1">
        <Sidebar />

        <main className="flex-1 w-full">
          <div className="container mx-auto px-4 py-8 max-w-7xl">
            <Outlet />
          </div>

          <Footer />
        </main>
      </div>

      {/* Toast notifications */}
      <ToastContainer />

      {/* Developer Tools Panel */}
      <DevPanel />
    </div>
  );
};

export default Layout;
