/**
 * Example frontend code for making authenticated requests to the /api/agent endpoint
 * This assumes you're using Supabase JS client in your frontend application
 */

// Import the Supabase client
import { createClient } from "@supabase/supabase-js";

// Initialize Supabase client (in your frontend app)
const supabaseUrl = "YOUR_SUPABASE_URL";
const supabaseAnonKey = "YOUR_SUPABASE_ANON_KEY";
const supabase = createClient(supabaseUrl, supabaseAnonKey);

/**
 * Function to generate an estimate with authentication
 * @param {Object} projectDetails - Details about the project
 * @returns {Promise<Object>} - The generated estimate
 */
async function generateEstimate(projectDetails) {
  try {
    // Get the current session
    const {
      data: { session },
      error: sessionError,
    } = await supabase.auth.getSession();

    if (sessionError || !session) {
      throw new Error("You must be logged in to generate an estimate");
    }

    // Get the access token from the session
    const token = session.access_token;

    // Prepare the request data
    const requestData = {
      projectDetails: projectDetails,
      // You can include a custom responseStructure if needed
    };

    // Make the API request with the authentication token
    const response = await fetch("http://localhost:8080/api/agent", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${token}`,
      },
      body: JSON.stringify(requestData),
    });

    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(errorData.message || "Failed to generate estimate");
    }
    // Parse and return the response
    const estimate = await response.json();
    return estimate;
  } catch (error) {
    console.error("Error generating estimate:", error);
    throw error;
  }
}

/**
 * Example usage
 */
async function exampleUsage() {
  try {
    // First, ensure the user is signed in
    const {
      data: { user },
      error,
    } = await supabase.auth.signInWithPassword({
      email: "user@example.com",
      password: "password123",
    });

    if (error) {
      console.error("Authentication error:", error.message);
      return;
    }

    // Now generate an estimate
    const projectDetails = {
      title: "E-commerce Website",
      description:
        "A full-featured online store with product catalog, shopping cart, and payment processing",
      scope: "Frontend and backend development, including admin dashboard",
      timeline: "3 months",
    };

    await generateEstimate(projectDetails);
  } catch (error) {
    console.error("Example usage error:", error.message);
  }
}

// Call the example function
// exampleUsage();

export { generateEstimate };
