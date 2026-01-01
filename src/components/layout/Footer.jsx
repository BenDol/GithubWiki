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
            {/* Discord Link */}
            {config.wiki.social?.discord && (
              <a
                href={config.wiki.social.discord}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-600 hover:text-[#5865F2] dark:text-gray-400 dark:hover:text-[#5865F2] flex items-center space-x-1 transition-colors"
                title="Join our Discord"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path d="M20.317 4.37a19.791 19.791 0 00-4.885-1.515.074.074 0 00-.079.037c-.21.375-.444.864-.608 1.25a18.27 18.27 0 00-5.487 0 12.64 12.64 0 00-.617-1.25.077.077 0 00-.079-.037A19.736 19.736 0 003.677 4.37a.07.07 0 00-.032.027C.533 9.046-.32 13.58.099 18.057a.082.082 0 00.031.057 19.9 19.9 0 005.993 3.03.078.078 0 00.084-.028c.462-.63.874-1.295 1.226-1.994a.076.076 0 00-.041-.106 13.107 13.107 0 01-1.872-.892.077.077 0 01-.008-.128 10.2 10.2 0 00.372-.292.074.074 0 01.077-.01c3.928 1.793 8.18 1.793 12.062 0a.074.074 0 01.078.01c.12.098.246.198.373.292a.077.077 0 01-.006.127 12.299 12.299 0 01-1.873.892.077.077 0 00-.041.107c.36.698.772 1.362 1.225 1.993a.076.076 0 00.084.028 19.839 19.839 0 006.002-3.03.077.077 0 00.032-.054c.5-5.177-.838-9.674-3.549-13.66a.061.061 0 00-.031-.03zM8.02 15.33c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.956-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.956 2.418-2.157 2.418zm7.975 0c-1.183 0-2.157-1.085-2.157-2.419 0-1.333.955-2.419 2.157-2.419 1.21 0 2.176 1.096 2.157 2.42 0 1.333-.946 2.418-2.157 2.418z"/>
                </svg>
                {/* <span>Discord</span> */}
              </a>
            )}

            {/* GitHub Link */}
            {config.wiki.repository && (
              <a
                href={`https://github.com/${config.wiki.repository.owner}/${config.wiki.repository.repo}`}
                target="_blank"
                rel="noopener noreferrer"
                className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white flex items-center space-x-1 transition-colors"
              >
                <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
                  <path fillRule="evenodd" d="M12 2C6.477 2 2 6.484 2 12.017c0 4.425 2.865 8.18 6.839 9.504.5.092.682-.217.682-.483 0-.237-.008-.868-.013-1.703-2.782.605-3.369-1.343-3.369-1.343-.454-1.158-1.11-1.466-1.11-1.466-.908-.62.069-.608.069-.608 1.003.07 1.531 1.032 1.531 1.032.892 1.53 2.341 1.088 2.91.832.092-.647.35-1.088.636-1.338-2.22-.253-4.555-1.113-4.555-4.951 0-1.093.39-1.988 1.029-2.688-.103-.253-.446-1.272.098-2.65 0 0 .84-.27 2.75 1.026A9.564 9.564 0 0112 6.844c.85.004 1.705.115 2.504.337 1.909-1.296 2.747-1.027 2.747-1.027.546 1.379.202 2.398.1 2.651.64.7 1.028 1.595 1.028 2.688 0 3.848-2.339 4.695-4.566 4.943.359.309.678.92.678 1.855 0 1.338-.012 2.419-.012 2.747 0 .268.18.58.688.482A10.019 10.019 0 0022 12.017C22 6.484 17.522 2 12 2z" clipRule="evenodd" />
                </svg>
                {/* <span>GitHub</span> */}
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
                {/* <span>Donate</span> */}
              </Link>
            )}

            {/* Changelog Link */}
            <Link
              to="/changelog"
              className="text-sm text-gray-600 hover:text-gray-900 dark:text-gray-400 dark:hover:text-white flex items-center space-x-1 transition-colors"
              title="View Changelog"
            >
              <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5H7a2 2 0 00-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2m-3 7h3m-3 4h3m-6-4h.01M9 16h.01" />
              </svg>
              <span>Changelog</span>
            </Link>

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
