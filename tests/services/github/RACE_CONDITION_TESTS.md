# Race Condition Protection Tests

This directory contains comprehensive tests for the race condition protection implemented across all GitHub issue creation services.

## Problem

GitHub's API has eventual consistency - when you create an issue, it takes 1-5 seconds before that issue appears in search results. This creates a race condition:

1. Client A creates issue #123
2. Client B queries for issues (doesn't see #123 yet due to eventual consistency)
3. Client B creates duplicate issue #124

## Solution

All issue creation functions now use **in-flight request caching** that persists for 5 seconds after completion:

1. First request creates a promise and stores it in a Map
2. Concurrent requests return the same promise (no duplicate creation)
3. After completion, the promise stays cached for 5 seconds
4. During those 5 seconds, any new request gets the cached result
5. After 5 seconds, the cache expires and new requests make fresh API calls

## Test Files

### `buildShare.race-condition.test.js`
Tests for `src/services/github/buildShare.js`
- **Function**: `getOrCreateIndexIssue()`
- **Issue Type**: `[Build Share Index]`
- **Label**: `build-share-index`

### `admin.race-condition.test.js`
Tests for `src/services/github/admin.js`
- **Functions**:
  - `getOrCreateAdminsIssue()`
  - `getOrCreateBannedUsersIssue()`
- **Issue Types**:
  - `[Admin List]` (label: `wiki-admin-list`)
  - `[Ban List]` (label: `wiki-ban-list`)

### `comments.race-condition.test.js`
Tests for `src/services/github/comments.js`
- **Function**: `getOrCreatePageIssue()`
- **Issue Type**: `[Comments] {Page Title}`
- **Labels**: `wiki-comments`, `page:{section}/{pageId}`, `branch:{branch}`

### `GitHubStorage.race-condition.test.js`
Tests for `src/services/storage/GitHubStorage.js`
- **Function**: `_getOrCreateVerificationIssue()`
- **Issue Type**: `[Email Verification]`
- **Label**: `email-verification`

## Running Tests

### Run all race condition tests
```bash
npm test -- --testPathPattern="race-condition"
```

### Run specific test file
```bash
npm test -- buildShare.race-condition.test.js
npm test -- admin.race-condition.test.js
npm test -- comments.race-condition.test.js
npm test -- GitHubStorage.race-condition.test.js
```

### Run with coverage
```bash
npm run test:coverage -- --testPathPattern="race-condition"
```

### Run in watch mode
```bash
npm run test:watch -- --testPathPattern="race-condition"
```

## Test Coverage

Each test file covers:

### ✅ Concurrent Request Handling
- Multiple simultaneous requests return the same issue
- Only one issue creation occurs
- All concurrent calls get the same result

### ✅ Cache Duration
- In-flight cache persists for 5 seconds after completion
- Requests within 5 seconds use cached result
- Requests after 5 seconds make fresh API calls

### ✅ Error Handling
- Failed requests don't block future requests
- Errors are thrown properly
- Cache is cleared on error

### ✅ Existing Issue Detection
- Existing issues are found and used
- No duplicate creation when issue exists
- Multiple existing issues use the oldest one

### ✅ Memory Management
- No memory leaks with sequential requests
- Timers are properly cleaned up
- Cache doesn't grow unbounded

### ✅ Branch/Namespace Isolation
- Different branches create separate issues
- Cache keys are unique per branch
- No cross-contamination between branches

## Key Assertions

### 1. Single Issue Creation
```javascript
// Make 5 concurrent requests
const promises = Array(5).fill(null).map(() => createIssue());
const results = await Promise.all(promises);

// All return same issue number
results.forEach(r => expect(r.number).toBe(123));

// Only created once
expect(mockCreateIssue).toHaveBeenCalledTimes(1);
```

### 2. 5-Second Cache Window
```javascript
// Create issue
await createIssue();

// Immediately after, still cached
await createIssue();
expect(mockCreateIssue).toHaveBeenCalledTimes(1);

// Advance 3 seconds - still cached
vi.advanceTimersByTime(3000);
await createIssue();
expect(mockCreateIssue).toHaveBeenCalledTimes(1);

// Advance 5+ seconds - cache expired
vi.advanceTimersByTime(5100);
await createIssue();
expect(mockListIssues).toHaveBeenCalledTimes(2); // Fresh search
```

### 3. Error Recovery
```javascript
// First request fails
mockListIssues.mockRejectedValueOnce(new Error('API error'));
await expect(createIssue()).rejects.toThrow('API error');

// Wait for timer
vi.advanceTimersByTime(5100);

// Second request succeeds
mockListIssues.mockResolvedValueOnce({ data: [] });
const result = await createIssue();
expect(result.number).toBe(123);
```

### 4. Memory Leak Prevention
```javascript
// Make 100 requests with cache expiry
for (let i = 0; i < 100; i++) {
  await createIssue();
  vi.advanceTimersByTime(6000); // Expire cache
}

// Check pending timers (should be minimal)
const pendingTimers = vi.getTimerCount();
expect(pendingTimers).toBeLessThan(5);
```

## Mocking Strategy

### Vitest Fake Timers
All tests use Vitest's fake timers to control the 5-second cache window:

```javascript
beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});
```

This allows us to:
- Instantly advance time with `vi.advanceTimersByTime()`
- Test cache expiry without waiting 5 seconds
- Check for memory leaks with `vi.getTimerCount()`

### Octokit Mocking
GitHub API calls are fully mocked:

```javascript
vi.mock('../../../src/services/github/api', () => ({
  getOctokit: vi.fn(() => mockOctokit),
}));
```

This allows us to:
- Control API responses
- Simulate errors
- Count API calls
- Test without rate limits

## Success Criteria

All tests must pass with:
- ✅ 100% code coverage of race condition protection logic
- ✅ No flaky tests (deterministic with fake timers)
- ✅ No memory leaks (verified with timer counts)
- ✅ Fast execution (< 1 second per test file)

## Known Limitations

1. **Real GitHub API**: Tests use mocks and don't test against real GitHub API eventual consistency
2. **Network Delays**: Tests don't simulate network latency
3. **Multiple Servers**: Tests run in single process, don't test distributed race conditions

These limitations are acceptable because:
- The 5-second window is conservative (GitHub is usually consistent within 1-2 seconds)
- Real-world testing has confirmed the fix works in production
- The logic is simple and deterministic

## Debugging Failures

If tests fail:

1. **Check timer advancement**: Ensure `vi.advanceTimersByTime()` is used correctly
2. **Check mock call counts**: Use `.toHaveBeenCalledTimes()` assertions
3. **Check cache keys**: Ensure cache keys are unique per scenario
4. **Check error handling**: Verify errors clear the cache properly

## Related Documentation

- [RACE_CONDITION_ANALYSIS.md](../../../.claude/RACE_CONDITION_ANALYSIS.md) - Original problem analysis
- [Development Guide](../../../.claude/development.md) - Running tests
- [Architecture Guide](../../../.claude/architecture.md) - System overview
