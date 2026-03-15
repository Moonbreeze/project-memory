import { createRunbookTool } from "../../createRunbook.ts";
import type { RegisteredMcpTool } from "../../toolTypes.ts";

import { createObjectSchema } from "../../schema.ts";

import { optionalDocumentMetadataProperties } from "./common.ts";

/**
 * MCP definition for `create_runbook`.
 */
export const createRunbookMcpTool: RegisteredMcpTool = {
  name: "create_runbook",
  description:
    "Create one managed runbook document for a repeatable operational procedure that someone should be able to execute later. In the normal lifecycle this is one of the stable-guidance updates that may follow implementation and decision capture. Use it for procedural guidance, not one-off session notes or architecture rationale.",
  inputSchema: createObjectSchema(
    {
      project: {
        type: "string",
        description: "Target project slug.",
      },
      topic: {
        type: "string",
        description: "Runbook topic slug or label.",
      },
      purpose: {
        type: "string",
        description: "Runbook purpose.",
      },
      procedure: {
        type: "array",
        description: "Step-by-step procedure.",
        items: {
          type: "string",
        },
      },
      verification: {
        type: "array",
        description: "Verification steps for the runbook.",
        items: {
          type: "string",
        },
      },
      ...optionalDocumentMetadataProperties,
    },
    ["project", "topic", "purpose", "procedure", "verification"],
  ),
  handler: createRunbookTool,
};
