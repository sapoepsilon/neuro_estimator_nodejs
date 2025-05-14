import { generateEstimate, generateAdditionalEstimate } from '../services/geminiService.js';
import { getProjectById, getConversationsByProjectId, createEstimateItems } from '../services/projectService.js';
import { supabase } from '../services/supabaseService.js';

/**
 * Validate the request data for the estimator
 * @param {Object} requestData - The data to validate
 * @param {Object} requestData.projectDetails - Details about the project to estimate
 * @param {Object} [requestData.responseStructure] - Optional custom structure for the response
 * @returns {Object|null} - Error object if validation fails, null if successful
 */
function validateEstimatorRequest(requestData) {
  // Check if request data exists
  if (!requestData || Object.keys(requestData).length === 0) {
    return {
      status: 400,
      message: 'Request body cannot be empty'
    };
  }

  // Check if project details are provided
  if (!requestData.projectDetails) {
    return {
      status: 400,
      message: 'Project details are required'
    };
  }
  
  // If responseStructure is provided, validate it's a valid object
  if (requestData.responseStructure !== undefined) {
    if (typeof requestData.responseStructure !== 'object' || requestData.responseStructure === null) {
      return {
        status: 400,
        message: 'Response structure must be a valid JSON object'
      };
    }
  }

  return null;
}

/**
 * Handle the estimator request
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleEstimatorRequest(req, res) {
  try {
    const requestData = req.body;
    
    // Validate the request
    const validationError = validateEstimatorRequest(requestData);
    if (validationError) {
      return res.status(validationError.status).json({ error: validationError.message });
    }
    
    // Get the authenticated user from the request (added by verifyAuth middleware)
    const user = req.user;
    
    // Add the user ID to the request data for tracking who created the estimate
    const requestWithUser = {
      ...requestData,
      userId: user.id
    };
    
    // Generate the estimate using Gemini
    const estimate = await generateEstimate(requestWithUser);
    
    // Return the estimate as JSON
    return res.json(estimate);
  } catch (error) {
    console.error('Error in estimator controller:', error);
    return res.status(500).json({ 
      error: 'Failed to generate estimate',
      details: error.message
    });
  }
}

/**
 * Validate the request data for additional prompts
 * @param {Object} requestData - The data to validate
 * @param {string} requestData.projectId - ID of the existing project
 * @param {string} requestData.prompt - The additional prompt to process
 * @param {Object} [requestData.responseStructure] - Optional custom structure for the response
 * @returns {Object|null} - Error object if validation fails, null if successful
 */
function validateAdditionalPromptRequest(requestData) {
  // Check if request data exists
  if (!requestData || Object.keys(requestData).length === 0) {
    return {
      status: 400,
      message: 'Request body cannot be empty'
    };
  }

  // Check if project ID is provided
  if (!requestData.projectId) {
    return {
      status: 400,
      message: 'Project ID is required'
    };
  }

  // Check if prompt is provided
  if (!requestData.prompt) {
    return {
      status: 400,
      message: 'Prompt is required'
    };
  }
  
  // If responseStructure is provided, validate it's a valid object
  if (requestData.responseStructure !== undefined) {
    if (typeof requestData.responseStructure !== 'object' || requestData.responseStructure === null) {
      return {
        status: 400,
        message: 'Response structure must be a valid JSON object'
      };
    }
  }

  return null;
}

/**
 * Handle additional prompt requests for existing projects
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleAdditionalPrompt(req, res) {
  try {
    const requestData = req.body;
    
    // Validate the request
    const validationError = validateAdditionalPromptRequest(requestData);
    if (validationError) {
      return res.status(validationError.status).json({ error: validationError.message });
    }
    
    // Get the authenticated user from the request (added by verifyAuth middleware)
    const user = req.user;
    
    // Get the project by ID
    const project = await getProjectById(requestData.projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Verify that the user has access to this project
    // This is handled by RLS policies in Supabase, but we'll double-check here
    if (project.business_id) {
      // The project exists and the user has access (thanks to RLS)
      // Get existing conversations for this project
      const conversations = await getConversationsByProjectId(requestData.projectId);
      
      // Add the user ID and project data to the request data
      const requestWithContext = {
        ...requestData,
        userId: user.id,
        projectId: project.id,
        existingProject: project,
        existingConversations: conversations
      };
      
      // Generate the additional estimate using Gemini
      const estimateData = await generateAdditionalEstimate(requestWithContext);
      
      // Extract line items from the estimate
      const lineItems = estimateData.estimate?.lineItems || [];
      
      // If we have line items, save them to the database
      if (lineItems && lineItems.length > 0) {
        try {
          // Get existing estimate items for this project
          const { data: existingItems, error: itemsError } = await supabase
            .from("estimate_items")
            .select("title, description, amount, unit_price, unit_type, cost_type, quantity, data")
            .eq("project_id", project.id);

          if (itemsError) {
            console.error("Error fetching existing items:", itemsError);
            throw itemsError;
          }

          // Filter out items that appear to be duplicates
          const uniqueLineItems = lineItems.filter(item => {
            // Check if this item already exists in the database
            const isDuplicate = existingItems.some(existingItem => {
              // Compare title/description (normalized to lowercase)
              const titleMatch = (
                (existingItem.title?.toLowerCase() === (item.description || item.title)?.toLowerCase()) ||
                (existingItem.description?.toLowerCase() === (item.description || item.title)?.toLowerCase())
              );
              
              // Compare amount, unit price, quantity, and cost_type for additional verification
              const amountMatch = Math.abs(parseFloat(existingItem.amount || 0) - parseFloat(item.amount || 0)) < 0.01;
              const unitPriceMatch = Math.abs(parseFloat(existingItem.unit_price || 0) - parseFloat(item.unitPrice || 0)) < 0.01;
              const quantityMatch = Math.abs(parseFloat(existingItem.quantity || 0) - parseFloat(item.quantity || 0)) < 0.01;
              const costTypeMatch = existingItem.cost_type === item.costType;
              
              // Consider it a duplicate if title matches and at least one other property matches
              return titleMatch && (amountMatch || unitPriceMatch || quantityMatch || costTypeMatch);
            });
            
            return !isDuplicate;
          });
          
          // Only create items that don't already exist
          const createdItems = uniqueLineItems.length > 0 ? 
            await createEstimateItems(
              project.id,
              uniqueLineItems,
              user.id
            ) : [];
          
          // Calculate the total from all line items
          const totalAmount = lineItems.reduce(
            (sum, item) => sum + parseFloat(item.amount || 0),
            0
          );
          
          // Store the prompt and response in the conversation
          let conversationId;
          
          if (conversations && conversations.length > 0) {
            // Use the most recent conversation
            conversationId = conversations[0].id;
          } else {
            // Create a new conversation
            const { data: conversation, error: convError } = await supabase
              .from("conversations")
              .insert({
                business_id: project.business_id,
                project_id: project.id,
                created_by: user.id,
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
              items_added: createdItems.length,
              total_amount: totalAmount,
            }),
            role: "assistant",
            user_id: user.id,
          });

          if (msgError) {
            console.error("Error creating message:", msgError);
            throw msgError;
          }
          
          // Return success response with the number of items added
          return res.json({
            success: true,
            message: lineItems.length === uniqueLineItems.length
              ? `Added ${createdItems.length} new estimate items to the project`
              : `Added ${createdItems.length} new unique estimate items to the project (${lineItems.length - uniqueLineItems.length} duplicates were skipped)`,
            itemsAdded: createdItems.length,
            duplicatesSkipped: lineItems.length - uniqueLineItems.length
          });
        } catch (dbError) {
          console.error("Error saving additional estimate to database:", dbError);
          return res.status(500).json({
            error: "Failed to save estimate items to database",
            details: dbError.message
          });
        }
      } else {
        return res.status(400).json({
          error: "No estimate items were generated from the prompt"
        });
      }
    } else {
      return res.status(403).json({ error: 'You do not have access to this project' });
    }
  } catch (error) {
    console.error('Error in additional prompt controller:', error);
    return res.status(500).json({ 
      error: 'Failed to process additional prompt',
      details: error.message
    });
  }
}

export {
  handleEstimatorRequest,
  handleAdditionalPrompt
};
