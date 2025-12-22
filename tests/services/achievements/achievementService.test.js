/**
 * Achievement Service Tests (Client-Side)
 * Tests for reading achievement data from GitHub
 * All achievement checking logic is now server-side
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { achievementService } from '../../../src/services/achievements/achievementService.js';

// Mock dependencies
vi.mock('../../../src/utils/logger.js', () => ({
  createLogger: () => ({
    trace: vi.fn(),
    debug: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  })
}));

vi.mock('../../../src/services/github/api.js', () => ({
  getOctokit: vi.fn()
}));

import { getOctokit } from '../../../src/services/github/api.js';

describe('achievementService (client-side)', () => {
  let mockOctokit;
  let mockFetch;

  beforeEach(() => {
    // Clear achievement definitions cache
    achievementService.clearCache();

    // Mock Octokit
    mockOctokit = {
      rest: {
        issues: {
          listForRepo: vi.fn(),
        }
      }
    };
    getOctokit.mockReturnValue(mockOctokit);

    // Mock fetch for achievement definitions
    mockFetch = vi.fn();
    global.fetch = mockFetch;
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  describe('loadAchievementDefinitions', () => {
    it('should load achievement definitions from /achievements.json', async () => {
      const mockDefinitions = {
        version: '1.0',
        categories: {
          contribution: { label: 'Contributions', icon: '📝' }
        },
        rarities: {
          common: { color: 'gray', points: 10 }
        },
        achievements: [
          { id: 'first-login', title: 'Welcome!', rarity: 'common' }
        ]
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockDefinitions
      });

      const definitions = await achievementService.loadAchievementDefinitions();

      expect(definitions).toEqual(mockDefinitions);
      expect(mockFetch).toHaveBeenCalledWith('/achievements.json');
    });

    it('should cache achievement definitions', async () => {
      const mockDefinitions = {
        version: '1.0',
        categories: {},
        rarities: {},
        achievements: []
      };

      mockFetch.mockResolvedValue({
        ok: true,
        json: async () => mockDefinitions
      });

      const first = await achievementService.loadAchievementDefinitions();

      // Clear mock calls to verify caching
      mockFetch.mockClear();

      const second = await achievementService.loadAchievementDefinitions();

      // Should only call fetch once due to caching (no calls for second request)
      expect(mockFetch).not.toHaveBeenCalled();
      expect(first).toEqual(second);
    });

    it('should return empty structure on error', async () => {
      mockFetch.mockResolvedValue({
        ok: false,
        statusText: 'Not Found'
      });

      const definitions = await achievementService.loadAchievementDefinitions();

      expect(definitions).toEqual({
        version: '1.0',
        categories: {},
        rarities: {},
        achievements: []
      });
    });
  });

  describe('getUserAchievementIssue', () => {
    it('should find achievement issue by user ID label', async () => {
      const mockIssue = {
        number: 1,
        title: '[Achievements] testuser',
        body: JSON.stringify({ achievements: [] }),
        labels: [{ name: 'achievements' }, { name: 'user-id:12345' }]
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [mockIssue]
      });

      const issue = await achievementService.getUserAchievementIssue(
        'owner',
        'repo',
        12345,
        'testuser'
      );

      expect(issue).toEqual(mockIssue);
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        labels: 'achievements,user-id:12345',
        state: 'open',
        per_page: 1
      });
    });

    it('should fallback to username in title', async () => {
      const mockIssue = {
        number: 2,
        title: '[Achievements] testuser',
        body: JSON.stringify({ achievements: [] })
      };

      mockOctokit.rest.issues.listForRepo
        .mockResolvedValueOnce({ data: [] }) // No issue by user ID
        .mockResolvedValueOnce({ data: [mockIssue] }); // Found by username

      const issue = await achievementService.getUserAchievementIssue(
        'owner',
        'repo',
        12345,
        'testuser'
      );

      expect(issue).toEqual(mockIssue);
    });

    it('should return null if no issue found', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({ data: [] });

      const issue = await achievementService.getUserAchievementIssue(
        'owner',
        'repo',
        12345,
        'testuser'
      );

      expect(issue).toBeNull();
    });
  });

  describe('getUserAchievements', () => {
    it('should parse achievements from issue body', async () => {
      const mockAchievements = {
        userId: 12345,
        username: 'testuser',
        lastUpdated: '2024-01-01T00:00:00Z',
        achievements: [
          { id: 'first-login', unlockedAt: '2024-01-01T00:00:00Z' }
        ],
        version: '1.0'
      };

      const mockIssue = {
        number: 1,
        body: JSON.stringify(mockAchievements)
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [mockIssue]
      });

      const achievements = await achievementService.getUserAchievements(
        'owner',
        'repo',
        12345,
        'testuser'
      );

      expect(achievements).toEqual(mockAchievements);
    });

    it('should return empty achievements if no issue found', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({ data: [] });

      const achievements = await achievementService.getUserAchievements(
        'owner',
        'repo',
        12345,
        'testuser'
      );

      expect(achievements).toEqual({
        userId: 12345,
        username: 'testuser',
        achievements: [],
        lastUpdated: null,
        version: '1.0'
      });
    });

    it('should handle malformed JSON gracefully', async () => {
      const mockIssue = {
        number: 1,
        body: 'invalid json'
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [mockIssue]
      });

      const achievements = await achievementService.getUserAchievements(
        'owner',
        'repo',
        12345,
        'testuser'
      );

      expect(achievements).toEqual({
        userId: 12345,
        username: 'testuser',
        achievements: [],
        lastUpdated: null,
        version: '1.0'
      });
    });
  });

  describe('getAchievementStats', () => {
    it('should load achievement stats from cache issue', async () => {
      const mockStats = {
        lastUpdated: '2024-01-01T00:00:00Z',
        totalUsers: 100,
        achievements: {
          'first-login': { count: 95, percentage: 95 },
          'first-pr': { count: 50, percentage: 50 }
        }
      };

      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [{
          number: 1,
          body: JSON.stringify(mockStats)
        }]
      });

      const stats = await achievementService.getAchievementStats('owner', 'repo');

      expect(stats).toEqual(mockStats);
      expect(mockOctokit.rest.issues.listForRepo).toHaveBeenCalledWith({
        owner: 'owner',
        repo: 'repo',
        labels: 'achievement-stats',
        state: 'open',
        per_page: 1
      });
    });

    it('should return empty object if no stats cache found', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({ data: [] });

      const stats = await achievementService.getAchievementStats('owner', 'repo');

      expect(stats).toEqual({ achievements: {} });
    });

    it('should handle malformed stats gracefully', async () => {
      mockOctokit.rest.issues.listForRepo.mockResolvedValue({
        data: [{
          number: 1,
          body: 'invalid json'
        }]
      });

      const stats = await achievementService.getAchievementStats('owner', 'repo');

      expect(stats).toEqual({ achievements: {} });
    });
  });
});
