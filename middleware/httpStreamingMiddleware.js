/**
 * HTTP Streaming Middleware
 * Provides HTTP chunked transfer encoding for long-running operations
 */

export function httpStreamingMiddleware(req, res, next) {
  // Set HTTP streaming headers
  res.setHeader('Content-Type', 'application/x-ndjson'); // Newline Delimited JSON
  res.setHeader('Transfer-Encoding', 'chunked');
  res.setHeader('Cache-Control', 'no-cache');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no'); // Disable Nginx buffering
  
  // Add streaming helper methods
  res.stream = {
    write: (data) => {
      // Write JSON data followed by newline
      const line = JSON.stringify(data) + '\n';
      res.write(line);
      return line.length;
    },
    
    writeHeartbeat: () => {
      // Send empty line as heartbeat
      res.write('\n');
    },
    
    end: (finalData = null) => {
      if (finalData) {
        res.write(JSON.stringify(finalData) + '\n');
      }
      res.end();
    }
  };
  
  // Setup heartbeat to prevent timeouts
  const heartbeat = setInterval(() => {
    res.stream.writeHeartbeat();
  }, 30000); // Every 30 seconds
  
  // Cleanup on close
  req.on('close', () => {
    clearInterval(heartbeat);
  });
  
  // Handle backpressure
  res.on('drain', () => {
    req.emit('drain');
  });
  
  // Track connection start time
  req.streamStartTime = Date.now();
  
  next();
}