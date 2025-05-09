const express = require("express");
const router = express.Router();
const {
  handleEstimatorRequest,
} = require("../controllers/estimatorController");

// POST /api/agent - Generate an estimate using Gemini
router.post("/agent", handleEstimatorRequest);

module.exports = router;
