import { useTableOfContents } from '../../hooks/useTableOfContents';
import clsx from 'clsx';

/**
 * Table of Contents component with active section highlighting
 * Displays heading hierarchy and scrolls to sections on click
 */
const TableOfContents = ({ content }) => {
  const { headings, activeId } = useTableOfContents(content);

  if (headings.length === 0) return null;

  const handleClick = (e, slug) => {
    e.preventDefault();
    const element = document.getElementById(slug);
    if (element) {
      element.scrollIntoView({ behavior: 'smooth', block: 'start' });
      // Update URL hash without triggering navigation
      window.history.pushState(null, '', `#${slug}`);
    }
  };

  return (
    <nav className="sticky top-20 max-h-[calc(100vh-6rem)] overflow-y-auto">
      <div className="mb-4">
        <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3 flex items-center">
          <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 6h16M4 12h16M4 18h7" />
          </svg>
          On this page
        </h3>
      </div>

      <ul className="space-y-2 text-sm">
        {headings.map((heading) => {
          const isActive = activeId === heading.slug;
          const indent = (heading.level - 1) * 12; // 12px per level

          return (
            <li
              key={heading.slug}
              style={{ paddingLeft: `${indent}px` }}
            >
              <a
                href={`#${heading.slug}`}
                onClick={(e) => handleClick(e, heading.slug)}
                className={clsx(
                  'block py-1 px-2 rounded transition-colors border-l-2',
                  isActive
                    ? 'border-blue-500 text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-900/20 font-medium'
                    : 'border-transparent text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white hover:border-gray-300 dark:hover:border-gray-600'
                )}
              >
                {heading.text}
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
};

export default TableOfContents;
