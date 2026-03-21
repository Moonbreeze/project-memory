import {
  DocumentSourceValues,
  DocumentStatusValues,
} from "../../../../core/types/index.ts";
import type { JsonSchemaObject } from "../../../types.ts";
import { createEnumStringSchema } from "../../schema.ts";

/**
 * Shared optional metadata properties for managed write tools.
 */
export const optionalDocumentMetadataProperties: JsonSchemaObject["properties"] = {
  date: {
    type: "string",
    description: "Optional explicit date in YYYY-MM-DD format.",
  },
  source: createEnumStringSchema(DocumentSourceValues, "Optional document source."),
  status: createEnumStringSchema(DocumentStatusValues, "Optional document status."),
};
