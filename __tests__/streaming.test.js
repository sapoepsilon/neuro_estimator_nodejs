import { jest } from '@jest/globals';
import { httpStreamingMiddleware } from '../middleware/httpStreamingMiddleware.js';
import { connectionManager } from '../services/connectionManager.js';

describe('HTTP Streaming Infrastructure', () => {
  beforeEach(() => {
    // Clear connection manager state
    connectionManager.connections.clear();
    connectionManager.userConnectionCounts.clear();
  });

  afterEach(() => {
    // Clean up any remaining connections
    connectionManager.connections.clear();
    connectionManager.userConnectionCounts.clear();
    jest.clearAllMocks();
  });

  describe('Streaming Middleware', () => {
    it('should set correct HTTP headers for streaming', () => {
      const mockReq = { on: jest.fn() };
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn()
      };
      const mockNext = jest.fn();

      httpStreamingMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.setHeader).toHaveBeenCalledWith('Content-Type', 'application/x-ndjson');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Transfer-Encoding', 'chunked');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Cache-Control', 'no-cache');
      expect(mockRes.setHeader).toHaveBeenCalledWith('Connection', 'keep-alive');
      expect(mockRes.setHeader).toHaveBeenCalledWith('X-Accel-Buffering', 'no');
    });

    it('should provide stream helper methods', () => {
      const mockReq = { on: jest.fn() };
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn(),
        end: jest.fn(),
        on: jest.fn()
      };
      const mockNext = jest.fn();

      httpStreamingMiddleware(mockReq, mockRes, mockNext);

      expect(mockRes.stream).toBeDefined();
      expect(mockRes.stream.write).toBeInstanceOf(Function);
      expect(mockRes.stream.writeHeartbeat).toBeInstanceOf(Function);
      expect(mockRes.stream.end).toBeInstanceOf(Function);
      expect(mockNext).toHaveBeenCalled();
    });

    it('should format data as NDJSON', () => {
      const mockReq = { on: jest.fn() };
      let writtenData = '';
      const mockRes = {
        setHeader: jest.fn(),
        write: jest.fn((data) => { writtenData += data; }),
        end: jest.fn(),
        on: jest.fn()
      };
      const mockNext = jest.fn();

      httpStreamingMiddleware(mockReq, mockRes, mockNext);

      // Test writing data
      mockRes.stream.write({ type: 'test', value: 123 });
      expect(writtenData).toBe('{"type":"test","value":123}\n');
    });
  });

  describe('Connection Manager', () => {
    it('should track connections per user', () => {
      const mockRes = { headersSent: false, end: jest.fn() };
      
      connectionManager.add('conn-1', mockRes, 'user-1');
      connectionManager.add('conn-2', mockRes, 'user-1');
      connectionManager.add('conn-3', mockRes, 'user-2');

      expect(connectionManager.getUserConnectionCount('user-1')).toBe(2);
      expect(connectionManager.getUserConnectionCount('user-2')).toBe(1);
      expect(connectionManager.getUserConnections('user-1')).toHaveLength(2);
    });

    it('should enforce connection limits', () => {
      const mockRes = { headersSent: false, end: jest.fn() };
      
      // Add 3 connections for user-1
      connectionManager.add('conn-1', mockRes, 'user-1');
      connectionManager.add('conn-2', mockRes, 'user-1');
      connectionManager.add('conn-3', mockRes, 'user-1');

      expect(connectionManager.getUserConnectionCount('user-1')).toBe(3);
      
      // Remove one connection
      connectionManager.remove('conn-1');
      expect(connectionManager.getUserConnectionCount('user-1')).toBe(2);
    });

    it('should broadcast to all connections', () => {
      const mockRes1 = { 
        headersSent: true, 
        stream: { write: jest.fn() } 
      };
      const mockRes2 = { 
        headersSent: true, 
        stream: { write: jest.fn() } 
      };

      connectionManager.add('conn-1', mockRes1, 'user-1');
      connectionManager.add('conn-2', mockRes2, 'user-2');

      const testData = { type: 'broadcast', message: 'test' };
      connectionManager.broadcast(testData);

      expect(mockRes1.stream.write).toHaveBeenCalledWith(testData);
      expect(mockRes2.stream.write).toHaveBeenCalledWith(testData);
    });

    it('should track connection statistics', () => {
      const mockRes = { headersSent: false, end: jest.fn() };
      
      connectionManager.add('conn-1', mockRes, 'user-1');
      connectionManager.updateActivity('conn-1', 100);

      const stats = connectionManager.getStats();
      expect(stats.totalConnections).toBe(1);
      expect(stats.userCounts['user-1']).toBe(1);
      expect(stats.connections[0].bytesWritten).toBe(100);
    });

    it('should handle graceful shutdown', async () => {
      const mockRes = { 
        headersSent: true,
        stream: { 
          write: jest.fn(),
          end: jest.fn()
        },
        end: jest.fn()
      };

      connectionManager.add('conn-1', mockRes, 'user-1');

      await connectionManager.closeAll();

      expect(mockRes.stream.write).toHaveBeenCalledWith({
        type: 'server_shutdown',
        message: 'Server is shutting down'
      });
      expect(mockRes.stream.end).toHaveBeenCalled();
      expect(connectionManager.connections.size).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should handle stream errors gracefully', async () => {
      // Import error handler
      const { streamError, classifyError } = await import('../utils/streamErrorHandler.js');

      // Test error classification
      expect(classifyError(new Error('quota exceeded'))).toBe('QUOTA_EXCEEDED');
      expect(classifyError({ code: 429 })).toBe('RATE_LIMIT');
      expect(classifyError({ code: 'ETIMEDOUT' })).toBe('TIMEOUT');
      expect(classifyError({ code: 401 })).toBe('AUTH_FAILED');
      expect(classifyError({ code: 'EPIPE' })).toBe('CONNECTION_CLOSED');
      expect(classifyError(new Error('unknown'))).toBe('UNKNOWN');

      // Test stream error handling
      const mockRes = {
        stream: {
          write: jest.fn(),
          end: jest.fn()
        },
        headersSent: true
      };

      const error = new Error('Test error');
      streamError(mockRes, error, false);

      expect(mockRes.stream.write).toHaveBeenCalledWith({
        type: 'error',
        error: 'Test error',
        code: 'UNKNOWN_ERROR',
        recoverable: false,
        timestamp: expect.any(String)
      });
      expect(mockRes.stream.end).toHaveBeenCalled();
    });

    it('should create and clear stream timeouts', async () => {
      const { createStreamTimeout } = await import('../utils/streamErrorHandler.js');
      
      const mockRes = {
        stream: {
          write: jest.fn(),
          end: jest.fn()
        },
        writableEnded: false
      };

      const timeout = createStreamTimeout(mockRes, 100);
      expect(timeout).toBeDefined();
      expect(timeout.clear).toBeInstanceOf(Function);
      
      // Clear timeout before it fires
      timeout.clear();
      
      // Wait to ensure timeout doesn't fire
      await new Promise(resolve => setTimeout(resolve, 150));
      expect(mockRes.stream.write).not.toHaveBeenCalled();
    });
  });
});