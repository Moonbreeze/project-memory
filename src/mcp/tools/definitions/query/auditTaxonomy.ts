import { auditTaxonomyTool } from "../../auditTaxonomy.ts";
import type { RegisteredMcpTool } from "../../toolTypes.ts";

import { createObjectSchema } from "../../schema.ts";

/**
 * MCP definition for `audit_taxonomy`.
 */
export const auditTaxonomyMcpTool: RegisteredMcpTool = {
  name: "audit_taxonomy",
  description:
    "Audit machine-detectable taxonomy consistency for one project, including registry availability, duplicate authority, unknown scope usage, and retired scope misuse.",
  inputSchema: createObjectSchema(
    {
      project: {
        type: "string",
        description: "Target project slug.",
      },
    },
    ["project"],
  ),
  handler: auditTaxonomyTool,
};
