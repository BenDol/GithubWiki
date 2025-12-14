import React, { useRef } from 'react';
import { Bold, Italic, Link, List, ListOrdered, Code, Heading1, Heading2, Quote, Image as ImageIcon, Sparkles, Sword, Table, Palette } from 'lucide-react';

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
  ];

  const pickerButtons = [
    { icon: ImageIcon, label: 'Insert Image', action: 'image', handler: onInsertImage },
    { icon: Sparkles, label: 'Insert Spell', action: 'spell', handler: onInsertSpell },
    { icon: Sword, label: 'Insert Equipment', action: 'equipment', handler: onInsertEquipment },
  ];

  const handleFormatClick = (action, special) => {
    if (special && action === 'color') {
      onColorPicker?.();
    } else {
      onFormat?.(action);
    }
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800">
      {/* Toolbar Container */}
      <div className="flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-thin">
        {/* Format Buttons */}
        <div className="flex items-center gap-0.5">
          {formatButtons.map((btn, idx) => (
            <button
              key={btn.action}
              ref={btn.action === 'color' ? (colorButtonRef || internalColorButtonRef) : null}
              onClick={() => handleFormatClick(btn.action, btn.special)}
              className={`p-2 rounded transition-colors flex-shrink-0 ${
                btn.active
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
    </div>
  );
};

export default MarkdownFormatToolbar;
