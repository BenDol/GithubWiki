import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { getOrCreatePageIssue } from '../../../src/services/github/comments.js';

// Mock dependencies
vi.mock('../../../src/services/github/api', () => ({
  getOctokit: vi.fn(),
}));

vi.mock('../../../src/services/github/botService', () => ({
  createCommentIssueWithBot: vi.fn(),
}));

vi.mock('../../../src/utils/githubLabelUtils', () => ({
  createPageLabel: vi.fn((sectionId, pageId) => `page:${sectionId}/${pageId}`),
  createBranchLabel: vi.fn((branch) => `branch:${branch}`),
}));

describe('comments.js - Race Condition Protection', () => {
  let mockOctokit;
  let createCommentIssueWithBot;

  beforeEach(async () => {
    vi.clearAllMocks();
    vi.useFakeTimers();

    // Setup Octokit mock
    mockOctokit = {
      rest: {
        issues: {
          listForRepo: vi.fn(),
          listComments: vi.fn(),
          createComment: vi.fn(),
        },
        reactions: {
          createForIssueComment: vi.fn(),
        },
      },
    };

    const { getOctokit } = await import('../../../src/services/github/api');
    getOctokit.mockReturnValue(mockOctokit);

    createCommentIssueWithBot = (await import('../../../src/services/github/botService')).createCommentIssueWithBot;
  });

  afterEach(() => {
    // CRITICAL: Advance time to expire cache BEFORE switching away from fake timers
    // This ensures the setTimeout from this test fires and clears the Map entry
    vi.advanceTimersByTime(6000);
    vi.useRealTimers();
  });

  describe('Concurrent Request Handling', () => {
    it('should return the same issue for concurrent requests', async () => {
      // Mock: No existing comment issue
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      // Mock: Create new issue
      const mockIssue = {
        number: 555,
        title: '[Comments] Test Page',
        body: '💬 **Comments for:** Test Page',
      };

      createCommentIssueWithBot.mockResolvedValue(mockIssue);

      // Make 5 concurrent requests for the same page
      const promises = Array(5).fill(null).map(() =>
        getOrCreatePageIssue(
          'owner',
          'repo',
          'section',
          'test-page',
          'Test Page',
          '/section/test-page',
          'main'
        )
      );

      const results = await Promise.all(promises);

      // All should return the same issue
      results.forEach(result => {
        expect(result.number).toBe(555);
      });

      // Should only create the issue once
      expect(createCommentIssueWithBot).toHaveBeenCalledTimes(1);
    });

    it('should cache in-flight request for 5 seconds after completion', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      const mockIssue = {
        number: 555,
        title: '[Comments] Test Page',
        body: '💬 **Comments for:** Test Page',
      };

      createCommentIssueWithBot.mockResolvedValue(mockIssue);

      // First request
      const result1 = await getOrCreatePageIssue(
        'owner',
        'repo',
        'section',
        'test-page',
        'Test Page',
        '/section/test-page',
        'main'
      );
      expect(result1.number).toBe(555);

      // Immediately after, request should still be cached
      const result2 = await getOrCreatePageIssue(
        'owner',
        'repo',
        'section',
        'test-page',
        'Test Page',
        '/section/test-page',
        'main'
      );
      expect(result2.number).toBe(555);

      // Should still only have called create once
      expect(createCommentIssueWithBot).toHaveBeenCalledTimes(1);

      // Advance time by 3 seconds
      vi.advanceTimersByTime(3000);

      // Request should still be cached
      const result3 = await getOrCreatePageIssue(
        'owner',
        'repo',
        'section',
        'test-page',
        'Test Page',
        '/section/test-page',
        'main'
      );
      expect(result3.number).toBe(555);
      expect(createCommentIssueWithBot).toHaveBeenCalledTimes(1);
    });

    it('should allow new request after 5 second cache expires', async () => {
      // First call: no existing issue
      mockOctokit.rest.issues.listForRepo.mockResolvedValueOnce({
        data: [],
      });

      const mockIssue = {
        number: 555,
        title: '[Comments] Test Page',
        body: '💬 **Comments for:** Test Page',
      };

      createCommentIssueWithBot.mockResolvedValueOnce(mockIssue);

      // First request
      const result1 = await getOrCreatePageIssue(
        'owner',
        'repo',
        'section',
        'test-page',
        'Test Page',
        '/section/test-page',
        'main'
      );
      expect(result1.number).toBe(555);

      // Advance time by 5+ seconds
      vi.advanceTimersByTime(5100);

      // Second call: now return existing issue
      mockOctokit.rest.issues.listForRepo.mockResolvedValueOnce({
        data: [mockIssue],
      });

      // Second request should make a fresh search
      const result2 = await getOrCreatePageIssue(
        'owner',
        'repo',
        'section',
        'test-page',
        'Test Page',
        '/section/test-page',
        'main'
      );
      expect(result2.number).toBe(555);

      // Should have searched twice
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledTimes(2);
    });

    it('should handle different pages independently', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      const mockIssue1 = {
        number: 100,
        title: '[Comments] Page 1',
        body: '💬 **Comments for:** Page 1',
      };

      const mockIssue2 = {
        number: 101,
        title: '[Comments] Page 2',
        body: '💬 **Comments for:** Page 2',
      };

      createCommentIssueWithBot
        .mockResolvedValueOnce(mockIssue1)
        .mockResolvedValueOnce(mockIssue2);

      // Request for page 1
      const result1 = await getOrCreatePageIssue(
        'owner',
        'repo',
        'section',
        'page-1',
        'Page 1',
        '/section/page-1',
        'main'
      );

      // Request for page 2 (different cache key)
      const result2 = await getOrCreatePageIssue(
        'owner',
        'repo',
        'section',
        'page-2',
        'Page 2',
        '/section/page-2',
        'main'
      );

      expect(result1.number).toBe(100);
      expect(result2.number).toBe(101);

      // Should have created both issues
      expect(createCommentIssueWithBot).toHaveBeenCalledTimes(2);
    });
  });

  describe('Error Handling', () => {
    it('should not cache failed requests', async () => {
      // Mock: listForRepo fails
      mockOctokit.rest.issues.listForRepo.mockRejectedValueOnce(
        new Error('GitHub API error')
      );

      // Mock: Bot service also fails so the entire operation fails
      createCommentIssueWithBot.mockRejectedValueOnce(
        new Error('GitHub API error')
      );

      // First request fails
      await expect(
        getOrCreatePageIssue(
          'owner',
          'repo',
          'section',
          'test-page',
          'Test Page',
          '/section/test-page',
          'main'
        )
      ).rejects.toThrow('GitHub API error');

      // Wait for timer to expire
      vi.advanceTimersByTime(5100);

      // Mock: Second request succeeds
      mockOctokit.rest.issues.listForRepo.mockResolvedValueOnce({
        data: [],
      });

      const mockIssue = {
        number: 555,
        title: '[Comments] Test Page',
        body: '💬 **Comments for:** Test Page',
      };

      createCommentIssueWithBot.mockResolvedValueOnce(mockIssue);

      // Second request should succeed
      const result = await getOrCreatePageIssue(
        'owner',
        'repo',
        'section',
        'test-page',
        'Test Page',
        '/section/test-page',
        'main'
      );
      expect(result.number).toBe(555);
    });

    it('should handle bot service errors', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      createCommentIssueWithBot.mockRejectedValueOnce(
        new Error('Bot token not configured')
      );

      await expect(
        getOrCreatePageIssue(
          'owner',
          'repo',
          'section',
          'test-page',
          'Test Page',
          '/section/test-page',
          'main'
        )
      ).rejects.toThrow('Comment system requires bot token configuration');
    });
  });

  describe('Existing Issue Detection', () => {
    it('should use existing issue without creating new one', async () => {
      const existingIssue = {
        number: 200,
        title: '[Comments] Test Page',
        body: '💬 **Comments for:** Test Page',
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [existingIssue],
      });

      const result = await getOrCreatePageIssue(
        'owner',
        'repo',
        'section',
        'test-page',
        'Test Page',
        '/section/test-page',
        'main'
      );

      expect(result.number).toBe(200);
      expect(createCommentIssueWithBot).not.toHaveBeenCalled();
    });

    it('should find existing issue by labels', async () => {
      const existingIssue = {
        number: 200,
        title: '[Comments] Different Title',
        body: '💬 **Comments for:** Different Title',
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [existingIssue],
      });

      const result = await getOrCreatePageIssue(
        'owner',
        'repo',
        'section',
        'test-page',
        'Test Page',
        '/section/test-page',
        'main'
      );

      // Should find by labels, not title
      expect(result.number).toBe(200);
      expect(createCommentIssueWithBot).not.toHaveBeenCalled();
    });
  });

  describe('Branch Namespace Isolation', () => {
    it('should create separate issues for different branches', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      const mockIssueMain = {
        number: 100,
        title: '[Comments] Test Page',
        body: '💬 **Comments for:** Test Page',
      };

      const mockIssueDev = {
        number: 101,
        title: '[Comments] Test Page',
        body: '💬 **Comments for:** Test Page',
      };

      createCommentIssueWithBot
        .mockResolvedValueOnce(mockIssueMain)
        .mockResolvedValueOnce(mockIssueDev);

      // Request for main branch
      const result1 = await getOrCreatePageIssue(
        'owner',
        'repo',
        'section',
        'test-page',
        'Test Page',
        '/section/test-page',
        'main'
      );

      // Advance time to clear cache
      vi.advanceTimersByTime(5100);

      // Request for dev branch
      const result2 = await getOrCreatePageIssue(
        'owner',
        'repo',
        'section',
        'test-page',
        'Test Page',
        '/section/test-page',
        'dev'
      );

      expect(result1.number).toBe(100);
      expect(result2.number).toBe(101);

      // Should have created both issues
      expect(createCommentIssueWithBot).toHaveBeenCalledTimes(2);
    });
  });

  describe('Memory Management', () => {
    it('should not leak memory with many sequential requests', async () => {
      const mockIssue = {
        number: 555,
        title: '[Comments] Test Page',
        body: '💬 **Comments for:** Test Page',
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [mockIssue],
      });

      // Make 100 requests with time advancement
      for (let i = 0; i < 100; i++) {
        await getOrCreatePageIssue(
          'owner',
          'repo',
          'section',
          'test-page',
          'Test Page',
          '/section/test-page',
          'main'
        );
        vi.advanceTimersByTime(6000);
      }

      const pendingTimers = vi.getTimerCount();
      expect(pendingTimers).toBeLessThan(5);
    });

    it('should handle many different pages without memory leak', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      // Create issues for 50 different pages
      for (let i = 0; i < 50; i++) {
        const mockIssue = {
          number: 100 + i,
          title: `[Comments] Page ${i}`,
          body: `💬 **Comments for:** Page ${i}`,
        };

        createCommentIssueWithBot.mockResolvedValueOnce(mockIssue);

        await getOrCreatePageIssue(
          'owner',
          'repo',
          'section',
          `page-${i}`,
          `Page ${i}`,
          `/section/page-${i}`,
          'main'
        );

        // Advance time to expire cache
        vi.advanceTimersByTime(6000);
      }

      const pendingTimers = vi.getTimerCount();
      expect(pendingTimers).toBeLessThan(10);
    });
  });

  describe('Cache Key Uniqueness', () => {
    it('should use unique cache keys for different repo/section/page/branch combinations', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [],
      });

      const scenarios = [
        { owner: 'owner1', repo: 'repo1', section: 'sec1', page: 'page1', branch: 'main' },
        { owner: 'owner1', repo: 'repo1', section: 'sec1', page: 'page2', branch: 'main' },
        { owner: 'owner1', repo: 'repo1', section: 'sec2', page: 'page1', branch: 'main' },
        { owner: 'owner1', repo: 'repo2', section: 'sec1', page: 'page1', branch: 'main' },
        { owner: 'owner2', repo: 'repo1', section: 'sec1', page: 'page1', branch: 'main' },
        { owner: 'owner1', repo: 'repo1', section: 'sec1', page: 'page1', branch: 'dev' },
      ];

      for (let i = 0; i < scenarios.length; i++) {
        const scenario = scenarios[i];
        const mockIssue = {
          number: 100 + i,
          title: `[Comments] Page ${i}`,
          body: `💬 **Comments for:** Page ${i}`,
        };

        createCommentIssueWithBot.mockResolvedValueOnce(mockIssue);

        const result = await getOrCreatePageIssue(
          scenario.owner,
          scenario.repo,
          scenario.section,
          scenario.page,
          `Page ${i}`,
          `/section/page-${i}`,
          scenario.branch
        );

        expect(result.number).toBe(100 + i);

        // Advance time to clear cache for next scenario
        vi.advanceTimersByTime(5100);
      }

      // Should have created all 6 issues (different cache keys)
      expect(createCommentIssueWithBot).toHaveBeenCalledTimes(6);
    });
  });
});
