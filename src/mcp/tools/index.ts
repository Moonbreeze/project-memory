import { appendSessionNoteTool } from "./appendSessionNote.ts";
import { commitPendingChangesTool } from "./commitPendingChanges.ts";
import { createDecisionTool } from "./createDecision.ts";
import { createRunbookTool } from "./createRunbook.ts";
import { listDocumentsTool } from "./listDocuments.ts";
import { readDocumentTool } from "./readDocument.ts";
import { recordVerificationResultTool } from "./recordVerificationResult.ts";
import { searchDocumentsTool } from "./searchDocuments.ts";
import { upsertCanonicalDocTool } from "./upsertCanonicalDoc.ts";
import { upsertProviderNoteTool } from "./upsertProviderNote.ts";

import {
  DocumentSourceValues,
  DocumentStatusValues,
  DocumentTypeValues,
  ListDocumentsPresetValues,
  ListDocumentsSortFieldValues,
  SortOrderValues,
} from "../../core/types/index.ts";
import type { JsonSchemaObject, McpToolDefinition } from "../types.ts";

/**
 * MCP tool handler signature.
 */
export type McpToolHandler = (params: unknown) => unknown;

/**
 * One registered MCP tool and its runtime handler.
 */
type RegisteredMcpTool = McpToolDefinition & {
  /** Runtime handler invoked through `tools/call`. */
  handler: McpToolHandler;
};

/**
 * Builds one strict object input schema.
 */
const createObjectSchema = (
  properties: JsonSchemaObject["properties"],
  required: string[] = [],
): JsonSchemaObject => {
  return {
    type: "object",
    properties,
    required,
    additionalProperties: false,
  };
};

/**
 * Registered MCP tools keyed by tool name.
 */
const registeredMcpTools: Record<string, RegisteredMcpTool> = {
  list_documents: {
    name: "list_documents",
    description: "List active project-memory documents as metadata by default, with optional filters, sorting, and presets.",
    inputSchema: createObjectSchema({
      project: {
        type: "string",
        description: "Optional project slug filter.",
      },
      preset: {
        type: "string",
        description: "Optional list preset, such as a current decision backlog view.",
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
  append_session_note: {
    name: "append_session_note",
    description: "Create one managed session note document.",
    inputSchema: createObjectSchema(
      {
        project: {
          type: "string",
          description: "Target project slug.",
        },
        topic: {
          type: "string",
          description: "Session topic slug or label.",
        },
        summary: {
          type: "string",
          description: "High-level session summary.",
        },
        actions: {
          type: "array",
          description: "Concrete actions completed during the session.",
          items: {
            type: "string",
          },
        },
        followUp: {
          type: "array",
          description: "Follow-up tasks left for later.",
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
          description: "Optional document status.",
          enum: [...DocumentStatusValues],
        },
        projectCommit: {
          type: "string",
          description: "Optional project commit SHA.",
        },
      },
      ["project", "topic", "summary", "actions", "followUp"],
    ),
    handler: appendSessionNoteTool,
  },
  record_verification_result: {
    name: "record_verification_result",
    description: "Create one managed verification result document.",
    inputSchema: createObjectSchema(
      {
        project: {
          type: "string",
          description: "Target project slug.",
        },
        topic: {
          type: "string",
          description: "Verification topic slug or label.",
        },
        scope: {
          type: "string",
          description: "Verification target or scope.",
        },
        steps: {
          type: "array",
          description: "Executed verification steps.",
          items: {
            type: "string",
          },
        },
        result: {
          type: "string",
          description: "Verification outcome.",
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
          description: "Optional document status.",
          enum: [...DocumentStatusValues],
        },
        projectCommit: {
          type: "string",
          description: "Optional project commit SHA.",
        },
      },
      ["project", "topic", "scope", "steps", "result"],
    ),
    handler: recordVerificationResultTool,
  },
  upsert_provider_note: {
    name: "upsert_provider_note",
    description: "Upsert the managed provider note for one provider inside a project.",
    inputSchema: createObjectSchema(
      {
        project: {
          type: "string",
          description: "Target project slug.",
        },
        provider: {
          type: "string",
          description: "Provider identifier used for file naming.",
        },
        topic: {
          type: "string",
          description: "Optional override for the stored topic value.",
        },
        overview: {
          type: "string",
          description: "Short provider overview.",
        },
        constraints: {
          type: "array",
          description: "Known provider constraints.",
          items: {
            type: "string",
          },
        },
        guidance: {
          type: "array",
          description: "Guidance for future work with the provider.",
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
          description: "Optional document status.",
          enum: [...DocumentStatusValues],
        },
        projectCommit: {
          type: "string",
          description: "Optional project commit SHA.",
        },
      },
      ["project", "provider", "overview", "constraints", "guidance"],
    ),
    handler: upsertProviderNoteTool,
  },
  upsert_canonical_doc: {
    name: "upsert_canonical_doc",
    description: "Create or replace one managed canonical doc tied to a taxonomy-registry scope.",
    inputSchema: createObjectSchema(
      {
        project: {
          type: "string",
          description: "Target project slug.",
        },
        topic: {
          type: "string",
          description: "Canonical-doc topic slug or label.",
        },
        registryScope: {
          type: "string",
          description: "Declared taxonomy-registry scope slug for this canonical doc.",
        },
        summary: {
          type: "string",
          description: "High-level summary of the canonical guidance.",
        },
        guidance: {
          type: "array",
          description: "Canonical guidance points for the scoped topic.",
          items: {
            type: "string",
          },
        },
        references: {
          type: "array",
          description: "Supporting references or follow-on links.",
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
          description: "Optional document status.",
          enum: [...DocumentStatusValues],
        },
        projectCommit: {
          type: "string",
          description: "Optional project commit SHA.",
        },
      },
      ["project", "topic", "registryScope", "summary", "guidance", "references"],
    ),
    handler: upsertCanonicalDocTool,
  },
  create_decision: {
    name: "create_decision",
    description: "Create one managed decision record.",
    inputSchema: createObjectSchema(
      {
        project: {
          type: "string",
          description: "Target project slug.",
        },
        topic: {
          type: "string",
          description: "Decision topic slug or label.",
        },
        context: {
          type: "string",
          description: "Decision context.",
        },
        decision: {
          type: "string",
          description: "Final decision statement.",
        },
        consequences: {
          type: "array",
          description: "Decision consequences.",
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
          description: "Optional document status.",
          enum: [...DocumentStatusValues],
        },
        projectCommit: {
          type: "string",
          description: "Optional project commit SHA.",
        },
      },
      ["project", "topic", "context", "decision", "consequences"],
    ),
    handler: createDecisionTool,
  },
  create_runbook: {
    name: "create_runbook",
    description: "Create one managed runbook document.",
    inputSchema: createObjectSchema(
      {
        project: {
          type: "string",
          description: "Target project slug.",
        },
        topic: {
          type: "string",
          description: "Runbook topic slug or label.",
        },
        purpose: {
          type: "string",
          description: "Runbook purpose.",
        },
        procedure: {
          type: "array",
          description: "Step-by-step procedure.",
          items: {
            type: "string",
          },
        },
        verification: {
          type: "array",
          description: "Verification steps for the runbook.",
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
          description: "Optional document status.",
          enum: [...DocumentStatusValues],
        },
        projectCommit: {
          type: "string",
          description: "Optional project commit SHA.",
        },
      },
      ["project", "topic", "purpose", "procedure", "verification"],
    ),
    handler: createRunbookTool,
  },
  commit_pending_changes: {
    name: "commit_pending_changes",
    description: "Stage and commit approved pending memory-repository changes.",
    inputSchema: createObjectSchema(
      {
        message: {
          type: "string",
          description: "Commit message in docs(<scope>): <summary> format.",
        },
      },
      ["message"],
    ),
    handler: commitPendingChangesTool,
  },
};

/**
 * Returns the MCP tools advertised through `tools/list`.
 */
export const listMcpTools = (): McpToolDefinition[] => {
  return Object.values(registeredMcpTools).map(({ handler: _handler, ...tool }) => tool);
};

/**
 * Executes one registered MCP tool.
 */
export const executeMcpTool = (name: string, params: unknown): unknown => {
  const tool = registeredMcpTools[name];
  if (!tool) {
    throw new Error(`Unknown MCP tool: ${name}`);
  }

  return tool.handler(params);
};
