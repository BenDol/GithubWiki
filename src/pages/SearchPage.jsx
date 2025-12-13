import { useState, useEffect } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { useSearch, performSearch, getAllTags, filterByTag } from '../hooks/useSearch';
import TagFilter from '../components/wiki/TagFilter';
import SearchResults from '../components/search/SearchResults';
import LoadingSpinner from '../components/common/LoadingSpinner';

/**
 * Search page component
 * Full-page search with filters and tag browsing
 */
const SearchPage = () => {
  const [searchParams, setSearchParams] = useSearchParams();
  const navigate = useNavigate();

  const [query, setQuery] = useState(searchParams.get('q') || '');
  const [selectedTag, setSelectedTag] = useState(searchParams.get('tag') || null);
  const [results, setResults] = useState([]);

  const { searchIndex, fuse, loading, error } = useSearch();

  // Get all available tags
  const allTags = getAllTags(searchIndex);

  // Perform search when query or filters change
  useEffect(() => {
    if (!fuse && !selectedTag) {
      setResults([]);
      return;
    }

    let searchResults = [];

    // If there's a query, search for it
    if (query && query.length >= 2 && fuse) {
      searchResults = performSearch(fuse, query);
    } else if (searchIndex) {
      // No query, show all pages
      searchResults = searchIndex.map(item => ({ ...item, score: 0 }));
    }

    // Apply tag filter if selected
    if (selectedTag) {
      searchResults = filterByTag(searchResults, selectedTag);
    }

    setResults(searchResults);
  }, [query, selectedTag, fuse, searchIndex]);

  // Update URL when query or tag changes
  useEffect(() => {
    const params = {};
    if (query) params.q = query;
    if (selectedTag) params.tag = selectedTag;
    setSearchParams(params);
  }, [query, selectedTag, setSearchParams]);

  // Scroll to top when search page loads
  useEffect(() => {
    if (!loading) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [loading]);

  const handleResultClick = (result) => {
    navigate(result.url.replace('/#', ''));
  };

  const handleTagSelect = (tag) => {
    setSelectedTag(tag);
  };

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading search index...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="max-w-4xl mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <h2 className="text-xl font-semibold text-red-900 dark:text-red-200 mb-2">
            Search Unavailable
          </h2>
          <p className="text-red-700 dark:text-red-300">
            {error}
          </p>
          <p className="text-sm text-red-600 dark:text-red-400 mt-2">
            Try running <code className="px-2 py-1 bg-red-100 dark:bg-red-900 rounded">npm run build:search</code> to build the search index.
          </p>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
          Search
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400">
          Search across all documentation or browse by tag
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        {/* Sidebar - Filters */}
        <aside className="lg:col-span-1">
          <div className="sticky top-20 space-y-6">
            {/* Tag filter */}
            <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700 p-4">
              <TagFilter
                tags={allTags}
                selectedTag={selectedTag}
                onTagSelect={handleTagSelect}
              />
            </div>

            {/* Stats */}
            {searchIndex && (
              <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
                <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-2">
                  Search Index
                </h3>
                <div className="space-y-1 text-sm text-gray-700 dark:text-gray-300">
                  <div className="flex items-center justify-between">
                    <span>Total pages:</span>
                    <span className="font-medium">{searchIndex.length}</span>
                  </div>
                  <div className="flex items-center justify-between">
                    <span>Tags:</span>
                    <span className="font-medium">{allTags.length}</span>
                  </div>
                  {selectedTag && (
                    <div className="flex items-center justify-between">
                      <span>Filtered:</span>
                      <span className="font-medium">{results.length}</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </aside>

        {/* Main content - Search */}
        <div className="lg:col-span-3">
          {/* Search input */}
          <div className="mb-6">
            <div className="relative">
              <div className="absolute inset-y-0 left-0 pl-3 flex items-center pointer-events-none">
                <svg className="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                </svg>
              </div>
              <input
                type="text"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search documentation..."
                className="block w-full pl-10 pr-3 py-3 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              {query && (
                <button
                  onClick={() => setQuery('')}
                  className="absolute inset-y-0 right-0 pr-3 flex items-center"
                >
                  <svg className="w-5 h-5 text-gray-400 hover:text-gray-600 dark:hover:text-gray-300" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                  </svg>
                </button>
              )}
            </div>

            {/* Active filters */}
            {(query || selectedTag) && (
              <div className="flex items-center space-x-2 mt-3">
                <span className="text-sm text-gray-600 dark:text-gray-400">Active filters:</span>
                {query && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200">
                    Query: "{query}"
                    <button
                      onClick={() => setQuery('')}
                      className="ml-2 hover:text-blue-900 dark:hover:text-blue-100"
                    >
                      ×
                    </button>
                  </span>
                )}
                {selectedTag && (
                  <span className="inline-flex items-center px-3 py-1 rounded-full text-sm bg-green-100 dark:bg-green-900 text-green-800 dark:text-green-200">
                    Tag: {selectedTag}
                    <button
                      onClick={() => setSelectedTag(null)}
                      className="ml-2 hover:text-green-900 dark:hover:text-green-100"
                    >
                      ×
                    </button>
                  </span>
                )}
              </div>
            )}
          </div>

          {/* Results */}
          <div className="bg-white dark:bg-gray-800 rounded-lg border border-gray-200 dark:border-gray-700">
            {results.length === 0 ? (
              <div className="p-12 text-center text-gray-500 dark:text-gray-400">
                {query || selectedTag ? (
                  <>
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9.172 16.172a4 4 0 015.656 0M9 10h.01M15 10h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
                    </svg>
                    <p className="text-lg font-medium mb-2">No results found</p>
                    <p className="text-sm">
                      Try adjusting your search query or filters
                    </p>
                  </>
                ) : (
                  <>
                    <svg className="w-16 h-16 mx-auto mb-4 text-gray-300 dark:text-gray-600" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
                    </svg>
                    <p className="text-lg font-medium mb-2">Start searching</p>
                    <p className="text-sm">
                      Enter a search query or select a tag to browse content
                    </p>
                  </>
                )}
              </div>
            ) : (
              <>
                <div className="p-4 border-b border-gray-200 dark:border-gray-700">
                  <p className="text-sm text-gray-600 dark:text-gray-400">
                    Found <span className="font-semibold text-gray-900 dark:text-white">{results.length}</span> {results.length === 1 ? 'result' : 'results'}
                  </p>
                </div>
                <SearchResults
                  results={results}
                  query={query}
                  onResultClick={handleResultClick}
                />
              </>
            )}
          </div>
        </div>
      </div>
    </div>
  );
};

export default SearchPage;
