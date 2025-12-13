import { useState, useEffect } from 'react';
import { Link, useLocation, useNavigate } from 'react-router-dom';
import { useUIStore } from '../../store/uiStore';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useAuthStore } from '../../store/authStore';
import { getDisplayTitle } from '../../utils/textUtils';

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
  treeLineStyle = 'solid'
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
            className="absolute right-2 top-1/2 -translate-y-1/2 z-10 p-1.5 text-blue-500 hover:text-blue-600 dark:text-blue-400 dark:hover:text-blue-300 hover:bg-blue-50 dark:hover:bg-blue-900/20 rounded transition-colors bg-white dark:bg-gray-900"
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
  const { isAuthenticated } = useAuthStore();

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

  // Sidebar width state (default 256px = w-64)
  const [sidebarWidth, setSidebarWidth] = useState(() => {
    const stored = localStorage.getItem('sidebarWidth');
    return stored ? parseInt(stored, 10) : 256;
  });
  const [isResizing, setIsResizing] = useState(false);

  const autoFormatTitles = config?.features?.autoFormatPageTitles ?? false;

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
          setPages(searchIndex.filter(page => page.pageId !== 'index'));
        }
      } catch (err) {
        console.error('Failed to load pages for sidebar:', err);
      } finally {
        setLoading(false);
      }
    };

    loadPages();
  }, []);

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
      // Save to localStorage
      localStorage.setItem('sidebarWidth', sidebarWidth.toString());
      // Remove cursor styles
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

  // Sort pages within each section
  Object.keys(pagesBySection).forEach(sectionId => {
    pagesBySection[sectionId].sort((a, b) => a.title.localeCompare(b.title));
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

      {/* Sidebar */}
      <aside
        className={`
          fixed lg:sticky top-16 left-0 z-40 h-[calc(100vh-4rem)] relative
          flex-shrink-0 overflow-y-auto border-r border-gray-200 dark:border-gray-800
          bg-white dark:bg-gray-900 transition-transform duration-200
          ${sidebarOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'}
          ${isResizing ? 'select-none' : ''}
        `}
        style={{ width: `${sidebarWidth}px` }}
      >
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
              />

              {/* Categories tree */}
              {sortedCategories.map((category, categoryIndex) => {
                const isExpanded = expandedCategories[category.id];
                const categorySections = sections
                  .filter(s => category.sections.includes(s.id))
                  .sort((a, b) => a.order - b.order);
                const isLastCategory = categoryIndex === sortedCategories.length - 1;

                return (
                  <div key={category.id}>
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
                      const canAddPage = isAuthenticated && section.allowContributions;
                      const isLastSection = sectionIndex === categorySections.length - 1;

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
                                icon="📄"
                                title={getDisplayTitle(page.pageId, page.title, autoFormatTitles)}
                                path={`/${page.section}/${page.pageId}`}
                                isActive={isPageActive(section.path, page.pageId)}
                                hasChildren={false}
                                level={2}
                                isLastChild={isLastPage}
                                showTreeLines={showTreeLines}
                                treeLineWidth={treeLineWidth}
                                treeLineStyle={treeLineStyle}
                              />
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                );
              })}
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
