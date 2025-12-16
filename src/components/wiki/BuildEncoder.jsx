import React, { useState } from 'react';
import Button from '../common/Button';

/**
 * Build Encoder/Decoder
 * Encodes builds to URL parameters for sharing
 */

/**
 * Compact encoding format to minimize URL length:
 * - Uses single-letter keys (n=name, m=maxSlots, s=slots)
 * - Only stores filled slots with position index
 * - Format: {n:"name",m:10,s:{0:[skillId,level],5:[skillId,level]}}
 *
 * Example:
 * Before: {"name":"My Build","maxSlots":10,"slots":[{"skillId":1,"level":1},null,null,null,null,{"skillId":5,"level":10},...]}
 * After:  {"n":"My Build","m":10,"s":{"0":[1,1],"5":[5,10]}}
 */

// Encode build object to URL-safe string
export const encodeBuild = (build) => {
  try {
    // Convert to compact format
    const compact = {
      n: build.name || build.buildName || '', // Handle both property names
      m: build.maxSlots || 10,
      s: {}
    };

    // Only include non-empty slots
    build.slots?.forEach((slot, index) => {
      if (slot && (slot.skillId || slot.skill)) {
        const skillId = slot.skillId || slot.skill?.id;
        const level = slot.level || 1;
        if (skillId) {
          compact.s[index] = [skillId, level];
        }
      }
    });

    const buildString = JSON.stringify(compact);
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
    const data = JSON.parse(buildString);

    // Handle both compact and legacy formats
    if (data.s && typeof data.s === 'object' && !Array.isArray(data.s)) {
      // New compact format: {n:"name",m:10,s:{"0":[1,1]}}
      const maxSlots = data.m || 10;
      const slots = Array(maxSlots).fill(null).map(() => ({ skillId: null, level: 1 }));

      // Fill in the non-empty slots
      Object.entries(data.s).forEach(([index, [skillId, level]]) => {
        slots[parseInt(index)] = { skillId, level };
      });

      return {
        name: data.n || 'My Build',
        maxSlots,
        slots
      };
    } else if (data.slots && Array.isArray(data.slots)) {
      // Legacy format support: {"name":"...","maxSlots":10,"slots":[...]}
      return {
        name: data.name || 'My Build',
        maxSlots: data.maxSlots || 10,
        slots: data.slots
      };
    } else {
      // Very old format or invalid
      return data;
    }
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
