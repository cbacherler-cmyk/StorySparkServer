const fs = require('fs');
const path = require('path');

/**
 * ArtifactIdentificationHandler manages the storage and organization of story artifacts.
 * It stores titles, images, and descriptions for each stage of a story, keyed by story ID
 * and stage ID. All data is persisted to the file system.
 */
class ArtifactIdentificationHandler {
  constructor(baseStoragePath = './uploads/artifacts') {
    this.baseStoragePath = path.join(__dirname, baseStoragePath);
    this.storiesDir = path.join(this.baseStoragePath, 'stories');
    this.indexFile = path.join(this.baseStoragePath, 'index.json');

    // Initialize directories
    this.initializeDirectories();

    // Load or initialize the index
    this.loadOrCreateIndex();
  }

  /**
   * Initialize required directories for artifact storage
   */
  initializeDirectories() {
    if (!fs.existsSync(this.baseStoragePath)) {
      fs.mkdirSync(this.baseStoragePath, { recursive: true });
      console.log(`Created artifact storage directory: ${this.baseStoragePath}`);
    }

    if (!fs.existsSync(this.storiesDir)) {
      fs.mkdirSync(this.storiesDir, { recursive: true });
      console.log(`Created stories directory: ${this.storiesDir}`);
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
        console.log(`Loaded existing artifact index with ${Object.keys(this.index.stories).length} stories`);
      } catch (error) {
        console.error('Error loading artifact index, creating new one:', error.message);
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
      stories: {}
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
      console.error('Error saving artifact index:', error.message);
      throw error;
    }
  }

  /**
   * Create a new story with stages
   * @param {string} storyId - Unique story ID
   * @param {Array} storyStages - Array of stage objects with { stageId, stageNumber }
   * @returns {Object} Created story object
   */
  createStory(storyId, storyStages) {
    if (!storyId || !storyStages || storyStages.length === 0) {
      throw new Error('Story ID and stages are required');
    }

    // Create story directory structure
    const storyDir = path.join(this.storiesDir, storyId);
    const stagesDir = path.join(storyDir, 'stages');

    if (!fs.existsSync(storyDir)) {
      fs.mkdirSync(storyDir, { recursive: true });
    }

    if (!fs.existsSync(stagesDir)) {
      fs.mkdirSync(stagesDir, { recursive: true });
    }

    // Create stage directories
    const stages = {};
    storyStages.forEach(stage => {
      const stagePath = path.join(stagesDir, stage.stageId);
      if (!fs.existsSync(stagePath)) {
        fs.mkdirSync(stagePath, { recursive: true });
      }

      stages[stage.stageId] = {
        stageId: stage.stageId,
        stageNumber: stage.stageNumber,
        title: null,
        image: null,
        description: null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
    });

    // Create story metadata file
    const storyMetadata = {
      storyId,
      totalStages: storyStages.length,
      stages,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    const metadataPath = path.join(storyDir, 'metadata.json');
    fs.writeFileSync(metadataPath, JSON.stringify(storyMetadata, null, 2), 'utf-8');

    // Update main index
    this.index.stories[storyId] = {
      storyId,
      totalStages: storyStages.length,
      completedStages: 0,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    this.saveIndex();
    console.log(`Created story: ${storyId} with ${storyStages.length} stages`);

    return storyMetadata;
  }

  /**
   * Get story metadata
   * @param {string} storyId - Story ID
   * @returns {Object} Story metadata
   */
  getStory(storyId) {
    const storyDir = path.join(this.storiesDir, storyId);
    const metadataPath = path.join(storyDir, 'metadata.json');

    if (!fs.existsSync(metadataPath)) {
      throw new Error(`Story not found: ${storyId}`);
    }

    try {
      const data = fs.readFileSync(metadataPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      throw new Error(`Error reading story metadata: ${error.message}`);
    }
  }

  /**
   * Store title for a stage
   * @param {string} storyId - Story ID
   * @param {string} stageId - Stage ID
   * @param {string} title - Title text
   * @returns {Object} Updated stage metadata
   */
  storeTitle(storyId, stageId, title) {
    const stageDir = path.join(this.storiesDir, storyId, 'stages', stageId);
    const titlePath = path.join(stageDir, 'title.txt');
    const storyMetadataPath = path.join(this.storiesDir, storyId, 'metadata.json');

    if (!fs.existsSync(stageDir)) {
      throw new Error(`Stage not found: ${storyId}/${stageId}`);
    }

    try {
      fs.writeFileSync(titlePath, title.trim(), 'utf-8');

      // Update story metadata
      const storyMetadata = JSON.parse(fs.readFileSync(storyMetadataPath, 'utf-8'));
      storyMetadata.stages[stageId].title = title.trim();
      storyMetadata.stages[stageId].updatedAt = new Date().toISOString();
      storyMetadata.updatedAt = new Date().toISOString();
      fs.writeFileSync(storyMetadataPath, JSON.stringify(storyMetadata, null, 2), 'utf-8');

      console.log(`Stored title for stage ${stageId} in story ${storyId}`);
      return storyMetadata.stages[stageId];
    } catch (error) {
      throw new Error(`Error storing title: ${error.message}`);
    }
  }

  /**
   * Store image for a stage
   * @param {string} storyId - Story ID
   * @param {string} stageId - Stage ID
   * @param {Buffer} imageBuffer - Image file buffer
   * @param {string} originalFileName - Original file name (for extension)
   * @returns {Object} Updated stage metadata
   */
  storeImage(storyId, stageId, imageBuffer, originalFileName) {
    const stageDir = path.join(this.storiesDir, storyId, 'stages', stageId);
    const fileExtension = path.extname(originalFileName);
    const imagePath = path.join(stageDir, `image${fileExtension}`);
    const storyMetadataPath = path.join(this.storiesDir, storyId, 'metadata.json');

    if (!fs.existsSync(stageDir)) {
      throw new Error(`Stage not found: ${storyId}/${stageId}`);
    }

    try {
      // Remove existing image if any
      const existingImages = fs.readdirSync(stageDir).filter(f => f.startsWith('image.'));
      existingImages.forEach(img => {
        fs.unlinkSync(path.join(stageDir, img));
      });

      // Write new image
      fs.writeFileSync(imagePath, imageBuffer);

      // Update story metadata
      const storyMetadata = JSON.parse(fs.readFileSync(storyMetadataPath, 'utf-8'));
      storyMetadata.stages[stageId].image = `image${fileExtension}`;
      storyMetadata.stages[stageId].updatedAt = new Date().toISOString();
      storyMetadata.updatedAt = new Date().toISOString();
      fs.writeFileSync(storyMetadataPath, JSON.stringify(storyMetadata, null, 2), 'utf-8');

      console.log(`Stored image for stage ${stageId} in story ${storyId}`);
      return storyMetadata.stages[stageId];
    } catch (error) {
      throw new Error(`Error storing image: ${error.message}`);
    }
  }

  /**
   * Store description for a stage
   * @param {string} storyId - Story ID
   * @param {string} stageId - Stage ID
   * @param {string} description - Description text
   * @returns {Object} Updated stage metadata
   */
  storeDescription(storyId, stageId, description) {
    const stageDir = path.join(this.storiesDir, storyId, 'stages', stageId);
    const descriptionPath = path.join(stageDir, 'description.txt');
    const storyMetadataPath = path.join(this.storiesDir, storyId, 'metadata.json');

    if (!fs.existsSync(stageDir)) {
      throw new Error(`Stage not found: ${storyId}/${stageId}`);
    }

    try {
      fs.writeFileSync(descriptionPath, description.trim(), 'utf-8');

      // Update story metadata
      const storyMetadata = JSON.parse(fs.readFileSync(storyMetadataPath, 'utf-8'));
      storyMetadata.stages[stageId].description = description.trim();
      storyMetadata.stages[stageId].updatedAt = new Date().toISOString();
      storyMetadata.updatedAt = new Date().toISOString();
      fs.writeFileSync(storyMetadataPath, JSON.stringify(storyMetadata, null, 2), 'utf-8');

      console.log(`Stored description for stage ${stageId} in story ${storyId}`);
      return storyMetadata.stages[stageId];
    } catch (error) {
      throw new Error(`Error storing description: ${error.message}`);
    }
  }

  /**
   * Get stage metadata
   * @param {string} storyId - Story ID
   * @param {string} stageId - Stage ID
   * @returns {Object} Stage metadata
   */
  getStage(storyId, stageId) {
    const storyMetadata = this.getStory(storyId);
    if (!storyMetadata.stages[stageId]) {
      throw new Error(`Stage not found: ${stageId}`);
    }
    return storyMetadata.stages[stageId];
  }

  /**
   * Get image buffer for a stage
   * @param {string} storyId - Story ID
   * @param {string} stageId - Stage ID
   * @returns {Buffer} Image buffer
   */
  getImageBuffer(storyId, stageId) {
    const stageDir = path.join(this.storiesDir, storyId, 'stages', stageId);
    const images = fs.readdirSync(stageDir).filter(f => f.startsWith('image.'));

    if (images.length === 0) {
      throw new Error(`No image found for stage ${stageId}`);
    }

    const imagePath = path.join(stageDir, images[0]);
    return fs.readFileSync(imagePath);
  }

  /**
   * Get title text for a stage
   * @param {string} storyId - Story ID
   * @param {string} stageId - Stage ID
   * @returns {string} Title text
   */
  getTitle(storyId, stageId) {
    const titlePath = path.join(this.storiesDir, storyId, 'stages', stageId, 'title.txt');
    if (!fs.existsSync(titlePath)) {
      return null;
    }
    return fs.readFileSync(titlePath, 'utf-8');
  }

  /**
   * Get description text for a stage
   * @param {string} storyId - Story ID
   * @param {string} stageId - Stage ID
   * @returns {string} Description text
   */
  getDescription(storyId, stageId) {
    const descriptionPath = path.join(this.storiesDir, storyId, 'stages', stageId, 'description.txt');
    if (!fs.existsSync(descriptionPath)) {
      return null;
    }
    return fs.readFileSync(descriptionPath, 'utf-8');
  }

  /**
   * Check if a stage is complete (has title, image, and description)
   * @param {string} storyId - Story ID
   * @param {string} stageId - Stage ID
   * @returns {boolean} True if stage is complete
   */
  isStageComplete(storyId, stageId) {
    try {
      const stage = this.getStage(storyId, stageId);
      return stage.title !== null && stage.image !== null && stage.description !== null;
    } catch (error) {
      return false;
    }
  }

  /**
   * Get all complete stages for a story
   * @param {string} storyId - Story ID
   * @returns {Array} Array of complete stages
   */
  getCompleteStages(storyId) {
    const storyMetadata = this.getStory(storyId);
    return Object.values(storyMetadata.stages).filter(stage =>
      stage.title !== null && stage.image !== null && stage.description !== null
    );
  }

  /**
   * Get all incomplete stages for a story
   * @param {string} storyId - Story ID
   * @returns {Array} Array of incomplete stages
   */
  getIncompleteStages(storyId) {
    const storyMetadata = this.getStory(storyId);
    return Object.values(storyMetadata.stages).filter(stage =>
      stage.title === null || stage.image === null || stage.description === null
    );
  }

  /**
   * Clear all artifacts (for testing/reset)
   */
  clearAll() {
    try {
      if (fs.existsSync(this.storiesDir)) {
        fs.rmSync(this.storiesDir, { recursive: true });
      }
      this.createNewIndex();
      console.log('All artifacts cleared');
    } catch (error) {
      console.error('Error clearing artifacts:', error.message);
      throw error;
    }
  }

  /**
   * Delete a specific story
   * @param {string} storyId - Story ID
   */
  deleteStory(storyId) {
    try {
      const storyDir = path.join(this.storiesDir, storyId);
      if (fs.existsSync(storyDir)) {
        fs.rmSync(storyDir, { recursive: true });
      }
      delete this.index.stories[storyId];
      this.saveIndex();
      console.log(`Deleted story: ${storyId}`);
    } catch (error) {
      console.error(`Error deleting story ${storyId}:`, error.message);
      throw error;
    }
  }
}

module.exports = ArtifactIdentificationHandler;
