import express from "express";
const router = express.Router();
import {
  handleEstimatorRequest,
} from "../controllers/estimatorController.js";
import { verifyAuth } from "../middleware/authMiddleware.js";

// POST /api/agent - Generate an estimate using Gemini
// Requires authentication
router.post("/agent", verifyAuth, handleEstimatorRequest);

export default router;
