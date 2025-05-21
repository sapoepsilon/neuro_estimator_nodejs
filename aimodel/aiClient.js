/**
 * @fileoverview AI client initialization and base functionality
 */

import { GoogleGenerativeAI } from '@google/genai';

// Initialize the Google Generative AI client
const genAI = new GoogleGenerativeAI({
  vertexai: true,
  project: process.env.GOOGLE_CLOUD_PROJECT,
  location: process.env.GOOGLE_CLOUD_LOCATION,
});

/**
 * Get the configured GoogleGenAI client instance.
 * @returns {Object} The GoogleGenAI client instance
 */
function getModel() {
  return genAI;
}

export {
  getModel
};
