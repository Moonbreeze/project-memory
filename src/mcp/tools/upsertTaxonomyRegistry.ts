import { upsertTaxonomyRegistry } from "../../core/index.ts";
import { parseTaxonomyRegistryInput } from "../types.ts";

/**
 * Executes the `upsert_taxonomy_registry` MCP tool.
 */
export const upsertTaxonomyRegistryTool = (params: unknown): unknown => {
  return upsertTaxonomyRegistry(parseTaxonomyRegistryInput(params));
};
