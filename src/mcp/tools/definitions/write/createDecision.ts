import { createDecisionTool } from "../../createDecision.ts";
import type { RegisteredMcpTool } from "../../toolTypes.ts";

import { createObjectSchema } from "../../schema.ts";

import { optionalDocumentMetadataProperties } from "./common.ts";

/**
 * MCP definition for `create_decision`.
 */
export const createDecisionMcpTool: RegisteredMcpTool = {
  name: "create_decision",
  description: "Create one managed decision record.",
  inputSchema: createObjectSchema(
    {
      project: {
        type: "string",
        description: "Target project slug.",
      },
      topic: {
        type: "string",
        description: "Decision topic slug or label.",
      },
      context: {
        type: "string",
        description: "Decision context.",
      },
      decision: {
        type: "string",
        description: "Final decision statement.",
      },
      consequences: {
        type: "array",
        description: "Decision consequences.",
        items: {
          type: "string",
        },
      },
      ...optionalDocumentMetadataProperties,
    },
    ["project", "topic", "context", "decision", "consequences"],
  ),
  handler: createDecisionTool,
};
