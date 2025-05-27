/**
 * Research script to understand MCP tracking capabilities
 * This will help determine if we can track MCP operations with automatic function calling
 */

import {
  GoogleGenAI,
  FunctionCallingConfigMode,
  mcpToTool,
} from "@google/genai";
import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StdioClientTransport } from "@modelcontextprotocol/sdk/client/stdio.js";
import dotenv from "dotenv";

dotenv.config();

async function researchAutomaticFunctionCalling() {
  console.log("🔍 Researching Automatic Function Calling Tracking...\n");

  try {
    // Set up Playwright MCP client
    const playwright = new StdioClientTransport({
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"],
    });

    const playwrightMcpClient = new Client({
      name: "Playwright-Research",
      version: "1.0.0",
    });

    await playwrightMcpClient.connect(playwright);

    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });

    // Test with automatic function calling (your current setup)
    console.log("🤖 Testing AUTOMATIC function calling...");
    const automaticResult = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: "Please search for 'gemini api pricing' on Google and tell me what you find",
      config: {
        tools: [mcpToTool(playwrightMcpClient)],
        // automaticFunctionCalling is enabled by default
      },
    });

    console.log("\n📊 AUTOMATIC FUNCTION CALLING RESULTS:");
    console.log("Response text length:", automaticResult.candidates[0].content.parts[0].text.length);
    console.log("Function calls count:", automaticResult.automaticFunctionCallingHistory?.length || 0);
    
    // Deep dive into the automatic function calling history
    if (automaticResult.automaticFunctionCallingHistory) {
      console.log("\n🔍 DETAILED AUTOMATIC FUNCTION CALLING HISTORY:");
      automaticResult.automaticFunctionCallingHistory.forEach((call, index) => {
        console.log(`\n--- Call ${index + 1} ---`);
        console.log("Full object keys:", Object.keys(call));
        console.log("Call details:", JSON.stringify(call, null, 2));
      });
    }

    // Close and reconnect for manual test
    await playwrightMcpClient.close();

    // Reconnect for manual test
    const playwright2 = new StdioClientTransport({
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"],
    });

    const playwrightMcpClient2 = new Client({
      name: "Playwright-Research-Manual",
      version: "1.0.0",
    });

    await playwrightMcpClient2.connect(playwright2);

    // Test with MANUAL function calling (disabled automatic)
    console.log("\n\n🛠️ Testing MANUAL function calling...");
    const manualResult = await ai.models.generateContent({
      model: "gemini-2.5-flash-preview-04-17",
      contents: "Please search for 'gemini api pricing' on Google and tell me what you find",
      config: {
        tools: [mcpToTool(playwrightMcpClient2)],
        automaticFunctionCalling: {
          disable: true, // DISABLE automatic calling
        },
      },
    });

    console.log("\n📊 MANUAL FUNCTION CALLING RESULTS:");
    console.log("Response text length:", manualResult.candidates[0].content.parts[0].text.length);
    console.log("Tool calls in response:", manualResult.candidates[0].content.parts.filter(part => part.functionCall).length);
    
    // Check for function calls in the response
    manualResult.candidates[0].content.parts.forEach((part, index) => {
      if (part.functionCall) {
        console.log(`\n--- Manual Function Call ${index + 1} ---`);
        console.log("Function name:", part.functionCall.name);
        console.log("Function args:", JSON.stringify(part.functionCall.args, null, 2));
      }
    });

    await playwrightMcpClient2.close();

  } catch (error) {
    console.error("❌ Research error:", error);
  }
}

async function researchMcpCapabilities() {
  console.log("\n🔬 Researching MCP Client Capabilities...\n");

  try {
    const playwright = new StdioClientTransport({
      command: "npx",
      args: ["-y", "@playwright/mcp@latest"],
    });

    const playwrightMcpClient = new Client({
      name: "MCP-Capabilities-Research",
      version: "1.0.0",
    });

    await playwrightMcpClient.connect(playwright);

    // Research what tools are available
    console.log("🛠️ Available MCP Tools:");
    const tools = await playwrightMcpClient.listTools();
    tools.tools.forEach((tool, index) => {
      console.log(`${index + 1}. ${tool.name}`);
      console.log(`   Description: ${tool.description}`);
      console.log(`   Input schema keys: ${Object.keys(tool.inputSchema?.properties || {}).join(', ')}`);
    });

    // Research resources if available
    try {
      console.log("\n📂 Available MCP Resources:");
      const resources = await playwrightMcpClient.listResources();
      resources.resources.forEach((resource, index) => {
        console.log(`${index + 1}. ${resource.name} - ${resource.description}`);
      });
    } catch (e) {
      console.log("No resources available or not supported");
    }

    await playwrightMcpClient.close();

  } catch (error) {
    console.error("❌ MCP Capabilities research error:", error);
  }
}

// Run the research
async function runResearch() {
  console.log("🚀 Starting MCP Tracking Research\n");
  console.log("This will help determine the best approach for tracking MCP operations\n");
  
  await researchMcpCapabilities();
  await researchAutomaticFunctionCalling();
  
  console.log("\n✅ Research complete! Review the output to determine:");
  console.log("1. What data is available in automaticFunctionCallingHistory");
  console.log("2. Whether we need to disable automatic calling for better tracking");
  console.log("3. What level of detail we can capture for the frontend");
}

runResearch().catch(console.error);
