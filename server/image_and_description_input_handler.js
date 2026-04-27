const fs = require('fs');
const path = require('path');

/**
 * ImageAndDescriptionHandler manages the storage and pairing of images,
 * titles, and descriptions on the file system.
 */
class ImageAndDescriptionHandler {
  constructor(baseStoragePath = './uploads') {
    this.baseStoragePath = path.join(__dirname, baseStoragePath);
    this.imagesDir = path.join(this.baseStoragePath, 'images');
    this.metadataDir = path.join(this.baseStoragePath, 'metadata');
    this.indexFile = path.join(this.metadataDir, 'index.json');

    // Initialize directories
    this.initializeDirectories();

    // Load or initialize the index
    this.loadOrCreateIndex();
  }

  /**
   * Initialize required directories for storage
   */
  initializeDirectories() {
    if (!fs.existsSync(this.baseStoragePath)) {
      fs.mkdirSync(this.baseStoragePath, { recursive: true });
      console.log(`Created storage directory: ${this.baseStoragePath}`);
    }

    if (!fs.existsSync(this.imagesDir)) {
      fs.mkdirSync(this.imagesDir, { recursive: true });
      console.log(`Created images directory: ${this.imagesDir}`);
    }

    if (!fs.existsSync(this.metadataDir)) {
      fs.mkdirSync(this.metadataDir, { recursive: true });
      console.log(`Created metadata directory: ${this.metadataDir}`);
    }
  }

  /**
   * Load existing index or create a new one
   */
  loadOrCreateIndex() {
    if (fs.existsSync(this.indexFile)) {
      try {
        const data = fs.readFileSync(this.indexFile, 'utf-8');
        this.index = JSON.parse(data);
        console.log(`Loaded existing index with ${this.index.items.length} items`);
      } catch (error) {
        console.error('Error loading index, creating new one:', error.message);
        this.createNewIndex();
      }
    } else {
      this.createNewIndex();
    }
  }

  /**
   * Create a fresh index
   */
  createNewIndex() {
    this.index = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      items: []
    };
    this.saveIndex();
  }

  /**
   * Save index to file
   */
  saveIndex() {
    try {
      fs.writeFileSync(
        this.indexFile,
        JSON.stringify(this.index, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Error saving index:', error.message);
      throw error;
    }
  }

  /**
   * Generate unique ID for items
   */
  generateId() {
    return `item_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Store images on the file system
   * @param {Array} files - Array of file objects from multer with { fieldname, originalname, mimetype, buffer }
   * @returns {Array} Array of stored image metadata
   */
  storeImages(files) {
    if (!files || files.length === 0) {
      throw new Error('No images provided');
    }

    const storedImages = [];

    files.forEach((file, index) => {
      try {
        const itemId = this.generateId();
        const fileExtension = path.extname(file.originalname);
        const fileName = `${itemId}${fileExtension}`;
        const filePath = path.join(this.imagesDir, fileName);

        // Write file to disk
        fs.writeFileSync(filePath, file.buffer);

        // Create item entry
        const item = {
          id: itemId,
          fileName,
          originalName: file.originalname,
          mimeType: file.mimetype,
          size: file.buffer.length,
          uploadedAt: new Date().toISOString(),
          title: null,
          description: null,
          index
        };

        this.index.items.push(item);
        storedImages.push(item);

        console.log(`Stored image: ${fileName} (${this.formatFileSize(file.buffer.length)})`);
      } catch (error) {
        console.error(`Error storing image ${file.originalname}:`, error.message);
        throw error;
      }
    });

    this.saveIndex();
    return storedImages;
  }

  /**
   * Store titles and match them to images by index
   * @param {Array} titles - Array of title strings
   * @returns {Object} Result with success count and any errors
   */
  storeTitles(titles) {
    if (!titles || !Array.isArray(titles) || titles.length === 0) {
      throw new Error('No titles provided');
    }

    const results = {
      stored: 0,
      failed: 0,
      errors: []
    };

    // Get all items that don't have titles yet, up to the number of titles provided
    const itemsWithoutTitles = this.index.items.filter(item => !item.title);

    titles.forEach((title, idx) => {
      try {
        if (idx < itemsWithoutTitles.length) {
          const item = itemsWithoutTitles[idx];
          item.title = title.trim();
          results.stored++;
          console.log(`Stored title for ${item.id}: "${title}"`);
        } else {
          results.errors.push(`No matching image for title #${idx + 1}`);
          results.failed++;
        }
      } catch (error) {
        results.errors.push(`Error storing title #${idx + 1}: ${error.message}`);
        results.failed++;
      }
    });

    this.saveIndex();
    return results;
  }

  /**
   * Store descriptions and match them to images by index
   * @param {Array} descriptions - Array of description strings
   * @returns {Object} Result with success count and any errors
   */
  storeDescriptions(descriptions) {
    if (!descriptions || !Array.isArray(descriptions) || descriptions.length === 0) {
      throw new Error('No descriptions provided');
    }

    const results = {
      stored: 0,
      failed: 0,
      errors: []
    };

    // Get all items that don't have descriptions yet
    const itemsWithoutDescriptions = this.index.items.filter(item => !item.description);

    descriptions.forEach((description, idx) => {
      try {
        if (idx < itemsWithoutDescriptions.length) {
          const item = itemsWithoutDescriptions[idx];
          item.description = description.trim();
          results.stored++;
          console.log(`Stored description for ${item.id}: "${description.substring(0, 50)}..."`);
        } else {
          results.errors.push(`No matching image for description #${idx + 1}`);
          results.failed++;
        }
      } catch (error) {
        results.errors.push(`Error storing description #${idx + 1}: ${error.message}`);
        results.failed++;
      }
    });

    this.saveIndex();
    return results;
  }

  /**
   * Get all stored items with their complete metadata
   * @returns {Array} Array of all items
   */
  getAllItems() {
    return this.index.items;
  }

  /**
   * Get a specific item by ID
   * @param {string} itemId - The item ID
   * @returns {Object} The item object
   */
  getItem(itemId) {
    return this.index.items.find(item => item.id === itemId);
  }

  /**
   * Get the file path for an image
   * @param {string} itemId - The item ID
   * @returns {string} Full path to the image file
   */
  getImagePath(itemId) {
    const item = this.getItem(itemId);
    if (!item) {
      throw new Error(`Item not found: ${itemId}`);
    }
    return path.join(this.imagesDir, item.fileName);
  }

  /**
   * Get image buffer
   * @param {string} itemId - The item ID
   * @returns {Buffer} Image buffer
   */
  getImageBuffer(itemId) {
    const filePath = this.getImagePath(itemId);
    return fs.readFileSync(filePath);
  }

  /**
   * Get items that are ready (have image, title, and description)
   * @returns {Array} Array of complete items
   */
  getCompleteItems() {
    return this.index.items.filter(item =>
      item.fileName && item.title && item.description
    );
  }

  /**
   * Get items that are incomplete
   * @returns {Array} Array of incomplete items
   */
  getIncompleteItems() {
    return this.index.items.filter(item =>
      !item.fileName || !item.title || !item.description
    );
  }

  /**
   * Get storage statistics
   * @returns {Object} Statistics about storage
   */
  getStatistics() {
    const completeItems = this.getCompleteItems();
    const incompleteItems = this.getIncompleteItems();
    const totalSize = this.index.items.reduce((sum, item) => sum + (item.size || 0), 0);

    return {
      totalItems: this.index.items.length,
      completeItems: completeItems.length,
      incompleteItems: incompleteItems.length,
      totalStorageSize: totalSize,
      formattedSize: this.formatFileSize(totalSize),
      index: {
        createdAt: this.index.createdAt,
        version: this.index.version
      }
    };
  }

  /**
   * Clear all stored data (for testing/reset)
   */
  clearAll() {
    try {
      // Delete images
      if (fs.existsSync(this.imagesDir)) {
        fs.rmSync(this.imagesDir, { recursive: true });
      }

      // Delete metadata
      if (fs.existsSync(this.metadataDir)) {
        fs.rmSync(this.metadataDir, { recursive: true });
      }

      // Reinitialize
      this.initializeDirectories();
      this.createNewIndex();
      console.log('All data cleared');
    } catch (error) {
      console.error('Error clearing data:', error.message);
      throw error;
    }
  }

  /**
   * Format bytes to human readable format
   * @param {number} bytes - Number of bytes
   * @returns {string} Formatted size
   */
  formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return Math.round(bytes / Math.pow(k, i) * 100) / 100 + ' ' + sizes[i];
  }

  /**
   * Export all items with their metadata (useful for processing)
   * @returns {Array} Array of complete items with file data
   */
  exportCompleteItems() {
    return this.getCompleteItems().map(item => ({
      ...item,
      imagePath: this.getImagePath(item.id)
    }));
  }
}

module.exports = ImageAndDescriptionHandler;
