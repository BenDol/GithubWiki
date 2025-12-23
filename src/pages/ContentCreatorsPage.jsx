import React, { useState, useEffect, useMemo } from 'react';
import { Video, Tv, Plus } from 'lucide-react';
import { getApprovedCreators, isContentCreatorsEnabled, areStreamerSubmissionsAllowed } from '../services/contentCreators';
import { loadVideoGuides, searchVideoGuides, areVideoGuidesEnabled, areVideoGuideSubmissionsAllowed } from '../services/contentCreators';
import StreamEmbed from '../components/contentCreators/StreamEmbed';
import VideoGuideCard from '../components/contentCreators/VideoGuideCard';
import ContentCreatorSubmissionModal from '../components/contentCreators/ContentCreatorSubmissionModal';
import VideoGuideSubmissionModal from '../components/contentCreators/VideoGuideSubmissionModal';
import CreatorApprovalPanel from '../components/contentCreators/CreatorApprovalPanel';
import { useAuthStore } from '../store/authStore';
import { useWikiConfig } from '../hooks/useWikiConfig';
import { isAdmin } from '../services/github/admin';
import { createLogger } from '../utils/logger';

const logger = createLogger('CreatorsPage');

/**
 * CreatorsPage - Main content creators page
 * Shows live streams, video guides, and submission forms
 */
const CreatorsPage = () => {
  const { isAuthenticated, user } = useAuthStore();
  const { config } = useWikiConfig();

  const [approvedCreators, setApprovedCreators] = useState([]);
  const [videoGuides, setVideoGuides] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [isUserAdmin, setIsUserAdmin] = useState(false);

  // Modals
  const [showCreatorModal, setShowCreatorModal] = useState(false);
  const [showGuideModal, setShowGuideModal] = useState(false);

  // Filters for video guides
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedCategory, setSelectedCategory] = useState('All');
  const [selectedDifficulty, setSelectedDifficulty] = useState('All');

  const owner = config?.wiki?.repository?.owner;
  const repo = config?.wiki?.repository?.repo;

  // Load data on mount
  useEffect(() => {
    loadData();
  }, []);

  // Check admin status
  useEffect(() => {
    async function checkAdmin() {
      if (!isAuthenticated || !user || !config) return;

      try {
        const adminStatus = await isAdmin(user.login, owner, repo, config);
        setIsUserAdmin(adminStatus);
      } catch (err) {
        logger.error('Failed to check admin status', { error: err.message });
      }
    }

    checkAdmin();
  }, [isAuthenticated, user, config]);

  async function loadData() {
    setLoading(true);
    setError(null);

    try {
      logger.debug('Loading creators page data');

      const [creators, guides] = await Promise.all([
        getApprovedCreators(owner, repo, config),
        loadVideoGuides()
      ]);

      setApprovedCreators(creators);
      setVideoGuides(guides);

      logger.info('Creators page data loaded', {
        creatorsCount: creators.length,
        guidesCount: guides.length
      });
    } catch (err) {
      logger.error('Failed to load creators page data', { error: err.message });
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  // Get unique categories and difficulties
  const categories = useMemo(() => {
    const cats = videoGuides
      .map(g => g.category)
      .filter(Boolean);
    return ['All', ...new Set(cats)];
  }, [videoGuides]);

  const difficulties = useMemo(() => {
    const diffs = videoGuides
      .map(g => g.difficulty)
      .filter(Boolean);
    return ['All', ...new Set(diffs)];
  }, [videoGuides]);

  // Filter video guides
  const filteredGuides = useMemo(() => {
    return videoGuides.filter(guide => {
      const matchesSearch = !searchQuery ||
        guide.title.toLowerCase().includes(searchQuery.toLowerCase()) ||
        guide.description.toLowerCase().includes(searchQuery.toLowerCase());

      const matchesCategory = selectedCategory === 'All' || guide.category === selectedCategory;
      const matchesDifficulty = selectedDifficulty === 'All' || guide.difficulty === selectedDifficulty;

      return matchesSearch && matchesCategory && matchesDifficulty;
    });
  }, [videoGuides, searchQuery, selectedCategory, selectedDifficulty]);

  // Check if feature is enabled
  if (!isContentCreatorsEnabled(config)) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="p-8 bg-yellow-50 dark:bg-yellow-900/20 border border-yellow-200 dark:border-yellow-800 rounded-lg text-center">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-3">
            Content Creators Feature Disabled
          </h2>
          <p className="text-gray-600 dark:text-gray-400">
            The content creators feature is currently disabled in the wiki configuration.
          </p>
          <p className="text-sm text-gray-500 dark:text-gray-500 mt-2">
            Contact the wiki administrator to enable this feature.
          </p>
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen">
        <div className="text-center">
          <div className="animate-spin rounded-full h-16 w-16 border-b-2 border-blue-500 mx-auto mb-4"></div>
          <p className="text-gray-600 dark:text-gray-400">Loading content creators...</p>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="container mx-auto px-4 py-8">
        <div className="p-4 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg">
          <p className="text-red-600 dark:text-red-400 font-medium">
            Failed to load content creators
          </p>
          <p className="text-red-500 text-sm mt-1">{error}</p>
        </div>
      </div>
    );
  }

  const streamersEnabled = config?.features?.contentCreators?.streamers?.enabled;
  const videoGuidesEnabledFlag = areVideoGuidesEnabled(config);
  const streamerSubmissionsAllowed = areStreamerSubmissionsAllowed(config);
  const videoGuideSubmissionsAllowed = areVideoGuideSubmissionsAllowed(config);

  return (
    <div className="container mx-auto px-4 py-8 space-y-12">
      {/* Page Header */}
      <div className="text-center">
        <h1 className="text-4xl font-bold text-gray-900 dark:text-white mb-3">
          Content Creators
        </h1>
        <p className="text-lg text-gray-600 dark:text-gray-400 max-w-2xl mx-auto">
          Watch live streams from community creators and learn from video guides
        </p>
      </div>

      {/* Submission Buttons */}
      {(streamerSubmissionsAllowed || videoGuideSubmissionsAllowed) && (
        <div className="flex flex-wrap gap-3 justify-center">
          {streamerSubmissionsAllowed && (
            <button
              onClick={() => setShowCreatorModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
            >
              <Tv size={20} />
              Submit Streamer
            </button>
          )}

          {videoGuideSubmissionsAllowed && isAuthenticated && (
            <button
              onClick={() => setShowGuideModal(true)}
              className="flex items-center gap-2 px-6 py-3 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
            >
              <Video size={20} />
              Submit Video Guide
            </button>
          )}
        </div>
      )}

      {/* Live Streams Section */}
      {streamersEnabled && (
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Tv className="text-purple-500" size={32} />
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Live Streams
          </h2>
        </div>

        {approvedCreators.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Tv size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-600 dark:text-gray-400">
              No streamers yet. Be the first to submit one!
            </p>
            <button
              onClick={() => setShowCreatorModal(true)}
              className="mt-4 px-6 py-2 bg-purple-600 hover:bg-purple-700 text-white rounded-lg font-medium transition-colors"
            >
              Submit Streamer
            </button>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {approvedCreators.map(creator => (
              <StreamEmbed key={creator.creatorId} creator={creator} />
            ))}
          </div>
        )}
      </section>
      )}

      {/* Video Guides Section */}
      {videoGuidesEnabledFlag && (
      <section>
        <div className="flex items-center gap-3 mb-6">
          <Video className="text-blue-500" size={32} />
          <h2 className="text-3xl font-bold text-gray-900 dark:text-white">
            Video Guides
          </h2>
        </div>

        {/* Filters */}
        <div className="mb-6 space-y-3">
          <input
            type="search"
            placeholder="Search guides..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-700 text-gray-900 dark:text-white placeholder-gray-400"
          />

          <div className="flex gap-3 flex-wrap">
            <select
              value={selectedCategory}
              onChange={(e) => setSelectedCategory(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {categories.map(cat => (
                <option key={cat} value={cat}>Category: {cat}</option>
              ))}
            </select>

            <select
              value={selectedDifficulty}
              onChange={(e) => setSelectedDifficulty(e.target.value)}
              className="px-3 py-2 text-sm border border-gray-300 dark:border-gray-600 rounded-md bg-white dark:bg-gray-700 text-gray-900 dark:text-white"
            >
              {difficulties.map(diff => (
                <option key={diff} value={diff}>Difficulty: {diff}</option>
              ))}
            </select>

            <div className="ml-auto text-sm text-gray-600 dark:text-gray-400 flex items-center">
              {filteredGuides.length} guide{filteredGuides.length !== 1 ? 's' : ''}
            </div>
          </div>
        </div>

        {/* Video Guide Grid */}
        {filteredGuides.length === 0 ? (
          <div className="text-center py-12 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <Video size={48} className="mx-auto text-gray-300 dark:text-gray-600 mb-3" />
            <p className="text-gray-600 dark:text-gray-400">
              {videoGuides.length === 0
                ? 'No video guides yet.'
                : 'No guides match your filters.'}
            </p>
            {isAuthenticated && videoGuides.length === 0 && (
              <button
                onClick={() => setShowGuideModal(true)}
                className="mt-4 px-6 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-lg font-medium transition-colors"
              >
                Submit Video Guide
              </button>
            )}
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {filteredGuides.map(guide => (
              <VideoGuideCard key={guide.id} guide={guide} mode="card" />
            ))}
          </div>
        )}
      </section>
      )}

      {/* Admin Panel */}
      {isUserAdmin && (
        <section className="border-t border-gray-200 dark:border-gray-700 pt-12">
          <h2 className="text-2xl font-bold text-gray-900 dark:text-white mb-6">
            Admin Panel
          </h2>
          <CreatorApprovalPanel owner={owner} repo={repo} config={config} />
        </section>
      )}

      {/* Modals */}
      <ContentCreatorSubmissionModal
        isOpen={showCreatorModal}
        onClose={() => setShowCreatorModal(false)}
        onSuccess={() => {
          loadData();
        }}
      />

      <VideoGuideSubmissionModal
        isOpen={showGuideModal}
        onClose={() => setShowGuideModal(false)}
        onSuccess={() => {
          // Guide submission creates PR, no need to reload
        }}
      />
    </div>
  );
};

export default CreatorsPage;
