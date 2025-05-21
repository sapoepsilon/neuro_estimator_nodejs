import { getModel } from "../aimodel/aiClient.js";
import { GEMINI_MODELS, MODEL_CONFIGS } from "../aimodel/geminiModels.js";
import { supabase } from "./supabaseService.js";
import { XMLParser } from "fast-xml-parser";

/**
 * Get the Gemini model instance for the estimator
 * @returns {Object} The GoogleGenAI client instance
 */
function getEstimatorModel() {
  return getModel(); // getModel now returns the configured client
}

/**
 * Prepare the prompt for the estimator agent
 * @param {Object} requestData - The data from the request
 * @param {Object} [requestData.projectDetails] - Details about the project
 * @returns {string} - The formatted prompt
 */
function prepareEstimatorPrompt(requestData) {
  // Extract project details from request
  const { projectDetails } = requestData;

  return `
    You are an estimator agent. Based on the following request, create a detailed line item estimate.
    
    Request details:
    ${JSON.stringify(projectDetails || requestData, null, 2)}
    
    IMPORTANT: Your response MUST be in XML format with the following structure:
    <estimate>
      <project_title>Title of the estimate</project_title>
      <currency>USD</currency>
      <actions>
        <action>+ description='Description of item', quantity=1, unit_price=100, amount=100</action>
        <action>+ description='Another item with sub-items', quantity=1, unit_price=200, amount=200</action>
        <action>+ description='Sub-item 1', quantity=2, unit_price=50, amount=100, parent='Another item with sub-items'</action>
      </actions>
    </estimate>
    
    Each <action> tag must start with a '+' character followed by a space, then a comma-separated list of attributes.
    The attributes should include: description, quantity, unit_price, and amount.
    For sub-items, include a parent attribute that matches the description of the parent item.
    Do not include any other text, explanations, or formatting outside of this XML structure.
  `;
}

/**
 * Prepare the prompt for additional estimates on existing projects
 * @param {Object} requestData - The data from the request
 * @param {string} requestData.prompt - The additional prompt to process
 * @param {Object} requestData.existingProject - The existing project data
 * @param {Array} requestData.existingItems - Existing line items for the project (up to 300)
 * @returns {string} - The formatted prompt
 */
function prepareAdditionalEstimatorPrompt(requestData) {
  // Extract data from the request
  const { prompt, existingProject, existingItems = [] } = requestData;

  // Format existing items for context
  const formattedItems = existingItems.map(item => {
    return `ID:${item.id}, description='${item.description}', quantity=${item.quantity}, unit_price=${item.unitPrice}, amount=${item.amount}${item.parentId ? `, parent_id=${item.parentId}` : ''}`;
  }).join('\n');

  return `
    You are an estimator agent. You have previously created an estimate for a project titled "${existingProject.name || 'Untitled Project'}". 
    Now you need to modify the estimate based on the following additional request.
    
    Current line items:
    ${formattedItems || 'No existing items'}
    
    Additional request from the user:
    ${prompt}
    
    IMPORTANT: Your response MUST be in XML format with the following structure:
    <estimate>
      <actions>
        <action>+ description='New item description', quantity=1, unit_price=100, amount=100</action>
        <action>+ ID:123, description='Updated item description', quantity=2, unit_price=150, amount=300</action>
        <action>- ID:456</action>
      </actions>
    </estimate>
    
    Each <action> tag must contain one of the following:
    1. For adding new items: Start with '+' followed by attributes (description, quantity, unit_price, amount)
    2. For updating existing items: Start with '+' followed by the item ID and the attributes to update
    3. For deleting items: Start with '-' followed by the item ID
    
    Do not include any other text, explanations, or formatting outside of this XML structure.
  `;
}

/**
 * Process the response from Gemini to extract XML content
 * @param {string} responseText - The raw response from Gemini
 * @returns {Object} - The parsed XML data as an object
 */
function processGeminiResponse(responseText) {
  try {
    // Extract XML if it's wrapped in markdown code blocks
    let xmlString = responseText;
    
    // Check if the response is wrapped in markdown code blocks
    const xmlRegex = /\`\`\`(?:xml)?\s*([\s\S]*?)\`\`\`/;
    const match = responseText.match(xmlRegex);
    
    if (match && match[1]) {
      xmlString = match[1].trim();
    }
    
    // Look for XML tags if not found in code blocks
    if (!xmlString.includes('<estimate>')) {
      const estimateTagRegex = /<estimate>[\s\S]*<\/estimate>/;
      const estimateMatch = responseText.match(estimateTagRegex);
      
      if (estimateMatch) {
        xmlString = estimateMatch[0];
      }
    }
    
    // Parse the XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: ""
    });
    
    const result = parser.parse(xmlString);
    
    if (!result.estimate) {
      throw new Error("Missing estimate data in XML response");
    }
    
    // Extract the project title, currency, and action instructions
    const projectTitle = result.estimate.project_title || "Untitled Project";
    const currency = result.estimate.currency || "USD";
    
    // Extract action instructions
    let instructions = [];
    if (result.estimate.actions && result.estimate.actions.action) {
      // Handle both single action and array of actions
      const actions = Array.isArray(result.estimate.actions.action) 
        ? result.estimate.actions.action 
        : [result.estimate.actions.action];
      
      instructions = actions.map(action => action.toString().trim());
    }
    
    return {
      projectTitle,
      currency,
      instructions
    };
  } catch (error) {
    console.error("Error processing XML response:", error);
    throw new Error(`Failed to parse XML response: ${error.message}`);
  }
}

/**
 * Generate an estimate using Gemini Flash 002
 * @param {Object} requestData - The data to generate an estimate for
 * @returns {Promise<Object>} - Object containing project title, currency, instructions, and raw response
 */
async function generateEstimate(requestData) {
  try {
    const genAIClient = getEstimatorModel();
    console.log("genAIClient type:", typeof genAIClient, "genAIClient object:", genAIClient);
    const prompt = prepareEstimatorPrompt(requestData);

    // Generate content from Gemini
    const result = await genAIClient.models.generateContent({
        model: GEMINI_MODELS.FLASH_2_0_001,
        contents: prompt,
        generationConfig: MODEL_CONFIGS.ESTIMATOR
    });
    const responseText = result.response.text();
    console.log("Raw Gemini Response Text:", responseText);
    console.log("Full Gemini Result:", JSON.stringify(result, null, 2));

    // Store the raw response text for debugging/logging
    const rawGeminiResponse = {
      text: responseText,
      timestamp: new Date().toISOString(),
      prompt: prompt,
    };

    // Process and validate the response
    const { projectTitle, currency, instructions } = processGeminiResponse(responseText);

    // Return the structured data
    return {
      projectTitle,
      currency,
      instructions,
      rawGeminiResponse
    };
  } catch (error) {
    console.error("Error generating estimate:", error);
    throw error;
  }
}

/**
 * Generate an additional estimate for an existing project using Gemini
 * @param {Object} requestData - The data to generate an estimate for
 * @param {string} requestData.projectId - ID of the existing project
 * @param {string} requestData.prompt - The additional prompt to process
 * @param {Object} requestData.existingProject - The existing project data
 * @param {Array} requestData.existingItems - Existing line items for the project
 * @returns {Promise<Object>} - Object containing instructions and raw response
 */
async function generateAdditionalEstimate(requestData) {
  try {
    const genAIClient = getEstimatorModel();
    const prompt = prepareAdditionalEstimatorPrompt(requestData);

    // Generate content from Gemini
    const result = await genAIClient.models.generateContent({
        model: GEMINI_MODELS.FLASH_2_0_001,
        contents: prompt,
        generationConfig: MODEL_CONFIGS.ESTIMATOR
    });
    const responseText = result.response.text();

    // Store the raw response text for debugging/logging
    const rawGeminiResponse = {
      text: responseText,
      timestamp: new Date().toISOString(),
      prompt: prompt,
    };

    // Process and validate the response
    const { instructions } = processGeminiResponse(responseText);

    // Return the structured data
    return {
      instructions,
      rawGeminiResponse
    };
  } catch (error) {
    console.error("Error generating additional estimate:", error);
    throw error;
  }
}

export { generateEstimate, generateAdditionalEstimate };
