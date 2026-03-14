import { commitPendingChangesTool } from "../commitPendingChanges.ts";

import type { RegisteredMcpTool } from "../toolTypes.ts";

import { createObjectSchema } from "../schema.ts";

/**
 * MCP lifecycle-oriented tool definitions.
 */
export const lifecycleMcpTools: Record<string, RegisteredMcpTool> = {
  commit_pending_changes: {
    name: "commit_pending_changes",
    description: "Stage and commit approved pending memory-repository changes.",
    inputSchema: createObjectSchema(
      {
        message: {
          type: "string",
          description: "Commit message in docs(<project>/<scope>): <summary> format.",
        },
      },
      ["message"],
    ),
    handler: commitPendingChangesTool,
  },
};
