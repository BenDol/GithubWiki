import React, { useEffect, useState, useMemo } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, CheckCircle, Star, Users, Home, User } from 'lucide-react';
import { useWikiConfig } from '../hooks/useWikiConfig';
import { useAuthStore } from '../store/authStore';
import { Helmet } from 'react-helmet-async';
import DonationPrompt from '../components/donation/DonationPrompt';

// Configuration for animation speed
const PROMPT_TEXT_SPEED = 15; // ms per character (faster than default 50)
const PROMPT_PAUSE_DURATION = 800; // ms to show complete message (shorter than default 2000)

const DonationSuccessPage = () => {
  const { config } = useWikiConfig();
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const [currentPromptIndex, setCurrentPromptIndex] = useState(0);
  const [showPrompt, setShowPrompt] = useState(false);
  const [promptPosition, setPromptPosition] = useState(20);
  const [MascotComponents, setMascotComponents] = useState(null);
  const totalPrompts = 5; // Show 5 sequential prompts

  // Load SpiritSprite to create specific mascots for each spirit
  useEffect(() => {
    const loadSpirit = async () => {
      try {
        const SpiritSpriteModule = await import('../../../src/components/SpiritSprite');
        const SpiritSprite = SpiritSpriteModule.default;

        // Create 5 specific spirit mascots (one for each of the 12 spirits, using first 5)
        const spiritMascots = [1, 2, 3, 4, 5].map(spiritId => {
          // Create a component that renders a specific spirit
          return function SpecificSpiritMascot() {
            return (
              <SpiritSprite
                spiritId={spiritId}
                level={5} // Evolution level 5
                animationType="idle"
                animated={true}
                size="large"
                showInfo={false}
                bare={true}
              />
            );
          };
        });

        setMascotComponents(spiritMascots);
      } catch (e) {
        // Parent project doesn't have sprites, will use default heart
        setMascotComponents(null);
      }
    };
    loadSpirit();
  }, []);

  // Scroll to top on mount
  useEffect(() => {
    window.scrollTo(0, 0);
  }, []);

  // Invalidate donator status cache when user lands on success page
  // This ensures the badge will appear as soon as the webhook processes
  useEffect(() => {
    if (isAuthenticated && user && config?.wiki?.repository) {
      const invalidateCache = async () => {
        const githubDataStoreModule = await import('../store/githubDataStore');
        const store = githubDataStoreModule.useGitHubDataStore.getState();
        const { owner, repo } = config.wiki.repository;
        const cacheKey = `${owner}/${repo}/${user.id}`;

        // Invalidate cache and disable caching for 5 minutes
        // This allows the badge state to update after the PayPal webhook processes
        store.invalidateDonatorStatusAndDisable(cacheKey);

        console.log('[DonationSuccess] Invalidated donator status cache for user', {
          username: user.login,
          userId: user.id,
        });
      };
      invalidateCache();
    }
  }, [isAuthenticated, user, config]);

  // Show sequential thank you prompts - one after another
  useEffect(() => {
    // Start showing prompts after a brief delay
    const initialDelay = setTimeout(() => {
      // Pick random position for first prompt (10% to 50% from left)
      // Limited to 50% to ensure speech bubble has space on the right side
      const randomPosition = 10 + Math.random() * 40;
      setPromptPosition(randomPosition);
      setShowPrompt(true);
    }, 500);

    return () => clearTimeout(initialDelay);
  }, []);

  // Handle prompt close - move to next prompt or finish
  const handlePromptClose = () => {
    setShowPrompt(false);

    // Check if we should show another prompt
    if (currentPromptIndex < totalPrompts - 1) {
      // Wait a bit before showing next prompt, and pick new random position
      setTimeout(() => {
        // Pick random position (10% to 50% from left) to ensure speech bubble has space
        const randomPosition = 10 + Math.random() * 40;
        setPromptPosition(randomPosition);
        setCurrentPromptIndex(prev => prev + 1);
        setShowPrompt(true);
      }, 300); // Brief delay between prompts
    }
  };

  if (!config) return null;

  const donationConfig = config.features?.donation || {};
  const badgeConfig = donationConfig.badge || {};

  // Thank you messages for the donation prompt (Slayer Legend themed!)
  // Each of the 5 spirits will show one of these messages
  const thankYouMessages = [
    "🔥 LEGENDARY DONATION! You've unlocked TRUE SLAYER status! ⚔️",
    "✨ Your spirits are cheering! Thank you, mighty Slayer! 👻✨",
    "💎 EPIC DROP! Your generosity rivals an M1 pull! 🏅",
    "⚡ CRITICAL HIT of kindness! The wiki gains 100B ATK! 💪",
    "🌟 You're now a LEGEND among Slayers! Thank you so much! 🏆",
  ];

  // What the donation helps with
  const impactItems = [
    {
      icon: 'Server',
      title: 'Server Hosting',
      description: 'Keeping the wiki online 24/7',
      color: 'text-blue-500'
    },
    {
      icon: 'Users',
      title: 'Community Tools',
      description: 'Builders, calculators, and features',
      color: 'text-purple-500'
    },
    {
      icon: 'Star',
      title: 'Content Updates',
      description: 'Fresh guides and information',
      color: 'text-yellow-500'
    },
  ];

  return (
    <>
      <Helmet>
        <title>Thank You! - {config.wiki.title}</title>
        <meta name="description" content="Thank you for supporting our community wiki!" />
      </Helmet>

      <div className="min-h-screen bg-gradient-to-br from-green-50 via-blue-50 to-purple-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="max-w-3xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
          {/* Success Header */}
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-block mb-4 sm:mb-6 animate-bounce">
              <CheckCircle className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 text-green-500 drop-shadow-lg" />
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4 px-2">
              Thank You! 🎉
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto leading-relaxed px-2">
              Your generous donation has been received! You're helping keep this community resource
              alive and thriving for everyone.
            </p>
          </div>

          {/* Donator Badge Info */}
          {badgeConfig.enabled && (
            <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 md:p-8 mb-6 sm:mb-8">
              <div className="flex items-start space-x-3 sm:space-x-4">
                <div className="text-3xl sm:text-4xl animate-glow-pulse flex-shrink-0">
                  {badgeConfig.badge || '💎'}
                </div>
                <div className="flex-1 min-w-0">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-3">
                    Your Donator Badge
                  </h2>
                  <div className="space-y-2 sm:space-y-3 text-sm sm:text-base text-gray-600 dark:text-gray-300">
                    <p className="flex items-start space-x-2">
                      <span className="text-green-500 mt-0.5 sm:mt-1 flex-shrink-0">✓</span>
                      <span>
                        Your <strong className="text-cyan-600 dark:text-cyan-400">donator badge</strong> will
                        appear on your profile shortly (usually within a few minutes)
                      </span>
                    </p>
                    <p className="flex items-start space-x-2">
                      <span className="text-green-500 mt-0.5 sm:mt-1 flex-shrink-0">✓</span>
                      <span>
                        The badge will be displayed alongside your contributions on all wiki pages
                      </span>
                    </p>
                    <p className="flex items-start space-x-2">
                      <span className="text-green-500 mt-0.5 sm:mt-1 flex-shrink-0">✓</span>
                      <span>
                        This badge is <strong>permanent</strong> - a lasting thank you for your support!
                      </span>
                    </p>
                  </div>

                  {isAuthenticated && user && (
                    <div className="mt-4 sm:mt-6">
                      <Link
                        to={`/profile/${user.login}`}
                        className="inline-flex items-center space-x-2 px-4 sm:px-6 py-2 sm:py-3 text-sm sm:text-base bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-lg sm:rounded-xl transition-colors shadow-lg"
                      >
                        <User className="w-4 h-4 sm:w-5 sm:h-5" />
                        <span>View My Profile</span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Impact Section */}
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 md:p-8 mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 text-center">
              💖 What Your Support Helps With
            </h2>

            <div className="space-y-3 sm:space-y-4">
              {impactItems.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start space-x-3 sm:space-x-4 p-3 sm:p-4 rounded-lg sm:rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className={`${item.color} mt-0.5 sm:mt-1 flex-shrink-0`}>
                    {item.icon === 'Server' && <Home className="w-5 h-5 sm:w-6 sm:h-6" />}
                    {item.icon === 'Users' && <Users className="w-5 h-5 sm:w-6 sm:h-6" />}
                    {item.icon === 'Star' && <Star className="w-5 h-5 sm:w-6 sm:h-6" />}
                  </div>
                  <div>
                    <h3 className="text-sm sm:text-base font-semibold text-gray-900 dark:text-white mb-0.5 sm:mb-1">
                      {item.title}
                    </h3>
                    <p className="text-xs sm:text-sm text-gray-600 dark:text-gray-300">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Community Message */}
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl sm:rounded-2xl shadow-xl p-6 sm:p-8 text-white text-center mb-6 sm:mb-8">
            <Heart className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4" />
            <h3 className="text-xl sm:text-2xl font-bold mb-2 sm:mb-3">
              You're Making a Difference
            </h3>
            <p className="text-sm sm:text-base md:text-lg opacity-90 leading-relaxed">
              Thanks to supporters like you, we can continue providing free, high-quality resources
              to the entire community. Your contribution keeps this passion project alive!
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-3 sm:gap-4 justify-center px-2">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center justify-center space-x-2 px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-lg sm:rounded-xl transition-colors shadow-lg"
            >
              <Home className="w-4 h-4 sm:w-5 sm:h-5" />
              <span>Back to Home</span>
            </button>

            {!isAuthenticated && (
              <Link
                to="/login"
                className="inline-flex items-center justify-center space-x-2 px-4 sm:px-6 py-2.5 sm:py-3 text-sm sm:text-base bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-lg sm:rounded-xl transition-colors shadow-lg"
              >
                <User className="w-4 h-4 sm:w-5 sm:h-5" />
                <span>Sign In to See Badge</span>
              </Link>
            )}
          </div>

          {/* Footer Note */}
          <div className="mt-8 sm:mt-12 text-center text-xs sm:text-sm text-gray-600 dark:text-gray-400 px-4">
            <p>
              Questions or concerns? Feel free to reach out to the wiki maintainers.
            </p>
            <p className="mt-2">
              This wiki is run entirely by volunteers - thank you for your support! 🙏
            </p>
          </div>
        </div>
      </div>

      {/* Thank You Prompt - One at a time, cycling through 5 messages */}
      {showPrompt && (
        <div
          style={{
            left: `${promptPosition}%`,
          }}
          className="fixed bottom-4 sm:bottom-8 z-50 pointer-events-none max-w-[90vw] sm:max-w-none"
        >
          <DonationPrompt
            key={currentPromptIndex} // Force remount for each new prompt
            onClose={handlePromptClose}
            onDonate={() => {}}
            messages={[thankYouMessages[currentPromptIndex]]}
            MascotComponent={MascotComponents ? MascotComponents[currentPromptIndex] : null}
            showCard={false}
            position="relative"
            textSpeed={PROMPT_TEXT_SPEED}
            pauseDuration={PROMPT_PAUSE_DURATION}
          />
        </div>
      )}
    </>
  );
};

export default DonationSuccessPage;
