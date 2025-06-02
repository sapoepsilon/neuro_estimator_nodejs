import express from 'express';
import { verifyAuth } from '../middleware/authMiddleware.js';
import { streamEstimate, streamEstimateProgress } from '../controllers/aiStreamingController.js';

const router = express.Router();

// Stream estimate generation
router.post('/api/agent/stream', verifyAuth, streamEstimate);

// Stream progress for line item changes
router.post('/api/agent/stream/progress', verifyAuth, streamEstimateProgress);

// Health check for streaming
router.get('/api/agent/stream/health', (req, res) => {
  res.json({
    status: 'ok',
    streaming: true,
    timestamp: new Date().toISOString()
  });
});

export default router;