import { create } from 'zustand';

/**
 * Developer tools store
 * Captures errors, warnings, and logs for debugging
 */
export const useDevStore = create((set, get) => ({
  // State
  logs: [],
  isDevPanelOpen: false,
  maxLogs: 100,

  // Actions
  toggleDevPanel: () => set((state) => ({ isDevPanelOpen: !state.isDevPanelOpen })),

  addLog: (type, message, data = null) => {
    const log = {
      id: Date.now() + Math.random(),
      type, // 'error', 'warn', 'info', 'success'
      message,
      data,
      timestamp: new Date().toISOString(),
      stack: type === 'error' ? new Error().stack : null,
    };

    set((state) => {
      const newLogs = [log, ...state.logs].slice(0, state.maxLogs);
      return { logs: newLogs };
    });

    // Send to log file endpoint (development only)
    if (import.meta.env.DEV) {
      fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: log.type,
          message: log.message,
          data: log.data,
          stack: log.stack,
        }),
      }).catch(() => {
        // Silently fail if logging endpoint is not available
      });
    }
  },

  logError: (message, error) => {
    get().addLog('error', message, error);
  },

  logWarn: (message, data) => {
    get().addLog('warn', message, data);
  },

  logInfo: (message, data) => {
    get().addLog('info', message, data);
  },

  logSuccess: (message, data) => {
    get().addLog('success', message, data);
  },

  clearLogs: () => set({ logs: [] }),

  exportLogs: () => {
    const logs = get().logs;
    const logText = logs
      .map((log) => {
        const data = log.data ? `\nData: ${JSON.stringify(log.data, null, 2)}` : '';
        const stack = log.stack ? `\nStack: ${log.stack}` : '';
        return `[${log.timestamp}] [${log.type.toUpperCase()}] ${log.message}${data}${stack}`;
      })
      .join('\n\n---\n\n');

    // Create download
    const blob = new Blob([logText], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `wiki-logs-${new Date().toISOString().replace(/[:.]/g, '-')}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  },
}));

// Intercept console methods to capture all logs
if (typeof window !== 'undefined') {
  // Store original console methods
  const originalConsole = {
    log: console.log,
    error: console.error,
    warn: console.warn,
    info: console.info,
  };

  // Override console.log
  console.log = function (...args) {
    originalConsole.log.apply(console, args);
    useDevStore.getState().addLog('info', formatConsoleArgs(args), null);
  };

  // Override console.error
  console.error = function (...args) {
    originalConsole.error.apply(console, args);
    useDevStore.getState().addLog('error', formatConsoleArgs(args), null);
  };

  // Override console.warn
  console.warn = function (...args) {
    originalConsole.warn.apply(console, args);
    useDevStore.getState().addLog('warn', formatConsoleArgs(args), null);
  };

  // Override console.info
  console.info = function (...args) {
    originalConsole.info.apply(console, args);
    useDevStore.getState().addLog('info', formatConsoleArgs(args), null);
  };

  // Global error handler
  window.addEventListener('error', (event) => {
    useDevStore.getState().logError(
      `Uncaught Error: ${event.message}`,
      {
        filename: event.filename,
        lineno: event.lineno,
        colno: event.colno,
        error: event.error?.message,
        stack: event.error?.stack,
      }
    );
  });

  window.addEventListener('unhandledrejection', (event) => {
    useDevStore.getState().logError(
      `Unhandled Promise Rejection: ${event.reason}`,
      {
        reason: event.reason,
        promise: event.promise,
      }
    );
  });
}

// Helper to format console arguments
function formatConsoleArgs(args) {
  return args
    .map((arg) => {
      if (typeof arg === 'object') {
        try {
          return JSON.stringify(arg, null, 2);
        } catch (e) {
          return String(arg);
        }
      }
      return String(arg);
    })
    .join(' ');
}
