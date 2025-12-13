import React, { useState } from 'react';
import Button from '../common/Button';

/**
 * Build Encoder/Decoder
 * Encodes builds to URL parameters for sharing
 */

// Encode build object to URL-safe string
export const encodeBuild = (build) => {
  try {
    const buildString = JSON.stringify(build);
    return btoa(encodeURIComponent(buildString));
  } catch (error) {
    console.error('Error encoding build:', error);
    return null;
  }
};

// Decode URL parameter back to build object
export const decodeBuild = (encodedBuild) => {
  try {
    const buildString = decodeURIComponent(atob(encodedBuild));
    return JSON.parse(buildString);
  } catch (error) {
    console.error('Error decoding build:', error);
    return null;
  }
};

// Generate shareable URL
export const generateBuildURL = (build) => {
  const encoded = encodeBuild(build);
  if (!encoded) return null;

  const baseURL = window.location.origin + window.location.pathname;
  return `${baseURL}#/build?data=${encoded}`;
};

const BuildEncoder = ({ build, onCopy }) => {
  const [copied, setCopied] = useState(false);

  const handleCopyLink = () => {
    const url = generateBuildURL(build);
    if (url) {
      navigator.clipboard.writeText(url).then(() => {
        setCopied(true);
        setTimeout(() => setCopied(false), 2000);
        if (onCopy) onCopy(url);
      });
    }
  };

  return (
    <div className="bg-blue-50 dark:bg-blue-900/20 border border-blue-200 dark:border-blue-800 rounded-lg p-4">
      <h3 className="text-lg font-semibold text-blue-900 dark:text-blue-100 mb-2">
        Share This Build
      </h3>
      <p className="text-sm text-blue-700 dark:text-blue-300 mb-4">
        Copy the link below to share this build with others
      </p>
      <Button onClick={handleCopyLink} className="w-full">
        {copied ? '✓ Copied!' : 'Copy Build Link'}
      </Button>
    </div>
  );
};

export default BuildEncoder;
