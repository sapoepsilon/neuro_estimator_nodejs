import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import { access, constants } from 'fs/promises';
import estimatorRoutes from "./routes/estimatorRoutes.js";

// Configure dotenv before any other code runs
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load environment variables from .env file if it exists
try {
  const envPath = join(__dirname, '.env');
  await access(envPath, constants.F_OK);
  dotenv.config({ path: envPath });
  console.log('Environment variables loaded from .env file');
} catch {
  console.warn('Warning: .env file not found. Using default environment variables.');
  // Load default environment variables
  dotenv.config();
}

// Now we can safely use process.env
const app = express();
const PORT = process.env.PORT || 8080;

// Configure CORS to allow requests from the frontend domain
app.use(
  cors({
    origin: [
      "https://app.estmtagent.com",
      "http://localhost:8080",
      "https://neuro-estimator-700284360381.us-west1.run.app",
      "https://localhost:5173",
      "http://localhost:5173",
    ],
    methods: ["GET", "POST", "PUT", "DELETE", "OPTIONS"],
    allowedHeaders: ["Content-Type", "Authorization", "content-type"],
    credentials: true,
    preflightContinue: false,
    optionsSuccessStatus: 204,
  })
);
app.options("*", cors());

app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("Welcome to Neuro Estimator API");
});

// Health check endpoint for Cloud Run
app.get("/health", (req, res) => {
  res.status(200).json({ status: "ok", timestamp: new Date().toISOString() });
});

app.use("/api", estimatorRoutes);

app.use((err, req, res) => {
  console.error(err.stack);
  res.status(500).json({
    error: "Something went wrong!",
    message: err.message,
  });
});

app.use((req, res) => {
  res.status(404).json({
    error: "Not Found",
    message: "The requested resource was not found",
  });
});

app.listen(PORT, "0.0.0.0", () => {
  console.log(`Server running on port ${PORT}`);
  console.log(`Environment: ${process.env.NODE_ENV}`);
});
