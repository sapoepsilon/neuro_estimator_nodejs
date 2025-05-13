# Neuro Estimator Node.js - Architecture Documentation

## Overview

Neuro Estimator is a Node.js application that leverages Google's Gemini AI to generate detailed cost estimates based on project requirements. The application follows a modular architecture with clear separation of concerns, making it maintainable and extensible.

## System Architecture

The application follows a layered architecture pattern with the following components:

1. **API Layer** - Handles HTTP requests and responses
2. **Controller Layer** - Contains business logic for request handling
3. **Service Layer** - Implements core functionality and external service integration
4. **AI Model Layer** - Manages AI model configurations and interactions

## Directory Structure

```
neuro_estimator_nodejs/
├── aimodel/               # AI model configurations and client
│   ├── aiClient.js        # Google AI client initialization
│   └── geminiModels.js    # Model definitions and configurations
├── controllers/           # Request handlers
│   └── estimatorController.js # Handles estimate generation requests
├── routes/                # API route definitions
│   └── estimatorRoutes.js # Defines API endpoints
├── services/              # Business logic and external services
│   └── geminiService.js   # Gemini AI integration service
├── .env                   # Environment variables
├── index.js               # Application entry point
├── package.json           # Project dependencies
└── README.md              # Project documentation
```

## Component Descriptions

### API Layer

**index.js**

- Entry point for the application
- Sets up Express server and middleware
- Configures error handling
- Mounts route handlers

**routes/estimatorRoutes.js**

- Defines API endpoints
- Maps HTTP methods to controller functions
- Current endpoints:
  - `POST /api/agent` - Generate an estimate using Gemini

### Controller Layer

**controllers/estimatorController.js**

- Validates incoming requests
- Orchestrates the estimate generation process
- Handles error responses
- Key functions:
  - `validateEstimatorRequest()` - Validates request data
  - `handleEstimatorRequest()` - Processes the request and returns the response

### Service Layer

**services/geminiService.js**

- Implements the core functionality for generating estimates
- Interacts with the Gemini AI model
- Processes and validates AI responses
- Key functions:
  - `getEstimatorModel()` - Gets the configured Gemini model
  - `prepareEstimatorPrompt()` - Formats the prompt for the AI model
  - `processGeminiResponse()` - Processes and repairs the AI response
  - `generateEstimate()` - Orchestrates the estimate generation process

### AI Model Layer

**aimodel/aiClient.js**

- Initializes the Google Generative AI client
- Provides a generic model access function
- Key functions:
  - `getModel()` - Returns a configured model instance

**aimodel/geminiModels.js**

- Defines available Gemini models as an enum
- Configures model parameters for different use cases
- Current models:
  - `FLASH_2_0_001` - Gemini 2.0 Flash 001 model

## Data Flow

1. Client sends a POST request to `/api/agent` with project details
2. The request is routed to `handleEstimatorRequest()` in the controller
3. The controller validates the request data
4. If valid, the controller calls `generateEstimate()` in the service layer
5. The service layer:
   - Gets a configured Gemini model instance
   - Prepares a prompt with the request data
   - Sends the prompt to the Gemini AI
   - Processes the response (including JSON repair if needed)
   - Returns the parsed estimate
6. The controller returns the estimate as a JSON response to the client

## Configuration

The application uses environment variables for configuration:

- `PORT` - The port the server listens on (default: 8080)
- `GOOGLE_API_KEY` - API key for Google's Generative AI services

## Extension Points

The architecture is designed to be extensible:

1. **New AI Models**

   - Add new model definitions to `geminiModels.js`
   - Create new service functions for different AI tasks

2. **Additional Endpoints**

   - Add new route handlers in `estimatorRoutes.js`
   - Create corresponding controller functions

3. **Enhanced Functionality**
   - Add middleware for authentication, rate limiting, etc.
   - Implement database integration for storing estimates
   - Create additional services for different business capabilities

## Security Considerations

1. API key is stored in environment variables, not hardcoded
2. Input validation is performed before processing requests
3. Error handling prevents leaking sensitive information

## Future Improvements

Potential areas for enhancement:

1. Add authentication and authorization
2. Implement request logging and monitoring
3. Add caching for frequent requests
4. Create a database for storing estimates and user data
5. Develop a frontend interface for easier interaction
6. Add unit and integration tests
7. Implement rate limiting for API endpoints
