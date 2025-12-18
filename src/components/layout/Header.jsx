import { useState, useRef, useEffect } from 'react';
import { Link } from 'react-router-dom';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useUIStore } from '../../store/uiStore';
import { useAuthStore } from '../../store/authStore';
import SearchBar from '../search/SearchBar';
import LoginButton from '../auth/LoginButton';
import UserMenu from '../auth/UserMenu';

/**
 * Header component with navigation, search, and user menu
 */
const Header = ({ onOpenDataBrowser }) => {
  const { config } = useWikiConfig();
  const { darkMode, toggleDarkMode, toggleSidebar } = useUIStore();
  const { isAuthenticated, user } = useAuthStore();
  const [isToolsDropdownOpen, setIsToolsDropdownOpen] = useState(false);
  const toolsDropdownRef = useRef(null);

  // Close dropdown when clicking outside
  useEffect(() => {
    const handleClickOutside = (event) => {
      if (toolsDropdownRef.current && !toolsDropdownRef.current.contains(event.target)) {
        setIsToolsDropdownOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  if (!config) return null;

  return (
    <header className="sticky top-0 z-50 w-full border-b border-gray-200 dark:border-gray-800 bg-white dark:bg-gray-900">
      <div className="container mx-auto px-2 sm:px-4">
        <div className="flex h-16 items-center justify-between">
          {/* Left side - Logo and Home link */}
          <div className="flex items-center space-x-6">
            {/* Mobile menu button */}
            <button
              onClick={toggleSidebar}
              className="lg:hidden p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800"
              aria-label="Toggle sidebar"
            >
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h16" />
              </svg>
            </button>

            {/* Logo */}
            <Link to="/" className="flex items-center space-x-2 group">
              {config.wiki.logo ? (
                <img
                  src={config.wiki.logo}
                  alt={config.wiki.title}
                  className="h-8 w-8 transition-all duration-300 ease-in-out group-hover:scale-110 group-hover:drop-shadow-[0_0_8px_rgba(59,130,246,0.5)] dark:group-hover:drop-shadow-[0_0_12px_rgba(96,165,250,0.6)]"
                />
              ) : (
                <div className="h-8 w-8 bg-blue-500 rounded-lg flex items-center justify-center text-white font-bold transition-all duration-300 ease-in-out group-hover:scale-110 group-hover:shadow-[0_0_12px_rgba(59,130,246,0.6)]">
                  W
                </div>
              )}
              <span className="font-bold text-xl text-gray-900 dark:text-white hidden sm:block">
                {config.wiki.title}
              </span>
            </Link>

            {/* Navigation links - desktop */}
            <nav className="hidden md:flex items-center space-x-1">
              {config.sidebar?.pages?.filter(page => page.path !== '/' && page.showInHeader !== false).map((page, index) => (
                <Link
                  key={index}
                  to={page.path}
                  className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white transition-colors flex items-center gap-2"
                >
                  {page.icon && <span>{page.icon}</span>}
                  <span>{page.title}</span>
                </Link>
              ))}

              {/* Tools Dropdown */}
              {config.wiki?.tools && config.wiki.tools.length > 0 && (
                <div className="relative" ref={toolsDropdownRef}>
                  <button
                    onClick={() => setIsToolsDropdownOpen(!isToolsDropdownOpen)}
                    className="px-3 py-2 rounded-lg text-sm font-medium text-gray-700 hover:bg-gray-100 hover:text-gray-900 dark:text-gray-300 dark:hover:bg-gray-800 dark:hover:text-white transition-colors flex items-center gap-2"
                  >
                    <span>🛠️</span>
                    <span>Tools</span>
                    <svg
                      className={`w-4 h-4 transition-transform ${isToolsDropdownOpen ? 'rotate-180' : ''}`}
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                    </svg>
                  </button>

                  {/* Dropdown Menu */}
                  {isToolsDropdownOpen && (
                    <div className="absolute top-full left-0 mt-1 w-56 bg-white dark:bg-gray-800 rounded-lg shadow-lg border border-gray-200 dark:border-gray-700 py-1 z-50">
                      {config.wiki.tools.map((tool, index) => (
                        <Link
                          key={index}
                          to={tool.path}
                          onClick={() => setIsToolsDropdownOpen(false)}
                          className="flex items-start gap-3 px-4 py-3 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                        >
                          {tool.icon && (
                            <span className="text-xl flex-shrink-0">{tool.icon}</span>
                          )}
                          <div className="flex-1 min-w-0">
                            <div className="text-sm font-medium text-gray-900 dark:text-white">
                              {tool.title}
                            </div>
                            {tool.description && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-0.5">
                                {tool.description}
                              </div>
                            )}
                          </div>
                        </Link>
                      ))}
                    </div>
                  )}
                </div>
              )}
            </nav>
          </div>

          {/* Right side - Data browser, search, theme toggle, user menu */}
          <div className="flex items-center space-x-2">
            {/* Data Browser */}
            <button
              onClick={onOpenDataBrowser}
              className="flex items-center space-x-2 px-3 py-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300 transition-colors"
              title="Data Browser (Ctrl+Shift+B)"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 7v10c0 2.21 3.582 4 8 4s8-1.79 8-4V7M4 7c0 2.21 3.582 4 8 4s8-1.79 8-4M4 7c0-2.21 3.582-4 8-4s8 1.79 8 4m0 5c0 2.21-3.582 4-8 4s-8-1.79-8-4" />
              </svg>
              <span className="hidden md:inline text-sm">Data</span>
              <kbd className="hidden lg:inline px-2 py-0.5 text-xs font-semibold text-gray-600 dark:text-gray-400 bg-gray-100 dark:bg-gray-800 border border-gray-300 dark:border-gray-700 rounded">
                Ctrl+Shift+B
              </kbd>
            </button>

            {/* Search */}
            <SearchBar />

            {/* Dark mode toggle */}
            <button
              onClick={toggleDarkMode}
              className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-gray-800 text-gray-700 dark:text-gray-300"
              aria-label="Toggle dark mode"
            >
              {darkMode ? (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 3v1m0 16v1m9-9h-1M4 12H3m15.364 6.364l-.707-.707M6.343 6.343l-.707-.707m12.728 0l-.707.707M6.343 17.657l-.707.707M16 12a4 4 0 11-8 0 4 4 0 018 0z" />
                </svg>
              ) : (
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M20.354 15.354A9 9 0 018.646 3.646 9.003 9.003 0 0012 21a9.003 9.003 0 008.354-5.646z" />
                </svg>
              )}
            </button>

            {/* User menu */}
            {isAuthenticated && user ? (
              <UserMenu />
            ) : (
              <LoginButton />
            )}
          </div>
        </div>
      </div>
    </header>
  );
};

export default Header;
