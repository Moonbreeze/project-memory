import { createRepositoryContext, readRationaleEntry } from "../../core/index.ts";
import { parseRationaleEntryInput } from "../types.ts";

/**
 * Executes the `read_rationale_entry` MCP tool.
 */
export const readRationaleEntryTool = (params: unknown): unknown => {
  return readRationaleEntry(parseRationaleEntryInput(params), createRepositoryContext());
};
