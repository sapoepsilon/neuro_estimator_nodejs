#!/bin/sh

# Check if required environment variables are set
if [ -z "$SUPABASE_URL" ] || [ -z "$SUPABASE_ANON_KEY" ] || [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
  echo "Error: Required Supabase environment variables are not set."
  echo "Make sure to provide SUPABASE_URL, SUPABASE_ANON_KEY, and SUPABASE_SERVICE_ROLE_KEY"
  exit 1
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

# Print confirmation that environment is set up (without showing sensitive values)
echo "Environment configured. Starting application..."

# Start the application
exec node index.js
