import { useState, useEffect, useRef } from 'react';
import { X, Heart } from 'lucide-react';

// Default generic donation messages (used when no context provided)
const DEFAULT_DONATION_MESSAGES = [
  "Hey! Want to help keep this wiki running? ☕",
  "This wiki runs on coffee and community support! 💖",
  "Support us and we'll keep updating this wiki! 🎮",
  "Help us keep the servers alive! Every bit helps! ⚡",
  "Love this wiki? Consider supporting us! 🙏",
  "Your support keeps us going strong! 💪",
  "A small donation makes a big difference! ✨",
  "Help fuel our passion project! 🚀",
];

/**
 * DonationPrompt Component
 *
 * @param {Function} onClose - Callback when prompt is closed
 * @param {Function} onDonate - Callback when donate button is clicked
 * @param {Array<string>} messages - Custom messages to display (optional)
 * @param {React.Component} MascotComponent - Custom mascot component (optional, defaults to heart icon)
 * @param {boolean} showCard - Whether to show donation card after animation (default: true)
 * @param {string} position - CSS position style (default: 'fixed bottom-8 left-8')
 * @param {number} textSpeed - Speed of typewriter effect in ms per character (default: 50)
 * @param {number} pauseDuration - Duration to show complete message before exiting in ms (default: 2000)
 */
const DonationPrompt = ({
  onClose,
  onDonate,
  messages = null,
  MascotComponent = null,
  showCard = true,
  position = 'fixed bottom-8 left-8',
  textSpeed = 50,
  pauseDuration = 2000
}) => {
  const [stage, setStage] = useState('entering'); // entering, speaking, exiting, card
  const [message, setMessage] = useState('');
  const [displayedText, setDisplayedText] = useState('');
  const [speechBubbleVisible, setSpeechBubbleVisible] = useState(false);
  const messageIndexRef = useRef(0);
  const timeoutRefs = useRef([]);

  // Pick random message on mount
  useEffect(() => {
    // Use context-specific messages if provided, otherwise use defaults
    const messagePool = messages && Array.isArray(messages) && messages.length >= 3
      ? messages
      : DEFAULT_DONATION_MESSAGES;

    const randomMessage = messagePool[Math.floor(Math.random() * messagePool.length)];
    setMessage(randomMessage);

    // Reset text display for new message
    messageIndexRef.current = 0;
    setDisplayedText('');

    // Cleanup timeouts on unmount
    return () => {
      timeoutRefs.current.forEach(clearTimeout);
    };
  }, [messages]);

  // Animation sequence
  useEffect(() => {
    // Stage 1: Mascot enters (elastic bounce)
    const enterTimeout = setTimeout(() => {
      setStage('speaking');
      setSpeechBubbleVisible(true);
    }, 800); // Wait for mascot to fully enter

    timeoutRefs.current.push(enterTimeout);

    return () => clearTimeout(enterTimeout);
  }, []);

  // Typewriter effect for speech bubble
  useEffect(() => {
    if (stage !== 'speaking' || !message) return;

    if (messageIndexRef.current < message.length) {
      const charTimeout = setTimeout(() => {
        const nextChar = message[messageIndexRef.current];
        setDisplayedText(prev => prev + nextChar);
        messageIndexRef.current++;
      }, textSpeed); // Configurable speed per character

      timeoutRefs.current.push(charTimeout);
      return () => clearTimeout(charTimeout);
    } else if (messageIndexRef.current >= message.length) {
      // Message complete, wait then exit
      const exitTimeout = setTimeout(() => {
        setStage('exiting');
        setSpeechBubbleVisible(false);
      }, pauseDuration); // Configurable pause duration

      timeoutRefs.current.push(exitTimeout);
      return () => clearTimeout(exitTimeout);
    }
  }, [stage, displayedText, message, textSpeed, pauseDuration]);

  // Handle mascot exit and card entrance (or close if showCard is false)
  useEffect(() => {
    if (stage === 'exiting') {
      const cardTimeout = setTimeout(() => {
        if (showCard) {
          setStage('card');
        } else {
          // Just close the prompt without showing card
          onClose();
        }
      }, 600); // Wait for mascot to exit

      timeoutRefs.current.push(cardTimeout);
      return () => clearTimeout(cardTimeout);
    }
  }, [stage, showCard, onClose]);

  return (
    <div className={`${position} z-50 pointer-events-none`}>
      {/* Mascot and Speech Bubble */}
      {stage !== 'card' && (
        <div className="relative pointer-events-auto flex items-end gap-2 sm:gap-3 md:gap-4">
          {/* Mascot (Custom or Default Heart) */}
          <div
            className={`transition-all duration-700 ${
              stage === 'entering'
                ? 'translate-y-full opacity-0'
                : stage === 'exiting'
                ? 'translate-y-full opacity-0'
                : 'translate-y-0 opacity-100'
            }`}
            style={{
              animation: stage === 'entering' ? 'elasticBounceUp 0.8s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards' : 'none',
            }}
          >
            {MascotComponent ? (
              // Custom mascot from parent project
              <div className="scale-75 sm:scale-100 origin-bottom">
                <MascotComponent />
              </div>
            ) : (
              // Default heart mascot
              <div className="relative w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 flex items-center justify-center">
                <Heart
                  className="w-14 h-14 sm:w-16 sm:h-16 md:w-20 md:h-20 text-red-500 fill-red-500 animate-pulse"
                  style={{
                    filter: 'drop-shadow(0 4px 6px rgba(0, 0, 0, 0.1))',
                    animation: stage === 'speaking' ? 'heartbeat 1s ease-in-out infinite' : 'none',
                  }}
                />
              </div>
            )}
          </div>

          {/* Speech Bubble */}
          {speechBubbleVisible && (
            <div
              className={`relative transition-all duration-500 ${
                stage === 'speaking' ? 'opacity-100 translate-x-0' : 'opacity-0 translate-x-10'
              }`}
              style={{
                animation: stage === 'speaking' ? 'bobSpeak 0.5s ease-in-out infinite alternate' : 'none',
                marginBottom: '40px', // Position up to align with heart
              }}
            >
              <div className="relative bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl p-3 sm:p-4 shadow-xl border-2 border-red-500 dark:border-red-400 max-w-[250px] sm:max-w-xs">
                <div className="text-xs sm:text-sm text-gray-800 dark:text-gray-200 font-medium break-words">
                  {displayedText}
                  {messageIndexRef.current < message.length && (
                    <span className="inline-block w-1 h-3 sm:h-4 ml-1 bg-red-500 animate-pulse" />
                  )}
                </div>

                {/* Speech bubble tail pointing left to mascot */}
                <div className="absolute -left-2 bottom-4 sm:bottom-6 w-3 h-3 sm:w-4 sm:h-4 bg-white dark:bg-gray-800 border-l-2 border-b-2 border-red-500 dark:border-red-400 transform rotate-45" />
              </div>
            </div>
          )}

          {/* Close button */}
          <button
            onClick={onClose}
            className="absolute -top-1.5 -right-1.5 sm:-top-2 sm:-right-2 bg-gray-800 dark:bg-gray-700 text-white rounded-full p-1 sm:p-1.5 hover:bg-gray-700 dark:hover:bg-gray-600 transition-colors shadow-lg"
            aria-label="Close donation prompt"
          >
            <X className="w-3 h-3 sm:w-4 sm:h-4" />
          </button>
        </div>
      )}

      {/* Donation Card */}
      {stage === 'card' && (
        <div
          className="pointer-events-auto transition-all duration-500 transform"
          style={{
            animation: 'slideInFromBottom 0.6s cubic-bezier(0.68, -0.55, 0.265, 1.55) forwards',
          }}
        >
          <div className="bg-gradient-to-br from-red-50 to-pink-50 dark:from-gray-800 dark:to-gray-900 rounded-xl p-4 shadow-2xl border-2 border-red-500 dark:border-red-400 max-w-xs">
            <div className="text-center mb-3">
              <div className="text-3xl mb-1.5">☕</div>
              <h3 className="text-lg font-bold text-gray-900 dark:text-white mb-1.5">
                Support Our Wiki
              </h3>
              <p className="text-xs text-gray-600 dark:text-gray-300">
                Help keep this community project running!
              </p>
            </div>

            <div className="space-y-2">
              <button
                onClick={onDonate}
                className="w-full bg-gradient-to-r from-red-500 to-pink-500 hover:from-red-600 hover:to-pink-600 text-white font-semibold py-2 px-4 rounded-lg shadow-lg transition-all transform hover:scale-105 text-sm"
              >
                ❤️ Donate Now
              </button>

              <button
                onClick={onClose}
                className="w-full bg-gray-200 dark:bg-gray-700 hover:bg-gray-300 dark:hover:bg-gray-600 text-gray-700 dark:text-gray-200 font-medium py-1.5 px-4 rounded-lg transition-colors text-sm"
              >
                Maybe Later
              </button>
            </div>
          </div>
        </div>
      )}

      <style jsx>{`
        @keyframes elasticBounceUp {
          0% {
            transform: translateY(120%);
            opacity: 0;
          }
          50% {
            transform: translateY(-10%);
            opacity: 1;
          }
          70% {
            transform: translateY(5%);
          }
          85% {
            transform: translateY(-2%);
          }
          100% {
            transform: translateY(0%);
            opacity: 1;
          }
        }

        @keyframes bobSpeak {
          0% {
            transform: translateY(0px);
          }
          100% {
            transform: translateY(-3px);
          }
        }

        @keyframes slideInFromBottom {
          0% {
            transform: translateY(120%);
            opacity: 0;
          }
          50% {
            transform: translateY(-5%);
          }
          100% {
            transform: translateY(0%);
            opacity: 1;
          }
        }

        @keyframes heartbeat {
          0%, 100% {
            transform: scale(1);
          }
          50% {
            transform: scale(1.1);
          }
        }
      `}</style>
    </div>
  );
};

export default DonationPrompt;
