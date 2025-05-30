import { jest } from '@jest/globals';
import { connectionManager } from '../services/connectionManager.js';

describe('ConnectionManager', () => {
  beforeEach(() => {
    // Clear all connections before each test
    connectionManager.connections.clear();
    connectionManager.userConnectionCounts.clear();
  });

  describe('Connection Management', () => {
    it('should add new connections correctly', () => {
      const mockRes = { 
        headersSent: false, 
        end: jest.fn() 
      };

      connectionManager.add('conn-1', mockRes, 'user-1');
      
      expect(connectionManager.connections.size).toBe(1);
      expect(connectionManager.getUserConnectionCount('user-1')).toBe(1);
      
      const conn = connectionManager.connections.get('conn-1');
      expect(conn).toBeDefined();
      expect(conn.userId).toBe('user-1');
      expect(conn.response).toBe(mockRes);
      expect(conn.startTime).toBeLessThanOrEqual(Date.now());
      expect(conn.lastActivity).toBeLessThanOrEqual(Date.now());
      expect(conn.bytesWritten).toBe(0);
    });

    it('should remove connections and update counts', () => {
      const mockRes = { 
        headersSent: false, 
        end: jest.fn() 
      };

      connectionManager.add('conn-1', mockRes, 'user-1');
      connectionManager.add('conn-2', mockRes, 'user-1');
      
      expect(connectionManager.getUserConnectionCount('user-1')).toBe(2);
      
      connectionManager.remove('conn-1');
      
      expect(connectionManager.connections.size).toBe(1);
      expect(connectionManager.getUserConnectionCount('user-1')).toBe(1);
      expect(mockRes.end).toHaveBeenCalledTimes(1);
    });

    it('should handle removing non-existent connections', () => {
      expect(() => {
        connectionManager.remove('non-existent');
      }).not.toThrow();
    });

    it('should close response when removing if headers not sent', () => {
      const mockRes = { 
        headersSent: false, 
        end: jest.fn() 
      };

      connectionManager.add('conn-1', mockRes, 'user-1');
      connectionManager.remove('conn-1');
      
      expect(mockRes.end).toHaveBeenCalled();
    });

    it('should not close response when removing if headers already sent', () => {
      const mockRes = { 
        headersSent: true, 
        end: jest.fn() 
      };

      connectionManager.add('conn-1', mockRes, 'user-1');
      connectionManager.remove('conn-1');
      
      expect(mockRes.end).not.toHaveBeenCalled();
    });
  });

  describe('User Connection Tracking', () => {
    it('should track connections by user', () => {
      const mockRes = { headersSent: false, end: jest.fn() };

      connectionManager.add('conn-1', mockRes, 'user-1');
      connectionManager.add('conn-2', mockRes, 'user-1');
      connectionManager.add('conn-3', mockRes, 'user-2');

      const user1Connections = connectionManager.getUserConnections('user-1');
      expect(user1Connections).toEqual(['conn-1', 'conn-2']);
      
      const user2Connections = connectionManager.getUserConnections('user-2');
      expect(user2Connections).toEqual(['conn-3']);
    });

    it('should return empty array for users with no connections', () => {
      const connections = connectionManager.getUserConnections('non-existent-user');
      expect(connections).toEqual([]);
    });

    it('should handle user connection count edge cases', () => {
      expect(connectionManager.getUserConnectionCount('non-existent')).toBe(0);
      
      const mockRes = { headersSent: false, end: jest.fn() };
      connectionManager.add('conn-1', mockRes, 'user-1');
      
      // Remove twice should not cause negative count
      connectionManager.remove('conn-1');
      connectionManager.remove('conn-1');
      
      expect(connectionManager.getUserConnectionCount('user-1')).toBe(0);
    });
  });

  describe('Broadcasting', () => {
    it('should broadcast to all active connections with headers sent', () => {
      const mockRes1 = { 
        headersSent: true, 
        stream: { write: jest.fn() } 
      };
      const mockRes2 = { 
        headersSent: true, 
        stream: { write: jest.fn() } 
      };
      const mockRes3 = { 
        headersSent: false, 
        stream: { write: jest.fn() } 
      };

      connectionManager.add('conn-1', mockRes1, 'user-1');
      connectionManager.add('conn-2', mockRes2, 'user-2');
      connectionManager.add('conn-3', mockRes3, 'user-3');

      const data = { type: 'test', message: 'broadcast' };
      connectionManager.broadcast(data);

      expect(mockRes1.stream.write).toHaveBeenCalledWith(data);
      expect(mockRes2.stream.write).toHaveBeenCalledWith(data);
      // Should not write to connection with headers not sent
      expect(mockRes3.stream.write).not.toHaveBeenCalled();
    });

    it('should handle broadcast when no connections exist', () => {
      expect(() => {
        connectionManager.broadcast({ test: 'data' });
      }).not.toThrow();
    });
  });

  describe('Activity Tracking', () => {
    it('should update connection activity and bytes', () => {
      const mockRes = { headersSent: false, end: jest.fn() };
      connectionManager.add('conn-1', mockRes, 'user-1');

      const initialActivity = connectionManager.connections.get('conn-1').lastActivity;
      
      // Wait a bit to ensure time difference
      jest.useFakeTimers();
      jest.advanceTimersByTime(100);
      
      connectionManager.updateActivity('conn-1', 256);
      
      const conn = connectionManager.connections.get('conn-1');
      expect(conn.bytesWritten).toBe(256);
      expect(conn.lastActivity).toBeGreaterThan(initialActivity);
      
      connectionManager.updateActivity('conn-1', 128);
      expect(conn.bytesWritten).toBe(384);
      
      jest.useRealTimers();
    });

    it('should handle activity update for non-existent connection', () => {
      expect(() => {
        connectionManager.updateActivity('non-existent', 100);
      }).not.toThrow();
    });
  });

  describe('Statistics', () => {
    it('should generate accurate statistics', () => {
      const mockRes = { headersSent: false, end: jest.fn() };
      
      connectionManager.add('conn-1', mockRes, 'user-1');
      connectionManager.add('conn-2', mockRes, 'user-1');
      connectionManager.add('conn-3', mockRes, 'user-2');
      
      connectionManager.updateActivity('conn-1', 1024);
      connectionManager.updateActivity('conn-2', 2048);

      const stats = connectionManager.getStats();
      
      expect(stats.totalConnections).toBe(3);
      expect(stats.userCounts).toEqual({
        'user-1': 2,
        'user-2': 1
      });
      expect(stats.connections).toHaveLength(3);
      
      const conn1Stats = stats.connections.find(c => c.id === 'conn-1');
      expect(conn1Stats.bytesWritten).toBe(1024);
      expect(conn1Stats.userId).toBe('user-1');
      expect(conn1Stats.duration).toBeGreaterThanOrEqual(0);
      expect(conn1Stats.idle).toBeGreaterThanOrEqual(0);
    });
  });

  describe('Graceful Shutdown', () => {
    it('should close all connections with shutdown message', async () => {
      const mockRes1 = { 
        headersSent: true,
        stream: { 
          write: jest.fn(),
          end: jest.fn()
        }
      };
      const mockRes2 = { 
        headersSent: false,
        stream: { 
          write: jest.fn(),
          end: jest.fn()
        }
      };

      connectionManager.add('conn-1', mockRes1, 'user-1');
      connectionManager.add('conn-2', mockRes2, 'user-2');

      await connectionManager.closeAll();

      // Should write shutdown message to connection with headers sent
      expect(mockRes1.stream.write).toHaveBeenCalledWith({
        type: 'server_shutdown',
        message: 'Server is shutting down'
      });
      expect(mockRes1.stream.end).toHaveBeenCalled();
      
      // Should not write to connection without headers sent
      expect(mockRes2.stream.write).not.toHaveBeenCalled();
      
      // All connections should be removed
      expect(connectionManager.connections.size).toBe(0);
      expect(connectionManager.getUserConnectionCount('user-1')).toBe(0);
      expect(connectionManager.getUserConnectionCount('user-2')).toBe(0);
    });

    it('should handle closeAll when no connections exist', async () => {
      await expect(connectionManager.closeAll()).resolves.not.toThrow();
    });
  });

  describe('Edge Cases', () => {
    it('should handle concurrent operations safely', () => {
      const mockRes = { headersSent: false, end: jest.fn() };
      
      // Add multiple connections rapidly
      for (let i = 0; i < 10; i++) {
        connectionManager.add(`conn-${i}`, mockRes, 'user-1');
      }
      
      expect(connectionManager.getUserConnectionCount('user-1')).toBe(10);
      
      // Remove them all
      for (let i = 0; i < 10; i++) {
        connectionManager.remove(`conn-${i}`);
      }
      
      expect(connectionManager.getUserConnectionCount('user-1')).toBe(0);
    });

    it('should maintain separate counts for different users', () => {
      const mockRes = { headersSent: false, end: jest.fn() };
      
      connectionManager.add('conn-1', mockRes, 'user-1');
      connectionManager.add('conn-2', mockRes, 'user-2');
      connectionManager.add('conn-3', mockRes, 'user-1');
      
      expect(connectionManager.getUserConnectionCount('user-1')).toBe(2);
      expect(connectionManager.getUserConnectionCount('user-2')).toBe(1);
      
      connectionManager.remove('conn-1');
      
      expect(connectionManager.getUserConnectionCount('user-1')).toBe(1);
      expect(connectionManager.getUserConnectionCount('user-2')).toBe(1);
    });
  });
});