/**
 * Basic functionality tests for the streaming infrastructure
 */

import { jest } from '@jest/globals';

describe('Basic Streaming Tests', () => {
  it('should have basic math working', () => {
    expect(2 + 2).toBe(4);
  });

  it('should import connection manager', async () => {
    const { connectionManager } = await import('../services/connectionManager.js');
    expect(connectionManager).toBeDefined();
    expect(typeof connectionManager.add).toBe('function');
    expect(typeof connectionManager.remove).toBe('function');
  });

  it('should import streaming middleware', async () => {
    const { httpStreamingMiddleware } = await import('../middleware/httpStreamingMiddleware.js');
    expect(httpStreamingMiddleware).toBeDefined();
    expect(typeof httpStreamingMiddleware).toBe('function');
  });

  it('should import error handler utilities', async () => {
    const errorHandler = await import('../utils/streamErrorHandler.js');
    expect(errorHandler.streamError).toBeDefined();
    expect(errorHandler.classifyError).toBeDefined();
    expect(errorHandler.handleStreamingError).toBeDefined();
  });

  it('should import streaming routes', async () => {
    const streamingRoutes = await import('../routes/streamingRoutes.js');
    expect(streamingRoutes.default).toBeDefined();
  });
});