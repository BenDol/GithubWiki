/**
 * Content Renderer Registry
 * Allows parent projects to register custom content processors and components
 * for game-specific rendering (e.g., spell cards, equipment cards)
 */

let registeredProcessor = null;
let registeredComponents = {};
let registeredSpellPreview = null;
let registeredEquipmentPreview = null;

/**
 * Register a custom content processor
 * The processor function receives markdown content and returns processed content
 *
 * @param {function} processor - Content processing function
 */
export function registerContentProcessor(processor) {
  if (typeof processor !== 'function') {
    console.warn('[Content Registry] Processor must be a function');
    return;
  }
  registeredProcessor = processor;
  console.log('[Content Registry] Content processor registered');
}

/**
 * Register custom ReactMarkdown components
 * These components are merged with PageViewer's default components
 *
 * @param {object} components - Object with component overrides (e.g., { p: CustomParagraph })
 */
export function registerCustomComponents(components) {
  if (typeof components !== 'object') {
    console.warn('[Content Registry] Components must be an object');
    return;
  }
  registeredComponents = { ...components };
  console.log('[Content Registry] Custom components registered:', Object.keys(components));
}

/**
 * Get the registered content processor
 * @returns {function|null} The registered processor or null
 */
export function getContentProcessor() {
  return registeredProcessor;
}

/**
 * Get the registered custom components
 * @returns {object} The registered components
 */
export function getCustomComponents() {
  return registeredComponents;
}

/**
 * Register a spell preview renderer for SpellPicker
 * @param {function} renderer - Function that receives { spell, mode } and returns JSX
 */
export function registerSpellPreview(renderer) {
  if (typeof renderer !== 'function') {
    console.warn('[Content Registry] Spell preview renderer must be a function');
    return;
  }
  registeredSpellPreview = renderer;
  console.log('[Content Registry] Spell preview renderer registered');
}

/**
 * Get the registered spell preview renderer
 * @returns {function|null} The registered spell preview renderer or null
 */
export function getSpellPreview() {
  return registeredSpellPreview;
}

/**
 * Register an equipment preview renderer for EquipmentPicker
 * @param {function} renderer - Function that receives { equipment, mode } and returns JSX
 */
export function registerEquipmentPreview(renderer) {
  if (typeof renderer !== 'function') {
    console.warn('[Content Registry] Equipment preview renderer must be a function');
    return;
  }
  registeredEquipmentPreview = renderer;
  console.log('[Content Registry] Equipment preview renderer registered');
}

/**
 * Get the registered equipment preview renderer
 * @returns {function|null} The registered equipment preview renderer or null
 */
export function getEquipmentPreview() {
  return registeredEquipmentPreview;
}

/**
 * Clear all registrations (useful for testing)
 */
export function clearRegistry() {
  registeredProcessor = null;
  registeredComponents = {};
  registeredSpellPreview = null;
  registeredEquipmentPreview = null;
  console.log('[Content Registry] Registry cleared');
}
