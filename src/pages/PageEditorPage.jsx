import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import matter from 'gray-matter';
import { useAuthStore } from '../store/authStore';
import { useWikiConfig, useSection } from '../hooks/useWikiConfig';
import { getFileContent, hasFileChanged } from '../services/github/content';
import { createBranch, generateEditBranchName } from '../services/github/branches';
import { updateFileContent } from '../services/github/content';
import { createWikiEditPR } from '../services/github/pullRequests';
import PageEditor from '../components/wiki/PageEditor';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { handleGitHubError } from '../services/github/api';

/**
 * PageEditorPage
 * Handles the complete page editing workflow
 */
const PageEditorPage = ({ sectionId }) => {
  const { pageId } = useParams();
  const navigate = useNavigate();
  const { config } = useWikiConfig();
  const section = useSection(sectionId);
  const { isAuthenticated, user } = useAuthStore();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [content, setContent] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [fileSha, setFileSha] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [prUrl, setPrUrl] = useState(null);

  // Check permissions
  const canEdit = section?.allowContributions && isAuthenticated;

  useEffect(() => {
    const loadPage = async () => {
      if (!config || !isAuthenticated) {
        setLoading(false);
        return;
      }

      try {
        setLoading(true);
        setError(null);

        const { owner, repo, contentPath } = config.wiki.repository;
        const filePath = `${contentPath}/${sectionId}/${pageId}.md`;

        // Fetch current file content from GitHub
        const fileData = await getFileContent(owner, repo, filePath);

        if (!fileData) {
          throw new Error('Page not found');
        }

        // Parse frontmatter
        const { data, content: markdownContent } = matter(fileData.content);

        setMetadata(data);
        setContent(fileData.content);
        setFileSha(fileData.sha);
      } catch (err) {
        console.error('Failed to load page for editing:', err);
        setError(handleGitHubError(err));
      } finally {
        setLoading(false);
      }
    };

    loadPage();
  }, [config, sectionId, pageId, isAuthenticated]);

  const handleSave = async (newContent, editSummary) => {
    if (!config || !user) return;

    try {
      setIsSaving(true);
      setError(null);

      const { owner, repo, contentPath, branch: baseBranch } = config.wiki.repository;
      const filePath = `${contentPath}/${sectionId}/${pageId}.md`;

      // Check if file has been modified since we loaded it
      const changed = await hasFileChanged(owner, repo, filePath, fileSha, baseBranch);

      if (changed) {
        const confirmOverwrite = window.confirm(
          'This page has been modified by someone else since you started editing. Do you want to overwrite their changes?'
        );

        if (!confirmOverwrite) {
          setIsSaving(false);
          return;
        }

        // Refresh SHA to get latest version
        const latestFile = await getFileContent(owner, repo, filePath, baseBranch);
        setFileSha(latestFile.sha);
      }

      // Generate unique branch name
      const branchName = generateEditBranchName(sectionId, pageId);

      // Create branch
      await createBranch(owner, repo, branchName, baseBranch);

      // Commit changes to new branch
      const commitMessage = `Update ${metadata?.title || pageId}\n\n${editSummary || 'Updated via wiki editor'}`;

      await updateFileContent(
        owner,
        repo,
        filePath,
        newContent,
        commitMessage,
        branchName,
        fileSha
      );

      // Create pull request
      const pr = await createWikiEditPR(
        owner,
        repo,
        metadata?.title || pageId,
        section?.title,
        sectionId,
        pageId,
        branchName,
        editSummary,
        baseBranch
      );

      setPrUrl(pr.url);
    } catch (err) {
      console.error('Failed to save changes:', err);
      setError(handleGitHubError(err));
      setIsSaving(false);
    }
  };

  const handleCancel = () => {
    if (isSaving) return;

    const confirmCancel = window.confirm(
      'Are you sure you want to cancel? Your changes will be lost.'
    );

    if (confirmCancel) {
      navigate(`/${sectionId}/${pageId}`);
    }
  };

  // Redirect if not authenticated
  if (!isAuthenticated) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">🔒</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Authentication Required
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          You need to sign in with GitHub to edit pages.
        </p>
        <Link
          to={`/${sectionId}/${pageId}`}
          className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
        >
          Back to Page
        </Link>
      </div>
    );
  }

  // Check permissions
  if (!canEdit) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">⛔</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Editing Not Allowed
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          This section does not allow contributions.
        </p>
        <Link
          to={`/${sectionId}/${pageId}`}
          className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
        >
          Back to Page
        </Link>
      </div>
    );
  }

  // Show PR success modal
  if (prUrl) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-green-500 text-6xl mb-4">✅</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Pull Request Created!
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          Your changes have been submitted for review. A pull request has been created and will be reviewed by the maintainers.
        </p>

        <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-6 mb-6">
          <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
            What happens next?
          </h3>
          <ul className="text-sm text-gray-700 dark:text-gray-300 space-y-2 text-left">
            <li className="flex items-start space-x-2">
              <span className="text-blue-500">•</span>
              <span>Maintainers will review your changes</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-blue-500">•</span>
              <span>They may request changes or approve immediately</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-blue-500">•</span>
              <span>Once merged, your changes will appear on the wiki</span>
            </li>
            <li className="flex items-start space-x-2">
              <span className="text-blue-500">•</span>
              <span>You'll be credited as a contributor</span>
            </li>
          </ul>
        </div>

        <div className="flex justify-center space-x-3">
          <Link
            to={`/${sectionId}/${pageId}`}
            className="inline-flex items-center px-6 py-3 bg-gray-200 dark:bg-gray-700 text-gray-900 dark:text-white rounded-lg hover:bg-gray-300 dark:hover:bg-gray-600 transition-colors font-medium"
          >
            Back to Page
          </Link>
          <a
            href={prUrl}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center px-6 py-3 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium"
          >
            View Pull Request
            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
        </div>
      </div>
    );
  }

  // Loading state
  if (loading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">Loading editor...</p>
        </div>
      </div>
    );
  }

  // Error state
  if (error) {
    return (
      <div className="max-w-2xl mx-auto">
        <div className="bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg p-6">
          <h3 className="text-lg font-semibold text-red-900 dark:text-red-200 mb-2">
            Failed to Load Editor
          </h3>
          <p className="text-red-700 dark:text-red-300 mb-4">{error}</p>
          <Link
            to={`/${sectionId}/${pageId}`}
            className="inline-flex items-center px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition-colors"
          >
            Back to Page
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="max-w-7xl mx-auto">
      {/* Breadcrumb */}
      <nav className="flex items-center space-x-2 text-sm text-gray-600 dark:text-gray-400 mb-6">
        <Link to="/" className="hover:text-blue-600 dark:hover:text-blue-400">
          Home
        </Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <Link to={`/${sectionId}`} className="hover:text-blue-600 dark:hover:text-blue-400">
          {section?.title || sectionId}
        </Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <Link to={`/${sectionId}/${pageId}`} className="hover:text-blue-600 dark:hover:text-blue-400">
          {metadata?.title || pageId}
        </Link>
        <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
        </svg>
        <span className="text-gray-900 dark:text-white font-medium">Edit</span>
      </nav>

      {/* Header */}
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
          Edit Page: {metadata?.title || pageId}
        </h1>
        <p className="text-gray-600 dark:text-gray-400">
          Make your changes and submit a pull request for review
        </p>
      </div>

      {/* Editor */}
      <PageEditor
        initialContent={content}
        initialMetadata={metadata}
        onSave={handleSave}
        onCancel={handleCancel}
        isSaving={isSaving}
      />
    </div>
  );
};

export default PageEditorPage;
