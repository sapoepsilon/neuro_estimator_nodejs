import express from "express";
const router = express.Router();
import {
  handleEstimatorRequest,
  handleAdditionalPrompt,
  handleRangeAction
} from "../controllers/estimatorController.js";
import { verifyAuth } from "../middleware/authMiddleware.js";

// POST /api/agent - Generate an estimate using Gemini
// Requires authentication
router.post("/agent", verifyAuth, handleEstimatorRequest);

// POST /api/agent/prompt - Add additional prompt to an existing project
// Requires authentication
router.post("/agent/prompt", verifyAuth, handleAdditionalPrompt);

// POST /api/agent/range-action - Perform actions on a range of line items
// Requires authentication
router.post("/agent/range-action", verifyAuth, handleRangeAction);

export default router;
