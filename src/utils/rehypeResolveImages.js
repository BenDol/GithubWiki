/**
 * Rehype plugin to resolve image paths using the imageResolver
 * Transforms img src attributes to use CDN URLs when configured
 */

import { visit } from 'unist-util-visit';
import { resolveImagePath } from './imageResolver.js';

export function rehypeResolveImages() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      if (node.tagName === 'img' && node.properties && node.properties.src) {
        const originalSrc = node.properties.src;

        // Only resolve if it's not already a full URL
        if (!originalSrc.startsWith('http://') && !originalSrc.startsWith('https://')) {
          node.properties.src = resolveImagePath(originalSrc);
        }
      }
    });
  };
}
