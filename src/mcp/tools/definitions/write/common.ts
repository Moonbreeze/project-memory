import {
  DocumentSourceValues,
  DocumentStatusValues,
} from "../../../../core/types/index.ts";
import type { JsonSchemaObject } from "../../../types.ts";

/**
 * Shared optional metadata properties for managed write tools.
 */
export const optionalDocumentMetadataProperties: JsonSchemaObject["properties"] = {
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
};
