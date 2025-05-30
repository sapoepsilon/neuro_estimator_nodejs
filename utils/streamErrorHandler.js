/**
 * Stream Error Handler Utilities
 * Provides error handling functions for HTTP streaming
 */

/**
 * Send an error through the stream
 * @param {Object} res - Response object with streaming methods
 * @param {Error} error - Error object
 * @param {boolean} recoverable - Whether the client can recover from this error
 */
export function streamError(res, error, recoverable = true) {
  if (!res.stream || res.headersSent === false) {
    // Fallback to regular error response if streaming not initialized
    return res.status(500).json({
      error: error.message,
      code: error.code || 'UNKNOWN_ERROR'
    });
  }
  
  const errorData = {
    type: 'error',
    error: error.message,
    code: error.code || 'UNKNOWN_ERROR',
    recoverable,
    timestamp: new Date().toISOString()
  };
  
  res.stream.write(errorData);
  
  if (!recoverable) {
    // End stream for non-recoverable errors
    res.stream.end();
  }
}

/**
 * Handle streaming errors with appropriate responses
 * @param {Error} error - Error object
 * @param {Object} res - Response object
 */
export function handleStreamingError(error, res) {
  console.error('Streaming error:', error);
  
  // Connection closed by client
  if (error.code === 'EPIPE' || error.code === 'ECONNRESET') {
    console.log('Client disconnected');
    return;
  }
  
  // Handle specific error types
  switch (error.code) {
    case 'QUOTA_EXCEEDED':
      streamError(res, error, false);
      break;
    
    case 'TIMEOUT':
      streamError(res, new Error('Operation timed out'), true);
      break;
    
    case 'RATE_LIMIT':
      streamError(res, new Error('Rate limit exceeded. Please try again later.'), true);
      break;
    
    case 'AUTH_FAILED':
      streamError(res, new Error('Authentication failed'), false);
      break;
    
    default:
      streamError(res, error, true);
  }
}

/**
 * Classify error types for appropriate handling
 * @param {Error} error - Error object
 * @returns {string} Error classification
 */
export function classifyError(error) {
  if (error.code === 'QUOTA_EXCEEDED' || error.message?.includes('quota')) {
    return 'QUOTA_EXCEEDED';
  }
  
  if (error.code === 'ETIMEDOUT' || error.code === 'TIMEOUT') {
    return 'TIMEOUT';
  }
  
  if (error.code === 429 || error.message?.includes('rate limit')) {
    return 'RATE_LIMIT';
  }
  
  if (error.code === 401 || error.code === 'AUTH_FAILED') {
    return 'AUTH_FAILED';
  }
  
  if (error.code === 'EPIPE' || error.code === 'ECONNRESET') {
    return 'CONNECTION_CLOSED';
  }
  
  return 'UNKNOWN';
}

/**
 * Create a timeout handler for streaming operations
 * @param {Object} res - Response object
 * @param {number} timeout - Timeout in milliseconds
 * @returns {Object} Timeout handler with clear method
 */
export function createStreamTimeout(res, timeout = 600000) { // 10 minutes default
  const timeoutId = setTimeout(() => {
    if (res.stream && !res.writableEnded) {
      streamError(res, new Error('Operation timed out'), false);
    }
  }, timeout);
  
  return {
    clear: () => clearTimeout(timeoutId),
    timeoutId
  };
}

/**
 * Wrap a streaming operation with error handling
 * @param {Function} operation - Async operation to wrap
 * @param {Object} res - Response object
 * @returns {Promise} Result of the operation
 */
export async function withStreamErrorHandling(operation, res) {
  try {
    return await operation();
  } catch (error) {
    handleStreamingError(error, res);
    throw error; // Re-throw for upstream handling if needed
  }
}