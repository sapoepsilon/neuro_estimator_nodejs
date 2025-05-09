/**
 * @fileoverview Gemini AI model definitions and configurations
 */

/**
 * Enum for Gemini model types
 * @readonly
 * @enum {string}
 */
const GEMINI_MODELS = {
  /** Gemini Flash 002 - Fast and efficient model */
  FLASH_2_0_001: "gemini-2.0-flash-001",
};

/**
 * Default model configurations for different use cases
 * @readonly
 * @enum {Object}
 */
const MODEL_CONFIGS = {
  /** Configuration for the estimator agent */
  ESTIMATOR: {
    temperature: 0.2,
    topP: 0.8,
    topK: 40,
  },
  // Add more configurations as needed
};

module.exports = {
  GEMINI_MODELS,
  MODEL_CONFIGS,
};
