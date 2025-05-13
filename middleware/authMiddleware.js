import { supabase } from "../services/supabaseService.js";

/**
 * Middleware to verify if the request is coming from an authenticated user
 * @param {Object} req - Express request object
 * @param {Object} res - Express response object
 * @param {Function} next - Express next function
 */
const verifyAuth = async (req, res, next) => {
  try {
    // Get the authorization header
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      console.error("No authorization header found");
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication token is required",
      });
    }

    // Extract the token
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        error: "Unauthorized",
        message: "Authentication token is required",
      });
    }

    console.log("Verifying token with Supabase...");
    // Verify the token with Supabase
    const { data, error } = await supabase.auth.getUser(token);

    if (error) {
      console.error("Token verification error:", error);
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired authentication token",
        details: error.message,
      });
    }

    if (!data || !data.user) {
      console.error("No user found for token");
      return res.status(401).json({
        error: "Unauthorized",
        message: "Invalid or expired authentication token",
      });
    }

    console.log("Token verified successfully, user:", data.user.email);
    // Add the user to the request object for use in route handlers
    req.user = data.user;

    // Proceed to the next middleware or route handler
    next();
  } catch (error) {
    console.error("Auth middleware error:", error);
    return res.status(500).json({
      error: "Authentication failed",
      message: "An error occurred during authentication",
    });
  }
};

export { verifyAuth };
