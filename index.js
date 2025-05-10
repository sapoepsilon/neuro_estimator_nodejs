const express = require("express");
const dotenv = require("dotenv");
const cors = require("cors");

dotenv.config();

const estimatorRoutes = require("./routes/estimatorRoutes");

const app = express();
const PORT = process.env.PORT || 3000;

app.use(cors());
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
