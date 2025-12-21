import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { entityTypeRegistry } from '../../src/utils/entityTypeRegistry.js';

describe('entityTypeRegistry', () => {
  beforeEach(() => {
    // Clear registry before each test
    entityTypeRegistry.clear();
  });

  afterEach(() => {
    // Clean up after each test
    entityTypeRegistry.clear();
  });

  describe('registerType', () => {
    it('should register a new entity type', () => {
      const config = {
        label: 'Skill Build',
        pluralLabel: 'Skill Builds',
        fields: ['name', 'slots', 'maxSlots'],
        icon: '⚔️'
      };

      entityTypeRegistry.registerType('skill-build', config);

      expect(entityTypeRegistry.hasType('skill-build')).toBe(true);
      const registered = entityTypeRegistry.getType('skill-build');
      expect(registered.label).toBe('Skill Build');
      expect(registered.pluralLabel).toBe('Skill Builds');
      expect(registered.fields).toEqual(['name', 'slots', 'maxSlots']);
    });

    it('should use default values for optional fields', () => {
      entityTypeRegistry.registerType('test-entity', {
        label: 'Test Entity',
        pluralLabel: 'Test Entities',
        fields: ['name']
      });

      const type = entityTypeRegistry.getType('test-entity');
      expect(type.storage).toBe('github-issues');
      expect(type.icon).toBe('📄');
      expect(type.listLabel).toBe('issue.title');
      expect(type.metadata).toEqual({});
      expect(type.validation).toBeNull();
    });

    it('should handle custom storage type', () => {
      entityTypeRegistry.registerType('custom-entity', {
        label: 'Custom Entity',
        pluralLabel: 'Custom Entities',
        fields: ['name'],
        storage: 'custom-storage'
      });

      const type = entityTypeRegistry.getType('custom-entity');
      expect(type.storage).toBe('custom-storage');
    });

    it('should handle validation schema', () => {
      const validationFn = (data) => ({ valid: true, errors: [] });

      entityTypeRegistry.registerType('validated-entity', {
        label: 'Validated Entity',
        pluralLabel: 'Validated Entities',
        fields: ['name'],
        validation: validationFn
      });

      const type = entityTypeRegistry.getType('validated-entity');
      expect(type.validation).toBe(validationFn);
    });

    it('should handle metadata', () => {
      entityTypeRegistry.registerType('meta-entity', {
        label: 'Meta Entity',
        pluralLabel: 'Meta Entities',
        fields: ['name'],
        metadata: { maxItems: 10, allowDuplicates: false }
      });

      const type = entityTypeRegistry.getType('meta-entity');
      expect(type.metadata).toEqual({ maxItems: 10, allowDuplicates: false });
    });

    it('should reject invalid type name', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      entityTypeRegistry.registerType('', { label: 'Test', pluralLabel: 'Tests', fields: [] });
      expect(entityTypeRegistry.hasType('')).toBe(false);

      entityTypeRegistry.registerType(null, { label: 'Test', pluralLabel: 'Tests', fields: [] });
      expect(entityTypeRegistry.hasType(null)).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should reject invalid config', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      entityTypeRegistry.registerType('test', null);
      expect(entityTypeRegistry.hasType('test')).toBe(false);

      entityTypeRegistry.registerType('test', 'not-an-object');
      expect(entityTypeRegistry.hasType('test')).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should reject missing label', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      entityTypeRegistry.registerType('test', {
        pluralLabel: 'Tests',
        fields: []
      });
      expect(entityTypeRegistry.hasType('test')).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should reject missing pluralLabel', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      entityTypeRegistry.registerType('test', {
        label: 'Test',
        fields: []
      });
      expect(entityTypeRegistry.hasType('test')).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should reject missing fields array', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      entityTypeRegistry.registerType('test', {
        label: 'Test',
        pluralLabel: 'Tests'
      });
      expect(entityTypeRegistry.hasType('test')).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should log registration message', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      entityTypeRegistry.registerType('test-entity', {
        label: 'Test Entity',
        pluralLabel: 'Test Entities',
        fields: ['name']
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EntityTypeRegistry] Registered entity type: test-entity')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getType', () => {
    beforeEach(() => {
      entityTypeRegistry.registerType('skill-build', {
        label: 'Skill Build',
        pluralLabel: 'Skill Builds',
        fields: ['name', 'slots', 'maxSlots'],
        icon: '⚔️'
      });
    });

    it('should return entity type configuration', () => {
      const type = entityTypeRegistry.getType('skill-build');

      expect(type).toBeDefined();
      expect(type.label).toBe('Skill Build');
      expect(type.pluralLabel).toBe('Skill Builds');
      expect(type.fields).toEqual(['name', 'slots', 'maxSlots']);
      expect(type.icon).toBe('⚔️');
    });

    it('should return null for non-existent type', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const type = entityTypeRegistry.getType('non-existent');

      expect(type).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Entity type 'non-existent' not found")
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getAllTypes', () => {
    it('should return all registered types', () => {
      entityTypeRegistry.registerType('type1', {
        label: 'Type 1',
        pluralLabel: 'Type 1s',
        fields: ['name']
      });

      entityTypeRegistry.registerType('type2', {
        label: 'Type 2',
        pluralLabel: 'Type 2s',
        fields: ['title']
      });

      const allTypes = entityTypeRegistry.getAllTypes();

      expect(Object.keys(allTypes)).toEqual(['type1', 'type2']);
      expect(allTypes.type1.label).toBe('Type 1');
      expect(allTypes.type2.label).toBe('Type 2');
    });

    it('should return empty object when no types registered', () => {
      const allTypes = entityTypeRegistry.getAllTypes();

      expect(allTypes).toEqual({});
    });

    it('should return a copy (not reference)', () => {
      entityTypeRegistry.registerType('test', {
        label: 'Test',
        pluralLabel: 'Tests',
        fields: ['name']
      });

      const allTypes1 = entityTypeRegistry.getAllTypes();
      const allTypes2 = entityTypeRegistry.getAllTypes();

      expect(allTypes1).not.toBe(allTypes2);
      expect(allTypes1).toEqual(allTypes2);
    });
  });

  describe('getTypeNames', () => {
    it('should return array of type names', () => {
      entityTypeRegistry.registerType('skill-build', {
        label: 'Skill Build',
        pluralLabel: 'Skill Builds',
        fields: []
      });

      entityTypeRegistry.registerType('battle-loadout', {
        label: 'Battle Loadout',
        pluralLabel: 'Battle Loadouts',
        fields: []
      });

      const names = entityTypeRegistry.getTypeNames();

      expect(names).toEqual(['skill-build', 'battle-loadout']);
    });

    it('should return empty array when no types registered', () => {
      expect(entityTypeRegistry.getTypeNames()).toEqual([]);
    });
  });

  describe('hasType', () => {
    it('should return true for existing type', () => {
      entityTypeRegistry.registerType('test', {
        label: 'Test',
        pluralLabel: 'Tests',
        fields: []
      });

      expect(entityTypeRegistry.hasType('test')).toBe(true);
    });

    it('should return false for non-existent type', () => {
      expect(entityTypeRegistry.hasType('non-existent')).toBe(false);
    });
  });

  describe('getLabel', () => {
    beforeEach(() => {
      entityTypeRegistry.registerType('skill-build', {
        label: 'Skill Build',
        pluralLabel: 'Skill Builds',
        fields: []
      });
    });

    it('should return singular label by default', () => {
      const label = entityTypeRegistry.getLabel('skill-build');

      expect(label).toBe('Skill Build');
    });

    it('should return plural label when requested', () => {
      const label = entityTypeRegistry.getLabel('skill-build', true);

      expect(label).toBe('Skill Builds');
    });

    it('should return null for non-existent type', () => {
      const label = entityTypeRegistry.getLabel('non-existent');

      expect(label).toBeNull();
    });
  });

  describe('getIcon', () => {
    it('should return custom icon', () => {
      entityTypeRegistry.registerType('skill-build', {
        label: 'Skill Build',
        pluralLabel: 'Skill Builds',
        fields: [],
        icon: '⚔️'
      });

      expect(entityTypeRegistry.getIcon('skill-build')).toBe('⚔️');
    });

    it('should return default icon', () => {
      entityTypeRegistry.registerType('generic', {
        label: 'Generic',
        pluralLabel: 'Generics',
        fields: []
      });

      expect(entityTypeRegistry.getIcon('generic')).toBe('📄');
    });

    it('should return null for non-existent type', () => {
      expect(entityTypeRegistry.getIcon('non-existent')).toBeNull();
    });
  });

  describe('getStorage', () => {
    it('should return custom storage', () => {
      entityTypeRegistry.registerType('custom', {
        label: 'Custom',
        pluralLabel: 'Customs',
        fields: [],
        storage: 'custom-storage'
      });

      expect(entityTypeRegistry.getStorage('custom')).toBe('custom-storage');
    });

    it('should return default storage', () => {
      entityTypeRegistry.registerType('default', {
        label: 'Default',
        pluralLabel: 'Defaults',
        fields: []
      });

      expect(entityTypeRegistry.getStorage('default')).toBe('github-issues');
    });

    it('should return null for non-existent type', () => {
      expect(entityTypeRegistry.getStorage('non-existent')).toBeNull();
    });
  });

  describe('getFields', () => {
    it('should return fields array', () => {
      entityTypeRegistry.registerType('test', {
        label: 'Test',
        pluralLabel: 'Tests',
        fields: ['name', 'description', 'author']
      });

      const fields = entityTypeRegistry.getFields('test');

      expect(fields).toEqual(['name', 'description', 'author']);
    });

    it('should return a copy of fields array', () => {
      entityTypeRegistry.registerType('test', {
        label: 'Test',
        pluralLabel: 'Tests',
        fields: ['name']
      });

      const fields1 = entityTypeRegistry.getFields('test');
      const fields2 = entityTypeRegistry.getFields('test');

      expect(fields1).not.toBe(fields2);
      expect(fields1).toEqual(fields2);
    });

    it('should return null for non-existent type', () => {
      expect(entityTypeRegistry.getFields('non-existent')).toBeNull();
    });
  });

  describe('getValidation', () => {
    it('should return validation schema', () => {
      const validationFn = (data) => ({ valid: true, errors: [] });

      entityTypeRegistry.registerType('validated', {
        label: 'Validated',
        pluralLabel: 'Validateds',
        fields: [],
        validation: validationFn
      });

      expect(entityTypeRegistry.getValidation('validated')).toBe(validationFn);
    });

    it('should return null when no validation defined', () => {
      entityTypeRegistry.registerType('unvalidated', {
        label: 'Unvalidated',
        pluralLabel: 'Unvalidateds',
        fields: []
      });

      expect(entityTypeRegistry.getValidation('unvalidated')).toBeNull();
    });

    it('should return null for non-existent type', () => {
      expect(entityTypeRegistry.getValidation('non-existent')).toBeNull();
    });
  });

  describe('hasField', () => {
    beforeEach(() => {
      entityTypeRegistry.registerType('test', {
        label: 'Test',
        pluralLabel: 'Tests',
        fields: ['name', 'description', 'author']
      });
    });

    it('should return true for existing field', () => {
      expect(entityTypeRegistry.hasField('test', 'name')).toBe(true);
      expect(entityTypeRegistry.hasField('test', 'description')).toBe(true);
      expect(entityTypeRegistry.hasField('test', 'author')).toBe(true);
    });

    it('should return false for non-existent field', () => {
      expect(entityTypeRegistry.hasField('test', 'nonexistent')).toBe(false);
    });

    it('should return false for non-existent type', () => {
      expect(entityTypeRegistry.hasField('non-existent', 'name')).toBe(false);
    });
  });

  describe('unregisterType', () => {
    it('should remove a registered type', () => {
      entityTypeRegistry.registerType('test', {
        label: 'Test',
        pluralLabel: 'Tests',
        fields: []
      });

      expect(entityTypeRegistry.hasType('test')).toBe(true);

      entityTypeRegistry.unregisterType('test');

      expect(entityTypeRegistry.hasType('test')).toBe(false);
    });

    it('should do nothing if type does not exist', () => {
      entityTypeRegistry.unregisterType('non-existent');
      // Should not throw error
      expect(entityTypeRegistry.hasType('non-existent')).toBe(false);
    });

    it('should log unregistration message', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      entityTypeRegistry.registerType('test', {
        label: 'Test',
        pluralLabel: 'Tests',
        fields: []
      });

      entityTypeRegistry.unregisterType('test');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EntityTypeRegistry] Unregistered entity type: test')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('clear', () => {
    it('should remove all types', () => {
      entityTypeRegistry.registerType('type1', {
        label: 'Type 1',
        pluralLabel: 'Type 1s',
        fields: []
      });

      entityTypeRegistry.registerType('type2', {
        label: 'Type 2',
        pluralLabel: 'Type 2s',
        fields: []
      });

      expect(entityTypeRegistry.getTypeNames().length).toBe(2);

      entityTypeRegistry.clear();

      expect(entityTypeRegistry.getTypeNames().length).toBe(0);
    });

    it('should log clear message', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      entityTypeRegistry.clear();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[EntityTypeRegistry] Cleared all entity types')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('real-world usage', () => {
    it('should support RPG entity types', () => {
      entityTypeRegistry.registerType('skill-build', {
        label: 'Skill Build',
        pluralLabel: 'Skill Builds',
        fields: ['name', 'slots', 'maxSlots', 'description'],
        validation: (data) => {
          const errors = [];
          if (!data.name) errors.push('Name required');
          if (data.slots.length > data.maxSlots) errors.push('Too many slots');
          return { valid: errors.length === 0, errors };
        },
        storage: 'github-issues',
        icon: '⚔️',
        metadata: { maxSlots: 12 }
      });

      const type = entityTypeRegistry.getType('skill-build');
      expect(type.label).toBe('Skill Build');
      expect(type.fields).toContain('name');
      expect(type.icon).toBe('⚔️');
      expect(type.metadata.maxSlots).toBe(12);

      // Test validation
      const result = type.validation({ name: '', slots: Array(13), maxSlots: 12 });
      expect(result.valid).toBe(false);
      expect(result.errors.length).toBe(2);
    });
  });
});
