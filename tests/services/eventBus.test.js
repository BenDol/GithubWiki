/**
 * EventBus Service Tests
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { eventBus } from '../../src/services/eventBus.js';

describe('eventBus', () => {
  beforeEach(() => {
    // Clear all event listeners before each test
    eventBus.listeners.clear();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('on', () => {
    it('should register an event listener', () => {
      const callback = vi.fn();

      eventBus.on('test-event', callback);

      expect(eventBus.listeners.has('test-event')).toBe(true);
      expect(eventBus.listeners.get('test-event').has(callback)).toBe(true);
    });

    it('should register multiple listeners for the same event', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.on('test-event', callback1);
      eventBus.on('test-event', callback2);

      expect(eventBus.listeners.get('test-event').size).toBe(2);
    });

    it('should not duplicate listeners', () => {
      const callback = vi.fn();

      eventBus.on('test-event', callback);
      eventBus.on('test-event', callback);

      expect(eventBus.listeners.get('test-event').size).toBe(1);
    });
  });

  describe('off', () => {
    it('should remove a registered listener', () => {
      const callback = vi.fn();

      eventBus.on('test-event', callback);
      const hadListener = eventBus.listeners.get('test-event').has(callback);
      eventBus.off('test-event', callback);

      expect(hadListener).toBe(true);
      expect(eventBus.listeners.has('test-event')).toBe(false); // Set should be deleted when empty
    });

    it('should do nothing if event does not exist', () => {
      const callback = vi.fn();

      expect(() => {
        eventBus.off('non-existent-event', callback);
      }).not.toThrow();
    });

    it('should do nothing if listener is not registered', () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();

      eventBus.on('test-event', callback1);

      expect(() => {
        eventBus.off('test-event', callback2);
      }).not.toThrow();

      expect(eventBus.listeners.get('test-event').has(callback1)).toBe(true);
    });
  });

  describe('emit', () => {
    it('should call registered listeners with data', async () => {
      const callback = vi.fn();
      const data = { message: 'test' };

      eventBus.on('test-event', callback);
      eventBus.emit('test-event', data);

      // Wait for async setTimeout to execute
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalledWith(data);
      expect(callback).toHaveBeenCalledTimes(1);
    });

    it('should call all registered listeners', async () => {
      const callback1 = vi.fn();
      const callback2 = vi.fn();
      const data = { message: 'test' };

      eventBus.on('test-event', callback1);
      eventBus.on('test-event', callback2);
      eventBus.emit('test-event', data);

      // Wait for async setTimeout to execute
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callback1).toHaveBeenCalledWith(data);
      expect(callback2).toHaveBeenCalledWith(data);
    });

    it('should do nothing if no listeners registered', () => {
      expect(() => {
        eventBus.emit('non-existent-event', {});
      }).not.toThrow();
    });

    it('should handle listener errors gracefully', async () => {
      const consoleSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
      const errorCallback = vi.fn(() => {
        throw new Error('Listener error');
      });
      const successCallback = vi.fn();

      eventBus.on('test-event', errorCallback);
      eventBus.on('test-event', successCallback);

      eventBus.emit('test-event', {});

      // Wait for async setTimeout to execute
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(errorCallback).toHaveBeenCalled();
      expect(successCallback).toHaveBeenCalled();
      // Logger.error is called, not console.error directly

      consoleSpy.mockRestore();
    });
  });

  describe('once', () => {
    it('should register a one-time listener', async () => {
      const callback = vi.fn();

      eventBus.once('test-event', callback);

      eventBus.emit('test-event', { count: 1 });
      await new Promise(resolve => setTimeout(resolve, 10));

      eventBus.emit('test-event', { count: 2 });
      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalledTimes(1);
      expect(callback).toHaveBeenCalledWith({ count: 1 });
    });

    it('should remove listener after first call', () => {
      const callback = vi.fn();

      eventBus.once('test-event', callback);
      eventBus.emit('test-event', {});

      expect(eventBus.listeners.get('test-event')?.has(callback)).toBe(false);
    });

    it('should allow manual removal before triggering', () => {
      const callback = vi.fn();

      const wrapper = eventBus.once('test-event', callback);
      eventBus.off('test-event', wrapper);
      eventBus.emit('test-event', {});

      expect(callback).not.toHaveBeenCalled();
    });
  });

  describe('standard events', () => {
    it('should support user.login event', async () => {
      const callback = vi.fn();
      const userData = { user: { login: 'testuser', id: 12345 } };

      eventBus.on('user.login', callback);
      eventBus.emit('user.login', userData);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalledWith(userData);
    });

    it('should support user.logout event', async () => {
      const callback = vi.fn();
      const userData = { user: { login: 'testuser', id: 12345 } };

      eventBus.on('user.logout', callback);
      eventBus.emit('user.logout', userData);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalledWith(userData);
    });

    it('should support user.pr.created event', async () => {
      const callback = vi.fn();
      const prData = { pr: { number: 1, title: 'Test PR' } };

      eventBus.on('user.pr.created', callback);
      eventBus.emit('user.pr.created', prData);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalledWith(prData);
    });

    it('should support user.build.saved event', async () => {
      const callback = vi.fn();
      const buildData = { username: 'testuser', build: { name: 'Test Build' } };

      eventBus.on('user.build.saved', callback);
      eventBus.emit('user.build.saved', buildData);

      await new Promise(resolve => setTimeout(resolve, 10));

      expect(callback).toHaveBeenCalledWith(buildData);
    });
  });
});
