import React from 'react'
import ReactDOM from 'react-dom/client'
import App from './App.jsx'
import ErrorBoundary from './components/common/ErrorBoundary.jsx'
import './styles/index.css'
import { cleanupExpiredCache } from './services/github/dynamicPageLoader'

// Cleanup expired dynamic page cache on app boot
cleanupExpiredCache();

// Migrate old hash-based URLs to new browser routing URLs
// This ensures backwards compatibility for bookmarked links
if (window.location.hash.startsWith('#/')) {
  const hashPath = window.location.hash.slice(1); // Remove the '#'
  const newUrl = window.location.pathname + hashPath + window.location.search;
  window.history.replaceState(null, '', newUrl);
  console.log('[Router Migration] Redirected hash URL to:', newUrl);
}

ReactDOM.createRoot(document.getElementById('root')).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>,
)
