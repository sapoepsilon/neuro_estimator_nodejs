import {
  generateEstimate,
  generateAdditionalEstimate,
} from "../services/geminiService.js";
import {
  getProjectById,
  getConversationsByProjectId,
  createProject,
  getProjectLineItems,
  applyLineItemChanges,
  logPromptAndActions,
} from "../services/projectService.js";

/**
 * Validate the request data for the estimator
 * @param {Object} requestData - The data to validate
 * @param {string} requestData.prompt - The construction project prompt
 * @returns {Object|null} - Error object if validation fails, null if successful
 */
function validateEstimatorRequest(requestData) {
  if (!requestData || Object.keys(requestData).length === 0) {
    return {
      status: 400,
      message: "Request body cannot be empty",
    };
  }

  if (!requestData.prompt || typeof requestData.prompt !== 'string' || !requestData.prompt.trim()) {
    return {
      status: 400,
      message: "Prompt is required and must be a non-empty string",
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

    const validationError = validateEstimatorRequest(requestData);
    if (validationError) {
      return res
        .status(validationError.status)
        .json({ error: validationError.message });
    }

    const user = req.user;
    const prompt = requestData.prompt.trim();
    
    // Generate project name from prompt (first 50 characters or until punctuation)
    let projectName = prompt.length > 50 ? prompt.substring(0, 50).trim() + "..." : prompt;
    const punctuationIndex = projectName.search(/[.!?]/);
    if (punctuationIndex > 0 && punctuationIndex < projectName.length - 3) {
      projectName = projectName.substring(0, punctuationIndex);
    }

    const requestWithUser = {
      prompt: prompt,
      projectDetails: {
        title: projectName,
        description: prompt
      },
      userId: user.id,
    };

    // Generate construction estimate using AI
    const { projectTitle, currency, instructions, rawGeminiResponse } =
      await generateEstimate(requestWithUser);

    const createdProject = await createProject(
      {
        name: projectTitle || projectName,
        description: prompt,
      },
      user.id,
      0, // Initial total estimate is 0
      currency,
      rawGeminiResponse
    );

    console.log("Project created with ID:", createdProject.id);

    const actionSummary = await applyLineItemChanges(
      createdProject.id,
      user.id,
      instructions,
      currency
    );

    await logPromptAndActions(
      createdProject.id,
      user.id,
      prompt,
      rawGeminiResponse,
      actionSummary
    );

    return res.json({
      success: true,
      projectId: createdProject.id,
      projectTitle: projectTitle || projectName,
      currency,
      itemsAdded: actionSummary.itemsAdded,
      errors: actionSummary.errors,
      message: `Created construction project "${projectTitle || projectName}" with ${actionSummary.itemsAdded} line items`,
    });
  } catch (error) {
    console.error("Error in estimator controller:", error);
    return res.status(500).json({
      error: "Failed to generate construction estimate",
      details: error.message,
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
  if (!requestData || Object.keys(requestData).length === 0) {
    return {
      status: 400,
      message: "Request body cannot be empty",
    };
  }

  if (!requestData.projectId) {
    return {
      status: 400,
      message: "Project ID is required",
    };
  }

  if (!requestData.prompt) {
    return {
      status: 400,
      message: "Prompt is required",
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

    const validationError = validateAdditionalPromptRequest(requestData);
    if (validationError) {
      return res
        .status(validationError.status)
        .json({ error: validationError.message });
    }

    const user = req.user || { id: null };
    const projectId = requestData.projectId;

    const project = await getProjectById(projectId);
    if (!project) {
      return res.status(404).json({ error: "Project not found" });
    }

    if (project.business_id) {
      const lineItems = await getProjectLineItems(projectId, offset, 300);
      const { instructions, rawGeminiResponse } =
        await generateAdditionalEstimate({
          ...requestData,
          userId: user.id,
          projectId: project.id,
          existingProject: project,
          existingItems: lineItems,
        });

      const actionSummary = await applyLineItemChanges(
        projectId,
        user.id,
        instructions,
        project.currency || "USD"
      );

      await logPromptAndActions(
        projectId,
        user.id,
        requestData.prompt,
        rawGeminiResponse,
        actionSummary
      );

      const hasMoreItems = lineItems.length === 300;
      const nextOffset = hasMoreItems ? offset + lineItems.length : null;

      return res.json({
        success: true,
        projectId,
        itemsAdded: actionSummary.itemsAdded,
        itemsUpdated: actionSummary.itemsUpdated,
        itemsDeleted: actionSummary.itemsDeleted,
        errors: actionSummary.errors,
        nextOffset,
        message: `Applied ${
          actionSummary.itemsAdded +
          actionSummary.itemsUpdated +
          actionSummary.itemsDeleted
        } changes to the project`,
      });
    } else {
      return res
        .status(403)
        .json({ error: "You do not have access to this project" });
    }
  } catch (error) {
    console.error("Error in additional prompt controller:", error);
    return res.status(500).json({
      error: "Failed to process additional prompt",
      details: error.message,
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
        error:
          "Missing required fields: projectId, action, and range are required",
      });
    }

    // Validate range format
    if (
      !range.start ||
      !range.end ||
      range.start < 0 ||
      range.end < range.start
    ) {
      return res.status(400).json({
        error:
          "Invalid range format. Must include start and end indices with start <= end",
      });
    }

    // Get the line items in the specified range
    const lineItems = await getProjectLineItems(
      projectId,
      range.start,
      range.end - range.start + 1
    );

    if (!lineItems || lineItems.length === 0) {
      return res.status(404).json({
        error: "No line items found in the specified range",
      });
    }

    let result;

    switch (action.toLowerCase()) {
      case "update": {
        if (!data || typeof data !== "object") {
          return res.status(400).json({
            error: "Update action requires data object with fields to update",
          });
        }
        const updatePromises = lineItems.map((item) =>
          updateLineItem(projectId, item.id, data, userId)
        );
        result = await Promise.all(updatePromises);
        break;
      }

      case "delete": {
        const deletePromises = lineItems.map((item) =>
          deleteLineItem(projectId, item.id, userId)
        );
        result = await Promise.all(deletePromises);
        break;
      }

      case "duplicate": {
        const duplicatePromises = lineItems.map((item) =>
          duplicateLineItem(projectId, item.id, userId)
        );
        result = await Promise.all(duplicatePromises);
        result = result.flat();
        break;
      }

      default: {
        return res.status(400).json({
          error: `Unsupported action: ${action}. Supported actions are: update, delete, duplicate`,
        });
      }
    }

    const updatedItems = await getProjectLineItems(projectId);

    res.json({
      success: true,
      action,
      range,
      affectedCount: result.length,
      updatedItems,
    });
  } catch (error) {
    console.error("Error processing range action:", error);
    res.status(500).json({
      error: "Failed to process range action",
      details: error.message,
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
        error:
          "Missing required fields: projectId, range, and prompt are required",
      });
    }

    if (
      !range.start ||
      !range.end ||
      range.start < 0 ||
      range.end < range.start
    ) {
      return res.status(400).json({
        error:
          "Invalid range format. Must include start and end indices with start <= end",
      });
    }

    const lineItems = await getProjectLineItems(
      projectId,
      range.start,
      range.end - range.start + 1
    );

    if (!lineItems || lineItems.length === 0) {
      return res.status(404).json({
        error: "No line items found in the specified range",
      });
    }

    const promptLower = prompt.toLowerCase();

    const isCostTypeChangeOnly =
      (promptLower.includes("cost type") ||
        promptLower.includes("cost_type")) &&
      (promptLower.includes("change") ||
        promptLower.includes("set") ||
        promptLower.includes("update")) &&
      !promptLower.includes("description") &&
      !promptLower.includes("price") &&
      !promptLower.includes("quantity");

    const isUnitTypeChangeOnly =
      (promptLower.includes("unit type") ||
        promptLower.includes("unit_type")) &&
      (promptLower.includes("change") ||
        promptLower.includes("set") ||
        promptLower.includes("update")) &&
      !promptLower.includes("description") &&
      !promptLower.includes("price") &&
      !promptLower.includes("quantity");

    const changeType = isCostTypeChangeOnly
      ? "cost_type"
      : isUnitTypeChangeOnly
      ? "unit_type"
      : "general";

    console.log(`Detected change type: ${changeType}`);

    let aiResponse = xmlResponse;
    if (!aiResponse) {
      const itemsContext = lineItems
        .map(
          (item) =>
            `ID:${item.id}, description='${item.description}', quantity=${item.quantity}, ` +
            `unit_price=${item.unit_price}, amount=${item.amount}, ` +
            `cost_type='${item.cost_type || "material"}', unit_type='${
              item.unit_type || "unit"
            }'`
        )
        .join("\n");

      let fullPrompt;
      if (changeType === "cost_type") {
        fullPrompt = `For the following line items:\n${itemsContext}\n\nUser request: ${prompt}\n\nPlease ONLY update the cost_type field and do not change any other fields. Use the format: <estimate><actions><action>+ ID:[id], cost_type=[new_cost_type]</action></actions></estimate>`;
      } else if (changeType === "unit_type") {
        fullPrompt = `For the following line items:\n${itemsContext}\n\nUser request: ${prompt}\n\nPlease ONLY update the unit_type field and do not change any other fields. Valid unit types are: hour, day, unit, package. Use the format: <estimate><actions><action>+ ID:[id], unit_type=[new_unit_type]</action></actions></estimate>`;
      } else {
        fullPrompt = `For the following line items:\n${itemsContext}\n\nUser request: ${prompt}\n\nPlease provide actions to modify these items. For unit_type, valid values are: hour, day, unit, package. Use the format: <estimate><actions><action>+ ID:[id], [field]=[value]</action></actions></estimate>`;
      }

      aiResponse = await generateAdditionalEstimate(fullPrompt, projectId);
    }

    const actions = extractActionsFromXML(aiResponse);
    if (!actions || actions.length === 0) {
      return res.status(400).json({
        error: "No valid actions found in the AI response",
      });
    }

    const normalizedActions = validateAndNormalizeActions(actions, changeType);
    console.log("Original actions:", actions);
    console.log("Normalized actions:", normalizedActions);
    const actionSummary = await applyLineItemChanges(
      projectId,
      userId,
      normalizedActions
    );

    await logPromptAndActions(
      projectId,
      userId,
      prompt,
      { response: aiResponse },
      actionSummary
    );

    const updatedItems = await getProjectLineItems(projectId);

    res.json({
      success: true,
      prompt,
      range,
      actionSummary,
      updatedItems,
    });
  } catch (error) {
    console.error("Error processing AI-generated range action:", error);
    res.status(500).json({
      error: "Failed to process AI-generated range action",
      details: error.message,
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
function validateAndNormalizeActions(actions, changeType = "general") {
  return actions.map((action) => {
    // If it's not an update action with ID, return as is
    if (!action.startsWith("+ ID:")) {
      return action;
    }

    try {
      // Extract the ID part
      const idMatch = action.match(/^\+ ID:(\d+)/);
      if (!idMatch) return action;

      const itemId = idMatch[1];
      const attributesPart = action.substring(action.indexOf(",") + 1).trim();

      // Parse the attributes
      const attributePairs = attributesPart
        .split(",")
        .map((pair) => pair.trim());
      const normalizedPairs = [];

      // Check if we need to add cost_type
      let hasCostType = false;

      for (const pair of attributePairs) {
        if (!pair.includes("=")) continue;

        const [key, value] = pair.split("=").map((part) => part.trim());

        // Skip undefined values to prevent database errors
        if (value === "undefined") continue;

        // Track if we have a cost_type field
        if (key === "cost_type") {
          hasCostType = true;
        }

        // Handle different field types appropriately
        if (key === "cost_type") {
          // cost_type is a string field, ensure it's properly quoted
          const formattedValue =
            value.startsWith("'") || value.startsWith('"')
              ? value
              : `'${value}'`;
          normalizedPairs.push(`${key}=${formattedValue}`);
        } else if (
          key === "unit_type" ||
          key === "description" ||
          key === "title"
        ) {
          // These are string fields, ensure they're properly quoted if not already
          const formattedValue =
            value.startsWith("'") || value.startsWith('"')
              ? value
              : `'${value}'`;
          normalizedPairs.push(`${key}=${formattedValue}`);
        } else if (key === "is_sub_item") {
          // Boolean field
          const boolValue = value.toLowerCase() === "true" ? "true" : "false";
          normalizedPairs.push(`${key}=${boolValue}`);
        } else if (
          key === "amount" ||
          key === "unit_price" ||
          key === "quantity"
        ) {
          // Numeric fields, ensure they're valid numbers
          const numValue = parseFloat(value);
          if (!isNaN(numValue)) {
            normalizedPairs.push(`${key}=${numValue}`);
          }
        } else {
          // For other fields, keep as is
          normalizedPairs.push(`${key}=${value}`);
        }
      }

      // Handle different types of changes
      if (changeType === "cost_type") {
        // For cost type changes, we only want to keep the cost_type field
        // and not auto-determine it from description
        const costTypePair = attributePairs.find((pair) =>
          pair.startsWith("cost_type=")
        );

        if (costTypePair) {
          // Extract the cost_type value
          let costType = costTypePair
            .substring(costTypePair.indexOf("=") + 1)
            .trim();
          // Remove quotes if present
          if (
            (costType.startsWith("'") && costType.endsWith("'")) ||
            (costType.startsWith('"') && costType.endsWith('"'))
          ) {
            costType = costType.substring(1, costType.length - 1);
          }

          // Add the cost_type field with proper formatting
          normalizedPairs.push(`cost_type='${costType}'`);
          console.log(
            `Set cost_type='${costType}' for item ID:${itemId} (cost type change only)`
          );
        }
      } else if (changeType === "unit_type") {
        // For unit type changes, we only want to keep the unit_type field
        const unitTypePair = attributePairs.find((pair) =>
          pair.startsWith("unit_type=")
        );

        if (unitTypePair) {
          // Extract the unit_type value
          let unitType = unitTypePair
            .substring(unitTypePair.indexOf("=") + 1)
            .trim();
          // Remove quotes if present
          if (
            (unitType.startsWith("'") && unitType.endsWith("'")) ||
            (unitType.startsWith('"') && unitType.endsWith('"'))
          ) {
            unitType = unitType.substring(1, unitType.length - 1);
          }

          // Validate unit_type value
          const validUnitTypes = ["hour", "day", "unit", "package"];
          if (!validUnitTypes.includes(unitType.toLowerCase())) {
            unitType = "unit"; // Default to 'unit' if invalid
            console.log(
              `Invalid unit_type '${unitType}', defaulting to 'unit'`
            );
          }

          // Add the unit_type field with proper formatting
          normalizedPairs.push(`unit_type='${unitType}'`);
          console.log(
            `Set unit_type='${unitType}' for item ID:${itemId} (unit type change only)`
          );
        }
      } else {
        const unitTypePair = attributePairs.find((pair) =>
          pair.startsWith("unit_type=")
        );
        if (unitTypePair) {
          let unitType = unitTypePair
            .substring(unitTypePair.indexOf("=") + 1)
            .trim();
          if (
            (unitType.startsWith("'") && unitType.endsWith("'")) ||
            (unitType.startsWith('"') && unitType.endsWith('"'))
          ) {
            unitType = unitType.substring(1, unitType.length - 1);
          }

          const validUnitTypes = ["hour", "day", "unit", "package"];
          if (!validUnitTypes.includes(unitType.toLowerCase())) {
            unitType = "unit"; // Default to 'unit' if invalid
            console.log(
              `Invalid unit_type '${unitType}', defaulting to 'unit'`
            );
          }

          const unitTypeIndex = normalizedPairs.findIndex((pair) =>
            pair.startsWith("unit_type=")
          );
          if (unitTypeIndex !== -1) {
            normalizedPairs.splice(unitTypeIndex, 1);
          }

          normalizedPairs.push(`unit_type='${unitType}'`);
        }

        const descriptionPair = attributePairs.find((pair) =>
          pair.startsWith("description=")
        );

        if (descriptionPair) {
          let description = descriptionPair
            .substring(descriptionPair.indexOf("=") + 1)
            .trim();
          if (
            (description.startsWith("'") && description.endsWith("'")) ||
            (description.startsWith('"') && description.endsWith('"'))
          ) {
            description = description.substring(1, description.length - 1);
          }

          description = description.toLowerCase();

          let costType = null;

          if (description.includes("admin")) {
            costType = "admin";
          } else if (
            description.includes("equipment") ||
            description.includes("tool") ||
            description.includes("machine") ||
            description.includes("device")
          ) {
            costType = "equipment";
          } else if (
            description.includes("labor") ||
            description.includes("work") ||
            description.includes("service") ||
            description.includes("hour") ||
            description.includes("installation")
          ) {
            costType = "labor";
          } else if (
            description.includes("material") ||
            description.includes("supply") ||
            description.includes("part") ||
            description.includes("component")
          ) {
            costType = "material";
          } else if (
            description.includes("overhead") ||
            description.includes("indirect") ||
            description.includes("administrative")
          ) {
            costType = "overhead";
          } else {
            costType = "other"; // Default to 'other' if no match
          }

          // Only set cost_type if it's not explicitly provided
          const hasCostType = attributePairs.some((pair) =>
            pair.startsWith("cost_type=")
          );
          if (!hasCostType) {
            // Remove any existing cost_type from normalizedPairs
            const costTypeIndex = normalizedPairs.findIndex((pair) =>
              pair.startsWith("cost_type=")
            );
            if (costTypeIndex !== -1) {
              normalizedPairs.splice(costTypeIndex, 1);
            }

            // Add the determined cost_type
            normalizedPairs.push(`cost_type='${costType}'`);
            console.log(
              `Set cost_type='${costType}' based on description for item ID:${itemId}`
            );
          }
        }
      }

      // Reconstruct the action string
      return `+ ID:${itemId}, ${normalizedPairs.join(", ")}`;
    } catch (error) {
      console.error("Error normalizing action:", action, error);
      return action; // Return original action if normalization fails
    }
  });
}

// Helper function to update a line item
async function updateLineItem(projectId, itemId, updates, userId) {
  // Implementation depends on your database schema
  // This is a simplified example
  const { data, error } = await supabase
    .from("estimate_items")
    .update({
      ...updates,
      updated_at: new Date().toISOString(),
      updated_by: userId,
    })
    .eq("id", itemId)
    .eq("project_id", projectId)
    .select();

  if (error) throw error;
  return data[0];
}

// Helper function to delete a line item
async function deleteLineItem(projectId, itemId, userId) {
  // In a real implementation, you might want to soft delete
  const { data, error } = await supabase
    .from("estimate_items")
    .delete()
    .eq("id", itemId)
    .eq("project_id", projectId);

  if (error) throw error;
  return { id: itemId, deleted: true };
}

// Helper function to duplicate a line item
async function duplicateLineItem(projectId, itemId, userId) {
  // First get the item to duplicate
  const { data: item, error: fetchError } = await supabase
    .from("estimate_items")
    .select("*")
    .eq("id", itemId)
    .eq("project_id", projectId)
    .single();

  if (fetchError) throw fetchError;

  // Remove the ID to create a new record
  const { id, created_at, updated_at, ...itemData } = item;

  // Create the duplicate
  const { data: newItem, error: createError } = await supabase
    .from("estimate_items")
    .insert([
      {
        ...itemData,
        created_by: userId,
        updated_by: userId,
      },
    ])
    .select();

  if (createError) throw createError;
  return newItem[0];
}

export { handleEstimatorRequest, handleAdditionalPrompt, handleRangeAction };
