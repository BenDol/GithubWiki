# Chunk Loading Error Recovery

## Problem

When users have a long-running session and a new deployment happens:

1. User loads site → Gets `index.html` with references to `chunk-ABC123.js`
2. New deployment happens → Vite generates new chunks `chunk-XYZ789.js`
3. User navigates → Browser tries to load old `chunk-ABC123.js`
4. **404 Error** → "Failed to fetch dynamically imported module"

## Solution

**Automatic recovery** with three layers of protection:

### 1. Lazy Loading Wrapper (`lazyWithRetry.js`)
- Wraps all `lazy()` imports in `router.jsx`
- Detects chunk load errors at the source
- Automatically reloads page once to get fresh chunk manifest
- Uses sessionStorage to prevent infinite reload loops

### 2. Route Error Boundary (`RouteErrorBoundary.jsx`)
- Fallback detection for routing-level errors
- Shows user-friendly "Update Required" message
- Automatically reloads if chunk error detected

### 3. Component Error Boundary (`ErrorBoundary.jsx`)
- Fallback detection for component-level errors
- Handles errors that slip through other layers
- Same auto-reload behavior

## User Experience

**Before:**
```
User clicks page → ERROR → Must manually reload → Works
```

**After:**
```
User clicks page → Brief flash → Auto-reload → Works seamlessly
```

## Implementation Details

### Detection Patterns

Chunk loading errors are identified by:
- `"Failed to fetch dynamically imported module"`
- `"Failed to fetch module"`
- `"error loading dynamically imported module"`
- `error.name === 'ChunkLoadError'`

### Reload Logic

```javascript
// First attempt: Auto-reload
if (!sessionStorage.getItem('retry-lazy-refresh-${componentName}')) {
  sessionStorage.setItem('retry-lazy-refresh-${componentName}', 'true');
  window.location.reload();
}

// Second attempt: Show error (prevents infinite loop)
else {
  sessionStorage.removeItem('retry-lazy-refresh-${componentName}');
  // Error displayed to user
}
```

### SessionStorage Keys

- `retry-lazy-refresh-{ComponentName}` - Per-component reload tracking
- `chunk-load-error-refreshed` - Global error boundary reload tracking

Keys are cleared after successful load or after showing error to allow future retries.

## Testing

To test this feature:

1. Build production: `npm run build`
2. Serve: `npx serve dist`
3. Open site in browser
4. **Simulate deployment:**
   - Rebuild: `npm run build` (generates new chunk hashes)
   - Don't refresh browser tab
5. Navigate to different page
6. Should auto-reload seamlessly

## Configuration

No configuration needed - works automatically for all lazy-loaded routes.

To add retry logic to custom routes:

```javascript
import { lazy } from 'react';
import lazyWithRetry from './utils/lazyWithRetry';

const CustomPage = lazy(() => lazyWithRetry(
  () => import('./pages/CustomPage'),
  'CustomPage'
));
```

## Browser Support

- Uses `sessionStorage` (supported in all modern browsers)
- Uses `window.location.reload()` (universal support)
- No polyfills required
