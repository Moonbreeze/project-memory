import { CloseWorkItemStateValues } from "../../../core/workItems/index.ts";
import { closeWorkItemTool } from "../closeWorkItem.ts";
import { commitPendingChangesTool } from "../commitPendingChanges.ts";

import type { RegisteredMcpTool } from "../toolTypes.ts";

import { createObjectSchema } from "../schema.ts";

/**
 * MCP lifecycle-oriented tool definitions.
 */
export const lifecycleMcpTools: Record<string, RegisteredMcpTool> = {
  close_work_item: {
    name: "close_work_item",
    description: "Close one existing work-item by applying a terminal lifecycle state.",
    inputSchema: createObjectSchema(
      {
        project: {
          type: "string",
          description: "Target project slug.",
        },
        topic: {
          type: "string",
          description: "Existing work-item topic slug or label.",
        },
        date: {
          type: "string",
          description: "Exact work-item date in YYYY-MM-DD format.",
        },
        state: {
          type: "string",
          description: "Terminal lifecycle state to apply.",
          enum: [...CloseWorkItemStateValues],
        },
      },
      ["project", "topic", "date", "state"],
    ),
    handler: closeWorkItemTool,
  },
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
