/**
 * Storage Factory
 *
 * Creates generic storage adapters based on configuration.
 * This factory is framework-level and contains NO wiki-specific business logic.
 *
 * The parent project:
 * - Configures which backend to use
 * - Provides environment variables/bindings
 * - Handles all business logic on top of storage
 *
 * Usage:
 * ```javascript
 * import StorageFactory from './StorageFactory.js';
 *
 * const storage = StorageFactory.create(config.storage, {
 *   WIKI_BOT_TOKEN: process.env.WIKI_BOT_TOKEN,
 *   SLAYER_WIKI_DATA: env.SLAYER_WIKI_DATA, // KV namespace
 * });
 *
 * const items = await storage.load('skill-builds', userId);
 * ```
 */

import GitHubStorage from './GitHubStorage.js';
import CloudflareKVStorage from './CloudflareKVStorage.js';
import MigrationAdapter from './MigrationAdapter.js';

class StorageFactory {
  /**
   * Create a storage adapter based on configuration
   *
   * @param {Object} storageConfig - Storage configuration
   * @param {string} storageConfig.backend - Backend type: "github" | "cloudflare-kv"
   * @param {string} storageConfig.version - Data version (e.g., "v1")
   * @param {Object} storageConfig.github - GitHub configuration
   * @param {Object} storageConfig.cloudflare - Cloudflare configuration
   * @param {Object} storageConfig.migration - Migration configuration
   * @param {Object} environment - Environment variables/bindings
   * @returns {StorageAdapter} Configured storage adapter
   *
   * @example
   * const storage = StorageFactory.create(
   *   {
   *     backend: 'cloudflare-kv',
   *     version: 'v1',
   *     migration: {
   *       enabled: true,
   *       sourceBackend: 'github',
   *       mode: 'read-through'
   *     },
   *     github: { owner: 'user', repo: 'wiki' },
   *     cloudflare: { keyPrefix: 'mywiki' }
   *   },
   *   { WIKI_BOT_TOKEN: '...', SLAYER_WIKI_DATA: kvNamespace }
   * );
   */
  static create(storageConfig, environment = {}) {
    if (!storageConfig) {
      throw new Error('StorageFactory requires storageConfig');
    }

    const backend = storageConfig.backend || 'github';
    const migration = storageConfig.migration || { enabled: false };

    // Create the primary adapter based on backend type
    let adapter = this._createBackendAdapter(
      backend,
      storageConfig,
      environment
    );

    // Wrap with migration adapter if enabled
    if (migration.enabled && migration.sourceBackend) {
      const sourceAdapter = this._createBackendAdapter(
        migration.sourceBackend,
        storageConfig,
        environment
      );

      adapter = new MigrationAdapter({
        sourceAdapter,
        targetAdapter: adapter,
        mode: migration.mode || 'read-through',
      });

      console.log(`[StorageFactory] Created migration adapter: ${migration.sourceBackend} → ${backend} (${migration.mode})`);
    } else {
      console.log(`[StorageFactory] Created ${backend} storage adapter`);
    }

    return adapter;
  }

  /**
   * Create a backend-specific storage adapter
   * @private
   */
  static _createBackendAdapter(backend, storageConfig, environment) {
    switch (backend) {
      case 'github':
        return this._createGitHubAdapter(storageConfig, environment);

      case 'cloudflare-kv':
        return this._createCloudflareKVAdapter(storageConfig, environment);

      default:
        throw new Error(`Unknown storage backend: ${backend}`);
    }
  }

  /**
   * Create a GitHub storage adapter
   * @private
   */
  static _createGitHubAdapter(storageConfig, environment) {
    const botToken = environment.WIKI_BOT_TOKEN;

    if (!botToken) {
      throw new Error('GitHub storage requires WIKI_BOT_TOKEN environment variable');
    }

    if (!storageConfig.github) {
      throw new Error('GitHub storage requires github configuration');
    }

    const { owner, repo } = storageConfig.github;

    if (!owner || !repo) {
      throw new Error('GitHub storage requires owner and repo in configuration');
    }

    return new GitHubStorage({
      botToken,
      owner,
      repo,
      version: storageConfig.version || 'v1',
    });
  }

  /**
   * Create a Cloudflare KV storage adapter
   * @private
   */
  static _createCloudflareKVAdapter(storageConfig, environment) {
    // KV namespace binding - name is configurable
    const namespaceName = storageConfig.cloudflare?.namespaceName || 'SLAYER_WIKI_DATA';
    const namespace = environment[namespaceName];

    if (!namespace) {
      throw new Error(
        `Cloudflare KV storage requires ${namespaceName} namespace binding. ` +
        `Configure in wrangler.toml: [[kv_namespaces]]\nbinding = "${namespaceName}"\nid = "..."`
      );
    }

    if (!storageConfig.cloudflare) {
      throw new Error('Cloudflare KV storage requires cloudflare configuration');
    }

    return new CloudflareKVStorage({
      namespace,
      version: storageConfig.version || 'v1',
      keyPrefix: storageConfig.cloudflare.keyPrefix || 'app',
    });
  }

  /**
   * Validate storage configuration
   * @param {Object} storageConfig - Storage configuration
   * @returns {boolean} True if valid
   * @throws {Error} If configuration is invalid
   */
  static validate(storageConfig) {
    if (!storageConfig) {
      throw new Error('Storage configuration is required');
    }

    const backend = storageConfig.backend || 'github';

    // Validate backend type
    const validBackends = ['github', 'cloudflare-kv'];
    if (!validBackends.includes(backend)) {
      throw new Error(
        `Invalid storage backend: ${backend}. Must be one of: ${validBackends.join(', ')}`
      );
    }

    // Validate backend-specific config
    if (backend === 'github' && !storageConfig.github) {
      throw new Error('GitHub backend requires github configuration');
    }

    if (backend === 'cloudflare-kv' && !storageConfig.cloudflare) {
      throw new Error('Cloudflare KV backend requires cloudflare configuration');
    }

    // Validate migration config
    if (storageConfig.migration?.enabled) {
      const migration = storageConfig.migration;

      if (!migration.sourceBackend) {
        throw new Error('Migration requires sourceBackend');
      }

      if (!validBackends.includes(migration.sourceBackend)) {
        throw new Error(
          `Invalid migration sourceBackend: ${migration.sourceBackend}. Must be one of: ${validBackends.join(', ')}`
        );
      }

      if (migration.mode && !['read-through', 'cutover'].includes(migration.mode)) {
        throw new Error(
          `Invalid migration mode: ${migration.mode}. Must be "read-through" or "cutover"`
        );
      }
    }

    return true;
  }

  /**
   * Get information about supported backends
   * @returns {Object} Backend information
   */
  static getSupportedBackends() {
    return {
      github: {
        name: 'GitHub Issues/Comments',
        description: 'Store data in GitHub Issues (user-centric) and Comments (entity-centric)',
        requirements: ['WIKI_BOT_TOKEN environment variable', 'owner and repo configuration'],
        benefits: ['Free for public repos', 'Built-in version control', 'No additional services needed'],
        drawbacks: ['Slower (200-500ms per request)', 'Rate limits apply', 'More complex'],
      },
      'cloudflare-kv': {
        name: 'Cloudflare Workers KV',
        description: 'Store data in Cloudflare KV key-value store',
        requirements: ['KV namespace binding', 'keyPrefix configuration'],
        benefits: ['Very fast (single-digit ms)', 'Global edge distribution', 'Generous free tier (100k reads/day)'],
        drawbacks: ['Requires Cloudflare Workers', 'Eventual consistency', 'Limited query capabilities'],
      },
    };
  }
}

export default StorageFactory;

