import { appendSessionNote } from "../../core/index.ts";
import { parseSessionNoteInput } from "../types.ts";

/**
 * Executes the `append_session_note` MCP tool.
 */
export const appendSessionNoteTool = (params: unknown): unknown => {
  return appendSessionNote(parseSessionNoteInput(params));
};
