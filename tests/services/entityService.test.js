import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { EntityService } from '../../src/services/github/entityService.js';
import { entityTypeRegistry } from '../../src/utils/entityTypeRegistry.js';

describe('EntityService', () => {
  beforeEach(() => {
    // Clear registry before each test
    entityTypeRegistry.clear();
  });

  afterEach(() => {
    // Clean up after each test
    entityTypeRegistry.clear();
  });

  describe('constructor', () => {
    it('should create service for registered entity type', () => {
      entityTypeRegistry.registerType('skill-build', {
        label: 'Skill Build',
        pluralLabel: 'Skill Builds',
        fields: ['name', 'slots']
      });

      const service = new EntityService('skill-build');

      expect(service.entityType).toBe('skill-build');
      expect(service.config).toBeDefined();
      expect(service.config.label).toBe('Skill Build');
    });

    it('should throw error for non-registered entity type', () => {
      expect(() => {
        new EntityService('non-existent');
      }).toThrow("Entity type 'non-existent' not registered");
    });

    it('should throw error for invalid entity type', () => {
      expect(() => {
        new EntityService('');
      }).toThrow('Entity type must be a non-empty string');

      expect(() => {
        new EntityService(null);
      }).toThrow('Entity type must be a non-empty string');
    });

    it('should accept options', () => {
      entityTypeRegistry.registerType('test-entity', {
        label: 'Test Entity',
        pluralLabel: 'Test Entities',
        fields: []
      });

      const mockOctokit = { rest: {} };
      const options = {
        octokit: mockOctokit,
        config: { someOption: 'value' }
      };

      const service = new EntityService('test-entity', options);

      expect(service.octokit).toBe(mockOctokit);
      expect(service.options).toEqual({ someOption: 'value' });
    });

    it('should log creation message', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      entityTypeRegistry.registerType('test-entity', {
        label: 'Test Entity',
        pluralLabel: 'Test Entities',
        fields: []
      });

      new EntityService('test-entity');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EntityService] Created service for entity type: test-entity')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getConfig', () => {
    it('should return entity type configuration', () => {
      entityTypeRegistry.registerType('skill-build', {
        label: 'Skill Build',
        pluralLabel: 'Skill Builds',
        fields: ['name', 'slots'],
        icon: '⚔️'
      });

      const service = new EntityService('skill-build');
      const config = service.getConfig();

      expect(config.label).toBe('Skill Build');
      expect(config.pluralLabel).toBe('Skill Builds');
      expect(config.fields).toEqual(['name', 'slots']);
      expect(config.icon).toBe('⚔️');
    });

    it('should return a copy of config', () => {
      entityTypeRegistry.registerType('test-entity', {
        label: 'Test',
        pluralLabel: 'Tests',
        fields: []
      });

      const service = new EntityService('test-entity');
      const config1 = service.getConfig();
      const config2 = service.getConfig();

      expect(config1).not.toBe(config2);
      expect(config1).toEqual(config2);
    });
  });

  describe('validate', () => {
    it('should validate data with validation function', () => {
      entityTypeRegistry.registerType('validated-entity', {
        label: 'Validated Entity',
        pluralLabel: 'Validated Entities',
        fields: ['name', 'email'],
        validation: (data) => {
          const errors = [];
          if (!data.name) errors.push('Name is required');
          if (!data.email || !data.email.includes('@')) errors.push('Valid email is required');
          return { valid: errors.length === 0, errors };
        }
      });

      const service = new EntityService('validated-entity');

      // Valid data
      const validResult = service.validate({ name: 'Test', email: 'test@example.com' });
      expect(validResult.valid).toBe(true);
      expect(validResult.errors).toEqual([]);

      // Invalid data
      const invalidResult = service.validate({ name: '', email: 'invalid' });
      expect(invalidResult.valid).toBe(false);
      expect(invalidResult.errors.length).toBe(2);
      expect(invalidResult.errors).toContain('Name is required');
      expect(invalidResult.errors).toContain('Valid email is required');
    });

    it('should return valid when no validation defined', () => {
      entityTypeRegistry.registerType('unvalidated-entity', {
        label: 'Unvalidated Entity',
        pluralLabel: 'Unvalidated Entities',
        fields: []
      });

      const service = new EntityService('unvalidated-entity');
      const result = service.validate({ anyData: 'anything' });

      expect(result.valid).toBe(true);
      expect(result.errors).toEqual([]);
    });

    it('should handle validation errors gracefully', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      entityTypeRegistry.registerType('error-entity', {
        label: 'Error Entity',
        pluralLabel: 'Error Entities',
        fields: [],
        validation: () => {
          throw new Error('Validation error');
        }
      });

      const service = new EntityService('error-entity');
      const result = service.validate({});

      expect(result.valid).toBe(false);
      expect(result.errors).toContain('Validation error');

      consoleSpy.mockRestore();
    });

    it('should handle non-function validation', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      entityTypeRegistry.registerType('schema-entity', {
        label: 'Schema Entity',
        pluralLabel: 'Schema Entities',
        fields: [],
        validation: { type: 'object' } // Schema object, not function
      });

      const service = new EntityService('schema-entity');
      const result = service.validate({});

      expect(result.valid).toBe(true); // Falls back to valid
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('Validation schema provided but no validator function found')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('CRUD operations', () => {
    let service;

    beforeEach(() => {
      entityTypeRegistry.registerType('test-entity', {
        label: 'Test Entity',
        pluralLabel: 'Test Entities',
        fields: ['name'],
        storage: 'github-issues'
      });

      service = new EntityService('test-entity');
    });

    describe('create', () => {
      it('should throw error for unimplemented method', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(service.create({ name: 'Test' })).rejects.toThrow(
          'create() not implemented for storage type: github-issues'
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[EntityService] Creating Test Entity')
        );

        consoleSpy.mockRestore();
      });

      it('should validate before creating', async () => {
        entityTypeRegistry.clear();
        entityTypeRegistry.registerType('validated', {
          label: 'Validated',
          pluralLabel: 'Validateds',
          fields: ['name'],
          validation: (data) => ({
            valid: !!data.name,
            errors: data.name ? [] : ['Name required']
          })
        });

        const validatedService = new EntityService('validated');

        await expect(validatedService.create({ name: '' })).rejects.toThrow(
          'Validation failed: Name required'
        );
      });
    });

    describe('read', () => {
      it('should throw error for unimplemented method', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(service.read('id-123')).rejects.toThrow(
          'read() not implemented for storage type: github-issues'
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[EntityService] Reading Test Entity (ID: id-123)')
        );

        consoleSpy.mockRestore();
      });
    });

    describe('update', () => {
      it('should throw error for unimplemented method', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(service.update('id-123', { name: 'Updated' })).rejects.toThrow(
          'update() not implemented for storage type: github-issues'
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[EntityService] Updating Test Entity (ID: id-123)')
        );

        consoleSpy.mockRestore();
      });

      it('should validate before updating', async () => {
        entityTypeRegistry.clear();
        entityTypeRegistry.registerType('validated', {
          label: 'Validated',
          pluralLabel: 'Validateds',
          fields: ['name'],
          validation: (data) => ({
            valid: !!data.name,
            errors: data.name ? [] : ['Name required']
          })
        });

        const validatedService = new EntityService('validated');

        await expect(validatedService.update('id-123', { name: '' })).rejects.toThrow(
          'Validation failed: Name required'
        );
      });
    });

    describe('delete', () => {
      it('should throw error for unimplemented method', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(service.delete('id-123')).rejects.toThrow(
          'delete() not implemented for storage type: github-issues'
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[EntityService] Deleting Test Entity (ID: id-123)')
        );

        consoleSpy.mockRestore();
      });
    });

    describe('list', () => {
      it('should throw error for unimplemented method', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(service.list()).rejects.toThrow(
          'list() not implemented for storage type: github-issues'
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[EntityService] Listing Test Entities')
        );

        consoleSpy.mockRestore();
      });

      it('should accept filter parameter', async () => {
        const filter = { status: 'active' };

        await expect(service.list(filter)).rejects.toThrow(
          'list() not implemented for storage type: github-issues'
        );
      });
    });

    describe('search', () => {
      it('should throw error for unimplemented method', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(service.search('query')).rejects.toThrow(
          'search() not implemented for storage type: github-issues'
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[EntityService] Searching Test Entities for: query')
        );

        consoleSpy.mockRestore();
      });

      it('should accept options parameter', async () => {
        const options = { limit: 10 };

        await expect(service.search('query', options)).rejects.toThrow(
          'search() not implemented for storage type: github-issues'
        );
      });
    });

    describe('count', () => {
      it('should throw error for unimplemented method', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        await expect(service.count()).rejects.toThrow(
          'count() not implemented for storage type: github-issues'
        );

        expect(consoleSpy).toHaveBeenCalledWith(
          expect.stringContaining('[EntityService] Counting Test Entities')
        );

        consoleSpy.mockRestore();
      });

      it('should accept filter parameter', async () => {
        const filter = { status: 'active' };

        await expect(service.count(filter)).rejects.toThrow(
          'count() not implemented for storage type: github-issues'
        );
      });
    });

    describe('exists', () => {
      it('should check if entity exists using read', async () => {
        const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

        // Mock read to succeed
        service.read = vi.fn().mockResolvedValue({ id: 'id-123', name: 'Test' });
        const exists = await service.exists('id-123');
        expect(exists).toBe(true);

        // Mock read to fail
        service.read = vi.fn().mockRejectedValue(new Error('Not found'));
        const notExists = await service.exists('id-456');
        expect(notExists).toBe(false);

        consoleSpy.mockRestore();
      });
    });
  });

  describe('createEntityService factory', () => {
    it('should create EntityService instance', async () => {
      entityTypeRegistry.registerType('test-entity', {
        label: 'Test Entity',
        pluralLabel: 'Test Entities',
        fields: []
      });

      const { createEntityService } = await import('../../src/services/github/entityService.js');
      const service = createEntityService('test-entity');

      expect(service).toBeInstanceOf(EntityService);
      expect(service.entityType).toBe('test-entity');
    });

    it('should accept options', async () => {
      entityTypeRegistry.registerType('test-entity', {
        label: 'Test Entity',
        pluralLabel: 'Test Entities',
        fields: []
      });

      const { createEntityService } = await import('../../src/services/github/entityService.js');
      const mockOctokit = { rest: {} };
      const service = createEntityService('test-entity', { octokit: mockOctokit });

      expect(service.octokit).toBe(mockOctokit);
    });
  });

  describe('extensibility', () => {
    it('should allow extending for custom storage', async () => {
      entityTypeRegistry.registerType('custom-entity', {
        label: 'Custom Entity',
        pluralLabel: 'Custom Entities',
        fields: ['name']
      });

      class CustomEntityService extends EntityService {
        constructor(entityType) {
          super(entityType);
          this.storage = new Map();
        }

        async create(data) {
          const validation = this.validate(data);
          if (!validation.valid) {
            throw new Error(`Validation failed: ${validation.errors.join(', ')}`);
          }

          const id = Math.random().toString(36).substr(2, 9);
          this.storage.set(id, { id, ...data });
          return this.storage.get(id);
        }

        async read(id) {
          const entity = this.storage.get(id);
          if (!entity) throw new Error('Not found');
          return entity;
        }

        async list() {
          return Array.from(this.storage.values());
        }

        async delete(id) {
          return this.storage.delete(id);
        }
      }

      const service = new CustomEntityService('custom-entity');

      // Test create
      const created = await service.create({ name: 'Test Entity' });
      expect(created.name).toBe('Test Entity');
      expect(created.id).toBeDefined();

      // Test read
      const read = await service.read(created.id);
      expect(read).toEqual(created);

      // Test list
      const list = await service.list();
      expect(list.length).toBe(1);

      // Test delete
      await service.delete(created.id);
      await expect(service.read(created.id)).rejects.toThrow('Not found');
    });
  });
});
