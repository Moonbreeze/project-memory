import { upsertProviderNote } from "../../core/index.ts";
import { parseProviderNoteInput } from "../types.ts";

/**
 * Executes the `upsert_provider_note` MCP tool.
 */
export const upsertProviderNoteTool = (params: unknown): unknown => {
  return upsertProviderNote(parseProviderNoteInput(params));
};
