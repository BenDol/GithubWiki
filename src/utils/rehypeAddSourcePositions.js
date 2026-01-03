/**
 * Rehype plugin to add source position data attributes to elements
 * Enables mapping between markdown source character positions and rendered HTML
 */

import { visit } from 'unist-util-visit';

export function rehypeAddSourcePositions() {
  return (tree) => {
    visit(tree, 'element', (node) => {
      // Skip if no position info (shouldn't happen with remark preserving positions)
      if (!node.position) return;

      const { start, end } = node.position;

      // Add data attributes for character offsets
      if (!node.properties) node.properties = {};

      // Store absolute character positions from file start
      // Use camelCase for React, will be converted to kebab-case in DOM
      node.properties.dataSourceStart = start.offset;
      node.properties.dataSourceEnd = end.offset;
    });

    // Also visit text nodes to ensure parent elements have position data
    visit(tree, 'text', (node, index, parent) => {
      if (!node.position) return;

      // For text nodes, ensure parent element has position data
      if (parent && parent.type === 'element') {
        if (!parent.properties) parent.properties = {};

        // Update parent's range to include all child text nodes
        const existingStart = parent.properties.dataSourceStart;
        const existingEnd = parent.properties.dataSourceEnd;

        if (!existingStart || node.position.start.offset < existingStart) {
          parent.properties.dataSourceStart = node.position.start.offset;
        }
        if (!existingEnd || node.position.end.offset > existingEnd) {
          parent.properties.dataSourceEnd = node.position.end.offset;
        }
      }
    });
  };
}
