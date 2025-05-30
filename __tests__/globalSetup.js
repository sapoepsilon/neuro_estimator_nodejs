import { spawn } from 'child_process';
import { promisify } from 'util';

const sleep = promisify(setTimeout);

export default async function globalSetup() {
  console.log('\n🚀 Starting server for integration tests...');
  
  // Start the server
  const server = spawn('node', ['index.js'], {
    env: { ...process.env, NODE_ENV: 'test', PORT: '8080' },
    detached: false,
    stdio: 'pipe'
  });

  // Store server process globally
  global.__SERVER_PROCESS__ = server;

  // Wait for server to be ready
  let serverReady = false;
  let attempts = 0;
  const maxAttempts = 30;

  server.stdout.on('data', (data) => {
    const output = data.toString();
    console.log('Server:', output.trim());
    if (output.includes('Server running on port')) {
      serverReady = true;
    }
  });

  server.stderr.on('data', (data) => {
    console.error('Server Error:', data.toString());
  });

  // Wait for server to start
  while (!serverReady && attempts < maxAttempts) {
    await sleep(1000);
    attempts++;
    
    // Try to ping the server
    try {
      const response = await fetch('http://localhost:8080/');
      if (response.ok) {
        serverReady = true;
        break;
      }
    } catch (e) {
      // Server not ready yet
    }
  }

  if (!serverReady) {
    throw new Error('Server failed to start within 30 seconds');
  }

  console.log('✅ Server is ready for testing!\n');
  
  // Give it a bit more time to fully initialize
  await sleep(1000);
}