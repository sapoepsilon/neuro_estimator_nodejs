export default async function globalTeardown() {
  console.log('\n🛑 Shutting down test server...');
  
  if (global.__SERVER_PROCESS__) {
    // Kill the server process
    global.__SERVER_PROCESS__.kill('SIGTERM');
    
    // Wait a bit for graceful shutdown
    await new Promise(resolve => setTimeout(resolve, 1000));
    
    // Force kill if still running
    try {
      global.__SERVER_PROCESS__.kill('SIGKILL');
    } catch (e) {
      // Process already dead
    }
    
    console.log('✅ Server stopped\n');
  }
}