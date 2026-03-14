import { upsertWorkItem } from "../../core/index.ts";
import { parseWorkItemInput } from "../types.ts";

/**
 * Executes the `upsert_work_item` MCP tool.
 */
export const upsertWorkItemTool = (params: unknown): unknown => {
  return upsertWorkItem(parseWorkItemInput(params));
};
