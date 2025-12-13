/**
 * Data Loader Utility
 * Fetches and caches JSON data files with error handling
 */

const dataCache = new Map();

export const loadData = async (dataFile) => {
  // Check cache first
  if (dataCache.has(dataFile)) {
    return dataCache.get(dataFile);
  }

  try {
    const response = await fetch(`${import.meta.env.BASE_URL}data/${dataFile}`);

    if (!response.ok) {
      throw new Error(`Failed to load ${dataFile}: ${response.statusText}`);
    }

    const data = await response.json();

    // Validate data structure
    if (!data || typeof data !== 'object') {
      throw new Error(`Invalid data format in ${dataFile}`);
    }

    // Cache the data
    dataCache.set(dataFile, data);

    return data;
  } catch (error) {
    console.error(`Error loading data file ${dataFile}:`, error);
    throw error;
  }
};

export const clearCache = () => {
  dataCache.clear();
};

export const preloadData = async (dataFiles) => {
  const promises = dataFiles.map(file => loadData(file));
  return Promise.all(promises);
};

export default loadData;
