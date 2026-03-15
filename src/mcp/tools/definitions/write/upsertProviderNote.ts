import { upsertProviderNoteTool } from "../../upsertProviderNote.ts";
import type { RegisteredMcpTool } from "../../toolTypes.ts";

import { createObjectSchema } from "../../schema.ts";

import { optionalDocumentMetadataProperties } from "./common.ts";

/**
 * MCP definition for `upsert_provider_note`.
 */
export const upsertProviderNoteMcpTool: RegisteredMcpTool = {
  name: "upsert_provider_note",
  description:
    "Upsert the managed provider note for stable provider-specific constraints, quirks, and usage guidance inside one project. In the normal lifecycle this is one of the stable-guidance updates that may follow implementation or verification. Use it for provider operating knowledge, not generic architecture or backlog tracking.",
  inputSchema: createObjectSchema(
    {
      project: {
        type: "string",
        description: "Target project slug.",
      },
      provider: {
        type: "string",
        description: "Provider identifier used for file naming.",
      },
      topic: {
        type: "string",
        description: "Optional override for the stored topic value.",
      },
      overview: {
        type: "string",
        description: "Short provider overview.",
      },
      constraints: {
        type: "array",
        description: "Known provider constraints.",
        items: {
          type: "string",
        },
      },
      guidance: {
        type: "array",
        description: "Guidance for future work with the provider.",
        items: {
          type: "string",
        },
      },
      ...optionalDocumentMetadataProperties,
    },
    ["project", "provider", "overview", "constraints", "guidance"],
  ),
  handler: upsertProviderNoteTool,
};
