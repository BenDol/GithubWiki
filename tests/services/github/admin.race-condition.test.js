import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import {
  getOrCreateAdminsIssue,
  getOrCreateBannedUsersIssue,
} from '../../../src/services/github/admin.js';

// Mock dependencies
vi.mock('../../../src/services/github/api', () => ({
  getOctokit: vi.fn(),
  getAuthenticatedUser: vi.fn(),
}));

vi.mock('../../../src/services/github/botService', () => ({
  createAdminIssueWithBot: vi.fn(),
  updateAdminIssueWithBot: vi.fn(),
}));

vi.mock('../../../src/services/github/branchNamespace', () => ({
  detectCurrentBranch: vi.fn(() => Promise.resolve('main')),
}));

vi.mock('../../../src/utils/timeCache', () => ({
  getCacheValue: vi.fn(() => null),
  setCacheValue: vi.fn(),
  clearCacheValue: vi.fn(),
}));

describe('admin.js - Race Condition Protection', () => {
  let mockOctokit;
  let createAdminIssueWithBot;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Mock environment variable for bot username
    vi.stubEnv('VITE_WIKI_BOT_USERNAME', 'wiki-bot');

    // Setup Octokit mock
    mockOctokit = {
      rest: {
        issues: {
          listForRepo: vi.fn(),
          update: vi.fn(),
        },
      },
    };

    const { getOctokit } = await import('../../../src/services/github/api');
    getOctokit.mockReturnValue(mockOctokit);

    createAdminIssueWithBot = (await import('../../../src/services/github/botService')).createAdminIssueWithBot;
  });

  afterEach(() => {
    // CRITICAL: Advance time to expire cache BEFORE switching away from fake timers
    // This ensures the setTimeout from this test fires and clears the Map entry
    vi.advanceTimersByTime(6000);
    vi.useRealTimers();
    vi.unstubAllEnvs();
  });

  describe('getOrCreateAdminsIssue - Concurrent Request Handling', () => {
    it('should return the same issue for concurrent requests', async () => {
      // Mock: No existing admin issue
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      // Mock: Create new issue
      const mockIssue = {
        number: 42,
        title: '[Admin List]',
        body: '🔐 **Wiki Administrators**',
        user: { login: 'wiki-bot' },
        labels: [{ name: 'wiki-admin-list' }, { name: 'branch:main' }],
      };

      createAdminIssueWithBot.mockResolvedValue(mockIssue);

      // Mock config
      const config = {
        wiki: { repository: { branch: 'main' } },
      };

      // Make 3 concurrent requests
      const [result1, result2, result3] = await Promise.all([
        getOrCreateAdminsIssue('owner', 'repo', config),
        getOrCreateAdminsIssue('owner', 'repo', config),
        getOrCreateAdminsIssue('owner', 'repo', config),
      ]);

      // All should return the same issue
      expect(result1.number).toBe(42);
      expect(result2.number).toBe(42);
      expect(result3.number).toBe(42);

      // Should only create the issue once
      expect(createAdminIssueWithBot).toHaveBeenCalledTimes(1);
    });

    it('should cache in-flight request for 5 seconds after completion', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      const mockIssue = {
        number: 42,
        title: '[Admin List]',
        body: '🔐 **Wiki Administrators**',
        user: { login: 'wiki-bot' },
        labels: [{ name: 'wiki-admin-list' }, { name: 'branch:main' }],
      };

      createAdminIssueWithBot.mockResolvedValue(mockIssue);

      const config = {
        wiki: { repository: { branch: 'main' } },
      };

      // First request
      const result1 = await getOrCreateAdminsIssue('owner', 'repo', config);
      expect(result1.number).toBe(42);

      // Immediately after, request should still be cached
      const result2 = await getOrCreateAdminsIssue('owner', 'repo', config);
      expect(result2.number).toBe(42);

      // Should still only have called create once
      expect(createAdminIssueWithBot).toHaveBeenCalledTimes(1);

      // Advance time by 3 seconds
      vi.advanceTimersByTime(3000);

      // Request should still be cached
      const result3 = await getOrCreateAdminsIssue('owner', 'repo', config);
      expect(result3.number).toBe(42);
      expect(createAdminIssueWithBot).toHaveBeenCalledTimes(1);
    });

    it('should allow new request after 5 second cache expires', async () => {
      // Mock: No existing issue initially
      mockOctokit.rest.issues.listForRepo.mockResolvedValueOnce({
        data: [],
      });

      const mockIssue = {
        number: 42,
        title: '[Admin List]',
        body: '🔐 **Wiki Administrators**',
        user: { login: 'wiki-bot' },
        labels: [{ name: 'wiki-admin-list' }, { name: 'branch:main' }],
      };

      createAdminIssueWithBot.mockResolvedValueOnce(mockIssue);

      const config = {
        wiki: { repository: { branch: 'main' } },
      };

      // First request
      const result1 = await getOrCreateAdminsIssue('owner', 'repo', config);
      expect(result1.number).toBe(42);

      // Advance time by 5+ seconds
      vi.advanceTimersByTime(5100);

      // Mock: Now return existing issue
      mockOctokit.rest.issues.listForRepo.mockResolvedValueOnce({
        data: [mockIssue],
      });

      // Second request should make a fresh search
      const result2 = await getOrCreateAdminsIssue('owner', 'repo', config);
      expect(result2.number).toBe(42);

      // Should have searched twice
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledTimes(2);
    });

    it('should not cache failed requests', async () => {
      mockOctokit.rest.issues.listForRepo.mockRejectedValueOnce(
        new Error('GitHub API error')
      );

      const config = {
        wiki: { repository: { branch: 'main' } },
      };

      // First request fails
      await expect(
        getOrCreateAdminsIssue('owner', 'repo', config)
      ).rejects.toThrow('GitHub API error');

      // Mock: Second request succeeds
      mockOctokit.rest.issues.listForRepo.mockResolvedValueOnce({
        data: [],
      });

      const mockIssue = {
        number: 42,
        title: '[Admin List]',
        body: '🔐 **Wiki Administrators**',
        user: { login: 'wiki-bot' },
        labels: [{ name: 'wiki-admin-list' }, { name: 'branch:main' }],
      };

      createAdminIssueWithBot.mockResolvedValueOnce(mockIssue);

      // Wait for the 5 second timer from the error to expire
      vi.advanceTimersByTime(5100);

      // Second request should succeed
      const result = await getOrCreateAdminsIssue('owner', 'repo', config);
      expect(result.number).toBe(42);
    });

    it('should handle existing issue correctly', async () => {
      const existingIssue = {
        number: 100,
        title: '[Admin List]',
        body: '🔐 **Wiki Administrators**\n```json\n["admin1"]\n```',
        user: { login: 'wiki-bot' },
        labels: [{ name: 'wiki-admin-list' }, { name: 'branch:main' }],
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [existingIssue],
      });

      const config = {
        wiki: { repository: { branch: 'main' } },
      };

      const result = await getOrCreateAdminsIssue('owner', 'repo', config);

      expect(result.number).toBe(100);
      expect(createAdminIssueWithBot).not.toHaveBeenCalled();
    });

    it('should reject if admin issue created by wrong user', async () => {
      const suspiciousIssue = {
        number: 100,
        title: '[Admin List]',
        body: '🔐 **Wiki Administrators**',
        user: { login: 'hacker' },
        labels: [{ name: 'wiki-admin-list' }, { name: 'branch:main' }],
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [suspiciousIssue],
      });

      const config = {
        wiki: { repository: { branch: 'main' } },
      };

      await expect(
        getOrCreateAdminsIssue('owner', 'repo', config)
      ).rejects.toThrow('Invalid admin list issue');
    });
  });

  describe('getOrCreateBannedUsersIssue - Concurrent Request Handling', () => {
    it('should return the same issue for concurrent requests', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      const mockIssue = {
        number: 43,
        title: '[Ban List]',
        body: '🚫 **Banned Users**',
        user: { login: 'wiki-bot' },
        labels: [{ name: 'wiki-ban-list' }, { name: 'branch:main' }],
      };

      createAdminIssueWithBot.mockResolvedValue(mockIssue);

      const config = {
        wiki: { repository: { branch: 'main' } },
      };

      // Make 3 concurrent requests
      const [result1, result2, result3] = await Promise.all([
        getOrCreateBannedUsersIssue('owner', 'repo', config),
        getOrCreateBannedUsersIssue('owner', 'repo', config),
        getOrCreateBannedUsersIssue('owner', 'repo', config),
      ]);

      // All should return the same issue
      expect(result1.number).toBe(43);
      expect(result2.number).toBe(43);
      expect(result3.number).toBe(43);

      // Should only create the issue once
      expect(createAdminIssueWithBot).toHaveBeenCalledTimes(1);
    });

    it('should cache in-flight request for 5 seconds after completion', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      const mockIssue = {
        number: 43,
        title: '[Ban List]',
        body: '🚫 **Banned Users**',
        user: { login: 'wiki-bot' },
        labels: [{ name: 'wiki-ban-list' }, { name: 'branch:main' }],
      };

      createAdminIssueWithBot.mockResolvedValue(mockIssue);

      const config = {
        wiki: { repository: { branch: 'main' } },
      };

      // First request
      const result1 = await getOrCreateBannedUsersIssue('owner', 'repo', config);
      expect(result1.number).toBe(43);

      // Immediately after, request should still be cached
      const result2 = await getOrCreateBannedUsersIssue('owner', 'repo', config);
      expect(result2.number).toBe(43);

      // Should still only have called create once
      expect(createAdminIssueWithBot).toHaveBeenCalledTimes(1);

      // Advance time by 3 seconds
      vi.advanceTimersByTime(3000);

      // Request should still be cached
      const result3 = await getOrCreateBannedUsersIssue('owner', 'repo', config);
      expect(result3.number).toBe(43);
      expect(createAdminIssueWithBot).toHaveBeenCalledTimes(1);
    });

    it('should reject if ban list issue created by wrong user', async () => {
      const suspiciousIssue = {
        number: 100,
        title: '[Ban List]',
        body: '🚫 **Banned Users**',
        user: { login: 'hacker' },
        labels: [{ name: 'wiki-ban-list' }, { name: 'branch:main' }],
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [suspiciousIssue],
      });

      const config = {
        wiki: { repository: { branch: 'main' } },
      };

      await expect(
        getOrCreateBannedUsersIssue('owner', 'repo', config)
      ).rejects.toThrow('Invalid ban list issue');
    });
  });

  describe('Branch Namespace Isolation', () => {
    it('should create separate issues for different branches', async () => {
      const { detectCurrentBranch } = await import('../../../src/services/github/branchNamespace');

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      const mockIssueMain = {
        number: 42,
        title: '[Admin List]',
        body: '🔐 **Wiki Administrators**',
        user: { login: 'wiki-bot' },
        labels: [{ name: 'wiki-admin-list' }, { name: 'branch:main' }],
      };

      const mockIssueDev = {
        number: 43,
        title: '[Admin List]',
        body: '🔐 **Wiki Administrators**',
        user: { login: 'wiki-bot' },
        labels: [{ name: 'wiki-admin-list' }, { name: 'branch:dev' }],
      };

      createAdminIssueWithBot
        .mockResolvedValueOnce(mockIssueMain)
        .mockResolvedValueOnce(mockIssueDev);

      const mainConfig = {
        wiki: { repository: { branch: 'main' } },
      };

      const devConfig = {
        wiki: { repository: { branch: 'dev' } },
      };

      // Mock branch detection
      detectCurrentBranch
        .mockResolvedValueOnce('main')
        .mockResolvedValueOnce('dev');

      // Request for main branch
      const result1 = await getOrCreateAdminsIssue('owner', 'repo', mainConfig);
      expect(result1.number).toBe(42);

      // Advance time to clear cache
      vi.advanceTimersByTime(5100);

      // Request for dev branch should create different issue
      const result2 = await getOrCreateAdminsIssue('owner', 'repo', devConfig);
      expect(result2.number).toBe(43);

      // Should have created both issues
      expect(createAdminIssueWithBot).toHaveBeenCalledTimes(2);
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory with many sequential requests', async () => {
      const mockIssue = {
        number: 42,
        title: '[Admin List]',
        body: '🔐 **Wiki Administrators**',
        user: { login: 'wiki-bot' },
        labels: [{ name: 'wiki-admin-list' }, { name: 'branch:main' }],
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [mockIssue],
      });

      const config = {
        wiki: { repository: { branch: 'main' } },
      };

      // Make 100 requests with time advancement
      for (let i = 0; i < 100; i++) {
        await getOrCreateAdminsIssue('owner', 'repo', config);
        vi.advanceTimersByTime(6000);
      }

      const pendingTimers = vi.getTimerCount();
      expect(pendingTimers).toBeLessThan(5);
    });
  });
});
