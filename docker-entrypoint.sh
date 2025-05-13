#!/bin/sh

# Print environment variables for debugging (without showing sensitive values)
echo "Starting container with PORT=$PORT"
echo "SUPABASE_URL is set: $([ -n "$SUPABASE_URL" ] && echo "yes" || echo "no")"
echo "SUPABASE_ANON_KEY is set: $([ -n "$SUPABASE_ANON_KEY" ] && echo "yes" || echo "no")"
echo "SUPABASE_SERVICE_ROLE_KEY is set: $([ -n "$SUPABASE_SERVICE_ROLE_KEY" ] && echo "yes" || echo "no")"

# Check if required environment variables are set, but don't exit (for Cloud Run)
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Warning: Some Supabase environment variables are not set."
  echo "This may cause application errors, but continuing startup..."
fi

# If running locally and SUPABASE_URL points to localhost or 127.0.0.1, replace with host.docker.internal
if echo "$SUPABASE_URL" | grep -q "localhost:\|127.0.0.1"; then
  # Extract port from the original URL
  SUPABASE_PORT=$(echo "$SUPABASE_URL" | sed -E "s|^https?://[^:]+:([0-9]+).*$|\1|")
  # If port extraction failed, use default port 54321
  if [ -z "$SUPABASE_PORT" ]; then
    SUPABASE_PORT=54321
  fi
  export SUPABASE_URL="http://host.docker.internal:$SUPABASE_PORT"
  echo "Detected local Supabase URL, switching to $SUPABASE_URL for Docker compatibility"
fi

# Print confirmation that environment is set up
echo "Environment configured. Starting application on port $PORT..."

# Start the application
exec node index.js
