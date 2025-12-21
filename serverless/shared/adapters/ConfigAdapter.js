/**
 * Config Adapter
 *
 * Abstracts configuration loading between Netlify and Cloudflare
 *
 * How Config Loading Works:
 * -------------------------
 * 1. PRODUCTION (Parent Project):
 *    - Netlify: Loads from process.cwd() + '/wiki-config.json'
 *    - Cloudflare: Uses embedded defaults with env overrides
 *    - Config file: ../../../wiki-config.json (parent's config)
 *
 * 2. FRAMEWORK TESTS:
 *    - Netlify tests: Loads from wiki-framework/wiki-config.json
 *    - Cloudflare tests: Uses test defaults
 *    - Config file: wiki-config.json (framework test config)
 *
 * The framework's wiki-config.json is ONLY for testing.
 * See CONFIG.md for full documentation.
 */

import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Configuration Adapter
 * Abstracts config loading differences between platforms
 */
export class ConfigAdapter {
  constructor(platform) {
    this.platform = platform;
    this._configCache = null;
  }

  /**
   * Get wiki configuration
   * @returns {Object} Wiki configuration object
   */
  getWikiConfig() {
    if (this._configCache) {
      return this._configCache;
    }

    if (this.platform === 'netlify') {
      // Netlify - load from filesystem
      this._configCache = this._loadFromFilesystem();
    } else {
      // Cloudflare - config must be embedded at build time or use defaults
      // For now, return default config with runtime overrides
      this._configCache = this._getDefaultConfig();
    }

    return this._configCache;
  }

  /**
   * Load config from filesystem (Netlify)
   * @private
   * @returns {Object} Configuration object
   */
  _loadFromFilesystem() {
    try {
      const configPath = join(process.cwd(), 'wiki-config.json');
      return JSON.parse(readFileSync(configPath, 'utf-8'));
    } catch (error) {
      console.warn('[ConfigAdapter] Failed to load wiki-config.json:', error.message);
      return this._getDefaultConfig();
    }
  }

  /**
   * Get default configuration (fallback)
   * @private
   * @returns {Object} Default configuration object
   */
  _getDefaultConfig() {
    return {
      storage: {
        backend: 'github',
        version: 'v1',
        github: {
          owner: null, // Will be set from env
          repo: null   // Will be set from env
        }
      }
    };
  }

  /**
   * Get storage configuration with runtime overrides
   * @param {PlatformAdapter} adapter - Platform adapter for env access
   * @returns {Object} Storage configuration
   */
  getStorageConfig(adapter) {
    const config = this.getWikiConfig();
    const owner = adapter.getEnv('WIKI_REPO_OWNER') || adapter.getEnv('VITE_WIKI_REPO_OWNER');
    const repo = adapter.getEnv('WIKI_REPO_NAME') || adapter.getEnv('VITE_WIKI_REPO_NAME');

    // For Cloudflare, check for KV namespace binding
    if (this.platform === 'cloudflare' && adapter.hasEnv('SLAYER_WIKI_DATA')) {
      return {
        backend: 'cloudflare-kv',
        version: 'v1',
        cloudflareKV: {
          namespace: adapter.getEnv('SLAYER_WIKI_DATA')
        }
      };
    }

    // Default to GitHub backend with runtime repo info
    return {
      ...config.storage,
      github: {
        ...config.storage?.github,
        owner: owner || config.storage?.github?.owner,
        repo: repo || config.storage?.github?.repo
      }
    };
  }
}
