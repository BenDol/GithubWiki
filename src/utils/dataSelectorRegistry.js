/**
 * Data Selector Registry - Registry for data selector component
 * Allows parent projects to provide custom data selector UI for page editor
 */

let dataSelectorComponent = null;

/**
 * Register a data selector component
 * @param {React.Component} component - Data selector component
 */
export const registerDataSelector = (component) => {
  dataSelectorComponent = component;
};

/**
 * Get the registered data selector component
 * @returns {React.Component|null} Data selector component or null
 */
export const getDataSelector = () => {
  return dataSelectorComponent;
};

/**
 * Check if a data selector has been registered
 * @returns {boolean} True if data selector is available
 */
export const hasDataSelector = () => {
  return dataSelectorComponent !== null;
};
