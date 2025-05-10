import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

dotenv.config();

// Initialize Supabase client
const supabaseUrl = process.env.SUPABASE_URL;
const supabaseServiceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

let supabase;

// Since we can't use top-level await in regular ES modules without special configuration,
// we'll initialize the client in a function and call it immediately
function initSupabase() {
  try {
    supabase = createClient(supabaseUrl, supabaseServiceRoleKey);
    console.log("Supabase client initialized successfully");
  } catch (error) {
    console.error("Supabase client initialization failed: ", error);
    console.error(
      "To use a real Supabase client, set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in your .env file."
    );
  }
}

initSupabase();

export { supabase };
