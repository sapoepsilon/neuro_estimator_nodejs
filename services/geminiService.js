import { getModel } from "../aimodel/aiClient.js";
import { GEMINI_MODELS, MODEL_CONFIGS } from "../aimodel/geminiModels.js";
import { XMLParser } from "fast-xml-parser";
import { GoogleGenAI, mcpToTool } from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
/**
 * Get the Gemini model instance for the estimator
 * @returns {Object} The model instance
 */
function getEstimatorModel() {
  return getModel(GEMINI_MODELS.FLASH_2_0_001, MODEL_CONFIGS.ESTIMATOR);
}

/**
 * Prepare the prompt for the construction estimator agent
 * @param {Object} requestData - The data from the request
 * @param {string} requestData.prompt - The construction project description
 * @param {boolean} requestData.should_use_web - Whether to use web browsing tools
 * @returns {string} - The formatted prompt
 */
function prepareEstimatorPrompt(requestData) {
  const { prompt, should_use_web = false } = requestData;

  return `
    You are a professional construction estimator. Based on the following construction project description, create a detailed line item estimate with proper construction trades and categories.
    ${
      should_use_web
        ? "\nYou have access to a web browser tool to research current material prices if needed."
        : ""
    }
    
    Construction Project: ${prompt}
    
    Generate a comprehensive construction estimate that includes:
    - Foundation work (excavation, concrete, rebar)
    - Framing (lumber, fasteners, labor)
    - Electrical (wiring, outlets, fixtures, labor)
    - Plumbing (pipes, fixtures, labor)
    - HVAC (equipment, ductwork, labor)
    - Insulation and drywall
    - Flooring and finishes
    - Roofing materials and labor
    - Exterior work (siding, windows, doors)
    - Any other relevant construction items

    Use appropriate construction cost types:
    - material: Raw materials and supplies
    - labor: Worker time and installation
    - equipment: Tool rental, machinery
    - overhead: Project management, permits, insurance
    
    IMPORTANT: Your response MUST be in XML format with the following structure:
    <estimate>
      <project_title>Brief descriptive title of the construction project</project_title>
      <currency>USD</currency>
      <actions>
        <action>+ description='Site Preparation and Excavation', quantity=1, unit_price=3500, amount=3500, cost_type='labor', unit_type='package'</action>
        <action>+ description='Concrete Foundation', quantity=150, unit_price=12, amount=1800, cost_type='material', unit_type='unit'</action>
        <action>+ description='Foundation Labor', quantity=16, unit_price=75, amount=1200, cost_type='labor', unit_type='hour'</action>
        <action>+ description='Framing Materials', quantity=1, unit_price=8500, amount=8500, cost_type='material', unit_type='package'</action>
        <action>+ description='Framing Labor', quantity=80, unit_price=65, amount=5200, cost_type='labor', unit_type='hour'</action>
      </actions>
    </estimate>
    
    Each <action> tag must start with a '+' character followed by a space, then a comma-separated list of attributes.
    Required attributes: description, quantity, unit_price, amount, cost_type, unit_type
    Valid cost_type values: material, labor, equipment, overhead
    Valid unit_type values: hour, day, unit, package
    
    Do not include any other text, explanations, or formatting outside of this XML structure.
  `;
}

/**
 * Prepare the prompt for additional estimates on existing projects
 * @param {Object} requestData - The data from the request
 * @param {string} requestData.prompt - The additional prompt to process
 * @param {Object} requestData.existingProject - The existing project data
 * @param {Array} requestData.existingItems - Existing line items for the project (up to 300)
 * @param {boolean} requestData.should_use_web - Whether to use web browsing tools
 * @returns {string} - The formatted prompt
 */
function prepareAdditionalEstimatorPrompt(requestData) {
  // Extract data from the request
  const {
    prompt,
    existingProject,
    existingItems = [],
    should_use_web = false,
  } = requestData;

  // Format existing items for context
  const formattedItems = existingItems
    .map((item) => {
      return `ID:${item.id}, description='${item.description}', quantity=${
        item.quantity
      }, unit_price=${item.unitPrice}, amount=${item.amount}${
        item.parentId ? `, parent_id=${item.parentId}` : ""
      }`;
    })
    .join("\n");

  return `
    You are an estimator agent. ${
      should_use_web
        ? "You have access to a web browser tool to test the prices if the user requests it."
        : ""
    } You have previously created an estimate for a project titled "${
    existingProject.name || "Untitled Project"
  }". 
    Now you need to modify the estimate based on the following additional request.
    
    Current line items:
    ${formattedItems || "No existing items"}
    
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
    3. For deleting items: Start with '-' followed by the item ID${
      should_use_web
        ? `
    4. We now support tools to browse internet. If you notice that there is a link we should use the playwright tool to browse the internet
       a. If the user asks you to search somewhere on the internet, use the playwright tool to browse the internet, and hit enter to search if there is no search button, but do not type in enter`
        : ""
    }
    
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
    if (!xmlString.includes("<estimate>")) {
      const estimateTagRegex = /<estimate>[\s\S]*<\/estimate>/;
      const estimateMatch = responseText.match(estimateTagRegex);

      if (estimateMatch) {
        xmlString = estimateMatch[0];
      }
    }

    // Parse the XML
    const parser = new XMLParser({
      ignoreAttributes: false,
      attributeNamePrefix: "",
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

      instructions = actions.map((action) => action.toString().trim());
    }

    return {
      projectTitle,
      currency,
      instructions,
    };
  } catch (error) {
    console.error("Error processing XML response:", error);
    throw new Error(`Failed to parse XML response: ${error.message}`);
  }
}

// TODO: A user should be able to select which model to use, and we should be able to switch between models
// TODO: I guess this should be renamed to generateWithGemini
/**
 * Generate an estimate using Gemini Flash 002
 * @param {Object} requestData - The data to generate an estimate for
 * @returns {Promise<Object>} - Object containing project title, currency, instructions, and raw response
 */
async function generateEstimate(requestData) {
  try {
    const { should_use_web = false } = requestData;
    let playwrightMcpClient = null;
    let playwright = null;

    // Only initialize MCP if should_use_web is true
    if (should_use_web) {
      playwright = new StdioClientTransport({
        command: "npx",
        args: ["-y", "@playwright/mcp@latest"],
      });

      playwrightMcpClient = new Client({
        name: "Playwright",
        version: "1.0.0",
      });

      await playwrightMcpClient.connect(playwright);
    }

    const prompt = prepareEstimatorPrompt(requestData);
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log(`prompt in gemini service`, prompt);

    // Prepare config with or without tools
    const config =
      should_use_web && playwrightMcpClient
        ? { tools: [mcpToTool(playwrightMcpClient)] }
        : {};

    const result = await ai.models.generateContent({
      model: GEMINI_MODELS.FLASH_2_5_04_17_PREVIEW,
      contents: prompt,
      config,
    });

    // Extract text from response - handle multiple parts when MCP tools are used
    let responseText = '';
    if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts) {
      // Find the part that contains text
      const textPart = result.candidates[0].content.parts.find(part => part.text);
      if (textPart) {
        responseText = textPart.text;
      } else {
        // If no text part found, check if there's a direct text in any part
        for (const part of result.candidates[0].content.parts) {
          if (typeof part === 'string') {
            responseText = part;
            break;
          }
        }
      }
    }
    
    if (!responseText) {
      throw new Error('No text response found in Gemini output');
    }

    const rawGeminiResponse = {
      text: responseText,
      timestamp: new Date().toISOString(),
      prompt: prompt,
    };

    const { projectTitle, currency, instructions } =
      processGeminiResponse(responseText);

    // Clean up MCP client if it was used
    if (playwrightMcpClient) {
      await playwrightMcpClient.close();
    }

    return {
      projectTitle,
      currency,
      instructions,
      rawGeminiResponse,
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
 * @param {boolean} requestData.should_use_web - Whether to use web browsing tools
 * @returns {Promise<Object>} - Object containing instructions and raw response
 */
async function generateAdditionalEstimate(requestData) {
  try {
    const { should_use_web = false } = requestData;
    const prompt = prepareAdditionalEstimatorPrompt(requestData);

    let playwrightMcpClient = null;
    let playwright = null;

    // Only initialize MCP if should_use_web is true
    if (should_use_web) {
      // Set up Playwright client for MCP
      playwright = new StdioClientTransport({
        command: "npx",
        args: ["-y", "@playwright/mcp@latest"],
      });

      playwrightMcpClient = new Client({
        name: "Playwright",
        version: "1.0.0",
      });

      await playwrightMcpClient.connect(playwright);
    }

    // Initialize Gemini
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    console.log(`prompt in gemini service`, prompt);

    // Prepare config with or without tools
    const config =
      should_use_web && playwrightMcpClient
        ? { tools: [mcpToTool(playwrightMcpClient)] }
        : {};

    // Generate content
    const result = await ai.models.generateContent({
      model: GEMINI_MODELS.FLASH_2_5_04_17_PREVIEW,
      contents: prompt,
      config,
    });

    // Extract text from response - handle multiple parts when MCP tools are used
    let responseText = '';
    if (result.candidates && result.candidates[0] && result.candidates[0].content && result.candidates[0].content.parts) {
      // Find the part that contains text
      const textPart = result.candidates[0].content.parts.find(part => part.text);
      if (textPart) {
        responseText = textPart.text;
      } else {
        // If no text part found, check if there's a direct text in any part
        for (const part of result.candidates[0].content.parts) {
          if (typeof part === 'string') {
            responseText = part;
            break;
          }
        }
      }
    }
    
    if (!responseText) {
      throw new Error('No text response found in Gemini output');
    }

    // Store the raw response text for debugging/logging
    const rawGeminiResponse = {
      text: responseText,
      timestamp: new Date().toISOString(),
      prompt: prompt,
    };

    // Process and validate the response
    const { instructions } = processGeminiResponse(responseText);

    // Clean up MCP client if it was used
    if (playwrightMcpClient) {
      await playwrightMcpClient.close();
    }

    // Return the structured data
    return {
      instructions,
      rawGeminiResponse,
    };
  } catch (error) {
    console.error("Error generating additional estimate:", error);
    throw error;
  }
}

export { generateEstimate, generateAdditionalEstimate };
