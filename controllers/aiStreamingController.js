import { httpStreamingMiddleware } from '../middleware/httpStreamingMiddleware.js';
import { GeminiStreamingService } from '../services/geminiStreamingService.js';
import { createProjectFromStream, applyLineItemChangesWithProgress } from '../services/streamProjectService.js';

export const streamEstimate = [httpStreamingMiddleware, async (req, res) => {
  const streamingService = new GeminiStreamingService();
  const { projectDetails, additionalRequirements, responseStructure } = req.body;
  
  try {
    // Validate request
    if (!projectDetails || !projectDetails.title || !projectDetails.description) {
      res.stream.write({
        type: 'error',
        error: 'Project details with title and description are required',
        code: 'INVALID_REQUEST'
      });
      res.stream.end();
      return;
    }

    // Start streaming status
    res.stream.write({
      type: 'stream_start',
      message: 'Starting AI estimation process'
    });

    // Generate estimate stream
    let completeData = null;
    let partialEstimate = {};
    
    for await (const event of streamingService.generateEstimateStream({
      projectDetails,
      additionalRequirements,
      responseStructure
    })) {
      // Forward streaming events to client
      res.stream.write(event);
      
      // Force flush to ensure immediate delivery
      if (res.flush) res.flush();
      
      // Accumulate data for final processing
      if (event.type === 'partial') {
        partialEstimate = { ...partialEstimate, ...event.data };
      } else if (event.type === 'complete') {
        completeData = event.data;
      }
    }

    // Create project from streamed data if we have complete data
    if (completeData) {
      if (req.user) {
        try {
          const project = await createProjectFromStream(completeData, req.user);
          
          res.stream.write({
            type: 'project_created',
            projectId: project.id,
            summary: project.actionSummary,
            data: {
              projectId: project.id,
              name: project.name,
              totalAmount: project.totalAmount,
              currency: project.currency
            }
          });
        } catch (projectError) {
          res.stream.write({
            type: 'warning',
            message: 'Estimate generated but project creation failed',
            error: projectError.message
          });
        }
      } else {
        res.stream.write({
          type: 'info',
          message: 'Estimate generated (not saved - no authentication)'
        });
      }
    }

    // Send completion event
    res.stream.write({
      type: 'stream_complete',
      message: 'Estimation process completed'
    });
    
  } catch (error) {
    console.error('Streaming error:', error);
    res.stream.write({ 
      type: 'error', 
      error: error.message,
      code: error.code || 'STREAM_ERROR'
    });
  } finally {
    res.stream.end();
  }
}];

export const streamEstimateProgress = [httpStreamingMiddleware, async (req, res) => {
  const { projectId, instructions, currency } = req.body;
  
  try {
    if (!projectId || !instructions) {
      res.stream.write({
        type: 'error',
        error: 'Project ID and instructions are required',
        code: 'INVALID_REQUEST'
      });
      res.stream.end();
      return;
    }

    // Apply line item changes with progress streaming
    const actionSummary = await applyLineItemChangesWithProgress(
      projectId,
      req.user.id,
      instructions,
      currency || 'USD',
      (progress) => {
        // Emit progress events via HTTP stream
        res.stream.write({
          type: 'progress',
          ...progress
        });
      }
    );

    // Send completion with summary
    res.stream.write({
      type: 'complete',
      actionSummary,
      message: 'Line item changes applied successfully'
    });
    
  } catch (error) {
    console.error('Progress streaming error:', error);
    res.stream.write({ 
      type: 'error', 
      error: error.message,
      code: error.code || 'PROGRESS_ERROR'
    });
  } finally {
    res.stream.end();
  }
}];