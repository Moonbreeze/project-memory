import { upsertTaxonomyRegistryTool } from "../../upsertTaxonomyRegistry.ts";
import type { RegisteredMcpTool } from "../../toolTypes.ts";

import { createObjectSchema } from "../../schema.ts";

import { optionalDocumentMetadataProperties } from "./common.ts";

/**
 * MCP definition for `upsert_taxonomy_registry`.
 */
export const upsertTaxonomyRegistryMcpTool: RegisteredMcpTool = {
  name: "upsert_taxonomy_registry",
  resultMode: "compact-document",
  description:
    "Create or replace the reserved active taxonomy registry canonical doc for one project using explicit scope entries. Use this for authorized taxonomy changes instead of encoding registry state through ordinary canonical-doc writes.",
  inputSchema: createObjectSchema(
    {
      project: {
        type: "string",
        description: "Target project slug.",
      },
      summary: {
        type: "string",
        description: "Optional summary override for the registry canonical doc.",
      },
      entries: {
        type: "array",
        description: "Explicit taxonomy registry entries to persist.",
        items: createObjectSchema(
          {
            scope: {
              type: "string",
              description: "Registered taxonomy scope slug.",
            },
            topic: {
              type: "string",
              description: "Registered taxonomy topic slug owning the scope.",
            },
            authority: {
              type: "string",
              description: "Authority owner slug for the scope.",
            },
            state: {
              type: "string",
              description: "Lifecycle state for the scope.",
              enum: ["active", "transitional", "retired"],
            },
            migration: {
              type: "string",
              description: "Explicit migration marker for the scope.",
              enum: [
                "none",
                "alias-add",
                "rename",
                "split",
                "merge",
                "boundary-change",
                "create-topic",
                "retire-topic",
              ],
            },
            aliases: {
              type: "array",
              description: "Equivalent alias slugs for the scope.",
              items: {
                type: "string",
              },
            },
            mappedScopes: {
              type: "array",
              description: "Explicit mapped scopes related through migration or retirement handling.",
              items: {
                type: "string",
              },
            },
          },
          ["scope", "topic", "authority", "state", "migration", "aliases", "mappedScopes"],
        ),
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
    ["project", "entries"],
  ),
  handler: upsertTaxonomyRegistryTool,
};
