import { useState, useEffect } from 'react';

/**
 * Hook to load and access wiki configuration
 * This is the foundation of the entire app - loads config from wiki-config.json
 */
export const useWikiConfig = () => {
  const [config, setConfig] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    const loadConfig = async () => {
      try {
        setLoading(true);
        const response = await fetch('/wiki-config.json');

        if (!response.ok) {
          throw new Error('Failed to load wiki configuration');
        }

        const data = await response.json();

        // Validate required fields
        if (!data.wiki || !data.sections) {
          throw new Error('Invalid wiki configuration format');
        }

        // Sort sections by order
        data.sections.sort((a, b) => a.order - b.order);

        setConfig(data);
        setError(null);
      } catch (err) {
        console.error('Error loading wiki config:', err);
        setError(err.message);
      } finally {
        setLoading(false);
      }
    };

    loadConfig();
  }, []);

  return { config, loading, error };
};

/**
 * Get sections that should be displayed in the header
 */
export const useHeaderSections = () => {
  const { config } = useWikiConfig();

  if (!config) return [];

  return config.sections.filter(section => section.showInHeader);
};

/**
 * Get a specific section by ID
 */
export const useSection = (sectionId) => {
  const { config } = useWikiConfig();

  if (!config) return null;

  return config.sections.find(section => section.id === sectionId);
};

/**
 * Check if a feature is enabled
 */
export const useFeature = (featureName) => {
  const { config } = useWikiConfig();

  if (!config || !config.features) return false;

  return config.features[featureName] === true;
};
