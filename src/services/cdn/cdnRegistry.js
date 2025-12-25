/**
 * CDN Registry
 * Manages available CDN providers and allows registration of custom implementations
 */

import { createLogger } from '../../utils/logger';
import GitHubCDNProvider from './GitHubCDNProvider';

const logger = createLogger('CDNRegistry');

class CDNRegistry {
  constructor() {
    this.providers = new Map();
    this.activeProvider = null;

    // Register default providers
    this._registerDefaultProviders();
  }

  /**
   * Register default CDN providers
   * @private
   */
  _registerDefaultProviders() {
    this.register('github', GitHubCDNProvider);
    logger.debug('Default CDN providers registered', {
      providers: Array.from(this.providers.keys()),
    });
  }

  /**
   * Register a CDN provider
   *
   * @param {string} name - Provider name (e.g., 'github', 'cloudflare-r2')
   * @param {Class} ProviderClass - CDN provider class (must extend CDNProvider)
   */
  register(name, ProviderClass) {
    if (typeof name !== 'string' || !name) {
      throw new Error('Provider name must be a non-empty string');
    }

    if (typeof ProviderClass !== 'function') {
      throw new Error('ProviderClass must be a class constructor');
    }

    this.providers.set(name, ProviderClass);
    logger.debug('CDN provider registered', { name, class: ProviderClass.name });
  }

  /**
   * Get a CDN provider by name
   *
   * @param {string} name - Provider name
   * @returns {Class|null} Provider class or null if not found
   */
  get(name) {
    return this.providers.get(name) || null;
  }

  /**
   * Check if a provider is registered
   *
   * @param {string} name - Provider name
   * @returns {boolean} True if provider exists
   */
  has(name) {
    return this.providers.has(name);
  }

  /**
   * Get list of all registered provider names
   *
   * @returns {Array<string>} Provider names
   */
  list() {
    return Array.from(this.providers.keys());
  }

  /**
   * Initialize and set the active CDN provider from config
   *
   * @param {Object} config - Wiki config with CDN settings
   * @returns {CDNProvider} Initialized CDN provider instance
   * @throws {Error} If provider not found or config invalid
   */
  initialize(config) {
    // Validate config
    if (!config?.features?.contentCreators?.videoGuides?.cdn) {
      throw new Error('CDN configuration missing in wiki config');
    }

    const cdnConfig = config.features.contentCreators.videoGuides.cdn;
    const providerName = cdnConfig.provider;

    if (!providerName) {
      throw new Error('CDN provider not specified in config');
    }

    // Get provider class
    const ProviderClass = this.get(providerName);
    if (!ProviderClass) {
      throw new Error(
        `CDN provider '${providerName}' not found. Available: ${this.list().join(', ')}`
      );
    }

    // Initialize provider with config
    try {
      this.activeProvider = new ProviderClass(cdnConfig);
      logger.info('CDN provider initialized', {
        provider: providerName,
        class: ProviderClass.name,
      });
      return this.activeProvider;
    } catch (error) {
      logger.error('Failed to initialize CDN provider', {
        provider: providerName,
        error: error.message,
      });
      throw new Error(`Failed to initialize CDN provider '${providerName}': ${error.message}`);
    }
  }

  /**
   * Get the active CDN provider instance
   * Must call initialize() first
   *
   * @returns {CDNProvider|null} Active provider or null if not initialized
   */
  getActive() {
    return this.activeProvider;
  }

  /**
   * Reset the registry (useful for testing)
   */
  reset() {
    this.providers.clear();
    this.activeProvider = null;
    this._registerDefaultProviders();
    logger.debug('CDN registry reset');
  }
}

// Export singleton instance
const cdnRegistry = new CDNRegistry();
export default cdnRegistry;

// Also export the class for testing
export { CDNRegistry };
