const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const multer = require('multer');
<<<<<<< HEAD
const ImageAndDescriptionHandler = require('./image_and_description_input_handler');
=======
>>>>>>> 8971765 (added a rudimentary implementation for a node server that handles the http requests)

const app = express();
const PORT = process.env.PORT || 3000;

// Middleware - increase payload size limits for large file uploads
app.use(express.json({ limit: '50mb' }));
app.use(express.text({ limit: '50mb' }));
app.use(express.urlencoded({ limit: '50mb', extended: true }));

// Configure multer for file uploads with increased size limits
const upload = multer({
  storage: multer.memoryStorage(),
  limits: {
    fileSize: 50 * 1024 * 1024, // 50MB per file
    files: 50 // Allow up to 50 files
  }
});

// Load OpenAPI specification
const openapiPath = path.join(__dirname, '../story_spark_server_api.yml');
let openapi;

try {
  const yamlContent = fs.readFileSync(openapiPath, 'utf8');
  openapi = yaml.load(yamlContent);
  console.log('✓ OpenAPI specification loaded');
} catch (error) {
  console.error('Failed to load OpenAPI specification:', error.message);
  process.exit(1);
}

// Helper function to add rate limit headers
function addRateLimitHeaders(res) {
  res.set('X-RateLimit-Limit', '100');
  res.set('X-RateLimit-Remaining', '75');
  res.set('X-RateLimit-Reset', Math.floor(Date.now() / 1000) + 3600);
}

// Helper function to send Problem Details response
function sendProblem(res, status, title, detail) {
  addRateLimitHeaders(res);
  res.status(status).type('application/problem+json').json({
    status,
    title,
    detail,
    instance: `urn:uuid:${Date.now()}`
  });
}

<<<<<<< HEAD
// Initialize file system storage handler
const storageHandler = new ImageAndDescriptionHandler('./uploads');

// Processing state
const processingState = {
  status: 'idle',
  progress: 0
=======
// In-memory storage for demonstration
const uploadedData = {
  images: [],
  descriptions: [],
  titles: [],
  processing: {
    status: 'idle',
    progress: 0
  }
>>>>>>> 8971765 (added a rudimentary implementation for a node server that handles the http requests)
};

// Parse OpenAPI paths and register routes
Object.entries(openapi.paths).forEach(([pathPattern, pathItem]) => {
  // Convert OpenAPI path pattern to Express pattern (e.g., {id} -> :id)
  const expressPath = pathPattern.replace(/{([^}]+)}/g, ':$1');

  // Register GET handler
  if (pathItem.get) {
    app.get(expressPath, (req, res) => {
      console.log(`[GET] ${pathPattern}`);
      addRateLimitHeaders(res);

      try {
        if (pathPattern === '/test') {
          // Health check endpoint
          res.status(200).json({ status: 'operational', message: 'API is healthy' });
        } else if (pathPattern === '/process-images') {
          // Get processing progress
<<<<<<< HEAD
          const stats = storageHandler.getStatistics();
          res.status(200).json({
            status: processingState.status,
            progress: processingState.progress,
            message: `Processing ${stats.totalItems} images`,
            itemsReady: stats.completeItems,
            itemsIncomplete: stats.incompleteItems
          });
        } else if (pathPattern === '/processing-result') {
          // Retrieve processing result
          if (processingState.status === 'completed') {
            const completeItems = storageHandler.getCompleteItems();
            const results = completeItems.map(item => ({
              id: item.id,
              title: item.title,
              description: item.description,
              originalImageName: item.originalName,
              imagePath: `/api/images/${item.id}` // API endpoint to retrieve image
            }));

            res.status(200).json({
              text: results.map(r => `${r.title}: ${r.description}`).join(' | '),
              images: results,
              count: results.length
=======
          res.status(200).json({
            status: uploadedData.processing.status,
            progress: uploadedData.processing.progress,
            message: `Processing ${uploadedData.images.length} images`
          });
        } else if (pathPattern === '/processing-result') {
          // Retrieve processing result
          if (uploadedData.processing.status === 'completed') {
            res.status(200).json({
              text: 'Generated story from your images and descriptions.',
              images: uploadedData.images.map((_, idx) => `https://api.server.test/v1/processed-image-${idx}`)
>>>>>>> 8971765 (added a rudimentary implementation for a node server that handles the http requests)
            });
          } else {
            sendProblem(res, 404, 'Not Found', 'Processing has not been completed yet');
          }
        } else {
          sendProblem(res, 404, 'Not Found', `Endpoint ${pathPattern} not implemented`);
        }
      } catch (error) {
        console.error(`Error handling GET ${pathPattern}:`, error);
        sendProblem(res, 500, 'Internal Server Error', error.message);
      }
    });
  }

  // Register POST handler
  if (pathItem.post) {
    app.post(expressPath, (req, res) => {
      console.log(`[POST] ${pathPattern}`);
      addRateLimitHeaders(res);

      try {
        if (pathPattern === '/upload-images') {
          // Handle multipart/form-data file upload
          upload.array('images')(req, res, (err) => {
            if (err) {
              return sendProblem(res, 400, 'Bad Request', 'File upload failed: ' + err.message);
            }

            if (!req.files || req.files.length === 0) {
              return sendProblem(res, 400, 'Bad Request', 'No images provided');
            }

<<<<<<< HEAD
            try {
              const storedImages = storageHandler.storeImages(req.files);
              res.status(200).json({
                message: `Successfully uploaded and stored ${req.files.length} images`,
                count: req.files.length,
                items: storedImages.map(img => ({
                  id: img.id,
                  originalName: img.originalName,
                  size: img.size,
                  mimeType: img.mimeType,
                  uploadedAt: img.uploadedAt
                }))
              });
            } catch (storageError) {
              return sendProblem(res, 500, 'Internal Server Error', 'Failed to store images: ' + storageError.message);
            }
=======
            uploadedData.images = req.files.map(f => f.originalname);
            console.log(`Uploaded ${req.files.length} images`);
            res.status(200).json({
              message: `Successfully uploaded ${req.files.length} images`,
              count: req.files.length
            });
>>>>>>> 8971765 (added a rudimentary implementation for a node server that handles the http requests)
          });
          return;
        } else if (pathPattern === '/upload-descriptions') {
          // Handle JSON descriptions
          if (!req.body.descriptions || !Array.isArray(req.body.descriptions)) {
            return sendProblem(res, 400, 'Bad Request', 'descriptions field is required and must be an array');
          }

<<<<<<< HEAD
          try {
            const result = storageHandler.storeDescriptions(req.body.descriptions);
            res.status(200).json({
              message: `Successfully processed ${req.body.descriptions.length} descriptions`,
              count: req.body.descriptions.length,
              stored: result.stored,
              failed: result.failed,
              errors: result.errors.length > 0 ? result.errors : undefined
            });
          } catch (storageError) {
            return sendProblem(res, 400, 'Bad Request', storageError.message);
          }
=======
          uploadedData.descriptions = req.body.descriptions;
          console.log(`Uploaded ${req.body.descriptions.length} descriptions`);
          res.status(200).json({
            message: `Successfully uploaded ${req.body.descriptions.length} descriptions`,
            count: req.body.descriptions.length
          });
>>>>>>> 8971765 (added a rudimentary implementation for a node server that handles the http requests)
        } else if (pathPattern === '/upload-titles') {
          // Handle JSON titles
          if (!req.body.titles || !Array.isArray(req.body.titles)) {
            return sendProblem(res, 400, 'Bad Request', 'titles field is required and must be an array');
          }

<<<<<<< HEAD
          try {
            const result = storageHandler.storeTitles(req.body.titles);
            res.status(200).json({
              message: `Successfully processed ${req.body.titles.length} titles`,
              count: req.body.titles.length,
              stored: result.stored,
              failed: result.failed,
              errors: result.errors.length > 0 ? result.errors : undefined
            });
          } catch (storageError) {
            return sendProblem(res, 400, 'Bad Request', storageError.message);
          }
        } else if (pathPattern === '/process-images') {
          // Start image processing
          if (processingState.status === 'processing') {
            return sendProblem(res, 409, 'Conflict', 'Processing is already in progress');
          }

          const completeItems = storageHandler.getCompleteItems();
          if (completeItems.length === 0) {
            return sendProblem(res, 400, 'Bad Request', 'No complete items (images with titles and descriptions) available for processing');
          }

          processingState.status = 'processing';
          processingState.progress = 0;

          // Simulate processing
          const processingInterval = setInterval(() => {
            processingState.progress += 20;
            if (processingState.progress >= 100) {
              processingState.status = 'completed';
              processingState.progress = 100;
=======
          uploadedData.titles = req.body.titles;
          console.log(`Uploaded ${req.body.titles.length} titles`);
          res.status(200).json({
            message: `Successfully uploaded ${req.body.titles.length} titles`,
            count: req.body.titles.length
          });
        } else if (pathPattern === '/process-images') {
          // Start image processing
          if (uploadedData.processing.status === 'processing') {
            return sendProblem(res, 409, 'Conflict', 'Processing is already in progress');
          }

          uploadedData.processing.status = 'processing';
          uploadedData.processing.progress = 0;

          // Simulate processing
          const processingInterval = setInterval(() => {
            uploadedData.processing.progress += 20;
            if (uploadedData.processing.progress >= 100) {
              uploadedData.processing.status = 'completed';
              uploadedData.processing.progress = 100;
>>>>>>> 8971765 (added a rudimentary implementation for a node server that handles the http requests)
              clearInterval(processingInterval);
              console.log('Image processing completed');
            }
          }, 2000);

          res.status(202).json({
            message: 'Processing started',
<<<<<<< HEAD
            status: 'processing',
            itemsBeingProcessed: completeItems.length
=======
            status: 'processing'
>>>>>>> 8971765 (added a rudimentary implementation for a node server that handles the http requests)
          });
        } else {
          sendProblem(res, 404, 'Not Found', `Endpoint ${pathPattern} not implemented`);
        }
      } catch (error) {
        console.error(`Error handling POST ${pathPattern}:`, error);
        sendProblem(res, 500, 'Internal Server Error', error.message);
      }
    });
  }

  // Register DELETE handler
  if (pathItem.delete) {
    app.delete(expressPath, (req, res) => {
      console.log(`[DELETE] ${pathPattern}`);
      addRateLimitHeaders(res);

      try {
        if (pathPattern === '/upload-images') {
<<<<<<< HEAD
          // Abort image upload (clear all stored data)
          storageHandler.clearAll();
          processingState.status = 'idle';
          processingState.progress = 0;
          res.status(200).json({ message: 'All uploads cleared successfully' });
        } else if (pathPattern === '/process-images') {
          // Abort image processing
          processingState.status = 'idle';
          processingState.progress = 0;
=======
          // Abort image upload
          uploadedData.images = [];
          res.status(200).json({ message: 'Upload aborted successfully' });
        } else if (pathPattern === '/process-images') {
          // Abort image processing
          uploadedData.processing.status = 'idle';
          uploadedData.processing.progress = 0;
>>>>>>> 8971765 (added a rudimentary implementation for a node server that handles the http requests)
          res.status(200).json({ message: 'Processing aborted successfully' });
        } else {
          sendProblem(res, 404, 'Not Found', `Endpoint ${pathPattern} not implemented`);
        }
      } catch (error) {
        console.error(`Error handling DELETE ${pathPattern}:`, error);
        sendProblem(res, 500, 'Internal Server Error', error.message);
      }
    });
  }
});

// 404 handler for unregistered routes
app.use((req, res) => {
  addRateLimitHeaders(res);
  sendProblem(res, 404, 'Not Found', `Route ${req.method} ${req.path} not found`);
});

// Error handler
app.use((err, req, res, next) => {
  console.error('Unhandled error:', err);
  addRateLimitHeaders(res);
  sendProblem(res, 500, 'Internal Server Error', 'An unexpected error occurred');
});

// Start server
app.listen(PORT, () => {
  console.log(`\n╔════════════════════════════════════════════╗`);
  console.log(`║  StorySpark API Server Started             ║`);
  console.log(`║  Server: http://localhost:${PORT}          ${' '.repeat(PORT.toString().length > 4 ? 0 : 4 - PORT.toString().length)}║`);
  console.log(`║  OpenAPI: ${openapiPath.split('/').slice(-1)[0]}                    ║`);
  console.log(`╚════════════════════════════════════════════╝\n`);
  console.log('Available endpoints:');
  Object.keys(openapi.paths).forEach(path => {
    const methods = Object.keys(openapi.paths[path]).filter(k => ['get', 'post', 'put', 'delete', 'patch'].includes(k)).map(m => m.toUpperCase());
    console.log(`  ${methods.join(',')} ${path}`);
  });
  console.log('\n');
});

module.exports = app;
