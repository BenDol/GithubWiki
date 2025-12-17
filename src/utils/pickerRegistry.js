/**
 * Picker Registry - Registry system for custom content pickers in the editor
 *
 * Allows parent projects to register custom picker components (e.g., SpiritPicker)
 * that will be available in the PageEditor toolbar.
 *
 * This enables the framework to remain generic while supporting
 * game-specific picker components without hard dependencies.
 */

let spiritPicker = null;

/**
 * Register a Spirit picker component
 * @param {React.Component} component - The Spirit picker component
 */
export const registerSpiritPicker = (component) => {
  spiritPicker = component;
  console.log('[Picker Registry] Spirit picker registered');
};

/**
 * Get the registered Spirit picker component
 * @returns {React.Component|null} The Spirit picker component or null if not registered
 */
export const getSpiritPicker = () => {
  return spiritPicker;
};

/**
 * Check if a Spirit picker is registered
 * @returns {boolean} True if Spirit picker is registered
 */
export const hasSpiritPicker = () => {
  return spiritPicker !== null;
};
