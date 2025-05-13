import express from "express";
import dotenv from "dotenv";
import cors from "cors";
import estimatorRoutes from "./routes/estimatorRoutes.js";

dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;

// Configure CORS to allow requests from the frontend domain
app.use(cors({
  origin: ['https://app.estmtagent.com', 'http://localhost:3000'],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

app.get("/", (req, res) => {
  res.send("Welcome to Neuro Estimator API");
});

app.use("/api", estimatorRoutes);

app.use((err, req, res, next) => {
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

app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
