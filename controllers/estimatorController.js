import { generateEstimate, generateAdditionalEstimate } from '../services/geminiService.js';
import { 
  getProjectById, 
  getConversationsByProjectId, 
  createProject,
  getProjectLineItems,
  applyLineItemChanges,
  logPromptAndActions
} from '../services/projectService.js';

/**
 * Validate the request data for the estimator
 * @param {Object} requestData - The data to validate
 * @param {Object} requestData.projectDetails - Details about the project to estimate
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
    
    // 1. Generate the estimate using Gemini (now returns projectTitle, currency, instructions, rawGeminiResponse)
    console.log("Generating estimate with data:", JSON.stringify(requestWithUser));
    const { projectTitle, currency, instructions, rawGeminiResponse } = await generateEstimate(requestWithUser);
    
    console.log("Gemini response processed:", {
      projectTitle,
      currency,
      instructionsCount: instructions.length,
      firstFewInstructions: instructions.slice(0, 3)
    });
    
    // 2. Create the project record and log the initial Gemini interaction
    console.log("Creating project with title:", projectTitle);
    const createdProject = await createProject(
      { 
        name: projectTitle, 
        description: requestData.projectDetails?.description || ''
      }, 
      user.id, 
      0, // Initial total estimate is 0
      currency, 
      rawGeminiResponse
    );
    
    console.log("Project created with ID:", createdProject.id);
    
    // 3. Apply the line item changes to populate line items
    const actionSummary = await applyLineItemChanges(
      createdProject.id, 
      user.id, 
      instructions, 
      currency
    );
    
    // 4. Log the user's original prompt and the actions taken
    await logPromptAndActions(
      createdProject.id,
      user.id,
      JSON.stringify(requestData.projectDetails),
      rawGeminiResponse,
      actionSummary
    );
    
    // 5. Respond to the client with a summary
    return res.json({
      success: true,
      projectId: createdProject.id,
      projectTitle,
      currency,
      itemsAdded: actionSummary.itemsAdded,
      errors: actionSummary.errors,
      message: `Created project "${projectTitle}" with ${actionSummary.itemsAdded} line items`
    });
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
    
    // 1. Get the project by ID and offset from query params
    const projectId = requestData.projectId;
    const offset = parseInt(req.query.offset) || 0;
    
    // 2. Fetch the project
    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: 'Project not found' });
    }
    
    // Verify that the user has access to this project (handled by RLS policies in Supabase)
    if (project.business_id) {
      // 3. Fetch the current batch of line items with pagination
      const lineItems = await getProjectLineItems(projectId, offset, 300);
      
      // 4. Generate the additional estimate using Gemini with the existing items
      const { instructions, rawGeminiResponse } = await generateAdditionalEstimate({
        ...requestData,
        userId: user.id,
        projectId: project.id,
        existingProject: project,
        existingItems: lineItems
      });
      
      // 5. Apply the line item changes
      const actionSummary = await applyLineItemChanges(
        projectId, 
        user.id, 
        instructions, 
        project.currency || 'USD'
      );
      
      // 6. Log the prompt, response, and actions
      await logPromptAndActions(
        projectId,
        user.id,
        requestData.prompt,
        rawGeminiResponse,
        actionSummary
      );
      
      // 7. Determine if there are more items to fetch
      const hasMoreItems = lineItems.length === 300; // If we got the max number of items, there might be more
      const nextOffset = hasMoreItems ? offset + lineItems.length : null;
      
      // Return success response with the summary of changes
      return res.json({
        success: true,
        projectId,
        itemsAdded: actionSummary.itemsAdded,
        itemsUpdated: actionSummary.itemsUpdated,
        itemsDeleted: actionSummary.itemsDeleted,
        errors: actionSummary.errors,
        nextOffset,
        message: `Applied ${actionSummary.itemsAdded + actionSummary.itemsUpdated + actionSummary.itemsDeleted} changes to the project`
      });
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
