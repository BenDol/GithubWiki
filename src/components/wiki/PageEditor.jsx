import { useState } from 'react';
import MarkdownEditor from './MarkdownEditor';
import PageViewer from './PageViewer';
import { useUIStore } from '../../store/uiStore';
import Button from '../common/Button';

/**
 * PageEditor component with live preview
 * Provides markdown editing with real-time preview
 */
const PageEditor = ({
  initialContent,
  initialMetadata,
  onSave,
  onCancel,
  isSaving = false
}) => {
  const [content, setContent] = useState(initialContent || '');
  const [showPreview, setShowPreview] = useState(true);
  const [editSummary, setEditSummary] = useState('');
  const { darkMode } = useUIStore();

  const handleSave = () => {
    if (!content.trim()) {
      alert('Content cannot be empty');
      return;
    }

    onSave?.(content, editSummary);
  };

  return (
    <div className="space-y-4">
      {/* Toolbar */}
      <div className="flex items-center justify-between bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg p-3">
        <div className="flex items-center space-x-2">
          <button
            onClick={() => setShowPreview(!showPreview)}
            className="px-3 py-1.5 text-sm font-medium rounded-lg bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600 transition-colors"
          >
            {showPreview ? '📝 Edit Only' : '👁️ Show Preview'}
          </button>

          <div className="h-6 w-px bg-gray-300 dark:bg-gray-600" />

          <span className="text-sm text-gray-600 dark:text-gray-400">
            {content.length} characters
          </span>
        </div>

        <div className="flex items-center space-x-2">
          <Button variant="secondary" size="sm" onClick={onCancel} disabled={isSaving}>
            Cancel
          </Button>
          <Button variant="primary" size="sm" onClick={handleSave} disabled={isSaving}>
            {isSaving ? 'Saving...' : 'Save Changes'}
          </Button>
        </div>
      </div>

      {/* Editor and Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Editor */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
              Editor
            </h3>
            <span className="text-xs text-gray-500 dark:text-gray-400">
              Markdown supported
            </span>
          </div>

          <div className="h-[600px]">
            <MarkdownEditor
              value={content}
              onChange={setContent}
              darkMode={darkMode}
              placeholder="Write your content in Markdown..."
            />
          </div>

          {/* Edit summary */}
          <div className="space-y-2">
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300">
              Edit Summary (optional)
            </label>
            <input
              type="text"
              value={editSummary}
              onChange={(e) => setEditSummary(e.target.value)}
              placeholder="Briefly describe your changes..."
              className="block w-full px-3 py-2 border border-gray-300 dark:border-gray-700 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white placeholder-gray-500 dark:placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
            />
            <p className="text-xs text-gray-500 dark:text-gray-400">
              This will be included in the pull request description
            </p>
          </div>
        </div>

        {/* Preview */}
        {showPreview && (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 dark:text-white">
                Preview
              </h3>
              <span className="text-xs text-gray-500 dark:text-gray-400">
                Live preview
              </span>
            </div>

            <div className="h-[600px] overflow-y-auto border border-gray-200 dark:border-gray-700 rounded-lg p-6 bg-white dark:bg-gray-800">
              {content ? (
                <PageViewer content={content} metadata={initialMetadata} />
              ) : (
                <div className="flex items-center justify-center h-full text-gray-400 dark:text-gray-600">
                  <div className="text-center">
                    <svg className="w-12 h-12 mx-auto mb-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M11 5H6a2 2 0 00-2 2v11a2 2 0 002 2h11a2 2 0 002-2v-5m-1.414-9.414a2 2 0 112.828 2.828L11.828 15H9v-2.828l8.586-8.586z" />
                    </svg>
                    <p className="text-sm">Preview will appear here</p>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}
      </div>

      {/* Help text */}
      <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
        <h4 className="text-sm font-semibold text-blue-900 dark:text-blue-200 mb-2">
          Editing Guidelines
        </h4>
        <ul className="text-sm text-blue-800 dark:text-blue-300 space-y-1 list-disc list-inside">
          <li>Your changes will create a pull request for review</li>
          <li>Use standard Markdown syntax for formatting</li>
          <li>Keep frontmatter (metadata between ---) intact</li>
          <li>Preview your changes before saving</li>
          <li>Add a clear edit summary to help reviewers</li>
        </ul>
      </div>
    </div>
  );
};

export default PageEditor;
