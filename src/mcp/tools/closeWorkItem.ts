import { closeWorkItem } from "../../core/index.ts";
import { parseCloseWorkItemInput } from "../types.ts";

/**
 * Executes the `close_work_item` MCP tool.
 */
export const closeWorkItemTool = (params: unknown): unknown => {
  return closeWorkItem(parseCloseWorkItemInput(params));
};
