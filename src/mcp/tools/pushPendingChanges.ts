import { pushPendingChanges } from "../../core/index.ts";
import { parsePushPendingChangesInput } from "../types.ts";

/**
 * Executes the `push_pending_changes` MCP tool.
 */
export const pushPendingChangesTool = (params: unknown): unknown => {
  return pushPendingChanges(parsePushPendingChangesInput(params));
};
