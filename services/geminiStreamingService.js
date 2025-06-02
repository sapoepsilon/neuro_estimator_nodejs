import { GoogleGenAI } from "@google/genai";
import { GEMINI_MODELS, MODEL_CONFIGS } from "../aimodel/geminiModels.js";
import { jsonrepair } from "jsonrepair";
import { XMLParser } from "fast-xml-parser";

export class GeminiStreamingService {
  constructor() {
    const apiKey = process.env.GOOGLE_API_KEY || process.env.GEMINI_API_KEY;
    if (!apiKey) {
      throw new Error('Google API key not found in environment variables');
    }
    this.ai = new GoogleGenAI({ apiKey });
  }

  /**
   * Generate estimate with streaming support
   * @param {Object} params - Request parameters
   * @param {Object} params.projectDetails - Project details
   * @param {Object} params.additionalRequirements - Additional requirements
   * @param {Object} params.responseStructure - Custom response structure
   * @returns {AsyncGenerator} Stream of events
   */
  async *generateEstimateStream({ projectDetails, additionalRequirements, responseStructure }) {
    try {
      // Prepare the prompt
      const prompt = this.prepareStreamingPrompt({
        projectDetails,
        additionalRequirements,
        responseStructure
      });

      // Yield start event
      yield {
        type: 'ai_start',
        message: 'AI model initialized, starting generation'
      };

      // Use generateContentStream for true streaming
      yield {
        type: 'progress',
        message: 'Sending request to AI model...',
        stage: 'request'
      };

      // Use TRUE streaming API with @google/genai
      const response = await this.ai.models.generateContentStream({
        model: GEMINI_MODELS.FLASH_2_0_001,
        contents: prompt,
        config: MODEL_CONFIGS.ESTIMATOR
      });
      
      let accumulatedText = '';
      let chunkCount = 0;
      
      // Process the ACTUAL stream from Gemini
      for await (const chunk of response) {
        const chunkText = chunk.text;
        if (!chunkText) continue;
        
        accumulatedText += chunkText;
        chunkCount++;
        
        // Yield each chunk as it arrives
        yield {
          type: 'chunk',
          content: chunkText,
          chunkNumber: chunkCount,
          totalLength: accumulatedText.length
        };
        
        // Also yield progress
        yield {
          type: 'progress',
          message: `Receiving from AI...`,
          chunkCount,
          accumulatedLength: accumulatedText.length,
          stage: 'streaming',
          latestChunk: chunkText.substring(0, 100)
        };
        
        // Try to extract partial data if we have enough
        if (accumulatedText.length > 300) {
          try {
            const partialData = this.extractPartialData(accumulatedText);
            if (partialData && Object.keys(partialData).length > 0) {
              yield {
                type: 'partial',
                data: partialData
              };
            }
          } catch (e) {
            // Ignore partial parsing errors
          }
        }
      }

      // Process complete response
      yield {
        type: 'ai_complete',
        message: 'AI generation complete, processing response'
      };

      // Parse and validate the complete response
      const processedResponse = await this.processStreamResponse(accumulatedText, {
        projectDetails,
        responseStructure
      });

      // Yield complete event with data
      yield {
        type: 'complete',
        data: processedResponse
      };

    } catch (error) {
      console.error('Gemini streaming error:', error);
      
      // Classify and yield error
      const errorType = this.classifyError(error);
      yield {
        type: 'error',
        error: error.message,
        code: errorType,
        details: error.stack
      };
      
      throw error;
    }
  }

  /**
   * Prepare prompt for streaming context
   */
  prepareStreamingPrompt({ projectDetails, additionalRequirements, responseStructure }) {
    const baseRequest = {
      projectDetails,
      additionalRequirements
    };

    // If custom response structure provided, use it
    if (responseStructure) {
      return `Generate a detailed project estimate based on the following requirements.
      
Project Details:
${JSON.stringify(projectDetails, null, 2)}

Additional Requirements:
${JSON.stringify(additionalRequirements, null, 2)}

IMPORTANT: Format your response as valid JSON matching this exact structure:
${JSON.stringify(responseStructure, null, 2)}

Ensure all numeric values are actual numbers, not strings.`;
    }

    // Otherwise use default XML format prompt
    const prompt = `${projectDetails.title}\n\n${projectDetails.description}\n\nScope: ${projectDetails.scope || ''}\nTimeline: ${projectDetails.timeline || ''}`;
    
    return `
    You are a professional construction estimator. Based on the following construction project description, create a detailed line item estimate with proper construction trades and categories.
    
    Construction Project: ${prompt}
    
    Generate a comprehensive construction estimate that includes relevant items based on the project description.

    IMPORTANT: Your response MUST be in XML format with the following structure:
    <estimate>
      <project_title>Brief descriptive title of the construction project</project_title>
      <currency>USD</currency>
      <actions>
        <action>+ description='Site Preparation and Excavation', quantity=1, unit_price=3500, amount=3500, cost_type='labor', unit_type='package'</action>
        <action>+ description='Concrete Foundation', quantity=150, unit_price=12, amount=1800, cost_type='material', unit_type='unit'</action>
        <action>+ description='Foundation Labor', quantity=16, unit_price=75, amount=1200, cost_type='labor', unit_type='hour'</action>
      </actions>
    </estimate>
    
    Each <action> tag must start with a '+' character followed by a space, then a comma-separated list of attributes.
    Required attributes: description, quantity, unit_price, amount, cost_type, unit_type
    Valid cost_type values: material, labor, equipment, overhead
    Valid unit_type values: hour, day, unit, package
    
    Do not include any other text, explanations, or formatting outside of this XML structure.
  `;
  }

  /**
   * Process streaming response with error handling
   */
  async processStreamResponse(responseText, context) {
    try {
      // Check if custom response structure was requested
      if (context.responseStructure) {
        // Try to parse as JSON for custom structure
        try {
          const parsed = JSON.parse(responseText);
          return {
            ...parsed,
            projectTitle: context.projectDetails.title,
            currency: 'USD',
            streamingMode: true,
            rawResponse: {
              prompt: JSON.stringify(context.projectDetails),
              response: responseText
            }
          };
        } catch (jsonError) {
          // Try JSON repair
          const repaired = jsonrepair(responseText);
          const parsed = JSON.parse(repaired);
          return {
            ...parsed,
            projectTitle: context.projectDetails.title,
            currency: 'USD',
            streamingMode: true,
            wasRepaired: true,
            rawResponse: {
              prompt: JSON.stringify(context.projectDetails),
              response: responseText
            }
          };
        }
      }

      // Process XML response for default format
      const result = this.processXMLResponse(responseText);

      // Add streaming metadata
      return {
        ...result,
        projectTitle: result.projectTitle || context.projectDetails.title,
        currency: result.currency || 'USD',
        streamingMode: true,
        rawResponse: {
          prompt: JSON.stringify(context.projectDetails),
          response: responseText
        }
      };
    } catch (error) {
      console.error('Error processing stream response:', error);
      
      // Try JSON repair as last fallback
      try {
        const repaired = jsonrepair(responseText);
        const parsed = JSON.parse(repaired);
        
        return {
          ...parsed,
          projectTitle: context.projectDetails.title,
          currency: 'USD',
          streamingMode: true,
          wasRepaired: true,
          rawResponse: {
            prompt: JSON.stringify(context.projectDetails),
            response: responseText
          }
        };
      } catch (repairError) {
        throw new Error(`Failed to process AI response: ${error.message}`);
      }
    }
  }

  /**
   * Process XML response (extracted from geminiService)
   */
  processXMLResponse(responseText) {
    try {
      // Extract XML if it's wrapped in markdown code blocks
      let xmlString = responseText;

      // Check if the response is wrapped in markdown code blocks
      const xmlRegex = /\`\`\`(?:xml)?\s*([\s\S]*?)\`\`\`/;
      const match = responseText.match(xmlRegex);

      if (match && match[1]) {
        xmlString = match[1].trim();
      }

      // Look for XML tags if not found in code blocks
      if (!xmlString.includes("<estimate>")) {
        const estimateTagRegex = /<estimate>[\s\S]*<\/estimate>/;
        const estimateMatch = responseText.match(estimateTagRegex);

        if (estimateMatch) {
          xmlString = estimateMatch[0];
        }
      }

      // Parse the XML
      const parser = new XMLParser({
        ignoreAttributes: false,
        attributeNamePrefix: "",
      });

      const result = parser.parse(xmlString);

      if (!result.estimate) {
        throw new Error("Missing estimate data in XML response");
      }

      // Extract the project title, currency, and action instructions
      const projectTitle = result.estimate.project_title || "Untitled Project";
      const currency = result.estimate.currency || "USD";

      // Extract action instructions
      let instructions = [];
      if (result.estimate.actions && result.estimate.actions.action) {
        // Handle both single action and array of actions
        const actions = Array.isArray(result.estimate.actions.action)
          ? result.estimate.actions.action
          : [result.estimate.actions.action];

        instructions = actions.map((action) => action.toString().trim());
      }

      return {
        projectTitle,
        currency,
        instructions,
      };
    } catch (error) {
      console.error("Error processing XML response:", error);
      throw new Error(`Failed to parse XML response: ${error.message}`);
    }
  }

  /**
   * Extract partial data from incomplete response
   */
  extractPartialData(text) {
    try {
      // Look for common patterns in the response
      const patterns = {
        title: /title["\s:]+([^",\n]+)/i,
        totalAmount: /totalAmount["\s:]+(\d+)/i,
        currency: /currency["\s:]+([A-Z]{3})/i,
        lineItemCount: /lineItems["\s:]+\[/i
      };

      const partialData = {};
      
      for (const [key, pattern] of Object.entries(patterns)) {
        const match = text.match(pattern);
        if (match) {
          if (key === 'totalAmount') {
            partialData[key] = parseInt(match[1]);
          } else if (key === 'lineItemCount') {
            // Count line items if array started
            const lineItemMatches = text.match(/\{[^}]*description[^}]*\}/g);
            partialData.lineItemCount = lineItemMatches ? lineItemMatches.length : 0;
          } else {
            partialData[key] = match[1].trim();
          }
        }
      }

      return Object.keys(partialData).length > 0 ? partialData : null;
    } catch (e) {
      return null;
    }
  }

  /**
   * Classify error types for better handling
   */
  classifyError(error) {
    const message = error.message.toLowerCase();
    
    if (message.includes('quota') || message.includes('rate limit')) {
      return 'QUOTA_ERROR';
    } else if (message.includes('timeout')) {
      return 'TIMEOUT_ERROR';
    } else if (message.includes('auth') || message.includes('api key')) {
      return 'AUTH_ERROR';
    } else if (message.includes('invalid')) {
      return 'VALIDATION_ERROR';
    }
    
    return 'UNKNOWN_ERROR';
  }

  /**
   * Generate additional estimate stream for existing projects
   * @param {Object} params - Generation parameters
   * @returns {AsyncGenerator} Stream of events
   */
  async *generateAdditionalEstimateStream({ prompt, existingProject, existingItems = [], userId }) {
    try {
      // Yield start event
      yield {
        type: 'progress',
        message: 'Preparing context for AI...',
        stage: 'preparation'
      };

      // Format existing items for context
      const formattedItems = existingItems
        .slice(0, 300) // Limit to first 300 items for context
        .map((item) => {
          return `ID:${item.id}, description='${item.description}', quantity=${
            item.quantity
          }, unit_price=${item.unitPrice}, amount=${item.amount}${
            item.parentId ? `, parent_id=${item.parentId}` : ""
          }`;
        })
        .join("\n");

      const additionalPrompt = `
        You are an estimator agent. You have access to a web browser tool to test the prices if the user requests it. You have previously created an estimate for a project titled "${
          existingProject.name || "Untitled Project"
        }". 
        Now you need to modify the estimate based on the following additional request.
        
        Current line items (showing first 300):
        ${formattedItems || "No existing items"}
        ${existingItems.length > 300 ? `\n... and ${existingItems.length - 300} more items` : ''}
        
        Additional request from the user:
        ${prompt}
        
        IMPORTANT: Your response MUST be in XML format with the following structure:
        <estimate>
          <actions>
            <action>+ description='New item description', quantity=1, unit_price=100, amount=100</action>
            <action>+ ID:123, description='Updated item description', quantity=2, unit_price=150, amount=300</action>
            <action>- ID:456</action>
          </actions>
        </estimate>
        
        Each <action> tag must contain one of the following:
        1. For adding new items: Start with '+' followed by attributes (description, quantity, unit_price, amount)
        2. For updating existing items: Start with '+' followed by the item ID and the attributes to update
        3. For deleting items: Start with '-' followed by the item ID
        4. We now support tools to browse internet. If you notice that there is a link we should use the playwright tool to browse the internet
           a. If the user asks you to search somewhere on the internet, use the playwright tool to browse the internet, and hit enter to search if there is no search button, but do not type in enter
        
        Do not include any other text, explanations, or formatting outside of this XML structure.
      `;

      yield {
        type: 'progress',
        message: 'Sending request to AI model...',
        stage: 'request',
        contextSize: existingItems.length
      };

      // Set up MCP tools if needed
      const { Client } = await import("@modelcontextprotocol/sdk/client/index.js");
      const { StdioClientTransport } = await import("@modelcontextprotocol/sdk/client/stdio.js");
      const { GoogleGenAI, mcpToTool } = await import("@google/genai");
      
      // Initialize Playwright MCP client
      const playwright = new StdioClientTransport({
        command: "npx",
        args: ["-y", "@playwright/mcp@latest", "--no-sandbox"],
      });

      const playwrightMcpClient = new Client({
        name: "Playwright",
        version: "1.0.0",
      });

      await playwrightMcpClient.connect(playwright);

      // Initialize Gemini with MCP tools
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      
      // Generate content stream
      const response = await ai.models.generateContentStream({
        model: GEMINI_MODELS.FLASH_2_5_04_17_PREVIEW,
        contents: additionalPrompt,
        config: {
          tools: [mcpToTool(playwrightMcpClient)],
        },
      });

      let accumulatedText = '';
      let chunkCount = 0;
      let mcpCallCount = 0;

      // Process the stream
      for await (const chunk of response) {
        const chunkText = chunk.text;
        if (!chunkText) continue;
        
        accumulatedText += chunkText;
        chunkCount++;

        // Check for MCP tool calls in chunk
        if (chunk.functionCalls) {
          mcpCallCount++;
          yield {
            type: 'mcp_action',
            tool: 'playwright',
            callNumber: mcpCallCount,
            message: 'AI is browsing the web...'
          };
        }
        
        // Yield chunk event
        yield {
          type: 'chunk',
          content: chunkText,
          chunkNumber: chunkCount,
          totalLength: accumulatedText.length
        };
        
        // Yield progress
        yield {
          type: 'progress',
          message: `Receiving AI response...`,
          chunkCount,
          accumulatedLength: accumulatedText.length,
          stage: 'streaming'
        };
      }

      // Process complete response
      yield {
        type: 'ai_complete',
        message: 'AI generation complete, processing response'
      };

      // Parse XML response
      const processedResponse = this.processXMLResponse(accumulatedText);
      
      // Clean up MCP client
      await playwrightMcpClient.close();

      // Yield complete event with instructions
      yield {
        type: 'complete',
        data: {
          instructions: processedResponse.instructions || [],
          rawResponse: {
            text: accumulatedText,
            timestamp: new Date().toISOString(),
            prompt: additionalPrompt
          }
        }
      };

    } catch (error) {
      console.error('Additional estimate streaming error:', error);
      
      // Classify and yield error
      const errorType = this.classifyError(error);
      yield {
        type: 'error',
        error: error.message,
        code: errorType,
        details: error.stack
      };
      
      throw error;
    }
  }
}