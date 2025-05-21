import { Client } from "@modelcontextprotocol/sdk/client/index.js";
import { StreamableHTTPClientTransport } from "@modelcontextprotocol/sdk/client/streamableHttp.js";

/**
 * Calls a tool on a configured Playwright MCP server.
 *
 * @param {string} toolName The name of the tool to call (e.g., 'browser_navigate').
 * @param {object} toolArgs The arguments for the tool.
 * @returns {Promise<object>} The result from the tool call.
 * @throws {Error} If PLAYWRIGHT_MCP_URL is not set or if the tool call fails.
 */
export async function callPlaywrightMcpTool(toolName, toolArgs) {
  const mcpServerUrl = process.env.PLAYWRIGHT_MCP_URL;
  if (!mcpServerUrl) {
    console.error("PLAYWRIGHT_MCP_URL environment variable is not set.");
    throw new Error("Playwright MCP server URL is not configured.");
  }

  console.log(`Connecting to Playwright MCP server at: ${mcpServerUrl}`);
  const transport = new StreamableHTTPClientTransport(new URL(mcpServerUrl));
  
  const client = new Client({
    name: "gemini-estimator-mcp-client", // Descriptive name for our client
    version: "1.0.0",
  });

  try {
    await client.connect(transport);
    console.log(`Successfully connected to Playwright MCP. Calling tool: ${toolName} with args:`, toolArgs);

    const result = await client.callTool({
      name: toolName,
      arguments: toolArgs,
    });

    console.log("Received result from Playwright MCP tool:", result);
    return result;
  } catch (error) {
    console.error(`Error calling Playwright MCP tool '${toolName}':`, error);
    throw error; // Re-throw the error to be handled by the caller
  } finally {
    if (client.state !== 'closed') {
      console.log("Closing connection to Playwright MCP server.");
      await client.close();
    }
  }
}
