import { useEffect, useRef, useCallback } from 'react';
import { createLogger } from '../utils/logger';

const logger = createLogger('useCursorHighlight');

const HIGHLIGHT_CLASS = 'cursor-highlight';
const WORD_HIGHLIGHT_CLASS = 'cursor-highlight-word';
const DEBOUNCE_MS = 50; // Very fast response - 50ms is nearly instant

// Block-level elements that should be highlighted as a whole
const BLOCK_ELEMENTS = new Set([
  'IMG', 'TABLE', 'THEAD', 'TBODY', 'TR', 'TH', 'TD',
  'PRE', 'CODE', 'BLOCKQUOTE', 'HR', 'FIGURE'
]);

// Elements to ignore (too generic)
const IGNORE_ELEMENTS = new Set(['P', 'SPAN', 'DIV', 'SECTION', 'ARTICLE']);

/**
 * Hook to highlight word at cursor position in preview
 * @param {Object} wordAtCursor - Object with {word, start, end, position} from editor
 * @param {RefObject} previewContainerRef - Ref to preview container element
 * @param {boolean} enabled - Whether highlighting is enabled
 */
export function useCursorHighlight(wordAtCursor, previewContainerRef, enabled = true) {
  const lastHighlightedRef = useRef(null);
  const lastHighlightedWordRef = useRef(null);
  const debounceTimerRef = useRef(null);
  const lastWordAtCursorRef = useRef(null); // Track last word to prevent unnecessary updates
  const stableTimerRef = useRef(null); // Timer to ensure cursor is stable before highlighting

  /**
   * Find and highlight a word in the rendered preview
   * Uses exact position matching to find the element containing the cursor
   * @param {string} targetWord - The word to find
   * @param {HTMLElement} container - The preview container
   * @param {number} cursorPosition - Exact cursor position in source markdown
   */
  const highlightWordInPreview = (targetWord, container, cursorPosition) => {
    if (!targetWord || targetWord.length < 2) return false;

    // Step 1: Find the smallest element that contains the cursor position
    const elementAtCursor = findSmallestElementAtPosition(container, cursorPosition);

    if (!elementAtCursor) {
      // Fallback to old text search if no position data
      return highlightWordByTextSearch(targetWord, container);
    }

    // Step 2: Search for the word only within that element
    const match = findWordInElement(targetWord, elementAtCursor, cursorPosition);

    if (match) {
      return highlightTextNode(match.textNode, match.wordIndex, targetWord);
    }

    // Step 3: If not found, expand search to parent elements (walk up the tree)
    let parent = elementAtCursor.parentElement;
    let attempts = 0;
    while (parent && parent !== container && attempts < 5) {
      const parentMatch = findWordInElement(targetWord, parent, cursorPosition);
      if (parentMatch) {
        return highlightTextNode(parentMatch.textNode, parentMatch.wordIndex, targetWord);
      }
      parent = parent.parentElement;
      attempts++;
    }

    // Step 4: Last resort - search entire container
    return highlightWordByTextSearch(targetWord, container);
  };

  /**
   * Find the smallest element that contains the cursor position
   */
  const findSmallestElementAtPosition = (container, cursorPosition) => {
    const elements = container.querySelectorAll('[data-source-start][data-source-end]');

    let bestElement = null;
    let smallestSize = Infinity;

    for (const element of elements) {
      const start = parseInt(element.getAttribute('data-source-start'), 10);
      const end = parseInt(element.getAttribute('data-source-end'), 10);

      if (cursorPosition >= start && cursorPosition <= end) {
        const size = end - start;
        if (size < smallestSize) {
          smallestSize = size;
          bestElement = element;
        }
      }
    }

    return bestElement;
  };

  /**
   * Find word within a specific element, considering cursor position
   */
  const findWordInElement = (targetWord, element, cursorPosition = null) => {
    const walker = document.createTreeWalker(
      element,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          // Skip block elements
          if (BLOCK_ELEMENTS.has(parent.tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Check if text contains target word
          const text = node.textContent || '';
          if (text.toLowerCase().includes(targetWord.toLowerCase())) {
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    const matches = [];
    let textNode;
    while ((textNode = walker.nextNode())) {
      const text = textNode.textContent || '';
      const lowerText = text.toLowerCase();
      const lowerWord = targetWord.toLowerCase();
      const wordIndex = lowerText.indexOf(lowerWord);

      if (wordIndex !== -1) {
        // Find the smallest parent element with position data
        let parent = textNode.parentElement;
        let elementStart = null;
        let elementEnd = null;
        let smallestSize = Infinity;

        while (parent && parent !== element.parentElement) {
          const start = parent.getAttribute('data-source-start');
          const end = parent.getAttribute('data-source-end');

          if (start !== null && end !== null) {
            const startPos = parseInt(start, 10);
            const endPos = parseInt(end, 10);
            const size = endPos - startPos;

            if (size < smallestSize) {
              smallestSize = size;
              elementStart = startPos;
              elementEnd = endPos;
            }
          }

          parent = parent.parentElement;
        }

        matches.push({
          textNode,
          wordIndex,
          elementStart,
          elementEnd
        });
      }
    }

    if (matches.length === 0) return null;
    if (matches.length === 1) return matches[0];

    // If we have cursor position and multiple matches, pick the closest one
    if (cursorPosition !== null) {
      let bestMatch = matches[0];
      let minDistance = Infinity;

      for (const match of matches) {
        if (match.elementStart !== null && match.elementEnd !== null) {
          let distance;

          if (cursorPosition >= match.elementStart && cursorPosition <= match.elementEnd) {
            // Cursor is inside - prefer this, use element size as tiebreaker
            distance = match.elementEnd - match.elementStart;
          } else {
            // Cursor is outside - calculate distance
            distance = Math.min(
              Math.abs(cursorPosition - match.elementStart),
              Math.abs(cursorPosition - match.elementEnd)
            );
          }

          if (distance < minDistance) {
            minDistance = distance;
            bestMatch = match;
          }
        }
      }

      return bestMatch;
    }

    // No cursor position - return first match
    return matches[0];
  };

  /**
   * Fallback: search for word in entire container (old behavior)
   */
  const highlightWordByTextSearch = (targetWord, container) => {
    const matches = findAllWordMatches(targetWord, container);
    if (matches.length === 0) return false;

    // Just highlight the first match as fallback
    return highlightTextNode(matches[0].textNode, matches[0].wordIndex, targetWord);
  };

  /**
   * Find all text nodes containing the target word
   * Returns array of {textNode, wordIndex, elementStart, elementEnd}
   */
  const findAllWordMatches = (targetWord, container) => {
    const matches = [];

    const walker = document.createTreeWalker(
      container,
      NodeFilter.SHOW_TEXT,
      {
        acceptNode: (node) => {
          const parent = node.parentElement;
          if (!parent) return NodeFilter.FILTER_REJECT;

          const tagName = parent.tagName;

          // Skip block elements
          if (BLOCK_ELEMENTS.has(tagName)) {
            return NodeFilter.FILTER_REJECT;
          }

          // Skip script/style
          if (tagName === 'SCRIPT' || tagName === 'STYLE') {
            return NodeFilter.FILTER_REJECT;
          }

          // Check ancestors for block elements
          let ancestor = parent;
          while (ancestor && ancestor !== container) {
            if (BLOCK_ELEMENTS.has(ancestor.tagName)) {
              return NodeFilter.FILTER_REJECT;
            }
            ancestor = ancestor.parentElement;
          }

          // Check if text contains target word
          const text = node.textContent || '';
          if (text.toLowerCase().includes(targetWord.toLowerCase())) {
            return NodeFilter.FILTER_ACCEPT;
          }

          return NodeFilter.FILTER_REJECT;
        }
      }
    );

    let textNode;
    while ((textNode = walker.nextNode())) {
      const text = textNode.textContent || '';
      const lowerText = text.toLowerCase();
      const lowerWord = targetWord.toLowerCase();
      const wordIndex = lowerText.indexOf(lowerWord);

      if (wordIndex !== -1) {
        // Find the SMALLEST element with position data (most specific)
        let element = textNode.parentElement;
        let elementStart = null;
        let elementEnd = null;
        let smallestSize = Infinity;

        while (element && element !== container) {
          const start = element.getAttribute('data-source-start');
          const end = element.getAttribute('data-source-end');

          if (start !== null && end !== null) {
            const startPos = parseInt(start, 10);
            const endPos = parseInt(end, 10);
            const size = endPos - startPos;

            // Keep the smallest element (most specific position)
            if (size < smallestSize) {
              smallestSize = size;
              elementStart = startPos;
              elementEnd = endPos;
            }
          }

          element = element.parentElement;
        }

        matches.push({
          textNode,
          wordIndex,
          elementStart,
          elementEnd
        });
      }
    }

    return matches;
  };

  /**
   * Find the match closest to the cursor position in source
   */
  const findClosestMatch = (matches, cursorPosition) => {
    // First pass: find matches where cursor is INSIDE the element
    let insideMatches = [];
    for (const match of matches) {
      if (match.elementStart !== null && match.elementEnd !== null) {
        if (cursorPosition >= match.elementStart && cursorPosition <= match.elementEnd) {
          insideMatches.push(match);
        }
      }
    }

    // If we have matches where cursor is inside, use only those
    const matchesToConsider = insideMatches.length > 0 ? insideMatches : matches;

    let bestMatch = null;
    let minDistance = Infinity;

    for (const match of matchesToConsider) {
      // If no position data, treat as fallback only if no other matches
      if (match.elementStart === null || match.elementEnd === null) {
        if (!bestMatch) {
          bestMatch = match;
        }
        continue;
      }

      // Calculate distance from cursor to element start
      // For inside matches, prefer the one where cursor is closest to start
      // For outside matches, prefer the one closest to cursor
      let distance;

      if (cursorPosition >= match.elementStart && cursorPosition <= match.elementEnd) {
        // Cursor is inside element - prefer smaller elements
        distance = match.elementEnd - match.elementStart;
      } else if (cursorPosition < match.elementStart) {
        // Cursor is before element
        distance = match.elementStart - cursorPosition;
      } else {
        // Cursor is after element
        distance = cursorPosition - match.elementEnd;
      }

      if (distance < minDistance) {
        minDistance = distance;
        bestMatch = match;
      }
    }

    return bestMatch;
  };

  /**
   * Highlight a specific word occurrence in a text node
   */
  const highlightTextNode = (textNode, wordIndex, targetWord) => {
    const text = textNode.textContent || '';
    const beforeText = text.substring(0, wordIndex);
    const matchedWord = text.substring(wordIndex, wordIndex + targetWord.length);
    const afterText = text.substring(wordIndex + targetWord.length);

    const span = document.createElement('span');
    span.className = WORD_HIGHLIGHT_CLASS;
    span.textContent = matchedWord;

    const parent = textNode.parentNode;
    const beforeNode = document.createTextNode(beforeText);
    const afterNode = document.createTextNode(afterText);

    // Insert the new nodes
    parent.insertBefore(beforeNode, textNode);
    parent.insertBefore(span, textNode);
    parent.insertBefore(afterNode, textNode);
    parent.removeChild(textNode);

    // Store for cleanup
    lastHighlightedWordRef.current = {
      span,
      parent,
      beforeNode,
      wordNode: document.createTextNode(matchedWord),
      afterNode
    };

    return true;
  };

  /**
   * Check if cursor is within a block element (image, table, etc.)
   * and highlight that element
   * @param {boolean} hasWord - Whether we have a word at cursor (more strict matching if true)
   */
  const highlightBlockElement = (container, cursorStart, cursorEnd, hasWord = true) => {
    const blockElements = container.querySelectorAll(
      Array.from(BLOCK_ELEMENTS).map(tag => tag.toLowerCase()).join(',')
    );

    let bestElement = null;
    let minDistance = Infinity;

    for (const element of blockElements) {
      const start = element.getAttribute('data-source-start');
      const end = element.getAttribute('data-source-end');

      if (start === null || end === null) {
        continue;
      }

      const elementStart = parseInt(start, 10);
      const elementEnd = parseInt(end, 10);

      // Check if cursor is inside this element
      const isInside = cursorStart >= elementStart && cursorEnd <= elementEnd;

      if (isInside) {
        // If we have a word, require cursor to be VERY close to boundaries (prevents false matches)
        // If no word, allow any position inside (likely clicking on block element syntax)
        const distanceToStart = Math.abs(cursorStart - elementStart);
        const distanceToEnd = Math.abs(cursorEnd - elementEnd);
        // Reduced threshold from 20 to 5 to prevent false positives
        const isCloseEnough = hasWord ? (distanceToStart < 5 || distanceToEnd < 5) : true;

        if (isCloseEnough) {
          element.classList.add(HIGHLIGHT_CLASS);
          lastHighlightedRef.current = element;
          return true;
        }
      }

      // Calculate distance for closest match
      let distance;
      if (cursorEnd < elementStart) {
        distance = elementStart - cursorEnd;
      } else if (cursorStart > elementEnd) {
        distance = cursorStart - elementEnd;
      } else {
        distance = Math.min(
          Math.abs(cursorStart - elementStart),
          Math.abs(cursorEnd - elementEnd)
        );
      }

      if (distance < minDistance) {
        minDistance = distance;
        bestElement = element;
      }
    }

    // Only highlight nearby block elements if we DON'T have a word
    // (cursor is on whitespace/punctuation near image, not on actual text)
    // Reduced threshold from 20 to 5 for accuracy
    if (!hasWord && bestElement && minDistance < 5) {
      bestElement.classList.add(HIGHLIGHT_CLASS);
      lastHighlightedRef.current = bestElement;
      return true;
    }

    return false;
  };

  const updateHighlight = useCallback(() => {
    if (!enabled || !previewContainerRef.current) {
      return;
    }

    // Check if wordAtCursor has actually changed to prevent unnecessary updates
    const lastWord = lastWordAtCursorRef.current;
    if (lastWord && wordAtCursor) {
      // Only skip if the exact same word at exact same position
      const exactlySame = lastWord.word === wordAtCursor.word &&
                          lastWord.start === wordAtCursor.start &&
                          lastWord.end === wordAtCursor.end;

      if (exactlySame) {
        return;
      }
    }

    // Store current word for next comparison
    lastWordAtCursorRef.current = wordAtCursor;

    // Clear previous highlights
    if (lastHighlightedRef.current) {
      lastHighlightedRef.current.classList.remove(HIGHLIGHT_CLASS);
      lastHighlightedRef.current = null;
    }

    if (lastHighlightedWordRef.current) {
      const { span, parent, beforeNode, wordNode, afterNode } = lastHighlightedWordRef.current;
      try {
        const originalText = document.createTextNode(
          beforeNode.textContent + wordNode.textContent + afterNode.textContent
        );
        parent.insertBefore(originalText, beforeNode);
        parent.removeChild(beforeNode);
        parent.removeChild(span);
        parent.removeChild(afterNode);
      } catch (e) {
        // Element may have been removed - silent fail
      }
      lastHighlightedWordRef.current = null;
    }

    // Early return only if we have no data at all
    if (!wordAtCursor || (wordAtCursor.start === undefined && wordAtCursor.end === undefined && !wordAtCursor.word)) {
      return;
    }

    const container = previewContainerRef.current;

    // If we have position data, first try to highlight block elements (images, tables, etc.)
    // This works even when wordAtCursor.word is null (e.g., when clicking on image syntax)
    if (wordAtCursor.start !== undefined && wordAtCursor.end !== undefined) {
      const blockHighlighted = highlightBlockElement(
        container,
        wordAtCursor.start,
        wordAtCursor.end,
        !!wordAtCursor.word // Pass whether we have a word for stricter/looser matching
      );
      if (blockHighlighted) {
        return; // Successfully highlighted a block element
      }
    }

    // If no block element found and we have a word, try word-level highlighting
    if (wordAtCursor.word && wordAtCursor.position !== undefined) {
      highlightWordInPreview(
        wordAtCursor.word,
        container,
        wordAtCursor.position
      );
    }
  }, [wordAtCursor, previewContainerRef, enabled]);

  useEffect(() => {
    clearTimeout(debounceTimerRef.current);
    debounceTimerRef.current = setTimeout(updateHighlight, DEBOUNCE_MS);
    return () => clearTimeout(debounceTimerRef.current);
  }, [updateHighlight]);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (lastHighlightedRef.current) {
        lastHighlightedRef.current.classList.remove(HIGHLIGHT_CLASS);
      }

      if (lastHighlightedWordRef.current) {
        const { span, parent, beforeNode, wordNode, afterNode } = lastHighlightedWordRef.current;
        try {
          const originalText = document.createTextNode(
            beforeNode.textContent + wordNode.textContent + afterNode.textContent
          );
          parent.insertBefore(originalText, beforeNode);
          parent.removeChild(beforeNode);
          parent.removeChild(span);
          parent.removeChild(afterNode);
        } catch (e) {
          // Element may have been removed
        }
      }
    };
  }, []);
}
