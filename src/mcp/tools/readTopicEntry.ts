import { createRepositoryContext, readTopicEntry } from "../../core/index.ts";
import { parseTopicEntryInput } from "../types.ts";

/**
 * Executes the `read_topic_entry` MCP tool.
 */
export const readTopicEntryTool = (params: unknown): unknown => {
  return readTopicEntry(parseTopicEntryInput(params), createRepositoryContext());
};
