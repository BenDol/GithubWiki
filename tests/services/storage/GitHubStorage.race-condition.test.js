import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import GitHubStorage from '../../../src/services/storage/GitHubStorage.js';

// Mock Octokit
vi.mock('@octokit/rest', () => {
  const mockOctokitInstance = {
    rest: {
      issues: {
        listForRepo: vi.fn(),
        create: vi.fn(),
        lock: vi.fn(),
        update: vi.fn(),
        createComment: vi.fn(),
        listComments: vi.fn(),
        deleteComment: vi.fn(),
      },
    },
  };

  return {
    Octokit: vi.fn(function() {
      return mockOctokitInstance;
    }),
  };
});

describe('GitHubStorage.js - Race Condition Protection', () => {
  let storage;
  let mockOctokit;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.clearAllTimers();
    vi.useFakeTimers();

    // Reset all mock functions
    const { Octokit } = await import('@octokit/rest');
    const octokitInstance = new Octokit({ auth: 'test' });

    // Reset all mocks
    Object.values(octokitInstance.rest.issues).forEach(fn => {
      if (typeof fn === 'function' && fn.mockReset) {
        fn.mockReset();
      }
    });

    storage = new GitHubStorage({
      botToken: 'test-token',
      owner: 'test-owner',
      repo: 'test-repo',
      version: 'v1',
    });

    mockOctokit = storage.octokit;
  });

  afterEach(() => {
    vi.useRealTimers();
  });

  describe('_getOrCreateVerificationIssue - Concurrent Request Handling', () => {
    it('should return the same issue for concurrent requests', async () => {
      // Mock: No existing verification issue
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      // Mock: Create new issue
      const mockIssue = {
        number: 999,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n```json\n{}\n```',
      };

      mockOctokit.rest.issues.create.mockResolvedValue({
        data: mockIssue,
      });

      mockOctokit.rest.issues.lock.mockResolvedValue({});

      // Make 5 concurrent requests
      const promises = Array(5).fill(null).map(() =>
        storage._getOrCreateVerificationIssue()
      );

      const results = await Promise.all(promises);

      // All should return the same issue
      results.forEach(result => {
        expect(result.number).toBe(999);
      });

      // Should only create the issue once
      expect(mockOctokit.rest.issues.create).toHaveBeenCalledTimes(1);
    });

    it('should cache in-flight request for 5 seconds after completion', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      const mockIssue = {
        number: 999,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n```json\n{}\n```',
      };

      mockOctokit.rest.issues.create.mockResolvedValue({
        data: mockIssue,
      });

      mockOctokit.rest.issues.lock.mockResolvedValue({});

      // First request
      const result1 = await storage._getOrCreateVerificationIssue();
      expect(result1.number).toBe(999);

      // Immediately after, request should still be cached
      const result2 = await storage._getOrCreateVerificationIssue();
      expect(result2.number).toBe(999);

      // Should still only have called create once
      expect(mockOctokit.rest.issues.create).toHaveBeenCalledTimes(1);

      // Advance time by 3 seconds
      vi.advanceTimersByTime(3000);

      // Request should still be cached
      const result3 = await storage._getOrCreateVerificationIssue();
      expect(result3.number).toBe(999);
      expect(mockOctokit.rest.issues.create).toHaveBeenCalledTimes(1);
    });

    it('should allow new request after 5 second cache expires', async () => {
      // First call: no existing issue
      mockOctokit.rest.issues.listForRepo.mockResolvedValueOnce({
        data: [],
      });

      const mockIssue = {
        number: 999,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n```json\n{}\n```',
      };

      mockOctokit.rest.issues.create.mockResolvedValueOnce({
        data: mockIssue,
      });

      mockOctokit.rest.issues.lock.mockResolvedValue({});

      // First request
      const result1 = await storage._getOrCreateVerificationIssue();
      expect(result1.number).toBe(999);

      // Advance time by 5+ seconds
      vi.advanceTimersByTime(5100);

      // Second call: now return existing issue
      mockOctokit.rest.issues.listForRepo.mockResolvedValueOnce({
        data: [mockIssue],
      });

      // Second request should make a fresh search
      const result2 = await storage._getOrCreateVerificationIssue();
      expect(result2.number).toBe(999);

      // Should have searched twice
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should not cache failed requests', async () => {
      // Mock: listForRepo fails
      mockOctokit.rest.issues.listForRepo.mockRejectedValueOnce(
        new Error('GitHub API error')
      );

      // First request fails
      await expect(
        storage._getOrCreateVerificationIssue()
      ).rejects.toThrow('GitHub API error');

      // Wait for timer to expire
      vi.advanceTimersByTime(5100);

      // Mock: Second request succeeds
      mockOctokit.rest.issues.listForRepo.mockResolvedValueOnce({
        data: [],
      });

      const mockIssue = {
        number: 999,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n```json\n{}\n```',
      };

      mockOctokit.rest.issues.create.mockResolvedValueOnce({
        data: mockIssue,
      });

      mockOctokit.rest.issues.lock.mockResolvedValue({});

      // Second request should succeed
      const result = await storage._getOrCreateVerificationIssue();
      expect(result.number).toBe(999);
    });

    it('should handle lock failure gracefully', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      const mockIssue = {
        number: 999,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n```json\n{}\n```',
      };

      mockOctokit.rest.issues.create.mockResolvedValue({
        data: mockIssue,
      });

      // Mock: Lock fails
      mockOctokit.rest.issues.lock.mockRejectedValue(
        new Error('Failed to lock issue')
      );

      // Should still return the issue (lock failure is non-fatal)
      const result = await storage._getOrCreateVerificationIssue();
      expect(result.number).toBe(999);
    });
  });

  describe('Existing Issue Detection', () => {
    it('should use existing issue without creating new one', async () => {
      const existingIssue = {
        number: 500,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n```json\n{"hash1": "data1"}\n```',
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [existingIssue],
      });

      const result = await storage._getOrCreateVerificationIssue();

      expect(result.number).toBe(500);
      expect(mockOctokit.rest.issues.create).not.toHaveBeenCalled();
    });

    it('should find issue by title match', async () => {
      const wrongTitleIssue = {
        number: 501,
        title: '[Wrong Title]',
        body: '# Wrong',
      };

      const correctIssue = {
        number: 502,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n```json\n{}\n```',
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [wrongTitleIssue, correctIssue],
      });

      const result = await storage._getOrCreateVerificationIssue();

      // Should find the correct issue by title
      expect(result.number).toBe(502);
      expect(mockOctokit.rest.issues.create).not.toHaveBeenCalled();
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory with many sequential requests', async () => {
      const mockIssue = {
        number: 999,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n```json\n{}\n```',
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [mockIssue],
      });

      // Make 100 requests with time advancement
      for (let i = 0; i < 100; i++) {
        await storage._getOrCreateVerificationIssue();
        vi.advanceTimersByTime(6000);
      }

      const pendingTimers = vi.getTimerCount();
      expect(pendingTimers).toBeLessThan(5);
    });
  });

  describe('Integration with Storage Methods', () => {
    it('should work correctly when called from storeVerificationCode', async () => {
      const mockIssue = {
        number: 999,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n## Index\n```json\n{}\n```',
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [mockIssue],
      });

      mockOctokit.rest.issues.createComment.mockResolvedValue({
        data: {
          id: 12345,
          body: JSON.stringify({ code: 'encrypted' }),
        },
      });

      mockOctokit.rest.issues.update.mockResolvedValue({
        data: mockIssue,
      });

      // Call a method that uses _getOrCreateVerificationIssue
      const emailHash = 'test-hash';
      const encryptedCode = 'encrypted-code';
      const expiresAt = Date.now() + 600000;

      await storage.storeVerificationCode(emailHash, encryptedCode, expiresAt);

      // Should have created comment
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalled();
    });

    it('should handle concurrent storeVerificationCode calls', async () => {
      const mockIssue = {
        number: 999,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n## Index\n```json\n{}\n```',
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [mockIssue],
      });

      mockOctokit.rest.issues.createComment.mockResolvedValue({
        data: {
          id: 12345,
          body: JSON.stringify({ code: 'encrypted' }),
        },
      });

      mockOctokit.rest.issues.update.mockResolvedValue({
        data: mockIssue,
      });

      const expiresAt = Date.now() + 600000;

      // Make concurrent calls
      await Promise.all([
        storage.storeVerificationCode('hash1', 'code1', expiresAt),
        storage.storeVerificationCode('hash2', 'code2', expiresAt),
        storage.storeVerificationCode('hash3', 'code3', expiresAt),
      ]);

      // Should only have called listForRepo once (due to in-flight caching)
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledTimes(1);

      // But should have created 3 comments
      expect(mockOctokit.rest.issues.createComment).toHaveBeenCalledTimes(3);
    });
  });

  describe('Instance Isolation', () => {
    it('should maintain separate caches for different storage instances', async () => {
      const storage2 = new GitHubStorage({
        botToken: 'test-token-2',
        owner: 'test-owner-2',
        repo: 'test-repo-2',
        version: 'v1',
      });

      const mockIssue1 = {
        number: 100,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n```json\n{}\n```',
      };

      const mockIssue2 = {
        number: 200,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n```json\n{}\n```',
      };

      // Both instances share the same Octokit mock
      // We need to set up responses that work for both
      mockOctokit.rest.issues.listForRepo
        .mockResolvedValueOnce({ data: [] })  // First call for storage1
        .mockResolvedValueOnce({ data: [] }); // Second call for storage2

      mockOctokit.rest.issues.create
        .mockResolvedValueOnce({ data: mockIssue1 })  // First create
        .mockResolvedValueOnce({ data: mockIssue2 }); // Second create

      mockOctokit.rest.issues.lock.mockResolvedValue({});

      // Both should create their own issues
      const result1 = await storage._getOrCreateVerificationIssue();
      const result2 = await storage2._getOrCreateVerificationIssue();

      expect(result1.number).toBe(100);
      expect(result2.number).toBe(200);

      // Verify each instance has its own cache
      expect(storage._pendingVerificationIssueRequest).not.toBe(storage2._pendingVerificationIssueRequest);
    });
  });

  describe('Issue Creation Parameters', () => {
    it('should create issue with correct labels', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      const mockIssue = {
        number: 999,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n```json\n{}\n```',
      };

      mockOctokit.rest.issues.create.mockResolvedValue({
        data: mockIssue,
      });

      mockOctokit.rest.issues.lock.mockResolvedValue({});

      await storage._getOrCreateVerificationIssue();

      expect(mockOctokit.rest.issues.create).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        title: '[Email Verification]',
        body: expect.stringContaining('Email Verification Codes'),
        labels: ['email-verification', 'automated'],
      });
    });

    it('should lock the issue after creation', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      const mockIssue = {
        number: 999,
        title: '[Email Verification]',
        body: '# Email Verification Codes\n\n```json\n{}\n```',
      };

      mockOctokit.rest.issues.create.mockResolvedValue({
        data: mockIssue,
      });

      mockOctokit.rest.issues.lock.mockResolvedValue({});

      await storage._getOrCreateVerificationIssue();

      expect(mockOctokit.rest.issues.lock).toHaveBeenCalledWith({
        owner: 'test-owner',
        repo: 'test-repo',
        issue_number: 999,
        lock_reason: 'off-topic',
      });
    });
  });
});
