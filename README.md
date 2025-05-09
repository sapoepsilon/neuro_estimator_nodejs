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
- `GET /agent`: Returns "hello world"

### Estimator API
- `POST /api/estimate`: Generate a detailed estimate using Gemini Flash 002

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
  }
}
```

#### Response Format
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
        "unitPrice": 3000,
        "amount": 3000,
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

## Project Structure

```
├── controllers/          # Request handlers
├── routes/              # API route definitions
├── services/            # Business logic and external services
├── .env                 # Environment variables (create this file)
├── index.js             # Application entry point
├── package.json         # Project dependencies
└── README.md            # Project documentation
```

## Port

The application runs on port 3000 by default. You can change this by setting the PORT environment variable.
