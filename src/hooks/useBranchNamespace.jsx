import { useState, useEffect, useContext, createContext } from 'react';
import { useWikiConfig } from './useWikiConfig';
import { detectCurrentBranch, getBranchLabel } from '../services/github/branchNamespace';

const BranchContext = createContext(null);

/**
 * Branch Provider Component
 * Provides branch context to the entire application
 */
export function BranchProvider({ children }) {
  const { config } = useWikiConfig();
  const [branch, setBranch] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    async function loadBranch() {
      if (!config) {
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const detected = await detectCurrentBranch(config);
        setBranch(detected);

        console.log(`[BranchProvider] Current branch context: ${detected}`);
      } catch (err) {
        console.error('[BranchProvider] Failed to detect branch:', err);
        setError(err.message);

        // Fallback to config as last resort
        const fallback = config.wiki.repository.branch;
        setBranch(fallback);
        console.warn(`[BranchProvider] Using fallback branch: ${fallback}`);
      } finally {
        setLoading(false);
      }
    }

    loadBranch();
  }, [config]);

  const value = {
    branch,
    loading,
    error,
    branchLabel: branch ? getBranchLabel(branch) : null,
  };

  return (
    <BranchContext.Provider value={value}>
      {children}
    </BranchContext.Provider>
  );
}

/**
 * Hook to access branch namespace context
 * @returns {{ branch: string|null, loading: boolean, error: string|null, branchLabel: string|null }}
 */
export function useBranchNamespace() {
  const context = useContext(BranchContext);

  if (!context) {
    throw new Error('useBranchNamespace must be used within a BranchProvider');
  }

  return context;
}
