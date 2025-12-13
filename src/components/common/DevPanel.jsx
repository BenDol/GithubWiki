import { useState } from 'react';
import { useDevStore } from '../../store/devStore';

/**
 * Developer Tools Panel
 * Shows errors, warnings, and logs for debugging
 * Toggle with Ctrl+Shift+D
 */
const DevPanel = () => {
  const { logs, isDevPanelOpen, toggleDevPanel, clearLogs, exportLogs } = useDevStore();

  const clearLogFile = async () => {
    try {
      await fetch('/api/log', { method: 'DELETE' });
      clearLogs();

      // Add a fake success log to the panel (not written to file)
      const fakeLog = {
        id: Date.now() + Math.random(),
        type: 'success',
        message: 'Log file cleared successfully (logs/debug.log)',
        data: null,
        timestamp: new Date().toISOString(),
        stack: null,
      };

      // Directly add to store without triggering file write
      useDevStore.setState((state) => ({
        logs: [fakeLog, ...state.logs].slice(0, state.maxLogs),
      }));
    } catch (error) {
      console.error('Failed to clear log file:', error);
    }
  };
  const [filter, setFilter] = useState('all'); // 'all', 'error', 'warn', 'info', 'success'

  const filteredLogs = filter === 'all'
    ? logs
    : logs.filter(log => log.type === filter);

  const logCounts = {
    error: logs.filter(l => l.type === 'error').length,
    warn: logs.filter(l => l.type === 'warn').length,
    info: logs.filter(l => l.type === 'info').length,
    success: logs.filter(l => l.type === 'success').length,
  };

  // Only show in development environment
  if (!import.meta.env.DEV) {
    return null;
  }

  if (!isDevPanelOpen) {
    return (
      <button
        onClick={toggleDevPanel}
        className="fixed bottom-4 left-4 z-50 px-3 py-2 bg-gray-800 text-white rounded-lg shadow-lg hover:bg-gray-700 transition-colors text-xl"
        title="Open Developer Panel (Ctrl+Shift+D)"
      >
        🛠️ {logs.length > 0 && <span className="absolute -top-1 -right-1 bg-red-500 text-white text-xs rounded-full h-5 w-5 flex items-center justify-center">{logs.length}</span>}
      </button>
    );
  }

  return (
    <div className="fixed bottom-0 left-0 right-0 z-50 bg-gray-900 text-gray-100 shadow-2xl border-t-2 border-blue-500">
      {/* Header */}
      <div className="flex items-center justify-between px-4 py-2 bg-gray-800 border-b border-gray-700">
        <div className="flex items-center space-x-4">
          <h3 className="text-sm font-bold text-white">🛠️ Developer Tools</h3>

          {/* Filter buttons */}
          <div className="flex items-center space-x-1">
            <button
              onClick={() => setFilter('all')}
              className={`px-2 py-1 text-xs rounded ${
                filter === 'all'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              All ({logs.length})
            </button>
            <button
              onClick={() => setFilter('error')}
              className={`px-2 py-1 text-xs rounded ${
                filter === 'error'
                  ? 'bg-red-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Errors ({logCounts.error})
            </button>
            <button
              onClick={() => setFilter('warn')}
              className={`px-2 py-1 text-xs rounded ${
                filter === 'warn'
                  ? 'bg-yellow-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Warnings ({logCounts.warn})
            </button>
            <button
              onClick={() => setFilter('info')}
              className={`px-2 py-1 text-xs rounded ${
                filter === 'info'
                  ? 'bg-blue-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Info ({logCounts.info})
            </button>
            <button
              onClick={() => setFilter('success')}
              className={`px-2 py-1 text-xs rounded ${
                filter === 'success'
                  ? 'bg-green-600 text-white'
                  : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
              }`}
            >
              Success ({logCounts.success})
            </button>
          </div>
        </div>

        <div className="flex items-center space-x-2">
          <button
            onClick={exportLogs}
            className="px-3 py-1 text-xs bg-blue-600 text-white rounded hover:bg-blue-700 transition-colors"
            title="Export logs to file"
          >
            📥 Export
          </button>
          <button
            onClick={clearLogs}
            className="px-3 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
            title="Clear panel logs"
          >
            🗑️ Clear Panel
          </button>
          <button
            onClick={clearLogFile}
            className="px-3 py-1 text-xs bg-red-600 text-white rounded hover:bg-red-700 transition-colors"
            title="Clear log file on disk"
          >
            🗑️ Clear File
          </button>
          <button
            onClick={toggleDevPanel}
            className="px-3 py-1 text-xs bg-gray-700 text-white rounded hover:bg-gray-600 transition-colors"
            title="Close panel (Ctrl+Shift+D)"
          >
            ✕
          </button>
        </div>
      </div>

      {/* Logs container */}
      <div className="overflow-y-auto max-h-80 p-3 space-y-2 font-mono text-xs">
        {filteredLogs.length === 0 ? (
          <div className="text-center text-gray-500 py-8">
            No logs to display
          </div>
        ) : (
          filteredLogs.map((log) => (
            <LogEntry key={log.id} log={log} />
          ))
        )}
      </div>
    </div>
  );
};

const LogEntry = ({ log }) => {
  const [expanded, setExpanded] = useState(false);

  const typeColors = {
    error: 'bg-red-900/50 border-red-600 text-red-200',
    warn: 'bg-yellow-900/50 border-yellow-600 text-yellow-200',
    info: 'bg-blue-900/50 border-blue-600 text-blue-200',
    success: 'bg-green-900/50 border-green-600 text-green-200',
  };

  const typeIcons = {
    error: '❌',
    warn: '⚠️',
    info: 'ℹ️',
    success: '✅',
  };

  const timestamp = new Date(log.timestamp).toLocaleTimeString();

  return (
    <div className={`border-l-4 p-2 rounded ${typeColors[log.type]}`}>
      <div className="flex items-start justify-between">
        <div className="flex-1">
          <div className="flex items-center space-x-2">
            <span>{typeIcons[log.type]}</span>
            <span className="text-gray-400 text-xs">{timestamp}</span>
            <span className="font-semibold">[{log.type.toUpperCase()}]</span>
          </div>
          <div className="mt-1">{log.message}</div>
        </div>

        {(log.data || log.stack) && (
          <button
            onClick={() => setExpanded(!expanded)}
            className="ml-2 px-2 py-1 text-xs bg-gray-800 rounded hover:bg-gray-700"
          >
            {expanded ? '▼' : '▶'}
          </button>
        )}
      </div>

      {expanded && (
        <div className="mt-2 space-y-2">
          {log.data && (
            <div className="bg-gray-800 p-2 rounded overflow-x-auto">
              <div className="text-gray-400 text-xs mb-1">Data:</div>
              <pre className="text-xs whitespace-pre-wrap">
                {JSON.stringify(log.data, null, 2)}
              </pre>
            </div>
          )}

          {log.stack && (
            <div className="bg-gray-800 p-2 rounded overflow-x-auto">
              <div className="text-gray-400 text-xs mb-1">Stack Trace:</div>
              <pre className="text-xs whitespace-pre-wrap">{log.stack}</pre>
            </div>
          )}
        </div>
      )}
    </div>
  );
};

export default DevPanel;
