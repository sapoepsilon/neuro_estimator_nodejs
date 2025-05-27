// Add this to your generateAdditionalEstimate() function
// RIGHT AFTER the result is returned

console.log('\n🔍 DETAILED MCP TRACKING ANALYSIS:');
console.log('Function calls count:', result.automaticFunctionCallingHistory?.length || 0);

if (result.automaticFunctionCallingHistory && result.automaticFunctionCallingHistory.length > 0) {
  result.automaticFunctionCallingHistory.forEach((call, index) => {
    console.log(`\n--- Function Call ${index + 1} ---`);
    console.log('Available keys:', Object.keys(call));
    console.log('Full call data:', JSON.stringify(call, null, 2));
    
    // Check for timing information
    if (call.timestamp || call.startTime || call.duration) {
      console.log('⏱️ Timing data available!');
    }
    
    // Check for function details
    if (call.functionCall || call.toolCall) {
      console.log('🛠️ Function details available!');
    }
    
    // Check for results
    if (call.result || call.response) {
      console.log('📊 Results data available!');
    }
  });
}

// Also log the full result structure to understand what's available
console.log('\n📋 FULL RESULT STRUCTURE:');
console.log('Result keys:', Object.keys(result));
console.log('Candidates structure:', result.candidates[0] ? Object.keys(result.candidates[0]) : 'No candidates');
