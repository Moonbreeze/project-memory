import { upsertWorkItemTool } from "../../upsertWorkItem.ts";
import type { RegisteredMcpTool } from "../../toolTypes.ts";

import { createObjectSchema } from "../../schema.ts";

import {
  WorkItemDocumentStatusValues,
  WorkItemOriginKindValues,
  WorkItemStateValues,
} from "../../../../core/workItems/index.ts";
import { DocumentSourceValues } from "../../../../core/types/index.ts";

/**
 * MCP definition for `upsert_work_item`.
 */
export const upsertWorkItemMcpTool: RegisteredMcpTool = {
  name: "upsert_work_item",
  description:
    "Create or replace one managed work-item document for an executable backlog slice. In the normal lifecycle this is the document to open or update before active implementation so origin, dependencies, context, verification targets, evidence, visibility status, and execution progress stay explicit instead of leaking into decisions or session prose.",
  inputSchema: createObjectSchema(
    {
      project: {
        type: "string",
        description: "Target project slug.",
      },
      topic: {
        type: "string",
        description: "Work-item topic slug or label.",
      },
      summary: {
        type: "string",
        description: "Short description of the work slice.",
      },
      outcome: {
        type: "string",
        description: "Expected outcome when the work slice is complete.",
      },
      originKind: {
        type: "string",
        description: "Origin kind for the work item.",
        enum: [...WorkItemOriginKindValues],
      },
      originLocator: {
        type: "string",
        description: "Required for decision or session-note origins. Format: type:project:date:topic.",
      },
      originNote: {
        type: "string",
        description: "Required for ad-hoc origins.",
      },
      dependencies: {
        type: "array",
        description: "Optional dependency locator strings. Format: work-item:project:date:topic.",
        items: {
          type: "string",
        },
      },
      context: {
        type: "array",
        description: "Optional context locator strings. Format: type:project:date-or-scope:topic.",
        items: {
          type: "string",
        },
      },
      verification: {
        type: "array",
        description: "Verification targets promised by the work item.",
        items: {
          type: "string",
        },
      },
      evidence: {
        type: "array",
        description: "Optional evidence locator strings. Format: type:project:date:topic.",
        items: {
          type: "string",
        },
      },
      date: {
        type: "string",
        description: "Optional explicit date in YYYY-MM-DD format.",
      },
      source: {
        type: "string",
        description: "Optional document source.",
        enum: [...DocumentSourceValues],
      },
      status: {
        type: "string",
        description:
          "Optional document lifecycle status controlling managed visibility of the work-item record itself; this is separate from execution progress tracked by workItemState.",
        enum: [...WorkItemDocumentStatusValues],
      },
      workItemState: {
        type: "string",
        description:
          "Optional execution lifecycle state controlling planning progress for the work-item slice; this is separate from document visibility tracked by status.",
        enum: [...WorkItemStateValues],
      },
    },
    ["project", "topic", "summary", "outcome", "originKind", "verification"],
  ),
  handler: upsertWorkItemTool,
};
