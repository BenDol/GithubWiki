import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { styleRegistry } from '../../src/utils/styleRegistry.js';

describe('styleRegistry', () => {
  beforeEach(() => {
    // Clear registry before each test
    styleRegistry.clear();
  });

  afterEach(() => {
    // Clean up after each test
    styleRegistry.clear();
  });

  describe('registerCategory', () => {
    it('should register a new style category', () => {
      const styles = {
        Common: { background: 'bg-gray-500', border: 'border-gray-500' },
        Rare: { background: 'bg-blue-500', border: 'border-blue-500' }
      };

      styleRegistry.registerCategory('test-rarity', styles);

      expect(styleRegistry.hasCategory('test-rarity')).toBe(true);
      expect(styleRegistry.getAllStyles('test-rarity')).toEqual(styles);
    });

    it('should handle invalid category name', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      styleRegistry.registerCategory('', { Common: {} });
      expect(styleRegistry.hasCategory('')).toBe(false);

      styleRegistry.registerCategory(null, { Common: {} });
      expect(styleRegistry.hasCategory(null)).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should handle invalid styles object', () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      styleRegistry.registerCategory('test', null);
      expect(styleRegistry.hasCategory('test')).toBe(false);

      styleRegistry.registerCategory('test', 'not-an-object');
      expect(styleRegistry.hasCategory('test')).toBe(false);

      consoleSpy.mockRestore();
    });

    it('should overwrite existing category', () => {
      const styles1 = { Common: { background: 'bg-gray-500' } };
      const styles2 = { Rare: { background: 'bg-blue-500' } };

      styleRegistry.registerCategory('test-rarity', styles1);
      expect(styleRegistry.getStyleKeys('test-rarity')).toEqual(['Common']);

      styleRegistry.registerCategory('test-rarity', styles2);
      expect(styleRegistry.getStyleKeys('test-rarity')).toEqual(['Rare']);
    });

    it('should log registration message', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      styleRegistry.registerCategory('test-rarity', {
        Common: {},
        Rare: {}
      });

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[StyleRegistry] Registered category: test-rarity')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getStyles', () => {
    beforeEach(() => {
      styleRegistry.registerCategory('skill-rarity', {
        Common: {
          background: 'bg-gray-500',
          border: 'border-gray-500',
          glow: 'shadow-gray'
        },
        Legendary: {
          background: 'bg-red-500',
          border: 'border-red-500',
          glow: 'shadow-red'
        }
      });
    });

    it('should get styles for a specific key', () => {
      const legendaryStyles = styleRegistry.getStyles('skill-rarity', 'Legendary');

      expect(legendaryStyles).toEqual({
        background: 'bg-red-500',
        border: 'border-red-500',
        glow: 'shadow-red'
      });
    });

    it('should return null for non-existent category', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const styles = styleRegistry.getStyles('non-existent', 'Common');

      expect(styles).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Category 'non-existent' not found")
      );

      consoleSpy.mockRestore();
    });

    it('should return null for non-existent style key', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const styles = styleRegistry.getStyles('skill-rarity', 'NonExistent');

      expect(styles).toBeNull();
      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining("Style 'NonExistent' not found")
      );

      consoleSpy.mockRestore();
    });
  });

  describe('getAllStyles', () => {
    it('should return all styles in a category', () => {
      const styles = {
        Common: { background: 'bg-gray-500' },
        Rare: { background: 'bg-blue-500' },
        Epic: { background: 'bg-purple-500' }
      };

      styleRegistry.registerCategory('test-rarity', styles);

      expect(styleRegistry.getAllStyles('test-rarity')).toEqual(styles);
    });

    it('should return empty object for non-existent category', () => {
      const consoleSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});

      const styles = styleRegistry.getAllStyles('non-existent');

      expect(styles).toEqual({});

      consoleSpy.mockRestore();
    });
  });

  describe('getStyleKeys', () => {
    it('should return all style keys in a category', () => {
      styleRegistry.registerCategory('test-rarity', {
        Common: {},
        Rare: {},
        Epic: {},
        Legendary: {}
      });

      const keys = styleRegistry.getStyleKeys('test-rarity');

      expect(keys).toEqual(['Common', 'Rare', 'Epic', 'Legendary']);
    });

    it('should return empty array for non-existent category', () => {
      const keys = styleRegistry.getStyleKeys('non-existent');

      expect(keys).toEqual([]);
    });
  });

  describe('hasCategory', () => {
    it('should return true for existing category', () => {
      styleRegistry.registerCategory('test-rarity', { Common: {} });

      expect(styleRegistry.hasCategory('test-rarity')).toBe(true);
    });

    it('should return false for non-existent category', () => {
      expect(styleRegistry.hasCategory('non-existent')).toBe(false);
    });
  });

  describe('hasStyle', () => {
    beforeEach(() => {
      styleRegistry.registerCategory('test-rarity', {
        Common: {},
        Rare: {}
      });
    });

    it('should return true for existing style', () => {
      expect(styleRegistry.hasStyle('test-rarity', 'Common')).toBe(true);
      expect(styleRegistry.hasStyle('test-rarity', 'Rare')).toBe(true);
    });

    it('should return false for non-existent style', () => {
      expect(styleRegistry.hasStyle('test-rarity', 'Epic')).toBe(false);
    });

    it('should return false for non-existent category', () => {
      expect(styleRegistry.hasStyle('non-existent', 'Common')).toBe(false);
    });
  });

  describe('getCategories', () => {
    it('should return all registered categories', () => {
      styleRegistry.registerCategory('rarity1', { Common: {} });
      styleRegistry.registerCategory('rarity2', { Common: {} });
      styleRegistry.registerCategory('quality', { Low: {} });

      const categories = styleRegistry.getCategories();

      expect(categories).toEqual(['rarity1', 'rarity2', 'quality']);
    });

    it('should return empty array when no categories registered', () => {
      expect(styleRegistry.getCategories()).toEqual([]);
    });
  });

  describe('unregisterCategory', () => {
    it('should remove a registered category', () => {
      styleRegistry.registerCategory('test-rarity', { Common: {} });
      expect(styleRegistry.hasCategory('test-rarity')).toBe(true);

      styleRegistry.unregisterCategory('test-rarity');
      expect(styleRegistry.hasCategory('test-rarity')).toBe(false);
    });

    it('should do nothing if category does not exist', () => {
      styleRegistry.unregisterCategory('non-existent');
      // Should not throw error
      expect(styleRegistry.hasCategory('non-existent')).toBe(false);
    });

    it('should log unregistration message', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      styleRegistry.registerCategory('test-rarity', { Common: {} });
      styleRegistry.unregisterCategory('test-rarity');

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[StyleRegistry] Unregistered category: test-rarity')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('clear', () => {
    it('should remove all categories', () => {
      styleRegistry.registerCategory('rarity1', { Common: {} });
      styleRegistry.registerCategory('rarity2', { Common: {} });
      styleRegistry.registerCategory('quality', { Low: {} });

      expect(styleRegistry.getCategories().length).toBe(3);

      styleRegistry.clear();

      expect(styleRegistry.getCategories().length).toBe(0);
      expect(styleRegistry.hasCategory('rarity1')).toBe(false);
      expect(styleRegistry.hasCategory('rarity2')).toBe(false);
      expect(styleRegistry.hasCategory('quality')).toBe(false);
    });

    it('should log clear message', () => {
      const consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});

      styleRegistry.clear();

      expect(consoleSpy).toHaveBeenCalledWith(
        expect.stringContaining('[StyleRegistry] Cleared all categories')
      );

      consoleSpy.mockRestore();
    });
  });

  describe('real-world usage', () => {
    it('should support RPG rarity colors', () => {
      styleRegistry.registerCategory('skill-rarity', {
        Common: {
          background: 'bg-gray-500',
          border: 'border-gray-500',
          glow: 'shadow-[0_0_10px_rgba(107,114,128,0.5)]'
        },
        Legendary: {
          background: 'bg-red-500',
          border: 'border-red-500',
          glow: 'shadow-[0_0_10px_rgba(220,38,38,0.5)]'
        }
      });

      const legendary = styleRegistry.getStyles('skill-rarity', 'Legendary');
      expect(legendary.background).toBe('bg-red-500');
      expect(legendary.glow).toContain('shadow');
    });

    it('should support multiple independent categories', () => {
      styleRegistry.registerCategory('skill-rarity', {
        Common: { background: 'bg-gray-500' }
      });

      styleRegistry.registerCategory('equipment-rarity', {
        Common: { background: 'bg-green-500' }
      });

      const skillCommon = styleRegistry.getStyles('skill-rarity', 'Common');
      const equipmentCommon = styleRegistry.getStyles('equipment-rarity', 'Common');

      expect(skillCommon.background).toBe('bg-gray-500');
      expect(equipmentCommon.background).toBe('bg-green-500');
    });
  });
});
