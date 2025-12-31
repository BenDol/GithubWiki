import { createContext, useContext, useState, useCallback } from 'react';

/**
 * Layout Context - Allows pages to customize their container styling
 */
const LayoutContext = createContext(null);

/**
 * Hook to access layout customization
 */
export const useLayout = () => {
  const context = useContext(LayoutContext);
  if (!context) {
    throw new Error('useLayout must be used within LayoutProvider');
  }
  return context;
};

/**
 * Layout Provider - Wraps the app to provide layout customization
 */
export const LayoutProvider = ({ children }) => {
  const [containerClasses, setContainerClasses] = useState('px-4 sm:px-4');
  const [maxWidthClass, setMaxWidthClass] = useState('max-w-7xl');
  const [marginClass, setMarginClass] = useState('mx-auto');

  /**
   * Set custom container padding classes
   * @param {string} classes - Tailwind padding classes (e.g., 'px-2', 'px-0')
   */
  const setContainerPadding = useCallback((classes) => {
    setContainerClasses(classes);
  }, []);

  /**
   * Reset to default padding
   */
  const resetContainerPadding = useCallback(() => {
    setContainerClasses('px-4 sm:px-4');
  }, []);

  /**
   * Set custom max-width class
   * @param {string} maxWidth - Tailwind max-width class (e.g., 'max-w-full', 'max-w-7xl')
   */
  const setContainerMaxWidth = useCallback((maxWidth) => {
    setMaxWidthClass(maxWidth);
  }, []);

  /**
   * Reset to default max-width
   */
  const resetContainerMaxWidth = useCallback(() => {
    setMaxWidthClass('max-w-7xl');
  }, []);

  /**
   * Set custom margin class
   * @param {string} margin - Tailwind margin class (e.g., 'mx-auto', 'mx-4', 'mx-8')
   */
  const setContainerMargin = useCallback((margin) => {
    setMarginClass(margin);
  }, []);

  /**
   * Reset to default margin
   */
  const resetContainerMargin = useCallback(() => {
    setMarginClass('mx-auto');
  }, []);

  const value = {
    containerClasses,
    maxWidthClass,
    marginClass,
    setContainerPadding,
    resetContainerPadding,
    setContainerMaxWidth,
    resetContainerMaxWidth,
    setContainerMargin,
    resetContainerMargin,
  };

  return (
    <LayoutContext.Provider value={value}>
      {children}
    </LayoutContext.Provider>
  );
};
