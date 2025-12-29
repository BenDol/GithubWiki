import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { EditorView, basicSetup } from 'codemirror';
import { markdown } from '@codemirror/lang-markdown';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorState, Prec } from '@codemirror/state';
import { keymap } from '@codemirror/view';
import { deleteCharBackward, deleteCharForward } from '@codemirror/commands';
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

    // Custom deletion handlers to provide intuitive deletion behavior
    // Prevents unexpected multi-character or newline deletions
    const customDeletionKeymap = keymap.of([
      {
        key: 'Backspace',
        run: (view) => {
          const { state } = view;
          const { selection } = state;
          const { main } = selection;

          // If there's a selection, delete it normally
          if (!main.empty) {
            return deleteCharBackward(view);
          }

          // Get cursor position
          const pos = main.head;

          // Don't delete anything if at the start of the document
          if (pos === 0) {
            return true;
          }

          // Get the current line
          const line = state.doc.lineAt(pos);
          const lineText = line.text;
          const posInLine = pos - line.from;

          // Check if we're at the start of a line (deleting would merge with previous line)
          if (pos === line.from) {
            // At line start - allow normal behavior to merge lines
            return deleteCharBackward(view);
          }

          // If this is the only character on the line, delete it but keep the line
          if (lineText.length === 1 && posInLine === 1) {
            // Delete the character
            view.dispatch({
              changes: { from: pos - 1, to: pos, insert: '' },
              selection: { anchor: pos - 1 }
            });
            // Don't allow the default behavior to run
            return true;
          }

          // Normal deletion: just delete the single character before cursor
          view.dispatch({
            changes: { from: pos - 1, to: pos },
            selection: { anchor: pos - 1 }
          });

          return true; // Prevent default behavior
        }
      },
      {
        key: 'Delete',
        run: (view) => {
          const { state } = view;
          const { selection } = state;
          const { main } = selection;

          // If there's a selection, delete it normally
          if (!main.empty) {
            return deleteCharForward(view);
          }

          // Get cursor position
          const pos = main.head;

          // Don't delete anything if at the end of the document
          if (pos === state.doc.length) {
            return true;
          }

          // Normal deletion: just delete the single character after cursor
          view.dispatch({
            changes: { from: pos, to: pos + 1 },
            selection: { anchor: pos }
          });

          return true; // Prevent default behavior
        }
      }
    ]);

    // Create editor state
    const startState = EditorState.create({
      doc: value || '',
      extensions: [
        Prec.highest(customDeletionKeymap), // Highest precedence to override all defaults
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

  // Handle Ctrl+Space to manually trigger autocomplete when inside {{ }}
  useEffect(() => {
    if (!dataAutocompleteSearch) return;

    const handleKeyDown = (e) => {
      // Check for Ctrl+Space (or Cmd+Space on Mac)
      if ((e.ctrlKey || e.metaKey) && e.code === 'Space') {
        e.preventDefault();
        e.stopPropagation();

        if (!viewRef.current) return;

        const view = viewRef.current;
        const pos = view.state.selection.main.head;
        const line = view.state.doc.lineAt(pos);
        const lineText = line.text;
        const posInLine = pos - line.from;

        // Look for {{ }} pattern around cursor
        // Find opening {{ before cursor
        let openIndex = -1;
        for (let i = posInLine - 1; i >= 0; i--) {
          if (lineText[i] === '{' && lineText[i - 1] === '{') {
            openIndex = i - 1;
            break;
          }
          // Stop if we hit a closing brace (we're not inside a wrapper)
          if (lineText[i] === '}') {
            break;
          }
        }

        // Find closing }} after cursor
        let closeIndex = -1;
        if (openIndex !== -1) {
          for (let i = posInLine; i < lineText.length - 1; i++) {
            if (lineText[i] === '}' && lineText[i + 1] === '}') {
              closeIndex = i;
              break;
            }
            // Stop if we hit an opening brace (we're not inside a wrapper)
            if (lineText[i] === '{') {
              break;
            }
          }
        }

        // If we found both {{ and }}, trigger autocomplete
        if (openIndex !== -1 && closeIndex !== -1) {
          const contentStart = openIndex + 2; // After {{
          const contentEnd = closeIndex; // Before }}
          const content = lineText.substring(contentStart, contentEnd);
          const query = content.trimStart();

          console.log('[MarkdownEditor] Ctrl+Space triggered autocomplete:', {
            openIndex,
            closeIndex,
            content,
            query
          });

          // Set autocomplete state
          const matchStart = line.from + openIndex;
          const matchEnd = line.from + closeIndex + 2; // Include closing }}

          const coords = view.coordsAtPos(pos);
          if (coords) {
            setAutocompletePosition({
              top: coords.top,
              left: coords.left
            });
            setAutocompleteRange({ from: matchStart, to: matchEnd });
            setAutocompleteQuery(query);

            // Trigger search immediately (no debounce for manual trigger)
            dataAutocompleteSearch(query, 20)
              .then(suggestions => {
                setAutocompleteSuggestions(suggestions);
                setAutocompleteVisible(true);
              })
              .catch(err => {
                console.error('[MarkdownEditor] Manual autocomplete search failed:', err);
                setAutocompleteVisible(false);
              });
          }
        }
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [dataAutocompleteSearch]);

  // Detect if user is typing {{ pattern for autocomplete
  const checkDataAutocomplete = async () => {
    if (!viewRef.current || !dataAutocompleteSearch) return;

    const view = viewRef.current;
    const pos = view.state.selection.main.head;
    const line = view.state.doc.lineAt(pos);
    const lineText = line.text;
    const posInLine = pos - line.from;

    // Look for {{ pattern before cursor (trigger autocomplete immediately after {{)
    const textBeforeCursor = lineText.substring(0, posInLine);
    const dataPatternMatch = textBeforeCursor.match(/\{\{([^}]*?)$/);

    if (dataPatternMatch) {
      const rawQuery = dataPatternMatch[1];
      // Trim leading spaces from query for search, but keep original range for replacement
      const query = rawQuery.trimStart();
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

    // Check if we're replacing a complete wrapper (e.g., {{todd}} triggered via Ctrl+Space)
    // vs. replacing an incomplete pattern (e.g., {{todd triggered by typing)
    const replacingText = view.state.doc.sliceString(autocompleteRange.from, autocompleteRange.to);
    const isReplacingCompleteWrapper = replacingText.includes('}}');

    // Check if we need to add newlines (if not already at start/end of line)
    const line = view.state.doc.lineAt(autocompleteRange.from);
    const isAtLineStart = autocompleteRange.from === line.from;

    // Build insert text with proper spacing
    let insertText = suggestion.insertSyntax;

    // Only add spacing/newlines if we're completing a new pattern (not replacing existing complete wrapper)
    if (!isReplacingCompleteWrapper) {
      // Add newlines before if not at line start
      if (!isAtLineStart) {
        insertText = `\n\n${insertText}`;
      }

      // Add trailing spaces and paragraph breaks
      // Two spaces at end of line create hard break, blank line separates blocks
      insertText = `${insertText}  \n\n`;
    }
    // If replacing complete wrapper, insert inline without extra spacing

    // Replace {{query or {{complete}} with the full insert syntax
    view.dispatch({
      changes: {
        from: autocompleteRange.from,
        to: autocompleteRange.to,
        insert: insertText
      },
      selection: { anchor: autocompleteRange.from + insertText.length }
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
