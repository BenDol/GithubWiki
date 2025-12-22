import { Link } from 'react-router-dom';
import { useWikiConfig } from '../../hooks/useWikiConfig';

/**
 * Footer component
 */
const Footer = () => {
  const { config } = useWikiConfig();

  if (!config) return null;

  const currentYear = new Date().getFullYear();

  // Get enabled donation method
  const donationEnabled = config.features?.donation?.enabled;
  const donationMethods = config.features?.donation?.methods || {};
  const enabledDonation = donationEnabled && Object.entries(donationMethods).find(([_, method]) => method.enabled);
  const hasEnabledDonation = donationEnabled && enabledDonation;

  return (
    <footer className="border-t border-gray-200 dark:border-gray-800 bg-gray-50 dark:bg-gray-900">
      <div className="container mx-auto px-2 sm:px-4 py-8">
        <div className="flex flex-col md:flex-row justify-between items-center space-y-4 md:space-y-0">
          {/* Left side - Wiki info */}
          <div className="text-center md:text-left">
            <p className="text-sm text-gray-600 dark:text-gray-400">
              {config.wiki.description}
            </p>
            <p className="text-xs text-gray-500 dark:text-gray-500 mt-1">
              © {currentYear} {config.wiki.title}. All rights reserved.
            </p>
          </div>

          {/* Right side - Links */}
          <div className="flex items-center space-x-6">
            {config.wiki.repository && (
              <a
                href={`https://github.com/${config.wiki.repository.owner}/${config.wiki.repository.repo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white flex items-center space-x-1"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                <span>GitHub</span>
              </a>
            )}

            {/* Donate button */}
            {hasEnabledDonation && (
              <Link
                to="/donate"
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white flex items-center space-x-1"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M12 21.35l-1.45-1.32C5.4 15.36 2 12.28 2 8.5 2 5.42 4.42 3 7.5 3c1.74 0 3.41.81 4.5 2.09C13.09 3.81 14.76 3 16.5 3 19.58 3 22 5.42 22 8.5c0 3.78-3.4 6.86-8.55 11.54L12 21.35z" />
                </svg>
                <span>Donate</span>
              </Link>
            )}

            <span className="text-xs text-gray-500 dark:text-gray-500">
              Powered by{' '}
              <a
                href="https://github.com/BenDol/GithubWiki"
                target="_blank"
                rel="noopener noreferrer"
                className="hover:text-blue-500"
              >
                GitHub Wiki Framework
              </a>
            </span>
          </div>
        </div>
      </div>
    </footer>
  );
};

export default Footer;
