import React from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Heart, CheckCircle, Star, Users, Home, User } from 'lucide-react';
import { useWikiConfig } from '../hooks/useWikiConfig';
import { useAuthStore } from '../store/authStore';
import { Helmet } from 'react-helmet-async';

const DonationSuccessPage = () => {
  const { config } = useWikiConfig();
  const { isAuthenticated, user } = useAuthStore();
  const navigate = useNavigate();

  if (!config) return null;

  const donationConfig = config.features?.donation || {};
  const badgeConfig = donationConfig.badge || {};

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
        <div className="max-w-3xl mx-auto px-4 py-12">
          {/* Success Header */}
          <div className="text-center mb-12">
            <div className="inline-block mb-6 animate-bounce">
              <CheckCircle className="w-24 h-24 text-green-500 drop-shadow-lg" />
            </div>

            <h1 className="text-5xl font-bold text-gray-900 dark:text-white mb-4">
              Thank You! 🎉
            </h1>

            <p className="text-xl text-gray-600 dark:text-gray-300 max-w-2xl mx-auto leading-relaxed">
              Your generous donation has been received! You're helping keep this community resource
              alive and thriving for everyone.
            </p>
          </div>

          {/* Donator Badge Info */}
          {badgeConfig.enabled && (
            <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
              <div className="flex items-start space-x-4">
                <div className="text-4xl animate-glow-pulse">
                  {badgeConfig.badge || '💎'}
                </div>
                <div className="flex-1">
                  <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
                    Your Donator Badge
                  </h2>
                  <div className="space-y-3 text-gray-600 dark:text-gray-300">
                    <p className="flex items-start space-x-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>
                        Your <strong className="text-cyan-600 dark:text-cyan-400">donator badge</strong> will
                        appear on your profile shortly (usually within a few minutes)
                      </span>
                    </p>
                    <p className="flex items-start space-x-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>
                        The badge will be displayed alongside your contributions on all wiki pages
                      </span>
                    </p>
                    <p className="flex items-start space-x-2">
                      <span className="text-green-500 mt-1">✓</span>
                      <span>
                        This badge is <strong>permanent</strong> - a lasting thank you for your support!
                      </span>
                    </p>
                  </div>

                  {isAuthenticated && user && (
                    <div className="mt-6">
                      <Link
                        to={`/profile/${user.login}`}
                        className="inline-flex items-center space-x-2 px-6 py-3 bg-cyan-500 hover:bg-cyan-600 text-white font-semibold rounded-xl transition-colors shadow-lg"
                      >
                        <User className="w-5 h-5" />
                        <span>View My Profile</span>
                      </Link>
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* Impact Section */}
          <div className="bg-white dark:bg-gray-800 rounded-2xl shadow-xl p-8 mb-8">
            <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6 text-center">
              💖 What Your Support Helps With
            </h2>

            <div className="space-y-4">
              {impactItems.map((item, index) => (
                <div
                  key={index}
                  className="flex items-start space-x-4 p-4 rounded-xl bg-gray-50 dark:bg-gray-700/50 hover:bg-gray-100 dark:hover:bg-gray-700 transition-colors"
                >
                  <div className={`${item.color} mt-1`}>
                    {item.icon === 'Server' && <Home className="w-6 h-6" />}
                    {item.icon === 'Users' && <Users className="w-6 h-6" />}
                    {item.icon === 'Star' && <Star className="w-6 h-6" />}
                  </div>
                  <div>
                    <h3 className="font-semibold text-gray-900 dark:text-white mb-1">
                      {item.title}
                    </h3>
                    <p className="text-sm text-gray-600 dark:text-gray-300">
                      {item.description}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>

          {/* Community Message */}
          <div className="bg-gradient-to-r from-purple-500 to-pink-500 rounded-2xl shadow-xl p-8 text-white text-center mb-8">
            <Heart className="w-12 h-12 mx-auto mb-4" />
            <h3 className="text-2xl font-bold mb-3">
              You're Making a Difference
            </h3>
            <p className="text-lg opacity-90 leading-relaxed">
              Thanks to supporters like you, we can continue providing free, high-quality resources
              to the entire community. Your contribution keeps this passion project alive!
            </p>
          </div>

          {/* Action Buttons */}
          <div className="flex flex-col sm:flex-row gap-4 justify-center">
            <button
              onClick={() => navigate('/')}
              className="inline-flex items-center justify-center space-x-2 px-6 py-3 bg-blue-500 hover:bg-blue-600 text-white font-semibold rounded-xl transition-colors shadow-lg"
            >
              <Home className="w-5 h-5" />
              <span>Back to Home</span>
            </button>

            {!isAuthenticated && (
              <Link
                to="/login"
                className="inline-flex items-center justify-center space-x-2 px-6 py-3 bg-gray-500 hover:bg-gray-600 text-white font-semibold rounded-xl transition-colors shadow-lg"
              >
                <User className="w-5 h-5" />
                <span>Sign In to See Badge</span>
              </Link>
            )}
          </div>

          {/* Footer Note */}
          <div className="mt-12 text-center text-sm text-gray-600 dark:text-gray-400">
            <p>
              Questions or concerns? Feel free to reach out to the wiki maintainers.
            </p>
            <p className="mt-2">
              This wiki is run entirely by volunteers - thank you for your support! 🙏
            </p>
          </div>
        </div>
      </div>
    </>
  );
};

export default DonationSuccessPage;
