const fs = require('fs');
const path = require('path');

/**
 * UserHandler manages user authentication, sessions, and user-scoped data.
 * It stores user credentials, maintains active sessions, and organizes user data.
 */
class UserHandler {
  constructor(baseStoragePath = './uploads') {
    this.baseStoragePath = path.join(__dirname, baseStoragePath);
    this.usersDir = path.join(this.baseStoragePath, 'users');
    this.usersIndexFile = path.join(this.baseStoragePath, 'users_index.json');
    this.sessionsMap = new Map(); // In-memory session storage (user token -> user data)

    // Initialize directories
    this.initializeDirectories();

    // Load users index
    this.loadOrCreateUsersIndex();

    console.log('✓ User Handler initialized');
  }

  /**
   * Initialize required directories
   */
  initializeDirectories() {
    if (!fs.existsSync(this.baseStoragePath)) {
      fs.mkdirSync(this.baseStoragePath, { recursive: true });
    }

    if (!fs.existsSync(this.usersDir)) {
      fs.mkdirSync(this.usersDir, { recursive: true });
      console.log(`Created users directory: ${this.usersDir}`);
    }
  }

  /**
   * Load or create users index
   */
  loadOrCreateUsersIndex() {
    if (fs.existsSync(this.usersIndexFile)) {
      try {
        const data = fs.readFileSync(this.usersIndexFile, 'utf-8');
        this.usersIndex = JSON.parse(data);
        console.log(`Loaded ${Object.keys(this.usersIndex.users).length} registered users`);
      } catch (error) {
        console.error('Error loading users index:', error.message);
        this.createNewUsersIndex();
      }
    } else {
      this.createNewUsersIndex();
    }
  }

  /**
   * Create a fresh users index
   */
  createNewUsersIndex() {
    this.usersIndex = {
      version: '1.0',
      createdAt: new Date().toISOString(),
      users: {}
    };
    this.saveUsersIndex();
  }

  /**
   * Save users index to file
   */
  saveUsersIndex() {
    try {
      fs.writeFileSync(
        this.usersIndexFile,
        JSON.stringify(this.usersIndex, null, 2),
        'utf-8'
      );
    } catch (error) {
      console.error('Error saving users index:', error.message);
      throw error;
    }
  }

  /**
   * Generate a unique user ID
   */
  generateUserId() {
    return `user_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
  }

  /**
   * Generate a session token
   */
  generateSessionToken() {
    return `token_${Date.now()}_${Math.random().toString(36).substr(2, 16)}`;
  }

  /**
   * Register a new user
   * @param {string} username - Username
   * @param {string} email - Email address
   * @param {string} password - Password (in production, should be hashed)
   * @returns {Object} User object with userId and session token
   */
  registerUser(username, email, password) {
    if (!username || !email || !password) {
      throw new Error('Username, email, and password are required');
    }

    // Check if user already exists
    const existingUser = Object.values(this.usersIndex.users).find(
      u => u.username === username || u.email === email
    );
    if (existingUser) {
      throw new Error('Username or email already exists');
    }

    const userId = this.generateUserId();
    const userDir = path.join(this.usersDir, userId);

    try {
      // Create user directory
      fs.mkdirSync(userDir, { recursive: true });

      // Create user metadata
      const user = {
        userId,
        username,
        email,
        password, // In production, use bcrypt or similar
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      // Save user metadata
      const userMetadataPath = path.join(userDir, 'metadata.json');
      fs.writeFileSync(userMetadataPath, JSON.stringify(user, null, 2), 'utf-8');

      // Update users index
      this.usersIndex.users[userId] = {
        userId,
        username,
        email,
        createdAt: new Date().toISOString()
      };
      this.saveUsersIndex();

      // Create session
      const sessionToken = this.generateSessionToken();
      this.sessionsMap.set(sessionToken, {
        userId,
        username,
        email,
        loginTime: new Date().toISOString()
      });

      console.log(`User registered: ${username} (${userId})`);

      return {
        userId,
        username,
        email,
        sessionToken,
        message: 'User registered successfully'
      };
    } catch (error) {
      // Clean up on failure
      if (fs.existsSync(userDir)) {
        fs.rmSync(userDir, { recursive: true });
      }
      throw error;
    }
  }

  /**
   * Login a user
   * @param {string} username - Username
   * @param {string} password - Password
   * @returns {Object} Session token and user info
   */
  loginUser(username, password) {
    if (!username || !password) {
      throw new Error('Username and password are required');
    }

    // Find user
    const userEntry = Object.values(this.usersIndex.users).find(u => u.username === username);
    if (!userEntry) {
      throw new Error('Invalid username or password');
    }

    // Load user metadata and verify password
    const userDir = path.join(this.usersDir, userEntry.userId);
    const metadataPath = path.join(userDir, 'metadata.json');

    try {
      const userData = JSON.parse(fs.readFileSync(metadataPath, 'utf-8'));

      // In production, use bcrypt to verify password
      if (userData.password !== password) {
        throw new Error('Invalid username or password');
      }

      // Create session
      const sessionToken = this.generateSessionToken();
      this.sessionsMap.set(sessionToken, {
        userId: userData.userId,
        username: userData.username,
        email: userData.email,
        loginTime: new Date().toISOString()
      });

      console.log(`User logged in: ${username}`);

      return {
        userId: userData.userId,
        username: userData.username,
        email: userData.email,
        sessionToken,
        message: 'Login successful'
      };
    } catch (error) {
      throw error;
    }
  }

  /**
   * Verify session token
   * @param {string} sessionToken - Session token
   * @returns {Object|null} Session data if valid, null otherwise
   */
  verifySession(sessionToken) {
    return this.sessionsMap.get(sessionToken) || null;
  }

  /**
   * Logout user (invalidate session)
   * @param {string} sessionToken - Session token
   * @returns {boolean} True if logout was successful
   */
  logoutUser(sessionToken) {
    const deleted = this.sessionsMap.delete(sessionToken);
    if (deleted) {
      console.log('User logged out');
    }
    return deleted;
  }

  /**
   * Get user directory (scoped to user)
   * @param {string} userId - User ID
   * @returns {string} User directory path
   */
  getUserDir(userId) {
    return path.join(this.usersDir, userId);
  }

  /**
   * Get user stories directory
   * @param {string} userId - User ID
   * @returns {string} User stories directory path
   */
  getUserStoriesDir(userId) {
    const userDir = this.getUserDir(userId);
    const storiesDir = path.join(userDir, 'stories');

    if (!fs.existsSync(storiesDir)) {
      fs.mkdirSync(storiesDir, { recursive: true });
    }

    return storiesDir;
  }

  /**
   * Get user artifacts directory
   * @param {string} userId - User ID
   * @returns {string} User artifacts directory path
   */
  getUserArtifactsDir(userId) {
    const userDir = this.getUserDir(userId);
    const artifactsDir = path.join(userDir, 'artifacts');

    if (!fs.existsSync(artifactsDir)) {
      fs.mkdirSync(artifactsDir, { recursive: true });
    }

    return artifactsDir;
  }

  /**
   * Get all sessions (for debugging/admin purposes)
   * @returns {Array} Array of active sessions
   */
  getAllSessions() {
    const sessions = [];
    for (const [token, data] of this.sessionsMap.entries()) {
      sessions.push({
        token: token.substring(0, 10) + '...', // Mask token
        userId: data.userId,
        username: data.username,
        loginTime: data.loginTime
      });
    }
    return sessions;
  }

  /**
   * Get user info
   * @param {string} userId - User ID
   * @returns {Object} User information
   */
  getUserInfo(userId) {
    const userEntry = this.usersIndex.users[userId];
    if (!userEntry) {
      throw new Error(`User not found: ${userId}`);
    }

    return {
      userId,
      username: userEntry.username,
      email: userEntry.email,
      createdAt: userEntry.createdAt
    };
  }

  /**
   * Get all users (for admin purposes)
   * @returns {Array} Array of all users
   */
  getAllUsers() {
    return Object.values(this.usersIndex.users).map(user => ({
      userId: user.userId,
      username: user.username,
      email: user.email,
      createdAt: user.createdAt
    }));
  }
}

module.exports = UserHandler;
