# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Common Development Commands

### Build and Run
- `npm start` - Start the production server on port 8080
- `npm run dev` - Start development server with auto-restart via nodemon

### Testing
- `npm test` - Run all Jest tests (automatically starts/stops server for integration tests)
- `npm run test:watch` - Run Jest tests in watch mode
- `npm run test:coverage` - Run Jest tests with coverage report

### Code Quality
- No linting command configured yet - consider adding ESLint configuration

### How to Test Streaming
When implementing new streaming features, verify they work properly:

1. **Unit Tests** - Test components in isolation without network calls
2. **Integration Tests** - Test against real server with actual HTTP requests
3. **Manual Testing** - Use curl to see real-time streaming:
   ```bash
   # See streaming in action
   curl -N http://localhost:8080/api/stream/test
   
   # Check headers
   curl -i -N http://localhost:8080/api/stream/test
   ```

The Jest integration tests now automatically start/stop the server, making testing easier.

## High-Level Architecture

This is a Node.js/Express application that uses Google's Gemini AI to generate detailed project cost estimates. The architecture follows a layered pattern with clear separation of concerns:

### Core Components

1. **HTTP Streaming Infrastructure** - Supports real-time streaming responses using Server-Sent Events (SSE) pattern with NDJSON format. Includes connection management (3 concurrent connections per user), heartbeat mechanism, and comprehensive error handling.

2. **AI Integration** - Uses Google's Gemini Flash 2.0 model for generating estimates. The AI service layer handles prompt preparation, response processing (including JSON repair), and model configuration.

3. **Authentication** - Supabase JWT-based authentication with development mode bypass. The middleware validates tokens and extracts user information from requests.

4. **Database Integration** - Supabase integration for user management, project storage, and estimate persistence. Uses service role key for server-side operations.

### Key Design Patterns

- **Layered Architecture**: Routes → Controllers → Services → External APIs
- **Middleware Pattern**: Authentication, HTTP streaming setup, error handling
- **Connection Management**: Per-user connection tracking with limits and graceful shutdown
- **Error Classification**: Structured error handling for quota, timeout, auth, and other error types

### Important Services

- `services/geminiService.js` - Core AI integration and estimate generation
- `services/connectionManager.js` - Manages streaming connections per user
- `services/supabaseService.js` - Database client initialization
- `services/projectService.js` - Project and estimate data management
- `utils/streamErrorHandler.js` - Comprehensive error classification and handling

### Environment Configuration

Required environment variables:
- `GOOGLE_API_KEY` - For Gemini AI access
- `SUPABASE_URL` - Supabase project URL
- `SUPABASE_ANON_KEY` - For client-side auth
- `SUPABASE_SERVICE_ROLE_KEY` - For server-side operations
- `PORT` - Server port (default: 8080)
- `NODE_ENV` - Set to 'development' for auth bypass

### API Endpoints

- `POST /api/agent` - Generate AI-powered estimate (requires auth)
- Streaming endpoints for real-time updates (see `routes/streamingRoutes.js`)

### Testing Strategy

The codebase includes comprehensive tests for the HTTP streaming infrastructure:
- Unit tests for connection manager, error handler, and middleware
- Integration tests for end-to-end streaming functionality that test against a real running server
- All tests are now consolidated under Jest framework

**Important Testing Notes:**
- Jest tests automatically start/stop the server via `globalSetup.js` and `globalTeardown.js`
- Integration tests (`__tests__/integration.test.js`) make real HTTP requests to verify streaming works
- Streaming tests verify real HTTP chunked transfer encoding with proper headers
- Heartbeat mechanism sends empty lines every 30 seconds to keep connections alive
- Tests run quickly because they test infrastructure, not actual AI operations

**Test Implementation Updates:**
- Fixed `connectionManager.broadcast()` to check `headersSent` before writing
- Fixed `connectionManager.remove()` to check if `response.end` exists
- Fixed `connectionManager.closeAll()` to only write to connections with `headersSent: true`

- When you implement new features, you want to make sure that the old features are still working by running `npm test`