import { bootstrapProject } from "../../core/index.ts";
import { parseBootstrapProjectInput } from "../types.ts";

/**
 * Executes the `bootstrap_project` MCP tool.
 */
export const bootstrapProjectTool = (params: unknown): unknown => {
  return bootstrapProject(parseBootstrapProjectInput(params));
};
