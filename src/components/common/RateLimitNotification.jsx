import React, { useState, useEffect, useRef } from 'react';

/**
 * Rate Limit Notification Component
 *
 * Displays a subtle notification when GitHub API rate limits are hit.
 * - Mobile: Full-width banner at bottom with slide animation
 * - Desktop: Card at top-right with elastic bounce animation
 * - Auto-dismisses: 10 seconds for rate limit errors, 3 seconds for success
 * - Prevents spam with cooldown period
 * - Shows retry count if retrying
 * - Mobile: Swipe down to dismiss
 * - Desktop: Click X button to dismiss
 *
 * TEST MODE:
 * To preview the notification, open browser console and run:
 * window.testRateLimitNotification()  // Show rate limit error
 * window.testRateLimitSuccess()       // Show success message
 */

// Expose test function globally
if (typeof window !== 'undefined') {
  window.testRateLimitNotification = () => {
    console.log('[RateLimitNotification] 🧪 Test mode activated');

    // Dispatch a test rate limit event
    const event = new CustomEvent('rate-limit-hit', {
      detail: {
        message: 'GitHub API rate limit reached. Retrying...',
        retrying: true,
        attempt: 2,
        maxRetries: 3,
        delay: 4000,
        route: 'GET /repos/{owner}/{repo}/pulls',
        error: {
          status: 403,
          message: 'API rate limit exceeded (TEST MODE)'
        }
      }
    });
    window.dispatchEvent(event);

    console.log('[RateLimitNotification] 🧪 Test event dispatched');
  };

  window.testRateLimitSuccess = () => {
    console.log('[RateLimitNotification] 🧪 Test success mode activated (auto-dismiss in 3s)');

    // Dispatch a test success event
    const event = new CustomEvent('rate-limit-success', {
      detail: {
        message: 'Request succeeded after retry',
        attempts: 2
      }
    });
    window.dispatchEvent(event);

    console.log('[RateLimitNotification] 🧪 Test success event dispatched');
  };
}

const RateLimitNotification = () => {
  const [shouldRender, setShouldRender] = useState(false); // Controls DOM mounting
  const [animationState, setAnimationState] = useState('idle'); // 'idle', 'entering', 'visible', 'exiting'
  const [message, setMessage] = useState('');
  const [retryCount, setRetryCount] = useState(0);
  const [isRetrying, setIsRetrying] = useState(false);
  const [isSuccess, setIsSuccess] = useState(false);
  const cooldownRef = useRef(false);
  const timeoutRef = useRef(null);
  const animationTimeoutRef = useRef(null);

  // Swipe to dismiss state (mobile only)
  const [swipeOffset, setSwipeOffset] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const touchStartY = useRef(0);
  const touchStartTime = useRef(0);

  // Cleanup timeouts on unmount only
  useEffect(() => {
    return () => {
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      if (animationTimeoutRef.current) {
        clearTimeout(animationTimeoutRef.current);
      }
    };
  }, []);

  // Trigger enter animation when component mounts
  useEffect(() => {
    if (shouldRender && animationState === 'idle') {
      // Use requestAnimationFrame to ensure DOM has painted before starting animation
      requestAnimationFrame(() => {
        setAnimationState('entering');
      });
    }
  }, [shouldRender, animationState]);

  // Helper function to dismiss with animation
  const dismissWithAnimation = () => {
    setAnimationState('exiting'); // Start exit animation

    // Clear any existing animation timeout
    if (animationTimeoutRef.current) {
      clearTimeout(animationTimeoutRef.current);
    }

    // Wait for animation to complete before removing from DOM
    // Desktop animation is 0.4s, mobile is 0.3s, so wait 500ms to be safe
    animationTimeoutRef.current = setTimeout(() => {
      setShouldRender(false);
      setAnimationState('idle');
      setSwipeOffset(0);
      setIsDragging(false);
    }, 500);
  };

  useEffect(() => {
    // Listen for rate limit events
    const handleRateLimit = (event) => {
      const { message: msg, retrying, attempt } = event.detail || {};

      // Cooldown period to prevent spam (5 seconds)
      if (cooldownRef.current) {
        console.log('[RateLimitNotification] Cooldown active, skipping notification');
        return;
      }

      // If notification is already visible, just update content without re-animating
      const isAlreadyVisible = animationState === 'entering' || animationState === 'visible';

      // Show notification
      setMessage(msg || 'API rate limit reached. Retrying automatically...');
      setRetryCount(attempt || 0);
      setIsRetrying(retrying !== false);
      setIsSuccess(false);

      if (!isAlreadyVisible) {
        setShouldRender(true);
        // animationState will be set to 'entering' by useEffect with requestAnimationFrame for smooth animation
      }

      // Set cooldown
      cooldownRef.current = true;

      // Clear existing timeout
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }

      // Auto-dismiss after 10 seconds
      timeoutRef.current = setTimeout(() => {
        dismissWithAnimation();
      }, 10000);

      // Clear cooldown after 5 seconds
      setTimeout(() => {
        cooldownRef.current = false;
      }, 5000);
    };

    // Listen for rate limit success (retry worked)
    const handleRateLimitSuccess = () => {
      console.log('[RateLimitNotification] Success event received, setting 3s timeout');

      // If notification is already visible, just update content without re-animating
      const isAlreadyVisible = animationState === 'entering' || animationState === 'visible';

      // Show success notification (works standalone or as transition from retry)
      setMessage('Request succeeded after retry');
      setIsRetrying(false);
      setIsSuccess(true);

      if (!isAlreadyVisible) {
        setShouldRender(true);
        // animationState will be set to 'entering' by useEffect with requestAnimationFrame for smooth animation
      }

      // Dismiss on success (3 seconds)
      if (timeoutRef.current) {
        clearTimeout(timeoutRef.current);
      }
      timeoutRef.current = setTimeout(() => {
        console.log('[RateLimitNotification] 3s timeout fired, hiding notification');
        dismissWithAnimation();
      }, 3000);
    };

    window.addEventListener('rate-limit-hit', handleRateLimit);
    window.addEventListener('rate-limit-success', handleRateLimitSuccess);

    return () => {
      window.removeEventListener('rate-limit-hit', handleRateLimit);
      window.removeEventListener('rate-limit-success', handleRateLimitSuccess);
      // Don't clear timeout here - it should persist across state changes
      // Only clear it when explicitly needed (new notification or manual dismiss)
    };
  }, [animationState, isRetrying, isSuccess]);

  const handleDismiss = () => {
    if (timeoutRef.current) {
      clearTimeout(timeoutRef.current);
    }
    dismissWithAnimation();
  };

  // Touch event handlers for swipe-to-dismiss (mobile only)
  const handleTouchStart = (e) => {
    // Only enable swipe on mobile viewports
    if (window.innerWidth >= 768) return;

    touchStartY.current = e.touches[0].clientY;
    touchStartTime.current = Date.now();
    setIsDragging(true);
  };

  const handleTouchMove = (e) => {
    if (!isDragging || window.innerWidth >= 768) return;

    const currentY = e.touches[0].clientY;
    const deltaY = currentY - touchStartY.current;

    // Only allow downward swipe (positive deltaY)
    if (deltaY > 0) {
      setSwipeOffset(deltaY);
    }
  };

  const handleTouchEnd = () => {
    if (!isDragging || window.innerWidth >= 768) {
      setIsDragging(false);
      setSwipeOffset(0);
      return;
    }

    const swipeDistance = swipeOffset;
    const swipeTime = Date.now() - touchStartTime.current;
    const swipeVelocity = swipeDistance / swipeTime; // pixels per ms

    // Dismiss if swiped down far enough (> 80px) or fast enough (> 0.5 px/ms)
    const shouldDismiss = swipeDistance > 80 || swipeVelocity > 0.5;

    if (shouldDismiss) {
      handleDismiss();
    } else {
      // Animate back to original position
      setSwipeOffset(0);
    }

    setIsDragging(false);
  };

  if (!shouldRender) return null;

  // Dynamic colors based on state
  const bgColors = isSuccess
    ? 'bg-gradient-to-r from-green-50 to-emerald-50 dark:from-green-900/90 dark:to-emerald-900/90'
    : 'bg-gradient-to-r from-orange-50 to-yellow-50 dark:from-orange-900/90 dark:to-yellow-900/90';

  const borderColor = isSuccess
    ? 'border-green-500 dark:border-green-400'
    : 'border-orange-500 dark:border-orange-400';

  const iconColor = isSuccess
    ? 'text-green-500 dark:text-green-400'
    : 'text-orange-500 dark:text-orange-400';

  const titleColor = isSuccess
    ? 'text-green-900 dark:text-green-100'
    : 'text-orange-900 dark:text-orange-100';

  const messageColor = isSuccess
    ? 'text-green-700 dark:text-green-300'
    : 'text-orange-700 dark:text-orange-300';

  const dismissColor = isSuccess
    ? 'text-green-600 dark:text-green-400 hover:text-green-800 dark:hover:text-green-200'
    : 'text-orange-600 dark:text-orange-400 hover:text-orange-800 dark:hover:text-orange-200';

  return (
    <>
      <style>{`
        @keyframes elasticInDesktop {
          0% {
            transform: scale(0) translateY(-20px);
            opacity: 0;
          }
          50% {
            transform: scale(1.1) translateY(5px);
          }
          75% {
            transform: scale(0.95) translateY(-2px);
          }
          100% {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }

        @keyframes elasticOutDesktop {
          0% {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
          25% {
            transform: scale(1.05) translateY(2px);
          }
          100% {
            transform: scale(0.8) translateY(-20px);
            opacity: 0;
          }
        }

        @keyframes slideInMobile {
          0% {
            transform: translateY(100%);
            opacity: 0;
          }
          100% {
            transform: translateY(0);
            opacity: 1;
          }
        }

        @keyframes slideOutMobile {
          0% {
            transform: translateY(0);
            opacity: 1;
          }
          100% {
            transform: translateY(100%);
            opacity: 0;
          }
        }

        .elastic-in {
          animation: slideInMobile 0.4s cubic-bezier(0.34, 1.56, 0.64, 1) forwards;
        }

        .elastic-out {
          animation: slideOutMobile 0.3s cubic-bezier(0.6, -0.28, 0.735, 0.045) forwards;
        }

        .elastic-visible {
          /* Keep element in final position after animation */
          transform: translateY(0);
          opacity: 1;
        }

        @media (min-width: 768px) {
          .elastic-in {
            animation: elasticInDesktop 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards;
          }

          .elastic-out {
            animation: elasticOutDesktop 0.4s cubic-bezier(0.6, -0.28, 0.735, 0.045) forwards;
          }

          .elastic-visible {
            transform: scale(1) translateY(0);
            opacity: 1;
          }
        }
      `}</style>
      <div
        className={`fixed z-40 ${
          animationState === 'entering' ? 'elastic-in' :
          animationState === 'exiting' ? 'elastic-out' :
          animationState === 'visible' ? 'elastic-visible' : ''
        }
          left-0 right-0 bottom-4 px-4
          md:left-auto md:right-4 md:bottom-auto md:top-20 md:px-0 md:w-80`}
        style={{
          transform: swipeOffset !== 0 ? `translateY(${swipeOffset}px)` : undefined,
          transition: isDragging ? 'none' : 'transform 0.3s ease-out',
          opacity: animationState === 'idle' ? 0 : (swipeOffset !== 0 ? Math.max(0, 1 - Math.abs(swipeOffset) / 150) : 1),
          visibility: animationState === 'idle' ? 'hidden' : 'visible',
        }}
        onAnimationEnd={(e) => {
          // When enter animation finishes, mark as visible
          if (animationState === 'entering' && e.animationName.includes('elastic')) {
            setAnimationState('visible');
          }
        }}
        onTouchStart={handleTouchStart}
        onTouchMove={handleTouchMove}
        onTouchEnd={handleTouchEnd}
      >
        <div className={`${bgColors} ${borderColor} rounded-lg shadow-lg backdrop-blur-sm
          border-l-4 md:border-l-4
          p-2.5 md:p-3 relative`}>
        {/* Swipe indicator (mobile only) */}
        <div className="md:hidden absolute top-1 left-1/2 -translate-x-1/2 w-10 h-1 bg-gray-400/30 dark:bg-gray-500/30 rounded-full"></div>

        <div className="flex items-start gap-2 md:gap-3">
          {/* Icon */}
          <div className="flex-shrink-0 mt-0.5">
            {isSuccess ? (
              <svg className={`w-4 h-4 md:w-5 md:h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            ) : isRetrying ? (
              <svg className={`w-4 h-4 md:w-5 md:h-5 ${iconColor} animate-spin`} fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className={`w-4 h-4 md:w-5 md:h-5 ${iconColor}`} fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z" />
              </svg>
            )}
          </div>

          {/* Content */}
          <div className="flex-1 min-w-0">
            <div className="flex items-start justify-between gap-2">
              <div className="flex-1 min-w-0">
                <p className={`text-xs md:text-sm font-medium ${titleColor}`}>
                  {isSuccess ? 'Success' : isRetrying ? 'Retrying Request' : 'Rate Limited'}
                </p>
                <p className={`text-xs ${messageColor} mt-0.5 line-clamp-2`}>
                  {message}
                </p>
                {isRetrying && retryCount > 0 && (
                  <p className={`text-xs ${messageColor} mt-1 flex items-center gap-1`}>
                    <svg className="w-3 h-3" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                      <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
                    </svg>
                    <span className="hidden sm:inline">Attempt {retryCount} of 3</span>
                    <span className="sm:hidden">{retryCount}/3</span>
                  </p>
                )}
              </div>

              {/* Dismiss button */}
              <button
                onClick={handleDismiss}
                className={`flex-shrink-0 ${dismissColor} transition-colors`}
                aria-label="Dismiss"
              >
                <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          </div>
        </div>
      </div>
      </div>
    </>
  );
};

export default RateLimitNotification;
