/**
 * Data Autocomplete Search (Framework)
 *
 * Provides fuzzy search across data registry sources for autocomplete suggestions
 */

import dataRegistry from './dataRegistry';
import { createLogger } from './logger';

const logger = createLogger('DataAutocompleteSearch');

/**
 * Fuzzy match score - returns 0-100 based on how well query matches text
 * @param {string} query - Search query
 * @param {string|number|any} text - Text to search in (will be converted to string)
 * @returns {number} Match score 0-100
 */
const fuzzyMatchScore = (query, text) => {
  if (!query || text == null) return 0;

  // Convert to strings and handle non-string types
  const q = String(query).toLowerCase();
  const t = String(text).toLowerCase();

  // Exact match - highest score
  if (t === q) return 100;

  // Starts with query - very high score
  if (t.startsWith(q)) return 90;

  // Contains query - high score
  if (t.includes(q)) return 70;

  // Fuzzy character matching
  let score = 0;
  let qIndex = 0;
  let lastMatchIndex = -1;

  for (let i = 0; i < t.length && qIndex < q.length; i++) {
    if (t[i] === q[qIndex]) {
      score += 10;
      // Bonus for consecutive matches
      if (lastMatchIndex === i - 1) {
        score += 5;
      }
      lastMatchIndex = i;
      qIndex++;
    }
  }

  // Must match all characters
  if (qIndex !== q.length) return 0;

  // Bonus for shorter strings (better match)
  const lengthRatio = q.length / t.length;
  score += lengthRatio * 20;

  return Math.min(score, 100);
};

/**
 * Search across all data sources for autocomplete suggestions
 * Enhanced scoring: when primary field matches, boost ALL fields from that item
 * Now includes dataset-level suggestions for hierarchical navigation
 * @param {string} query - Search query from user input
 * @param {number} limit - Maximum results to return
 * @returns {Promise<Array>} Array of suggestion objects
 */
export const searchDataForAutocomplete = async (query, limit = 20) => {
  const suggestions = [];
  const sources = dataRegistry.getSources();

  // Add dataset-level suggestions (filtered by query relevance)
  const datasetSuggestions = getDatasetSuggestions(query, sources);
  suggestions.push(...datasetSuggestions);

  // Track items with primary matches for boosting their fields
  const primaryMatchItems = new Set();

  // Search each data source
  for (const [sourceKey, sourceConfig] of Object.entries(sources)) {
    try {
      // Load data for this source
      const items = await dataRegistry.fetchData(sourceKey);

      if (!Array.isArray(items)) continue;

      // Search through items
      for (const item of items) {
        const displayInfo = dataRegistry.getDisplayInfo(sourceKey, item);
        const itemKey = `${sourceKey}:${displayInfo.id}`;

        // Score matches for primary field
        const primaryScore = fuzzyMatchScore(query, displayInfo.primary);

        // If primary matches, add full object suggestion AND mark item for field boosting
        if (primaryScore > 0) {
          primaryMatchItems.add(itemKey);

          suggestions.push({
            type: 'full-object',
            sourceKey,
            sourceLabel: sourceConfig.label,
            icon: sourceConfig.icon || '📊',
            itemId: displayInfo.id,
            primaryDisplay: displayInfo.primary,
            fieldPath: null,
            previewValue: displayInfo.secondary.map(s => `${s.field}: ${s.value}`).join(', ').substring(0, 100),
            insertSyntax: `{{data:${sourceKey}:${displayInfo.id}}}`,
            matchScore: primaryScore,
            hasPrimaryMatch: true,
            canDrillIn: true, // UNIFIED FLAG - can drill into fields
            sortKey: `0_${100 - primaryScore}_${sourceConfig.label}_${displayInfo.primary}`
          });
        }

        // Score matches for secondary fields
        displayInfo.secondary.forEach(sec => {
          const fieldScore = fuzzyMatchScore(query, sec.field);
          const valueScore = fuzzyMatchScore(query, String(sec.value));
          const maxScore = Math.max(fieldScore, valueScore);

          // Show field if:
          // 1. It matches the query (maxScore > 0), OR
          // 2. Its parent item had a primary match (show all fields from matched items)
          const hasPrimaryMatch = primaryMatchItems.has(itemKey);
          const shouldShow = maxScore > 0 || hasPrimaryMatch;

          if (shouldShow) {
            // Boost score if parent item matched
            const boostedScore = hasPrimaryMatch ? Math.max(maxScore, 85) : maxScore;

            // Priority sorting:
            // - Tier 0: Full objects with primary match
            // - Tier 1: Fields from items with primary match (boosted)
            // - Tier 2: Fields that directly match the query
            const tier = hasPrimaryMatch ? '1' : '2';

            suggestions.push({
              type: 'field',
              sourceKey,
              sourceLabel: sourceConfig.label,
              icon: sourceConfig.icon || '📊',
              itemId: displayInfo.id,
              primaryDisplay: displayInfo.primary,
              fieldPath: sec.field,
              previewValue: String(sec.value).substring(0, 100),
              insertSyntax: `{{data:${sourceKey}:${displayInfo.id}:${sec.field}}}`,
              matchScore: boostedScore,
              hasPrimaryMatch: hasPrimaryMatch,
              sortKey: `${tier}_${100 - boostedScore}_${sourceConfig.label}_${displayInfo.primary}_${sec.field}`
            });
          }
        });

        // Also search in searchable fields if defined
        if (sourceConfig.searchFields && Array.isArray(sourceConfig.searchFields)) {
          sourceConfig.searchFields.forEach(fieldPath => {
            const value = getNestedValue(item, fieldPath);
            if (value) {
              const valueScore = fuzzyMatchScore(query, String(value));
              const hasPrimaryMatch = primaryMatchItems.has(itemKey);

              // Show if matches query OR parent item matched
              const shouldShow = valueScore > 30 || hasPrimaryMatch;

              if (shouldShow) {
                const boostedScore = hasPrimaryMatch ? Math.max(valueScore, 85) : valueScore;
                const tier = hasPrimaryMatch ? '1' : '2';

                // Avoid duplicate suggestions (check if this field was already added in secondary)
                const isDuplicate = displayInfo.secondary.some(s => s.field === fieldPath);
                if (!isDuplicate) {
                  suggestions.push({
                    type: 'field',
                    sourceKey,
                    sourceLabel: sourceConfig.label,
                    icon: sourceConfig.icon || '📊',
                    itemId: displayInfo.id,
                    primaryDisplay: displayInfo.primary,
                    fieldPath: fieldPath,
                    previewValue: String(value).substring(0, 100),
                    insertSyntax: `{{data:${sourceKey}:${displayInfo.id}:${fieldPath}}}`,
                    matchScore: boostedScore,
                    hasPrimaryMatch: hasPrimaryMatch,
                    sortKey: `${tier}_${100 - boostedScore}_${sourceConfig.label}_${displayInfo.primary}_${fieldPath}`
                  });
                }
              }
            }
          });
        }
      }
    } catch (err) {
      logger.error(`[DataAutocomplete] Failed to search ${sourceKey}:`, err);
    }
  }

  // Sort by tier and match score (sortKey handles this)
  suggestions.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  // Return top results
  return suggestions.slice(0, limit);
};

/**
 * Get nested value from object using dot notation
 * @param {Object} obj - Object to search in
 * @param {string} path - Path like "skill.name"
 * @returns {any} Value or undefined
 */
const getNestedValue = (obj, path) => {
  return path.split('.').reduce((current, key) => current?.[key], obj);
};

/**
 * Get dataset-level suggestions for browsing data sources
 * Only includes datasets when query is short (<3 chars) or has good label match (>60%)
 * @param {string} query - Search query
 * @param {Object} sources - Data registry sources
 * @returns {Array} Array of dataset suggestions
 */
export const getDatasetSuggestions = (query, sources) => {
  const suggestions = [];

  for (const [sourceKey, sourceConfig] of Object.entries(sources)) {
    // Score the dataset label against the query
    const matchScore = fuzzyMatchScore(query, sourceConfig.label);

    // Only show dataset if:
    // 1. Query is very short (exploratory search), OR
    // 2. Dataset label has good match
    const shouldInclude = query.length < 3 || matchScore > 60;

    if (shouldInclude) {
      suggestions.push({
        type: 'dataset',
        sourceKey,
        sourceLabel: sourceConfig.label,
        icon: sourceConfig.icon || '📊',
        insertSyntax: null, // Cannot be inserted directly
        canDrillIn: true,   // Can be explored
        matchScore,
        itemCount: 0, // Will be updated when items are counted
        sortKey: `1.5_${100 - matchScore}_${sourceConfig.label}`
      });
    }
  }

  return suggestions;
};

/**
 * Get all items from a specific dataset, sorted by relevance to original query
 * @param {string} sourceKey - Data source key
 * @param {string} originalQuery - Original search query for relevance sorting
 * @returns {Promise<Array>} Array of item suggestions
 */
export const getDatasetItems = async (sourceKey, originalQuery = '') => {
  const suggestions = [];
  const sources = dataRegistry.getSources();
  const sourceConfig = sources[sourceKey];

  if (!sourceConfig) {
    logger.warn(`[getDatasetItems] Unknown source: ${sourceKey}`);
    return suggestions;
  }

  try {
    // Fetch all items from this source
    const items = await dataRegistry.fetchData(sourceKey);

    if (!Array.isArray(items)) {
      logger.warn(`[getDatasetItems] Source ${sourceKey} did not return an array`);
      return suggestions;
    }

    // Convert items to suggestions and score by relevance to original query
    for (const item of items) {
      const displayInfo = dataRegistry.getDisplayInfo(sourceKey, item);

      // Score based on original query for sorting
      const relevanceScore = originalQuery
        ? fuzzyMatchScore(originalQuery, displayInfo.primary)
        : 50; // Default score when no query

      suggestions.push({
        type: 'full-object',
        sourceKey,
        sourceLabel: sourceConfig.label,
        icon: sourceConfig.icon || '📊',
        itemId: displayInfo.id,
        primaryDisplay: displayInfo.primary,
        fieldPath: null,
        previewValue: displayInfo.secondary.map(s => `${s.field}: ${s.value}`).join(', ').substring(0, 100),
        insertSyntax: `{{data:${sourceKey}:${displayInfo.id}}}`,
        matchScore: relevanceScore,
        canDrillIn: true, // Can drill into fields
        sortKey: `0_${100 - relevanceScore}_${displayInfo.primary}`
      });
    }

    // Sort by relevance (most relevant first)
    suggestions.sort((a, b) => a.sortKey.localeCompare(b.sortKey));

  } catch (err) {
    logger.error(`[getDatasetItems] Failed to fetch items from ${sourceKey}:`, err);
    throw err; // Re-throw for error handling in component
  }

  return suggestions;
};

/**
 * Get all fields for a specific item, with "Entire card" option at top
 * @param {string} sourceKey - Data source key
 * @param {string|number} itemId - Item ID
 * @returns {Promise<Array>} Array of field suggestions + entire card option
 */
export const getItemFields = async (sourceKey, itemId) => {
  const suggestions = [];
  const sources = dataRegistry.getSources();
  const sourceConfig = sources[sourceKey];

  if (!sourceConfig) {
    logger.warn(`[getItemFields] Unknown source: ${sourceKey}`);
    return suggestions;
  }

  try {
    // Fetch all items to find the specific one
    const items = await dataRegistry.fetchData(sourceKey);

    if (!Array.isArray(items)) {
      logger.warn(`[getItemFields] Source ${sourceKey} did not return an array`);
      return suggestions;
    }

    // Find the specific item
    const item = items.find(i => {
      const displayInfo = dataRegistry.getDisplayInfo(sourceKey, i);
      return displayInfo.id === itemId || displayInfo.id === String(itemId) || displayInfo.id === Number(itemId);
    });

    if (!item) {
      logger.warn(`[getItemFields] Item ${itemId} not found in ${sourceKey}`);
      return suggestions;
    }

    const displayInfo = dataRegistry.getDisplayInfo(sourceKey, item);

    // First: Add "Entire Card" option
    suggestions.push({
      type: 'full-object',
      sourceKey,
      sourceLabel: sourceConfig.label,
      icon: '📦',
      itemId: displayInfo.id,
      primaryDisplay: 'Entire Card',
      fieldPath: null,
      previewValue: 'Insert complete data object with all fields',
      insertSyntax: `{{data:${sourceKey}:${displayInfo.id}}}`,
      isEntireCard: true,
      canDrillIn: false, // This is a leaf node
      matchScore: 100,
      sortKey: '0_entire_card'
    });

    // Then: Add all secondary fields
    displayInfo.secondary.forEach((sec, index) => {
      suggestions.push({
        type: 'field',
        sourceKey,
        sourceLabel: sourceConfig.label,
        icon: sourceConfig.icon || '📊',
        itemId: displayInfo.id,
        primaryDisplay: displayInfo.primary,
        fieldPath: sec.field,
        previewValue: String(sec.value).substring(0, 100),
        insertSyntax: `{{data:${sourceKey}:${displayInfo.id}:${sec.field}}}`,
        canDrillIn: false, // Fields are leaf nodes
        matchScore: 90 - index, // Order by display order
        sortKey: `1_${index}_${sec.field}`
      });
    });

    // Also add searchable fields that aren't in secondary
    if (sourceConfig.searchFields && Array.isArray(sourceConfig.searchFields)) {
      sourceConfig.searchFields.forEach((fieldPath, index) => {
        // Skip if already in secondary fields
        const isDuplicate = displayInfo.secondary.some(s => s.field === fieldPath);
        if (!isDuplicate) {
          const value = getNestedValue(item, fieldPath);
          if (value !== undefined && value !== null) {
            suggestions.push({
              type: 'field',
              sourceKey,
              sourceLabel: sourceConfig.label,
              icon: sourceConfig.icon || '📊',
              itemId: displayInfo.id,
              primaryDisplay: displayInfo.primary,
              fieldPath: fieldPath,
              previewValue: String(value).substring(0, 100),
              insertSyntax: `{{data:${sourceKey}:${displayInfo.id}:${fieldPath}}}`,
              canDrillIn: false,
              matchScore: 80 - index,
              sortKey: `2_${index}_${fieldPath}`
            });
          }
        }
      });
    }

  } catch (err) {
    logger.error(`[getItemFields] Failed to fetch fields for ${sourceKey}:${itemId}:`, err);
    throw err; // Re-throw for error handling in component
  }

  return suggestions;
};
