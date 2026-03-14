import { archiveWorkItem } from "../../core/index.ts";
import { parseArchiveWorkItemInput } from "../types.ts";

/**
 * Executes the `archive_work_item` MCP tool.
 */
export const archiveWorkItemTool = (params: unknown): unknown => {
  return archiveWorkItem(parseArchiveWorkItemInput(params));
};
