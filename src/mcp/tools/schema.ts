import type { JsonSchemaObject } from "../types.ts";

/**
 * Builds one strict object input schema.
 */
export const createObjectSchema = (
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
