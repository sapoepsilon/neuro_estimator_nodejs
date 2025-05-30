import { Router } from 'express';
import { verifyAuth } from '../middleware/authMiddleware.js';
import { httpStreamingMiddleware } from '../middleware/httpStreamingMiddleware.js';
import { connectionManager } from '../services/connectionManager.js';

const router = Router();

/**
 * Test streaming endpoint (no auth required)
 * GET /api/stream/test
 */
router.get('/test', httpStreamingMiddleware, (req, res) => {
  console.log('Test streaming connection initiated');
  
  // Send initial message
  res.stream.write({
    type: 'start',
    message: 'HTTP streaming test started',
    timestamp: new Date().toISOString()
  });
  
  // Send a few test messages
  let count = 0;
  const interval = setInterval(() => {
    count++;
    
    if (count <= 5) {
      res.stream.write({
        type: 'data',
        count,
        message: `Test message ${count}`,
        timestamp: new Date().toISOString()
      });
    } else {
      clearInterval(interval);
      res.stream.end({
        type: 'complete',
        totalMessages: count,
        message: 'Test completed successfully'
      });
    }
  }, 1000);
  
  // Handle client disconnect
  req.on('close', () => {
    console.log('Test streaming connection closed by client');
    clearInterval(interval);
  });
});

/**
 * Basic streaming connection endpoint for testing
 * GET /api/stream/connect
 */
router.get('/connect', verifyAuth, httpStreamingMiddleware, (req, res) => {
  const connectionId = `${req.user.id}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  
  // Check connection limit per user (3 concurrent connections)
  const userConnectionCount = connectionManager.getUserConnectionCount(req.user.id);
  
  if (userConnectionCount >= 3) {
    return res.status(429).json({ 
      error: 'Connection limit reached',
      message: 'Maximum 3 concurrent streaming connections allowed per user'
    });
  }
  
  // Register connection
  connectionManager.add(connectionId, res, req.user.id);
  
  // Send initial connection event
  const bytesWritten = res.stream.write({ 
    type: 'connection',
    connectionId, 
    status: 'connected',
    timestamp: new Date().toISOString(),
    user: {
      id: req.user.id,
      email: req.user.email
    }
  });
  
  connectionManager.updateActivity(connectionId, bytesWritten);
  
  // Handle disconnect
  req.on('close', () => {
    console.log(`Stream connection closed: ${connectionId}`);
    connectionManager.remove(connectionId);
  });
  
  // Send a test event after 2 seconds
  setTimeout(() => {
    if (res.headersSent && res.stream) {
      const bytes = res.stream.write({
        type: 'test',
        message: 'Connection is active',
        timestamp: new Date().toISOString()
      });
      connectionManager.updateActivity(connectionId, bytes);
    }
  }, 2000);
});

/**
 * Get streaming connection statistics
 * GET /api/stream/stats
 */
router.get('/stats', verifyAuth, (req, res) => {
  const stats = connectionManager.getStats();
  
  // Filter to show only current user's connections unless admin
  const userStats = {
    ...stats,
    connections: stats.connections.filter(conn => conn.userId === req.user.id)
  };
  
  res.json(userStats);
});

/**
 * Test endpoint to broadcast a message to all connections
 * POST /api/stream/broadcast
 * Body: { message: string }
 */
router.post('/broadcast', verifyAuth, (req, res) => {
  const { message } = req.body;
  
  if (!message) {
    return res.status(400).json({ error: 'Message is required' });
  }
  
  connectionManager.broadcast({
    type: 'broadcast',
    message,
    from: req.user.email,
    timestamp: new Date().toISOString()
  });
  
  res.json({ 
    success: true, 
    connectionCount: connectionManager.getStats().totalConnections 
  });
});

/**
 * Close a specific connection
 * DELETE /api/stream/connection/:id
 */
router.delete('/connection/:id', verifyAuth, (req, res) => {
  const { id } = req.params;
  
  // Verify the connection belongs to the user
  const userConnections = connectionManager.getUserConnections(req.user.id);
  
  if (!userConnections.includes(id)) {
    return res.status(404).json({ error: 'Connection not found' });
  }
  
  connectionManager.remove(id);
  res.json({ success: true, message: 'Connection closed' });
});

export default router;