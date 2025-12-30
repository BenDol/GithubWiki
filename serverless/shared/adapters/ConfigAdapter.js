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

import { readFileSync } from 'node:fs';
import { join } from 'node:path';

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

    // Try to load from filesystem first (works for both platforms in dev/build)
    this._configCache = this._loadFromFilesystem();

    // If filesystem load failed, use defaults
    if (!this._configCache || Object.keys(this._configCache).length === 1) {
      this._configCache = this._getDefaultConfig();
    }

    return this._configCache;
  }

  /**
   * Load config from filesystem (Netlify) or import it (Cloudflare)
   * @private
   * @returns {Object} Configuration object
   */
  _loadFromFilesystem() {
    try {
      if (this.platform === 'cloudflare') {
        // Cloudflare: Import from functions/_shared/wiki-config.json
        // This file should be copied during build from root wiki-config.json
        try {
          // Dynamic import won't work in Workers, so we need to use require or static import
          // For now, we'll need to handle this at the handler level
          const configPath = join(process.cwd(), 'functions', '_shared', 'wiki-config.json');
          return JSON.parse(readFileSync(configPath, 'utf-8'));
        } catch (cfError) {
          console.warn('[ConfigAdapter] Cloudflare config load failed, using defaults:', cfError.message);
          return this._getDefaultConfig();
        }
      }

      // Netlify: Load from filesystem
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
      wiki: {
        title: 'Wiki',
        repository: {
          owner: process.env.WIKI_REPO_OWNER || process.env.VITE_WIKI_REPO_OWNER || '',
          repo: process.env.WIKI_REPO_NAME || process.env.VITE_WIKI_REPO_NAME || '',
          branch: 'main',
          contentPath: 'public/content'
        },
        botUsername: process.env.WIKI_BOT_USERNAME || process.env.VITE_WIKI_BOT_USERNAME || ''
      },
      storage: {
        backend: 'github',
        version: 'v1',
        github: {
          owner: process.env.WIKI_REPO_OWNER || process.env.VITE_WIKI_REPO_OWNER || null,
          repo: process.env.WIKI_REPO_NAME || process.env.VITE_WIKI_REPO_NAME || null
        }
      },
      features: {
        donation: {
          enabled: true,
          badge: {
            enabled: true,
            badge: '💎',
            color: '#ffd700',
            title: 'Donator'
          }
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
