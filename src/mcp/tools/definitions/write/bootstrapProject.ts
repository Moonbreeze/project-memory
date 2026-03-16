import { bootstrapProjectTool } from "../../bootstrapProject.ts";
import type { RegisteredMcpTool } from "../../toolTypes.ts";

import { createObjectSchema } from "../../schema.ts";

/**
 * MCP definition for `bootstrap_project`.
 */
export const bootstrapProjectMcpTool: RegisteredMcpTool = {
  name: "bootstrap_project",
  description:
    "Create the managed directory layout for one project and bootstrap the reserved active taxonomy registry canonical doc so registry-backed canonical writes have a valid authority surface from the start.",
  inputSchema: createObjectSchema(
    {
      project: {
        type: "string",
        description: "Target project slug.",
      },
      date: {
        type: "string",
        description: "Optional explicit date in YYYY-MM-DD format for the registry document.",
      },
      source: {
        type: "string",
        description: "Optional document source for the bootstrap-created registry document.",
      },
    },
    ["project"],
  ),
  handler: bootstrapProjectTool,
};
