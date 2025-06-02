import express from "express";
const router = express.Router();
import {
  handleEstimatorRequest,
  handleAdditionalPrompt,
  handleRangeAction
} from "../controllers/estimatorController.js";
import { verifyAuth } from "../middleware/authMiddleware.js";
import { httpStreamingMiddleware } from "../middleware/httpStreamingMiddleware.js";

// POST /api/agent - Generate an estimate using Gemini
// Requires authentication
router.post("/agent", verifyAuth, handleEstimatorRequest);

// POST /api/agent/prompt - Add additional prompt to an existing project
// Requires authentication
// Supports streaming via Accept: application/x-ndjson header
router.post("/agent/prompt", verifyAuth, async (req, res) => {
  if (req.headers.accept === 'application/x-ndjson') {
    // Use streaming handler - import dynamically to avoid circular deps
    const { handleAdditionalPromptStream } = await import("../controllers/estimatorController.js");
    return httpStreamingMiddleware(req, res, () => handleAdditionalPromptStream(req, res));
  } else {
    return handleAdditionalPrompt(req, res);
  }
});

// POST /api/agent/range-action - Perform actions on a range of line items
// Requires authentication
// Supports streaming via Accept: application/x-ndjson header
router.post("/agent/range-action", verifyAuth, async (req, res) => {
  if (req.headers.accept === 'application/x-ndjson') {
    // Use streaming handler - import dynamically to avoid circular deps
    const { handleRangeActionStream } = await import("../controllers/estimatorController.js");
    return httpStreamingMiddleware(req, res, () => handleRangeActionStream(req, res));
  } else {
    return handleRangeAction(req, res);
  }
});

export default router;
