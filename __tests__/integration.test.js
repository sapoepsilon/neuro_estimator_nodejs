/**
 * Integration tests for HTTP streaming endpoints
 * These tests run against a real server instance
 */

describe('HTTP Streaming Integration Tests', () => {
  const API_BASE = 'http://localhost:8080';

  describe('Server Health', () => {
    test('should respond to health check', async () => {
      const response = await fetch(`${API_BASE}/`);
      expect(response.ok).toBe(true);
      const text = await response.text();
      expect(text).toBe('Welcome to Neuro Estimator API');
    });
  });

  describe('Streaming Endpoints', () => {
    test('should stream data with correct headers', async () => {
      const response = await fetch(`${API_BASE}/api/stream/test`);
      
      expect(response.ok).toBe(true);
      expect(response.headers.get('content-type')).toBe('application/x-ndjson');
      expect(response.headers.get('transfer-encoding')).toBe('chunked');
      expect(response.headers.get('cache-control')).toBe('no-cache');
    });

    test('should stream NDJSON events', async () => {
      const response = await fetch(`${API_BASE}/api/stream/test`);
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      const events = [];
      let buffer = '';

      while (events.length < 3) {
        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          if (line.trim()) {
            const event = JSON.parse(line);
            events.push(event);
          }
        }
      }

      reader.cancel(); // Stop reading early

      expect(events.length).toBeGreaterThanOrEqual(3);
      expect(events[0].type).toBe('start');
      expect(events[1].type).toBe('data');
      expect(events[1].count).toBe(1);
    });

    test('should complete streaming lifecycle', async () => {
      const response = await fetch(`${API_BASE}/api/stream/test`);
      const text = await response.text();
      const lines = text.split('\n').filter(line => line.trim());
      const events = lines.map(line => JSON.parse(line));

      expect(events[0].type).toBe('start');
      expect(events[events.length - 1].type).toBe('complete');
      expect(events.filter(e => e.type === 'data').length).toBe(5);
    });
  });

  describe('Authentication', () => {
    test('should require authentication for /api/stream/connect', async () => {
      const response = await fetch(`${API_BASE}/api/stream/connect`);
      expect(response.status).toBe(401);
      
      const error = await response.json();
      expect(error.error).toBe('Unauthorized');
    });
  });

  describe('Concurrent Connections', () => {
    test('should handle multiple concurrent connections', async () => {
      const connections = await Promise.all([
        fetch(`${API_BASE}/api/stream/test`),
        fetch(`${API_BASE}/api/stream/test`),
        fetch(`${API_BASE}/api/stream/test`)
      ]);

      expect(connections.every(r => r.ok)).toBe(true);
      
      // Clean up
      for (const conn of connections) {
        await conn.body.cancel();
      }
    });
  });

  describe('Performance', () => {
    test('should stream data within acceptable time', async () => {
      const startTime = Date.now();
      const response = await fetch(`${API_BASE}/api/stream/test`);
      
      const reader = response.body.getReader();
      let eventCount = 0;

      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        
        const text = new TextDecoder().decode(value);
        const lines = text.split('\n').filter(l => l.trim());
        eventCount += lines.length;
      }

      const duration = Date.now() - startTime;
      
      expect(response.ok).toBe(true);
      expect(eventCount).toBeGreaterThan(0);
      expect(duration).toBeLessThan(10000); // Should complete within 10 seconds
    });
  });
});