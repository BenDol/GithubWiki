import { useState, useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';
import { useWikiConfig } from '../../hooks/useWikiConfig';
import { useUIStore } from '../../store/uiStore';
import { configName, getItem, setItem } from '../../utils/storageManager';

const TUTORIAL_STORAGE_KEY = configName('first_time_tutorial_dismissed');

/**
 * FirstTimeTutorial - Animated tutorial popup for first-time visitors
 *
 * Features:
 * - Points at Tools dropdown (desktop) or hamburger menu (mobile)
 * - Smooth floating animation
 * - Glow effect
 * - Auto-dismiss on tool navigation or dropdown open
 * - Persistent dismissal via localStorage
 *
 * @param {Object} targetRef - Ref to the target element (Tools button or hamburger)
 * @param {boolean} isMobile - Whether in mobile viewport
 * @param {boolean} isToolsDropdownOpen - Whether Tools dropdown is open (desktop only)
 */
const FirstTimeTutorial = ({ targetRef, isMobile = false, isToolsDropdownOpen = false }) => {
  const { config } = useWikiConfig();
  const { sidebarOpen, setSidebarOpen } = useUIStore();
  const location = useLocation();
  const [isVisible, setIsVisible] = useState(false);
  const [isAnimating, setIsAnimating] = useState(false); // Controls animation state
  const [hasPosition, setHasPosition] = useState(false); // Track if position has been calculated
  const [position, setPosition] = useState({ top: 0, left: 0 });
  const tutorialRef = useRef(null);

  // Check if tutorial should be shown
  useEffect(() => {
    const dismissed = getItem(TUTORIAL_STORAGE_KEY);

    if (dismissed) {
      setIsVisible(false);
      return;
    }

    // Wait a bit before showing (avoid flickering on page load)
    const timer = setTimeout(() => {
      setIsVisible(true);
      // Trigger animation after mount
      requestAnimationFrame(() => {
        setIsAnimating(true);
      });
      // On mobile, open the sidebar automatically to show the Tools category
      if (isMobile) {
        setSidebarOpen(true);
      }
    }, 1000);

    return () => clearTimeout(timer);
  }, [isMobile, setSidebarOpen, targetRef]);

  // Auto-close when navigating to a tool
  useEffect(() => {
    if (!config?.wiki?.tools) return;

    const toolPaths = config.wiki.tools.map(tool => tool.path);
    const isOnToolPage = toolPaths.some(path => location.pathname.startsWith(path));

    if (isOnToolPage && isVisible) {
      // Trigger close animation
      setIsAnimating(false);
      // Wait for animation to complete before hiding
      setTimeout(() => {
        setIsVisible(false);
        setHasPosition(false);
        setItem(TUTORIAL_STORAGE_KEY, true);
      }, 300); // Match animation duration
      // Sidebar will auto-close via Sidebar's handleNavigate on mobile
    }
  }, [location.pathname, config, isVisible]);

  // Auto-close when Tools dropdown opens
  useEffect(() => {
    if (isToolsDropdownOpen && isVisible) {
      // Trigger close animation
      setIsAnimating(false);
      // Wait for animation to complete before hiding
      setTimeout(() => {
        setIsVisible(false);
        setHasPosition(false);
        setItem(TUTORIAL_STORAGE_KEY, true);
      }, 300); // Match animation duration
    }
  }, [isToolsDropdownOpen, isVisible]);

  // Update position when target element changes or window resizes
  useEffect(() => {
    if (!isVisible) return;

    const updatePosition = () => {
      let targetElement;

      if (isMobile) {
        // Mobile: Find the Tools category in the sidebar
        targetElement = document.querySelector('[data-category-id="tools"]');
        // If sidebar hasn't rendered yet or Tools category not found, don't show
        if (!targetElement) return;
      } else {
        // Desktop: Use the Tools button ref
        if (!targetRef?.current) return;
        targetElement = targetRef.current;
      }

      const targetRect = targetElement.getBoundingClientRect();
      const tutorialRect = tutorialRef.current?.getBoundingClientRect();

      if (!tutorialRect) return;

      let top, left;

      if (isMobile) {
        // Mobile: Position below the Tools category (same as desktop)
        top = targetRect.bottom + 12;
        left = targetRect.left + targetRect.width / 2 - tutorialRect.width / 2;
      } else {
        // Desktop: Position below Tools dropdown
        top = targetRect.bottom + 12;
        left = targetRect.left + targetRect.width / 2 - tutorialRect.width / 2;
      }

      // Ensure tutorial doesn't go off-screen
      const maxLeft = window.innerWidth - tutorialRect.width - 16;
      const maxTop = window.innerHeight - tutorialRect.height - 16;
      left = Math.max(16, Math.min(left, maxLeft));
      top = Math.max(16, Math.min(top, maxTop));

      setPosition({ top, left });
      setHasPosition(true); // Mark position as calculated
    };

    // For mobile, wait a bit for sidebar to render
    const delay = isMobile ? 500 : 0;
    const timer = setTimeout(updatePosition, delay);

    window.addEventListener('resize', updatePosition);
    window.addEventListener('scroll', updatePosition);

    return () => {
      clearTimeout(timer);
      window.removeEventListener('resize', updatePosition);
      window.removeEventListener('scroll', updatePosition);
    };
  }, [isVisible, targetRef, isMobile, sidebarOpen]);

  const handleDismiss = () => {
    // Trigger close animation
    setIsAnimating(false);
    // Wait for animation to complete before hiding
    setTimeout(() => {
      setIsVisible(false);
      setHasPosition(false);
      setItem(TUTORIAL_STORAGE_KEY, true);
    }, 300); // Match animation duration
    // On mobile, keep the sidebar open so user can explore
    // (it will auto-close when they navigate to a tool)
  };

  if (!isVisible) {
    return null;
  }
  if (!isMobile && !targetRef?.current) {
    return null;
  }

  return (
    <>
      <style dangerouslySetInnerHTML={{
        __html: `
          @keyframes float-tutorial {
            0%, 100% { transform: translateY(0px); }
            50% { transform: translateY(-4px); }
          }
          @keyframes glow-tutorial {
            0%, 100% {
              box-shadow: 0 0 20px rgba(59, 130, 246, 0.5),
                          0 0 40px rgba(59, 130, 246, 0.3),
                          0 10px 30px rgba(0, 0, 0, 0.3);
            }
            50% {
              box-shadow: 0 0 30px rgba(59, 130, 246, 0.7),
                          0 0 60px rgba(59, 130, 246, 0.4),
                          0 10px 30px rgba(0, 0, 0, 0.3);
            }
          }
          @keyframes glow-drop-tutorial {
            0%, 100% { filter: drop-shadow(0 0 4px rgba(59, 130, 246, 0.6)); }
            50% { filter: drop-shadow(0 0 8px rgba(59, 130, 246, 0.8)); }
          }
          @keyframes slide-in-tutorial {
            0% {
              opacity: 0;
              transform: translateY(-20px);
            }
            100% {
              opacity: 1;
              transform: translateY(0);
            }
          }
          @keyframes slide-out-tutorial {
            0% {
              opacity: 1;
              transform: translateY(0);
            }
            100% {
              opacity: 0;
              transform: translateY(-20px);
            }
          }
          .tutorial-float { animation: float-tutorial 3s ease-in-out infinite; }
          .tutorial-glow { animation: glow-tutorial 3s ease-in-out infinite; }
          .tutorial-glow-drop { animation: glow-drop-tutorial 3s ease-in-out infinite; }
          .tutorial-slide-in { animation: slide-in-tutorial 0.3s ease-out forwards; }
          .tutorial-slide-out { animation: slide-out-tutorial 0.3s ease-out forwards; }
        `
      }} />

      <div
        ref={tutorialRef}
        className={`fixed z-[9999] ${isAnimating ? 'tutorial-slide-in' : 'tutorial-slide-out'}`}
        style={{
          top: `${position.top}px`,
          left: `${position.left}px`,
          opacity: hasPosition ? 1 : 0,
          pointerEvents: hasPosition ? 'auto' : 'none',
        }}
      >
        {/* Wrapper for float animation */}
        <div className="tutorial-float">
          {/* Pointer Arrow - pointing up for both mobile and desktop */}
          <div className="absolute -top-2 left-1/2 -translate-x-1/2 w-0 h-0 border-l-8 border-r-8 border-b-8 border-l-transparent border-r-transparent border-b-blue-500 dark:border-b-blue-400 tutorial-glow-drop" />

          {/* Tutorial Box */}
          <div className="bg-gradient-to-br from-blue-500 to-blue-600 dark:from-blue-600 dark:to-blue-700 text-white rounded-lg shadow-2xl p-3 max-w-[280px] relative tutorial-glow">
          {/* Close Button */}
          <button
            onClick={handleDismiss}
            className="absolute top-1 right-1 p-1 rounded-full hover:bg-white/20 transition-colors"
            aria-label="Dismiss tutorial"
          >
            <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>

          {/* Content */}
          <div className="pr-6 text-center">
            <div className="mb-1.5">
              <h3 className="font-bold text-base">Welcome Slayer!</h3>
            </div>

            <p className="text-xs leading-relaxed">
              {isMobile ? (
                <>
                  Tap on <span className="font-semibold">Tools</span> to find calculators and builders to help you plan your strategy!
                </>
              ) : (
                <>
                  Check out our <span className="font-semibold">Tools</span>! We have calculators, builders, and planners to optimize your gameplay.
                </>
              )}
            </p>
          </div>
          </div>
        </div>
      </div>
    </>
  );
};

export default FirstTimeTutorial;
