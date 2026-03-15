import { CloseWorkItemStateValues } from "../../../core/workItems/index.ts";
import { archiveWorkItemTool } from "../archiveWorkItem.ts";
import { closeWorkItemTool } from "../closeWorkItem.ts";
import { commitPendingChangesTool } from "../commitPendingChanges.ts";

import type { RegisteredMcpTool } from "../toolTypes.ts";

import { createObjectSchema } from "../schema.ts";

/**
 * MCP lifecycle-oriented tool definitions.
 */
export const lifecycleMcpTools: Record<string, RegisteredMcpTool> = {
  archive_work_item: {
    name: "archive_work_item",
    description:
      "Archive one existing work-item after it already reached a terminal lifecycle state and no longer needs to stay visible in the active planning surface. In the normal lifecycle this is one of the final steps after execution, evidence, and any durable guidance updates are already captured.",
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
      },
      ["project", "topic", "date"],
    ),
    handler: archiveWorkItemTool,
  },
  close_work_item: {
    name: "close_work_item",
    description:
      "Close one existing work-item by applying a terminal lifecycle state after the execution slice is actually done or canceled, typically once the relevant session notes, verification evidence, and durable guidance updates are already recorded. This is the normal lifecycle step before the memory-repo commit.",
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
    description:
      "Stage and commit approved pending changes in the external managed memory repository after the document updates for the current slice are complete. Use this for memory-repo changes separately from code-repo commits; it is the final step of the normal documentation lifecycle.",
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
