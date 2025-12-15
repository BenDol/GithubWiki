import { useEffect } from 'react';
import { useConfigStore } from '../store/configStore';

/**
 * Hook to load and access wiki configuration
 * This is the foundation of the entire app - loads config from wiki-config.json
 * Now uses centralized caching to prevent redundant fetches
 */
export const useWikiConfig = () => {
  const { config, loading, error, loadConfig } = useConfigStore();

  useEffect(() => {
    // Load config on mount (will use cache if available)
    loadConfig().catch(err => {
      console.error('[useWikiConfig] Failed to load config:', err);
    });
  }, [loadConfig]);

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

/**
 * Hook to manually refresh the config (bypasses cache)
 * Useful during development or when config changes are detected
 */
export const useConfigRefresh = () => {
  const refreshConfig = useConfigStore(state => state.refreshConfig);
  return refreshConfig;
};
