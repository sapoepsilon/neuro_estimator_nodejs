import { jest } from '@jest/globals';
import {
  streamError,
  handleStreamingError,
  classifyError,
  createStreamTimeout,
  withStreamErrorHandling
} from '../utils/streamErrorHandler.js';

describe('Stream Error Handler', () => {
  describe('classifyError', () => {
    it('should classify quota exceeded errors', () => {
      expect(classifyError(new Error('quota exceeded'))).toBe('QUOTA_EXCEEDED');
      expect(classifyError(new Error('API quota limit reached'))).toBe('QUOTA_EXCEEDED');
      expect(classifyError({ code: 'QUOTA_EXCEEDED' })).toBe('QUOTA_EXCEEDED');
    });

    it('should classify timeout errors', () => {
      expect(classifyError({ code: 'ETIMEDOUT' })).toBe('TIMEOUT');
      expect(classifyError({ code: 'TIMEOUT' })).toBe('TIMEOUT');
    });

    it('should classify rate limit errors', () => {
      expect(classifyError({ code: 429 })).toBe('RATE_LIMIT');
      expect(classifyError(new Error('rate limit exceeded'))).toBe('RATE_LIMIT');
    });

    it('should classify auth errors', () => {
      expect(classifyError({ code: 401 })).toBe('AUTH_FAILED');
      expect(classifyError({ code: 'AUTH_FAILED' })).toBe('AUTH_FAILED');
    });

    it('should classify connection closed errors', () => {
      expect(classifyError({ code: 'EPIPE' })).toBe('CONNECTION_CLOSED');
      expect(classifyError({ code: 'ECONNRESET' })).toBe('CONNECTION_CLOSED');
    });

    it('should return UNKNOWN for unrecognized errors', () => {
      expect(classifyError(new Error('random error'))).toBe('UNKNOWN');
      expect(classifyError({ code: 'UNKNOWN_CODE' })).toBe('UNKNOWN');
    });
  });

  describe('streamError', () => {
    it('should send error through stream when stream is available', () => {
      const mockRes = {
        stream: {
          write: jest.fn(),
          end: jest.fn()
        },
        headersSent: true
      };

      const error = new Error('Test error');
      error.code = 'TEST_CODE';

      streamError(mockRes, error, true);

      expect(mockRes.stream.write).toHaveBeenCalledWith({
        type: 'error',
        error: 'Test error',
        code: 'TEST_CODE',
        recoverable: true,
        timestamp: expect.any(String)
      });
      expect(mockRes.stream.end).not.toHaveBeenCalled();
    });

    it('should end stream for non-recoverable errors', () => {
      const mockRes = {
        stream: {
          write: jest.fn(),
          end: jest.fn()
        },
        headersSent: true
      };

      streamError(mockRes, new Error('Fatal error'), false);

      expect(mockRes.stream.end).toHaveBeenCalled();
    });

    it('should fall back to regular response when stream not available', () => {
      const mockRes = {
        headersSent: false,
        status: jest.fn().mockReturnThis(),
        json: jest.fn()
      };

      const error = new Error('Test error');
      error.code = 'TEST_CODE';

      streamError(mockRes, error);

      expect(mockRes.status).toHaveBeenCalledWith(500);
      expect(mockRes.json).toHaveBeenCalledWith({
        error: 'Test error',
        code: 'TEST_CODE'
      });
    });

    it('should use default error code when none provided', () => {
      const mockRes = {
        stream: {
          write: jest.fn(),
          end: jest.fn()
        },
        headersSent: true
      };

      streamError(mockRes, new Error('Test error'), true);

      expect(mockRes.stream.write).toHaveBeenCalledWith({
        type: 'error',
        error: 'Test error',
        code: 'UNKNOWN_ERROR',
        recoverable: true,
        timestamp: expect.any(String)
      });
    });
  });

  describe('handleStreamingError', () => {
    let consoleSpy;

    beforeEach(() => {
      consoleSpy = jest.spyOn(console, 'error').mockImplementation();
    });

    afterEach(() => {
      consoleSpy.mockRestore();
    });

    it('should handle connection closed errors silently', () => {
      const mockRes = {
        stream: { write: jest.fn(), end: jest.fn() },
        headersSent: true
      };

      const consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();

      handleStreamingError({ code: 'EPIPE' }, mockRes);

      expect(consoleLogSpy).toHaveBeenCalledWith('Client disconnected');
      expect(mockRes.stream.write).not.toHaveBeenCalled();

      consoleLogSpy.mockRestore();
    });

    it('should handle quota exceeded errors as non-recoverable', () => {
      const mockRes = {
        stream: { write: jest.fn(), end: jest.fn() },
        headersSent: true
      };

      const error = new Error('Quota exceeded');
      error.code = 'QUOTA_EXCEEDED';

      handleStreamingError(error, mockRes);

      expect(mockRes.stream.write).toHaveBeenCalledWith({
        type: 'error',
        error: 'Quota exceeded',
        code: 'QUOTA_EXCEEDED',
        recoverable: false,
        timestamp: expect.any(String)
      });
      expect(mockRes.stream.end).toHaveBeenCalled();
    });

    it('should handle timeout errors as recoverable', () => {
      const mockRes = {
        stream: { write: jest.fn(), end: jest.fn() },
        headersSent: true
      };

      const error = new Error('Original error');
      error.code = 'TIMEOUT';

      handleStreamingError(error, mockRes);

      expect(mockRes.stream.write).toHaveBeenCalledWith({
        type: 'error',
        error: 'Operation timed out',
        code: 'UNKNOWN_ERROR',
        recoverable: true,
        timestamp: expect.any(String)
      });
      expect(mockRes.stream.end).not.toHaveBeenCalled();
    });

    it('should handle rate limit errors as recoverable', () => {
      const mockRes = {
        stream: { write: jest.fn(), end: jest.fn() },
        headersSent: true
      };

      const error = new Error('Rate limited');
      error.code = 'RATE_LIMIT';

      handleStreamingError(error, mockRes);

      expect(mockRes.stream.write).toHaveBeenCalledWith({
        type: 'error',
        error: 'Rate limit exceeded. Please try again later.',
        code: 'UNKNOWN_ERROR',
        recoverable: true,
        timestamp: expect.any(String)
      });
    });

    it('should handle auth errors as non-recoverable', () => {
      const mockRes = {
        stream: { write: jest.fn(), end: jest.fn() },
        headersSent: true
      };

      const error = new Error('Auth failed');
      error.code = 'AUTH_FAILED';

      handleStreamingError(error, mockRes);

      expect(mockRes.stream.write).toHaveBeenCalledWith({
        type: 'error',
        error: 'Authentication failed',
        code: 'UNKNOWN_ERROR',
        recoverable: false,
        timestamp: expect.any(String)
      });
      expect(mockRes.stream.end).toHaveBeenCalled();
    });

    it('should handle unknown errors as recoverable', () => {
      const mockRes = {
        stream: { write: jest.fn(), end: jest.fn() },
        headersSent: true
      };

      const error = new Error('Unknown error');

      handleStreamingError(error, mockRes);

      expect(mockRes.stream.write).toHaveBeenCalledWith({
        type: 'error',
        error: 'Unknown error',
        code: 'UNKNOWN_ERROR',
        recoverable: true,
        timestamp: expect.any(String)
      });
      expect(mockRes.stream.end).not.toHaveBeenCalled();
    });

    it('should always log errors', () => {
      const mockRes = {
        stream: { write: jest.fn(), end: jest.fn() },
        headersSent: true
      };

      const error = new Error('Test error');
      handleStreamingError(error, mockRes);

      expect(consoleSpy).toHaveBeenCalledWith('Streaming error:', error);
    });
  });

  describe('createStreamTimeout', () => {
    it('should create timeout with default duration', () => {
      const mockRes = {
        stream: { write: jest.fn(), end: jest.fn() },
        writableEnded: false
      };

      jest.useFakeTimers();
      
      const timeout = createStreamTimeout(mockRes);
      expect(timeout.timeoutId).toBeDefined();
      expect(typeof timeout.clear).toBe('function');

      // Advance time but not enough to trigger timeout
      jest.advanceTimersByTime(5000);
      expect(mockRes.stream.write).not.toHaveBeenCalled();

      // Clear timeout
      timeout.clear();
      
      // Advance time past default timeout
      jest.advanceTimersByTime(700000);
      expect(mockRes.stream.write).not.toHaveBeenCalled();

      jest.useRealTimers();
    });

    it('should trigger timeout after specified duration', () => {
      const mockRes = {
        stream: { write: jest.fn(), end: jest.fn() },
        writableEnded: false
      };

      jest.useFakeTimers();
      
      createStreamTimeout(mockRes, 5000);

      // Advance time to trigger timeout
      jest.advanceTimersByTime(5000);

      expect(mockRes.stream.write).toHaveBeenCalledWith({
        type: 'error',
        error: 'Operation timed out',
        code: 'UNKNOWN_ERROR',
        recoverable: false,
        timestamp: expect.any(String)
      });

      jest.useRealTimers();
    });

    it('should not trigger timeout if stream already ended', () => {
      const mockRes = {
        stream: { write: jest.fn(), end: jest.fn() },
        writableEnded: true
      };

      jest.useFakeTimers();
      
      createStreamTimeout(mockRes, 1000);
      jest.advanceTimersByTime(1000);

      expect(mockRes.stream.write).not.toHaveBeenCalled();

      jest.useRealTimers();
    });
  });

  describe('withStreamErrorHandling', () => {
    it('should execute operation successfully', async () => {
      const mockOperation = jest.fn().mockResolvedValue('success');
      const mockRes = {};

      const result = await withStreamErrorHandling(mockOperation, mockRes);

      expect(result).toBe('success');
      expect(mockOperation).toHaveBeenCalled();
    });

    it('should handle operation errors', async () => {
      const error = new Error('Operation failed');
      const mockOperation = jest.fn().mockRejectedValue(error);
      const mockRes = {
        stream: { write: jest.fn(), end: jest.fn() },
        headersSent: true
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(withStreamErrorHandling(mockOperation, mockRes)).rejects.toThrow('Operation failed');

      expect(consoleSpy).toHaveBeenCalledWith('Streaming error:', error);
      expect(mockRes.stream.write).toHaveBeenCalledWith({
        type: 'error',
        error: 'Operation failed',
        code: 'UNKNOWN_ERROR',
        recoverable: true,
        timestamp: expect.any(String)
      });

      consoleSpy.mockRestore();
    });

    it('should handle synchronous operation errors', async () => {
      const error = new Error('Sync error');
      const mockOperation = jest.fn().mockImplementation(() => {
        throw error;
      });
      const mockRes = {
        stream: { write: jest.fn(), end: jest.fn() },
        headersSent: true
      };

      const consoleSpy = jest.spyOn(console, 'error').mockImplementation();

      await expect(withStreamErrorHandling(mockOperation, mockRes)).rejects.toThrow('Sync error');

      expect(consoleSpy).toHaveBeenCalledWith('Streaming error:', error);

      consoleSpy.mockRestore();
    });
  });
});