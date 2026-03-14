import { listDocumentsTool } from "../listDocuments.ts";
import { readDocumentTool } from "../readDocument.ts";
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
};
