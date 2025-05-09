/**
 * @fileoverview AI client initialization and base functionality
 */

const { GoogleGenerativeAI } = require('@google/generative-ai');
require('dotenv').config();

// Initialize the Google Generative AI client
const apiKey = process.env.GOOGLE_API_KEY;
const genAI = new GoogleGenerativeAI(apiKey);

/**
 * Get a Gemini model instance with optional configuration
 * @param {string} modelName - The model name to use
 * @param {Object} config - Optional configuration parameters
 * @returns {Object} The model instance
 */
function getModel(modelName, config = {}) {
  return genAI.getGenerativeModel({
    model: modelName,
    ...config
  });
}

module.exports = {
  getModel
};
