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

/**
 * Handle range-based actions on line items
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleRangeAction(req, res) {
  try {
    const { projectId, action, range, data, prompt, xmlResponse } = req.body;
    const userId = req.user.id; // Assuming user ID is available from auth middleware

    // Check if we have a direct action or an AI-generated response
    if (xmlResponse) {
      // Process AI-generated XML response
      return await handleAIGeneratedRangeAction(req, res);
    }

    // Handle direct action (non-AI generated)
    if (!projectId || !action || !range) {
      return res.status(400).json({
        error: 'Missing required fields: projectId, action, and range are required'
      });
    }

    // Validate range format
    if (!range.start || !range.end || range.start < 0 || range.end < range.start) {
      return res.status(400).json({
        error: 'Invalid range format. Must include start and end indices with start <= end'
      });
    }

    // Get the line items in the specified range
    const lineItems = await getProjectLineItems(projectId, range.start, range.end - range.start + 1);
    
    if (!lineItems || lineItems.length === 0) {
      return res.status(404).json({
        error: 'No line items found in the specified range'
      });
    }

    let result;
    
    switch (action.toLowerCase()) {
      case 'update':
        if (!data || typeof data !== 'object') {
          return res.status(400).json({
            error: 'Update action requires data object with fields to update'
          });
        }
        // Update each item in the range with the provided data
        const updatePromises = lineItems.map(item => 
          updateLineItem(projectId, item.id, data, userId)
        );
        result = await Promise.all(updatePromises);
        break;
        
      case 'delete':
        // Delete items in the range
        const deletePromises = lineItems.map(item => 
          deleteLineItem(projectId, item.id, userId)
        );
        result = await Promise.all(deletePromises);
        break;
        
      case 'duplicate':
        // Duplicate items in the range
        const duplicatePromises = lineItems.map(item => 
          duplicateLineItem(projectId, item.id, userId)
        );
        result = await Promise.all(duplicatePromises);
        result = result.flat(); // Flatten array of arrays
        break;
        
      default:
        return res.status(400).json({
          error: `Unsupported action: ${action}. Supported actions are: update, delete, duplicate`
        });
    }

    // Get the updated list of line items
    const updatedItems = await getProjectLineItems(projectId);
    
    res.json({
      success: true,
      action,
      range,
      affectedCount: result.length,
      updatedItems
    });
    
  } catch (error) {
    console.error('Error processing range action:', error);
    res.status(500).json({
      error: 'Failed to process range action',
      details: error.message
    });
  }
}

/**
 * Handle range-based actions using AI-generated responses
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 */
async function handleAIGeneratedRangeAction(req, res) {
  try {
    const { projectId, range, prompt, xmlResponse } = req.body;
    const userId = req.user.id;

    if (!projectId || !range || !prompt) {
      return res.status(400).json({
        error: 'Missing required fields: projectId, range, and prompt are required'
      });
    }

    // Validate range format
    if (!range.start || !range.end || range.start < 0 || range.end < range.start) {
      return res.status(400).json({
        error: 'Invalid range format. Must include start and end indices with start <= end'
      });
    }

    // Get the line items in the specified range
    const lineItems = await getProjectLineItems(projectId, range.start, range.end - range.start + 1);
    
    if (!lineItems || lineItems.length === 0) {
      return res.status(404).json({
        error: 'No line items found in the specified range'
      });
    }

    // Analyze the prompt to determine the user's intent
    const promptLower = prompt.toLowerCase();
    
    // Check if this is a cost_type change only
    const isCostTypeChangeOnly = (
      (promptLower.includes('cost type') || promptLower.includes('cost_type')) &&
      (promptLower.includes('change') || promptLower.includes('set') || promptLower.includes('update')) &&
      !promptLower.includes('description') && !promptLower.includes('price') && !promptLower.includes('quantity')
    );
    
    // Check if this is a unit_type change only
    const isUnitTypeChangeOnly = (
      (promptLower.includes('unit type') || promptLower.includes('unit_type')) &&
      (promptLower.includes('change') || promptLower.includes('set') || promptLower.includes('update')) &&
      !promptLower.includes('description') && !promptLower.includes('price') && !promptLower.includes('quantity')
    );
    
    // Determine the change type
    const changeType = isCostTypeChangeOnly ? 'cost_type' : 
                      isUnitTypeChangeOnly ? 'unit_type' : 'general';
    
    console.log(`Detected change type: ${changeType}`);

    // If xmlResponse is provided directly, use it
    // Otherwise, generate a response using the AI service
    let aiResponse = xmlResponse;
    if (!aiResponse) {
      // Generate AI response based on the prompt and line items
      const itemsContext = lineItems.map(item => 
        `ID:${item.id}, description='${item.description}', quantity=${item.quantity}, ` +
        `unit_price=${item.unit_price}, amount=${item.amount}, ` +
        `cost_type='${item.cost_type || "material"}', unit_type='${item.unit_type || "unit"}'`
      ).join('\n');
      
      let fullPrompt;
      if (changeType === 'cost_type') {
        fullPrompt = `For the following line items:\n${itemsContext}\n\nUser request: ${prompt}\n\nPlease ONLY update the cost_type field and do not change any other fields. Use the format: <estimate><actions><action>+ ID:[id], cost_type=[new_cost_type]</action></actions></estimate>`;
      } else if (changeType === 'unit_type') {
        fullPrompt = `For the following line items:\n${itemsContext}\n\nUser request: ${prompt}\n\nPlease ONLY update the unit_type field and do not change any other fields. Valid unit types are: hour, day, unit, package. Use the format: <estimate><actions><action>+ ID:[id], unit_type=[new_unit_type]</action></actions></estimate>`;
      } else {
        fullPrompt = `For the following line items:\n${itemsContext}\n\nUser request: ${prompt}\n\nPlease provide actions to modify these items. For unit_type, valid values are: hour, day, unit, package. Use the format: <estimate><actions><action>+ ID:[id], [field]=[value]</action></actions></estimate>`;
      }
      
      // Call the AI service to generate a response
      aiResponse = await generateAdditionalEstimate(fullPrompt, projectId);
    }

    // Extract actions from the XML response
    const actions = extractActionsFromXML(aiResponse);
    if (!actions || actions.length === 0) {
      return res.status(400).json({
        error: 'No valid actions found in the AI response'
      });
    }
    
    // Validate and normalize the actions before applying them
    const normalizedActions = validateAndNormalizeActions(actions, changeType);
    console.log('Original actions:', actions);
    console.log('Normalized actions:', normalizedActions);

    // Apply the normalized actions to the line items
    const actionSummary = await applyLineItemChanges(projectId, userId, normalizedActions);

    // Log the prompt and actions to the conversation history
    await logPromptAndActions(projectId, userId, prompt, { response: aiResponse }, actionSummary);

    // Get the updated list of line items
    const updatedItems = await getProjectLineItems(projectId);
    
    res.json({
      success: true,
      prompt,
      range,
      actionSummary,
      updatedItems
    });
    
  } catch (error) {
    console.error('Error processing AI-generated range action:', error);
    res.status(500).json({
      error: 'Failed to process AI-generated range action',
      details: error.message
    });
  }
}

/**
 * Extract actions from XML response
 * @param {string} xmlString - XML response string
 * @returns {Array<string>} - Array of action strings
 */
function extractActionsFromXML(xmlString) {
  const actions = [];
  
  // Simple regex-based extraction for actions
  // In a production environment, consider using a proper XML parser
  const actionRegex = /<action>([^<]+)<\/action>/g;
  let match;
  
  while ((match = actionRegex.exec(xmlString)) !== null) {
    if (match[1] && match[1].trim()) {
      actions.push(match[1].trim());
    }
  }
  
  return actions;
}

/**
 * Validate and normalize action data before applying changes
 * @param {Array<string>} actions - Array of action strings
 * @param {string} [changeType='general'] - Type of change: 'cost_type', 'unit_type', or 'general'
 * @returns {Array<string>} - Array of validated and normalized action strings
 */
function validateAndNormalizeActions(actions, changeType = 'general') {
  return actions.map(action => {
    // If it's not an update action with ID, return as is
    if (!action.startsWith('+ ID:')) {
      return action;
    }
    
    try {
      // Extract the ID part
      const idMatch = action.match(/^\+ ID:(\d+)/);
      if (!idMatch) return action;
      
      const itemId = idMatch[1];
      const attributesPart = action.substring(action.indexOf(',') + 1).trim();
      
      // Parse the attributes
      const attributePairs = attributesPart.split(',').map(pair => pair.trim());
      const normalizedPairs = [];
      
      // Check if we need to add cost_type
      let hasCostType = false;
      
      for (const pair of attributePairs) {
        if (!pair.includes('=')) continue;
        
        const [key, value] = pair.split('=').map(part => part.trim());
        
        // Skip undefined values to prevent database errors
        if (value === 'undefined') continue;
        
        // Track if we have a cost_type field
        if (key === 'cost_type') {
          hasCostType = true;
        }
        
        // Handle different field types appropriately
        if (key === 'cost_type') {
          // cost_type is a string field, ensure it's properly quoted
          const formattedValue = value.startsWith('\'') || value.startsWith('"') 
            ? value 
            : `'${value}'`;
          normalizedPairs.push(`${key}=${formattedValue}`);
        } 
        else if (key === 'unit_type' || key === 'description' || key === 'title') {
          // These are string fields, ensure they're properly quoted if not already
          const formattedValue = value.startsWith('\'') || value.startsWith('"') 
            ? value 
            : `'${value}'`;
          normalizedPairs.push(`${key}=${formattedValue}`);
        }
        else if (key === 'is_sub_item') {
          // Boolean field
          const boolValue = value.toLowerCase() === 'true' ? 'true' : 'false';
          normalizedPairs.push(`${key}=${boolValue}`);
        }
        else if (key === 'amount' || key === 'unit_price' || key === 'quantity') {
          // Numeric fields, ensure they're valid numbers
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            normalizedPairs.push(`${key}=${numValue}`);
          }
        }
        else {
          // For other fields, keep as is
          normalizedPairs.push(`${key}=${value}`);
        }
      }
      
      // Handle different types of changes
      if (changeType === 'cost_type') {
        // For cost type changes, we only want to keep the cost_type field
        // and not auto-determine it from description
        const costTypePair = attributePairs.find(pair => pair.startsWith('cost_type='));
        
        if (costTypePair) {
          // Extract the cost_type value
          let costType = costTypePair.substring(costTypePair.indexOf('=') + 1).trim();
          // Remove quotes if present
          if ((costType.startsWith('\'') && costType.endsWith('\'')) ||
              (costType.startsWith('"') && costType.endsWith('"'))) {
            costType = costType.substring(1, costType.length - 1);
          }
          
          // Add the cost_type field with proper formatting
          normalizedPairs.push(`cost_type='${costType}'`);
          console.log(`Set cost_type='${costType}' for item ID:${itemId} (cost type change only)`);
        }
      } 
      else if (changeType === 'unit_type') {
        // For unit type changes, we only want to keep the unit_type field
        const unitTypePair = attributePairs.find(pair => pair.startsWith('unit_type='));
        
        if (unitTypePair) {
          // Extract the unit_type value
          let unitType = unitTypePair.substring(unitTypePair.indexOf('=') + 1).trim();
          // Remove quotes if present
          if ((unitType.startsWith('\'') && unitType.endsWith('\'')) ||
              (unitType.startsWith('"') && unitType.endsWith('"'))) {
            unitType = unitType.substring(1, unitType.length - 1);
          }
          
          // Validate unit_type value
          const validUnitTypes = ['hour', 'day', 'unit', 'package'];
          if (!validUnitTypes.includes(unitType.toLowerCase())) {
            unitType = 'unit'; // Default to 'unit' if invalid
            console.log(`Invalid unit_type '${unitType}', defaulting to 'unit'`);
          }
          
          // Add the unit_type field with proper formatting
          normalizedPairs.push(`unit_type='${unitType}'`);
          console.log(`Set unit_type='${unitType}' for item ID:${itemId} (unit type change only)`);
        }
      } 
      else {
        // For regular updates, process both unit_type and cost_type
        
        // Handle unit_type if present
        const unitTypePair = attributePairs.find(pair => pair.startsWith('unit_type='));
        if (unitTypePair) {
          // Extract the unit_type value
          let unitType = unitTypePair.substring(unitTypePair.indexOf('=') + 1).trim();
          // Remove quotes if present
          if ((unitType.startsWith('\'') && unitType.endsWith('\'')) ||
              (unitType.startsWith('"') && unitType.endsWith('"'))) {
            unitType = unitType.substring(1, unitType.length - 1);
          }
          
          // Validate unit_type value
          const validUnitTypes = ['hour', 'day', 'unit', 'package'];
          if (!validUnitTypes.includes(unitType.toLowerCase())) {
            unitType = 'unit'; // Default to 'unit' if invalid
            console.log(`Invalid unit_type '${unitType}', defaulting to 'unit'`);
          }
          
          // Remove any existing unit_type from normalizedPairs
          const unitTypeIndex = normalizedPairs.findIndex(pair => pair.startsWith('unit_type='));
          if (unitTypeIndex !== -1) {
            normalizedPairs.splice(unitTypeIndex, 1);
          }
          
          // Add the unit_type field with proper formatting
          normalizedPairs.push(`unit_type='${unitType}'`);
        }
        
        // Determine cost_type based on description if present
        const descriptionPair = attributePairs.find(pair => pair.startsWith('description='));
        
        if (descriptionPair) {
          // Extract the description value
          let description = descriptionPair.substring(descriptionPair.indexOf('=') + 1).trim();
          // Remove quotes if present
          if ((description.startsWith('\'') && description.endsWith('\'')) ||
              (description.startsWith('"') && description.endsWith('"'))) {
            description = description.substring(1, description.length - 1);
          }
          
          description = description.toLowerCase();
          
          // Determine cost_type based on keywords
          let costType = null;
          
          if (description.includes('admin')) {
            costType = 'admin';
          } else if (description.includes('equipment') || description.includes('tool') || 
                    description.includes('machine') || description.includes('device')) {
            costType = 'equipment';
          } else if (description.includes('labor') || description.includes('work') || 
                    description.includes('service') || description.includes('hour') || 
                    description.includes('installation')) {
            costType = 'labor';
          } else if (description.includes('material') || description.includes('supply') || 
                    description.includes('part') || description.includes('component')) {
            costType = 'material';
          } else if (description.includes('overhead') || description.includes('indirect') || 
                    description.includes('administrative')) {
            costType = 'overhead';
          } else {
            costType = 'other'; // Default to 'other' if no match
          }
          
          // Only set cost_type if it's not explicitly provided
          const hasCostType = attributePairs.some(pair => pair.startsWith('cost_type='));
          if (!hasCostType) {
            // Remove any existing cost_type from normalizedPairs
            const costTypeIndex = normalizedPairs.findIndex(pair => pair.startsWith('cost_type='));
            if (costTypeIndex !== -1) {
              normalizedPairs.splice(costTypeIndex, 1);
            }
            
            // Add the determined cost_type
            normalizedPairs.push(`cost_type='${costType}'`);
            console.log(`Set cost_type='${costType}' based on description for item ID:${itemId}`);
          }
        }
      }
      
      // Reconstruct the action string
      return `+ ID:${itemId}, ${normalizedPairs.join(', ')}`;
    } catch (error) {
      console.error('Error normalizing action:', action, error);
      return action; // Return original action if normalization fails
    }
  });
}

// Helper function to update a line item
async function updateLineItem(projectId, itemId, updates, userId) {
  // Get the current item to merge with existing data field
  const { data: currentItem, error: fetchError } = await supabase
    .from('estimate_items')
    .select('data')
    .eq('id', itemId)
    .eq('project_id', projectId)
    .single();
    
  if (fetchError) throw fetchError;
  
  // Extract custom column data from updates
  const { 
    title, 
    description, 
    quantity, 
    unit_price, 
    unit_type, 
    cost_type, 
    amount, 
    currency,
    total_amount,
    status,
    parent_item_id,
    is_sub_item,
    // Exclude any fields that are part of the standard schema
    // Keep all other fields as customFields
    ...customFields 
  } = updates;
  
  // Prepare standard fields update
  const standardFieldsUpdate = {
    ...(title !== undefined && { title }),
    ...(description !== undefined && { description }),
    ...(quantity !== undefined && { quantity }),
    ...(unit_price !== undefined && { unit_price }),
    ...(unit_type !== undefined && { unit_type }),
    ...(cost_type !== undefined && { cost_type }),
    ...(amount !== undefined && { amount }),
    ...(currency !== undefined && { currency }),
    ...(total_amount !== undefined && { total_amount }),
    ...(status !== undefined && { status }),
    ...(parent_item_id !== undefined && { parent_item_id }),
    ...(is_sub_item !== undefined && { is_sub_item }),
    updated_at: new Date().toISOString(),
    updated_by: userId
  };
  
  // Merge existing data with new custom fields
  const updatedData = {
    ...(currentItem?.data || {}),
    ...customFields
  };
  
  // Update the item with both standard fields and custom fields in the data JSON
  const { data, error } = await supabase
    .from('estimate_items')
    .update({
      ...standardFieldsUpdate,
      data: updatedData,
      updated_at: new Date().toISOString(),
      updated_by: userId
    })
    .eq('id', itemId)
    .eq('project_id', projectId)
    .select();
    
  if (error) throw error;
  return data[0];
}

// Helper function to delete a line item
async function deleteLineItem(projectId, itemId, userId) {
  // In a real implementation, you might want to soft delete
  const { data, error } = await supabase
    .from('estimate_items')
    .delete()
    .eq('id', itemId)
    .eq('project_id', projectId);
    
  if (error) throw error;
  return { id: itemId, deleted: true };
}

// Helper function to duplicate a line item
async function duplicateLineItem(projectId, itemId, userId) {
  // First get the item to duplicate
  const { data: item, error: fetchError } = await supabase
    .from('estimate_items')
    .select('*')
    .eq('id', itemId)
    .eq('project_id', projectId)
    .single();
    
  if (fetchError) throw fetchError;
  
  // Remove the ID to create a new record
  const { id, created_at, updated_at, ...itemData } = item;
  
  // Ensure data field is preserved - this contains all custom column values
  const dataField = itemData.data || {};
  
  // Create the duplicate
  const { data: newItem, error: createError } = await supabase
    .from('estimate_items')
    .insert([{
      ...itemData,
      data: dataField, // Explicitly include the data field with custom column values
      created_by: userId,
      updated_by: userId,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString()
    }])
    .select();
    
  if (createError) throw createError;
  return newItem[0];
}

export {
  handleEstimatorRequest,
  handleAdditionalPrompt,
  handleRangeAction
};
