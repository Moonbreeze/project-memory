import { listDocumentsTool } from "../listDocuments.ts";
import { readColdStartTool } from "../readColdStart.ts";
import { readDocumentTool } from "../readDocument.ts";
import { readPlanningBacklogTool } from "../readPlanningBacklog.ts";
import { readPlanningTopicEntryTool } from "../readPlanningTopicEntry.ts";
import { readRationaleEntryTool } from "../readRationaleEntry.ts";
import { readTopicEntryTool } from "../readTopicEntry.ts";
import { searchDocumentsTool } from "../searchDocuments.ts";

import {
  DocumentStatusValues,
  DocumentTypeValues,
  ListDocumentsPresetValues,
  ListDocumentsSortFieldValues,
  SortOrderValues,
} from "../../../core/types/index.ts";
import type { RegisteredMcpTool } from "../toolTypes.ts";

import { createObjectSchema } from "../schema.ts";

/**
 * MCP query-oriented tool definitions.
 */
export const queryMcpTools: Record<string, RegisteredMcpTool> = {
  list_documents: {
    name: "list_documents",
    description:
      "List active project-memory documents as metadata by default, with optional filters, sorting, and presets.",
    inputSchema: createObjectSchema({
      project: {
        type: "string",
        description: "Optional project slug filter.",
      },
      preset: {
        type: "string",
        description: "Optional list preset, such as a project work-item backlog view with legacy decision fallback.",
        enum: [...ListDocumentsPresetValues],
      },
      type: {
        type: "string",
        description: "Optional document type filter.",
        enum: [...DocumentTypeValues],
      },
      status: {
        type: "string",
        description: "Optional exact document status filter.",
        enum: [...DocumentStatusValues],
      },
      excludeStatuses: {
        type: "array",
        description: "Optional document statuses to exclude from the result.",
        items: {
          type: "string",
        },
      },
      sort: {
        type: "string",
        description: "Optional result sort field.",
        enum: [...ListDocumentsSortFieldValues],
      },
      order: {
        type: "string",
        description: "Optional ascending or descending sort order.",
        enum: [...SortOrderValues],
      },
      limit: {
        type: "number",
        description: "Optional maximum number of results.",
      },
      includeBody: {
        type: "boolean",
        description: "Includes full Markdown bodies when true.",
      },
    }),
    handler: listDocumentsTool,
  },
  search_documents: {
    name: "search_documents",
    description: "Search active project-memory documents by text, project, and type.",
    inputSchema: createObjectSchema({
      project: {
        type: "string",
        description: "Optional project slug filter.",
      },
      text: {
        type: "string",
        description: "Optional full-text search term.",
      },
      type: {
        type: "string",
        description: "Optional document type filter.",
        enum: [...DocumentTypeValues],
      },
      limit: {
        type: "number",
        description: "Optional maximum number of results.",
      },
    }),
    handler: searchDocumentsTool,
  },
  read_document: {
    name: "read_document",
    description: "Read one managed project-memory document by repository-relative path.",
    inputSchema: createObjectSchema(
      {
        path: {
          type: "string",
          description: "Managed repository-relative document path.",
        },
      },
      ["path"],
    ),
    handler: readDocumentTool,
  },
  read_cold_start: {
    name: "read_cold_start",
    description:
      "Read a bounded cold-start snapshot for one project using only a fixed runbook, canonical-doc, and decision source set.",
    inputSchema: createObjectSchema(
      {
        project: {
          type: "string",
          description: "Target project slug.",
        },
      },
      ["project"],
    ),
    handler: readColdStartTool,
  },
  read_planning_backlog: {
    name: "read_planning_backlog",
    description:
      "Read a bounded project planning backlog using only same-project active work-item documents, without decision fallback.",
    inputSchema: createObjectSchema(
      {
        project: {
          type: "string",
          description: "Target project slug.",
        },
      },
      ["project"],
    ),
    handler: readPlanningBacklogTool,
  },
  read_planning_topic_entry: {
    name: "read_planning_topic_entry",
    description:
      "Read a bounded exact-topic planning package for one project/topic using same-project active work-item documents plus explicit same-project context locators from the selected work items.",
    inputSchema: createObjectSchema(
      {
        project: {
          type: "string",
          description: "Target project slug.",
        },
        topic: {
          type: "string",
          description: "Requested topic label or slug.",
        },
      },
      ["project", "topic"],
    ),
    handler: readPlanningTopicEntryTool,
  },
  read_topic_entry: {
    name: "read_topic_entry",
    description:
      "Read a bounded topic-centered package for one project/topic, prioritizing canonical docs and exact topic matches before filename fallback.",
    inputSchema: createObjectSchema(
      {
        project: {
          type: "string",
          description: "Target project slug.",
        },
        topic: {
          type: "string",
          description: "Requested topic label or slug.",
        },
      },
      ["project", "topic"],
    ),
    handler: readTopicEntryTool,
  },
  read_rationale_entry: {
    name: "read_rationale_entry",
    description:
      "Read a bounded rationale package for one project/topic using canonical docs, referenced or exact decisions, runbooks, and fresh supporting records.",
    inputSchema: createObjectSchema(
      {
        project: {
          type: "string",
          description: "Target project slug.",
        },
        topic: {
          type: "string",
          description: "Requested topic label or slug.",
        },
      },
      ["project", "topic"],
    ),
    handler: readRationaleEntryTool,
  },
};
