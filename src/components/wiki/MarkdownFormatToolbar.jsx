import React, { useRef, useState } from 'react';
import { Bold, Italic, Link, List, ListOrdered, Code, Heading1, Heading2, Quote, Image as ImageIcon, Sparkles, Sword, Table, Palette, AlignLeft, AlignCenter, AlignRight, X } from 'lucide-react';

/**
 * MarkdownFormatToolbar - Toolbar for markdown formatting and content insertion
 *
 * Features:
 * - Common markdown formatting buttons (bold, italic, headings, lists, etc.)
 * - Content pickers/inserters (images, spells, equipment, etc.)
 * - Responsive design with horizontal scroll on mobile
 * - Scalable for many formatting options
 */
const MarkdownFormatToolbar = ({ onInsertSpell, onInsertEquipment, onInsertImage, onFormat, onColorPicker, colorButtonRef, boldActive = false, italicActive = false }) => {
  const internalColorButtonRef = useRef(null);
  const alignButtonRef = useRef(null);
  const [showAlignmentPicker, setShowAlignmentPicker] = useState(false);
  const [backdropReady, setBackdropReady] = useState(false);

  const formatButtons = [
    { icon: Bold, label: 'Bold', action: 'bold', shortcut: 'Ctrl+B', active: boldActive },
    { icon: Italic, label: 'Italic', action: 'italic', shortcut: 'Ctrl+I', active: italicActive },
    { icon: Heading1, label: 'Heading 1', action: 'h1' },
    { icon: Heading2, label: 'Heading 2', action: 'h2' },
    { icon: List, label: 'Bullet List', action: 'ul' },
    { icon: ListOrdered, label: 'Numbered List', action: 'ol' },
    { icon: Link, label: 'Link', action: 'link', shortcut: 'Ctrl+K' },
    { icon: Code, label: 'Code Block', action: 'code' },
    { icon: Quote, label: 'Quote', action: 'quote' },
    { icon: Table, label: 'Insert Table', action: 'table' },
    { icon: Palette, label: 'Text Color', action: 'color', special: true },
    { icon: AlignLeft, label: 'Alignment', action: 'align', special: true },
  ];

  const pickerButtons = [
    { icon: ImageIcon, label: 'Insert Image', action: 'image', handler: onInsertImage },
    { icon: Sparkles, label: 'Insert Spell', action: 'spell', handler: onInsertSpell },
    { icon: Sword, label: 'Insert Equipment', action: 'equipment', handler: onInsertEquipment },
  ];

  const handleFormatClick = (action, special) => {
    if (special && action === 'color') {
      onColorPicker?.();
    } else if (special && action === 'align') {
      console.log('[MarkdownFormatToolbar] Alignment button clicked, current state:', showAlignmentPicker);
      const newState = !showAlignmentPicker;
      setShowAlignmentPicker(newState);
      if (newState) {
        // Delay backdrop to prevent immediate closure
        setBackdropReady(false);
        setTimeout(() => setBackdropReady(true), 100);
      }
    } else {
      onFormat?.(action);
    }
  };

  const handleAlignmentSelect = (alignment) => {
    console.log('[MarkdownFormatToolbar] Alignment selected:', alignment);
    onFormat?.('align', alignment);
    setShowAlignmentPicker(false);
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 relative">
      {/* Toolbar Container */}
      <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-thin">
        {/* Format Buttons */}
        <div className="flex items-center gap-0.5 relative">
          {formatButtons.map((btn, idx) => (
            <button
              key={btn.action}
              ref={btn.action === 'color' ? (colorButtonRef || internalColorButtonRef) : btn.action === 'align' ? alignButtonRef : null}
              onClick={(e) => {
                if (btn.action === 'align') {
                  e.stopPropagation();
                }
                handleFormatClick(btn.action, btn.special);
              }}
              className={`p-2 rounded transition-colors flex-shrink-0 ${
                btn.active || (btn.action === 'align' && showAlignmentPicker)
                  ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                  : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
              }`}
              title={btn.shortcut ? `${btn.label} (${btn.shortcut})` : btn.label}
            >
              <btn.icon className="w-4 h-4" />
            </button>
          ))}
        </div>

        {/* Divider */}
        <div className="h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1 flex-shrink-0" />

        {/* Picker Buttons */}
        <div className="flex items-center gap-0.5">
          {pickerButtons.map((btn) => (
            <button
              key={btn.action}
              onClick={btn.handler}
              className="flex items-center gap-1.5 px-2.5 py-1.5 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-sm font-medium text-gray-700 dark:text-gray-300 flex-shrink-0"
              title={btn.label}
            >
              <btn.icon className="w-4 h-4" />
              <span className="hidden sm:inline">{btn.label}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Alignment Picker Dropdown - Outside scrollable container */}
      {showAlignmentPicker && (
        <>
          {/* Backdrop to close on click - positioned below toolbar */}
          {backdropReady && (
            <div
              className="fixed left-0 right-0 bottom-0 z-[100]"
              style={{
                top: '100px' // Start below the toolbar area
              }}
              onClick={() => {
                console.log('[MarkdownFormatToolbar] Backdrop clicked, closing dropdown');
                setShowAlignmentPicker(false);
                setBackdropReady(false);
              }}
            />
          )}
          {/* Alignment options */}
          <div
            className="absolute bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-2"
            style={{
              position: 'absolute',
              top: '100%',
              left: '12px',
              marginTop: '4px',
              zIndex: 101
            }}
          >
            <div className="flex flex-col gap-1 min-w-[140px]">
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleAlignmentSelect('none');
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-left text-gray-700 dark:text-gray-300"
              >
                <X className="w-4 h-4" />
                <span>No Alignment</span>
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleAlignmentSelect('left');
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-left text-gray-700 dark:text-gray-300"
              >
                <AlignLeft className="w-4 h-4" />
                <span>Align Left</span>
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleAlignmentSelect('center');
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-left text-gray-700 dark:text-gray-300"
              >
                <AlignCenter className="w-4 h-4" />
                <span>Align Center</span>
              </button>
              <button
                onMouseDown={(e) => {
                  e.preventDefault();
                  handleAlignmentSelect('right');
                }}
                className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-left text-gray-700 dark:text-gray-300"
              >
                <AlignRight className="w-4 h-4" />
                <span>Align Right</span>
              </button>
            </div>
          </div>
        </>
      )}
    </div>
  );
};

export default MarkdownFormatToolbar;
