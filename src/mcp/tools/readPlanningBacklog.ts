import { createRepositoryContext, readPlanningBacklog } from "../../core/index.ts";
import { parsePlanningBacklogInput } from "../types.ts";

/**
 * Executes the `read_planning_backlog` MCP tool.
 */
export const readPlanningBacklogTool = (params: unknown): unknown => {
  return readPlanningBacklog(parsePlanningBacklogInput(params), createRepositoryContext());
};
