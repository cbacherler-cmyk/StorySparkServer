# User Management System Implementation Summary

## Overview
The backend API has been successfully extended with a comprehensive user management system. Each user now has their own isolated data storage, and all operations are authenticated and user-scoped.

## Key Changes

### 1. New User Handler (`user_handling.js`)
A complete user management module that handles:
- **User Registration**: Create new user accounts with username, email, and password
- **User Authentication**: Login with credentials and receive session tokens
- **Session Management**: In-memory session storage using tokens
- **User Data Isolation**: Each user has a dedicated directory structure
- **User Profile**: Retrieve authenticated user information

### 2. Authentication System
- **Session Tokens**: Generated on registration and login
- **Token Validation**: All protected endpoints require `x-session-token` header
- **Middleware**: Authentication middleware validates tokens on all protected routes
- **Public Endpoints**: `/test`, `/register`, and `/login` are publicly accessible

### 3. User-Scoped Data Storage
Each authenticated user's data is stored in a dedicated directory structure:
```
uploads/users/
├── {userId}/
│   ├── metadata.json                 # User credentials and info
│   ├── stories/
│   │   ├── index.json               # Story index for this user
│   │   └── {storyId}/
│   │       ├── metadata.json        # Story metadata
│   │       └── stages/
│   │           └── {stageId}/       # Stage data
│   └── artifacts/
│       ├── images/                  # User's images
│       ├── descriptions/            # User's descriptions
│       └── metadata/                # User's metadata
```

### 4. Protected Endpoints
All story operations now require authentication:
- `POST /upload-images` - Upload images for a story stage
- `POST /upload-descriptions` - Add descriptions to story stages
- `POST /upload-titles` - Add titles to story stages
- `POST /process-images` - Start image processing
- `GET /process-images` - Check processing status
- `DELETE /process-images` - Cancel processing
- `GET /processing-result` - Retrieve processed results
- `POST /generate-new-story` - Create a new story
- `DELETE /upload-images` - Clear user's data

### 5. New Authentication Endpoints
- `POST /register` - Register a new user account
- `POST /login` - Login and receive session token
- `POST /logout` - Invalidate current session
- `GET /user/profile` - Get current user's profile information

### 6. OpenAPI Specification Updates
Updated `story_spark_server_api.yml` with:
- Authentication endpoints documentation
- `x-session-token` header parameter on protected endpoints
- New `Unauthorized` response definition (401)
- Proper security documentation

## Data Isolation Example

**User 1 (user_1777793948206_zrqfgl0sr):**
- Story 1777793957338-1ycheffmp
- Stored in: `uploads/users/user_1777793948206_zrqfgl0sr/stories/`

**User 2 (user_1777793973152_axty81u1s):**
- Story 1777793973167-4v76ea1z3
- Stored in: `uploads/users/user_1777793973152_axty81u1s/stories/`

Each user can only access their own data through their session token.

## Session Token Usage

All authenticated requests require the session token in one of these ways:

```bash
# Header
curl -X POST http://localhost:3000/generate-new-story \
  -H "x-session-token: token_xxxxx" \
  -d '{"stages":3}'

# Request body
curl -X POST http://localhost:3000/generate-new-story \
  -d '{"stages":3, "sessionToken":"token_xxxxx"}'

# Query parameter
curl -X GET "http://localhost:3000/user/profile?sessionToken=token_xxxxx"
```

## Testing the System

### Register a User
```bash
curl -X POST http://localhost:3000/register \
  -H "Content-Type: application/json" \
  -d '{"username":"user1","email":"user1@example.com","password":"pass123"}'
```

Response:
```json
{
  "userId": "user_1777793948206_zrqfgl0sr",
  "username": "user1",
  "email": "user1@example.com",
  "sessionToken": "token_1777793948207_6lfhvhgvu7c",
  "message": "User registered successfully"
}
```

### Login
```bash
curl -X POST http://localhost:3000/login \
  -H "Content-Type: application/json" \
  -d '{"username":"user1","password":"pass123"}'
```

### Create a Story (Authenticated)
```bash
curl -X POST http://localhost:3000/generate-new-story \
  -H "Content-Type: application/json" \
  -H "x-session-token: token_1777793948207_6lfhvhgvu7c" \
  -d '{"stages":3}'
```

### Get User Profile
```bash
curl -X GET http://localhost:3000/user/profile \
  -H "x-session-token: token_1777793948207_6lfhvhgvu7c"
```

## Security Notes

⚠️ **Important**: For production use:
1. Implement password hashing (bcrypt, argon2)
2. Use HTTPS/TLS for all connections
3. Add rate limiting per user
4. Add CSRF protection
5. Implement token expiration
6. Store sessions in a database instead of memory
7. Add input validation and sanitization
8. Implement audit logging

## File Structure Updates

- `server/user_handling.js` - New user management module
- `server/server.js` - Updated with authentication middleware and user-scoped handlers
- `server/image_and_description_input_handler.js` - No changes needed (backward compatible)
- `server/artifact_identification_handler.js` - Minor fix for image file filtering
- `story_spark_server_api.yml` - Updated with authentication endpoints

## Backward Compatibility

The global storage handler (`storageHandler`) is still available for backward compatibility but is not used in protected routes. All new operations use user-scoped storage through `getUserStorageHandler(userId)`.

## Processing State Management

Processing state is now maintained per-user:
```javascript
processingState = new Map(); // userId -> { status, progress }
```

This allows multiple users to process images simultaneously without interfering with each other.
