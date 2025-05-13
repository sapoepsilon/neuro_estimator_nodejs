FROM node:18-alpine

WORKDIR /app

# Copy package.json and package-lock.json first for better caching
COPY package*.json ./

# Install dependencies
RUN npm ci --only=production

# Copy application code
COPY . .

# Set non-sensitive environment variables with defaults
# Sensitive environment variables should be provided at runtime via --env-file
ENV PORT=8080 \
    NODE_ENV=production

# For local development with Supabase running in Docker
# The host.docker.internal DNS name allows containers to access the host machine
ENV DOCKER_SUPABASE_URL=http://host.docker.internal:54321

# Expose the application port
EXPOSE 8080

# Copy the entrypoint script and make it executable
COPY docker-entrypoint.sh /app/
RUN chmod +x /app/docker-entrypoint.sh

# Use the entrypoint script to start the application
ENTRYPOINT ["/app/docker-entrypoint.sh"]
