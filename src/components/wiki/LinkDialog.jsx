import React, { useState, useEffect, useRef } from 'react';
import { X, Link, Search, FileText } from 'lucide-react';

/**
 * LinkDialog - Modal dialog for inserting links
 *
 * Allows users to enter link text and URL, or select from wiki pages
 */
const LinkDialog = ({ isOpen, onClose, onInsert, selectedText = '' }) => {
  const [linkText, setLinkText] = useState('');
  const [linkUrl, setLinkUrl] = useState('');
  const [activeTab, setActiveTab] = useState('manual'); // 'manual' or 'wiki-pages'
  const [wikiPages, setWikiPages] = useState([]);
  const [filteredPages, setFilteredPages] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loadingPages, setLoadingPages] = useState(false);
  const textInputRef = useRef(null);
  const urlInputRef = useRef(null);
  const searchInputRef = useRef(null);

  // Initialize with selected text
  useEffect(() => {
    if (isOpen) {
      setLinkText(selectedText);
      setLinkUrl('');
      setSearchQuery('');
      setActiveTab('manual');
      // Focus appropriate field after render
      setTimeout(() => {
        if (selectedText) {
          urlInputRef.current?.focus();
        } else {
          textInputRef.current?.focus();
        }
      }, 100);
    }
  }, [isOpen, selectedText]);

  // Load wiki pages from search index
  useEffect(() => {
    if (isOpen && wikiPages.length === 0) {
      setLoadingPages(true);
      fetch('/search-index.json')
        .then(res => res.json())
        .then(pages => {
          setWikiPages(pages);
          setFilteredPages(pages);
        })
        .catch(err => {
          console.error('Failed to load wiki pages:', err);
        })
        .finally(() => {
          setLoadingPages(false);
        });
    }
  }, [isOpen]);

  // Filter pages based on search query
  useEffect(() => {
    if (!searchQuery.trim()) {
      setFilteredPages(wikiPages);
      return;
    }

    const query = searchQuery.toLowerCase();
    const filtered = wikiPages.filter(page => {
      return (
        page.title.toLowerCase().includes(query) ||
        page.description?.toLowerCase().includes(query) ||
        page.section?.toLowerCase().includes(query) ||
        page.sectionTitle?.toLowerCase().includes(query)
      );
    });
    setFilteredPages(filtered);
  }, [searchQuery, wikiPages]);

  // Handle escape key
  useEffect(() => {
    if (!isOpen) return;

    const handleEscape = (e) => {
      if (e.key === 'Escape') {
        onClose?.();
      } else if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
        handleInsert();
      }
    };

    document.addEventListener('keydown', handleEscape);
    return () => document.removeEventListener('keydown', handleEscape);
  }, [isOpen, linkText, linkUrl]);

  const handleInsert = () => {
    if (!linkText.trim() || !linkUrl.trim()) return;
    onInsert?.(linkText, linkUrl);
    onClose?.();
  };

  const handlePageSelect = (page) => {
    setLinkText(page.title);
    setLinkUrl(page.url);
    setActiveTab('manual');
    // Focus URL field so user can see/edit the selected link
    setTimeout(() => {
      urlInputRef.current?.focus();
    }, 100);
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black bg-opacity-50"
        onClick={onClose}
      />

      {/* Dialog */}
      <div className="relative bg-white dark:bg-gray-800 rounded-lg shadow-2xl w-full max-w-2xl border border-gray-200 dark:border-gray-700">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-gray-200 dark:border-gray-700">
          <div className="flex items-center gap-2">
            <Link className="w-5 h-5 text-blue-600" />
            <h2 className="text-lg font-semibold text-gray-900 dark:text-white">
              Insert Link
            </h2>
          </div>
          <button
            onClick={onClose}
            className="p-1 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
            aria-label="Close"
          >
            <X className="w-5 h-5 text-gray-500 dark:text-gray-400" />
          </button>
        </div>

        {/* Tabs */}
        <div className="flex border-b border-gray-200 dark:border-gray-700">
          <button
            onClick={() => setActiveTab('manual')}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'manual'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <Link className="w-4 h-4" />
              Manual Entry
            </div>
          </button>
          <button
            onClick={() => {
              setActiveTab('wiki-pages');
              setTimeout(() => searchInputRef.current?.focus(), 100);
            }}
            className={`flex-1 px-4 py-3 text-sm font-medium transition-colors ${
              activeTab === 'wiki-pages'
                ? 'text-blue-600 dark:text-blue-400 border-b-2 border-blue-600 dark:border-blue-400'
                : 'text-gray-500 dark:text-gray-400 hover:text-gray-700 dark:hover:text-gray-300'
            }`}
          >
            <div className="flex items-center justify-center gap-2">
              <FileText className="w-4 h-4" />
              Wiki Pages
            </div>
          </button>
        </div>

        {/* Content */}
        <div className="p-4">
          {activeTab === 'manual' ? (
            <div className="space-y-4">
              {/* Link Text */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  Link Text
                </label>
                <input
                  ref={textInputRef}
                  type="text"
                  value={linkText}
                  onChange={(e) => setLinkText(e.target.value)}
                  placeholder="Enter text to display"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>

              {/* Link URL */}
              <div>
                <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
                  URL
                </label>
                <input
                  ref={urlInputRef}
                  type="url"
                  value={linkUrl}
                  onChange={(e) => setLinkUrl(e.target.value)}
                  placeholder="https://example.com or /section/page"
                  className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Press Ctrl+Enter to insert
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {/* Search Bar */}
              <div className="relative">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
                <input
                  ref={searchInputRef}
                  type="text"
                  value={searchQuery}
                  onChange={(e) => setSearchQuery(e.target.value)}
                  placeholder="Search wiki pages..."
                  className="w-full pl-10 pr-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 bg-white dark:bg-gray-700 text-gray-900 dark:text-white text-sm"
                />
              </div>

              {/* Pages List */}
              <div className="max-h-96 overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg">
                {loadingPages ? (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    Loading wiki pages...
                  </div>
                ) : filteredPages.length === 0 ? (
                  <div className="p-8 text-center text-gray-500 dark:text-gray-400">
                    {searchQuery ? 'No pages found' : 'No pages available'}
                  </div>
                ) : (
                  <div className="divide-y divide-gray-200 dark:divide-gray-700">
                    {filteredPages.map((page) => (
                      <button
                        key={page.id}
                        onClick={() => handlePageSelect(page)}
                        className="w-full px-4 py-3 text-left hover:bg-gray-50 dark:hover:bg-gray-700 transition-colors"
                      >
                        <div className="flex items-start gap-3">
                          <FileText className="w-4 h-4 text-blue-600 dark:text-blue-400 mt-1 flex-shrink-0" />
                          <div className="flex-1 min-w-0">
                            <div className="font-medium text-gray-900 dark:text-white text-sm">
                              {page.title}
                            </div>
                            {page.description && (
                              <div className="text-xs text-gray-500 dark:text-gray-400 mt-1 line-clamp-2">
                                {page.description}
                              </div>
                            )}
                            <div className="text-xs text-gray-400 dark:text-gray-500 mt-1">
                              {page.sectionTitle || page.section}
                            </div>
                          </div>
                        </div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              <p className="text-xs text-gray-500 dark:text-gray-400">
                Click a page to auto-fill the link fields
              </p>
            </div>
          )}
        </div>

        {/* Footer */}
        <div className="flex items-center justify-end gap-2 p-4 border-t border-gray-200 dark:border-gray-700 bg-gray-50 dark:bg-gray-900">
          <button
            onClick={onClose}
            className="px-4 py-2 text-sm font-medium text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-700 rounded-lg transition-colors"
          >
            Cancel
          </button>
          <button
            onClick={handleInsert}
            disabled={!linkText.trim() || !linkUrl.trim()}
            className="px-4 py-2 text-sm font-medium text-white bg-blue-500 hover:bg-blue-600 rounded-lg transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            Insert Link
          </button>
        </div>
      </div>
    </div>
  );
};

export default LinkDialog;
