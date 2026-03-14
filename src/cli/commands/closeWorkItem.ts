import {
  closeWorkItem,
  isCloseWorkItemState,
} from "../../core/index.ts";
import { printJson, requireFlag } from "../commandSupport.ts";
import type { CliCommandHandler } from "../types.ts";

const parseCloseWorkItemState = (value: string) => {
  if (!isCloseWorkItemState(value)) {
    throw new Error(`Invalid --state value: ${value}`);
  }

  return value;
};

/**
 * Handles the `close-work-item` CLI command.
 */
export const closeWorkItemCommand: CliCommandHandler = (flags, io) => {
  printJson(
    closeWorkItem({
      project: requireFlag(flags, "project"),
      topic: requireFlag(flags, "topic"),
      date: requireFlag(flags, "date"),
      state: parseCloseWorkItemState(requireFlag(flags, "state")),
    }),
    io,
  );
};
