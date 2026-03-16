import {
  DocumentStatusValues,
  DocumentTypeValues,
  ListDocumentsPresetValues,
  ListDocumentsSortFieldValues,
  SortOrderValues,
} from "../../../core/types/index.ts";

import { auditTaxonomyMcpTool } from "./query/auditTaxonomy.ts";
import { chooseWorkflowTool } from "../chooseWorkflow.ts";
import { listDocumentsTool } from "../listDocuments.ts";
import { readColdStartTool } from "../readColdStart.ts";
import { readDocumentTool } from "../readDocument.ts";
import { readPlanningBacklogTool } from "../readPlanningBacklog.ts";
import { readPlanningTopicEntryTool } from "../readPlanningTopicEntry.ts";
import { readRationaleEntryTool } from "../readRationaleEntry.ts";
import { readTopicEntryTool } from "../readTopicEntry.ts";
import { searchDocumentsTool } from "../searchDocuments.ts";

import { createObjectSchema } from "../schema.ts";
import type { RegisteredMcpTool } from "../toolTypes.ts";

/**
 * MCP query-oriented tool definitions.
 */
export const queryMcpTools: Record<string, RegisteredMcpTool> = {
  audit_taxonomy: auditTaxonomyMcpTool,
  choose_workflow: {
    name: "choose_workflow",
    description:
      "Fallback read-only chooser for agents that are unsure which project-memory tool or lifecycle step to use next. It explains which bounded read to call first, or which lifecycle action should come next, but does not route, mutate data, or replace the primary semantics exposed by the other tool descriptions.",
    inputSchema: createObjectSchema(
      {
        goal: {
          type: "string",
          description: "Short natural-language goal or question.",
        },
        currentStep: {
          type: "string",
          description: "Optional description of the current lifecycle position or most recent action.",
        },
      },
      ["goal"],
    ),
    handler: chooseWorkflowTool,
  },
  list_documents: {
    name: "list_documents",
    description:
      "List active managed project-memory documents as metadata by default for maintenance, audits, or known-scope inspection. Do not use this as the default startup path: choose read_cold_start for initial project context, read_planning_backlog for executable work selection, read_planning_topic_entry for one work-item topic, read_topic_entry for current truth on one same-project topic, and read_rationale_entry for durable reasoning. Unmanaged or schema-invalid files stay outside this surface.",
    inputSchema: createObjectSchema({
      project: {
        type: "string",
        description: "Optional project slug filter.",
      },
      preset: {
        type: "string",
        description: "Optional list preset, such as a project work-item backlog view with legacy decision fallback or a draft-decision ideas inbox.",
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
    description:
      "Search active managed project-memory documents by text, project, and type when you already need broad keyword recall beyond the bounded read entrypoints. Do not use this as the default startup path; prefer read_cold_start, read_planning_backlog, read_planning_topic_entry, read_topic_entry, or read_rationale_entry first. Unmanaged or schema-invalid files stay outside this surface.",
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
    description:
      "Read one managed project-memory document by repository-relative path when you already know the exact file to inspect. This is a direct maintenance primitive, not the default startup path; unmanaged paths or schema-invalid files are outside this validated surface.",
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
      "Read the bounded cold-start startup package for one project using only a fixed runbook, canonical-doc, and decision source set. Use this as the default first read when you need project context without scanning the repository. A normal execution flow is: read bounded context, open or update the work-item, implement in the code repo, append a session note, record verification evidence, capture durable decisions if policy changed, update stable guidance, close or archive the work-item, then commit memory-repo changes separately from code-repo changes.",
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
      "Read the bounded project planning backlog from same-project active work-item documents only. Use this after cold-start when you need to choose or review ready, in-progress, or blocked executable work instead of inferring backlog state from decisions or session history.",
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
      "Read the bounded exact-topic planning package for one project/topic using same-project active work items plus explicit same-project dependency, context, and evidence follows. Use this after backlog selection, or whenever a work-item topic needs execution context, without widening into implicit graph traversal.",
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
      "Read the bounded topic-centered package for one same-project topic, prioritizing canonical docs and exact-topic matches before filename fallback. Use this when you need the current truth for a topic, not executable work-item state or planning context.",
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
      "Read the bounded rationale package for one same-project topic using canonical docs, referenced or exact decisions, runbooks, and fresh supporting records. Use this when you need durable reasoning behind the current model rather than only the latest operational state or current truth.",
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
