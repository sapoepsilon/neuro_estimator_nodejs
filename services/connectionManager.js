/**
 * Connection Manager Service
 * Tracks and manages active HTTP streaming connections
 */

class ConnectionManager {
  constructor() {
    this.connections = new Map();
    this.userConnectionCounts = new Map();
  }
  
  /**
   * Add a new streaming connection
   * @param {string} id - Unique connection identifier
   * @param {Object} connection - Response object with streaming methods
   * @param {string} userId - User ID for tracking per-user limits
   */
  add(id, connection, userId) {
    this.connections.set(id, {
      response: connection,
      userId,
      startTime: Date.now(),
      lastActivity: Date.now(),
      bytesWritten: 0
    });
    
    // Update user connection count
    const userCount = this.userConnectionCounts.get(userId) || 0;
    this.userConnectionCounts.set(userId, userCount + 1);
  }
  
  /**
   * Remove a connection and cleanup
   * @param {string} id - Connection identifier
   */
  remove(id) {
    const conn = this.connections.get(id);
    if (conn) {
      // Update user connection count
      const userCount = this.userConnectionCounts.get(conn.userId) || 0;
      if (userCount > 0) {
        this.userConnectionCounts.set(conn.userId, userCount - 1);
      }
      
      // Close the connection if still open
      if (!conn.response.headersSent && conn.response.end) {
        conn.response.end();
      }
      
      this.connections.delete(id);
    }
  }
  
  /**
   * Get connections for a specific user
   * @param {string} userId - User ID
   * @returns {Array} Array of connection IDs for the user
   */
  getUserConnections(userId) {
    const userConnections = [];
    this.connections.forEach((conn, id) => {
      if (conn.userId === userId) {
        userConnections.push(id);
      }
    });
    return userConnections;
  }
  
  /**
   * Get connection count for a user
   * @param {string} userId - User ID
   * @returns {number} Number of active connections
   */
  getUserConnectionCount(userId) {
    return this.userConnectionCounts.get(userId) || 0;
  }
  
  /**
   * Broadcast data to all active connections
   * @param {Object} data - Data to broadcast
   */
  broadcast(data) {
    this.connections.forEach(({ response }) => {
      if (response.stream && !response.destroyed && response.headersSent) {
        response.stream.write(data);
      }
    });
  }
  
  /**
   * Update connection activity and bytes written
   * @param {string} id - Connection identifier
   * @param {number} bytes - Bytes written in this update
   */
  updateActivity(id, bytes = 0) {
    const conn = this.connections.get(id);
    if (conn) {
      conn.lastActivity = Date.now();
      conn.bytesWritten += bytes;
    }
  }
  
  /**
   * Get statistics for all connections
   * @returns {Object} Connection statistics
   */
  getStats() {
    const stats = {
      totalConnections: this.connections.size,
      userCounts: Object.fromEntries(this.userConnectionCounts),
      connections: []
    };
    
    this.connections.forEach((data, id) => {
      stats.connections.push({
        id,
        userId: data.userId,
        duration: Date.now() - data.startTime,
        idle: Date.now() - data.lastActivity,
        bytesWritten: data.bytesWritten
      });
    });
    
    return stats;
  }
  
  /**
   * Close all connections gracefully
   * Used during shutdown
   */
  async closeAll() {
    const closePromises = [];
    
    this.connections.forEach((conn, id) => {
      closePromises.push(
        new Promise((resolve) => {
          if (conn.response.headersSent && conn.response.stream) {
            conn.response.stream.write({
              type: 'server_shutdown',
              message: 'Server is shutting down'
            });
            conn.response.stream.end();
          }
          this.remove(id);
          resolve();
        })
      );
    });
    
    await Promise.all(closePromises);
  }
}

// Export singleton instance
export const connectionManager = new ConnectionManager();