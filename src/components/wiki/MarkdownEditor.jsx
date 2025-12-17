import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState } from '@codemirror/state';
import ImageDimensionWidget from './ImageDimensionWidget';
import DataAutocomplete from './DataAutocomplete';

/**
 * MarkdownEditor component using CodeMirror 6
 * Provides a powerful markdown editing experience
 * @param {Function} dataAutocompleteSearch - Optional search function for data autocomplete
 */
const MarkdownEditor = ({ value, onChange, darkMode = false, placeholder = 'Write your content...', editorApi, dataAutocompleteSearch }) => {
  const editorRef = useRef(null);
  const viewRef = useRef(null);
  const [widgetVisible, setWidgetVisible] = useState(false);
  const [widgetPosition, setWidgetPosition] = useState({ top: 0, left: 0 });
  const [currentImageInfo, setCurrentImageInfo] = useState(null);

  // Data autocomplete state
  const [autocompleteVisible, setAutocompleteVisible] = useState(false);
  const [autocompletePosition, setAutocompletePosition] = useState({ top: 0, left: 0 });
  const [autocompleteSuggestions, setAutocompleteSuggestions] = useState([]);
  const [autocompleteQuery, setAutocompleteQuery] = useState('');
  const [autocompleteRange, setAutocompleteRange] = useState({ from: 0, to: 0 });
  const searchTimeoutRef = useRef(null);

  // Expose editor API to parent - ensure it persists across renders
  useEffect(() => {
    console.log('[MarkdownEditor] Setting up editor API', {
      hasEditorApi: !!editorApi,
      hasViewRef: !!viewRef.current
    });

    if (editorApi) {
      // Always set API, even if viewRef is temporarily null
      // The API methods will check for viewRef when called
      editorApi.current = {
        getSelection: () => {
          const view = viewRef.current;
          console.log('[MarkdownEditor.getSelection] viewRef.current exists:', !!view);
          if (!view) return { text: '', from: 0, to: 0, empty: true };
          const selection = view.state.selection.main;
          const selectedText = view.state.doc.sliceString(selection.from, selection.to);
          return {
            text: selectedText,
            from: selection.from,
            to: selection.to,
            empty: selection.empty
          };
        },
        replaceSelection: (text) => {
          const view = viewRef.current;
          console.log('[MarkdownEditor.replaceSelection] viewRef.current exists:', !!view);
          if (!view) {
            console.error('[MarkdownEditor.replaceSelection] View not available!');
            return;
          }
          const selection = view.state.selection.main;
          view.dispatch({
            changes: { from: selection.from, to: selection.to, insert: text },
            selection: { anchor: selection.from + text.length }
          });
        },
        replaceRange: (from, to, text) => {
          const view = viewRef.current;
          console.log('[MarkdownEditor.replaceRange] viewRef.current exists:', !!view, {from, to, textLength: text.length});
          if (!view) {
            console.error('[MarkdownEditor.replaceRange] View not available!');
            return;
          }
          view.dispatch({
            changes: { from, to, insert: text },
            selection: { anchor: from + text.length }
          });
          console.log('[MarkdownEditor.replaceRange] Dispatch complete');
        },
        insertAtCursor: (text) => {
          const view = viewRef.current;
          if (!view) return;
          const pos = view.state.selection.main.head;
          view.dispatch({
            changes: { from: pos, insert: text },
            selection: { anchor: pos + text.length }
          });
        },
        getCurrentLine: () => {
          const view = viewRef.current;
          if (!view) return { text: '', from: 0, to: 0 };
          const pos = view.state.selection.main.head;
          const line = view.state.doc.lineAt(pos);
          return {
            text: line.text,
            from: line.from,
            to: line.to,
            number: line.number
          };
        },
        replaceLine: (text) => {
          const view = viewRef.current;
          if (!view) return;
          const pos = view.state.selection.main.head;
          const line = view.state.doc.lineAt(pos);
          view.dispatch({
            changes: { from: line.from, to: line.to, insert: text }
          });
        },
        getContent: () => {
          const view = viewRef.current;
          if (!view) return '';
          return view.state.doc.toString();
        },
        getCursorPosition: () => {
          const view = viewRef.current;
          if (!view) return 0;
          return view.state.selection.main.head;
        }
      };
      console.log('[MarkdownEditor] Editor API set up successfully');
    }

    return () => {
      console.log('[MarkdownEditor] Cleaning up editor API');
    };
  }, [editorApi]); // Only depend on editorApi prop, not viewRef

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
            // Check for data autocomplete pattern
            checkDataAutocomplete();
          }
          // Also check on selection change (cursor movement)
          if (update.selectionSet) {
            checkDataAutocomplete();
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

  // Detect if user is typing {{data: pattern for autocomplete
  const checkDataAutocomplete = async () => {
    if (!viewRef.current || !dataAutocompleteSearch) return;

    const view = viewRef.current;
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const lineText = line.text;
    const posInLine = pos - line.from;

    // Look for {{data: pattern before cursor
    const textBeforeCursor = lineText.substring(0, posInLine);
    const dataPatternMatch = textBeforeCursor.match(/\{\{data:([^}]*?)$/);

    if (dataPatternMatch) {
      const query = dataPatternMatch[1];
      const matchStart = line.from + dataPatternMatch.index;
      const matchEnd = pos;

      // Get cursor coordinates for positioning
      const coords = view.coordsAtPos(pos);
      if (coords) {
        setAutocompletePosition({
          top: coords.top,
          left: coords.left
        });
        setAutocompleteRange({ from: matchStart, to: matchEnd });
        setAutocompleteQuery(query);

        // Search for suggestions (debounced)
        if (searchTimeoutRef.current) {
          clearTimeout(searchTimeoutRef.current);
        }

        searchTimeoutRef.current = setTimeout(async () => {
          try {
            const suggestions = await dataAutocompleteSearch(query, 20);
            setAutocompleteSuggestions(suggestions);
            setAutocompleteVisible(true);
          } catch (err) {
            console.error('[MarkdownEditor] Autocomplete search failed:', err);
            setAutocompleteVisible(false);
          }
        }, 150); // Debounce by 150ms
      }
    } else {
      // No match, hide autocomplete
      setAutocompleteVisible(false);
      setAutocompleteSuggestions([]);
    }
  };

  // Handle autocomplete selection
  const handleAutocompleteSelect = (suggestion) => {
    if (!viewRef.current) return;

    const view = viewRef.current;

    // Replace {{data:query with the full insert syntax
    view.dispatch({
      changes: {
        from: autocompleteRange.from,
        to: autocompleteRange.to,
        insert: suggestion.insertSyntax
      },
      selection: { anchor: autocompleteRange.from + suggestion.insertSyntax.length }
    });

    // Close autocomplete
    setAutocompleteVisible(false);
    setAutocompleteSuggestions([]);
  };

  // Detect if cursor is on an image
  const checkCursorOnImage = () => {
    if (!viewRef.current) return;

    const view = viewRef.current;
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const lineText = line.text;
    const posInLine = pos - line.from;

    // Don't show widget if cursor is at the very start or end of the line
    if (posInLine === 0 || posInLine >= lineText.length) {
      setWidgetVisible(false);
      return;
    }

    // Regex patterns for markdown images and HTML img tags
    const markdownImageRegex = /!\[([^\]]*)\]\(([^)]+)\)/g;
    const htmlImageRegex = /<img\s+[^>]*src=["']([^"']+)["'][^>]*>/gi;

    // Check for markdown image
    let match;
    while ((match = markdownImageRegex.exec(lineText)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (posInLine >= start && posInLine < end) {
        // Cursor is on this image - position widget at end of line
        const lineEndPos = line.to;
        const coords = view.coordsAtPos(lineEndPos);
        if (coords) {
          // Use viewport coordinates for portal rendering
          setWidgetPosition({
            top: coords.top,
            left: coords.left
          });
          setCurrentImageInfo({
            type: 'markdown',
            alt: match[1],
            src: match[2],
            width: '',
            height: '',
            start: line.from + start,
            end: line.from + end,
            fullMatch: match[0]
          });
          setWidgetVisible(true);
        }
        return;
      }
    }

    // Check for HTML img tag
    htmlImageRegex.lastIndex = 0;
    while ((match = htmlImageRegex.exec(lineText)) !== null) {
      const start = match.index;
      const end = start + match[0].length;

      if (posInLine >= start && posInLine < end) {
        // Extract width and height attributes
        const widthMatch = match[0].match(/width=["'](\d+)["']/);
        const heightMatch = match[0].match(/height=["'](\d+)["']/);
        const altMatch = match[0].match(/alt=["']([^"']*)["']/);

        // Position widget at end of line
        const lineEndPos = line.to;
        const coords = view.coordsAtPos(lineEndPos);
        if (coords) {
          // Use viewport coordinates for portal rendering
          setWidgetPosition({
            top: coords.top,
            left: coords.left
          });
          setCurrentImageInfo({
            type: 'html',
            src: match[1],
            alt: altMatch ? altMatch[1] : '',
            width: widthMatch ? widthMatch[1] : '',
            height: heightMatch ? heightMatch[1] : '',
            start: line.from + start,
            end: line.from + end,
            fullMatch: match[0]
          });
          setWidgetVisible(true);
        }
        return;
      }
    }

    // Not on an image
    setWidgetVisible(false);
  };

  // Update image dimensions
  const handleUpdateDimensions = (width, height) => {
    if (!viewRef.current || !currentImageInfo) return;

    const view = viewRef.current;
    let newImageSyntax;

    if (currentImageInfo.type === 'markdown') {
      // Convert markdown to HTML if dimensions are added
      if (width || height) {
        const widthAttr = width ? ` width="${width}"` : '';
        const heightAttr = height ? ` height="${height}"` : '';
        newImageSyntax = `<img src="${currentImageInfo.src}" alt="${currentImageInfo.alt}"${widthAttr}${heightAttr} />`;
      } else {
        // Keep as markdown
        newImageSyntax = currentImageInfo.fullMatch;
      }
    } else {
      // Update HTML img tag
      if (width || height) {
        let newTag = currentImageInfo.fullMatch;

        // Update or add width
        if (width) {
          if (/width=["']\d+["']/.test(newTag)) {
            newTag = newTag.replace(/width=["']\d+["']/, `width="${width}"`);
          } else {
            newTag = newTag.replace(/<img\s+/, `<img width="${width}" `);
          }
        } else {
          newTag = newTag.replace(/\s*width=["']\d+["']/, '');
        }

        // Update or add height
        if (height) {
          if (/height=["']\d+["']/.test(newTag)) {
            newTag = newTag.replace(/height=["']\d+["']/, `height="${height}"`);
          } else {
            newTag = newTag.replace(/<img\s+/, `<img height="${height}" `);
          }
        } else {
          newTag = newTag.replace(/\s*height=["']\d+["']/, '');
        }

        newImageSyntax = newTag;
      } else {
        // Remove dimensions, potentially convert back to markdown
        newImageSyntax = `![${currentImageInfo.alt}](${currentImageInfo.src})`;
      }
    }

    // Replace the image syntax
    view.dispatch({
      changes: {
        from: currentImageInfo.start,
        to: currentImageInfo.end,
        insert: newImageSyntax
      }
    });

    setWidgetVisible(false);
  };

  // Add click listener to check for images
  useEffect(() => {
    if (!editorRef.current) return;

    const handleClick = () => {
      setTimeout(checkCursorOnImage, 50);
    };

    const element = editorRef.current;
    element.addEventListener('click', handleClick);

    return () => {
      element.removeEventListener('click', handleClick);
    };
  }, []);

  return (
    <>
      <div className="h-full border border-gray-300 dark:border-gray-700 rounded-lg overflow-hidden relative">
        <div ref={editorRef} className="h-full" />
      </div>
      {widgetVisible && createPortal(
        <ImageDimensionWidget
          visible={widgetVisible}
          position={widgetPosition}
          currentWidth={currentImageInfo?.width}
          currentHeight={currentImageInfo?.height}
          onUpdate={handleUpdateDimensions}
          onClose={() => setWidgetVisible(false)}
        />,
        document.body
      )}
      {autocompleteVisible && createPortal(
        <DataAutocomplete
          visible={autocompleteVisible}
          position={autocompletePosition}
          query={autocompleteQuery}
          suggestions={autocompleteSuggestions}
          onSelect={handleAutocompleteSelect}
          onClose={() => setAutocompleteVisible(false)}
        />,
        document.body
      )}
    </>
  );
};

export default MarkdownEditor;
