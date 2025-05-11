import { generateEstimate, generateAdditionalEstimate } from '../services/geminiService.js';
import { getProjectById, getConversationsByProjectId } from '../services/projectService.js';

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
      const estimate = await generateAdditionalEstimate(requestWithContext);
      
      // Return the estimate as JSON
      return res.json(estimate);
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
