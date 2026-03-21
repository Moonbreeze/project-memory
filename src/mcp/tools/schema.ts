import type { JsonSchemaObject, JsonSchemaProperty } from "../types.ts";

/**
 * Builds one string property constrained to an explicit enum list.
 */
export const createEnumStringSchema = (
  values: readonly string[],
  description: string,
): JsonSchemaProperty => {
  return {
    type: "string",
    description,
    enum: [...values],
  };
};

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
