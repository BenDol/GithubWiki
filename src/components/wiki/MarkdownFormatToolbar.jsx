import React, { useRef, useState } from 'react';
import { Bold, Italic, Link, List, ListOrdered, Code, Heading1, Heading2, Quote, Table, Palette, AlignLeft, AlignCenter, AlignRight, X, Smile, Plus } from 'lucide-react';

/**
 * MarkdownFormatToolbar - Toolbar for markdown formatting and content insertion
 *
 * Features:
 * - Common markdown formatting buttons (bold, italic, headings, lists, etc.)
 * - Generic content pickers (configurable via contentPickers prop)
 * - Emoticon picker for inserting emoticons
 * - Responsive design with horizontal scroll on mobile
 * - Scalable for many formatting options
 *
 * Props:
 * - contentPickers: Array of picker button configs { icon, label, action, handler }
 * - onFormat: Callback for formatting actions
 * - onColorPicker: Callback for color picker toggle
 * - colorButtonRef: Ref for color button positioning
 * - boldActive/italicActive: Active states for format buttons
 * - emoticonMap: Map of emoticon IDs to names (optional, for custom emoticons)
 * - shortcutDisplayMap: Map of action -> shortcut display string (e.g., "Ctrl+B")
 */
const MarkdownFormatToolbar = ({ contentPickers = [], onFormat, onColorPicker, colorButtonRef, boldActive = false, italicActive = false, emoticonMap = null, shortcutDisplayMap = {} }) => {
  const internalColorButtonRef = useRef(null);
  const alignButtonRef = useRef(null);
  const alignDropdownRef = useRef(null);
  const emoticonButtonRef = useRef(null);
  const emoticonDropdownRef = useRef(null);
  const insertButtonRef = useRef(null);
  const insertDropdownRef = useRef(null);
  const [showAlignmentPicker, setShowAlignmentPicker] = useState(false);
  const [showEmoticonPicker, setShowEmoticonPicker] = useState(false);
  const [showInsertPicker, setShowInsertPicker] = useState(false);
  const [backdropReady, setBackdropReady] = useState(false);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });
  const [emoticonDropdownPosition, setEmoticonDropdownPosition] = useState({ top: 0, left: 0 });
  const [insertDropdownPosition, setInsertDropdownPosition] = useState({ top: 0, left: 0 });
  const [selectedEmoticonSize, setSelectedEmoticonSize] = useState('large');

  // Default emoticons if no custom map provided
  const defaultEmoticons = {
    1: 'Hello',
    2: 'Yep',
    3: 'Laugh',
    4: 'Okay',
    5: 'Cheer',
    6: 'Cool',
    7: 'Exhausted',
    8: 'Congrats',
    1001: 'Ok',
    1002: 'No',
    1003: 'Hm',
    1004: 'Love',
    1005: 'Question',
    1006: 'Sleep',
    1007: 'Sad',
    1008: 'Happy',
  };

  const emoticons = emoticonMap || defaultEmoticons;

  const formatButtons = [
    { icon: Bold, label: 'Bold', action: 'bold', active: boldActive },
    { icon: Italic, label: 'Italic', action: 'italic', active: italicActive },
    { icon: Heading1, label: 'Heading 1', action: 'h1' },
    { icon: Heading2, label: 'Heading 2', action: 'h2' },
    { icon: List, label: 'Bullet List', action: 'ul' },
    { icon: ListOrdered, label: 'Numbered List', action: 'ol' },
    { icon: Link, label: 'Link', action: 'link' },
    { icon: Smile, label: 'Insert Emoticon', action: 'emoticon', special: true },
    { icon: Code, label: 'Code Block', action: 'code' },
    { icon: Quote, label: 'Quote', action: 'quote' },
    { icon: Table, label: 'Insert Table', action: 'table' },
    { icon: Palette, label: 'Text Color', action: 'color', special: true },
    { icon: AlignLeft, label: 'Alignment', action: 'align', special: true },
  ];

  // Use provided content pickers (configured by parent project)
  const pickerButtons = contentPickers;

  const handleFormatClick = (action, special, buttonElement = null) => {
    if (special && action === 'color') {
      onColorPicker?.();
    } else if (special && action === 'insert') {
      const newState = !showInsertPicker;

      // Use provided button element or fall back to ref
      // This handles both desktop and mobile Insert buttons correctly
      const targetButton = buttonElement || insertButtonRef.current;

      if (newState && targetButton) {
        // Calculate position to keep dropdown in viewport
        const buttonRect = targetButton.getBoundingClientRect();
        const dropdownWidth = 200; // Approximate dropdown width
        const dropdownHeight = 250; // Approximate dropdown height (will grow with more pickers)
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 8;

        let top = buttonRect.bottom + 4;
        let left = buttonRect.left;

        // Adjust if going off right edge
        if (left + dropdownWidth > viewportWidth - padding) {
          left = viewportWidth - dropdownWidth - padding;
        }

        // Adjust if going off left edge
        if (left < padding) {
          left = padding;
        }

        // Adjust if going off bottom - show above button instead
        if (top + dropdownHeight > viewportHeight - padding) {
          top = buttonRect.top - dropdownHeight - 4;
        }

        // Ensure it doesn't go above viewport
        if (top < padding) {
          top = padding;
        }

        setInsertDropdownPosition({ top, left });
      }

      setShowInsertPicker(newState);
      if (newState) {
        // Close other pickers if open
        setShowAlignmentPicker(false);
        setShowEmoticonPicker(false);
        // Delay backdrop to prevent immediate closure
        setBackdropReady(false);
        setTimeout(() => {
          setBackdropReady(true);
        }, 100);
      }
    } else if (special && action === 'emoticon') {
      const newState = !showEmoticonPicker;

      if (newState && emoticonButtonRef.current) {
        // Calculate position to keep dropdown in viewport
        const buttonRect = emoticonButtonRef.current.getBoundingClientRect();
        const dropdownWidth = 280; // Approximate dropdown width (wider for emoticons)
        const dropdownHeight = 320; // Approximate dropdown height
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 8;

        let top = buttonRect.bottom + 4;
        let left = buttonRect.left;

        // Adjust if going off right edge
        if (left + dropdownWidth > viewportWidth - padding) {
          left = viewportWidth - dropdownWidth - padding;
        }

        // Adjust if going off left edge
        if (left < padding) {
          left = padding;
        }

        // Adjust if going off bottom - show above button instead
        if (top + dropdownHeight > viewportHeight - padding) {
          top = buttonRect.top - dropdownHeight - 4;
        }

        // Ensure it doesn't go above viewport
        if (top < padding) {
          top = padding;
        }

        setEmoticonDropdownPosition({ top, left });
      }

      setShowEmoticonPicker(newState);
      if (newState) {
        // Close other pickers if open
        setShowAlignmentPicker(false);
        setShowInsertPicker(false);
        // Delay backdrop to prevent immediate closure
        setBackdropReady(false);
        setTimeout(() => {
          setBackdropReady(true);
        }, 100);
      }
    } else if (special && action === 'align') {
      const newState = !showAlignmentPicker;

      if (newState && alignButtonRef.current) {
        // Calculate position to keep dropdown in viewport
        const buttonRect = alignButtonRef.current.getBoundingClientRect();
        const dropdownWidth = 160; // Approximate dropdown width
        const dropdownHeight = 180; // Approximate dropdown height
        const viewportWidth = window.innerWidth;
        const viewportHeight = window.innerHeight;
        const padding = 8;

        let top = buttonRect.bottom + 4;
        let left = buttonRect.left;

        // Adjust if going off right edge
        if (left + dropdownWidth > viewportWidth - padding) {
          left = viewportWidth - dropdownWidth - padding;
        }

        // Adjust if going off left edge
        if (left < padding) {
          left = padding;
        }

        // Adjust if going off bottom - show above button instead
        if (top + dropdownHeight > viewportHeight - padding) {
          top = buttonRect.top - dropdownHeight - 4;
        }

        // Ensure it doesn't go above viewport
        if (top < padding) {
          top = padding;
        }

        setDropdownPosition({ top, left });
      }

      setShowAlignmentPicker(newState);
      if (newState) {
        // Close other pickers if open
        setShowEmoticonPicker(false);
        setShowInsertPicker(false);
        // Delay backdrop to prevent immediate closure
        setBackdropReady(false);
        setTimeout(() => {
          setBackdropReady(true);
        }, 100);
      }
    } else {
      onFormat?.(action);
    }
  };

  const handleAlignmentSelect = (alignment) => {
    onFormat?.('align', alignment);
    setShowAlignmentPicker(false);
    setBackdropReady(false);
  };

  const handleEmoticonSelect = (emoticonId, emoticonName) => {
    onFormat?.('emoticon', { id: emoticonId, name: emoticonName, size: selectedEmoticonSize });
    setShowEmoticonPicker(false);
    setBackdropReady(false);
  };

  return (
    <div className="border-b border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 relative">
      {/* Toolbar Container - Split into scrollable left and pinned right on mobile */}
      <div className="flex items-center">
        {/* Left Section - Scrollable Format Buttons */}
        <div className="flex-1 flex items-center gap-1 px-3 py-2 overflow-x-auto scrollbar-thin">
          {/* Format Buttons */}
          <div className="flex items-center gap-0.5 relative">
            {formatButtons.map((btn, idx) => (
              <button
                key={btn.action}
                ref={
                  btn.action === 'color' ? (colorButtonRef || internalColorButtonRef) :
                  btn.action === 'align' ? alignButtonRef :
                  btn.action === 'emoticon' ? emoticonButtonRef :
                  null
                }
                onClick={(e) => {
                  if (btn.action === 'align' || btn.action === 'emoticon') {
                    e.stopPropagation();
                  }
                  handleFormatClick(btn.action, btn.special);
                }}
                className={`p-2 rounded transition-colors flex-shrink-0 ${
                  btn.active ||
                  (btn.action === 'align' && showAlignmentPicker) ||
                  (btn.action === 'emoticon' && showEmoticonPicker)
                    ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                    : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
                }`}
                title={shortcutDisplayMap[btn.action] ? `${btn.label} (${shortcutDisplayMap[btn.action]})` : btn.label}
              >
                <btn.icon className="w-4 h-4" />
              </button>
            ))}
          </div>

          {/* Divider - Desktop only */}
          <div className="hidden md:block h-6 w-px bg-gray-300 dark:bg-gray-600 mx-1 flex-shrink-0" />

          {/* Insert Button - Desktop (flows with format buttons) */}
          <button
            ref={insertButtonRef}
            onClick={(e) => {
              e.stopPropagation();
              handleFormatClick('insert', true, e.currentTarget);
            }}
            className={`hidden md:flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-colors text-sm font-medium flex-shrink-0 ${
              showInsertPicker
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
            title="Insert Content"
          >
            <Plus className="w-4 h-4" />
            <span>Insert</span>
          </button>
        </div>

        {/* Right Section - Pinned Insert Button (Mobile only) */}
        <div className="md:hidden flex items-center gap-1 px-3 py-2 border-l border-gray-200 dark:border-gray-700 bg-white dark:bg-gray-800 flex-shrink-0">
          <button
            onClick={(e) => {
              e.stopPropagation();
              handleFormatClick('insert', true, e.currentTarget);
            }}
            className={`flex items-center gap-1.5 px-2.5 py-1.5 rounded transition-colors text-sm font-medium flex-shrink-0 ${
              showInsertPicker
                ? 'bg-blue-100 dark:bg-blue-900/30 text-blue-600 dark:text-blue-400'
                : 'hover:bg-gray-100 dark:hover:bg-gray-700 text-gray-700 dark:text-gray-300'
            }`}
            title="Insert Content"
          >
            <Plus className="w-4 h-4" />
            <span className="hidden sm:inline">Insert</span>
          </button>
        </div>
      </div>

      {/* Alignment Picker Dropdown - Outside scrollable container */}
      {showAlignmentPicker && (
        <>
          {/* Alignment options - MUST render before backdrop */}
          <div
            ref={alignDropdownRef}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-2"
            style={{
              position: 'fixed',
              top: `${dropdownPosition.top}px`,
              left: `${dropdownPosition.left}px`,
              zIndex: 9999,
              pointerEvents: 'auto',
              maxWidth: 'calc(100vw - 16px)' // Ensure it never exceeds viewport width
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

          {/* Backdrop to close on click - renders AFTER dropdown to not block it */}
          {backdropReady && (
            <div
              className="fixed inset-0 z-[100]"
              style={{
                pointerEvents: 'auto'
              }}
              onClick={() => {
                setShowAlignmentPicker(false);
                setBackdropReady(false);
              }}
            />
          )}
        </>
      )}

      {/* Insert Content Dropdown - Outside scrollable container */}
      {showInsertPicker && (
        <>
          {/* Insert options - MUST render before backdrop */}
          <div
            ref={insertDropdownRef}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-2"
            style={{
              position: 'fixed',
              top: `${insertDropdownPosition.top}px`,
              left: `${insertDropdownPosition.left}px`,
              zIndex: 9999,
              pointerEvents: 'auto',
              maxWidth: 'calc(100vw - 16px)' // Ensure it never exceeds viewport width
            }}
          >
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1">
              Insert Content
            </div>
            <div className="flex flex-col gap-1 min-w-[180px]">
              {pickerButtons.map((btn) => (
                <button
                  key={btn.action}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    setShowInsertPicker(false);
                    setBackdropReady(false);
                    btn.handler();
                  }}
                  className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors text-left text-gray-700 dark:text-gray-300"
                  title={btn.label}
                >
                  <btn.icon className="w-4 h-4" />
                  <span>{btn.label}</span>
                </button>
              ))}
            </div>
          </div>

          {/* Backdrop to close on click - renders AFTER dropdown to not block it */}
          {backdropReady && (
            <div
              className="fixed inset-0 z-[100]"
              style={{
                pointerEvents: 'auto'
              }}
              onClick={() => {
                setShowInsertPicker(false);
                setBackdropReady(false);
              }}
            />
          )}
        </>
      )}

      {/* Emoticon Picker Dropdown - Outside scrollable container */}
      {showEmoticonPicker && (
        <>
          {/* Emoticon options - MUST render before backdrop */}
          <div
            ref={emoticonDropdownRef}
            className="bg-white dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-lg shadow-xl p-3"
            style={{
              position: 'fixed',
              top: `${emoticonDropdownPosition.top}px`,
              left: `${emoticonDropdownPosition.left}px`,
              zIndex: 9999,
              pointerEvents: 'auto',
              maxWidth: 'calc(100vw - 16px)', // Ensure it never exceeds viewport width
              maxHeight: '320px',
              overflowY: 'auto'
            }}
          >
            <div className="text-xs font-semibold text-gray-500 dark:text-gray-400 mb-2 px-1">
              Insert Emoticon
            </div>

            {/* Size Selector */}
            <div className="mb-3 px-1">
              <div className="text-[10px] text-gray-500 dark:text-gray-400 mb-1">Size:</div>
              <div className="flex gap-1">
                {[
                  { value: 'small', label: 'S', title: 'Small (24px)' },
                  { value: 'medium', label: 'M', title: 'Medium (32px)' },
                  { value: 'large', label: 'L', title: 'Large (48px)' },
                  { value: 'xlarge', label: 'XL', title: 'Extra Large (64px)' },
                  { value: 'original', label: 'Orig', title: 'Original (native)' },
                ].map(({ value, label, title }) => (
                  <button
                    key={value}
                    onClick={(e) => {
                      e.preventDefault();
                      setSelectedEmoticonSize(value);
                    }}
                    className={`flex-1 px-2 py-1 text-[10px] rounded transition-colors ${
                      selectedEmoticonSize === value
                        ? 'bg-blue-500 text-white'
                        : 'bg-gray-100 dark:bg-gray-700 text-gray-700 dark:text-gray-300 hover:bg-gray-200 dark:hover:bg-gray-600'
                    }`}
                    title={title}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </div>

            <div className="grid grid-cols-4 gap-2">
              {Object.entries(emoticons).map(([id, name]) => (
                <button
                  key={id}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    handleEmoticonSelect(id, name);
                  }}
                  className="flex flex-col items-center gap-1 p-2 hover:bg-gray-100 dark:hover:bg-gray-700 rounded transition-colors"
                  title={name}
                >
                  <img
                    src={`/images/emoticons/Emoticon_${id}.png`}
                    alt={name}
                    className="w-8 h-8 object-contain"
                    loading="lazy"
                  />
                  <span className="text-[10px] text-gray-600 dark:text-gray-400 text-center leading-tight">
                    {name}
                  </span>
                </button>
              ))}
            </div>
          </div>

          {/* Backdrop to close on click - renders AFTER dropdown to not block it */}
          {backdropReady && (
            <div
              className="fixed inset-0 z-[100]"
              style={{
                pointerEvents: 'auto'
              }}
              onClick={() => {
                setShowEmoticonPicker(false);
                setBackdropReady(false);
              }}
            />
          )}
        </>
      )}
    </div>
  );
};

export default MarkdownFormatToolbar;
