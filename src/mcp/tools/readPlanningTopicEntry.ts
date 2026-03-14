import { createRepositoryContext, readPlanningTopicEntry } from "../../core/index.ts";
import { parsePlanningTopicEntryInput } from "../types.ts";

/**
 * Executes the `read_planning_topic_entry` MCP tool.
 */
export const readPlanningTopicEntryTool = (params: unknown): unknown => {
  return readPlanningTopicEntry(parsePlanningTopicEntryInput(params), createRepositoryContext());
};
