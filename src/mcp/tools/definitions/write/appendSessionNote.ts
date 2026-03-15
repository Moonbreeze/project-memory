import { appendSessionNoteTool } from "../../appendSessionNote.ts";
import type { RegisteredMcpTool } from "../../toolTypes.ts";

import { createObjectSchema } from "../../schema.ts";

import { optionalDocumentMetadataProperties } from "./common.ts";

/**
 * MCP definition for `append_session_note`.
 */
export const appendSessionNoteMcpTool: RegisteredMcpTool = {
  name: "append_session_note",
  resultMode: "compact-document",
  description:
    "Create one managed session note document to record chronological execution, actions taken, and follow-up from a work session. In the normal lifecycle this is the step after implementation work has moved forward and before the slice disappears into undocumented execution. Use it for session history, not for durable policy, current truth, or backlog ownership.",
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
