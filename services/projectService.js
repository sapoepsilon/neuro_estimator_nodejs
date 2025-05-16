import { supabase } from "./supabaseService.js";

/**
 * Parse attributes from an instruction string
 * @param {string} instructionPart - The instruction string (e.g., "description='Site Prep', quantity=1")
 * @returns {Object} - Object with parsed attributes
 */
function parseInstructionAttributes(instructionPart) {
  const attributes = {};
  let currentKey = "";
  let currentValue = "";
  let inQuote = false;
  let quoteChar = "";
  let parsingKey = true;

  if (instructionPart.startsWith("ID:")) {
    const idMatch = instructionPart.match(/^ID:(\d+),?\s*/);
    if (idMatch) {
      attributes.id = parseInt(idMatch[1], 10);
      instructionPart = instructionPart.substring(idMatch[0].length);
    }
  }

  for (let i = 0; i < instructionPart.length; i++) {
    const char = instructionPart[i];

    if (parsingKey) {
      if (char === "=") {
        parsingKey = false;
        currentKey = currentKey.trim();
      } else {
        currentKey += char;
      }
    } else {
      if (!inQuote && (char === "'" || char === '"')) {
        inQuote = true;
        quoteChar = char;
      } else if (inQuote && char === quoteChar) {
        inQuote = false;
      } else if (!inQuote && char === ",") {
        attributes[currentKey] = processValue(currentValue.trim(), currentKey);
        currentKey = "";
        currentValue = "";
        parsingKey = true;
      } else {
        currentValue += char;
      }
    }
  }

  if (currentKey) {
    attributes[currentKey] = processValue(currentValue.trim(), currentKey);
  }

  return attributes;
}

/**
 * Process a value to convert it to the appropriate type
 * @param {string} value - The value to process
 * @param {string} [key] - Optional key name to help determine type
 * @returns {any} - The processed value
 */
function processValue(value, key) {
  // Handle quoted strings (remove quotes)
  if (
    (value.startsWith("'") && value.endsWith("'")) ||
    (value.startsWith('"') && value.endsWith('"'))
  ) {
    return value.substring(1, value.length - 1);
  }
  
  // Special handling for known text fields
  if (key && ['cost_type', 'unit_type', 'status'].includes(key)) {
    return value; // Keep as string even if it looks like a number
  }

  // Convert numeric strings to numbers
  if (!isNaN(value) && value.trim() !== "") {
    return Number(value);
  }

  // Handle boolean values
  if (value.toLowerCase() === 'true') return true;
  if (value.toLowerCase() === 'false') return false;

  // Default case
  return value;
}

/**
 * Create a new project in the database
 * @param {Object} projectData - Project data
 * @param {string} projectData.name - Project name (can come from projectTitle extracted from Gemini's XML)
 * @param {string} projectData.description - Project description
 * @param {string} userId - The ID of the authenticated user
 * @param {number} [totalEstimate] - Total estimate value (optional)
 * @param {string} [currency] - Currency of the estimate (optional)
 * @param {Object} [rawResponse] - The raw response from Gemini (containing prompt and processed XML)
 * @returns {Promise<Object>} - The created project
 */
async function createProject(
  projectData,
  userId,
  totalEstimate = null,
  currency = "USD",
  rawResponse = null
) {
  try {
    const { data: businessUsers, error: businessError } = await supabase
      .from("business_users")
      .select("business_id")
      .eq("user_id", userId)
      .limit(1);

    if (businessError || !businessUsers || businessUsers.length === 0) {
      throw new Error("Failed to find business for user");
    }

    const businessId = businessUsers[0].business_id;

    const projectInsertData = {
      business_id: businessId,
      name: projectData.name,
      description: projectData.description || "",
      status: "draft",
      created_by: userId,
    };

    const { data: project, error } = await supabase
      .from("projects")
      .insert(projectInsertData)
      .select()
      .single();

    if (error) {
      throw error;
    }

    if (rawResponse && project.id) {
      try {
        const { data: conversation, error: convError } = await supabase
          .from("conversations")
          .insert({
            business_id: businessId,
            project_id: project.id,
            created_by: userId,
          })
          .select()
          .single();

        if (convError) {
          console.error("Error creating conversation:", convError);
        } else if (conversation && conversation.id) {
          const { error: msgError } = await supabase.from("messages").insert({
            conversation_id: conversation.id,
            content: JSON.stringify({
              type: "estimate",
              title: `Estimate for ${projectData.name}`,
              total_amount: totalEstimate,
              currency: currency,
              raw_response: rawResponse, // This now contains the prompt and processed XML
            }),
            role: "assistant",
            user_id: userId,
          });

          if (msgError) {
            console.error("Error creating message:", msgError);
          }
        }
      } catch (storageError) {
        console.error("Error storing Gemini response:", storageError);
        // Continue execution even if storing the response fails
      }
    }

    return project;
  } catch (error) {
    console.error("Error creating project:", error);
    throw error;
  }
}

/**
 * Update a project with estimate information
 * @param {number} projectId - The ID of the project
 * @param {number} totalEstimate - Total estimate value
 * @param {string} currency - Currency of the estimate
 * @returns {Promise<Object>} - The updated project
 */
async function updateProjectWithEstimate(
  projectId,
  totalEstimate,
  currency = "USD",
  userId = null
) {
  try {
    // First, get the project to ensure it exists
    const { data: project, error: projectError } = await supabase
      .from("projects")
      .select("id, business_id")
      .eq("id", projectId)
      .single();

    if (projectError) {
      throw projectError;
    }

    if (!project) {
      throw new Error(`Project with ID ${projectId} not found`);
    }

    // Get the existing conversation for this project or create a new one
    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("project_id", projectId)
      .limit(1);

    let conversationId;

    if (convError || !conversations || conversations.length === 0) {
      const { data: newConversation, error: newConvError } = await supabase
        .from("conversations")
        .insert({
          business_id: project.business_id,
          project_id: projectId,
          created_by: userId,
        })
        .select()
        .single();

      if (newConvError) {
        console.error("Error creating conversation:", newConvError);
      } else {
        conversationId = newConversation.id;
      }
    } else {
      conversationId = conversations[0].id;
    }

    if (conversationId) {
      const { error: msgError } = await supabase.from("messages").insert({
        conversation_id: conversationId,
        content: JSON.stringify({
          type: "estimate_update",
          message: `Estimate updated with total: ${totalEstimate} ${currency}`,
          total_amount: totalEstimate,
          currency: currency,
          updated_at: new Date().toISOString(),
        }),
        role: "system",
        user_id: userId,
      });

      if (msgError) {
        console.error("Error creating message for estimate update:", msgError);
      }
    }

    return project;
  } catch (error) {
    console.error("Error updating project with estimate:", error);
    throw error;
  }
}

/**
 * Get project line items with pagination
 * @param {number|string} projectId - The ID of the project
 * @param {number} offset - Offset for pagination (default: 0)
 * @param {number} limit - Limit for pagination (default: 300)
 * @returns {Promise<Array>} - Array of line items
 */
async function getProjectLineItems(projectId, offset = 0, limit = 300) {
  try {
    const { data: items, error } = await supabase
      .from("estimate_items")
      .select("*")
      .eq("project_id", projectId)
      .range(offset, offset + limit - 1)
      .order("created_at", { ascending: true });

    if (error) {
      console.error("Error fetching project line items:", error);
      throw error;
    }

    return items || [];
  } catch (error) {
    console.error(
      `Error in getProjectLineItems for project ${projectId}:`,
      error
    );
    throw error;
  }
}

/**
 * Apply line item changes based on instructions from Gemini
 * @param {number|string} projectId - The ID of the project
 * @param {string} userId - The ID of the authenticated user
 * @param {Array<string>} instructions - Array of instruction strings (e.g., ["+ description='Item A', quantity=10", "- ID:123"])
 * @param {string} currency - Currency to use for the items (default: USD)
 * @returns {Promise<Object>} - Summary of actions performed
 */
async function applyLineItemChanges(
  projectId,
  userId,
  instructions,
  currency = "USD"
) {
  try {
    const summary = {
      itemsAdded: 0,
      itemsUpdated: 0,
      itemsDeleted: 0,
      errors: [],
    };

    for (const instruction of instructions) {
      const trimmedInstruction = instruction.trim();

      if (!trimmedInstruction) continue;

      if (trimmedInstruction.startsWith("+ ID:")) {
        const idMatch = trimmedInstruction.match(/^\+ ID:(\d+)/);
        if (!idMatch) {
          summary.errors.push(
            `Invalid update instruction: ${trimmedInstruction}`
          );
          continue;
        }

        const itemId = parseInt(idMatch[1], 10);
        const attributesStr = trimmedInstruction
          .substring(trimmedInstruction.indexOf(",") + 1)
          .trim();
        const attributes = parseInstructionAttributes(attributesStr);

        if (
          attributes.quantity &&
          attributes.unit_price &&
          !attributes.amount
        ) {
          attributes.amount = attributes.quantity * attributes.unit_price;
        }

        const updateData = {};
        for (const [key, value] of Object.entries(attributes)) {
          if (key === "unit_price") updateData.unit_price = value;
          else if (key === "parent_id") updateData.parent_item_id = value;
          else if (key === "title") updateData.title = value;
          else if (key === "unit_type") updateData.unit_type = value;
          else if (key === "cost_type") updateData.cost_type = value;
          else if (key === "is_sub_item") updateData.is_sub_item = value;
          else if (key === "data") updateData.data = value;
          else updateData[key] = value;
        }
        
        // If description is being updated, determine the appropriate cost_type
        if (attributes.description && !attributes.cost_type) {
          const description = attributes.description.toLowerCase();
          
          // Determine cost_type based on keywords in the description
          if (description.includes('admin')) {
            updateData.cost_type = 'admin';
          } else if (description.includes('equipment') || description.includes('tool') || 
                    description.includes('machine') || description.includes('device')) {
            updateData.cost_type = 'equipment';
          } else if (description.includes('labor') || description.includes('work') || 
                    description.includes('service') || description.includes('hour') || 
                    description.includes('installation')) {
            updateData.cost_type = 'labor';
          } else if (description.includes('material') || description.includes('supply') || 
                    description.includes('part') || description.includes('component')) {
            updateData.cost_type = 'material';
          } else if (description.includes('overhead') || description.includes('indirect') || 
                    description.includes('administrative')) {
            updateData.cost_type = 'overhead';
          } else {
            updateData.cost_type = 'other'; // Default to 'other' if no match
          }
          
          console.log(`Automatically set cost_type to '${updateData.cost_type}' based on description for item ID:${itemId}`);
        }

        if (updateData.description && !updateData.title) {
          updateData.title = updateData.description;
        }

        const { error } = await supabase
          .from("estimate_items")
          .update(updateData)
          .eq("id", itemId)
          .eq("project_id", projectId);

        if (error) {
          console.error("Error updating item ID:", itemId, error);
          summary.errors.push(
            `Error updating item ID:${itemId}: ${error.message}`
          );
        } else {
          console.log("Successfully updated item ID:", itemId);
          summary.itemsUpdated++;
        }
      } else if (trimmedInstruction.startsWith("- ID:")) {
        const idMatch = trimmedInstruction.match(/^- ID:(\d+)/);
        if (!idMatch) {
          summary.errors.push(
            `Invalid delete instruction: ${trimmedInstruction}`
          );
          continue;
        }

        const itemId = parseInt(idMatch[1], 10);

        const { error } = await supabase
          .from("estimate_items")
          .delete()
          .eq("id", itemId)
          .eq("project_id", projectId);

        if (error) {
          console.error("Error deleting item ID:", itemId, error);
          summary.errors.push(
            `Error deleting item ID:${itemId}: ${error.message}`
          );
        } else {
          console.log("Successfully deleted item ID:", itemId);
          summary.itemsDeleted++;
        }
      } else if (trimmedInstruction.startsWith("+")) {
        const attributesStr = trimmedInstruction.substring(1).trim();
        const attributes = parseInstructionAttributes(attributesStr);

        if (!attributes.description) {
          summary.errors.push(
            `Missing description in add instruction: ${trimmedInstruction}`
          );
          continue;
        }

        attributes.quantity = attributes.quantity || 1;
        attributes.unit_price = attributes.unit_price || 0;

        if (!attributes.amount) {
          attributes.amount = attributes.quantity * attributes.unit_price;
        }
        
        // Determine cost_type based on description if not explicitly provided
        let costType = attributes.cost_type;
        if (!costType && attributes.description) {
          const description = attributes.description.toLowerCase();
          
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
          
          console.log(`Automatically determined cost_type as '${costType}' based on description`);
        }

        const itemData = {
          project_id: projectId,
          description: attributes.description,
          title: attributes.title || attributes.description,
          quantity: attributes.quantity,
          unit_price: attributes.unit_price,
          amount: attributes.amount,
          currency: currency,
          created_by: userId,
          unit_type: attributes.unit_type || "unit",
          cost_type: costType || "material", // Use determined cost_type or default to material
          is_sub_item: attributes.is_sub_item || false,
          status: attributes.status || "active",
          // Store any extra data as JSON
          data: attributes.data || {
            ai_generated: true,
            generation_timestamp: new Date().toISOString(),
          },
        };

        if (attributes.parent) {
          const { data: parentItems, error: parentError } = await supabase
            .from("estimate_items")
            .select("id")
            .eq("project_id", projectId)
            .eq("description", attributes.parent)
            .limit(1);

          if (parentError || !parentItems || parentItems.length === 0) {
            summary.errors.push(
              `Could not find parent item: ${attributes.parent}`
            );
          } else {
            itemData.parent_item_id = parentItems[0].id;
            itemData.is_sub_item = true;
          }
        } else if (attributes.parent_id) {
          itemData.parent_item_id = attributes.parent_id;
          itemData.is_sub_item = true;
        }

        const { data: newItem, error } = await supabase
          .from("estimate_items")
          .insert(itemData)
          .select();

        if (error) {
          console.error("Error adding new item:", error);
          summary.errors.push(`Error adding new item: ${error.message}`);
        } else {
          console.log("Successfully added new item:", newItem);
          summary.itemsAdded++;
        }
      } else {
        summary.errors.push(
          `Unknown instruction format: ${trimmedInstruction}`
        );
      }
    }

    return summary;
  } catch (error) {
    console.error("Error applying line item changes:", error);
    throw error;
  }
}

/**
 * Log prompt and actions to the conversation history
 * @param {number|string} projectId - The ID of the project
 * @param {string} userId - The ID of the authenticated user
 * @param {string} userPrompt - The user's prompt
 * @param {Object} geminiRawResponse - Gemini's raw response
 * @param {Object} actionSummary - Summary of actions performed
 * @returns {Promise<Object>} - The created message
 */
async function logPromptAndActions(
  projectId,
  userId,
  userPrompt,
  geminiRawResponse,
  actionSummary
) {
  try {
    // Get the business ID for the user
    const { data: businessUsers, error: businessError } = await supabase
      .from("business_users")
      .select("business_id")
      .eq("user_id", userId)
      .limit(1);

    if (businessError || !businessUsers || businessUsers.length === 0) {
      throw new Error("Failed to find business for user");
    }

    const businessId = businessUsers[0].business_id;

    // Get the existing conversation for this project or create a new one
    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("id")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1);

    let conversationId;

    if (convError || !conversations || conversations.length === 0) {
      // Create a new conversation if one doesn't exist
      const { data: newConversation, error: newConvError } = await supabase
        .from("conversations")
        .insert({
          business_id: businessId,
          project_id: projectId,
          created_by: userId,
        })
        .select()
        .single();

      if (newConvError) {
        console.error("Error creating conversation:", newConvError);
        throw newConvError;
      }

      conversationId = newConversation.id;
    } else {
      conversationId = conversations[0].id;
    }

    // Store the user prompt as a message
    const { error: userMsgError } = await supabase.from("messages").insert({
      conversation_id: conversationId,
      content: userPrompt,
      role: "user",
      user_id: userId,
    });

    if (userMsgError) {
      console.error("Error creating user message:", userMsgError);
    }

    // Store the Gemini response and action summary as a message
    const { data: message, error: msgError } = await supabase
      .from("messages")
      .insert({
        conversation_id: conversationId,
        content: JSON.stringify({
          type: "additional_estimate",
          raw_response: geminiRawResponse,
          action_summary: actionSummary,
          timestamp: new Date().toISOString(),
        }),
        role: "assistant",
        user_id: userId,
      })
      .select()
      .single();

    if (msgError) {
      console.error("Error creating assistant message:", msgError);
      throw msgError;
    }

    return message;
  } catch (error) {
    console.error("Error logging prompt and actions:", error);
    throw error;
  }
}

/**
 * Create estimate items for a project
 * @param {number} projectId - The ID of the project
 * @param {Array} estimateItems - Array of estimate items
 * @param {string} userId - The ID of the user
 * @returns {Promise<Array>} - The created estimate items
 */
async function createEstimateItems(projectId, estimateItems, userId) {
  try {
    // First, insert all top-level items and get their IDs
    const topLevelItems = estimateItems.map((item) => ({
      project_id: projectId,
      title: item.description || item.title || "Unnamed Item",
      description: item.details || "",
      quantity: parseFloat(item.quantity || 0),
      unit_price: parseFloat(item.unitPrice || 0),
      unit_type: item.unitType || "unit",
      cost_type: item.costType || "material",
      amount: parseFloat(item.amount || 0),
      currency: item.currency || "USD",
      total_amount: parseFloat(item.totalAmount || item.amount || 0),
      status: "draft",
      parent_item_id: null,
      created_by: userId,
      is_sub_item: false,
      data: {
        original_item: item,
        ai_generated: true,
        generation_timestamp: new Date().toISOString(),
        confidence_score: item.confidenceScore || 0.9, // Default high confidence if not provided
        notes: item.notes || "",
        tags: item.tags || [],
      },
    }));

    const { data: createdTopLevelItems, error: topLevelError } = await supabase
      .from("estimate_items")
      .insert(topLevelItems)
      .select();

    if (topLevelError) {
      throw topLevelError;
    }

    // Now process sub-items with the correct parent IDs
    const allSubItems = [];

    // Make sure createdTopLevelItems exists and has items before processing sub-items
    if (createdTopLevelItems && createdTopLevelItems.length > 0) {
      for (
        let i = 0;
        i < Math.min(estimateItems.length, createdTopLevelItems.length);
        i++
      ) {
        const item = estimateItems[i];
        const parentItem = createdTopLevelItems[i];

        if (
          item &&
          parentItem &&
          parentItem.id &&
          item.subItems &&
          Array.isArray(item.subItems) &&
          item.subItems.length > 0
        ) {
          // Process sub-items recursively
          await processSubItems(
            item.subItems,
            parentItem.id,
            projectId,
            userId,
            allSubItems
          );
        }
      }
    }

    if (allSubItems.length > 0) {
      const { data: createdSubItems, error: subItemsError } = await supabase
        .from("estimate_items")
        .insert(allSubItems)
        .select();

      if (subItemsError) {
        throw subItemsError;
      }

      return [...createdTopLevelItems, ...createdSubItems];
    }

    return createdTopLevelItems;
  } catch (error) {
    console.error("Error creating estimate items:", error);
    throw error;
  }
}

/**
 * Process sub-items recursively and add them to the allSubItems array
 * @param {Array} subItems - Array of sub-items
 * @param {number} parentId - ID of the parent item
 * @param {number} projectId - ID of the project
 * @param {string} userId - ID of the user
 * @param {Array} allSubItems - Array to collect all sub-items
 */
async function processSubItems(
  subItems,
  parentId,
  projectId,
  userId,
  allSubItems
) {
  // Validate inputs to prevent errors
  if (
    !Array.isArray(subItems) ||
    !parentId ||
    !projectId ||
    !userId ||
    !Array.isArray(allSubItems)
  ) {
    console.warn("Invalid parameters passed to processSubItems", {
      hasSubItems: Array.isArray(subItems),
      hasParentId: !!parentId,
      hasProjectId: !!projectId,
      hasUserId: !!userId,
      hasAllSubItems: Array.isArray(allSubItems),
    });
    return; // Exit early if any required parameter is missing
  }

  for (const subItem of subItems) {
    // Skip if subItem is not a valid object
    if (!subItem || typeof subItem !== "object") {
      continue;
    }

    try {
      const newSubItem = {
        project_id: projectId,
        title: subItem.description || subItem.title || "Unnamed Item",
        description: subItem.details || "",
        quantity: parseFloat(subItem.quantity || 0),
        unit_price: parseFloat(subItem.unitPrice || 0),
        unit_type: subItem.unitType || "unit",
        cost_type: subItem.costType || "material",
        amount: parseFloat(subItem.amount || 0),
        currency: subItem.currency || "USD",
        total_amount: parseFloat(subItem.totalAmount || subItem.amount || 0),
        status: "draft",
        parent_item_id: parentId,
        created_by: userId,
        is_sub_item: true,
        data: {
          original_item: subItem,
          ai_generated: true,
          generation_timestamp: new Date().toISOString(),
          confidence_score: subItem.confidenceScore || 0.85, // Slightly lower default confidence for sub-items
          notes: subItem.notes || "",
          tags: subItem.tags || [],
        },
      };

      allSubItems.push(newSubItem);

      // Process nested sub-items if they exist
      if (
        subItem.subItems &&
        Array.isArray(subItem.subItems) &&
        subItem.subItems.length > 0
      ) {
        // We'll need to handle this after insertion to get the parent IDs
        // For now, we'll just add a placeholder and process later
        // This is a simplified approach - for deep nesting, you'd need a more complex solution
        subItem._placeholderId = allSubItems.length - 1;
      }
    } catch (error) {
      console.error("Error processing sub-item:", error, subItem);
      // Continue with the next sub-item even if this one fails
    }
  }
}

/**
 * Process an estimate from Gemini and save it to the database
 * @param {Object} estimateData - The estimate data from Gemini
 * @param {string} userId - The ID of the authenticated user
 * @param {Object} projectDetails - Optional project details
 * @returns {Promise<Object>} - The processed estimate with database IDs
 */
async function processAndSaveEstimate(
  estimateData,
  userId,
  projectDetails = {}
) {
  try {
    // Validate inputs
    if (!estimateData || typeof estimateData !== "object") {
      console.error("Invalid estimate data provided to processAndSaveEstimate");
      return { error: "Invalid estimate data", originalData: estimateData };
    }

    if (!userId) {
      console.error("No user ID provided to processAndSaveEstimate");
      return { error: "No user ID provided", originalData: estimateData };
    }

    // Extract data from the estimate
    const estimate = estimateData.estimate || {};

    // Get title from estimate or use fallbacks
    let projectTitle = "";
    if (typeof estimate.title === "string") {
      projectTitle = estimate.title;
    } else if (estimate.title && estimate.title.type === "string") {
      // Handle case where title is a field definition object
      projectTitle = projectDetails.name || "New Project";
    } else {
      projectTitle = projectDetails.name || "New Project";
    }

    const projectDescription = projectDetails.description || "";

    // Handle totalAmount which could be a number or a field definition
    let totalAmount = 0;
    if (typeof estimate.totalAmount === "number") {
      totalAmount = estimate.totalAmount;
    } else if (
      estimate.totalAmount &&
      typeof estimate.totalAmount.type === "string"
    ) {
      // It's a field definition, so we'll need to calculate from line items
      totalAmount = calculateTotalFromLineItems(estimate.lineItems || []);
    }

    // Get currency with fallback
    let currency = "USD";
    if (typeof estimate.currency === "string") {
      currency = estimate.currency;
    } else if (estimate.currency && estimate.currency.type === "string") {
      currency = "USD"; // Default if it's a field definition
    }

    const rawGeminiResponse = estimateData._rawGeminiResponse || null;
    delete estimateData._rawGeminiResponse; // Remove it from the main data structure

    const project = await createProject(
      {
        name: projectTitle,
        description: projectDescription,
      },
      userId,
      totalAmount,
      currency,
      rawGeminiResponse
    );

    if (!project || !project.id) {
      console.error("Failed to create project in database");
      return {
        ...estimateData,
        error: "Failed to create project in database",
        projectCreated: false,
      };
    }

    const rawLineItems = estimate.lineItems || [];
    const normalizedLineItems = normalizeLineItems(rawLineItems, currency);

    let createdItems = [];
    if (normalizedLineItems.length > 0) {
      try {
        createdItems = await createEstimateItems(
          project.id,
          normalizedLineItems,
          userId
        );
      } catch (itemError) {
        console.error("Error creating estimate items:", itemError);
      }
    }
    return {
      ...estimateData,
      projectId: project.id,
      databaseItems: createdItems || [],
      savedToDatabase: true,
    };
  } catch (error) {
    console.error("Error processing and saving estimate:", error);
    return {
      ...estimateData,
      error: error.message || "Unknown error occurred",
      savedToDatabase: false,
    };
  }
}

/**
 * Calculate the total amount from line items
 * @param {Array} lineItems - Array of line items
 * @returns {number} - The calculated total amount
 */
function calculateTotalFromLineItems(lineItems) {
  if (!Array.isArray(lineItems)) return 0;

  return lineItems.reduce((total, item) => {
    let itemAmount = 0;

    if (typeof item.amount === "number") {
      itemAmount = item.amount;
    } else if (item.amount && typeof item.amount.type === "string") {
      const quantity = typeof item.quantity === "number" ? item.quantity : 0;
      const unitPrice = typeof item.unitPrice === "number" ? item.unitPrice : 0;
      itemAmount = quantity * unitPrice;
    }

    return total + itemAmount;
  }, 0);
}

/**
 * Normalize line items to match the database schema
 * @param {Array} lineItems - Array of line items from the estimate
 * @param {string} currency - Currency to use for the items
 * @returns {Array} - Normalized line items
 */
function normalizeLineItems(lineItems, currency = "USD") {
  if (!Array.isArray(lineItems)) return [];

  return lineItems.map((item) => {
    // Extract description (could be string or field definition)
    let description = "";
    if (typeof item.description === "string") {
      description = item.description;
    } else if (item.description && typeof item.description.type === "string") {
      description = "";
    }

    // Extract quantity (could be number or field definition)
    let quantity = 0;
    if (typeof item.quantity === "number") {
      quantity = item.quantity;
    } else if (item.quantity && typeof item.quantity.type === "string") {
      quantity = 0;
    }

    // Extract unitPrice (could be number or field definition)
    let unitPrice = 0;
    if (typeof item.unitPrice === "number") {
      unitPrice = item.unitPrice;
    } else if (item.unitPrice && typeof item.unitPrice.type === "string") {
      unitPrice = 0;
    }

    // Extract unitType (could be string or field definition)
    let unitType = "unit";
    if (typeof item.unitType === "string") {
      unitType = item.unitType;
    } else if (item.unitType && Array.isArray(item.unitType.enum)) {
      unitType = item.unitType.enum[0] || "unit";
    }

    // Extract costType (could be string or field definition)
    let costType = "material";
    if (typeof item.costType === "string") {
      costType = item.costType;
    } else if (item.costType && Array.isArray(item.costType.enum)) {
      costType = item.costType.enum[0] || "material";
    }

    // Extract amount (could be number or field definition)
    let amount = 0;
    if (typeof item.amount === "number") {
      amount = item.amount;
    } else if (item.amount && typeof item.amount.type === "string") {
      // Calculate amount from quantity and unitPrice
      amount = quantity * unitPrice;
    }

    // Extract subItems and normalize them
    let subItems = [];
    if (Array.isArray(item.subItems)) {
      subItems = item.subItems.map((subItem) => {
        // Similar extraction logic for sub-items
        let subDescription = "";
        if (typeof subItem.description === "string") {
          subDescription = subItem.description;
        } else if (
          subItem.description &&
          typeof subItem.description.type === "string"
        ) {
          subDescription = "";
        }

        let subQuantity = 0;
        if (typeof subItem.quantity === "number") {
          subQuantity = subItem.quantity;
        } else if (
          subItem.quantity &&
          typeof subItem.quantity.type === "string"
        ) {
          subQuantity = 0;
        }

        let subUnitPrice = 0;
        if (typeof subItem.unitPrice === "number") {
          subUnitPrice = subItem.unitPrice;
        } else if (
          subItem.unitPrice &&
          typeof subItem.unitPrice.type === "string"
        ) {
          subUnitPrice = 0;
        }

        let subUnitType = "unit";
        if (typeof subItem.unitType === "string") {
          subUnitType = subItem.unitType;
        } else if (subItem.unitType && Array.isArray(subItem.unitType.enum)) {
          subUnitType = subItem.unitType.enum[0] || "unit";
        }

        // Extract costType for sub-item
        let subCostType = "material";
        if (typeof subItem.costType === "string") {
          subCostType = subItem.costType;
        } else if (subItem.costType && Array.isArray(subItem.costType.enum)) {
          subCostType = subItem.costType.enum[0] || "material";
        }

        let subAmount = 0;
        if (typeof subItem.amount === "number") {
          subAmount = subItem.amount;
        } else if (subItem.amount && typeof subItem.amount.type === "string") {
          // Calculate amount from quantity and unitPrice
          subAmount = subQuantity * subUnitPrice;
        }

        return {
          description: subDescription,
          quantity: subQuantity,
          unitPrice: subUnitPrice,
          unitType: subUnitType,
          costType: subCostType,
          amount: subAmount,
          currency,
        };
      });
    }

    return {
      description: description,
      quantity: quantity,
      unitPrice: unitPrice,
      unitType: unitType,
      costType: costType,
      amount: amount,
      currency: currency,
      subItems: subItems,
    };
  });
}

/**
 * Get a project by ID
 * @param {number|string} projectId - The ID of the project to retrieve
 * @returns {Promise<Object|null>} - The project object or null if not found
 */
async function getProjectById(projectId) {
  try {
    const { data: project, error } = await supabase
      .from("projects")
      .select("*")
      .eq("id", projectId)
      .single();

    if (error) {
      console.error("Error fetching project:", error);
      return null;
    }

    return project;
  } catch (error) {
    console.error("Error in getProjectById:", error);
    return null;
  }
}

/**
 * Get conversations by project ID
 * @param {number|string} projectId - The ID of the project
 * @returns {Promise<Array>} - Array of conversations
 */
async function getConversationsByProjectId(projectId) {
  try {
    const { data: conversations, error: convError } = await supabase
      .from("conversations")
      .select("id, created_at, created_by")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false });

    if (convError) {
      console.error("Error fetching conversations:", convError);
      return [];
    }

    const conversationsWithMessages = await Promise.all(
      conversations.map(async (conversation) => {
        const { data: messages, error: msgError } = await supabase
          .from("messages")
          .select("*")
          .eq("conversation_id", conversation.id)
          .order("created_at", { ascending: true });

        if (msgError) {
          console.error("Error fetching messages:", msgError);
          return { ...conversation, messages: [] };
        }

        const parsedMessages = messages.map((message) => {
          try {
            const content = JSON.parse(message.content);
            return { ...message, parsedContent: content };
          } catch (e) {
            return message;
          }
        });
        return { ...conversation, messages: parsedMessages };
      })
    );

    return conversationsWithMessages;
  } catch (error) {
    console.error("Error in getConversationsByProjectId:", error);
    return [];
  }
}

export {
  createProject,
  updateProjectWithEstimate,
  getProjectById,
  getConversationsByProjectId,
  getProjectLineItems,
  applyLineItemChanges,
  logPromptAndActions,
  parseInstructionAttributes,
};
