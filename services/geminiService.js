import { getModel } from "../aimodel/aiClient.js";
import { GEMINI_MODELS, MODEL_CONFIGS } from "../aimodel/geminiModels.js";
import {
  createProject,
  createEstimateItems,
  processAndSaveEstimate,
} from "./projectService.js";
import { supabase } from "./supabaseService.js";

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

    // Store the raw response text for debugging/logging
    const rawResponse = {
      text: responseText,
      timestamp: new Date().toISOString(),
      prompt: prompt,
    };

    // Process and validate the response
    const estimateData = processGeminiResponse(responseText);

    // Add the raw response to the estimate data for reference
    const estimateWithRawData = {
      ...estimateData,
      _rawGeminiResponse: rawResponse,
    };

    // If user is authenticated (userId is present), save the project and estimate to the database
    if (requestData.userId) {
      try {
        // Use the processAndSaveEstimate function to handle database operations
        // This will now store both the processed data and raw response
        const processedData = await processAndSaveEstimate(
          estimateWithRawData,
          requestData.userId,
          requestData.projectDetails || {}
        );

        // Return the processed data with database IDs
        // Remove the raw response from the client response to reduce payload size
        delete processedData._rawGeminiResponse;
        return processedData;
      } catch (dbError) {
        console.error(
          "Error saving project and estimate to database:",
          dbError
        );
        // Continue with the response even if database operations fail
        // Just log the error and don't throw, so the user still gets their estimate
      }
    }

    // Remove the raw response from the client response to reduce payload size
    delete estimateWithRawData._rawGeminiResponse;
    return estimateWithRawData;
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
 * @param {Array} requestData.existingConversations - Existing conversations for the project
 * @returns {Promise<Object>} - The generated estimate as a JSON object
 */
async function generateAdditionalEstimate(requestData) {
  try {
    const model = getEstimatorModel();
    const prompt = prepareAdditionalEstimatorPrompt(requestData);

    // Generate content from Gemini
    const result = await model.generateContent(prompt);
    const responseText = result.response.text();

    // Store the raw response text for debugging/logging
    const rawResponse = {
      text: responseText,
      timestamp: new Date().toISOString(),
      prompt: prompt,
    };

    // Process and validate the response
    const estimateData = processGeminiResponse(responseText);

    // Add the raw response to the estimate data for reference
    const estimateWithRawData = {
      ...estimateData,
      _rawGeminiResponse: rawResponse,
    };

    // If user is authenticated (userId is present), save the estimate to the database
    if (requestData.userId && requestData.projectId) {
      try {
        // Get the business ID for the user
        const { data: businessUsers, error: businessError } = await supabase
          .from("business_users")
          .select("business_id")
          .eq("user_id", requestData.userId)
          .limit(1);

        if (businessError || !businessUsers || businessUsers.length === 0) {
          throw new Error("Failed to find business for user");
        }

        const businessId = businessUsers[0].business_id;
        
        // Find an existing conversation or create a new one
        let conversationId;
        
        if (requestData.existingConversations && requestData.existingConversations.length > 0) {
          // Use the most recent conversation
          conversationId = requestData.existingConversations[0].id;
        } else {
          // Create a new conversation
          const { data: conversation, error: convError } = await supabase
            .from("conversations")
            .insert({
              business_id: businessId,
              project_id: requestData.projectId,
              created_by: requestData.userId,
            })
            .select()
            .single();

          if (convError) {
            console.error("Error creating conversation:", convError);
            throw convError;
          }
          
          conversationId = conversation.id;
        }
        
        // Store the Gemini response as a message
        const { error: msgError } = await supabase.from("messages").insert({
          conversation_id: conversationId,
          content: JSON.stringify({
            type: "additional_estimate",
            prompt: requestData.prompt,
            estimate: estimateData.estimate,
            raw_response: rawResponse,
          }),
          role: "assistant",
          user_id: requestData.userId,
        });

        if (msgError) {
          console.error("Error creating message:", msgError);
          throw msgError;
        }
        
        // Return the processed data with database IDs
        return {
          ...estimateWithRawData,
          projectId: requestData.projectId,
          conversationId: conversationId,
          savedToDatabase: true,
        };
      } catch (dbError) {
        console.error("Error saving additional estimate to database:", dbError);
        // Continue with the response even if database operations fail
        // Just log the error and don't throw, so the user still gets their estimate
      }
    }

    // Remove the raw response from the client response to reduce payload size
    delete estimateWithRawData._rawGeminiResponse;
    return estimateWithRawData;
  } catch (error) {
    console.error("Error generating additional estimate:", error);
    throw error;
  }
}

/**
 * Prepare the prompt for additional estimates on existing projects
 * @param {Object} requestData - The data from the request
 * @param {string} requestData.prompt - The additional prompt to process
 * @param {Object} requestData.existingProject - The existing project data
 * @param {Array} requestData.existingConversations - Existing conversations for the project
 * @param {Object} [requestData.responseStructure] - Custom structure for the response
 * @returns {string} - The formatted prompt
 */
function prepareAdditionalEstimatorPrompt(requestData) {
  // Extract data from the request
  const { prompt, existingProject, existingConversations, responseStructure } = requestData;

  // Default response structure if not provided
  const defaultResponseStructure = {
    estimate: {
      title: existingProject.name || "Updated Estimate",
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

  // Extract previous conversations and messages for context
  let conversationContext = "";
  if (existingConversations && existingConversations.length > 0) {
    const latestConversation = existingConversations[0];
    if (latestConversation.messages && latestConversation.messages.length > 0) {
      conversationContext = latestConversation.messages
        .map((msg) => {
          if (msg.parsedContent) {
            if (msg.parsedContent.type === "estimate") {
              return `Previous estimate: ${JSON.stringify(msg.parsedContent, null, 2)}`;
            } else if (msg.parsedContent.type === "additional_estimate") {
              return `Previous additional estimate: ${JSON.stringify(msg.parsedContent.estimate, null, 2)}`;
            }
          }
          return null;
        })
        .filter(Boolean)
        .join("\n\n");
    }
  }

  return `
    You are an estimator agent. You have previously created an estimate for a project titled "${existingProject.name}". 
    Now you need to add more items to the estimate based on the following additional request.
    
    ${conversationContext ? `Previous estimation context:\n${conversationContext}\n\n` : ""}
    
    Additional request from the user:
    ${prompt}
    
    Based on this additional request, create an updated line item JSON estimate.
    Include nested line items where appropriate. Make sure the output is valid JSON.
    
    Respond with a JSON object that has the following structure:
    ${JSON.stringify(structureToUse, null, 2)}
  `;
}

export { generateEstimate, generateAdditionalEstimate };
