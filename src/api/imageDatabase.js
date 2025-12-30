/**
 * Image Database API
 *
 * Backend API for managing image database and filesystem operations
 */

import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// Paths relative to project root
const PUBLIC_DIR = path.resolve(__dirname, '../../../public');
const IMAGES_DIR = path.join(PUBLIC_DIR, 'images');
const DATA_DIR = path.join(PUBLIC_DIR, 'data');
const INDEX_PATH = path.join(DATA_DIR, 'image-index.json');
const SEARCH_INDEX_PATH = path.join(DATA_DIR, 'image-search-index.json');
const EXTERNAL_DIR = path.resolve(__dirname, '../../../external');
const IMAGE_BACKUP_DIR = path.join(EXTERNAL_DIR, 'image-backup');

/**
 * Load image indexes
 */
export async function loadImageIndexes() {
  try {
    const [mainIndex, searchIndex] = await Promise.all([
      fs.readFile(INDEX_PATH, 'utf-8').then(JSON.parse),
      fs.readFile(SEARCH_INDEX_PATH, 'utf-8').then(JSON.parse)
    ]);

    return { mainIndex, searchIndex };
  } catch (error) {
    console.error('Failed to load image indexes:', error);
    throw error;
  }
}

/**
 * Save image indexes
 */
export async function saveImageIndexes(mainIndex, searchIndex) {
  try {
    await Promise.all([
      fs.writeFile(INDEX_PATH, JSON.stringify(mainIndex, null, 2), 'utf-8'),
      fs.writeFile(SEARCH_INDEX_PATH, JSON.stringify(searchIndex, null, 2), 'utf-8')
    ]);

    return { success: true };
  } catch (error) {
    console.error('Failed to save image indexes:', error);
    throw error;
  }
}

/**
 * Check if a file exists
 */
async function fileExists(filePath) {
  try {
    await fs.access(filePath);
    return true;
  } catch {
    return false;
  }
}

/**
 * Scan for orphaned images (database entries with no physical file)
 */
export async function scanForOrphans() {
  const { mainIndex } = await loadImageIndexes();
  const images = mainIndex.images || [];
  const orphans = [];

  for (const image of images) {
    const imagePath = path.join(PUBLIC_DIR, image.path.replace(/^\//, ''));
    const exists = await fileExists(imagePath);

    if (!exists) {
      orphans.push(image);
    }
  }

  return {
    total: images.length,
    orphaned: orphans.length,
    orphans: orphans
  };
}

/**
 * Remove orphaned entries from database
 */
export async function removeOrphanedEntries(orphanedPaths) {
  const { mainIndex, searchIndex } = await loadImageIndexes();

  // Convert paths to a Set for faster lookup
  const pathSet = new Set(orphanedPaths);

  // Filter out orphaned images from main index
  const cleanedMainImages = mainIndex.images.filter(img => !pathSet.has(img.path));

  // Filter out orphaned images from search index
  const cleanedSearchImages = {};
  for (const [id, img] of Object.entries(searchIndex.images)) {
    if (!pathSet.has(img.path)) {
      cleanedSearchImages[id] = img;
    }
  }

  // Update indexes
  const updatedMainIndex = {
    ...mainIndex,
    images: cleanedMainImages,
    totalImages: cleanedMainImages.length
  };

  const updatedSearchIndex = {
    ...searchIndex,
    images: cleanedSearchImages,
    totalImages: Object.keys(cleanedSearchImages).length
  };

  // Save updated indexes
  await saveImageIndexes(updatedMainIndex, updatedSearchIndex);

  return {
    removed: orphanedPaths.length,
    remaining: cleanedMainImages.length
  };
}

/**
 * Move images to a new directory
 */
export async function moveImages(imagePaths, targetCategory) {
  const { mainIndex, searchIndex } = await loadImageIndexes();
  const movedImages = [];
  const failedMoves = [];

  for (const imagePath of imagePaths) {
    try {
      // Find image in index
      const imageEntry = mainIndex.images.find(img => img.path === imagePath);
      if (!imageEntry) {
        failedMoves.push({ path: imagePath, reason: 'Not found in index' });
        continue;
      }

      // Construct old and new paths
      const oldPath = path.join(PUBLIC_DIR, imagePath.replace(/^\//, ''));
      const filename = path.basename(imagePath);
      const newPath = path.join(IMAGES_DIR, targetCategory, filename);
      const newRelativePath = `/images/${targetCategory}/${filename}`;

      // Check if source exists
      if (!await fileExists(oldPath)) {
        failedMoves.push({ path: imagePath, reason: 'Source file not found' });
        continue;
      }

      // Create target directory
      await fs.mkdir(path.dirname(newPath), { recursive: true });

      // Move file
      await fs.rename(oldPath, newPath);

      // Update image entry
      imageEntry.path = newRelativePath;
      imageEntry.category = targetCategory;

      // Track successful move
      movedImages.push({
        oldPath: imagePath,
        newPath: newRelativePath
      });

    } catch (error) {
      failedMoves.push({ path: imagePath, reason: error.message });
    }
  }

  // Update search index
  for (const [id, img] of Object.entries(searchIndex.images)) {
    const movedImage = movedImages.find(m => m.oldPath === img.path);
    if (movedImage) {
      img.path = movedImage.newPath;
      img.category = targetCategory;
    }
  }

  // Save updated indexes
  await saveImageIndexes(mainIndex, searchIndex);

  return {
    moved: movedImages.length,
    failed: failedMoves.length,
    movedImages,
    failedMoves
  };
}

/**
 * Delete images
 */
export async function deleteImages(imagePaths) {
  const { mainIndex, searchIndex } = await loadImageIndexes();
  const deletedImages = [];
  const failedDeletes = [];

  for (const imagePath of imagePaths) {
    try {
      // Construct full path
      const fullPath = path.join(PUBLIC_DIR, imagePath.replace(/^\//, ''));

      // Check if file exists
      if (await fileExists(fullPath)) {
        // Delete file
        await fs.unlink(fullPath);
      }

      // Track successful delete
      deletedImages.push(imagePath);

    } catch (error) {
      failedDeletes.push({ path: imagePath, reason: error.message });
    }
  }

  // Remove from main index
  const pathSet = new Set(deletedImages);
  const cleanedMainImages = mainIndex.images.filter(img => !pathSet.has(img.path));

  // Remove from search index
  const cleanedSearchImages = {};
  for (const [id, img] of Object.entries(searchIndex.images)) {
    if (!pathSet.has(img.path)) {
      cleanedSearchImages[id] = img;
    }
  }

  // Update indexes
  const updatedMainIndex = {
    ...mainIndex,
    images: cleanedMainImages,
    totalImages: cleanedMainImages.length
  };

  const updatedSearchIndex = {
    ...searchIndex,
    images: cleanedSearchImages,
    totalImages: Object.keys(cleanedSearchImages).length
  };

  // Save updated indexes
  await saveImageIndexes(updatedMainIndex, updatedSearchIndex);

  return {
    deleted: deletedImages.length,
    failed: failedDeletes.length,
    deletedImages,
    failedDeletes
  };
}

/**
 * Get database statistics
 */
export async function getDatabaseStats() {
  const { mainIndex } = await loadImageIndexes();
  const images = mainIndex.images || [];

  // Count by category
  const categoryCounts = {};
  for (const image of images) {
    const category = image.category || 'unknown';
    categoryCounts[category] = (categoryCounts[category] || 0) + 1;
  }

  // Sort categories by count
  const sortedCategories = Object.entries(categoryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 20);

  return {
    total: images.length,
    categories: Object.keys(categoryCounts).length,
    topCategories: sortedCategories
  };
}

/**
 * List all directories in the images folder
 */
export async function listImageDirectories() {
  async function getDirectories(dir, baseDir = '') {
    const entries = await fs.readdir(dir, { withFileTypes: true });
    const directories = [];

    for (const entry of entries) {
      if (entry.isDirectory()) {
        const relativePath = baseDir ? path.join(baseDir, entry.name) : entry.name;
        const fullPath = path.join(dir, entry.name);

        // Get image count in this directory
        const images = await getImagesInDirectory(fullPath);

        directories.push({
          name: entry.name,
          path: relativePath,
          fullPath: fullPath,
          imageCount: images.length
        });

        // Recursively get subdirectories
        const subdirs = await getDirectories(fullPath, relativePath);
        directories.push(...subdirs);
      }
    }

    return directories;
  }

  return await getDirectories(IMAGES_DIR);
}

/**
 * Get all images in a directory recursively
 */
async function getImagesInDirectory(dir) {
  const images = [];
  const entries = await fs.readdir(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Recursively get images from subdirectories
      const subImages = await getImagesInDirectory(fullPath);
      images.push(...subImages);
    } else if (entry.isFile()) {
      // Check if it's an image file
      const ext = path.extname(entry.name).toLowerCase();
      if (['.jpg', '.jpeg', '.png', '.webp', '.gif', '.svg'].includes(ext)) {
        images.push(fullPath);
      }
    }
  }

  return images;
}

/**
 * Lower quality of specific images by their paths
 */
export async function lowerQualityImages(imagePaths, quality = 80) {
  const processedImages = [];
  const failedImages = [];
  let totalSizeBefore = 0;
  let totalSizeAfter = 0;

  for (const imagePath of imagePaths) {
    try {
      // Convert relative path to full path
      const fullPath = path.join(PUBLIC_DIR, imagePath.replace(/^\//, ''));

      // Check if file exists
      if (!await fileExists(fullPath)) {
        failedImages.push({
          path: imagePath,
          error: 'File not found'
        });
        continue;
      }

      // Get file stats before processing
      const statsBefore = await fs.stat(fullPath);
      totalSizeBefore += statsBefore.size;

      // Create backup path in external/image-backup
      const relativePath = path.relative(PUBLIC_DIR, fullPath);
      const backupPath = path.join(IMAGE_BACKUP_DIR, relativePath);
      await fs.mkdir(path.dirname(backupPath), { recursive: true });

      // Copy original to backup location
      await fs.copyFile(fullPath, backupPath);

      // Lower quality based on file type
      const ext = path.extname(fullPath).toLowerCase();

      if (ext === '.svg') {
        // Skip SVG files (they're vector, not raster)
        processedImages.push({
          path: imagePath,
          skipped: true,
          reason: 'SVG files are vector format'
        });
        totalSizeAfter += statsBefore.size; // No change in size
        continue;
      }

      // Process with sharp
      const image = sharp(fullPath);
      const metadata = await image.metadata();

      let outputBuffer;
      if (ext === '.png') {
        outputBuffer = await image
          .png({ quality, compressionLevel: 9 })
          .toBuffer();
      } else if (ext === '.webp') {
        outputBuffer = await image
          .webp({ quality })
          .toBuffer();
      } else if (['.jpg', '.jpeg'].includes(ext)) {
        outputBuffer = await image
          .jpeg({ quality })
          .toBuffer();
      } else {
        // For other formats, convert to jpeg
        outputBuffer = await image
          .jpeg({ quality })
          .toBuffer();
      }

      // Write the processed image back
      await fs.writeFile(fullPath, outputBuffer);

      // Get file stats after processing
      const statsAfter = await fs.stat(fullPath);
      totalSizeAfter += statsAfter.size;

      const sizeSaved = statsBefore.size - statsAfter.size;
      const percentSaved = ((sizeSaved / statsBefore.size) * 100).toFixed(2);

      processedImages.push({
        path: imagePath,
        originalSize: statsBefore.size,
        newSize: statsAfter.size,
        sizeSaved,
        percentSaved: parseFloat(percentSaved),
        backupPath: path.relative(EXTERNAL_DIR, backupPath)
      });

    } catch (error) {
      failedImages.push({
        path: imagePath,
        error: error.message
      });
    }
  }

  const totalSizeSaved = totalSizeBefore - totalSizeAfter;
  const totalPercentSaved = totalSizeBefore > 0
    ? ((totalSizeSaved / totalSizeBefore) * 100).toFixed(2)
    : 0;

  return {
    quality,
    processed: processedImages.length,
    failed: failedImages.length,
    totalSizeBefore,
    totalSizeAfter,
    totalSizeSaved,
    totalPercentSaved: parseFloat(totalPercentSaved),
    processedImages,
    failedImages
  };
}

/**
 * Scan filesystem for all image files
 */
export async function scanFilesystem() {
  const images = await getImagesInDirectory(IMAGES_DIR);

  // Convert full paths to relative paths (starting with /images/)
  const relativePaths = images.map(fullPath => {
    const relativePath = path.relative(PUBLIC_DIR, fullPath);
    return '/' + relativePath.replace(/\\/g, '/');
  });

  return {
    files: relativePaths,
    total: relativePaths.length
  };
}

/**
 * Apply resolved orphan mappings (update database entries with new paths)
 */
export async function applyResolvedOrphans(resolved) {
  const { mainIndex, searchIndex } = await loadImageIndexes();
  let updated = 0;

  // Create a map of old path -> new path
  const pathMap = new Map(resolved.map(r => [r.oldPath, r.newPath]));

  // Update main index
  for (const image of mainIndex.images) {
    if (pathMap.has(image.path)) {
      const newPath = pathMap.get(image.path);
      image.path = newPath;

      // Update category based on new path
      const pathParts = newPath.split('/').filter(p => p);
      if (pathParts.length > 2 && pathParts[0] === 'images') {
        image.category = pathParts[1]; // e.g., /images/skills/fire.png -> category: skills
      }

      updated++;
    }
  }

  // Update search index
  for (const [id, img] of Object.entries(searchIndex.images)) {
    if (pathMap.has(img.path)) {
      const newPath = pathMap.get(img.path);
      img.path = newPath;

      // Update category based on new path
      const pathParts = newPath.split('/').filter(p => p);
      if (pathParts.length > 2 && pathParts[0] === 'images') {
        img.category = pathParts[1];
      }
    }
  }

  // Save updated indexes
  await saveImageIndexes(mainIndex, searchIndex);

  return {
    updated
  };
}

/**
 * Delete orphaned database entries (entries with no physical files)
 */
export async function deleteOrphanEntries(paths) {
  return await removeOrphanedEntries(paths);
}

/**
 * Scan for and fix missing dimension data in image entries
 */
export async function fixMissingDimensions() {
  const { mainIndex, searchIndex } = await loadImageIndexes();
  const imagesWithMissingData = [];
  const fixedImages = [];
  const failedImages = [];

  // Find images with missing dimensions
  for (const image of mainIndex.images) {
    if (!image.dimensions || !image.dimensions.width || !image.dimensions.height) {
      imagesWithMissingData.push(image);
    }
  }

  // Fix each image with missing dimensions
  for (const image of imagesWithMissingData) {
    try {
      const fullPath = path.join(PUBLIC_DIR, image.path.replace(/^\//, ''));

      // Check if file exists
      if (!await fileExists(fullPath)) {
        failedImages.push({
          path: image.path,
          error: 'File not found'
        });
        continue;
      }

      // Get file extension
      const ext = path.extname(fullPath).toLowerCase();

      if (ext === '.svg') {
        // For SVG files, we can't easily get dimensions without parsing XML
        // Set default dimensions or skip
        fixedImages.push({
          path: image.path,
          skipped: true,
          reason: 'SVG dimensions require XML parsing'
        });
        continue;
      }

      // Use sharp to get image metadata
      const metadata = await sharp(fullPath).metadata();

      if (metadata.width && metadata.height) {
        // Update dimensions in image entry
        image.dimensions = {
          width: metadata.width,
          height: metadata.height
        };

        // Also update in search index
        const searchEntry = Object.values(searchIndex.images).find(img => img.path === image.path);
        if (searchEntry) {
          searchEntry.dimensions = {
            width: metadata.width,
            height: metadata.height
          };
        }

        fixedImages.push({
          path: image.path,
          dimensions: {
            width: metadata.width,
            height: metadata.height
          }
        });
      } else {
        failedImages.push({
          path: image.path,
          error: 'Could not read dimensions from image'
        });
      }

    } catch (error) {
      failedImages.push({
        path: image.path,
        error: error.message
      });
    }
  }

  // Save updated indexes if any images were fixed
  if (fixedImages.length > 0) {
    await saveImageIndexes(mainIndex, searchIndex);
  }

  return {
    total: mainIndex.images.length,
    missingData: imagesWithMissingData.length,
    fixed: fixedImages.length,
    failed: failedImages.length,
    fixedImages,
    failedImages
  };
}

/**
 * Add missing database entries for files that exist but aren't in the index
 */
export async function addMissingEntries(paths) {
  const { mainIndex, searchIndex } = await loadImageIndexes();
  let added = 0;

  for (const imagePath of paths) {
    try {
      // Check if entry already exists
      const exists = mainIndex.images.some(img => img.path === imagePath);
      if (exists) continue;

      // Get file info
      const fullPath = path.join(PUBLIC_DIR, imagePath.replace(/^\//, ''));

      // Check if file exists
      if (!await fileExists(fullPath)) continue;

      // Get file stats
      const stats = await fs.stat(fullPath);
      const filename = path.basename(imagePath);

      // Extract category from path (e.g., /images/skills/fire.png -> skills)
      const pathParts = imagePath.split('/').filter(p => p);
      let category = 'uncategorized';
      if (pathParts.length > 2 && pathParts[0] === 'images') {
        category = pathParts[1];
      }

      // Get dimensions for raster images
      let dimensions = null;
      const ext = path.extname(fullPath).toLowerCase();
      if (!['.svg'].includes(ext)) {
        try {
          const metadata = await sharp(fullPath).metadata();
          if (metadata.width && metadata.height) {
            dimensions = {
              width: metadata.width,
              height: metadata.height
            };
          }
        } catch (error) {
          console.warn(`Could not read dimensions for ${imagePath}:`, error.message);
        }
      }

      // Create new entry
      const newEntry = {
        path: imagePath,
        filename: filename,
        category: category,
        filesize: stats.size,
        keywords: [filename.replace(/\.[^/.]+$/, ''), category], // filename without extension + category
        lastModified: stats.mtime.toISOString()
      };

      // Add dimensions if available
      if (dimensions) {
        newEntry.dimensions = dimensions;
      }

      // Add to main index
      mainIndex.images.push(newEntry);

      // Add to search index
      const searchId = `img-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
      searchIndex.images[searchId] = {
        ...newEntry,
        id: searchId
      };

      added++;

    } catch (error) {
      console.error(`Failed to add entry for ${imagePath}:`, error);
    }
  }

  // Update total counts
  mainIndex.totalImages = mainIndex.images.length;
  searchIndex.totalImages = Object.keys(searchIndex.images).length;

  // Save updated indexes
  await saveImageIndexes(mainIndex, searchIndex);

  return {
    added
  };
}

/**
 * Lower quality of all images in a directory
 */
export async function lowerQualityInDirectory(directoryPath, quality = 80) {
  const fullDirPath = path.join(IMAGES_DIR, directoryPath);

  // Check if directory exists
  if (!await fileExists(fullDirPath)) {
    throw new Error(`Directory not found: ${directoryPath}`);
  }

  // Get all images in directory recursively
  const images = await getImagesInDirectory(fullDirPath);

  const processedImages = [];
  const failedImages = [];
  let totalSizeBefore = 0;
  let totalSizeAfter = 0;

  for (const imagePath of images) {
    try {
      // Get relative path from IMAGES_DIR
      const relativePath = path.relative(IMAGES_DIR, imagePath);

      // Get file stats before processing
      const statsBefore = await fs.stat(imagePath);
      totalSizeBefore += statsBefore.size;

      // Create backup path in external/image-backup
      const backupPath = path.join(IMAGE_BACKUP_DIR, relativePath);
      await fs.mkdir(path.dirname(backupPath), { recursive: true });

      // Copy original to backup location
      await fs.copyFile(imagePath, backupPath);

      // Lower quality based on file type
      const ext = path.extname(imagePath).toLowerCase();

      if (ext === '.svg') {
        // Skip SVG files (they're vector, not raster)
        processedImages.push({
          path: relativePath,
          skipped: true,
          reason: 'SVG files are vector format'
        });
        continue;
      }

      // Process with sharp
      const image = sharp(imagePath);
      const metadata = await image.metadata();

      let outputBuffer;
      if (ext === '.png') {
        outputBuffer = await image
          .png({ quality, compressionLevel: 9 })
          .toBuffer();
      } else if (ext === '.webp') {
        outputBuffer = await image
          .webp({ quality })
          .toBuffer();
      } else if (['.jpg', '.jpeg'].includes(ext)) {
        outputBuffer = await image
          .jpeg({ quality })
          .toBuffer();
      } else {
        // For other formats, convert to jpeg
        outputBuffer = await image
          .jpeg({ quality })
          .toBuffer();
      }

      // Write the processed image back
      await fs.writeFile(imagePath, outputBuffer);

      // Get file stats after processing
      const statsAfter = await fs.stat(imagePath);
      totalSizeAfter += statsAfter.size;

      const sizeSaved = statsBefore.size - statsAfter.size;
      const percentSaved = ((sizeSaved / statsBefore.size) * 100).toFixed(2);

      processedImages.push({
        path: relativePath,
        originalSize: statsBefore.size,
        newSize: statsAfter.size,
        sizeSaved,
        percentSaved: parseFloat(percentSaved),
        backupPath: path.relative(EXTERNAL_DIR, backupPath)
      });

    } catch (error) {
      failedImages.push({
        path: path.relative(IMAGES_DIR, imagePath),
        error: error.message
      });
    }
  }

  const totalSizeSaved = totalSizeBefore - totalSizeAfter;
  const totalPercentSaved = totalSizeBefore > 0
    ? ((totalSizeSaved / totalSizeBefore) * 100).toFixed(2)
    : 0;

  return {
    directory: directoryPath,
    quality,
    processed: processedImages.length,
    failed: failedImages.length,
    totalSizeBefore,
    totalSizeAfter,
    totalSizeSaved,
    totalPercentSaved: parseFloat(totalPercentSaved),
    processedImages,
    failedImages
  };
}

// Vite/Node.js HTTP route handlers (not Express)
export const imageDbHandlers = {
  // GET /api/image-db/scan-orphans
  scanOrphans: async (req, res) => {
    try {
      const result = await scanForOrphans();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[Image DB] Scan orphans error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  },

  // POST /api/image-db/remove-orphans
  removeOrphans: async (req, res) => {
    try {
      const { orphanedPaths } = req.body;
      if (!Array.isArray(orphanedPaths)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'orphanedPaths must be an array' }));
        return;
      }

      const result = await removeOrphanedEntries(orphanedPaths);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[Image DB] Remove orphans error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  },

  // POST /api/image-db/move-images
  moveImages: async (req, res) => {
    try {
      const { imagePaths, targetCategory } = req.body;

      if (!Array.isArray(imagePaths)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'imagePaths must be an array' }));
        return;
      }

      if (!targetCategory || typeof targetCategory !== 'string') {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'targetCategory must be a string' }));
        return;
      }

      const result = await moveImages(imagePaths, targetCategory);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[Image DB] Move images error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  },

  // POST /api/image-db/delete-images
  deleteImages: async (req, res) => {
    try {
      const { imagePaths } = req.body;

      if (!Array.isArray(imagePaths)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'imagePaths must be an array' }));
        return;
      }

      const result = await deleteImages(imagePaths);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[Image DB] Delete images error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  },

  // GET /api/image-db/stats
  getStats: async (req, res) => {
    try {
      const stats = await getDatabaseStats();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(stats));
    } catch (error) {
      console.error('[Image DB] Get stats error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  },

  // GET /api/image-db/list-directories
  listDirectories: async (req, res) => {
    try {
      const directories = await listImageDirectories();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(directories));
    } catch (error) {
      console.error('[Image DB] List directories error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  },

  // POST /api/image-db/lower-quality
  lowerQuality: async (req, res) => {
    try {
      const { imagePaths, directoryPath, quality } = req.body;

      // Support both imagePaths (array) and directoryPath (string) for backwards compatibility
      const qualityValue = quality || 80;
      if (qualityValue < 1 || qualityValue > 100) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'quality must be between 1 and 100' }));
        return;
      }

      let result;
      if (imagePaths && Array.isArray(imagePaths)) {
        // New behavior: process specific image paths
        result = await lowerQualityImages(imagePaths, qualityValue);
      } else if (directoryPath && typeof directoryPath === 'string') {
        // Old behavior: process entire directory
        result = await lowerQualityInDirectory(directoryPath, qualityValue);
      } else {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'Either imagePaths (array) or directoryPath (string) must be provided' }));
        return;
      }

      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[Image DB] Lower quality error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  },

  // POST /api/image-db/scan-filesystem
  scanFilesystem: async (req, res) => {
    try {
      const result = await scanFilesystem();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[Image DB] Scan filesystem error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  },

  // POST /api/image-db/resolve-orphans
  resolveOrphans: async (req, res) => {
    try {
      const { resolved } = req.body;

      if (!Array.isArray(resolved)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'resolved must be an array' }));
        return;
      }

      const result = await applyResolvedOrphans(resolved);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[Image DB] Resolve orphans error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  },

  // POST /api/image-db/delete-orphan-entries
  deleteOrphanEntries: async (req, res) => {
    try {
      const { paths } = req.body;

      if (!Array.isArray(paths)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'paths must be an array' }));
        return;
      }

      const result = await deleteOrphanEntries(paths);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[Image DB] Delete orphan entries error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  },

  // POST /api/image-db/add-missing-entries
  addMissingEntries: async (req, res) => {
    try {
      const { paths } = req.body;

      if (!Array.isArray(paths)) {
        res.writeHead(400, { 'Content-Type': 'application/json' });
        res.end(JSON.stringify({ error: 'paths must be an array' }));
        return;
      }

      const result = await addMissingEntries(paths);
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[Image DB] Add missing entries error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  },

  // POST /api/image-db/fix-missing-dimensions
  fixMissingDimensions: async (req, res) => {
    try {
      const result = await fixMissingDimensions();
      res.writeHead(200, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify(result));
    } catch (error) {
      console.error('[Image DB] Fix missing dimensions error:', error);
      res.writeHead(500, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ error: error.message }));
    }
  }
};
