import express from "express";
const router = express.Router();
import {
  handleEstimatorRequest,
  handleAdditionalPrompt
} from "../controllers/estimatorController.js";
import { verifyAuth } from "../middleware/authMiddleware.js";

// POST /api/agent - Generate an estimate using Gemini
// Requires authentication
router.post("/agent", verifyAuth, handleEstimatorRequest);

// POST /api/agent/prompt - Add additional prompt to an existing project
// Requires authentication
router.post("/agent/prompt", verifyAuth, handleAdditionalPrompt);

export default router;
