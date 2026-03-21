import { CloseWorkItemStateValues } from "../../../core/workItems/index.ts";

import { archiveDocumentTool } from "../archiveDocument.ts";
import { archiveWorkItemTool } from "../archiveWorkItem.ts";
import { closeWorkItemTool } from "../closeWorkItem.ts";
import { commitPendingChangesTool } from "../commitPendingChanges.ts";
import { pushPendingChangesTool } from "../pushPendingChanges.ts";
import { createEnumStringSchema, createObjectSchema } from "../schema.ts";

import type { RegisteredMcpTool } from "../toolTypes.ts";

/**
 * MCP lifecycle-oriented tool definitions.
 */
export const lifecycleMcpTools: Record<string, RegisteredMcpTool> = {
  archive_document: {
    name: "archive_document",
    resultMode: "compact-document",
    description:
      "Archive one existing managed document by repository-relative path. Session notes and verification results move into `archives/`, while provider notes, decisions, runbooks, and canonical docs archive in place by switching to archived status. Work items must use `archive_work_item` instead.",
    inputSchema: createObjectSchema(
      {
        path: {
          type: "string",
          description: "Managed repository-relative path to the source document.",
        },
      },
      ["path"],
    ),
    handler: archiveDocumentTool,
  },
  archive_work_item: {
    name: "archive_work_item",
    resultMode: "compact-document",
    description:
      "Archive one existing work-item after it already reached a terminal lifecycle state and no longer needs to stay visible in the active planning surface. In the normal lifecycle this is one of the final steps after execution, evidence updates, and any durable guidance changes are already captured. This tool does not add evidence or change terminal execution state.",
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
    resultMode: "compact-document",
    description:
      "Close one existing work-item by applying a terminal lifecycle state after the execution slice is actually done or canceled, typically once the relevant session notes, verification records, work-item evidence links, and durable guidance updates are already recorded. This tool applies terminal state only: it does not create session notes, create verification results, or add evidence links. This is the normal lifecycle step before the memory-repo commit.",
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
        state: createEnumStringSchema(
          CloseWorkItemStateValues,
          "Terminal lifecycle state to apply.",
        ),
      },
      ["project", "topic", "date", "state"],
    ),
    handler: closeWorkItemTool,
  },
  commit_pending_changes: {
    name: "commit_pending_changes",
    description:
      "Stage and commit approved pending changes in the external managed memory repository after the document updates for the current slice are complete. Use this for local memory-repo commits separately from code-repo commits before any explicit remote push step.",
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
  push_pending_changes: {
    name: "push_pending_changes",
    description:
      "Push the current memory-repo branch to a configured remote after local documentation commits are ready to leave the checkout. Use this as the explicit post-commit remote sync step instead of assuming commit_pending_changes will push automatically.",
    inputSchema: createObjectSchema({
      remote: {
        type: "string",
        description: "Optional remote name; defaults to origin.",
      },
      branch: {
        type: "string",
        description: "Optional remote branch name; defaults to the current local branch.",
      },
    }),
    handler: pushPendingChangesTool,
  },
};
