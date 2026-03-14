import { appendSessionNoteTool } from "../../appendSessionNote.ts";
import type { RegisteredMcpTool } from "../../toolTypes.ts";

import { createObjectSchema } from "../../schema.ts";

import { optionalDocumentMetadataProperties } from "./common.ts";

/**
 * MCP definition for `append_session_note`.
 */
export const appendSessionNoteMcpTool: RegisteredMcpTool = {
  name: "append_session_note",
  description: "Create one managed session note document.",
  inputSchema: createObjectSchema(
    {
      project: {
        type: "string",
        description: "Target project slug.",
      },
      topic: {
        type: "string",
        description: "Session topic slug or label.",
      },
      summary: {
        type: "string",
        description: "High-level session summary.",
      },
      actions: {
        type: "array",
        description: "Concrete actions completed during the session.",
        items: {
          type: "string",
        },
      },
      followUp: {
        type: "array",
        description: "Follow-up tasks left for later.",
        items: {
          type: "string",
        },
      },
      ...optionalDocumentMetadataProperties,
    },
    ["project", "topic", "summary", "actions", "followUp"],
  ),
  handler: appendSessionNoteTool,
};
