import { useState, useEffect, useRef } from 'react';
import { Loader } from 'lucide-react';

/**
 * LoginModal component
 * Shared modal for GitHub Device Flow authentication
 */
const LoginModal = ({
  showModal,
  deviceFlow,
  error,
  isWaiting,
  onCancel,
  onCopyCode,
  onOpenGitHub,
}) => {
  const [hasCodeBeenCopied, setHasCodeBeenCopied] = useState(false);
  const codeElementRef = useRef(null);

  // Reset copied state when modal opens/closes or device flow changes
  useEffect(() => {
    if (showModal && deviceFlow) {
      setHasCodeBeenCopied(false);
    }
  }, [showModal, deviceFlow?.userCode]);

  // Listen for copy/cut events
  useEffect(() => {
    const handleCopy = (e) => {
      // Check if the selection includes the user code
      const selection = window.getSelection().toString();
      if (selection && deviceFlow?.userCode && selection.includes(deviceFlow.userCode)) {
        setHasCodeBeenCopied(true);
      }
    };

    const handleKeyDown = (e) => {
      // Check for Ctrl+C or Ctrl+X (Cmd+C/X on Mac)
      if ((e.ctrlKey || e.metaKey) && (e.key === 'c' || e.key === 'x')) {
        const selection = window.getSelection().toString();
        if (selection && deviceFlow?.userCode && selection.includes(deviceFlow.userCode)) {
          setHasCodeBeenCopied(true);
        }
      }
    };

    if (showModal && deviceFlow) {
      document.addEventListener('copy', handleCopy);
      document.addEventListener('cut', handleCopy);
      document.addEventListener('keydown', handleKeyDown);

      return () => {
        document.removeEventListener('copy', handleCopy);
        document.removeEventListener('cut', handleCopy);
        document.removeEventListener('keydown', handleKeyDown);
      };
    }
  }, [showModal, deviceFlow?.userCode]);

  // Handle copy button click
  const handleCopyClick = () => {
    setHasCodeBeenCopied(true);
    onCopyCode();
  };

  if (!showModal || !deviceFlow) return null;

  return (
    <div className="fixed inset-0 z-[10001] flex items-center justify-center px-4 bg-black bg-opacity-50">
      <div className="bg-white dark:bg-gray-800 rounded-lg shadow-2xl max-w-md w-full p-6">
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white">
            Sign in with GitHub
          </h2>
          <button
            onClick={onCancel}
            className="text-gray-400 hover:text-gray-600 dark:hover:text-gray-300"
          >
            <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>

        {error ? (
          <div className="mb-4 p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
            <p className="text-sm text-red-700 dark:text-red-300">{error}</p>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="text-center">
              {isWaiting ? (
                <div className="mb-4">
                  <Loader className="w-16 h-16 mx-auto mb-3 text-blue-500 animate-spin" />
                  <p className="text-gray-600 dark:text-gray-400">
                    Waiting for authorization...
                  </p>
                </div>
              ) : (
                <div className="mb-4">
                  <svg className="w-16 h-16 mx-auto mb-3 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                    <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                  </svg>
                </div>
              )}
            </div>

            <div className="bg-gray-50 dark:bg-gray-900 rounded-lg p-4 border border-gray-200 dark:border-gray-700">
              <p className="text-sm text-gray-700 dark:text-gray-300 mb-3">
                To continue, enter this code on GitHub:
              </p>

              <div className="flex items-center justify-center space-x-2 mb-3">
                <code
                  ref={codeElementRef}
                  className="px-4 py-3 text-2xl font-bold bg-white dark:bg-gray-800 border-2 border-blue-500 rounded-lg text-blue-600 dark:text-blue-400 tracking-widest select-all"
                >
                  {deviceFlow.userCode}
                </code>
                <button
                  onClick={handleCopyClick}
                  className="p-2 text-gray-600 dark:text-gray-400 hover:text-blue-600 dark:hover:text-blue-400"
                  title="Copy code"
                >
                  <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" />
                  </svg>
                </button>
              </div>

              {!hasCodeBeenCopied && (
                <p className="text-xs text-amber-600 dark:text-amber-400 mb-2 text-center">
                  Please copy the code above before opening GitHub
                </p>
              )}

              <button
                onClick={onOpenGitHub}
                disabled={!hasCodeBeenCopied}
                className={`w-full px-4 py-2 rounded-lg transition-colors font-medium ${
                  hasCodeBeenCopied
                    ? 'bg-blue-600 text-white hover:bg-blue-700'
                    : 'bg-gray-300 dark:bg-gray-700 text-gray-500 dark:text-gray-500 cursor-not-allowed'
                }`}
              >
                Open GitHub to Authorize
              </button>
            </div>

            <div className="text-center text-xs text-gray-500 dark:text-gray-400">
              <p>This code expires in {Math.floor(deviceFlow.expiresIn / 60)} minutes</p>
            </div>
          </div>
        )}

        <div className="mt-6 flex justify-end space-x-3">
          <button
            onClick={onCancel}
            className="px-4 py-2 text-sm text-gray-700 dark:text-gray-300 bg-gray-100 dark:bg-gray-700 rounded-lg hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
};

export default LoginModal;
