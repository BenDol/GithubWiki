import { useUIStore } from '../../store/uiStore';

/**
 * PageBackground - Reusable background component for custom page backgrounds
 *
 * Features:
 * - Theme-aware opacity (different opacity for dark/light modes)
 * - Custom background override per page
 * - URL encoding for filenames with spaces
 * - Overlays global default background when custom background is provided
 *
 * Note: The default background is now applied globally via CSS (body::before).
 * This component only renders when a custom background is provided.
 *
 * @param {object} background - Custom background config (optional)
 * @param {boolean} isPreview - Whether rendering in preview mode (absolute vs fixed positioning)
 * @param {boolean} useDefault - DEPRECATED - default is now global CSS, this component only handles custom backgrounds
 */
const PageBackground = ({
  background = null,
  isPreview = false,
  useDefault = true // Kept for backward compatibility but ignored
}) => {
  // Get dark mode state from UI store
  const darkMode = useUIStore((state) => state.darkMode);

  // If no custom background provided, return null (let global CSS show the default)
  if (!background) {
    return null;
  }

  // Custom background provided - render it to override the global default
  const effectiveBackground = background;

  // Determine opacity based on theme
  // Support both old single opacity and new dark/light opacity properties
  let effectiveOpacity;
  if (effectiveBackground.darkOpacity !== undefined || effectiveBackground.lightOpacity !== undefined) {
    // New format: separate dark/light opacities
    effectiveOpacity = darkMode
      ? (effectiveBackground.darkOpacity !== undefined ? effectiveBackground.darkOpacity : 0.04)
      : (effectiveBackground.lightOpacity !== undefined ? effectiveBackground.lightOpacity : 0.4);
  } else {
    // Old format: single opacity (backward compatibility)
    effectiveOpacity = effectiveBackground.opacity !== undefined ? effectiveBackground.opacity : 1;
  }

  // Debug logging
  console.log('[PageBackground] Background config:', {
    hasCustomBackground: !!background,
    effectiveBackground,
    darkMode,
    effectiveOpacity,
    isPreview,
    useDefault
  });

  // Build background styles object
  const backgroundStyles = {
    // Encode the URL to handle spaces and special characters
    backgroundImage: `url(${encodeURI(effectiveBackground.path).replace(/\(/g, '%28').replace(/\)/g, '%29')})`,
    backgroundRepeat: effectiveBackground.repeat || 'no-repeat',
    backgroundSize: effectiveBackground.size || 'cover',
    backgroundPosition: effectiveBackground.position || 'center',
    backgroundAttachment: effectiveBackground.attachment || 'scroll',
    opacity: effectiveOpacity,
    mixBlendMode: effectiveBackground.blendMode || 'normal',
    zIndex: 1 // Higher than global default (z-index: 0) to override it
  };

  return (
    <div
      className={`page-background ${isPreview ? 'absolute' : 'fixed'} top-0 left-0 right-0 bottom-0 pointer-events-none`}
      style={backgroundStyles}
      aria-hidden="true"
    />
  );
};

export default PageBackground;
