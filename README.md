# Neuro Estimator Node.js

A Node.js application with Express that includes an "agent" route and a Gemini-powered AI estimator.

## Setup

1. Install dependencies:

```
npm install
```

2. Configure your environment variables:

   - Create a `.env` file in the root directory
   - Add your Google API key: `GOOGLE_API_KEY=your_api_key_here`
   - Add your Supabase URL and anon key:
     ```
     SUPABASE_URL=your_supabase_url
     SUPABASE_ANON_KEY=your_supabase_anon_key
     ```

3. Start the server:

```
npm start
```

For development with auto-restart:

```
npm run dev
```

## API Endpoints

### Basic Routes

- `GET /`: Welcome message

### Estimator API

- `POST /api/agent`: Generate a detailed estimate using Gemini Flash 002 (requires authentication)

#### Authentication

The `/api/agent` endpoint requires authentication using a Supabase JWT token. Include the token in the `Authorization` header of your request:

```
Authorization: Bearer your_supabase_jwt_token
```

You can obtain this token from your frontend application after a user signs in with Supabase Auth.

##### Development Mode

For development and testing purposes, the authentication can be bypassed in the following ways:

1. The application automatically detects development mode when `NODE_ENV` is not set or set to `development`
2. In development mode, you can make requests without an authentication token
3. Alternatively, you can include a header `x-dev-mode: true` in your requests

This makes it easier to test the API during development without setting up Supabase credentials.

#### Request Format for Estimator

```json
{
  "projectDetails": {
    "title": "Project Title",
    "description": "Detailed project description",
    "scope": "Project scope information",
    "timeline": "Expected timeline"
  },
  "additionalRequirements": {
    "feature1": "Description of feature 1",
    "feature2": "Description of feature 2"
  },
  "responseStructure": {
    // Optional: Custom structure for the response
    // If not provided, the default structure below will be used
  }
}
```

#### Default Response Format

```json
{
  "estimate": {
    "title": "Title of the estimate",
    "totalAmount": 5000,
    "currency": "USD",
    "lineItems": [
      {
        "description": "Feature Development",
        "quantity": 1,
        "unitPrice": 8080,
        "amount": 8080,
        "subItems": [
          {
            "description": "Frontend Development",
            "quantity": 40,
            "unitPrice": 50,
            "amount": 2000
          },
          {
            "description": "Backend Development",
            "quantity": 20,
            "unitPrice": 50,
            "amount": 1000
          }
        ]
      }
    ]
  }
}
```

#### Example with Custom Response Structure

You can provide your own response structure in the request, and the AI will format its response according to that structure:

```json
{
  "projectDetails": {
    "title": "Mobile App Development",
    "description": "Develop a fitness tracking app",
    "scope": "iOS and Android platforms",
    "timeline": "3 months"
  },
  "responseStructure": {
    "projectEstimate": {
      "projectName": "Project name here",
      "estimatedCost": 0,
      "estimatedDuration": "Duration in weeks/months",
      "phases": [
        {
          "name": "Phase name",
          "duration": "Duration in weeks",
          "cost": 0,
          "tasks": [
            {
              "name": "Task name",
              "hours": 0,
              "rate": 0,
              "cost": 0
            }
          ]
        }
      ]
    }
  }
}
```

The response will follow your custom structure:

```json
{
  "projectEstimate": {
    "projectName": "Fitness Tracking App",
    "estimatedCost": 15000,
    "estimatedDuration": "3 months",
    "phases": [
      {
        "name": "Design Phase",
        "duration": "3 weeks",
        "cost": 4500,
        "tasks": [
          {
            "name": "UI/UX Design",
            "hours": 60,
            "rate": 75,
            "cost": 4500
          }
        ]
      },
      {
        "name": "Development Phase",
        "duration": "8 weeks",
        "cost": 10500,
        "tasks": [
          {
            "name": "iOS Development",
            "hours": 80,
            "rate": 75,
            "cost": 6000
          },
          {
            "name": "Android Development",
            "hours": 60,
            "rate": 75,
            "cost": 4500
          }
        ]
      }
    ]
  }
}
```

## Project Structure

```
├── aimodel/             # AI model configurations and clients
├── controllers/         # Request handlers
├── middleware/          # Express middleware (including auth)
├── routes/              # API route definitions
├── services/            # Business logic and external services
├── supabase/            # Supabase migrations and configurations
├── .env                 # Environment variables (create this file)
├── index.js             # Application entry point
├── package.json         # Project dependencies
└── README.md            # Project documentation
```

## Port

The application runs on port 8080 by default. You can change this by setting the PORT environment variable.

## Authentication

This application uses Application Default Credentials (ADC) for authenticating to Google Cloud services, including the Gemini API via Vertex AI.

### Local Development

For local development, you need to authenticate using the Google Cloud CLI:

1.  Install the [Google Cloud CLI](https://cloud.google.com/sdk/docs/install).
2.  Log in with your user credentials:
    ```bash
    gcloud auth login
    ```
3.  Set up Application Default Credentials:
    ```bash
    gcloud auth application-default login
    ```
    This command will create a credential file in your user's home directory. The client libraries will automatically find and use these credentials.

    Alternatively, you can create a service account, download its JSON key file, and set the `GOOGLE_APPLICATION_CREDENTIALS` environment variable to the path of this key file:
    ```bash
    export GOOGLE_APPLICATION_CREDENTIALS="/path/to/your/keyfile.json"
    ```
    Ensure the service account has the necessary IAM roles (e.g., "Vertex AI User" or more specific roles for Gemini) on your project.

### Deployed GCP Environments

When running in a Google Cloud environment (e.g., Google Compute Engine, Google Kubernetes Engine, Cloud Run, Cloud Functions):

*   The application will automatically use the credentials of the service account attached to the resource (e.g., GCE instance's service account).
*   Ensure that this service account has the necessary IAM permissions (e.g., "Vertex AI User") for the project where the Gemini models are accessed.

### Required Environment Variables for Vertex AI

The application also expects the following environment variables to be set, which are used by the Vertex AI client:

*   `GOOGLE_CLOUD_PROJECT`: Your Google Cloud Project ID.
*   `GOOGLE_CLOUD_LOCATION`: The Google Cloud region/location for Vertex AI services (e.g., `us-central1`).

These variables are used in `aimodel/aiClient.js` when initializing the Vertex AI client.
