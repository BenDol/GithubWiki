import React, { useState, useMemo } from 'react';

const SortableTable = ({ data, columns, pageSize = 20 }) => {
  const [sortKey, setSortKey] = useState(null);
  const [sortOrder, setSortOrder] = useState('asc');
  const [filterText, setFilterText] = useState('');
  const [currentPage, setCurrentPage] = useState(1);

  const handleSort = (key) => {
    if (sortKey === key) {
      setSortOrder(sortOrder === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortOrder('asc');
    }
  };

  const filteredAndSortedData = useMemo(() => {
    let result = [...data];

    // Filter
    if (filterText) {
      result = result.filter((row) =>
        columns.some((col) => {
          const value = row[col.key];
          return value && value.toString().toLowerCase().includes(filterText.toLowerCase());
        })
      );
    }

    // Sort
    if (sortKey) {
      result.sort((a, b) => {
        const aVal = a[sortKey];
        const bVal = b[sortKey];

        if (typeof aVal === 'number' && typeof bVal === 'number') {
          return sortOrder === 'asc' ? aVal - bVal : bVal - aVal;
        }

        const aStr = aVal ? aVal.toString().toLowerCase() : '';
        const bStr = bVal ? bVal.toString().toLowerCase() : '';

        if (sortOrder === 'asc') {
          return aStr.localeCompare(bStr);
        } else {
          return bStr.localeCompare(aStr);
        }
      });
    }

    return result;
  }, [data, sortKey, sortOrder, filterText, columns]);

  const totalPages = Math.ceil(filteredAndSortedData.length / pageSize);
  const startIndex = (currentPage - 1) * pageSize;
  const paginatedData = filteredAndSortedData.slice(startIndex, startIndex + pageSize);

  return (
    <div>
      <div className="mb-4">
        <input
          type="text"
          placeholder="Search..."
          value={filterText}
          onChange={(e) => {
            setFilterText(e.target.value);
            setCurrentPage(1);
          }}
          className="w-full md:w-64 px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 focus:ring-2 focus:ring-blue-500"
        />
      </div>

      <div className="overflow-x-auto">
        <table className="w-full border-collapse">
          <thead>
            <tr className="bg-gray-100 dark:bg-gray-700">
              {columns.map((col) => (
                <th
                  key={col.key}
                  onClick={() => handleSort(col.key)}
                  className="px-4 py-3 text-left text-sm font-semibold cursor-pointer hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
                >
                  <div className="flex items-center gap-2">
                    {col.label}
                    {sortKey === col.key && (
                      <span>{sortOrder === 'asc' ? '↑' : '↓'}</span>
                    )}
                  </div>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {paginatedData.map((row, index) => (
              <tr
                key={index}
                className="border-b border-gray-200 dark:border-gray-700 hover:bg-gray-50 dark:hover:bg-gray-800 transition-colors"
              >
                {columns.map((col) => (
                  <td key={col.key} className="px-4 py-3 text-sm">
                    {col.render ? col.render(row[col.key], row) : row[col.key]}
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {totalPages > 1 && (
        <div className="mt-4 flex items-center justify-between">
          <div className="text-sm text-gray-600 dark:text-gray-400">
            Showing {startIndex + 1}-{Math.min(startIndex + pageSize, filteredAndSortedData.length)} of{' '}
            {filteredAndSortedData.length}
          </div>
          <div className="flex gap-2">
            <button
              onClick={() => setCurrentPage(currentPage - 1)}
              disabled={currentPage === 1}
              className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Previous
            </button>
            <span className="px-4 py-2">
              Page {currentPage} of {totalPages}
            </span>
            <button
              onClick={() => setCurrentPage(currentPage + 1)}
              disabled={currentPage === totalPages}
              className="px-4 py-2 rounded-lg bg-gray-200 dark:bg-gray-700 disabled:opacity-50 disabled:cursor-not-allowed hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors"
            >
              Next
            </button>
          </div>
        </div>
      )}
    </div>
  );
};

export default SortableTable;
