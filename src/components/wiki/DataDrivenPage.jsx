import React, { useState, useEffect } from 'react';
import { loadData } from '../../utils/dataLoader';
import LoadingSpinner from '../common/LoadingSpinner';

/**
 * Data-Driven Page Component
 * Loads JSON data and renders using provided render function
 */
const DataDrivenPage = ({ dataFile, renderData, fallback }) => {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const fetchData = async () => {
      try {
        setLoading(true);
        setError(null);
        const loadedData = await loadData(dataFile);
        setData(loadedData);
      } catch (err) {
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    fetchData();
  }, [dataFile]);

  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <LoadingSpinner />
      </div>
    );
  }

  if (error) {
    return (
      <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
        <h3 className="text-lg font-semibold text-red-800 dark:text-red-200 mb-2">
          Error Loading Data
        </h3>
        <p className="text-red-600 dark:text-red-300">{error}</p>
        {fallback && (
          <div className="mt-4">
            {fallback}
          </div>
        )}
      </div>
    );
  }

  if (!data) {
    return (
      <div className="bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-6">
        <p className="text-gray-600 dark:text-gray-400">No data available</p>
      </div>
    );
  }

  return renderData(data);
};

export default DataDrivenPage;
