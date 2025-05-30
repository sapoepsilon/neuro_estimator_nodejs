import { supabase } from "./supabaseService.js";
import { createProject, applyLineItemChanges } from "./projectService.js";

/**
 * Create a project from streamed AI data
 * @param {Object} streamData - The complete streamed data
 * @param {Object} user - The authenticated user
 * @returns {Promise<Object>} The created project
 */
export async function createProjectFromStream(streamData, user) {
  const { 
    projectTitle, 
    currency = 'USD', 
    instructions, 
    rawResponse,
    estimate,
    totalAmount
  } = streamData;
  
  try {
    // Extract estimate data from various possible structures
    const estimateData = estimate || streamData;
    const projectName = projectTitle || estimateData.title || 'Untitled Project';
    const projectTotal = totalAmount || estimateData.totalAmount || 0;
    
    // Create project with streaming context
    const project = await createProject(
      {
        name: projectName,
        description: rawResponse?.prompt || JSON.stringify(streamData),
        streamingMode: true,
        metadata: {
          generatedAt: new Date().toISOString(),
          streamingVersion: '1.0'
        }
      }, 
      user.id, 
      projectTotal, 
      currency, 
      rawResponse || { prompt: 'Streamed generation', response: JSON.stringify(streamData) }
    );
    
    // If we have instructions for line items, apply them
    if (instructions && instructions.length > 0) {
      const actionSummary = await applyLineItemChanges(
        project.id,
        user.id,
        instructions,
        currency
      );
      
      project.actionSummary = actionSummary;
    } else if (estimateData.lineItems) {
      // Convert line items to instructions format
      const convertedInstructions = convertLineItemsToInstructions(estimateData.lineItems);
      const actionSummary = await applyLineItemChanges(
        project.id,
        user.id,
        convertedInstructions,
        currency
      );
      
      project.actionSummary = actionSummary;
    }
    
    return project;
  } catch (error) {
    console.error('Error creating project from stream:', error);
    throw new Error(`Failed to create project from stream: ${error.message}`);
  }
}

/**
 * Apply line item changes with progress streaming
 * @param {string} projectId - The project ID
 * @param {string} userId - The user ID
 * @param {Array} instructions - The line item instructions
 * @param {string} currency - The currency code
 * @param {Function} progressCallback - Callback for progress updates
 * @returns {Promise<Object>} Action summary
 */
export async function applyLineItemChangesWithProgress(
  projectId, 
  userId, 
  instructions, 
  currency, 
  progressCallback
) {
  const totalInstructions = instructions.length;
  let processed = 0;
  const actionSummary = {
    created: 0,
    updated: 0,
    deleted: 0,
    errors: []
  };

  // Emit start progress
  if (progressCallback) {
    progressCallback({
      stage: 'start',
      total: totalInstructions,
      processed: 0,
      message: `Starting to process ${totalInstructions} line items`
    });
  }

  // Process instructions in batches for better performance
  const batchSize = 10;
  for (let i = 0; i < instructions.length; i += batchSize) {
    const batch = instructions.slice(i, i + batchSize);
    
    try {
      // Process batch
      const batchResults = await Promise.all(
        batch.map(async (instruction) => {
          try {
            const result = await applySingleInstruction(
              projectId, 
              userId, 
              instruction, 
              currency
            );
            return { success: true, result };
          } catch (error) {
            return { success: false, error: error.message, instruction };
          }
        })
      );

      // Update summary
      batchResults.forEach(result => {
        if (result.success) {
          if (result.result.action === 'create') actionSummary.created++;
          else if (result.result.action === 'update') actionSummary.updated++;
          else if (result.result.action === 'delete') actionSummary.deleted++;
        } else {
          actionSummary.errors.push({
            instruction: result.instruction,
            error: result.error
          });
        }
      });

      processed += batch.length;

      // Emit progress
      if (progressCallback) {
        progressCallback({
          stage: 'processing',
          total: totalInstructions,
          processed,
          percentage: Math.round((processed / totalInstructions) * 100),
          message: `Processed ${processed} of ${totalInstructions} items`,
          currentBatch: {
            start: i,
            end: Math.min(i + batchSize, instructions.length),
            size: batch.length
          },
          summary: { ...actionSummary }
        });
      }
    } catch (error) {
      console.error(`Error processing batch at index ${i}:`, error);
      actionSummary.errors.push({
        batch: `${i}-${i + batch.length}`,
        error: error.message
      });
    }
  }

  // Emit completion
  if (progressCallback) {
    progressCallback({
      stage: 'complete',
      total: totalInstructions,
      processed: totalInstructions,
      percentage: 100,
      message: 'All line items processed',
      summary: actionSummary
    });
  }

  return actionSummary;
}

/**
 * Apply a single instruction (simplified version for streaming)
 */
async function applySingleInstruction(projectId, userId, instruction, currency) {
  // For streaming, we'll apply instructions in batch using the existing function
  // This is a placeholder that tracks the action type
  const trimmedInstruction = instruction.trim();
  
  if (trimmedInstruction.startsWith("+ ROW:")) {
    return { action: 'update', instruction };
  } else if (trimmedInstruction.startsWith("- ROW:")) {
    return { action: 'delete', instruction };
  } else if (trimmedInstruction.startsWith("+")) {
    return { action: 'create', instruction };
  }
  
  return { action: 'unknown', instruction };
}

/**
 * Convert line items from estimate format to instructions format
 */
function convertLineItemsToInstructions(lineItems, parentId = null) {
  const instructions = [];
  
  lineItems.forEach((item, index) => {
    // Create instruction for this item
    const instruction = {
      action: 'create',
      type: parentId ? 'subitem' : 'item',
      attributes: {
        description: item.description,
        quantity: item.quantity || 1,
        unit_price: item.unitPrice || item.unit_price || 0,
        amount: item.amount || 0
      }
    };
    
    if (parentId) {
      instruction.parentId = parentId;
    }
    
    instructions.push(instruction);
    
    // Process sub-items recursively
    if (item.subItems && item.subItems.length > 0) {
      const subInstructions = convertLineItemsToInstructions(
        item.subItems, 
        `temp_${index}` // Temporary ID that would be replaced during processing
      );
      instructions.push(...subInstructions);
    }
  });
  
  return instructions;
}