/**
 * Image Upload Modal Component
 *
 * Multi-step modal for uploading user content images:
 * 1. Authentication check (anonymous users need email verification)
 * 2. File selection with drag-drop
 * 3. Metadata form (name, description, category, tags)
 * 4. Processing and upload with progress
 */

import { useState, useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { X, Upload, Image as ImageIcon, Loader, Check, AlertCircle } from 'lucide-react';
import { useAuthStore } from '../../store/authStore.js';
import { createLogger } from '../../utils/logger.js';
import {
  processImageClientSide,
  validateImageFile,
  isProcessingSupported
} from '../../services/images/imageProcessingService.js';
import { uploadImage } from '../../services/images/imageUploadService.js';
import EmailVerificationModal from '../anonymous/EmailVerificationModal.jsx';

const logger = createLogger('ImageUploadModal');

// Load config
let wikiConfig = null;
async function getConfig() {
  if (!wikiConfig) {
    const response = await fetch('/wiki-config.json');
    wikiConfig = await response.json();
  }
  return wikiConfig;
}

export default function ImageUploadModal({ isOpen, onClose, onSuccess }) {
  // Auth state
  const { user, getToken } = useAuthStore();
  const [userToken, setUserToken] = useState(null);

  // Step state
  const [step, setStep] = useState('init'); // init, verify, file, metadata, upload
  const [config, setConfig] = useState(null);

  // Verification state (for anonymous)
  const [userEmail, setUserEmail] = useState('');
  const [verificationToken, setVerificationToken] = useState('');
  const [showVerificationModal, setShowVerificationModal] = useState(false);

  // File state
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);
  const [processedImages, setProcessedImages] = useState(null);

  // Metadata state
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [category, setCategory] = useState('');
  const [tags, setTags] = useState([]);
  const [tagInput, setTagInput] = useState('');

  // Upload state
  const [uploadProgress, setUploadProgress] = useState(0);
  const [isProcessing, setIsProcessing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [error, setError] = useState(null);
  const [uploadResult, setUploadResult] = useState(null);

  // Refs
  const fileInputRef = useRef(null);

  // Load config and check auth on mount
  useEffect(() => {
    if (isOpen) {
      getConfig().then(cfg => {
        setConfig(cfg);
        // Check if authenticated
        const token = getToken();
        if (user && token) {
          setUserToken(token);
          setStep('file');
        } else {
          // Check if auth is required
          if (cfg?.features?.imageUploads?.requireAuthentication) {
            setError('Authentication required for image uploads');
            setStep('error');
          } else {
            setStep('verify');
          }
        }
      });
    }
  }, [isOpen, user, getToken]);

  // Reset state on close
  useEffect(() => {
    if (!isOpen) {
      setStep('init');
      setUserEmail('');
      setVerificationToken('');
      setShowVerificationModal(false);
      setSelectedFile(null);
      setPreviewUrl(null);
      setProcessedImages(null);
      setName('');
      setDescription('');
      setCategory('');
      setTags([]);
      setTagInput('');
      setUploadProgress(0);
      setIsProcessing(false);
      setIsUploading(false);
      setError(null);
      setUploadResult(null);
    }
  }, [isOpen]);

  // Clean up preview URL
  useEffect(() => {
    return () => {
      if (previewUrl) {
        URL.revokeObjectURL(previewUrl);
      }
    };
  }, [previewUrl]);

  // Handle email verification
  const handleEmailSubmit = async (email) => {
    setUserEmail(email);
    setShowVerificationModal(true);
    // Email sending is handled by EmailVerificationModal
  };

  const handleVerificationComplete = (token) => {
    setVerificationToken(token);
    setShowVerificationModal(false);
    setStep('file');
  };

  // Handle file selection
  const handleFileSelect = async (file) => {
    try {
      setError(null);

      // Validate file
      const validation = validateImageFile(file, config);
      if (!validation.valid) {
        setError(validation.error);
        return;
      }

      // Set file and preview
      setSelectedFile(file);
      const preview = URL.createObjectURL(file);
      setPreviewUrl(preview);

      // Auto-fill name from filename
      if (!name) {
        const baseName = file.name.replace(/\.[^/.]+$/, '');
        setName(baseName);
      }

      // Process image
      setIsProcessing(true);
      logger.debug('Processing image', { filename: file.name, size: file.size });

      const processed = await processImageClientSide(file, config);
      setProcessedImages(processed);

      logger.info('Image processed successfully', {
        dimensions: processed.dimensions,
        originalSize: processed.original.blob.size,
        webpSize: processed.webp.blob.size
      });

      setIsProcessing(false);
      setStep('metadata');
    } catch (error) {
      logger.error('Image processing failed', { error: error.message });
      setError(`Processing failed: ${error.message}`);
      setIsProcessing(false);
    }
  };

  const handleDrop = (e) => {
    e.preventDefault();
    const file = e.dataTransfer.files[0];
    if (file) {
      handleFileSelect(file);
    }
  };

  const handleDragOver = (e) => {
    e.preventDefault();
  };

  // Handle tag input
  const handleTagKeyDown = (e) => {
    if (e.key === 'Enter' || e.key === ',') {
      e.preventDefault();
      addTag();
    }
  };

  const addTag = () => {
    const trimmedTag = tagInput.trim();
    if (trimmedTag && !tags.includes(trimmedTag) && tags.length < 10) {
      setTags([...tags, trimmedTag]);
      setTagInput('');
    }
  };

  const removeTag = (tagToRemove) => {
    setTags(tags.filter(t => t !== tagToRemove));
  };

  // Handle upload
  const handleUpload = async () => {
    try {
      setError(null);
      setIsUploading(true);
      setStep('upload');

      logger.info('Starting upload', { name, category, authenticated: !!userToken });

      const result = await uploadImage({
        originalBlob: processedImages.original.blob,
        originalFilename: selectedFile.name,
        webpBlob: processedImages.webp.blob,
        dimensions: processedImages.dimensions,
        name,
        description,
        category,
        tags,
        userEmail: userEmail || undefined,
        verificationToken: verificationToken || undefined,
        userToken: userToken || undefined,
        onProgress: setUploadProgress
      });

      setUploadResult(result);
      logger.info('Upload successful', { imageId: result.imageId });

      // Wait a moment to show success state
      setTimeout(() => {
        // Include form data in result since API doesn't return name/category
        onSuccess({
          ...result,
          name,
          category,
          description,
          tags
        });
        onClose();
      }, 1500);
    } catch (error) {
      logger.error('Upload failed', { error: error.message });
      setError(error.message);
      setIsUploading(false);
    }
  };

  // Render step content
  const renderStepContent = () => {
    switch (step) {
      case 'init':
        return (
          <div className="flex items-center justify-center h-64">
            <Loader className="w-8 h-8 animate-spin text-blue-600" />
          </div>
        );

      case 'verify':
        return (
          <div className="p-6">
            <h3 className="text-xl font-semibold mb-4">Email Verification Required</h3>
            <p className="text-gray-600 dark:text-gray-400 mb-6">
              To upload images anonymously, please verify your email address.
            </p>
            <input
              type="email"
              value={userEmail}
              onChange={(e) => setUserEmail(e.target.value)}
              placeholder="Enter your email"
              className="w-full px-4 py-2 border rounded-lg mb-4 dark:bg-gray-800 dark:border-gray-600"
            />
            <button
              onClick={() => handleEmailSubmit(userEmail)}
              disabled={!userEmail || !/\S+@\S+\.\S+/.test(userEmail)}
              className="w-full px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
            >
              Send Verification Code
            </button>
          </div>
        );

      case 'file':
        return (
          <div className="p-6">
            <h3 className="text-xl font-semibold mb-4">Select Image</h3>

            {!selectedFile ? (
              <div
                onDrop={handleDrop}
                onDragOver={handleDragOver}
                onClick={() => fileInputRef.current?.click()}
                className="border-2 border-dashed border-gray-300 dark:border-gray-600 rounded-lg p-12 text-center cursor-pointer hover:border-blue-500 transition-colors"
              >
                <ImageIcon className="w-16 h-16 mx-auto mb-4 text-gray-400" />
                <p className="text-lg font-medium mb-2">Drop image here or click to browse</p>
                <p className="text-sm text-gray-500">
                  Max {config?.features?.imageUploads?.maxFileSizeMB || 10}MB •{' '}
                  {(config?.features?.imageUploads?.allowedFormats || ['jpg', 'png', 'webp', 'gif']).join(', ')}
                </p>
              </div>
            ) : (
              <div className="space-y-4">
                <div className="relative">
                  <img
                    src={previewUrl}
                    alt="Preview"
                    className="w-full h-64 object-contain bg-gray-100 dark:bg-gray-800 rounded-lg"
                  />
                  {isProcessing && (
                    <div className="absolute inset-0 bg-black bg-opacity-50 flex items-center justify-center rounded-lg">
                      <Loader className="w-8 h-8 animate-spin text-white" />
                    </div>
                  )}
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-sm text-gray-600 dark:text-gray-400">
                    {selectedFile.name} ({(selectedFile.size / 1024 / 1024).toFixed(2)} MB)
                  </span>
                  <button
                    onClick={() => {
                      setSelectedFile(null);
                      setPreviewUrl(null);
                      setProcessedImages(null);
                    }}
                    className="text-sm text-red-600 hover:text-red-700"
                  >
                    Remove
                  </button>
                </div>
              </div>
            )}

            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={(e) => e.target.files[0] && handleFileSelect(e.target.files[0])}
              className="hidden"
            />
          </div>
        );

      case 'metadata':
        return (
          <div className="p-6 space-y-4">
            <h3 className="text-xl font-semibold mb-4">Image Details</h3>

            {/* Preview thumbnail */}
            {previewUrl && (
              <div className="flex items-center gap-4 p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                <img src={previewUrl} alt="Preview" className="w-16 h-16 object-cover rounded" />
                <div className="flex-1 text-sm">
                  <div className="font-medium">{selectedFile.name}</div>
                  <div className="text-gray-500">
                    {processedImages?.dimensions.width} × {processedImages?.dimensions.height}
                  </div>
                </div>
              </div>
            )}

            {/* Name */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Image Name <span className="text-red-500">*</span>
              </label>
              <input
                type="text"
                value={name}
                onChange={(e) => setName(e.target.value)}
                maxLength={100}
                placeholder="Enter a descriptive name"
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">{name.length}/100 characters</p>
            </div>

            {/* Category */}
            <div>
              <label className="block text-sm font-medium mb-2">
                Category <span className="text-red-500">*</span>
              </label>
              <select
                value={category}
                onChange={(e) => setCategory(e.target.value)}
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
              >
                <option value="">Select a category</option>
                {(config?.features?.imageUploads?.categories || []).map(cat => (
                  <option key={cat} value={cat}>{cat}</option>
                ))}
              </select>
            </div>

            {/* Description */}
            <div>
              <label className="block text-sm font-medium mb-2">Description (optional)</label>
              <textarea
                value={description}
                onChange={(e) => setDescription(e.target.value)}
                maxLength={500}
                rows={3}
                placeholder="Add a description..."
                className="w-full px-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
              />
              <p className="text-xs text-gray-500 mt-1">{description.length}/500 characters</p>
            </div>

            {/* Tags */}
            <div>
              <label className="block text-sm font-medium mb-2">Tags (optional)</label>
              <div className="flex flex-wrap gap-2 mb-2">
                {tags.map(tag => (
                  <span
                    key={tag}
                    className="inline-flex items-center gap-1 px-2 py-1 bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 rounded text-sm"
                  >
                    {tag}
                    <button onClick={() => removeTag(tag)} className="hover:text-red-600">
                      <X className="w-3 h-3" />
                    </button>
                  </span>
                ))}
              </div>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={tagInput}
                  onChange={(e) => setTagInput(e.target.value)}
                  onKeyDown={handleTagKeyDown}
                  maxLength={20}
                  placeholder="Add tags (press Enter)"
                  disabled={tags.length >= 10}
                  className="flex-1 px-4 py-2 border rounded-lg dark:bg-gray-800 dark:border-gray-600"
                />
                <button
                  onClick={addTag}
                  disabled={!tagInput.trim() || tags.length >= 10}
                  className="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50"
                >
                  Add
                </button>
              </div>
              <p className="text-xs text-gray-500 mt-1">{tags.length}/10 tags</p>
            </div>

            {/* Actions */}
            <div className="flex gap-3 pt-4">
              <button
                onClick={() => setStep('file')}
                className="px-4 py-2 border rounded-lg hover:bg-gray-50 dark:hover:bg-gray-800"
              >
                Back
              </button>
              <button
                onClick={handleUpload}
                disabled={!name || !category || isProcessing}
                className="flex-1 px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Upload Image
              </button>
            </div>
          </div>
        );

      case 'upload':
        return (
          <div className="p-6">
            <div className="text-center">
              {!uploadResult ? (
                <>
                  <Loader className="w-16 h-16 mx-auto mb-4 animate-spin text-blue-600" />
                  <h3 className="text-xl font-semibold mb-2">Uploading Image...</h3>
                  <div className="w-full bg-gray-200 dark:bg-gray-700 rounded-full h-2 mb-4">
                    <div
                      className="bg-blue-600 h-2 rounded-full transition-all duration-300"
                      style={{ width: `${uploadProgress}%` }}
                    />
                  </div>
                  <p className="text-gray-600 dark:text-gray-400">{uploadProgress}%</p>
                </>
              ) : (
                <>
                  <div className="w-16 h-16 mx-auto mb-4 bg-green-100 dark:bg-green-900 rounded-full flex items-center justify-center">
                    <Check className="w-8 h-8 text-green-600 dark:text-green-400" />
                  </div>
                  <h3 className="text-xl font-semibold mb-2">Upload Complete!</h3>
                  <p className="text-gray-600 dark:text-gray-400 mb-4">
                    Your image has been uploaded successfully.
                  </p>
                  <div className="text-sm text-left bg-gray-50 dark:bg-gray-800 rounded-lg p-4">
                    <div className="font-medium mb-2">Image Details:</div>
                    <div className="space-y-1 text-gray-600 dark:text-gray-400">
                      <div>ID: {uploadResult.imageId}</div>
                      <div>Dimensions: {uploadResult.dimensions.width} × {uploadResult.dimensions.height}</div>
                    </div>
                  </div>
                </>
              )}
            </div>
          </div>
        );

      case 'error':
        return (
          <div className="p-6 text-center">
            <AlertCircle className="w-16 h-16 mx-auto mb-4 text-red-600" />
            <h3 className="text-xl font-semibold mb-2">Error</h3>
            <p className="text-gray-600 dark:text-gray-400">{error}</p>
          </div>
        );

      default:
        return null;
    }
  };

  if (!isOpen) return null;

  const modal = (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black bg-opacity-50">
      <div className="relative w-full max-w-2xl bg-white dark:bg-gray-900 rounded-lg shadow-xl max-h-[90vh] overflow-y-auto">
        {/* Header */}
        <div className="sticky top-0 bg-white dark:bg-gray-900 border-b dark:border-gray-800 px-6 py-4 flex items-center justify-between z-10">
          <h2 className="text-2xl font-bold flex items-center gap-2">
            <Upload className="w-6 h-6" />
            Upload Image
          </h2>
          <button
            onClick={onClose}
            disabled={isUploading}
            className="p-2 hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full disabled:opacity-50"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content */}
        <div className="min-h-[300px]">
          {error && step !== 'error' && (
            <div className="mx-6 mt-4 p-3 bg-red-50 dark:bg-red-900/20 border border-red-200 dark:border-red-800 rounded-lg flex items-start gap-2">
              <AlertCircle className="w-5 h-5 text-red-600 dark:text-red-400 flex-shrink-0 mt-0.5" />
              <p className="text-sm text-red-800 dark:text-red-200">{error}</p>
            </div>
          )}
          {renderStepContent()}
        </div>

        {/* Progress indicator */}
        {step !== 'init' && step !== 'error' && step !== 'upload' && (
          <div className="border-t dark:border-gray-800 px-6 py-3 bg-gray-50 dark:bg-gray-800/50">
            <div className="flex items-center justify-center gap-2 text-sm text-gray-600 dark:text-gray-400">
              <div className={`w-2 h-2 rounded-full ${step === 'verify' || step === 'file' ? 'bg-blue-600' : 'bg-gray-300'}`} />
              <div className={`w-2 h-2 rounded-full ${step === 'metadata' ? 'bg-blue-600' : 'bg-gray-300'}`} />
              <div className={`w-2 h-2 rounded-full ${step === 'upload' ? 'bg-blue-600' : 'bg-gray-300'}`} />
            </div>
          </div>
        )}
      </div>

      {/* Email Verification Modal */}
      {showVerificationModal && (
        <EmailVerificationModal
          isOpen={showVerificationModal}
          onClose={() => setShowVerificationModal(false)}
          onVerified={handleVerificationComplete}
          email={userEmail}
        />
      )}
    </div>
  );

  return createPortal(modal, document.body);
}
