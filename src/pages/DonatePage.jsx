import React, { useState, useEffect, useRef } from 'react';
import { useNavigate } from 'react-router-dom';
import { Heart, Coffee, Server, Zap, Users, ChevronRight } from 'lucide-react';
import { useWikiConfig } from '../hooks/useWikiConfig';
import { useAuthStore } from '../store/authStore';
import { useCustomAvatar } from '../hooks/useCustomAvatar';
import { Helmet } from 'react-helmet-async';

const DonatePage = () => {
  const { config } = useWikiConfig();
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();
  const [selectedAmount, setSelectedAmount] = useState(null);
  const [customAmount, setCustomAmount] = useState('');
  const [githubUsername, setGithubUsername] = useState('');
  const [paypalLoaded, setPaypalLoaded] = useState(false);
  const [paypalError, setPaypalError] = useState(null);
  const paypalButtonRef = useRef(null);
  const customAmountRef = useRef(null);

  // Use custom avatar hook (same pattern as profile pictures)
  const { avatarUrl } = useCustomAvatar(user?.id, user?.avatar_url);

  // Pre-fill GitHub username if authenticated
  useEffect(() => {
    if (isAuthenticated && user?.login) {
      setGithubUsername(user.login);
    }
  }, [isAuthenticated, user]);

  if (!config) return null;

  const donationConfig = config.features?.donation || {};
  const donationMethods = donationConfig.methods || {};
  const badgeConfig = donationConfig.badge || {};
  const badgeEnabled = badgeConfig.enabled;
  const paypalConfig = donationMethods.paypal || {};

  // Get PayPal Client ID from config or environment
  const paypalClientId = paypalConfig.clientId || import.meta.env.VITE_PAYPAL_CLIENT_ID;
  // Get fallback URL (paypal.me for when SDK fails)
  const paypalFallbackUrl = paypalConfig.fallbackUrl || paypalConfig.url;

  // Minimum donation amount (configurable via wiki-config)
  const minAmount = donationConfig.minAmount || 5;

  // Preset donation amounts (configurable via wiki-config)
  const donationAmounts = donationConfig.amounts || [
    { amount: 5, label: '☕ One Coffee', description: 'Buy us a coffee!' },
    { amount: 10, label: '☕☕ Two Coffees', description: 'Keep us caffeinated!' },
    { amount: 25, label: '🍕 Pizza Party', description: 'Fuel a late-night coding session!' },
    { amount: 50, label: '⚡ Power Boost', description: 'Help cover server costs!' },
  ];

  // What donations help with (configurable via wiki-config)
  const supportItems = donationConfig.supportItems || [
    {
      icon: 'Server',
      title: 'Server Costs',
      description: 'Hosting, CDN, and database expenses',
      color: 'text-blue-500'
    },
    {
      icon: 'Coffee',
      title: 'Development',
      description: 'Coffee and late-night coding sessions',
      color: 'text-orange-500'
    },
    {
      icon: 'Zap',
      title: 'New Features',
      description: 'Tools, builders, and improvements',
      color: 'text-yellow-500'
    },
    {
      icon: 'Users',
      title: 'Community',
      description: 'Keeping this passion project alive',
      color: 'text-purple-500'
    },
  ];

  // Icon map
  const iconMap = {
    Server,
    Coffee,
    Zap,
    Users,
    Heart
  };

  // Load PayPal SDK
  useEffect(() => {
    if (!paypalConfig.enabled || !paypalClientId) {
      return;
    }

    // Check if PayPal SDK is already loaded
    if (window.paypal) {
      setPaypalLoaded(true);
      return;
    }

    // Build SDK URL with optional funding sources to disable
    let sdkUrl = `https://www.paypal.com/sdk/js?client-id=${paypalClientId}&currency=USD`;

    // Disable Pay Later if configured (default: true)
    const disablePayLater = paypalConfig.disablePayLater ?? true;
    if (disablePayLater) {
      sdkUrl += '&disable-funding=paylater,credit';
    }

    // Load PayPal SDK script
    const script = document.createElement('script');
    script.src = sdkUrl;
    script.async = true;
    script.onload = () => {
      console.log('[Donate] PayPal SDK loaded');
      setPaypalLoaded(true);
    };
    script.onerror = () => {
      console.error('[Donate] Failed to load PayPal SDK');
      setPaypalError('Failed to load PayPal. Please refresh the page.');
    };

    document.body.appendChild(script);

    return () => {
      // Cleanup script on unmount
      if (script.parentNode) {
        script.parentNode.removeChild(script);
      }
    };
  }, [paypalConfig.enabled, paypalClientId, paypalConfig.disablePayLater]);

  // Render PayPal button when SDK is loaded
  useEffect(() => {
    if (!paypalLoaded || !window.paypal || !paypalButtonRef.current) {
      return;
    }

    // Clear existing buttons
    paypalButtonRef.current.innerHTML = '';

    const amount = selectedAmount || parseFloat(customAmount) || minAmount;

    // Validate minimum amount
    if (amount < minAmount) {
      console.warn('[Donate] Amount below minimum', { amount, minAmount });
      return;
    }

    console.log('[Donate] Rendering PayPal button', { amount, username: githubUsername || 'anonymous' });

    try {
      window.paypal.Buttons({
        style: {
          layout: 'vertical',
          color: 'gold',
          shape: 'rect',
          label: 'donate'
        },

        createOrder: async (data, actions) => {
          console.log('[Donate] Creating PayPal order', { amount, username: githubUsername });

          return actions.order.create({
            purchase_units: [{
              amount: {
                value: amount.toFixed(2),
                currency_code: 'USD'
              },
              description: `Donation to ${config.wiki.title}`,
              custom_id: githubUsername.trim() || 'anonymous', // THIS is how we pass the username!
            }],
            application_context: {
              brand_name: config.wiki.title || 'Wiki',
              shipping_preference: 'NO_SHIPPING'
            }
          });
        },

        onApprove: async (data, actions) => {
          console.log('[Donate] Payment approved', data);

          // Capture the payment
          const order = await actions.order.capture();
          console.log('[Donate] Payment captured', order);

          // Redirect to success page
          navigate('/donation-success');
        },

        onError: (err) => {
          console.error('[Donate] PayPal error', err);
          alert('Payment failed. Please try again or contact support.');
        },

        onCancel: (data) => {
          console.log('[Donate] Payment cancelled', data);
          // User cancelled, do nothing
        }
      }).render(paypalButtonRef.current);

      console.log('[Donate] PayPal button rendered successfully');
    } catch (error) {
      console.error('[Donate] Failed to render PayPal button', error);
      setPaypalError('Failed to initialize PayPal button. Please refresh the page.');
    }
  }, [paypalLoaded, selectedAmount, customAmount, githubUsername, badgeEnabled, config, navigate]);

  // Handle other payment methods (Stripe, Ko-fi)
  const handleDonate = (method) => {
    const methodConfig = donationMethods[method];
    if (!methodConfig || !methodConfig.enabled) {
      alert(`${method} is not configured yet`);
      return;
    }

    const amount = selectedAmount || parseFloat(customAmount) || minAmount;

    // Validate minimum amount
    if (amount < minAmount) {
      alert(`Minimum donation amount is $${minAmount.toFixed(2)} USD`);
      return;
    }

    let url = methodConfig.url;

    // Handle different URL formats for amount pre-filling
    if (url.includes('{amount}')) {
      url = url.replace('{amount}', amount.toFixed(2));
    } else if (method === 'stripe') {
      if (url.includes('donate.stripe.com/')) {
        console.log('[Donate] Stripe Payment Links do not support pre-filled amounts');
      }
    } else if (method === 'kofi') {
      if (url.includes('buymeacoffee.com/')) {
        const separator = url.includes('?') ? '&' : '?';
        const coffeeCount = Math.max(1, Math.round(amount / 5));
        url = `${url}${separator}amount=${coffeeCount}`;
      }
    }

    window.open(url, '_blank');
  };

  return (
    <>
      <Helmet>
        <title>Support Us - {config.wiki.title}</title>
        <meta name="description" content={`Help keep ${config.wiki.title} online! This is a community-funded project.`} />
      </Helmet>

      <style>{`
        /* Override PayPal SDK's fixed height on mobile to prevent button cutoff */
        @media (max-width: 640px) {
          [id^="zoid-paypal-buttons-"] {
            height: auto !important;
            min-height: 130px !important;
          }
        }
      `}</style>

      <div className="min-h-screen bg-gradient-to-br from-blue-50 via-purple-50 to-pink-50 dark:from-gray-900 dark:via-gray-800 dark:to-gray-900">
        <div className="max-w-4xl mx-auto px-4 sm:px-6 py-6 sm:py-12">
          {/* Header with coffee cup */}
          <div className="text-center mb-8 sm:mb-12">
            <div className="inline-block mb-4 sm:mb-6 animate-bounce">
              <div className="text-5xl sm:text-6xl md:text-8xl filter drop-shadow-lg">☕</div>
            </div>

            <h1 className="text-3xl sm:text-4xl md:text-5xl font-bold text-gray-900 dark:text-white mb-3 sm:mb-4 px-2">
              Support Our Wiki
            </h1>

            <p className="text-base sm:text-lg md:text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto leading-relaxed px-2">
              This wiki is a <span className="font-semibold text-blue-600 dark:text-blue-400">community-funded project</span> created
              and maintained by volunteers. Every contribution helps keep the servers running and
              allows us to continue improving the wiki for everyone!
            </p>
          </div>

          {/* Donator Badge Preview */}
          {badgeEnabled && (
            <div className="bg-gradient-to-r from-yellow-50 to-amber-50 dark:from-yellow-900/20 dark:to-amber-900/20 border-2 border-yellow-300 dark:border-yellow-700 rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 md:p-8 mb-6 sm:mb-8 md:mb-12">
              <div className="flex flex-col md:flex-row items-center gap-4 sm:gap-6">
                <div className="flex-shrink-0">
                  <div className="relative inline-block">
                    <img
                      src={avatarUrl || 'https://github.com/github.png'}
                      alt="Avatar"
                      className="w-16 h-16 sm:w-20 sm:h-20 md:w-24 md:h-24 rounded-full object-cover ring-4 ring-white dark:ring-gray-800"
                    />
                    {/* Sample donator badge */}
                    <div
                      className="absolute left-1/2 flex items-center justify-center z-10"
                      style={{
                        bottom: '-5px',
                        transform: 'translateX(-50%)',
                      }}
                      title={`${badgeConfig.badge} ${badgeConfig.title}`}
                    >
                      <span
                        className="leading-none select-none animate-glow-pulse text-lg sm:text-xl md:text-2xl"
                      >
                        {badgeConfig.badge}
                      </span>
                    </div>
                  </div>
                </div>

                <div className="flex-1 text-center md:text-left">
                  <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-2 sm:mb-3">
                    Get Your Exclusive Donator Badge
                  </h2>
                  <p className="text-sm sm:text-base text-gray-700 dark:text-gray-300 leading-relaxed">
                    As a thank you for your support, you'll receive a <span className="font-semibold text-yellow-700 dark:text-yellow-400">permanent {badgeConfig.title} badge</span> that appears on your profile throughout the wiki!
                    {user ? ' Your badge will be automatically added after your donation.' : ' Sign in with GitHub to receive your badge.'}
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Stats/Impact Section */}
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 md:p-8 mb-6 sm:mb-8 md:mb-12">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6 text-center">
              💖 Your Support Helps With
            </h2>

            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 md:gap-6">
              {supportItems.map((item, index) => {
                const IconComponent = iconMap[item.icon] || Heart;
                return (
                  <div
                    key={index}
                    className="flex items-start space-x-3 sm:space-x-4 p-3 sm:p-4 rounded-lg sm:rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                  >
                    <div className={`${item.color} mt-0.5 sm:mt-1 flex-shrink-0`}>
                      <IconComponent className="w-5 h-5 sm:w-6 sm:h-6" />
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
                );
              })}
            </div>
          </div>

          {/* Donation Amount Selection */}
          <div className="bg-white dark:bg-gray-800 rounded-xl sm:rounded-2xl shadow-xl p-4 sm:p-6 md:p-8 mb-6 sm:mb-8">
            <h2 className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-4 sm:mb-6">
              Choose Your Contribution
            </h2>

            {/* Preset Amounts */}
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 sm:gap-4 mb-4 sm:mb-6">
              {donationAmounts.map((option) => (
                <button
                  key={option.amount}
                  onClick={() => {
                    setSelectedAmount(option.amount);
                    setCustomAmount('');
                    // Scroll to custom amount field after brief delay
                    setTimeout(() => {
                      customAmountRef.current?.scrollIntoView({
                        behavior: 'smooth',
                        block: 'center'
                      });
                    }, 100);
                  }}
                  className={`p-3 sm:p-4 rounded-lg sm:rounded-xl border-2 transition-all transform active:scale-95 sm:hover:scale-105 ${
                    selectedAmount === option.amount
                      ? 'border-blue-500 bg-blue-50 dark:bg-blue-900/20 shadow-lg'
                      : 'border-gray-200 dark:border-gray-700 hover:border-blue-300 dark:hover:border-blue-700'
                  }`}
                >
                  <div className="text-left">
                    <div className="text-xl sm:text-2xl font-bold text-gray-900 dark:text-white mb-0.5 sm:mb-1">
                      ${option.amount}
                    </div>
                    <div className="text-xs sm:text-sm font-semibold text-blue-600 dark:text-blue-400 mb-0.5 sm:mb-1">
                      {option.label}
                    </div>
                    <div className="text-[10px] sm:text-xs text-gray-600 dark:text-gray-400">
                      {option.description}
                    </div>
                  </div>
                </button>
              ))}
            </div>

            {/* Custom Amount */}
            <div ref={customAmountRef} className="mb-6">
              <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                Or enter a custom amount:
              </label>
              <div className="relative">
                <span className="absolute left-4 top-1/2 transform -translate-y-1/2 text-gray-500 dark:text-gray-400 text-lg font-semibold">
                  $
                </span>
                <input
                  type="number"
                  min={minAmount}
                  step="0.01"
                  placeholder={selectedAmount ? selectedAmount.toFixed(2) : "25.00"}
                  value={customAmount}
                  onChange={(e) => {
                    setCustomAmount(e.target.value);
                    setSelectedAmount(null);
                  }}
                  className="w-full pl-10 pr-4 py-3 border-2 border-gray-300 dark:border-gray-600 rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:bg-gray-700 dark:text-white text-lg"
                />
              </div>
              {customAmount && parseFloat(customAmount) < minAmount && (
                <p className="mt-2 text-sm text-red-600 dark:text-red-400">
                  Minimum donation amount is ${minAmount.toFixed(2)} USD
                </p>
              )}
            </div>

            {/* GitHub Username (for automatic badge assignment) */}
            {badgeEnabled && (
              <div className="mb-6 sm:mb-8">
                <label className="block text-xs sm:text-sm font-medium text-gray-700 dark:text-gray-300 mb-2">
                  GitHub Username <span className="text-gray-400 dark:text-gray-500 font-normal">(optional)</span>
                </label>
                <input
                  type="text"
                  placeholder="YourGitHubUsername"
                  value={githubUsername}
                  onChange={(e) => setGithubUsername(e.target.value)}
                  disabled={isAuthenticated}
                  className="w-full px-3 sm:px-4 py-2 sm:py-3 text-sm sm:text-base border-2 border-gray-300 dark:border-gray-600 rounded-lg sm:rounded-xl focus:border-blue-500 focus:ring-2 focus:ring-blue-200 dark:bg-gray-700 dark:text-white disabled:opacity-60 disabled:cursor-not-allowed"
                />
                <p className="mt-2 text-[10px] sm:text-xs text-gray-500 dark:text-gray-400">
                  {isAuthenticated ? (
                    <>💎 Signed in as {githubUsername} - Your donator badge will be assigned automatically!</>
                  ) : (
                    <>💎 Enter your GitHub username to receive an automatic donator badge. You can donate anonymously by leaving this blank!</>
                  )}
                </p>
              </div>
            )}

            {/* Payment Methods */}
            <div className="space-y-3 sm:space-y-4">
              <h3 className="text-base sm:text-lg font-semibold text-gray-900 dark:text-white mb-3 sm:mb-4">
                Choose Payment Method:
              </h3>

              {/* PayPal Smart Button (with fallback) */}
              {paypalConfig.enabled && (
                <div>
                  {/* Show fallback button if SDK failed OR no clientId configured */}
                  {(paypalError || !paypalClientId) && paypalFallbackUrl ? (
                    <div>
                      {paypalError && (
                        <div className="mb-4 p-3 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-yellow-800 dark:text-yellow-200 text-sm">
                          <strong>Note:</strong> PayPal Smart Buttons unavailable. Using fallback donation link.
                          {badgeEnabled && <span className="block mt-1">💎 Donator badges will be assigned manually by admins.</span>}
                        </div>
                      )}

                      <button
                        onClick={() => {
                          const amount = selectedAmount || parseFloat(customAmount) || minAmount;

                          // Validate minimum amount
                          if (amount < minAmount) {
                            alert(`Minimum donation amount is $${minAmount.toFixed(2)} USD`);
                            return;
                          }

                          let url = paypalFallbackUrl;

                          // Add amount to paypal.me URL
                          if (url.includes('paypal.me/')) {
                            url = url.replace(/\/$/, '');
                            url = `${url}/${amount.toFixed(2)}`;
                          }

                          window.open(url, '_blank');
                        }}
                        disabled={!selectedAmount && !customAmount}
                        className="w-full bg-gradient-to-r from-yellow-500 to-yellow-600 hover:from-yellow-600 hover:to-yellow-700 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-4 px-6 rounded-xl shadow-lg transition-all transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-between group"
                      >
                        <span className="flex items-center space-x-3">
                          <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                            <path d="M7.076 21.337H2.47a.641.641 0 0 1-.633-.74L4.944.901C5.026.382 5.474 0 5.998 0h7.46c2.57 0 4.578.543 5.69 1.81 1.01 1.15 1.304 2.42 1.012 4.287-.023.143-.047.288-.077.437-.983 5.05-4.349 6.797-8.647 6.797h-2.19c-.524 0-.968.382-1.05.9l-1.12 7.106zm14.146-14.42a3.35 3.35 0 0 0-.607-.541c-.013.076-.026.175-.041.254-.93 4.778-4.005 7.201-9.138 7.201h-2.19a.563.563 0 0 0-.556.479l-1.187 7.527h-.506l-.24 1.516a.56.56 0 0 0 .554.647h3.882c.46 0 .85-.334.922-.788.06-.26.76-4.852.816-5.09a.932.932 0 0 1 .923-.788h.58c3.76 0 6.705-1.528 7.565-5.946.36-1.847.174-3.388-.777-4.471z"/>
                          </svg>
                          <span>Donate with PayPal</span>
                        </span>
                        <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                      </button>
                    </div>
                  ) : paypalClientId && !paypalError ? (
                    /* Smart Buttons (when SDK loaded successfully) */
                    <div>

                      {!paypalLoaded && (
                        <div className="flex items-center justify-center py-8">
                          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-yellow-500"></div>
                          <span className="ml-3 text-gray-600 dark:text-gray-400">Loading PayPal...</span>
                        </div>
                      )}

                      {paypalLoaded && (!selectedAmount && !customAmount) && (
                        <div className="p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-xl text-blue-800 dark:text-blue-200 text-sm text-center">
                          👆 Please select or enter a donation amount above to continue
                        </div>
                      )}

                      {paypalLoaded && (selectedAmount || customAmount) && (
                        <div className="flex justify-center">
                          <div ref={paypalButtonRef} className="w-full max-w-[750px]"></div>
                        </div>
                      )}
                    </div>
                  ) : (
                    /* No PayPal configured at all */
                    <div className="p-4 bg-gray-50 dark:bg-gray-800 border border-gray-200 dark:border-gray-700 rounded-xl text-gray-600 dark:text-gray-400 text-sm text-center">
                      PayPal donations are not configured. Please contact the wiki admin.
                    </div>
                  )}
                </div>
              )}

              {/* Stripe */}
              {donationMethods.stripe?.enabled && (
                <button
                  onClick={() => handleDonate('stripe')}
                  disabled={!selectedAmount && !customAmount}
                  className="w-full bg-gradient-to-r from-blue-600 to-blue-700 hover:from-blue-700 hover:to-blue-800 disabled:from-gray-400 disabled:to-gray-500 text-white font-semibold py-4 px-6 rounded-xl shadow-lg transition-all transform hover:scale-[1.02] disabled:cursor-not-allowed disabled:hover:scale-100 flex items-center justify-between group"
                >
                  <span className="flex items-center space-x-3">
                    <svg className="w-8 h-8" viewBox="0 0 24 24" fill="currentColor">
                      <path d="M13.976 9.15c-2.172-.806-3.356-1.426-3.356-2.409 0-.831.683-1.305 1.901-1.305 2.227 0 4.515.858 6.09 1.631l.89-5.494C18.252.975 15.697 0 12.165 0 9.667 0 7.589.654 6.104 1.872 4.56 3.147 3.757 4.992 3.757 7.218c0 4.039 2.467 5.76 6.476 7.219 2.585.92 3.445 1.574 3.445 2.583 0 .98-.84 1.545-2.354 1.545-1.875 0-4.965-.921-6.99-2.109l-.9 5.555C5.175 22.99 8.385 24 11.714 24c2.641 0 4.843-.624 6.328-1.813 1.664-1.305 2.525-3.236 2.525-5.732 0-4.128-2.524-5.851-6.591-7.305z"/>
                    </svg>
                    <span>Pay with Stripe</span>
                  </span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              )}

              {/* Ko-fi */}
              {donationMethods.kofi?.enabled && (
                <button
                  onClick={() => handleDonate('kofi')}
                  className="w-full bg-gradient-to-r from-red-500 to-red-600 hover:from-red-600 hover:to-red-700 text-white font-semibold py-4 px-6 rounded-xl shadow-lg transition-all transform hover:scale-[1.02] flex items-center justify-between group"
                >
                  <span className="flex items-center space-x-3">
                    <Coffee className="w-6 h-6" />
                    <span>Support on Ko-fi</span>
                  </span>
                  <ChevronRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
                </button>
              )}
            </div>
          </div>

          {/* Thank You Message */}
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-xl sm:rounded-2xl shadow-xl p-6 sm:p-8 text-white text-center">
            <Heart className="w-10 h-10 sm:w-12 sm:h-12 mx-auto mb-3 sm:mb-4" />
            <h3 className="text-xl sm:text-2xl font-bold mb-2">
              Thank You for Your Support!
            </h3>
            <p className="text-sm sm:text-base md:text-lg opacity-90">
              Every contribution, big or small, helps keep this community resource alive and thriving.
              You're awesome! 🎉
            </p>
          </div>

          {/* Footer Info */}
          <div className="mt-6 sm:mt-8 text-center text-xs sm:text-sm text-gray-600 dark:text-gray-400 px-4">
            <p>
              All donations go directly towards server costs and development.
              This wiki is run by volunteers.
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default DonatePage;
