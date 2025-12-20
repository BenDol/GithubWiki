import { create } from 'zustand';

/**
 * Check if remote logging is enabled in config
 * @returns {boolean} True if remote logging should be enabled
 */
function isRemoteLoggingEnabled() {
  try {
    // Access global wiki config (set by App.jsx)
    const config = window.__WIKI_CONFIG__;
    // If config exists, use its setting; otherwise default to false to be safe
    return config?.features?.enableRemoteLoggingInDev ?? false;
  } catch (error) {
    // Default to false if config not available (fail safe)
    return false;
  }
}

/**
 * Remote Logging Queue
 * Batches and debounces log requests to prevent overwhelming the server
 *
 * Features:
 * - Automatic batching of multiple logs into single requests
 * - Debouncing to wait for log bursts to finish before sending
 * - Retry logic with exponential backoff on network failures
 * - Prevents concurrent requests to avoid race conditions
 * - Automatically processes when queue gets large (50+ logs)
 *
 * Configuration:
 * - maxBatchSize: Maximum logs per request (default: 50)
 * - debounceDelay: Wait time after last log before sending (default: 500ms)
 * - maxRetries: Number of retry attempts on failure (default: 3)
 * - retryDelay: Base delay for exponential backoff (default: 1000ms)
 */
class RemoteLogQueue {
  constructor() {
    this.queue = [];
    this.isProcessing = false;
    this.debounceTimer = null;
    this.maxBatchSize = 50; // Maximum logs per batch
    this.debounceDelay = 500; // Wait 500ms after last log before sending
    this.maxRetries = 3;
    this.retryDelay = 1000;
  }

  /**
   * Add a log to the queue
   * @param {Object} log - Log object to send
   */
  add(log) {
    this.queue.push(log);

    // Clear existing debounce timer
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
    }

    // If queue is getting large, process immediately
    if (this.queue.length >= this.maxBatchSize) {
      this.process();
    } else {
      // Otherwise, wait for debounce period
      this.debounceTimer = setTimeout(() => {
        this.process();
      }, this.debounceDelay);
    }
  }

  /**
   * Process the queue by sending logs in batches
   */
  async process() {
    // Prevent concurrent processing
    if (this.isProcessing || this.queue.length === 0) {
      return;
    }

    this.isProcessing = true;

    try {
      // Take a batch from the queue
      const batch = this.queue.splice(0, this.maxBatchSize);

      // Send batch with retry logic
      await this.sendBatch(batch, 0);
    } catch (error) {
      console.error('[RemoteLogQueue] Failed to send batch after retries:', error);
    } finally {
      this.isProcessing = false;

      // If there are more logs in queue, process them
      if (this.queue.length > 0) {
        setTimeout(() => this.process(), 100);
      }
    }
  }

  /**
   * Send a batch of logs with retry logic
   * @param {Array} batch - Array of log objects
   * @param {number} retryCount - Current retry attempt
   */
  async sendBatch(batch, retryCount) {
    try {
      const response = await fetch('/api/log', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          logs: batch, // Send as array of logs
          timestamp: new Date().toISOString(),
        }),
      });

      if (!response.ok) {
        throw new Error(`HTTP ${response.status}: ${response.statusText}`);
      }
    } catch (error) {
      // Retry with exponential backoff
      if (retryCount < this.maxRetries) {
        const delay = this.retryDelay * Math.pow(2, retryCount);
        console.warn(`[RemoteLogQueue] Retry ${retryCount + 1}/${this.maxRetries} after ${delay}ms`);

        await new Promise(resolve => setTimeout(resolve, delay));
        return this.sendBatch(batch, retryCount + 1);
      } else {
        // After max retries, give up but don't crash
        throw error;
      }
    }
  }

  /**
   * Clear the queue (useful for cleanup or testing)
   */
  clear() {
    this.queue = [];
    if (this.debounceTimer) {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = null;
    }
  }

  /**
   * Get queue statistics for debugging
   * @returns {Object} Queue stats
   */
  getStats() {
    return {
      queueLength: this.queue.length,
      isProcessing: this.isProcessing,
      hasDebounceTimer: this.debounceTimer !== null,
      config: {
        maxBatchSize: this.maxBatchSize,
        debounceDelay: this.debounceDelay,
        maxRetries: this.maxRetries,
        retryDelay: this.retryDelay,
      }
    };
  }
}

// Create singleton instance
const remoteLogQueue = new RemoteLogQueue();

// Export for debugging
export { remoteLogQueue };

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

    // Send to log file endpoint (development only, if enabled in config)
    // Uses queue system with batching and debouncing to prevent overwhelming the server
    if (import.meta.env.DEV && isRemoteLoggingEnabled()) {
      remoteLogQueue.add({
        type: log.type,
        message: log.message,
        data: log.data,
        stack: log.stack,
        timestamp: log.timestamp,
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

  getQueueStats: () => {
    return remoteLogQueue.getStats();
  },

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
    // Defer state update to avoid "setState during render" warnings
    queueMicrotask(() => {
      useDevStore.getState().addLog('info', formatConsoleArgs(args), null);
    });
  };

  // Override console.error
  console.error = function (...args) {
    originalConsole.error.apply(console, args);
    // Defer state update to avoid "setState during render" warnings
    queueMicrotask(() => {
      useDevStore.getState().addLog('error', formatConsoleArgs(args), null);
    });
  };

  // Override console.warn
  console.warn = function (...args) {
    originalConsole.warn.apply(console, args);
    // Defer state update to avoid "setState during render" warnings
    queueMicrotask(() => {
      useDevStore.getState().addLog('warn', formatConsoleArgs(args), null);
    });
  };

  // Override console.info
  console.info = function (...args) {
    originalConsole.info.apply(console, args);
    // Defer state update to avoid "setState during render" warnings
    queueMicrotask(() => {
      useDevStore.getState().addLog('info', formatConsoleArgs(args), null);
    });
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
