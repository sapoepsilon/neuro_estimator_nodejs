import { generateEstimate } from '../services/geminiService.js';

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

export {
  handleEstimatorRequest
};
