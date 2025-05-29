/**
 * @fileoverview AI client initialization and base functionality
 */

import { GoogleGenAI } from "@google/genai";
import dotenv from "dotenv";

dotenv.config();

// Initialize the Google Generative AI client
const apiKey = process.env.GOOGLE_API_KEY;
const ai = new GoogleGenAI({ apiKey: apiKey });
/**
 * Get a Gemini model instance with optional configuration
 * @param {string} modelName - The model name to use
 * @param {Object} config - Optional configuration parameters
 * @returns {Object} The model instance
 */
function getModel(modelName, config = {}) {
  return ai.models.get(modelName, config);
}

export { getModel };
