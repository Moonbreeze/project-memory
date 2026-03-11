import { commitPendingChanges } from "../../core/index.ts";
import { parseCommitPendingChangesInput } from "../types.ts";

/**
 * Executes the `commit_pending_changes` MCP tool.
 */
export const commitPendingChangesTool = (params: unknown): unknown => {
  return commitPendingChanges(parseCommitPendingChangesInput(params));
};
