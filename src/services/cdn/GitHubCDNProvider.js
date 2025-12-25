/**
 * GitHubCDNProvider - GitHub repository implementation for CDN
 * Uses a separate GitHub repository to store video files
 * Serves files via jsDelivr CDN for better performance
 */

import CDNProvider from './CDNProvider';
import { createLogger } from '../../utils/logger';
import {
  generateVideoId,
  getFileExtension,
  validateVideoFormat,
  validateVideoSize,
  validateFileContent,
  generateVideoPath,
  generateThumbnailPath,
  generateMetadataPath,
  createVideoMetadata,
  encodeToBase64,
  calculateSHA256,
  generateLFSPointer,
  createLFSBatchRequest,
  parseLFSBatchResponse,
  shouldUseLFS,
} from '../../utils/videoUtils';
import { Octokit } from '@octokit/rest';

const logger = createLogger('GitHubCDNProvider');

const MAX_FILE_SIZE_MB = 100; // GitHub API limit
const MAX_FILE_SIZE_BYTES = MAX_FILE_SIZE_MB * 1024 * 1024;
const DEFAULT_ALLOWED_FORMATS = ['mp4', 'webm', 'mov', 'avi'];

class GitHubCDNProvider extends CDNProvider {
  constructor(config) {
    super(config);

    // Validate required config
    if (!config?.github?.owner) {
      throw new Error('GitHub CDN config missing: owner');
    }
    if (!config?.github?.repo) {
      throw new Error('GitHub CDN config missing: repo');
    }

    this.owner = config.github.owner;
    this.repo = config.github.repo;
    this.servingMode = config.github.servingMode || 'jsdelivr'; // 'jsdelivr' or 'raw'
    this.maxFileSizeMB = config.github.maxFileSizeMB || MAX_FILE_SIZE_MB;
    this.allowedFormats = config.github.allowedFormats || DEFAULT_ALLOWED_FORMATS;
    this.lfsConfig = config.github.lfs || { enabled: false };

    logger.info('GitHubCDNProvider initialized', {
      owner: this.owner,
      repo: this.repo,
      servingMode: this.servingMode,
      maxFileSizeMB: this.maxFileSizeMB,
      lfsEnabled: this.lfsConfig.enabled,
      lfsDefault: this.lfsConfig.useByDefault,
    });
  }

  /**
   * Create Octokit instance with authentication
   * @private
   */
  _createOctokit(token) {
    return new Octokit({
      auth: token,
      userAgent: 'github-wiki-framework',
    });
  }

  /**
   * Get the default branch of the CDN repository
   * @private
   */
  async _getDefaultBranch(octokit) {
    try {
      const { data: repo } = await octokit.rest.repos.get({
        owner: this.owner,
        repo: this.repo,
      });
      return repo.default_branch || 'main';
    } catch (error) {
      logger.error('Failed to get default branch', { error: error.message });
      return 'main'; // Fallback
    }
  }

  /**
   * Get the latest commit SHA for a branch
   * @private
   */
  async _getLatestCommitSha(octokit, branch) {
    const { data: ref } = await octokit.rest.git.getRef({
      owner: this.owner,
      repo: this.repo,
      ref: `heads/${branch}`,
    });
    return ref.object.sha;
  }

  /**
   * Create a new branch from base branch
   * @private
   */
  async _createBranch(octokit, branchName, baseSha) {
    try {
      await octokit.rest.git.createRef({
        owner: this.owner,
        repo: this.repo,
        ref: `refs/heads/${branchName}`,
        sha: baseSha,
      });
      logger.debug('Branch created', { branch: branchName });
      return true;
    } catch (error) {
      if (error.status === 422) {
        logger.warn('Branch already exists', { branch: branchName });
        return true; // Branch exists, that's okay
      }
      throw error;
    }
  }

  /**
   * Commit a file to a branch
   * @private
   */
  async _commitFile(octokit, branch, path, content, message) {
    try {
      // Check if file exists
      let sha = null;
      try {
        const { data: existingFile } = await octokit.rest.repos.getContent({
          owner: this.owner,
          repo: this.repo,
          path,
          ref: branch,
        });
        sha = existingFile.sha;
      } catch (error) {
        // File doesn't exist, that's okay
        if (error.status !== 404) {
          throw error;
        }
      }

      // Create or update file
      const { data } = await octokit.rest.repos.createOrUpdateFileContents({
        owner: this.owner,
        repo: this.repo,
        path,
        message,
        content: encodeToBase64(content),
        branch,
        sha, // Include SHA if updating existing file
      });

      logger.debug('File committed', { path, branch, sha: data.commit.sha });
      return data.commit.sha;
    } catch (error) {
      logger.error('Failed to commit file', { path, branch, error: error.message });
      throw error;
    }
  }

  /**
   * Create a pull request
   * @private
   */
  async _createPullRequest(octokit, title, body, head, base) {
    try {
      const { data: pr } = await octokit.rest.pulls.create({
        owner: this.owner,
        repo: this.repo,
        title,
        body,
        head,
        base,
      });

      logger.info('Pull request created', {
        prNumber: pr.number,
        prUrl: pr.html_url,
        head,
        base,
      });

      return {
        number: pr.number,
        url: pr.html_url,
        branch: head,
      };
    } catch (error) {
      logger.error('Failed to create pull request', {
        error: error.message,
        head,
        base,
      });
      throw error;
    }
  }

  /**
   * Add labels to a pull request
   * @private
   */
  async _addLabels(octokit, prNumber, labels) {
    try {
      await octokit.rest.issues.addLabels({
        owner: this.owner,
        repo: this.repo,
        issue_number: prNumber,
        labels,
      });
      logger.debug('Labels added to PR', { prNumber, labels });
    } catch (error) {
      logger.warn('Failed to add labels to PR', {
        prNumber,
        labels,
        error: error.message,
      });
      // Non-fatal error, continue
    }
  }

  /**
   * Upload binary content to LFS server
   * @private
   */
  async _uploadToLFS(uploadUrl, headers, content) {
    try {
      const response = await fetch(uploadUrl, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/octet-stream',
          ...headers,
        },
        body: content,
      });

      if (!response.ok) {
        throw new Error(`LFS upload failed: ${response.status} ${response.statusText}`);
      }

      logger.debug('LFS upload successful', { url: uploadUrl });
      return true;
    } catch (error) {
      logger.error('LFS upload failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Request LFS upload URL from GitHub
   * @private
   */
  async _requestLFSUpload(octokit, oid, size) {
    try {
      const batchRequest = createLFSBatchRequest(oid, size, 'upload');

      // GitHub LFS batch API endpoint
      const lfsEndpoint = `https://github.com/${this.owner}/${this.repo}.git/info/lfs/objects/batch`;

      logger.debug('Requesting LFS upload URL', { oid, size });

      const response = await fetch(lfsEndpoint, {
        method: 'POST',
        headers: {
          'Accept': 'application/vnd.git-lfs+json',
          'Content-Type': 'application/vnd.git-lfs+json',
          'Authorization': `Bearer ${octokit.auth}`,
        },
        body: JSON.stringify(batchRequest),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`LFS batch request failed: ${response.status} ${errorText}`);
      }

      const batchResponse = await response.json();
      return parseLFSBatchResponse(batchResponse);
    } catch (error) {
      logger.error('LFS batch request failed', { error: error.message });
      throw error;
    }
  }

  /**
   * Commit LFS pointer file to repository
   * @private
   */
  async _commitLFSPointer(octokit, branch, path, oid, size, message) {
    try {
      const pointerContent = generateLFSPointer(oid, size);

      logger.debug('Committing LFS pointer', { path, oid, size });

      await this._commitFile(octokit, branch, path, pointerContent, message);

      return true;
    } catch (error) {
      logger.error('Failed to commit LFS pointer', { path, error: error.message });
      throw error;
    }
  }

  /**
   * Upload a video file to the CDN
   * Creates a PR with video file, thumbnail, and metadata
   * Automatically uses LFS if configured and file meets criteria
   */
  async uploadVideo(file, metadata, thumbnail, auth) {
    const videoId = generateVideoId();

    logger.info('Starting video upload', {
      videoId,
      filename: file.filename,
      size: file.size,
      uploadedBy: metadata.uploadedBy,
    });

    // Validate file
    const validation = this.validateFile(file);
    if (!validation.valid) {
      throw new Error(validation.error);
    }

    // Get token (user token or bot token)
    const token = auth.token || auth.botToken;
    if (!token) {
      throw new Error('No authentication token provided');
    }

    const octokit = this._createOctokit(token);

    try {
      // Get default branch and latest commit
      const defaultBranch = await this._getDefaultBranch(octokit);
      const baseSha = await this._getLatestCommitSha(octokit, defaultBranch);

      // Create branch
      const branchName = `video-upload/${videoId}-${Date.now()}`;
      await this._createBranch(octokit, branchName, baseSha);

      // Generate file paths
      const videoExtension = getFileExtension(file.filename, file.mimeType);
      const videoPath = generateVideoPath(videoId, videoExtension);
      const metadataPath = generateMetadataPath(videoId);

      // Check if this is a client-side LFS upload (file already uploaded)
      if (file.lfsOid && file.lfsSize) {
        logger.info('Using client-side LFS upload (already uploaded)', {
          videoId,
          oid: file.lfsOid,
          size: file.lfsSize,
        });

        // File already uploaded to LFS by client - just commit the pointer
        await this._commitLFSPointer(
          octokit,
          branchName,
          videoPath,
          file.lfsOid,
          file.lfsSize,
          `Add video (LFS): ${videoId}`
        );
      } else {
        // Server-side upload - check if we should use LFS
        const useLFS = shouldUseLFS(file.size, this.lfsConfig);

        if (useLFS) {
          logger.info('Using server-side LFS for video upload', { videoId, size: file.size });

          // Calculate SHA256 (LFS OID)
          const oid = await calculateSHA256(file.content);

          // Request LFS upload URL
          const lfsInfo = await this._requestLFSUpload(octokit, oid, file.size);

          // Upload to LFS server
          await this._uploadToLFS(lfsInfo.uploadUrl, lfsInfo.uploadHeaders, file.content);

          // Commit LFS pointer file
          await this._commitLFSPointer(
            octokit,
            branchName,
            videoPath,
            oid,
            file.size,
            `Add video (LFS): ${videoId}`
          );
        } else {
          logger.debug('Using regular commit for video file', { path: videoPath });

          // Commit video file directly (regular method)
          await this._commitFile(
            octokit,
            branchName,
            videoPath,
            file.content,
            `Add video: ${videoId}`
          );
        }
      }

      // Commit thumbnail if provided
      let thumbnailPath = null;
      if (thumbnail && thumbnail.content) {
        const thumbnailExtension = getFileExtension(thumbnail.filename, thumbnail.mimeType);
        thumbnailPath = generateThumbnailPath(videoId, thumbnailExtension);

        logger.debug('Committing thumbnail', { path: thumbnailPath });
        await this._commitFile(
          octokit,
          branchName,
          thumbnailPath,
          thumbnail.content,
          `Add thumbnail for: ${videoId}`
        );
      }

      // Create and commit metadata
      const metadataJson = createVideoMetadata(videoId, file, metadata);
      logger.debug('Committing metadata', { path: metadataPath });
      await this._commitFile(
        octokit,
        branchName,
        metadataPath,
        metadataJson,
        `Add metadata for: ${videoId}`
      );

      // Create pull request
      const prTitle = `[Video Upload] ${metadata.title}`;
      const prBody = this._generatePRBody(videoId, metadata, file, thumbnailPath);

      const prInfo = await this._createPullRequest(
        octokit,
        prTitle,
        prBody,
        branchName,
        defaultBranch
      );

      // Add labels
      const labels = ['video-upload'];
      if (metadata.uploadedBy === 'anonymous') {
        labels.push('anonymous');
      }
      await this._addLabels(octokit, prInfo.number, labels);

      // Generate public URLs (using branch ref since not merged yet)
      const videoUrl = this.getVideoUrl(videoId, branchName, videoExtension);
      const thumbnailUrl = thumbnailPath
        ? this.getThumbnailUrl(videoId, branchName, thumbnailPath.split('.').pop())
        : null;

      logger.info('Video upload completed', {
        videoId,
        prNumber: prInfo.number,
        prUrl: prInfo.url,
      });

      return {
        videoId,
        videoUrl,
        thumbnailUrl,
        prInfo,
      };
    } catch (error) {
      logger.error('Video upload failed', {
        videoId,
        error: error.message,
        stack: error.stack,
      });
      throw new Error(`Failed to upload video: ${error.message}`);
    }
  }

  /**
   * Generate PR body for video upload
   * @private
   */
  _generatePRBody(videoId, metadata, file, thumbnailPath) {
    const fileSizeMB = (file.size / 1024 / 1024).toFixed(2);
    const useLFS = shouldUseLFS(file.size, this.lfsConfig);

    const lines = [
      '## Video Upload',
      '',
      `**Video ID:** \`${videoId}\``,
      `**Title:** ${metadata.title}`,
      `**Description:** ${metadata.description || 'N/A'}`,
      `**Uploaded by:** @${metadata.uploadedBy}`,
      `**File:** ${file.filename} (${fileSizeMB} MB)`,
      useLFS ? `**Storage:** Git LFS` : `**Storage:** Regular commit`,
      '',
      '### Review Checklist',
      '- [ ] Video plays correctly',
      thumbnailPath ? '- [ ] Thumbnail displays correctly' : '',
      `- [ ] File size ≤ ${this.maxFileSizeMB}MB`,
      '- [ ] Content appropriate (no spam, NSFW, etc.)',
      '- [ ] Metadata file present',
      useLFS ? '- [ ] LFS pointer file committed correctly' : '',
      '',
      '---',
      '**Instructions for reviewers:** Review the video content, then merge this PR. After merging, approve the related content PR.',
      '',
      '_This PR was created automatically by the video upload system._',
    ];

    return lines.filter(line => line !== '').join('\n');
  }

  /**
   * Delete a video from the CDN
   * Creates a PR to remove video files
   */
  async deleteVideo(videoId, auth) {
    logger.info('Starting video deletion', { videoId });

    const token = auth.token || auth.botToken;
    if (!token) {
      throw new Error('No authentication token provided');
    }

    const octokit = this._createOctokit(token);

    try {
      // Get default branch
      const defaultBranch = await this._getDefaultBranch(octokit);
      const baseSha = await this._getLatestCommitSha(octokit, defaultBranch);

      // Create branch
      const branchName = `video-delete/${videoId}-${Date.now()}`;
      await this._createBranch(octokit, branchName, baseSha);

      // Note: GitHub API doesn't have a direct "delete file" in PR context
      // We would need to find all files related to videoId and delete them
      // This is a more complex operation that requires additional logic

      // For now, return a placeholder
      // TODO: Implement file deletion logic

      throw new Error('Video deletion not yet implemented');
    } catch (error) {
      logger.error('Video deletion failed', {
        videoId,
        error: error.message,
      });
      throw error;
    }
  }

  /**
   * Get the public URL for a video
   * Returns jsDelivr or raw GitHub URL based on config
   */
  getVideoUrl(videoId, ref = 'main', extension = 'mp4') {
    const path = generateVideoPath(videoId, extension);

    if (this.servingMode === 'jsdelivr') {
      // jsDelivr CDN format: https://cdn.jsdelivr.net/gh/{owner}/{repo}@{ref}/{path}
      return `https://cdn.jsdelivr.net/gh/${this.owner}/${this.repo}@${ref}/${path}`;
    }

    // GitHub raw format: https://raw.githubusercontent.com/{owner}/{repo}/{ref}/{path}
    return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${ref}/${path}`;
  }

  /**
   * Get the public URL for a video thumbnail
   */
  getThumbnailUrl(videoId, ref = 'main', extension = 'jpg') {
    const path = generateThumbnailPath(videoId, extension);

    if (this.servingMode === 'jsdelivr') {
      return `https://cdn.jsdelivr.net/gh/${this.owner}/${this.repo}@${ref}/${path}`;
    }

    return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${ref}/${path}`;
  }

  /**
   * Get the public URL for video metadata
   */
  getMetadataUrl(videoId, ref = 'main') {
    const path = generateMetadataPath(videoId);

    if (this.servingMode === 'jsdelivr') {
      return `https://cdn.jsdelivr.net/gh/${this.owner}/${this.repo}@${ref}/${path}`;
    }

    return `https://raw.githubusercontent.com/${this.owner}/${this.repo}/${ref}/${path}`;
  }

  /**
   * Validate a video file
   */
  validateFile(file) {
    // Validate size
    const sizeValidation = validateVideoSize(file.size, this.getMaxFileSize());
    if (!sizeValidation.valid) {
      return sizeValidation;
    }

    // Validate format
    const formatValidation = validateVideoFormat(
      file.filename,
      file.mimeType,
      this.allowedFormats
    );
    if (!formatValidation.valid) {
      return formatValidation;
    }

    // Validate content (magic bytes) if we have buffer
    if (Buffer.isBuffer(file.content)) {
      const extension = getFileExtension(file.filename, file.mimeType);
      const contentValidation = validateFileContent(
        file.content.slice(0, 12),
        file.mimeType,
        extension
      );
      if (!contentValidation.valid) {
        return contentValidation;
      }
      if (contentValidation.warning) {
        logger.warn('File validation warning', {
          warning: contentValidation.warning,
          filename: file.filename,
        });
      }
    }

    return { valid: true };
  }

  /**
   * Get maximum file size in bytes
   */
  getMaxFileSize() {
    return this.maxFileSizeMB * 1024 * 1024;
  }

  /**
   * Get allowed file formats
   */
  getAllowedFormats() {
    return this.allowedFormats;
  }

  /**
   * Get provider name
   */
  getProviderName() {
    return 'github';
  }
}

export default GitHubCDNProvider;
