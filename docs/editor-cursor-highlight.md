# Editor Cursor Highlight

## Overview

The **Editor Cursor Highlight** feature provides real-time visual feedback while editing markdown content. As you move your cursor through the editor, the corresponding word or element is highlighted in the live preview panel.

## Features

- **Word highlighting** - Highlights the specific word under the cursor
- **Block element highlighting** - Highlights images, tables, code blocks when cursor is on them
- **Position-aware** - Uses source position mapping to find the exact element
- **Smart matching** - Handles duplicate words by using proximity to cursor position
- **Performance optimized** - Debounced with 50ms delay for smooth response

## Configuration

Enable/disable in `wiki-config.json`:

```json
{
  "features": {
    "editor": {
      "previewHighlight": {
        "enabled": true,
        "description": "Highlights the word/element at cursor position in the live preview while editing"
      }
    }
  }
}
```

**Config Path:** `features.editor.previewHighlight.enabled`
**Default:** `enabled: true`

## Behavior

### When Active

The feature only works when:
1. ✅ Feature flag `features.editor.previewHighlight.enabled` is `true` (or not set)
2. ✅ View mode is `split` or `preview` (not in editor-only mode)
3. ✅ Cursor is on a valid word or element

### Highlight Types

#### Text/Word Highlighting
- Highlights individual words as you type or navigate
- Uses `.cursor-highlight-word` CSS class
- Light yellow background in light mode
- Blue background in dark mode

#### Block Element Highlighting
- Highlights entire elements: images, tables, code blocks, etc.
- Uses `.cursor-highlight` CSS class
- Outline style for images (instead of background)
- Triggers when cursor is within element syntax in markdown

### Visual Styles

| Element Type | Light Mode | Dark Mode |
|--------------|------------|-----------|
| **Regular text** | rgba(255, 252, 220, 0.7) - Light yellow | rgba(59, 130, 246, 0.3) - Blue |
| **Code blocks** | rgba(255, 252, 220, 0.3) - Lighter yellow | rgba(59, 130, 246, 0.2) - Lighter blue |
| **Images** | 2px outline, yellow | 2px outline, blue |

## Implementation Details

### Hook: `useCursorHighlight()`

**Location:** `wiki-framework/src/hooks/useCursorHighlight.js`

**Parameters:**
- `wordAtCursor` - Object with `{word, start, end, position}` from editor
- `previewContainerRef` - React ref to preview container
- `enabled` - Boolean to enable/disable

**How it works:**

1. **Editor tracks cursor** - Extracts word at cursor position with source offsets
2. **Hook receives data** - Gets word + position from editor state
3. **Position mapping** - Uses `data-source-start` and `data-source-end` attributes on rendered elements
4. **Smart search** - Finds smallest element containing cursor position
5. **Highlight** - Applies CSS class to matched element
6. **Cleanup** - Removes previous highlight on cursor move

### Position Mapping

Markdown processor adds source position attributes to rendered HTML:

```html
<!-- Markdown: "The quick brown fox" at position 100-119 -->
<p data-source-start="100" data-source-end="119">
  The quick brown fox
</p>
```

The hook uses these attributes to:
- Find the element the cursor is in
- Handle duplicate words (picks closest to cursor)
- Match block elements precisely

### Performance

- **Debounced:** 50ms delay (nearly instant but prevents excessive updates)
- **Smart caching:** Skips update if word/position unchanged
- **Efficient search:** Uses TreeWalker API for optimal DOM traversal
- **Cleanup:** Properly removes highlights to prevent memory leaks

## Use Cases

### 1. Long Documents
When editing lengthy pages, quickly identify which paragraph/section you're editing.

### 2. Duplicate Content
When the same word appears multiple times, see exactly which instance you're on.

### 3. Complex Markdown
See which image/table your cursor is in when editing complex syntax.

### 4. Learning Markdown
Visual feedback helps beginners understand markdown-to-HTML mapping.

## CSS Customization

Override default styles in parent project:

```css
/* Custom highlight color */
.cursor-highlight-word {
  background-color: rgba(255, 0, 0, 0.3) !important;
}

/* Disable highlights for specific elements */
pre .cursor-highlight-word {
  background-color: transparent !important;
}
```

## Disabling the Feature

### Method 1: Config (Recommended)
```json
{
  "features": {
    "editor": {
      "previewHighlight": {
        "enabled": false
      }
    }
  }
}
```

### Method 2: View Mode
Switch to "Editor Only" view mode - highlighting automatically disabled.

## Troubleshooting

### Highlight not appearing

**Possible causes:**
1. Feature disabled in config
2. View mode is "Editor Only"
3. Cursor on empty line or whitespace
4. Word too short (< 2 characters)

**Solution:**
- Check `wiki-config.json` has `features.editor.previewHighlight.enabled: true`
- Switch to Split or Preview mode
- Place cursor on actual words

### Wrong element highlighted

**Possible causes:**
1. Duplicate words in document
2. Source position mapping not working

**Solution:**
- This is expected for duplicates - uses proximity to cursor
- Ensure markdown processor includes `data-source-start/end` attributes

### Performance issues

**Possible causes:**
1. Very large documents (>10,000 lines)
2. Complex nested structures

**Solution:**
- Feature is already debounced (50ms)
- Consider disabling for extremely large documents
- Edit in "Editor Only" mode for best performance

## Related Files

- Hook: `wiki-framework/src/hooks/useCursorHighlight.js`
- Integration: `wiki-framework/src/components/wiki/PageEditor.jsx`
- Styles: `wiki-framework/src/styles/index.css`
- Config: `wiki-config.json` (features.editor.previewHighlight)
