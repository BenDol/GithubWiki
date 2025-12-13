import { useEffect, useRef } from 'react';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState } from '@codemirror/state';

/**
 * MarkdownEditor component using CodeMirror 6
 * Provides a powerful markdown editing experience
 */
const MarkdownEditor = ({ value, onChange, darkMode = false, placeholder = 'Write your content...' }) => {
  const editorRef = useRef(null);
  const viewRef = useRef(null);

  useEffect(() => {
    if (!editorRef.current) return;

    // Create editor state
    const startState = EditorState.create({
      doc: value || '',
      extensions: [
        basicSetup,
        markdown(),
        darkMode ? oneDark : [],
        EditorView.lineWrapping,
        EditorView.updateListener.of((update) => {
          if (update.docChanged) {
            const newValue = update.state.doc.toString();
            onChange?.(newValue);
          }
        }),
        EditorView.theme({
          '&': {
            height: '100%',
            fontSize: '14px',
          },
          '.cm-scroller': {
            overflow: 'auto',
            fontFamily: '"Fira Code", "Courier New", monospace',
          },
          '.cm-content': {
            minHeight: '400px',
            padding: '10px 0',
          },
          '.cm-line': {
            padding: '0 12px',
          },
        }),
      ],
    });

    // Create editor view
    const view = new EditorView({
      state: startState,
      parent: editorRef.current,
    });

    viewRef.current = view;

    // Cleanup
    return () => {
      view.destroy();
    };
  }, [darkMode]); // Recreate editor when theme changes

  // Update editor content when value prop changes externally
  useEffect(() => {
    if (viewRef.current && value !== viewRef.current.state.doc.toString()) {
      viewRef.current.dispatch({
        changes: {
          from: 0,
          to: viewRef.current.state.doc.length,
          insert: value || '',
        },
      });
    }
  }, [value]);

  return (
    <div className="h-full border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden">
      <div ref={editorRef} className="h-full" />
    </div>
  );
};

export default MarkdownEditor;
