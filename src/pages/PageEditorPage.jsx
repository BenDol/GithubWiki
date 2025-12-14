import { useState, useEffect } from 'react';
import { useParams, useNavigate, Link } from 'react-router-dom';
import matter from 'gray-matter';
import { useAuthStore } from '../store/authStore';
import { useWikiConfig, useSection } from '../hooks/useWikiConfig';
import { useBranchNamespace } from '../hooks/useBranchNamespace';
import { getFileContent, hasFileChanged, deleteFileContent } from '../services/github/content';
import { createBranch, generateEditBranchName } from '../services/github/branches';
import { updateFileContent } from '../services/github/content';
import { createWikiEditPR, createCrossRepoPR, findExistingPRForPage, commitToExistingBranch, getUserPullRequests } from '../services/github/pullRequests';
import { hasWriteAccess } from '../services/github/permissions';
import { getOrCreateFork } from '../services/github/forks';
import { submitAnonymousEdit } from '../services/github/anonymousEdits';
import PageEditor from '../components/wiki/PageEditor';
import LoadingSpinner from '../components/common/LoadingSpinner';
import { handleGitHubError } from '../services/github/api';
import { getDisplayTitle } from '../utils/textUtils';
import { generatePageId } from '../utils/pageIdUtils';
import { getContentProcessor, getCustomComponents, getSpellPreview, getEquipmentPreview } from '../utils/contentRendererRegistry';
import { useInvalidatePrestige } from '../hooks/usePrestige';

/**
 * PageEditorPage
 * Handles the complete page editing workflow
 */
const PageEditorPage = ({ sectionId, isNewPage = false }) => {
  const { pageId: urlPageId } = useParams();
  const navigate = useNavigate();
  const { config } = useWikiConfig();
  const section = useSection(sectionId);
  const { isAuthenticated, user } = useAuthStore();
  const { branch: currentBranch, loading: branchLoading } = useBranchNamespace();
  const invalidatePrestige = useInvalidatePrestige();

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [content, setContent] = useState('');
  const [metadata, setMetadata] = useState(null);
  const [fileSha, setFileSha] = useState(null);
  const [isSaving, setIsSaving] = useState(false);
  const [newPageId, setNewPageId] = useState('');

  const autoFormatTitles = config?.features?.autoFormatPageTitles ?? false;
  const [prUrl, setPrUrl] = useState(null);
  const [isFirstContribution, setIsFirstContribution] = useState(false);
  const [prestigeTier, setPrestigeTier] = useState(null);
  const [isUpdatingExistingPR, setIsUpdatingExistingPR] = useState(false);
  const [savingStatus, setSavingStatus] = useState(''); // For showing fork operation progress
  const [isAnonymousMode, setIsAnonymousMode] = useState(false); // Track if user chose anonymous mode

  // Use newPageId for new pages, urlPageId for editing existing pages
  const pageId = isNewPage ? newPageId : urlPageId;

  // Check if anonymous mode is enabled
  const anonymousEnabled = config?.features?.editRequestCreator?.anonymous?.enabled ?? false;
  const requireAuth = config?.features?.editRequestCreator?.permissions?.requireAuth ?? true;

  // Check permissions - allow editing if authenticated OR anonymous mode is enabled
  const canEdit = section?.allowContributions && (isAuthenticated || (anonymousEnabled && !requireAuth));

  useEffect(() => {
    const loadPage = async () => {
      // Wait for config, section, and branch to load before checking permissions
      if (!config || !section || branchLoading) {
        return; // Keep loading until all are available
      }

      if (!isAuthenticated) {
        setLoading(false);
        return;
      }

      // For new pages, initialize with blank template
      if (isNewPage) {
        try {
          setLoading(true);
          setError(null);

          const today = new Date().toISOString().split('T')[0];
          const defaultContent = `---
id:
title:
description:
tags: []
category: ${section?.title || ''}
date: ${today}
order: 0
---

# Page Title

This page provides an overview and detailed information about the topic.

## Introduction

Add your introduction here. Explain what this page covers and why it's important.

## Main Content

Add the main content sections here. You can include:

- Key concepts and definitions
- Step-by-step guides or instructions
- Important tips and best practices
- Examples and use cases

## Additional Information

Include any supplementary details, notes, or related information.
`;

          setMetadata({
            id: '',
            title: '',
            description: '',
            tags: [],
            category: section?.title || '',
            date: today,
            order: 0,
          });
          setContent(defaultContent);
          setFileSha(null);
        } catch (err) {
          console.error('Failed to initialize new page:', err);
          setError(handleGitHubError(err));
        } finally {
          setLoading(false);
        }
        return;
      }

      // For existing pages, load from GitHub
      if (!pageId) {
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

        // Ensure metadata has all required fields with defaults
        const normalizedMetadata = {
          ...data, // Start with all existing fields
          id: data.id || '',
          title: data.title || '',
          description: data.description || '',
          tags: Array.isArray(data.tags) ? data.tags : [],
          category: data.category || '',
          date: data.date || ''
        };

        setMetadata(normalizedMetadata);
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
  }, [config, section, sectionId, pageId, isAuthenticated, isNewPage, currentBranch, branchLoading]);

  /**
   * Handle anonymous edit submission
   * Supports both server and serverless modes
   */
  const handleAnonymousSave = async (newContent, editSummary) => {
    if (!config || branchLoading || !currentBranch) return;

    // For new pages, validate that pageId is set
    if (isNewPage && !newPageId.trim()) {
      setError('Please enter a page filename (e.g., "my-new-page")');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const { owner, repo, contentPath } = config.wiki.repository;
      const currentPageId = isNewPage ? newPageId : pageId;
      const filePath = `${contentPath}/${sectionId}/${currentPageId}.md`;

      // Parse content to extract metadata
      const { data: parsedMetadata } = matter(newContent);

      // Generate page ID from title if not present
      let pageIdFromMetadata = parsedMetadata.id?.trim() || '';
      if (!pageIdFromMetadata) {
        const title = parsedMetadata.title?.trim();
        if (title) {
          pageIdFromMetadata = generatePageId(title);
        } else {
          pageIdFromMetadata = currentPageId;
        }
      }

      // Prepare payload
      const payload = {
        section: sectionId,
        pageId: pageIdFromMetadata,
        content: newContent,
        editSummary: editSummary || `Update ${parsedMetadata?.title || currentPageId}`,
        filePath,
        metadata: {
          id: pageIdFromMetadata,
          title: parsedMetadata?.title || currentPageId,
          ...parsedMetadata,
        },
      };

      // Check if using server or serverless mode
      const anonymousConfig = config.features?.editRequestCreator?.anonymous;
      const mode = anonymousConfig?.mode || 'server'; // 'server' or 'serverless'

      let result;

      if (mode === 'serverless') {
        // Serverless mode: GitHub Issues + Actions
        console.log('[Anonymous Edit] Using serverless mode (GitHub Issues + Actions)');
        console.log(`[Anonymous Edit] Branch: ${currentBranch}`);

        result = await submitAnonymousEdit(
          owner,
          repo,
          payload,
          currentBranch,
          (status) => setSavingStatus(status)
        );

        console.log(`[Anonymous Edit - Serverless] Success! PR #${result.prNumber}`);
      } else {
        // Server mode: External backend
        const serverEndpoint = anonymousConfig?.serverEndpoint;
        if (!serverEndpoint) {
          throw new Error('Anonymous edit endpoint not configured');
        }

        console.log(`[Anonymous Edit - Server] Submitting to: ${serverEndpoint}`);
        setSavingStatus('Submitting anonymous edit...');

        const response = await fetch(serverEndpoint, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
          },
          body: JSON.stringify(payload),
        });

        result = await response.json();

        if (!response.ok || !result.success) {
          throw new Error(result.error || result.message || 'Failed to submit anonymous edit');
        }

        console.log(`[Anonymous Edit - Server] Success! PR #${result.prNumber}`);
      }

      setSavingStatus('');
      setPrUrl(result.prUrl);
      setIsUpdatingExistingPR(false); // Anonymous edits always create new PRs
      setIsFirstContribution(false); // Anonymous edits don't count for prestige

    } catch (err) {
      console.error('[Anonymous Edit] Failed:', err);
      setError(err.message || 'Failed to submit anonymous edit. Please try again.');
      setIsSaving(false);
      setSavingStatus('');
    }
  };

  const handleSave = async (newContent, editSummary) => {
    // If in anonymous mode, use anonymous submission
    if (isAnonymousMode && !isAuthenticated) {
      return handleAnonymousSave(newContent, editSummary);
    }

    if (!config || !user || branchLoading || !currentBranch) return;

    // For new pages, validate that pageId is set
    if (isNewPage && !newPageId.trim()) {
      setError('Please enter a page filename (e.g., "my-new-page")');
      return;
    }

    try {
      setIsSaving(true);
      setError(null);

      const { owner, repo, contentPath } = config.wiki.repository;
      const baseBranch = currentBranch; // Use detected branch from context
      const currentPageId = isNewPage ? newPageId : pageId;
      const filePath = `${contentPath}/${sectionId}/${currentPageId}.md`;

      // Parse content to extract/generate page ID from metadata
      const { data: parsedMetadata, content: bodyContent } = matter(newContent);
      console.log('[PageEditor] Parsed metadata:', parsedMetadata);

      let pageIdFromMetadata = parsedMetadata.id?.trim() || '';

      // Generate page ID from title if not present
      if (!pageIdFromMetadata) {
        const title = parsedMetadata.title?.trim();

        if (!title) {
          // For existing pages, fall back to using the current pageId
          // For new pages, we require a title
          if (!isNewPage && currentPageId) {
            console.log(`[PageEditor] No ID or title found, using current pageId: ${currentPageId}`);
            pageIdFromMetadata = currentPageId;

            // Update the content with the current pageId
            const updatedMetadata = { ...parsedMetadata, id: pageIdFromMetadata };
            newContent = matter.stringify(bodyContent, updatedMetadata);
          } else {
            console.error('[PageEditor] No ID and no title found in metadata:', parsedMetadata);
            setError('Page must have a title. Please ensure the title field is filled in the metadata section.');
            setIsSaving(false);
            return;
          }
        } else {
          // Generate ID from title
          pageIdFromMetadata = generatePageId(title);
          console.log(`[PageEditor] Generated page ID from title "${title}": ${pageIdFromMetadata}`);

          // Update the content with the generated ID
          const updatedMetadata = { ...parsedMetadata, id: pageIdFromMetadata };
          newContent = matter.stringify(bodyContent, updatedMetadata);
          console.log('[PageEditor] Updated content with generated ID');
        }
      } else {
        console.log(`[PageEditor] Using existing page ID: ${pageIdFromMetadata}`);
      }

      // TODO: Implement duplicate ID validation across all pages
      // For now, we log a warning. In production, this should check all pages
      // and prevent saving if a duplicate ID is found (excluding the current page)
      console.log(`[PageEditor] Using page ID: ${pageIdFromMetadata} for file: ${filePath}`);

      // For existing pages, check if file has been modified since we loaded it
      if (!isNewPage) {
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
      }

      // Check if this is the user's first contribution
      const userPRs = await getUserPullRequests(owner, repo, user.login);
      const isFirstEver = userPRs.length === 0;

      if (isFirstEver) {
        console.log(`[PageEditor] This is ${user.login}'s first contribution!`);
      }

      // Determine workflow: direct branch vs fork
      const editRequestConfig = config.features?.editRequestCreator;
      const mode = editRequestConfig?.mode || 'auto';
      const forksEnabled = editRequestConfig?.forks?.enabled ?? true;
      const autoSync = editRequestConfig?.forks?.autoSync ?? true;

      console.log(`\n${'='.repeat(60)}`);
      console.log(`[PageEditor] Edit Request Mode: ${mode}`);
      console.log(`[PageEditor] Forks Enabled: ${forksEnabled}`);
      console.log(`${'='.repeat(60)}\n`);

      // Check user permissions
      setSavingStatus('Checking permissions...');
      const userHasWriteAccess = await hasWriteAccess(owner, repo, user.login);
      console.log(`[PageEditor] User ${user.login} has write access: ${userHasWriteAccess}`);

      // Check if direct commit is allowed
      const allowDirectCommit = editRequestConfig?.permissions?.allowDirectCommit ?? false;

      // If direct commit is enabled and user has write access, commit directly to main
      if (allowDirectCommit && userHasWriteAccess) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[PageEditor] DIRECT COMMIT MODE - Committing to main branch`);
        console.log(`[PageEditor] User: ${user.login}`);
        console.log(`[PageEditor] Target: ${owner}/${repo}:${baseBranch}`);
        console.log(`${'='.repeat(60)}\n`);

        setSavingStatus('Committing to main branch...');

        const action = isNewPage ? 'Create' : 'Update';
        const commitMessage = `${action} ${parsedMetadata?.title || currentPageId}\n\n${editSummary || `${action}d via wiki editor`}`;

        // Commit directly to main branch
        await updateFileContent(
          owner,
          repo,
          filePath,
          newContent,
          commitMessage,
          baseBranch,
          isNewPage ? null : fileSha
        );

        console.log(`\n[PageEditor] ✓ Successfully committed to ${baseBranch}`);

        // Invalidate prestige cache to reflect new contribution
        if (user?.login) {
          invalidatePrestige(user.login);
          console.log(`[PageEditor] Invalidated prestige cache for ${user.login}`);
        }

        // Show success message without PR
        setSavingStatus('');
        setIsSaving(false);

        // Navigate back to the page view
        setTimeout(() => {
          navigate(isNewPage ? `/${sectionId}/${currentPageId}` : `/${sectionId}/${pageId}`);
        }, 1000);

        return;
      }

      // Determine if we should use fork workflow
      let useFork = false;
      if (mode === 'auto') {
        useFork = !userHasWriteAccess && forksEnabled;
        if (!userHasWriteAccess && forksEnabled) {
          console.log(`[PageEditor] No write access detected - falling back to fork workflow`);
        }
      } else if (mode === 'fork-only') {
        useFork = forksEnabled;
      } else if (mode === 'branch-only') {
        if (!userHasWriteAccess) {
          setError('You need write access to this repository to contribute. Please contact the repository owner.');
          setIsSaving(false);
          setSavingStatus('');
          return;
        }
        useFork = false;
      }

      console.log(`[PageEditor] Using fork workflow: ${useFork}`);

      // Set target repository (main repo or fork)
      let targetOwner = owner;
      let targetRepo = repo;
      let fork = null;

      if (useFork) {
        console.log(`\n[PageEditor] Setting up fork workflow...`);
        setSavingStatus('Setting up your fork...');

        try {
          fork = await getOrCreateFork(owner, repo, user.login, autoSync);
          targetOwner = fork.owner;
          targetRepo = fork.repo;

          console.log(`[PageEditor] ✓ Fork ready: ${fork.fullName}`);
          setSavingStatus('');

          // Check if fork needs manual sync
          if (fork.needsManualSync && fork.outOfDate) {
            const divergedWarning = fork.diverged
              ? ' Your fork has also diverged, so you may need to resolve conflicts.'
              : '';

            const shouldContinue = window.confirm(
              `🔄 Fork Sync Required\n\n` +
              `Your fork is ${fork.behindBy} commit${fork.behindBy > 1 ? 's' : ''} behind the main repository.${divergedWarning}\n\n` +
              `We'll open GitHub in a new tab where you can sync your fork with one click.\n\n` +
              `Steps:\n` +
              `1. Click OK to open the sync page\n` +
              `2. Click "Sync fork" → "Update branch" on GitHub\n` +
              `3. Come back here and try saving again\n\n` +
              `(Or click Cancel to continue without syncing - may cause conflicts)`
            );

            if (shouldContinue) {
              // Open fork page in new tab
              window.open(fork.syncUrl, '_blank', 'noopener,noreferrer');

              // Give user time to sync, then they can try again
              setError(`Please sync your fork on GitHub (opened in new tab), then try saving again.`);
              setIsSaving(false);
              setSavingStatus('');
              return;
            }
            // If they click Cancel, continue anyway (they accepted the risk)
          }
        } catch (err) {
          console.error('[PageEditor] Failed to setup fork:', err);
          setError('Failed to setup your fork. Please try again or contact support.');
          setIsSaving(false);
          setSavingStatus('');
          return;
        }
      } else {
        console.log(`[PageEditor] Using direct branch workflow on ${owner}/${repo}`);
        setSavingStatus('');
      }

      // Check if user already has an open PR for this page ID
      console.log(`[PageEditor] Checking for existing PR for page ID: ${pageIdFromMetadata}, filename: ${currentPageId}`);
      setSavingStatus('Checking for existing edit requests...');
      const existingPR = await findExistingPRForPage(owner, repo, sectionId, pageIdFromMetadata, user.login, currentPageId);

      let pr;
      const action = isNewPage ? 'Create' : 'Update';
      const commitMessage = `${action} ${parsedMetadata?.title || currentPageId}\n\n${editSummary || `${action}d via wiki editor`}`;

      setSavingStatus(existingPR ? 'Updating existing edit request...' : 'Creating branch...');

      if (existingPR) {
        // Commit to existing branch
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[PageEditor] ✓ FOUND EXISTING PR - WILL UPDATE`);
        console.log(`[PageEditor] PR #${existingPR.number}: ${existingPR.title}`);
        console.log(`[PageEditor] Branch: ${existingPR.head.ref}`);
        console.log(`[PageEditor] URL: ${existingPR.url}`);
        console.log(`${'='.repeat(60)}\n`);

        // Commit to the branch on the correct repository (fork or main)
        await commitToExistingBranch(
          targetOwner,
          targetRepo,
          existingPR.head.ref,
          filePath,
          newContent,
          commitMessage,
          isNewPage ? null : fileSha
        );

        pr = existingPR;
        setIsUpdatingExistingPR(true);
        console.log(`\n[PageEditor] ✓ Successfully added commit to existing PR #${existingPR.number}\n`);

        // Invalidate prestige cache to reflect new contribution
        if (user?.login) {
          invalidatePrestige(user.login);
          console.log(`[PageEditor] Invalidated prestige cache for ${user.login}`);
        }
      } else {
        // Create new branch and PR
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[PageEditor] ✓ NO EXISTING PR - WILL CREATE NEW`);
        console.log(`[PageEditor] Section: ${sectionId}`);
        console.log(`[PageEditor] Page ID: ${pageIdFromMetadata}`);
        console.log(`[PageEditor] Target: ${targetOwner}/${targetRepo}`);
        console.log(`[PageEditor] Using fork: ${useFork}`);
        console.log(`${'='.repeat(60)}\n`);

        // Generate unique branch name using page ID
        const branchName = generateEditBranchName(sectionId, pageIdFromMetadata);

        // Create branch on target repository (fork or main)
        setSavingStatus('Creating branch...');
        await createBranch(targetOwner, targetRepo, branchName, baseBranch);

        // Commit changes to new branch
        setSavingStatus('Committing changes...');
        await updateFileContent(
          targetOwner,
          targetRepo,
          filePath,
          newContent,
          commitMessage,
          branchName,
          isNewPage ? null : fileSha
        );

        // Create pull request (cross-repo if fork, direct if main repo)
        setSavingStatus('Creating edit request...');
        if (useFork) {
          // Cross-repository PR from fork to upstream
          pr = await createCrossRepoPR(
            owner,          // upstream owner
            repo,           // upstream repo
            user.login,     // fork owner (username)
            branchName,     // branch on fork
            parsedMetadata?.title || currentPageId,  // title
            editSummary || `Update ${parsedMetadata?.title || currentPageId}`,  // body
            baseBranch      // base branch on upstream
          );
          console.log(`[PageEditor] ✓ Created cross-repo PR from ${user.login}:${branchName} to ${owner}/${repo}`);
        } else {
          // Direct PR on main repository
          pr = await createWikiEditPR(
            owner,
            repo,
            parsedMetadata?.title || currentPageId,
            section?.title,
            sectionId,
            pageIdFromMetadata,
            branchName,
            editSummary,
            baseBranch
          );
          console.log(`[PageEditor] ✓ Created direct PR from ${branchName} on ${owner}/${repo}`);
        }

        console.log(`\n[PageEditor] ✓ Successfully created new PR #${pr.number}`);
        console.log(`[PageEditor] URL: ${pr.url}\n`);

        // Invalidate prestige cache to reflect new contribution
        if (user?.login) {
          invalidatePrestige(user.login);
          console.log(`[PageEditor] Invalidated prestige cache for ${user.login}`);
        }
      }

      // Set first contribution state and determine prestige tier
      if (isFirstEver) {
        setIsFirstContribution(true);

        // Get the first prestige tier (Contributor - 1 contribution)
        const prestigeTiers = config?.prestige?.tiers || [];
        const firstTier = prestigeTiers.find(tier => tier.minContributions === 1) ||
                          prestigeTiers[1] || // Fallback to second tier
                          { id: 'contributor', title: 'Contributor', badge: '✍️', color: '#3b82f6' };

        setPrestigeTier(firstTier);
      }

      setSavingStatus(''); // Clear saving status on success
      setPrUrl(pr.url);
    } catch (err) {
      console.error('Failed to save changes:', err);
      setError(handleGitHubError(err));
      setIsSaving(false);
      setSavingStatus(''); // Clear saving status on error
    }
  };

  const handleCancel = () => {
    if (isSaving) return;

    const confirmCancel = window.confirm(
      'Are you sure you want to cancel? Your changes will be lost.'
    );

    if (confirmCancel) {
      // For new pages, go back to section page; for existing pages, go to page view
      navigate(isNewPage ? `/${sectionId}` : `/${sectionId}/${pageId}`);
    }
  };

  const handleDelete = async () => {
    if (!config || !user || !pageId || !fileSha || branchLoading || !currentBranch) return;

    // Confirm deletion
    const pageTitle = metadata?.title || pageId;

    // Check if direct commit is allowed for deletes
    const editRequestConfig = config.features?.editRequestCreator;
    const allowDirectCommit = editRequestConfig?.permissions?.allowDirectCommit ?? false;
    const allowDirectCommitDelete = editRequestConfig?.permissions?.allowDirectCommitDelete ?? false;
    const userHasWriteAccess = await hasWriteAccess(config.wiki.repository.owner, config.wiki.repository.repo, user.login);

    // For deletes, require both allowDirectCommit AND allowDirectCommitDelete to be true
    const canDirectDelete = allowDirectCommit && allowDirectCommitDelete && userHasWriteAccess;

    const confirmMessage = canDirectDelete
      ? `Are you sure you want to delete "${pageTitle}"?\n\nThis will immediately delete the page from the main branch.`
      : `Are you sure you want to delete "${pageTitle}"?\n\nThis will create a pull request to remove this page. The deletion will not take effect until the PR is merged.`;

    const confirmDelete = window.confirm(confirmMessage);

    if (!confirmDelete) return;

    try {
      setIsSaving(true);
      setError(null);

      const { owner, repo, contentPath } = config.wiki.repository;
      const baseBranch = currentBranch; // Use detected branch from context
      const filePath = `${contentPath}/${sectionId}/${pageId}.md`;

      // Parse content to extract metadata for page ID
      const { data: parsedMetadata } = matter(content);
      const pageIdFromMetadata = parsedMetadata.id?.trim() || pageId;

      // Check user permissions
      setSavingStatus('Checking permissions...');
      console.log(`[PageEditor] User ${user.login} has write access: ${userHasWriteAccess}`);

      // If direct commit is enabled for deletes, delete directly from main
      if (canDirectDelete) {
        console.log(`\n${'='.repeat(60)}`);
        console.log(`[PageEditor] DIRECT DELETE MODE - Deleting from main branch`);
        console.log(`[PageEditor] User: ${user.login}`);
        console.log(`[PageEditor] Target: ${owner}/${repo}:${baseBranch}`);
        console.log(`${'='.repeat(60)}\n`);

        setSavingStatus('Deleting from main branch...');

        const commitMessage = `Delete ${pageTitle}\n\nRemove page via wiki editor`;

        // Delete directly from main branch
        await deleteFileContent(
          owner,
          repo,
          filePath,
          commitMessage,
          baseBranch,
          fileSha
        );

        console.log(`\n[PageEditor] ✓ Successfully deleted from ${baseBranch}`);

        // Invalidate prestige cache to reflect new contribution
        if (user?.login) {
          invalidatePrestige(user.login);
          console.log(`[PageEditor] Invalidated prestige cache for ${user.login}`);
        }

        // Show success and navigate back
        setSavingStatus('');
        setIsSaving(false);

        setTimeout(() => {
          navigate(`/${sectionId}`);
        }, 1000);

        return;
      }

      // Determine if we should use fork workflow
      const mode = editRequestConfig?.mode || 'auto';
      const forksEnabled = editRequestConfig?.forks?.enabled ?? true;
      const autoSync = editRequestConfig?.forks?.autoSync ?? true;

      let useFork = false;
      if (mode === 'auto') {
        useFork = !userHasWriteAccess && forksEnabled;
      } else if (mode === 'fork-only') {
        useFork = forksEnabled;
      } else if (mode === 'branch-only') {
        if (!userHasWriteAccess) {
          setError('You need write access to this repository to delete pages. Please contact the repository owner.');
          setIsSaving(false);
          setSavingStatus('');
          return;
        }
        useFork = false;
      }

      // Set target repository (main repo or fork)
      let targetOwner = owner;
      let targetRepo = repo;
      let fork = null;

      if (useFork) {
        console.log(`\n[PageEditor] Setting up fork workflow for deletion...`);
        setSavingStatus('Setting up your fork...');

        try {
          fork = await getOrCreateFork(owner, repo, user.login, autoSync);
          targetOwner = fork.owner;
          targetRepo = fork.repo;

          console.log(`[PageEditor] ✓ Fork ready: ${fork.fullName}`);
          setSavingStatus('');

          // Check if fork needs manual sync
          if (fork.needsManualSync && fork.outOfDate) {
            const divergedWarning = fork.diverged
              ? ' Your fork has also diverged, so you may need to resolve conflicts.'
              : '';

            const shouldContinue = window.confirm(
              `🔄 Fork Sync Required\n\n` +
              `Your fork is ${fork.behindBy} commit${fork.behindBy > 1 ? 's' : ''} behind the main repository.${divergedWarning}\n\n` +
              `We'll open GitHub in a new tab where you can sync your fork with one click.\n\n` +
              `Steps:\n` +
              `1. Click OK to open the sync page\n` +
              `2. Click "Sync fork" → "Update branch" on GitHub\n` +
              `3. Come back here and try deleting again\n\n` +
              `(Or click Cancel to continue without syncing - may cause conflicts)`
            );

            if (shouldContinue) {
              // Open fork page in new tab
              window.open(fork.syncUrl, '_blank', 'noopener,noreferrer');

              // Give user time to sync, then they can try again
              setError(`Please sync your fork on GitHub (opened in new tab), then try deleting again.`);
              setIsSaving(false);
              setSavingStatus('');
              return;
            }
            // If they click Cancel, continue anyway (they accepted the risk)
          }
        } catch (err) {
          console.error('[PageEditor] Failed to setup fork:', err);
          setError('Failed to setup your fork. Please try again or contact support.');
          setIsSaving(false);
          setSavingStatus('');
          return;
        }
      }

      // Generate unique branch name for deletion
      const branchName = generateEditBranchName(sectionId, pageIdFromMetadata, 'delete');
      const commitMessage = `Delete ${pageTitle}\n\nRemove page via wiki editor`;

      // Create branch on target repository
      setSavingStatus('Creating branch...');
      await createBranch(targetOwner, targetRepo, branchName, baseBranch);

      // Delete file from new branch
      setSavingStatus('Deleting file...');
      await deleteFileContent(
        targetOwner,
        targetRepo,
        filePath,
        commitMessage,
        branchName,
        fileSha
      );

      // Create pull request
      setSavingStatus('Creating deletion request...');
      let pr;

      if (useFork) {
        // Cross-repository PR from fork to upstream
        pr = await createCrossRepoPR(
          owner,          // upstream owner
          repo,           // upstream repo
          user.login,     // fork owner (username)
          branchName,     // branch on fork
          `Delete ${pageTitle}`,  // title
          `Request to delete page: ${pageTitle}\n\nSection: ${section?.title || sectionId}\nPage ID: ${pageIdFromMetadata}`,  // body
          baseBranch      // base branch on upstream
        );
        console.log(`[PageEditor] ✓ Created cross-repo deletion PR from ${user.login}:${branchName} to ${owner}/${repo}`);
      } else {
        // Direct PR on main repository
        pr = await createWikiEditPR(
          owner,
          repo,
          `Delete ${pageTitle}`,
          section?.title,
          sectionId,
          pageIdFromMetadata,
          branchName,
          `Request to delete page: ${pageTitle}`,
          baseBranch
        );
        console.log(`[PageEditor] ✓ Created direct deletion PR from ${branchName} on ${owner}/${repo}`);
      }

      console.log(`\n[PageEditor] ✓ Successfully created deletion PR #${pr.number}`);
      console.log(`[PageEditor] URL: ${pr.url}\n`);

      // Invalidate prestige cache to reflect new contribution
      if (user?.login) {
        invalidatePrestige(user.login);
        console.log(`[PageEditor] Invalidated prestige cache for ${user.login}`);
      }

      setSavingStatus('');
      setPrUrl(pr.url);

      // Navigate back to section page after successful deletion PR
      setTimeout(() => {
        navigate(`/${sectionId}`);
      }, 2000);
    } catch (err) {
      console.error('Failed to delete page:', err);
      setError(handleGitHubError(err));
      setIsSaving(false);
      setSavingStatus('');
    }
  };

  // Scroll to top when editor loads
  useEffect(() => {
    if (!loading) {
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  }, [loading]);

  // Loading state (must check BEFORE permission checks to avoid flashing messages)
  if (loading || !section || branchLoading) {
    return (
      <div className="flex justify-center items-center min-h-[400px]">
        <div className="text-center">
          <LoadingSpinner size="lg" />
          <p className="mt-4 text-gray-600 dark:text-gray-400">
            {branchLoading ? 'Detecting branch...' : 'Loading editor...'}
          </p>
        </div>
      </div>
    );
  }

  // Show edit mode selection if not authenticated but anonymous mode is available
  if (!isAuthenticated && anonymousEnabled && !requireAuth && !isAnonymousMode) {
    return (
      <div className="max-w-2xl mx-auto text-center py-12">
        <div className="text-gray-400 text-6xl mb-4">✏️</div>
        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          Choose Edit Mode
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-8">
          You can edit this page with or without signing in.
        </p>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4 max-w-xl mx-auto">
          {/* Authenticated Edit */}
          <div className="border-2 border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:border-blue-500 dark:hover:border-blue-400 transition-colors">
            <div className="text-4xl mb-3">👤</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Sign In to Edit
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Get credited for your contributions and earn prestige
            </p>
            <Link
              to="/auth/github"
              className="inline-flex items-center px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors font-medium w-full justify-center"
            >
              Sign In with GitHub
            </Link>
          </div>

          {/* Anonymous Edit */}
          <div className="border-2 border-gray-200 dark:border-gray-700 rounded-lg p-6 hover:border-green-500 dark:hover:border-green-400 transition-colors">
            <div className="text-4xl mb-3">🕶️</div>
            <h3 className="text-lg font-semibold text-gray-900 dark:text-white mb-2">
              Edit Anonymously
            </h3>
            <p className="text-sm text-gray-600 dark:text-gray-400 mb-4">
              Quick edits without signing in (no prestige earned)
            </p>
            <button
              onClick={() => setIsAnonymousMode(true)}
              className="inline-flex items-center px-4 py-2 bg-green-500 text-white rounded-lg hover:bg-green-600 transition-colors font-medium w-full justify-center"
            >
              Continue Anonymously
            </button>
          </div>
        </div>

        <Link
          to={`/${sectionId}/${pageId}`}
          className="inline-flex items-center mt-6 text-gray-600 dark:text-gray-400 hover:text-gray-900 dark:hover:text-white"
        >
          ← Back to Page
        </Link>
      </div>
    );
  }

  // Redirect if not authenticated and anonymous mode not enabled
  if (!isAuthenticated && (!anonymousEnabled || requireAuth)) {
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
        {/* Animated icon with glow and sparkle effects */}
        <div className="relative inline-flex items-center justify-center w-32 h-32 mb-4">
          {/* Glow rings - centered */}
          <div className="absolute inset-0 flex items-center justify-center animate-ping-slow">
            <div className={`w-24 h-24 rounded-full opacity-20 ${isUpdatingExistingPR ? 'bg-blue-400' : 'bg-green-400'}`}></div>
          </div>
          <div className="absolute inset-0 flex items-center justify-center animate-pulse-slow">
            <div className={`w-24 h-24 rounded-full opacity-30 blur-xl ${isUpdatingExistingPR ? 'bg-blue-400' : 'bg-green-400'}`}></div>
          </div>

          {/* Main icon with pop-in animation */}
          {isUpdatingExistingPR ? (
            // Pencil/Edit icon for updates
            <div className="relative animate-pop-in" style={{ filter: 'drop-shadow(0 0 15px rgba(59, 130, 246, 0.5))' }}>
              <svg className="w-16 h-16 text-blue-500" fill="currentColor" viewBox="0 0 24 24">
                <path d="M3 17.25V21h3.75L17.81 9.94l-3.75-3.75L3 17.25zM20.71 7.04c.39-.39.39-1.02 0-1.41l-2.34-2.34a.9959.9959 0 00-1.41 0l-1.83 1.83 3.75 3.75 1.83-1.83z"/>
              </svg>
            </div>
          ) : (
            // Checkmark for new PRs
            <div className="relative animate-pop-in text-6xl drop-shadow-[0_0_15px_rgba(34,197,94,0.5)]">
              ✅
            </div>
          )}

          {/* Sparkle particles - rendered on top with higher z-index */}
          <div className="absolute inset-0 z-10 pointer-events-none">
            {/* Sparkle 1 - top left */}
            <svg className="absolute top-4 left-8 w-6 h-6 animate-sparkle-1" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="#FCD34D" stroke="#FCD34D" strokeWidth="1"/>
              <path d="M12 6L12.5 9.5L16 10L12.5 10.5L12 14L11.5 10.5L8 10L11.5 9.5L12 6Z" fill="#FEF3C7" />
            </svg>

            {/* Sparkle 2 - top right */}
            <svg className="absolute top-8 right-6 w-5 h-5 animate-sparkle-2" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="#FBBF24" stroke="#FBBF24" strokeWidth="1"/>
              <path d="M12 6L12.5 9.5L16 10L12.5 10.5L12 14L11.5 10.5L8 10L11.5 9.5L12 6Z" fill="#FDE68A" />
            </svg>

            {/* Sparkle 3 - bottom left */}
            <svg className="absolute bottom-8 left-12 w-5 h-5 animate-sparkle-3" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="#FCD34D" stroke="#FCD34D" strokeWidth="1"/>
              <path d="M12 6L12.5 9.5L16 10L12.5 10.5L12 14L11.5 10.5L8 10L11.5 9.5L12 6Z" fill="#FEF3C7" />
            </svg>

            {/* Sparkle 4 - bottom right */}
            <svg className="absolute bottom-6 right-10 w-6 h-6 animate-sparkle-4" viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="#FBBF24" stroke="#FBBF24" strokeWidth="1"/>
              <path d="M12 6L12.5 9.5L16 10L12.5 10.5L12 14L11.5 10.5L8 10L11.5 9.5L12 6Z" fill="#FDE68A" />
            </svg>

            {/* Additional smaller sparkles for more effect */}
            <svg className="absolute top-12 left-4 w-4 h-4 animate-sparkle-1" style={{ animationDelay: '0.3s' }} viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="#FDE047" stroke="#FDE047" strokeWidth="1"/>
            </svg>

            <svg className="absolute top-6 right-12 w-4 h-4 animate-sparkle-3" style={{ animationDelay: '0.5s' }} viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="#FDE047" stroke="#FDE047" strokeWidth="1"/>
            </svg>

            <svg className="absolute bottom-12 right-4 w-4 h-4 animate-sparkle-2" style={{ animationDelay: '0.4s' }} viewBox="0 0 24 24" fill="none">
              <path d="M12 2L13.5 8.5L20 10L13.5 11.5L12 18L10.5 11.5L4 10L10.5 8.5L12 2Z" fill="#FDE047" stroke="#FDE047" strokeWidth="1"/>
            </svg>
          </div>
        </div>

        <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-3">
          {isUpdatingExistingPR ? 'Edit Request Updated!' : 'Edit Request Created!'}
        </h1>
        <p className="text-gray-600 dark:text-gray-400 mb-6">
          {isUpdatingExistingPR
            ? 'Your changes have been added to your existing edit request. The maintainers will review your updated changes.'
            : 'Your changes have been submitted for review. An edit request has been created and will be reviewed by the maintainers.'
          }
        </p>

        {/* First contribution congratulations */}
        {isFirstContribution && prestigeTier && (
          <div className="bg-gradient-to-br from-purple-50 to-blue-50 dark:from-purple-900/20 dark:to-blue-900/20 border-2 border-purple-300 dark:border-purple-700 rounded-lg p-6 mb-6 animate-pop-in">
            <div className="text-center mb-4">
              <h2 className="text-2xl font-bold text-purple-900 dark:text-purple-200 mb-2">
                🎉 Congratulations on Your First Contribution! 🎉
              </h2>
              <p className="text-purple-700 dark:text-purple-300">
                Welcome to the wiki community! You've taken your first step as a contributor.
              </p>
            </div>

            {/* Prestige level up animation */}
            <div className="bg-white dark:bg-gray-800 rounded-lg p-6 shadow-lg">
              <div className="text-center mb-4">
                <p className="text-sm text-gray-600 dark:text-gray-400 mb-2">You've achieved</p>
                <div className="inline-flex items-center justify-center space-x-3 animate-pop-in" style={{ animationDelay: '0.3s' }}>
                  <span className="text-4xl animate-pop-in" style={{ animationDelay: '0.5s' }}>{prestigeTier.badge}</span>
                  <div>
                    <h3 className="text-2xl font-bold" style={{ color: prestigeTier.color }}>
                      {prestigeTier.title}
                    </h3>
                    <p className="text-sm text-gray-500 dark:text-gray-400">Prestige Rank</p>
                  </div>
                </div>
              </div>

              {/* Animated progress bar */}
              <div className="mt-6">
                <div className="flex justify-between text-xs text-gray-600 dark:text-gray-400 mb-2">
                  <span>Newcomer</span>
                  <span>{prestigeTier.title}</span>
                </div>
                <div className="relative h-4 bg-gray-200 dark:bg-gray-700 rounded-full overflow-hidden">
                  {/* Background track */}
                  <div className="absolute inset-0 bg-gradient-to-r from-gray-300 to-gray-200 dark:from-gray-600 dark:to-gray-700"></div>

                  {/* Animated fill */}
                  <div
                    className="absolute inset-y-0 left-0 rounded-full transition-all duration-[2000ms] ease-out"
                    style={{
                      width: '100%',
                      background: `linear-gradient(90deg, ${prestigeTier.color}, ${prestigeTier.color}dd)`,
                      boxShadow: `0 0 20px ${prestigeTier.color}88`,
                      animation: 'progress-fill 2s ease-out forwards'
                    }}
                  ></div>

                  {/* Shine effect */}
                  <div
                    className="absolute inset-0 bg-gradient-to-r from-transparent via-white/30 to-transparent"
                    style={{ animation: 'shine 2s ease-out' }}
                  ></div>
                </div>
                <p className="text-center text-sm text-gray-600 dark:text-gray-400 mt-2 animate-pop-in" style={{ animationDelay: '2s' }}>
                  Level Up! 🎊
                </p>
              </div>
            </div>
          </div>
        )}

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
            View Edit Request
            <svg className="w-4 h-4 ml-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M10 6H6a2 2 0 00-2 2v10a2 2 0 002 2h10a2 2 0 002-2v-4M14 4h6m0 0v6m0-6L10 14" />
            </svg>
          </a>
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
        {!isNewPage && (
          <>
            <Link to={`/${sectionId}/${pageId}`} className="hover:text-blue-600 dark:hover:text-blue-400">
              {getDisplayTitle(pageId, metadata?.title, autoFormatTitles)}
            </Link>
            <svg className="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
            </svg>
            <span className="text-gray-900 dark:text-white font-medium">Edit</span>
          </>
        )}
        {isNewPage && (
          <span className="text-gray-900 dark:text-white font-medium">Create Page</span>
        )}
      </nav>

      {/* Header */}
      <div className="mb-6 flex items-start justify-between">
        <div className="flex-1">
          <h1 className="text-3xl font-bold text-gray-900 dark:text-white mb-2">
            {isNewPage ? 'Create New Page' : `Edit Page: ${getDisplayTitle(pageId, metadata?.title, autoFormatTitles)}`}
          </h1>
          <p className="text-gray-600 dark:text-gray-400">
            {isNewPage ? 'Enter a filename and create your new page' : 'Make your changes and submit a pull request for review'}
          </p>
        </div>

        {/* Delete button - only for existing pages and authenticated users */}
        {!isNewPage && isAuthenticated && (
          <button
            onClick={handleDelete}
            disabled={isSaving}
            className="ml-4 inline-flex items-center px-4 py-2 text-sm font-medium text-red-700 dark:text-red-400 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg hover:bg-red-100 dark:hover:bg-red-900/30 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            title="Delete this page (creates a pull request)"
          >
            <svg className="w-4 h-4 mr-2" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
            </svg>
            Delete Page
          </button>
        )}
      </div>

      {/* Anonymous Mode Banner */}
      {isAnonymousMode && !isAuthenticated && (
        <div className="mb-6 p-4 bg-amber-50 dark:bg-amber-900/20 border border-amber-200 dark:border-amber-800 rounded-lg">
          <div className="flex items-start space-x-3">
            <div className="flex-shrink-0 text-2xl">🕶️</div>
            <div className="flex-1">
              <h3 className="text-sm font-semibold text-amber-900 dark:text-amber-200 mb-1">
                Editing Anonymously
              </h3>
              <p className="text-sm text-amber-700 dark:text-amber-300">
                Your edit will be submitted without attribution. You will not earn prestige for this contribution.
              </p>
              <button
                onClick={() => setIsAnonymousMode(false)}
                className="mt-2 text-sm text-amber-600 dark:text-amber-400 hover:text-amber-800 dark:hover:text-amber-200 underline"
              >
                Go back to sign in instead
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Filename input for new pages */}
      {isNewPage && (
        <div className="mb-6 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <label htmlFor="pageId" className="block text-sm font-medium text-gray-900 dark:text-white mb-2">
            Page Filename
          </label>
          <input
            id="pageId"
            type="text"
            value={newPageId}
            onChange={(e) => setNewPageId(e.target.value.toLowerCase().replace(/[^a-z0-9-]/g, '-'))}
            placeholder="my-new-page"
            className="w-full px-3 py-2 border border-gray-300 dark:border-gray-600 rounded-lg bg-white dark:bg-gray-800 text-gray-900 dark:text-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          />
          <p className="mt-2 text-sm text-gray-600 dark:text-gray-400">
            Enter a URL-friendly filename (lowercase letters, numbers, and hyphens only). Example: "getting-started" or "advanced-guide"
          </p>
        </div>
      )}

      {/* Saving Status Banner */}
      {savingStatus && (
        <div className="mb-4 p-4 bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg">
          <div className="flex items-center space-x-3">
            <div className="flex-shrink-0">
              <svg className="animate-spin h-5 w-5 text-blue-500" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            </div>
            <div className="flex-1">
              <p className="text-sm font-medium text-blue-900 dark:text-blue-200">
                {savingStatus}
              </p>
            </div>
          </div>
        </div>
      )}

      {/* Editor */}
      <PageEditor
        initialContent={content}
        initialMetadata={metadata}
        onSave={handleSave}
        onCancel={handleCancel}
        isSaving={isSaving}
        contentProcessor={getContentProcessor()}
        customComponents={getCustomComponents()}
        renderSpellPreview={getSpellPreview()}
        renderEquipmentPreview={getEquipmentPreview()}
      />
    </div>
  );
};

export default PageEditorPage;
