import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAuthStore } from '../../store/authStore';
import { getDisplayTitle } from '../../utils/textUtils';
import { isBanned } from '../../services/github/admin';

/**
 * TreeNode component for rendering expandable tree items
 */
const TreeNode = ({
  icon,
  title,
  path,
  isActive,
  hasChildren,
  isExpanded,
  onToggle,
  level = 0,
  onAddClick,
  showAddButton,
  showTreeLines = true,
  isLastChild = false,
  treeLineWidth = 1,
  treeLineStyle = 'solid',
  onNavigate
}) => {
  const baseIndent = 12;
  const levelIndent = 20;
  const paddingLeft = `${level * levelIndent + baseIndent}px`;

  // Calculate tree line position (aligned with parent's icon/arrow center)
  const lineLeftPos = level > 0 ? `${(level - 1) * levelIndent + baseIndent + 10}px` : '0px';

  // Tree line styles with configurable width and style
  const verticalLineStyle = {
    left: lineLeftPos,
    borderLeftWidth: `${treeLineWidth}px`,
    borderLeftStyle: treeLineStyle
  };

  const horizontalLineStyle = {
    left: `calc(${lineLeftPos} + ${treeLineWidth}px)`,
    width: `${levelIndent - 2 - treeLineWidth}px`,
    borderTopWidth: `${treeLineWidth}px`,
    borderTopStyle: treeLineStyle
  };

  if (!hasChildren) {
    // Leaf node (page) - clickable link
    return (
      <div className="relative">
        {showTreeLines && level > 0 && (
          <>
            {/* Vertical line from parent (top to horizontal line) */}
            <div
              className="absolute top-0 h-1/2 border-l border-gray-200 dark:border-gray-700"
              style={verticalLineStyle}
            />
            {/* Vertical line continuation (from horizontal line to bottom) - only for non-last children */}
            {!isLastChild && (
              <div
                className="absolute top-1/2 bottom-0 border-l border-gray-200 dark:border-gray-700"
                style={verticalLineStyle}
              />
            )}
            {/* Horizontal line to item */}
            <div
              className="absolute top-1/2 border-t border-gray-200 dark:border-gray-700"
              style={horizontalLineStyle}
            />
          </>
        )}
        <Link
          to={path}
          onClick={onNavigate}
          className={`
            flex items-center gap-2 py-2 px-3 text-sm rounded-lg transition-colors relative
            ${isActive
              ? 'bg-blue-50 text-blue-700 dark:bg-blue-900 dark:text-blue-300 font-medium'
              : 'text-gray-700 hover:bg-gray-100 dark:text-gray-300 dark:hover:bg-gray-800'
            }
          `}
          style={{ paddingLeft }}
        >
          {icon && <span className="text-base flex-shrink-0">{icon}</span>}
          <span className="truncate">{title}</span>
        </Link>
      </div>
    );
  }

  // Parent node (category/section) - toggle button
  return (
    <div className="relative">
      {showTreeLines && level > 0 && (
        <>
          {/* Vertical line from parent (top to horizontal line) */}
          <div
            className="absolute top-0 h-1/2 border-l border-gray-200 dark:border-gray-700"
            style={verticalLineStyle}
          />
          {/* Vertical line continuation (from horizontal line to bottom) - only for non-last children */}
          {!isLastChild && (
            <div
              className="absolute top-1/2 bottom-0 border-l border-gray-200 dark:border-gray-700"
              style={verticalLineStyle}
            />
          )}
          {/* Horizontal line to item */}
          <div
            className="absolute top-1/2 border-t border-gray-200 dark:border-gray-700"
            style={horizontalLineStyle}
          />
        </>
      )}
      <div className="w-full relative">
        <button
          onClick={onToggle}
          className="w-full flex items-center gap-2 py-2 px-3 text-sm text-gray-900 dark:text-white hover:bg-gray-100 dark:hover:bg-gray-800 rounded-lg transition-colors font-medium pr-10"
          style={{ paddingLeft }}
        >
          <svg
            className={`w-4 h-4 flex-shrink-0 transition-transform ${isExpanded ? 'rotate-90' : ''}`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {icon && <span className="text-base flex-shrink-0">{icon}</span>}
          <span className="truncate">{title}</span>
        </button>
        {showAddButton && onAddClick && (
          <button
            onClick={onAddClick}
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1.5 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors bg-gray-50 dark:bg-gray-900"
            title="Create new page"
          >
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 4v16m8-8H4" />
            </svg>
          </button>
        )}
      </div>
    </div>
  );
};

/**
 * Sidebar component with tree navigation
 */
const Sidebar = () => {
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const { config } = useWikiConfig();
  const location = useLocation();
  const navigate = useNavigate();
  const { isAuthenticated, user } = useAuthStore();
  const [userIsBanned, setUserIsBanned] = useState(false);
  const [sidebarHovered, setSidebarHovered] = useState(false);

  const [expandedCategories, setExpandedCategories] = useState(() => {
    // Initialize expanded categories based on config
    if (!config?.categories) return {};

    const initialExpanded = {};
    config.categories.forEach(category => {
      if (category.expandedByDefault) {
        initialExpanded[category.id] = true;
      }
    });
    return initialExpanded;
  });
  const [expandedSections, setExpandedSections] = useState({});
  const [pages, setPages] = useState([]);
  const [loading, setLoading] = useState(true);

  // Sidebar width state from uiStore (default 256px = w-64, but clamped to 85% on mobile)
  const { sidebarWidth, setSidebarWidth } = useUIStore();

  // Responsive sidebar width - max 85% of screen width on mobile
  const effectiveSidebarWidth = typeof window !== 'undefined' && window.innerWidth < 1024
    ? Math.min(sidebarWidth, window.innerWidth * 0.85)
    : sidebarWidth;
  const [isResizing, setIsResizing] = useState(false);

  const autoFormatTitles = config?.features?.autoFormatPageTitles ?? false;

  // Handler to close sidebar on mobile when navigating
  const handleNavigate = () => {
    // Only close on mobile (< 1024px)
    if (typeof window !== 'undefined' && window.innerWidth < 1024) {
      setSidebarOpen(false);
    }
  };

  // Support both boolean and object format for backward compatibility
  const treeLineConfig = config?.features?.sidebarTreeLines;
  const showTreeLines = typeof treeLineConfig === 'boolean'
    ? treeLineConfig
    : treeLineConfig?.enabled ?? true;
  const treeLineWidth = typeof treeLineConfig === 'object'
    ? treeLineConfig?.width ?? 1
    : 1;
  const treeLineStyle = typeof treeLineConfig === 'object'
    ? treeLineConfig?.style ?? 'solid'
    : 'solid';

  // Initialize expanded categories from config when config loads
  useEffect(() => {
    if (config?.categories) {
      const initialExpanded = {};
      config.categories.forEach(category => {
        if (category.expandedByDefault) {
          initialExpanded[category.id] = true;
        }
      });
      setExpandedCategories(prev => ({ ...initialExpanded, ...prev }));
    }
  }, [config]);

  // Load all pages from search index
  useEffect(() => {
    const loadPages = async () => {
      try {
        const response = await fetch(`${import.meta.env.BASE_URL}search-index.json`);
        if (response.ok) {
          const searchIndex = await response.json();
          const discoveredPages = searchIndex.filter(page => page.pageId !== 'index');

          // Add custom pages from section configs
          const customPages = [];
          if (config?.sections) {
            config.sections.forEach(section => {
              if (section.pages && Array.isArray(section.pages)) {
                section.pages.forEach(page => {
                  customPages.push({
                    id: `${section.id}:${page.path}`,
                    section: section.id,
                    pageId: page.path.replace(/^\//, ''), // Remove leading slash
                    title: page.title,
                    path: page.path,
                    isCustomRoute: true,
                    icon: page.icon,
                  });
                });
              }
            });
          }

          setPages([...discoveredPages, ...customPages]);
        }
      } catch (err) {
        console.error('Failed to load pages for sidebar:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPages();
  }, [config]);

  // Handle sidebar resize
  useEffect(() => {
    if (!isResizing) return;

    // Add cursor style to body
    document.body.style.cursor = 'col-resize';
    document.body.style.userSelect = 'none';

    const handleMouseMove = (e) => {
      const newWidth = e.clientX;
      // Min width: 200px, Max width: 600px
      if (newWidth >= 200 && newWidth <= 600) {
        setSidebarWidth(newWidth);
      }
    };

    const handleMouseUp = () => {
      setIsResizing(false);
      // Remove cursor styles (sidebarWidth auto-persists via uiStore)
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };

    document.addEventListener('mousemove', handleMouseMove);
    document.addEventListener('mouseup', handleMouseUp);

    return () => {
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
      document.body.style.cursor = '';
      document.body.style.userSelect = '';
    };
  }, [isResizing, sidebarWidth]);

  // Auto-expand to current page
  useEffect(() => {
    if (!config || pages.length === 0) return;

    const pathParts = location.pathname.split('/').filter(Boolean);
    if (pathParts.length === 0) return;

    const currentSectionPath = pathParts[0];
    const currentSection = config.sections?.find(s => s.path === currentSectionPath);

    if (currentSection) {
      // Find which category contains this section
      const category = config.categories?.find(cat =>
        cat.sections.includes(currentSection.id)
      );

      if (category) {
        // Expand the category and section
        setExpandedCategories(prev => ({ ...prev, [category.id]: true }));
        setExpandedSections(prev => ({ ...prev, [currentSection.id]: true }));
      }
    }
  }, [location.pathname, config, pages]);

  // Check if user is banned
  useEffect(() => {
    const checkBanStatus = async () => {
      if (!isAuthenticated || !user || !config?.wiki?.repository) {
        setUserIsBanned(false);
        return;
      }

      try {
        const { owner, repo } = config.wiki.repository;
        const banned = await isBanned(user.login, owner, repo, config);
        setUserIsBanned(banned);

        if (banned) {
          console.log(`[Sidebar] User ${user.login} is banned - hiding create page buttons`);
        }
      } catch (error) {
        console.error('[Sidebar] Failed to check ban status:', error);
        setUserIsBanned(false);
      }
    };

    checkBanStatus();
  }, [isAuthenticated, user, config]);

  if (!config) return null;

  const categories = config.categories || [];
  const sections = config.sections || [];
  const sortedCategories = [...categories].sort((a, b) => a.order - b.order);

  const toggleCategory = (categoryId) => {
    setExpandedCategories(prev => ({
      ...prev,
      [categoryId]: !prev[categoryId]
    }));
  };

  const toggleSection = (sectionId) => {
    setExpandedSections(prev => ({
      ...prev,
      [sectionId]: !prev[sectionId]
    }));
  };

  const isPageActive = (sectionPath, pageId) => {
    const pathParts = location.pathname.split('/').filter(Boolean);
    if (pathParts.length < 2) return false;
    return pathParts[0] === sectionPath && pathParts[1] === pageId;
  };

  // Group pages by section
  const pagesBySection = pages.reduce((acc, page) => {
    if (!acc[page.section]) {
      acc[page.section] = [];
    }
    acc[page.section].push(page);
    return acc;
  }, {});

  // Sort pages within each section by order, then title
  Object.keys(pagesBySection).forEach(sectionId => {
    pagesBySection[sectionId].sort((a, b) => {
      const orderA = a.order ?? 0;
      const orderB = b.order ?? 0;
      if (orderA !== orderB) {
        return orderA - orderB;
      }
      return a.title.localeCompare(b.title);
    });
  });

  return (
    <>
      {/* Mobile overlay */}
      {sidebarOpen && (
        <div
          className="fixed inset-0 z-40 bg-black bg-opacity-50 lg:hidden"
          onClick={() => setSidebarOpen(false)}
        />
      )}

      {/* Expand button - shows when sidebar is collapsed on desktop */}
      {!sidebarOpen && (
        <button
          onClick={() => setSidebarOpen(true)}
          className="hidden lg:block fixed top-20 left-4 z-40 p-2 bg-white/90 dark:bg-gray-800/70 text-gray-700 dark:text-white border border-gray-300 dark:border-gray-700 rounded-lg hover:bg-white dark:hover:bg-gray-800/90 transition-all duration-200 shadow-lg backdrop-blur-sm"
          title="Expand sidebar"
          aria-label="Expand sidebar"
        >
          <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 5l7 7-7 7M5 5l7 7-7 7" />
          </svg>
        </button>
      )}

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-16 left-0 z-40 h-[calc(100vh-4rem)]
          flex-shrink-0 overflow-y-auto border-r border-gray-200 dark:border-gray-800
          bg-gray-50 dark:bg-gray-900 transition-all duration-200 lg:relative
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full'}
          ${isResizing ? 'select-none' : ''}
        `}
        style={{
          width: typeof window !== 'undefined' && window.innerWidth >= 1024
            ? (sidebarOpen ? `${effectiveSidebarWidth}px` : '0px')
            : `${effectiveSidebarWidth}px`
        }}
        onMouseEnter={() => setSidebarHovered(true)}
        onMouseLeave={() => setSidebarHovered(false)}
      >
        {/* Collapse button - absolute positioned in top-right, desktop only, shows on hover */}
        {sidebarHovered && (
          <button
            onClick={() => setSidebarOpen(!sidebarOpen)}
            className="hidden lg:block absolute top-[18px] right-2 z-50 p-2 text-gray-600 dark:text-gray-400 hover:bg-gray-200 dark:hover:bg-gray-800 rounded-lg transition-colors"
            title="Collapse sidebar"
            aria-label="Collapse sidebar"
          >
            <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 19l-7-7 7-7m8 14l-7-7 7-7" />
            </svg>
          </button>
        )}

        <nav className="p-4 space-y-1">
          {loading ? (
            <div className="flex items-center justify-center py-8">
              <div className="text-sm text-gray-500 dark:text-gray-400">Loading...</div>
            </div>
          ) : (
            <>
              {/* Home link */}
              <TreeNode
                icon="🏠"
                title="Home"
                path="/"
                isActive={location.pathname === '/' || location.pathname === ''}
                hasChildren={false}
                level={0}
                showTreeLines={showTreeLines}
                treeLineWidth={treeLineWidth}
                treeLineStyle={treeLineStyle}
                onNavigate={handleNavigate}
              />

              {/* Sidebar pages (e.g., Highscore) - top position only */}
              {/* Pages with showInHeader:false show in sidebar on all screens */}
              {/* Pages without showInHeader:false show in sidebar on mobile only, and in header on desktop */}
              {config.sidebar?.pages?.filter(page => page.path !== '/' && page.position !== 'bottom').map((page, index) => (
                <div key={index} className={page.showInHeader === false ? '' : 'lg:hidden'}>
                  <TreeNode
                    icon={page.icon}
                    title={page.title}
                    path={page.path}
                    isActive={location.pathname === page.path}
                    hasChildren={false}
                    level={0}
                    showTreeLines={showTreeLines}
                    treeLineWidth={treeLineWidth}
                    treeLineStyle={treeLineStyle}
                    onNavigate={handleNavigate}
                  />
                </div>
              ))}

              {/* Categories tree */}
              {sortedCategories.map((category, categoryIndex) => {
                const isExpanded = expandedCategories[category.id];
                const categorySections = sections
                  .filter(s => category.sections.includes(s.id))
                  .sort((a, b) => a.order - b.order);
                const isLastCategory = categoryIndex === sortedCategories.length - 1;

                return (
                  <div key={category.id} data-category-id={category.id}>
                    {/* Category node */}
                    <TreeNode
                      icon={category.icon}
                      title={category.title}
                      hasChildren={true}
                      isExpanded={isExpanded}
                      onToggle={() => toggleCategory(category.id)}
                      level={0}
                      isLastChild={isLastCategory}
                      showTreeLines={showTreeLines}
                      treeLineWidth={treeLineWidth}
                      treeLineStyle={treeLineStyle}
                    />

                    {/* Sections under this category */}
                    {isExpanded && categorySections.map((section, sectionIndex) => {
                      const isSectionExpanded = expandedSections[section.id];
                      const sectionPages = pagesBySection[section.id] || [];
                      const canAddPage = isAuthenticated && section.allowContributions && !userIsBanned;
                      const isLastSection = sectionIndex === categorySections.length - 1;
                      const hideTitle = section.hideTitleInSidebar;

                      // If section title is hidden, render pages directly
                      if (hideTitle) {
                        return (
                          <div key={section.id}>
                            {/* Pages directly under category (no section header) */}
                            {sectionPages.map((page, pageIndex) => {
                              const isLastPage = pageIndex === sectionPages.length - 1 && isLastSection;

                              return (
                                <TreeNode
                                  key={page.id}
                                  icon={page.icon || "📄"}
                                  title={page.isCustomRoute ? page.title : getDisplayTitle(page.pageId, page.title, autoFormatTitles)}
                                  path={page.isCustomRoute ? page.path : `/${page.section}/${page.pageId}`}
                                  isActive={page.isCustomRoute ? location.pathname === page.path : isPageActive(section.path, page.pageId)}
                                  hasChildren={false}
                                  level={1}
                                  isLastChild={isLastPage}
                                  showTreeLines={showTreeLines}
                                  treeLineWidth={treeLineWidth}
                                  treeLineStyle={treeLineStyle}
                                  onNavigate={handleNavigate}
                                />
                              );
                            })}
                          </div>
                        );
                      }

                      // Normal section rendering with title
                      return (
                        <div key={section.id}>
                          {/* Section node */}
                          <TreeNode
                            icon={section.icon}
                            title={section.title}
                            hasChildren={true}
                            isExpanded={isSectionExpanded}
                            onToggle={() => toggleSection(section.id)}
                            level={1}
                            showAddButton={canAddPage}
                            onAddClick={() => navigate(`/${section.path}/new`)}
                            isLastChild={isLastSection}
                            showTreeLines={showTreeLines}
                            treeLineWidth={treeLineWidth}
                            treeLineStyle={treeLineStyle}
                          />

                          {/* Pages under this section */}
                          {isSectionExpanded && sectionPages.map((page, pageIndex) => {
                            const isLastPage = pageIndex === sectionPages.length - 1;

                            return (
                              <TreeNode
                                key={page.id}
                                icon={page.icon || "📄"}
                                title={page.isCustomRoute ? page.title : getDisplayTitle(page.pageId, page.title, autoFormatTitles)}
                                path={page.isCustomRoute ? page.path : `/${page.section}/${page.pageId}`}
                                isActive={page.isCustomRoute ? location.pathname === page.path : isPageActive(section.path, page.pageId)}
                                hasChildren={false}
                                level={2}
                                isLastChild={isLastPage}
                                showTreeLines={showTreeLines}
                                treeLineWidth={treeLineWidth}
                                treeLineStyle={treeLineStyle}
                                onNavigate={handleNavigate}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}

              {/* Bottom sidebar pages (e.g., Guidelines, Contributing) */}
              {config.sidebar?.pages?.filter(page => page.position === 'bottom').map((page, index) => (
                <div key={index} className={page.showInHeader === false ? '' : 'lg:hidden'}>
                  <TreeNode
                    icon={page.icon}
                    title={page.title}
                    path={page.path}
                    isActive={location.pathname === page.path}
                    hasChildren={false}
                    level={0}
                    showTreeLines={showTreeLines}
                    treeLineWidth={treeLineWidth}
                    treeLineStyle={treeLineStyle}
                    onNavigate={handleNavigate}
                  />
                </div>
              ))}
            </>
          )}
        </nav>

        {/* Resize handle - positioned to the right of scrollbar */}
        <div
          className="absolute top-0 w-2 h-full cursor-col-resize hover:bg-blue-500 transition-all group z-50"
          style={{ right: '-2px' }}
          onMouseDown={(e) => {
            e.preventDefault();
            setIsResizing(true);
          }}
        >
          <div className="absolute top-1/2 -translate-y-1/2 right-0 w-4 h-16 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
            <div className="w-1 h-8 bg-blue-500 rounded-full"></div>
          </div>
        </div>
      </aside>
    </>
  );
};

export default Sidebar;
