const express = require('express');
const fs = require('fs');
const path = require('path');
const yaml = require('js-yaml');
const multer = require('multer');
const ImageAndDescriptionHandler = require('./image_and_description_input_handler');
const UserHandler = require('./user_handling');

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

// Initialize user handler
const userHandler = new UserHandler('./uploads');

// Global storage handler (for backward compatibility, but used only for unauthenticated operations)
const storageHandler = new ImageAndDescriptionHandler('./uploads');

// Per-user storage handlers
const userStorageHandlers = new Map(); // userId -> storageHandler

// Processing state (per user)
const processingState = new Map(); // userId -> { status, progress }

/**
 * Middleware to authenticate requests using session token
 */
function authenticateRequest(req, res, next) {
  // Skip authentication for public endpoints
  const publicEndpoints = ['/test', '/register', '/login'];
  if (publicEndpoints.includes(req.path)) {
    return next();
  }

  const sessionToken = req.headers['x-session-token'] || req.body?.sessionToken || req.query?.sessionToken;
  
  if (!sessionToken) {
    return sendProblem(res, 401, 'Unauthorized', 'Session token is required');
  }

  const session = userHandler.verifySession(sessionToken);
  if (!session) {
    return sendProblem(res, 401, 'Unauthorized', 'Invalid or expired session token');
  }

  // Attach session to request
  req.user = session;
  next();
}

// Apply authentication middleware
app.use(authenticateRequest);

/**
 * Get or create user-specific storage handler
 */
function getUserStorageHandler(userId) {
  if (!userStorageHandlers.has(userId)) {
    // User storage path for images/descriptions (legacy structure)
    const userStoragePath = `./uploads/users/${userId}/artifacts`;
    // User-scoped artifact/story storage (ArtifactIdentificationHandler will create 'stories' subdirectory)
    const userArtifactPath = `./uploads/users/${userId}`;
    const handler = new ImageAndDescriptionHandler(userStoragePath, userArtifactPath);
    userStorageHandlers.set(userId, handler);
  }
  return userStorageHandlers.get(userId);
}

/**
 * Get user processing state
 */
function getUserProcessingState(userId) {
  if (!processingState.has(userId)) {
    processingState.set(userId, { status: 'idle', progress: 0 });
  }
  return processingState.get(userId);
}

// Parse OpenAPI paths and register routes

// ===== AUTHENTICATION ENDPOINTS =====
// These are handled manually, not through OpenAPI parsing

/**
 * POST /register - Register a new user
 */
app.post('/register', (req, res) => {
  console.log('[POST] /register');
  addRateLimitHeaders(res);

  try {
    const { username, email, password } = req.body;

    if (!username || !email || !password) {
      return sendProblem(res, 400, 'Bad Request', 'username, email, and password are required');
    }

    const result = userHandler.registerUser(username, email, password);
    res.status(201).json(result);
  } catch (error) {
    console.error('Error during registration:', error);
    const status = error.message.includes('already exists') ? 409 : 400;
    sendProblem(res, status, 'Bad Request', error.message);
  }
});

/**
 * POST /login - Login a user
 */
app.post('/login', (req, res) => {
  console.log('[POST] /login');
  addRateLimitHeaders(res);

  try {
    const { username, password } = req.body;

    if (!username || !password) {
      return sendProblem(res, 400, 'Bad Request', 'username and password are required');
    }

    const result = userHandler.loginUser(username, password);
    res.status(200).json(result);
  } catch (error) {
    console.error('Error during login:', error);
    sendProblem(res, 401, 'Unauthorized', error.message);
  }
});

/**
 * POST /logout - Logout a user
 */
app.post('/logout', (req, res) => {
  console.log('[POST] /logout');
  addRateLimitHeaders(res);

  try {
    const sessionToken = req.headers['x-session-token'] || req.body?.sessionToken;

    if (!sessionToken) {
      return sendProblem(res, 400, 'Bad Request', 'Session token is required');
    }

    const success = userHandler.logoutUser(sessionToken);
    if (success) {
      res.status(200).json({ message: 'Logout successful' });
    } else {
      sendProblem(res, 400, 'Bad Request', 'Invalid session token');
    }
  } catch (error) {
    console.error('Error during logout:', error);
    sendProblem(res, 500, 'Internal Server Error', error.message);
  }
});

/**
 * GET /user/profile - Get current user profile
 */
app.get('/user/profile', (req, res) => {
  console.log('[GET] /user/profile');
  addRateLimitHeaders(res);

  try {
    if (!req.user) {
      return sendProblem(res, 401, 'Unauthorized', 'Authentication required');
    }

    const userInfo = userHandler.getUserInfo(req.user.userId);
    res.status(200).json(userInfo);
  } catch (error) {
    console.error('Error getting user profile:', error);
    sendProblem(res, 500, 'Internal Server Error', error.message);
  }
});

// ===== OPENAPI ROUTES =====

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
          if (!req.user) {
            return sendProblem(res, 401, 'Unauthorized', 'Authentication required');
          }

          const userHandler_instance = getUserStorageHandler(req.user.userId);
          const userState = getUserProcessingState(req.user.userId);
          const stats = userHandler_instance.getStatistics();
          
          res.status(200).json({
            status: userState.status,
            progress: userState.progress,
            message: `Processing ${stats.totalItems} images`,
            itemsReady: stats.completeItems,
            itemsIncomplete: stats.incompleteItems
          });
        } else if (pathPattern === '/processing-result') {
          // Retrieve processing result
          if (!req.user) {
            return sendProblem(res, 401, 'Unauthorized', 'Authentication required');
          }

          const userHandler_instance = getUserStorageHandler(req.user.userId);
          const userState = getUserProcessingState(req.user.userId);
          
          if (userState.status === 'completed') {
            const completeItems = userHandler_instance.getCompleteItems();
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
          // Handle multipart/form-data file upload with stageId and storyId (multiple images)
          if (!req.user) {
            return sendProblem(res, 401, 'Unauthorized', 'Authentication required');
          }

          upload.array('images')(req, res, (err) => {
            if (err) {
              return sendProblem(res, 400, 'Bad Request', 'File upload failed: ' + err.message);
            }

            const storyId = req.body?.storyId || req.query?.storyId;
            const stageId = req.body?.stageId || req.query?.stageId;
            
            if (!storyId) {
              return sendProblem(res, 400, 'Bad Request', 'storyId parameter is required');
            }

            if (!stageId) {
              return sendProblem(res, 400, 'Bad Request', 'stageId parameter is required');
            }

            if (!req.files || req.files.length === 0) {
              return sendProblem(res, 400, 'Bad Request', 'No images provided');
            }

            try {
              // Store each image for the stage
              // Note: Multiple images for the same stage will overwrite, so we store the last one
              const userStorageHandler = getUserStorageHandler(req.user.userId);
              let updatedStage;
              for (const file of req.files) {
                updatedStage = userStorageHandler.storeStageImage(storyId, stageId, file.buffer, file.originalname);
              }
              
              res.status(200).json({
                message: `${req.files.length} image(s) uploaded successfully`,
                storyId,
                stageId,
                imagesCount: req.files.length,
                stage: updatedStage
              });
            } catch (storageError) {
              return sendProblem(res, 400, 'Bad Request', storageError.message);
            }
          });
          return;
        } else if (pathPattern === '/upload-descriptions') {
          // Handle JSON descriptions with stageId and storyId
          if (!req.user) {
            return sendProblem(res, 401, 'Unauthorized', 'Authentication required');
          }

          const storyId = req.body?.storyId;
          const stageId = req.body?.stageId;
          const descriptions = req.body?.descriptions;

          if (!storyId) {
            return sendProblem(res, 400, 'Bad Request', 'storyId parameter is required');
          }

          if (!stageId) {
            return sendProblem(res, 400, 'Bad Request', 'stageId parameter is required');
          }

          if (!descriptions || !Array.isArray(descriptions) || descriptions.length === 0) {
            return sendProblem(res, 400, 'Bad Request', 'descriptions field is required and must be a non-empty array');
          }

          try {
            // Store the first description for the stage
            const description = descriptions[0];
            const userStorageHandler = getUserStorageHandler(req.user.userId);
            const updatedStage = userStorageHandler.storeStageDescription(storyId, stageId, description);
            
            res.status(200).json({
              message: 'Description uploaded successfully',
              storyId,
              stageId,
              stage: updatedStage
            });
          } catch (storageError) {
            return sendProblem(res, 400, 'Bad Request', storageError.message);
          }
        } else if (pathPattern === '/upload-titles') {
          // Handle JSON titles with stageId and storyId
          if (!req.user) {
            return sendProblem(res, 401, 'Unauthorized', 'Authentication required');
          }

          const storyId = req.body?.storyId;
          const stageId = req.body?.stageId;
          const titles = req.body?.titles;

          if (!storyId) {
            return sendProblem(res, 400, 'Bad Request', 'storyId parameter is required');
          }

          if (!stageId) {
            return sendProblem(res, 400, 'Bad Request', 'stageId parameter is required');
          }

          if (!titles || !Array.isArray(titles) || titles.length === 0) {
            return sendProblem(res, 400, 'Bad Request', 'titles field is required and must be a non-empty array');
          }

          try {
            // Store the first title for the stage
            const title = titles[0];
            const userStorageHandler = getUserStorageHandler(req.user.userId);
            const updatedStage = userStorageHandler.storeStageTitle(storyId, stageId, title);
            
            res.status(200).json({
              message: 'Title uploaded successfully',
              storyId,
              stageId,
              stage: updatedStage
            });
          } catch (storageError) {
            return sendProblem(res, 400, 'Bad Request', storageError.message);
          }
        } else if (pathPattern === '/process-images') {
          // Start image processing
          if (!req.user) {
            return sendProblem(res, 401, 'Unauthorized', 'Authentication required');
          }

          const userState = getUserProcessingState(req.user.userId);
          if (userState.status === 'processing') {
            return sendProblem(res, 409, 'Conflict', 'Processing is already in progress');
          }

          const userStorageHandler = getUserStorageHandler(req.user.userId);
          const completeItems = userStorageHandler.getCompleteItems();
          if (completeItems.length === 0) {
            return sendProblem(res, 400, 'Bad Request', 'No complete items (images with titles and descriptions) available for processing');
          }

          userState.status = 'processing';
          userState.progress = 0;

          // Simulate processing
          const processingInterval = setInterval(() => {
            userState.progress += 20;
            if (userState.progress >= 100) {
              userState.status = 'completed';
              userState.progress = 100;
              clearInterval(processingInterval);
              console.log(`Image processing completed for user ${req.user.userId}`);
            }
          }, 2000);

          res.status(202).json({
            message: 'Processing started',
            status: 'processing',
            itemsBeingProcessed: completeItems.length
          });
        } else if (pathPattern === '/generate-new-story') {
          // Generate a new story with specified number of stages
          if (!req.user) {
            return sendProblem(res, 401, 'Unauthorized', 'Authentication required');
          }

          const stages = req.body?.stages || 5;

          // Validate stages parameter
          if (!Number.isInteger(stages) || stages < 1) {
            return sendProblem(res, 400, 'Bad Request', 'stages must be a positive integer');
          }

          try {
            // Generate unique IDs
            const generateUUID = () => {
              return `${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
            };

            const storyId = generateUUID();
            const storyStages = Array.from({ length: stages }, (_, index) => ({
              stageId: generateUUID(),
              stageNumber: index + 1
            }));

            // Create story in artifact handler
            const userStorageHandler = getUserStorageHandler(req.user.userId);
            const storyMetadata = userStorageHandler.createStory(storyId, storyStages);
            console.log(`Created new story for user ${req.user.userId}: ${storyId} with ${stages} stages`);

            res.status(201).json({
              storyId,
              stages: storyStages
            });
          } catch (storageError) {
            return sendProblem(res, 500, 'Internal Server Error', storageError.message);
          }
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
          // Abort image upload (clear all stored data for the user)
          if (!req.user) {
            return sendProblem(res, 401, 'Unauthorized', 'Authentication required');
          }

          const userStorageHandler = getUserStorageHandler(req.user.userId);
          userStorageHandler.clearAll();
          
          const userState = getUserProcessingState(req.user.userId);
          userState.status = 'idle';
          userState.progress = 0;
          
          res.status(200).json({ message: 'All uploads cleared successfully' });
        } else if (pathPattern === '/process-images') {
          // Abort image processing
          if (!req.user) {
            return sendProblem(res, 401, 'Unauthorized', 'Authentication required');
          }

          const userState = getUserProcessingState(req.user.userId);
          userState.status = 'idle';
          userState.progress = 0;
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
