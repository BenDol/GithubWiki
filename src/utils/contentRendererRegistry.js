/**
 * Content Renderer Registry
 * Allows parent projects to register custom content processors and components
 * for game-specific rendering (e.g., skill cards, equipment cards)
 */

import { createLogger } from './logger.js';

const logger = createLogger('ContentRegistry');

let registeredProcessor = null;
let registeredComponents = {};
let registeredSkillPreview = null;
let registeredEquipmentPreview = null;
let registeredDataAutocompleteSearch = null;
let registeredPickers = {}; // Generic picker registry (e.g., { 'spirit': { component: SpiritPickerComponent, icon: GhostIcon, label: 'Insert Spirit' } })

/**
 * Register a custom content processor
 * The processor function receives markdown content and returns processed content
 *
 * @param {function} processor - Content processing function
 */
export function registerContentProcessor(processor) {
  if (typeof processor !== 'function') {
    logger.warn('Processor must be a function');
    return;
  }
  registeredProcessor = processor;
  logger.debug('Content processor registered');
}

/**
 * Register custom ReactMarkdown components
 * These components are merged with PageViewer's default components
 *
 * @param {object} components - Object with component overrides (e.g., { p: CustomParagraph })
 */
export function registerCustomComponents(components) {
  if (typeof components !== 'object') {
    logger.warn('Components must be an object');
    return;
  }
  registeredComponents = { ...components };
  logger.debug('Custom components registered', { components: Object.keys(components) });
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
 * Register a skill preview renderer for SkillPicker
 * @param {function} renderer - Function that receives { skill, mode } and returns JSX
 */
export function registerSkillPreview(renderer) {
  if (typeof renderer !== 'function') {
    logger.warn('Skill preview renderer must be a function');
    return;
  }
  registeredSkillPreview = renderer;
  logger.debug('Skill preview renderer registered');
}

/**
 * Get the registered skill preview renderer
 * @returns {function|null} The registered skill preview renderer or null
 */
export function getSkillPreview() {
  return registeredSkillPreview;
}

/**
 * Register an equipment preview renderer for EquipmentPicker
 * @param {function} renderer - Function that receives { equipment, mode } and returns JSX
 */
export function registerEquipmentPreview(renderer) {
  if (typeof renderer !== 'function') {
    logger.warn('Equipment preview renderer must be a function');
    return;
  }
  registeredEquipmentPreview = renderer;
  logger.debug('Equipment preview renderer registered');
}

/**
 * Get the registered equipment preview renderer
 * @returns {function|null} The registered equipment preview renderer or null
 */
export function getEquipmentPreview() {
  return registeredEquipmentPreview;
}

/**
 * Register a data autocomplete search function for {{data: syntax
 * @param {function} searchFunction - Function that receives (query, limit) and returns Promise<Array>
 */
export function registerDataAutocompleteSearch(searchFunction) {
  if (typeof searchFunction !== 'function') {
    logger.warn('Data autocomplete search must be a function');
    return;
  }
  registeredDataAutocompleteSearch = searchFunction;
  logger.debug('Data autocomplete search registered');
}

/**
 * Get the registered data autocomplete search function
 * @returns {function|null} The registered search function or null
 */
export function getDataAutocompleteSearch() {
  return registeredDataAutocompleteSearch;
}

/**
 * Register a custom picker component by name with optional metadata
 * Allows parent projects to add custom pickers without framework knowing specifics
 *
 * @param {string} name - Picker identifier (e.g., 'spirit', 'monster', etc.)
 * @param {React.Component} component - The picker component
 * @param {object} metadata - Optional metadata { icon: LucideIcon, label: string }
 */
export function registerPicker(name, component, metadata = {}) {
  if (!name || typeof name !== 'string') {
    logger.warn('Picker name must be a non-empty string');
    return;
  }
  if (!component) {
    logger.warn('Picker component is required');
    return;
  }
  registeredPickers[name] = {
    component,
    icon: metadata.icon || null,
    label: metadata.label || `Insert ${name.charAt(0).toUpperCase() + name.slice(1)}`,
    action: name,
    handler: metadata.handler || null, // Optional handler function for parent-specific logic
    renderPreview: metadata.renderPreview || null // Optional preview renderer for picker
  };
  logger.debug('Picker registered', { name, label: registeredPickers[name].label });
}

/**
 * Get a registered picker component by name
 * @param {string} name - Picker identifier
 * @returns {React.Component|null} The picker component or null
 */
export function getPicker(name) {
  const picker = registeredPickers[name];
  return picker ? picker.component : null;
}

/**
 * Check if a picker with the given name is registered
 * @param {string} name - Picker identifier
 * @returns {boolean} True if picker is registered
 */
export function hasPicker(name) {
  return name in registeredPickers;
}

/**
 * Get all registered pickers with their metadata
 * @returns {Array} Array of picker configs { name, icon, label, action, handler, renderPreview }
 */
export function getAllPickers() {
  return Object.entries(registeredPickers).map(([name, picker]) => ({
    name,
    icon: picker.icon,
    label: picker.label,
    action: picker.action,
    handler: picker.handler,
    renderPreview: picker.renderPreview
  }));
}

/**
 * Clear all registrations (useful for testing)
 */
export function clearRegistry() {
  registeredProcessor = null;
  registeredComponents = {};
  registeredSkillPreview = null;
  registeredEquipmentPreview = null;
  registeredDataAutocompleteSearch = null;
  registeredPickers = {};
  logger.debug('Registry cleared');
}
