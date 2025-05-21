import { Type } from "@google/genai";

export const playwrightMcpTools = [
  {
    name: "browser_navigate",
    description: "Navigate to a URL.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        url: { type: Type.STRING, description: "The URL to navigate to." },
      },
      required: ["url"],
    },
  },
  {
    name: "browser_snapshot",
    description: "Capture accessibility snapshot of the current page. This is preferred over screenshots for structured data.",
    parameters: {
      type: Type.OBJECT,
      properties: {}, // No parameters as per current understanding
      required: [],
    },
  },
  {
    name: "browser_click",
    description: "Perform a click on a web page element.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        element: { type: Type.STRING, description: "Human-readable element description used to obtain permission to interact with the element." },
        ref: { type: Type.STRING, description: "Exact target element reference from a previous page snapshot." },
      },
      required: ["element", "ref"],
    },
  },
  {
    name: "browser_type",
    description: "Type text into an editable element on a web page.",
    parameters: {
      type: Type.OBJECT,
      properties: {
        element: { type: Type.STRING, description: "Human-readable element description." },
        ref: { type: Type.STRING, description: "Exact target element reference from a page snapshot." },
        text: { type: Type.STRING, description: "Text to type into the element." },
        submit: { type: Type.BOOLEAN, description: "Whether to submit entered text (press Enter after).", optional: true },
        slowly: { type: Type.BOOLEAN, description: "Whether to type one character at a time.", optional: true },
      },
      required: ["element", "ref", "text"],
    },
  },
];
