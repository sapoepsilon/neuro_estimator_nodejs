const jsonrepair = require("jsonrepair");
const { getModel } = require("../aimodel/aiClient");
const { GEMINI_MODELS, MODEL_CONFIGS } = require("../aimodel/geminiModels");

/**
 * Get the Gemini model instance for the estimator
 * @returns {Object} The model instance
 */
function getEstimatorModel() {
  return getModel(GEMINI_MODELS.FLASH_2_0_001, MODEL_CONFIGS.ESTIMATOR);
}

/**
 * Prepare the prompt for the estimator agent
 * @param {Object} requestData - The data from the request
 * @param {Object} [requestData.projectDetails] - Details about the project
 * @param {Object} [requestData.responseStructure] - Custom structure for the response
 * @returns {string} - The formatted prompt
 */
function prepareEstimatorPrompt(requestData) {
  // Extract project details and response structure from request
  const { projectDetails, responseStructure } = requestData;

  // Default response structure if not provided
  const defaultResponseStructure = {
    estimate: {
      title: "Title of the estimate",
      totalAmount: 0,
      currency: "USD",
      lineItems: [
        {
          description: "Description of item",
          quantity: 0,
          unitPrice: 0,
          amount: 0,
          subItems: [
            {
              description: "Description of sub-item",
              quantity: 0,
              unitPrice: 0,
              amount: 0,
            },
          ],
        },
      ],
    },
  };

  // Use the provided response structure or default if not provided
  const structureToUse = responseStructure || defaultResponseStructure;

  return `
    You are an estimator agent. Based on the following request, create a detailed line item JSON estimate.
    Include nested line items where appropriate. Make sure the output is valid JSON.
    
    Request details:
    ${JSON.stringify(projectDetails || requestData, null, 2)}
    
    Respond with a JSON object that has the following structure:
    ${JSON.stringify(structureToUse, null, 2)}
  `;
}

/**
 * Process the response from Gemini to ensure valid JSON
 * @param {string} responseText - The raw response from Gemini
 * @returns {Object} - The parsed JSON object
 */
function processGeminiResponse(responseText) {
  // Extract JSON if it's wrapped in markdown code blocks
  let jsonString = responseText;

  // Check if the response is wrapped in markdown code blocks
  const jsonRegex = /\`\`\`(?:json)?\s*([\s\S]*?)\`\`\`/;
  const match = responseText.match(jsonRegex);

  if (match && match[1]) {
    jsonString = match[1].trim();
  }

  try {
    // Try to parse the JSON directly
    return JSON.parse(jsonString);
  } catch (error) {
    // If direct parsing fails, try to repair the JSON
    try {
      const repairedJson = jsonrepair(jsonString);
      return JSON.parse(repairedJson);
    } catch (repairError) {
      throw new Error("Failed to parse or repair JSON response");
    }
  }
}

/**
 * Generate an estimate using Gemini Flash 002
 * @param {Object} requestData - The data to generate an estimate for
 * @returns {Promise<Object>} - The generated estimate as a JSON object
 */
async function generateEstimate(requestData) {
  try {
    const model = getEstimatorModel();
    const prompt = prepareEstimatorPrompt(requestData);

    // Generate content from Gemini
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Process and validate the response
    return processGeminiResponse(responseText);
  } catch (error) {
    console.error("Error generating estimate:", error);
    throw error;
  }
}

module.exports = {
  generateEstimate,
};
