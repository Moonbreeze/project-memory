import { upsertCanonicalDocTool } from "../../upsertCanonicalDoc.ts";
import type { RegisteredMcpTool } from "../../toolTypes.ts";

import { createObjectSchema } from "../../schema.ts";

import { optionalDocumentMetadataProperties } from "./common.ts";

/**
 * MCP definition for `upsert_canonical_doc`.
 */
export const upsertCanonicalDocMcpTool: RegisteredMcpTool = {
  name: "upsert_canonical_doc",
  description: "Create or replace one managed canonical doc tied to a taxonomy-registry scope.",
  inputSchema: createObjectSchema(
    {
      project: {
        type: "string",
        description: "Target project slug.",
      },
      topic: {
        type: "string",
        description: "Canonical-doc topic slug or label.",
      },
      registryScope: {
        type: "string",
        description: "Declared taxonomy-registry scope slug for this canonical doc.",
      },
      summary: {
        type: "string",
        description: "High-level summary of the canonical guidance.",
      },
      guidance: {
        type: "array",
        description: "Canonical guidance points for the scoped topic.",
        items: {
          type: "string",
        },
      },
      references: {
        type: "array",
        description: "Supporting references or follow-on links.",
        items: {
          type: "string",
        },
      },
      ...optionalDocumentMetadataProperties,
    },
    ["project", "topic", "registryScope", "summary", "guidance", "references"],
  ),
  handler: upsertCanonicalDocTool,
};
